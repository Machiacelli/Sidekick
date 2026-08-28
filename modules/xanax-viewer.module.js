/**
 * Sidekick Chrome Extension - Xanax Viewer Module
 * View individual Xanax usage on Faction and Profile pages
 * Version: 1.0.0
 * Author: Machiacelli
 */

(function () {
    'use strict';

    console.log("💊 Loading Sidekick Xanax Viewer Module...");

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

    // Xanax Viewer Module Implementation
    const XanaxViewerModule = {
        isInitialized: false,
        isEnabled: false, // Default disabled
        apiKey: '',
        autoLimit: 0,
        showRelative: false,
        myInfo: null,

        // Initialize the module
        async init() {
            if (this.isInitialized) {
                console.log("💊 Xanax Viewer Module already initialized");
                return;
            }

            console.log("💊 Initializing Xanax Viewer Module...");

            try {
                await waitForCore();
                await this.loadSettings();
                this.isInitialized = true;

                if (this.isEnabled) {
                    console.log("💊 Xanax Viewer: Enabled");
                    this.startXanaxViewer();
                } else {
                    console.log("💊 Xanax Viewer: Disabled");
                }

                console.log("✅ Xanax Viewer Module initialized successfully");
            } catch (error) {
                console.error("❌ Xanax Viewer Module initialization failed:", error);
            }
        },

        // Load settings from storage
        async loadSettings() {
            try {
                const saved = await window.SidekickModules.Core.ChromeStorage.get('sidekick_xanax_viewer');

                // First try to load from xanax-specific settings
                if (saved) {
                    this.apiKey = saved.apiKey || '';
                    this.autoLimit = saved.autoLimit || 0;
                    this.showRelative = saved.showRelative || false;
                    this.isEnabled = saved.isEnabled === true; // Default disabled
                } else {
                    // Default values
                    this.apiKey = '';
                    this.autoLimit = 0;
                    this.showRelative = false;
                    this.isEnabled = false; // Default disabled
                }

                // If no API key in xanax settings, try to get from global settings
                if (!this.apiKey) {
                    const globalApiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                    if (globalApiKey) {
                        this.apiKey = globalApiKey;
                        console.log('💊 Xanax Viewer: Using global API key');
                    }
                }

                console.log('💊 Xanax Viewer settings loaded:', {
                    hasApiKey: !!this.apiKey,
                    autoLimit: this.autoLimit,
                    showRelative: this.showRelative,
                    isEnabled: this.isEnabled
                });
            } catch (error) {
                console.error('Failed to load xanax viewer settings:', error);
            }
        },

        // Save settings to storage
        async saveSettings() {
            try {
                await window.SidekickModules.Core.ChromeStorage.set('sidekick_xanax_viewer', {
                    apiKey: this.apiKey,
                    autoLimit: this.autoLimit,
                    showRelative: this.showRelative,
                    isEnabled: this.isEnabled
                });
                console.log('💾 Xanax Viewer settings saved');
            } catch (error) {
                console.error('Failed to save xanax viewer settings:', error);
            }
        },

        // Toggle xanax viewer on/off
        async toggle() {
            this.isEnabled = !this.isEnabled;
            await this.saveSettings();

            if (this.isEnabled) {
                console.log('💊 Xanax Viewer enabled');
                this.startXanaxViewer();
            } else {
                console.log('💊 Xanax Viewer disabled');
                this.stopXanaxViewer();
            }

            return this.isEnabled;
        },

        // Stop xanax viewer
        stopXanaxViewer() {
            // Remove any existing xanax viewer elements
            const profileXanax = document.querySelector('.xanaxviewer-profile');
            if (profileXanax) {
                profileXanax.remove();
            }

            // Remove faction xanax elements
            const factionXanaxHeaders = document.querySelectorAll('.xanaxviewer_header');
            factionXanaxHeaders.forEach(el => el.remove());

            const factionXanaxCells = document.querySelectorAll('[class^="xanaxviewer_"]');
            factionXanaxCells.forEach(el => {
                if (el.className.includes('xanaxviewer_')) {
                    el.remove();
                }
            });

            console.log('💊 Xanax Viewer elements removed');
        },

        // Start the Xanax Viewer functionality
        async startXanaxViewer() {
            // Check if we have an API key
            if (!this.apiKey) {
                console.log("⚠️ Xanax Viewer: No API key configured");
                return;
            }

            // Fetch our own stats first using background script to avoid CORS
            try {
                console.log("💊 Xanax Viewer: Fetching own stats via background script...");

                // Check if extension context is valid first
                if (!window.SidekickModules?.Core?.SafeMessageSender?.isExtensionContextValid()) {
                    console.debug('💊 Extension context invalidated, cannot fetch user stats');
                    window.SidekickModules?.Core?.SafeMessageSender?.showExtensionReloadNotification();
                    return;
                }

                const response = await window.SidekickModules.Core.SafeMessageSender.sendToBackground({
                    action: 'fetchTornApi',
                    apiKey: this.apiKey,
                    selections: ['personalstats']
                });

                if (!response.success) {
                    console.error("❌ Xanax Viewer API Error:", response.error);
                    this.showApiError(response.error);
                    return;
                }

                // Build data structure similar to direct API call
                this.myInfo = {
                    personalstats: response.personalstats
                };

                console.log("✅ Xanax Viewer: Own stats loaded", {
                    xantaken: response.personalstats.xantaken,
                    refills: response.personalstats.refills
                });
                this.initializePageSpecificFunctionality();

            } catch (error) {
                if (error.message.includes('Extension context invalidated')) {
                    console.debug('💊 Extension context lost during stats fetch');
                    window.SidekickModules?.Core?.SafeMessageSender?.showExtensionReloadNotification();
                } else {
                    console.error("❌ Xanax Viewer: Failed to fetch own stats:", error);
                }
            }
        },

        // Initialize functionality based on current page
        initializePageSpecificFunctionality() {
            const currentPage = this.getPageName();

            if (currentPage === "profiles.php" && this.apiKey) {
                this.initializeProfilePage();
            } else if (currentPage === "factions.php" && this.apiKey) {
                this.initializeFactionPage();
            }
            // Preferences page integration removed - settings now in popup
        },

        // Initialize Profile Page functionality
        initializeProfilePage() {
            const uid = this.extractUserIdFromUrl();
            if (!uid) return;

            console.log("💊 Xanax Viewer: Initializing profile page for user", uid);

            this.waitForElementToExist("#profileroot .profile-buttons .title-black").then((selector) => {
                this.getUserStats(uid).then((stats) => {
                    const xantaken = this.showRelative ? stats.xantaken - this.myInfo.personalstats.xantaken : stats.xantaken;
                    const profileButton = document.querySelector("#profileroot .profile-buttons .title-black");

                    if (profileButton) {
                        profileButton.insertAdjacentHTML('beforeend',
                            `<span class="xanaxviewer-profile">${xantaken} Xanax</span>`
                        );
                        profileButton.insertAdjacentHTML('beforeend',
                            `<span class="xanaxviewer-profile">${stats.refills} Refills</span>`
                        );
                    }
                });
            });
        },

        // Initialize Faction Page functionality
        async initializeFactionPage() {
            console.log("💊 Xanax Viewer: Initializing faction page");

            this.waitForElementToExist('.members-list .positionCol___Lk6E4').then(async () => {
                setTimeout(async () => {
                    // Add header column
                    const tableHeader = document.querySelector('.faction-info-wrap .table-header');
                    if (tableHeader) {
                        tableHeader.insertAdjacentHTML('beforeend',
                            '<li tabindex="0" class="table-cell xanaxviewer_header torn-divider divider-vertical c-pointer">Xanax<div class="sortIcon___ALgdi asc___bb84w"></div></li>'
                        );
                    }

                    let profiles = {};
                    const cache = await this.getXanaxViewerCache();

                    // Add cached results or refresh buttons
                    const tableRows = document.querySelectorAll('.faction-info-wrap .table-body .table-row');
                    tableRows.forEach((row) => {
                        const userLink = row.querySelector("a[href*='profiles.php?XID=']");
                        if (!userLink) return;

                        const uid = this.extractUserIdFromUrl(userLink.href);
                        if (!uid) return;

                        const cachedInfo = cache[uid];
                        const levelElement = row.querySelector(".lvl");
                        const level = levelElement ? levelElement.textContent.trim() : '0';

                        // Add to profiles for auto refresh
                        if (!profiles[level]) {
                            profiles[level] = [];
                        }
                        profiles[level].push(row);

                        if (cachedInfo) {
                            const xantaken = this.showRelative ? cachedInfo.xantaken - this.myInfo.personalstats.xantaken : cachedInfo.xantaken;
                            row.insertAdjacentHTML('beforeend',
                                `<div class="table-cell xanaxviewer_header"><a class="xanaxviewer_refresh">${xantaken}</a></div>`
                            );
                        } else {
                            row.insertAdjacentHTML('beforeend',
                                '<div class="table-cell xanaxviewer_header"><a class="xanaxviewer_refresh">⟳</a></div>'
                            );
                        }
                    });

                    // Add click handlers for refresh
                    document.querySelectorAll(".xanaxviewer_refresh").forEach(button => {
                        button.addEventListener('click', (e) => {
                            this.updateViewer(e.target);
                        });
                    });

                    // Auto-refresh functionality
                    this.performAutoRefresh(profiles);

                }, 250);
            });
        },

        // Initialize Preferences Page - DISABLED: Settings moved to popup extension
        /* async initializePreferencesPage() {
            console.log("💊 Xanax Viewer: Initializing preferences page");
            
            const preferencesContainer = document.querySelector(".preferences-container");
            if (!preferencesContainer) return;

            const cache = await this.getXanaxViewerCache();
            
            preferencesContainer.insertAdjacentHTML('afterend', `
                <div class="xanaxviewer_container" data-feature="connect">
                   <div class="xanaxviewer_head">
                      <span class="xanaxviewer_title">Xanax Viewer Settings</span>
                   </div>

                   <div class="xanaxviewer_content">
                     <br/>
                     <p>API Key (Public Only): <input id="xanaxviewer_api" type="text" maxlength="16" required="" autocomplete="off" value="${this.apiKey}" style="color: rgb(0, 0, 0); border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204); border-image: initial; width: 20em;"></p>

                     <br/><br/>
                     <p>Automatically fetch <span id="xanaxviewer_autolimit">${this.autoLimit}</span> users (closest level) when I visit a faction page.</p>
                     <div class="slidecontainer">
                         <input type="range" min="0" max="100" value="${this.autoLimit}" class="slider" id="xanaxviewer_autolimit_slider">
                     </div>

                     <br/>
                     <p>Show Relative Value: <input id="xanaxviewer_relative_checkbox" type="checkbox" ${this.showRelative ? 'checked' : ''}></p>

                     <br/><br/>
                     <p><span id="xanaxviewer_storage_counter">${Object.keys(cache).length}</span> Profiles saved. <a id="xanaxviewer_deleteall_btn">Delete all</a>?</p>

                     <br/>
                     <a id="xanaxviewer_update_btn" class="torn-btn btn-big update">Update</a>
                     <span id="updateText" style="display: none;">Updated successfully!</span>
                   </div>
                </div>
            `);

            // Add event listeners
            const autoLimitSlider = document.getElementById("xanaxviewer_autolimit_slider");
            const autoLimitDisplay = document.getElementById("xanaxviewer_autolimit");
            
            autoLimitSlider.addEventListener('input', () => {
                autoLimitDisplay.textContent = autoLimitSlider.value;
            });

            document.getElementById("xanaxviewer_deleteall_btn").addEventListener('click', async () => {
                await window.SidekickModules.Core.ChromeStorage.set('xanaxviewer_cache', {});
                document.getElementById("xanaxviewer_storage_counter").textContent = '0';
            });

            document.getElementById("xanaxviewer_update_btn").addEventListener('click', async () => {
                this.apiKey = document.getElementById("xanaxviewer_api").value;
                this.autoLimit = parseInt(document.getElementById("xanaxviewer_autolimit_slider").value);
                this.showRelative = document.getElementById("xanaxviewer_relative_checkbox").checked;
                
                await this.saveSettings();
                
                const updateText = document.getElementById("updateText");
                updateText.style.display = 'inline';
                setTimeout(() => {
                    updateText.style.display = 'none';
                }, 2000);
            });
        },
        */

        // Perform auto refresh based on autoLimit setting
        performAutoRefresh(profiles) {
            if (this.autoLimit <= 0) return;

            const memberCountElement = document.querySelector(".members-list .c-pointer span");
            if (!memberCountElement) return;

            const memberCount = parseInt(memberCountElement.textContent.split("/")[0].replace(/ /g, ''));
            const limitToUse = Math.min(this.autoLimit, memberCount);

            if (limitToUse <= 0) return;

            const toBeRefreshed = [];
            let refreshed = 0;
            let generation = 0;
            let nextMinus = true;
            const myLevel = this.myInfo.level;

            while (refreshed < limitToUse) {
                const cursorLevel = nextMinus ? myLevel + generation : myLevel - generation;

                if (nextMinus) {
                    generation++;
                }
                nextMinus = !nextMinus;

                if (profiles[cursorLevel]) {
                    profiles[cursorLevel].forEach(profile => {
                        if (refreshed >= limitToUse) return;

                        toBeRefreshed.push(profile);
                        const refreshButton = profile.querySelector(".xanaxviewer_refresh");
                        if (refreshButton) {
                            refreshButton.textContent = 'L';
                        }
                        refreshed++;
                    });
                }

                if (cursorLevel < 1 && generation > myLevel) break; // Prevent infinite loop
            }

            // Start refreshing
            this.startRefreshing(toBeRefreshed, 0);
        },

        // Start refreshing process
        async startRefreshing(toBeRefreshed, counter) {
            if (counter >= toBeRefreshed.length) return;

            const item = toBeRefreshed[counter];
            const refreshButton = item.querySelector(".xanaxviewer_refresh");

            if (refreshButton) {
                await this.updateViewer(refreshButton);
            }

            if (counter < toBeRefreshed.length - 1) {
                // Add delay to avoid rate limiting
                setTimeout(() => {
                    this.startRefreshing(toBeRefreshed, counter + 1);
                }, 1000);
            }
        },

        // Get user stats from API
        async getUserStats(uid) {
            try {
                console.log(`💊 Xanax Viewer: Fetching stats for user ${uid} via background script...`);

                // Check if extension context is valid first
                if (!window.SidekickModules?.Core?.SafeMessageSender?.isExtensionContextValid()) {
                    console.debug('💊 Extension context invalidated, cannot fetch user stats');
                    window.SidekickModules?.Core?.SafeMessageSender?.showExtensionReloadNotification();
                    throw new Error('Extension context invalidated');
                }

                const response = await window.SidekickModules.Core.SafeMessageSender.sendToBackground({
                    action: 'fetchTornApi',
                    apiKey: this.apiKey,
                    selections: ['personalstats'],
                    userId: uid // Add user ID for specific user lookup
                });

                if (!response.success) {
                    console.error(`❌ Xanax Viewer: Failed to fetch stats for user ${uid}:`, response.error);
                    throw new Error(response.error);
                }

                if (!response.personalstats) {
                    throw new Error('No personal stats received');
                }

                const stats = {
                    xantaken: response.personalstats.xantaken || 0,
                    cantaken: response.personalstats.cantaken || 0,
                    lsdtaken: response.personalstats.lsdtaken || 0,
                    refills: response.personalstats.refills || 0
                };

                // Cache the results
                await this.cacheUserStats(uid, stats);

                console.log(`✅ Xanax Viewer: Stats fetched for user ${uid}:`, stats);
                return stats;

            } catch (error) {
                if (error.message.includes('Extension context invalidated')) {
                    console.debug(`💊 Extension context lost during user ${uid} stats fetch`);
                    window.SidekickModules?.Core?.SafeMessageSender?.showExtensionReloadNotification();
                } else {
                    console.error(`❌ Xanax Viewer: Error fetching stats for user ${uid}:`, error);
                }

                // Fallback to cached data if available (handles throttle/rate-limit)
                try {
                    const cache = await this.getXanaxViewerCache();
                    if (cache[uid]) {
                        console.log(`💊 Xanax Viewer: Using cached data for user ${uid}`);
                        return cache[uid];
                    }
                } catch {}

                // Return default values if no cache
                return { xantaken: 0, cantaken: 0, lsdtaken: 0, refills: 0 };
            }
        },

        // Get cached xanax viewer data
        async getXanaxViewerCache() {
            try {
                const cache = await window.SidekickModules.Core.ChromeStorage.get('xanaxviewer_cache');
                return cache || {};
            } catch (error) {
                console.error('💊 Error getting xanax cache:', error);
                return {};
            }
        },

        // Cache user stats
        async cacheUserStats(uid, stats) {
            try {
                const cache = await this.getXanaxViewerCache();
                cache[uid] = {
                    xantaken: stats.xantaken || 0,
                    cantaken: stats.cantaken || 0,
                    lsdtaken: stats.lsdtaken || 0,
                    refills: stats.refills || 0,
                    updated: Date.now()
                };

                await window.SidekickModules.Core.ChromeStorage.set('xanaxviewer_cache', cache);
                console.log(`💊 Cached stats for user ${uid}:`, cache[uid]);
            } catch (error) {
                console.error('💊 Error caching user stats:', error);
            }
        },

        // Update viewer for specific element
        async updateViewer(element) {
            const row = element.closest('.table-row');
            if (!row) return;

            const userLink = row.querySelector("a[href*='profiles.php?XID=']");
            if (!userLink) return;

            const uid = this.extractUserIdFromUrl(userLink.href);
            if (!uid) return;

            try {
                const stats = await this.getUserStats(uid);
                const xantaken = this.showRelative ? stats.xantaken - this.myInfo.personalstats.xantaken : stats.xantaken;
                element.textContent = xantaken.toString();
            } catch (error) {
                console.error("❌ Error updating viewer:", error);
                element.textContent = "Error";
            }
        },

        // Helper function to wait for element
        waitForElementToExist(selector) {
            return new Promise(resolve => {
                if (document.querySelector(selector)) {
                    return resolve(document.querySelector(selector));
                }

                const observer = new MutationObserver(() => {
                    if (document.querySelector(selector)) {
                        resolve(document.querySelector(selector));
                        observer.disconnect();
                    }
                });

                observer.observe(document.body, {
                    subtree: true,
                    childList: true,
                });
            });
        },

        // Get current page name
        getPageName() {
            const path = window.location.pathname;
            return path.split("/").pop();
        },

        // Extract user ID from URL
        extractUserIdFromUrl(url = window.location.href) {
            const match = url.match(/XID=(\d+)/);
            return match ? match[1] : null;
        },

        // Show API error
        showApiError(errorMessage) {
            const contentTitle = document.querySelector(".content-title");
            if (contentTitle) {
                contentTitle.insertAdjacentHTML('afterbegin',
                    `<p style="color: red;">XanaxViewerError: ${errorMessage}.</p>`
                );
            }
        },

        // Set API key
        async setApiKey(apiKey) {
            this.apiKey = apiKey;
            await this.saveSettings();
            console.log("💊 Xanax Viewer: API key updated");
        },

        // Get current status
        getStatus() {
            return {
                isEnabled: this.isEnabled,
                isInitialized: this.isInitialized,
                hasApiKey: !!this.apiKey,
                autoLimit: this.autoLimit,
                showRelative: this.showRelative
            };
        }
    };

    // Add CSS styles
    const style = document.createElement('style');
    style.textContent = `
        .xanaxviewer_header { 
            width: 6%; 
        }
        .xanaxviewer-profile { 
            float: right; 
            padding-right: 10px; 
            color: red; 
        }
        .xanaxviewer_container { 
            margin-top: 10px; 
            display: flex; 
            flex-direction: column; 
            box-sizing: border-box; 
        }
        .xanaxviewer_head { 
            background: black; 
            padding: 2px; 
            border-bottom-left-radius: 0px; 
            border-bottom-right-radius: 0px; 
            border-bottom: none; 
        }
        .xanaxviewer_title { 
            color: var(--re-title-color); 
            text-shadow: rgba(0, 0, 0, 0.65) 1px 1px 2px; 
        }
        .xanaxviewer_content { 
            background-color: grey; 
            padding: 1em 2em; 
            color: white; 
        }
        #xanaxviewer_storage_counter, 
        #xanaxviewer_deleteall_btn { 
            color: yellow; 
        }
        #xanaxviewer_deleteall_btn:hover { 
            text-decoration: underline; 
        }
        #xanaxviewer_autolimit_slider { 
            width: 20em; 
        }
        .member-icons { 
            width: 25% !important; 
        }
    `;
    document.head.appendChild(style);

    // Initialize global namespace if it doesn't exist
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    // Export Xanax Viewer module to global namespace
    window.SidekickModules.XanaxViewer = XanaxViewerModule;
    console.log("✅ Xanax Viewer Module loaded and ready");

})();
