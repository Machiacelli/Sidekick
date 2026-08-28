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
        observer: null,
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

            document.addEventListener('mousemove', (e) => {
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
            });

            document.addEventListener('mouseup', (e) => {
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
            });

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
        async attackRandomTarget() {
            console.log("🎯 Finding random target with proper filtering...");

            // Use stored configuration
            const config = this.config || {
                enableApiChecks: false,
                maxXanax: 1000,
                maxRefills: 500,
                maxSEs: 1,
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
                    console.log(`🔄 Checking user ${randomId} with API...`);
                    const response = await fetch(`https://api.torn.com/user/${randomId}?selections=profile,personalstats&key=${apiKey}`);
                    const user = await response.json();

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
                        console.log(`❌ Invalid target ${randomId}: ${reason}. Retrying...`);
                        this.showNotification("Invalid Target", `User ${randomId} skipped: ${reason}`, "warning");
                        // Reset button and retry after short delay
                        setTimeout(() => {
                            this.resetButtonAppearance();
                        }, 500);
                        setTimeout(() => {
                            this.attackRandomTarget();
                        }, 1000);
                    }

                } catch (error) {
                    console.error('❌ Error checking user via API:', error);
                    // Fallback to opening without checks
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

        // Find all possible attack targets on the page
        findAllAttackTargets() {
            const targets = [];

            // Primary attack selectors - more comprehensive
            const attackSelectors = [
                'a[href*="attack"]',
                'a[href*="loader.php?sid=attack"]',
                'button[onclick*="attack"]',
                '.attack-link',
                '.attack-btn',
                'a[href*="profiles.php?XID="]', // Profile links that can be attacked
                'a[href*="/profiles.php"][href*="XID"]',
                '[data-action="attack"]',
                '[onclick*="attack"]'
            ];

            for (const selector of attackSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        if (this.isValidTarget(el)) {
                            targets.push(el);
                        }
                    });
                } catch (error) {
                    console.warn('Error with selector:', selector, error);
                }
            }

            // Also look for any links with user IDs that could be attacked
            if (targets.length === 0) {
                const userLinks = document.querySelectorAll('a[href*="XID="]');
                userLinks.forEach(link => {
                    if (this.isValidTarget(link) && this.couldBeAttackTarget(link)) {
                        targets.push(link);
                    }
                });
            }

            // Remove duplicates based on href or onclick
            const uniqueTargets = targets.filter((target, index, self) => {
                const identifier = target.href || target.onclick?.toString() || target.outerHTML;
                return self.findIndex(t => {
                    const tIdentifier = t.href || t.onclick?.toString() || t.outerHTML;
                    return tIdentifier === identifier;
                }) === index;
            });

            console.log(`🔍 Found ${uniqueTargets.length} unique attack targets`);
            return uniqueTargets;
        },

        // Check if element is a valid target
        isValidTarget(element) {
            if (!element || !element.style) return false;

            // Skip hidden elements
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') {
                return false;
            }

            // Skip disabled elements
            if (element.disabled) return false;

            // Skip our own button
            if (element.id === 'sidekick-random-target-float') return false;

            return true;
        },

        // Check if a user link could be an attack target
        couldBeAttackTarget(element) {
            const href = element.href || '';
            const text = element.textContent || '';
            const parent = element.parentElement;

            // Skip if it's clearly not an attack context
            const excludeTexts = ['yourself', 'profile', 'view', 'details', 'info', 'edit', 'settings'];
            if (excludeTexts.some(exclude => text.toLowerCase().includes(exclude))) {
                return false;
            }

            // Must have a user ID to be attackable
            if (!href.includes('XID=')) {
                return false;
            }

            // Check if in an attack-related context
            if (parent) {
                const parentText = parent.textContent.toLowerCase();
                const attackContext = ['attack', 'enemy', 'target', 'faction', 'war', 'bounty', 'hit'];
                const hasAttackContext = attackContext.some(context => parentText.includes(context));

                // Also check for general user lists that could be attackable
                const userListContext = ['member', 'player', 'user', 'level', 'respect'];
                const hasUserContext = userListContext.some(context => parentText.includes(context));

                return hasAttackContext || hasUserContext;
            }

            // If we can't determine context, assume it's attackable if it has a user ID
            return true;
        },

        // Highlight the selected target
        highlightTarget(target) {
            if (!target) return;

            // Add highlight class for styling
            target.classList.add('sidekick-target-highlight');

            // Create temporary highlight overlay
            const highlight = document.createElement('div');
            highlight.className = 'sidekick-target-overlay';
            highlight.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(76, 175, 80, 0.2);
                border: 2px solid #4CAF50;
                border-radius: 4px;
                pointer-events: none;
                z-index: 10000;
                animation: pulse 1s ease-in-out;
            `;

            // Position overlay over target
            const rect = target.getBoundingClientRect();
            highlight.style.position = 'fixed';
            highlight.style.top = rect.top + 'px';
            highlight.style.left = rect.left + 'px';
            highlight.style.width = rect.width + 'px';
            highlight.style.height = rect.height + 'px';

            document.body.appendChild(highlight);

            // Remove highlight after 2 seconds
            setTimeout(() => {
                target.classList.remove('sidekick-target-highlight');
                if (highlight.parentNode) {
                    highlight.remove();
                }
            }, 2000);
        },

        // Clear all previous highlights
        clearHighlights() {
            const highlights = document.querySelectorAll('.sidekick-target-highlight');
            highlights.forEach(el => el.classList.remove('sidekick-target-highlight'));

            const overlays = document.querySelectorAll('.sidekick-target-overlay');
            overlays.forEach(el => el.remove());
        },

        // Start mutation observer to maintain button on page changes
        startObserver() {
            if (this.observer) {
                this.observer.disconnect();
            }

            this.observer = new MutationObserver((mutations) => {
                // Check if button still exists
                if (this.isEnabled && !document.getElementById('sidekick-random-target-float')) {
                    console.log("🔄 Random Target button missing, recreating...");
                    setTimeout(() => {
                        this.createFloatingButton();
                    }, 500);
                }
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            console.log("👀 Random Target observer started");
        },

        // Stop mutation observer
        stopObserver() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
                console.log("🛑 Random Target observer stopped");
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

    // Add CSS for highlight animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0% { opacity: 0; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.05); }
            100% { opacity: 0.7; transform: scale(1); }
        }
        
        .sidekick-target-highlight {
            background: rgba(76, 175, 80, 0.1) !important;
            outline: 2px solid #4CAF50 !important;
            outline-offset: 2px !important;
        }
    `;
    document.head.appendChild(style);

    // Initialize global namespace if it doesn't exist
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    // Export Random Target module to global namespace
    window.SidekickModules.RandomTarget = RandomTargetModule;
    console.log("✅ Random Target Module loaded and ready");

})();