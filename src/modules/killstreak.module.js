/**
 * Sidekick Chrome Extension - Killstreak Tracker Module
 * Displays the user's current Torn killstreak in a movable, resizable window
 * Version: 1.0.0
 */

(function () {
    'use strict';

    console.log("🔥 Loading Sidekick Killstreak Tracker Module...");

    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    const WINDOW_STORAGE_KEY = 'sidekick_killstreak_window';

    const KillstreakModule = {
        isInitialized: false,
        isEnabled: false,
        window: null,
        windowState: { x: 120, y: 120, width: 200, height: 140, color: '#ff5722', pageId: null },
        killstreak: { current: 0, best: 0 },
        lastUpdated: 0,
        refreshInterval: null,
        compact: false,

        async init() {
            if (this.isInitialized) {
                console.log("🔥 Killstreak Tracker already initialized");
                return;
            }

            console.log("🔥 Initializing Killstreak Tracker Module...");

            try {
                await this.loadSettings();

                const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                if (apiKey) {
                    await this.fetchAndUpdate();
                }

                setInterval(() => this.fetchAndUpdate(), 10 * 60 * 1000);

                if (this.isEnabled) {
                    this.enable();
                }

                this.isInitialized = true;
                console.log("✅ Killstreak Tracker Module initialized successfully");
            } catch (error) {
                console.error("❌ Killstreak Tracker initialization failed:", error);
            }
        },

        async loadSettings() {
            try {
                const windowState = await window.SidekickModules.Core.ChromeStorage.get(WINDOW_STORAGE_KEY);
                if (windowState) {
                    this.windowState = windowState;
                    this.isEnabled = windowState.isEnabled || false;
                    this.compact = windowState.compact || false;
                } else {
                    this.windowState.pageId = window.SidekickModules?.UI?.getActivePageId?.() ?? null;
                }
            } catch (error) {
                console.error("❌ Failed to load Killstreak Tracker settings:", error);
            }
        },

        async saveSettings() {
            try {
                const settings = {
                    ...this.windowState,
                    pageId: this.windowState.pageId ?? window.SidekickModules?.UI?.getActivePageId?.() ?? null,
                    isEnabled: this.isEnabled,
                    compact: this.compact
                };
                await window.SidekickModules.Core.ChromeStorage.set(WINDOW_STORAGE_KEY, settings);
            } catch (error) {
                console.error("❌ Failed to save Killstreak Tracker settings:", error);
            }
        },

        async fetchAndUpdate() {
            try {
                const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                if (!apiKey) {
                    console.warn("🔥 No API key available");
                    return;
                }

                const res = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: 'proxyFetch',
                        url: `https://api.torn.com/v2/user/personalstats?cat=attacking&comment=SidekickKillstreak&key=${encodeURIComponent(apiKey)}`,
                    }, (r) => resolve(r));
                });

                if (!res?.success || res.data?.error) {
                    console.error("🔥 Fetch failed:", res?.error);
                    return;
                }

                const ks = res.data.personalstats?.attacking?.killstreak;
                if (ks) {
                    if (ks.current != null) this.killstreak.current = ks.current;
                    if (ks.best != null) this.killstreak.best = ks.best;
                }
                this.lastUpdated = Date.now();

                console.log("🔥 Killstreak updated:", this.killstreak.current, "(best:", this.killstreak.best + ")");

                if (this.window) {
                    this.refreshDisplay();
                }
            } catch (error) {
                console.error("🔥 Error fetching killstreak:", error);
            }
        },

        enable() {
            console.log("🔥 Enabling Killstreak Tracker...");
            this.isEnabled = true;
            this.saveSettings();
            this.createWindow();

            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
            this.refreshInterval = setInterval(() => {
                if (this.window) {
                    this.fetchAndUpdate();
                }
            }, 60 * 1000);
        },

        disable() {
            console.log("🔥 Disabling Killstreak Tracker...");
            this.isEnabled = false;
            this.saveSettings();
            this.removeWindow();

            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
        },

        async toggle() {
            if (this.isEnabled) {
                this.disable();
            } else {
                this.enable();
            }
            return { success: true, enabled: this.isEnabled };
        },

        createWindow() {
            if (this.window) {
                this.removeWindow();
            }

            const contentArea = window.SidekickModules?.UI?.getPageContentEl?.(this.windowState.pageId) || document.getElementById('sidekick-content');
            if (!contentArea) {
                console.error("🔥 Content area not found");
                return;
            }

            this.windowState.pageId = window.SidekickModules?.UI?.getActivePageId?.() ?? this.windowState.pageId ?? null;
            this.saveSettings();

            this.window = document.createElement('div');
            this.window.className = 'sidekick-killstreak-window';
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
                min-width: 100px;
                min-height: 80px;
                resize: both;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                background: linear-gradient(135deg, ${this.windowState.color || '#ff5722'}, ${this.darkenColor(this.windowState.color || '#ff5722', 15)});
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
            `;
            header.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; overflow: hidden;">
                    <span style="font-weight: 600; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Kill Streak Tracker</span>
                </div>
                <div style="display: flex; align-items: center; gap: 3px; min-width: 32px; flex-shrink: 0;">
                    <button class="cog-btn" style="
                        background: none;
                        border: none;
                        color: rgba(255,255,255,0.8);
                        cursor: pointer;
                        font-size: 10px;
                        padding: 1px 3px;
                        border-radius: 2px;
                        transition: background 0.2s;
                        min-width: 12px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    " title="Options">⚙️</button>
                    <button class="close-btn" style="
                        background: #dc3545;
                        border: none;
                        color: white;
                        cursor: pointer;
                        font-size: 10px;
                        padding: 0;
                        width: 14px;
                        height: 14px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                        transition: all 0.2s;
                        font-weight: bold;
                        flex-shrink: 0;
                        min-width: 14px;
                    " title="Close">×</button>
                </div>
            `;

            const content = document.createElement('div');
            content.className = 'killstreak-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 8px;
                overflow: hidden;
                color: #fff;
                box-sizing: border-box;
                min-width: 0;
            `;

            this.window.appendChild(header);
            this.window.appendChild(content);
            contentArea.appendChild(this.window);

            if (window.SidekickModules?.Core?.WindowManager) {
                window.SidekickModules.Core.WindowManager.registerWindow(this.window, 'Killstreak Tracker');
            }

            this.makeDraggable(header);

            header.querySelector('.close-btn').addEventListener('click', () => {
                this.disable();
            });

            const cogBtn = header.querySelector('.cog-btn');
            cogBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                const existingDropdown = this.window.querySelector('.killstreak-dropdown');
                if (existingDropdown) {
                    existingDropdown.remove();
                    return;
                }

                const dropdown = document.createElement('div');
                dropdown.className = 'killstreak-dropdown';
                const cogBtnRect = cogBtn.getBoundingClientRect();
                dropdown.style.cssText = `
                    position: fixed;
                    top: ${cogBtnRect.bottom + 5}px;
                    left: ${cogBtnRect.right - 140}px;
                    background: #1a1a1a;
                    border: 1px solid #444;
                    border-radius: 4px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    z-index: 999999;
                    min-width: 140px;
                `;

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
                        <span>🔄</span> Refresh Killstreak
                    </button>
                `;

                this.window.appendChild(dropdown);

                const options = dropdown.querySelectorAll('.dropdown-option');
                options.forEach(option => {
                    option.addEventListener('mouseenter', () => {
                        option.style.background = 'rgba(255, 87, 34, 0.2)';
                    });
                    option.addEventListener('mouseleave', () => {
                        option.style.background = 'none';
                    });
                    option.addEventListener('click', async (e) => {
                        const action = option.dataset.action;
                        dropdown.remove();

                        if (action === 'color') {
                            if (window.SidekickModules?.Core?.ColorPicker) {
                                window.SidekickModules.Core.ColorPicker.show(this.windowState.color || '#ff5722', (selectedColor) => {
                                    this.windowState.color = selectedColor;
                                    header.style.background = `linear-gradient(135deg, ${selectedColor}, ${this.darkenColor(selectedColor, 15)})`;
                                    this.saveSettings();
                                });
                            }
                        } else if (action === 'refresh') {
                            console.log('🔥 Manually refreshing killstreak...');
                            await this.fetchAndUpdate();
                            if (window.SidekickModules?.Core?.NotificationSystem) {
                                window.SidekickModules.Core.NotificationSystem.show(
                                    'Killstreak Refreshed',
                                    'Killstreak updated successfully',
                                    'success'
                                );
                            }
                        }
                    });
                });

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

            let isInitializing = true;
            setTimeout(() => { isInitializing = false; }, 500);

            const resizeObserver = new ResizeObserver((entries) => {
                for (let entry of entries) {
                    const { width, height } = entry.contentRect;
                    if (isInitializing) {
                        return;
                    }
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
            console.log("🔥 Killstreak Tracker window created");
        },

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

        refreshDisplay() {
            if (!this.window) return;

            const content = this.window.querySelector('.killstreak-content');

            if (this.compact) {
                content.innerHTML = `
                    <div style="text-align: center; padding: 6px; width: 100%; box-sizing: border-box;">
                        <div style="font-size: 32px; font-weight: bold; color: #ff5722; line-height: 1; cursor: pointer;" id="killstreak-compact-number">${this.killstreak.current}</div>
                    </div>
                `;
                content.querySelector('#killstreak-compact-number').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleCompact();
                });
                return;
            }

            content.innerHTML = `
                <div style="text-align: center; width: 100%; box-sizing: border-box;">
                    <div style="font-size: 11px; font-weight: bold; color: #aaa; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">current kill streak</div>
                    <div style="font-size: 42px; font-weight: bold; color: #ff5722; line-height: 1; cursor: pointer; margin-top: 6px;" id="killstreak-full-number">${this.killstreak.current}</div>
                    <div style="margin-top: 8px; font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        Best: <span style="color: #fff; font-weight: bold;">${this.killstreak.best}</span>
                    </div>
                </div>
            `;
            content.querySelector('#killstreak-full-number').addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCompact();
            });
        },

        toggleCompact() {
            this.compact = !this.compact;
            this.saveSettings();
            this.refreshDisplay();
        },

        async purgePage(pageId) {
            if (pageId == null) return;
            if (this.windowState.pageId != null && String(this.windowState.pageId) === String(pageId)) {
                this.disable();
                this.windowState.pageId = null;
                await this.saveSettings();
                console.log("🔥 Killstreak Tracker purged (its page was deleted)");
            }
        },

        removeWindow() {
            if (this.window) {
                this.window.remove();
                this.window = null;
                console.log("🔥 Killstreak Tracker window removed");
            }

            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
        },

        darkenColor(color, percent) {
            if (!color) return '#e64a19';
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

    window.SidekickModules.Killstreak = KillstreakModule;
    console.log("✅ Killstreak Tracker Module loaded and ready");

})();
