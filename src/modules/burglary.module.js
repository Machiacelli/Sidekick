/**
 * Sidekick Chrome Extension - Burglary Module
 * Display burglary confidence percentage permanently next to the graphic
 */

(function () {
    'use strict';

    console.log('🏠 Loading Sidekick Burglary Module...');
    const LOCATION_TIME_DATA = {
        residential: {
            optimalWindow: '09:00 - 14:59',
            slots: [
                { start: 0, end: 3, score: 79.58 },
                { start: 3, end: 6, score: 79.79 },
                { start: 6, end: 9, score: 79.00 },
                { start: 9, end: 12, score: 81.65 },
                { start: 12, end: 15, score: 80.31 },
                { start: 15, end: 18, score: 79.37 },
                { start: 18, end: 21, score: 79.33 },
                { start: 21, end: 24, score: 79.96 }
            ]
        },

        commercial: {
            optimalWindow: '18:00 - 23:59',
            slots: [
                { start: 0, end: 3, score: 77.52 },
                { start: 3, end: 6, score: 79.26 },
                { start: 6, end: 9, score: 78.92 },
                { start: 9, end: 12, score: 76.22 },
                { start: 12, end: 15, score: 79.61 },
                { start: 15, end: 18, score: 79.83 },
                { start: 18, end: 21, score: 81.08 },
                { start: 21, end: 24, score: 80.61 }
            ]
        },

        industrial: {
            optimalWindow: '21:00 - 08:59',
            slots: [
                { start: 0, end: 3, score: 83.03 },
                { start: 3, end: 6, score: 79.80 },
                { start: 6, end: 9, score: 81.11 },
                { start: 9, end: 12, score: 78.44 },
                { start: 12, end: 15, score: 76.53 },
                { start: 15, end: 18, score: 74.27 },
                { start: 18, end: 21, score: 80.43 },
                { start: 21, end: 24, score: 81.76 }
            ]
        }
    };

    const LOCATION_BUTTON_SELECTORS = {
        residential: 'button[class*="residential"]',
        commercial: 'button[class*="commercial"]',
        industrial: 'button[class*="industrial"]'
    };

    const BurglaryModule = {
        isInitialized: false,
        isEnabled: false,
        _intervalId: null,
        _locationButtonCache: null,
        _colorAnchors: [
            { score: 74.0, color: '#b71c1c' },
            { score: 78.0, color: '#e53935' },
            { score: 79.0, color: '#fb8c00' },
            { score: 79.6, color: '#fdd835' },
            { score: 80.2, color: '#9ccc65' },
            { score: 81.0, color: '#43a047' },
            { score: 81.6, color: '#2ecc71' },
            { score: 83.0, color: '#00c853' }
        ],

        async init() {
            if (this.isInitialized) return;
            console.log('🏠 Initializing Burglary Module...');

            try {
                this.isEnabled = await this.loadSettings();
                if (this.isEnabled) {
                    this.enable();
                }
                this.isInitialized = true;
                console.log('✅ Burglary Module initialized');
            } catch (error) {
                console.error('❌ Failed to initialize Burglary Module:', error);
            }
        },

        async loadSettings() {
            try {
                if (window.SidekickModules?.Core?.ChromeStorage?.get) {
                    const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                    if (settings && settings['crime-burglary']) {
                        return settings['crime-burglary'].isEnabled !== false;
                    }
                }
                return false; // Default off
            } catch (error) {
                console.error('Error loading Burglary settings:', error);
                return false;
            }
        },

        getColorByConfidence(percentage) {
            const percent = parseInt(percentage);
            if (percent === 100) return '#4dd0e1'; // Light blue
            if (percent >= 60) return '#4caf50';   // Green
            if (percent >= 40) return '#8bc34a';   // Light green
            if (percent >= 30) return '#ff9800';   // Orange
            return '#f44336';                       // Red
        },

        updateLocationButtons() {
            if (!window.location.hash.includes('burglary')) return;

            const now = new Date();

            // Torn time is UTC
            const hour = now.getUTCHours();

            Object.entries(LOCATION_TIME_DATA).forEach(([location, data]) => {

                const button = document.querySelector(
                    `button[class*="${location}"]`
                );

                if (!button) return;

                // Native browser tooltip
                button.title = data.optimalWindow;

                const slot = data.slots.find(s =>
                    hour >= s.start && hour < s.end
                );

                if (!slot) return;

                const color = this.getLocationColor(slot.score);

                const gradient = button.querySelector('linearGradient');
                if (!gradient) return;

                const stops = gradient.querySelectorAll('stop');

                if (stops.length >= 2) {
                    stops[0].setAttribute('stop-color', color.light);
                    stops[1].setAttribute('stop-color', color.dark);
                }
            });
        },

        getLocationColor(score) {

            const anchors = [...this._colorAnchors].sort((a, b) => a.score - b.score);

            if (score <= anchors[0].score) {
                return {
                    light: anchors[0].color,
                    dark: anchors[0].color
                };
            }

            if (score >= anchors[anchors.length - 1].score) {
                return {
                    light: anchors[anchors.length - 1].color,
                    dark: anchors[anchors.length - 1].color
                };
            }

            for (let i = 0; i < anchors.length - 1; i++) {

                const a = anchors[i];
                const b = anchors[i + 1];

                if (score >= a.score && score <= b.score) {

                    const ratio = (score - a.score) / (b.score - a.score);

                    const blend = (c1, c2) => {

                        const r1 = parseInt(c1.substr(1, 2), 16);
                        const g1 = parseInt(c1.substr(3, 2), 16);
                        const b1 = parseInt(c1.substr(5, 2), 16);

                        const r2 = parseInt(c2.substr(1, 2), 16);
                        const g2 = parseInt(c2.substr(3, 2), 16);
                        const b2 = parseInt(c2.substr(5, 2), 16);

                        const r = Math.round(r1 + (r2 - r1) * ratio);
                        const g = Math.round(g1 + (g2 - g1) * ratio);
                        const b = Math.round(b1 + (b2 - b1) * ratio);

                        return "#" + [r, g, b]
                            .map(v => v.toString(16).padStart(2, "0"))
                            .join("");
                    };

                    return {
                        light: blend(a.color, b.color),
                        dark: blend(a.color, b.color)
                    };
                }
            }

            return {
                light: "#ffffff",
                dark: "#ffffff"
            };
        },

        addConfidencePercentages() {
            // Only run on the burglary sub-page
            if (!window.location.hash.includes('burglary')) return;
            if (!window.location.href.includes('crimes')) return;

            const bars = document.querySelectorAll('div[class^="progressBar"][class*="vertical"]');

            bars.forEach((bar) => {
                const confidenceMeter = bar.closest('div[class^="confidenceMeter"]');
                if (!confidenceMeter) return;

                const label = bar.getAttribute('aria-label');
                if (!label) return;

                const match = label.match(/(\d+)/);
                if (!match) return;

                const percentage = match[1];
                const statusSection = confidenceMeter.closest('div[class^="statusSection"]');
                if (!statusSection) return;

                let display = statusSection.querySelector('.conf-text-display');

                if (!display) {
                    // Add left padding to create space
                    statusSection.style.paddingLeft = '50px';

                    display = document.createElement('div');
                    display.className = 'conf-text-display';
                    display.style.position = 'absolute';
                    display.style.left = '8px';
                    display.style.top = '50%';
                    display.style.transform = 'translateY(-50%)';
                    display.style.fontSize = '15px';
                    display.style.fontWeight = '600';
                    display.style.fontFamily = 'Roboto, sans-serif';
                    display.style.letterSpacing = '0.3px';
                    display.style.zIndex = '10';
                    display.style.pointerEvents = 'none';
                    display.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';

                    statusSection.style.position = 'relative';
                    statusSection.appendChild(display);

                    new MutationObserver(() => {
                        const newLabel = bar.getAttribute('aria-label');
                        const newMatch = newLabel?.match(/(\d+)/);
                        if (newMatch) {
                            display.textContent = newMatch[1] + '%';
                            display.style.color = BurglaryModule.getColorByConfidence(newMatch[1]);
                        }
                    }).observe(bar, { attributes: true, attributeFilter: ['aria-label'] });
                }

                // Update text and color
                display.textContent = percentage + '%';
                display.style.color = BurglaryModule.getColorByConfidence(percentage);
            });
        },

        enable() {
            console.log('🏠 Enabling Burglary Module');

            this.isEnabled = true;

            this.addConfidencePercentages();
            this.updateLocationButtons();

            this._intervalId = setInterval(() => {
                this.addConfidencePercentages();
                this.updateLocationButtons();
            }, 250);

            this._watchForHeader();
            this._startNavWatcher();
        },

        // Watch URL changes so badge disappears when leaving burglary
        _startNavWatcher() {
            if (this._navWatcher) return;
            let lastHash = window.location.hash;
            this._navWatcher = setInterval(() => {
                const cur = window.location.hash;
                if (cur !== lastHash) {
                    lastHash = cur;
                    if (!cur.includes('burglary')) {
                        this._removeHeaderBadge();
                    } else {
                        this._injectHeaderBadge();
                    }
                }
            }, 300);
        },

        // ── Header badge ──────────────────────────────────────────────────
        _injectHeaderBadge() {
            // Only show badge on the burglary sub-page
            if (!window.location.hash.includes('burglary')) return;
            if (document.getElementById('sidekick-burglary-badge')) return;
            const h4 = document.querySelector('div.appHeader___tG_Ot h4.heading___BtymB');
            if (!h4) return;
            const badge = document.createElement('span');
            badge.id = 'sidekick-burglary-badge';
            badge.title = 'Sidekick Burglary active';
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
            badge.textContent = '\u2713';
            h4.appendChild(badge);
        },

        _removeHeaderBadge() {
            const b = document.getElementById('sidekick-burglary-badge');
            if (b) b.remove();
        },

        // Watch for the crimes SPA rendering/re-rendering the header
        _watchForHeader() {
            this._injectHeaderBadge();
            if (this._headerObserver) return;
            this._headerObserver = new MutationObserver(() => {
                if (!document.getElementById('sidekick-burglary-badge')) {
                    this._injectHeaderBadge();
                }
            });
            this._headerObserver.observe(document.body, { childList: true, subtree: true });
        },

        disable() {
            console.log('🏠 Disabling Burglary Module');

            this.isEnabled = false;

            if (this._intervalId) {
                clearInterval(this._intervalId);
                this._intervalId = null;
            }
            if (this._navWatcher) {
                clearInterval(this._navWatcher);
                this._navWatcher = null;
            }
            if (this._headerObserver) {
                this._headerObserver.disconnect();
                this._headerObserver = null;
            }
            this._removeHeaderBadge();

            // Clean up UI
            const displays = document.querySelectorAll('.conf-text-display');
            displays.forEach(d => d.remove());

            const sections = document.querySelectorAll('.statusSection___esgMf');
            sections.forEach(s => {
                s.style.paddingLeft = '';
                s.style.position = '';
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
    window.SidekickModules.Burglary = BurglaryModule;

    console.log('✅ Sidekick Burglary Module loaded and ready');
})();
