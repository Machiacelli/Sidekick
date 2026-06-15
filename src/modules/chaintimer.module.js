/**
 * Sidekick Chrome Extension - Chain Timer Module
 * Floating timer display for faction chain countdown
 * Version: 1.0.0
 */

(function () {
    'use strict';

    console.log("⏱️ Loading Sidekick Chain Timer Module...");

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

    // Chain Timer Module Implementation
    const ChainTimerModule = {
        isInitialized: false,
        isEnabled: false,
        alertsEnabled: true,
        popupEnabled: true,
        screenFlashEnabled: true,
        floatingDisplayEnabled: true,
        currentChainSeconds: 0,
        displayFlashIntervalId: null,
        floatingPosition: { top: '10px', left: 'auto', right: '10px' },
        floatingDisplay: null,
        monitorInterval: null,
        alertThresholdSeconds: 240, // 4 minutes
        hasAlerted: false,
        flashIntervalId: null,
        flashDiv: null,

        // Initialize the module
        async init() {
            if (this.isInitialized) {
                console.log("⏱️ Chain Timer Module already initialized");
                return;
            }

            console.log("⏱️ Initializing Chain Timer Module...");

            try {
                await waitForCore();
                await this.loadSettings();
                this.isInitialized = true;

                if (this.isEnabled) {
                    console.log('✅ Chain Timer: Enabled - starting monitoring');
                    this.startMonitoring();
                } else {
                    console.log('⏸️ Chain Timer: Disabled');
                }

                console.log("✅ Chain Timer Module initialized successfully");
            } catch (error) {
                console.error("❌ Chain Timer Module initialization failed:", error);
            }
        },

        // Load settings from storage
        async loadSettings() {
            try {
                const saved = await window.SidekickModules.Core.ChromeStorage.get('sidekick_chain_timer');
                if (saved) {
                    this.isEnabled = saved.isEnabled === true;
                    this.alertsEnabled = saved.alertsEnabled !== false;
                    this.popupEnabled = saved.popupEnabled !== false;
                    this.screenFlashEnabled = saved.screenFlashEnabled !== false;
                    this.floatingDisplayEnabled = saved.floatingDisplayEnabled !== false;
                    if (saved.floatingPosition) this.floatingPosition = saved.floatingPosition;
                    this.alertThresholdSeconds = saved.alertThresholdSeconds || 240;
                } else {
                    this.isEnabled = false;
                    this.alertsEnabled = true;
                    this.popupEnabled = true;
                    this.screenFlashEnabled = true;
                    this.alertThresholdSeconds = 240;
                }
                console.log('⏱️ Chain Timer settings loaded:', {
                    enabled: this.isEnabled,
                    threshold: this.alertThresholdSeconds,
                    alerts: this.alertsEnabled,
                    popup: this.popupEnabled,
                    flash: this.screenFlashEnabled,
                    floatingDisplay: this.floatingDisplayEnabled
                });
            } catch (error) {
                console.error('Failed to load chain timer settings:', error);
                this.isEnabled = false;
            }
        },

        // Save settings to storage
        async saveSettings() {
            try {
                await window.SidekickModules.Core.ChromeStorage.set('sidekick_chain_timer', {
                    isEnabled: this.isEnabled,
                    alertsEnabled: this.alertsEnabled,
                    popupEnabled: this.popupEnabled,
                    screenFlashEnabled: this.screenFlashEnabled,
                    floatingDisplayEnabled: this.floatingDisplayEnabled,
                    floatingPosition: this.floatingPosition,
                    alertThresholdSeconds: this.alertThresholdSeconds
                });
                console.log('💾 Chain Timer settings saved');
            } catch (error) {
                console.error('Failed to save chain timer settings:', error);
            }
        },

        // Toggle enabled state
        async toggle() {
            this.isEnabled = !this.isEnabled;
            await this.saveSettings();

            if (this.isEnabled) {
                console.log('✅ Chain Timer: Enabled');
                this.startMonitoring();
                this.showNotification('Chain Timer enabled!', 'success');
            } else {
                console.log('⏸️ Chain Timer: Disabled');
                this.stopMonitoring();
                this.showNotification('Chain Timer disabled!', 'info');
            }

            return this.isEnabled;
        },

        // Start monitoring chain status
        startMonitoring() {
            // Don't start if disabled in settings
            if (!this.isEnabled) {
                console.log('⏸️ Chain Timer is disabled in settings, not starting monitoring');
                return;
            }

            this.stopMonitoring(); // Clean up any existing monitoring

            // Only create floating display if enabled
            if (this.floatingDisplayEnabled) {
                this.createFloatingDisplay();
            }

            this.monitorInterval = setInterval(() => {
                this.updateChainTimer();
            }, 1000);

            // Initial update
            this.updateChainTimer();
        },

        // Stop monitoring
        stopMonitoring() {
            if (this.monitorInterval) {
                clearInterval(this.monitorInterval);
                this.monitorInterval = null;
            }

            this.removeFloatingDisplay();
            this.stopFlashing();
            this.hasAlerted = false;
        },

        // Create floating timer display
        createFloatingDisplay() {
            this.removeFloatingDisplay();

            this.floatingDisplay = document.createElement('div');
            this.floatingDisplay.id = 'sidekick-chain-timer-float';
            this.floatingDisplay.style.cssText = `
                position: fixed;
                top: ${this.floatingPosition.top};
                left: ${this.floatingPosition.left};
                right: ${this.floatingPosition.right};
                z-index: 2147483647;background: linear-gradient(135deg, #2a2a2a, #1a1a1a);
                border: 1px solid #444;
                border-radius: 8px;
                padding: 12px 16px;
                color: #fff;
                font-family: 'Courier New', monospace;
                border-radius: 8px;
                padding: 10px;
                min-width: 140px;
                min-height: 80px;
                text-align: center;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                backdrop-filter: blur(10px);
                cursor: move;
                user-select: none;
                resize: both;
                overflow: auto;
            `;

            this.floatingDisplay.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 4px; color: #FFC107;">⏱️ Chain Timer</div>
                <div id="chain-time-display" style="font-size: 16px; color: #4CAF50;">--:--:--</div>
                <div id="chain-status" style="font-size: 12px; color: #aaa; margin-top: 4px;">Monitoring...</div>
            `;

            // Add hover effects
            this.floatingDisplay.addEventListener('mouseenter', () => {
                this.floatingDisplay.style.transform = 'scale(1.05)';
                this.floatingDisplay.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
            });

            this.floatingDisplay.addEventListener('mouseleave', () => {
                this.floatingDisplay.style.transform = 'scale(1)';
                this.floatingDisplay.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            });

            // Make draggable (removed click-to-toggle to prevent accidental disable)
            let isDragging = false;
            let startX, startY, startLeft, startTop;

            this.floatingDisplay.addEventListener('mousedown', (e) => {
                // Don't start drag if clicking on the resize corner (bottom-right 20px)
                const rect = this.floatingDisplay.getBoundingClientRect();
                const isResizeCorner = (
                    e.clientX > rect.right - 20 &&
                    e.clientY > rect.bottom - 20
                );

                if (isResizeCorner) return;

                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                startLeft = rect.left;
                startTop = rect.top;
                this.floatingDisplay.style.cursor = 'grabbing';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                this.floatingDisplay.style.left = (startLeft + dx) + 'px';
                this.floatingDisplay.style.top = (startTop + dy) + 'px';
                this.floatingDisplay.style.right = 'auto'; // Clear right positioning
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    this.floatingDisplay.style.cursor = 'move';
                    this.floatingPosition = {
                        top: this.floatingDisplay.style.top,
                        left: this.floatingDisplay.style.left,
                        right: 'auto'
                    };
                    this.saveSettings();
                }
                isDragging = false;
            });

            document.body.appendChild(this.floatingDisplay);
        },

        // Remove floating display
        removeFloatingDisplay() {
            if (this.floatingDisplay) {
                this.floatingDisplay.remove();
                this.floatingDisplay = null;
            }
        },

        // Update chain timer display
        updateChainTimer() {
            // Skip display updates if floating display is disabled or doesn't exist
            if (!this.floatingDisplayEnabled || !this.floatingDisplay) {
                // Still check for alerts even without display
                const chainData = this.getChainData();
                const chainLength = parseInt(chainData.length) || 0;

                if (chainLength >= 25 && chainData.timeLeft) {
                    const seconds = this.parseTimeToSeconds(chainData.timeLeft);

                    // Alert if threshold reached
                    if (seconds <= this.alertThresholdSeconds && !this.hasAlerted) {
                        this.triggerAlert(seconds);
                        this.hasAlerted = true;
                    }

                    // Reset alert flag if time goes back up
                    if (seconds > this.alertThresholdSeconds) {
                        this.hasAlerted = false;
                    }
                }
                return;
            }

            const chainData = this.getChainData();
            const timeDisplay = document.getElementById('chain-time-display');
            const statusDisplay = document.getElementById('chain-status');

            if (!timeDisplay || !statusDisplay) return;

            // Parse chain length
            const chainLength = parseInt(chainData.length) || 0;

            // MINIMUM 25-HIT THRESHOLD - prevent activation on low/zero chains
            if (chainLength < 25) {
                timeDisplay.textContent = '--:--:--';
                timeDisplay.style.color = '#aaa';
                this.floatingDisplay.style.borderColor = '#444';
                statusDisplay.textContent = chainLength > 0
                    ? `Chain too low (${chainLength}/25 min)`
                    : 'No active chain';
                this.hasAlerted = false;
                this.stopFlashing(); // Stop any active red screen flash
                return; // Don't process timer logic for low chains
            }

            if (chainData.timeLeft) {
                const seconds = this.parseTimeToSeconds(chainData.timeLeft);
                timeDisplay.textContent = chainData.timeLeft;

                // Update colors based on time remaining
                if (seconds <= 60) {
                    timeDisplay.style.color = '#f44336'; // Red - critical
                    this.floatingDisplay.style.borderColor = '#f44336';
                } else if (seconds <= 300) {
                    timeDisplay.style.color = '#ff9800'; // Orange - warning
                    this.floatingDisplay.style.borderColor = '#ff9800';
                } else {
                    timeDisplay.style.color = '#4CAF50'; // Green - safe
                    this.floatingDisplay.style.borderColor = '#444';
                }

                // Alert if threshold reached
                if (seconds <= this.alertThresholdSeconds && !this.hasAlerted) {
                    this.triggerAlert(seconds);
                    this.hasAlerted = true;
                }

                // Reset alert flag if time goes back up
                if (seconds > this.alertThresholdSeconds) {
                    this.hasAlerted = false;
                }

                statusDisplay.textContent = `Chain: ${chainData.length || '?'}`;
            } else {
                timeDisplay.textContent = '--:--:--';
                timeDisplay.style.color = '#aaa';
                this.floatingDisplay.style.borderColor = '#444';
                statusDisplay.textContent = chainData.status || 'No active chain';
                this.hasAlerted = false;
            }
        },

        // Get chain data from page
        getChainData() {
            // Try multiple selectors for chain time
            const timeSelectors = [
                '[class*="bar-timeleft"]',
                '[class*="chain-time"]',
                '.chain-time',
                '.timeleft'
            ];

            const lengthSelectors = [
                '[class*="bar-value"]',
                '[class*="chain-length"]',
                '.chain-length',
                '.chain-count'
            ];

            let timeLeft = null;
            let length = null;
            let status = 'Monitoring...';
            let timeElement = null;

            // Find time element
            for (const selector of timeSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    const text = element.textContent.trim();
                    if (text.includes(':') && !text.includes('ended')) {
                        timeLeft = text;
                        timeElement = element;
                        break;
                    }
                }
            }

            // Find length element
            // First try to find it near the time element to avoid getting energy/nerve bars
            if (timeElement) {
                let parent = timeElement.parentElement;
                // Go up to 5 levels to find the common container
                for (let i = 0; i < 5 && parent; i++) {
                    for (const selector of lengthSelectors) {
                        const valElement = parent.querySelector(selector);
                        if (valElement && valElement.textContent.trim()) {
                            length = valElement.textContent.trim();
                            break;
                        }
                    }
                    if (length) break;
                    parent = parent.parentElement;
                }
            }

            // Fallback if not found nearby
            if (!length) {
                for (const selector of lengthSelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (element && element.textContent.trim()) {
                            const val = element.textContent.trim();
                            // Skip if it looks like an energy/nerve bar (e.g. "375/150")
                            if (!val.includes('/')) {
                                length = val;
                                break;
                            }
                        }
                    }
                    if (length) break;
                }
            }

            // Determine status
            if (!timeLeft) {
                // Check if we're on faction page
                if (window.location.href.includes('/factions.php')) {
                    status = 'No active chain';
                } else {
                    status = 'Not on faction page';
                }
            }

            return { timeLeft, length, status };
        },

        // Parse time string to seconds
        parseTimeToSeconds(timeString) {
            const parts = timeString.split(':').map(n => parseInt(n) || 0);
            if (parts.length === 3) {
                return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
            } else if (parts.length === 2) {
                return parts[0] * 60 + parts[1]; // MM:SS
            }
            return 0;
        },

        // Trigger alert when threshold reached
        triggerAlert(secondsLeft) {
            if (!this.alertsEnabled) return;

            const minutes = Math.floor(secondsLeft / 60);
            const seconds = secondsLeft % 60;
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // Popup alert
            if (this.popupEnabled) {
                alert(`Chain timer is below ${this.alertThresholdSeconds / 60} minutes!`);
            }

            // Screen flash
            if (this.screenFlashEnabled) {
                this.startFlashing();
            }

            // Visual alert - flash the display
            this.flashDisplay();

            // Show notification
            this.showNotification(`Chain expires in ${timeStr}!`, 'warning');

            // Browser notification if supported
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Chain Timer Alert', {
                    body: `Chain expires in ${timeStr}!`,
                    icon: '/favicon.ico'
                });
            }
        },

        // Flash the display for visual alert
        flashDisplay() {
            if (!this.floatingDisplay) return;

            let flashCount = 0;
            const flashInterval = setInterval(() => {
                this.floatingDisplay.style.background = flashCount % 2 === 0
                    ? 'linear-gradient(135deg, #f44336, #d32f2f)'
                    : 'linear-gradient(135deg, #2a2a2a, #1a1a1a)';

                flashCount++;
                if (flashCount >= 6) {
                    clearInterval(flashInterval);
                    this.floatingDisplay.style.background = 'linear-gradient(135deg, #2a2a2a, #1a1a1a)';
                }
            }, 200);
        },

        // Show notification
        showNotification(message, type = 'info') {
            if (window.SidekickModules?.UI?.showNotification) {
                window.SidekickModules.UI.showNotification('Chain Timer', message, type);
            }
        },

        // Start flashing screen
        startFlashing() {
            if (this.flashIntervalId) return;

            this.flashDiv = document.createElement('div');
            this.flashDiv.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background-color: red;
                opacity: 0;
                z-index: 9999;
                pointer-events: none;
                transition: opacity 0.5s ease-in-out;
            `;

            document.body.appendChild(this.flashDiv);

            let visible = false;

            this.flashIntervalId = setInterval(() => {
                visible = !visible;
                this.flashDiv.style.opacity = visible ? '0.5' : '0';
            }, 1000);
        },

        // Stop flashing screen
        stopFlashing() {
            if (this.flashIntervalId) {
                clearInterval(this.flashIntervalId);
                this.flashIntervalId = null;
            }
            if (this.flashDiv) {
                this.flashDiv.remove();
                this.flashDiv = null;
            }
        },

        // Get current status
        getStatus() {
            const chainData = this.getChainData();
            return {
                isEnabled: this.isEnabled,
                isInitialized: this.isInitialized,
                alertsEnabled: this.alertsEnabled,
                popupEnabled: this.popupEnabled,
                screenFlashEnabled: this.screenFlashEnabled,
                timeLeft: chainData.timeLeft,
                chainLength: chainData.length,
                alertThreshold: this.alertThresholdSeconds,
                hasAlerted: this.hasAlerted
            };
        }
    };

    // Initialize global namespace if it doesn't exist
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    // Export Chain Timer module to global namespace
    window.SidekickModules.ChainTimer = ChainTimerModule;
    console.log("✅ Chain Timer Module loaded and ready");

})();