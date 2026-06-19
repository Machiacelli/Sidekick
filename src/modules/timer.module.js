/**
 * Sidekick Chrome Extension - Timer Module
 * Handles timer functionality for countdown and stopwatch timers
 * Version: 1.0.0
 * Author: Machiacelli
 */

(function () {
    'use strict';

    console.log("⏰ Loading Sidekick Timer Module...");

    // Wait for Core module to be available
    function waitForCore() {
        return new Promise((resolve) => {
            const checkCore = () => {
                console.log("🔍 Checking for Core module...");
                console.log("🔍 SidekickModules exists:", !!window.SidekickModules);
                console.log("🔍 Core exists:", !!window.SidekickModules?.Core);
                console.log("🔍 ChromeStorage exists:", !!window.SidekickModules?.Core?.ChromeStorage);

                if (window.SidekickModules?.Core?.ChromeStorage) {
                    console.log("⏰ Core module with ChromeStorage ready for Timer");
                    resolve();
                } else {
                    setTimeout(checkCore, 100);
                }
            };
            checkCore();
        });
    }

    // Timer Module Implementation
    const TimerModule = {
        isInitialized: false,
        timers: [],
        intervals: new Map(),
        apiKey: null,
        apiCheckInterval: null,
        cooldownWindowMap: {}, // Map of cooldownType -> timerId to remember which window each cooldown belongs to
        currentZIndex: 1000, // Track highest z-index for stacking

        // Get next z-index for new timer windows
        getNextZIndex() {
            this.currentZIndex += 1;
            return this.currentZIndex;
        },

        // Add timer persistence safeguard during navigation
        setupNavigationHandler() {
            // Save timers before page unload
            window.addEventListener('beforeunload', () => {
                console.log("🔄 Page unloading - saving timers");
                // Use synchronous localStorage for immediate save
                try {
                    const state = {
                        timers: this.timers.map(timer => ({ ...timer, element: null })),
                        lastSaved: Date.now()
                    };
                    localStorage.setItem('sidekick_timer_state', JSON.stringify(state));
                    console.log("✅ Emergency save to localStorage successful");
                } catch (error) {
                    console.error("❌ Emergency save failed:", error);
                }
            });

            // Auto-save timers every 30 seconds for better persistence
            setInterval(() => {
                if (this.timers.length > 0) {
                    console.log("🔄 Auto-saving", this.timers.length, "timers");
                    this.saveTimers();
                }
            }, 30000);

            // Save immediately when timers change
            this.originalPushTimers = this.timers.push.bind(this.timers);
            this.timers.push = (...items) => {
                const result = this.originalPushTimers(...items);
                this.saveTimers();
                return result;
            };

            // Also save on visibility change (tab switching)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    console.log("🔄 Tab hidden - saving timers");
                    this.saveTimers();
                }
            });

            // Save timers every 10 seconds as a backup (more frequent)
            setInterval(() => {
                if (this.timers.length > 0) {
                    console.log("🔄 Auto-save - saving", this.timers.length, "timers");
                    this.saveTimers();
                }
            }, 10000);
        },

        // Initialize the timer module
        async init() {
            if (this.isInitialized) {
                console.log("⏰ Timer Module already initialized");
                return;
            }

            console.log("⏰ Initializing Timer Module...");

            try {
                await waitForCore();

                console.log("⏰ Timer Module: Starting initialization...");

                // Load saved state first (lightweight operation)
                await this.loadTimers();
                console.log(`⏰ Timer Module: Loaded ${this.timers.length} timers from storage`);

                await this.loadApiKey();
                this.setupNavigationHandler();
                this.startPeriodicSynchronization();

                // Restore timer panels immediately (no delay needed)
                console.log(`⏰ Timer Module: Attempting to restore ${this.timers.length} timer panels`);
                this.restoreTimerPanels();

                // Double-check after restoration
                setTimeout(() => {
                    console.log(`⏰ Timer Module: Final check - ${this.timers.length} timers in memory`);
                    this.timers.forEach((timer, index) => {
                        console.log(`⏰ Timer ${index + 1}: ${timer.name} (${timer.type}) - Running: ${timer.isRunning}`);
                    });
                }, 100); // Reduced to just 100ms for verification

                console.log("⏰ Timer Module initialized with", this.timers.length, "saved timers");

                // Immediately trigger lazy initialization to render timers without delay
                this.lazyInit();

                // Add manual test functions to window for debugging (always available)
                window.debugTimerSave = () => {
                    console.log("🔍 Current timers in memory:", this.timers.length);
                    console.log("🔍 Timers:", this.timers);
                    this.saveTimers();
                    const saved = localStorage.getItem('sidekick_timer_state');
                    console.log("🔍 Saved to localStorage:", saved);
                };

                window.debugTimerLoad = () => {
                    const saved = localStorage.getItem('sidekick_timer_state');
                    console.log("🔍 Raw localStorage data:", saved);
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        console.log("🔍 Parsed data:", parsed);
                        console.log("🔍 Number of timers in saved data:", parsed.timers?.length || 0);
                    }
                };

                // Add comprehensive diagnostic
                window.debugTimerDiagnose = () => {
                    console.log("🩺 TIMER DIAGNOSTIC START");
                    console.log("🔍 Memory timers:", this.timers.length);
                    console.log("🔍 localStorage exists:", !!localStorage);
                    console.log("🔍 localStorage data:", localStorage.getItem('sidekick_timer_state'));
                    console.log("🔍 sessionStorage data:", sessionStorage.getItem('sidekick_timer_state'));
                    console.log("🔍 Module initialized:", this.isInitialized);
                    console.log("🔍 Lazy initialized:", this.isLazyInitialized);
                    console.log("🩺 DIAGNOSTIC END");
                };

                this.isInitialized = true;
                console.log("✅ Timer Module initialized successfully");
            } catch (error) {
                console.error("❌ Timer Module initialization failed:", error);
            }
        },

        // Lazy initialization - called when sidebar is opened
        lazyInit() {
            if (this.isLazyInitialized) {
                console.log("⏰ Lazy initialization already completed");
                return;
            }

            console.log('⏰ Performing lazy initialization...');

            // Clear any existing timer elements first to prevent duplication
            this.clearExistingTimerElements();

            // Render timers immediately with current data (no delay!)
            this.renderAllTimers();

            this.isLazyInitialized = true;
            console.log('✅ Lazy initialization completed');
        },

        // Clear all existing timer elements from DOM
        clearExistingTimerElements() {
            const existingTimers = document.querySelectorAll('[id^="sidekick-timer-"]');
            console.log(`🔄 Clearing ${existingTimers.length} existing timer elements`);
            existingTimers.forEach(element => element.remove());
        },

        // Render all timers 
        renderAllTimers() {
            console.log('🔄 Rendering all timers:', this.timers.length, 'timers');

            if (this.timers.length === 0) {
                console.log('📭 No timers to render');
                return;
            }

            // Render each timer
            this.timers.forEach(timer => {
                console.log(`🔄 Rendering timer: ${timer.name} (ID: ${timer.id})`);
                this.renderTimer(timer);
            });

            console.log('✅ All timers rendered successfully');
        },

        // Load API key from storage
        async loadApiKey() {
            try {
                if (window.SidekickModules?.Core?.ChromeStorage?.get) {
                    this.apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                    console.log("⏰ API Key loaded:", this.apiKey ? "✓" : "✗");
                }
            } catch (error) {
                console.warn("⚠️ Failed to load API key:", error);
            }
        },

        // Save API key to storage
        async saveApiKey(key) {
            try {
                if (window.SidekickModules?.Core?.ChromeStorage?.set) {
                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_api_key', key);
                    this.apiKey = key;
                    console.log("⏰ API Key saved successfully");
                }
            } catch (error) {
                console.warn("⚠️ Failed to save API key:", error);
            }
        },

        // Start checking API for cooldowns (disabled automatic checking)
        startApiChecking() {
            // Automatic API checking has been disabled per user request
            // Cooldowns will only be checked when manually requested via dropdown
        },

        // Fetch cooldown data from API (for restoring displays)
        async fetchCooldownData() {
            if (!this.apiKey) {
                console.log('⚠️ No API key available for cooldown data fetch');
                return;
            }

            try {
                console.log('🔄 Fetching cooldown data for restore...');

                // Try background script first
                let cooldownData = null;
                if (chrome?.runtime?.sendMessage) {
                    try {
                        const backgroundResult = await this.makeCooldownApiCallViaBackground(this.apiKey);
                        if (backgroundResult.success && backgroundResult.cooldowns) {
                            cooldownData = backgroundResult.cooldowns;
                            console.log('✅ Background fetch API successful');
                        }
                    } catch (bgError) {
                        console.log('⚠️ Background fetch failed, trying direct...');
                    }
                }

                // Fallback to direct fetch
                if (!cooldownData) {
                    const response = await fetch(`https://api.torn.com/user/?selections=cooldowns&key=${this.apiKey}`);
                    const data = await response.json();

                    if (data.error) {
                        console.warn("⚠️ API Error during fetch:", data.error.error);
                        return;
                    }
                    cooldownData = data.cooldowns;
                }

                if (cooldownData) {
                    this.cooldownData = cooldownData;
                    console.log('✅ Cooldown data refreshed:', Object.keys(this.cooldownData).length, 'cooldowns');
                } else {
                    this.cooldownData = {};
                    console.log('📭 No active cooldowns found');
                }

                this.restoreTimersFromCooldownData();
            } catch (error) {
                console.error('❌ Error fetching cooldown data:', error);
                this.handleCooldownApiError(error);
            }
        },

        // Check Torn API for cooldowns
        async checkApiCooldowns() {
            if (!this.apiKey) return;

            try {
                console.log('🔍 Checking API cooldowns via enhanced method...');

                // Try background script first
                if (chrome?.runtime?.sendMessage) {
                    try {
                        const backgroundResult = await this.makeCooldownApiCallViaBackground(this.apiKey);
                        if (backgroundResult.success && backgroundResult.cooldowns) {
                            this.updateCooldownTimers(backgroundResult.cooldowns);
                            return;
                        }
                    } catch (bgError) {
                        console.log('⚠️ Background checkApiCooldowns failed, trying direct...');
                    }
                }

                // Fallback to direct fetch
                const response = await fetch(`https://api.torn.com/user/?selections=cooldowns&key=${this.apiKey}`);
                const data = await response.json();

                if (data.error) {
                    console.warn("⚠️ API Error:", data.error.error);
                    return;
                }

                if (data.cooldowns) {
                    this.updateCooldownTimers(data.cooldowns);
                }
            } catch (error) {
                console.error('❌ Error in checkApiCooldowns:', error);
                this.handleCooldownApiError(error);
            }
        },

        // Update or create timers based on API cooldowns (removed automatic creation)
        updateCooldownTimers(cooldowns) {
            // This method is now used for on-demand cooldown checking
            // Automatic timer creation has been removed per user request
        },

        // Get color based on cooldown type
        getCooldownColor(type) {
            const colors = {
                'drug': '#9C27B0',      // Purple
                'medical': '#4CAF50',    // Green  
                'booster': '#FF9800'     // Orange
            };
            return colors[type] || '#2196F3';
        },

        // Check specific cooldown type and update timer
        async checkSpecificCooldown(timer, cooldownType) {
            // Check for API key, prompt if not available
            if (!this.apiKey) {
                const apiKey = prompt('Please enter your Torn API key to check cooldowns:');
                if (!apiKey) {
                    console.log('⏰ Cooldown check cancelled - no API key provided');
                    return;
                }
                this.apiKey = apiKey;
                // Save the API key for future use
                if (window.SidekickModules?.Core?.ChromeStorage?.set) {
                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_api_key', apiKey);
                    console.log('🔑 API Key saved');
                }
            }

            try {
                console.log(`🔍 Checking ${cooldownType} cooldown with API key...`);

                // Try background script first
                let data = null;
                if (chrome?.runtime?.sendMessage) {
                    try {
                        const backgroundResult = await this.makeCooldownApiCallViaBackground(this.apiKey);
                        if (backgroundResult.success) {
                            data = {
                                cooldowns: backgroundResult.cooldowns,
                                money: backgroundResult.money
                            };
                            console.log('✅ Background checkSpecificCooldown successful');
                        }
                    } catch (bgError) {
                        console.log('⚠️ Background checkSpecificCooldown failed, trying direct...');
                    }
                }

                // Fallback to direct fetch
                if (!data) {
                    const response = await fetch(`https://api.torn.com/user/?selections=cooldowns,money&key=${this.apiKey}`);
                    data = await response.json();
                }

                console.log('🔍 Full API Response:', data);

                if (data.error) {
                    console.warn("⚠️ API Error:", data.error.error);
                    if (window.SidekickModules?.Core?.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show(
                            'API Error',
                            data.error.error,
                            'error'
                        );
                    }
                    return;
                }

                console.log(`🔍 Available cooldowns:`, data.cooldowns);
                console.log(`🔍 Money data:`, data.money);
                console.log(`🔍 Looking for cooldown type: ${cooldownType}`);

                // Special handling for bank investment
                let remainingTimeSeconds = null;
                if (cooldownType === 'Bank') {
                    if (data.money && data.money.city_bank && data.money.city_bank.time_left > 0) {
                        remainingTimeSeconds = data.money.city_bank.time_left;
                        console.log(`💰 Bank investment found: ${remainingTimeSeconds}s remaining (amount: $${data.money.city_bank.amount.toLocaleString()})`);
                    } else {
                        console.log(`💰 No active bank investment found`);
                    }
                } else {
                    // Regular cooldown
                    remainingTimeSeconds = data.cooldowns ? data.cooldowns[cooldownType] : null;
                    console.log(`🔍 Specific cooldown value:`, remainingTimeSeconds);
                }

                if (remainingTimeSeconds !== null && remainingTimeSeconds !== undefined && remainingTimeSeconds > 0) {
                    console.log(`🔍 Cooldown found: ${remainingTimeSeconds} seconds remaining`);

                    if (remainingTimeSeconds > 0) {
                        // Cooldown names mapping
                        const cooldownNames = {
                            'drug': 'Drug Cooldown',
                            'medical': 'Medical Cooldown',
                            'booster': 'Booster Cooldown',
                            'Bank': 'Bank Investment',
                            'Virus': 'Virus Timer'
                        };

                        // Find existing cooldown timer or use current timer
                        let existingTimer = this.findOrCreateCooldownTimer(timer, cooldownType);

                        console.log(`🔍 Original timer clicked:`, timer.id);
                        console.log(`🔍 Timer selected for cooldown:`, existingTimer.id);
                        console.log(`🔍 Adding ${cooldownType} to timer:`, existingTimer.id);
                        console.log(`🔍 Existing cooldowns before:`, existingTimer.cooldowns);

                        // Add this cooldown to the timer's cooldown collection
                        if (!existingTimer.cooldowns) {
                            existingTimer.cooldowns = {};
                        }
                        existingTimer.cooldowns[cooldownType] = remainingTimeSeconds;

                        console.log(`🔍 Cooldowns after adding ${cooldownType}:`, existingTimer.cooldowns);

                        // Update timer properties based on number of cooldowns
                        const cooldownCount = Object.keys(existingTimer.cooldowns).length;
                        console.log(`🔍 Total cooldown count: ${cooldownCount}`);

                        if (cooldownCount === 1) {
                            // Single cooldown - show specific name
                            existingTimer.name = cooldownNames[cooldownType] || 'Cooldown';
                            existingTimer.color = this.getCooldownColor(cooldownType);
                        } else {
                            // Multiple cooldowns - show generic name
                            existingTimer.name = 'Cooldowns';
                            existingTimer.color = '#9b59b6'; // Purple for multi-cooldown
                        }

                        existingTimer.duration = Math.max(...Object.values(existingTimer.cooldowns));
                        existingTimer.remainingTime = Math.max(...Object.values(existingTimer.cooldowns));
                        existingTimer.isApiTimer = true;
                        existingTimer.isRunning = true;

                        this.saveTimers();

                        // Start the timer
                        this.startTimer(existingTimer.id);

                        // Force a complete display update without removing the element
                        console.log('🔍 Updating timer display after cooldown selection');
                        this.updateTimerDisplay(existingTimer.id);

                        // Show success notification
                        if (window.SidekickModules?.UI?.showNotification) {
                            window.SidekickModules.UI.showNotification(
                                'SUCCESS',
                                `${cooldownNames[cooldownType]} Timer Started - ${this.formatTime(remainingTimeSeconds)} remaining`
                            );
                        }
                    } else {
                        console.log(`🔍 ${cooldownType} cooldown has expired (remaining time: ${remainingTimeSeconds} seconds)`);
                        if (window.SidekickModules?.Core?.NotificationSystem) {
                            window.SidekickModules.Core.NotificationSystem.show(
                                'Cooldown Expired',
                                `Your ${cooldownType} cooldown has already finished`,
                                'info'
                            );
                        }
                    }
                } else {
                    const cooldownTypeNames = {
                        'drug': 'drug cooldown',
                        'medical': 'medical cooldown',
                        'booster': 'booster cooldown',
                        'Bank': 'bank investment',
                        'Virus': 'virus timer'
                    };
                    const typeName = cooldownTypeNames[cooldownType] || cooldownType;
                    console.log(`🔍 No ${typeName} found in response or value is 0`);
                    console.log(`🔍 Cooldown value was:`, remainingTimeSeconds);
                    if (window.SidekickModules?.Core?.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show(
                            'No Active Cooldown',
                            `You don't currently have an active ${typeName}`,
                            'info'
                        );
                    }
                }
            } catch (error) {
                console.warn("⚠️ Failed to fetch cooldown from API:", error);
                if (window.SidekickModules?.Core?.NotificationSystem) {
                    window.SidekickModules.Core.NotificationSystem.show(
                        'Connection Error',
                        'Failed to connect to Torn API',
                        'error'
                    );
                }
            }
        },

        findOrCreateCooldownTimer(currentTimer, cooldownType) {
            console.log(`🔍 findOrCreateCooldownTimer for ${cooldownType}, currentTimer:`, currentTimer.id);

            // CRITICAL FIX: If current timer is a blank/custom timer (not an API timer),
            // use it directly instead of searching for existing cooldown timers.
            // This prevents blank timers from being replaced by existing cooldown timers.
            if (!currentTimer.isApiTimer) {
                console.log(`ℹ️ Current timer is a blank/custom timer, using it directly`);
                console.log(`🔍 Not searching for existing ${cooldownType} timers to preserve user's blank timer`);

                // Save this association for future use
                this.cooldownWindowMap[cooldownType] = currentTimer.id;
                console.log(`💾 Saved new ${cooldownType} → ${currentTimer.id} mapping`);

                // Save immediately to persist mapping
                this.saveTimers();
                console.log(`✅ Cooldown window mapping persisted to storage`);

                return currentTimer;
            }

            // FIRST: Check if we have a saved mapping for this cooldown type
            if (this.cooldownWindowMap[cooldownType]) {
                const mappedTimerId = this.cooldownWindowMap[cooldownType];
                const mappedTimer = this.timers.find(t => t.id === mappedTimerId);

                if (mappedTimer) {
                    console.log(`✅ Found saved window mapping for ${cooldownType}:`, mappedTimer.id);
                    console.log(`🔍 Reusing window "${mappedTimer.name}" based on saved mapping`);
                    return mappedTimer;
                } else {
                    console.log(`⚠️ Saved mapping points to non-existent timer ${mappedTimerId}, clearing mapping`);
                    delete this.cooldownWindowMap[cooldownType];
                }
            }

            // SECOND: Search for existing timers that have or previously had this cooldown type
            const existingTimersWithCooldown = this.timers.filter(timer => {
                // Check if timer currently has this cooldown type in its cooldowns object
                if (timer.cooldowns && timer.cooldowns[cooldownType] !== undefined) {
                    return true;
                }
                // Check if timer's cooldownType property matches (for single-cooldown timers)
                if (timer.cooldownType === cooldownType) {
                    return true;
                }
                return false;
            });

            if (existingTimersWithCooldown.length > 0) {
                // Sort by most recently modified to get the last used timer with this cooldown type
                existingTimersWithCooldown.sort((a, b) => {
                    const aTime = new Date(a.modified || a.created || 0).getTime();
                    const bTime = new Date(b.modified || b.created || 0).getTime();
                    return bTime - aTime; // Descending order (most recent first)
                });

                const selectedTimer = existingTimersWithCooldown[0];
                console.log(`✅ Found existing timer with ${cooldownType} cooldown type:`, selectedTimer.id);
                console.log(`🔍 Timer name: ${selectedTimer.name}, Last modified: ${selectedTimer.modified || selectedTimer.created}`);
                console.log(`🔍 Reusing existing window instead of creating new one`);

                // Save this association for next time
                this.cooldownWindowMap[cooldownType] = selectedTimer.id;
                console.log(`💾 Saved ${cooldownType} → ${selectedTimer.id} mapping`);

                // Save to persist mapping
                this.saveTimers();
                console.log(`✅ Cooldown window mapping updated in storage`);

                return selectedTimer;
            }

            // THIRD: No existing timer found with this cooldown type, use the clicked timer
            console.log(`ℹ️ No existing timer found with cooldown type ${cooldownType}`);
            console.log(`🔍 Using clicked timer:`, currentTimer.id);

            // Save this association for future use
            this.cooldownWindowMap[cooldownType] = currentTimer.id;
            console.log(`💾 Saved new ${cooldownType} → ${currentTimer.id} mapping`);

            // IMPORTANT: Save immediately to persist mapping
            this.saveTimers();
            console.log(`✅ Cooldown window mapping persisted to storage`);

            return currentTimer;
        },

        // Start periodic time synchronization and API checks
        startPeriodicSynchronization() {
            // Synchronize timers every 60 seconds to fix drift
            setInterval(() => {
                this.synchronizeTimers();
            }, 60000);

            // Check API cooldowns every 5 minutes (if enabled by user via dropdown)
            setInterval(() => {
                // Only check if user has explicitly requested cooldown checking
                // This prevents automatic API spam
            }, 300000);

            // DISABLED: Automatic virus checking - only check when user manually selects from dropdown
            // Check virus coding status every 5 minutes (only if user has opted in)
            // setInterval(() => {
            //     this.checkVirusCoding();
            // }, 300000);

            // DISABLED: Initial automatic virus check
            // Initial virus check after 10 seconds (only if user has opted in)
            // setTimeout(() => {
            //     this.checkVirusCoding();
            // }, 10000);

            console.log('⏰ Periodic synchronization and virus checking started');

            // Check for page visibility changes and sync immediately
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    console.log('👁️ Page became visible - synchronizing timers');
                    setTimeout(() => {
                        this.synchronizeTimers();
                    }, 1000); // Small delay to ensure page is fully loaded
                }
            });

            // Start API monitoring if we have any API timers
            const hasApiTimers = this.timers.some(timer => timer.isApiTimer);
            if (hasApiTimers) {
                this.startApiMonitoring();
            }
        },

        // Synchronize timers with actual elapsed time (fix drift from navigation)
        async synchronizeTimers() {
            console.log("🔄 Synchronizing timers with actual elapsed time...");

            const now = Date.now();
            let hasChanges = false;

            for (const timer of this.timers) {
                if (timer.isRunning && timer.type === 'countdown') {
                    // Prefer endTime (absolute) over elapsed calculation to avoid double-counting
                    if (timer.endTime) {
                        const secsRemaining = Math.max(0, Math.round((timer.endTime - now) / 1000));
                        console.log(`⏰ Timer ${timer.name}: syncing via endTime → ${secsRemaining}s remaining`);

                        if (timer.cooldowns) {
                            // Distribute time across cooldowns proportionally based on stored ratio
                            // The longest cooldown should match secsRemaining
                            const maxCooldown = Math.max(...Object.values(timer.cooldowns));
                            if (maxCooldown > 0) {
                                const ratio = secsRemaining / maxCooldown;
                                for (let cooldownType in timer.cooldowns) {
                                    timer.cooldowns[cooldownType] = Math.max(0, Math.round(timer.cooldowns[cooldownType] * ratio));
                                }
                            }
                            timer.remainingTime = secsRemaining;
                        } else {
                            timer.remainingTime = secsRemaining;
                        }

                        if (secsRemaining <= 0) {
                            timer.isRunning = false;
                            timer.remainingTime = 0;
                            console.log(`⏰ Timer ${timer.name} expired while away`);
                        }
                        hasChanges = true;
                    } else if (timer.lastUpdated) {
                        // Fallback for old timers without endTime
                        const elapsed = Math.floor((now - new Date(timer.lastUpdated).getTime()) / 1000);
                        if (elapsed > 2 && elapsed < 86400) { // Cap at 1 day to prevent massive jumps on old data
                            console.log(`⏰ Timer ${timer.name}: fallback sync, ${elapsed}s elapsed`);
                            if (timer.cooldowns) {
                                for (let cooldownType in timer.cooldowns) {
                                    timer.cooldowns[cooldownType] = Math.max(0, timer.cooldowns[cooldownType] - elapsed);
                                }
                                timer.remainingTime = Math.max(...Object.values(timer.cooldowns));
                            } else {
                                timer.remainingTime = Math.max(0, timer.remainingTime - elapsed);
                            }
                            // Assign endTime now so future syncs use it
                            timer.endTime = now + timer.remainingTime * 1000;
                            if (timer.remainingTime <= 0) timer.isRunning = false;
                            hasChanges = true;
                        }
                    }
                }

                // Update lastUpdated only for running timers (avoid stale timestamps)
                if (timer.isRunning) {
                    timer.lastUpdated = new Date(now).toISOString();
                }
            }

            if (hasChanges) {
                this.saveTimers();
                console.log("✅ Timer synchronization complete");
            }
        },

        // Check virus coding status from Torn API v2
        async checkVirusCoding() {
            if (!this.apiKey) {
                console.log('⏰ No API key for virus check');
                return;
            }

            try {
                console.log('🦠 Checking virus coding status...');

                // Use Torn API v2 virus endpoint
                const response = await fetch(`https://api.torn.com/v2/user/virus`, {
                    headers: {
                        'accept': 'application/json',
                        'Authorization': `ApiKey ${this.apiKey}`
                    }
                });

                const data = await response.json();

                console.log('🦠 Virus API response:', data);

                // Check if user has opted in to virus tracking
                // Opt-in happens when they manually add a virus timer via dropdown
                const virusTrackingEnabled = localStorage.getItem('sidekick_virus_tracking_enabled') === 'true';
                const hasExistingVirusTimer = this.timers.some(t => t.isVirusTimer);

                if (!virusTrackingEnabled && !hasExistingVirusTimer) {
                    console.log('🦠 Virus tracking not enabled - user must manually add via dropdown first');
                    return;
                }

                // Check if virus is being coded
                if (data.virus && data.virus.until) {
                    const virusName = data.virus.item?.name || 'Unknown Virus';
                    const endTime = data.virus.until * 1000; // Convert to milliseconds

                    console.log(`🦠 Virus detected: ${virusName}, ends at: ${new Date(endTime)}`);

                    // Check if we already have a virus timer
                    const existingVirus = this.timers.find(t => t.isVirusTimer);

                    if (existingVirus) {
                        // Update existing timer
                        console.log('🦠 Updating existing virus timer');
                        existingVirus.name = `🦠 ${virusName}`;
                        existingVirus.endTime = endTime;
                        existingVirus.remainingTime = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
                        existingVirus.duration = existingVirus.remainingTime;
                        this.saveTimers();
                        this.updateTimerDisplay(existingVirus.id);
                    } else {
                        // Create new virus timer (only if opted in)
                        console.log('🦠 Creating new virus timer');
                        this.createVirusTimer(virusName, endTime);
                    }
                } else {
                    // No virus being coded - remove virus timer if it exists
                    const existingVirus = this.timers.find(t => t.isVirusTimer);
                    if (existingVirus) {
                        console.log('🦠 Virus coding complete - removing timer');
                        const element = document.getElementById(`sidekick-timer-${existingVirus.id}`);
                        if (element) {
                            element.remove();
                        }
                        this.timers = this.timers.filter(t => t.id !== existingVirus.id);
                        this.saveTimers();
                    }
                }
            } catch (error) {
                console.error('❌ Error checking virus coding:', error);
            }
        },

        // Create a virus coding timer
        createVirusTimer(virusName, endTime) {
            // Double-check we don't already have a virus timer
            const existingVirus = this.timers.find(t => t.isVirusTimer);
            if (existingVirus) {
                console.log('🦠 Virus timer already exists, updating instead');
                existingVirus.name = `🦠 ${virusName}`;
                existingVirus.endTime = endTime;
                existingVirus.type = 'countdown';
                // Calculate remaining time from endTime
                existingVirus.remainingTime = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
                existingVirus.duration = existingVirus.remainingTime;
                this.saveTimers();
                this.updateTimerDisplay(existingVirus.id);
                return existingVirus;
            }

            // Calculate remaining time from endTime
            const remainingSeconds = Math.max(0, Math.floor((endTime - Date.now()) / 1000));

            const timer = {
                id: `virus-${Date.now()}`,
                name: `🦠 ${virusName}`,
                type: 'countdown', // CRITICAL: Use 'type' not 'isCountdown'
                endTime: endTime,
                startTime: Date.now(),
                remainingTime: remainingSeconds,
                duration: remainingSeconds,
                isRunning: true,
                isVirusTimer: true, // Flag to identify virus timers
                color: '#9C27B0', // Purple color for virus timers
                x: 10,
                y: 10,
                width: 300,
                height: 250,
                showEndDate: false  // Default to showing only countdown
            };

            this.timers.push(timer);
            this.saveTimers();
            this.renderTimer(timer);
            this.startTimer(timer.id);

            // Set opt-in flag so virus tracking continues
            localStorage.setItem('sidekick_virus_tracking_enabled', 'true');

            console.log(`🦠 Created virus timer: ${virusName}, remaining: ${remainingSeconds}s`);
            return timer;
        },

        // Load timers from storage
        async loadTimers() {
            try {
                console.log("� loadTimers - Starting load...");

                let state = null;
                let loaded = false;

                // Method 1: Try Chrome storage wrapper (now handles extension context internally)
                try {
                    if (window.SidekickModules?.Core?.ChromeStorage?.get) {
                        console.log("⏰ Method 1: Loading via ChromeStorage wrapper");
                        state = await window.SidekickModules.Core.ChromeStorage.get('sidekick_timer_state');
                        if (state && state.timers) {
                            this.timers = state.timers;
                            this.cooldownWindowMap = state.cooldownWindowMap || {}; // Load cooldown-to-window mapping
                            loaded = true;
                            console.log("✅ ChromeStorage wrapper load succeeded, loaded:", this.timers.length, "timers");
                            console.log("✅ Loaded cooldown window map:", Object.keys(this.cooldownWindowMap).length, "mappings");
                        }
                    }
                } catch (error) {
                    console.warn("⚠️ ChromeStorage wrapper load failed:", error.message);
                }

                // Method 2: Try localStorage if wrapper failed
                if (!loaded) {
                    try {
                        console.log("⏰ Method 2: Loading via localStorage fallback");
                        const savedState = JSON.parse(localStorage.getItem('sidekick_timer_state') || '{}');
                        if (savedState && savedState.timers) {
                            this.timers = savedState.timers;
                            this.cooldownWindowMap = savedState.cooldownWindowMap || {}; // Load cooldown-to-window mapping
                            loaded = true;
                            console.log("✅ localStorage fallback load succeeded, loaded:", this.timers.length, "timers");
                            console.log("✅ Loaded cooldown window map:", Object.keys(this.cooldownWindowMap).length, "mappings");
                        }
                    } catch (error) {
                        console.warn("⚠️ localStorage fallback load failed:", error);
                    }
                }

                // Method 3: Try old format for backward compatibility
                if (!loaded) {
                    try {
                        console.log("⏰ Method 3: Loading old format via ChromeStorage wrapper");
                        if (window.SidekickModules?.Core?.ChromeStorage?.get) {
                            const oldTimers = await window.SidekickModules.Core.ChromeStorage.get('sidekick_timers');
                            if (Array.isArray(oldTimers)) {
                                this.timers = oldTimers;
                                loaded = true;
                                console.log("✅ Old format load succeeded, loaded:", this.timers.length, "timers");
                                // Migrate to new format
                                this.saveTimers();
                            }
                        }
                    } catch (error) {
                        console.warn("⚠️ Old format load failed:", error);
                    }
                }

                // Method 4: Try old format via localStorage
                if (!loaded) {
                    try {
                        console.log("⏰ Method 4: Loading old format via localStorage");
                        const oldTimers = JSON.parse(localStorage.getItem('sidekick_timers') || '[]');
                        if (Array.isArray(oldTimers)) {
                            this.timers = oldTimers;
                            loaded = true;
                            console.log("✅ Old format localStorage load succeeded, loaded:", this.timers.length, "timers");
                            // Migrate to new format
                            this.saveTimers();
                        }
                    } catch (error) {
                        console.warn("⚠️ Old format localStorage load failed:", error);
                    }
                }

                if (!loaded) {
                    this.timers = [];
                    console.log("⚠️ No storage method succeeded, initialized empty timers array");
                }

                // Synchronize timer times after loading (fix time drift from being away)
                await this.synchronizeTimers();

                // Log each timer for debugging (like original script)
                this.timers.forEach((timer, index) => {
                    console.log(`📂 Timer ${index + 1}:`, timer.name, 'type:', timer.cooldownType, 'isApiTimer:', timer.isApiTimer);
                });

            } catch (error) {
                console.error('Failed to load timers:', error);
                this.timers = [];

                // Show user-friendly error
                if (window.SidekickModules?.Core?.NotificationSystem) {
                    window.SidekickModules.Core.NotificationSystem.show(
                        'Timer Error',
                        'Failed to load saved timers: ' + error.message,
                        'error'
                    );
                }
            }
        },

        // Restore timer displays after page load
        async restoreTimerDisplays() {
            try {
                console.log("🔄 Restoring timer displays...");

                // Clear any existing timer elements first to prevent duplication
                const existingTimers = document.querySelectorAll('[id^="sidekick-timer-"]');
                console.log(`🔄 Clearing ${existingTimers.length} existing timer elements`);
                existingTimers.forEach(element => element.remove());

                // Wait a bit for the UI to be ready
                await new Promise(resolve => setTimeout(resolve, 100));

                // Refresh cooldown data from API before restoring (only if API key exists)
                if (this.apiKey) {
                    try {
                        console.log("🔄 Refreshing cooldown data from API...");
                        await this.fetchCooldownData();
                    } catch (error) {
                        console.warn("⚠️ Failed to refresh cooldown data, using saved data:", error);
                    }
                } else {
                    console.log("⚠️ No API key available, skipping cooldown refresh");
                }

                // Restore each timer
                for (const timer of this.timers) {
                    if (timer.isRunning) {
                        // Update cooldown times with fresh API data if available
                        if (timer.cooldowns && this.cooldownData) {
                            for (const [type, _] of Object.entries(timer.cooldowns)) {
                                if (this.cooldownData[type]) {
                                    timer.cooldowns[type] = this.cooldownData[type];
                                    console.log(`🔄 Updated ${type} cooldown from API: ${this.cooldownData[type]}s`);
                                }
                            }
                        }

                        // Render the timer display
                        this.renderTimer(timer);

                        // Start the countdown if it's running
                        this.startTimer(timer.id);
                    }
                }

                console.log("✅ Timer displays restored:", this.timers.length, "timers");
            } catch (error) {
                console.error("❌ Failed to restore timer displays:", error);
            }
        },

        // Save timers to storage - BULLETPROOF APPROACH
        async saveTimers() {
            try {
                console.log("💾 BULLETPROOF SAVE - Starting with", this.timers.length, "timers");

                // Create clean state object (no DOM references, no functions)
                const cleanState = {
                    timers: this.timers.map(timer => ({
                        id: timer.id,
                        name: timer.name,
                        duration: timer.duration,
                        remainingTime: timer.remainingTime,
                        isRunning: timer.isRunning,
                        type: timer.type,
                        color: timer.color,
                        x: timer.x,
                        y: timer.y,
                        width: timer.width,
                        height: timer.height,
                        pinned: timer.pinned,
                        docked: timer.docked,
                        undockX: timer.undockX,
                        undockY: timer.undockY,
                        created: timer.created,
                        modified: timer.modified,
                        isApiTimer: timer.isApiTimer,
                        cooldownType: timer.cooldownType,
                        cooldowns: timer.cooldowns,
                        isVirusTimer: timer.isVirusTimer,
                        endTime: timer.endTime,
                        showEndDate: timer.showEndDate !== undefined ? timer.showEndDate : false
                    })),
                    cooldownWindowMap: this.cooldownWindowMap || {}, // Save cooldown-to-window mapping
                    lastSaved: Date.now(),
                    version: '1.0'
                };

                const stateString = JSON.stringify(cleanState);
                console.log("💾 State string length:", stateString.length);
                console.log("💾 State preview:", stateString.substring(0, 200));

                // TRIPLE SAVE: localStorage (primary), Chrome storage (backup), sessionStorage (emergency)

                // Method 1: localStorage (synchronous, most reliable)
                localStorage.setItem('sidekick_timer_state', stateString);
                console.log("✅ localStorage save completed");

                // Method 2: sessionStorage (backup)
                sessionStorage.setItem('sidekick_timer_state', stateString);
                console.log("✅ sessionStorage save completed");

                // Method 3: Chrome storage (async backup)
                try {
                    if (window.SidekickModules?.Core?.ChromeStorage?.set) {
                        await window.SidekickModules.Core.ChromeStorage.set('sidekick_timer_state', cleanState);
                        console.log("✅ Chrome storage save completed");
                    }
                } catch (chromeError) {
                    console.debug("🔧 Chrome storage backup failed (expected if context invalidated):", chromeError);
                }

                // Immediate verification
                const verification = localStorage.getItem('sidekick_timer_state');
                if (verification) {
                    const parsed = JSON.parse(verification);
                    console.log("✅ SAVE VERIFIED - timers in storage:", parsed.timers.length);
                } else {
                    console.error("❌ SAVE FAILED - no data in localStorage");
                }

            } catch (error) {
                console.error('❌ CRITICAL SAVE FAILURE:', error);
                throw error; // Make failures visible
            }
        },

        // Restore timer panels after page refresh
        restoreTimerPanels() {
            console.log("🔄 Restoring", this.timers.length, "timer panels after page refresh...");

            if (this.timers.length === 0) {
                console.log("⏰ No timers to restore");
                return;
            }

            // Create panels for all saved timers
            this.timers.forEach(timer => {
                try {
                    console.log("🔄 Restoring timer:", timer.name, "at position", timer.x, timer.y);
                    this.renderTimer(timer);

                    // If the timer was running, restart it
                    if (timer.isRunning && timer.remainingTime > 0) {
                        this.startTimer(timer.id);
                    }
                } catch (error) {
                    console.error("❌ Failed to restore timer:", timer.name, error);
                }
            });

            console.log("✅ Timer panels restoration completed");
        },

        // Create a new timer window in the sidebar
        addTimer(name = 'Timer') {
            console.log('⏰ Adding new timer:', name, '- Current timer count:', this.timers.length);

            // Safeguard: Don't interfere with existing timers
            const currentTimerCount = this.timers.length;
            if (currentTimerCount > 0) {
                console.log('🔍 Existing timers found, ensuring no conflicts...');
            }

            // Get content area for positioning within sidepanel
            const contentArea = document.getElementById('sidekick-content');
            const contentWidth = contentArea ? contentArea.clientWidth : 480;
            const contentHeight = contentArea ? contentArea.clientHeight : 500;

            // Better stacking algorithm
            const timerWidth = Math.min(280, contentWidth - 40);
            const timerHeight = Math.min(140, contentHeight - 60); // Smaller height since no buttons
            const padding = 10;
            const stackOffset = 25;

            // Calculate position for better stacking
            const timerCount = this.timers.length;
            const maxColumns = Math.floor((contentWidth - padding * 2) / (timerWidth + stackOffset));
            const column = timerCount % maxColumns;
            const row = Math.floor(timerCount / maxColumns);

            const x = padding + (column * (timerWidth + stackOffset));
            const y = padding + (row * (timerHeight + stackOffset));

            const timer = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: name,
                duration: 0, // Start with 0 - will be set when cooldown is selected
                remainingTime: 0,
                isRunning: false,
                type: 'countdown',
                color: '#666', // Neutral color for blank timer
                x: x,
                y: y,
                width: timerWidth,
                height: timerHeight,
                pinned: false,
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
                isApiTimer: false,
                cooldownType: null,
                showEndDate: false  // Default to showing only countdown
            };

            this.timers.push(timer);

            // Save timers immediately after adding
            console.log('💾 Saving timers after adding new timer');
            this.saveTimers();

            // Render the blank timer window
            this.renderTimer(timer);

            console.log('⏰ Timer added successfully, total timers:', this.timers.length);
            return timer;
        },

        // Create cooldown selection interface
        renderCooldownSelector(timer) {
            const contentArea = document.getElementById('sidekick-content');
            if (!contentArea) {
                console.error('⏰ Sidekick content area not found for selector');
                return;
            }

            const cooldownTypes = {
                'drug': { name: 'Drug Cooldown', color: '#9C27B0', duration: 75 },
                'medical': { name: 'Medical Cooldown', color: '#4CAF50', duration: 15 },
                'booster': { name: 'Booster Cooldown', color: '#FF9800', duration: 60 },
                'Bank': { name: 'Bank Investment', color: '#FFD700', duration: 3600 },
                'crime': { name: 'Crime Cooldown', color: '#f44336', duration: 300 },
                'oc': { name: 'Organized Crime', color: '#607D8B', duration: 480 },
                'travel': { name: 'Travel', color: '#2196F3', duration: 30 }
            };

            // Create cooldown selector window
            const selectorElement = document.createElement('div');
            selectorElement.className = 'cooldown-selector';
            selectorElement.dataset.timerId = timer.id;

            // Use content area dimensions for positioning within sidepanel
            const contentWidth = contentArea.clientWidth || 480;
            const contentHeight = contentArea.clientHeight || 500;

            const width = Math.min(300, contentWidth - 40);
            const height = Math.min(400, contentHeight - 60);
            const x = Math.min(Math.max(timer.x || 10, 0), contentWidth - width);
            const y = Math.min(Math.max(timer.y || 10, 0), contentHeight - height);

            selectorElement.style.cssText = `
                position: absolute;
                left: ${x}px;
                top: ${y}px;
                width: ${width}px;
                height: ${height}px;
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                z-index: 1000;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            `;

            selectorElement.innerHTML = `
                <div style="
                    background: linear-gradient(135deg, #2196F3, #1976D2);
                    border-bottom: 1px solid #555;
                    padding: 4px 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    height: 24px;
                    border-radius: 5px 5px 0 0;
                    user-select: none;
                ">
                    <span style="color: #fff; font-weight: 600; font-size: 11px;">Select Cooldown Type</span>
                    <button class="cooldown-close" style="
                        background: #f44336;
                        border: none;
                        color: white;
                        width: 14px;
                        height: 14px;
                        border-radius: 50%;
                        font-size: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        line-height: 1;
                    " title="Close">×</button>
                </div>
                
                <div style="
                    flex: 1;
                    padding: 15px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    overflow-y: auto;
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                ">
                <style>
                    .timer-cooldown-container::-webkit-scrollbar {
                        display: none;
                    }
                </style>
                    ${Object.entries(cooldownTypes).map(([type, info]) => `
                        <button class="cooldown-option" data-type="${type}" style="
                            background: linear-gradient(135deg, ${info.color}, ${this.darkenColor(info.color, 15)});
                            border: 1px solid ${this.darkenColor(info.color, 10)};
                            color: white;
                            padding: 12px;
                            border-radius: 6px;
                            text-align: left;
                            font-size: 12px;
                            font-weight: 600;
                            transition: all 0.2s;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.4)'"
                           onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            <span>${info.name}</span>
                            <span style="font-size: 10px; opacity: 0.8;">${Math.floor(info.duration / 60)}m ${info.duration % 60}s</span>
                        </button>
                    `).join('')}
                    
                    <button class="cooldown-option manual" style="
                        background: linear-gradient(135deg, #666, #555);
                        border: 1px solid #777;
                        color: white;
                        padding: 12px;
                        border-radius: 6px;
                        text-align: center;
                        font-size: 12px;
                        font-weight: 600;
                        transition: all 0.2s;
                        margin-top: 5px;
                    " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.4)'"
                       onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                        📝 Custom Timer
                    </button>
                </div>
            `;

            // Append selector to content area within sidepanel
            contentArea.appendChild(selectorElement);

            // Add event listeners for cooldown selection
            selectorElement.querySelector('.cooldown-close').addEventListener('click', () => {
                // Remove the timer and selector
                this.timers = this.timers.filter(t => t.id !== timer.id);
                this.saveTimers();
                selectorElement.remove();
            });

            selectorElement.querySelectorAll('.cooldown-option').forEach(option => {
                option.addEventListener('click', () => {
                    const type = option.dataset.type;

                    if (type) {
                        // Set up cooldown timer
                        const cooldownInfo = cooldownTypes[type];
                        timer.name = cooldownInfo.name;
                        timer.color = cooldownInfo.color;
                        timer.duration = cooldownInfo.duration;
                        timer.remainingTime = cooldownInfo.duration;
                        timer.cooldownType = type;
                    } else {
                        // Custom timer
                        timer.name = 'Custom Timer';
                        timer.color = '#2196F3';
                        timer.duration = 300; // 5 minutes default
                        timer.remainingTime = 300;
                    }

                    this.saveTimers();
                    selectorElement.remove();
                    this.renderTimer(timer);
                });
            });
        },

        // Render a timer window as a standalone draggable window
        renderTimer(timer) {
            console.log('🔍 renderTimer - Creating standalone timer window for timer:', timer.id);

            // ALWAYS remove any existing element first to prevent duplication
            const existingElement = document.getElementById(`sidekick-timer-${timer.id}`);
            if (existingElement) {
                console.log('🔍 Removing existing timer element before re-rendering:', timer.id);
                existingElement.remove();
            }

            // For new timers that aren't API timers, show cooldown selection
            // DISABLED: Old cooldown selector - now using API dropdown in timer window
            // if (!timer.isApiTimer && timer.name === 'Cooldown Timer' && timer.duration === 60 && !timer.isConfigured) {
            //     this.renderCooldownSelector(timer);
            //     return;
            // }

            // Create movable timer window
            const timerElement = document.createElement('div');
            timerElement.className = 'movable-timer';
            timerElement.id = `sidekick-timer-${timer.id}`;  // Add the missing ID!
            timerElement.dataset.timerId = timer.id;

            // Get content area for positioning within sidepanel
            const contentArea = document.getElementById('sidekick-content');

            // Note: undocked timers are styled after the shared HTML is built below.

            // ── Docked timers live inside sidepanel ──
            if (!contentArea) {
                console.error('⏰ Sidekick content area not found');
                return;
            }

            // Verbose logging commented out
            // console.log(`🔍 Content area found:`, contentArea);
            // console.log(`🔍 Content area parent:`, contentArea.parentNode);
            // console.log(`🔍 Content area children count:`, contentArea.children.length);
            // console.log(`🔍 Content area innerHTML length:`, contentArea.innerHTML.length);

            const contentWidth = contentArea.clientWidth || 480;
            const contentHeight = contentArea.clientHeight || 500;

            // console.log(`🔍 Content dimensions: ${contentWidth}x${contentHeight}`);

            const width = Math.min(Math.max(timer.width || 300, 140), contentWidth - 20);
            const height = Math.min(Math.max(timer.height || 250, 80), contentHeight - 40);
            const x = Math.min(Math.max(timer.x || 10, 0), contentWidth - width);
            const y = Math.min(Math.max(timer.y || 10, 0), contentHeight - height);

            timerElement.style.cssText = `
                position: absolute;
                left: ${x}px;
                top: ${y}px;
                width: ${width}px;
                height: ${height}px;
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                min-width: 140px;
                min-height: 80px;
                z-index: ${this.getNextZIndex()};
                resize: both;
                overflow: auto;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            `;

            timerElement.innerHTML = `
                <div class="timer-header" style="
                    background: linear-gradient(135deg, ${timer.color || '#2196F3'}, ${this.darkenColor(timer.color || '#2196F3', 15)});
                    border-bottom: 1px solid #555;
                    padding: 4px 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                    height: 24px;
                    flex-shrink: 0;
                    border-radius: 5px 5px 0 0;
                    user-select: none;
                ">
                    <span style="
                        color: #fff;
                        font-weight: 600;
                        font-size: 11px;
                        flex: 1;
                        min-width: 0;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">${this.escapeHtml(timer.name)}</span>
                    
                    <div style="display: flex; align-items: center; gap: 3px;">
                        <div class="timer-dropdown" style="position: relative;">
                            <button class="dropdown-btn" style="
                                background: none;
                                border: none;
                                color: rgba(255,255,255,0.8);
                                font-size: 10px;
                                padding: 1px 3px;
                                border-radius: 2px;
                                min-width: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            " title="Cooldowns">⚙️</button>
                            <div class="dropdown-content timer-dropdown-content" style="
                                display: none;
                                position: fixed;
                                background: #333;
                                width: 160px;
                                box-shadow: 0px 8px 16px rgba(0,0,0,0.3);
                                z-index: 99999;
                                border-radius: 4px;
                                border: 1px solid #555;
                                padding: 4px 0;
                                overflow-y: auto;
                                max-height: 260px;
                            ">
                                <button class="cooldown-option" data-type="drug" style="
                                    background: none;
                                    border: none;
                                    color: #fff;
                                    padding: 6px 12px;
                                    width: 100%;
                                    text-align: left;
                                    font-size: 11px;
                                    transition: background 0.2s;
                                ">Drug</button>
                                <button class="cooldown-option" data-type="medical" style="
                                    background: none;
                                    border: none;
                                    color: #fff;
                                    padding: 6px 12px;
                                    width: 100%;
                                    text-align: left;
                                    font-size: 11px;
                                    transition: background 0.2s;
                                ">Medical</button>
                                <button class="cooldown-option" data-type="booster" style="
                                    background: none;
                                    border: none;
                                    color: #fff;
                                    padding: 6px 12px;
                                    width: 100%;
                                    text-align: left;
                                    font-size: 11px;
                                    transition: background 0.2s;
                                ">Booster</button>
                                <button class="cooldown-option" data-type="Bank" style="
                                    background: none;
                                    border: none;
                                    color: #fff;
                                    padding: 6px 12px;
                                    width: 100%;
                                    text-align: left;
                                    font-size: 11px;
                                    transition: background 0.2s;
                                ">Bank Investment</button>
                                <button class="cooldown-option" data-type="Virus" style="
                                    background: none;
                                    border: none;
                                    color: #fff;
                                    padding: 6px 12px;
                                    width: 100%;
                                    text-align: left;
                                    font-size: 11px;
                                    transition: background 0.2s;
                                ">Virus Coding</button>
                                <div style="border-top: 1px solid #555; margin: 4px 0;"></div>
                                <button class="custom-timer-option" style="
                                    background: none;
                                    border: none;
                                    color: #FFD700;
                                    padding: 6px 12px;
                                    width: 100%;
                                    text-align: left;
                                    font-size: 11px;
                                    transition: background 0.2s;
                                    font-weight: bold;
                                ">⏱️ Custom Timer</button>
                                <div style="border-top: 1px solid #555; margin: 4px 0;"></div>
                                <button class="timer-color-option" style="
                                    background: none;
                                    border: none;
                                    color: #fff;
                                    padding: 6px 12px;
                                    width: 100%;
                                    text-align: left;
                                    font-size: 11px;
                                    transition: background 0.2s;
                                ">🎨 Change Color</button>
                                <button class="timer-pin-option" style="
                                    background: none;
                                    border: none;
                                    color: #fff;
                                    padding: 6px 12px;
                                    width: 100%;
                                    text-align: left;
                                    font-size: 11px;
                                    transition: background 0.2s;
                                ">${timer.pinned ? '📌 Unpin' : '📌 Pin'}</button>
                                <div style="border-top: 1px solid #555; margin: 4px 0;"></div>
                                <button class="timer-undock-option" style="
                                    background: none;
                                    border: none;
                                    color: #7ec8e3;
                                    padding: 6px 12px;
                                    width: 100%;
                                    text-align: left;
                                    font-size: 11px;
                                    transition: background 0.2s;
                                    font-weight: bold;
                                ">${timer.docked === false ? '🔒 Dock to Panel' : '🔓 Release to Page'}</button>
                            </div>
                        </div>
                        
                        <button class="timer-close" style="
                            background: #f44336;
                            border: none;
                            color: white;
                            width: 14px;
                            height: 14px;
                            border-radius: 50%;
                            font-size: 8px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            line-height: 1;
                        " title="Close">×</button>
                    </div>
                </div>
                
                <div class="timer-content" style="
                    flex: 1;
                    padding: 12px 12px 12px 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    overflow-y: auto;
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                    align-items: center;
                    justify-content: flex-start;
                    color: #999;
                    font-size: 14px;
                    text-align: center;
                ">
                <style>
                    .timer-content::-webkit-scrollbar {
                        display: none;
                    }
                </style>
                    ${(function () {
                    console.log(`🔍 renderTimer - timer.remainingTime: ${timer.remainingTime}, name: ${timer.name}`);

                    if (timer.cooldowns && Object.keys(timer.cooldowns).length > 1) {
                        // Multi-cooldown display
                        const cooldownNames = {
                            'drug': 'Drug',
                            'medical': 'Medical',
                            'booster': 'Booster'
                        };

                        return Object.entries(timer.cooldowns).map(([type, time]) => `
                                <div style="
                                    background: rgba(255,255,255,0.1);
                                    border-radius: 6px;
                                    padding: 8px;
                                    margin: 4px 0;
                                    width: 90%;
                                    display: flex;
                                    justify-content: space-between;
                                    align-items: center;
                                    position: relative;
                                ">
                                    <span style="
                                        color: #ccc;
                                        font-size: 11px;
                                        font-weight: 600;
                                    ">${cooldownNames[type] || type}</span>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="
                                            color: ${this.getCooldownColor(type)};
                                            font-family: 'Courier New', monospace;
                                            font-weight: 700;
                                            font-size: 12px;
                                        ">${this.formatTime(time)}</span>
                                        <button class="remove-cooldown-btn" data-cooldown-type="${type}" style="
                                            background: #e74c3c;
                                            border: none;
                                            color: white;
                                            width: 16px;
                                            height: 16px;
                                            border-radius: 50%;
                                            font-size: 10px;
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            line-height: 1;
                                            opacity: 0.7;
                                            transition: opacity 0.2s;
                                        " title="Remove ${cooldownNames[type] || type} cooldown">×</button>
                                    </div>
                                </div>
                            `).join('');
                    } else if (timer.remainingTime > 0) {
                        // Single cooldown display
                        // Calculate end time from remaining time if not explicitly set
                        const endTimeData = timer.remainingTime > 0 ? this.getEndTime(timer.remainingTime) : null;
                        return `
                                <div class="timer-display" data-timer-id="${timer.id}" style="
                                    text-align: center;
                                    font-size: 18px;
                                    font-weight: 700;
                                    color: ${timer.color || '#666'};
                                    font-family: 'Courier New', monospace;
                                    ">${this.formatTime(timer.remainingTime)}</div>
                                ${endTimeData ? `
                                <div style="
                                    text-align: center;
                                    color: #aaa;
                                    font-size: 11px;
                                    margin-top: 4px;
                                    font-family: 'Courier New', monospace;
                                ">Ends at: ${endTimeData.time}</div>
                                <div style="
                                    text-align: center;
                                    color: #999;
                                    font-size: 10px;
                                    margin-top: 2px;
                                ">${endTimeData.date}</div>
                                ` : ''}
                            `;
                    } else {
                        // Empty timer
                        return `
                                <div class="timer-display" style="
                                    text-align: center;
                                    font-size: 24px;
                                    font-weight: 700;
                                    color: ${timer.color || '#666'};
                                    font-family: 'Courier New', monospace;
                                "></div>
                            `;
                    }
                }).call(this)}
                </div>
            `;

            // Append to content area within sidepanel
            console.log(`🔍 About to append timer element:`, timerElement);
            console.log(`🔍 Timer element ID:`, timerElement.id);
            console.log(`🔍 Timer element className:`, timerElement.className);

            try {
                contentArea.appendChild(timerElement);

                // Register window for click-to-front behavior
                if (window.SidekickModules?.Core?.WindowManager) {
                    window.SidekickModules.Core.WindowManager.registerWindow(timerElement, 'Timer');
                }

                console.log(`🔍 appendChild() completed without error`);
            } catch (error) {
                console.error(`🚨 appendChild() failed with error:`, error);
                return;
            }

            console.log(`🔍 Timer element appended to sidepanel content area with ID: sidekick-timer-${timer.id}`);

            // Simple verification that the element was properly added
            const verifyElement = document.getElementById(`sidekick-timer-${timer.id}`);
            if (verifyElement) {
                console.log(`✅ Timer ${timer.id} successfully rendered and verified`);

                // Pinned timers have no special visual styling
                // They simply cannot be moved or resized
            } else {
                console.error(`� Timer ${timer.id} failed to render properly`);
                return;
            }

            this.setupTimerEventListeners(timer, timerElement);

            // ── If undocked: restyle as fixed, move to body, make draggable ──
            if (timer.docked === false) {
                const screenW = window.innerWidth;
                const screenH = window.innerHeight;
                const width  = parseInt(timerElement.style.width)  || timer.width  || 220;
                const height = parseInt(timerElement.style.height) || timer.height || 150;
                const x = Math.min(Math.max(timer.undockX ?? 40, 0), screenW - width);
                const y = Math.min(Math.max(timer.undockY ?? 40, 0), screenH - height);

                // Move from sidepanel content area to document.body
                document.body.appendChild(timerElement);

                timerElement.style.cssText = `
                    position: fixed !important;
                    left: ${x}px;
                    top: ${y}px;
                    width: ${width}px;
                    height: ${height}px;
                    background: #2a2a2a;
                    border: 2px solid #7ec8e3;
                    border-radius: 6px;
                    display: flex;
                    flex-direction: column;
                    min-width: 140px;
                    min-height: 80px;
                    z-index: 2147483630;
                    resize: both;
                    overflow: auto;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                `;

                this.makeDraggableFixed(timerElement, timer);
                this.addResizeObserverFixed(timerElement, timer);
                console.log('✅ Undocked timer rendered on page:', timer.name);
            }

            console.log('⏰ Timer rendered:', timer.name);
        },

        // Make a position:fixed element draggable, saving position to storage on drop
        makeDraggableFixed(el, timer) {
            const header = el.querySelector('.timer-header');
            if (!header) return;

            let startX, startY, startLeft, startTop;

            const onMouseMove = (e) => {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                const newLeft = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  startLeft + dx));
                const newTop  = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, startTop  + dy));
                el.style.left = newLeft + 'px';
                el.style.top  = newTop  + 'px';
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                // Persist position
                timer.undockX = parseInt(el.style.left);
                timer.undockY = parseInt(el.style.top);
                this.saveTimers();
            };

            header.addEventListener('mousedown', (e) => {
                // Only drag on left-click on the header itself (not buttons inside)
                if (e.button !== 0 || e.target.tagName === 'BUTTON') return;
                e.preventDefault();
                startX    = e.clientX;
                startY    = e.clientY;
                startLeft = parseInt(el.style.left) || 0;
                startTop  = parseInt(el.style.top)  || 0;
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        },

        // ResizeObserver for undocked (fixed) timers
        addResizeObserverFixed(el, timer) {
            if (!window.ResizeObserver) return;
            const ro = new ResizeObserver(() => {
                timer.width  = el.offsetWidth;
                timer.height = el.offsetHeight;
                this.saveTimers();
            });
            ro.observe(el);
        },


        // Set up timer event listeners
        setupTimerEventListeners(timer, element) {
            const self = this; // Preserve context

            // Dropdown toggle
            const dropdownBtn = element.querySelector('.dropdown-btn');
            const dropdownContent = element.querySelector('.dropdown-content');

            if (dropdownBtn && dropdownContent) {
                console.log('🔍 Setting up dropdown for timer:', timer.id);

                // Portal the dropdown to document.body to escape timer window's stacking context
                dropdownContent.style.position = 'fixed';
                dropdownContent.style.zIndex = '2147483647';
                dropdownContent.style.display = 'none';
                document.body.appendChild(dropdownContent);

                dropdownBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    console.log('🔍 Dropdown button clicked');

                    // Close all other timer dropdowns first
                    document.querySelectorAll('.timer-dropdown-content').forEach(dd => {
                        if (dd !== dropdownContent) dd.style.display = 'none';
                    });

                    // Toggle this dropdown
                    const isVisible = dropdownContent.style.display === 'block';
                    dropdownContent.style.display = isVisible ? 'none' : 'block';

                    if (!isVisible) {
                        const btnRect = dropdownBtn.getBoundingClientRect();
                        const ddWidth = dropdownContent.offsetWidth || 160;
                        const ddHeight = dropdownContent.offsetHeight || 300;
                        let left = btnRect.right - ddWidth;
                        let top = btnRect.bottom + 2;

                        // Clamp to viewport
                        if (left < 4) left = 4;
                        if (left + ddWidth > window.innerWidth - 4) left = window.innerWidth - ddWidth - 4;
                        if (top + ddHeight > window.innerHeight - 4) top = btnRect.top - ddHeight - 2;

                        dropdownContent.style.left = left + 'px';
                        dropdownContent.style.top = top + 'px';
                    }
                });

                // Close when clicking outside (also allow clicks inside the portalled dropdown)
                document.addEventListener('click', function (e) {
                    if (!element.contains(e.target) && !dropdownContent.contains(e.target)) {
                        dropdownContent.style.display = 'none';
                    }
                });

                // Handle cooldown option clicks
                // Note: query dropdownContent, not element — it was portalled to document.body
                const cooldownOptions = dropdownContent.querySelectorAll('.cooldown-option');
                console.log(`🔍 Found ${cooldownOptions.length} cooldown options`);

                cooldownOptions.forEach((option, index) => {
                    const cooldownType = option.dataset.type;
                    console.log(`🔍 Setting up option ${index}:`, option.textContent, 'data-type:', cooldownType);

                    option.addEventListener('mouseenter', function () {
                        option.style.background = 'rgba(255,255,255,0.1)';
                    });
                    option.addEventListener('mouseleave', function () {
                        option.style.background = 'none';
                    });
                    option.addEventListener('click', async function (e) {
                        e.preventDefault();
                        e.stopPropagation();

                        console.log(`🔍 Cooldown option clicked: ${cooldownType}`);

                        if (cooldownType) {
                            // Close dropdown immediately
                            dropdownContent.style.display = 'none';

                            try {
                                // Special handling for Virus option
                                if (cooldownType === 'Virus') {
                                    console.log('🦠 Virus option selected - enabling virus tracking');
                                    // Enable virus tracking
                                    localStorage.setItem('sidekick_virus_tracking_enabled', 'true');

                                    // Check virus status and add to THIS timer
                                    if (!self.apiKey) {
                                        console.error('❌ No API key configured');
                                        alert('Please configure your API key first!');
                                        return;
                                    }

                                    const response = await fetch(`https://api.torn.com/v2/user/virus`, {
                                        headers: {
                                            'accept': 'application/json',
                                            'Authorization': `ApiKey ${self.apiKey}`
                                        }
                                    });

                                    const data = await response.json();
                                    console.log('🦠 Virus API response:', data);

                                    if (data.virus && data.virus.until) {
                                        const virusName = data.virus.item?.name || 'Virus';
                                        const endTime = data.virus.until * 1000;
                                        const remainingSeconds = Math.max(0, Math.floor((endTime - Date.now()) / 1000));

                                        // Add virus as a cooldown to THIS timer
                                        if (!timer.cooldowns) {
                                            timer.cooldowns = {};
                                        }
                                        timer.cooldowns['Virus'] = remainingSeconds;
                                        timer.type = 'countdown';
                                        timer.isRunning = true;

                                        // Set timer name and color
                                        timer.name = 'Virus Timer';
                                        timer.color = self.getCooldownColor('Virus');

                                        console.log(`🦠 Added virus cooldown: ${virusName}, ${remainingSeconds}s`);

                                        self.saveTimers();
                                        self.updateTimerDisplay(timer.id);
                                        self.startTimer(timer.id);
                                    } else {
                                        console.log('🦠 No active virus coding detected');
                                        alert('No active virus coding detected. Start coding a virus in Torn first!');
                                    }
                                } else {
                                    // Call the cooldown check with proper context
                                    await self.checkSpecificCooldown(timer, cooldownType);

                                    // Show visual feedback that timer was started
                                    const timerWindow = document.getElementById(`sidekick-timer-${timer.id}`);
                                    if (timerWindow) {
                                        const timerDisplay = timerWindow.querySelector('.timer-display');
                                        if (timerDisplay) {
                                            timerDisplay.style.backgroundColor = '#2ecc71';
                                            setTimeout(() => {
                                                timerDisplay.style.backgroundColor = '#34495e';
                                            }, 1000);
                                        }
                                    }
                                }
                            } catch (error) {
                                console.error('❌ Error in checkSpecificCooldown:', error);
                            }
                        }
                    });
                });

                // Handle timer pin option click
                const pinOption = dropdownContent.querySelector('.timer-pin-option');
                if (pinOption) {
                    pinOption.addEventListener('mouseenter', function () {
                        pinOption.style.background = 'rgba(255,255,255,0.1)';
                    });
                    pinOption.addEventListener('mouseleave', function () {
                        pinOption.style.background = 'none';
                    });
                    pinOption.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();

                        console.log(`🔍 Timer pin clicked for timer: ${timer.id}`);

                        // Toggle pinned state
                        timer.pinned = !timer.pinned;

                        // Update button text
                        pinOption.textContent = timer.pinned ? '📌 Unpin' : '📌 Pin';

                        // No visual changes - pinned timers look the same
                        // They simply cannot be moved or resized

                        // Close dropdown
                        dropdownContent.style.display = 'none';

                        // Save timer state
                        self.saveTimers();

                        console.log(`⏰ Timer ${timer.pinned ? 'pinned' : 'unpinned'}`);
                    });
                }

                // Handle custom timer option click
                const customOption = dropdownContent.querySelector('.custom-timer-option');
                if (customOption) {
                    customOption.addEventListener('mouseenter', function () {
                        customOption.style.background = 'rgba(255,215,0,0.1)';
                    });
                    customOption.addEventListener('mouseleave', function () {
                        customOption.style.background = 'none';
                    });
                    customOption.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();

                        // Close dropdown
                        dropdownContent.style.display = 'none';

                        // Show custom timer dialog
                        self.showCustomTimerDialog(timer);
                    });
                }

                // Handle timer color option click
                const colorOption = dropdownContent.querySelector('.timer-color-option');
                if (colorOption) {
                    colorOption.addEventListener('mouseenter', function () {
                        colorOption.style.background = 'rgba(255,255,255,0.1)';
                    });
                    colorOption.addEventListener('mouseleave', function () {
                        colorOption.style.background = 'none';
                    });
                    colorOption.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();

                        console.log(`🎨 Timer color option clicked for timer: ${timer.id}`);

                        // Close dropdown
                        dropdownContent.style.display = 'none';

                        // Show color picker
                        if (window.SidekickModules?.Core?.ColorPicker) {
                            window.SidekickModules.Core.ColorPicker.show(timer.color || '#2196F3', (selectedColor) => {
                                timer.color = selectedColor;
                                const header = element.querySelector('.timer-header');
                                if (header) {
                                    header.style.background = `linear-gradient(135deg, ${selectedColor}, ${self.darkenColor(selectedColor, 15)})`;
                                }
                                self.saveTimers();
                            });
                        }
                    });
                }

                // Handle undock / re-dock option
                const undockOption = dropdownContent.querySelector('.timer-undock-option');
                if (undockOption) {
                    undockOption.addEventListener('mouseenter', function () {
                        undockOption.style.background = 'rgba(126,200,227,0.15)';
                    });
                    undockOption.addEventListener('mouseleave', function () {
                        undockOption.style.background = 'none';
                    });
                    undockOption.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        dropdownContent.style.display = 'none';

                        if (timer.docked === false) {
                            // Dock back into sidepanel
                            timer.docked = true;
                            timer.undockX = undefined;
                            timer.undockY = undefined;
                            self.saveTimers();
                            const el = document.getElementById(`sidekick-timer-${timer.id}`);
                            if (el) el.remove();
                            self.renderTimer(timer);
                            console.log(`🔒 Timer docked back to panel: ${timer.name}`);
                        } else {
                            // Undock onto page
                            const rect = element.getBoundingClientRect();
                            timer.docked = false;
                            timer.undockX = Math.max(rect.left, 10);
                            timer.undockY = Math.max(rect.top, 10);
                            self.saveTimers();
                            const el = document.getElementById(`sidekick-timer-${timer.id}`);
                            if (el) el.remove();
                            self.renderTimer(timer);
                            console.log(`🔓 Timer released to page: ${timer.name}`);
                        }
                    });
                }
            } else {
                console.warn('❌ Dropdown elements not found:', {
                    dropdownBtn: !!dropdownBtn,
                    dropdownContent: !!dropdownContent
                });
            }

            // Close button (with stronger confirmation for safety)
            const closeBtn = element.querySelector('.timer-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Simple confirmation for timer deletion
                    const timerName = timer.name || 'Timer';
                    if (confirm(`Delete "${timerName}" timer?`)) {
                        this.deleteTimer(timer.id);
                    }
                });
            }

            // Individual cooldown removal buttons
            const removeCooldownBtns = element.querySelectorAll('.remove-cooldown-btn');
            removeCooldownBtns.forEach(btn => {
                const cooldownType = btn.dataset.cooldownType;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    // Prevent rapid clicking/spam
                    if (btn.disabled) return;
                    btn.disabled = true;
                    btn.style.opacity = '0.3';

                    this.removeCooldown(timer.id, cooldownType);

                    // Re-enable after delay
                    setTimeout(() => {
                        if (btn && btn.parentNode) {
                            btn.disabled = false;
                            btn.style.opacity = '0.7';
                        }
                    }, 1000);
                });

                // Hover effects
                btn.addEventListener('mouseenter', () => {
                    if (!btn.disabled) {
                        btn.style.opacity = '1';
                    }
                });
                btn.addEventListener('mouseleave', () => {
                    if (!btn.disabled) {
                        btn.style.opacity = '0.7';
                    }
                });
            });

            // Duration input
            const durationInput = element.querySelector('.duration-input');
            if (durationInput) {
                durationInput.addEventListener('change', (e) => {
                    const minutes = parseInt(e.target.value) || 0;
                    timer.duration = minutes * 60;
                    if (!timer.isRunning) {
                        timer.remainingTime = timer.duration;
                        this.updateTimerDisplay(timer.id);
                    }
                    this.saveTimers();
                });
            }

            // Make draggable
            this.makeDraggable(element, timer);

            // Add resize observer to save size changes
            this.addResizeObserver(element, timer);

            // Add click handler to timer display to toggle end date
            const timerDisplay = element.querySelector('.timer-display');
            if (timerDisplay) {
                timerDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Toggle showEndDate flag
                    timer.showEndDate = !timer.showEndDate;
                    console.log(`🔄 Toggled end date display for timer ${timer.id}: ${timer.showEndDate}`);
                    // Save and update display
                    this.saveTimers();
                    this.updateTimerDisplay(timer.id);
                });
            }
        },

        // Start/Resume timer
        startTimer(id) {
            const timer = this.timers.find(t => t.id === id);
            if (!timer) return;

            timer.isRunning = true;
            timer.modified = new Date().toISOString();
            timer.lastUpdated = new Date().toISOString();
            // Store absolute end time for drift-free synchronization
            if (timer.type === 'countdown') {
                const secsRemaining = timer.cooldowns
                    ? Math.max(...Object.values(timer.cooldowns))
                    : (timer.remainingTime || 0);
                timer.endTime = Date.now() + secsRemaining * 1000;
            }

            // Clear existing interval
            if (this.intervals.has(id)) {
                clearInterval(this.intervals.get(id));
            }

            // Start new interval
            const interval = setInterval(() => {
                // Update last updated time
                timer.lastUpdated = new Date().toISOString();

                if (timer.type === 'countdown') {
                    if (timer.cooldowns) {
                        // Update multiple cooldowns
                        let allExpired = true;
                        for (let cooldownType in timer.cooldowns) {
                            timer.cooldowns[cooldownType] = Math.max(0, timer.cooldowns[cooldownType] - 1);
                            if (timer.cooldowns[cooldownType] > 0) {
                                allExpired = false;
                            }
                        }

                        // Update main timer remaining time to the longest cooldown
                        timer.remainingTime = Math.max(...Object.values(timer.cooldowns));

                        if (allExpired) {
                            timer.isRunning = false;
                            clearInterval(interval);
                            this.intervals.delete(id);
                            // All cooldowns finished notification
                            if (window.SidekickModules?.Core?.NotificationSystem) {
                                window.SidekickModules.Core.NotificationSystem.show(
                                    'Cooldowns Finished',
                                    'All cooldowns have finished!',
                                    'success',
                                    5000
                                );
                            }
                            // Auto-rearm: poll API so the timer restarts when user takes a drug
                            if (timer.isApiTimer && this.apiKey) {
                                this.scheduleAutoRearm(timer);
                            }
                        }
                    } else {
                        // Single timer countdown
                        timer.remainingTime = Math.max(0, timer.remainingTime - 1);
                        if (timer.remainingTime === 0) {
                            timer.isRunning = false;
                            clearInterval(interval);
                            this.intervals.delete(id);
                            // Timer finished notification
                            if (window.SidekickModules?.Core?.NotificationSystem) {
                                window.SidekickModules.Core.NotificationSystem.show(
                                    'Timer Finished',
                                    `${timer.name} has finished!`,
                                    'success',
                                    5000
                                );
                            }
                        }
                    }
                } else {
                    timer.remainingTime++;
                }
                this.updateTimerDisplay(id);
            }, 1000);

            this.intervals.set(id, interval);
            this.updateTimerDisplay(id);
            this.saveTimers();
        },

        // Pause timer
        // Update timer display
        updateTimerDisplay(id) {
            const timer = this.timers.find(t => t.id === id);
            const element = document.getElementById(`sidekick-timer-${timer.id}`);

            // Verbose logging commented out to reduce console spam
            // console.log(`🔍 updateTimerDisplay - Timer:`, timer?.name, 'remainingTime:', timer?.remainingTime);
            // console.log(`🔍 updateTimerDisplay - Looking for ID: sidekick-timer-${timer.id}`);
            // console.log(`🔍 updateTimerDisplay - Element found:`, !!element);

            // Debug: Log all existing timer elements
            // const allTimerElements = document.querySelectorAll('[id^="sidekick-timer-"]');
            // console.log(`🔍 All timer elements in DOM:`, Array.from(allTimerElements).map(el => el.id));

            if (!timer || !element) {
                console.error(`🔍 Cannot update - timer exists: ${!!timer}, element exists: ${!!element}`);
                return;
            }

            // Update header color and name
            const header = element.querySelector('.timer-header');
            if (header) {
                header.style.background = `linear-gradient(135deg, ${timer.color}, ${this.darkenColor(timer.color, 15)})`;
                const nameSpan = header.querySelector('span');
                if (nameSpan) {
                    nameSpan.textContent = timer.name;
                    // console.log(`🔍 Updated timer name to: ${timer.name}`);
                }
            }

            // Update display content based on timer type
            const contentArea = element.querySelector('.timer-content');
            if (contentArea) {
                // Check if rebuild is needed (prevents expansion bug)
                const needsRebuild = this.checkIfRebuildNeeded(contentArea, timer);

                if (!needsRebuild) {
                    // Just update time displays without recreating elements
                    this.updateTimeDisplaysOnly(contentArea, timer);
                    return;
                }

                // Clear and rebuild content - CLEAR ALL CHILDREN TO PREVENT DUPLICATES
                contentArea.innerHTML = '';

                // Add new content based on timer type
                if (timer.cooldowns && Object.keys(timer.cooldowns).length === 0) {
                    // Empty cooldown timer - show "No active cooldowns"
                    const emptyDiv = document.createElement('div');
                    emptyDiv.style.cssText = `
                        color: #888;
                        font-size: 12px;
                        text-align: center;
                        padding: 20px;
                        font-style: italic;
                    `;
                    emptyDiv.textContent = 'No active cooldowns';
                    contentArea.appendChild(emptyDiv);
                } else if (timer.cooldowns && Object.keys(timer.cooldowns).length === 1) {
                    // Single cooldown display - larger, centered
                    const [type, time] = Object.entries(timer.cooldowns)[0];
                    const endTimeData = this.getEndTime(time);

                    const singleCooldownDiv = document.createElement('div');
                    singleCooldownDiv.style.cssText = `
                        text-align: center;
                        padding: 10px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 4px;
                    `;

                    // Countdown display with click cursor
                    const countdownDiv = document.createElement('div');
                    countdownDiv.className = 'timer-countdown-display';
                    countdownDiv.style.cssText = `
                        color: ${this.getCooldownColor(type)};
                        font-family: 'Courier New', monospace;
                        font-weight: 700;
                        font-size: 24px;
                        cursor: pointer;
                        user-select: none;
                    `;
                    countdownDiv.textContent = this.formatTime(time);
                    countdownDiv.title = 'Click to toggle end date display';

                    // Attach click handler directly to countdown
                    countdownDiv.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log(`🔄 Single cooldown clicked for timer ${timer.id}`);
                        timer.showEndDate = !timer.showEndDate;
                        console.log(`🔄 Toggled to: ${timer.showEndDate}`);
                        this.saveTimers();
                        this.updateTimerDisplay(timer.id);
                    });

                    singleCooldownDiv.appendChild(countdownDiv);

                    // End date display (conditional)
                    if (timer.showEndDate) {
                        const endDateContainer = document.createElement('div');
                        endDateContainer.className = 'timer-end-date-container';
                        endDateContainer.innerHTML = `
                            <div style="
                                color: #888;
                                font-size: 11px;
                                font-family: 'Courier New', monospace;
                                margin-top: 2px;
                            ">Ends at: ${endTimeData.time}</div>
                            <div style="
                                color: #666;
                                font-size: 10px;
                            ">${endTimeData.date}</div>
                        `;
                        singleCooldownDiv.appendChild(endDateContainer);
                    }

                    contentArea.appendChild(singleCooldownDiv);
                } else if (timer.cooldowns && Object.keys(timer.cooldowns).length > 1) {
                    // Multi-cooldown display
                    const cooldownNames = {
                        'drug': 'Drug',
                        'medical': 'Medical',
                        'booster': 'Booster'
                    };

                    Object.entries(timer.cooldowns).forEach(([type, time]) => {
                        const endTimeData = this.getEndTime(time);
                        const cooldownDiv = document.createElement('div');
                        cooldownDiv.style.cssText = `
                            background: rgba(255,255,255,0.1);
                            border-radius: 6px;
                            padding: 5px 8px 6px 8px;
                            margin: 2px 0;
                            width: 90%;
                            min-height: ${timer.showEndDate ? '60px' : '45px'};
                            display: flex;
                            flex-direction: column;
                            position: relative;
                            cursor: pointer;
                            user-select: none;
                        `;

                        // Build HTML conditionally
                        let cooldownHTML = `
                            <div style="
                                display: flex;
                                justify-content: space-between;
                                align-items: flex-start;
                                margin-bottom: 5px;
                            ">
                                <span style="
                                    color: #ccc;
                                    font-size: 14px;
                                    font-weight: 600;
                                ">${cooldownNames[type] || type}</span>
                                <button class="remove-cooldown-btn" data-cooldown-type="${type}" style="
                                    background: rgba(0,0,0,0.4);
                                    border: none;
                                    color: #ccc;
                                    width: 12px;
                                    height: 12px;
                                    border-radius: 3px;
                                    font-size: 9px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    line-height: 1;
                                    opacity: 0.6;
                                    transition: all 0.2s;
                                    padding: 0;
                                " title="Remove ${cooldownNames[type] || type} cooldown">×</button>
                            </div>
                            <div style="
                                display: flex;
                                flex-direction: column;
                                gap: 2px;
                                padding-left: 4px;
                            ">
                                <span class="timer-countdown-display" style="
                                    color: ${this.getCooldownColor(type)};
                                    font-family: 'Courier New', monospace;
                                    font-weight: 700;
                                    font-size: 15px;
                                    line-height: 1.2;
                                ">${this.formatTime(time)}</span>`;

                        // Conditionally add end date
                        if (timer.showEndDate) {
                            cooldownHTML += `
                                <div class="timer-end-date-container">
                                    <span style="
                                        color: #aaa;
                                        font-size: 11px;
                                        font-family: 'Courier New', monospace;
                                        line-height: 1.3;
                                    ">Ends at: ${endTimeData.time}</span>
                                    <span style="
                                        color: #999;
                                        font-size: 10px;
                                        line-height: 1.3;
                                    ">${endTimeData.date}</span>
                                </div>`;
                        }

                        cooldownHTML += `
                            </div>
                        `;

                        cooldownDiv.innerHTML = cooldownHTML;

                        // Add event listeners for the remove button
                        const removeBtn = cooldownDiv.querySelector('.remove-cooldown-btn');
                        if (removeBtn) {
                            removeBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                e.preventDefault();

                                // Prevent rapid clicking/spam
                                if (removeBtn.disabled) return;
                                removeBtn.disabled = true;
                                removeBtn.style.opacity = '0.3';

                                this.removeCooldown(timer.id, type);

                                // Re-enable after a delay
                                setTimeout(() => {
                                    if (removeBtn && removeBtn.parentNode) {
                                        removeBtn.disabled = false;
                                        removeBtn.style.opacity = '0.7';
                                    }
                                }, 1000);
                            });

                            // Hover effects
                            removeBtn.addEventListener('mouseenter', () => {
                                if (!removeBtn.disabled) {
                                    removeBtn.style.opacity = '1';
                                    removeBtn.style.backgroundColor = 'rgba(0,0,0,0.6)';
                                }
                            });
                            removeBtn.addEventListener('mouseleave', () => {
                                if (!removeBtn.disabled) {
                                    removeBtn.style.opacity = '0.6';
                                    removeBtn.style.backgroundColor = 'rgba(0,0,0,0.4)';
                                }
                            });
                        }

                        // Add click handler to countdown display
                        const countdownSpan = cooldownDiv.querySelector('.timer-countdown-display');
                        if (countdownSpan) {
                            // Add user-select: none and cursor
                            countdownSpan.style.cursor = 'pointer';
                            countdownSpan.style.userSelect = 'none';

                            countdownSpan.addEventListener('click', (e) => {
                                // Don't toggle if clicking remove button
                                if (e.target.closest('.remove-cooldown-btn')) return;

                                e.stopPropagation();
                                e.preventDefault();
                                console.log(`🔄 Multi-cooldown clicked for timer ${timer.id}`);
                                timer.showEndDate = !timer.showEndDate;
                                console.log(`🔄 Toggled to: ${timer.showEndDate}`);
                                this.saveTimers();
                                this.updateTimerDisplay(timer.id);
                            });
                        }

                        contentArea.appendChild(cooldownDiv);
                    });
                } else {
                    // Custom timer display (non-cooldown) - with end date toggle support
                    const endTimeData = this.getEndTime(timer.remainingTime);

                    const customTimerDiv = document.createElement('div');
                    customTimerDiv.style.cssText = `
                        text-align: center;
                        padding: 10px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 4px;
                    `;

                    // Countdown display with click handler
                    const display = document.createElement('div');
                    display.className = 'timer-display';
                    display.style.cssText = `
                        color: ${timer.color || '#666'};
                        font-family: 'Courier New', monospace;
                        font-weight: 700;
                        font-size: 24px;
                        cursor: pointer;
                        user-select: none;
                    `;
                    const timeText = timer.remainingTime > 0 ? this.formatTime(timer.remainingTime) : '00:00:00';
                    display.textContent = timeText;
                    display.title = 'Click to toggle end date display';

                    // Attach click handler for toggle
                    display.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log(`🔄 Custom timer clicked for timer ${timer.id}`);
                        timer.showEndDate = !timer.showEndDate;
                        console.log(`🔄 Toggled to: ${timer.showEndDate}`);
                        this.saveTimers();
                        this.updateTimerDisplay(timer.id);
                    });

                    customTimerDiv.appendChild(display);

                    // End date display (conditional)
                    if (timer.showEndDate) {
                        const endDateContainer = document.createElement('div');
                        endDateContainer.className = 'timer-end-date-container';
                        endDateContainer.innerHTML = `
                            <div style="
                                color: #888;
                                font-size: 11px;
                                font-family: 'Courier New', monospace;
                                margin-top: 2px;
                            ">Ends at: ${endTimeData.time}</div>
                            <div style="
                                color: #666;
                                font-size: 10px;
                            ">${endTimeData.date}</div>
                        `;
                        customTimerDiv.appendChild(endDateContainer);
                    }

                    contentArea.appendChild(customTimerDiv);
                    console.log(`🔍 Updated custom timer display to: ${timeText}`);
                }
            } else {
                console.error(`🔍 Could not find content area for timer ${id}`);
            }
        },

        // Helper method to check if timer display needs rebuilding
        checkIfRebuildNeeded(contentArea, timer) {
            // CRITICAL: Check if showEndDate changed - this requires rebuild
            const endDateContainer = contentArea.querySelector('.timer-end-date-container');
            const hasEndDate = endDateContainer !== null;
            const shouldHaveEndDate = timer.showEndDate === true;

            if (hasEndDate !== shouldHaveEndDate) {
                console.log(`🔄 End date visibility changed (has: ${hasEndDate}, should: ${shouldHaveEndDate}), rebuilding...`);
                return true;
            }

            if (timer.cooldowns && Object.keys(timer.cooldowns).length > 1) {
                // Check if we have the right cooldown elements for multi-cooldown display
                const existingCooldowns = contentArea.querySelectorAll('[data-cooldown-type]');
                const existingTypes = Array.from(existingCooldowns).map(el => el.dataset.cooldownType);
                const currentTypes = Object.keys(timer.cooldowns);

                // Need rebuild if different structure (different types or count)
                if (existingTypes.length !== currentTypes.length) return true;
                if (!existingTypes.every(type => currentTypes.includes(type))) return true;

                // Structure matches, no rebuild needed
                return false;
            } else {
                // Single timer - check if we have the right display type
                const hasMultiDisplay = contentArea.querySelector('[data-cooldown-type]');
                const hasSingleDisplay = contentArea.querySelector('.timer-display');

                // Need rebuild if we have multi-display but need single, or no single display
                return hasMultiDisplay || !hasSingleDisplay;
            }
        },

        // Helper method to update only time displays without rebuilding DOM
        updateTimeDisplaysOnly(contentArea, timer) {
            if (timer.cooldowns && Object.keys(timer.cooldowns).length > 1) {
                // Update multi-cooldown times
                Object.entries(timer.cooldowns).forEach(([type, time]) => {
                    const cooldownEl = contentArea.querySelector(`[data-cooldown-type="${type}"]`);
                    if (cooldownEl) {
                        const timeSpan = cooldownEl.querySelector('[style*="Courier New"]');
                        if (timeSpan) {
                            timeSpan.textContent = this.formatTime(time);
                        }
                    }
                });
            } else {
                // Update single timer display
                const display = contentArea.querySelector('.timer-display');
                if (display) {
                    const timeText = timer.remainingTime > 0 ? this.formatTime(timer.remainingTime) : '00:00:00';
                    display.textContent = timeText;
                }
            }

            // CRITICAL: Re-attach click handlers after updating
            this.attachToggleClickHandlers(contentArea, timer);
        },

        // Attach click handlers to toggle end date display
        attachToggleClickHandlers(contentArea, timer) {
            console.log(`🖱️ Attaching click handlers for timer ${timer.id}`);

            // Remove old listeners first to prevent duplicates
            const oldListener = contentArea._toggleClickHandler;
            if (oldListener) {
                contentArea.removeEventListener('click', oldListener);
                console.log(`🗑️ Removed old listener for timer ${timer.id}`);
            }

            // Create new listener
            const toggleHandler = (e) => {
                console.log(`🖱️ Click detected on contentArea for timer ${timer.id}`, e.target);

                // Check if clicking on clickable countdown element
                const countdown = e.target.closest('.timer-countdown-display');
                console.log(`🔍 Countdown element:`, countdown);

                if (!countdown) {
                    console.log(`❌ Not a countdown element, ignoring`);
                    return;
                }

                // Don't toggle if clicking remove button
                if (e.target.closest('.remove-cooldown-btn')) {
                    console.log(`❌ Clicked remove button, ignoring`);
                    return;
                }

                console.log(`✅ Valid countdown click, toggling!`);
                e.stopPropagation();
                e.preventDefault(); // Prevent text selection
                timer.showEndDate = !timer.showEndDate;
                console.log(`🔄 Toggled end date display for timer ${timer.id}: ${timer.showEndDate}`);
                this.saveTimers();
                this.updateTimerDisplay(timer.id);
            };

            // Store reference and attach
            contentArea._toggleClickHandler = toggleHandler;
            contentArea.addEventListener('click', toggleHandler);
            console.log(`✅ Click handler attached for timer ${timer.id}`);
        },


        // Remove individual cooldown from timer
        removeCooldown(timerId, cooldownType) {
            // Debounce to prevent rapid successive calls
            const debounceKey = `${timerId}-${cooldownType}`;
            if (this.removeDebounce && this.removeDebounce[debounceKey]) {
                console.log(`🚫 Debouncing remove request for ${cooldownType} on timer ${timerId}`);
                return;
            }

            if (!this.removeDebounce) this.removeDebounce = {};
            this.removeDebounce[debounceKey] = true;

            // Clear debounce after short delay
            setTimeout(() => {
                if (this.removeDebounce) {
                    delete this.removeDebounce[debounceKey];
                }
            }, 500);

            console.log(`🗑️ Attempting to remove ${cooldownType} cooldown from timer ${timerId}`);

            const timer = this.timers.find(t => t.id === timerId);
            if (!timer) {
                console.warn(`⚠️ Timer ${timerId} not found`);
                return;
            }

            if (!timer.cooldowns) {
                console.warn(`⚠️ Timer ${timerId} has no cooldowns object`);
                return;
            }

            // Check if the cooldown type exists before trying to remove it
            if (!timer.cooldowns.hasOwnProperty(cooldownType)) {
                console.warn(`⚠️ Cooldown ${cooldownType} not found in timer ${timerId}. Available cooldowns:`, Object.keys(timer.cooldowns));
                return;
            }

            // Remove the specific cooldown
            delete timer.cooldowns[cooldownType];
            console.log(`✅ Removed ${cooldownType} cooldown`);

            const remainingCooldowns = Object.keys(timer.cooldowns);
            console.log(`🔍 Remaining cooldowns: ${remainingCooldowns.join(', ')}`);

            if (remainingCooldowns.length === 0) {
                // No cooldowns left - delete the entire timer
                console.log(`🗑️ No cooldowns remaining, deleting timer ${timerId}`);
                this.deleteTimer(timerId);
                return;
            } else if (remainingCooldowns.length === 1) {
                // Only one cooldown left - convert to single cooldown timer
                const remainingType = remainingCooldowns[0];
                const cooldownNames = {
                    'drug': 'Drug Cooldown',
                    'medical': 'Medical Cooldown',
                    'booster': 'Booster Cooldown'
                };
                timer.name = cooldownNames[remainingType] || 'Cooldown';
                timer.color = this.getCooldownColor(remainingType);
                timer.remainingTime = timer.cooldowns[remainingType];
                timer.duration = timer.cooldowns[remainingType];
                console.log(`🔄 Timer updated to single cooldown: ${timer.name}`);
            } else {
                // Multiple cooldowns remain - keep as multi-cooldown timer
                timer.name = 'Cooldowns';
                timer.color = '#9b59b6';
                timer.remainingTime = Math.max(...Object.values(timer.cooldowns));
                timer.duration = Math.max(...Object.values(timer.cooldowns));
                console.log(`🔄 Timer kept as multi-cooldown: ${remainingCooldowns.length} remaining`);
            }

            // Save and update display
            this.saveTimers();
            this.updateTimerDisplay(timerId);

            // Start API monitoring for this timer if it's API-based
            if (timer.isApiTimer) {
                this.startApiMonitoring(timerId);
            }            // Show notification
            if (window.SidekickModules?.UI?.showNotification) {
                const cooldownNames = {
                    'drug': 'Drug',
                    'medical': 'Medical',
                    'booster': 'Booster'
                };
                window.SidekickModules.UI.showNotification(
                    'INFO',
                    `${cooldownNames[cooldownType] || cooldownType} cooldown removed`
                );
            }
        },

        // Delete timer
        deleteTimer(id) {
            console.log('🚨 TIMER DELETION - ID:', id);
            console.trace('🚨 DELETION CALL STACK:');

            const timer = this.timers.find(t => t.id === id);
            if (!timer) return;

            // Clear interval
            if (this.intervals.has(id)) {
                clearInterval(this.intervals.get(id));
                this.intervals.delete(id);
            }

            // Clean up cooldown window mappings pointing to this timer
            for (const [cooldownType, timerId] of Object.entries(this.cooldownWindowMap)) {
                if (timerId === id) {
                    console.log(`🗑️ Removing ${cooldownType} mapping for deleted timer ${id}`);
                    delete this.cooldownWindowMap[cooldownType];
                }
            }

            // Remove from array
            this.timers = this.timers.filter(t => t.id !== id);

            // Save timers immediately after deletion
            console.log('💾 Saving timers after deletion');
            this.saveTimers();

            // Remove element
            const element = document.querySelector(`[data-timer-id="${id}"]`);
            if (element) {
                element.remove();
            }

            console.log('⏰ Timer deleted:', timer.name, '- Remaining timers:', this.timers.length);
        },

        // Make element draggable
        makeDraggable(element, timer) {
            const header = element.querySelector('.timer-header');
            if (!header) return;

            let isDragging = false;
            let currentX = timer.x || 0;
            let currentY = timer.y || 0;
            let initialX;
            let initialY;
            let xOffset = currentX;
            let yOffset = currentY;

            header.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);

            function dragStart(e) {
                if (e.target.closest('button')) return;

                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;

                if (e.target === header || header.contains(e.target)) {
                    isDragging = true;
                    element.style.cursor = 'grabbing';
                }
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;

                    xOffset = currentX;
                    yOffset = currentY;

                    const contentArea = document.getElementById('sidekick-content');
                    if (contentArea) {
                        const bounds = contentArea.getBoundingClientRect();
                        const elementBounds = element.getBoundingClientRect();

                        currentX = Math.max(0, Math.min(currentX, bounds.width - elementBounds.width));
                        currentY = Math.max(0, Math.min(currentY, bounds.height - elementBounds.height));

                        xOffset = currentX;
                        yOffset = currentY;
                    }

                    element.style.left = currentX + 'px';
                    element.style.top = currentY + 'px';
                }
            }

            function dragEnd(e) {
                if (isDragging) {
                    isDragging = false;
                    element.style.cursor = 'default';

                    // Save position to timer object
                    timer.x = currentX;
                    timer.y = currentY;
                    timer.modified = new Date().toISOString();

                    // Save to storage
                    if (window.SidekickModules?.Timer?.saveTimers) {
                        window.SidekickModules.Timer.saveTimers();
                    }

                    console.log(`⏰ Timer position saved: x=${currentX}, y=${currentY}`);
                }
            }
        },

        // Add resize observer to save size changes
        addResizeObserver(element, timer) {
            const resizeObserver = new ResizeObserver((entries) => {
                for (let entry of entries) {
                    const { width, height } = entry.contentRect;

                    // Update timer object with new size
                    timer.width = Math.max(width, 140);
                    timer.height = Math.max(height, 80);
                    timer.modified = new Date().toISOString();

                    // Debounced save to avoid too frequent saves during resize
                    clearTimeout(timer._resizeTimeout);
                    timer._resizeTimeout = setTimeout(() => {
                        this.saveTimers();
                        console.log(`⏰ Timer size saved: ${timer.width}x${timer.height}`);
                    }, 500);
                }
            });

            resizeObserver.observe(element);

            // Store observer for cleanup
            element._resizeObserver = resizeObserver;

            // Cleanup on element removal
            const originalRemove = element.remove;
            element.remove = function () {
                if (this._resizeObserver) {
                    this._resizeObserver.disconnect();
                    this._resizeObserver = null;
                }
                originalRemove.call(this);
            };
        },

        // Make element draggable with fixed positioning (for undocked timers on the page)
        makeDraggableFixed(element, timer) {
            const header = element.querySelector('.timer-header');
            if (!header) return;

            let isDragging = false;
            let startMouseX, startMouseY, startElemX, startElemY;

            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return;
                isDragging = true;
                startMouseX = e.clientX;
                startMouseY = e.clientY;
                startElemX = parseInt(element.style.left, 10) || 0;
                startElemY = parseInt(element.style.top,  10) || 0;
                element.style.cursor = 'grabbing';
                e.preventDefault();
            });

            const onMove = (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startMouseX;
                const dy = e.clientY - startMouseY;
                const newX = Math.max(0, Math.min(startElemX + dx, window.innerWidth  - element.offsetWidth));
                const newY = Math.max(0, Math.min(startElemY + dy, window.innerHeight - element.offsetHeight));
                element.style.left = newX + 'px';
                element.style.top  = newY + 'px';
            };

            const onUp = () => {
                if (!isDragging) return;
                isDragging = false;
                element.style.cursor = 'default';
                timer.undockX = parseInt(element.style.left, 10) || 0;
                timer.undockY = parseInt(element.style.top,  10) || 0;
                timer.modified = new Date().toISOString();
                this.saveTimers();
                console.log(`📌 Undocked timer position saved: x=${timer.undockX}, y=${timer.undockY}`);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',   onUp);

            // Clean up listeners when element is removed
            const origRemove = element.remove.bind(element);
            element.remove = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',   onUp);
                origRemove();
            };
        },

        // Build the inner HTML string for a timer element (shared between docked & undocked paths)
        _buildTimerInnerHTML(timer) {
            // Reuse the full innerHTML generation from renderTimer by temporarily rendering then extracting
            // Instead, inline the essential structure here.
            const headerGrad = `linear-gradient(135deg, ${timer.color || '#2196F3'}, ${this.darkenColor(timer.color || '#2196F3', 15)})`;
            const timeDisplay = timer.remainingTime > 0 ? this.formatTime(timer.remainingTime) : '';
            return `
                <div class="timer-header" style="
                    background: ${headerGrad};
                    border-bottom: 1px solid #555;
                    padding: 4px 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                    height: 24px;
                    flex-shrink: 0;
                    border-radius: 5px 5px 0 0;
                    user-select: none;
                ">
                    <span style="color:#fff;font-weight:600;font-size:11px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escapeHtml(timer.name)}</span>
                    <div style="display:flex;align-items:center;gap:3px;">
                        <div class="timer-dropdown" style="position:relative;">
                            <button class="dropdown-btn" style="background:none;border:none;color:rgba(255,255,255,0.8);font-size:10px;padding:1px 3px;border-radius:2px;min-width:12px;display:flex;align-items:center;justify-content:center;" title="Options">⚙️</button>
                            <div class="dropdown-content timer-dropdown-content" style="display:none;position:fixed;background:#333;width:160px;box-shadow:0px 8px 16px rgba(0,0,0,0.3);z-index:99999;border-radius:4px;border:1px solid #555;padding:4px 0;overflow-y:auto;max-height:260px;">
                                <button class="cooldown-option" data-type="drug"          style="background:none;border:none;color:#fff;padding:6px 12px;width:100%;text-align:left;font-size:11px;">Drug</button>
                                <button class="cooldown-option" data-type="medical"       style="background:none;border:none;color:#fff;padding:6px 12px;width:100%;text-align:left;font-size:11px;">Medical</button>
                                <button class="cooldown-option" data-type="booster"       style="background:none;border:none;color:#fff;padding:6px 12px;width:100%;text-align:left;font-size:11px;">Booster</button>
                                <button class="cooldown-option" data-type="Bank"          style="background:none;border:none;color:#fff;padding:6px 12px;width:100%;text-align:left;font-size:11px;">Bank Investment</button>
                                <button class="cooldown-option" data-type="Virus"         style="background:none;border:none;color:#fff;padding:6px 12px;width:100%;text-align:left;font-size:11px;">Virus Coding</button>
                                <div style="border-top:1px solid #555;margin:4px 0;"></div>
                                <button class="custom-timer-option" style="background:none;border:none;color:#FFD700;padding:6px 12px;width:100%;text-align:left;font-size:11px;font-weight:bold;">⏱️ Custom Timer</button>
                                <div style="border-top:1px solid #555;margin:4px 0;"></div>
                                <button class="timer-color-option" style="background:none;border:none;color:#fff;padding:6px 12px;width:100%;text-align:left;font-size:11px;">🎨 Change Color</button>
                                <button class="timer-pin-option"   style="background:none;border:none;color:#fff;padding:6px 12px;width:100%;text-align:left;font-size:11px;">${timer.pinned ? '📌 Unpin' : '📌 Pin'}</button>
                                <div style="border-top:1px solid #555;margin:4px 0;"></div>
                                <button class="timer-undock-option" style="background:none;border:none;color:#7ec8e3;padding:6px 12px;width:100%;text-align:left;font-size:11px;font-weight:bold;">🔒 Dock to Panel</button>
                            </div>
                        </div>
                        <button class="timer-close" style="background:#f44336;border:none;color:white;width:14px;height:14px;border-radius:50%;font-size:8px;display:flex;align-items:center;justify-content:center;line-height:1;" title="Close">×</button>
                    </div>
                </div>
                <div class="timer-content" style="flex:1;padding:12px;display:flex;flex-direction:column;gap:8px;overflow-y:auto;scrollbar-width:none;align-items:center;justify-content:flex-start;color:#999;font-size:14px;text-align:center;">
                    <div class="timer-display" data-timer-id="${timer.id}" style="text-align:center;font-size:22px;font-weight:700;color:${timer.color || '#666'};font-family:'Courier New',monospace;">${timeDisplay}</div>
                </div>
            `;
        },


        // Start API monitoring for cooldown timers
        startApiMonitoring(timerId = null) {
            // Get API key
            if (!this.apiKey && window.SidekickModules?.Settings?.getSetting) {
                this.apiKey = window.SidekickModules.Settings.getSetting('apiKey');
            }

            if (!this.apiKey) {
                console.log('⚠️ No API key available for cooldown monitoring');
                return;
            }

            // DISABLED: Automatic API cooldown checking - only check when user manually selects from dropdown
            // Start interval to check API for cooldown updates every 30 seconds
            // if (!this.apiCheckInterval) {
            //     console.log('🔍 Starting API cooldown monitoring...');
            //     this.apiCheckInterval = setInterval(() => {
            //         this.checkApiForCooldowns();
            //     }, 30000); // Check every 30 seconds
            //
            //     // Do immediate check
            //     setTimeout(() => {
            //         this.checkApiForCooldowns();
            //     }, 2000);
            // }

            console.log('ℹ️ Automatic API cooldown monitoring DISABLED - use dropdown to manually add cooldowns');
        },

        // Poll the API every 2 minutes after a drug timer expires;
        // when a new cooldown is detected the timer restarts automatically.
        scheduleAutoRearm(timer) {
            if (!this.apiKey) return;

            // Store the cooldown types we're watching
            const watchTypes = timer.cooldowns ? Object.keys(timer.cooldowns) : ['drug'];
            console.log(`⏰ Auto-rearm scheduled for "${timer.name}" – watching: ${watchTypes.join(', ')}`);

            const pollInterval = setInterval(async () => {
                if (!this.apiKey) { clearInterval(pollInterval); return; }

                // If the timer is already running again, stop polling
                if (timer.isRunning) { clearInterval(pollInterval); return; }

                try {
                    let cooldowns = null;

                    // Prefer background proxy (avoids CORS)
                    if (chrome?.runtime?.sendMessage) {
                        try {
                            const res = await this.makeCooldownApiCallViaBackground(this.apiKey);
                            if (res.success && res.cooldowns) cooldowns = res.cooldowns;
                        } catch (_) { /* fall through */ }
                    }

                    if (!cooldowns) {
                        const res = await fetch(
                            `https://api.torn.com/user/?selections=cooldowns&key=${this.apiKey}`
                        );
                        const data = await res.json();
                        if (data.error) return;
                        cooldowns = data.cooldowns || {};
                    }

                    // Check if any watched cooldown is now active
                    const newCooldowns = {};
                    for (const type of watchTypes) {
                        const secs = cooldowns[type];
                        if (secs && secs > 0) newCooldowns[type] = secs;
                    }

                    if (Object.keys(newCooldowns).length > 0) {
                        clearInterval(pollInterval);
                        console.log(`⏰ Auto-rearm triggered for "${timer.name}":`, newCooldowns);

                        // Rehydrate and restart the timer
                        timer.cooldowns = newCooldowns;
                        timer.remainingTime = Math.max(...Object.values(newCooldowns));
                        timer.duration = timer.remainingTime;
                        timer.isRunning = false; // startTimer will set this
                        this.startTimer(timer.id);
                        this.saveTimers();

                        if (window.SidekickModules?.Core?.NotificationSystem) {
                            window.SidekickModules.Core.NotificationSystem.show(
                                'Cooldown Detected',
                                `${timer.name} restarted automatically!`,
                                'info',
                                5000
                            );
                        }
                    }
                } catch (err) {
                    console.warn('⚠️ Auto-rearm poll failed:', err);
                }
            }, 120_000); // poll every 2 minutes

            // Safety: cancel after 24 hours to avoid zombie intervals
            setTimeout(() => clearInterval(pollInterval), 86_400_000);
        },

        // Check API for new/updated cooldowns
        async checkApiForCooldowns() {
            try {
                if (!this.apiKey) return;

                console.log('🔍 Checking API for cooldown updates...');

                // Try background script approach first (better for CORS issues)
                if (chrome?.runtime?.sendMessage) {
                    try {
                        console.log('📡 Attempting cooldown API call via background script...');
                        const backgroundResult = await this.makeCooldownApiCallViaBackground(this.apiKey);
                        if (backgroundResult.success && backgroundResult.cooldowns) {
                            console.log('✅ Background cooldown API call successful');
                            this.updateTimersFromApiCooldowns(backgroundResult.cooldowns);
                            return;
                        }
                    } catch (bgError) {
                        console.log('⚠️ Background script cooldown API failed, trying direct fetch...');
                    }
                }

                // Fallback to direct fetch with better error handling
                await this.makeDirectCooldownApiCall(this.apiKey);

            } catch (error) {
                console.error('❌ Error checking API for cooldowns:', error);
                this.handleCooldownApiError(error);
            }
        },

        // Make cooldown API call via background script (avoids CORS issues)
        async makeCooldownApiCallViaBackground(apiKey) {
            return new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'fetchTornApi',
                    apiKey: apiKey,
                    selections: ['cooldowns', 'money']
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response && response.success) {
                        resolve({
                            success: response.success,
                            cooldowns: response.cooldowns,
                            money: response.money
                        });
                    } else {
                        reject(new Error('Background script returned unsuccessful response'));
                    }
                });
            });
        },

        // Make direct cooldown API call (fallback method)
        async makeDirectCooldownApiCall(apiKey) {
            const fetchWithTimeout = async (url, timeout = 10000) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                try {
                    const response = await fetch(url, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'Sidekick Chrome Extension Timer'
                        }
                    });
                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    return response;
                } catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            };

            console.log('📊 Making direct cooldown API call...');
            const response = await fetchWithTimeout(`https://api.torn.com/user/?selections=cooldowns,money&key=${apiKey}`);
            const data = await response.json();

            if (data.error) {
                console.error('❌ API Error checking cooldowns:', data.error);

                // Handle specific API errors
                if (data.error.code === 2) {
                    console.error('🔑 Invalid API key for cooldowns - please check settings');
                } else if (data.error.code === 5) {
                    console.error('⏱️ Cooldown API rate limit exceeded - will retry later');
                }

                throw new Error(`API Error ${data.error.code}: ${data.error.error}`);
            }

            if (data.cooldowns || data.money) {
                console.log('✅ Direct cooldown API call successful');
                const cooldowns = data.cooldowns || {};

                // Add bank investment if active
                if (data.money && data.money.city_bank && data.money.city_bank.time_left > 0) {
                    cooldowns.Bank = data.money.city_bank.time_left;
                    console.log(`💰 Bank investment active: ${data.money.city_bank.time_left}s remaining (amount: $${data.money.city_bank.amount.toLocaleString()})`);
                }

                this.updateTimersFromApiCooldowns(cooldowns);
            }
        },

        // Handle API errors with categorization and logging
        handleCooldownApiError(error, errorCode, context = 'cooldown check') {
            console.error(`❌ Error during ${context}:`, error);
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                console.error('CORS/Network issue detected');
            } else if (errorCode === 2) {
                console.error('Invalid API key error');
                this.showTemporaryMessage('Invalid API key. Please check your settings.', 3000);
            } else if (errorCode === 5) {
                console.error('API too many requests error');
                this.showTemporaryMessage('Too many API requests. Please wait a moment.', 3000);
            } else {
                console.error(`API error code: ${errorCode || 'unknown'}`);
            }
        },

        // Handle cooldown API errors consistently
        handleCooldownApiError(error) {
            // Check if it's a network error
            if (error.name === 'AbortError') {
                console.error('🕐 Cooldown API request timed out');
            } else if (error.message.includes('Failed to fetch')) {
                console.error('🌐 Cooldown network error - check internet connection or API permissions');
            } else if (error.message.includes('CORS')) {
                console.error('🚫 Cooldown CORS error - browser blocking request');
            }

            // Could add failure counting here similar to todolist if needed
            console.log('⚠️ Cooldown API check will retry on next interval');
        },

        // Update existing timers and create new ones from API cooldowns
        updateTimersFromApiCooldowns(apiCooldowns) {
            console.log('📊 Processing API cooldowns:', apiCooldowns);

            let hasUpdates = false;
            const now = Date.now();

            // Check each API cooldown
            for (const cooldownType in apiCooldowns) {
                const apiCooldown = apiCooldowns[cooldownType];
                if (apiCooldown <= 0) continue; // Skip expired cooldowns

                console.log(`🔍 Processing ${cooldownType} cooldown: ${apiCooldown}s`);

                // Find existing timer with this cooldown
                let existingTimer = this.timers.find(timer =>
                    timer.isApiTimer &&
                    timer.cooldowns &&
                    timer.cooldowns[cooldownType]
                );

                if (existingTimer) {
                    // Update existing timer
                    const currentTime = existingTimer.cooldowns[cooldownType];
                    const apiTime = apiCooldown;

                    // Only update if API time is significantly different (more than 5 seconds)
                    if (Math.abs(currentTime - apiTime) > 5) {
                        console.log(`⏰ Updating ${cooldownType}: ${currentTime}s → ${apiTime}s`);
                        existingTimer.cooldowns[cooldownType] = apiTime;
                        existingTimer.remainingTime = Math.max(...Object.values(existingTimer.cooldowns));
                        existingTimer.lastUpdated = new Date().toISOString();
                        this.updateTimerDisplay(existingTimer.id);
                        hasUpdates = true;
                    }
                } else {
                    // Check if we should add to existing multi-cooldown timer (including empty ones)
                    let targetTimer = this.timers.find(timer =>
                        timer.isApiTimer &&
                        timer.cooldowns !== undefined &&
                        Object.keys(timer.cooldowns).length <= 2 // Max 3 cooldowns per timer (0-2), includes empty timers
                    );

                    if (targetTimer) {
                        // Add to existing multi-cooldown timer (including empty ones)
                        console.log(`➕ Adding ${cooldownType} to existing timer: ${targetTimer.id} (currently has ${Object.keys(targetTimer.cooldowns).length} cooldowns)`);
                        targetTimer.cooldowns[cooldownType] = apiCooldown;
                        targetTimer.remainingTime = Math.max(...Object.values(targetTimer.cooldowns));
                        targetTimer.name = 'Cooldowns';
                        targetTimer.lastUpdated = new Date().toISOString();
                        this.updateTimerDisplay(targetTimer.id);
                        hasUpdates = true;
                    } else {
                        // No timer has this cooldown - need to create/assign one
                        console.log(`🆕 Need to assign ${cooldownType} cooldown - finding or creating timer`);

                        // Use findOrCreateCooldownTimer to reuse existing windows if mapping exists
                        // Create a temporary "current timer" reference for the function
                        let selectedTimer = null;

                        // If no timers exist at all, create one
                        if (this.timers.length === 0) {
                            console.log(`🆕 Creating new timer for ${cooldownType} (no existing timers)`);
                            selectedTimer = this.createApiCooldownTimer(cooldownType, apiCooldown);
                        } else {
                            // Use findOrCreateCooldownTimer to check for mapping or existing usage
                            // Pass the first timer as a placeholder if no specific mapping is found,
                            // the function will handle creating a new one if needed.
                            selectedTimer = this.findOrCreateCooldownTimer(this.timers[0], cooldownType);

                            // Add cooldown to the selected timer
                            if (!selectedTimer.cooldowns) {
                                selectedTimer.cooldowns = {};
                            }
                            selectedTimer.cooldowns[cooldownType] = apiCooldown;

                            // Update timer properties
                            const cooldownCount = Object.keys(selectedTimer.cooldowns).length;
                            if (cooldownCount === 1) {
                                const cooldownNames = {
                                    'drug': 'Drug Cooldown',
                                    'medical': 'Medical Cooldown',
                                    'booster': 'Booster Cooldown',
                                    'Bank': 'Bank Investment'
                                };
                                selectedTimer.name = cooldownNames[cooldownType] || 'Cooldown';
                                selectedTimer.color = this.getCooldownColor(cooldownType);
                            } else {
                                selectedTimer.name = 'Cooldowns';
                                selectedTimer.color = '#9b59b6';
                            }

                            selectedTimer.duration = Math.max(...Object.values(selectedTimer.cooldowns));
                            selectedTimer.remainingTime = Math.max(...Object.values(selectedTimer.cooldowns));
                            selectedTimer.isApiTimer = true;
                            selectedTimer.isRunning = true;

                            this.saveTimers();
                            this.updateTimerDisplay(selectedTimer.id); // Pass ID for updateTimerDisplay
                            console.log(`✅ Assigned ${cooldownType} to existing timer via mapping`);
                        }
                        hasUpdates = true;
                    }
                }
            }

            // Remove expired cooldowns from existing timers
            for (const timer of this.timers) {
                if (timer.isApiTimer && timer.cooldowns) {
                    for (const cooldownType in timer.cooldowns) {
                        // Skip Bank investment - it persists until completed
                        if (cooldownType === 'Bank') {
                            continue;
                        }

                        if (!apiCooldowns[cooldownType] || apiCooldowns[cooldownType] <= 0) {
                            console.log(`🗑️ Removing expired ${cooldownType} from timer ${timer.id}`);
                            delete timer.cooldowns[cooldownType];
                            hasUpdates = true;

                            // Check if timer is now empty
                            if (Object.keys(timer.cooldowns).length === 0) {
                                console.log(`📭 Timer ${timer.id} now has no active cooldowns - keeping alive for future cooldowns`);
                                // Don't delete - keep timer alive for future cooldowns
                                timer.remainingTime = 0;
                                timer.name = 'Cooldowns';
                                this.updateTimerDisplay(timer.id);
                            } else {
                                timer.remainingTime = Math.max(...Object.values(timer.cooldowns));
                                this.updateTimerDisplay(timer.id);
                            }
                        }
                    }
                }
            }

            if (hasUpdates) {
                this.saveTimers();
                console.log('✅ Timer updates from API complete');
            }
        },

        // Create a new API-based cooldown timer
        createApiCooldownTimer(cooldownType, remainingTime) {
            const timer = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: this.getCooldownDisplayName(cooldownType),
                color: this.getCooldownColor(cooldownType),
                type: 'countdown',
                remainingTime: remainingTime,
                duration: remainingTime,
                isRunning: true,
                isApiTimer: true,
                cooldownType: cooldownType,
                cooldowns: {
                    [cooldownType]: remainingTime
                },
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                x: 20 + (this.timers.length * 30) % 300,
                y: 20 + Math.floor((this.timers.length * 30) / 300) * 30,
                width: 200,
                height: 100
            };

            this.timers.push(timer);
            this.renderTimer(timer);
            this.startTimer(timer.id);
            this.saveTimers();

            console.log(`🆕 Created API cooldown timer for ${cooldownType}: ${remainingTime}s`);
            return timer;
        },

        // Show custom timer input dialog
        showCustomTimerDialog(timer) {
            // Create overlay
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.7);
                z-index: 9999999;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            // Create dialog
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 12px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                color: #fff;
            `;

            dialog.innerHTML = `
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 32px; margin-bottom: 12px;">⏱️</div>
                    <div style="font-size: 20px; font-weight: bold;">Custom Timer</div>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 12px; margin-bottom: 6px; color: #aaa;">Timer Name</label>
                    <input id="custom-timer-name" type="text" value="Custom Timer" style="
                        width: 100%;
                        padding: 10px;
                        background: #1a1a1a;
                        border: 1px solid #444;
                        border-radius: 6px;
                        color: #fff;
                        font-size: 14px;
                        box-sizing: border-box;
                    ">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-size: 12px; margin-bottom: 6px; color: #aaa;">Duration</label>
                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 1;">
                            <label style="font-size: 11px; color: #888; display: block; margin-bottom: 4px;">Days</label>
                            <input id="custom-timer-days" type="number" min="0" max="365" value="0" style="
                                width: 100%;
                                padding: 10px;
                                background: #1a1a1a;
                                border: 1px solid #444;
                                border-radius: 6px;
                                color: #fff;
                                font-size: 14px;
                                text-align: center;
                                box-sizing: border-box;
                            ">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 11px; color: #888; display: block; margin-bottom: 4px;">Hours</label>
                            <input id="custom-timer-hours" type="number" min="0" max="23" value="0" style="
                                width: 100%;
                                padding: 10px;
                                background: #1a1a1a;
                                border: 1px solid #444;
                                border-radius: 6px;
                                color: #fff;
                                font-size: 14px;
                                text-align: center;
                                box-sizing: border-box;
                            ">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 11px; color: #888; display: block; margin-bottom: 4px;">Minutes</label>
                            <input id="custom-timer-minutes" type="number" min="0" max="59" value="0" style="
                                width: 100%;
                                padding: 10px;
                                background: #1a1a1a;
                                border: 1px solid #444;
                                border-radius: 6px;
                                color: #fff;
                                font-size: 14px;
                                text-align: center;
                                box-sizing: border-box;
                            ">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 11px; color: #888; display: block; margin-bottom: 4px;">Seconds</label>
                            <input id="custom-timer-seconds" type="number" min="0" max="59" value="0" style="
                                width: 100%;
                                padding: 10px;
                                background: #1a1a1a;
                                border: 1px solid #444;
                                border-radius: 6px;
                                color: #fff;
                                font-size: 14px;
                                text-align: center;
                                box-sizing: border-box;
                            ">
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button id="custom-timer-cancel" style="
                        flex: 1;
                        background: #444;
                        border: 1px solid #666;
                        color: #fff;
                        padding: 12px;
                        border-radius: 6px;
                        font-size: 14px;
                        font-weight: 600;
                    ">Cancel</button>
                    <button id="custom-timer-start" style="
                        flex: 1;
                        background: linear-gradient(135deg, #FFD700, #FFA500);
                        border: none;
                        color: #000;
                        padding: 12px;
                        border-radius: 6px;
                        font-size: 14px;
                        font-weight: 600;
                    ">Start Timer</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // Focus name input
            setTimeout(() => {
                document.getElementById('custom-timer-name').focus();
                document.getElementById('custom-timer-name').select();
            }, 100);

            // Handle cancel
            document.getElementById('custom-timer-cancel').addEventListener('click', () => {
                overlay.remove();
            });

            // Handle start
            document.getElementById('custom-timer-start').addEventListener('click', () => {
                const name = document.getElementById('custom-timer-name').value.trim() || 'Custom Timer';
                const days = parseInt(document.getElementById('custom-timer-days').value) || 0;
                const hours = parseInt(document.getElementById('custom-timer-hours').value) || 0;
                const minutes = parseInt(document.getElementById('custom-timer-minutes').value) || 0;
                const seconds = parseInt(document.getElementById('custom-timer-seconds').value) || 0;

                const totalSeconds = (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;

                if (totalSeconds <= 0) {
                    alert('Please enter a duration greater than 0');
                    return;
                }

                // Update timer with custom values
                timer.name = name;
                timer.duration = totalSeconds;
                timer.remainingTime = totalSeconds;
                timer.color = '#FFD700';
                timer.isApiTimer = false;
                timer.cooldownType = null;

                // Save and render
                this.saveTimers();
                this.renderTimer(timer);
                this.startTimer(timer.id);

                // Remove overlay
                overlay.remove();

                console.log(`⏱️ Custom timer created: ${name} (${totalSeconds}s)`);
            });

            // Close on click outside
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                }
            });
        },

        // Helper methods
        darkenColor(color, percent) {
            // Safety check for undefined or invalid colors
            if (!color || typeof color !== 'string') {
                color = '#2196F3'; // Default blue color
            }
            const num = parseInt(color.replace("#", ""), 16);
            const amt = Math.round(2.55 * percent);
            const R = (num >> 16) - amt;
            const G = (num >> 8 & 0x00FF) - amt;
            const B = (num & 0x0000FF) - amt;
            return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
                (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
                (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
        },

        escapeHtml(text) {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, (m) => map[m]);
        },

        formatTime(seconds) {
            if (seconds < 0) return '00:00:00';

            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;

            if (days > 0) {
                return `${days}d ${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
            } else if (hours > 0) {
                return `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
            } else {
                return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        },

        // Calculate end time from remaining seconds
        getEndTime(remainingSeconds) {
            const now = new Date();
            const endTime = new Date(now.getTime() + (remainingSeconds * 1000));

            return {
                time: endTime.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                }),
                date: endTime.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                })
            };
        },

        // Get display name for cooldown type
        getCooldownDisplayName(cooldownType) {
            const names = {
                'drug': 'Drug Cooldown',
                'medical': 'Medical Cooldown',
                'booster': 'Booster Cooldown',
                'Bank': 'Bank Investment'
            };
            return names[cooldownType] || 'Cooldown';
        },

        // Get color for cooldown type
        getCooldownColor(cooldownType) {
            const colors = {
                'drug': '#e74c3c',
                'medical': '#3498db',
                'booster': '#f39c12',
                'Bank': '#2ecc71'
            };
            return colors[cooldownType] || '#9b59b6';
        }
    };

    // Initialize global namespace if it doesn't exist
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    // Export Timer module to global namespace
    window.SidekickModules.Timer = TimerModule;
    console.log("✅ Timer Module loaded and ready");

})();