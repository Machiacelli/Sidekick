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

    const ATTACKS_REFRESH_COOLDOWN_MS = 60 * 1000;

    const HalloweenHelperModule = {
        isInitialized: false,
        data: structuredClone(DEFAULT_DATA),
        _lastAttacksRefresh: 0,

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

            if (!Array.isArray(this.data.targets)) {
                this.data.targets = [];
            }
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

        // Fetches the user's recent attacks through the background proxy so the
        // API key is never part of a page-visible URL. Returns the raw
        // `attacks` selection or null when unavailable.
        async _fetchAttacks() {
            try {
                const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                if (!apiKey) return null;

                const res = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: 'proxyFetch',
                        url: `https://api.torn.com/user/?selections=attacks&comment=SidekickHalloween&key=${encodeURIComponent(apiKey)}`,
                    }, (r) => {
                        if (chrome.runtime.lastError) {
                            console.error('Sidekick Halloween: proxyFetch failed -', chrome.runtime.lastError.message);
                            resolve(null);
                            return;
                        }
                        resolve(r);
                    });
                });

                return res?.success ? (res.data?.attacks || null) : null;
            } catch (e) {
                console.error('Sidekick Halloween: Failed to fetch recent attacks', e);
                return null;
            }
        },

        // Updates the "Last Attacked" stamp of every target from the Torn API.
        // Guarded by a cooldown so opening the settings panel does not hammer
        // the API; `force` bypasses it (manual refresh button).
        async refreshAttacks(force = false) {
            const now = Date.now();
            if (!force && now - this._lastAttacksRefresh < ATTACKS_REFRESH_COOLDOWN_MS) return false;

            const attacks = await this._fetchAttacks();
            if (!attacks) return false;

            this._lastAttacksRefresh = now;

            // Torn returns the attacks selection as a dictionary of id -> array
            // of attacks, so flatten it before matching on `defender_id`.
            const allAttacks = Object.values(attacks)
                .flatMap(entry => (Array.isArray(entry) ? entry : [entry]))
                .filter(a => a && typeof a === 'object');
            let changed = false;

            for (const target of this.data.targets) {
                const targetId = String(target.id);
                const targetAttacks = allAttacks.filter(a => a && String(a.defender_id || '') === targetId);
                if (targetAttacks.length === 0) continue;

                targetAttacks.sort((a, b) => b.timestamp_ended - a.timestamp_ended);
                const latest = new Date(targetAttacks[0].timestamp_ended * 1000).toLocaleString();
                if (target.lastAttacked !== latest) {
                    target.lastAttacked = latest;
                    changed = true;
                }
            }

            if (changed) {
                await this.save();
            }

            return changed;
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
                this.data.targets.push({
                    id,
                    username,
                    lastAttacked: null
                });
                await this.save();

                // Force a refresh so the new target gets its "Last Attacked" stamp.
                await this.refreshUI(true);
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
                await this.refreshUI();
                return true;
            }

            return false;
        },

        async clearTargets() {
            this.data.targets = [];
            await this.save();
            await this.refreshUI();
        },

        openWindow() {
            if (this._halloweenWindow && !this._halloweenWindow.closed) {
                this._halloweenWindow.focus();
                this.refreshUI().catch(e => console.error(e));
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
                        <div style="display: flex; gap: 8px; margin-top: 15px;">
                            <button id="refresh-btn" style="flex:1; padding: 8px; border-radius: 6px; border: 1px solid rgba(33,150,243,0.4); background: rgba(33,150,243,0.15); color: #42A5F5; font-weight: 600; font-size: 11px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;">Refresh</button>
                            <button id="clear-btn" style="flex:1; padding: 8px; border-radius: 6px; border: 1px solid rgba(244,67,54,0.4); background: rgba(244,67,54,0.15); color: #EF5350; font-weight: 600; font-size: 11px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;">Clear List</button>
                        </div>
                    </body>
                    </html>
                `);
                this._halloweenWindow.document.close();

                // Attach button listeners directly from parent
                this._halloweenWindow.document.getElementById('refresh-btn').addEventListener('click', () => {
                    // Force a refresh so the button always pulls fresh timestamps.
                    this.refreshUI(true).catch(e => console.error(e));
                });
                
                this._halloweenWindow.document.getElementById('clear-btn').addEventListener('click', () => {
                    if (this._halloweenWindow.confirm('Clear all Halloween targets?')) {
                        this.clearTargets().catch(e => console.error(e));
                    }
                });
            }

            this.refreshUI().catch(e => console.error(e));
        },

        async refreshUI(forceRefresh = false) {
            // Render the cached list first so the UI never waits on the API.
            this._renderTargets();

            try {
                const changed = await this.refreshAttacks(forceRefresh);
                if (changed || forceRefresh) {
                    this._renderTargets();
                }
            } catch (error) {
                console.error('Sidekick Halloween: Failed to refresh attacks', error);
            }
        },

        _renderTargets() {
            const settingsList = document.getElementById('skp-halloween-targets-list');
            const targets = Array.isArray(this.data.targets) ? this.data.targets : [];

            const html = targets.length === 0 
                ? '<div style="text-align:center; color:#aaa; padding:10px; font-style:italic; font-size:11px;">Add targets with the Sidekick button located on the users profile</div>'
                : targets.map(t => `
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
                    if (targets.length === 0) {
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