/**
 * Sidekick Chrome Extension - Bunker Bucks Calculator Module
 * Adds bunker bucks calculation to item previews on the Item Market
 * Version: 1.0.0
 */

(function () {
    'use strict';

    console.log("💰 Loading Sidekick Bunker Bucks Calculator Module...");

    const BunkerBucksModule = {
        isInitialized: false,
        isEnabled: false,
        observer: null,

        // Bunker Buck values
        bunkerBuckTable: {
            'Yellow': {
                'Pistol / SMG': 4,
                'Melee': 6,
                'Shotgun/rifle': 10,
                'Armour': 12,
                'Heavies': 14
            },
            'Orange': {
                1: { 'Pistol / SMG': 12, 'Melee': 18, 'Shotgun/rifle': 30, 'Armour': 26, 'Heavies': 42 },
                2: { 'Pistol / SMG': 18, 'Melee': 27, 'Shotgun/rifle': 45, 'Armour': 26, 'Heavies': 63 }
            },
            'Red': {
                1: { 'Pistol / SMG': 36, 'Melee': 54, 'Shotgun/rifle': 90, 'Armour': 108, 'Heavies': 126 },
                2: { 'Pistol / SMG': 54, 'Melee': 81, 'Shotgun/rifle': 135, 'Armour': 108, 'Heavies': 189 }
            }
        },

        // Hardcoded weapon lists for accurate classification
        weaponLists: {
            'Armour': [
                'EOD Boots', 'EOD Gloves', 'EOD Helmet', 'EOD Pants', 'EOD Apron',
                'Sentinel Helmet', 'Sentinel Apron', 'Sentinel Pants', 'Sentinel Gloves', 'Sentinel Boots',
                'Marauder Boots', 'Marauder Gloves', 'Marauder Pants', 'Marauder Body',
                'Delta Boots', 'Delta Gloves', 'Delta Gas Mask', 'Delta Pants', 'Delta Body',
                'Vanguard Respirator', 'Vanguard Body', 'Vanguard Pants', 'Vanguard Gloves', 'Vanguard Boots',
                'Assault Boots', 'Assault Gloves', 'Assault Helmet', 'Assault Pants', 'Assault Body',
                'Riot Boots', 'Riot Gloves', 'Riot Pants', 'Riot Body',
                'Dune Boots', 'Dune Gloves', 'Dune Helmet', 'Dune Pants', 'Dune Vest'
            ],
            'Heavies': [
                'China Lake', 'Egg Propelled Launcher', 'Flamethrower', 'Milkor MGL', '73 Neutrilux',
                'RPG Launcher', 'SMAW Launcher', 'Type 98 Anti Tank', 'Negev NG-5', 'M249 SAW',
                'Minigun', 'PKM', 'Rheinmetall MG 3', 'Stoner 96'
            ],
            'Shotgun/rifle': [
                'Benelli M1 Tactical', 'Benelli M4 Super', 'Blunderbuss', 'Homemade Pocket Shotgun',
                'Ithaca 37', 'Jackhammer', 'Mag 7', 'Nock Gun', 'Sawed-Off Shotgun',
                'AK-47', 'ArmaLite M-15A4', 'Enfield SA-80', 'Heckler & Koch SL8', 'M16 A2 Rifle',
                'M4A1 Colt Carbine', 'SIG 550', 'SIG 552', 'Steyr AUG', 'Tavor TAR-21',
                'Vektor CR-21', 'XM8 Rifle', 'SKS Carbine'
            ],
            'Melee': [
                'Axe', 'Baseball Bat', 'Bo Staff', 'Bread Knife', 'Butterfly Knife', 'Chain Whip',
                'Chainsaw', 'Claymore Sword', 'Cleaver', 'Cricket Bat', 'Crowbar', 'Dagger',
                'Diamond Bladed Knife', 'Fine Chisel', 'Flail', 'Frying Pan', 'Golf Club',
                'Guandao', 'Hammer', 'Ice Pick', 'Kama', 'Katana', 'Kitchen Knife',
                'Knuckle Dusters', 'Kodachi', 'Lead Pipe', 'Leather Bullwhip', 'Macana',
                'Metal Nunchakus', 'Naval Cutlass', 'Ninja Claws', 'Pen Knife', 'Poison Umbrella',
                'Riding Crop', 'Sai', 'Samurai Sword', 'Scalpel', 'Scimitar', 'Sledgehammer',
                'Spear', 'Swiss Army Knife', 'Wooden Nunchaku', 'Yasukuni Sword'
            ],
            'Pistol / SMG': [
                'Beretta 92FS', 'Beretta M9', 'Beretta Pico', 'Desert Eagle', 'Fiveseven',
                'Glock 17', 'Luger', 'Magnum', 'Qsz-92', 'Raven MP25', 'Ruger 57',
                'S&W M29', 'S&W Revolver', 'Springfield 1911', 'Taurus', 'USP 9mm',
                'Uzi', 'AK74U', 'BT MP9', 'MP5 Navy', 'MP5k', 'P90', 'Skorpion', 'TMP', 'Thompson', 'MP 40'
            ]
        },

        // Initialize the module
        async init() {
            if (this.isInitialized) {
                console.log("💰 Bunker Bucks Calculator already initialized");
                return;
            }

            console.log("💰 Initializing Bunker Bucks Calculator...");

            try {
                // Check if module is enabled
                this.isEnabled = await this.loadSettings();

                if (this.isEnabled) {
                    await this.enable();
                }

                this.isInitialized = true;
                console.log("✅ Bunker Bucks Calculator initialized successfully");
            } catch (error) {
                console.error("❌ Bunker Bucks Calculator initialization failed:", error);
            }
        },

        // Load settings from storage
        async loadSettings() {
            try {
                if (window.SidekickModules?.Core?.ChromeStorage?.get) {
                    const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                    if (settings && settings['bunker-bucks']) {
                        return settings['bunker-bucks'].isEnabled !== false;
                    }
                }
                return true; // Default enabled
            } catch (error) {
                console.warn("⚠️ Failed to load Bunker Bucks settings:", error);
                return true;
            }
        },

        // Save settings to storage
        async saveSettings(enabled) {
            try {
                if (window.SidekickModules?.Core?.ChromeStorage?.get) {
                    const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
                    if (!settings['bunker-bucks']) {
                        settings['bunker-bucks'] = {};
                    }
                    settings['bunker-bucks'].isEnabled = enabled;
                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', settings);
                }
                this.isEnabled = enabled;
            } catch (error) {
                console.error("❌ Failed to save Bunker Bucks settings:", error);
            }
        },

        // Enable the module
        async enable() {
            console.log("💰 Enabling Bunker Bucks Calculator...");
            this.isEnabled = true;
            await this.saveSettings(true);

            // Start observing for item popups
            this.startObserver();

            // Process any existing popups
            this.processExistingPopups();
        },

        // Disable the module
        async disable() {
            console.log("💰 Disabling Bunker Bucks Calculator...");
            this.isEnabled = false;
            await this.saveSettings(false);

            // Stop observer
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        },

        // Get item name from the popup
        getItemName(itemInfo) {
            const descriptionElement = itemInfo.querySelector('.description___xJ1N5');
            if (descriptionElement) {
                const boldElement = descriptionElement.querySelector('.bold');
                if (boldElement) return boldElement.textContent.trim();
            }
            return '';
        },

        // Extract weapon type from item name
        getWeaponType(itemName) {
            if (!itemName) return null;
            const name = itemName.trim();

            // Check hardcoded weapon lists first
            for (const [category, weapons] of Object.entries(this.weaponLists)) {
                if (weapons.includes(name) || weapons.some(weapon => name.includes(weapon) || weapon.includes(name))) {
                    return category;
                }
            }

            // Fallback text-based detection
            const text = itemName.toLowerCase();
            if (text.includes('pistol') || text.includes('smg') || text.includes('uzi') || text.includes('glock') || text.includes('beretta')) return 'Pistol / SMG';
            if (text.includes('shotgun') || text.includes('rifle') || text.includes('ak-') || text.includes('m4')) return 'Shotgun/rifle';
            if (text.includes('armor') || text.includes('armour') || text.includes('vest')) return 'Armour';
            if (text.includes('heavy') || text.includes('minigun') || text.includes('flamethrower')) return 'Heavies';
            if (text.includes('melee') || text.includes('knife') || text.includes('sword') || text.includes('bat')) return 'Melee';
            return null;
        },

        // Extract rarity from quality section
        getRarity(itemInfo) {
            let qualityElement = itemInfo.querySelector('.rarity___bDCDD');
            if (!qualityElement) qualityElement = itemInfo.querySelector('[class*="rarity"]');

            if (qualityElement) {
                if (qualityElement.className.includes('yellow')) return 'Yellow';
                if (qualityElement.className.includes('red')) return 'Red';
                if (qualityElement.className.includes('orange')) return 'Orange';
            }
            return null;
        },

        // Count bonuses
        countBonuses(itemInfo) {
            let bonusCount = 0;
            itemInfo.querySelectorAll('.title___DbORn').forEach(element => {
                if (element.textContent.trim() === 'Bonus:') bonusCount++;
            });
            return bonusCount;
        },

        // Calculate bunker bucks
        calculateBunkerBucks(rarity, weaponType, bonusCount) {
            if (rarity === 'Yellow') {
                return this.bunkerBuckTable['Yellow'][weaponType] || null;
            } else if (rarity === 'Orange' || rarity === 'Red') {
                if (bonusCount === 0) return null;
                const bonusKey = bonusCount >= 2 ? 2 : 1;
                if (this.bunkerBuckTable[rarity][bonusKey] && this.bunkerBuckTable[rarity][bonusKey][weaponType]) {
                    return this.bunkerBuckTable[rarity][bonusKey][weaponType];
                }
            }
            return null;
        },

        // Format number with commas
        formatNumber(num) {
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        },

        // Add bunker bucks to item popup
        addBunkerBucks(itemInfo) {
            if (!this.isEnabled) return;
            if (itemInfo.dataset.bunkerBucksAdded) return;
            itemInfo.dataset.bunkerBucksAdded = 'true';

            const itemName = this.getItemName(itemInfo);
            const weaponType = this.getWeaponType(itemName);
            const rarity = this.getRarity(itemInfo);
            const bonusCount = this.countBonuses(itemInfo);

            if (!weaponType || !rarity) return;

            const bunkerBucks = this.calculateBunkerBucks(rarity, weaponType, bonusCount);
            if (bunkerBucks === null) return;

            const propertiesList = itemInfo.querySelector('.properties___pva_l');
            if (!propertiesList) return;

            // Expand popup height slightly to ensure visibility
            const previewWrapper = itemInfo.querySelector('.previewAndPropertiesWrapper___hqsZP');
            if (previewWrapper) {
                const currentHeight = parseInt(previewWrapper.style.height) || 203;
                previewWrapper.style.height = (currentHeight + 40) + 'px';
            }

            // Look for an empty row to populate
            const allWrappers = propertiesList.querySelectorAll('.propertyWrapper___xSOH1');
            let emptyRow = null;

            for (let wrapper of allWrappers) {
                const propertyDiv = wrapper.querySelector('.property___hqXXN');
                if (propertyDiv && propertyDiv.children.length === 0) {
                    emptyRow = wrapper;
                    break;
                }
            }

            if (emptyRow) {
                // Populate existing empty row
                const propertyDiv = emptyRow.querySelector('.property___hqXXN');
                propertyDiv.innerHTML = `
                    <span class="title___DbORn">Bunker Bucks:</span>
                    <div class="valueWrapper___vVHLn t-overflow" data-is-tooltip-opened="false">
                        <span class="t-overflow">${this.formatNumber(bunkerBucks)} BB</span>
                    </div>
                `;
            } else {
                // Fallback: create new row
                const bunkerRow = document.createElement('li');
                bunkerRow.className = 'propertyWrapper___xSOH1 property___vsfqU';
                bunkerRow.innerHTML = `
                    <div class="property___hqXXN">
                        <span class="title___DbORn">Bunker Bucks:</span>
                        <div class="valueWrapper___vVHLn t-overflow" data-is-tooltip-opened="false">
                            <span class="t-overflow">${this.formatNumber(bunkerBucks)} BB</span>
                        </div>
                    </div>
                `;
                propertiesList.appendChild(bunkerRow);
            }
        },

        // Process existing popups on page
        processExistingPopups() {
            const popups = document.querySelectorAll('.itemInfo___mNZ5j');
            popups.forEach(popup => {
                setTimeout(() => this.addBunkerBucks(popup), 100);
            });
        },

        // Start mutation observer
        startObserver() {
            if (this.observer) return;

            this.observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && node.classList) {
                            if (node.classList.contains('itemInfoWrapper___nA_eu') || node.classList.contains('itemInfo___mNZ5j')) {
                                const popup = node.classList.contains('itemInfo___mNZ5j') ? node : node.querySelector('.itemInfo___mNZ5j');
                                if (popup) {
                                    setTimeout(() => this.addBunkerBucks(popup), 100);
                                    setTimeout(() => this.addBunkerBucks(popup), 500);
                                }
                            }
                        }
                    });
                });
            });

            this.observer.observe(document.body, { childList: true, subtree: true });
        },

        // Toggle module on/off
        async toggle() {
            if (this.isEnabled) {
                await this.disable();
            } else {
                await this.enable();
            }
        }
    };

    // Export module to global namespace
    window.SidekickModules = window.SidekickModules || {};
    window.SidekickModules.BunkerBucks = BunkerBucksModule;
    console.log("✅ Bunker Bucks Calculator Module loaded and ready");

})();
