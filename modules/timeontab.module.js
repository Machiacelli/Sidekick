/**
 * Sidekick Chrome Extension - Time on Tab Module
 * Display remaining time for various activities on browser tab title
 * Version: 1.0.0
 * Author: Machiacelli
 */

(function () {
    'use strict';

    console.log("⏰ Loading Sidekick Time on Tab Module...");

    // Wait for Core module to be available
    function waitForCore() {
        return new Promise((resolve) => {
            const checkCore = () => {
                if (window.SidekickModules?.Core?.ChromeStorage) {
                    resolve();
                } else {
                    setTimeout(checkCore, 100);
                }
            };
            checkCore();
        });
    }

    // Time on Tab Module Implementation
    const TimeOnTabModule = {
        isInitialized: false,
        isEnabled: false,
        originalTitle: document.title,
        updateInterval: null,
        observer: null,

        // Initialize the module
        async init() {
            if (this.isInitialized) {
                console.log("⏰ Time on Tab Module already initialized");
                return;
            }

            console.log("⏰ Initializing Time on Tab Module...");

            try {
                await waitForCore();
                await this.loadSettings();

                // Store original title, ensuring we don't capture a timer title
                if (!this.originalTitle || this.originalTitle.includes('Chain:') || this.originalTitle.includes('Hospital:') || this.originalTitle.includes('Jail:')) {
                    this.originalTitle = 'TORN'; // Default fallback
                    // Try to get clean title from page
                    const titleElement = document.querySelector('title');
                    if (titleElement && titleElement.textContent && !titleElement.textContent.includes(':') && !titleElement.textContent.includes('|')) {
                        this.originalTitle = titleElement.textContent.trim();
                    }
                } else {
                    this.originalTitle = document.title;
                }

                console.log('⏰ Original title stored:', this.originalTitle);

                this.isInitialized = true;

                if (this.isEnabled) {
                    console.log('✅ Time on Tab: Enabled - monitoring page for timers');
                    this.startMonitoring();
                } else {
                    console.log('⏸️ Time on Tab: Disabled via settings');
                }

                console.log("✅ Time on Tab Module initialized successfully");
            } catch (error) {
                console.error("❌ Time on Tab Module initialization failed:", error);
            }
        },

        // Load settings from storage
        async loadSettings() {
            try {
                const saved = await window.SidekickModules.Core.ChromeStorage.get('sidekick_time_on_tab');
                if (saved) {
                    this.isEnabled = saved.isEnabled === true;
                } else {
                    this.isEnabled = false; // Default disabled
                }
                console.log('⏰ Time on Tab settings loaded:', { enabled: this.isEnabled });
            } catch (error) {
                console.error('Failed to load time on tab settings:', error);
                this.isEnabled = false; // Default disabled
            }
        },

        // Save settings to storage
        async saveSettings() {
            try {
                await window.SidekickModules.Core.ChromeStorage.set('sidekick_time_on_tab', {
                    isEnabled: this.isEnabled
                });
                console.log('💾 Time on Tab settings saved');
            } catch (error) {
                console.error('Failed to save time on tab settings:', error);
            }
        },

        // Toggle enabled state
        async toggle() {
            this.isEnabled = !this.isEnabled;
            await this.saveSettings();

            if (this.isEnabled) {
                console.log('✅ Time on Tab: Enabled');
                this.startMonitoring();
                this.showNotification('Time on Tab enabled!', 'success');
            } else {
                console.log('⏸️ Time on Tab: Disabled');
                this.stopMonitoring();
                this.restoreTitle();
                this.showNotification('Time on Tab disabled!', 'info');
            }

            return this.isEnabled;
        },

        // Start monitoring for timers
        startMonitoring() {
            this.stopMonitoring(); // Clean up any existing monitoring

            // Start update interval
            this.updateInterval = setInterval(() => {
                this.updateTabTitle();
            }, 1000);

            // Set up observer for DOM changes
            this.setupObserver();

            // Initial update
            this.updateTabTitle();
        },

        // Stop monitoring
        stopMonitoring() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }

            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        },

        // Set up mutation observer
        setupObserver() {
            this.observer = new MutationObserver(() => {
                // Debounce updates
                setTimeout(() => this.updateTabTitle(), 100);
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        },

        // Update the tab title with timer information - alternates info with a short page label
        updateTabTitle() {
            if (!this.isEnabled) {
                this.restoreTitle();
                return;
            }

            // Synchronized alternation via wall-clock: 5-second window
            // First 3s = show timer/info, last 2s = show short page label
            const now = Date.now();
            const phase = now % 5000;
            const showInfo = phase < 3000;

            // Get page-specific timer (hospital, jail, racing, travel)
            const pageTimer = this.getPageSpecificTimer();

            // Get chain timer separately
            const chainTimer = this.getChainTimer();

            // Get profile name if on profile page
            const profileName = this.getProfileName();

            // Short page label for tab identification (e.g. "Market", "Faction", "Profile")
            const pageLabel = this.getPageLabel(profileName);

            // Travel timer takes priority and is ALWAYS shown statically (never alternates)
            if (window.location.href.includes('page.php?sid=travel')) {
                const travelTimerEl = document.querySelector('#travel-root time, [class*="progressText"] time');
                if (travelTimerEl && travelTimerEl.textContent.trim().match(/\d+:\d+/)) {
                    const travelTime = travelTimerEl.textContent.trim();
                    if (travelTime !== '00:00' && travelTime !== '0:00') {
                        const newTitle = `Travel: ${travelTime} | TORN`;
                        if (document.title !== newTitle) document.title = newTitle;
                        return;
                    }
                }
            }

            let timerInfo = null;

            // Priority logic:
            // 1. Chain + profile page: alternate between chain and profile name
            // 2. Chain + page timer: alternate between chain and page timer
            // 3. Chain only: alternate chain with page label
            // 4. Page timer only: alternate page timer with page label
            // 5. Profile name only: show profile name with page label
            // 6. Page label only: alternate between the Torn page title and the label

            if (chainTimer && profileName) {
                timerInfo = showInfo ? chainTimer : profileName;
            } else if (chainTimer && pageTimer) {
                timerInfo = showInfo ? chainTimer : pageTimer;
            } else if (chainTimer) {
                timerInfo = showInfo ? chainTimer : pageLabel;
            } else if (pageTimer) {
                timerInfo = showInfo ? pageTimer : pageLabel;
            } else if (profileName) {
                timerInfo = profileName;
            }
            // No timers: show original page title without alternating

            if (timerInfo) {
                const newTitle = `${timerInfo} | TORN`;
                if (document.title !== newTitle) {
                    document.title = newTitle;
                }
            } else {
                // No active timers / label phase showing original title
                if (document.title !== this.originalTitle) {
                    document.title = this.originalTitle;
                }
            }
        },

        // Get a short label identifying the current page (for tab disambiguation)
        getPageLabel(profileName) {
            const url = window.location.href;
            const path = window.location.pathname;
            const params = new URLSearchParams(window.location.search);
            const sid = params.get('sid') || params.get('step') || '';
            const tab = params.get('tab') || '';

            // Profile page — use the name
            if (path.includes('profiles.php')) {
                return profileName ? profileName : 'Profile';
            }
            if (path.includes('imarket.php')) return 'Market';
            if (url.includes('bazaar.php') || url.includes('step=list')) return 'Bazaar';
            if (path.includes('pmarket.php')) return 'Points Market';
            if (path.includes('factions.php')) return 'Faction';
            if (url.includes('crimes2.php') || url.includes('crimes.php')) return 'Crimes';
            if (sid.includes('travel') || path.includes('travel')) return 'Travel';
            if (path.includes('hospitalview.php') || url.includes('hospital')) return 'Hospital';
            if (url.includes('jailview.php')) return 'Jail';
            if (url.includes('loader.php') && sid.includes('racing')) return 'Racing';
            if (url.includes('gym.php')) return 'Gym';
            if (path.includes('city.php')) return 'City';
            if (path.includes('properties.php')) return 'Property';
            if (url.includes('bank.php') || url.includes('atm')) return 'Bank';
            if (url.includes('missions')) return 'Missions';
            if (url.includes('companies.php')) return 'Company';
            if (url.includes('forums.php')) return 'Forums';
            if (path === '/' || path.includes('index.php') || url.endsWith('torn.com/')) return 'Home';

            // Fallback: try to extract a readable name from the page <title>
            const pageTitle = this.originalTitle || document.title;
            if (pageTitle && pageTitle !== 'TORN') {
                // Strip " | TORN" suffix and return up to 20 chars
                const stripped = pageTitle.replace(/\s*\|\s*TORN.*$/, '').trim();
                if (stripped) return stripped.length > 20 ? stripped.substring(0, 18) + '…' : stripped;
            }

            return null;
        },

        // Get page-specific timer (hospital, jail, racing, travel)
        getPageSpecificTimer() {
            // Hospital timer (highest priority) - only check on hospital page
            if (window.location.href.includes('hospitalview.php')) {
                const hospitalTimer = document.querySelector('#theCounter');
                if (hospitalTimer && hospitalTimer.textContent.trim()) {
                    const hospitalTime = hospitalTimer.textContent.trim();
                    if (hospitalTime.match(/\d+:\d+/) && hospitalTime !== '00:00' && hospitalTime !== '0:00') {
                        return `Hospital: ${hospitalTime}`;
                    }
                }
            }

            // Jail timer - only show if actually in jail
            const jailTimer = document.querySelector('[class*="jail"] [class*="timer"], #jailTimer');
            if (jailTimer && jailTimer.textContent.trim()) {
                const jailTime = jailTimer.textContent.trim();
                if (jailTime.match(/\d+:\d+/) && jailTime !== '00:00' && jailTime !== '0:00') {
                    return `Jail: ${jailTime}`;
                }
            }

            // Racing timer - only show if actually racing
            const racingTimer = document.querySelector('#infoSpot');
            if (racingTimer && racingTimer.textContent.trim()) {
                const racingTime = racingTimer.textContent.trim();
                if (racingTime.match(/\d+:\d+/) && racingTime !== '00:00' && racingTime !== '0:00') {
                    return `Racing: ${racingTime}`;
                }
            }

            // Travel timer - only on travel page
            if (window.location.href.includes('page.php?sid=travel')) {
                const travelTimer = document.querySelector("#travel-root > div.flightProgressSection___fhrD5 > div.progressText___qJFfY > span > span:nth-child(2) > time");
                if (travelTimer && travelTimer.textContent.trim()) {
                    const travelTime = travelTimer.textContent.trim();
                    if (travelTime.match(/\d+:\d+/) &&
                        travelTime !== '00:00' &&
                        travelTime !== '0:00') {
                        return `Travel: ${travelTime}`;
                    }
                }
            }

            return null;
        },

        // Get chain timer only (separated so we can alternate with page timer)
        getChainTimer() {
            const chainBar = document.querySelector('[class*="chainBar"], [class*="chain-bar"], [class*="chainBar___"]');
            const chainTimer = document.querySelector('p.bar-timeleft___B9RGV');
            const chainValue = document.querySelector('.bar-value___uxnah');

            // Exclude cooldown — if the chain bar has a cooldown class, skip
            if (chainBar) {
                const classList = [...chainBar.classList].join(' ');
                if (classList.toLowerCase().includes('cooldown') || classList.toLowerCase().includes('ended')) {
                    return null;
                }
            }

            // Also skip if the label says 'cooldown' near the timer
            const chainLabel = document.querySelector('[class*="bar-label"], [class*="chainLabel"]');
            if (chainLabel && chainLabel.textContent.toLowerCase().includes('cooldown')) {
                return null;
            }

            if (chainTimer && chainTimer.textContent.trim()) {
                const chainTime = chainTimer.textContent.trim();
                const chainLength = chainValue ? chainValue.textContent.trim() : '0';

                // Skip if chain length is 0 (happens during chain cooldown period)
                if (chainLength === '0' || chainLength === '') {
                    return null;
                }

                // Only show if there's an active chain (not 00:00 and chain length >= 25)
                if (chainTime.match(/\d+:\d+/) &&
                    chainTime !== '00:00' &&
                    chainTime !== '0:00' &&
                    parseInt(chainLength) >= 25) {
                    return `Chain ${chainLength}: ${chainTime}`;
                }
            }

        },

        // Get global alternation state (synchronized across all open tabs)
        getGlobalAlternationState() {
            if (!window.sidekickGlobalAlternation) {
                window.sidekickGlobalAlternation = {
                    showChain: true,
                    lastAlternate: Date.now()
                };
            }
            return window.sidekickGlobalAlternation;
        },

        // Toggle global alternation state
        toggleGlobalAlternation() {
            const state = this.getGlobalAlternationState();
            state.showChain = !state.showChain;
            state.lastAlternate = Date.now();
        },

        // Get profile name if on profile page
        getProfileName() {
            // Check if we're on a profile page or attack page
            const onProfilePage = window.location.href.includes('profiles.php');
            const onAttackPage = window.location.href.includes('loader.php?sid=attack');

            if (!onProfilePage && !onAttackPage) {
                return null;
            }

            // For attack pages, get the TARGET's name (not user's own profile)
            if (onAttackPage) {
                // Method 1: URL param user2ID — attack page URL contains the target's ID
                // Torn attack URL: loader.php?sid=attack&user2ID=12345
                const urlParams = new URLSearchParams(window.location.search);
                const user2ID = urlParams.get('user2ID');

                // Method 2: Torn attack page — try selectors that specifically target the opponent/defender
                const selectors = [
                    '[class*="defender"] [class*="name"]',
                    '[class*="rightPlayer"] [class*="name"]',
                    '[class*="right-player"] [class*="name"]',
                    '[class*="target"] [class*="playerName"]',
                    '[class*="opponent"] [class*="name"]',
                    // Generic: second player name in the fight UI
                    '[class*="playerInfo"] [class*="name"]:last-child',
                    // Torn attack page often has two player blocks side by side
                    '[class*="attackFighter"]:last-child [class*="name"]',
                    '[class*="playerBox"]:last-child [class*="name"]',
                ];

                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && el.textContent) {
                        const name = el.textContent.trim();
                        if (name && name.length > 0 && name !== 'TORN') {
                            this._attackTargetName = name; // cache it
                            return name;
                        }
                    }
                }

                // Method 3: Read the page's *original* title from the <title> meta
                // which may already be overwritten by this module
                const metaTitle = document.querySelector('title')?.textContent || '';
                // Torn attack titles often look like: "Attack PlayerName [xxx] | TORN"
                const attackTitleMatch = metaTitle.match(/Attack[\s:]+([^\[|]+)/i);
                if (attackTitleMatch && attackTitleMatch[1]) {
                    const name = attackTitleMatch[1].trim();
                    if (name && name !== 'TORN' && !name.includes('|') && !name.includes(':')) {
                        this._attackTargetName = name;
                        return name;
                    }
                }

                // Method 4: Store the original title on first detection
                if (!this._attackTargetName) {
                    // Try to extract from ORIGINAL (unmodified) page title stored at init
                    const origMatch = this.originalTitle.match(/Attack[\s:]+([^\[|\-]+)/i);
                    if (origMatch && origMatch[1]) {
                        this._attackTargetName = origMatch[1].trim();
                    }
                }
                if (this._attackTargetName) return this._attackTargetName;

                // Method 5: Async API lookup for player name (only triggers once per user2ID)
                if (user2ID && !this._attackNameLookupPending) {
                    this._attackNameLookupPending = user2ID;
                    (async () => {
                        try {
                            const apiKey = await window.SidekickModules?.Core?.ChromeStorage?.get('sidekick_api_key');
                            if (apiKey) {
                                const response = await fetch(`https://api.torn.com/user/${user2ID}?selections=profile&key=${apiKey}`);
                                const data = await response.json();
                                if (!data.error && data.name) {
                                    this._attackTargetName = data.name;
                                    console.log(`⏰ TimeOnTab: Resolved attack target name via API: ${data.name}`);
                                } else {
                                    // API failed — show ID as last resort
                                    this._attackTargetName = `Player ${user2ID}`;
                                }
                            } else {
                                this._attackTargetName = `Player ${user2ID}`;
                            }
                        } catch (e) {
                            this._attackTargetName = `Player ${user2ID}`;
                        }
                        this._attackNameLookupPending = null;
                    })();
                }

                // While API lookup is pending, return null so we don't pollute the title
                return this._attackTargetName || null;
            }

            // Reset attack target cache when not on attack page
            this._attackTargetName = null;

            // For regular profile pages — use originalTitle as single source of truth
            // (DOM selectors like [class*="userName"] return CSS-uppercased text causing "AsleepASLEEP")
            const titleMatch = this.originalTitle.match(/^([^\[|\-]+)/);
            if (titleMatch && titleMatch[1]) {
                const name = titleMatch[1].trim();
                if (name && name !== 'TORN' && !name.includes(':') && !name.toLowerCase().includes('attack')) {
                    return name;
                }
            }

            return null;
        },

        // Get travel time
        getTravelTime() {
            const timeElement = document.querySelector('.time') ||
                document.querySelector('[class*="time"]') ||
                document.querySelector('#travel-time');

            if (timeElement) {
                const timeText = timeElement.textContent.trim();
                if (timeText && timeText !== 'None' && !timeText.includes('Torn')) {
                    return `✈️ ${timeText}`;
                }
            }
            return null;
        },

        // Get hospital time
        getHospitalTime() {
            const timeElement = document.querySelector('#theCounter') ||
                document.querySelector('.time-left') ||
                document.querySelector('[class*="hospital-time"]');

            if (timeElement) {
                const timeText = timeElement.textContent.trim();
                if (timeText && timeText !== '0' && !timeText.includes('ready')) {
                    return `🏥 ${timeText}`;
                }
            }
            return null;
        },

        // Get racing time
        getRacingTime() {
            const timeElement = document.querySelector('#infoSpot') ||
                document.querySelector('.race-time') ||
                document.querySelector('[class*="racing-time"]');

            if (timeElement) {
                const timeText = timeElement.textContent.trim();
                if (timeText && timeText.includes(':')) {
                    return `🏁 ${timeText}`;
                }
            }
            return null;
        },

        // Get chain time
        getChainTime() {
            const chainTimeElement = document.querySelector('.bar-timeleft___B9RGV') ||
                document.querySelector('[class*="chain-time"]') ||
                document.querySelector('.chain-time');

            if (chainTimeElement) {
                const timeText = chainTimeElement.textContent.trim();
                if (timeText && !timeText.includes('ended')) {
                    const chainLengthElement = document.querySelector('.bar-value___uxnah');
                    const chainLength = chainLengthElement ? chainLengthElement.textContent.trim() : '';
                    return `⛓️ ${chainLength} ${timeText}`;
                }
            }
            return null;
        },

        // Get gym time
        getGymTime() {
            const timeElements = document.querySelectorAll('.time, [class*="time"]');
            for (const element of timeElements) {
                const text = element.textContent.trim();
                if (text.includes(':') && (text.includes('min') || text.includes('sec'))) {
                    return `💪 ${text}`;
                }
            }
            return null;
        },

        // Get jail time
        getJailTime() {
            const timeElement = document.querySelector('.time-left') ||
                document.querySelector('#jail-time') ||
                document.querySelector('[class*="jail-time"]');

            if (timeElement) {
                const timeText = timeElement.textContent.trim();
                if (timeText && timeText !== '0' && !timeText.includes('free')) {
                    return `🔒 ${timeText}`;
                }
            }
            return null;
        },

        // Restore original title
        restoreTitle() {
            document.title = this.originalTitle;
        },

        // Show notification
        showNotification(message, type = 'info') {
            if (window.SidekickModules?.UI?.showNotification) {
                window.SidekickModules.UI.showNotification('Time on Tab', message, type);
            }
        },

        // Get current status
        getStatus() {
            return {
                isEnabled: this.isEnabled,
                isInitialized: this.isInitialized,
                originalTitle: this.originalTitle,
                currentTitle: document.title
            };
        }
    };

    // Initialize global namespace if it doesn't exist
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    // Export Time on Tab module to global namespace
    window.SidekickModules.TimeOnTab = TimeOnTabModule;
    console.log("✅ Time on Tab Module loaded and ready");

})();