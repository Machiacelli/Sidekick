/**
 * Sidekick Chrome Extension - Stock Advisor Module
 * Analyzes Torn stock investments and calculates ROI based on stock perks
 * Version: 1.0.0
 * Author: Machiacelli
 */

(function () {
    'use strict';

    console.log("📈 Loading Sidekick Stock Advisor Module...");

    // Wait for Core module to be available
    function waitForCore() {
        return new Promise((resolve) => {
            const checkCore = () => {
                if (window.SidekickModules?.Core?.ChromeStorage) {
                    console.log("📈 Core module ready for Stock Advisor");
                    resolve();
                } else {
                    setTimeout(checkCore, 100);
                }
            };
            checkCore();
        });
    }

    // Stock Benefit Data - All 35 Torn stocks (alphabetically by acronym, from user's list)
    const STOCK_BENEFITS = {
        "ASS": { stockId: 32, name: "Alcoholics Synonymous", sharesRequired: 1000000, type: "Active", frequencyDays: 7, benefit: "1x Six Pack of Alcohol", benefitKind: "item" },
        "BAG": { stockId: 27, name: "Big Al's Gun Shop", sharesRequired: 3000000, type: "Active", frequencyDays: 7, benefit: "1x Ammunition Pack (Special Ammo)", benefitKind: "item" },
        "CBD": { stockId: 33, name: "Herbal Releaf Co.", sharesRequired: 350000, type: "Active", frequencyDays: 7, benefit: "50 Nerve", benefitKind: "nerve" },
        "CNC": { stockId: 10, name: "Crude & Co", sharesRequired: 7500000, type: "Active", frequencyDays: 31, benefit: "$80,000,000", benefitKind: "cash" },
        "ELT": { stockId: 21, name: "Empty Lunchbox Traders", sharesRequired: 5000000, type: "Passive", frequencyDays: null, benefit: "10% Home Upgrade Discount (Property)", benefitKind: "percent" },
        "EVL": { stockId: 28, name: "Evil Ducks Candy Corp", sharesRequired: 100000, type: "Active", frequencyDays: 7, benefit: "1000 Happy", benefitKind: "happy" },
        "EWM": { stockId: 19, name: "Eaglewood Mercenary", sharesRequired: 1000000, type: "Active", frequencyDays: 7, benefit: "1x Box of Grenades", benefitKind: "item" },
        "FHG": { stockId: 15, name: "Feathery Hotels Group", sharesRequired: 2000000, type: "Active", frequencyDays: 7, benefit: "1x Feathery Hotel Coupon", benefitKind: "item" },
        "GRN": { stockId: 6, name: "Grain", sharesRequired: 500000, type: "Active", frequencyDays: 31, benefit: "$4,000,000", benefitKind: "cash" },
        "HRG": { stockId: 22, name: "Home Retail Group", sharesRequired: 10000000, type: "Active", frequencyDays: 31, benefit: "1x Random Property", benefitKind: "property" },
        "IIL": { stockId: 14, name: "I Industries Ltd.", sharesRequired: 1000000, type: "Passive", frequencyDays: null, benefit: "50% Virus Coding Time Reduction", benefitKind: "percent" },
        "IOU": { stockId: 5, name: "Insured On Us", sharesRequired: 3000000, type: "Active", frequencyDays: 31, benefit: "$12,000,000", benefitKind: "cash" },
        "IST": { stockId: 26, name: "International School TC", sharesRequired: 100000, type: "Passive", frequencyDays: null, benefit: "Free Education Courses", benefitKind: "access" },
        "LAG": { stockId: 4, name: "Legal Authorities Group", sharesRequired: 750000, type: "Active", frequencyDays: 7, benefit: "1x Lawyer Business Card", benefitKind: "item" },
        "LOS": { stockId: 34, name: "Lo Squalo Waste Management", sharesRequired: 7500000, type: "Passive", frequencyDays: null, benefit: "25% Boost to mission credits and money earned", benefitKind: "percent" },
        "LSC": { stockId: 17, name: "Lucky Shots Casino", sharesRequired: 500000, type: "Active", frequencyDays: 7, benefit: "1x Lottery Voucher", benefitKind: "item" },
        "MCS": { stockId: 29, name: "Mc Smoogle Corp", sharesRequired: 350000, type: "Active", frequencyDays: 7, benefit: "100 Energy", benefitKind: "energy" },
        "MSG": { stockId: 11, name: "Messaging Inc.", sharesRequired: 300000, type: "Passive", frequencyDays: null, benefit: "Free Classified Advertising (Newspaper)", benefitKind: "access" },
        "MUN": { stockId: 24, name: "Munster Beverage Corp.", sharesRequired: 5000000, type: "Active", frequencyDays: 7, benefit: "1x Six Pack of Energy Drink", benefitKind: "item" },
        "PRN": { stockId: 18, name: "Performance Ribaldry Network", sharesRequired: 1000000, type: "Active", frequencyDays: 7, benefit: "1x Erotic DVD", benefitKind: "item" },
        "PTS": { stockId: 35, name: "PointLess", sharesRequired: 10000000, type: "Active", frequencyDays: 7, benefit: "100 Points", benefitKind: "points" },
        "SYM": { stockId: 16, name: "Symbiotic Ltd.", sharesRequired: 500000, type: "Active", frequencyDays: 7, benefit: "1x Drug Pack", benefitKind: "item" },
        "SYS": { stockId: 3, name: "Syscore MFG", sharesRequired: 3000000, type: "Passive", frequencyDays: null, benefit: "Advanced Firewall", benefitKind: "access" },
        "TCC": { stockId: 31, name: "Torn City Clothing", sharesRequired: 7500000, type: "Active", frequencyDays: 31, benefit: "1x Clothing Cache", benefitKind: "item" },
        "TCI": { stockId: 2, name: "Torn City Investments", sharesRequired: 1500000, type: "Passive", frequencyDays: null, benefit: "10% Bank Interest Bonus", benefitKind: "percent" },
        "TCM": { stockId: 20, name: "Torn City Motors", sharesRequired: 1000000, type: "Passive", frequencyDays: null, benefit: "10% Racing Skill Boost", benefitKind: "percent" },
        "TCP": { stockId: 13, name: "TC Media Productions", sharesRequired: 1000000, type: "Passive", frequencyDays: null, benefit: "Company Sales Boost", benefitKind: "percent" },
        "TCT": { stockId: 9, name: "The Torn City Times", sharesRequired: 100000, type: "Active", frequencyDays: 31, benefit: "$1,000,000", benefitKind: "cash" },
        "TGP": { stockId: 23, name: "Tell Group Plc.", sharesRequired: 2500000, type: "Passive", frequencyDays: null, benefit: "Company Advertising Boost", benefitKind: "percent" },
        "THS": { stockId: 7, name: "Torn City Health Service", sharesRequired: 150000, type: "Active", frequencyDays: 7, benefit: "1x Box of Medical Supplies", benefitKind: "item" },
        "TMI": { stockId: 12, name: "TC Music Industries", sharesRequired: 6000000, type: "Active", frequencyDays: 31, benefit: "$25,000,000", benefitKind: "cash" },
        "TSB": { stockId: 1, name: "Torn & Shanghai Banking", sharesRequired: 3000000, type: "Active", frequencyDays: 31, benefit: "$50,000,000", benefitKind: "cash" },
        "WLT": { stockId: 30, name: "Wind Lines Travel", sharesRequired: 9000000, type: "Passive", frequencyDays: null, benefit: "Private Jet Access (Travel)", benefitKind: "access" },
        "WSU": { stockId: 25, name: "West Side University", sharesRequired: 1000000, type: "Passive", frequencyDays: null, benefit: "10% Education Course Time Reduction", benefitKind: "percent" },
        "YAZ": { stockId: 8, name: "Yazoo", sharesRequired: 1000000, type: "Passive", frequencyDays: null, benefit: "Free Banner Advertising (Newspaper)", benefitKind: "access" }
    };

    // Stocks to exclude from ROI ranking (utility/access perks with no passive income)
    const EXCLUDED_STOCKS = new Set([
        'SYS', // Advanced Firewall - one-time utility
        'YAZ', // Free Banner Ads - no income
        'MSG', // Free Classifieds - no income
        'IST', // Free Education - no income
        'WLT', // Private Jet - no income
        'IIL', // Virus Coding Time - utility
        'ELT', // Property Discount - saves money, not income
        'MCS', // Energy - too variable per player
        'CBD', // Nerve - too variable per player
        'EVL', // Happy - too variable per player
        'BAG'  // Special Ammo - cannot be sold, no market value
    ]);

    // Item IDs for market price fetching
    const ITEM_IDS = {
        BOX_OF_GRENADES: 364,
        MEDICAL_SUPPLIES: 365,
        EROTIC_DVD: 366,
        HOTEL_COUPON: 367,
        LAWYER_CARD: 368,
        LOTTERY_VOUCHER: 369,
        DRUG_PACK: 370,
        CLOTHING_CACHE: 1057, // Using Gentleman Cache as default
        SIX_PACK_ALCOHOL: 817,
        SIX_PACK_ENERGY: 818
    };

    // Default user settings for benefit conversion
    const DEFAULT_SETTINGS = {
        // Stat conversions (USD value)
        energyValue: 1000,
        nerveValue: 2500,
        happyValue: 1500,
        pointsValue: 50000,

        // Item conversions (USD value)
        grenadeBoxValue: 5000000,
        drugPackValue: 3000000,
        clothingCacheValue: 2000000,
        hotelCouponValue: 500000,
        medicalSupplyBoxValue: 1000000,
        ammunitionBoxValue: 500000,
        sixPackAlcoholValue: 150000,
        sixPackEnergyDrinkValue: 200000,
        lotteryVoucherValue: 1000000,

        // Percent-based perk baselines
        bankBaselineValue: 1000000000, // $1B in bank for 10% interest
        casinoBaselineDaily: 5000000, // Daily casino earnings
        missionBaselineDaily: 500000, // Daily mission credits
        advertisingValuePerDay: 100000,
        educationValuePerHour: 50000,
        educationHoursPerMonth: 100,
        racingBaselineValue: 1000000, // Value of 2.5% skill increase
        stockProfitBaselineDaily: 1000000,

        // Special items
        privateJetValuePerDay: 500000,
        advancedFirewallValue: 10000000, // One-time value
        randomPropertyValue: 50000000 // Expected value
    };

    // Stock Advisor Module Implementation
    const StockAdvisorModule = {
        isInitialized: false,
        isWindowOpen: false,
        settings: { ...DEFAULT_SETTINGS },
        cachedStockData: null,
        cachedPortfolio: null,
        cachedItemPrices: null,
        cachedPointsPrice: null,
        cachedBankBalance: null,
        lastCacheTime: 0,
        refreshInterval: null,
        currentSort: 'daily',        // Default sort by daily income
        currentFilter: 'all',        // Default show all stocks
        showUtilityStocks: false,    // Default hide utility stocks

        // Initialize module
        async init() {
            console.log("📈 Initializing Stock Advisor Module...");

            await this.loadSettings();

            // Check if window was open before page refresh
            const savedState = await this.loadWindowState();
            if (savedState?.isOpen) {
                console.log("📈 Restoring Stock Advisor window from previous session");
                // Wait for sidebar to be ready
                setTimeout(() => {
                    const contentArea = document.getElementById('sidekick-content');
                    if (contentArea) {
                        this.showStockAdvisor();
                    } else {
                        console.log("📈 Sidebar not ready yet, will restore when sidebar opens");
                    }
                }, 500);
            }

            this.isInitialized = true;
            console.log("✅ Stock Advisor Module initialized successfully");
        },

        // Load user settings
        async loadSettings() {
            try {
                const saved = await window.SidekickModules.Core.ChromeStorage.get('sidekick_stockadvisor_settings');
                if (saved) {
                    this.settings = { ...DEFAULT_SETTINGS, ...saved };
                    console.log("📈 Loaded Stock Advisor settings");
                }
            } catch (error) {
                console.error("Failed to load Stock Advisor settings:", error);
                this.settings = { ...DEFAULT_SETTINGS };
            }
        },

        // Save user settings
        async saveSettings() {
            try {
                await window.SidekickModules.Core.ChromeStorage.set('sidekick_stockadvisor_settings', this.settings);
                console.log("📈 Saved Stock Advisor settings");
            } catch (error) {
                console.error("Failed to save Stock Advisor settings:", error);
            }
        },

        // Show Stock Advisor window
        async showStockAdvisor() {
            console.log('📈 Creating Stock Advisor window...');

            const contentArea = document.getElementById('sidekick-content');
            if (!contentArea) {
                console.error('📈 Sidebar content area not found');
                return;
            }

            // Toggle: close if already open
            const existingWindow = contentArea.querySelector('.movable-stockadvisor');
            if (existingWindow) {
                existingWindow.remove();
                this.isWindowOpen = false;
                if (this.refreshInterval) {
                    clearInterval(this.refreshInterval);
                    this.refreshInterval = null;
                }
                return;
            }

            const contentWidth = contentArea.clientWidth || 480;
            const contentHeight = contentArea.clientHeight || 500;

            // Load saved window state
            const savedState = await this.loadWindowState();
            const width = savedState?.width || Math.min(450, contentWidth - 30);
            const height = savedState?.height || Math.min(500, contentHeight - 30);
            const x = savedState?.x || 10;
            const y = savedState?.y || 10;

            console.log("📈 Using window state:", { x, y, width, height });

            const windowElement = document.createElement('div');
            windowElement.className = 'movable-stockadvisor';
            windowElement.style.cssText = `
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
                min-height: 300px;
                z-index: 1000;
                resize: both;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            `;

            windowElement.innerHTML = `
                <div class="stock-header" style="
                    background: linear-gradient(135deg, ${savedState?.color || '#2196F3'}, ${this.darkenColor(savedState?.color || '#2196F3', 15)});
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
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>📈 Stock Advisor</span>
                    </div>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <button class="stock-menu-btn" style="
                            background: none;
                            border: none;
                            color: #fff;
                            width: 20px;
                            height: 20px;
                            border-radius: 3px;
                            cursor: pointer;
                            font-size: 12px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            transition: background 0.2s;
                        " title="Menu">⚙️</button>
                        <button class="stock-close-btn" style="
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
                        ">×</button>
                    </div>
                </div>
                
                <div class="stock-content" style="
                    flex: 1;
                    overflow-y: auto;
                    background: #1f1f1f;
                    color: #fff;
                    display: flex;
                    flex-direction: column;
                    scrollbar-width: none; /* Firefox */
                    -ms-overflow-style: none; /* IE/Edge */
                ">
                    <style>
                        .stock-content::-webkit-scrollbar {
                            display: none; /* Chrome/Safari */
                        }
                    </style>
                    <div class="stock-loading" style="
                        padding: 40px;
                        text-align: center;
                        color: #888;
                        font-size: 14px;
                    ">
                        <div style="font-size: 32px; margin-bottom: 10px;">📊</div>
                        <div>Loading stock data...</div>
                    </div>
                </div>
            `;

            contentArea.appendChild(windowElement);

            // Register window for click-to-front behavior
            if (window.SidekickModules?.Core?.WindowManager) {
                window.SidekickModules.Core.WindowManager.registerWindow(windowElement, 'Stock Advisor');
            }

            this.isWindowOpen = true;

            // Set up event handlers
            this.setupWindowHandlers(windowElement);

            // Start loading data
            await this.refreshData();

            console.log('📈 Stock Advisor window created');
        },

        // Setup window event handlers
        setupWindowHandlers(windowElement) {
            const header = windowElement.querySelector('.stock-header');
            const closeBtn = windowElement.querySelector('.stock-close-btn');
            const menuBtn = windowElement.querySelector('.stock-menu-btn');
            const sortSelect = windowElement.querySelector('.stock-sort-select');
            const filterSelect = windowElement.querySelector('.stock-filter-select');

            // Close button
            closeBtn?.addEventListener('click', async () => {
                // Save state with isOpen=false
                await window.SidekickModules.Core.ChromeStorage.set('sidekick_stockadvisor_window', {
                    isOpen: false,
                    x: parseInt(windowElement.style.left) || 10,
                    y: parseInt(windowElement.style.top) || 10,
                    width: windowElement.offsetWidth,
                    height: windowElement.offsetHeight
                });
                console.log("📈 Window closed, state saved as closed");

                windowElement.remove();
                this.isWindowOpen = false;
                if (this.refreshInterval) {
                    clearInterval(this.refreshInterval);
                    this.refreshInterval = null;
                }
            });

            // Menu button (cogwheel)
            menuBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log("📈 Menu button clicked");
                this.showMenuDropdown(menuBtn);
            });

            // Sort dropdown
            sortSelect?.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                console.log("📈 Sort changed to:", this.currentSort);
                this.refreshStockDisplay();
            });

            // Filter dropdown
            filterSelect?.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                console.log("📈 Filter changed to:", this.currentFilter);
                this.refreshStockDisplay();
            });

            // Utility toggle
            const utilityToggle = windowElement.querySelector('.stock-utility-toggle');
            utilityToggle?.addEventListener('change', (e) => {
                this.showUtilityStocks = e.target.checked;
                console.log("📈 Show utility stocks:", this.showUtilityStocks);
                this.refreshStockDisplay();
            });

            // Make draggable
            this.makeWindowDraggable(windowElement, header);

            // Add resize observer
            this.addResizeObserver(windowElement);
        },

        // Show menu dropdown
        showMenuDropdown(menuBtn) {
            const windowElement = menuBtn.closest('.movable-stockadvisor');
            const existingDropdown = windowElement.querySelector('.stock-dropdown');
            if (existingDropdown) {
                existingDropdown.remove();
                return;
            }

            const dropdown = document.createElement('div');
            dropdown.className = 'stock-dropdown';
            const btnRect = menuBtn.getBoundingClientRect();
            dropdown.style.cssText = `
                position: fixed;
                top: ${btnRect.bottom + 5}px;
                left: ${btnRect.right - 120}px;
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
                    <span>🔄</span> Refresh Data
                </button>
            `;

            document.body.appendChild(dropdown);

            const options = dropdown.querySelectorAll('.dropdown-option');
            options.forEach(option => {
                option.addEventListener('mouseenter', () => {
                    option.style.background = 'rgba(33, 150, 243, 0.2)';
                });
                option.addEventListener('mouseleave', () => {
                    option.style.background = 'none';
                });
                option.addEventListener('click', async () => {
                    const action = option.dataset.action;
                    dropdown.remove();

                    if (action === 'color') {
                        if (window.SidekickModules?.Core?.ColorPicker) {
                            const savedState = await this.loadWindowState();
                            window.SidekickModules.Core.ColorPicker.show(savedState?.color || '#2196F3', async (selectedColor) => {
                                const header = windowElement.querySelector('.stock-header');
                                if (header) {
                                    header.style.background = `linear-gradient(135deg, ${selectedColor}, ${this.darkenColor(selectedColor, 15)})`;
                                }
                                // Save color
                                await this.saveWindowState(windowElement, selectedColor);
                            });
                        }
                    } else if (action === 'refresh') {
                        console.log('📊 Manually refreshing stock data...');
                        await this.refreshData();
                        if (window.SidekickModules?.Core?.NotificationSystem) {
                            window.SidekickModules.Core.NotificationSystem.show(
                                'Stock Data Refreshed',
                                'Stock advisor data updated successfully',
                                'success',
                                2000
                            );
                        }
                    }
                });
            });

            setTimeout(() => {
                const closeDropdown = (e) => {
                    if (!dropdown.contains(e.target) && e.target !== menuBtn) {
                        dropdown.remove();
                        document.removeEventListener('click', closeDropdown);
                    }
                };
                document.addEventListener('click', closeDropdown);
            }, 0);
        },

        // Make window draggable
        makeWindowDraggable(windowElement, header) {
            let isDragging = false;
            let currentX = 0;
            let currentY = 0;
            let initialX = 0;
            let initialY = 0;

            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return;

                isDragging = true;
                const currentLeft = parseInt(windowElement.style.left) || 0;
                const currentTop = parseInt(windowElement.style.top) || 0;
                initialX = e.clientX - currentLeft;
                initialY = e.clientY - currentTop;
                windowElement.style.zIndex = '1100';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;

                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;

                const contentArea = document.getElementById('sidekick-content');
                if (contentArea) {
                    const bounds = contentArea.getBoundingClientRect();
                    const elementBounds = windowElement.getBoundingClientRect();

                    currentX = Math.max(0, Math.min(currentX, contentArea.offsetWidth - elementBounds.width));
                    currentY = Math.max(0, Math.min(currentY, contentArea.offsetHeight - elementBounds.height));
                }

                windowElement.style.left = currentX + 'px';
                windowElement.style.top = currentY + 'px';
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    windowElement.style.zIndex = '1000';
                    this.saveWindowState(windowElement);
                }
            });
        },

        // Add resize observer
        addResizeObserver(windowElement) {
            let resizeTimeout;
            let isInitializing = true;

            // Skip saves during initial layout
            setTimeout(() => {
                isInitializing = false;
            }, 1000);

            const resizeObserver = new ResizeObserver(() => {
                if (isInitializing) {
                    console.log('📈 Skipping save during initialization');
                    return;
                }

                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    this.saveWindowState(windowElement);
                    console.log('📈 Window resized, state saved');
                }, 500);
            });

            resizeObserver.observe(windowElement);

            // Clean up on removal
            windowElement._resizeObserver = resizeObserver;
        },

        // Load window state
        async loadWindowState() {
            try {
                const state = await window.SidekickModules.Core.ChromeStorage.get('sidekick_stockadvisor_window');
                console.log("📈 Loaded window state:", state);
                return state || null;
            } catch (error) {
                console.error("Failed to load window state:", error);
                return null;
            }
        },

        // Save window state
        async saveWindowState(windowElement) {
            try {
                // Only save if window still exists in DOM (not being closed)
                const isOpen = windowElement && document.body.contains(windowElement);

                const state = {
                    isOpen: isOpen,
                    x: parseInt(windowElement.style.left) || 10,
                    y: parseInt(windowElement.style.top) || 10,
                    width: windowElement.offsetWidth,
                    height: windowElement.offsetHeight
                };
                await window.SidekickModules.Core.ChromeStorage.set('sidekick_stockadvisor_window', state);
                console.log("📈 Window state saved (shared across tabs):", state);
            } catch (error) {
                console.error("Failed to save window state:", error);
            }
        },

        // Utility to darken a color
        darkenColor(color, percent) {
            if (!color) return '#1976D2';
            const num = parseInt(color.replace("#", ""), 16);
            const amt = Math.round(2.55 * percent);
            const R = (num >> 16) - amt;
            const G = (num >> 8 & 0x00FF) - amt;
            const B = (num & 0x0000FF) - amt;
            return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
                (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
                (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
        },

        // Fetch global stock data from Torn API
        async fetchStockData(forceRefresh = false) {
            // Check cache
            const now = Date.now();
            const cacheAge = now - this.lastCacheTime;
            const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

            if (!forceRefresh && this.cachedStockData && cacheAge < CACHE_TTL) {
                console.log("📈 Using cached stock data");
                return this.cachedStockData;
            }

            console.log("📈 Fetching stock data from API...");

            try {
                const apiKey = await window.SidekickModules.Settings.getApiKey();
                if (!apiKey) {
                    throw new Error("API key not configured");
                }

                const response = await fetch(`https://api.torn.com/torn/?selections=stocks&key=${apiKey}`);
                const data = await response.json();

                if (data.error) {
                    throw new Error(data.error.error);
                }

                console.log("✅ Stock data fetched successfully");
                console.log("📈 DEBUG - Stock API data structure:", {
                    stocksKey: data.stocks ? 'EXISTS' : 'MISSING',
                    firstStockId: data.stocks ? Object.keys(data.stocks)[0] : 'N/A',
                    sampleStock: data.stocks ? data.stocks[1] : 'N/A'
                });
                this.cachedStockData = data.stocks;
                this.lastCacheTime = now;
                return this.cachedStockData;
            } catch (error) {
                console.error("❌ Failed to fetch stock data:", error);
                throw error;
            }
        },

        // Fetch user portfolio from Torn API
        async fetchPortfolio(forceRefresh = false) {
            const now = Date.now();
            const cacheAge = now - this.lastCacheTime;
            const CACHE_TTL = 5 * 60 * 1000;

            if (!forceRefresh && this.cachedPortfolio && cacheAge < CACHE_TTL) {
                console.log("📈 Using cached portfolio");
                return this.cachedPortfolio;
            }

            console.log("📈 Fetching portfolio from API...");

            try {
                const apiKey = await window.SidekickModules.Settings.getApiKey();
                if (!apiKey) {
                    throw new Error("API key not configured");
                }

                const response = await fetch(`https://api.torn.com/user/?selections=stocks&key=${apiKey}`);
                const data = await response.json();

                if (data.error) {
                    throw new Error(data.error.error);
                }

                console.log("✅ Portfolio fetched successfully");
                console.log("📈 DEBUG - Portfolio data structure:", {
                    keys: Object.keys(data),
                    stocksKeys: data.stocks ? Object.keys(data.stocks) : 'NO STOCKS KEY',
                    firstFewStocks: data.stocks ? Object.keys(data.stocks).slice(0, 5) : [],
                    sampleStock: data.stocks ? data.stocks[Object.keys(data.stocks)[0]] : 'N/A'
                });
                this.cachedPortfolio = data.stocks;
                return this.cachedPortfolio;
            } catch (error) {
                console.error("❌ Failed to fetch portfolio:", error);
                throw error;
            }
        },

        // Fetch item market prices from Torn API
        async fetchItemMarketPrices(forceRefresh = false) {
            const now = Date.now();
            const cacheAge = now - this.lastCacheTime;
            const CACHE_TTL = 5 * 60 * 1000;

            if (!forceRefresh && this.cachedItemPrices && cacheAge < CACHE_TTL) {
                console.log("📈 Using cached item prices");
                return this.cachedItemPrices;
            }

            console.log("📈 Fetching item prices from market API...");

            try {
                const apiKey = await window.SidekickModules.Settings.getApiKey();
                if (!apiKey) {
                    throw new Error("API key not configured");
                }

                // Fetch item data from torn API which includes market prices
                const itemIds = Object.values(ITEM_IDS).join(',');
                const response = await fetch(`https://api.torn.com/torn/${itemIds}?selections=items&key=${apiKey}`);
                const data = await response.json();

                if (data.error) {
                    throw new Error(data.error.error);
                }

                // Extract market prices from items data
                const prices = {};
                for (const [key, itemId] of Object.entries(ITEM_IDS)) {
                    const itemData = data.items?.[itemId];
                    if (itemData && itemData.market_value) {
                        // Use market_value from items endpoint
                        prices[key] = itemData.market_value;
                    } else {
                        prices[key] = 0; // No market data available
                    }
                }

                console.log("✅ Item prices fetched successfully:", prices);
                this.cachedItemPrices = prices;
                return this.cachedItemPrices;
            } catch (error) {
                console.error("❌ Failed to fetch item prices:", error);
                // Return null to fall back to hardcoded values
                return null;
            }
        },

        // Fetch points market price
        async fetchPointsMarketPrice(forceRefresh = false) {
            const now = Date.now();
            const cacheAge = now - this.lastCacheTime;
            const CACHE_TTL = 5 * 60 * 1000;

            if (!forceRefresh && this.cachedPointsPrice && cacheAge < CACHE_TTL) {
                console.log("📈 Using cached points price");
                return this.cachedPointsPrice;
            }

            console.log("📈 Fetching points market price...");

            try {
                const apiKey = await window.SidekickModules.Settings.getApiKey();
                if (!apiKey) {
                    throw new Error("API key not configured");
                }

                const response = await fetch(`https://api.torn.com/market/?selections=pointsmarket&key=${apiKey}`);
                const data = await response.json();

                if (data.error) {
                    throw new Error(data.error.error);
                }

                // Calculate average points price from market offers
                const offers = data.pointsmarket || [];
                if (offers.length > 0) {
                    const totalCost = offers.reduce((sum, offer) => sum + offer.total_cost, 0);
                    const totalPoints = offers.reduce((sum, offer) => sum + offer.quantity, 0);
                    const avgPrice = totalPoints > 0 ? totalCost / totalPoints : 50000;

                    console.log(`✅ Points market price: $${avgPrice.toFixed(0)}/point`);
                    this.cachedPointsPrice = avgPrice;
                    return this.cachedPointsPrice;
                } else {
                    console.log("⚠️ No points market offers, using default $50,000");
                    return 50000;
                }
            } catch (error) {
                console.error("❌ Failed to fetch points price:", error);
                return 50000; // Fall back to default
            }
        },

        // Fetch user's bank balance for interest calculations
        async fetchUserBankBalance(forceRefresh = false) {
            const now = Date.now();
            const cacheAge = now - this.lastCacheTime;
            const CACHE_TTL = 5 * 60 * 1000;

            if (!forceRefresh && this.cachedBankBalance && cacheAge < CACHE_TTL) {
                console.log("📈 Using cached bank balance");
                return this.cachedBankBalance;
            }

            console.log("📈 Fetching user bank balance...");

            try {
                const apiKey = await window.SidekickModules.Settings.getApiKey();
                if (!apiKey) {
                    throw new Error("API key not configured");
                }

                const response = await fetch(`https://api.torn.com/user/?selections=money&key=${apiKey}`);
                const data = await response.json();

                if (data.error) {
                    throw new Error(data.error.error);
                }

                const bankBalance = data.city_bank?.amount || 0;
                console.log(`✅ Bank balance: $${bankBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
                this.cachedBankBalance = bankBalance;
                return this.cachedBankBalance;
            } catch (error) {
                console.error("❌ Failed to fetch bank balance:", error);
                return 1000000000; // Fall back to $1B default
            }
        },

        // Calculate benefit value in USD
        calculateBenefitValue(acronym) {
            const benefit = STOCK_BENEFITS[acronym];
            if (!benefit) return 0;

            const benefitStr = benefit.benefit;
            let value = 0;

            // Cash benefits
            if (benefit.benefitKind === "cash") {
                const match = benefitStr.match(/\$([0-9,]+)/);
                if (match) {
                    value = parseInt(match[1].replace(/,/g, ''));
                }
            }

            // Energy
            else if (benefit.benefitKind === "energy") {
                const match = benefitStr.match(/(\d+)\s+Energy/);
                if (match) {
                    value = parseInt(match[1]) * this.settings.energyValue;
                }
            }

            // Nerve
            else if (benefit.benefitKind === "nerve") {
                const match = benefitStr.match(/(\d+)\s+Nerve/);
                if (match) {
                    value = parseInt(match[1]) * this.settings.nerveValue;
                }
            }

            // Happy
            else if (benefit.benefitKind === "happy") {
                const match = benefitStr.match(/(\d+)\s+Happy/);
                if (match) {
                    value = parseInt(match[1]) * this.settings.happyValue;
                }
            }

            // Points - use live market price
            else if (benefit.benefitKind === "points") {
                const match = benefitStr.match(/(\d+)\s+Points/);
                if (match) {
                    const pointsAmount = parseInt(match[1]);
                    // Use live points price from API, fall back to hardcoded
                    const pointsPrice = this.cachedPointsPrice || this.settings.pointsValue;
                    value = pointsAmount * pointsPrice;
                }
            }

            // Items - use live market prices
            else if (benefit.benefitKind === "item") {
                const prices = this.cachedItemPrices;

                if (benefitStr.includes("Grenade")) {
                    value = prices?.BOX_OF_GRENADES || this.settings.grenadeBoxValue;
                } else if (benefitStr.includes("Drug Pack")) {
                    value = prices?.DRUG_PACK || this.settings.drugPackValue;
                } else if (benefitStr.includes("Clothing Cache")) {
                    value = prices?.CLOTHING_CACHE || this.settings.clothingCacheValue;
                } else if (benefitStr.includes("Hotel Coupon")) {
                    value = prices?.HOTEL_COUPON || this.settings.hotelCouponValue;
                } else if (benefitStr.includes("Medical Supply")) {
                    value = prices?.MEDICAL_SUPPLIES || this.settings.medicalSupplyBoxValue;
                } else if (benefitStr.includes("Ammunition")) {
                    value = prices?.BOX_OF_GRENADES || this.settings.ammunitionBoxValue; // Note: Using grenades as proxy
                } else if (benefitStr.includes("Alcohol")) {
                    value = prices?.SIX_PACK_ALCOHOL || this.settings.sixPackAlcoholValue;
                } else if (benefitStr.includes("Energy Drink")) {
                    value = prices?.SIX_PACK_ENERGY || this.settings.sixPackEnergyDrinkValue;
                } else if (benefitStr.includes("Lottery Voucher")) {
                    value = prices?.LOTTERY_VOUCHER || this.settings.lotteryVoucherValue;
                } else if (benefitStr.includes("Erotic DVD")) {
                    value = prices?.EROTIC_DVD || 100000;
                } else if (benefitStr.includes("Lawyer")) {
                    value = prices?.LAWYER_CARD || 50000;
                }
            }

            // Percent-based passives
            else if (benefit.benefitKind === "percent") {
                if (benefitStr.includes("Bank Interest")) {
                    // Use actual bank balance from API
                    const bankBalance = this.cachedBankBalance || this.settings.bankBaselineValue;
                    value = (bankBalance * 0.10) / 365;
                } else if (benefitStr.includes("Casino")) {
                    value = this.settings.casinoBaselineDaily * 0.25;
                } else if (benefitStr.includes("Mission")) {
                    // LOS - Mission boost is too variable to calculate accurately
                    value = 0;
                } else if (benefitStr.includes("Advertising")) {
                    value = this.settings.advertisingValuePerDay * 0.10;
                } else if (benefitStr.includes("Education")) {
                    // WSU - Education time reduction is too variable to calculate accurately
                    value = 0;
                } else if (benefitStr.includes("Racing")) {
                    // TCM - Racing skill boost is too variable to calculate accurately
                    value = 0;
                } else if (benefitStr.includes("Stock Profit")) {
                    value = this.settings.stockProfitBaselineDaily * 0.10;
                }
            }

            // Special access
            else if (benefit.benefitKind === "access") {
                if (benefitStr.includes("Firewall")) {
                    value = this.settings.advancedFirewallValue;
                } else if (benefitStr.includes("Private Jet")) {
                    value = this.settings.privateJetValuePerDay;
                }
            }

            // Property
            else if (benefit.benefitKind === "property") {
                value = this.settings.randomPropertyValue;
            }

            return value;
        },

        // Calculate metrics for a stock
        calculateStockMetrics(acronym, stockData, portfolio) {
            const benefit = STOCK_BENEFITS[acronym];
            if (!benefit) return null;

            // Torn API uses stock IDs, not acronyms
            const stock = stockData[benefit.stockId];
            if (!stock) return null;

            const currentPrice = stock.current_price;
            const sharesOwned = portfolio?.[benefit.stockId]?.total_shares || 0;
            const totalValue = sharesOwned * currentPrice;

            // Debug first 3 stocks to understand data structure
            const stockIndex = Object.keys(STOCK_BENEFITS).indexOf(acronym);
            if (stockIndex < 3) {
                console.log(`📈 DEBUG Stock #${stockIndex + 1} (${acronym}, ID ${benefit.stockId}):`, {
                    stockExists: !!stock,
                    currentPrice,
                    portfolioEntry: portfolio?.[benefit.stockId],
                    sharesOwned,
                    totalValue
                });
            }

            // Get increment data from portfolio API
            const portfolioEntry = portfolio?.[benefit.stockId];
            const currentIncrements = portfolioEntry?.dividend?.increment || portfolioEntry?.benefit?.increment || 0;

            // Calculate max possible increments based on shares owned
            const maxIncrements = sharesOwned >= benefit.sharesRequired ? Math.floor(sharesOwned / benefit.sharesRequired) : 0;

            // Calculate benefit value
            const benefitValue = this.calculateBenefitValue(acronym);

            // Daily benefit per single increment
            let benefitPerIncrement = 0;
            if (benefit.type === "Active" && benefit.frequencyDays) {
                benefitPerIncrement = benefitValue / benefit.frequencyDays;
            } else {
                // Passive perks - already calculated as daily
                benefitPerIncrement = benefitValue;
            }

            // ACTUAL daily income (only what user is currently earning)
            const actualDailyIncome = benefitPerIncrement * currentIncrements;

            // POTENTIAL daily income (what they could earn with 1 increment)
            const potentialDailyIncome = benefitPerIncrement;

            // Per-share metrics (for ROI calculation)
            const benefitPerSharePerDay = benefitPerIncrement / benefit.sharesRequired;
            const annualBenefitPerShare = benefitPerSharePerDay * 365;

            // ROI
            const roi = currentPrice > 0 ? (annualBenefitPerShare / currentPrice) * 100 : 0;

            return {
                acronym,
                name: benefit.name,
                currentPrice,
                sharesOwned,
                sharesRequired: benefit.sharesRequired,
                totalValue,
                benefitDescription: benefit.benefit,
                benefitValue,
                benefitPerDay: actualDailyIncome, // ACTUAL daily income
                potentialBenefitPerDay: potentialDailyIncome, // POTENTIAL with 1 increment
                currentIncrements, // What user has (from API)
                maxIncrements, // What's possible with current shares
                benefitPerSharePerDay,
                annualBenefitPerShare,
                roi,
                type: benefit.type,
                benefitKind: benefit.benefitKind,
                priceChange: stock.change || {}
            };
        },

        // Refresh data and update UI
        async refreshData(forceRefresh = false) {
            console.log("📈 Refreshing stock data...");

            const contentEl = document.querySelector('.stock-content');
            if (!contentEl) return;

            try {
                // Show loading
                contentEl.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: #888;">
                        <div style="font-size: 32px; margin-bottom: 10px;">📊</div>
                        <div>Loading stock data...</div>
                    </div>
                `;

                // Fetch all data in parallel
                const [stockData, portfolio, itemPrices, pointsPrice, bankBalance] = await Promise.all([
                    this.fetchStockData(forceRefresh),
                    this.fetchPortfolio(forceRefresh),
                    this.fetchItemMarketPrices(forceRefresh),
                    this.fetchPointsMarketPrice(forceRefresh),
                    this.fetchUserBankBalance(forceRefresh)
                ]);

                console.log("📈 All API data fetched successfully");

                // Calculate metrics for all stocks
                const allMetrics = [];
                for (const acronym in STOCK_BENEFITS) {
                    // Skip utility/access stocks unless user wants to see them
                    const isUtility = EXCLUDED_STOCKS.has(acronym);
                    if (isUtility && !this.showUtilityStocks) {
                        continue;
                    }

                    const metrics = this.calculateStockMetrics(acronym, stockData, portfolio);
                    if (metrics) {
                        metrics.isUtility = isUtility; // Mark utility stocks
                        allMetrics.push(metrics);
                    }
                }

                console.log(`📈 Filtered to ${allMetrics.length} income-generating stocks (excluded ${EXCLUDED_STOCKS.size} utility stocks)`);

                // Apply filtering
                let filteredMetrics = allMetrics;
                if (this.currentFilter === 'owned') {
                    filteredMetrics = allMetrics.filter(m => m.sharesOwned > 0);
                } else if (this.currentFilter === 'not-owned') {
                    filteredMetrics = allMetrics.filter(m => m.sharesOwned === 0);
                }

                // Apply sorting
                const sortBy = this.currentSort || 'daily';
                if (sortBy === 'daily') {
                    filteredMetrics.sort((a, b) => b.benefitPerDay - a.benefitPerDay);
                } else if (sortBy === 'roi') {
                    filteredMetrics.sort((a, b) => b.roi - a.roi);
                } else if (sortBy === 'price') {
                    filteredMetrics.sort((a, b) => a.currentPrice - b.currentPrice);
                } else if (sortBy === 'owned') {
                    filteredMetrics.sort((a, b) => b.sharesOwned - a.sharesOwned);
                }

                console.log(`📈 Displaying ${filteredMetrics.length} stocks (filter: ${this.currentFilter || 'all'}, sort: ${sortBy})`);

                // Render UI
                this.renderStockUI(filteredMetrics, portfolio);

            } catch (error) {
                console.error("Failed to refresh stock data:", error);
                contentEl.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #f44336;">
                <div style="font-size: 32px; margin-bottom: 10px;">⚠️</div>
                <div>Failed to load stock data</div>
                <div style="font-size: 12px; color: #888; margin-top: 10px;">${error.message}</div>
            </div>
        `;
            }
        },

        // Refresh display with current data (re-applies sort/filter)
        async refreshStockDisplay() {
            // Re-run refresh with cached data
            await this.refreshData(false);
        },
        // Render stock UI
        renderStockUI(metrics, portfolio) {
            const contentEl = document.querySelector('.stock-content');
            if (!contentEl) return;

            // Handle empty metrics
            if (!metrics || metrics.length === 0) {
                contentEl.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: #888;">
                        <div style="font-size: 32px; margin-bottom: 10px;">📊</div>
                        <div>No stock data available</div>
                    </div>
                `;
                return;
            }

            // Calculate portfolio summary
            const totalValue = metrics.reduce((sum, m) => sum + m.totalValue, 0);
            const totalDailyBenefit = metrics
                .filter(m => m.sharesOwned >= m.sharesRequired)
                .reduce((sum, m) => sum + m.benefitPerDay, 0);

            // Find best stock to buy next (prioritize stocks not fully qualified)
            const unqualifiedStocks = metrics.filter(m => m.sharesOwned < m.sharesRequired);
            const bestToBuy = unqualifiedStocks.length > 0 ? unqualifiedStocks[0] : metrics[0];
            const isAlreadyQualified = bestToBuy.sharesOwned >= bestToBuy.sharesRequired;

            const ownedCount = metrics.filter(m => m.sharesOwned > 0).length;

            console.log("📈 Portfolio Summary:", {
                totalValue,
                totalDailyBenefit,
                ownedCount,
                bestToBuy: bestToBuy.acronym,
                isAlreadyQualified,
                unqualifiedCount: unqualifiedStocks.length
            });

            contentEl.innerHTML = `
                <div style="padding: 12px; border-bottom: 1px solid #444; background: #252525;">
                    <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; color: #2196F3;">Portfolio Summary</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
                        <div>
                            <span style="color: #888;">Total Value:</span>
                            <span style="color: #4CAF50; font-weight: bold; margin-left: 4px;">$${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div>
                            <span style="color: #888;">Daily Benefits:</span>
                            <span style="color: #2196F3; font-weight: bold; margin-left: 4px;">$${totalDailyBenefit.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div>
                            <span style="color: #888;">Stocks Owned:</span>
                            <span style="color: #fff; margin-left: 4px;">${ownedCount}/25</span>
                        </div>
                        <div>
                            <span style="color: #888;">Buy Next:</span>
                            <span style="color: #4CAF50; margin-left: 4px;">${bestToBuy.acronym} (${bestToBuy.roi.toFixed(2)}%)${isAlreadyQualified ? ' ✓' : ''}</span>
                        </div>
                    </div>
                </div>
        </div>
        
        <!-- Filter and Sort Controls -->
        <div class="stock-controls" style="
            background: #1f1f1f;
            padding: 8px 12px;
            display: flex;
            gap: 12px;
            align-items: center;
            border-bottom: 1px solid #333;
            flex-wrap: wrap;
        ">
            <div style="display: flex; gap: 4px; align-items: center;">
                <span style="font-size: 10px; color: #888;">Sort:</span>
                <select class="stock-sort-select" style="
                    background: #252525;
                    border: 1px solid #444;
                    color: #fff;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: pointer;
                ">
                    <option value="daily">Daily Income</option>
                    <option value="roi">ROI %</option>
                    <option value="price">Price</option>
                    <option value="owned">Shares Owned</option>
                </select>
            </div>
            
            <div style="display: flex; gap: 4px; align-items: center;">
                <span style="font-size: 10px; color: #888;">Filter:</span>
                <select class="stock-filter-select" style="
                    background: #252525;
                    border: 1px solid #444;
                    color: #fff;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: pointer;
                ">
                    <option value="all">All Stocks</option>
                    <option value="owned">Owned Only</option>
                    <option value="not-owned">Not Owned</option>
                </select>
            </div>
            
            <div style="display: flex; gap: 4px; align-items: center;">
                <input type="checkbox" class="stock-utility-toggle" id="stock-utility-toggle" style="cursor: pointer;">
                <label for="stock-utility-toggle" style="font-size: 10px; color: #888; cursor: pointer;">Show Utility Stocks</label>
            </div>
        </div>
        
        <div style="flex: 1; overflow-y: auto; padding: 10px; scrollbar-width: none; -ms-overflow-style: none;">
                    <style>
                        div[style*="flex: 1; overflow-y: auto; padding: 10px"]::-webkit-scrollbar {
                            display: none;
                        }
                    </style>
                    ${metrics.map(m => this.renderStockRow(m)).join('')}
                </div>
            `;

            // Set up dropdown event listeners AFTER elements are created
            this.setupDropdownListeners();
        },

        // Setup dropdown event listeners (called after rendering)
        setupDropdownListeners() {
            const sortSelect = document.querySelector('.stock-sort-select');
            const filterSelect = document.querySelector('.stock-filter-select');
            const utilityToggle = document.querySelector('.stock-utility-toggle');

            console.log("📈 Setting up dropdown listeners...", { sortSelect: !!sortSelect, filterSelect: !!filterSelect, utilityToggle: !!utilityToggle });

            // Remove old listeners by cloning and replacing (prevents duplicates)
            if (sortSelect) {
                const newSortSelect = sortSelect.cloneNode(true);
                if (sortSelect.parentNode) sortSelect.parentNode.replaceChild(newSortSelect, sortSelect);

                // Set current value
                newSortSelect.value = this.currentSort || 'daily';

                newSortSelect.addEventListener('change', (e) => {
                    this.currentSort = e.target.value;
                    console.log("📈 Sort changed to:", this.currentSort);
                    this.refreshStockDisplay();
                });
            }

            if (filterSelect) {
                const newFilterSelect = filterSelect.cloneNode(true);
                if (filterSelect.parentNode) filterSelect.parentNode.replaceChild(newFilterSelect, filterSelect);

                // Set current value
                newFilterSelect.value = this.currentFilter || 'all';

                newFilterSelect.addEventListener('change', (e) => {
                    this.currentFilter = e.target.value;
                    console.log("📈 Filter changed to:", this.currentFilter);
                    this.refreshStockDisplay();
                });
            }

            if (utilityToggle) {
                const newUtilityToggle = utilityToggle.cloneNode(true);
                if (utilityToggle.parentNode) utilityToggle.parentNode.replaceChild(newUtilityToggle, utilityToggle);

                // Set current value
                newUtilityToggle.checked = this.showUtilityStocks || false;

                newUtilityToggle.addEventListener('change', (e) => {
                    this.showUtilityStocks = e.target.checked;
                    console.log("📈 Show utility stocks:", this.showUtilityStocks);
                    this.refreshStockDisplay();
                });
            }
        },

        // Render individual stock row
        renderStockRow(metrics) {
            const {
                acronym,
                name,
                currentPrice,
                sharesOwned,
                sharesRequired,
                totalValue,
                benefitDescription,
                benefitPerDay,
                potentialBenefitPerDay,
                roi,
                currentIncrements,
                maxIncrements,
                type
            } = metrics;

            const hasEnoughShares = sharesOwned >= sharesRequired;
            const roiColor = roi >= 10 ? '#4CAF50' : roi >= 5 ? '#FF9800' : '#f44336';

            // Display actual income if owned, potential if not owned
            const displayIncome = sharesOwned > 0 ? benefitPerDay : potentialBenefitPerDay;

            return `
                <div style="
                    background: #2a2a2a;
                    border: 1px solid #444;
                    border-radius: 4px;
                    padding: 8px;
                    margin-bottom: 6px;
                    font-size: 11px;
                    ${hasEnoughShares ? 'border-left: 3px solid #4CAF50;' : ''}
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <div style="font-weight: bold; font-size: 12px;">
                            <span style="color: #2196F3;">${acronym}</span>
                            <span style="color: #888; font-size: 10px; margin-left: 4px;">${name}</span>
                            ${metrics.isUtility ? '<span style="background: #444; color: #888; padding: 2px 4px; border-radius: 3px; font-size: 9px; margin-left: 4px;">UTILITY</span>' : ''}
                        </div>
                        <div style="text-align: right; min-width: 80px;">
                            <div style="font-size: 10px; color: #888; margin-bottom: 2px;">Daily Income</div>
                            <div style="font-weight: bold; color: ${sharesOwned > 0 ? '#4CAF50' : '#666'}; font-size: 11px;">
                                ${sharesOwned > 0 ? '$' : '~$'}${displayIncome.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; color: #ccc; font-size: 10px; margin-bottom: 4px;">
                        <div>
                            <span style="color: #666;">Price:</span> $${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </div>
                        <div>
                            <span style="color: #666;">Owned:</span> ${sharesOwned.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </div>
                    </div>
                    
                    <div style="font-size: 10px; color: #888;">
                        ${type}: ${benefitDescription}
                        ${currentIncrements > 0 ? `<span style="color: #4CAF50; margin-left: 8px;">✓ ${currentIncrements}/${maxIncrements}</span>` : ''}
                    </div>
                </div>
            `;
        },

        // Show menu dropdown
        showMenuDropdown(menuBtn) {
            console.log("📈 Opening menu dropdown...");

            // Remove existing menu if any
            const existing = document.querySelector('.stock-menu-dropdown');
            if (existing) {
                console.log("📈 Dropdown already exists, removing it");
                existing.remove();
                return;
            }

            const buttonRect = menuBtn.getBoundingClientRect();
            console.log("📈 Button position:", {
                bottom: buttonRect.bottom,
                right: buttonRect.right,
                left: buttonRect.left,
                windowWidth: window.innerWidth
            });

            const menu = document.createElement('div');
            menu.className = 'stock-menu-dropdown';

            // Get Stock Advisor window for relative positioning
            const stockWindow = document.querySelector('.movable-stockadvisor');
            const header = stockWindow?.querySelector('.stock-header');

            // FIXED: Use absolute positioning within Stock Advisor window
            // This prevents the sidebar's overflow:hidden from clipping the dropdown
            menu.style.cssText = `
                position: absolute;
                top: ${header ? header.offsetHeight + 2 : 45}px;
                right: 5px;
                background: rgba(25, 25, 25, 0.98);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 6px;
                padding: 4px;
                z-index: 10001;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(10px);
                min-width: 120px;
            `;

            menu.innerHTML = `
                <button class="menu-refresh" style="
                    width: 100%;
                    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    color: rgba(255, 255, 255, 0.92);
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    text-align: left;
                    transition: all 0.2s;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                ">
                    <span>🔄</span> Refresh Data
                </button>
            `;

            // Append to Stock Advisor window instead of body to avoid sidebar clip
            if (stockWindow) {
                stockWindow.appendChild(menu);
                console.log("📈 Dropdown appended to Stock Advisor window");

                // Smart positioning: check if menu would clip outside window bounds
                setTimeout(() => {
                    const menuRect = menu.getBoundingClientRect();
                    const stockRect = stockWindow.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;

                    // Check if menu clips on the right side
                    if (menuRect.right > viewportWidth || menuRect.right > stockRect.right) {
                        // Position from left instead of right
                        const leftPos = Math.max(5, stockRect.width - menuRect.width - 5);
                        menu.style.right = 'auto';
                        menu.style.left = `${leftPos}px`;
                        console.log("📈 Repositioned menu to left:", leftPos);
                    }

                    // Check if menu clips on the left side  
                    if (menuRect.left < 0 || menuRect.left < stockRect.left) {
                        menu.style.left = '5px';
                        menu.style.right = 'auto';
                        console.log("📈 Repositioned menu to avoid left clip");
                    }
                }, 0);
            } else {
                document.body.appendChild(menu);
                console.log("📈 WARNING: Appended to body (stockWindow not found)");
            }

            // DEBUG: Verify dropdown is in DOM and visible
            console.log("📈 Dropdown appended to body");
            console.log("📈 Dropdown in DOM?", document.body.contains(menu));
            console.log("📈 Dropdown computed style:", {
                display: getComputedStyle(menu).display,
                visibility: getComputedStyle(menu).visibility,
                opacity: getComputedStyle(menu).opacity,
                position: getComputedStyle(menu).position,
                top: getComputedStyle(menu).top,
                right: getComputedStyle(menu).right,
                zIndex: getComputedStyle(menu).zIndex
            });
            const menuRect = menu.getBoundingClientRect();
            console.log("📈 Dropdown bounding rect:", {
                top: menuRect.top,
                right: menuRect.right,
                bottom: menuRect.bottom,
                left: menuRect.left,
                width: menuRect.width,
                height: menuRect.height
            });

            // Hover effect
            const refreshBtn = menu.querySelector('.menu-refresh');
            refreshBtn.addEventListener('mouseenter', () => {
                refreshBtn.style.background = 'linear-gradient(135deg, rgba(33, 150, 243, 0.3), rgba(33, 150, 243, 0.15))';
                refreshBtn.style.borderColor = 'rgba(33, 150, 243, 0.4)';
            });
            refreshBtn.addEventListener('mouseleave', () => {
                refreshBtn.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))';
                refreshBtn.style.borderColor = 'rgba(255,255,255,0.06)';
            });

            // Click handler
            refreshBtn.addEventListener('click', async () => {
                menu.remove();
                await this.refreshData(true);

                // Emit notification
                if (window.NotificationCenter) {
                    await NotificationCenter.emit({
                        moduleId: 'stock-advisor',
                        type: 'info',
                        title: 'Stock Data Refreshed',
                        message: 'Stock portfolio and market data updated successfully'
                    });
                }
            });

            // Auto-close on outside click
            setTimeout(() => {
                const closeOnClickOutside = (e) => {
                    if (!menu.contains(e.target) && e.target !== menuBtn) {
                        menu.remove();
                        document.removeEventListener('click', closeOnClickOutside);
                    }
                };
                document.addEventListener('click', closeOnClickOutside);
            }, 100);
        }
    };

    // Export module
    window.SidekickModules = window.SidekickModules || {};
    window.SidekickModules.StockAdvisor = StockAdvisorModule;
    console.log("✅ Stock Advisor Module loaded and ready");

    // Wait for core then initialize
    waitForCore().then(() => {
        StockAdvisorModule.init();
    });

})();
