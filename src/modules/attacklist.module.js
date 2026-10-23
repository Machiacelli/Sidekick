/**
 * Sidekick Chrome Extension - Attack List Module
 * Manage lists of players to track with API-based status updates
 * Version: 1.0.0
 * Author: Machiacelli
 */

(function () {
    'use strict';

    console.log("⚔️ Loading Sidekick Attack List Module...");

    const AttackListModule = {
        isInitialized: false,
        attackLists: [],
        _polling: false,
        POLL_SPACING_MS: 1500,
        displayUpdateInterval: null,

        // Initialize the attack list module
        async init() {
            if (this.isInitialized) {
                console.log("⚔️ Attack List Module already initialized");
                return;
            }

            console.log("⚔️ Initializing Attack List Module...");

            try {
                // Stop any poller/intervals left over from a previous init
                this.stopStatusUpdates();

                await this.loadAttackLists();
                this.startStatusUpdates();
                this.isInitialized = true;
                console.log("✅ Attack List Module initialized successfully");
            } catch (error) {
                console.error("❌ Attack List Module initialization failed:", error);
            }
        },

        // Load attack lists from Chrome storage
        async loadAttackLists() {
            try {
                const saved = await window.SidekickModules.Core.ChromeStorage.get('sidekick_attacklists');
                if (saved && Array.isArray(saved)) {
                    this.attackLists = saved;
                    console.log("✅ Loaded", this.attackLists.length, "attack lists from Chrome storage");
                } else {
                    this.attackLists = [];
                    console.log("📭 No saved attack lists found in Chrome storage");
                }
            } catch (error) {
                console.error('Failed to load attack lists from Chrome storage:', error);
                this.attackLists = [];
            }
        },

        // Save attack lists to Chrome storage with debouncing
        async saveAttackLists() {
            try {
                // NOTE (audit item 7): the old code wrote through StateManager
                // AND directly. StateManager's key/shape (`sidekick_attacklist_state`
                // → `{lists}`) does NOT match what loadAttackLists() reads
                // (`sidekick_attacklists`, the raw array), so the direct write
                // was the only one that actually persisted — and because it ran
                // immediately it defeated the StateManager debounce. Fixed:
                // ONE debounced write, to the key we read from.
                if (this._saveDebounceTimer) clearTimeout(this._saveDebounceTimer);
                const listsSnapshot = this.attackLists;
                this._saveDebounceTimer = setTimeout(async () => {
                    try {
                        await window.SidekickModules.Core.ChromeStorage.set('sidekick_attacklists', listsSnapshot);
                    } catch (err) {
                        console.error('Failed to persist attack lists:', err);
                    }
                }, 500);
            } catch (error) {
                console.error('Failed to save attack lists to Chrome storage:', error);
            }
        },

        // Create a new attack list
        createNewAttackList() {
            console.log('⚔️ Creating new attack list...');

            const contentArea = document.getElementById('sidekick-content');
            if (!contentArea) {
                console.error('❌ Content area not found');
                return;
            }

            const contentWidth = contentArea.clientWidth || 480;
            const contentHeight = contentArea.clientHeight || 500;

            const attackListWidth = Math.min(300, contentWidth - 40);
            const attackListHeight = Math.min(250, contentHeight - 60);
            const padding = 10;
            const stackOffset = 30;

            const attackListCount = this.attackLists.length;
            const x = padding + (attackListCount * stackOffset) % (contentWidth - attackListWidth);
            const y = padding + Math.floor((attackListCount * stackOffset) / (contentWidth - attackListWidth)) * stackOffset;

            const attackList = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: 'New Attack List',
                targets: [],
                pageId: window.SidekickModules?.UI?.getActivePageId?.() ?? null, // page this list belongs to
                x: x,
                y: y,
                width: attackListWidth,
                height: attackListHeight,
                pinned: false,
                color: '#f44336',
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            };

            this.attackLists.push(attackList);
            this.saveAttackLists();
            this.renderAttackList(attackList);

            console.log('⚔️ Attack list created successfully, total lists:', this.attackLists.length);
            return attackList;
        },

        // Render an attack list window
        renderAttackList(attackList) {
            // Route to the page this list belongs to (falls back to active page for legacy data)
            const contentArea = window.SidekickModules?.UI?.getPageContentEl?.(attackList.pageId) || document.getElementById('sidekick-content');
            if (!contentArea) return;

            // Remove existing element if it exists
            const existingElement = document.getElementById(`sidekick-attacklist-${attackList.id}`);
            if (existingElement) {
                existingElement.remove();
            }

            // (Audit item 7) On re-render the old portaled dropdown stays
            // orphaned in document.body — purge portals that belong to THIS
            // list before a fresh one is created below.
            if (attackList._portaledDropdown?.isConnected) {
                attackList._portaledDropdown.remove();
            }
            attackList._portaledDropdown = null;

            const attackListElement = document.createElement('div');
            attackListElement.className = 'movable-attacklist';
            attackListElement.id = `sidekick-attacklist-${attackList.id}`;
            attackListElement.dataset.attacklistId = attackList.id;

            const width = Math.max(attackList.width || 300, 170);
            const height = Math.max(attackList.height || 250, 102);
            const x = Math.max(attackList.x || 10, 0);
            const y = Math.max(attackList.y || 10, 0);

            attackListElement.style.cssText = `
                position: absolute;
                left: ${x}px;
                top: ${y}px;
                width: ${width}px;
                height: ${height}px;
                background: linear-gradient(145deg, #37474F, #263238);
                border: 1px solid #555;
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                min-width: 170px;
                min-height: 102px;
                z-index: 1000;
                resize: ${attackList.pinned ? 'none' : 'both'};
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            `;

            attackListElement.innerHTML = `
                <div class="attacklist-header" style="
                    background: linear-gradient(135deg, ${attackList.color || '#f44336'}, ${this.darkenColor(attackList.color || '#f44336', 15)});
                    border-bottom: 1px solid #555;
                    padding: 4px 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: ${attackList.pinned ? 'default' : 'move'};
                    height: 24px;
                    flex-shrink: 0;
                    border-radius: 5px 5px 0 0;
                    user-select: none;
                ">
                    <input class="attacklist-name" value="${this.escapeHtml(attackList.name)}" style="
                        background: none;
                        border: none;
                        color: #fff;
                        font-weight: 600;
                        font-size: 11px;
                        flex: 1;
                        min-width: 0;
                    " title="Edit name">
                    
                    <div style="display: flex; align-items: center; gap: 3px;">
                        <div class="attacklist-dropdown" style="position: relative;">
                            <button class="attacklist-dropdown-btn" style="
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
<div class="attacklist-dropdown-content" style="
    display: none;
    position: absolute;
    background: #333;
    width: 160px;
    box-shadow: 0px 8px 16px rgba(0,0,0,0.3);
    z-index: 1001;
    border-radius: 4px;
    border: 1px solid #555;
    top: 100%;
    right: 0;
    overflow: hidden;
    box-sizing: border-box;
">
                                <button class="add-target-btn" style="
                                    background: none;
                                    border: none;
                                    color: #fff;
                                    padding: 8px 12px;
                                    width: 100%;
                                    text-align: left;
                                    cursor: pointer;
                                    font-size: 12px;
                                    transition: background 0.2s;
                                ">
                                    Add Target
                                </button>
                                <button class="color-attacklist-btn" style="
                                    background: none;
                                    border: none;
                                    color: #fff;
                                    padding: 8px 12px;
                                    width: 100%;
                                    text-align: left;
                                    cursor: pointer;
                                    font-size: 12px;
                                    transition: background 0.2s;
                                ">
                                    Change Color
                                </button>
                                <button class="pin-attacklist-btn" style="
                                    background: none;
                                    border: none;
                                    color: #fff;
                                    padding: 8px 12px;
                                    width: 100%;
                                    text-align: left;
                                    cursor: pointer;
                                    font-size: 12px;
                                    transition: background 0.2s;
                                ">
                                    ${attackList.pinned ? 'Unpin' : 'Pin'}
                                </button>
                            </div>
                        </div>
                        
                        <button class="attacklist-close" style="
                            background: #dc3545;
                            border: none;
                            color: white;
                            cursor: pointer;
                            width: 14px;
                            height: 14px;
                            border-radius: 50%;
                            font-size: 10px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            line-height: 1;
                            transition: all 0.2s;
                            font-weight: bold;
                        " 
                           title="Close">×</button>
                    </div>
                </div>
                
                <div class="attacklist-content" style="
                    flex: 1;
                    padding: 8px;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                ">
                    <div class="targets-container">
                        ${attackList.targets.length === 0 ?
                    `<div style="color: #888; font-size: 12px; text-align: center; margin-top: 20px;">
                                Click the ⚙️ button to add targets
                            </div>` :
                    ''
                }
                    </div>
                </div>
            `;

            contentArea.appendChild(attackListElement);
            this.renderTargets(attackList);
            this.setupAttackListEventListeners(attackList, attackListElement);

            console.log('⚔️ Attack list rendered:', attackList.name);
        },

        // Render targets in an attack list
        renderTargets(attackList) {
            const attackListElement = document.getElementById(`sidekick-attacklist-${attackList.id}`);
            if (!attackListElement) return;

            const container = attackListElement.querySelector('.targets-container');
            if (!container) return;

            if (attackList.targets.length === 0) {
                container.innerHTML = `<div style="color: #888; font-size: 12px; text-align: center; margin-top: 20px;">
                    Click the ⚙️ button to add targets
                </div>`;
                return;
            }

            container.innerHTML = attackList.targets.map(target => this.renderTarget(target)).join('');

            // Re-add event listeners for remove target buttons
            container.querySelectorAll('.remove-target-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const targetId = btn.dataset.targetId;
                    this.removeTarget(attackList.id, targetId);
                });
            });
        },

        // Render individual target
        renderTarget(target) {
            const statusDisplay = this.renderTargetStatus(target);
            const playerName = target.name || `Player ${target.id}`;

            return `
                <div class="target-item" data-target-id="${target.id}" style="
                    background: #333;
                    border: 1px solid #555;
                    border-radius: 4px;
                    padding: 6px 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: background 0.2s;
                ">
                    <a href="https://www.torn.com/profiles.php?XID=${target.id}" 
                       target="_blank" 
                       style="color: #4CAF50; text-decoration: none; font-size: 12px; font-weight: bold; flex: 1;">
                        ${this.escapeHtml(playerName)}
                    </a>
                    
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div class="status-text" style="font-size: 11px;">
                            ${statusDisplay}
                        </div>
                        <button class="remove-target-btn" data-target-id="${target.id}" style="
                            background: rgba(220, 53, 69, 0.8);
                            border: none;
                            color: white;
                            cursor: pointer;
                            width: 12px;
                            height: 12px;
                            border-radius: 50%;
                            font-size: 7px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            line-height: 1;
                            transition: all 0.2s;
                            opacity: 0.7;
                        " 
                           title="Remove target">×</button>
                    </div>
                </div>
            `;
        },

        // Render target status with color coding
        renderTargetStatus(target) {
            // NOTE: output is swapped into `.status-text` nodes by
            // updateTimerDisplays() — keep it a single inline element.
            if (!target.data) {
                return '<span style="color: #888;">Loading...</span>';
            }

            if (target.data.error) {
                return `<span style="color: #f44336;">Error: ${target.data.error}</span>`;
            }

            const data = target.data;
            if (!data.status) {
                return '<span style="color: #888;">No Status</span>';
            }

            // OK status (green)
            if (data.status.state === 'Okay') {
                return '<span style="color: #4CAF50; font-weight: bold;">Okay</span>';
            }

            // Hospital status (red with timer)
            if (data.status.state === 'Hospital') {
                const timeLeft = data.status.until ? this.formatTimeRemaining(data.status.until) : '';
                return `<span style="color: #f44336; font-weight: bold;">Hospital${timeLeft ? ' ' + timeLeft : ''}</span>`;
            }

            // Jail status (purple with timer)
            if (data.status.state === 'Jail') {
                const timeLeft = data.status.until ? this.formatTimeRemaining(data.status.until) : '';
                return `<span style="color: #9c27b0; font-weight: bold;">Jail${timeLeft ? ' ' + timeLeft : ''}</span>`;
            }

            // Flying status (blue with timer)
            if (data.status.state === 'Traveling') {
                const timeLeft = data.status.until ? this.formatTimeRemaining(data.status.until) : '';
                return `<span style="color: #2196f3; font-weight: bold;">Traveling${timeLeft ? ' ' + timeLeft : ''}</span>`;
            }

            // Other statuses
            return `<span style="color: #ff9800;">${data.status.state}</span>`;
        },

        // Format time remaining
        formatTimeRemaining(timestamp) {
            const now = Math.floor(Date.now() / 1000);
            const timeLeft = timestamp - now;

            // Countdown finished: return '' so only the state label shows —
            // the next poll confirms the actual status (never claim
            // "Available").
            if (timeLeft <= 0) return '';

            const hours = Math.floor(timeLeft / 3600);
            const minutes = Math.floor((timeLeft % 3600) / 60);
            const seconds = timeLeft % 60;

            if (hours > 0) {
                return `${hours}h ${minutes}m`;
            } else if (minutes > 0) {
                return `${minutes}m ${seconds}s`;
            } else {
                return `${seconds}s`;
            }
        },

        // Set up event listeners for attack list
        setupAttackListEventListeners(attackList, element) {
            // Name editing
            const nameInput = element.querySelector('.attacklist-name');
            nameInput.addEventListener('blur', () => {
                attackList.name = nameInput.value.trim() || 'Attack List';
                attackList.modified = new Date().toISOString();
                this.saveAttackLists();
            });

            // Dropdown functionality
            const dropdownBtn = element.querySelector('.attacklist-dropdown-btn');
            const dropdownContent = element.querySelector('.attacklist-dropdown-content');

            if (dropdownBtn && dropdownContent) {
                // Portal to body so it escapes all stacking contexts
                dropdownContent.style.position = 'fixed';
                dropdownContent.style.zIndex = '2147483647';
                dropdownContent.style.display = 'none';
                document.body.appendChild(dropdownContent);

                dropdownBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isVisible = dropdownContent.style.display === 'block';

                    // Close all portaled dropdowns first
                    document.querySelectorAll('.attacklist-dropdown-content, .linkgroup-dropdown-content, .todolist-dropdown-content').forEach(dd => {
                        dd.style.display = 'none';
                    });

                    if (!isVisible) {
                        dropdownContent.style.display = 'block';
                        const btnRect = dropdownBtn.getBoundingClientRect();
                        const ddWidth = dropdownContent.offsetWidth || 120;
                        let left = btnRect.right - ddWidth;
                        let top = btnRect.bottom + 2;
                        if (left < 4) left = 4;
                        if (left + ddWidth > window.innerWidth - 4) left = window.innerWidth - ddWidth - 4;
                        if (top + dropdownContent.offsetHeight > window.innerHeight - 4) top = btnRect.top - dropdownContent.offsetHeight - 2;
                        dropdownContent.style.left = left + 'px';
                        dropdownContent.style.top = top + 'px';
                    }
                });

                // Close dropdown when clicking outside — ONE shared document
                // listener instead of one per rendered list (audit item 7),
                // and never removed per-render. Reuses the same handler so
                // re-renders don't stack copies.
                if (!this._outsideClickListener) {
                    this._outsideClickListener = () => {
                        document.querySelectorAll('.attacklist-dropdown-content').forEach(dd => {
                            dd.style.display = 'none';
                        });
                    };
                    document.addEventListener('click', this._outsideClickListener);
                }
                // Stash the portal + handlers on the element record so
                // deleteAttackList can remove everything (audit item 7:
                // portaled dropdowns were orphaned on delete/re-render).
                attackList._portaledDropdown = dropdownContent;
            }

            // Add target button
            const addTargetBtn = dropdownContent.querySelector('.add-target-btn');

            if (addTargetBtn) {
                addTargetBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdownContent.style.display = 'none';
                    this.showAddTargetDialog(attackList);
                });
            }

            // Color button
            const colorBtn = dropdownContent.querySelector('.color-attacklist-btn');

            if (colorBtn) {
                colorBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdownContent.style.display = 'none';

                    if (window.SidekickModules?.Core?.ColorPicker) {
                        window.SidekickModules.Core.ColorPicker.show(
                            attackList.color || '#f44336',
                            (selectedColor) => {
                                attackList.color = selectedColor;

                                const header = element.querySelector('.attacklist-header');
                                if (header) {
                                    header.style.background =
                                        `linear-gradient(135deg, ${selectedColor}, ${this.darkenColor(selectedColor, 15)})`;
                                }

                                this.saveAttackLists();
                            }
                        );
                    }
                });
            }

            // Pin button
            const pinBtn = dropdownContent.querySelector('.pin-attacklist-btn');

            if (pinBtn) {
                pinBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    attackList.pinned = !attackList.pinned;
                    dropdownContent.style.display = 'none';
                    this.saveAttackLists();
                    this.renderAttackList(attackList);
                });
            }

            // Close button
            const closeBtn = element.querySelector('.attacklist-close');

            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (confirm(`Delete "${attackList.name}" attack list?`)) {
                        this.deleteAttackList(attackList.id);
                    }
                });
            }

            // Resizing functionality (only if not pinned)
            let resizeTimeout;
            const resizeObserver = new ResizeObserver(entries => {
                if (attackList.pinned) return;

                for (let entry of entries) {
                    if (entry.target === element) {
                        attackList.width = entry.contentRect.width;
                        attackList.height = entry.contentRect.height;

                        // Debounce saves to prevent excessive saving during resize
                        clearTimeout(resizeTimeout);
                        resizeTimeout = setTimeout(() => {
                            this.saveAttackLists();
                        }, 500);
                    }
                }
            });
            resizeObserver.observe(element);

            // Make draggable
            this.makeDraggable(element, attackList);

            // Cleanup registry: everything this element registered on the
            // DOCUMENT (not the element) must be removable when the list is
            // deleted or re-rendered (audit item 7: ResizeObserver was never
            // disconnected and document drag listeners accumulated).
            this._elementCleanup = this._elementCleanup || new Map();
            this._elementCleanup.set(attackList.id, () => {
                clearTimeout(resizeTimeout);
                resizeObserver.disconnect();
            });
        },

        // Show add target dialog (non-blocking: an inline input row inside the
        // list, replacing the old window-blocking prompt())
        showAddTargetDialog(attackList) {
            const listEl = document.getElementById(`sidekick-attacklist-${attackList.id}`);
            if (!listEl) return;
            const container = listEl.querySelector('.targets-container');
            if (!container || container.querySelector('.add-target-row')) return;

            const row = document.createElement('div');
            row.className = 'add-target-row';
            row.style.cssText = 'display:flex;gap:4px;padding:4px 0;align-items:center;';
            row.innerHTML = `
                <input class="add-target-input" type="text" inputmode="numeric" placeholder="Player ID"
                    style="flex:1;min-width:0;background:#222;border:1px solid #555;border-radius:3px;color:#fff;padding:3px 5px;font-size:11px;">
                <button class="add-target-confirm" style="background:#4CAF50;border:none;color:#fff;border-radius:3px;padding:3px 7px;font-size:11px;cursor:pointer;">Add</button>
                <button class="add-target-cancel" style="background:#666;border:none;color:#fff;border-radius:3px;padding:3px 7px;font-size:11px;cursor:pointer;">×</button>
            `;
            container.prepend(row);
            const input = row.querySelector('.add-target-input');
            input.focus();

            const finish = () => row.remove();

            const submit = () => {
                const raw = (input.value || '').trim();
                const targetId = raw;
                if (!targetId || isNaN(targetId) || Number(targetId) <= 0) {
                    input.style.borderColor = '#f44336';
                    input.placeholder = 'Valid player ID required';
                    return;
                }
                if (attackList.targets.find(t => t.id === targetId)) {
                    input.style.borderColor = '#f44336';
                    input.placeholder = 'Already in this list';
                    return;
                }

                const target = {
                    id: targetId,
                    name: null,
                    data: null,
                    lastUpdated: null,
                    addedAt: Date.now()
                };

                attackList.targets.push(target);
                attackList.modified = new Date().toISOString();
                this.saveAttackLists();
                finish();
                this.renderTargets(attackList);

                // Update target data immediately
                this.updateTargetStatus(target).then(() => {
                    this.renderTargets(attackList);
                    this.saveAttackLists();
                });
            };

            row.querySelector('.add-target-confirm').addEventListener('click', submit);
            row.querySelector('.add-target-cancel').addEventListener('click', finish);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') finish();
            });
        },

        // Remove target from attack list
        removeTarget(attackListId, targetId) {
            const attackList = this.attackLists.find(al => al.id === attackListId);
            if (!attackList) return;

            attackList.targets = attackList.targets.filter(target => target.id !== targetId);
            attackList.modified = new Date().toISOString();
            this.saveAttackLists();
            this.renderTargets(attackList);
        },

        // Delete entire attack list
        // Delete all attack lists that belong to a given page (called when the page is deleted)
        purgePage(pageId) {
            if (pageId == null) return;
            const doomed = this.attackLists.filter(al => al.pageId != null && String(al.pageId) === String(pageId));
            if (doomed.length === 0) return;
            this.attackLists = this.attackLists.filter(al => !(al.pageId != null && String(al.pageId) === String(pageId)));
            this.saveAttackLists();
            console.log(`⚔️ Purged ${doomed.length} attack list(s) from deleted page`);
        },

        deleteAttackList(id) {
            const element = document.getElementById(`sidekick-attacklist-${id}`);
            if (element) {
                element.remove();
            }

            // (Audit item 7) Remove the portaled dropdown + document-level
            // cleanup handles — these lived outside `element` and were
            // orphaned before.
            const attackList = this.attackLists.find(al => al.id === id);
            if (attackList?._portaledDropdown?.isConnected) {
                attackList._portaledDropdown.remove();
            }
            delete attackList?._portaledDropdown;
            if (this._elementCleanup?.has(id)) {
                try {
                    this._elementCleanup.get(id)();
                } catch (_) { /* best-effort teardown */ }
                this._elementCleanup.delete(id);
            }

            this.attackLists = this.attackLists.filter(al => al.id !== id);
            this.saveAttackLists();

            console.log('⚔️ Attack list deleted');
        },

        // Update target status via API. Returns the Torn API error code
        // when the API responds with an error (5 = rate limited), else null.
        async updateTargetStatus(target) {
            try {
                // Get API key from settings
                const apiKey = await window.SidekickModules.Settings.getApiKey();
                if (!apiKey) {
                    throw new Error('API key not configured');
                }

                // Background proxy (audit items 7/9): the key must not sit in
                // a page-visible URL / DevTools network log.
                const res = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: 'proxyFetch',
                        url: `https://api.torn.com/user/${target.id}?selections=basic,profile&comment=SidekickAttackList&key=${encodeURIComponent(apiKey)}`,
                    }, (r) => resolve(r));
                });
                if (!res?.success) {
                    throw new Error(res?.error || 'Transport failed');
                }
                const data = res.data;

                if (data && !data.error) {
                    target.name = data.name || `Player ${target.id}`;
                    target.data = {
                        name: data.name,
                        status: data.status || { state: 'Unknown', description: 'Status unavailable' },
                        last_action: data.last_action
                    };
                    target.lastUpdated = Date.now();
                } else if (data && data.error) {
                    console.warn(`⚔️ API error for player ${target.id}:`, data.error.error, `(code ${data.error.code})`);
                    target.name = `Player ${target.id}`;
                    target.data = { error: data.error.error || 'Unknown error', code: data.error.code };
                    return data.error.code;
                } else {
                    target.name = `Player ${target.id}`;
                    target.data = { error: 'No data available' };
                }
            } catch (error) {
                console.warn(`⚔️ Target ${target.id} update failed:`, error.message);
                target.name = target.name || `Player ${target.id}`;
                target.data = { error: error.message };
            }
            return null;
        },

        // Start periodic status updates
        startStatusUpdates() {
            // Guard against double-arming from repeated init() (defense in
            // depth for the init guard) (audit item 7).
            this.stopStatusUpdates();

            // Continuous rolling poller: one target at a time, in sequence,
            // forever. A single loop means cycles can never overlap, and the
            // loop notices a freshly opened sidebar within its 250ms idle
            // granularity — no separate "refresh on open" hook needed.
            this._polling = true;
            this.pollLoop();

            // Display countdown refresh (1s): cheap targeted DOM updates only.
            this.displayUpdateInterval = setInterval(() => {
                this.updateTimerDisplays();
            }, 1000);
        },

        // Stop periodic status updates
        stopStatusUpdates() {
            this._polling = false;
            if (this.displayUpdateInterval) {
                clearInterval(this.displayUpdateInterval);
                this.displayUpdateInterval = null;
            }
        },

        // True when the sidebar housing the attack lists is actually on
        // screen. When it's closed there is nothing to refresh — skip both
        // API polling and display work (audit item 7).
        isAnyListVisible() {
            const ui = window.SidekickModules?.UI;
            if (ui && typeof ui.sidebarVisible === 'boolean' && !ui.sidebarVisible) return false;
            // Direct DOM check covers the moment right before UI sets its flag
            return !!document.querySelector('[id^="sidekick-attacklist-"]');
        },

        // Should this page drive API polling at all?
        shouldPoll() {
            // The tab must be focused: sidebar state syncs open across all
            // Torn tabs, so without this check every open tab would run its
            // own poller and multiply the API usage.
            if (document.visibilityState !== 'visible') return false;
            return this.isAnyListVisible() && this.attackLists.some(al => al.targets.length > 0);
        },

        // Rolling poll loop. Fetches every target in sequence with
        // POLL_SPACING_MS between requests, so the total budget is capped at
        // ~60/1.5 = 40 calls/min (Torn allows 100/min per key) while each
        // target's freshness is targets × (fetch + spacing) — seconds for
        // typical lists instead of the old 5-minute burst interval.
        async pollLoop() {
            while (this._polling) {
                if (!this.shouldPoll()) {
                    await this._sleep(250);
                    continue;
                }

                let rateLimited = false;

                cycle: for (const attackList of this.attackLists) {
                    for (const target of attackList.targets) {
                        if (!this.shouldPoll()) break cycle;
                        const errorCode = await this.updateTargetStatus(target);
                        if (errorCode === 5) {
                            rateLimited = true;
                            break cycle;
                        }
                        await this._sleep(this.POLL_SPACING_MS);
                    }
                    // Render list-by-list so partial progress shows even on error
                    if (this.isAnyListVisible()) this.renderTargets(attackList);
                }

                if (rateLimited) {
                    // Torn says we're going too fast — back off, don't hammer
                    console.warn('⚔️ Torn API rate limit reached — attack list poller backing off 30s');
                    await this._sleep(30000);
                } else {
                    this.saveAttackLists();
                }
            }
        },

        _sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        // Refresh ONLY the status/countdown text each second. The old code
        // rebuilt every list's full innerHTML every second — wiping hover
        // state and re-attaching all listeners continuously (audit item 7).
        updateTimerDisplays() {
            if (!this.isAnyListVisible()) return;

            const now = Math.floor(Date.now() / 1000);
            for (const attackList of this.attackLists) {
                for (const target of attackList.targets) {
                    const row = document.querySelector(
                        `[data-target-id="${target.id}"] .status-text`
                    );
                    if (!row || !target.data?.status) continue;

                    const expected = this.renderTargetStatus(target);
                    if (row.dataset.lastRender !== `${target.data.status.until || 0}|${now}`) {
                        // Only rewrite when the rendered output actually
                        // changed (formatTimeRemaining is second-granular).
                        if (row.innerHTML !== expected) {
                            row.innerHTML = expected;
                        }
                        row.dataset.lastRender = `${target.data.status.until || 0}|${now}`;
                    }
                }
            }
        },

        // Make element draggable
        makeDraggable(element, attackList) {
            const header = element.querySelector('.attacklist-header');
            if (!header) return;

            // (Audit item 7) ONE shared pair of document-level drag handlers
            // drives whichever list is actively being dragged — the old code
            // registered fresh document mousemove/mouseup listeners per
            // rendered list and never removed them (leak per render/re-render).
            if (!this._dragState) {
                this._dragState = { active: null }; // { element, attackList, isDragging, initialX, initialY, currentX, currentY }
            }

            header.addEventListener('mousedown', (e) => {
                const st = this._dragState;
                if (e.target.closest('input') || e.target.closest('button') || attackList.pinned) return;
                if (!(e.target === header || header.contains(e.target))) return;

                // Anchor to the element's CURRENT on-screen position, not the
                // render-time snapshot: after a completed drag the persisted
                // attackList.x/y is updated but this closure isn't, so a
                // stale anchor teleports the window on the next drag.
                const styleX = parseFloat(element.style.left);
                const styleY = parseFloat(element.style.top);
                const curX = Number.isFinite(styleX) ? styleX : (attackList.x || 0);
                const curY = Number.isFinite(styleY) ? styleY : (attackList.y || 0);

                st.active = {
                    element,
                    attackList,
                    isDragging: true,
                    initialX: e.clientX - curX,
                    initialY: e.clientY - curY,
                    currentX: curX,
                    currentY: curY,
                };
                element.style.cursor = 'grabbing';
            });

            if (!this._docDragHandlersInstalled) {
                this._docDragHandlersInstalled = true;

                const drag = (e) => {
                    const st = this._dragState;
                    const a = st.active;
                    if (!a || !a.isDragging) return;

                    const list = a.attackList;
                    const el = a.element;
                    e.preventDefault();

                    // Reconstruct position from the mousedown anchor,
                    // matching the original drag math.
                    let currentX = e.clientX - a.initialX;
                    let currentY = e.clientY - a.initialY;

                    const contentArea = document.getElementById('sidekick-content');
                    if (contentArea) {
                        const bounds = contentArea.getBoundingClientRect();
                        const elementBounds = el.getBoundingClientRect();

                        currentX = Math.max(0, Math.min(currentX, bounds.width - elementBounds.width));
                        currentY = Math.max(0, Math.min(currentY, bounds.height - elementBounds.height));
                    }

                    a.currentX = currentX;
                    a.currentY = currentY;

                    el.style.left = currentX + 'px';
                    el.style.top = currentY + 'px';
                };

                const dragEnd = () => {
                    const st = this._dragState;
                    const a = st.active;
                    if (a && a.isDragging) {
                        a.isDragging = false;
                        a.element.style.cursor = 'default';

                        // Save position
                        a.attackList.x = a.currentX ?? a.attackList.x;
                        a.attackList.y = a.currentY ?? a.attackList.y;
                        a.attackList.modified = new Date().toISOString();
                        this.saveAttackLists();

                        st.active = null;
                    }
                };

                document.addEventListener('mousemove', drag);
                document.addEventListener('mouseup', dragEnd);
                this._docDragHandlers = { drag, dragEnd };
            }
        },

        // Render all attack lists
        renderAllAttackLists() {
            console.log('⚔️ Rendering all attack lists:', this.attackLists.length);
            this.attackLists.forEach(attackList => this.renderAttackList(attackList));
        },

        // Clear all existing attack list elements
        clearExistingAttackLists() {
            const existingAttackLists = document.querySelectorAll('[id^="sidekick-attacklist-"]');
            existingAttackLists.forEach(element => element.remove());
        },

        // Helper methods
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

        // Utility to darken a color
        darkenColor(color, percent) {
            if (!color) return '#B71C1C';
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

    // Initialize global namespace if it doesn't exist
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    // Export Attack List module to global namespace
    window.SidekickModules.AttackList = AttackListModule;
    console.log("✅ Attack List Module loaded and ready");

})();
