// Locked Items Manager Module
// Lock inventory items to prevent accidental trading/selling
const LockedItemsManagerModule = {
    isEnabled: false,
    lockedItems: {},
    observer: null,
    processTimer: null,
    hashChangeHandler: null,
    STORAGE_KEY: 'locked-items',
    _settings: null,

    async init() {
        console.log('🔒 Locked Items Manager initializing...');

        this._settings =
            window.SidekickModules.Core.ModuleSettingsHelper(
                this.STORAGE_KEY,
                false
            );

        this.isEnabled = await this._settings.load();
        await this.loadLockedItems();

        if (this.isEnabled) {
            this.enable();
        }

        chrome.storage.onChanged.addListener(
            (changes, namespace) => {
                if (
                    namespace === 'local' &&
                    changes.sidekick_settings
                ) {
                    this._settings.load().then(value => {
                        this.isEnabled = value;
                    });
                }
            }
        );

        console.log('🔒 Locked Items Manager initialized');
    },

    async loadLockedItems() {
        try {
            const items =
                await window.SidekickModules.Core.ChromeStorage.get(
                    'sidekick_locked_items'
                ) || {};

            const cleanedItems = {};

            for (const key in items) {
                if (
                    key === 'isEnabled' ||
                    key === 'settings' ||
                    typeof items[key] !== 'boolean'
                ) {
                    console.warn(
                        `🔒 Removing invalid property from locked items: ${key}`
                    );
                    continue;
                }

                cleanedItems[key] = items[key];
            }

            this.lockedItems = cleanedItems;

            console.log(
                `🔒 Loaded ${Object.keys(this.lockedItems).length} locked item keys`
            );

            if (
                Object.keys(items).length !==
                Object.keys(cleanedItems).length
            ) {
                console.log(
                    '🔒 Cleaned corrupted storage, saving...'
                );
                await this.saveLockedItems();
            }
        } catch (error) {
            console.error(
                '🔒 Failed to load locked items:',
                error
            );
        }
    },

    async saveLockedItems() {
        try {
            await window.SidekickModules.Core.ChromeStorage.set(
                'sidekick_locked_items',
                this.lockedItems
            );
        } catch (error) {
            console.error(
                '🔒 Failed to save locked items:',
                error
            );
        }
    },

    enable() {
        console.log('🔒 Enabling Locked Items Manager');

        this.isEnabled = true;

        if (this._settings) {
            this._settings.save(true);
        }

        this.addStyles();
        this.processPage();
        this.startObserver();

        if (!this.hashChangeHandler) {
            this.hashChangeHandler = () => {
                this.scheduleProcessPage(200);
            };

            window.addEventListener(
                'hashchange',
                this.hashChangeHandler
            );
        }

        console.log('🔒 Locked Items Manager enabled');
    },

    disable() {
        console.log('🔒 Disabling Locked Items Manager');

        this.isEnabled = false;

        if (this._settings) {
            this._settings.save(false);
        }

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.processTimer) {
            clearTimeout(this.processTimer);
            this.processTimer = null;
        }

        if (this.hashChangeHandler) {
            window.removeEventListener(
                'hashchange',
                this.hashChangeHandler
            );

            this.hashChangeHandler = null;
        }

        console.log('🔒 Locked Items Manager disabled');
    },

    addStyles() {
        if (
            document.getElementById(
                'sidekick-locked-items-styles'
            )
        ) {
            return;
        }

        const style =
            document.createElement('style');

        style.id =
            'sidekick-locked-items-styles';

        style.textContent = `
            .sidekick-padlock {
                cursor: pointer;
                margin-right: 8px;
                font-size: 16px;
                opacity: 0.2;
                transition: opacity 0.2s;
                user-select: none;
            }

            .sidekick-padlock.is-locked {
                opacity: 1 !important;
            }

            .sidekick-padlock:hover {
                opacity: 0.8 !important;
            }

            .sidekick-item-locked {
                opacity: 0.6;
            }

            .sidekick-unlock-all-btn {
                padding: 8px 14px;
                background: #1a1a1a;
                color: #fff;
                border: 1px solid #cf4444;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: bold;
                margin-top: 10px;
                transition: all 0.2s;
            }

            .sidekick-unlock-all-btn:hover {
                background: #cf4444;
                border-color: #fff;
                color: #fff;
            }

            li.sidekick-item-locked li.sell,
            li.sidekick-item-locked li.send,
            li.sidekick-item-locked li.dump {
                display: none !important;
            }

            .sidekick-toast-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 999999;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .sidekick-toast {
                padding: 12px 20px;
                background: #1a1a1a;
                color: #fff;
                border-left: 3px solid #4caf50;
                border-radius: 3px;
                box-shadow:
                    0 2px 8px
                    rgba(0,0,0,0.3);
                transform: translateX(150%);
                transition: transform 0.3s ease;
                font-size: 13px;
            }

            .sidekick-toast.show {
                transform: translateX(0);
            }

            .sidekick-toast.error {
                border-left-color: #f44336;
            }

            .sidekick-hide-locked {
                display: none !important;
            }
        `;

        document.head.appendChild(style);
    },

    /*
     * Inventory:
     *   data-armoryid="20146354346"
     *
     * Bazaar unique equipment:
     *   class="clearfix"
     *   data-reactid="...$Primary.$20146354346"
     *
     * Bazaar stackable items:
     *   class="clearfix no-mods"
     *   data-reactid contains a temporary stack ID
     *
     * Item Market:
     *   aria-controls="...-488-20146354346"
     */
    getItemIdentifiers(element) {
        const uniqueIds = new Set();
        const baseIds = new Set();

        if (!element) {
            return {
                uniqueIds: [],
                baseIds: [],
                isStackable: false
            };
        }

        const addNumeric = (set, value) => {
            const normalized =
                String(value || '').trim();

            if (/^\d+$/.test(normalized)) {
                set.add(normalized);
            }
        };

        const nodes = [
            element,
            ...element.querySelectorAll('*')
        ];

        nodes.forEach(node => {
            addNumeric(
                uniqueIds,
                node.getAttribute?.('data-armoryid')
            );

            addNumeric(
                uniqueIds,
                node.getAttribute?.('data-armory')
            );

            addNumeric(
                uniqueIds,
                node.getAttribute?.('data-uid')
            );

            addNumeric(
                uniqueIds,
                node.getAttribute?.('data-itemuid')
            );

            addNumeric(
                uniqueIds,
                node.getAttribute?.('data-item-uid')
            );

            addNumeric(
                uniqueIds,
                node.getAttribute?.('xid')
            );

            addNumeric(
                baseIds,
                node.getAttribute?.('data-item')
            );

            const dataId =
                node.getAttribute?.('data-id');

            if (/^\d+$/.test(String(dataId || ''))) {
                if (String(dataId).length >= 7) {
                    addNumeric(uniqueIds, dataId);
                } else {
                    addNumeric(baseIds, dataId);
                }
            }

            const rowKey =
                node.getAttribute?.('data-rowkey');

            const rowKeyMatch =
                String(rowKey || '').match(
                    /^u(\d+)$/i
                );

            if (rowKeyMatch) {
                addNumeric(
                    uniqueIds,
                    rowKeyMatch[1]
                );
            }

            const reactId =
                node.getAttribute?.('data-reactid');

            const reactMatches =
                String(reactId || '').matchAll(
                    /\.\$(\d{7,})(?=$|[^\d])/g
                );

            for (const match of reactMatches) {
                addNumeric(
                    uniqueIds,
                    match[1]
                );
            }

            const ariaControls =
                node.getAttribute?.('aria-controls');

            const controlsMatch =
                String(ariaControls || '').match(
                    /-(\d{7,})$/
                );

            if (controlsMatch) {
                addNumeric(
                    uniqueIds,
                    controlsMatch[1]
                );
            }

            const source =
                node.getAttribute?.('src');

            const imageMatch =
                String(source || '').match(
                    /\/items\/(\d+)\//
                );

            if (imageMatch) {
                addNumeric(
                    baseIds,
                    imageMatch[1]
                );
            }

            const href =
                node.getAttribute?.('href');

            const hrefMatch =
                String(href || '').match(
                    /[?&]itemID=(\d+)/i
                );

            if (hrefMatch) {
                addNumeric(
                    baseIds,
                    hrefMatch[1]
                );
            }
        });

        const armoryInput =
            element.querySelector(
                'input[name="armoryID"]'
            );

        if (armoryInput?.value) {
            addNumeric(
                uniqueIds,
                armoryInput.value
            );
        }

        const idInput =
            element.querySelector(
                'input[name="ID"]'
            );

        if (idInput?.value) {
            if (
                String(idInput.value).length >= 7
            ) {
                addNumeric(
                    uniqueIds,
                    idInput.value
                );
            } else {
                addNumeric(
                    baseIds,
                    idInput.value
                );
            }
        }

        const quantityInputs =
            Array.from(
                element.querySelectorAll(
                    'input[name="amount"], ' +
                    'input[placeholder="Qty"], ' +
                    'input[placeholder="Quantity"]'
                )
            );

        const hasUsableQuantityInput =
            quantityInputs.some(input => {
                if (
                    String(input.type || '')
                        .toLowerCase() ===
                    'hidden'
                ) {
                    return false;
                }

                if (input.disabled) {
                    return false;
                }

                if (
                    input.getAttribute?.(
                        'aria-hidden'
                    ) === 'true'
                ) {
                    return false;
                }

                if (
                    typeof input.getClientRects ===
                    'function' &&
                    input.getClientRects().length === 0
                ) {
                    return false;
                }

                return true;
            });

        const isBazaarItemRow =
            element.tagName === 'LI' &&
            element.getAttribute?.(
                'data-group'
            ) === 'child';

        const hasNoModsClass =
            element.classList
                ?.contains('no-mods') ||
            String(
                element.getAttribute?.(
                    'class'
                ) || ''
            )
                .split(/\s+/)
                .includes('no-mods');

        /*
         * On Bazaar, no-mods is the authoritative distinction:
         *
         * no-mods present  = stackable/base item lock
         * no-mods missing  = unique equipment instance lock
         *
         * This takes priority over quantity inputs because Torn keeps
         * internal quantity inputs inside some unique weapon rows.
         */
        const isStackable =
            isBazaarItemRow
                ? hasNoModsClass
                : hasUsableQuantityInput;

        return {
            uniqueIds: [...uniqueIds],
            baseIds: [...baseIds],
            isStackable
        };
    },

    getLockKeys(identifiers) {
        const keys = [];

        if (
            identifiers.isStackable &&
            identifiers.baseIds.length > 0
        ) {
            identifiers.baseIds.forEach(id => {
                keys.push(id);
            });
        } else if (
            identifiers.uniqueIds.length > 0
        ) {
            identifiers.uniqueIds.forEach(id => {
                keys.push(id);
                keys.push(`armory_${id}`);
            });
        } else {
            identifiers.baseIds.forEach(id => {
                keys.push(id);
            });
        }

        return [...new Set(keys)];
    },

    isItemLocked(elementOrIdentifiers) {
        const identifiers =
            elementOrIdentifiers?.uniqueIds
                ? elementOrIdentifiers
                : this.getItemIdentifiers(
                    elementOrIdentifiers
                );

        return this.getLockKeys(
            identifiers
        ).some(
            key =>
                this.lockedItems[key] === true
        );
    },

    getItemID(element) {
        const identifiers =
            this.getItemIdentifiers(element);

        if (
            identifiers.isStackable &&
            identifiers.baseIds.length > 0
        ) {
            return identifiers.baseIds[0];
        }

        return (
            identifiers.uniqueIds[0] ||
            identifiers.baseIds[0] ||
            null
        );
    },

    showToast(message, isError = false) {
        let container =
            document.querySelector(
                '.sidekick-toast-container'
            );

        if (!container) {
            container =
                document.createElement('div');

            container.className =
                'sidekick-toast-container';

            document.body.appendChild(
                container
            );
        }

        const toast =
            document.createElement('div');

        toast.className =
            `sidekick-toast ${isError ? 'error' : ''}`;

        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        setTimeout(() => {
            toast.classList.remove('show');

            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    },

    processInventoryPage() {
        const items =
            document.querySelectorAll(
                'li[data-armoryid], li[data-item]'
            );

        items.forEach(element => {
            if (
                element.getAttribute(
                    'data-group'
                ) === 'parent'
            ) {
                return;
            }

            const nameWrapper =
                element.querySelector(
                    '.name-wrap'
                );

            if (!nameWrapper) return;

            const identifiers =
                this.getItemIdentifiers(
                    element
                );

            const itemId =
                this.getItemID(element);

            if (!itemId) return;

            const isLocked =
                this.isItemLocked(
                    identifiers
                );

            element.classList.toggle(
                'sidekick-item-locked',
                isLocked
            );

            let padlock =
                element.querySelector(
                    '.sidekick-padlock'
                );

            if (
                !padlock &&
                !element.hasAttribute(
                    'data-sidekick-processed'
                )
            ) {
                element.setAttribute(
                    'data-sidekick-processed',
                    'true'
                );

                padlock =
                    document.createElement(
                        'span'
                    );

                padlock.className =
                    'sidekick-padlock';

                padlock.onclick = event => {
                    event.stopPropagation();
                    this.toggleLock(element);
                };

                nameWrapper.insertBefore(
                    padlock,
                    nameWrapper.firstChild
                );
            }

            if (padlock) {
                padlock.textContent =
                    isLocked ? '🔒' : '🔓';

                padlock.classList.toggle(
                    'is-locked',
                    isLocked
                );
            }

            const actionElements =
                element.querySelectorAll(
                    'li.sell, li.send, li.dump'
                );

            actionElements.forEach(button => {
                button.style.display =
                    isLocked ? 'none' : '';
            });
        });

        this.addUnlockAllButton();
    },

    async toggleLock(element) {
        const itemName =
            element.querySelector('.name')
                ?.textContent || 'Item';

        const identifiers =
            this.getItemIdentifiers(element);

        const uniqueId =
            identifiers.uniqueIds[0];

        const baseId =
            identifiers.baseIds[0];

        const lockKeys =
            this.getLockKeys(identifiers);

        if (this.isItemLocked(identifiers)) {
            lockKeys.forEach(key => {
                delete this.lockedItems[key];
            });

            window.SidekickModules?.UI
                ?.showNotification(
                    'Item Unlocked',
                    `${itemName} unlocked`,
                    'success'
                );
        } else {
            const storageKey =
                identifiers.isStackable &&
                    baseId
                    ? baseId
                    : (uniqueId || baseId);

            if (!storageKey) return;

            this.lockedItems[
                storageKey
            ] = true;

            window.SidekickModules?.UI
                ?.showNotification(
                    'Item Locked',
                    `${itemName} locked`,
                    'info'
                );
        }

        await this.saveLockedItems();
        this.processPage();
    },

    addUnlockAllButton() {
        const sortButton =
            document.querySelector(
                '[class*="sort"] button'
            );

        if (
            !sortButton ||
            sortButton.nextElementSibling
                ?.classList.contains(
                    'sidekick-unlock-all-btn'
                )
        ) {
            return;
        }

        const unlockButton =
            document.createElement(
                'button'
            );

        unlockButton.className =
            'sidekick-unlock-all-btn';

        unlockButton.textContent =
            'Unlock All (Category)';

        unlockButton.onclick = async () => {
            if (
                !confirm(
                    'Unlock all items in this category?'
                )
            ) {
                return;
            }

            const items =
                document.querySelectorAll(
                    'li[data-armoryid], li[data-item]'
                );

            let unlockedCount = 0;

            items.forEach(element => {
                if (
                    element.getAttribute(
                        'data-group'
                    ) === 'parent'
                ) {
                    return;
                }

                if (
                    !element.querySelector(
                        '.name-wrap'
                    )
                ) {
                    return;
                }

                const identifiers =
                    this.getItemIdentifiers(
                        element
                    );

                const lockKeys =
                    this.getLockKeys(
                        identifiers
                    );

                const hasLockedKey =
                    lockKeys.some(
                        key =>
                            this.lockedItems[
                            key
                            ] === true
                    );

                if (hasLockedKey) {
                    lockKeys.forEach(key => {
                        delete this.lockedItems[
                            key
                        ];
                    });

                    unlockedCount++;
                }
            });

            await this.saveLockedItems();
            this.processPage();

            if (unlockedCount > 0) {
                window.SidekickModules?.UI
                    ?.showNotification(
                        'Items Unlocked',
                        `Unlocked ${unlockedCount} items`,
                        'success'
                    );
            } else {
                window.SidekickModules?.UI
                    ?.showNotification(
                        'No Locked Items',
                        'No locked items in this category',
                        'info'
                    );
            }
        };

        sortButton.parentNode.insertBefore(
            unlockButton,
            sortButton.nextSibling
        );
    },

    processPage() {
        if (!this.isEnabled) return;

        const url =
            window.location.href;

        if (
            url.includes(
                'itemuseparcel.php'
            ) ||
            url.includes(
                'tradelist.php'
            )
        ) {
            return;
        }

        if (url.includes('item.php')) {
            this.processInventoryPage();
            return;
        }

        if (
            url.includes('bazaar.php')
        ) {
            const hash =
                window.location.hash;

            if (
                hash.includes('/add') ||
                hash.includes('/manage') ||
                url.includes(
                    'bazaar.php#/'
                )
            ) {
                this.processBazaarPage();
            }

            return;
        }

        if (
            url.includes('page.php') &&
            url.includes(
                'sid=ItemMarket'
            )
        ) {
            const hash =
                window.location.hash;

            if (
                hash.includes(
                    '/addListing'
                )
            ) {
                this.processBazaarPage();
            }

            return;
        }

        if (this.isStorePage(url)) {
            this.processStorePage();
            return;
        }

        if (
            url.includes(
                'factions.php'
            ) &&
            window.location.hash.includes(
                'tab=armoury'
            )
        ) {
            this.processStorePage();
        }
    },

    scheduleProcessPage(delay = 100) {
        if (!this.isEnabled) return;

        if (this.processTimer) {
            clearTimeout(
                this.processTimer
            );
        }

        this.processTimer =
            setTimeout(() => {
                this.processTimer = null;
                this.processPage();
            }, delay);
    },

    isStorePage(url) {
        return (
            url.includes('shops.php') ||
            url.includes(
                'bigalgunshop.php'
            )
        );
    },

    processStorePage() {
        const items = Array.from(
            document.querySelectorAll(
                'li[data-id][data-item]'
            )
        );

        if (items.length === 0) return;

        items.forEach(element => {
            const identifiers =
                this.getItemIdentifiers(
                    element
                );

            if (
                identifiers.uniqueIds.length ===
                0 &&
                identifiers.baseIds.length ===
                0
            ) {
                return;
            }

            if (
                this.isItemLocked(
                    identifiers
                )
            ) {
                element.style.setProperty(
                    'display',
                    'none',
                    'important'
                );

                element.classList.add(
                    'sidekick-hide-locked'
                );
            } else {
                element.style.removeProperty(
                    'display'
                );

                element.classList.remove(
                    'sidekick-hide-locked'
                );
            }
        });
    },

    processBazaarPage() {
        let items =
            document.querySelectorAll(
                'li[data-group="child"]'
            );

        if (items.length === 0) {
            const itemImages =
                document.querySelectorAll(
                    'img.torn-item, ' +
                    'img[src*="/items/"]'
                );

            const parentSet =
                new Set();

            itemImages.forEach(image => {
                const dropdown =
                    image.closest(
                        '[role="option"], ' +
                        '.menu-item-link, ' +
                        '[data-testid^="option-"]'
                    );

                if (dropdown) return;

                let parent =
                    image.closest(
                        '[class*="virtualListing"], li'
                    );

                if (!parent) {
                    parent =
                        image.parentElement
                            ?.parentElement
                            ?.parentElement
                            ?.parentElement
                            ?.parentElement;
                }

                if (parent) {
                    parentSet.add(parent);
                }
            });

            items =
                Array.from(parentSet);
        }

        if (items.length === 0) {
            items =
                document.querySelectorAll(
                    'ul.items-cont > li, ' +
                    '.items-list li'
                );
        }

        if (items.length === 0) return;

        items.forEach(item => {
            const identifiers =
                this.getItemIdentifiers(
                    item
                );

            if (
                this.isItemLocked(
                    identifiers
                )
            ) {
                item.classList.add(
                    'sidekick-hide-locked'
                );

                item.style.setProperty(
                    'display',
                    'none',
                    'important'
                );
            } else {
                item.classList.remove(
                    'sidekick-hide-locked'
                );

                item.style.removeProperty(
                    'display'
                );
            }
        });
    },

    hideLockedItems() {
        // Reserved for additional trade/market pages.
    },

    startObserver() {
        if (this.observer) return;

        this.observer =
            new MutationObserver(() => {
                this.scheduleProcessPage(
                    100
                );
            });

        this.observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );
    }
};

if (
    typeof window.SidekickModules ===
    'undefined'
) {
    window.SidekickModules = {};
}

window.SidekickModules.LockedItems =
    LockedItemsManagerModule;

console.log(
    '🔒 Locked Items Manager module registered'
);