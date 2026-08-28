/**
 * Mission Tracker Module
 * Polls the Torn API for active missions and shows an icon in the status tray.
 * Version: 1.0.0
 */

const MissionTrackerModule = {
    name: 'Mission Tracker',
    version: '1.0.0',

    STORAGE_KEY: 'mission-tracker',
    ICON_ID: 'sidekick-mission-tracker-icon',
    STYLES_ID: 'sidekick-mission-tracker-styles',

    // State
    isEnabled: false,
    openInNewTab: false,
    checkIntervalMinutes: 30,

    pollTimer: null,
    urgencyTimer: null,
    observer: null,
    activeMissions: null,

    // ─── Init ────────────────────────────────────────────────────────────────

    async init() {
        console.log('🎯 Mission Tracker: initializing...');
        await this.loadSettings();
        await this.loadCachedMissions();

        if (this.isEnabled) {
            this.startPolling();
        }

        this.startObserver();

        // React to settings changes made in the settings panel
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.sidekick_settings) {
                this.loadSettings().then(() => {
                    if (this.isEnabled) {
                        this.startPolling();
                    } else {
                        this.stopPolling();
                        this.removeIcon();
                    }
                });
            }
        });

        console.log('🎯 Mission Tracker: initialized');
    },

    // ─── Settings ────────────────────────────────────────────────────────────

    async loadSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
            if (data && data[this.STORAGE_KEY]) {
                const s = data[this.STORAGE_KEY];
                this.isEnabled = s.isEnabled || false;
                this.openInNewTab = s.openInNewTab || false;
                this.checkIntervalMinutes = s.checkIntervalMinutes || 5;
            }
        } catch (e) {
            console.error('🎯 Mission Tracker: failed to load settings:', e);
        }
    },

    async saveSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
            data[this.STORAGE_KEY] = {
                isEnabled: this.isEnabled,
                openInNewTab: this.openInNewTab,
                checkIntervalMinutes: this.checkIntervalMinutes
            };
            await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', data);
        } catch (e) {
            console.error('🎯 Mission Tracker: failed to save settings:', e);
        }
    },

    async loadCachedMissions() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_missions_cache');
            if (data && data.timestamp && (Date.now() - data.timestamp < 3600000)) { // 1 hour max cache age
                this.activeMissions = data.missions || null;
            }
        } catch (e) {
            console.error('🎯 Mission Tracker: failed to load cache:', e);
        }
    },

    async saveCachedMissions() {
        try {
            await window.SidekickModules.Core.ChromeStorage.set('sidekick_missions_cache', {
                missions: this.activeMissions,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error('🎯 Mission Tracker: failed to save cache:', e);
        }
    },

    // ─── API ─────────────────────────────────────────────────────────────────

    async getApiKey() {
        try {
            return await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key') || '';
        } catch {
            return '';
        }
    },

    async fetchData(url) {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'proxyFetch', url });
            if (response && response.success) return response.data;
            throw new Error(response?.error || 'Background fetch failed');
        } catch {
            const r = await fetch(url);
            return r.json();
        }
    },

    // ─── Polling ─────────────────────────────────────────────────────────────

    startPolling() {
        this.stopPolling();
        this.checkMissions();
        this.pollTimer = setInterval(() => this.checkMissions(), this.checkIntervalMinutes * 60 * 1000);
        this.urgencyTimer = setInterval(() => {
            if (this.activeMissions?.length) this.showIcon(this.activeMissions);
        }, 60000);
    },

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        if (this.urgencyTimer) {
            clearInterval(this.urgencyTimer);
            this.urgencyTimer = null;
        }
    },

    async checkMissions() {
        const apiKey = await this.getApiKey();
        if (!apiKey) return;

        try {
            const data = await this.fetchData(`https://api.torn.com/v2/user/missions?key=${apiKey}`);
            if (data.error) {
                console.warn('🎯 Mission Tracker: API error:', data.error.error);
                return;
            }

            const givers = data.missions?.givers || [];
            const allMissions = [];
            givers.forEach(giver => {
                if (Array.isArray(giver.contracts)) {
                    allMissions.push(...giver.contracts);
                }
            });

            const active = allMissions.filter(m => {
                const s = (m.status || '').toLowerCase();
                return s !== 'completed' && s !== 'failed' && s !== 'declined';
            });

            if (active.length > 0) {
                this.activeMissions = active;
                this.showIcon(active);
            } else {
                this.activeMissions = null;
                this.removeIcon();
            }
            this.saveCachedMissions();
        } catch (e) {
            console.error('🎯 Mission Tracker: check failed:', e);
        }
    },

    // ─── Icon ─────────────────────────────────────────────────────────────────

    getMissionExpiry(mission) {
        const absoluteKeys = [
            'expires_at', 'expiry_at', 'expire_at', 'deadline', 'deadline_at',
            'ends_at', 'end_at', 'time_expires', 'timestamp_end'
        ];
        const remainingKeys = ['time_left', 'seconds_left', 'remaining_seconds'];
        const nowSeconds = Date.now() / 1000;
        const containers = [mission, mission?.time, mission?.timing].filter(Boolean);

        for (const container of containers) {
            for (const key of absoluteKeys) {
                const raw = container[key];
                if (raw == null || raw === '') continue;
                if (typeof raw === 'string' && !/^\d+(?:\.\d+)?$/.test(raw)) {
                    const parsedDate = Date.parse(raw);
                    if (Number.isFinite(parsedDate)) return parsedDate / 1000;
                }
                let value = Number(raw);
                if (!Number.isFinite(value) || value <= 0) continue;
                if (value > 1e12) value /= 1000;
                return value;
            }

            for (const key of remainingKeys) {
                const seconds = Number(container[key]);
                if (Number.isFinite(seconds) && seconds >= 0) return nowSeconds + seconds;
            }
        }
        return null;
    },

    getMissionUrgency(missions) {
        const nowSeconds = Date.now() / 1000;
        const expiries = missions
            .map(mission => this.getMissionExpiry(mission))
            .filter(expiry => Number.isFinite(expiry));

        if (!expiries.length) return { level: 'normal', remaining: null, text: '' };
        const remaining = Math.ceil(Math.min(...expiries) - nowSeconds);
        if (remaining <= 0) return { level: 'critical', remaining: 0, text: 'Expired' };
        if (remaining <= 6 * 3600) return { level: 'critical', remaining, text: this.formatTimeLeft(remaining) };
        if (remaining <= 24 * 3600) return { level: 'warning', remaining, text: this.formatTimeLeft(remaining) };
        return { level: 'safe', remaining, text: this.formatTimeLeft(remaining) };
    },

    formatTimeLeft(totalSeconds) {
        const seconds = Math.max(0, Math.ceil(totalSeconds));
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.max(1, Math.ceil((seconds % 3600) / 60));
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    },

    showIcon(missions) {
        const statusUl = document.querySelector('ul[class*="status-icons"]');
        if (!statusUl) return;

        this.ensureStyles();

        let ready = 0;
        let unaccepted = 0;
        let accepted = 0;
        missions.forEach(m => {
            const s = (m.status || '').toLowerCase();
            if (s === 'readyforreward') ready++;
            else if (s === 'available') unaccepted++;
            else if (s === 'accepted') accepted++;
        });

        const labels = [];
        if (ready > 0) labels.push(`${ready} missions complete`);
        if (accepted > 0) labels.push(`${accepted} active`);
        if (unaccepted > 0) labels.push(`${unaccepted} unaccepted`);
        const urgency = this.getMissionUrgency(missions);
        if (urgency.text) labels.push(`Time left: ${urgency.text}`);
        const label = 'Missions|' + (labels.join(', ') || 'Available');

        let li = document.getElementById(this.ICON_ID);
        if (!li) {
            li = document.createElement('li');
            li.id = this.ICON_ID;

            const a = document.createElement('a');
            a.href = 'https://www.torn.com/page.php?sid=missions';
            if (this.openInNewTab) {
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            }
            a.tabIndex = 0;
            a.setAttribute('data-is-tooltip-opened', 'false');
            a.setAttribute('i-data', 'i_10_42_17_17');

            const iconSpan = document.createElement('span');
            iconSpan.className = 'sk-mission-icon-glyph';
            iconSpan.textContent = '◎';
            
            a.appendChild(iconSpan);
            li.appendChild(a);
            statusUl.appendChild(li);

            this.enableNativeLikeTooltip(a);
        }

        li.dataset.urgency = urgency.level;

        const a = li.querySelector('a');
        if (a) {
            a.setAttribute('aria-label', label);
            if (typeof a.__sidekickUpdateTipText === 'function') {
                a.__sidekickUpdateTipText(label);
            }
        }
    },

    // ─── Tooltip Logic ───────────────────────────────────────────────────────

    enableNativeLikeTooltip(anchor) {
        let tipEl = null;
        let hideTimer = null;

        const buildTooltip = (text) => {
            const el = document.createElement('div');
            el.className = 'sidekick-tooltip';
            el.setAttribute('role', 'tooltip');
            el.setAttribute('tabindex', '-1');

            const content = document.createElement('div');
            content.className = 'sidekick-tooltip-custom';

            const [title, subtitle] = this.parseTwoLines(text);
            const p1 = document.createElement('p');
            const bold = document.createElement('b');
            bold.textContent = title;
            p1.appendChild(bold);
            content.appendChild(p1);

            if (subtitle) {
                const p2 = document.createElement('p');
                p2.className = `sk-mission-time-${anchor.closest('li')?.dataset.urgency || 'normal'}`;
                p2.textContent = subtitle;
                content.appendChild(p2);
            }
            el.appendChild(content);
            return el;
        };

        const setText = (text) => {
            if (!tipEl) return;
            const content = tipEl.querySelector('.sidekick-tooltip-custom');
            if (!content) return;
            content.innerHTML = '';
            
            const [title, subtitle] = this.parseTwoLines(text);
            const p1 = document.createElement('p');
            const bold = document.createElement('b');
            bold.textContent = title;
            p1.appendChild(bold);
            content.appendChild(p1);

            if (subtitle) {
                const p2 = document.createElement('p');
                p2.className = `sk-mission-time-${anchor.closest('li')?.dataset.urgency || 'normal'}`;
                p2.textContent = subtitle;
                content.appendChild(p2);
            }
        };

        anchor.__sidekickUpdateTipText = setText;

        const positionTooltip = () => {
            if (!tipEl) return;
            const r = anchor.getBoundingClientRect();
            tipEl.style.left = (r.left + window.scrollX + (r.width / 2) - (tipEl.offsetWidth / 2)) + 'px';
            tipEl.style.top = (r.top + window.scrollY - tipEl.offsetHeight - 8) + 'px';
        };

        const showTip = () => {
            clearTimeout(hideTimer);
            const text = anchor.getAttribute('aria-label');
            if (!text) return;

            if (!tipEl) {
                tipEl = buildTooltip(text);
                document.body.appendChild(tipEl);
                anchor.__sidekickTipEl = tipEl;
            } else {
                setText(text);
            }

            anchor.setAttribute('data-is-tooltip-opened', 'true');

            tipEl.style.opacity = '0';
            tipEl.style.left = '-9999px';
            tipEl.style.top = '-9999px';
            requestAnimationFrame(() => {
                positionTooltip();
                requestAnimationFrame(() => {
                    if (tipEl) tipEl.style.opacity = '1';
                });
            });
        };

        const hideTip = (immediate = false) => {
            if (!tipEl) return;
            anchor.setAttribute('data-is-tooltip-opened', 'false');

            if (immediate) {
                tipEl.remove();
                tipEl = null;
                anchor.__sidekickTipEl = null;
            } else {
                tipEl.style.opacity = '0';
                hideTimer = setTimeout(() => {
                    if (tipEl) tipEl.remove();
                    tipEl = null;
                    anchor.__sidekickTipEl = null;
                }, 200);
            }
        };

        anchor.addEventListener('mouseenter', showTip);
        anchor.addEventListener('mouseleave', () => hideTip(false));
        anchor.addEventListener('focus', showTip);
        anchor.addEventListener('blur', () => hideTip(false));
        window.addEventListener('scroll', () => hideTip(true), { passive: true });
    },

    parseTwoLines(text) {
        if (text.includes('|')) {
            const parts = text.split('|');
            return [parts[0], parts.slice(1).join('|')];
        }
        const parts = text.split(' - ');
        if (parts.length >= 2) {
            return [parts[0] + ' - ', parts.slice(1).join(' - ')];
        }
        return [text, ''];
    },

    removeIcon() {
        document.getElementById(this.ICON_ID)?.remove();
    },

    ensureStyles() {
        if (document.getElementById(this.STYLES_ID)) return;
        const style = document.createElement('style');
        style.id = this.STYLES_ID;
        style.textContent = `
            #${this.ICON_ID} a {
                background-image: none !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                text-decoration: none !important;
                width: 100% !important;
                height: 100% !important;
            }
            .sk-mission-icon-glyph {
                font-size: 19px;
                font-weight: 800;
                line-height: 1;
                display: block;
            }
            #${this.ICON_ID}[data-urgency="safe"] .sk-mission-icon-glyph,
            .sk-mission-time-safe {
                color: #62c875 !important;
                filter: drop-shadow(0 0 2px rgba(98, 200, 117, .35));
            }
            #${this.ICON_ID}[data-urgency="warning"] .sk-mission-icon-glyph,
            .sk-mission-time-warning {
                color: #f0ac3f !important;
                filter: drop-shadow(0 0 2px rgba(240, 172, 63, .35));
            }
            #${this.ICON_ID}[data-urgency="critical"] .sk-mission-icon-glyph,
            .sk-mission-time-critical {
                color: #ef6262 !important;
                filter: drop-shadow(0 0 2px rgba(239, 98, 98, .4));
            }
            .sidekick-tooltip {
                background: #f2f2f2;
                background: var(--tooltip-bg-color, #f2f2f2);
                box-shadow: 0 0 8px rgba(0,0,0,.3);
                box-shadow: var(--tooltip-shadow, 0 0 8px rgba(0,0,0,.3));
                width: -moz-max-content;
                width: max-content;
                z-index: 999999;
                border-radius: 4px;
                padding: 8px;
                line-height: 14px;
                position: absolute;
                pointer-events: none;
                transition: opacity 200ms;
                opacity: 0;
            }
            .sidekick-tooltip-custom {
                color: var(--default-color, #333);
                line-height: 1rem;
            }
            .sidekick-tooltip-custom a {
                color: var(--default-blue-color, #007bff);
                text-decoration: none;
            }
            .sidekick-tooltip-custom p {
                text-align: left;
                white-space: nowrap;
                margin: 0;
            }
            .sidekick-tooltip-custom p:not(:last-child) {
                margin-bottom: 4px;
            }
        `;
        document.head.appendChild(style);
    },

    // ─── Observer ────────────────────────────────────────────────────────────

    startObserver() {
        if (this.observer) return;
        let debounceTimer = null;
        this.observer = new MutationObserver(() => {
            if (!this.isEnabled) return;
            const statusUl = document.querySelector('ul[class*="status-icons"]');
            
            if (statusUl && !document.getElementById(this.ICON_ID)) {
                if (this.activeMissions && this.activeMissions.length > 0) {
                    this.showIcon(this.activeMissions);
                } else {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => this.checkMissions(), 15000);
                }
            }
        });
        this.observer.observe(document.documentElement, { childList: true, subtree: true });
    },

    stopObserver() {
        if (this.observer) { this.observer.disconnect(); this.observer = null; }
    },

    // ─── Public API ──────────────────────────────────────────────────────────

    enable() {
        this.isEnabled = true;
        this.saveSettings();
        this.startPolling();
    },

    disable() {
        this.isEnabled = false;
        this.saveSettings();
        this.stopPolling();
        this.removeIcon();
    },
};

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.MissionTracker = MissionTrackerModule;
console.log('🎯 Mission Tracker module registered');
