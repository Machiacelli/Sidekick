/**
 * Sidekick Chrome Extension - Inventory Sorter Module
 * Allows sorting inventory by market value in ascending/descending order
 * Version: 1.0.0
 * Author: Machiacelli
 * Based on: Inventory Sorter userscript by Machiacelli
 */

(function () {
    'use strict';

    console.log("📦 Loading Sidekick Inventory Sorter Module...");

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

    // Inventory Sorter Module Implementation
    const InventorySorterModule = {
        isInitialized: false,
        tabs: {},
        itemValues: {},
        sortState: 'default',
        posBeforeScroll: null,
        currentTab: null,
        currentTabIndex: null,
        itemObserver: null,

        // Initialize the module
        async init() {
            if (this.isInitialized) {
                console.log("📦 Inventory Sorter Module already initialized");
                return;
            }

            console.log("📦 Initializing Inventory Sorter Module...");

            try {
                await waitForCore();

                // Only initialize on inventory page
                if (!window.location.href.includes('/item.php')) {
                    console.log("📦 Not on inventory page, skipping initialization");
                    return;
                }

                await this.loadApiKey();
                await this.fetchItemValues();
                this.setupUI();
                this.setupObservers();
                this.setupEventListeners();

                this.isInitialized = true;
                console.log("✅ Inventory Sorter Module initialized successfully");
            } catch (error) {
                console.error("❌ Inventory Sorter Module initialization failed:", error);
            }
        },

        // Load API key from storage
        async loadApiKey() {
            try {
                const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                this.apiKey = apiKey || null;
                console.log('📦 API key loaded:', !!this.apiKey);
            } catch (error) {
                console.error('Failed to load API key:', error);
                this.apiKey = null;
            }
        },

        // Fetch item values from Torn API
        async fetchItemValues() {
            if (!this.apiKey) {
                console.warn('📦 No API key available, inventory sorter will be limited');
                return;
            }

            try {
                // Check if extension context is valid first
                if (!window.SidekickModules?.Core?.SafeMessageSender?.isExtensionContextValid()) {
                    console.debug('📦 Extension context invalidated, cannot fetch item values');
                    return;
                }

                const response = await window.SidekickModules.Core.SafeMessageSender.sendToBackground({
                    action: 'fetchTornApi',
                    apiKey: this.apiKey,
                    selections: ['items'],
                    endpoint: 'torn'
                });

                if (!response.success) {
                    console.error("❌ Inventory Sorter API Error:", response.error);
                    return;
                }

                const items = response.items;
                for (const [id, item] of Object.entries(items)) {
                    this.itemValues[id] = { name: item.name, value: item.market_value };
                }

                console.log(`✅ Loaded ${Object.keys(this.itemValues).length} item values`);
            } catch (error) {
                console.error("❌ Failed to fetch item values:", error);
            }
        },

        // Setup UI elements
        setupUI() {
            const titleEl = document.querySelector('.title-black');
            if (!titleEl) return;

            // Add styles
            this.addStyles();

            // Create button container (holds worth label + worth btn + sort btn)
            const container = document.createElement('span');
            container.classList.add('is-container', 'right');

            // Worth label — shows the calculated total
            const worthLabel = document.createElement('span');
            worthLabel.classList.add('is-worth-label');
            worthLabel.style.display = 'none';

            // Worth button
            const worthBtn = document.createElement('button');
            worthBtn.classList.add('is-btn', 'torn-btn', 'dark-mode');
            worthBtn.textContent = 'WORTH';
            worthBtn.title = 'Calculate total market value of all items in this category';

            // Sort button
            const btn = document.createElement('button');
            btn.classList.add('is-btn', 'torn-btn', 'dark-mode');
            btn.textContent = 'SORT';
            btn.title = 'Click to sort inventory by value (Descending → Ascending → Default)';

            container.appendChild(worthLabel);
            container.appendChild(worthBtn);
            container.appendChild(btn);
            titleEl.appendChild(container);

            this.sortButton = btn;
            this.worthButton = worthBtn;
            this.worthLabel = worthLabel;
        },

        // Add CSS styles
        addStyles() {
            const style = document.createElement('style');
            style.textContent = `
                .is-container {
                    height: 100%;
                    margin-right: 2px;
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .is-btn {
                    height: 22px !important;
                    padding: 0 8px !important;
                    line-height: 0 !important;
                    font-size: 11px !important;
                    font-weight: bold !important;
                }

                .is-worth-label {
                    font-size: 12px;
                    font-weight: bold;
                    color: #a8d8a8;
                    white-space: nowrap;
                    margin-right: 2px;
                }
            `;
            document.head.appendChild(style);
        },

        // Setup mutation observers
        setupObservers() {
            this.currentTab = this.getCurrentTabElement();
            this.currentTabIndex = this.getCurrentTabIndex();
            this.recordTab();

            this.itemObserver = new MutationObserver((mutationList) => {
                mutationList.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length) {
                        this.recordTab();
                    }
                });
            });

            const tabContent = this.getCurrentTabContent();
            if (tabContent) {
                this.itemObserver.observe(tabContent, {
                    attributes: true,
                    childList: true,
                    subtree: true,
                });
            }
        },

        // Setup event listeners
        setupEventListeners() {
            const titleEl = document.querySelector('.title-black');

            // Sort button click
            if (this.sortButton) {
                this.sortButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.handleSort();
                });
            }

            // Worth button click
            if (this.worthButton) {
                this.worthButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.handleWorth();
                });
            }

            // Title click for loading all items
            titleEl?.addEventListener('click', async (e) => {
                if (e.target !== titleEl) return;

                if (!this.apiKey) {
                    this.showNotification('Please set your API key in the extension settings to use Inventory Sorter', 'warning');
                    return;
                }

                if (!this.posBeforeScroll && !this.tabs[this.currentTabIndex]?.isFullyLoaded) {
                    this.posBeforeScroll = window.scrollY;
                    await this.loadTabItems();
                }

                if (this.tabs[this.currentTabIndex]?.isFullyLoaded) {
                    await this.sortTab();
                }
            });

            // Category tab clicks
            const categoryElements = document.querySelectorAll('#categoriesList')[0]?.children;
            if (categoryElements) {
                Array.from(categoryElements).forEach((el) => {
                    if (el.classList.contains('no-items')) return;

                    el.addEventListener('click', () => {
                        this.posBeforeScroll = null;
                        this.currentTab = this.getCurrentTabElement();
                        this.currentTabIndex = this.getCurrentTabIndex();
                        this.sortState = 'default';

                        // Reset worth label when switching tabs
                        if (this.worthLabel) {
                            this.worthLabel.style.display = 'none';
                            this.worthLabel.textContent = '';
                        }

                        this.itemObserver?.disconnect();
                        const tabContent = this.getCurrentTabContent();
                        if (tabContent) {
                            this.itemObserver.observe(tabContent, {
                                attributes: true,
                                childList: true,
                                subtree: true,
                            });
                        }

                        this.recordTab();
                    });
                });
            }
        },

        // Handle sort button click
        async handleSort() {
            if (!this.apiKey) {
                this.showNotification('Please set your API key in the extension settings', 'warning');
                return;
            }

            if (!this.posBeforeScroll && !this.tabs[this.currentTabIndex]?.isFullyLoaded) {
                this.posBeforeScroll = window.scrollY;
                await this.loadTabItems();
            }

            if (this.tabs[this.currentTabIndex]?.isFullyLoaded) {
                await this.sortTab();
            }
        },

        // Handle worth button click — calculate total market value of the current category
        async handleWorth() {
            if (!this.apiKey) {
                this.showNotification('Please set your API key in the extension settings', 'warning');
                return;
            }

            // Load all items first if needed
            if (!this.posBeforeScroll && !this.tabs[this.currentTabIndex]?.isFullyLoaded) {
                this.posBeforeScroll = window.scrollY;
                await this.loadTabItems();
            }

            const tabContent = this.getCurrentTabContent();
            if (!tabContent) return;

            let total = 0;
            let counted = 0;

            for (const item of tabContent.children) {
                if (item.classList.contains('ajax-item-loader')) continue;

                const itemId = item.getAttribute('data-item');
                let qty = parseFloat(item.getAttribute('data-qty') || '1') || 1;

                const value = this.itemValues[itemId]?.value || 0;
                total += value * qty;
                counted++;
            }

            if (this.worthLabel) {
                this.worthLabel.textContent = this.getUsdFormat(total);
                this.worthLabel.style.display = 'inline';
            }

            this.showNotification(`Category worth: ${this.getUsdFormat(total)} (${counted} items)`, 'success');
        },

        // Record current tab state
        recordTab() {
            if (this.tabs[this.currentTabIndex]?.isFullyLoaded) return;

            const tabContent = this.getCurrentTabContent();
            if (!tabContent) return;

            if (this.tabs[this.currentTabIndex]) {
                this.tabs[this.currentTabIndex].defaultOrder = [...tabContent.children];
                if (Object.keys(this.itemValues).length) {
                    this.appendItemValues(this.tabs[this.currentTabIndex].defaultOrder);
                }
                return;
            }

            const newTab = {
                [this.currentTabIndex]: {
                    isFullyLoaded: false,
                    defaultOrder: [...tabContent.children],
                },
            };

            if (Object.keys(this.itemValues).length) {
                this.appendItemValues(newTab[this.currentTabIndex].defaultOrder);
            }

            this.tabs = { ...this.tabs, ...newTab };
        },

        // Store item values without adding any visual elements
        // We only need the values for sorting, not for display
        appendItemValues(defaultElements) {
            // This function no longer adds any visual elements to the DOM
            // It simply ensures the item values are loaded in memory for sorting
            // The actual values are already displayed by other extensions/scripts
            console.log('📦 Item values loaded for sorting (no visual elements added)');
        },

        // Sort current tab
        async sortTab() {
            const defaultOrderCopy = [...this.tabs[this.currentTabIndex].defaultOrder];
            const tabItems = [];

            for (const item of defaultOrderCopy) {
                if (item.classList.contains('ajax-item-loader')) continue;

                const itemId = item.getAttribute('data-item');
                let itemQty = item.getAttribute('data-qty');

                if (itemQty === '' || !itemQty) {
                    itemQty = 1;
                }

                const itemValue = this.itemValues[itemId]?.value || 0;
                tabItems.push({ el: item, value: itemValue * itemQty });
            }

            const tabContent = this.getCurrentTabContent();
            if (!tabContent) return;

            if (this.sortState === 'default') {
                this.sortState = 'descending';
                tabItems.sort((a, b) => b.value - a.value);
                tabItems.forEach((item) => tabContent.appendChild(item.el));
                this.showNotification('Sorted: Highest to Lowest', 'success');
            } else if (this.sortState === 'descending') {
                this.sortState = 'ascending';
                tabItems.sort((a, b) => a.value - b.value);
                tabItems.forEach((item) => tabContent.appendChild(item.el));
                this.showNotification('Sorted: Lowest to Highest', 'success');
            } else if (this.sortState === 'ascending') {
                this.sortState = 'default';
                defaultOrderCopy.forEach((item) => {
                    if (!item.classList.contains('ajax-item-loader')) {
                        tabContent.appendChild(item);
                    }
                });
                this.showNotification('Sorted: Default Order', 'info');
            }
        },

        // Load all items in current tab
        async loadTabItems() {
            const loadMoreDesc = document.querySelector('#load-more-items-desc');
            if (!loadMoreDesc) return;

            const text = loadMoreDesc.textContent;

            if (text.toLowerCase().includes('full')) {
                window.scroll(0, this.posBeforeScroll);
                this.tabs[this.currentTabIndex].isFullyLoaded = true;
                this.showNotification('All items loaded!', 'success');
                return;
            }

            if (text.toLowerCase().includes('load more')) {
                const itemsWrap = document.querySelector('.items-wrap');
                itemsWrap?.lastElementChild?.scrollIntoView();
                await new Promise((resolve) => setTimeout(resolve, 500));
                return this.loadTabItems();
            }
        },

        // Get current active tab element
        getCurrentTabElement() {
            return document.querySelector('.ui-tabs-active');
        },

        // Get current tab content area
        getCurrentTabContent() {
            return document.querySelector('[aria-hidden="false"]');
        },

        // Get current tab index
        getCurrentTabIndex() {
            const currentTab = this.getCurrentTabElement();
            if (!currentTab) return 0;
            return Array.prototype.indexOf.call(currentTab.parentNode.children, currentTab);
        },

        // Format number as USD currency
        getUsdFormat(amount) {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0,
            }).format(amount);
        },

        // Show notification
        showNotification(message, type = 'info') {
            if (window.SidekickModules?.UI?.showNotification) {
                window.SidekickModules.UI.showNotification('Inventory Sorter', message, type);
            } else {
                console.log(`📦 ${message}`);
            }
        },
    };

    // Initialize global namespace if it doesn't exist
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    // Export Inventory Sorter module to global namespace
    window.SidekickModules.InventorySorter = InventorySorterModule;
    console.log("✅ Inventory Sorter Module loaded and ready");

})();
