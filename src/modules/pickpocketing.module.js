/**
 * Sidekick Chrome Extension - Pickpocketing Module
 * Color codes crimes based on difficulty in the pickpocketing crime
 */

(function () {
    'use strict';

    console.log('🛑 Loading Sidekick Pickpocketing Module...');

    const PickpocketingModule = {
        isInitialized: false,
        isEnabled: false,
        _intervalId: null,

        categoryColorMap: {
            "Safe": "#37b24d",
            "Moderately Unsafe": "#74b816",
            "Unsafe": "#f59f00",
            "Risky": "#f76707",
            "Dangerous": "#f03e3e",
            "Very Dangerous": "#7048e8",
        },

        tier1: { "Safe": "#37b24d", "Moderately Unsafe": "#f76707", "Unsafe": "#f03e3e", "Risky": "#f03e3e", "Dangerous": "#f03e3e", "Very Dangerous": "#7048e8" },
        tier2: { "Safe": "#37b24d", "Moderately Unsafe": "#37b24d", "Unsafe": "#f76707", "Risky": "#f03e3e", "Dangerous": "#f03e3e", "Very Dangerous": "#7048e8" },
        tier3: { "Safe": "#37b24d", "Moderately Unsafe": "#37b24d", "Unsafe": "#37b24d", "Risky": "#f76707", "Dangerous": "#f03e3e", "Very Dangerous": "#7048e8" },
        tier4: { "Safe": "#37b24d", "Moderately Unsafe": "#37b24d", "Unsafe": "#37b24d", "Risky": "#37b24d", "Dangerous": "#f76707", "Very Dangerous": "#7048e8" },
        tier5: { "Safe": "#37b24d", "Moderately Unsafe": "#37b24d", "Unsafe": "#37b24d", "Risky": "#37b24d", "Dangerous": "#37b24d", "Very Dangerous": "#7048e8" },

        markGroups: {
            "Safe": ["Drunk man", "Drunk woman", "Homeless person", "Junkie", "Elderly man", "Elderly woman"],
            "Moderately Unsafe": ["Classy lady", "Laborer", "Postal worker", "Young man", "Young woman", "Student"],
            "Unsafe": ["Rich kid", "Sex worker", "Thug"],
            "Risky": ["Jogger", "Businessman", "Businesswoman", "Gang member", "Mobster"],
            "Dangerous": ["Cyclist"],
            "Very Dangerous": ["Police officer"],
        },

        async init() {
            if (this.isInitialized) return;
            console.log('🛑 Initializing Pickpocketing Module...');

            try {
                this.isEnabled = await this.loadSettings();
                if (this.isEnabled) {
                    this.enable();
                }
                this.isInitialized = true;
                console.log('✅ Pickpocketing Module initialized');
            } catch (error) {
                console.error('❌ Failed to initialize Pickpocketing Module:', error);
            }
        },

        async loadSettings() {
            try {
                if (window.SidekickModules?.Core?.ChromeStorage?.get) {
                    const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                    if (settings && settings['crime-pickpocketing']) {
                        return settings['crime-pickpocketing'].isEnabled !== false;
                    }
                }
                return false; // Default off
            } catch (error) {
                console.error('Error loading Pickpocketing settings:', error);
                return false;
            }
        },

        getPickpocketSkill() {
            const selectors = [
                '.value___QgkEU', // current as of June 2026
                '.value___FdkAT.copyTrigger___fsdzI', // older
                '[class*="value___"][class*="copyTrigger___"]', // generic fallback
                'button[aria-label*="Skill"] [class*="value"]', // aria fallback
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && !isNaN(parseFloat(el.textContent))) {
                    return parseFloat(el.textContent);
                }
            }
            return null;
        },

        updateDivColors() {
            const url = window.location.href;
            if (!url.includes("#/pickpocketing")) return;

            const skill = this.getPickpocketSkill();
            let sideColorMap = this.tier1; // default fallback
            if (skill !== null) {
                if (skill < 10) sideColorMap = this.tier1;
                else if (skill < 35) sideColorMap = this.tier2;
                else if (skill < 65) sideColorMap = this.tier3;
                else if (skill < 80) sideColorMap = this.tier4;
                else sideColorMap = this.tier5;
            }

            const divElements = document.querySelectorAll('.titleAndProps___pwoYG:not(.processed)');
            divElements.forEach(divElement => {
                const nameDiv = divElement.querySelector('div');
                if (!nameDiv) return;
                const divContent = nameDiv.textContent.trim();

                const additionalData = divElement.querySelector('span.physicalProps___Dv_LL');
                const additionalText = additionalData ? additionalData.textContent.trim() : '';
                const text = divContent + ' ' + additionalText;

                for (const category in this.markGroups) {
                    if (this.markGroups[category].some(group => text.includes(group))) {
                        nameDiv.style.color = this.categoryColorMap[category];
                        if (window.innerWidth > 386) {
                            nameDiv.textContent = `${divContent} (${category})`;
                        }

                        divElement.classList.add('processed');
                        let parentElement = divElement;
                        for (let i = 0; i < 3; i++) {
                            if (parentElement) parentElement = parentElement.parentElement;
                        }
                        if (parentElement && !parentElement.classList.contains('processed')) {
                            parentElement.style.borderLeft = `3px solid ${sideColorMap[category]}`;
                            parentElement.classList.add('processed');
                        }
                        break;
                    }
                }
            });
        },

        enable() {
            console.log('🛑 Enabling Pickpocketing Module');
            this.isEnabled = true;
            this.updateDivColors();
            this._intervalId = setInterval(() => this.updateDivColors(), 50);
            this._startNavWatcher();
            this.injectHeaderBadge();
        },

        // Inject a small ✓ badge next to the page heading when on the pickpocketing page
        injectHeaderBadge() {
            if (!window.location.hash.includes('pickpocketing')) {
                document.getElementById('sidekick-pickpocketing-badge')?.remove();
                return;
            }
            if (document.getElementById('sidekick-pickpocketing-badge')) return;

            const header = document.querySelector('div.appHeader___tG_Ot h4.heading___BtymB');
            if (!header) return;

            const badge = document.createElement('span');
            badge.id = 'sidekick-pickpocketing-badge';
            badge.title = 'Sidekick Pickpocketing active';
            badge.style.cssText = [
                'display:inline-flex',
                'align-items:center',
                'justify-content:center',
                'width:16px',
                'height:16px',
                'border-radius:50%',
                'background:linear-gradient(135deg,#66BB6A,#4CAF50)',
                'color:#fff',
                'font-size:10px',
                'font-weight:bold',
                'margin-left:6px',
                'vertical-align:middle',
                'flex-shrink:0',
                'box-shadow:0 0 4px rgba(102,187,106,0.6)',
            ].join(';');
            badge.textContent = '✓';
            header.appendChild(badge);
        },

        // Watch URL changes so we can clean up if necessary, though interval check covers it
        _startNavWatcher() {
            if (this._navWatcher) return;
            let lastHash = window.location.hash;
            this._navWatcher = setInterval(() => {
                const cur = window.location.hash;
                if (cur !== lastHash) {
                    lastHash = cur;
                    // Remove stale badge when leaving the pickpocketing page
                    if (!cur.includes('pickpocketing')) {
                        document.getElementById('sidekick-pickpocketing-badge')?.remove();
                    }
                }
                this.injectHeaderBadge();
            }, 300);
        },

        disable() {
            console.log('🛑 Disabling Pickpocketing Module');
            this.isEnabled = false;
            if (this._intervalId) {
                clearInterval(this._intervalId);
                this._intervalId = null;
            }
            if (this._navWatcher) {
                clearInterval(this._navWatcher);
                this._navWatcher = null;
            }

            // Cleanup added classes to allow re-processing if re-enabled
            const processedElements = document.querySelectorAll('.processed');
            processedElements.forEach(el => {
                el.classList.remove('processed');
                if (el.style.borderLeft) {
                    el.style.borderLeft = '';
                }
            });
        },

        async toggle() {
            if (this.isEnabled) {
                this.disable();
            } else {
                this.enable();
            }
        }
    };

    window.SidekickModules = window.SidekickModules || {};
    window.SidekickModules.Pickpocketing = PickpocketingModule;

    console.log('✅ Sidekick Pickpocketing Module loaded and ready');
})();
