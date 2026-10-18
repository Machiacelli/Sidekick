/**
 * Sidekick Chrome Extension - Random Target Module
 * Creates a floating draggable button that selects random attack targets  
 */

(function () {
    'use strict';

    console.log("🎯 Loading Sidekick Random Target Module...");

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

    // Random Target Module Implementation
    const RandomTargetModule = {
        isInitialized: false,
        isEnabled: false,
        floatingButton: null,
        buttonCheckInterval: null, // 3s existence check (replaces whole-body MutationObserver)
        buttonPosition: { x: 100, y: 100 },

        // Initialize the random target module
        async init() {
            if (this.isInitialized) {
                console.log("🎯 Random Target Module already initialized");
                return;
            }

            console.log("🎯 Initializing Random Target Module...");

            try {
                await waitForCore();
                await this.loadSettings();

                if (this.isEnabled) {
                    this.enable();
                }

                this.isInitialized = true;
                console.log("✅ Random Target Module initialized successfully");
            } catch (error) {
                console.error("❌ Random Target Module initialization failed:", error);
            }
        },

        // Load settings from storage
        async loadSettings() {
            try {
                const saved = await window.SidekickModules.Core.ChromeStorage.get('sidekick_random_target');
                if (saved) {
                    this.isEnabled = saved.isEnabled === true;
                    this.buttonPosition = saved.position || { x: 100, y: 100 };

                    // Load configuration settings
                    this.config = {
                        enableApiChecks: saved.enableApiChecks || false,
                        maxXanax: saved.maxXanax || 10,
                        maxRefills: saved.maxRefills || 10,
                        maxSEs: saved.maxSEs || 0,
                        minID: saved.minID || 1000000,
                        maxID: saved.maxID || 3400000
                    };

                    console.log("✅ Random Target settings loaded - enabled:", this.isEnabled, "position:", this.buttonPosition, "config:", this.config);
                } else {
                    this.isEnabled = false; // Default disabled
                    this.config = {
                        enableApiChecks: false,
                        maxXanax: 10,
                        maxRefills: 10,
                        maxSEs: 0,
                        minID: 1000000,
                        maxID: 3400000
                    };
                    await this.saveSettings();
                    console.log("📝 Random Target default settings saved");
                }
            } catch (error) {
                console.error('❌ Failed to load Random Target settings:', error);
                this.isEnabled = false;
            }
        },

        // Save settings to storage
        async saveSettings() {
            try {
                const settings = {
                    isEnabled: this.isEnabled,
                    position: this.buttonPosition,
                    ...this.config
                };
                await window.SidekickModules.Core.ChromeStorage.set('sidekick_random_target', settings);
                console.log('💾 Random Target settings saved:', settings);
            } catch (error) {
                console.error('❌ Failed to save Random Target settings:', error);
            }
        },

        // Enable random target functionality
        async enable() {
            console.log("🟢 Enabling Random Target Module...");
            this.isEnabled = true;

            // Reload settings to get the saved position before creating button
            await this.loadSettings();

            this.saveSettings();
            this.createFloatingButton();
            this.startObserver();
        },

        // Disable random target functionality
        disable() {
            console.log("🔴 Disabling Random Target Module...");
            this.isEnabled = false;
            this.saveSettings();
            this.removeFloatingButton();
            this.stopObserver();
        },

        // Toggle module on/off
        async toggle() {
            if (this.isEnabled) {
                this.disable();
            } else {
                this.enable();
            }
            return { success: true, enabled: this.isEnabled };
        },

        // Create floating draggable button
        createFloatingButton() {
            // Remove existing button if present
            this.removeFloatingButton();

            // Create floating button
            this.floatingButton = document.createElement('div');
            this.floatingButton.id = 'sidekick-random-target-float';
            this.floatingButton.innerHTML = '🎯';
            this.floatingButton.title = 'Random Target - Click to select, Double-click to attack';

            // Style the floating button - smaller and more responsive
            this.floatingButton.style.cssText = `
                position: fixed !important;
                top: ${this.buttonPosition.y}px !important;
                left: ${this.buttonPosition.x}px !important;
                width: 30px;
                height: 30px;
                background: linear-gradient(135deg, #4CAF50, #45a049);
                border: 1px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                cursor: grab;
                z-index: 2147483646;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                transition: all 0.2s ease;
                user-select: none;
                font-family: Arial, sans-serif;
                opacity: 0.9;
                transform: translate3d(0, 0, 0);
                will-change: transform;
            `;

            // Add hover effects - more responsive
            this.floatingButton.addEventListener('mouseenter', () => {
                this.floatingButton.style.transform = 'scale(1.15)';
                this.floatingButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
                this.floatingButton.style.background = 'linear-gradient(135deg, #66BB6A, #4CAF50)';
                this.floatingButton.style.opacity = '1';
            });

            this.floatingButton.addEventListener('mouseleave', () => {
                this.floatingButton.style.transform = 'scale(1)';
                this.floatingButton.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
                this.floatingButton.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
                this.floatingButton.style.opacity = '0.9';
            });

            // Make draggable
            this.makeDraggable(this.floatingButton);

            // Add click handlers - more responsive
            let clickCount = 0;
            let clickTimer = null;

            this.floatingButton.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                clickCount++;

                if (clickCount === 1) {
                    clickTimer = setTimeout(() => {
                        // Single click - just select random target (highlight)
                        this.selectRandomTarget();
                        clickCount = 0;
                    }, 250); // Reduced timeout for faster response
                } else if (clickCount === 2) {
                    // Double click - select and attack
                    clearTimeout(clickTimer);
                    this.attackRandomTarget();
                    clickCount = 0;
                }
            });

            // Append to body
            document.body.appendChild(this.floatingButton);
            console.log("✅ Random Target floating button created");
        },

        // Remove floating button
        removeFloatingButton() {
            // Take the document-level drag handlers off FIRST — they close
            // over this button (audit item 11 leak fix).
            if (this._dragMoveHandler) {
                document.removeEventListener('mousemove', this._dragMoveHandler);
                this._dragMoveHandler = null;
            }
            if (this._dragEndHandler) {
                document.removeEventListener('mouseup', this._dragEndHandler);
                this._dragEndHandler = null;
            }
            if (this.floatingButton) {
                this.floatingButton.remove();
                this.floatingButton = null;
                console.log("🗑️ Random Target floating button removed");
            }
        },

        // Make button draggable
        makeDraggable(element) {
            let isDragging = false;
            let hasMoved = false;
            let startX, startY, startLeft, startTop;

            element.addEventListener('mousedown', (e) => {
                isDragging = true;
                hasMoved = false;
                startX = e.clientX;
                startY = e.clientY;
                startLeft = parseInt(window.getComputedStyle(element).left, 10);
                startTop = parseInt(window.getComputedStyle(element).top, 10);
                element.style.cursor = 'grabbing';
                e.preventDefault();
            });

            // Document-level handlers are NAMED + stored so the next
            // removeFloatingButton() can take them off. The old code added
            // fresh anonymous mousemove/mouseup listeners on every button
            // recreation (whole-page re-render wiped the button several
            // times per session) and never removed them — a straight
            // document-listener leak (audit item 11).
            this._dragMoveHandler = (e) => {
                if (!isDragging) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                // If movement is significant, mark as moved
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                    hasMoved = true;
                }

                const newLeft = startLeft + dx;
                const newTop = startTop + dy;

                // Keep button within viewport - adjusted for smaller size
                const maxLeft = window.innerWidth - 30;
                const maxTop = window.innerHeight - 30;

                const boundedLeft = Math.max(0, Math.min(newLeft, maxLeft));
                const boundedTop = Math.max(0, Math.min(newTop, maxTop));

                // Use setProperty with 'important' to ensure position stays fixed
                element.style.setProperty('left', boundedLeft + 'px', 'important');
                element.style.setProperty('top', boundedTop + 'px', 'important');
                element.style.setProperty('position', 'fixed', 'important');

                // Update position
                this.buttonPosition = { x: boundedLeft, y: boundedTop };
            };

            this._dragEndHandler = (e) => {
                if (isDragging) {
                    isDragging = false;
                    element.style.cursor = 'grab';

                    // Only save position if the button was actually moved
                    if (hasMoved) {
                        this.saveSettings();
                        console.log(`🎯 Button moved to: ${this.buttonPosition.x}, ${this.buttonPosition.y}`);

                        // Prevent click event if dragged
                        setTimeout(() => {
                            hasMoved = false;
                        }, 50);
                    }
                }
            };

            document.addEventListener('mousemove', this._dragMoveHandler);
            document.addEventListener('mouseup', this._dragEndHandler);

            // Prevent click events if the button was dragged
            element.addEventListener('click', (e) => {
                if (hasMoved) {
                    e.stopPropagation();
                    e.preventDefault();
                    return false;
                }
            });
        },

        // Select random target (single click)
        selectRandomTarget() {
            console.log("🎯 Single click - Ready to attack!");

            // Just show ready message - no target checking or highlighting
            this.showNotification("Random Target Ready", "Double-click to attack a random target", "info");

            // Brief visual feedback
            this.floatingButton.style.background = 'linear-gradient(135deg, #2196F3, #1976D2)';
            this.floatingButton.innerHTML = '👁️';

            // Reset appearance after short delay
            setTimeout(() => {
                this.resetButtonAppearance();
            }, 1000);
        },

        // Attack random target (double click)
        async attackRandomTarget(attempt = 0) {
            console.log("🎯 Finding random target with proper filtering...");

            // Bounded retries (audit item 11): the old code re-called itself
            // with NO cap, so a run of invalid IDs chained dozens of PAID API
            // calls. Cap attempts and back off between them; give up with a
            // clear message instead of recursing forever.
            const MAX_ATTEMPTS = 5;
            if (attempt >= MAX_ATTEMPTS) {
                this.showNotification("Random Target", `No suitable target found after ${MAX_ATTEMPTS} tries — double-click again for another round`, "warning");
                this.resetButtonAppearance();
                return;
            }

            // Use stored configuration — same defaults as loadSettings()
            // (the old inline fallback used 1000/500/1 and silently diverged
            // from the persisted 10/10/0; audit item 11)
            const config = this.config || {
                enableApiChecks: false,
                maxXanax: 10,
                maxRefills: 10,
                maxSEs: 0,
                minID: 1000000,
                maxID: 3400000
            };

            // Get API key if available
            let apiKey = null;
            try {
                apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
            } catch (error) {
                console.log('No API key available for filtering');
            }

            // Generate random user ID
            const randomId = Math.floor(Math.random() * (config.maxID - config.minID + 1)) + config.minID;

            // Visual feedback
            this.floatingButton.style.background = 'linear-gradient(135deg, #FF5722, #F44336)';
            this.floatingButton.innerHTML = '⚔️';

            if (config.enableApiChecks && apiKey) {
                try {
                    console.log(`🔄 Checking user ${randomId} with API... (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
                    // Background proxy (audit item 9): key never in a
                    // page-visible URL / DevTools network log.
                    const res = await new Promise((resolve) => {
                        chrome.runtime.sendMessage({
                            action: 'proxyFetch',
                            url: `https://api.torn.com/user/${randomId}?selections=profile,personalstats&comment=SidekickRandomTarget&key=${encodeURIComponent(apiKey)}`,
                        }, (r) => resolve(r));
                    });
                    if (!res?.success) {
                        console.warn(`⚠️ API transport error for user ${randomId}:`, res?.error);
                        // Skip API checks and proceed anyway
                        this.openAttackPage(randomId);
                        return;
                    }
                    const user = res.data;

                    if (user.error) {
                        console.warn(`⚠️ API error for user ${randomId}:`, user.error);
                        // Skip API checks and proceed anyway
                        this.openAttackPage(randomId);
                        return;
                    }

                    // Check if user is suitable target
                    let isValidTarget = true;
                    let reason = '';

                    // Check user status (not in jail, hospital, etc.)
                    if (user.status && user.status.state !== 'Okay') {
                        isValidTarget = false;
                        reason = `Status: ${user.status.state}`;
                    }

                    // Check personalstats if available
                    if (user.personalstats) {
                        if (user.personalstats.xantaken > config.maxXanax) {
                            isValidTarget = false;
                            reason = `Too many Xanax: ${user.personalstats.xantaken}`;
                        } else if (user.personalstats.refills > config.maxRefills) {
                            isValidTarget = false;
                            reason = `Too many refills: ${user.personalstats.refills}`;
                        } else if (user.personalstats.statenhancersused > config.maxSEs) {
                            isValidTarget = false;
                            reason = `Too many SEs: ${user.personalstats.statenhancersused}`;
                        }
                    }

                    if (isValidTarget) {
                        console.log(`✅ Valid target found: ${randomId}`);
                        this.openAttackPage(randomId);
                    } else {
                        console.log(`❌ Invalid target ${randomId}: ${reason}. Retrying (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`);
                        this.showNotification("Invalid Target", `User ${randomId} skipped: ${reason}`, "warning");
                        // Reset button, then retry with linear backoff
                        setTimeout(() => {
                            this.resetButtonAppearance();
                        }, 500);
                        setTimeout(() => {
                            this.attackRandomTarget(attempt + 1);
                        }, 1000 + attempt * 500);
                    }

                } catch (error) {
                    console.error('❌ Error checking user via API:', error);
                    // Fail open to navigation — but no retry on transport
                    // errors: a blip must not consume another paid API call.
                    this.openAttackPage(randomId);
                }
            } else {
                // No API checks - proceed with random ID
                console.log(`🎯 Opening attack page for random ID: ${randomId} (no filtering)`);
                this.openAttackPage(randomId);
            }
        },

        // Open attack page for specific user ID
        openAttackPage(userId) {
            const attackUrl = `https://www.torn.com/page.php?sid=attack&user2ID=${userId}`;

            console.log("✅ Opening attack page:", attackUrl);

            setTimeout(() => {
                window.location.href = attackUrl;
            }, 300);

            // Reset button appearance after navigation attempt
            setTimeout(() => {
                this.resetButtonAppearance();
            }, 1000);

            this.showNotification("Random Attack", `Attacking random target ID: ${userId}`, "success");
        },

        // Start mutation observer to maintain button on page changes
        startObserver() {
            // (Audit item 11) The old implementation ran a whole-body
            // MutationObserver (childList+subtree on document.body) purely to
            // notice when our own button disappeared — one callback on EVERY
            // DOM change on the page. A 3s existence check is far cheaper and
            // does the same job.
            this.stopObserver();
            this.buttonCheckInterval = setInterval(() => {
                if (this.isEnabled && !document.getElementById('sidekick-random-target-float')) {
                    console.log("🔄 Random Target button missing, recreating...");
                    this.createFloatingButton();
                }
            }, 3000);

            console.log("👀 Random Target button watcher started");
        },

        // Stop button watcher
        stopObserver() {
            if (this.buttonCheckInterval) {
                clearInterval(this.buttonCheckInterval);
                this.buttonCheckInterval = null;
                console.log("🛑 Random Target button watcher stopped");
            }
        },

        // Show notification
        showNotification(title, message, type = 'info') {
            console.log(`🔔 ${type.toUpperCase()}: ${title} - ${message}`);

            // Use Core notification system if available
            if (window.SidekickModules?.Core?.NotificationSystem) {
                // Clear existing notifications to prevent stacking
                window.SidekickModules.Core.NotificationSystem.clearAll();
                window.SidekickModules.Core.NotificationSystem.show(title, message, type, 3000);
            }
        },

        // Reset button appearance to default
        resetButtonAppearance() {
            if (this.floatingButton) {
                this.floatingButton.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
                this.floatingButton.innerHTML = '🎯';
                console.log('🎯 Button appearance reset');
            }
        },

        // Get module status
        getStatus() {
            return {
                isEnabled: this.isEnabled,
                isInitialized: this.isInitialized,
                buttonPosition: this.buttonPosition
            };
        }
    };

    // (Audit item 11) The old highlight/overlay CSS block was removed with the
    // dead findAllAttackTargets/highlightTarget code — no live path referenced it.

    // Initialize global namespace if it doesn't exist
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    // Export Random Target module to global namespace
    window.SidekickModules.RandomTarget = RandomTargetModule;
    console.log("✅ Random Target Module loaded and ready");

})();