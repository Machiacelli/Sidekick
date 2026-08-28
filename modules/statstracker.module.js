/**
 * Sidekick Chrome Extension - Stats Tracker Module
 * Tracks daily battle stat gains with 90-day history
 * Version: 1.0.0
 * Author: Machiacelli
 */

(function () {
    'use strict';

    console.log("📊 Loading Sidekick Stats Tracker Module...");

    // Ensure SidekickModules namespace exists
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    const STORAGE_KEY = 'sidekick_stats_tracker';
    const WINDOW_STORAGE_KEY = 'sidekick_stats_tracker_window';

    const StatsTrackerModule = {
        isInitialized: false,
        isEnabled: false,
        window: null,
        windowState: { x: 100, y: 100, width: 280, height: 320, color: '#4CAF50' },
        history: {},
        lastUpdated: 0,
        displayUpdateInterval: null,
        gymObserver: null,
        displayPeriod: 'day', // 'day' | 'week' | 'month'

        // Initialize module
        async init() {
            if (this.isInitialized) {
                console.log("📊 Stats Tracker already initialized");
                return;
            }

            console.log("📊 Initializing Stats Tracker Module...");

            try {
                await this.loadSettings();
                await this.loadHistory();

                // Check if we need to update stats
                await this.checkAndUpdate();

                // Schedule periodic background updates (every 90 minutes) for safety
                setInterval(() => this.updateStats(), 90 * 60 * 1000);

                // Monitor gym page for training completion
                this.startGymMonitoring();

                if (this.isEnabled) {
                    this.enable();
                }

                this.isInitialized = true;
                console.log("✅ Stats Tracker Module initialized successfully");
            } catch (error) {
                console.error("❌ Stats Tracker initialization failed:", error);
            }
        },

        // Load settings
        async loadSettings() {
            try {
                const windowState = await window.SidekickModules.Core.ChromeStorage.get(WINDOW_STORAGE_KEY);
                if (windowState) {
                    this.windowState = windowState;
                    this.isEnabled = windowState.isEnabled || false;
                    this.displayPeriod = windowState.displayPeriod || 'day';
                }
            } catch (error) {
                console.error("❌ Failed to load Stats Tracker settings:", error);
            }
        },

        // Save settings
        async saveSettings() {
            try {
                const settings = {
                    ...this.windowState,
                    isEnabled: this.isEnabled,
                    displayPeriod: this.displayPeriod
                };
                await window.SidekickModules.Core.ChromeStorage.set(WINDOW_STORAGE_KEY, settings);
            } catch (error) {
                console.error("❌ Failed to save Stats Tracker settings:", error);
            }
        },

        // Load stat history
        async loadHistory() {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get(STORAGE_KEY);
                if (data) {
                    this.history = data.history || {};
                    this.lastUpdated = data.lastUpdated || 0;
                    console.log("📊 Loaded stat history:", Object.keys(this.history).length, "days");
                }
            } catch (error) {
                console.error("❌ Failed to load stat history:", error);
            }
        },

        // Save stat history
        async saveHistory() {
            try {
                await window.SidekickModules.Core.ChromeStorage.set(STORAGE_KEY, {
                    history: this.history,
                    lastUpdated: this.lastUpdated
                });
            } catch (error) {
                console.error("❌ Failed to save stat history:", error);
            }
        },

        // Format date as YYYY-MM-DD
        formatDate(date = new Date()) {
            return date.toISOString().slice(0, 10);
        },

        // Calculate difference between two stat snapshots
        diff(current, previous) {
            return {
                strength: current.strength - previous.strength,
                speed: current.speed - previous.speed,
                defense: current.defense - previous.defense,
                dexterity: current.dexterity - previous.dexterity,
                total: current.total - previous.total
            };
        },

        // Fetch current battle stats from API
        async fetchCurrentStats() {
            try {
                const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                if (!apiKey) {
                    console.warn("📊 No API key available");
                    return null;
                }

                // Direct fetch to Torn API
                const response = await fetch(`https://api.torn.com/user/?selections=battlestats&key=${apiKey}`);
                const data = await response.json();

                if (data.error) {
                    console.error("📊 API error:", data.error);
                    return null;
                }

                return {
                    strength: data.strength || 0,
                    speed: data.speed || 0,
                    defense: data.defense || 0,
                    dexterity: data.dexterity || 0,
                    total: data.total || 0
                };
            } catch (error) {
                console.error("📊 Error fetching stats:", error);
                return null;
            }
        },

        // Check if update needed and perform it
        async checkAndUpdate() {
            const today = this.formatDate();
            const lastDate = new Date(this.lastUpdated).toISOString().slice(0, 10);

            if (today !== lastDate || !this.history[today]) {
                await this.updateStats();
            }
        },

        // Update stats for today
        async updateStats() {
            const today = this.formatDate();
            const current = await this.fetchCurrentStats();

            if (!current) return;

            // Store today's snapshot
            this.history[today] = current;
            this.lastUpdated = Date.now();

            // Cleanup: keep only 90 days
            const dates = Object.keys(this.history).sort();
            while (dates.length > 90) {
                delete this.history[dates.shift()];
            }

            await this.saveHistory();

            console.log("📊 Stats updated for", today);

            // Refresh UI if window is open (AFTER logging)
            if (this.window) {
                this.refreshDisplay();
            }
        },

        // Get today's gains
        getTodayGains() {
            return this.getPeriodGains(1);
        },

        // Get gains over the last N days (today vs N days ago)
        getPeriodGains(days) {
            const today = this.formatDate();
            const pastDate = this.formatDate(new Date(Date.now() - days * 86400000));

            const todayStats = this.history[today];

            // For >1 day, find the nearest available snapshot at or before the target date
            let pastStats = this.history[pastDate];
            if (!pastStats) {
                const allDates = Object.keys(this.history).sort();
                const candidates = allDates.filter(d => d <= pastDate);
                if (candidates.length) pastStats = this.history[candidates[candidates.length - 1]];
            }

            if (!todayStats || !pastStats) return null;
            return this.diff(todayStats, pastStats);
        },

        // Enable module
        enable() {
            console.log("📊 Enabling Stats Tracker...");
            this.isEnabled = true;
            this.saveSettings();
            this.createWindow();

            // Start periodic display refresh (every 1 minute for responsiveness)
            if (this.displayUpdateInterval) {
                clearInterval(this.displayUpdateInterval);
            }
            this.displayUpdateInterval = setInterval(() => {
                if (this.window) {
                    this.refreshDisplay();
                }
            }, 60 * 1000);
        },

        // Disable module
        disable() {
            console.log("📊 Disabling Stats Tracker...");
            this.isEnabled = false;
            this.saveSettings();
            this.removeWindow();

            // Stop periodic display refresh
            if (this.displayUpdateInterval) {
                clearInterval(this.displayUpdateInterval);
                this.displayUpdateInterval = null;
            }
        },

        // Toggle module
        async toggle() {
            if (this.isEnabled) {
                this.disable();
            } else {
                this.enable();
            }
            return { success: true, enabled: this.isEnabled };
        },

        // Create draggable window
        createWindow() {
            if (this.window) {
                this.removeWindow();
            }

            const contentArea = document.getElementById('sidekick-content');
            if (!contentArea) {
                console.error("📊 Content area not found");
                return;
            }

            this.window = document.createElement('div');
            this.window.className = 'sidekick-stats-tracker-window';
            this.window.style.cssText = `
                position: absolute;
                left: ${this.windowState.x}px;
                top: ${this.windowState.y}px;
                width: ${this.windowState.width}px;
                height: ${this.windowState.height}px;
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                min-width: 200px;
                min-height: 200px;
                resize: both;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            `;

            // Header
            const header = document.createElement('div');
            header.style.cssText = `
                padding: 10px;
                background: linear-gradient(135deg, ${this.windowState.color || '#4CAF50'}, ${this.darkenColor(this.windowState.color || '#4CAF50', 15)});
                color: white;
                font-weight: bold;
                cursor: move;
                display: flex;
                justify-content: space-between;
                align-items: center;
                user-select: none;
            `;
            header.innerHTML = `
                <span>📊 Stats Tracker</span>
                <div style="display: flex; gap: 5px;">
                    <button class="cog-btn" style="background: none; border: none; color: white; font-size: 12px; cursor: pointer; padding: 0; opacity: 0.8;">⚙️</button>
                    <button class="close-btn" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 0 5px;">×</button>
                </div>
            `;

            // Content area
            const content = document.createElement('div');
            content.className = 'stats-content';
            content.style.cssText = `
                flex: 1;
                padding: 15px;
                overflow-y: auto;
                color: #fff;
                font-size: 13px;
                scrollbar-width: none;
                -ms-overflow-style: none;
            `;

            // Hide webkit scrollbar
            const style = document.createElement('style');
            style.textContent = `.stats-content::-webkit-scrollbar { display: none; }`;
            document.head.appendChild(style);

            this.window.appendChild(header);
            this.window.appendChild(content);
            contentArea.appendChild(this.window);

            // Register window for click-to-front behavior
            if (window.SidekickModules?.Core?.WindowManager) {
                window.SidekickModules.Core.WindowManager.registerWindow(this.window, 'Stats Tracker');
            }

            // Make draggable
            this.makeDraggable(header);

            // Close button
            header.querySelector('.close-btn').addEventListener('click', () => {
                this.disable();
            });

            // Cogwheel dropdown menu
            const cogBtn = header.querySelector('.cog-btn');
            cogBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                // Remove existing dropdown if present
                const existingDropdown = this.window.querySelector('.stats-dropdown');
                if (existingDropdown) {
                    existingDropdown.remove();
                    return;
                }

                // Create dropdown menu
                const dropdown = document.createElement('div');
                dropdown.className = 'stats-dropdown';
                const cogBtnRect = cogBtn.getBoundingClientRect();
                dropdown.style.cssText = `
                    position: fixed;
                    top: ${cogBtnRect.bottom + 5}px;
                    left: ${cogBtnRect.right - 120}px;
                    background: #1a1a1a;
                    border: 1px solid #444;
                    border-radius: 4px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    z-index: 999999;
                    min-width: 120px;
                `;

                const periodLabel = { day: 'Day', week: 'Week', month: 'Month' }[this.displayPeriod];
                dropdown.innerHTML = `
                    <button class="dropdown-option" data-action="color" style="
                        width: 100%;
                        padding: 8px 12px;
                        background: none;
                        border: none;
                        color: #fff;
                        text-align: left;
                        cursor: pointer;
                        font-size: 12px;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    ">
                        <span>🎨</span> Change Color
                    </button>
                    <button class="dropdown-option" data-action="refresh" style="
                        width: 100%;
                        padding: 8px 12px;
                        background: none;
                        border: none;
                        color: #fff;
                        text-align: left;
                        cursor: pointer;
                        font-size: 12px;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    ">
                        <span>🔄</span> Refresh Stats
                    </button>
                    <button class="dropdown-option" data-action="duration" style="
                        width: 100%;
                        padding: 8px 12px;
                        background: none;
                        border: none;
                        color: #fff;
                        text-align: left;
                        cursor: pointer;
                        font-size: 12px;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    ">
                        <span>📅</span> Duration: ${periodLabel}
                    </button>
                `;

                this.window.appendChild(dropdown);

                // Add hover effect
                const options = dropdown.querySelectorAll('.dropdown-option');
                options.forEach(option => {
                    option.addEventListener('mouseenter', () => {
                        option.style.background = 'rgba(76, 175, 80, 0.2)';
                    });
                    option.addEventListener('mouseleave', () => {
                        option.style.background = 'none';
                    });
                    option.addEventListener('click', async (e) => {
                        const action = option.dataset.action;
                        dropdown.remove();

                        if (action === 'color') {
                            if (window.SidekickModules?.Core?.ColorPicker) {
                                window.SidekickModules.Core.ColorPicker.show(this.windowState.color || '#4CAF50', (selectedColor) => {
                                    this.windowState.color = selectedColor;
                                    header.style.background = `linear-gradient(135deg, ${selectedColor}, ${this.darkenColor(selectedColor, 15)})`;
                                    this.saveSettings();
                                });
                            }
                        } else if (action === 'refresh') {
                            console.log('📊 Manually refreshing stats...');
                            await this.updateStats();
                            if (window.SidekickModules?.Core?.NotificationSystem) {
                                window.SidekickModules.Core.NotificationSystem.show(
                                    'Stats Refreshed',
                                    'Battle stats updated successfully',
                                    'success',
                                    2000
                                );
                            }
                        } else if (action === 'duration') {
                            const cycle = { day: 'week', week: 'month', month: 'day' };
                            this.displayPeriod = cycle[this.displayPeriod] || 'day';
                            await this.saveSettings();
                            this.refreshDisplay();
                        }
                    });
                });

                // Close dropdown when clicking outside
                setTimeout(() => {
                    const closeDropdown = (e) => {
                        if (!dropdown.contains(e.target) && e.target !== cogBtn) {
                            dropdown.remove();
                            document.removeEventListener('click', closeDropdown);
                        }
                    };
                    document.addEventListener('click', closeDropdown);
                }, 0);
            });

            // Track resize - use contentRect to avoid including borders/padding
            let isInitializing = true;
            setTimeout(() => {
                isInitializing = false;
            }, 500);

            const resizeObserver = new ResizeObserver((entries) => {
                for (let entry of entries) {
                    const { width, height } = entry.contentRect;

                    // Don't save during initial layout phase
                    if (isInitializing) {
                        return;
                    }

                    // Debounced save to avoid too frequent saves during resize
                    clearTimeout(this.window._resizeTimeout);
                    this.window._resizeTimeout = setTimeout(() => {
                        this.windowState.width = Math.round(width);
                        this.windowState.height = Math.round(height);
                        this.saveSettings();
                    }, 500);
                }
            });
            resizeObserver.observe(this.window);

            this.refreshDisplay();
            console.log("📊 Stats Tracker window created");
        },

        // Make window draggable
        makeDraggable(handle) {
            let isDragging = false;
            let startX, startY, startLeft, startTop;

            handle.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                startLeft = this.window.offsetLeft;
                startTop = this.window.offsetTop;
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                this.window.style.left = (startLeft + dx) + 'px';
                this.window.style.top = (startTop + dy) + 'px';
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    this.windowState.x = this.window.offsetLeft;
                    this.windowState.y = this.window.offsetTop;
                    this.saveSettings();
                }
            });
        },

        // Refresh display
        refreshDisplay() {
            if (!this.window) return;

            const content = this.window.querySelector('.stats-content');
            const periodDays = { day: 1, week: 7, month: 30 }[this.displayPeriod] || 1;
            const periodName = { day: "Today's", week: 'Last 7-Day', month: 'Last 30-Day' }[this.displayPeriod];
            const gains = this.getPeriodGains(periodDays);

            if (!gains) {
                content.innerHTML = `
                    <div style="text-align: center; color: #888; padding: 20px;">
                        <p>⏳ Waiting for data...</p>
                        <p style="font-size: 11px; margin-top: 10px;">
                            Stats are tracked daily. More history will be available over time.
                        </p>
                    </div>
                `;
                return;
            }

            const formatStat = (value) => {
                const sign = value >= 0 ? '+' : '';
                const color = value >= 0 ? '#4CAF50' : '#f44336';
                return `<span style="color: ${color}; font-weight: bold;">${sign}${value.toLocaleString()}</span>`;
            };

            content.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #4CAF50;">
                        ${periodName} Gains
                    </div>
                    <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px; font-size: 12px;">
                        <div>💪 Strength:</div><div>${formatStat(gains.strength)}</div>
                        <div>⚡ Speed:</div><div>${formatStat(gains.speed)}</div>
                        <div>🛡️ Defense:</div><div>${formatStat(gains.defense)}</div>
                        <div>🎯 Dexterity:</div><div>${formatStat(gains.dexterity)}</div>
                    </div>
                </div>
                <div style="border-top: 1px solid #444; padding-top: 10px; margin-top: 10px;">
                    <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px;">
                        <div style="font-weight: bold;">Total:</div>
                        <div style="font-size: 14px;">${formatStat(gains.total)}</div>
                    </div>
                </div>
                <div style="margin-top: 15px; font-size: 10px; color: #888; text-align: center;">
                    Last updated: ${new Date(this.lastUpdated).toLocaleTimeString()}
                </div>
            `;
        },

        // Remove window
        removeWindow() {
            if (this.window) {
                this.window.remove();
                this.window = null;
                console.log("📊 Stats Tracker window removed");
            }

            // Stop periodic display refresh
            if (this.displayUpdateInterval) {
                clearInterval(this.displayUpdateInterval);
                this.displayUpdateInterval = null;
            }
        },

        // Monitor gym page for training completion
        startGymMonitoring() {
            // Only monitor if on gym page
            const checkGymPage = () => {
                if (window.location.href.includes('gym.php')) {
                    this.setupGymObserver();
                } else {
                    this.cleanupGymObserver();
                }
            };

            // Initial check
            checkGymPage();

            // Monitor URL changes (for SPA-like navigation)
            setInterval(checkGymPage, 2000);
        },

        // Setup observer for gym training completion
        setupGymObserver() {
            if (this.gymObserver) return; // Already observing

            console.log('📊 Monitoring gym for training completion...');

            // Look for the gym training area
            const gymContent = document.querySelector('body');
            if (!gymContent) return;

            this.gymObserver = new MutationObserver(async (mutations) => {
                for (const mutation of mutations) {
                    // Look for text nodes or elements that indicate training completed
                    const addedNodes = Array.from(mutation.addedNodes);

                    for (const node of addedNodes) {
                        const text = node.textContent || '';

                        // Check for training completion messages
                        if (text.includes('You gained') ||
                            text.includes('strength increased') ||
                            text.includes('speed increased') ||
                            text.includes('defense increased') ||
                            text.includes('dexterity increased')) {

                            console.log('📊 Gym training detected! Updating stats...');

                            // Wait 2 seconds for API to update
                            await new Promise(resolve => setTimeout(resolve, 2000));

                            // Update stats
                            await this.updateStats();

                            // Show notification
                            if (window.SidekickModules?.Core?.NotificationSystem) {
                                window.SidekickModules.Core.NotificationSystem.show(
                                    'Stats Updated',
                                    'Training completed - stats refreshed!',
                                    'success',
                                    2000
                                );
                            }

                            break;
                        }
                    }
                }
            });

            this.gymObserver.observe(gymContent, {
                childList: true,
                subtree: true,
                characterData: true
            });
        },

        cleanupGymObserver() {
            if (this.gymObserver) {
                this.gymObserver.disconnect();
                this.gymObserver = null;
            }
        },

        // Utility to darken a color
        darkenColor(color, percent) {
            if (!color) return '#45a049';
            const num = parseInt(color.replace("#", ""), 16);
            const amt = Math.round(2.55 * percent);
            const R = (num >> 16) - amt;
            const G = (num >> 8 & 0x00FF) - amt;
            const B = (num & 0x0000FF) - amt;
            return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
                (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
                (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
        }
    };

    // Export to global namespace
    window.SidekickModules.StatsTracker = StatsTrackerModule;
    console.log("✅ Stats Tracker Module loaded and ready");

})();
