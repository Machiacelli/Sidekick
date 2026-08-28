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
        storageListenerRegistered: false,
        _settings: null, // Assigned in init() once Core is ready
        lastDiagnosticSignature: '',
        successfulItems: new Set(),

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
                this._settings = window.SidekickModules.Core.ModuleSettingsHelper('bunker-bucks', false);
                this.isEnabled = await this._settings.load();
                this.registerStorageListener();

                if (this.isEnabled) {
                    await this.enable();
                }

                this.isInitialized = true;
                console.log("✅ Bunker Bucks Calculator initialized successfully");
            } catch (error) {
                console.error("❌ Bunker Bucks Calculator initialization failed:", error);
            }
        },

        registerStorageListener() {
            if (this.storageListenerRegistered) return;
            this.storageListenerRegistered = true;
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName !== 'local' || !changes.sidekick_settings) return;
                const enabled = changes.sidekick_settings.newValue?.['bunker-bucks']?.isEnabled === true;
                if (enabled === this.isEnabled) return;
                if (enabled) this.enable();
                else this.disable();
            });
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
                subtree: true,
                characterData: true
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
            const sentence = text.match(/\bThe\s+(.+?)\s+(?:is|are)\s+(?:an?\s+)?[^.]{0,100}\b(?:Weapon|Armou?r)\b/i);
            if (sentence?.[1]) return sentence[1].trim();
            const firstSentence = text.match(/\bThe\s+(.+?)\s+(?:is|are)\s+(?:an?\s+)?[^.]{1,160}\./i);
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
            const textMatch = (itemInfo?.textContent || '').match(/Quality\s*:?[^\n]{0,100}?\b(Yellow|Orange|Red)\b/i);
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
                const text = (current.textContent || '').replace(/\s+/g, ' ').trim();
                if (/\bQuality\s*:/i.test(text)) {
                    const itemName = this.getItemName(current);
                    const rarity = this.getRarity(current);
                    const weaponType = this.getWeaponType(itemName, current);
                    if (itemName && rarity && weaponType) return current;
                    if (!fallback && /\bThe\s+.+?\s+(?:is|are)\s+(?:an?\s+)?[^.]{1,180}\./i.test(text)) {
                        fallback = current;
                    }
                }
                current = current.parentElement;
            }
            return fallback;
        },

        findDetailsRootFromDescription(descriptionElement) {
            let current = descriptionElement;
            let fallback = null;
            while (current && current !== document.body) {
                const text = (current.textContent || '').replace(/\s+/g, ' ').trim();
                if (/\bQuality\s*:/i.test(text)) {
                    if (!fallback) fallback = current;
                    const itemName = this.getItemName(current);
                    const rarity = this.getRarity(current);
                    const weaponType = this.getWeaponType(itemName, current);
                    if (itemName && rarity && weaponType) return current;
                }
                current = current.parentElement;
            }
            return fallback;
        },

        findDescriptionTargets(root = document) {
            const scope = root === document ? (document.body || document.documentElement) : root;
            if (!scope) return [];

            const targets = new Set();
            const descriptionPattern = /\bThe\s+.+?\s+(?:is|are)\s+(?:an?\s+)?[^.]{0,180}\b(?:Weapon|Armou?r)\b/i;

            scope.querySelectorAll?.('[class*="description" i], p').forEach(element => {
                const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
                if (descriptionPattern.test(text) && text.length <= 700) targets.add(element);
            });

            const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
            let textNode;
            while ((textNode = walker.nextNode())) {
                if (descriptionPattern.test((textNode.textContent || '').replace(/\s+/g, ' ')) && textNode.parentElement) {
                    targets.add(textNode.parentElement);
                }
            }
            return [...targets];
        },

        findDescriptionElement(detailsRoot, itemName) {
            if (!detailsRoot || !itemName) return null;
            const escapedName = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`\\bThe\\s+${escapedName}\\s+(?:is|are)\\b`, 'i');
            const candidates = Array.from(detailsRoot.querySelectorAll('[class*="description" i], p, div, span'))
                .filter(element => {
                    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
                    return text.length <= 700 && pattern.test(text);
                })
                .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
            return candidates[0] || null;
        },

        findFieldLabel(root, fieldName) {
            const matcher = new RegExp(`^${fieldName}\\s*:?$`, 'i');
            return Array.from(root?.querySelectorAll('span, div, dt, th, b, strong') || [])
                .find(element => matcher.test(this.getDirectText(element))) || null;
        },

        findPropertyCell(label) {
            let current = label;
            let smallestMatch = null;
            while (current && current !== document.body) {
                const text = (current.textContent || '').replace(/\s+/g, ' ').trim();
                const containsQuality = /\bQuality\s*:/i.test(text);
                const containsValue = /[\d.,]+\s*%|\b(?:Yellow|Orange|Red)\b/i.test(text);
                if (containsQuality && containsValue && text.length <= 240) {
                    smallestMatch = current;
                    break;
                }

                // Torn's React item preview uses a generated property wrapper.
                // The stable class stem survives hash changes between releases.
                if (containsQuality && /property/i.test(String(current.className || '')) && text.length <= 320) {
                    smallestMatch = current;
                    break;
                }
                current = current.parentElement;
            }
            return smallestMatch || label.parentElement;
        },

        isQualityField(element) {
            if (!element || element.classList?.contains('sidekick-bb-value')) return false;
            const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
            if (!/\bQuality\s*:/i.test(text) || text.length > 240) return false;

            // Prefer the smallest field wrapper so a whole details grid is
            // never cloned when Torn changes its generated class names.
            return !Array.from(element.children || []).some(child => {
                const childText = (child.textContent || '').replace(/\s+/g, ' ').trim();
                return /\bQuality\s*:/i.test(childText) && childText.length <= text.length;
            });
        },

        findQualityFields(root = document) {
            return Array.from(root.querySelectorAll('li, tr, td, dt, th, span, div, p'))
                .filter(element => this.isQualityField(element));
        },

        findQualityTargets(root = document) {
            const scope = root === document ? (document.body || document.documentElement) : root;
            if (!scope) return [];

            const targets = new Set(this.findQualityFields(root));
            const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
            let textNode;
            while ((textNode = walker.nextNode())) {
                if (/\bQuality\s*:/i.test(textNode.textContent || '') && textNode.parentElement) {
                    targets.add(textNode.parentElement);
                }
            }

            // Compatibility with the working userscript: generated hashes vary,
            // but Torn has retained the semantic `rarity` class stem.
            scope.querySelectorAll?.('[class*="rarity" i]').forEach(rarityElement => {
                let current = rarityElement;
                for (let depth = 0; current && current !== scope.parentElement && depth < 6; depth++) {
                    if (/\bQuality\s*:/i.test(current.textContent || '')) {
                        targets.add(current);
                        break;
                    }
                    current = current.parentElement;
                }
            });

            return [...targets];
        },

        injectValue(detailsRoot, qualityLabel, bunkerBucks, itemName) {
            if (detailsRoot.querySelector('.sidekick-bb-value')) return true;
            const value = document.createElement('span');
            value.className = 'sidekick-bb-value';
            value.textContent = `Bunker Bucks: ${this.formatNumber(bunkerBucks)} BB`;
            value.title = 'Ranked War item value in Bunker Bucks';
            value.dataset.sidekickBbItem = itemName || '';
            value.style.setProperty('display', 'inline-flex', 'important');
            value.style.setProperty('align-items', 'center', 'important');
            value.style.setProperty('width', 'max-content', 'important');
            value.style.setProperty('margin', '5px 0 5px 8px', 'important');
            value.style.setProperty('padding', '2px 7px', 'important');
            value.style.setProperty('border', '1px solid rgba(240, 192, 64, .65)', 'important');
            value.style.setProperty('border-radius', '4px', 'important');
            value.style.setProperty('background', 'rgba(72, 57, 14, .82)', 'important');
            value.style.setProperty('color', '#f0c040', 'important');
            value.style.setProperty('font-size', '12px', 'important');
            value.style.setProperty('font-weight', '700', 'important');
            value.style.setProperty('line-height', '18px', 'important');
            value.style.setProperty('white-space', 'nowrap', 'important');
            value.style.setProperty('position', 'relative', 'important');
            value.style.setProperty('z-index', '4', 'important');

            // The description exists on Item Market, Auction House, and
            // Inventory details and is not constrained by Torn's property grid.
            const description = this.findDescriptionElement(detailsRoot, itemName);
            if (description?.parentElement && description !== detailsRoot) {
                description.insertAdjacentElement('afterend', value);
                return true;
            }

            // Exact compatibility fallback for the working userscript and
            // current Torn React preview: put the badge in the Quality value.
            const qualityCell = qualityLabel ? this.findPropertyCell(qualityLabel) : null;
            if (!qualityCell) return false;
            const generatedValueWrapper = qualityCell.querySelector?.('[class*="valueWrapper" i]');
            (generatedValueWrapper || qualityCell).appendChild(value);
            return true;
        },

        processDetailsRoot(detailsRoot, qualityLabel = null) {
            if (!this.isEnabled || !detailsRoot || detailsRoot.querySelector('.sidekick-bb-value')) return false;

            const itemName = this.getItemName(detailsRoot);
            const weaponType = this.getWeaponType(itemName, detailsRoot);
            const rarity = this.getRarity(detailsRoot);
            const bonusCount = this.countBonuses(detailsRoot);
            if (!itemName || !weaponType || !rarity) return false;

            const bunkerBucks = this.calculateBunkerBucks(rarity, weaponType, bonusCount);
            if (bunkerBucks == null) return false;
            const injected = this.injectValue(detailsRoot, qualityLabel, bunkerBucks, itemName);
            if (injected) {
                const signature = `${itemName}|${rarity}|${weaponType}|${bunkerBucks}`;
                if (!this.successfulItems.has(signature)) {
                    this.successfulItems.add(signature);
                    console.info(`[BunkerBucks] Added ${bunkerBucks} BB for ${itemName} (${rarity} ${weaponType})`);
                }
            }
            return injected;
        },

        processQualityLabel(qualityLabel) {
            if (!this.isEnabled || !qualityLabel?.isConnected) return false;
            const detailsRoot = this.findDetailsRoot(qualityLabel);
            return this.processDetailsRoot(detailsRoot, qualityLabel);
        },

        processPropertiesList(propertiesList) {
            if (!propertiesList || propertiesList.querySelector('.sidekick-bb-value')) return;
            const qualityLabel = this.findFieldLabel(propertiesList, 'Quality');
            if (qualityLabel) {
                this.processQualityLabel(qualityLabel);
                return;
            }
            this.findQualityTargets(propertiesList).forEach(field => this.processQualityLabel(field));
        },

        // Process all currently open item-information panels.
        processExistingPopups() {
            if (!this.isEnabled) return;
            document.querySelectorAll('ul[class*="properties" i]').forEach(list => this.processPropertiesList(list));
            let injected = false;
            this.findDescriptionTargets(document).forEach(description => {
                const root = this.findDetailsRootFromDescription(description);
                injected = this.processDetailsRoot(root) || injected;
            });
            const targets = this.findQualityTargets(document);
            targets.forEach(element => { injected = this.processQualityLabel(element) || injected; });

            if (!injected && targets.length > 0 && !document.querySelector('.sidekick-bb-value')) {
                const sample = targets[0];
                const root = this.findDetailsRoot(sample);
                const diagnostic = {
                    targets: targets.length,
                    itemName: this.getItemName(root),
                    rarity: this.getRarity(root),
                    weaponType: this.getWeaponType(this.getItemName(root), root),
                    detailClass: String(root?.className || '')
                };
                const signature = JSON.stringify(diagnostic);
                if (signature !== this.lastDiagnosticSignature) {
                    this.lastDiagnosticSignature = signature;
                    console.warn('[BunkerBucks] Ranked item details found but no value was inserted:', diagnostic);
                }
            }
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
