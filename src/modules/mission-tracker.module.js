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
    },

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
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
            iconSpan.textContent = '🎯';
            
            a.appendChild(iconSpan);
            li.appendChild(a);
            statusUl.appendChild(li);

            this.enableNativeLikeTooltip(a);
        }

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
            p1.innerHTML = `<b>${title}</b>`;
            content.appendChild(p1);

            if (subtitle) {
                const p2 = document.createElement('p');
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
            p1.innerHTML = `<b>${title}</b>`;
            content.appendChild(p1);

            if (subtitle) {
                const p2 = document.createElement('p');
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
                font-size: 15px;
                line-height: 1;
                display: block;
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
