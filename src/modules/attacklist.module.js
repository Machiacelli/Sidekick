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
        updateInterval: null,
        displayUpdateInterval: null,

        // Initialize the attack list module
        async init() {
            if (this.isInitialized) {
                console.log("⚔️ Attack List Module already initialized");
                return;
            }

            console.log("⚔️ Initializing Attack List Module...");

            try {
                // Clear any existing intervals
                if (this.updateInterval) {
                    clearInterval(this.updateInterval);
                    this.updateInterval = null;
                }
                if (this.displayUpdateInterval) {
                    clearInterval(this.displayUpdateInterval);
                    this.displayUpdateInterval = null;
                }

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
                // Use StateManager for debounced saves (1 second delay)
                if (window.SidekickModules?.Core?.StateManager) {
                    await window.SidekickModules.Core.StateManager.saveModuleState(
                        'attacklist',
                        { lists: this.attackLists },
                        1000 // 1 second debounce
                    );
                }

                // Legacy direct save for backwards compatibility
                await window.SidekickModules.Core.ChromeStorage.set('sidekick_attacklists', this.attackLists);
                console.log('💾 Attack lists saved successfully to Chrome storage');
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
            const contentArea = document.getElementById('sidekick-content');
            if (!contentArea) return;

            // Remove existing element if it exists
            const existingElement = document.getElementById(`sidekick-attacklist-${attackList.id}`);
            if (existingElement) {
                existingElement.remove();
            }

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
                                min-width: 120px;
                                box-shadow: 0px 8px 16px rgba(0,0,0,0.3);
                                z-index: 1001;
                                border-radius: 4px;
                                border: 1px solid #555;
                                top: 100%;
                                right: 0;
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
                                " onmouseover="this.style.background='rgba(255,255,255,0.1)'" 
                                   onmouseout="this.style.background='none'">
                                    🎯 Add Target
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
                                " onmouseover="this.style.background='rgba(255,255,255,0.1)'" 
                                   onmouseout="this.style.background='none'">
                                    🎨 Change Color
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
                                " onmouseover="this.style.background='rgba(255,255,255,0.1)'" 
                                   onmouseout="this.style.background='none'">
                                    ${attackList.pinned ? '📌 Unpin' : '📌 Pin'}
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
                        " onmouseover="this.style.background='#c82333'; this.style.transform='scale(1.1)'; this.style.boxShadow='0 0 8px rgba(220, 53, 69, 0.6)'" 
                           onmouseout="this.style.background='#dc3545'; this.style.transform='scale(1)'; this.style.boxShadow='none'" 
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
                    <a href="https://www.torn.com/loader.php?sid=attack&user2ID=${target.id}" 
                       target="_blank" 
                       style="color: #4CAF50; text-decoration: none; font-size: 12px; font-weight: bold; flex: 1;">
                        ${this.escapeHtml(playerName)}
                    </a>
                    
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="font-size: 11px;">
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
                        " onmouseover="this.style.background='rgba(200, 35, 51, 1)'; this.style.transform='scale(1.1)'; this.style.opacity='1'" 
                           onmouseout="this.style.background='rgba(220, 53, 69, 0.8)'; this.style.transform='scale(1)'; this.style.opacity='0.7'" 
                           title="Remove target">×</button>
                    </div>
                </div>
            `;
        },

        // Render target status with color coding
        renderTargetStatus(target) {
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
                return `<span style="color: #f44336; font-weight: bold;">🏥 ${timeLeft}</span>`;
            }

            // Jail status (purple with timer)
            if (data.status.state === 'Jail') {
                const timeLeft = data.status.until ? this.formatTimeRemaining(data.status.until) : '';
                return `<span style="color: #9c27b0; font-weight: bold;">🔒 ${timeLeft}</span>`;
            }

            // Flying status (blue with timer)
            if (data.status.state === 'Traveling') {
                const timeLeft = data.status.until ? this.formatTimeRemaining(data.status.until) : '';
                return `<span style="color: #2196f3; font-weight: bold;">✈️ ${timeLeft}</span>`;
            }

            // Other statuses
            return `<span style="color: #ff9800;">${data.status.state}</span>`;
        },

        // Format time remaining
        formatTimeRemaining(timestamp) {
            const now = Math.floor(Date.now() / 1000);
            const timeLeft = timestamp - now;

            if (timeLeft <= 0) return 'Available';

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

                // Close dropdown when clicking outside
                document.addEventListener('click', () => {
                    dropdownContent.style.display = 'none';
                });
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

            console.log("Close button found:", closeBtn);

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
                            console.log(`📏 Saved attack list '${attackList.name}' size: ${attackList.width}x${attackList.height}`);
                        }, 500);
                    }
                }
            });
            resizeObserver.observe(element);

            // Make draggable
            this.makeDraggable(element, attackList);
        },

        // Show add target dialog
        showAddTargetDialog(attackList) {
            const playerId = prompt('Enter Player ID:');
            if (!playerId || !playerId.trim()) return;

            const targetId = playerId.trim();
            if (isNaN(targetId) || targetId <= 0) {
                alert('Please enter a valid player ID');
                return;
            }

            // Check if target already exists
            if (attackList.targets.find(t => t.id === targetId)) {
                alert('This target is already in the list');
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
            this.renderTargets(attackList);

            // Update target data immediately
            this.updateTargetStatus(target).then(() => {
                this.renderTargets(attackList);
                this.saveAttackLists();
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
        deleteAttackList(id) {
            const element = document.getElementById(`sidekick-attacklist-${id}`);
            if (element) {
                element.remove();
            }

            this.attackLists = this.attackLists.filter(al => al.id !== id);
            this.saveAttackLists();

            console.log('⚔️ Attack list deleted');
        },

        // Update target status via API
        async updateTargetStatus(target) {
            try {
                console.log(`🎯 Fetching data for player ${target.id}...`);

                // Get API key from settings
                const apiKey = await window.SidekickModules.Settings.getApiKey();
                if (!apiKey) {
                    throw new Error('API key not configured');
                }

                // Fetch player data using Torn API
                const response = await fetch(`https://api.torn.com/user/${target.id}?selections=basic,profile&key=${apiKey}`);
                const data = await response.json();

                if (data && !data.error) {
                    target.name = data.name || `Player ${target.id}`;
                    target.data = {
                        name: data.name,
                        status: data.status || { state: 'Unknown', description: 'Status unavailable' },
                        last_action: data.last_action
                    };
                    target.lastUpdated = Date.now();
                    console.log(`✅ Updated data for ${target.name} (${target.id}):`, target.data.status);
                } else if (data && data.error) {
                    console.error(`❌ API Error for player ${target.id}:`, data.error);
                    target.name = `Player ${target.id}`;
                    target.data = { error: data.error.error || 'Unknown error' };

                    // Show user-friendly error message
                    if (data.error.code === 6) {
                        console.warn(`Player ID ${target.id} not found`);
                    } else if (data.error.code === 7) {
                        console.warn(`No access to player ${target.id} data`);
                    }
                } else {
                    console.warn(`⚠️ No data returned for player ${target.id}`);
                    target.name = `Player ${target.id}`;
                    target.data = { error: 'No data available' };
                }
            } catch (error) {
                console.error(`❌ Error fetching target data for ${target.id}:`, error);
                target.name = `Player ${target.id}`;
                target.data = { error: error.message };
            }
        },

        // Start periodic status updates
        startStatusUpdates() {
            // Update every 5 minutes
            this.updateInterval = setInterval(() => {
                this.updateAllTargets();
            }, 300000); // 5 minutes

            // Update display every second for countdown timers
            this.displayUpdateInterval = setInterval(() => {
                this.updateTimerDisplays();
            }, 1000); // 1 second

            console.log('⚔️ Status updates started (5-minute interval)');
            console.log('⚔️ Display timer updates started (1-second interval)');
        },

        // Update all targets in all attack lists
        async updateAllTargets() {
            console.log('⚔️ Updating all target statuses...');

            for (const attackList of this.attackLists) {
                for (const target of attackList.targets) {
                    await this.updateTargetStatus(target);
                    // Small delay to avoid API rate limits
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                this.renderTargets(attackList);
            }

            this.saveAttackLists();
            console.log('✅ All targets updated');
        },

        // Update only the timer displays without API calls
        updateTimerDisplays() {
            for (const attackList of this.attackLists) {
                this.renderTargets(attackList);
            }
        },

        // Make element draggable
        makeDraggable(element, attackList) {
            const header = element.querySelector('.attacklist-header');
            if (!header) return;

            let isDragging = false;
            let currentX = attackList.x || 0;
            let currentY = attackList.y || 0;
            let initialX;
            let initialY;
            let xOffset = currentX;
            let yOffset = currentY;

            header.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);

            function dragStart(e) {
                if (e.target.closest('input') || e.target.closest('button') || attackList.pinned) return;

                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;

                if (e.target === header || header.contains(e.target)) {
                    isDragging = true;
                    element.style.cursor = 'grabbing';
                }
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;

                    xOffset = currentX;
                    yOffset = currentY;

                    const contentArea = document.getElementById('sidekick-content');
                    if (contentArea) {
                        const bounds = contentArea.getBoundingClientRect();
                        const elementBounds = element.getBoundingClientRect();

                        currentX = Math.max(0, Math.min(currentX, bounds.width - elementBounds.width));
                        currentY = Math.max(0, Math.min(currentY, bounds.height - elementBounds.height));

                        xOffset = currentX;
                        yOffset = currentY;
                    }

                    element.style.left = currentX + 'px';
                    element.style.top = currentY + 'px';
                }
            }

            function dragEnd(e) {
                if (isDragging) {
                    isDragging = false;
                    element.style.cursor = 'default';

                    // Save position
                    attackList.x = currentX;
                    attackList.y = currentY;
                    attackList.modified = new Date().toISOString();

                    if (window.SidekickModules?.AttackList?.saveAttackLists) {
                        window.SidekickModules.AttackList.saveAttackLists();
                    }

                    console.log(`⚔️ Attack list position saved: x=${currentX}, y=${currentY}`);
                }
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