/**
 * Blood Bag Reminder Module
 * Shows blood bag icon when ready to fill blood bags
 * Configurable 1-3 bags with dynamic life/cooldown thresholds
 * Forked from Torn: Refill Blood Bag Reminder by ButtChew
 */

const BloodBagReminderModule = {
    name: 'Blood Bag Reminder',
    description: 'Shows blood bag icon when ready to fill blood bags',
    version: '1.0.0',

    // Configuration
    CONFIG: {
        fullLifeIconId: 'sidekick-bloodbag-icon',
        bloodBagPng: chrome.runtime.getURL('assets/icons/blood-bag-2.png'),

        destinations: {
            items: 'https://www.torn.com/item.php#medical-items',
            armory: 'https://www.torn.com/factions.php?step=your&type=1#/tab=armoury&start=0&sub=medical'
        },

        lifePerBag: 30,
        cooldownPerBagMs: 60 * 60 * 1000,
        statusIconsSelector: 'ul[class*="status-icons"]',
        pollMs: 2000,
    },

    // State
    isEnabled: false,
    settings: {
        bagsToFill: 2,
        destination: 'items',
        openInNewTab: false
    },
    checkScheduled: false,
    observer: null,
    pollInterval: null,

    // Initialize module
    async init() {
        console.log('🩸 Blood Bag Reminder module initializing...');

        await this.loadSettings();

        if (this.isEnabled) {
            this.enable();
        }

        console.log('🩸 Blood Bag Reminder module initialized');
    },

    // Load settings from Chrome storage
    async loadSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
            if (data && data['blood-bag-reminder']) {
                const moduleSettings = data['blood-bag-reminder'];
                this.isEnabled = moduleSettings.isEnabled || false;
                this.settings = {
                    bagsToFill: moduleSettings.bagsToFill || 2,
                    destination: moduleSettings.destination || 'items',
                    openInNewTab: moduleSettings.openInNewTab !== undefined ? moduleSettings.openInNewTab : false
                };
                console.log('🩸 Loaded settings:', { isEnabled: this.isEnabled, bagsToFill: this.settings.bagsToFill });
            } else {
                console.log('🩸 No existing settings, module disabled by default');
            }
        } catch (error) {
            console.error('🩸 Failed to load Blood Bag Reminder settings:', error);
        }
    },

    // Save settings to Chrome storage
    async saveSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
            data['blood-bag-reminder'] = {
                isEnabled: this.isEnabled,
                bagsToFill: this.settings.bagsToFill,
                destination: this.settings.destination,
                openInNewTab: this.settings.openInNewTab
            };
            await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', data);
        } catch (error) {
            console.error('🩸 Failed to save Blood Bag Reminder settings:', error);
        }
    },

    // Enable module
    enable() {
        console.log('🩸 Enable called, current state:', { isEnabled: this.isEnabled });

        if (this.isEnabled) {
            console.log('🩸 Already enabled, re-initializing...');
            // Re-initialize even if already enabled (for toggle scenarios)
        }

        console.log('🩸 Enabling Blood Bag Reminder');
        this.isEnabled = true;
        this.saveSettings();

        this.ensureStyles();
        this.startObserver();
        this.startPolling();
        this.scheduleCheck();

        console.log('🩸 Blood Bag Reminder enabled successfully');
    },

    // Disable module
    disable() {
        console.log('🩸 Disable called, current state:', { isEnabled: this.isEnabled });

        if (!this.isEnabled) {
            console.log('🩸 Already disabled');
            return;
        }

        console.log('🩸 Disabling Blood Bag Reminder');
        this.isEnabled = false;
        this.saveSettings();

        this.stopObserver();
        this.stopPolling();
        this.removeIcon();

        console.log('🩸 Blood Bag Reminder disabled successfully');
    },

    // Get sidebar data from sessionStorage
    getSidebarData() {
        try {
            const key = Object.keys(sessionStorage).find(k => /sidebarData\d+/.test(k));
            if (!key) return null;
            return JSON.parse(sessionStorage.getItem(key));
        } catch {
            return null;
        }
    },

    // Get life data from sessionStorage
    getLifeFromStorage() {
        const data = this.getSidebarData();
        if (!data) return null;

        const life = data?.bars?.life;
        if (life && typeof life.amount === 'number' && typeof life.max === 'number') {
            const pct = life.max > 0 ? Math.round((life.amount / life.max) * 100) : 0;
            return { current: life.amount, max: life.max, pct };
        }

        return null;
    },

    // Convert HMS to milliseconds
    hmsToMs(hms) {
        if (!hms) return 0;
        const parts = hms.split(':').map(Number);
        if (parts.length === 3) {
            const [h, m, s] = parts;
            return ((h * 60 + m) * 60 + s) * 1000;
        }
        return 0;
    },

    // Get medical cooldown info from sessionStorage
    getMedicalCooldownInfo() {
        const data = this.getSidebarData();
        if (!data) return null;

        const med = data?.statusIcons?.icons?.medical_cooldown;
        if (!med) return null;

        const nowSec = Date.now() / 1000;
        const remainingMs = Math.max(0, (med.timerExpiresAt - nowSec) * 1000);
        const maxMs = this.hmsToMs(med.factionUpgrade);

        return {
            remainingMs,
            maxMs,
            freeMs: Math.max(0, maxMs - remainingMs)
        };
    },

    // Get destination URL based on settings
    getDestinationURL() {
        return this.CONFIG.destinations[this.settings.destination] || this.CONFIG.destinations.items;
    },

    // Get thresholds based on bags to fill
    getThresholds() {
        const bags = this.settings.bagsToFill;
        return {
            lifePercent: bags * this.CONFIG.lifePerBag,
            cooldownBufferMs: (bags - 1) * this.CONFIG.cooldownPerBagMs
        };
    },

    // Update icon visibility and tooltip
    updateIcon() {
        if (!this.isEnabled) {
            this.removeIcon();
            return;
        }

        const statusUl = document.querySelector(this.CONFIG.statusIconsSelector);
        if (!statusUl) return;

        const existing = document.getElementById(this.CONFIG.fullLifeIconId);
        const life = this.getLifeFromStorage();
        const med = this.getMedicalCooldownInfo();
        const thresholds = this.getThresholds();

        // Check if conditions are met
        const lifeOk = life && life.pct > thresholds.lifePercent;

        let cooldownOk = true;
        if (med && med.maxMs > 0) {
            cooldownOk = med.remainingMs < (med.maxMs - thresholds.cooldownBufferMs);
        }

        const shouldShow = lifeOk && cooldownOk;

        if (shouldShow) {
            let label = `Life: ${this.formatNum(life.current)} / ${this.formatNum(life.max)} (${life.pct}%)`;
            if (med && med.maxMs > 0) {
                const remainHrs = Math.floor(med.remainingMs / 3600000);
                const remainMin = Math.floor((med.remainingMs % 3600000) / 60000);
                const maxHrs = Math.floor(med.maxMs / 3600000);
                label += ` - CD: ${remainHrs}h${remainMin}m / ${maxHrs}h`;
            } else {
                label += ` - No medical cooldown`;
            }

            if (existing) {
                const a = existing.querySelector('a');
                if (a) {
                    a.setAttribute('aria-label', label);
                    if (typeof a.__sidekickUpdateTipText === 'function') {
                        a.__sidekickUpdateTipText(label);
                    }
                }
                return;
            }

            const li = this.buildBloodBagIcon(label);
            statusUl.appendChild(li);
        } else if (existing) {
            existing.remove();
        }
    },

    // Build blood bag icon element
    buildBloodBagIcon(tooltipText) {
        const li = document.createElement('li');
        li.id = this.CONFIG.fullLifeIconId;
        li.style.animation = 'sidekickBloodBagPulse 900ms ease-out 1';

        const a = document.createElement('a');
        a.href = this.getDestinationURL();
        if (this.settings.openInNewTab) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        }
        a.setAttribute('aria-label', tooltipText);
        a.tabIndex = 0;
        a.setAttribute('data-is-tooltip-opened', 'false');
        a.setAttribute('i-data', 'i_10_42_17_17');

        const img = document.createElement('img');
        img.src = this.CONFIG.bloodBagPng;
        img.alt = 'Blood Bag';
        img.width = 17;
        img.height = 17;
        img.style.display = 'block';

        a.appendChild(img);
        li.appendChild(a);

        this.enableNativeLikeTooltip(a);

        return li;
    },

    // Remove icon
    removeIcon() {
        const existing = document.getElementById(this.CONFIG.fullLifeIconId);
        if (existing) existing.remove();
    },

    // Inject CSS styles
    ensureStyles() {
        if (document.getElementById('sidekick-bloodbag-styles')) return;

        const style = document.createElement('style');
        style.id = 'sidekick-bloodbag-styles';
        style.textContent = `
            #${this.CONFIG.fullLifeIconId} a {
                background-image: none !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                text-decoration: none !important;
                width: 100% !important;
                height: 100% !important;
            }
            ul[class*="status-icons"] {
                height: auto !important;
                overflow: visible !important;
            }
            @keyframes sidekickBloodBagPulse {
                0%   { transform: scale(0.9); }
                60%  { transform: scale(1.1); }
                100% { transform: scale(1.0); }
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

    // Schedule check
    scheduleCheck() {
        if (this.checkScheduled) return;
        this.checkScheduled = true;
        requestAnimationFrame(() => {
            this.checkScheduled = false;
            this.updateIcon();
        });
    },

    // Start mutation observer
    startObserver() {
        if (this.observer) return;

        this.observer = new MutationObserver(() => {
            this.scheduleCheck();
        });
        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    },

    // Stop mutation observer
    stopObserver() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    },

    // Start polling
    startPolling() {
        if (this.pollInterval) return;

        this.pollInterval = setInterval(() => {
            this.scheduleCheck();
        }, this.CONFIG.pollMs);
    },

    // Stop polling
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    },

    // Format number with locale
    formatNum(n) {
        try {
            return n.toLocaleString();
        } catch {
            return String(n);
        }
    },

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
        const parts = text.split(' - ');
        if (parts.length >= 2) {
            return [parts[0] + ' - ', parts.slice(1).join(' - ')];
        }
        return [text, ''];
    },

    // Update settings (called from settings page)
    async updateSettings(newSettings) {
        this.settings = {
            ...this.settings,
            ...newSettings
        };
        await this.saveSettings();
        this.updateIcon();
    }
};

// Register module
if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.BloodBagReminder = BloodBagReminderModule;

console.log('🩸 Blood Bag Reminder module registered on window.SidekickModules');
