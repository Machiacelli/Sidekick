/**
 * Sidekick Chrome Extension - Core Module
 * Handles storage, notifications, and core functionality
 * Version: 1.0.1 - Fixed context monitoring bug
 */

(function () {
    "use strict";

    // Ensure SidekickModules namespace exists
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    console.log("🔧 Loading Sidekick Core Module...");

    // === CORE STORAGE SYSTEM ===
    const STORAGE_KEYS = {
        NOTEPADS: 'sidekick_notepads',
        TODO_LISTS: 'sidekick_todo_lists',
        ATTACK_LISTS: 'sidekick_attack_lists',
        API_KEY: 'sidekick_api_key',
        SIDEBAR_STATE: 'sidekick_sidebar_state',
        SIDEBAR_WIDTH: 'sidekick_sidebar_width'
    };

    // === NOTIFICATION SYSTEM ===
    const NotificationSystem = {
        notifications: [], // Track active notifications
        baseTop: 20, // Fixed top position for new notifications
        minSpacing: 15, // Minimum spacing between notifications

        show(title, message, type = 'info', duration = 4000) {
            // Prevent duplicate notifications with same message
            const existingNotification = this.notifications.find(n =>
                n.element && n.element.textContent.includes(message)
            );
            if (existingNotification) {
                console.log('🔔 Duplicate notification prevented:', message);
                return;
            }

            // Play notification sound if enabled
            this.playNotificationSound();

            const notification = document.createElement('div');
            notification.className = `sidekick-notification ${type}`;

            // Create unique ID for this notification
            const notificationId = Date.now() + Math.random();
            notification.dataset.notificationId = notificationId;

            notification.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 4px;">${title}</div>
                <div style="font-size: 13px; opacity: 0.9;">${message}</div>
            `;

            // Enhanced notification styles with better positioning
            const baseStyle = `
                position: fixed;
                right: 20px;
                width: 320px;
                max-width: 90vw;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                font-family: Arial, sans-serif;
                font-size: 14px;
                line-height: 1.4;
                cursor: pointer;
                transform: translateX(100%);
                transition: all 0.3s ease;
                backdrop-filter: blur(5px);
            `;

            const typeStyles = {
                'info': baseStyle + 'background: rgba(33, 150, 243, 0.95); color: white; padding: 16px;',
                'success': baseStyle + 'background: rgba(76, 175, 80, 0.95); color: white; padding: 16px;',
                'warning': baseStyle + 'background: rgba(255, 152, 0, 0.95); color: white; padding: 16px;',
                'error': baseStyle + 'background: rgba(244, 67, 54, 0.95); color: white; padding: 16px;'
            };

            notification.style.cssText = typeStyles[type] || typeStyles['info'];

            // Calculate position for new notification
            const newPosition = this.calculateNewNotificationPosition();
            notification.style.top = newPosition + 'px';
            notification.style.zIndex = 999999 + this.notifications.length;

            // Add click to dismiss functionality
            notification.addEventListener('click', () => {
                this.removeNotification(notificationId);
            });

            // Add to DOM and trigger slide-in animation
            document.body.appendChild(notification);

            // Trigger slide-in animation
            requestAnimationFrame(() => {
                notification.style.transform = 'translateX(0)';
            });

            // Add new notification to array
            this.notifications.push({
                id: notificationId,
                element: notification,
                position: newPosition
            });

            // Auto remove with repositioning
            setTimeout(() => {
                this.removeNotification(notificationId);
            }, duration);
        },
        async playNotificationSound() {
            try {
                const settings = await ChromeStorage.get('sidekick_notification_prefs') || {};
                if (settings.soundEnabled) {
                    const soundUrl = chrome.runtime.getURL('assets/sounds/NotificationSound1.mp3');
                    const audio = new Audio(soundUrl);
                    audio.volume = 0.5; // 50% volume
                    audio.play().catch(err => console.debug('Sound play failed:', err));
                }
            } catch (error) {
                console.debug('Failed to play notification sound:', error);
            }
        },

        calculateNewNotificationPosition() {
            if (this.notifications.length === 0) {
                return this.baseTop;
            }

            // Find the bottom-most notification and add spacing
            let maxBottom = this.baseTop;
            this.notifications.forEach(notification => {
                if (notification.element && notification.element.parentNode) {
                    const rect = notification.element.getBoundingClientRect();
                    const currentBottom = notification.position + rect.height;
                    maxBottom = Math.max(maxBottom, currentBottom);
                }
            });

            return maxBottom + this.minSpacing;
        },

        removeNotification(notificationId) {
            const notificationIndex = this.notifications.findIndex(n => n.id === notificationId);
            if (notificationIndex === -1) return;

            const notification = this.notifications[notificationIndex];

            // Animate out
            if (notification.element && notification.element.parentNode) {
                notification.element.style.transform = 'translateX(100%)';
                notification.element.style.opacity = '0';

                setTimeout(() => {
                    if (notification.element && notification.element.parentNode) {
                        notification.element.parentNode.removeChild(notification.element);
                    }

                    // Re-lookup the index now (array may have shifted during animation)
                    const currentIndex = this.notifications.findIndex(n => n.id === notificationId);
                    if (currentIndex !== -1) {
                        this.notifications.splice(currentIndex, 1);
                    }

                    // Reposition remaining notifications to fill gaps
                    this.repositionNotifications();
                }, 300);
            } else {
                // Remove from array if element is already gone
                this.notifications.splice(notificationIndex, 1);
            }
        },

        repositionNotifications() {
            // Clean up dead notifications first
            this.notifications = this.notifications.filter(n =>
                n.element && n.element.parentNode
            );

            // Reposition all notifications from top to bottom with proper spacing
            let currentTop = this.baseTop;

            this.notifications.forEach((notification, index) => {
                if (notification.element && notification.element.parentNode) {
                    const targetTop = currentTop;

                    // Only animate if position actually changed
                    if (notification.position !== targetTop) {
                        notification.position = targetTop;
                        notification.element.style.transition = 'top 0.3s ease';
                        notification.element.style.top = targetTop + 'px';
                    }

                    // Calculate next position
                    const rect = notification.element.getBoundingClientRect();
                    currentTop += rect.height + this.minSpacing;
                }
            });
        },

        // Clear all existing notifications
        clearAll() {
            this.notifications.forEach(notification => {
                if (notification.element && notification.element.parentNode) {
                    notification.element.parentNode.removeChild(notification.element);
                }
            });
            this.notifications = [];
        }
    };
    // === CHROME STORAGE WRAPPER ===
    const ChromeStorage = {
        // Get data from Chrome storage
        async get(key) {
            return new Promise((resolve, reject) => {
                // Check if extension context is valid
                try {
                    if (chrome?.runtime?.id === undefined) {
                        // Silently fall back to localStorage when extension context is invalidated
                        resolve(JSON.parse(localStorage.getItem(key) || 'null'));
                        return;
                    }
                } catch (error) {
                    // Silently fall back to localStorage when Chrome runtime check fails
                    resolve(JSON.parse(localStorage.getItem(key) || 'null'));
                    return;
                }

                if (chrome?.storage?.local) {
                    try {
                        chrome.storage.local.get([key], (result) => {
                            if (chrome.runtime.lastError) {
                                const errorMsg = chrome.runtime.lastError.message || 'Chrome storage error';
                                if (errorMsg.includes('Extension context invalidated')) {
                                    console.debug("Extension context invalidated during get, using localStorage");
                                    resolve(JSON.parse(localStorage.getItem(key) || 'null'));
                                } else {
                                    reject(new Error(errorMsg));
                                }
                            } else {
                                resolve(result[key]);
                            }
                        });
                    } catch (error) {
                        if (error.message && error.message.includes('Extension context invalidated')) {
                            console.debug("Extension context invalidated, using localStorage fallback");
                            resolve(JSON.parse(localStorage.getItem(key) || 'null'));
                        } else {
                            reject(error);
                        }
                    }
                } else {
                    console.debug("Chrome storage not available, using localStorage");
                    resolve(JSON.parse(localStorage.getItem(key) || 'null'));
                }
            });
        },

        // Set data in Chrome storage
        async set(key, value) {
            return new Promise((resolve, reject) => {
                // Check if extension context is valid
                try {
                    if (chrome?.runtime?.id === undefined) {
                        // Silently fall back to localStorage when extension context is invalidated
                        console.debug("Extension context invalidated, using localStorage fallback");
                        localStorage.setItem(key, JSON.stringify(value));
                        resolve();
                        return;
                    }
                } catch (error) {
                    console.debug("Chrome runtime check failed, using localStorage fallback");
                    localStorage.setItem(key, JSON.stringify(value));
                    resolve();
                    return;
                }

                if (chrome?.storage?.local) {
                    try {
                        chrome.storage.local.set({ [key]: value }, () => {
                            if (chrome.runtime.lastError) {
                                const errorMsg = chrome.runtime.lastError.message || 'Chrome storage error';
                                if (errorMsg.includes('Extension context invalidated')) {
                                    console.debug("Extension context invalidated during set, using localStorage");
                                    localStorage.setItem(key, JSON.stringify(value));
                                    resolve();
                                } else {
                                    reject(new Error(errorMsg));
                                }
                            } else {
                                resolve();
                            }
                        });
                    } catch (error) {
                        if (error.message && error.message.includes('Extension context invalidated')) {
                            console.debug("Extension context invalidated, using localStorage fallback");
                            localStorage.setItem(key, JSON.stringify(value));
                            resolve();
                        } else {
                            reject(error);
                        }
                    }
                } else {
                    console.debug("Chrome storage not available, using localStorage");
                    localStorage.setItem(key, JSON.stringify(value));
                    resolve();
                }
            });
        },

        // Remove data from Chrome storage
        async remove(key) {
            return new Promise((resolve, reject) => {
                // Check if extension context is valid
                try {
                    if (chrome?.runtime?.id === undefined) {
                        console.debug("Extension context invalidated, using localStorage fallback");
                        localStorage.removeItem(key);
                        resolve();
                        return;
                    }
                } catch (error) {
                    console.debug("Chrome runtime check failed, using localStorage fallback");
                    localStorage.removeItem(key);
                    resolve();
                    return;
                }

                if (chrome?.storage?.local) {
                    try {
                        chrome.storage.local.remove([key], () => {
                            if (chrome.runtime.lastError) {
                                const errorMsg = chrome.runtime.lastError.message || 'Chrome storage error';
                                if (errorMsg.includes('Extension context invalidated')) {
                                    console.debug("Extension context invalidated during remove, using localStorage");
                                    localStorage.removeItem(key);
                                    resolve();
                                } else {
                                    reject(new Error(errorMsg));
                                }
                            } else {
                                resolve();
                            }
                        });
                    } catch (error) {
                        if (error.message && error.message.includes('Extension context invalidated')) {
                            console.debug("Extension context invalidated, using localStorage fallback");
                            localStorage.removeItem(key);
                            resolve();
                        } else {
                            reject(error);
                        }
                    }
                } else {
                    console.debug("Chrome storage not available, using localStorage");
                    localStorage.removeItem(key);
                    resolve();
                }
            });
        },

        // Clear all storage
        async clear() {
            return new Promise((resolve, reject) => {
                // Check if extension context is valid
                try {
                    if (chrome?.runtime?.id === undefined) {
                        console.debug("Extension context invalidated, using localStorage fallback");
                        localStorage.clear();
                        resolve();
                        return;
                    }
                } catch (error) {
                    console.debug("Chrome runtime check failed, using localStorage fallback");
                    localStorage.clear();
                    resolve();
                    return;
                }

                if (chrome?.storage?.local) {
                    try {
                        chrome.storage.local.clear(() => {
                            if (chrome.runtime.lastError) {
                                const errorMsg = chrome.runtime.lastError.message || 'Chrome storage error';
                                if (errorMsg.includes('Extension context invalidated')) {
                                    console.debug("Extension context invalidated during clear, using localStorage");
                                    localStorage.clear();
                                    resolve();
                                } else {
                                    reject(new Error(errorMsg));
                                }
                            } else {
                                resolve();
                            }
                        });
                    } catch (error) {
                        if (error.message && error.message.includes('Extension context invalidated')) {
                            console.debug("Extension context invalidated, using localStorage fallback");
                            localStorage.clear();
                            resolve();
                        } else {
                            reject(error);
                        }
                    }
                } else {
                    console.debug("Chrome storage not available, using localStorage");
                    localStorage.clear();
                    resolve();
                }
            });
        }
    };

    // === EXTENSION CONTEXT MONITOR ===
    const ExtensionContextMonitor = {
        isMonitoring: false,
        monitorInterval: null,
        lastKnownState: null,

        // Start monitoring extension context
        startMonitoring() {
            if (this.isMonitoring) return;

            console.log('🔍 Starting extension context monitoring...');
            this.isMonitoring = true;
            this.lastKnownState = SafeMessageSender.isExtensionContextValid();

            this.monitorInterval = setInterval(() => {
                this.checkContextState();
            }, 5000); // Check every 5 seconds
        },

        // Stop monitoring
        stopMonitoring() {
            if (this.monitorInterval) {
                clearInterval(this.monitorInterval);
                this.monitorInterval = null;
            }
            this.isMonitoring = false;
        },

        // Check current context state
        async checkContextState() {
            const currentState = SafeMessageSender.isExtensionContextValid();

            if (this.lastKnownState === true && currentState === false) {
                console.debug('🔄 Extension context invalidation detected by monitor');
                console.debug('📍 Context:', window.location.href);
                console.debug('🔗 Stack trace:', new Error().stack);

                // Try recovery once automatically (silently)
                const recovered = await SafeMessageSender.attemptContextRecovery();
                if (recovered) {
                    this.lastKnownState = true;
                    console.debug('✅ Extension context auto-recovered');
                    // Re-expose global functions after recovery
                    SafeMessageSender.reExposeGlobalFunctions();
                } else {
                    this.lastKnownState = false;

                    // Notify user about context loss
                    if (window.SidekickModules?.Core?.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show(
                            'Extension Connection Lost',
                            'Some features may not work. Click to refresh page.',
                            'warning',
                            0,
                            () => { window.location.reload(); }
                        );
                    }
                }
            } else if (this.lastKnownState === false && currentState === true) {
                console.log('✅ Extension context restored');
                this.lastKnownState = true;

                if (window.SidekickModules?.Core?.NotificationSystem) {
                    window.SidekickModules.Core.NotificationSystem.show(
                        'Extension Reconnected',
                        'Extension connection has been restored.',
                        'success',
                        3000
                    );
                }
            }
        }
    };

    // === SAFE MESSAGE SENDER ===
    const SafeMessageSender = {
        // Safely send message to background script with extension context handling
        async sendToBackground(message, timeout = 30000, retryCount = 2) {
            let lastError = null;

            for (let attempt = 0; attempt < retryCount; attempt++) {
                try {
                    return await new Promise((resolve, reject) => {
                        try {
                            // Check if extension context is valid
                            if (!chrome?.runtime?.id) {
                                const error = new Error('Extension context invalidated');
                                console.debug(`🔄 Extension context check failed (attempt ${attempt + 1}/${retryCount}):`, message.action);
                                reject(error);
                                return;
                            }

                            const timeoutId = setTimeout(() => {
                                reject(new Error(`Background script timeout after ${timeout}ms`));
                            }, timeout);

                            chrome.runtime.sendMessage(message, (response) => {
                                clearTimeout(timeoutId);

                                if (chrome.runtime.lastError) {
                                    const error = chrome.runtime.lastError.message;
                                    console.warn(`🔄 Runtime error (attempt ${attempt + 1}/${retryCount}):`, error);

                                    if (error.includes('Extension context invalidated') || error.includes('receiving end does not exist')) {
                                        reject(new Error('Extension context invalidated'));
                                    } else {
                                        reject(new Error(error));
                                    }
                                } else if (!response) {
                                    reject(new Error('No response from background script'));
                                } else {
                                    resolve(response);
                                }
                            });
                        } catch (error) {
                            console.warn(`🔄 Message send failed (attempt ${attempt + 1}/${retryCount}):`, error);
                            reject(error);
                        }
                    });
                } catch (error) {
                    lastError = error;

                    if (error.message.includes('Extension context invalidated')) {
                        console.debug(`🔄 Extension context lost on attempt ${attempt + 1}/${retryCount}`);

                        // Wait a bit before retrying
                        if (attempt < retryCount - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            console.log(`🔄 Retrying message send (${attempt + 2}/${retryCount})...`);
                        }
                    } else {
                        // Non-context errors should not be retried
                        break;
                    }
                }
            }

            // All retries failed
            if (lastError?.message.includes('Extension context invalidated')) {
                this.showExtensionReloadNotification();
            }

            throw lastError;
        },

        // Check if extension context is valid
        isExtensionContextValid() {
            try {
                return !!(chrome?.runtime?.id);
            } catch (error) {
                return false;
            }
        },

        // Show user-friendly notification about extension reload
        showExtensionReloadNotification() {
            // Try to recover connection first
            this.attemptContextRecovery()
                .then((recovered) => {
                    if (!recovered) {
                        this.showReloadPrompt();
                    } else {
                        console.log('✅ Extension context recovered successfully');
                        if (window.SidekickModules?.Core?.NotificationSystem) {
                            window.SidekickModules.Core.NotificationSystem.show(
                                'Connection Restored',
                                'Extension connection has been restored.',
                                'success',
                                3000
                            );
                        }
                    }
                })
                .catch(() => {
                    this.showReloadPrompt();
                });
        },

        // Attempt to recover extension context
        async attemptContextRecovery() {
            console.log('🔄 Attempting to recover extension context...');

            for (let attempt = 1; attempt <= 3; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));

                try {
                    // Test if extension context is working
                    const testResponse = await chrome.runtime.sendMessage({ action: 'ping' });
                    if (testResponse?.success) {
                        console.log(`✅ Extension context recovered on attempt ${attempt}`);
                        return true;
                    }
                } catch (error) {
                    console.log(`❌ Recovery attempt ${attempt} failed:`, error.message);
                }
            }

            return false;
        },

        // Show immediate context loss notification (silent debug mode)
        showContextLossNotification() {
            console.debug('🔄 Extension context invalidated - using localStorage fallback');
            console.debug('📋 This typically happens when:');
            console.debug('   - Extension was updated/reloaded');
            console.debug('   - Extension permissions changed');
            console.debug('   - Chrome updated the extension');
            console.debug('💡 Note: Functionality continues via localStorage fallback');
        },

        // Re-expose global functions after context recovery
        reExposeGlobalFunctions() {
            // MV3 blocks inline page scripts. The recovery itself is complete at
            // this point; these console-only helpers are not required by Sidekick.
            console.debug('🔧 Extension context recovered; no page injection required');
        },

        // Show reload prompt
        showReloadPrompt() {
            if (window.SidekickModules?.Core?.NotificationSystem) {
                window.SidekickModules.Core.NotificationSystem.show(
                    'Extension Connection Lost',
                    'Extension needs to reconnect. Click here to refresh the page.',
                    'error',
                    0, // No auto-dismiss
                    () => { window.location.reload(); }
                );
            } else {
                // Fallback notification if NotificationSystem isn't available
                console.debug('🔄 Extension context lost - please refresh the page');
                if (confirm('Extension connection lost. Refresh the page to restore functionality?')) {
                    window.location.reload();
                }
            }
        },

        // Test extension connectivity (debug function)
        async testExtensionConnection() {
            console.log('🔍 Testing extension connection...');

            try {
                const isValid = this.isExtensionContextValid();
                console.log(`Context valid: ${isValid}`);

                if (!isValid) {
                    console.log('⚠️ Context invalid, attempting recovery...');
                    const recovered = await this.attemptContextRecovery();
                    console.log(`Recovery result: ${recovered}`);
                    return recovered;
                }

                // Test actual message sending
                const testResponse = await chrome.runtime.sendMessage({ action: 'ping' });
                console.log('✅ Extension connection test successful:', testResponse);
                return true;

            } catch (error) {
                console.error('❌ Extension connection test failed:', error);
                return false;
            }
        }
    };

    // === WINDOW MANAGER ===
    const WindowManager = {
        currentZIndex: 1000,

        // Bring window to front by incrementing z-index
        bringToFront(element) {
            if (!element) return;
            this.currentZIndex++;
            element.style.zIndex = this.currentZIndex;
            console.log(`🔝 Brought window to front: z-index ${this.currentZIndex}`);
        },

        // Register a window for click-to-front behavior
        registerWindow(element, moduleName = 'Unknown') {
            if (!element) {
                console.warn('⚠️ WindowManager: Cannot register null element');
                return;
            }

            element.addEventListener('mousedown', (e) => {
                // Don't interfere with buttons or inputs
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

                this.bringToFront(element);
            });

            console.log(`✅ WindowManager: Registered ${moduleName} window`);
        }
    };

    // === DEBOUNCE UTILITY ===
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // === STATE MANAGER ===
    const StateManager = {
        // Debounced save functions cache
        debouncedSaves: {},

        // Save module state with optional debouncing
        async saveModuleState(moduleId, state, debounceMs = 0) {
            const key = `sidekick_${moduleId}_state`;

            if (debounceMs > 0) {
                // Create debounced function if doesn't exist
                if (!this.debouncedSaves[moduleId]) {
                    this.debouncedSaves[moduleId] = debounce(async (stateToSave) => {
                        await ChromeStorage.set(key, stateToSave);
                        console.log(`[StateManager] Saved ${moduleId} state`);
                    }, debounceMs);
                }

                // Call debounced function
                this.debouncedSaves[moduleId](state);
            } else {
                // Immediate save
                await ChromeStorage.set(key, state);
                console.log(`[StateManager] Saved ${moduleId} state`);
            }
        },

        // Load module state
        async loadModuleState(moduleId, defaultState = {}) {
            const key = `sidekick_${moduleId}_state`;
            const state = await ChromeStorage.get(key);
            return state || defaultState;
        },

        // Save window geometry (position + size)
        async saveWindowGeometry(moduleId, element, debounceMs = 500) {
            if (!element) return;

            const rect = element.getBoundingClientRect();
            const geometry = {
                position: {
                    x: Math.round(rect.left + window.scrollX),
                    y: Math.round(rect.top + window.scrollY)
                },
                size: {
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                }
            };

            // Load existing state and merge with new geometry
            const existingState = await this.loadModuleState(moduleId);
            await this.saveModuleState(moduleId, { ...existingState, geometry }, debounceMs);
        },

        // Restore window geometry with bounds checking
        restoreWindowGeometry(element, geometry) {
            if (!element || !geometry) return false;

            const { position, size } = geometry;
            if (!position) return false;

            // Get screen dimensions
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            // Get element dimensions (use saved or current)
            const width = size?.width || element.offsetWidth || 300;
            const height = size?.height || element.offsetHeight || 200;

            // Bounds checking - ensure window is on screen
            // Keep at least 50px of the window visible
            const minVisible = 50;
            const maxX = Math.max(0, screenWidth - minVisible);
            const maxY = Math.max(0, screenHeight - minVisible);

            const safeX = Math.max(-width + minVisible, Math.min(position.x, maxX));
            const safeY = Math.max(0, Math.min(position.y, maxY));

            // Apply position
            element.style.left = `${safeX}px`;
            element.style.top = `${safeY}px`;

            // Apply size if available
            if (size) {
                element.style.width = `${width}px`;
                element.style.height = `${height}px`;
            }

            console.log(`[StateManager] Restored geometry: ${safeX},${safeY} ${width}x${height}`);
            return true;
        },

        // Clear module state
        async clearModuleState(moduleId) {
            const key = `sidekick_${moduleId}_state`;
            await ChromeStorage.remove(key);
            console.log(`[StateManager] Cleared ${moduleId} state`);
        }
    };

    // === COLOR PICKER UTILITY ===
    const ColorPicker = {
        // Shared color palette for all modules
        colors: [
            // Greens and blues
            '#4CAF50', '#2196F3', '#00BCD4', '#8BC34A',
            // Oranges and reds
            '#FF9800', '#f44336', '#E91E63', '#FF5722',
            // Purples and pinks
            '#9C27B0', '#673AB7', '#E91E63', '#FF4081',
            // Yellows and ambers
            '#FFC107', '#FFEB3B', '#FFD54F', '#FFA726',
            // Grays and neutrals
            '#607D8B', '#795548', '#BDBDBD', '#9E9E9E',
            // Dark and light
            '#333', '#424242', '#FFFFFF', '#E0E0E0'
        ],

        // Show color picker and return selected color
        show(currentColor, onColorSelected) {
            // Remove any existing color picker
            const existingPicker = document.querySelector('.sidekick-color-picker');
            if (existingPicker) existingPicker.remove();

            const colorPicker = document.createElement('div');
            colorPicker.className = 'sidekick-color-picker';
            colorPicker.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #333;
                border: 1px solid #555;
                border-radius: 8px;
                padding: 16px;
                z-index: 999999;
                display: grid;
                grid-template-columns: repeat(4, 30px);
                gap: 8px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            `;

            this.colors.forEach(color => {
                const colorBtn = document.createElement('div');
                colorBtn.style.cssText = `
                    width: 30px;
                    height: 30px;
                    background: ${color};
                    border: 2px solid ${currentColor === color ? '#fff' : '#666'};
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                `;

                colorBtn.addEventListener('click', () => {
                    onColorSelected(color);
                    colorPicker.remove();
                });

                colorBtn.addEventListener('mouseenter', () => {
                    colorBtn.style.transform = 'scale(1.1)';
                });

                colorBtn.addEventListener('mouseleave', () => {
                    colorBtn.style.transform = 'scale(1)';
                });

                colorPicker.appendChild(colorBtn);
            });

            document.body.appendChild(colorPicker);

            // Close when clicking outside
            setTimeout(() => {
                document.addEventListener('click', function closeColorPicker(e) {
                    if (!colorPicker.contains(e.target)) {
                        colorPicker.remove();
                        document.removeEventListener('click', closeColorPicker);
                    }
                });
            }, 100);
        },

        // Utility to darken a color
        darkenColor(color, percent) {
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

    // === SHARED MODULE SETTINGS HELPER ===
    /**
     * Factory that returns load/save/toggle helpers for a module's isEnabled flag.
     * All modules should store their toggle state under:
     *   sidekick_settings[moduleKey].isEnabled
     *
     * @param {string} moduleKey  - The key used in sidekick_settings (e.g. 'bunker-bucks')
     * @param {boolean} defaultEnabled - Default value if not yet stored (default: false)
     * @returns {{ load, save, toggle }}
     */
    function ModuleSettingsHelper(moduleKey, defaultEnabled = false) {
        const SETTINGS_KEY = 'sidekick_settings';

        return {
            /**
             * Load isEnabled from storage.
             * @returns {Promise<boolean>}
             */
            async load() {
                try {
                    const all = await ChromeStorage.get(SETTINGS_KEY);
                    if (all && all[moduleKey] !== undefined) {
                        return all[moduleKey].isEnabled !== false;
                    }
                    return defaultEnabled;
                } catch (e) {
                    console.warn(`[ModuleSettingsHelper] Failed to load "${moduleKey}":`, e);
                    return defaultEnabled;
                }
            },

            /**
             * Save isEnabled (and optionally extra fields) to storage.
             * @param {boolean} enabled
             * @param {object} [extra] - Additional settings to merge into the module's slot
             */
            async save(enabled, extra = {}) {
                try {
                    const all = await ChromeStorage.get(SETTINGS_KEY) || {};
                    all[moduleKey] = Object.assign({}, all[moduleKey] || {}, extra, { isEnabled: enabled });
                    await ChromeStorage.set(SETTINGS_KEY, all);
                } catch (e) {
                    console.error(`[ModuleSettingsHelper] Failed to save "${moduleKey}":`, e);
                }
            },

            /**
             * Toggle isEnabled and persist.
             * @param {boolean} currentValue - The current isEnabled state to flip
             * @returns {Promise<boolean>} new value
             */
            async toggle(currentValue) {
                const next = !currentValue;
                await this.save(next);
                return next;
            }
        };
    }

    // === CORE MODULE EXPORT ===
    const CoreModule = {
        STORAGE_KEYS,
        NotificationSystem,
        ChromeStorage,
        SafeMessageSender,
        ExtensionContextMonitor,
        WindowManager,
        StateManager,
        ColorPicker,
        ModuleSettingsHelper,

        async init() {
            console.log("🔧 Initializing Core Module...");

            // Start extension context monitoring
            ExtensionContextMonitor.startMonitoring();

            const apiKey = await ChromeStorage.get(STORAGE_KEYS.API_KEY);
            if (!apiKey && !sessionStorage.getItem('sidekick_api_alert_shown')) {
                sessionStorage.setItem('sidekick_api_alert_shown', '1');
                setTimeout(() => {
                    if (window.SidekickModules.UI?.showNotification) {
                        window.SidekickModules.UI.showNotification('Sidekick Needs an API Key', 'Most features require an API key to work correctly.', 'warning', 6000);
                    } else {
                        NotificationSystem.show('Sidekick Needs an API Key', 'Most features require an API key to work correctly.', 'warning', 6000);
                    }
                }, 2000);
            }

            console.log("✅ Core Module initialized successfully");
            return true;
        }
    };

    // Export to global namespace
    window.SidekickModules.Core = CoreModule;

    // Ensure ChromeStorage is immediately accessible
    Object.defineProperty(window.SidekickModules.Core, 'ChromeStorage', {
        value: ChromeStorage,
        writable: false,
        enumerable: true,
        configurable: false
    });

    console.log("✅ Core Module loaded and ready");
    console.log("🔍 CoreModule contents:", Object.keys(CoreModule));
    console.log("🔍 ChromeStorage available:", !!CoreModule.ChromeStorage);
    console.log("🔍 Direct access test:", !!window.SidekickModules.Core.ChromeStorage);

})();
