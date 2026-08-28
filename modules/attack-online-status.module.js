/**
 * Sidekick Attack Online Status
 * Shows a small Torn API v2 last_action status dot in the opponent header.
 */
(function () {
    'use strict';

    const SETTINGS_KEY = 'attack-online-status';
    const BADGE_ID = 'sidekick-attack-online-status';
    const CACHE_MS = 60_000;
    const STATUS_META = {
        online: { label: 'Online', color: '#32d56b' },
        idle: { label: 'Idle', color: '#f2c94c' },
        offline: { label: 'Offline', color: '#777' }
    };

    const AttackOnlineStatusModule = {
        isInitialized: false,
        isEnabled: true,
        observer: null,
        updateTimer: null,
        refreshTimer: null,
        navigationTimer: null,
        lastHref: '',
        currentTargetId: null,
        cache: new Map(),
        inFlight: new Map(),

        async init() {
            if (this.isInitialized) return;
            this.isInitialized = true;
            await this.loadSettings(true);

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local' || !changes.sidekick_settings) return;
                const enabled = changes.sidekick_settings.newValue?.[SETTINGS_KEY]?.isEnabled !== false;
                if (enabled === this.isEnabled) return;
                this.isEnabled = enabled;
                if (enabled) this.requestUpdate(0);
                else this.cleanup();
            });

            this.observer = new MutationObserver(() => this.requestUpdate(120));
            this.observer.observe(document.documentElement, { childList: true, subtree: true });

            this.lastHref = location.href;
            this.navigationTimer = setInterval(() => {
                if (location.href === this.lastHref) return;
                this.lastHref = location.href;
                this.currentTargetId = null;
                this.cleanupBadge();
                this.requestUpdate(100);
            }, 500);
            this.requestUpdate(0);
        },

        async loadSettings(persistDefault = false) {
            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
            const stored = settings[SETTINGS_KEY];
            this.isEnabled = stored?.isEnabled !== false;
            if (persistDefault && !stored) {
                settings[SETTINGS_KEY] = { isEnabled: true };
                await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', settings);
            }
        },

        requestUpdate(delay = 100) {
            if (!this.isEnabled) return;
            clearTimeout(this.updateTimer);
            this.updateTimer = setTimeout(() => this.update(), delay);
        },

        isAttackPage() {
            const path = location.pathname.toLowerCase();
            const sid = (new URLSearchParams(location.search).get('sid') || '').toLowerCase();
            return (path.endsWith('/page.php') || path.endsWith('/loader.php')) && sid === 'attack';
        },

        getTargetId() {
            if (!this.isAttackPage()) return null;
            const params = new URLSearchParams(location.search);
            for (const key of ['user2ID', 'user2Id', 'XID', 'xid']) {
                const value = params.get(key);
                if (/^\d+$/.test(value || '')) return value;
            }
            return decodeURIComponent(location.href).match(/(?:user2ID|XID)=(\d+)/i)?.[1] || null;
        },

        directText(element) {
            return Array.from(element?.childNodes || [])
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
        },

        findPlacement(targetName = '') {
            if (!this.isAttackPage()) return null;
            const wanted = targetName.trim().toLowerCase();
            const candidates = Array.from(document.querySelectorAll(
                'a, span, strong, [class*="name" i], [class*="title" i], [class*="header" i]'
            ));

            const scored = candidates.map(element => {
                const text = (this.directText(element) || element.textContent || '').replace(/\s+/g, ' ').trim();
                const rect = element.getBoundingClientRect();
                if (!text || text.length > 60 || rect.width < 5 || rect.height < 5) return null;
                if (rect.top < 0 || rect.top > Math.min(260, window.innerHeight * 0.4)) return null;
                if (rect.left < window.innerWidth * 0.42) return null;

                let score = rect.left / Math.max(1, window.innerWidth);
                if (wanted && text.toLowerCase() === wanted) score += 20;
                else if (wanted && text.toLowerCase().includes(wanted)) score += 8;
                if (/name/i.test(element.className || '')) score += 3;
                if (rect.height <= 35) score += 2;
                if (/attacking|back to profile|primary|secondary|unknown|temporary/i.test(text)) score -= 20;
                return { element, score };
            }).filter(Boolean).sort((a, b) => b.score - a.score);

            return scored[0]?.element || null;
        },

        renderStatus(status, targetName = '') {
            const meta = STATUS_META[String(status || '').toLowerCase()];
            if (!meta) {
                this.cleanupBadge();
                return false;
            }
            const anchor = this.findPlacement(targetName);
            if (!anchor) return false;

            let badge = document.getElementById(BADGE_ID);
            if (!badge) {
                badge = document.createElement('span');
                badge.id = BADGE_ID;
                badge.setAttribute('role', 'status');
                badge.style.cssText = [
                    'display:inline-block', 'width:9px', 'height:9px',
                    'margin-left:7px', 'border-radius:50%', 'vertical-align:middle',
                    'border:1px solid rgba(255,255,255,.55)',
                    'pointer-events:none', 'box-sizing:border-box', 'flex:0 0 9px'
                ].join(';');
            }
            badge.style.background = meta.color;
            badge.style.boxShadow = `0 0 4px ${meta.color}`;
            badge.title = `${targetName || 'Target'} is ${meta.label.toLowerCase()} according to Torn last_action`;
            badge.setAttribute('aria-label', `Target status: ${meta.label}`);
            if (badge.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', badge);
            return true;
        },

        async update(force = false) {
            if (!this.isEnabled || !this.isAttackPage()) {
                this.cleanupBadge();
                return;
            }
            const targetId = this.getTargetId();
            if (!targetId) {
                this.cleanupBadge();
                return;
            }
            this.currentTargetId = targetId;

            const cached = this.cache.get(targetId);
            const age = cached ? Date.now() - cached.timestamp : Infinity;
            if (!force && cached && age < CACHE_MS) {
                if (cached.status) this.renderStatus(cached.status, cached.name);
                return;
            }

            const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
            if (!apiKey || this.currentTargetId !== targetId) {
                this.cleanupBadge();
                return;
            }

            try {
                let request = this.inFlight.get(targetId);
                if (!request) {
                    request = chrome.runtime.sendMessage({
                        action: 'fetchAttackOnlineStatus', apiKey, userId: targetId
                    }).finally(() => this.inFlight.delete(targetId));
                    this.inFlight.set(targetId, request);
                }
                const response = await request;
                if (this.currentTargetId !== targetId) return;
                if (!response?.success) throw new Error(response?.error || 'Status request failed');

                const item = { status: response.status, name: response.name || '', timestamp: Date.now() };
                this.cache.set(targetId, item);
                this.renderStatus(item.status, item.name);
                this.scheduleRefresh(targetId, CACHE_MS);
            } catch (error) {
                // Cache failures too. Mutation-heavy attack pages must not turn one
                // failed response into dozens of retries.
                this.cache.set(targetId, { status: null, name: '', timestamp: Date.now() });
                this.cleanupBadge();
                console.warn('[AttackOnlineStatus] Status fetch failed:', error.message || error);
            }
        },

        scheduleRefresh(targetId, delay) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = setTimeout(() => {
                if (this.currentTargetId === targetId && this.isEnabled && this.isAttackPage()) this.update(true);
            }, Math.max(1000, delay));
        },

        cleanupBadge() {
            document.getElementById(BADGE_ID)?.remove();
            if (!this.isAttackPage()) {
                clearTimeout(this.refreshTimer);
                this.refreshTimer = null;
            }
        },

        cleanup() {
            clearTimeout(this.updateTimer);
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
            this.cleanupBadge();
            this.currentTargetId = null;
        }
    };

    window.SidekickModules = window.SidekickModules || {};
    window.SidekickModules.AttackOnlineStatus = AttackOnlineStatusModule;
})();
