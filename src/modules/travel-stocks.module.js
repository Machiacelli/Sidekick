/**
 * Travel Stock & Profit Module
 * Shows abroad stock from YATA with profit calculations
 */

const TravelStocksModule = {
    name: "Travel Stocks",
    version: "1.0.0",

    state: {
        isEnabled: false,
        window: null,
        yataCache: null,
        yataCacheTime: 0,
        avgPriceCache: {},
        queue: [],
        inFlight: 0,
        lastUpdated: null  // Track last data fetch time
    },

    settings: {
        isEnabled: true,
        country: "ALL",
        sortBy: "profit",
        sortDir: "desc",
        showOnlyProfit: false,
        multiplier: 1,
        limit: 200
    },

    // Constants
    COUNTRY_MAP: {
        mex: "MEXICO",
        cay: "CAYMAN ISLANDS",
        can: "CANADA",
        haw: "HAWAII",
        uni: "UNITED KINGDOM",
        arg: "ARGENTINA",
        swi: "SWITZERLAND",
        jap: "JAPAN",
        chi: "CHINA",
        uae: "UAE",
        sou: "SOUTH AFRICA"
    },

    TTL_YATA_MS: 60 * 1000,      // 1 minute
    TTL_AVG_MS: 30 * 60 * 1000,  // 30 minutes
    MAX_IN_FLIGHT: 2,
    MAX_VISIBLE_FETCH: 250,

    // Initialize module
    async init() {
        console.log('💰 Travel Stocks: Initializing...');

        try {
            const ChromeStorage = window.SidekickModules.Core.ChromeStorage;

            // Load settings
            const settings = await ChromeStorage.get('sidekick_settings') || {};
            const moduleSettings = settings['travel-stocks'] || {};

            this.settings = {
                ...this.settings,
                ...moduleSettings
            };

            // Load cache
            const cache = await ChromeStorage.get('sidekick_travelStocksCache') || {};
            this.state.cache = {
                yata: cache.yata || null,
                yataFetchedMs: cache.yataFetchedMs || 0,
                avgById: cache.avgById || {}
            };

            console.log('💰 Travel Stocks initialized');
        } catch (err) {
            console.error('💰 Error loading settings:', err);
        }

        // Inject CSS
        this.injectCSS();

        // Restore window if it was open
        await this.restoreWindowState();
    },


    // Restore window state on page load
    async restoreWindowState() {
        try {
            const ChromeStorage = window.SidekickModules.Core.ChromeStorage;
            const StateManager = window.SidekickModules.Core.StateManager;
            const windowState = await ChromeStorage.get('sidekick_travelStocksWindowState') || {};

            if (windowState.isOpen) {
                console.log('💰 Restoring Travel Stocks window');
                // Wait for sidebar to be ready
                setTimeout(() => {
                    this.createWindow();
                }, 100);
            }
        } catch (err) {
            console.error('💰 Error restoring window state:', err);
        }
    },

    // Inject CSS styles
    injectCSS() {
        console.log('💰 Injecting CSS styles...');
        // Remove existing styles to force update
        const existingStyles = document.getElementById('travel-stocks-styles');
        if (existingStyles) {
            console.log('💰 Removing old styles');
            existingStyles.remove();
        }

        const style = document.createElement('style');
        style.id = 'travel-stocks-styles';
        style.textContent = `
            .travel-stocks-window {
                position: absolute;
                left: 10px;
                top: 10px;
                width: 700px;
                height: 500px;
                min-width: 500px;
                min-height: 350px;
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                z-index: 1000;
                resize: both;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            }
            .travel-stocks-window .window-header {
                background: linear-gradient(135deg, #FF9800, #F57C00);
                padding: 8px 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move !important;
                color: #fff;
                font-weight: bold;
                border-radius: 6px 6px 0 0;
                font-size: 13px;
                user-select: none;
                -webkit-user-select: none;
            }
            .travel-stocks-window .window-controls {
                display: flex;
                gap: 4px;
            }
            .travel-stocks-window .window-btn {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                cursor: pointer;
                font-size: 12px;
                padding: 2px 6px;
                border-radius: 3px;
                transition: all 0.2s;
            }
            .travel-stocks-window .window-btn:hover {
                background: rgba(255,255,255,0.3);
            }
            .travel-stocks-window .window-close {
                background: #dc3545;
                width: 18px;
                height: 18px;
                padding: 0;
                border-radius: 50%;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .travel-stocks-window .window-content {
                flex: 1;
                overflow: hidden;
                background: #1f1f1f;
                color: #fff;
                display: flex;
                flex-direction: column;
            }
            .travel-controls {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
                padding: 10px 12px;
                background: linear-gradient(135deg, rgba(40,40,40,0.98), rgba(30,30,30,0.95));
                border-bottom: 2px solid rgba(255,152,0,0.25);
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            }
            .travel-controls label {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 10px;
                color: rgba(255,255,255,0.85);
                font-weight: 500;
                letter-spacing: 0.3px;
            }
            .travel-controls select {
                padding: 4px 8px;
                border-radius: 6px;
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.15);
                color: white;
                font-size: 10px;
                cursor: pointer;
                transition: all 0.25s ease;
                outline: none;
                min-width: 90px;
            }
            .travel-controls select option {
                background: #2a2a2a;
                color: white;
            }
            .travel-controls select:hover {
                background: rgba(255,255,255,0.12);
                border-color: rgba(255,152,0,0.5);
                transform: translateY(-1px);
            }
            .travel-controls select:focus {
                border-color: rgba(255,152,0,0.7);
                box-shadow: 0 0 0 2px rgba(255,152,0,0.15);
            }
            .travel-multiplier-wrapper {
                position: relative;
                display: inline-block;
                margin-right: 5px;
            }
            .travel-multiplier-btn {
                min-width: 45px;
                padding: 4px 6px;
                background: linear-gradient(135deg, rgba(50,50,50,0.9), rgba(35,35,35,0.95));
                border: 1px solid rgba(255,152,0,0.4);
                border-radius: 6px;
                color: #FF9800;
                font-size: 10px;
                font-weight: 700;
                text-align: center;
                cursor: pointer;
                outline: none;
            }
            .travel-multiplier-btn:hover {
                border-color: rgba(255,152,0,0.8);
                background: linear-gradient(135deg, rgba(60,60,60,0.9), rgba(45,45,45,0.95));
                box-shadow: 0 0 5px rgba(255,152,0,0.3);
            }
            .travel-multiplier-dropdown {
                position: absolute;
                top: 100%;
                left: 0;
                margin-top: 4px;
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 6px;
                max-height: 150px;
                overflow-y: auto;
                scrollbar-width: none;
                display: none;
                z-index: 10000;
                list-style: none;
                padding: 0;
                min-width: 45px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            }
            .travel-multiplier-dropdown::-webkit-scrollbar {
                display: none;
            }
            .travel-multiplier-dropdown.show {
                display: block;
            }
            .travel-multiplier-dropdown li {
                padding: 5px 8px;
                cursor: pointer;
                font-size: 10px;
                color: white;
                text-align: center;
                border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            .travel-multiplier-dropdown li:last-child {
                border-bottom: none;
            }
            .travel-multiplier-dropdown li:hover {
                background: rgba(255,152,0,0.3);
                color: #FF9800;
            }
            .travel-row-highlight td {
                background-color: rgba(255,152,0,0.2) !important;
            }
            .travel-checkbox-label {
                cursor: pointer;
                color: rgba(255,255,255,0.85);
                font-size: 10px;
                padding: 4px 8px;
                border-radius: 6px;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.12);
                transition: all 0.25s ease;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .travel-checkbox-label:hover {
                background: rgba(255,255,255,0.1);
                border-color: rgba(255,152,0,0.4);
                transform: translateY(-1px);
            }
            .travel-refresh-btn {
                padding: 5px 12px;
                border-radius: 6px;
                background: linear-gradient(135deg, #FF9800, #F57C00);
                border: none;
                color: white;
                cursor: pointer;
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 0.4px;
                transition: all 0.25s ease;
                box-shadow: 0 2px 6px rgba(255,152,0,0.3);
            }
            .travel-refresh-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 10px rgba(255,152,0,0.4);
                background: linear-gradient(135deg, #FFA726, #FB8C00);
            }
            .travel-refresh-btn:active {
                transform: translateY(0);
                box-shadow: 0 2px 4px rgba(255,152,0,0.3);
            }
            .travel-meta {
                margin-left: auto;
                font-size: 9px;
                color: rgba(255,255,255,0.6);
                background: rgba(0,0,0,0.4);
                padding: 4px 8px;
                border-radius: 12px;
                font-weight: 500;
                border: 1px solid rgba(255,255,255,0.08);
            }
            .travel-table-wrap {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                max-height: 100%;
                scrollbar-width: none;
                -ms-overflow-style: none;
            }
            .travel-table-wrap::-webkit-scrollbar {
                width: 0;
                height: 0;
                display: none;
            }
            .travel-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 11px;
                color: #ffffff;
            }
            .travel-table thead th {
                position: sticky;
                top: 0;
                background: linear-gradient(135deg, rgba(35,35,35,1), rgba(25,25,25,0.98));
                padding: 8px 10px;
                text-align: left;
                border-bottom: 2px solid rgba(255,152,0,0.3);
                font-weight: 600;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: rgba(255,255,255,0.85);
                z-index: 2;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .travel-table th.num,
            .travel-table td.num {
                text-align: right;
            }
            .travel-table td {
                padding: 8px 10px;
                border-bottom: 1px solid rgba(255,255,255,0.06);
                transition: all 0.2s ease;
            }
            .travel-table tbody tr:nth-child(even) {
                background: rgba(255,255,255,0.03);
            }
            .travel-table tbody tr:hover {
                background: linear-gradient(135deg, rgba(255,152,0,0.15), rgba(255,152,0,0.1)) !important;
                transform: translateX(2px);
                box-shadow: inset 3px 0 0 rgba(255,152,0,0.6);
            }
            .item-name {
                font-weight: 600;
                color: #ffffff;
                font-size: 11px;
            }
            .profit-positive {
                color: #4ade80;
                font-weight: 600;
            }
            .profit-positive::before {
                content: '↑ ';
                opacity: 0.7;
            }
            .profit-negative {
                color: #f87171;
                font-weight: 600;
            }
            .profit-negative::before {
                content: '↓ ';
                opacity: 0.7;
            }
            .profit-zero {
                color: #94a3b8;
                font-weight: 500;
            }
            .profit-unknown {
                color: rgba(255,255,255,0.3);
                font-style: italic;
            }
        `;
        document.head.appendChild(style);
    },

    // Enable module
    enable() {
        console.log('💰 Enabling Travel Stocks...');
        this.state.isEnabled = true;
    },

    // Disable module
    disable() {
        console.log('💰 Disabling Travel Stocks...');
        this.state.isEnabled = false;
        if (this.state.window) {
            this.state.window.remove();
            this.state.window = null;
        }
    },

    // Create and show window
    async createWindow() {
        if (this.state.window) return;

        // Load saved state
        const ChromeStorage = window.SidekickModules.Core.ChromeStorage;
        const savedState = await ChromeStorage.get('sidekick_travelStocksWindowState') || {};

        const x = savedState.x || 10;
        const y = savedState.y || 10;

        // Cap saved dimensions to prevent oversized windows
        let width = savedState.width || 380;
        let height = savedState.height || 280;

        // Override if saved state is too large
        if (width > 400) width = 380;
        if (height > 350) height = 280;

        const win = document.createElement('div');
        win.className = 'travel-stocks-window';
        win.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            width: ${width}px;
            height: ${height}px;
            background: #2a2a2a;
            border: 1px solid #444;
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            min-width: 350px;
            min-height: 250px;
            z-index: 1000;
            resize: both;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        `;

        win.innerHTML = `
            <div class="window-header" style="
                background: linear-gradient(135deg, #FF9800, #F57C00);
                padding: 8px 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                color: #fff;
                font-weight: bold;
                border-radius: 6px 6px 0 0;
                font-size: 13px;
                user-select: none;
            ">
                <span class="window-title">Travel Stocks</span>
                <div class="window-controls" style="display: flex; gap: 4px;">
                    <button class="window-close" style="
                        background: #dc3545;
                        border: none;
                        color: white;
                        cursor: pointer;
                        font-size: 12px;
                        padding: 0;
                        width: 18px;
                        height: 18px;
                        border-radius: 50%;
                        font-weight: bold;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">×</button>
                </div>
            </div>
            <div class="window-content" style="
                flex: 1;
                overflow: hidden;
                background: #1f1f1f;
                color: #ffffff !important;
                display: flex;
                flex-direction: column;
            ">
                <div class="travel-controls" style="color: #ffffff;">
                    <label style="color: rgba(255,255,255,0.9);">
                        Country:
                        <select class="travel-country">
                            <option value="ALL">All Countries</option>
                        </select>
                    </label>
                    <label class="travel-checkbox-label" style="color: rgba(255,255,255,0.9);">
                        <input type="checkbox" class="travel-showprofit" />
                        Show Only Profit
                    </label>
                    <div class="travel-multiplier-wrapper">
                        <button class="travel-multiplier-btn">1x</button>
                        <ul class="travel-multiplier-dropdown">
                            ${Array.from({length: 88}, (_, i) => `<li data-value="${i+1}">${i+1}x</li>`).join('')}
                        </ul>
                    </div>
                    <button class="travel-refresh-btn">Refresh</button>
                    <span class="travel-meta"></span>
                </div>
                    <table class="travel-table">
                        <thead>
                            <tr>
                                <th data-sort="country" style="cursor: pointer;">Country <span class="sort-ind"></span></th>
                                <th data-sort="name" style="cursor: pointer;">Item <span class="sort-ind"></span></th>
                                <th class="num" data-sort="cost" style="cursor: pointer;">Cost <span class="sort-ind"></span></th>
                                <th class="num" data-sort="profit" style="cursor: pointer;">Profit <span class="sort-ind"></span></th>
                                <th class="num" data-sort="qty" style="cursor: pointer;">Stock <span class="sort-ind"></span></th>
                            </tr>
                        </thead>
                        <tbody class="travel-tbody">
                            <tr><td colspan="5" class="travel-loading">Click Refresh to load data</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.state.window = win;
        this.wireWindow(win);

        // Auto-load data
        setTimeout(() => this.renderTable(win, true), 100);

        // Register with WindowManager
        if (window.SidekickModules?.Core?.WindowManager) {
            window.SidekickModules.Core.WindowManager.registerWindow(win, 'travel-stocks');
        }

        // Add to DOM - use sidebar content area directly  
        const contentArea = document.getElementById('sidekick-content');
        if (contentArea) {
            contentArea.appendChild(win);
        } else {
            // Fallback to sidebarroot
            document.getElementById('sidebarroot')?.appendChild(win);
        }

        console.log('💰 Travel Stocks window added to sidebar');
        this.state.window = win;

        // THEN restore position/size (after DOM insertion for proper dragging)
        const StateManager = window.SidekickModules.Core.StateManager;
        const savedGeometry = await StateManager?.loadModuleState?.('travel-stocks');
        if (savedGeometry?.geometry) {
            const { size, position } = savedGeometry.geometry;
            if (size) {
                win.style.width = size.width + 'px';
                win.style.height = size.height + 'px';
                console.log(`💰 Restored window size: ${size.width}x${size.height}`);
            }
            if (position) {
                win.style.left = position.x + 'px';
                win.style.top = position.y + 'px';
                console.log(`💰 Restored window position: ${position.x}, ${position.y}`);
            }
        }

        // Initial render
        this.renderTable(win, true);

        // Save state so it reopens on refresh
        this.saveWindowState(win, true);
    },

    // Wire event listeners
    wireWindow(win) {
        const header = win.querySelector('.window-header');

        // Click to bring to front
        win.addEventListener('mousedown', () => {
            const allWindows = document.querySelectorAll('.travel-stocks-window, .movable-stockadvisor, .movable-notepad, .movable-timer');
            let maxZ = 1000;
            allWindows.forEach(w => {
                const z = parseInt(w.style.zIndex || 1000);
                if (z > maxZ) maxZ = z;
            });
            win.style.zIndex = String(maxZ + 1);
        });

        // Make draggable
        let isDragging = false;
        let currentX, currentY, initialX, initialY;

        header.addEventListener('mousedown', (e) => {
            // Don't drag when clicking buttons
            if (e.target.classList.contains('window-btn') ||
                e.target.closest('.window-btn') ||
                e.target.classList.contains('window-close') ||
                e.target.classList.contains('window-minimize')) {
                return;
            }

            e.preventDefault();
            isDragging = true;

            const rect = win.getBoundingClientRect();
            initialX = e.clientX - rect.left;
            initialY = e.clientY - rect.top;

            header.style.cursor = 'grabbing';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            e.stopPropagation();

            // Calculate position relative to sidebar
            const sidebar = document.getElementById('sidekick-content');
            if (sidebar) {
                const sidebarRect = sidebar.getBoundingClientRect();

                // New position relative to sidebar
                currentX = e.clientX - sidebarRect.left - initialX;
                currentY = e.clientY - sidebarRect.top - initialY;

                const winWidth = win.offsetWidth;
                const winHeight = win.offsetHeight;

                // Keep within bounds
                currentX = Math.max(0, Math.min(currentX, sidebarRect.width - winWidth));
                currentY = Math.max(0, Math.min(currentY, sidebarRect.height - winHeight));

                win.style.left = currentX + 'px';
                win.style.top = currentY + 'px';
            }
        };

        const onMouseUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            header.style.cursor = 'move';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Save position
            this.saveWindowState(win);
        };

        // Close button
        win.querySelector('.window-close').addEventListener('click', () => {
            win.remove();
            this.state.window = null;
            // Save that window is closed
            this.saveWindowState(win, false);
        });

        // Controls
        const countrySel = win.querySelector('.travel-country');
        const showProfitChk = win.querySelector('.travel-showprofit');
        const refreshBtn = win.querySelector('.travel-refresh-btn');
        const tableHeaders = win.querySelectorAll('th[data-sort]');

        countrySel.addEventListener('change', async (e) => {
            this.settings.country = e.target.value;
            await this.saveSettings();
            this.renderTable(win, false);
        });

        // Table header click for sorting
        tableHeaders.forEach(th => {
            th.addEventListener('click', async () => {
                const sortField = th.dataset.sort;

                // Toggle direction if same field, otherwise default to desc
                if (this.settings.sortBy === sortField) {
                    this.settings.sortDir = this.settings.sortDir === 'desc' ? 'asc' : 'desc';
                } else {
                    this.settings.sortBy = sortField;
                    this.settings.sortDir = 'desc';
                }

                await this.saveSettings();
                this.renderTable(win, false);
            });
        });

        showProfitChk.addEventListener('change', async (e) => {
            this.settings.showOnlyProfit = e.target.checked;
            await this.saveSettings();
            this.renderTable(win, false);
        });

        const wrapper = win.querySelector('.travel-multiplier-wrapper');
        const btn = wrapper.querySelector('.travel-multiplier-btn');
        const dropdown = wrapper.querySelector('.travel-multiplier-dropdown');
        
        btn.textContent = (this.settings.multiplier || 1) + 'x';

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        dropdown.addEventListener('click', async (e) => {
            if (e.target.tagName === 'LI') {
                const val = parseInt(e.target.dataset.value, 10);
                this.settings.multiplier = val;
                btn.textContent = val + 'x';
                dropdown.classList.remove('show');
                await this.saveSettings();
                this.renderTable(win, false);
            }
        });

        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });

        // Row highlighting logic
        const tbody = win.querySelector('.travel-tbody');
        tbody.addEventListener('click', (e) => {
            // Ignore clicks on links
            if (e.target.tagName === 'A' || e.target.closest('a')) return;

            const tr = e.target.closest('tr');
            if (tr && tr.dataset.itemId) {
                // If clicking an already highlighted row, just toggle it off
                if (tr.classList.contains('travel-row-highlight')) {
                    tr.classList.remove('travel-row-highlight');
                } else {
                    // Remove highlight from all rows
                    const allRows = tbody.querySelectorAll('tr');
                    allRows.forEach(r => r.classList.remove('travel-row-highlight'));
                    // Add highlight to clicked row
                    tr.classList.add('travel-row-highlight');
                }
            }
        });

        refreshBtn.addEventListener('click', () => {
            console.log('💰 REFRESH BUTTON CLICKED');
            this.state.lastUpdated = new Date();
            this.renderTable(win, true);
        });

        // Save ONLY size on resize, not position (prevents jumping)
        const resizeObserver = new ResizeObserver(() => {
            const rect = win.getBoundingClientRect();
            const StateManager = window.SidekickModules.Core.StateManager;
            if (StateManager && StateManager.saveModuleState) {
                StateManager.saveModuleState('travel-stocks', {
                    geometry: {
                        size: { width: Math.round(rect.width), height: Math.round(rect.height) }
                    }
                }, 500);
            }
        });
        resizeObserver.observe(win);
    },

    // Save window state
    async saveWindowState(win, isOpen = true) {
        try {
            const ChromeStorage = window.SidekickModules.Core.ChromeStorage;
            const state = {
                isOpen: isOpen,
                x: parseInt(win.style.left) || 10,
                y: parseInt(win.style.top) || 10,
                width: win.offsetWidth,
                height: win.offsetHeight
            };
            await ChromeStorage.set('sidekick_travelStocksWindowState', state);
        } catch (err) {
            console.error('💰 Error saving window state:', err);
        }
    },

    // Apply settings to UI elements
    applySettingsToUI(win) {
        const sortBy = win.querySelector('.travel-sortby');
        if (sortBy) sortBy.value = this.settings.sortBy;
        
        const sortDir = win.querySelector('.travel-sortdir');
        if (sortDir) sortDir.value = this.settings.sortDir;

        const showProfit = win.querySelector('.travel-showprofit');
        if (showProfit) showProfit.checked = this.settings.showOnlyProfit;

        const multBtn = win.querySelector('.travel-multiplier-btn');
        if (multBtn) multBtn.textContent = (this.settings.multiplier || 1) + 'x';
    },

    // Save settings
    async saveSettings() {
        try {
            const ChromeStorage = window.SidekickModules.Core.ChromeStorage;
            const settings = await ChromeStorage.get('sidekick_settings') || {};
            settings['travel-stocks'] = this.settings;
            await ChromeStorage.set('sidekick_settings', settings);
        } catch (err) {
            console.error('💰 Error saving settings:', err);
        }
    },

    // Save cache
    async saveCache() {
        try {
            const ChromeStorage = window.SidekickModules.Core.ChromeStorage;
            await ChromeStorage.set('sidekick_travelStocksCache', this.state.cache);
        } catch (err) {
            console.error('💰 Error saving cache:', err);
        }
    },

    // Get cached average
    getCachedAvg(itemId) {
        const hit = this.state.cache.avgById[String(itemId)];
        if (!hit) return null;
        if ((Date.now() - hit.tMs) > this.TTL_AVG_MS) return null;
        return hit.avg;
    },

    // Set cached average
    async setCachedAvg(itemId, avg) {
        this.state.cache.avgById[String(itemId)] = { avg, tMs: Date.now() };
        await this.saveCache();
    },

    // Fetch YATA export
    async fetchYATA(force = false) {
        const now = Date.now();

        if (!force && this.state.cache.yata &&
            this.state.cache.yataFetchedMs &&
            (now - this.state.cache.yataFetchedMs) < this.TTL_YATA_MS) {
            return this.state.cache.yata;
        }

        const response = await fetch('https://yata.yt/api/v1/travel/export/');
        const yata = await response.json();

        this.state.cache.yata = yata;
        this.state.cache.yataFetchedMs = now;
        await this.saveCache();

        return yata;
    },

    // Normalize YATA data
    normalizeYATA(payload) {
        const out = [];
        const rootStocks = payload?.stocks;
        if (!rootStocks) return out;

        for (const [countryKey, countryObj] of Object.entries(rootStocks)) {
            const country = this.COUNTRY_MAP[countryKey] || String(countryKey).toUpperCase();
            const updated = Number(countryObj?.update || 0);
            const items = countryObj?.stocks;
            if (!Array.isArray(items)) continue;

            for (const it of items) {
                const id = Number(it?.id);
                if (!Number.isFinite(id)) continue;
                out.push({
                    country,
                    id,
                    name: String(it?.name || ""),
                    qty: Number.isFinite(Number(it?.quantity)) ? Number(it.quantity) : 0,
                    cost: Number(it?.cost) || 0,
                    updated
                });
            }
        }
        return out;
    },

    // Fetch average price from API
    async fetchAvgPrice(itemId) {
        const cached = this.getCachedAvg(itemId);
        if (typeof cached === 'number') return cached;

        // Get global API key
        const ChromeStorage = window.SidekickModules.Core.ChromeStorage;
        const apiKey = await ChromeStorage.get('sidekick_api_key');

        if (!apiKey) throw new Error('API key not set');

        const url = `https://api.torn.com/v2/market/${itemId}/itemmarket?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        const avg = data?.itemmarket?.item?.average_price;
        if (typeof avg !== 'number') throw new Error('average_price missing');

        await this.setCachedAvg(itemId, avg);
        return avg;
    },

    // Throttled queue
    enqueue(task) {
        return new Promise((resolve, reject) => {
            this.state.queue.push({ task, resolve, reject });
            this.pump();
        });
    },

    async pump() {
        if (this.state.inFlight >= this.MAX_IN_FLIGHT) return;
        const next = this.state.queue.shift();
        if (!next) return;

        this.state.inFlight++;
        try {
            next.resolve(await next.task());
        } catch (e) {
            next.reject(e);
        } finally {
            this.state.inFlight--;
            setTimeout(() => this.pump(), 0);
        }
    },

    // Sort rows
    sortRows(rows, sortBy, sortDir) {
        const dir = sortDir === 'asc' ? 1 : -1;
        const keyFn = (r) => {
            switch (sortBy) {
                case 'country': return r.country;
                case 'id': return r.id;
                case 'cost': return r.cost;
                case 'qty': return r.qty;
                case 'avg': return (typeof r.avg === 'number') ? r.avg : -1;
                case 'profit': return (typeof r.profit === 'number') ? r.profit : -1;
                default: return (typeof r.profit === 'number') ? r.profit : -1;
            }
        };
        return rows.slice().sort((a, b) => {
            const ka = keyFn(a);
            const kb = keyFn(b);
            if (typeof ka === 'string' || typeof kb === 'string') {
                return String(ka).localeCompare(String(kb)) * dir;
            }
            return (Number(ka) - Number(kb)) * dir;
        });
    },

    // Format money
    fmtMoney(n) {
        return (typeof n === 'number' && Number.isFinite(n))
            ? '$' + Math.round(n).toLocaleString()
            : '…';
    },

    // Format profit
    fmtProfit(n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '…';
        const sign = n >= 0 ? '+$' : '-$';
        return sign + Math.abs(Math.round(n)).toLocaleString();
    },

    // Profit CSS class
    profitClass(profit) {
        if (typeof profit !== 'number' || !Number.isFinite(profit)) return 'profit-unknown';
        if (profit > 0) return 'profit-positive';
        if (profit < 0) return 'profit-negative';
        return 'profit-zero';
    },

    // Render table
    async renderTable(win, forceYata = false) {
        console.log('💰 renderTable called, forceYata:', forceYata);
        const tbody = win.querySelector('.travel-tbody');
        const countrySel = win.querySelector('.travel-country');
        const meta = win.querySelector('.travel-meta');

        tbody.innerHTML = '<tr><td colspan="5" class="travel-loading">Loading YATA data…</td></tr>';
        meta.textContent = 'Fetching...';

        try {
            console.log('💰 Fetching YATA data...');
            const yata = await this.fetchYATA(forceYata);
            console.log('💰 YATA data received, row count:', Object.keys(yata || {}).length);
            let rows = this.normalizeYATA(yata);
            console.log('💰 Normalized rows:', rows.length);

            // Decorate with cached avg/profit
            console.log('💰 Decorating rows with cached data...');
            const mult = this.settings.multiplier || 1;
            rows = rows.map(r => {
                const avg = this.getCachedAvg(r.id);
                const baseProfit = (typeof avg === 'number') ? (avg - r.cost) : null;
                const profit = (typeof baseProfit === 'number') ? (baseProfit * mult) : null;
                return { ...r, avg, cost: r.cost * mult, profit };
            });
            console.log('💰 Rows decorated, sample:', rows[0]);

            // Populate country dropdown
            console.log('💰 Populating country dropdown...');
            const countries = [...new Set(rows.map(r => r.country))].sort();
            if (countrySel.options.length === 1) {
                for (const c of countries) {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = c;
                    countrySel.appendChild(opt);
                }
                countrySel.value = this.settings.country;
            }
            console.log('💰 Country dropdown populated, found', countries.length, 'countries');

            // Filter
            console.log('💰 Filtering rows...');
            let filtered = rows;
            if (this.settings.country !== 'ALL') {
                filtered = filtered.filter(x => x.country === this.settings.country);
            }
            if (this.settings.showOnlyProfit) {
                filtered = filtered.filter(x => x.profit === null || x.profit > 0);
            }
            console.log('💰 Filtered down to', filtered.length, 'rows');

            // Limit & sort
            console.log('💰 Sorting rows by', this.settings.sortBy, this.settings.sortDir);
            filtered = filtered.slice(0, this.settings.limit);
            filtered = this.sortRows(filtered, this.settings.sortBy, this.settings.sortDir);
            console.log('💰 Sorted, final count:', filtered.length);

            tbody.innerHTML = '';

            if (!filtered.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="travel-loading">No items match filters</td></tr>';
                meta.textContent = 'Rows: 0';
                console.log('💰 No items to display after filtering');
                return;
            }

            console.log('💰 Rendering', filtered.length, 'table rows...');
            for (const r of filtered) {
                const tr = document.createElement('tr');
                tr.dataset.itemId = String(r.id);
                tr.style.color = '#ffffff';
                tr.innerHTML = `
                    <td style="color: #ffffff;">${this.esc(r.country)}</td>
                    <td style="color: #ffffff;">
                        <a href="https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=${r.id}" target="_blank" style="color: #90caf9; text-decoration: none; display: block;">
                            ${this.esc(r.name)}
                        </a>
                    </td>
                    <td class="num" style="color: #ffffff;">${this.fmtMoney(r.cost)}</td>
                    <td class="num" data-profit="${r.profit || ''}" style="color: #ffffff;">${this.fmtProfit(r.profit)}</td>
                    <td class="num" style="color: #ffffff; padding-right: 5px;">${typeof r.qty === 'number' ? r.qty : ''}</td>
                `;
                tbody.appendChild(tr);
            }
            console.log('💰 Rows rendered successfully');

            // Update sort indicators
            const allHeaders = win.querySelectorAll('th[data-sort]');
            allHeaders.forEach(th => {
                const indicator = th.querySelector('.sort-ind');
                if (th.dataset.sort === this.settings.sortBy) {
                    indicator.textContent = this.settings.sortDir === 'desc' ? ' ↓' : ' ↑';
                } else {
                    indicator.textContent = '';
                }
            });

            // Update meta badge
            const lastUpdate = this.state.lastUpdated ? new Date(this.state.lastUpdated).toLocaleTimeString() : 'Never';
            meta.textContent = `${filtered.length} rows • Last Updated: ${lastUpdate}`;
            meta.title = `Rows: Number of items shown\nQueue: ${this.state.queue.length} API requests waiting\nIn-flight: ${this.state.inFlight} API requests processing`;
            console.log('💰 Meta updated:', meta.textContent);

            // ALWAYS fetch profit data (user expects to see profit)
            console.log('💰 Fetching profit data for all items...');
            await this.fetchAverages(win, filtered);
            console.log('💰 renderTable completed successfully');

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" class="travel-loading">Error: ${err.message}</td></tr>`;
            meta.textContent = 'Error loading data';
            console.error('💰 Render error:', err);
        }
    },

    // Fetch averages for visible items
    async fetchAverages(win, rows) {
        console.log('💰 fetchAverages called with', rows.length, 'rows');
        const toFetch = rows
            .slice(0, this.MAX_VISIBLE_FETCH)
            .filter(r => typeof this.getCachedAvg(r.id) !== 'number')
            .map(r => r.id);

        console.log('💰 Items to fetch averages for:', toFetch.length);
        if (!toFetch.length) {
            console.log('💰 No items to fetch (all cached)');
            return;
        }

        const meta = win.querySelector('.travel-meta');
        let completed = 0;

        for (const itemId of toFetch) {
            this.enqueue(async () => {
                const avg = await this.fetchAvgPrice(itemId);
                return { itemId, avg };
            })
                .then(({ itemId, avg }) => {
                    completed++;

                    const rowEl = win.querySelector(`tr[data-item-id="${itemId}"]`);
                    if (!rowEl) {
                        console.warn(`💰 Row not found for item ${itemId}`);
                        return;
                    }

                    console.log(`💰 Updating row for item ${itemId}, avg=${avg}`);
                    const tds = rowEl.querySelectorAll('td');
                    console.log(`💰 Row has ${tds.length} cells:`, Array.from(tds).map((td, i) => `[${i}]=${td.textContent.substring(0, 20)}`));

                    const mult = this.settings.multiplier || 1;
                    const cost = Number((tds[2]?.textContent || '').replace(/[^0-9]/g, '')) || 0;
                    const profit = (avg * mult) - cost;

                    if (this.settings.showOnlyProfit && profit <= 0) {
                        rowEl.style.display = 'none';
                    }
                    console.log(`💰 Item ${itemId}: cost=${cost}, avg=${avg}, profit=${profit}`);

                    // Update profit cell (index 3: Country, Name, Cost, PROFIT, Qty)
                    if (tds[3]) {
                        console.log(`💰 BEFORE update - cell[3] content: "${tds[3].textContent}"`);
                        tds[3].textContent = this.fmtProfit(profit);
                        tds[3].className = 'num ' + this.profitClass(profit);
                        tds[3].dataset.profit = String(profit);
                        console.log(`💰 AFTER update - cell[3] content: "${tds[3].textContent}", class: ${tds[3].className}`);
                    } else {
                        console.error(`💰 ERROR: Cell[3] not found! Row has ${tds.length} cells`);
                    }

                    meta.textContent = `Loading avg prices… ${completed}/${toFetch.length} • Queue: ${this.state.queue.length}`;
                })
                .catch(err => {
                    completed++;
                    meta.textContent = `Loading avg prices… ${completed}/${toFetch.length} (some errors)`;
                    console.error(`💰 Error fetching avg for item ${itemId}:`, err);
                });
        }
    },

    // HTML escape
    esc(s) {
        return String(s)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
};

// Register module
if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.TravelStocks = TravelStocksModule;

console.log('💰 Travel Stocks module registered');

// Auto-initialize when Core is ready
(async function () {
    console.log('💰 Waiting for Sidekick Core...');

    const waitForCore = () => {
        return new Promise((resolve) => {
            const check = () => {
                if (window.SidekickModules?.Core?.ChromeStorage) {
                    console.log('💰 Core ready, initializing Travel Stocks...');
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    };

    await waitForCore();
    await TravelStocksModule.init();
    console.log('💰 Travel Stocks fully initialized');
})();
