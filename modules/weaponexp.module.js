/**
 * Weapon Experience Tracker Module
 * Displays weapon experience percentages on the Items page
 * Adapted from xedx's Weapon Experience Tracker userscript
 */

const WeaponExpModule = (() => {
    // Module state
    let isEnabled = false;
    let weArray = null;
    let pageName = '';
    let pageDiv = null;
    let pageObserver = null;
    let observing = false;

    // Cache for overview window data
    let cachedFullData = null;
    let overviewWindow = null;

    // Selectors
    const pageSpanSelector = "#mainContainer > div.content-wrapper > div.main-items-cont-wrap > div.items-wrap.primary-items > div.title-black > span.items-name";
    const pageDivSelector = "#mainContainer > div.content-wrapper > div.main-items-cont-wrap > div.items-wrap.primary-items > div.title-black";
    const observerConfig = { attributes: true, characterData: true, subtree: true, childList: true };
    const excludedWeaponNames = new Set([
        'melatonin',
        'tyrosine',
        'serotonin',
        'epinephrine',
        'flash grenade',
        'smoke grenade',
        'pepper spray',
        'tear gas',
        'teargas'
    ]);

    // Module API
    return {
        name: 'WeaponExpTracker',

        async initialize() {
            console.log('[Sidekick] Initializing Weapon Experience Tracker...');

            // Check if Core module is available
            if (!window.SidekickModules?.Core?.ChromeStorage) {
                console.warn('[Sidekick] Core module not available, Weapon XP Tracker disabled');
                return;
            }

            // Check if module is enabled
            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_weapon_xp_tracker');
            isEnabled = settings?.isEnabled === true;

            if (!isEnabled) {
                console.log('[Sidekick] Weapon XP Tracker is disabled');
                return;
            }

            // Only run on item.php pages
            if (!window.location.href.includes('item.php')) {
                return;
            }

            // Check for API key
            const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
            if (!apiKey) {
                console.warn('[Sidekick] No API key found, Weapon XP Tracker disabled');
                return;
            }

            // Wait for full page load
            if (document.readyState === 'complete') {
                this.handlePageLoad();
            } else {
                window.addEventListener('load', () => this.handlePageLoad());
            }

            console.log('[Sidekick] Weapon Experience Tracker initialized');
        },

        async handlePageLoad() {
            console.log('[Sidekick] Weapon XP: Page loaded, fetching weapon experience data...');

            // Fetch weapon experience data from API
            const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
            if (!apiKey) return;

            const CS = window.SidekickModules.Core.ChromeStorage;
            const CACHE_KEY = 'sidekick_wxp_cache';

            try {
                const response = await fetch(`https://api.torn.com/user/?selections=weaponexp&key=${apiKey}`);

                // Handle HTTP-level throttling
                if (response.status === 429) {
                    console.warn('[Sidekick] WXP: API rate limited (429), loading cached data...');
                    const cached = await CS.get(CACHE_KEY);
                    if (cached?.weaponexp) {
                        weArray = cached.weaponexp;
                        this.modifyPage(weArray);
                        this.showThrottleNotice();
                    }
                    return;
                }

                const data = await response.json();

                if (data.error) {
                    // Error code 5 = Too many requests, fallback to cache
                    if (data.error.code === 5 || data.error.code === 13) {
                        console.warn('[Sidekick] WXP: API throttled (code ' + data.error.code + '), loading cached data...');
                        const cached = await CS.get(CACHE_KEY);
                        if (cached?.weaponexp) {
                            weArray = cached.weaponexp;
                            this.modifyPage(weArray);
                            this.showThrottleNotice();
                        }
                        return;
                    }
                    console.error('[Sidekick] Weapon XP API Error:', data.error);
                    return;
                }

                weArray = data.weaponexp;
                console.log('[Sidekick] Weapon XP: Data loaded, found', weArray?.length || 0, 'weapons');

                // Persist to cache for throttle fallback
                await CS.set(CACHE_KEY, { weaponexp: weArray, cachedAt: Date.now() });

                this.modifyPage(weArray);
            } catch (error) {
                console.error('[Sidekick] Weapon XP: Failed to fetch data:', error);
                // Network error — try cache
                try {
                    const CS2 = window.SidekickModules?.Core?.ChromeStorage;
                    if (CS2) {
                        const cached = await CS2.get(CACHE_KEY);
                        if (cached?.weaponexp) {
                            weArray = cached.weaponexp;
                            this.modifyPage(weArray);
                            this.showThrottleNotice();
                        }
                    }
                } catch {}
            }
        },

        showThrottleNotice() {
            // Show a subtle banner that cached data is being shown
            const existing = document.getElementById('sk-wxp-throttle-notice');
            if (existing) return;
            const notice = document.createElement('div');
            notice.id = 'sk-wxp-throttle-notice';
            notice.style.cssText = 'position:fixed;bottom:10px;right:10px;background:rgba(255,173,90,0.15);border:1px solid rgba(255,173,90,0.4);color:#ffad5a;font-size:11px;padding:6px 10px;border-radius:6px;z-index:999997;font-family:sans-serif;';
            notice.textContent = 'WXP: Showing cached data (API throttled)';
            document.body.appendChild(notice);
            setTimeout(() => notice.remove(), 8000);
        },

        modifyPage(array, pageChange = false) {
            // Setup observer if not already done
            if (pageObserver == null) {
                pageDiv = document.querySelector(pageDivSelector);
                if (!pageDiv) return;

                const callback = (mutationsList, observer) => {
                    console.log('[Sidekick] Weapon XP: Page change detected');
                    this.modifyPage(weArray, true);
                };
                pageObserver = new MutationObserver(callback);
            }

            let lastPage = pageName;
            pageName = this.getPageName();

            if (!pageName) {
                this.observeOn();
                return;
            }

            console.log('[Sidekick] Weapon XP: modifyPage - pageName:', pageName, 'pageChange:', pageChange);

            if (array == null) {
                array = weArray;
            }

            let itemUL = null;

            // Find the appropriate weapon category list
            if (pageName === 'Primary') {
                itemUL = document.getElementById('primary-items');
            } else if (pageName === 'Secondary') {
                itemUL = document.getElementById('secondary-items');
            } else if (pageName === 'Melee') {
                itemUL = document.getElementById('melee-items');
            } else if (pageName === 'Temporary') {
                itemUL = document.getElementById('temporary-items');
            } else {
                this.observeOn();
                return; // Not on a weapons page
            }

            if (!itemUL) {
                this.observeOn();
                return;
            }

            const items = itemUL.getElementsByTagName('li');
            const itemLen = items.length;

            console.log('[Sidekick] Weapon XP:', pageName, 'items found:', itemLen);

            if (itemLen <= 1) {
                // Not fully loaded, try again
                setTimeout(() => this.modifyPage(null, true), 500);
                return;
            }

            this.observeOff(); // Don't call ourselves while editing

            // Process each weapon item
            for (let i = 0; i < items.length; i++) {
                const itemLi = items[i];
                const itemID = itemLi.getAttribute('data-item');
                if (!itemID) continue;

                const category = itemLi.getAttribute('data-category');
                if (!category) continue;

                const nameSel = itemLi.querySelector('div.title-wrap > div > span.name-wrap > span.name');
                if (!nameSel) continue;

                const name = nameSel.innerHTML;

                // Skip temporary utility/non-weapon items.
                if (this.isExcludedWeaponName(name)) {
                    console.log('[Sidekick] Weapon XP: Skipping excluded item:', name);
                    continue;
                }

                const item = this.getItemByItemID(array, Number(itemID));
                let WE = 0;

                if (item) {
                    WE = item.exp;
                    console.log('[Sidekick] Weapon XP:', name, '-', WE + '%');
                }

                const bonusUL = itemLi.querySelector('div.cont-wrap > div.bonuses.left > ul');
                if (!bonusUL) continue;

                // Remove old WE display if exists
                const oldWeSel = bonusUL.querySelector('li.left.we');
                if (oldWeSel) oldWeSel.remove();

                // Remove Item Market tooltip to prevent duplication
                const ttPriceSel = bonusUL.querySelector('li.bonus.left.tt-item-price');
                if (ttPriceSel) ttPriceSel.remove();

                // Add new WE display
                bonusUL.prepend(this.buildExpLi(WE));
            }

            this.observeOn();
        },

        // Get item by ID from weapon experience array
        getItemByItemID(data, itemID) {
            if (!data) return null;
            return data.find(item => item.itemID == itemID);
        },

        isExcludedWeaponName(name) {
            return excludedWeaponNames.has((name || '').toLowerCase().trim());
        },

        // Build an <li> element to display the WE percentage
        buildExpLi(WE) {
            const newLi = document.createElement('li');
            newLi.className = 'left we';
            const weSpan = document.createElement('span');
            weSpan.innerHTML = WE + '%';
            newLi.appendChild(weSpan);
            return newLi;
        },

        // Get the current page name
        getPageName() {
            const pageSpan = document.querySelector(pageSpanSelector);
            if (!pageSpan) return '';
            const name = pageSpan.innerText;
            return name;
        },

        // Open weapons overview window
        async openWeaponsOverview() {
            console.log('[Sidekick] Opening weapons overview window...');

            // Fetch full data if not cached
            if (!cachedFullData) {
                const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                if (!apiKey) {
                    alert('API key not found. Please configure in settings.');
                    return;
                }

                try {
                    // Fetch user data and torn items in parallel
                    const [userResponse, itemsResponse] = await Promise.all([
                        fetch(`https://api.torn.com/user/?selections=weaponexp,personalstats,inventory&key=${apiKey}`),
                        fetch(`https://api.torn.com/torn/?selections=items&key=${apiKey}`)
                    ]);

                    const userData = await userResponse.json();
                    const itemsData = await itemsResponse.json();

                    if (userData.error) {
                        alert('API Error: ' + userData.error.error);
                        return;
                    }

                    if (itemsData.error) {
                        alert('API Error fetching items: ' + itemsData.error.error);
                        return;
                    }

                    // Combine data
                    cachedFullData = {
                        ...userData,
                        tornItems: itemsData.items
                    };

                    console.log('[Sidekick] Fetched data:', {
                        weapons: userData.weaponexp?.length,
                        items: Object.keys(itemsData.items || {}).length
                    });
                } catch (error) {
                    console.error('[Sidekick] Failed to fetch overview data:', error);
                    alert('Failed to fetch weapon data');
                    return;
                }
            }

            const html = this.createWeaponsOverviewHTML(cachedFullData);

            // Open in new window or update existing
            if (overviewWindow && !overviewWindow.closed) {
                overviewWindow.document.body.innerHTML = html;
                overviewWindow.focus();
            } else {
                overviewWindow = window.open('', 'Weapon Overview', 'width=900,height=800,resizable=yes,scrollbars=yes');
                if (overviewWindow) {
                    overviewWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>Weapon Experience & Finishing Hits</title>
                            ${this.getOverviewStyles()}
                        </head>
                        <body>
                            ${html}
                        </body>
                        </html>
                    `);
                    overviewWindow.document.close();
                }
            }
        },

        // Create HTML for weapons overview
        createWeaponsOverviewHTML(data) {
            const weArray = data.weaponexp || [];
            const fhStats = data.personalstats || {};
            const inventory = data.inventory || [];
            const tornItems = data.tornItems || {};

            // Calculate stats
            let weAt100pct = weArray.filter(w => w.exp === 100).length;
            let rfPct = Math.round((fhStats.roundsfired / 1000000) * 100);
            let dmgPct = Math.round((fhStats.attackdamage / 100000000) * 100);
            let fhRemains = this.calcRemainingFinishingHits(fhStats);

            // Build tables
            const fhTable = this.buildFinishingHitsTable(fhStats, fhRemains);
            const weTable = this.buildWeaponExpTable(weArray, inventory, tornItems);
            const zeroWeaponsTable = this.buildZeroWeaponsTable(weArray, tornItems);

            return `
                <div class="container">
                    <h2 class="title">Weapon Experience and Finishing Hits</h2>
                    <div class="stats">
                        ${weAt100pct} weapons at 100% | 
                        Rounds: ${this.numberWithCommas(fhStats.roundsfired || 0)}/1,000,000 (${rfPct}%) | 
                        Damage: ${this.numberWithCommas(fhStats.attackdamage || 0)}/100,000,000 (${dmgPct}%)
                    </div>
                    
                    <h3 class="section-title">Finishing Hits: ${fhRemains} remain (~${this.numberWithCommas(fhRemains * 25)}e)</h3>
                    ${fhTable}
                    
                    <h3 class="section-title">Weapon Experience</h3>
                    ${weTable}
                    
                    <h3 class="section-title">Weapons at 0% (Not Yet Trained)</h3>
                    ${zeroWeaponsTable}
                </div>
            `;
        },

        // Build finishing hits table
        buildFinishingHitsTable(stats, remainingTotal) {
            const categories = [
                { name: 'Machine Guns', key: 'machits' },
                { name: 'Rifles', key: 'rifhits' },
                { name: 'Piercing', key: 'piehits' },
                { name: 'Clubbing', key: 'axehits' },
                { name: 'Sub Machine Guns', key: 'smghits' },
                { name: 'Pistols', key: 'pishits' },
                { name: 'Mechanical', key: 'chahits' },
                { name: 'Temporary', key: 'grehits' },
                { name: 'Heavy Artillery', key: 'heahits' },
                { name: 'Shotguns', key: 'shohits' },
                { name: 'Slashing', key: 'slahits' },
                { name: 'Hand to Hand', key: 'h2hhits' }
            ];

            let rows = '';
            for (let i = 0; i < categories.length; i += 4) {
                rows += '<tr>';
                for (let j = 0; j < 4 && i + j < categories.length; j++) {
                    const cat = categories[i + j];
                    const count = stats[cat.key] || 0;
                    const colorClass = count >= 1000 ? 'green' : count >= 750 ? 'orange' : 'red';
                    rows += `<td class="${colorClass}"><span class="left">${cat.name}</span><span class="right">${this.numberWithCommas(count)}</span></td>`;
                }
                rows += '</tr>';
            }

            return `<table class="fh-table">${rows}</table>`;
        },

        // Build weapon experience table
        buildWeaponExpTable(weArray, inventory, tornItems) {
            // Convert inventory object to array
            const inventoryArray = Object.values(inventory || {});

            console.log('[Sidekick] Building weapon exp table:', {
                weaponCount: weArray.length,
                inventoryCount: inventoryArray.length,
                tornItemsCount: Object.keys(tornItems || {}).length
            });

            // Sort weapons by type
            const primary = [];
            const secondary = [];
            const melee = [];
            const temporary = [];

            weArray.forEach(weapon => {
                if (this.isExcludedWeaponName(weapon.name)) {
                    return;
                }

                const invItem = inventoryArray.find(i => i.ID == weapon.itemID);
                const tornItem = tornItems?.[weapon.itemID];
                const type = tornItem?.type || 'Unknown';
                const obj = { ...weapon, equipped: invItem?.equipped || false };

                console.log('[Sidekick] Weapon:', weapon.name, 'Type:', type, 'ItemID:', weapon.itemID);

                if (type === 'Primary') primary.push(obj);
                else if (type === 'Secondary') secondary.push(obj);
                else if (type === 'Melee') melee.push(obj);
                else if (type === 'Temporary') temporary.push(obj);
                else {
                    console.warn('[Sidekick] Unknown weapon type:', type, 'for', weapon.name);
                }
            });

            console.log('[Sidekick] Categorized weapons:', {
                primary: primary.length,
                secondary: secondary.length,
                melee: melee.length,
                temporary: temporary.length
            });

            const maxRows = Math.max(primary.length, secondary.length, melee.length, temporary.length);
            let rows = '';

            for (let i = 0; i < maxRows; i++) {
                rows += '<tr>';
                [primary, secondary, melee, temporary].forEach(arr => {
                    if (arr[i]) {
                        const w = arr[i];
                        const colorClass = w.equipped ? 'yellow' : w.exp === 100 ? 'green' : w.exp >= 50 ? 'orange' : 'red';
                        rows += `<td class="${colorClass}"><span class="left">${w.name}</span><span class="right">${w.exp}%</span></td>`;
                    } else {
                        rows += '<td></td>';
                    }
                });
                rows += '</tr>';
            }

            return `
                <table class="we-table">
                    <thead>
                        <tr>
                            <th>Primary</th>
                            <th>Secondary</th>
                            <th>Melee</th>
                            <th>Temporary</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            `;
        },

        // Build table for weapons at 0% (not in weaponexp response)
        buildZeroWeaponsTable(weArray, tornItems) {
            // Get IDs of weapons with experience
            const trainedWeaponIds = new Set(weArray.map(w => w.itemID));

            // Filter tornItems to find weapons not in weaponexp
            const zeroWeapons = {
                primary: [],
                secondary: [],
                melee: [],
                temporary: []
            };

            Object.entries(tornItems || {}).forEach(([itemId, item]) => {
                // Skip if this weapon has experience
                if (trainedWeaponIds.has(parseInt(itemId))) return;
                if (this.isExcludedWeaponName(item.name)) return;

                // Only include weapons (not armor, drugs, etc)
                const type = item.type;
                if (type === 'Primary') {
                    zeroWeapons.primary.push({ name: item.name, id: itemId });
                } else if (type === 'Secondary') {
                    zeroWeapons.secondary.push({ name: item.name, id: itemId });
                } else if (type === 'Melee') {
                    zeroWeapons.melee.push({ name: item.name, id: itemId });
                } else if (type === 'Temporary') {
                    zeroWeapons.temporary.push({ name: item.name, id: itemId });
                }
            });

            // Sort alphabetically
            Object.values(zeroWeapons).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));

            console.log('[Sidekick] 0% weapons:', {
                primary: zeroWeapons.primary.length,
                secondary: zeroWeapons.secondary.length,
                melee: zeroWeapons.melee.length,
                temporary: zeroWeapons.temporary.length
            });

            const maxRows = Math.max(
                zeroWeapons.primary.length,
                zeroWeapons.secondary.length,
                zeroWeapons.melee.length,
                zeroWeapons.temporary.length
            );

            let rows = '';
            for (let i = 0; i < maxRows; i++) {
                rows += '<tr>';
                ['primary', 'secondary', 'melee', 'temporary'].forEach(type => {
                    if (zeroWeapons[type][i]) {
                        const weapon = zeroWeapons[type][i];
                        rows += `<td class="gray"><span class="left">${weapon.name}</span><span class="right">0%</span></td>`;
                    } else {
                        rows += '<td></td>';
                    }
                });
                rows += '</tr>';
            }

            return `
                <table class="we-table">
                    <thead>
                        <tr>
                            <th>Primary</th>
                            <th>Secondary</th>
                            <th>Melee</th>
                            <th>Temporary</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            `;
        },

        // Calculate remaining finishing hits
        calcRemainingFinishingHits(stats) {
            const keys = ['machits', 'rifhits', 'piehits', 'axehits', 'smghits', 'pishits',
                'chahits', 'grehits', 'heahits', 'shohits', 'slahits', 'h2hhits'];
            return keys.reduce((total, key) => {
                const count = stats[key] || 0;
                return total + (count >= 1000 ? 0 : 1000 - count);
            }, 0);
        },

        // Helper: Number formatting
        numberWithCommas(x) {
            return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        },

        // Styles for overview window
        getOverviewStyles() {
            return `
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background: #1a1a1a;
                        color: #fff;
                        margin: 0;
                        padding: 20px;
                    }
                    .container {
                        max-width: 900px;
                        margin: 0 auto;
                    }
                    .title {
                        text-align: center;
                        background: linear-gradient(135deg, #66BB6A, #ffad5a);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        font-size: 24px;
                        margin-bottom: 10px;
                    }
                    .stats {
                        text-align: center;
                        color: #aaa;
                        margin-bottom: 30px;
                        font-size: 14px;
                    }
                    .section-title {
                        color: #66BB6A;
                        border-bottom: 2px solid #66BB6A;
                        padding-bottom: 8px;
                        margin-top: 30px;
                        margin-bottom: 15px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 20px;
                    }
                    th, td {
                        border: 1px solid #555;
                        padding: 10px;
                        text-align: center;
                    }
                    th {
                        background: #2a2a2a;
                        color: #66BB6A;
                        font-weight: bold;
                    }
                    td {
                        background: #242424;
                    }
                    .left {
                        float: left;
                    }
                    .right {
                        float: right;
                    }
                    .green {
                        color: #4CAF50;
                    }
                    .orange {
                        color: #FF9800;
                    }
                    .red {
                        color: #f44336;
                    }
                    .yellow {
                        color: #FFEB3B;
                    }
                    .gray {
                        color: #888;
                    }
                </style>
            `;
        },

        // Observer helpers
        observeOff() {
            if (observing && pageObserver) {
                pageObserver.disconnect();
                observing = false;
            }
        },

        observeOn() {
            if (pageObserver && pageDiv) {
                pageObserver.observe(pageDiv, observerConfig);
                observing = true;
            }
        },

        async destroy() {
            this.observeOff();
            weArray = null;
            cachedFullData = null;
            if (overviewWindow && !overviewWindow.closed) {
                overviewWindow.close();
            }
            pageName = '';
            pageDiv = null;
            pageObserver = null;
            console.log('[Sidekick] Weapon Experience Tracker destroyed');
        }
    };
})();

// Register module
if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.WeaponExpTracker = WeaponExpModule;

// Export for use in main.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WeaponExpModule;
}
