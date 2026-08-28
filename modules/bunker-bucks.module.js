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
        scanTimer: null,
        _settings: null, // Assigned in init() once Core is ready

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
                // Initialise shared settings helper
                this._settings = window.SidekickModules.Core.ModuleSettingsHelper('bunker-bucks', true);
                this.isEnabled = await this._settings.load();

                if (this.isEnabled) {
                    await this.enable();
                }

                this.isInitialized = true;
                console.log("✅ Bunker Bucks Calculator initialized successfully");
            } catch (error) {
                console.error("❌ Bunker Bucks Calculator initialization failed:", error);
            }
        },

        // Enable the module
        async enable() {
            console.log("💰 Enabling Bunker Bucks Calculator...");
            this.isEnabled = true;
            if (this._settings) await this._settings.save(true);

            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }

            this.startObserver();

            this.processExistingPopups();


        },

        // Item details use different hashed wrappers in the Item Market,
        // Auction House, and Inventory. Watch the page, then identify the
        // shared information fields by their labels instead of wrapper names.
        startObserver() {
            if (this.observer) return;

            this.observer = new MutationObserver(() => this.queueScan());

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        },

        // Disable the module
        async disable() {
            console.log("💰 Disabling Bunker Bucks Calculator...");
            this.isEnabled = false;
            if (this._settings) await this._settings.save(false);

            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
            clearTimeout(this.scanTimer);
            this.scanTimer = null;
            document.querySelectorAll('.sidekick-bb-value, .sidekick-bb-auction').forEach(el => el.remove());
            document.querySelectorAll('[data-sidekick-bb-original-height]').forEach(element => {
                element.style.height = element.dataset.sidekickBbOriginalHeight;
                delete element.dataset.sidekickBbOriginalHeight;
            });
        },

        // Get item name from the popup
        getItemName(itemInfo) {
            const text = (itemInfo?.textContent || '').replace(/\s+/g, ' ').trim();
            const sentence = text.match(/\bThe\s+(.+?)\s+is\s+(?:an?\s+)?[^.]{0,100}\b(?:Weapon|Armou?r)\b/i);
            if (sentence?.[1]) return sentence[1].trim();
            const firstSentence = text.match(/\bThe\s+(.+?)\s+is\s+(?:an?\s+)?[^.]{1,160}\./i);
            if (firstSentence?.[1]) return firstSentence[1].trim();

            const descriptionElement = itemInfo?.querySelector('[class*="description" i]');
            const boldElement = descriptionElement?.querySelector('.bold, b, strong');
            if (boldElement) return boldElement.textContent.trim();

            const heading = itemInfo?.querySelector('h1, h2, h3, [class*="itemName" i], [class*="item-name" i]');
            if (heading) return heading.textContent.trim();
            return '';
        },

        // Extract weapon type from item name
        getWeaponType(itemName, itemInfo = null) {
            const name = (itemName || '').trim();

            // Check hardcoded weapon lists first
            if (name) {
                for (const [category, weapons] of Object.entries(this.weaponLists)) {
                    if (weapons.includes(name) || weapons.some(weapon => name.includes(weapon) || weapon.includes(name))) {
                        return category;
                    }
                }
            }

            // Fallback text-based detection
            const text = `${itemName || ''} ${itemInfo?.textContent || ''}`.toLowerCase();
            if (/\b(armor|armour)\b/.test(text)) return 'Armour';
            if (text.includes('pistol') || text.includes('smg') || text.includes('uzi') || text.includes('glock') || text.includes('beretta')) return 'Pistol / SMG';
            if (text.includes('shotgun') || text.includes('rifle') || text.includes('ak-') || text.includes('m4')) return 'Shotgun/rifle';
            if (text.includes('vest') || text.includes('helmet') || text.includes('boots') || text.includes('gloves')) return 'Armour';
            if (text.includes('heavy') || text.includes('minigun') || text.includes('flamethrower')) return 'Heavies';
            if (text.includes('melee') || text.includes('knife') || text.includes('sword') || text.includes('bat')) return 'Melee';
            return null;
        },

        // Extract rarity from quality section
        getRarity(itemInfo) {
            const textMatch = (itemInfo?.textContent || '').match(/Quality:\s*[\d.,]+%\s*(Yellow|Orange|Red)\b/i);
            if (textMatch) return textMatch[1][0].toUpperCase() + textMatch[1].slice(1).toLowerCase();

            let qualityElement = itemInfo?.querySelector('[class*="rarity" i]');

            if (qualityElement) {
                if (qualityElement.className.includes('yellow')) return 'Yellow';
                if (qualityElement.className.includes('red')) return 'Red';
                if (qualityElement.className.includes('orange')) return 'Orange';
            }
            return null;
        },

        // Count bonuses
        countBonuses(itemInfo) {
            const labels = Array.from(itemInfo?.querySelectorAll('span, dt, th, div') || [])
                .filter(element => this.getDirectText(element).toLowerCase() === 'bonus:');
            return Math.max(labels.length, ((itemInfo?.textContent || '').match(/\bBonus:/gi) || []).length);
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

        getDirectText(element) {
            return Array.from(element?.childNodes || [])
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
        },

        queueScan() {
            clearTimeout(this.scanTimer);
            this.scanTimer = setTimeout(() => this.processExistingPopups(), 120);
        },

        findDetailsRoot(qualityLabel) {
            let current = qualityLabel;
            let fallback = null;
            while (current && current !== document.body) {
                const text = (current.textContent || '').replace(/\s+/g, ' ');
                if (/\bQuality\b/i.test(text) && /\b(?:Bonus|Damage|Armor|Armour|Defense|Defence)\b/i.test(text)) {
                    if (!fallback) fallback = current;
                    if (/\bThe\s+.+?\s+is\s+(?:an?\s+)?[^.]{1,160}\./i.test(text)) return current;
                }
                current = current.parentElement;
            }
            return fallback;
        },

        findFieldLabel(root, fieldName) {
            const matcher = new RegExp(`^${fieldName}\\s*:?$`, 'i');
            return Array.from(root?.querySelectorAll('span, div, dt, th, b, strong') || [])
                .find(element => matcher.test(this.getDirectText(element))) || null;
        },

        findPropertyCell(label) {
            const listItem = label.closest('li, tr, td');
            if (listItem) return listItem;
            let current = label.parentElement;
            while (current?.parentElement && current.parentElement !== document.body) {
                const text = (current.textContent || '').replace(/\s+/g, ' ').trim();
                if (/^Quality:/i.test(text) && text.length < 120) return current;
                current = current.parentElement;
            }
            return label.parentElement;
        },

        injectValue(detailsRoot, qualityLabel, bunkerBucks) {
            if (detailsRoot.querySelector('.sidekick-bb-value')) return true;
            const qualityCell = this.findPropertyCell(qualityLabel);
            const host = qualityCell?.parentElement;
            if (!qualityCell || !host) return false;

            const cell = qualityCell.cloneNode(true);
            cell.classList.add('sidekick-bb-value');
            cell.removeAttribute('id');
            cell.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));

            const elements = [cell, ...cell.querySelectorAll('*')];
            const label = elements.find(element => /^Quality\s*:?$/i.test(this.getDirectText(element)));
            if (label) {
                const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE && /Quality:/i.test(node.textContent));
                if (textNode) textNode.textContent = textNode.textContent.replace(/Quality\s*:?/i, 'Bunker Bucks:');
            }

            const value = elements.find(element => {
                const direct = this.getDirectText(element);
                return /(?:Yellow|Orange|Red)/i.test(direct) || /\d[\d.,]*%/.test(direct);
            });
            if (value) {
                value.textContent = `${this.formatNumber(bunkerBucks)} BB`;
            } else {
                const fallback = document.createElement('span');
                fallback.textContent = `${this.formatNumber(bunkerBucks)} BB`;
                cell.appendChild(fallback);
            }
            cell.title = 'Ranked War item value in Bunker Bucks';
            cell.style.setProperty('color', '#f0c040');
            cell.querySelectorAll('span, div').forEach(element => {
                if (/Bunker Bucks|\bBB\b/i.test(element.textContent || '')) {
                    element.style.setProperty('color', '#f0c040', 'important');
                }
            });
            host.appendChild(cell);
            const fixedHeight = parseFloat(detailsRoot.style.height || '');
            if (Number.isFinite(fixedHeight) && fixedHeight > 0 && detailsRoot.dataset.sidekickBbOriginalHeight === undefined) {
                detailsRoot.dataset.sidekickBbOriginalHeight = detailsRoot.style.height;
                detailsRoot.style.height = `${fixedHeight + 34}px`;
            }
            return true;
        },

        processQualityLabel(qualityLabel) {
            if (!this.isEnabled || !qualityLabel?.isConnected) return;
            const detailsRoot = this.findDetailsRoot(qualityLabel);
            if (!detailsRoot || detailsRoot.querySelector('.sidekick-bb-value')) return;

            const itemName = this.getItemName(detailsRoot);
            const weaponType = this.getWeaponType(itemName, detailsRoot);
            const rarity = this.getRarity(detailsRoot);
            const bonusCount = this.countBonuses(detailsRoot);
            if (!weaponType || !rarity) return;

            const bunkerBucks = this.calculateBunkerBucks(rarity, weaponType, bonusCount);
            if (bunkerBucks == null) return;
            this.injectValue(detailsRoot, qualityLabel, bunkerBucks);
        },

        processPropertiesList(propertiesList) {
            if (!propertiesList || propertiesList.querySelector('.sidekick-bb-value')) return;
            const qualityLabel = this.findFieldLabel(propertiesList, 'Quality');
            if (qualityLabel) this.processQualityLabel(qualityLabel);
        },

        // Process all currently open item-information panels.
        processExistingPopups() {
            if (!this.isEnabled) return;
            document.querySelectorAll('ul[class*="properties" i]').forEach(list => this.processPropertiesList(list));
            const elements = Array.from(document.querySelectorAll('span, dt, th, div'));
            elements
                .filter(element => /^Quality\s*:?$/i.test(this.getDirectText(element)))
                .forEach(element => this.processQualityLabel(element));
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
