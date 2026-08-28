/**
 * Sidekick Chrome Extension - Halloween Helper Module
 * Stores and manages the Halloween target list.
 */

(function () {
    "use strict";

    const STORAGE_KEY = "sidekick_halloween";

    const DEFAULT_DATA = {
        isEnabled: false,
        targets: []
    };

    const HalloweenHelperModule = {
        isInitialized: false,
        data: structuredClone(DEFAULT_DATA),

        async init() {
            if (this.isInitialized) return;

            console.log("🎃 Initializing Halloween Helper...");

            try {
                await this.waitForCore();
                await this.load();

                this.isInitialized = true;

                console.log("✅ Halloween Helper initialized");
            } catch (error) {
                console.error("❌ Halloween Helper failed to initialize:", error);
            }
        },

        waitForCore() {
            return new Promise(resolve => {
                const check = () => {
                    if (window.SidekickModules?.Core?.ChromeStorage) {
                        resolve();
                    } else {
                        setTimeout(check, 100);
                    }
                };

                check();
            });
        },

        async load() {
            const saved = await window.SidekickModules.Core.ChromeStorage.get(STORAGE_KEY);

            this.data = {
                ...structuredClone(DEFAULT_DATA),
                ...(saved || {})
            };
        },

        async save() {
            await window.SidekickModules.Core.ChromeStorage.set(
                STORAGE_KEY,
                this.data
            );
        },

        async setEnabled(enabled) {
            this.data.isEnabled = !!enabled;
            await this.save();
        },

        isEnabled() {
            return this.data.isEnabled;
        },

        getTargets() {
            return [...this.data.targets];
        },

        hasTarget(id) {
            return this.data.targets.some(t => t.id === id);
        },

        async addTarget(id, username) {
            id = parseInt(id, 10);
            if (!this.data.targets.find(t => t.id === id)) {
                let lastAttacked = null;

                try {
                    const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                    if (apiKey) {
                        const response = await fetch(`https://api.torn.com/user/?selections=attacks&key=${apiKey}`);
                        const data = await response.json();
                        if (data && data.attacks) {
                            // Find the most recent attack where the defender is this target
                            const attacks = Object.values(data.attacks);
                            const targetAttacks = attacks.filter(a => a.defender_id === id);
                            if (targetAttacks.length > 0) {
                                // Sort descending by timestamp
                                targetAttacks.sort((a, b) => b.timestamp_ended - a.timestamp_ended);
                                const latest = targetAttacks[0];
                                lastAttacked = new Date(latest.timestamp_ended * 1000).toLocaleString();
                            }
                        }
                    }
                } catch (e) {
                    console.error('Sidekick Halloween: Failed to fetch recent attacks', e);
                }

                this.data.targets.push({
                    id,
                    username,
                    lastAttacked
                });
                await window.SidekickModules.Core.ChromeStorage.set(STORAGE_KEY, this.data);
                this.refreshUI();
                return true;
            }
            return false;
        },

        async removeTarget(id) {
            const before = this.data.targets.length;

            this.data.targets = this.data.targets.filter(
                t => t.id !== Number(id)
            );

            if (before !== this.data.targets.length) {
                await this.save();
                this.refreshUI();
                return true;
            }

            return false;
        },

        async clearTargets() {
            this.data.targets = [];
            await this.save();
            this.refreshUI();
        },

        openWindow() {
            if (this._halloweenWindow && !this._halloweenWindow.closed) {
                this._halloweenWindow.focus();
                this.refreshUI();
                return;
            }

            this._halloweenWindow = window.open('', 'HalloweenTargets', 'width=350,height=500,resizable=yes,scrollbars=yes');
            if (this._halloweenWindow) {
                this._halloweenWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>🎃 Halloween Targets</title>
                        <style>
                            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #222; color: #fff; margin: 0; padding: 15px; }
                            h3 { margin-top: 0; }
                            .target-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255,255,255,0.05); margin-bottom: 8px; border-radius: 6px; }
                            .target-name { font-weight: bold; font-size: 14px; }
                            .target-attacked { font-size: 11px; color: #aaa; margin-top: 3px; }
                            .remove-btn { background: rgba(244,67,54,0.15); border: 1px solid rgba(244,67,54,0.3); color: #F44336; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px; }
                            .remove-btn:hover { background: rgba(244,67,54,0.25); }
                            .clear-btn { width: 100%; margin-top: 15px; padding: 8px; background: rgba(244,67,54,0.15); border: 1px solid rgba(244,67,54,0.3); color: #F44336; border-radius: 4px; cursor: pointer; font-weight: bold; }
                            .clear-btn:hover { background: rgba(244,67,54,0.25); }
                            .empty-state { text-align: center; color: #aaa; padding: 20px; font-style: italic; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <h3>🎃 Halloween Targets</h3>
                        <div id="target-list"></div>
                        <div style="display: flex; gap: 10px; margin-top: 15px;">
                            <button id="refresh-btn" class="clear-btn" style="background: rgba(33,150,243,0.15); border: 1px solid rgba(33,150,243,0.3); color: #2196F3;">Refresh</button>
                            <button id="clear-btn" class="clear-btn" style="margin-top: 0;">Clear List</button>
                        </div>
                    </body>
                    </html>
                `);
                this._halloweenWindow.document.close();

                // Attach button listeners directly from parent
                this._halloweenWindow.document.getElementById('refresh-btn').addEventListener('click', () => {
                    this.refreshUI();
                });
                
                this._halloweenWindow.document.getElementById('clear-btn').addEventListener('click', () => {
                    if (this._halloweenWindow.confirm('Clear all Halloween targets?')) {
                        this.clearTargets();
                    }
                });
            }

            this.refreshUI();
        },

        refreshUI() {
            const settingsList = document.getElementById('skp-halloween-targets-list');
            
            const html = this.data.targets.length === 0 
                ? '<div style="text-align:center; color:#aaa; padding:10px; font-style:italic; font-size:11px;">Add targets with the Sidekick button located on the users profile</div>'
                : this.data.targets.map(t => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px; background: rgba(255,255,255,0.05); margin-bottom: 5px; border-radius: 4px;" class="target-item">
                        <div>
                            <div style="font-weight:bold; color: #fff;" class="target-name">
                                <a href="https://www.torn.com/profiles.php?XID=${t.id}" target="_blank" style="color: #4CAF50; text-decoration: none;">${t.username} [${t.id}]</a>
                            </div>
                            <div style="font-size: 10px; color: #aaa;" class="target-attacked">Last Attacked: ${t.lastAttacked || 'Never'}</div>
                        </div>
                        <button class="sk-halloween-remove-btn remove-btn" data-id="${t.id}" style="background:rgba(244,67,54,0.15); border:1px solid rgba(244,67,54,0.3); color:#F44336; border-radius:4px; padding:4px 8px; cursor:pointer; font-size:11px;">Remove</button>
                    </div>
                `).join('');

            // Update settings list
            if (settingsList) {
                settingsList.innerHTML = html;
                this._attachRemoveListeners(settingsList);
            }

            // Update popup window
            if (this._halloweenWindow && !this._halloweenWindow.closed) {
                const winList = this._halloweenWindow.document.getElementById('target-list');
                if (winList) {
                    if (this.data.targets.length === 0) {
                        winList.innerHTML = '<div class="empty-state">Add targets with the Sidekick button located on the users profile</div>';
                    } else {
                        winList.innerHTML = html;
                        // Attach remove listeners for the pop-out window
                        const removeBtns = winList.querySelectorAll('.sk-halloween-remove-btn');
                        removeBtns.forEach(btn => {
                            btn.addEventListener('click', (e) => {
                                const id = e.target.getAttribute('data-id');
                                if (id) this.removeTarget(id);
                            });
                        });
                    }
                }
            }
        },

        _attachRemoveListeners(container) {
            container.querySelectorAll('.sk-halloween-remove-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    await this.removeTarget(id);
                });
            });
        }
    };

    window.SidekickModules = window.SidekickModules || {};
    window.SidekickModules.HalloweenHelper = HalloweenHelperModule;

    HalloweenHelperModule.init();

})();