/**
 * Sidekick Chrome Extension - Bunker Bucks Calculator Module
 * Adds bunker bucks calculation to Torn's item info panels (item market,
 * auction house, bazaar, inventory).
 * Version: 1.3.4
 */

(function () {
    'use strict';

    // Pristine API references, captured at module-load time — before any
    // other module's init() runs and while the extension context is still
    // valid. Every trigger registers through these, so nothing that later
    // wraps, replaces, or breaks the DOM/timer APIs in this shared isolated
    // world can silently disable this module's triggers.
    const NATIVE = (() => {
        try {
            return {
                addEventListener: document.addEventListener.bind(document),
                removeEventListener: document.removeEventListener.bind(document),
                MutationObserver: window.MutationObserver,
                setInterval: window.setInterval.bind(window),
                clearInterval: window.clearInterval.bind(window),
                setTimeout: window.setTimeout.bind(window),
                clearTimeout: window.clearTimeout.bind(window),
                requestAnimationFrame: window.requestAnimationFrame.bind(window)
            };
        } catch (e) {
            return {
                addEventListener: (...a) => document.addEventListener(...a),
                removeEventListener: (...a) => document.removeEventListener(...a),
                MutationObserver: window.MutationObserver,
                setInterval: (...a) => window.setInterval(...a),
                clearInterval: (...a) => window.clearInterval(...a),
                setTimeout: (...a) => window.setTimeout(...a),
                clearTimeout: (...a) => window.clearTimeout(...a),
                requestAnimationFrame: (...a) => window.requestAnimationFrame(...a)
            };
        }
    })();

    // Whether this world ever had a valid extension context (content
    // scripts: true; plain page-world test fixtures: false). Distinguishes
    // a real context invalidation (extension reloaded while the tab stayed
    // open) from a world that never had chrome APIs at all.
    const CHROME_AVAILABLE = (() => {
        try { return typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
    })();

    console.log("💰 [BunkerBucks v1.3.4] Loading Sidekick Bunker Bucks Calculator Module...");

    const BunkerBucksModule = {
        version: '1.3.4',
        isInitialized: false,
        isEnabled: false,
        observer: null,
        scanTimer: null,
        storageListenerRegistered: false,
        _settings: null, // Assigned in init() once Core is ready
        lastDiagnosticSignature: '',
        successfulItems: new Set(),
        scanCount: 0,
        _state: null,
        _interactionHandler: null,
        _lastInteractionScan: 0,
        rescanInterval: null,
        _rafRunning: false,
        _lastQueueBy: 'boot',
        _lastQueueAt: 0,
        _queueCounts: {},
        _orphanWarned: false,
        _lastNameSource: null,
        _lastItemIdAttempted: null,
        _itemNameCache: null,
        _itemNameCacheLoading: false,
        _itemNameCacheFetchedAt: 0,
        _sorterSeedDone: false,
        _staleReplaced: 0,
        bbCache: {},
        _bbCacheDirty: false,
        _bbCacheFlushTimer: null,
        _cacheHideHandler: null,
        _overlays: null,
        _boundAnchors: null,
        _intendedEnabled: false,
        watchdogInterval: null,
        _watchdogCycles: 0,
        _rafLastBeat: 0,
        _storageHandler: null,

        // Torn rarity palette (mirrors auction-tracker's RARITY_COLORS).
        RARITY_HEX: { Yellow: '#fcf75e', Orange: '#d18100', Red: '#e64d19' },

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
                console.log(`💰 [BunkerBucks v${this.version}] already initialized`);
                return;
            }

            console.log(`💰 [BunkerBucks v${this.version}] Initializing...`);

            try {
                // Initialise shared settings helper
                this._settings = window.SidekickModules.Core.ModuleSettingsHelper('bunker-bucks', false);
                this.isEnabled = await this._settings.load();
                this.registerStorageListener();

                if (this.isEnabled) {
                    await this.enable();
                }

                this.isInitialized = true;
                console.log(`✅ [BunkerBucks v${this.version}] initialized — toggle ${this.isEnabled ? 'ON' : 'OFF (enable it in Settings → Economy → Bunker Bucks)'}`);
            } catch (error) {
                console.error(`❌ [BunkerBucks v${this.version}] initialization failed:`, error);
            }
        },

        registerStorageListener() {
            if (this.storageListenerRegistered) return;
            this.storageListenerRegistered = true;
            // Clobber-proof: ~20 modules read-modify-write sidekick_settings;
            // a stale concurrent write can momentarily drop or omit our
            // sub-key. Only an EXPLICIT isEnabled:false may disable us — a
            // missing key is race noise and must never kill the module.
            this._storageHandler = (changes, areaName) => {
                if (areaName !== 'local' || !changes.sidekick_settings) return;
                const next = changes.sidekick_settings.newValue?.['bunker-bucks'];
                if (next?.isEnabled === false) {
                    if (this._intendedEnabled) this.disable();
                } else if (next?.isEnabled === true) {
                    if (!this._intendedEnabled) this.enable();
                }
            };
            if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
                chrome.storage.onChanged.addListener(this._storageHandler);
            }
        },

        // Enable the module
        async enable() {
            console.log(`💰 [BunkerBucks v${this.version}] Enabling...`);
            this._intendedEnabled = true;
            this.isEnabled = true;
            if (this._settings) await this._settings.save(true);

            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }

            this.ensureTriggers();
            this.startWatchdog();
            this.loadItemNameCache();
            this.loadBBValueCache();
            if (!this._cacheHideHandler) {
                this._cacheHideHandler = () => { try { this.flushBBValueCache(); } catch (e) { /* ignore */ } };
                window.addEventListener('pagehide', this._cacheHideHandler);
            }
            this._lastQueueBy = 'boot';

            // Staggered boot scans: panels that render in the first seconds
            // after page load get processed even if every other trigger
            // mechanism somehow fails.
            [1000, 3000, 7000, 15000].forEach(ms =>
                NATIVE.setTimeout(() => { if (this.isEnabled) this.processExistingPopups(); }, ms));

            this.processExistingPopups();
        },

        // Idempotent trigger verification — registers anything missing while
        // enabled (self-healing against teardown by any cause) and is safe
        // to call on every scan.
        ensureTriggers() {
            if (!this.observer) this.startObserver();
            if (!this._interactionHandler) this.registerInteractionTriggers();
            if (!this.rescanInterval) this.startRescanInterval();
            this.startRafBackstop();
        },

        // Item details use different hashed wrappers in the Item Market,
        // Auction House, and Inventory. Watch the page, then identify the
        // shared information fields by their labels instead of wrapper names.
        startObserver() {
            if (this.observer) return;

            this.observer = new NATIVE.MutationObserver(() => this.queueScan('observer'));

            // attributes: Torn's redesigned panels pre-render hidden and are
            // revealed by style/class flips — without attribute observation
            // those reveals produce no observable mutation at all.
            this.observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true
            });
        },

        // Every panel reveal is preceded by a hover or click. Capture phase:
        // fires on the way DOWN the tree, before React's event root can
        // stopPropagation(), so page code can never swallow it. Throttled so
        // a moving mouse costs at most one debounced scan per 250 ms.
        registerInteractionTriggers() {
            if (this._interactionHandler) return;
            this._interactionHandler = () => {
                const now = Date.now();
                if (now - this._lastInteractionScan < 250) return;
                this._lastInteractionScan = now;
                this.queueScan('interaction');
            };
            NATIVE.addEventListener('mouseover', this._interactionHandler, { capture: true, passive: true });
            NATIVE.addEventListener('click', this._interactionHandler, { capture: true, passive: true });
        },

        unregisterInteractionTriggers() {
            if (!this._interactionHandler) return;
            NATIVE.removeEventListener('mouseover', this._interactionHandler, { capture: true });
            NATIVE.removeEventListener('click', this._interactionHandler, { capture: true });
            this._interactionHandler = null;
        },

        // Timer-based backstop: panels can complete or swap content with no
        // observable mutation and no interaction (lazy hydration, style-only
        // reveals). Existence-gated; scan guards keep each pass idempotent.
        startRescanInterval() {
            if (this.rescanInterval) return;
            this.rescanInterval = NATIVE.setInterval(() => {
                if (!this.isEnabled) return;
                if (!document.querySelector('ul[class*="properties" i]')) return;
                this.queueScan('interval');
            }, 1500);
        },

        // Renderer-driven backstop: requestAnimationFrame is neither an
        // event listener (cannot be stopped) nor a timer (cannot be
        // throttled or killed) — it runs exactly while the page renders,
        // i.e. whenever the user can actually SEE the panel. Even if every
        // other trigger is silenced, a visible panel gets scanned within
        // ~1.5 s.
        startRafBackstop() {
            if (this._rafRunning) return;
            this._rafRunning = true;
            let lastScanAt = 0;
            const tick = (ts) => {
                try {
                    if (!this._rafRunning) return;
                    if (this.isEnabled) {
                        this._rafLastBeat = ts || Date.now();
                        this.repositionOverlays();
                        const now = ts || Date.now();
                        if (now - lastScanAt >= 500) {
                            // Adaptive cadence: while an open ranked panel is
                            // still unpriced, retry every 500ms; once every
                            // visible panel has its value, relax to 1500ms.
                            const cadence = this.pendingPanels() > 0 ? 500 : 1500;
                            if (now - lastScanAt >= cadence) {
                                lastScanAt = now;
                                if (document.querySelector('ul[class*="properties" i]')) {
                                    this.queueScan('raf');
                                }
                            }
                        }
                    }
                } catch (e) {
                    // A throwing reposition must NEVER kill the loop.
                } finally {
                    if (this._rafRunning) NATIVE.requestAnimationFrame(tick);
                }
            };
            // Exposed for deterministic testing: headless virtual-time mode
            // starves BeginFrames, so the fixture drives the tick directly.
            this._rafTick = tick;
            NATIVE.requestAnimationFrame(tick);
        },

        stopRafBackstop() {
            this._rafRunning = false;
            this._rafTick = null;
        },

        // Self-healing watchdog: while the module is INTENDED to be enabled,
        // this verifies every trigger mechanism each cycle, re-arms anything
        // dead, and forces one scan — so no internal death can persist
        // longer than one cycle. The only way the module stays off is the
        // user explicitly turning it off.
        startWatchdog() {
            if (this.watchdogInterval) return;
            this._watchdogHandler = () => {
                this._watchdogCycles++;
                try {
                    if (!this._intendedEnabled) {
                        if (this.isEnabled) this.disable();
                        return;
                    }
                    let healed = false;
                    if (!this.isEnabled) { this.isEnabled = true; healed = true; }
                    if (!this.observer) { this.startObserver(); healed = true; }
                    if (!this._interactionHandler) { this.registerInteractionTriggers(); healed = true; }
                    if (!this.rescanInterval) { this.startRescanInterval(); healed = true; }
                    if (!this._rafRunning || (this._rafLastBeat && (Date.now() - this._rafLastBeat) > 5000)) {
                        this._rafRunning = false;
                        this.startRafBackstop();
                        healed = true;
                    }
                    if (healed) this._watchdogHealed = Date.now();
                    if (this.isEnabled) this.processExistingPopups();
                } catch (e) {
                    // The watchdog itself must never die.
                    try { this.publishState({ lastScan: Date.now(), lastError: `watchdog: ${e && (e.message || e)}` }); } catch (e2) { /* ignore */ }
                }
            };
            this.watchdogInterval = NATIVE.setInterval(this._watchdogHandler, 10000);
        },

        stopWatchdog() {
            if (!this.watchdogInterval) return;
            NATIVE.clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        },

        // Disable the module
        async disable() {
            console.log(`💰 [BunkerBucks v${this.version}] Disabling...`);
            this._intendedEnabled = false;
            this.isEnabled = false;
            if (this._settings) await this._settings.save(false);

            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
            this.unregisterInteractionTriggers();
            NATIVE.clearInterval(this.rescanInterval);
            this.rescanInterval = null;
            this.stopRafBackstop();
            this.stopWatchdog();
            NATIVE.clearTimeout(this.scanTimer);
            this.scanTimer = null;
            this.ensureOverlays();
            for (const overlay of this._overlays.values()) overlay.remove();
            this._overlays.clear();
            this._boundAnchors.clear();
            if (this._cacheHideHandler) {
                window.removeEventListener('pagehide', this._cacheHideHandler);
                this._cacheHideHandler = null;
            }
            this.flushBBValueCache();
            this.publishState({ lastScan: Date.now(), note: 'disabled' });
        },

        // Normalize a raw item title: Torn appends the quality tag and a
        // per-instance id (e.g. "P90 (COMMON 4230397)"); the long digit run
        // is never part of a real item name (mirrors auction-tracker).
        cleanItemName(raw) {
            let s = String(raw || '');
            s = s.replace(/\d{5,}/g, '');
            s = s.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '');
            s = s.replace(/\s{2,}/g, ' ');
            s = s.replace(/\s+([)\]])/g, '$1');
            return s.trim();
        },

        // Get item name from the popup
        getItemName(itemInfo) {
            const text = (itemInfo?.textContent || '').replace(/\s+/g, ' ').trim();
            const sentence = text.match(/\bThe\s+(.+?)\s+(?:is|are)\s+(?:an?\s+)?[^.]{0,100}\b(?:Weapon|Armou?r)\b/i);
            if (sentence?.[1]) return sentence[1].trim();
            const firstSentence = text.match(/\bThe\s+(.+?)\s+(?:is|are)\s+(?:an?\s+)?[^.]{1,160}\./i);
            if (firstSentence?.[1]) return firstSentence[1].trim();

            const descriptionElement = itemInfo?.querySelector?.('[class*="description" i]');
            const boldElement = descriptionElement?.querySelector('.bold, b, strong');
            if (boldElement) return boldElement.textContent.trim();

            return this.findItemTitle(itemInfo);
        },

        // Title lookup for Torn's redesigned (three.js) item preview: the
        // preview wrapper carries no description and no name any more — the
        // item's name renders in a heading that can sit OUTSIDE the panel
        // but INSIDE one of its ancestors (auction/market details
        // titleContainer). STRICTLY in-scope: document-wide title guessing
        // was removed — on multi-panel pages it mispaired (a body-level
        // sibling title won proximity for every name-less panel). Panels
        // whose name lives in a separate DOM branch are handled by pairing
        // the live description instead (processWithDocumentDescription).
        findItemTitle(itemInfo) {
            if (!itemInfo?.querySelector) return '';

            // 1. Trusted title inside the current scope (the extraction
            //    walk-up reaches the panel's own section long before any
            //    ancestor that could contain other panels' titles).
            const inside = Array.from(itemInfo.querySelectorAll(
                '[class*="titleContainer" i] h4, .title-wrap h4, [class*="title" i] h4'
            )).filter(el => (this.cleanItemName(el.textContent) || '').length > 0);
            if (inside.length === 1) return this.cleanItemName(inside[0].textContent);
            if (inside.length > 1) {
                const nearest = this.pickNearestCandidate(inside, itemInfo);
                if (nearest) return this.cleanItemName(nearest.textContent);
            }

            // 2. A single heading/name element inside the scope (simple or
            //    legacy flyout panels). Several in scope means the walk-up
            //    has entered a listings container — skip rather than guess.
            const scopedHeadings = itemInfo.querySelectorAll('h1, h2, h3, h4, [class*="itemName" i], [class*="item-name" i], .item-name');
            if (scopedHeadings.length === 1) return this.cleanItemName(scopedHeadings[0].textContent);

            return '';
        },

        // Pick the candidate whose nearest common ancestor with the anchor
        // is the shallowest — candidates in a sibling branch (e.g. listing
        // rows) always lose to a title inside the panel's own section.
        pickNearestCandidate(candidates, anchor) {
            let best = null;
            let bestDepth = Infinity;
            for (const el of candidates) {
                let parent = el.parentElement;
                let depth = 0;
                let found = false;
                while (parent) {
                    if (parent === anchor || parent.contains?.(anchor)) { found = true; break; }
                    parent = parent.parentElement;
                    depth++;
                }
                if (found && depth < bestDepth) {
                    best = el;
                    bestDepth = depth;
                }
            }
            return best;
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

            // The redesigned preview renders a rarity ICON (its class also
            // contains "rarity") before the colored word, so scan ALL
            // rarity-classed elements instead of only the first match.
            const qualityElements = Array.from(itemInfo?.querySelectorAll?.('[class*="rarity" i]') || []);
            for (const element of qualityElements) {
                const cls = String(element.className || '');
                if (/bonus|sidekick-bb-value/i.test(cls)) continue;
                if (cls.includes('yellow')) return 'Yellow';
                if (cls.includes('orange')) return 'Orange';
                if (cls.includes('red')) return 'Red';
            }

            // Redesigned three.js preview: the 3D scene wrapper carries the
            // rarity as a glow-* class (e.g. "scene___y2iMQ glow-yellow").
            const glow = itemInfo?.querySelector?.('[class*="glow-yellow" i], [class*="glow-orange" i], [class*="glow-red" i]');
            if (glow) {
                const cls = String(glow.className || '');
                if (/glow-yellow/i.test(cls)) return 'Yellow';
                if (/glow-orange/i.test(cls)) return 'Orange';
                if (/glow-red/i.test(cls)) return 'Red';
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

        queueScan(source = 'observer') {
            NATIVE.clearTimeout(this.scanTimer);
            this.scanTimer = NATIVE.setTimeout(() => {
                try {
                    this.processExistingPopups();
                } catch (e) {
                    // A scan must never stay dead: even a top-level crash is
                    // reported to the bridge and the next scan runs normally.
                    console.warn(`[BunkerBucks v${this.version}] scan crashed:`, e);
                    try { this.publishState({ lastScan: Date.now(), lastError: `scan: ${e && (e.message || e)}` }); } catch (e2) { /* ignore */ }
                }
            }, 120);
            this._lastQueueBy = source;
            this._lastQueueAt = Date.now();
            this._queueCounts[source] = (this._queueCounts[source] || 0) + 1;
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

            // Skip non-content text (inline scripts/styles) so page JS
            // source can never masquerade as an item description.
            const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => {
                    const tag = node.parentElement?.tagName;
                    return (tag && /^(script|style|pre|textarea)$/i.test(tag))
                        ? NodeFilter.FILTER_REJECT
                        : NodeFilter.FILTER_ACCEPT;
                }
            });
            let textNode;
            while ((textNode = walker.nextNode())) {
                if (descriptionPattern.test((textNode.textContent || '').replace(/\s+/g, ' ')) && textNode.parentElement) {
                    targets.add(textNode.parentElement);
                }
            }
            return [...targets];
        },

        findFieldLabel(root, fieldName) {
            const matcher = new RegExp(`^${fieldName}\\s*:?$`, 'i');
            return Array.from(root?.querySelectorAll('span, div, dt, th, b, strong') || [])
                .find(element => matcher.test(this.getDirectText(element))) || null;
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

        // Locate the properties list for a details root. The extraction walk
        // can resolve on a small node deep inside the list, so walk up too.
        findPropertiesList(detailsRoot) {
            if (!detailsRoot) return null;
            if (detailsRoot.matches?.('ul[class*="properties" i]')) return detailsRoot;
            return detailsRoot.querySelector?.('ul[class*="properties" i]')
                || detailsRoot.closest?.('ul[class*="properties" i]')
                || null;
        },

        findPanelWrapper(propertiesList) {
            const wrapper = propertiesList?.closest?.('[class*="previewAndPropertiesWrapper" i]');
            if (wrapper) return wrapper;
            // NEVER fall through to parentElement: a standalone UL's parent is
            // document.body, which contains EVERYTHING and breaks all
            // containment checks (fixture-verified: the poison panel matched
            // every description on the page via body.contains).
            return propertiesList || null;
        },

        // === OVERLAY DISPLAY LAYER ===
        // The value is rendered in module-owned elements attached to
        // document.body and positioned over the panel's Value field. React
        // never manages these nodes and never sees them: inserting foreign
        // nodes INTO React-managed panel DOM crashes React's
        // reconciliation when the reused panel re-renders (the live
        // "works once, dies after open→close" failure). Zero contact =
        // zero interference, by construction.

        ensureOverlays() {
            if (!this._overlays) this._overlays = new Map();
            if (!this._boundAnchors) this._boundAnchors = new Map();
        },

        // Bind (or re-bind) the value overlay for a panel. Runs on every
        // scan — rebinding overwrites the content, so a panel swap can
        // never show a stale value, and a React re-render that replaced
        // the anchor node is healed on the next scan.
        bindOverlay(propertiesList, bunkerBucks, itemName, rarity) {
            if (!propertiesList?.isConnected) return false;
            this.ensureOverlays();

            const anchor = this.findValueAnchor(propertiesList);
            if (!anchor) return false;

            // Already showing the correct value on a live anchor: nothing
            // to do. Keeps repeated scans cheap, keeps the injectedThisScan
            // signal honest, and keeps diagnostics able to fire.
            const already = this._overlays.get(propertiesList);
            if (already && already.isConnected &&
                already.dataset.sidekickBbItem === itemName &&
                already.dataset.sidekickBbRarity === rarity &&
                this._boundAnchors.get(already)?.isConnected) {
                return false;
            }

            let overlay = already;
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'sidekick-bb-overlay';
                overlay.style.setProperty('position', 'fixed', 'important');
                overlay.style.setProperty('z-index', '15000', 'important');
                overlay.style.setProperty('pointer-events', 'none', 'important');
                overlay.style.setProperty('white-space', 'nowrap', 'important');
                overlay.style.setProperty('font-size', '12px', 'important');
                overlay.style.setProperty('font-weight', '700', 'important');
                overlay.style.setProperty('display', 'none', 'important');
                overlay.title = 'Ranked War item value in Bunker Bucks';
                this._overlays.set(propertiesList, overlay);
            }
            if (!overlay.isConnected) document.body.appendChild(overlay);

            const display = `${this.formatNumber(bunkerBucks)} BB`;
            overlay.textContent = ` ${display}`;
            overlay.setAttribute('aria-label', `${display} Bunker Bucks`);
            overlay.dataset.sidekickBbItem = itemName || '';
            overlay.dataset.sidekickBbRarity = rarity || '';
            overlay.style.setProperty('color', this.RARITY_HEX[rarity] || '#f0c040', 'important');
            this._boundAnchors.set(overlay, anchor);
            this.positionOverlay(overlay);
            return true;
        },

        // The innermost value span of the panel's Value row (Quality row
        // fallback for panels without one) — the visual anchor point.
        findValueAnchor(propertiesList) {
            let host = this.findFieldLabel(propertiesList, 'Value')?.parentElement;
            if (!host) host = this.findFieldLabel(propertiesList, 'Quality')?.parentElement;
            const valueWrapper = host?.querySelector('[class*="valueWrapper" i]');
            if (!valueWrapper) return null;
            const spans = Array.from(valueWrapper.querySelectorAll('span'));
            return spans[spans.length - 1] || null;
        },

        positionOverlay(overlay) {
            const anchor = this._boundAnchors?.get(overlay);
            if (!anchor || !anchor.isConnected) {
                overlay.style.setProperty('display', 'none', 'important');
                return;
            }
            const rect = anchor.getBoundingClientRect();
            if (!rect.width && !rect.height) {
                overlay.style.setProperty('display', 'none', 'important');
                return;
            }
            overlay.style.setProperty('display', 'block', 'important');
            overlay.style.setProperty('left', `${Math.round(rect.right + 4)}px`, 'important');
            overlay.style.setProperty('top', `${Math.round(rect.top)}px`, 'important');
            overlay.style.setProperty('line-height', `${Math.round(rect.height)}px`, 'important');
        },

        // Runs on every rendered frame (rAF backstop): keeps the overlay
        // glued to its anchor through scrolls and panel movement, hides
        // overlays whose anchor died, and removes overlays whose panel is
        // gone for good.
        repositionOverlays() {
            this.ensureOverlays();
            for (const [key, overlay] of Array.from(this._overlays)) {
                if (!key.isConnected) {
                    overlay.remove();
                    this._overlays.delete(key);
                    this._boundAnchors.delete(overlay);
                    continue;
                }
                this.positionOverlay(overlay);
            }
        },

        // Open item panels that have a Quality row but no bound value —
        // drives the adaptive scan cadence and the bridge telemetry.
        // Only VISIBLE panels count (hidden jQuery-UI tab panels use
        // display:none — they must never block pairing or keep the fast
        // cadence alive forever). Uses computed style, not rects: rects
        // are zero in headless rendering.
        pendingPanels() {
            this.ensureOverlays();
            let pending = 0;
            document.querySelectorAll('ul[class*="properties" i]').forEach(ul => {
                const bound = this._overlays.get(ul);
                if (bound && bound.isConnected) return;
                try {
                    const style = window.getComputedStyle(ul);
                    if (style.display === 'none' || style.visibility === 'hidden') return;
                } catch (e) { /* if computed style fails, count it */ }
                if (this.findFieldLabel(ul, 'Quality')) pending++;
            });
            return pending;
        },

        processDetailsRoot(detailsRoot, qualityLabel = null) {
            if (!this.isEnabled || !detailsRoot) return false;

            // The extraction walk can resolve on a node INSIDE the list —
            // locate the list so the overlay can be bound to this panel.
            const propertiesList = this.findPropertiesList(detailsRoot);
            if (!propertiesList) return false;

            const itemName = this.getItemName(detailsRoot);
            const weaponType = this.getWeaponType(itemName, detailsRoot);
            const rarity = this.getRarity(detailsRoot);
            if (!itemName || !weaponType || !rarity) return false;

            // Bonus rows live in the properties list, which can be wider
            // than the node the extraction walk resolved on.
            const bonusCount = this.countBonuses(propertiesList);
            const bunkerBucks = this.calculateBunkerBucks(rarity, weaponType, bonusCount);
            if (bunkerBucks == null) return false;

            const injected = this.bindOverlay(propertiesList, bunkerBucks, itemName, rarity);
            if (injected) {
                this._lastNameSource = 'in-scope';
                this.rememberValue(itemName, rarity, weaponType, bonusCount, bunkerBucks,
                    this.extractItemId(propertiesList));
                const signature = `${itemName}|${rarity}|${weaponType}|${bunkerBucks}`;
                if (!this.successfulItems.has(signature)) {
                    this.successfulItems.add(signature);
                    console.info(`[BunkerBucks v${this.version}] Added ${bunkerBucks} BB for ${itemName} (${rarity} ${weaponType})`);
                }
            }
            return injected;
        },

        processQualityLabel(qualityLabel) {
            if (!this.isEnabled || !qualityLabel?.isConnected) return false;
            const propertiesList = this.findPropertiesList(qualityLabel);
            if (!propertiesList) return false;

            const rarity = this.getRarity(propertiesList) || this.getRarity(qualityLabel);
            if (!rarity) return false;
            const bonusCount = this.countBonuses(propertiesList);

            // PRIMARY: find a "The X is a Y Weapon" description ANYWHERE on
            // the page. Torn ALWAYS renders it for the hovered item — sometimes
            // inside the panel, sometimes in a React portal outside it. The BB
            // value depends only on weapon class + rarity + bonus count, so
            // even a name from a different same-class item gives the correct
            // value. Zero guards: this is the fast path, not the last resort.
            const weapon = this.findWeaponFromDescription(propertiesList);
            if (weapon) {
                const bunkerBucks = this.calculateBunkerBucks(rarity, weapon.class, bonusCount);
                if (bunkerBucks != null) {
                    this.rememberValue(weapon.name, rarity, weapon.class, bonusCount, bunkerBucks,
                        this.extractItemId(propertiesList));
                    if (this.bindOverlay(propertiesList, bunkerBucks, weapon.name, rarity)) {
                        this._lastNameSource = 'description';
                        const signature = `${weapon.name}|${rarity}|${weapon.class}|${bunkerBucks}`;
                        if (!this.successfulItems.has(signature)) {
                            this.successfulItems.add(signature);
                            console.info(`[BunkerBucks v${this.version}] Added ${bunkerBucks} BB for ${weapon.name} (${rarity} ${weapon.class})`);
                        }
                        return true;
                    }
                }
            }

            // FALLBACK 1: in-scope extraction (description/title inside the panel)
            const detailsRoot = this.findDetailsRoot(qualityLabel);
            if (detailsRoot && this.processDetailsRoot(detailsRoot, qualityLabel)) return true;

            // FALLBACK 2: item ID from the panel's image → name map
            if (this.processWithItemId(qualityLabel)) return true;

            return false;
        },

        // Scan for "The X is a Y Weapon" descriptions. Two tiers:
        //   1. Descriptions inside the panel's DOM (or the panel inside the
        //      description's container) — always safe, any number of panels.
        //   2. Page-level portal descriptions — ONLY when this panel has NO
        //      existing overlay (new hover/reopen) AND it is the sole visible
        //      unpriced panel (the live single-hover case). Never overwrite
        //      an already-correct value with a sibling's description.
        findWeaponFromDescription(propertiesList) {
            const targets = this.findDescriptionTargets(document);
            if (!targets.length) return null;
            const panel = this.findPanelWrapper(propertiesList) || propertiesList;

            const tryExtract = (el) => {
                const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
                const name = this.extractNameFromDescription(text);
                if (!name) return null;
                const type = this.getWeaponType(name, null);
                if (!type) return null;
                return { name, class: type };
            };

            // Tier 1: descriptions structurally connected to this panel
            for (const el of targets) {
                if (panel.contains(el) || el.contains(panel)) {
                    const result = tryExtract(el);
                    if (result) return result;
                }
            }

            // Tier 2: page-level portal descriptions — ONLY for panels with
            // no existing overlay (never overwrite) and sole pending.
            // Exclude descriptions inside OTHER panels' wrappers (they
            // belong to those panels via Tier 1, not to this one).
            this.ensureOverlays();
            const existing = this._overlays.get(propertiesList);
            if (existing && existing.isConnected) return null;

            if (this.pendingPanels() <= 1) {
                const isInsideOtherPanel = (el) => {
                    const wrapper = el.closest?.('[class*="previewAndPropertiesWrapper" i], [class*="itemInfoWrapper" i], [class*="itemInfo" i]');
                    return !!(wrapper && wrapper !== panel && !panel.contains(wrapper));
                };
                for (const el of targets) {
                    if (panel.contains(el) || el.contains(panel)) continue;
                    if (isInsideOtherPanel(el)) continue;
                    const result = tryExtract(el);
                    if (result) return result;
                }
            }

            return null;
        },

        // Extract the item ID from the panel's hidden image. The image sits
        // in the OUTER panel container (show-item-info), outside the
        // itemInfo/preview wrappers — so climb explicitly instead of using
        // closest(), which would stop at the nearest itemInfo ancestor.
        extractItemId(panel) {
            if (!panel?.querySelector) return null;
            const matchOf = (img) => img?.getAttribute?.('src')?.match(/\/images\/items\/(\d+)\//)?.[1];

            const direct = matchOf(panel.querySelector('img[src*="/images/items/"]'));
            if (direct) return Number(direct);

            let scope = panel;
            while (scope && scope !== document.body) {
                if (/show-item-info|itemInfoWrapper|item-info/i.test(String(scope.className || ''))) {
                    const id = matchOf(scope.querySelector('img[src*="/images/items/"]'));
                    if (id) return Number(id);
                }
                scope = scope.parentElement;
            }
            return null;
        },

        // Resolve an item ID to a name. Layer 1: Inventory Sorter's runtime
        // map (loaded from the Torn API on item.php — zero extra quota here).
        // Layer 2: the module's own persisted id→name cache. On a miss,
        // arm a 24h-throttled async refresh — the always-on scan triggers
        // retry within seconds of the map landing.
        resolveNameByItemId(itemId) {
            try {
                const sorterMap = window.SidekickModules?.InventorySorter?.itemValues;
                const name = sorterMap?.[itemId]?.name;
                if (name) {
                    this.seedItemNameCacheFromSorter(sorterMap);
                    return name;
                }
            } catch (e) { /* cross-module reads must never break the scan */ }

            if (this._itemNameCache && this._itemNameCache[itemId]) {
                return this._itemNameCache[itemId];
            }
            // No separate API call: the InventorySorter module already fetches
            // the item catalog on the inventory page. On other pages the
            // description-first path handles naming. The sorter seeds the
            // cache; no need to burn quota with a duplicate fetch.
            return null;
        },

        // Warm the persisted item-name cache into memory (fire-and-forget).
        loadItemNameCache() {
            if (this._itemNameCache || this._itemNameCacheLoading) return;
            this._itemNameCacheLoading = true;
            (async () => {
                try {
                    const payload = await window.SidekickModules?.Core?.ChromeStorage?.get('sidekick_bb_item_names');
                    if (payload && typeof payload === 'object' && payload.names) {
                        // MERGE — never replace (see loadBBValueCache).
                        this._itemNameCache = Object.assign({}, payload.names, this._itemNameCache || {});
                        this._itemNameCacheFetchedAt = payload.fetchedAt || this._itemNameCacheFetchedAt;
                        if (Object.keys(payload.names).length) this.queueScan('name-map');
                    }
                } catch (e) {
                    this._itemNameCache = this._itemNameCache || {};
                } finally {
                    this._itemNameCacheLoading = false;
                }
            })();
        },

        // REMOVED: refreshItemNameCache — the separate full-catalog API fetch
        // was the source of the 5-15s first-view delay. The description-first
        // path handles naming instantly; the InventorySorter module already
        // fetches item data on the inventory page. No separate API call
        // needed. No Torn API quota consumed by this module.

        // Persist a copy of Inventory Sorter's map once per page load, so
        // the name cache survives even with the sorter disabled or on
        // pages where it never loads.
        seedItemNameCacheFromSorter(sorterMap) {
            if (this._sorterSeedDone || !sorterMap) return;
            this._sorterSeedDone = true;
            try {
                const names = {};
                for (const [id, item] of Object.entries(sorterMap)) {
                    if (item?.name) names[id] = item.name;
                }
                this._itemNameCache = Object.assign({}, this._itemNameCache || {}, names);
                if (!this._itemNameCacheFetchedAt) this._itemNameCacheFetchedAt = Date.now();
                const persist = window.SidekickModules?.Core?.ChromeStorage?.set('sidekick_bb_item_names', {
                    fetchedAt: this._itemNameCacheFetchedAt,
                    names: this._itemNameCache
                });
                persist?.catch?.(() => { });
                // First sorter seed of this page load — names are now
                // available; price any panel that was waiting on them.
                this.queueScan('name-map');
            } catch (e) { /* seeding must never break the scan */ }
        },

        // Item-ID name path: name from the ID embedded in the panel's own
        // image; rarity, weapon class and bonuses strictly from the panel
        // (so a stale map can never price the wrong panel).
        processWithItemId(qualityLabel) {
            const propertiesList = this.findPropertiesList(qualityLabel);
            if (!propertiesList) return false;
            const panel = this.findPanelWrapper(propertiesList) || propertiesList;

            const itemId = this.extractItemId(panel);
            if (!itemId) return false;
            this._lastItemIdAttempted = itemId;

            const itemName = this.resolveNameByItemId(itemId);
            if (!itemName) return false;

            const rarity = this.getRarity(panel) || this.getRarity(propertiesList);
            if (!rarity) return false;
            const weaponType = this.getWeaponType(itemName, propertiesList);
            if (!weaponType) return false;

            const bonusCount = this.countBonuses(propertiesList);
            const bunkerBucks = this.calculateBunkerBucks(rarity, weaponType, bonusCount);
            if (bunkerBucks == null) return false;

            const injected = this.bindOverlay(propertiesList, bunkerBucks, itemName, rarity);
            if (injected) {
                this._lastNameSource = 'item-id';
                this.rememberValue(itemName, rarity, weaponType, bonusCount, bunkerBucks, itemId);
                const signature = `${itemName}|${rarity}|${weaponType}|${bunkerBucks}|id${itemId}`;
                if (!this.successfulItems.has(signature)) {
                    this.successfulItems.add(signature);
                    console.info(`[BunkerBucks v${this.version}] Added ${bunkerBucks} BB for ${itemName} (${rarity} ${weaponType}) [item-id ${itemId}]`);
                }
            }
            return injected;
        },

        // Name from raw description text — the sentence regexes of
        // getItemName, usable on description elements outside any panel.
        extractNameFromDescription(text) {
            const sentence = text.match(/\bThe\s+(.+?)\s+(?:is|are)\s+(?:an?\s+)?[^.]{0,100}\b(?:Weapon|Armou?r)\b/i);
            if (sentence?.[1]) return sentence[1].trim();
            const firstSentence = text.match(/\bThe\s+(.+?)\s+(?:is|are)\s+(?:an?\s+)?[^.]{1,160}\./i);
            if (firstSentence?.[1]) return firstSentence[1].trim();
            return '';
        },

        // Cross-subtree pairing for portal-rendered descriptions: name from
        // the document-wide live description, everything else from the
        // panel the quality label belongs to. Rarity must come from the
        // panel itself, so a stray description can never price another
        // panel's item. Only UNPAIRED descriptions qualify — a description
        // that sits inside any item panel's wrapper belongs to that panel
        // and is handled by the normal in-scope path.
        processWithDocumentDescription(qualityLabel) {
            const propertiesList = this.findPropertiesList(qualityLabel);
            if (!propertiesList) return false;
            const panel = this.findPanelWrapper(propertiesList) || propertiesList;

            const rarity = this.getRarity(panel) || this.getRarity(propertiesList);

            // A panel already showing a value for its CURRENT rarity needs no
            // heuristic foreign-description name (fixture-verified: pairing
            // over it can only misprice).
            const existing = this._overlays?.get(propertiesList);
            if (existing && existing.isConnected &&
                this._boundAnchors.get(existing)?.isConnected &&
                existing.dataset.sidekickBbRarity === rarity) {
                return false;
            }

            // Pair only when this is the SOLE unpriced panel on the page and
            // exactly ONE unpaired description exists — the live case: one
            // hovered panel plus the description Torn renders for it (which
            // can live in a React portal OUTSIDE the panel's DOM, as the
            // live inventory proved). With several panels or several
            // floating descriptions, a sibling's description could be bound,
            // so pairing fails closed. NOTE: the BB value depends only on
            // weapon class + rarity + bonus count — never the exact item —
            // so a same-class mispair is harmless by construction.
            if (this.pendingPanels() !== 1) return false;

            const isPairedElsewhere = (el) => !!el.closest?.(
                '[class*="previewAndPropertiesWrapper" i], [class*="itemInfoWrapper" i], [class*="itemInfo" i]'
            );
            // Torn renders nested description elements (wrapper + inner divs
            // all matching the pattern) — keep only the OUTERMOST per
            // portal, then require exactly one: one panel, one description.
            const candidates = this.findDescriptionTargets(document)
                .filter(el => !panel.contains(el) && !el.contains(panel) && !isPairedElsewhere(el));
            const outermost = candidates.filter(el =>
                !candidates.some(other => other !== el && other.contains(el)));
            if (outermost.length !== 1) return false;

            const descText = (outermost[0].textContent || '').replace(/\s+/g, ' ').trim();
            const itemName = this.extractNameFromDescription(descText);
            if (!itemName) return false;

            if (!rarity) return false;
            const weaponType = this.getWeaponType(itemName, propertiesList);
            if (!weaponType) return false;

            const bonusCount = this.countBonuses(propertiesList);
            const bunkerBucks = this.calculateBunkerBucks(rarity, weaponType, bonusCount);
            if (bunkerBucks == null) return false;

            const injected = this.bindOverlay(propertiesList, bunkerBucks, itemName, rarity);
            if (injected) {
                this._lastNameSource = 'paired-description';
                this.rememberValue(itemName, rarity, weaponType, bonusCount, bunkerBucks,
                    this.extractItemId(panel));
                const signature = `${itemName}|${rarity}|${weaponType}|${bunkerBucks}|paired`;
                if (!this.successfulItems.has(signature)) {
                    this.successfulItems.add(signature);
                    console.info(`[BunkerBucks v${this.version}] Added ${bunkerBucks} BB for ${itemName} (${rarity} ${weaponType}) [paired description]`);
                }
            }
            return injected;
        },

        processPropertiesList(propertiesList) {
            if (!propertiesList) return false;
            // Cache-first re-display: a previously computed value is
            // re-asserted directly from the cache on every scan — a React
            // re-render can never leave a known item without its value, and
            // no extraction failure can block the display.
            if (this.redisplayFromCache(propertiesList)) return true;
            const qualityLabel = this.findFieldLabel(propertiesList, 'Quality');
            if (qualityLabel) {
                return this.processQualityLabel(qualityLabel);
            }
            let injected = false;
            this.findQualityTargets(propertiesList).forEach(field => {
                injected = this.processQualityLabel(field) || injected;
            });
            return injected;
        },

        // Re-assert a CACHED value for a panel. Key = item ID + current
        // rarity + bonus count (bonus count is per-item-instance and changes
        // the value for Orange/Red). Needs only three simple panel reads —
        // the hidden image's item ID, the Quality text, the Bonus rows — no
        // name extraction at all. Rebinds the overlay when the shown value
        // is missing or belongs to a different item.
        redisplayFromCache(propertiesList) {
            if (!propertiesList?.isConnected) return false;
            const panel = this.findPanelWrapper(propertiesList) || propertiesList;
            const itemId = this.extractItemId(panel);
            if (!itemId) return false;
            const rarity = this.getRarity(panel) || this.getRarity(propertiesList);
            if (!rarity) return false;
            const bonusCount = this.countBonuses(propertiesList);
            const cached = this.bbCache[`${itemId}|${rarity}|${bonusCount}`];
            if (!cached) return false;

            this.ensureOverlays();
            const existing = this._overlays.get(propertiesList);
            if (existing &&
                existing.dataset.sidekickBbItem === cached.item &&
                existing.dataset.sidekickBbRarity === rarity &&
                this._boundAnchors.get(existing)?.isConnected) {
                return false; // already showing the correct value, anchored
            }
            if (this.bindOverlay(propertiesList, cached.bb, cached.item, rarity)) {
                this._lastNameSource = 'cache';
                const sig = `cache:${itemId}|${rarity}|${bonusCount}`;
                if (!this.successfulItems.has(sig)) {
                    this.successfulItems.add(sig);
                    console.info(`[BunkerBucks v${this.version}] Restored ${cached.bb} BB for ${cached.item} (${rarity}) [cache]`);
                }
                return true;
            }
            return false;
        },

        // Persist a computed value so it can be re-displayed without any
        // extraction. Key includes rarity + bonus count (bonus count is
        // per-instance for Orange/Red items).
        rememberValue(itemName, rarity, weaponType, bonusCount, bunkerBucks, itemId) {
            try {
                const key = itemId
                    ? `${itemId}|${rarity}|${bonusCount}`
                    : `${itemName}|${rarity}|${bonusCount}`;
                this.bbCache[key] = { item: itemName, rarity: rarity, bb: bunkerBucks, at: Date.now() };
                this.pruneBBCache();
                this.scheduleBBValueCacheFlush();
            } catch (e) { /* cache writes must never break the scan */ }
        },

        pruneBBCache() {
            const keys = Object.keys(this.bbCache);
            if (keys.length <= 400) return;
            keys.sort((a, b) => (this.bbCache[a].at || 0) - (this.bbCache[b].at || 0));
            const excess = keys.length - 400;
            for (let i = 0; i < excess; i++) delete this.bbCache[keys[i]];
        },

        scheduleBBValueCacheFlush() {
            this._bbCacheDirty = true;
            NATIVE.clearTimeout(this._bbCacheFlushTimer);
            this._bbCacheFlushTimer = NATIVE.setTimeout(() => this.flushBBValueCache(), 2000);
        },

        flushBBValueCache() {
            if (!this._bbCacheDirty) return;
            this._bbCacheDirty = false;
            NATIVE.clearTimeout(this._bbCacheFlushTimer);
            this._bbCacheFlushTimer = null;
            try {
                const persist = window.SidekickModules?.Core?.ChromeStorage?.set('sidekick_bb_values', this.bbCache);
                persist?.catch?.(() => { });
            } catch (e) { /* persistence must never break the scan */ }
        },

        loadBBValueCache() {
            (async () => {
                try {
                    const stored = await window.SidekickModules?.Core?.ChromeStorage?.get('sidekick_bb_values');
                    if (stored && typeof stored === 'object') {
                        // MERGE — in-memory entries always win over stored
                        // (they are newer). Never replace the object: the
                        // async load can resolve AFTER rememberValue already
                        // wrote entries, and a replace silently wipes them.
                        this.bbCache = Object.assign({}, stored, this.bbCache);
                    }
                } catch (e) { /* start with whatever we have */ }
            })();
        },

        // Process all currently open item-information panels. Every panel's
        // work is individually exception-isolated: a panel that throws on
        // every scan (the "value shown once, then never again until
        // refresh" failure mode) can never kill the others, and the error is
        // surfaced in the state bridge for instant diagnosis.
        processExistingPopups() {
            if (!this.isEnabled) return;
            this.ensureTriggers();
            this.scanCount++;
            let injected = false;
            let lastError = null;
            const safe = (label, fn) => {
                try {
                    return fn();
                } catch (e) {
                    lastError = `${label}: ${e && (e.message || e)}`;
                    console.warn(`[BunkerBucks v${this.version}] ${label} failed:`, e);
                    return undefined;
                }
            };

            document.querySelectorAll('ul[class*="properties" i]').forEach((list, index) => {
                const done = safe(`panel#${index}`, () => this.processPropertiesList(list));
                injected = !!done || injected;
            });
            safe('description-pass', () => {
                this.findDescriptionTargets(document).forEach(description => {
                    const root = this.findDetailsRootFromDescription(description);
                    injected = this.processDetailsRoot(root) || injected;
                });
                return undefined;
            });
            const targets = safe('target-scan', () => this.findQualityTargets(document)) || [];
            targets.forEach((element, index) => {
                const done = safe(`target#${index}`, () => this.processQualityLabel(element));
                injected = !!done || injected;
            });

            let lastFailure = null;
            const failure = safe('diagnostic', () => {
                let result = null;
                if (!injected && targets.length > 0) {
                    const sample = targets[0];
                    // Per-panel gate: only report when the sampled target's
                    // OWN panel lacks a bound overlay, so a broken panel
                    // still reports even when healthy panels have values.
                    const sampleScope = this.findPropertiesList(sample) || sample;
                    if (!(this._overlays && this._overlays.get(sampleScope))) {
                        const root = this.findDetailsRoot(sample);
                        const diagnostic = {
                            targets: targets.length,
                            valuesPresent: !!(this._overlays && this._overlays.size),
                            itemName: this.getItemName(root),
                            rarity: this.getRarity(root),
                            weaponType: this.getWeaponType(this.getItemName(root), root),
                            detailClass: String(root?.className || '')
                        };
                        const missing = [];
                        if (!diagnostic.itemName) missing.push('itemName');
                        if (!diagnostic.rarity) missing.push('rarity');
                        if (!diagnostic.weaponType) missing.push('weaponType');
                        const signature = JSON.stringify(diagnostic);
                        if (signature !== this.lastDiagnosticSignature) {
                            this.lastDiagnosticSignature = signature;
                            console.warn(`[BunkerBucks v${this.version}] Ranked item details found but no value was inserted (unresolved: ${missing.join(', ') || 'injection'}):`, diagnostic);
                        }
                        result = {
                            unresolved: missing,
                            sampleChain: this.describeAncestry(sample),
                            sampleText: (sample?.textContent || '').replace(/\s+/g, ' ').slice(0, 120),
                            diagnostic: diagnostic
                        };
                    }
                }
                return result;
            });
            lastFailure = failure || null;

            this.publishState({
                lastScan: Date.now(),
                targets: targets.length,
                injectedThisScan: injected,
                lastError: lastError,
                lastFailure: lastFailure
            });
        },

        // Class chain of an element up to (excluding) body — recorded into
        // the state bridge on failures so any future breakage self-documents
        // instead of requiring console archaeology.
        describeAncestry(element) {
            const chain = [];
            let current = element;
            let depth = 0;
            while (current && current !== document.body && depth < 10) {
                chain.push(String(current.className || current.tagName || '').slice(0, 80));
                current = current.parentElement;
                depth++;
            }
            return chain;
        },

        // Self-reporting bridge: after every scan, publish the module's own
        // view of the world onto the DOM. Readable from the page console in
        // ANY context via: document.documentElement.dataset.sidekickBbState
        // (content scripts live in an isolated world, so window.SidekickModules
        // is not reachable from the default "top" console context).
        publishState(patch) {
            try {
                this._state = Object.assign(this._state || {}, patch);
                this._state.version = this.version;
                this._state.enabled = this.isEnabled;
                this._state.scans = this.scanCount;
                let contextValid = false;
                try {
                    contextValid = !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
                } catch (e) { contextValid = false; }
                this._state.contextValid = contextValid;
                this._state.triggers = {
                    observer: !!this.observer,
                    interaction: !!this._interactionHandler,
                    interval: !!this.rescanInterval,
                    raf: !!this._rafRunning
                };
                this._state.lastQueueBy = this._lastQueueBy;
                this._state.lastQueueAt = this._lastQueueAt;
                this._state.queueCounts = this._queueCounts;
                this._state.nameSource = this._lastNameSource;
                this._state.staleReplaced = this._staleReplaced;
                this._state.cacheSize = Object.keys(this.bbCache).length;
                this._state.overlays = this._overlays ? this._overlays.size : 0;
                this._state.intendedEnabled = this._intendedEnabled;
                this._state.watchdog = !!this.watchdogInterval;
                this._state.watchdogCycles = this._watchdogCycles;
                this._state.pendingPanels = this.pendingPanels();
                this._state.lastItemId = this._lastItemIdAttempted;
                document.documentElement.dataset.sidekickBbState = JSON.stringify(this._state);
                if (CHROME_AVAILABLE && !contextValid && this.isEnabled && !this._orphanWarned) {
                    this._orphanWarned = true;
                    console.warn(`[BunkerBucks v${this.version}] Extension context invalidated — this page still runs the previous extension instance. Refresh the page once.`);
                }
            } catch (e) {
                /* diagnostics must never break the scan */
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
    console.log(`✅ [BunkerBucks v${BunkerBucksModule.version}] Module loaded and ready`);

})();
