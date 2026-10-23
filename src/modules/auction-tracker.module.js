/**
 * Sidekick Chrome Extension — Auction Tracker Module
 * Track individual auction house listings without bidding.
 * Spawned from the sidebar + button. Listings are colour-coded by category.
 * Author: Machiacelli
 */
(function () {
    'use strict';
    if (!window.SidekickModules) window.SidekickModules = {};

    // ── Constants ──────────────────────────────────────────────────────────────
    const STORAGE_KEY = 'sidekick_auction_tracker';
    const WINDOW_KEY = 'sidekick_auction_tracker_window';
    const SALES_KEY = 'sidekick_auction_sales';
    const REFRESH_MS = 60_000;   // sale-resolution cycle (ended auctions only)
    const RESEED_MS = 2_000;      // live re-harvest throttle while on amarket
    const MAX_SALE_ATTEMPTS = 10; // clean-miss budget — extensions can delay the real end by minutes
    const SALE_RETRY_GAP_SEC = 55;
    const LEDGER_CAP = 5000;              // newest records kept per item
    const LEDGER_SYNC_MS = 12 * 3600 * 1000; // top-up at most twice a day per item
    const LEDGER_MAX_PAGES = 40;          // one-time backfill bound per item
    const LEDGER_PAGE_GAP_MS = 400;       // pacing between backfill pages
    const VARIANT_VALUE_BAND = 3;         // ± percentage points for bonus matching
    const STYLE_ID = 'ska-tracker-styles';
    const WIN_ID = 'ska-tracker-win';
    const INJECT_ATTR = 'data-ska-tracked';

    // Category → accent colour mapping (matches Torn rarity glow palette)
    const CATEGORY_COLORS = {
        weapon: { border: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'Weapon' },
        armor: { border: '#3b82f6', bg: 'rgba(59,130,246,0.08)', label: 'Armor' },
        clothing: { border: '#ec4899', bg: 'rgba(236,72,153,0.08)', label: 'Clothing' },
        drug: { border: '#a855f7', bg: 'rgba(168,85,247,0.08)', label: 'Drug' },
        medical: { border: '#22c55e', bg: 'rgba(34,197,94,0.08)', label: 'Medical' },
        enhancer: { border: '#06b6d4', bg: 'rgba(6,182,212,0.08)', label: 'Enhancer' },
        item: { border: '#78716c', bg: 'rgba(120,113,108,0.08)', label: 'Item' },
    };

    // Torn v2 item rarity → accent colour (same glow palette the
    // auction-weapon-bonus module uses). Overrides the category colour on
    // the card border/gradient when present.
    const RARITY_COLORS = {
        yellow: { border: '#fcf75e', bg: 'rgba(252,247,94,0.07)' },
        orange: { border: '#d18100', bg: 'rgba(209,129,0,0.09)' },
        red: { border: '#e64d19', bg: 'rgba(230,77,25,0.08)' },
    };

    // ── amarket row → seed data (live-page selectors, Oct 2026) ────────────────
    // "Ends on HH:MM:SS - DD/MM/YY" title attribute (TCT = UTC)
    function parseEndsTitle(title) {
        const m = String(title || '').match(/(\d{2}):(\d{2}):(\d{2})\s*-\s*(\d{2})\/(\d{2})\/(\d{2})/);
        if (!m) return null;
        const [, hh, mi, ss, dd, mm, yy] = m.map(Number);
        const epoch = Math.floor(Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss) / 1000);
        return Number.isFinite(epoch) ? epoch : null;
    }

    // The row's visible countdown text ("1d 4h", "2h 5m", "45m", "58s").
    // Torn auctions EXTEND: a bid in the final minute resets the timer, so
    // this live text is the source of truth for the real end time — the
    // "Ends on" title is only the original schedule.
    function parseRemainingText(text) {
        const s = String(text || '');
        if (!/\d/.test(s)) return null;
        const d = Number(s.match(/(\d+)\s*d/i)?.[1] ?? 0);
        const h = Number(s.match(/(\d+)\s*h/i)?.[1] ?? 0);
        const m = Number(s.match(/(\d+)\s*m(?!s)/i)?.[1] ?? 0);
        const sec = Number(s.match(/(\d+)\s*s/i)?.[1] ?? 0);
        const total = d * 86400 + h * 3600 + m * 60 + sec;
        return total > 0 ? total : null;
    }

    function parseMoneyText(text) {
        const digits = String(text || '').replace(/[^0-9]/g, '');
        return digits ? Number(digits) : null;
    }

    // Torn injects the item's quality tag and instance id into the amarket
    // title a few seconds after the page loads — e.g. "P90 (COMMON 4230397)".
    // Per user preference the rarity/quality tag text is KEPT; only the id
    // (a long digit run, never part of a real item name) is removed,
    // wherever it appears. Tidies the empty brackets left behind.
    function cleanItemName(raw) {
        let s = String(raw || '');
        // The Locked Items module prepends a padlock span into the item name
        // wrapper — strip its glyphs so they never leak into the tracker
        s = s.replace(/[🔒🔓]/gu, '');
        s = s.replace(/\d{5,}/g, '');
        s = s.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '');
        s = s.replace(/\s{2,}/g, ' ');
        s = s.replace(/\s+([)\]])/g, '$1');
        return s.trim();
    }

    // Harvest one auction row. Live data comes from the page itself: Torn's
    // API only publishes COMPLETED auction sales, so active auctions have no
    // API representation to poll — the card is seeded here and re-seeded by
    // the page observer while the user browses; the API is consulted only
    // after the auction ends (sale resolution).
    function collectAuctionSeed(li) {
        const seed = {};
        if (!li || typeof li.querySelector !== 'function') return seed;

        const name = cleanItemName(li.querySelector('.item-name, span.title, .title')?.textContent.trim());
        if (name) seed.name = name;

        const sellerLink = li.querySelector('.seller-wrap .name a[href*="XID="], .seller-mob-wrap a[href*="XID="], a[href*="profiles.php"][href*="XID="]');
        const xid = sellerLink?.href.match(/[?&]XID=(\d+)/)?.[1];
        if (xid) {
            seed.sellerId = Number(xid);
            seed.sellerName = sellerLink.textContent.trim() || '—';
        }

        // Item id: the hook the sale-resolution and history lookup anchor on.
        // The uid (armoury) is ONLY harvested for weapons/armor below —
        // stackable items (drugs, meds, clothing) have no instance UID.
        const hover = li.querySelector('.item-hover');
        const itemId = Number(hover?.getAttribute('item'))
            || Number(li.querySelector('.item-name')?.getAttribute('href')?.match(/[?&]ID=(\d+)/)?.[1])
            || Number(li.querySelector('img[src*="/images/items/"]')?.getAttribute('src')?.match(/\/images\/items\/(\d+)\//)?.[1]);
        if (Number.isFinite(itemId) && itemId > 0) seed.itemId = itemId;

        const bidText = li.querySelector('.c-bid-wrap, .top-bid-mob-wrap, .price-wrap')?.textContent || '';
        const price = /none/i.test(bidText) ? 0 : parseMoneyText(bidText);
        if (price !== null) seed.price = price;

        const bids = Number(li.querySelector('.bids-wrap')?.textContent.match(/(\d+)\s*bids?/i)?.[1] ?? 0);
        if (bids) seed.bids = bids;

        // The visible countdown beats the "Ends on" title: a bid in the final
        // minute EXTENDS the auction, so the live remaining time is the real
        // end; the title is only the original schedule.
        const timerEl = li.querySelector('.time-wrap span[title], .time-mob-wrap span[title], span[title*="Ends on"]');
        const liveRemaining = parseRemainingText(timerEl?.textContent);
        if (liveRemaining) {
            seed.endsAt = Math.floor(Date.now() / 1000) + liveRemaining;
            seed.lastRemainingSec = liveRemaining;
        } else {
            const endsAt = parseEndsTitle(timerEl?.getAttribute('title'));
            if (endsAt) seed.endsAt = endsAt;
        }

        // Category from the tab — only weapons/armor tabs carry RW items.
        // This MUST come before the bonus harvest: non-weapon items (drugs,
        // meds, clothing) have no bonuses, and trying to harvest from them
        // produces false positives that leak the History button everywhere.
        const category = li.closest('#types-tab-1') ? 'weapon'
            : li.closest('#types-tab-2') ? 'armor' : null;
        if (category) seed.category = category;

        // Bonuses + rarity: ONLY for weapons/armor. On the AH, the tab
        // structure identifies them. On inventory / item market, the
        // armoury attribute does (stackables never have one).
        const hoverEl = li.querySelector('.item-hover');
        const isWeaponOrArmor = seed.category === 'weapon' || seed.category === 'armor'
            || !!hoverEl?.getAttribute('armoury');
        if (isWeaponOrArmor) {
            const hover = hoverEl;
            const uidRaw = hover?.getAttribute('armoury');
            if (uidRaw && /^\d+$/.test(String(uidRaw).trim())) {
                seed.uid = String(uidRaw).trim();
            }

            const glowEl = li.querySelector('.item-plate[class*="glow-"], [class*="glow-"]');
            const rarity = (glowEl?.className.match(/glow-(yellow|orange|red)/) || li.className.match(/glow-(yellow|orange|red)/))?.[1];
            if (rarity) seed.rarity = rarity;

            // Bonuses: harvest from every proven source — data-bonus-attachment-title
            // attributes, tooltip spans inside hashed bonus containers, and
            // the icon's class name as a last resort
            const bonuses = [];
            const seenNames = new Set();

            li.querySelectorAll('[data-bonus-attachment-title]').forEach(span => {
                const name = (span.getAttribute('data-bonus-attachment-title') || '').trim();
                const desc = (span.getAttribute('data-bonus-attachment-description') || '').trim();
                const val = Number(desc.match(/(\d+(?:\.\d+)?)\s*%/)?.[1] ?? 0) || 0;
                if (name && !seenNames.has(name.toLowerCase())) {
                    seenNames.add(name.toLowerCase());
                    bonuses.push({ name, value: val, description: desc });
                }
            });

            if (!bonuses.length) {
                const bonusContainers = li.querySelectorAll(
                    '[class*="iconsbonuses"], [class*="iconBonuses"], .iconsbonuses'
                );
                bonusContainers.forEach(cont => {
                    cont.querySelectorAll('span, i').forEach(el => {
                        const raw = el.getAttribute('title')
                            || el.getAttribute('data-original-title')
                            || '';
                        if (!raw) return;
                        const bName = raw.match(/<b[^>]*>\s*([^<]+?)\s*<\/b>/i)?.[1]
                            || raw.replace(/<[^>]*>/g, '').split('\n')[0].trim();
                        if (!bName || seenNames.has(bName.toLowerCase())) return;
                        const description = raw.split(/<br\s*\/?>/i).slice(1).join(' ')
                            .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                        const val = Number(description.match(/(\d+(?:\.\d+)?)\s*%/)?.[1] ?? 0) || 0;
                        seenNames.add(bName.toLowerCase());
                        bonuses.push({ name: bName, value: val, description });
                    });
                });
            }

            if (!bonuses.length) {
                li.querySelectorAll('i[class*="bonus-attachment-item-"]').forEach(icon => {
                    const m = icon.className.match(/bonus-attachment-item-([a-z0-9-]+)-bonus/i);
                    if (!m) return;
                    const name = m[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
                    const span = icon.closest('span') || icon.parentElement;
                    const raw = span?.getAttribute?.('title')
                        || span?.getAttribute?.('data-original-title')
                        || span?.getAttribute?.('data-bonus-attachment-title')
                        || '';
                    const val = Number((raw || '').match(/(\d+(?:\.\d+)?)\s*%/)?.[1] ?? 0) || 0;
                    if (name && !seenNames.has(name.toLowerCase())) {
                        seenNames.add(name.toLowerCase());
                        bonuses.push({ name, value: val, description: raw });
                    }
                });
            }

            if (bonuses.length) {
                seed.bonuses = bonuses;
            } else {
                console.warn(`🏷️ [AuctionTracker] Weapon/armor row but no bonus found — tried [data-bonus-attachment-title], [class*="iconsbonuses"] span/i, and i[class*="bonus-attachment-item-"]`);
            }
        }

        return seed;
    }

    // ── Module ─────────────────────────────────────────────────────────────────
    const AuctionTrackerModule = {
        isInitialized: false,
        _win: null,   // DOM window element
        _listings: {},     // { id: { ...cached data } }
        _refreshTimer: null,
        _tickTimer: null,
        _winState: {
            open: false,
            x: 120,
            y: 80,
            width: 520,
            height: 500,
            sort: 'time',   // time | new | price-asc | price-desc
        },

        // Close this window if it belongs to a deleted page
        async purgePage(pageId) {
            if (pageId == null) return;
            if (this._winState.pageId != null && String(this._winState.pageId) === String(pageId)) {
                this._close();
                this._winState.pageId = null; // so next open re-stamps current active page
                await this._saveState();
            }
        },

        // ── Init ───────────────────────────────────────────────────────────────
        async init() {
            if (this.isInitialized) return;
            try {
                await this._loadState();
                this._injectStyles();
                this._injectPageButton();
                this._setupStorageSync();

                if (this._winState.open) {
                    setTimeout(() => this.open(), 100);
                }

                this.isInitialized = true;
                console.log('🏷️ Auction Tracker initialized');
            } catch (e) {
                console.error('❌ Auction Tracker init error:', e);
            }
        },

        // ── Public: called by ui.module.js when user clicks "+ Auction Tracker" ──
        async open() {
            if (!this.isInitialized) await this.init();

            this._winState.open = true;
            // Sticky page: keep previously saved page, else stamp the current active page
            this._winState.pageId = this._winState.pageId ?? window.SidekickModules?.UI?.getActivePageId?.() ?? null;
            await this._saveState();
            if (this._win && document.contains(this._win)) {
                // bring to front
                this._win.style.zIndex = this._nextZ();
                return;
            }
            this._buildWindow();
            this._startRefresh();
            this._startCountdown();
            await this._refreshAll();
        },

        // ── State persistence ──────────────────────────────────────────────────
        async _loadState() {
            const CS = window.SidekickModules?.Core?.ChromeStorage;
            if (!CS) return;
            const saved = await CS.get(STORAGE_KEY);
            if (saved?.listings) {
                this._listings = saved.listings;
                // Rows written by earlier revisions may carry stuck error /
                // loading flags from the broken API attempts — nothing sets
                // them any more; strip on load so no legacy red text survives.
                // Names are also re-cleaned here: rows tracked before the
                // title cleaner (or before it handled lowercase tags) still
                // carry the raw page title.
                Object.values(this._listings).forEach(l => {
                    if (!l) return;
                    delete l.error;
                    if (l.loading) l.loading = false;
                    if (l.name) {
                        const clean = cleanItemName(l.name);
                        if (clean && clean !== l.name) l.name = clean;
                    }
                });
            }
            const ws = await CS.get(WINDOW_KEY);
            if (ws) this._winState = { ...this._winState, ...ws };
            // Sale-history ledger (per-item completed-sales archive)
            this._sales = (await CS.get(SALES_KEY)) || {};
        },

        async _saveState() {
            const CS = window.SidekickModules?.Core?.ChromeStorage;
            if (!CS) return;
            await CS.set(STORAGE_KEY, { listings: this._listings });
            await CS.set(WINDOW_KEY, this._winState);
        },

        // Cross-tab propagation: an amarket tab's re-seed (or a poll in any
        // tab) writes storage; every other tab's tracker window reloads and
        // re-renders. chrome.storage is feature-detected — the ChromeStorage
        // localStorage-fallback world has no onChanged. Registered once.
        _setupStorageSync() {
            if (this._storageListener) return;
            if (!window.chrome?.storage?.onChanged) return;
            this._storageListener = (changes, area) => {
                if (area !== 'local' || !changes[STORAGE_KEY]) return;
                clearTimeout(this._syncDebounce);
                this._syncDebounce = setTimeout(async () => {
                    await this._loadState();
                    if (this._win && document.contains(this._win)) this._renderList();
                }, 100);
            };
            chrome.storage.onChanged.addListener(this._storageListener);
        },

        // ── Sale-history ledger ──────────────────────────────────────────────────
        // Torn's auction API keeps the full completed-sales archive queryable
        // back to late 2022 (verified against the live API), but only serves
        // 100 entries per call. The ledger hoards those sales locally, per
        // item, so History/valuation queries never re-fetch what we already
        // have. First sync per item walks newest→oldest until it overlaps
        // stored data; later syncs pull only the gap since the last one.
        async _saveLedger() {
            const CS = window.SidekickModules?.Core?.ChromeStorage;
            if (!CS) return;
            await CS.set(SALES_KEY, this._sales || {});
        },

        _ingestSales(itemId, entries) {
            if (!itemId || !Array.isArray(entries) || !entries.length) return 0;
            if (!this._sales) this._sales = {};
            const ledger = this._sales[itemId] || (this._sales[itemId] = { lastSync: 0, records: [] });
            const names = this._sales.__names || (this._sales.__names = {});
            const seen = new Set(ledger.records.map(r => r.i));
            let added = 0;
            for (const s of entries) {
                if (!s?.id || seen.has(s.id)) continue;
                const bonuses = s.item?.bonuses || [];
                bonuses.forEach(b => { if (b?.id != null && b?.title) names[b.id] = b.title; });
                seen.add(s.id);
                ledger.records.push({
                    i: s.id,
                    t: s.timestamp,
                    p: s.price,
                    b: s.bids,
                    r: s.item?.rarity ?? null,
                    q: s.item?.stats?.quality ?? null,
                    k: bonuses.map(b => [b.id, b.value]),
                });
                added++;
            }
            if (added) {
                ledger.records.sort((a, b) => b.t - a.t);
                if (ledger.records.length > LEDGER_CAP) {
                    ledger.records = ledger.records.slice(0, LEDGER_CAP);
                }
            }
            return added;
        },

        async _ensureItemHistory(itemId, force = false, onProgress = null) {
            if (!itemId) return false;
            if (!this._sales) this._sales = {};
            const ledger = this._sales[itemId];
            if (!force && ledger?.lastSync && Date.now() - ledger.lastSync < LEDGER_SYNC_MS) return true;
            if (this._ledgerSyncing?.has(itemId)) return true; // a walk is running — render partial data
            if (!this._ledgerSyncing) this._ledgerSyncing = new Set();
            this._ledgerSyncing.add(itemId);

            try {
                const oldestStored = ledger?.records?.length ? ledger.records[ledger.records.length - 1].t : null;
                let to = Math.floor(Date.now() / 1000);
                for (let page = 0; page < LEDGER_MAX_PAGES; page++) {
                    const entries = await this._fetchItemSales(itemId, 0, to);
                    if (entries === null) return false; // no API key
                    if (!entries.length) break;
                    this._ingestSales(itemId, entries);
                    if (onProgress) onProgress(page + 1, this._sales[itemId]?.records?.length || 0);
                    const pageOldest = Math.min(...entries.map(s => s.timestamp));
                    if (oldestStored != null && pageOldest <= oldestStored) break; // reached known data
                    if (entries.length < 100) break;                                // end of archive
                    if (pageOldest >= to) break;                                    // no progress guard
                    to = pageOldest;
                    await new Promise(r => setTimeout(r, LEDGER_PAGE_GAP_MS));
                }
                const l = this._sales[itemId] || (this._sales[itemId] = { lastSync: 0, records: [] });
                l.lastSync = Date.now();
                await this._saveLedger();
                return true;
            } catch (e) {
                console.warn(`🏷️ [AuctionTracker] History sync failed for item ${itemId}:`, e.message);
                return false;
            } finally {
                this._ledgerSyncing.delete(itemId);
            }
        },

        // ── Ended-auction sale resolution ──────────────────────────────────────
        // Torn's API only publishes COMPLETED auction sales: the per-item
        // rolling feed GET /v2/market/{itemId}/auctionhouse (entries carry
        // price, bids, buyer, end timestamp, item uid). Active auctions have
        // no API representation at all, and the amarket page exposes no
        // API-compatible listing id — so live data is DOM-driven and this
        // lookup runs once per tracked auction AFTER its end time, to learn
        // the final sale result. Transport follows the event-ticker v2
        // pattern: background proxyFetch + Authorization header (rule #14).
        async _fetchItemSales(itemId, fromSec, toSec) {
            const CS = window.SidekickModules?.Core?.ChromeStorage;
            const apiKey = CS ? await CS.get('sidekick_api_key') : null;
            if (!apiKey) return null;

            const params = [];
            if (fromSec) params.push(`from=${fromSec}`);
            if (toSec) params.push(`to=${toSec}`);
            params.push('limit=100', 'sort=DESC');
            const path = `market/${itemId}/auctionhouse?${params.join('&')}`;
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'proxyFetch',
                    url: `https://api.torn.com/v2/${path}`,
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `ApiKey ${apiKey}`
                    }
                }, (r) => resolve(r));
            });

            if (!response?.success) {
                throw new Error(response?.error || 'Background proxy failed');
            }

            let data = response.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch { throw new Error('Sales feed returned invalid JSON'); }
            }
            if (data?.error) {
                throw new Error(data.error.error || data.error.message || `HTTP ${response.status}`);
            }
            return Array.isArray(data?.auctionhouse) ? data.auctionhouse : [];
        },

        // Does a completed-sales feed entry describe OUR tracked auction?
        // Primary: item-instance uid (unique weapons/armor). Fallback (no uid
        // available): same seller with the sale ending inside a ±1 h window
        // of the tracked end — bid extensions can push the real end far past
        // the schedule.
        _sameAuction(sale, l) {
            if (!sale) return false;
            const saleUid = String(sale.item?.uid ?? '').trim();
            if (l.uid && saleUid) {
                if (saleUid !== String(l.uid)) return false;
                return sale.seller?.id == null || l.sellerId == null
                    || sale.seller.id === l.sellerId;
            }
            if (l.sellerId != null && sale.seller?.id != null && sale.seller.id !== l.sellerId) return false;
            if (!Number.isFinite(sale.timestamp) || !l.endsAt) return false;
            return Math.abs(sale.timestamp - l.endsAt) <= 3600;
        },

        // ── Valuation ───────────────────────────────────────────────────────────
        // Variant = same item + same bonus set (ids) + same rarity, with the
        // roll matched in TIERS: exact roll first (a 10% roll prices against
        // 10% sales — a ±3 band pools rolls that sell for 3x different
        // amounts), widening to ±1 then ±3 only when the exact tier is thin.
        // Time windows: 30d preferred, widening to 90d/6m/all-time when the
        // tier has <5 sales. Every result carries its roll band + window so
        // the user can judge the number's reliability.
        _variantStats(itemId, seed) {
            const ledger = this._sales?.[itemId]?.records || [];
            if (!ledger.length) return null;

            const names = this._sales?.__names || {};
            const nameToId = {};
            Object.entries(names).forEach(([id, title]) => { nameToId[title] = Number(id); });

            const wantB = (seed?.bonuses || [])
                .map(b => [nameToId[b.name] ?? b.name, b.value])
                .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
            const wantR = seed?.rarity || null;

            // No bonus data = no variant. A rarity-only median is meaningless
            // for pricing (different bonuses sell for wildly different amounts).
            if (!wantB.length) return { variant: null, recent: [] };

            const nowSec = Date.now() / 1000;
            const windows = [
                [30, 'last 30 days'],
                [90, 'last 90 days'],
                [180, 'last 6 months'],
                [Infinity, 'all time'],
            ];
            const rollTiers = [0, 1, VARIANT_VALUE_BAND];

            const matchesFn = (r, wantBonusList, wantRarity, band = VARIANT_VALUE_BAND) => {
                if (wantRarity && r.r !== wantRarity) return false;
                if (!wantBonusList.length) return true;
                const rb = (r.k || []).slice().sort((a, b) => String(a[0]).localeCompare(String(b[0])));
                if (rb.length !== wantBonusList.length) return false;
                return wantBonusList.every(([id, v], i) => {
                    if (String(rb[i]?.[0]) !== String(id)) return false;
                    if (v === 0) return true;
                    return band === 0
                        ? (rb[i]?.[1] ?? 0) === v
                        : Math.abs((rb[i]?.[1] ?? 0) - v) <= band;
                });
            };

            // Roll-tier selection: prefer the exact roll, widening the time
            // window before widening the roll band. For dual-bonus items,
            // if no sales match with ALL bonuses, retry with just the
            // primary (first) bonus — a Cortex-style approach.
            const tryTiers = (wantB, wantR) => {
                const pooled = (wantB.length || wantR) ? ledger.filter(r => matchesFn(r, wantB, wantR)) : [];
                if (!pooled.length) return null;

                for (const band of rollTiers) {
                    const rows = band === VARIANT_VALUE_BAND ? pooled : pooled.filter(r => matchesFn(r, wantB, wantR, band));
                    if (!rows.length) continue;
                    const minSample = band === 0 ? 3 : 5;
                    for (const [days, label] of windows) {
                        const inWindow = days === Infinity
                            ? rows
                            : rows.filter(r => (r.t || 0) >= nowSec - days * 86400);
                        if (inWindow.length >= minSample) {
                            const st = this._statsOf(inWindow);
                            if (st) {
                                st.window = label;
                                st.band = band;
                                return { st, rows: inWindow };
                            }
                        }
                    }
                }

                const st = this._statsOf(pooled);
                if (!st) return null;
                st.window = 'all time';
                st.band = VARIANT_VALUE_BAND;
                return { st, rows: pooled };
            };

            let tier = tryTiers(wantB, wantR);

            // Dual-bonus fallback: if no sales match with ALL bonuses,
            // try with just the primary (strongest) bonus
            let primaryBonusOnly = false;
            if (!tier && wantB.length > 1) {
                const primary = [wantB[0]];
                tier = tryTiers(primary, wantR);
                if (tier) primaryBonusOnly = true;
            }

            if (!tier) return { variant: null, recent: [] };

            const recent = tier.rows.slice().sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 5)
                .map(r => ({
                    p: r.p,
                    t: r.t,
                    roll: (r.k || []).map(([id, v]) => {
                        const name = names[id] || `Bonus ${id}`;
                        return `${name} ${v}%`;
                    }).join(', '),
                }));
            tier.st.unknownRoll = wantB.some(([, v]) => v === 0);
            tier.st.primaryBonusOnly = primaryBonusOnly;
            return { variant: tier.st, recent };
        },

        _statsOf(rows) {
            const prices = rows.map(r => r.p).filter(p => Number.isFinite(p)).sort((a, b) => a - b);
            if (!prices.length) return null;
            const mid = prices.length >> 1;
            const median = prices.length % 2
                ? prices[mid]
                : Math.round((prices[mid - 1] + prices[mid]) / 2);
            return {
                n: prices.length,
                median,
                min: prices[0],
                max: prices[prices.length - 1],
                lastTs: Math.max(...rows.map(r => r.t || 0)),
            };
        },

        _priceVerdict(price, median) {
            if (!Number.isFinite(price) || !median) return null;
            const pct = Math.round(((price - median) / median) * 100);
            const band = pct <= 0 ? 'good' : pct <= 15 ? 'fair' : pct <= 30 ? 'high' : 'extreme';
            return { pct, band };
        },

        // ── History popover ────────────────────────────────────────────────────
        // Opens near the anchor (panel History button or a card's 📈), syncs
        // the item's ledger (first click backfills full history with a
        // progress line), then renders variant/rarity/item medians and the
        // current ask vs the best available median.
        async _showHistoryPopover(anchor, seed) {
            if (!seed?.itemId) return;
            this._closeHistoryPopover();

            const pop = document.createElement('div');
            pop.id = 'ska-hist-pop';
            pop.innerHTML = `
                <div class="ska-hist-head">
                    <span class="ska-hist-title">${this._esc(seed.name || 'Item history')}</span>
                    <button class="ska-hist-close" title="Close">×</button>
                </div>
                <div class="ska-hist-body">
                    <div class="ska-hist-loading">Building sale history…</div>
                </div>`;
            document.body.appendChild(pop);
            this._histPop = pop;
            pop.querySelector('.ska-hist-close').addEventListener('click', () => this._closeHistoryPopover());
            this._histOutside = ev => {
                if (this._histPop && !this._histPop.contains(ev.target)) this._closeHistoryPopover();
            };
            setTimeout(() => document.addEventListener('mousedown', this._histOutside), 50);
            this._placePopover(pop, anchor);

            const body = pop.querySelector('.ska-hist-body');
            const ok = await this._ensureItemHistory(seed.itemId, false, (pages, total) => {
                body.innerHTML = `<div class="ska-hist-loading">Building sale history… ${pages} page${pages !== 1 ? 's' : ''} · ${total} sales</div>`;
            });
            if (this._histPop !== pop) return; // closed while syncing

            if (!ok) {
                const CS = window.SidekickModules?.Core?.ChromeStorage;
                const hasKey = CS ? !!(await CS.get('sidekick_api_key')) : false;
                body.innerHTML = `<div class="ska-hist-loading">${hasKey
                    ? 'History sync failed — try again shortly'
                    : 'API key required for sale history'}</div>`;
                return;
            }

            const stats = this._variantStats(seed.itemId, seed);
            const variant = stats?.variant || null;

            // No bonus data means the variant match degenerated to rarity-only —
            // which is meaningless for pricing. Refuse to show a number.
            const hasBonus = (seed.bonuses || []).length > 0;
            if (!hasBonus) {
                body.innerHTML = `<div class="ska-hist-loading">Could not read this item's bonus from the page.<br>Open the item in the Auction House and try again.</div>`;
                return;
            }

            if (!variant) {
                body.innerHTML = `<div class="ska-hist-loading">No completed sales of this exact bonus and roll recorded yet.<br>New sales appear here as they happen.</div>`;
                return;
            }

            const sub = (seed.bonuses || []).map(b => `${b.name} ${b.value}%`).join(', ')
                + (seed.rarity ? `${(seed.bonuses || []).length ? ' · ' : ''}${seed.rarity}` : '');
            body.innerHTML = this._histRowHtml('This variant', variant, sub, stats?.recent || []);

            const conf = variant.n < 5 ? 'indicative — few sales' : variant.n < 10 ? 'fair sample' : 'solid sample';
            const bandLabel = variant.unknownRoll
                ? 'all rolls of this bonus'
                : variant.primaryBonusOnly
                    ? 'primary bonus only'
                    : variant.band === 0 ? 'exact roll' : variant.band === 1 ? '±1% roll' : '±3% roll';
            const verdictEl = document.createElement('div');
            verdictEl.className = 'ska-hist-verdict';
            const v = seed.price != null ? this._priceVerdict(seed.price, variant.median) : null;
            if (v) {
                verdictEl.innerHTML = `Current ask $${Number(seed.price).toLocaleString()} →
                    <b class="ska-chip ${v.band}">${v.pct > 0 ? '+' : ''}${v.pct}% vs ${bandLabel} median</b>
                    <span class="ska-hist-note">(${conf}, ${variant.window})</span>`;
            } else {
                verdictEl.innerHTML = `<span class="ska-hist-note">Typical sale price for this ${bandLabel} · ${conf} · ${variant.window}</span>`;
            }
            body.appendChild(verdictEl);
        },

        _histRowHtml(label, st, sub = '', recent = []) {
            const conf = st.n < 5 ? 'indicative' : st.n < 10 ? 'fair' : 'solid';
            const bandLabel = st.unknownRoll
                ? 'all rolls of this bonus'
                : st.band === 0 ? 'exact roll' : st.band === 1 ? '±1% roll' : '±3% roll';
            const rows = recent.map(r => `
                    <div class="ska-hist-sale">
                        <span class="ska-hist-sale-price">$${Number(r.p).toLocaleString()}</span>
                        <span class="ska-hist-sale-meta">${r.roll} · ${this._relTime((r.t || 0) * 1000)}</span>
                    </div>`).join('');
            return `
                <div class="ska-hist-row">
                    <div class="ska-hist-rowlabel">${this._esc(label)}${sub ? `<span class="ska-hist-sub">${this._esc(sub)}</span>` : ''}</div>
                    <div class="ska-hist-median">$${Number(st.median).toLocaleString()}</div>
                    <div class="ska-hist-meta">${st.n} sales · ${conf} · ${bandLabel} · ${st.window} · last ${this._relTime(st.lastTs * 1000)}</div>
                    ${rows ? `<div class="ska-hist-recenttitle">Last sold</div>${rows}` : ''}
                </div>`;
        },

        _placePopover(pop, anchor) {
            const rect = anchor?.getBoundingClientRect?.() || { left: 100, bottom: 120, top: 100 };
            pop.style.left = '0px';
            pop.style.top = '0px';
            const w = pop.offsetWidth || 280;
            const h = pop.offsetHeight || 200;

            // Clamp to the anchor's corner — popover stays in place relative
            // to the button even if the user scrolls
            let x = rect.right - w;
            if (x < 10) x = Math.min(rect.left, window.innerWidth - w - 10);
            if (x + w > window.innerWidth - 10) x = window.innerWidth - w - 10;

            let y = rect.bottom + 8;
            if (y + h > window.innerHeight - 10) y = Math.max(10, rect.top - h - 8);

            pop.style.left = `${Math.max(10, x)}px`;
            pop.style.top = `${y}px`;
        },

        _closeHistoryPopover() {
            this._histPop?.remove();
            this._histPop = null;
            if (this._histOutside) {
                document.removeEventListener('mousedown', this._histOutside);
                this._histOutside = null;
            }
        },

        // ── Add a listing (called by the details-panel track button) ──────────
        async addListing(listingId, seedData = {}) {
            listingId = String(listingId).trim();
            if (!listingId) return;
            if (!this.isInitialized) await this.init();

            // The seed is the data source for live auctions (Torn's API only
            // publishes completed sales), so the row is complete immediately —
            // no loading state, no fetch.
            this._listings[listingId] = {
                id: listingId,
                addedAt: Date.now(),
                loading: false,
                sold: false,
                ...seedData,
            };
            await this._saveState();

            if (this._win && document.contains(this._win)) {
                this._renderList();
            } else {
                await this.open();
            }

            // Mark the row on the AH immediately (the observer keeps it in sync)
            document.getElementById(listingId)?.classList.add('ska-tracked-row');
        },

        async _refreshOne(listingId) {
            const l = this._listings[listingId];
            if (!l) return;

            const nowSec = Math.floor(Date.now() / 1000);

            // Active auctions live in the amarket DOM (observer re-seed); the
            // API has nothing for them. Nothing to do until they end.
            if (!l.endsAt || l.endsAt > nowSec) return;
            if (l.saleResolved || (l.saleAttempts || 0) >= MAX_SALE_ATTEMPTS) return;

            // Pace retries (the countdown tick can kick us the second the
            // timer hits 0, plus the 60 s cycle — don't double-fire)
            if (nowSec - (l.lastSaleTry || 0) < SALE_RETRY_GAP_SEC) return;
            l.lastSaleTry = nowSec;

            // Without the item id there is nothing to look the sale up by
            if (!l.itemId) {
                l.saleResolved = true;
                await this._saveState();
                return;
            }

            if (!this._resolving) this._resolving = new Set();
            if (this._resolving.has(listingId)) return;
            this._resolving.add(listingId);

            try {
                // Window spans well past the scheduled end: bid extensions
                // push the REAL end forward, and the sale entry's timestamp is
                // the actual end. Uid matching doesn't depend on the window.
                const sales = await this._fetchItemSales(l.itemId, l.endsAt - 600, l.endsAt + 7200);
                if (sales === null) return; // no API key — silent, retry later

                // Free history data: bank the whole response in the ledger
                // before looking for our own listing's sale
                if (this._ingestSales(l.itemId, sales)) {
                    this._saveLedger();
                }

                l.saleAttempts = (l.saleAttempts || 0) + 1;
                const match = sales.find(s => this._sameAuction(s, l));

                if (match) {
                    if (match.price != null && match.price !== l.price) {
                        l.prevPrice = l.price || l.prevPrice;
                        l.price = match.price;
                    }
                    if (match.bids != null) l.bids = match.bids;
                    if (match.buyer?.id) {
                        l.sold = true;
                        l.buyerId = match.buyer.id;
                        l.buyerName = match.buyer.name;
                    }
                    l.saleResolved = true;
                    console.log(`🏷️ [AuctionTracker] Resolved sale for listing ${listingId}`);
                } else if (l.saleAttempts >= MAX_SALE_ATTEMPTS) {
                    // Clean misses exhausted: absent from the completed-sales
                    // feed means it expired unsold. Settle without an error.
                    l.saleResolved = true;
                }
            } catch (e) {
                l.saleAttempts = (l.saleAttempts || 0) + 1;
                console.warn(`🏷️ [AuctionTracker] Sale lookup failed for ${listingId}:`, e.message);
            } finally {
                this._resolving.delete(listingId);
            }

            await this._saveState();
            if (this._win && document.contains(this._win)) this._renderList();
        },

        async _refreshAll() {
            // Ended auctions: sale resolution (paced + capped internally).
            // Active auctions are DOM-driven (Torn's API has no live data).
            const ids = Object.keys(this._listings);
            for (const id of ids) await this._refreshOne(id);
        },

        _removeListing(listingId) {
            delete this._listings[listingId];
            this._saveState();
            this._renderList();
            document.getElementById(listingId)?.classList.remove('ska-tracked-row');
        },

        // Live updates while the user browses amarket: Torn re-renders rows as
        // bids arrive, so re-harvest any tracked row currently on the page.
        // Throttled — Torn ticks its row timers every second, which fires the
        // page observer constantly. Only fills gaps or records CHANGES; never
        // overwrites a resolved sale (ended rows are gone from the page by
        // then, so they simply don't match here).
        _reseedTracked() {
            if (!window.location.href.includes('amarket.php')) return;
            const now = Date.now();
            if (now - (this._lastReseedAt || 0) < RESEED_MS) return;
            this._lastReseedAt = now;

            let anyChanged = false;
            for (const [id, l] of Object.entries(this._listings)) {
                const li = document.getElementById(id);
                if (!li) continue;
                const seed = collectAuctionSeed(li);

                let changed = false;
                if (seed.price != null && seed.price !== l.price) {
                    if (l.price) l.prevPrice = l.price;
                    l.price = seed.price;
                    changed = true;
                }
                if (seed.bids != null && seed.bids !== l.bids) {
                    l.bids = seed.bids;
                    changed = true;
                }
                // Bid-extension guard: Torn resets the timer when a bid lands
                // in the final minute. The row's countdown text going UP (or,
                // on first observation, outliving our stored end) is the
                // unambiguous extension signal — re-anchor the end time and
                // revive sale resolution if it had already settled.
                if (seed.lastRemainingSec != null) {
                    const impliedEnd = Math.floor(Date.now() / 1000) + seed.lastRemainingSec;
                    const firstObservation = l.lastRemainingSec == null;
                    const textWentUp = !firstObservation
                        && seed.lastRemainingSec > l.lastRemainingSec + 10;
                    if (textWentUp || (firstObservation && l.endsAt && impliedEnd > l.endsAt + 30)) {
                        l.endsAt = impliedEnd;
                        if (l.saleResolved || l.sold) {
                            l.saleResolved = false;
                            l.saleAttempts = 0;
                            l.lastSaleTry = 0;
                            l.sold = false;
                            delete l.buyerId;
                            delete l.buyerName;
                        }
                        changed = true;
                    }
                    l.lastRemainingSec = seed.lastRemainingSec;
                }
                // Rows tracked before the name cleaner existed may carry the
                // raw page title ("P90 (COMMON 4230397)") — correct them.
                if (seed.name && seed.name !== l.name) {
                    l.name = seed.name;
                    changed = true;
                }
                for (const [k, v] of Object.entries(seed)) {
                    if (v == null || l[k] != null) continue;
                    if (k === 'price' || k === 'bids') continue; // handled above
                    l[k] = v;
                    changed = true;
                }
                if (changed) {
                    l.refreshedAt = now;
                    anyChanged = true;
                }
            }

            if (anyChanged) {
                this._saveState();
                if (this._win && document.contains(this._win)) this._renderList();
            }
        },

        // ── Auto-refresh ──────────────────────────────────────────────────────
        _startRefresh() {
            this._stopRefresh();
            this._refreshTimer = setInterval(() => this._refreshAll(), REFRESH_MS);
        },
        _stopRefresh() {
            if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
        },

        // 1s display-only countdown — rewrites the data-ends spans in place.
        // Never re-renders the list (rebuild-per-tick is the repaint churn
        // anti-pattern) and makes no API calls — except kicking the sale
        // resolver the moment a tracked auction's timer hits 0. A zero-cross
        // without a resolved sale shows "Ending…" (bid extensions can keep
        // the auction alive past its scheduled end).
        _startCountdown() {
            this._stopCountdown();
            this._tickTimer = setInterval(() => {
                if (!this._win || !document.contains(this._win)) return;
                const nowSec = Math.floor(Date.now() / 1000);
                this._win.querySelectorAll('.ska-l-time[data-ends]').forEach(el => {
                    const remaining = Number(el.dataset.ends) - nowSec;
                    if (remaining > 0) {
                        el.textContent = `⏱ ${this._formatTime(remaining)}`;
                        el.classList.remove('ended', 'ending');
                        return;
                    }
                    const resolved = !!this._listings[el.dataset.id]?.saleResolved;
                    el.textContent = resolved ? '⏱ Ended' : '⏱ Ending…';
                    el.classList.toggle('ended', resolved);
                    el.classList.toggle('ending', !resolved);
                });

                // An auction just hit 0: resolve its final sale right away
                // (paced inside _refreshOne; active auctions are skipped)
                for (const [id, l] of Object.entries(this._listings)) {
                    if (l?.endsAt && l.endsAt <= nowSec && !l.saleResolved
                        && (l.saleAttempts || 0) < MAX_SALE_ATTEMPTS) {
                        this._refreshOne(id);
                    }
                }
            }, 1000);
        },
        _stopCountdown() {
            if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
        },

        // ── z-index helper ────────────────────────────────────────────────────
        _nextZ() {
            const cur = parseInt(this._win?.style.zIndex || 0);
            return Math.max(cur + 1, 20050);
        },

        // ── CSS injection ─────────────────────────────────────────────────────
        _injectStyles() {
            if (document.getElementById(STYLE_ID)) return;
            const s = document.createElement('style');
            s.id = STYLE_ID;
            s.textContent = `
            /* ── Auction Tracker Window ─────────────────────────────── */
            #${WIN_ID} {
                position: absolute;
                background: #14161f;
                border: 1px solid rgba(255,255,255,.1);
                border-radius: 10px;
                box-shadow: 0 16px 48px rgba(0,0,0,.7);
                display: flex;
                flex-direction: column;
min-width: 260px;
min-height: 120px;
                max-height: 85vh;
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 12px;
                color: #e4e4e7;
                overflow: hidden;
                z-index: 20050;
                user-select: none;
            }
            #${WIN_ID} .ska-tw-header {
                padding: 10px 14px;
                background: linear-gradient(135deg,rgba(245,158,11,.18),rgba(245,158,11,.06));
                border-bottom: 1px solid rgba(255,255,255,.08);
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: move;
                flex-shrink: 0;
            }
            #${WIN_ID} .ska-tw-title {
                flex: 1;
                font-size: 13px;
                font-weight: 700;
                color: #f59e0b;
                letter-spacing: .3px;
            }
            #${WIN_ID} .ska-tw-close {
                background: none;
                border: none;
                color: rgba(255,255,255,.45);
                font-size: 18px;
                cursor: pointer;
                line-height: 1;
                padding: 0 2px;
                transition: color .15s;
                font-family: inherit;
            }
            #${WIN_ID} .ska-tw-close:hover { color: #ef4444; }

            /* Listing list */
            #${WIN_ID} .ska-tw-body {
                flex: 1;
                overflow-y: auto;
                padding: 8px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                scrollbar-width: thin;
                scrollbar-color: rgba(255,255,255,.1) transparent;
            }
            #${WIN_ID} .ska-tw-empty {
                padding: 30px 20px;
                text-align: center;
                color: rgba(255,255,255,.28);
                font-size: 12px;
                line-height: 1.7;
            }

            /* Individual listing card */
            #${WIN_ID} .ska-listing {
                border-radius: 7px;
                border-left: 3px solid #78716c;
                background: rgba(255,255,255,.04);
                padding: 9px 11px;
                display: flex;
                flex-direction: column;
                gap: 5px;
                transition: background .15s;
                position: relative;
            }
            #${WIN_ID} .ska-listing:hover { background: rgba(255,255,255,.07); }
            #${WIN_ID} .ska-listing.sold { opacity: .52; }
            #${WIN_ID} .ska-listing.sold .ska-l-name { text-decoration: line-through; color: rgba(255,255,255,.4); }

            #${WIN_ID} .ska-l-row1 {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            #${WIN_ID} .ska-l-cat {
                font-size: 9.5px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: .5px;
                padding: 2px 6px;
                border-radius: 4px;
                flex-shrink: 0;
            }
            #${WIN_ID} .ska-l-name {
                flex: 1;
                font-weight: 600;
                font-size: 12.5px;
                color: #fff;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #${WIN_ID} .ska-l-del {
                background: none;
                border: none;
                color: rgba(255,255,255,.25);
                cursor: pointer;
                font-size: 15px;
                line-height: 1;
                padding: 0;
                transition: color .15s;
                font-family: inherit;
                flex-shrink: 0;
            }
            #${WIN_ID} .ska-l-del:hover { color: #ef4444; }

            /* Row 2: core data — wrap-safe flex. Items never overlap and never
               break mid-sentence; on narrow windows the time simply wraps to
               its own right-aligned line instead of colliding with bids. */
            #${WIN_ID} .ska-l-row2 {
                display: flex;
                flex-wrap: wrap;
                align-items: baseline;
                column-gap: 12px;
                row-gap: 3px;
                font-size: 11px;
                color: rgba(255,255,255,.55);
            }
            #${WIN_ID} .ska-l-row2 > span {
                white-space: nowrap;
                min-width: 0;
            }
            #${WIN_ID} .ska-l-change { min-width: 64px; }
            #${WIN_ID} .ska-l-timeslot { margin-left: auto; }
            /* Row 3: muted secondary line — seller flexes with ellipsis */
            #${WIN_ID} .ska-l-row3 {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 10.5px;
                color: rgba(255,255,255,.4);
                min-width: 0;
            }
            #${WIN_ID} .ska-l-row3 > span {
                white-space: nowrap;
                min-width: 0;
            }
            #${WIN_ID} .ska-l-seller {
                flex: 1 1 auto;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #${WIN_ID} .ska-l-status {
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 170px;
            }
            #${WIN_ID} .ska-l-price {
                font-weight: 700;
                font-size: 12px;
                color: #fff;
            }
            #${WIN_ID} .ska-l-drop { color: #22c55e; font-size: 10.5px; }
            #${WIN_ID} .ska-l-rise { color: #ef4444; font-size: 10.5px; }
            #${WIN_ID} .ska-l-sold-badge {
                color: #22c55e;
                font-weight: 700;
                font-size: 10.5px;
            }
            #${WIN_ID} .ska-l-bonuses {
                display: flex;
                flex-wrap: wrap;
                gap: 4px 7px;
            }
            #${WIN_ID} .ska-l-bonus {
                font-size: 10.5px;
                padding: 2px 7px;
                border-radius: 8px;
                background: rgba(255,255,255,.07);
                border: 1px solid rgba(255,255,255,.1);
                color: rgba(255,255,255,.8);
            }
            #${WIN_ID} .ska-l-loading {
                color: rgba(255,255,255,.35);
                font-size: 11px;
                font-style: italic;
            }
            #${WIN_ID} .ska-l-error {
                color: #f87171;
                font-size: 10.5px;
            }
            #${WIN_ID} .ska-l-time {
                font-variant-numeric: tabular-nums;
            }
            #${WIN_ID} .ska-l-time.ended {
                color: rgba(255,255,255,.35);
            }
            #${WIN_ID} .ska-l-time.ending {
                color: rgba(245,158,11,.6);
            }

            /* resize handle */
            #${WIN_ID} .ska-tw-resize {
                position: absolute;
                bottom: 0; right: 0;
                width: 14px; height: 14px;
                cursor: se-resize;
                opacity: .3;
                background: linear-gradient(135deg, transparent 50%, rgba(255,255,255,.5) 50%);
                border-radius: 0 0 10px 0;
            }

            /* Inject track button on amarket.php */
            .ska-track-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin-left: 7px;
                background: rgba(245,158,11,.15);
                border: 1px solid rgba(245,158,11,.4);
                color: #f59e0b;
                border-radius: 4px;
                padding: 2px 7px;
                font-size: 10px;
                font-weight: 700;
                cursor: pointer;
                transition: background .15s;
                vertical-align: middle;
                font-family: inherit;
            }
            .ska-track-btn:hover { background: rgba(245,158,11,.3); }
            .ska-track-btn.tracked { background: rgba(34,197,94,.15); border-color: rgba(34,197,94,.4); color: #22c55e; cursor: default; }
            .ska-track-btn.hist { background: rgba(59,130,246,.15); border-color: rgba(59,130,246,.4); color: #60a5fa; }
            .ska-track-btn.hist:hover { background: rgba(59,130,246,.3); }
            .ska-track-btns {
                display: flex;
                gap: 6px;
                width: 100%;
            }
            .ska-track-btns .ska-track-btn { flex: 1; }

            /* Tracked-row highlight on the AH itself */
            .ska-tracked-row {
                box-shadow: inset 3px 0 0 #f59e0b;
            }

            /* Card history button + verdict chip */
            #${WIN_ID} .ska-l-hist {
                background: none;
                border: none;
                color: rgba(255,255,255,.35);
                cursor: pointer;
                font-size: 12px;
                line-height: 1;
                padding: 0 2px;
                transition: color .15s;
                font-family: inherit;
                flex-shrink: 0;
            }
            #${WIN_ID} .ska-l-hist:hover { color: #60a5fa; }
            #${WIN_ID} .ska-l-chip {
                font-size: 9.5px;
                font-weight: 700;
                padding: 1px 5px;
                border-radius: 8px;
                margin-left: 5px;
                vertical-align: 1px;
                white-space: nowrap;
            }
            #${WIN_ID} .ska-l-chip.good { color: #22c55e; background: rgba(34,197,94,.12); }
            #${WIN_ID} .ska-l-chip.fair { color: rgba(255,255,255,.6); background: rgba(255,255,255,.08); }
            #${WIN_ID} .ska-l-chip.high { color: #f59e0b; background: rgba(245,158,11,.12); }
            #${WIN_ID} .ska-l-chip.extreme { color: #ef4444; background: rgba(239,68,68,.14); }

            /* History popover — max z-index: it must render above the Sidekick
               sidebar itself, since the tracker window lives inside the
               sidebar and the popover often extends over it */
            #ska-hist-pop {
                position: fixed;
                z-index: 2147483647;
                background: #14161f;
                border: 1px solid rgba(255,255,255,.14);
                border-radius: 10px;
                box-shadow: 0 16px 48px rgba(0,0,0,.7);
                padding: 10px 12px;
                width: 290px;
                max-width: calc(100vw - 20px);
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 12px;
                color: #e4e4e7;
            }
            #ska-hist-pop .ska-hist-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding-bottom: 7px;
                margin-bottom: 7px;
                border-bottom: 1px solid rgba(255,255,255,.1);
            }
            #ska-hist-pop .ska-hist-title {
                font-weight: 700;
                font-size: 12.5px;
                color: #60a5fa;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #ska-hist-pop .ska-hist-close {
                background: none;
                border: none;
                color: rgba(255,255,255,.45);
                font-size: 16px;
                cursor: pointer;
                line-height: 1;
                padding: 0 2px;
                font-family: inherit;
            }
            #ska-hist-pop .ska-hist-close:hover { color: #ef4444; }
            #ska-hist-pop .ska-hist-loading {
                color: rgba(255,255,255,.45);
                font-style: italic;
                padding: 6px 0;
                line-height: 1.5;
            }
            #ska-hist-pop .ska-hist-row {
                padding: 6px 0;
                border-bottom: 1px solid rgba(255,255,255,.06);
            }
            #ska-hist-pop .ska-hist-rowlabel {
                font-size: 10.5px;
                color: rgba(255,255,255,.5);
                text-transform: uppercase;
                letter-spacing: .4px;
            }
            #ska-hist-pop .ska-hist-sub {
                display: block;
                font-size: 10px;
                color: rgba(255,255,255,.35);
                text-transform: none;
                letter-spacing: 0;
            }
            #ska-hist-pop .ska-hist-median {
                font-size: 14px;
                font-weight: 700;
                color: #fff;
                margin: 2px 0;
            }
            #ska-hist-pop .ska-hist-meta {
                font-size: 10px;
                color: rgba(255,255,255,.4);
            }
            #ska-hist-pop .ska-hist-recenttitle {
                font-size: 9.5px;
                color: rgba(255,255,255,.35);
                text-transform: uppercase;
                letter-spacing: .4px;
                margin-top: 8px;
            }
            #ska-hist-pop .ska-hist-sale {
                display: flex;
                align-items: baseline;
                gap: 8px;
                padding: 2px 0;
                font-size: 11px;
            }
            #ska-hist-pop .ska-hist-sale-price {
                font-weight: 700;
                color: rgba(255,255,255,.85);
                min-width: 100px;
            }
            #ska-hist-pop .ska-hist-sale-meta {
                color: rgba(255,255,255,.4);
                font-size: 10px;
            }
            #ska-hist-pop .ska-hist-verdict {
                padding-top: 8px;
                font-size: 11.5px;
                color: rgba(255,255,255,.65);
                line-height: 1.6;
            }
            #ska-hist-pop .ska-chip {
                font-size: 10.5px;
                font-weight: 700;
                padding: 2px 7px;
                border-radius: 8px;
            }
            #ska-hist-pop .ska-chip.good { color: #22c55e; background: rgba(34,197,94,.12); }
            #ska-hist-pop .ska-chip.fair { color: rgba(255,255,255,.65); background: rgba(255,255,255,.08); }
            #ska-hist-pop .ska-chip.high { color: #f59e0b; background: rgba(245,158,11,.12); }
            #ska-hist-pop .ska-chip.extreme { color: #ef4444; background: rgba(239,68,68,.14); }
            #ska-hist-pop .ska-hist-note {
                display: block;
                font-size: 10px;
                color: rgba(255,255,255,.35);
            }
            `;
            document.head.appendChild(s);
        },

        // ── Build floating window ─────────────────────────────────────────────
        _buildWindow() {
            // Remove stale window if any
            document.getElementById(WIN_ID)?.remove();

            const win = document.createElement('div');
            win.id = WIN_ID;
            // Route to the page this window belongs to (sticky once saved; active page on first open)
            const contentArea = window.SidekickModules?.UI?.getPageContentEl?.(this._winState.pageId) || document.getElementById('sidekick-content');
            const maxW = contentArea ? contentArea.clientWidth : window.innerWidth;
            const maxH = contentArea ? contentArea.clientHeight : window.innerHeight;

            let startX = this._winState.x || 10;
            let startY = this._winState.y || 10;

            // If the saved position is outside the container (e.g. from previous position:fixed), reset it
            if (startX > maxW - 50) startX = 10;
            if (startY > maxH - 50) startY = 10;

            win.style.left = `${startX}px`;
            win.style.top = `${startY}px`;
            win.style.width = `${Math.min(this._winState.width || 520, maxW - 20)}px`;

            if (this._winState.height) {
                win.style.height = `${this._winState.height}px`;
            }

            this._win = win;

            win.innerHTML = `
                <div class="ska-tw-header" id="ska-tw-drag">
                    <span class="ska-tw-title">🏷️ Auction Tracker</span>
                    <button class="ska-tw-close" id="ska-tw-close" title="Close">×</button>
                </div>

                <div class="ska-tw-body" id="ska-tw-body"></div>
                <div class="ska-tw-resize" id="ska-tw-resize"></div>
            `;

            if (contentArea) {
                contentArea.appendChild(win);
            } else {
                document.body.appendChild(win);
            }
            // Register with WindowManager if available
            if (window.SidekickModules?.Core?.WindowManager) {
                window.SidekickModules.Core.WindowManager.registerWindow(win, 'Auction Tracker');
            }

            // Event wiring
            win.querySelector('#ska-tw-close').addEventListener('click', () => this._close());


            this._makeDraggable(win.querySelector('#ska-tw-drag'), win);
            this._makeResizable(win.querySelector('#ska-tw-resize'), win);

            // Click-to-front
            win.addEventListener('mousedown', () => { win.style.zIndex = this._nextZ(); });

            this._renderList();
        },

        // ── Render the listing list ───────────────────────────────────────────
        _renderList() {
            const body = this._win?.querySelector('#ska-tw-body');
            if (!body) return;

            const entries = Object.values(this._listings);
            if (!entries.length) {
                body.innerHTML = `<div class="ska-tw-empty">
                    No listings tracked yet.<br>
                    Open the <strong>Auction House</strong>, click a listing, and press
                    <strong>+ Track Listing</strong> in its details panel.
                </div>`;
                return;
            }

            // Sort per the persisted preference; ended/sold rows always sink
            const sort = this._winState.sort || 'time';
            entries.sort((a, b) => this._compareListings(a, b, sort));

            body.innerHTML = entries.map(l => this._listingHTML(l)).join('');

            // Wire delete + history buttons
            body.querySelectorAll('.ska-l-del').forEach(btn => {
                btn.addEventListener('click', () => this._removeListing(btn.dataset.id));
            });
            body.querySelectorAll('.ska-l-hist').forEach(btn => {
                btn.addEventListener('click', () => {
                    const l = this._listings[btn.dataset.id];
                    if (l) this._showHistoryPopover(btn, l);
                });
            });
        },

        _compareListings(a, b, sort) {
            const nowSec = Math.floor(Date.now() / 1000);
            const aDone = a.sold || !a.endsAt || a.endsAt <= nowSec;
            const bDone = b.sold || !b.endsAt || b.endsAt <= nowSec;
            if (aDone !== bDone) return aDone ? 1 : -1;
            if (sort === 'price-asc') return (a.price ?? Infinity) - (b.price ?? Infinity);
            if (sort === 'price-desc') return (b.price ?? Infinity) - (a.price ?? Infinity);
            if (sort === 'new') return (b.addedAt || 0) - (a.addedAt || 0);
            // 'time': ending soonest first
            return (a.endsAt || Infinity) - (b.endsAt || Infinity);
        },

        _listingHTML(l) {
            const cat = CATEGORY_COLORS[l.category] || CATEGORY_COLORS.item;
            const accent = RARITY_COLORS[l.rarity] || cat;
            const catBg = cat.bg;
            const catClr = cat.border;
            const clr = accent.border;

            const name = l.name || `Listing #${l.id}`;
            const price = l.price ? `$${Number(l.price).toLocaleString()}` : '—';

            // Verdict chip vs THIS exact variant's sale median — only for RW
            // items (must have bonus data; non-RW items aren't in the feed)
            let histChip = '';
            if (l.itemId && (l.bonuses || []).length > 0 && this._sales?.[l.itemId]?.records?.length) {
                const st = this._variantStats(l.itemId, l);
                const variant = st?.variant;
                const v = variant ? this._priceVerdict(l.price, variant.median) : null;
                if (v) {
                    histChip = `<span class="ska-l-chip ${v.band}" title="vs variant sale median ($${Number(variant.median).toLocaleString()}, ${variant.n} sales, ${variant.window})">${v.pct > 0 ? '+' : ''}${v.pct}%</span>`;
                }
            }
            const seller = l.sellerId
                ? `<a href="https://www.torn.com/profiles.php?XID=${l.sellerId}" target="_blank" rel="noopener"
                      style="color:${clr};text-decoration:none;">${this._esc(l.sellerName || l.sellerId)}</a>`
                : this._esc(l.sellerName || '—');

            // Price change indicator
            let priceChange = '';
            if (l.prevPrice && l.price && l.price !== l.prevPrice) {
                const diff = l.price - l.prevPrice;
                priceChange = diff < 0
                    ? `<span class="ska-l-drop">▼ $${Math.abs(diff).toLocaleString()}</span>`
                    : `<span class="ska-l-rise">▲ $${diff.toLocaleString()}</span>`;
            }

            // Time left — carried as an end epoch; the 1s display tick updates
            // the data-ends spans in place. Past the end WITHOUT a resolved
            // sale it may be a bid extension — show "Ending…", not "Ended".
            let timeStr = '';
            if (l.endsAt) {
                const remaining = l.endsAt - Math.floor(Date.now() / 1000);
                timeStr = remaining > 0
                    ? `<span class="ska-l-time" data-ends="${l.endsAt}" data-id="${l.id}">⏱ ${this._formatTime(remaining)}</span>`
                    : (l.saleResolved
                        ? `<span class="ska-l-time ended">⏱ Ended</span>`
                        : `<span class="ska-l-time ending">⏱ Ending…</span>`);
            }

            // Bids
            const bidsStr = l.bids !== undefined && l.bids !== null ? `🔨 ${l.bids} bid${l.bids !== 1 ? 's' : ''}` : '';

            // Sold badge (green — a resolved sale is a result, not an error)
            const soldBadge = l.sold
                ? `<span class="ska-l-sold-badge">✔ Sold${l.buyerName
                    ? ` to <a href="https://www.torn.com/profiles.php?XID=${l.buyerId}" target="_blank" rel="noopener"
                          style="color:#22c55e;text-decoration:none;">${this._esc(l.buyerName)}</a>`
                    : ''}</span>`
                : '';

            // Bonuses (v2 item shape: { id, title, description, value })
            let bonusesHTML = '';
            if (Array.isArray(l.bonuses) && l.bonuses.length) {
                const pills = l.bonuses.map(b => {
                    const bName = b.title || b.name || '';
                    if (!bName) return '';
                    const val = b.value > 0 ? ` ${b.value}%` : '';
                    const tip = b.description ? ` title="${this._esc(b.description)}"` : '';
                    return `<span class="ska-l-bonus"${tip}>${this._esc(bName)}${val}</span>`;
                }).join('');
                if (pills) bonusesHTML = `<div class="ska-l-bonuses">${pills}</div>`;
            }

            const loading = l.loading
                ? `<span class="ska-l-loading">Fetching data…</span>`
                : '';
            const errMsg = l.error && !l.loading
                ? `<span class="ska-l-error">⚠ ${this._esc(l.error)}</span>`
                : '';
            const statusStr = `${soldBadge}${errMsg}${loading}`;

            // Last refreshed
            const refreshedStr = l.refreshedAt
                ? `<span title="Last refreshed">🔄 ${this._relTime(l.refreshedAt)}</span>`
                : '';

            return `
            <div class="ska-listing${l.sold ? ' sold' : ''}"
                 style="border-left-color:${clr};background:linear-gradient(135deg,${accent.bg},rgba(255,255,255,.02));">
                <div class="ska-l-row1">
                    <span class="ska-l-cat" style="background:${catBg};color:${catClr};border:1px solid ${catClr}33;">${cat.label}</span>
                    <span class="ska-l-name" title="${this._esc(name)}">${this._esc(name)}</span>
                    ${(l.itemId && (l.bonuses || []).length > 0)
                        ? `<button class="ska-l-hist" data-id="${l.id}" title="Sale history & value">📈</button>`
                        : ''}
                    <button class="ska-l-del" data-id="${l.id}" title="Remove">×</button>
                </div>
                <div class="ska-l-row2">
                    <span class="ska-l-price">${price}${histChip}</span>
                    <span class="ska-l-change">${priceChange}</span>
                    <span class="ska-l-bids">${bidsStr}</span>
                    <span class="ska-l-timeslot">${timeStr}</span>
                </div>
                <div class="ska-l-row3">
                    <span class="ska-l-seller">${seller ? `Seller: ${seller}` : ''}</span>
                    <span class="ska-l-status">${statusStr}</span>
                    <span class="ska-l-refreshed">${refreshedStr}</span>
                </div>
                ${bonusesHTML}
            </div>`;
        },

        // ── Time helpers ──────────────────────────────────────────────────────
        _formatTime(secs) {
            if (!secs || secs <= 0) return 'Ended';
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = secs % 60;
            if (h > 0) return `${h}h ${m}m`;
            if (m > 0) return `${m}m ${s}s`;
            return `${s}s`;
        },
        _esc(str) {
            return String(str ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
        },
        _relTime(ts) {
            const s = Math.floor((Date.now() - ts) / 1000);
            if (s < 60) return `${s}s ago`;
            if (s < 3600) return `${Math.floor(s / 60)}m ago`;
            if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
            const d = Math.floor(s / 86400);
            if (d < 30) return `${d}d ago`;
            const mo = Math.floor(d / 30);
            if (mo < 12) return `${mo}mo ago`;
            return `${Math.floor(mo / 12)}y ago`;
        },

        // ── Close window ──────────────────────────────────────────────────────
        _close() {
            this._stopRefresh();
            this._stopCountdown();

            this._winState.open = false;
            this._saveState();

            this._win?.remove();
            this._win = null;
        },

        // ── Draggable ─────────────────────────────────────────────────────────
        _makeDraggable(handle, win) {
            let sx, sy, ox, oy;
            handle.addEventListener('mousedown', e => {
                if (e.button !== 0) return;
                // Never swallow mousedown on interactive controls — calling
                // preventDefault() here blocks <select> dropdowns from opening
                if (e.target.closest('select, button, input, textarea')) return;
                sx = e.clientX; sy = e.clientY;
                ox = win.offsetLeft; oy = win.offsetTop;
                const move = ev => {
                    const nx = Math.max(0, ox + ev.clientX - sx);
                    const ny = Math.max(0, oy + ev.clientY - sy);
                    win.style.left = `${nx}px`;
                    win.style.top = `${ny}px`;
                };
                const up = () => {
                    document.removeEventListener('mousemove', move);
                    document.removeEventListener('mouseup', up);
                    this._winState.x = win.offsetLeft;
                    this._winState.y = win.offsetTop;
                    this._saveState();
                };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up);
                e.preventDefault();
            });
        },

        // ── Resizable ─────────────────────────────────────────────────────────
        _makeResizable(handle, win) {
            handle.addEventListener('mousedown', e => {
                if (e.button !== 0) return;
                const sw = win.offsetWidth;
                const sh = win.offsetHeight;
                const sx = e.clientX; const sy = e.clientY;
                const move = ev => {
                    const nw = Math.max(260, sw + ev.clientX - sx);
                    const nh = Math.max(120, sh + ev.clientY - sy);
                    win.style.width = `${nw}px`;
                    win.style.height = `${nh}px`;
                };
                const up = () => {
                    document.removeEventListener('mousemove', move);
                    document.removeEventListener('mouseup', up);
                    this._winState.width = win.offsetWidth;
                    this._winState.height = win.offsetHeight;
                    this._saveState();
                };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up);
                e.preventDefault();
            });
        },

        // ── amarket.php integration ────────────────────────────────────────────
        // Current amarket DOM (verified against live-page scrapers, Oct 2026):
        // rows are `li` elements under #auction-house-tabs / ul.items-list whose
        // DOM id IS the per-auction id Torn's own frontend uses. URLs only carry
        // `#/?itemtab=…&start=…` — the auction id exists in NO link or URL.
        // No visible UI is added to the rows themselves: the only button is
        // the one in the details panel. This pass just (a) remembers which
        // row was last clicked so the panel button knows which auction it is
        // looking at, and (b) drives the live re-seed through the observer.
        _injectPageButton() {
            const href = window.location.href;
            const onAmarket = href.includes('amarket.php');
            const onInventory = /\/item\.php/i.test(window.location.pathname)
                || /page\.php\?sid=inventory/i.test(href)
                || href.includes('imarket.php')
                || /page\.php\?sid=ItemMarket/i.test(href);
            if (!onAmarket && !onInventory) return;

            const self = this;

            // Inventory (item.php): the details panel gives no item id, so
            // remember the last item the user clicked via the site-wide
            // `.item-hover[item]` attribute (the market item id)
            if (onInventory) {
                if (!this._invClickArmed) {
                    this._invClickArmed = true;
                    document.addEventListener('click', e => {
                        const holder = e.target.closest?.('.item-hover[item], li[data-item], [item]');
                        const raw = holder?.getAttribute?.('item') ?? holder?.getAttribute?.('data-item');
                        const id = Number(raw);
                        if (Number.isFinite(id) && id > 0) {
                            self._lastInvItemId = id;
                            self._lastInvItemEl = holder;
                        }
                    }, true);
                }
            }

            function injectButtons() {
                if (!onAmarket) {
                    if (onInventory) self._injectInventoryButtons();
                    return;
                }

                // 1. Auction rows — invisible click-capture once per row, plus
                // the tracked-row highlight (kept in sync on every pass)
                document.querySelectorAll('ul.items-list li[id], #auction-house-tabs li[id]').forEach(li => {
                    if (li.classList.contains('last') || li.classList.contains('clear')) return;
                    const listingId = /^\d+$/.test(li.id) ? li.id : null;
                    if (!listingId) return;

                    li.classList.toggle('ska-tracked-row', !!self._listings[listingId]);

                    if (li.getAttribute(INJECT_ATTR)) return;
                    li.setAttribute(INJECT_ATTR, 'listener');

                    li.addEventListener('click', () => {
                        self._lastClickedListingId = listingId;
                    }, true);
                });

                // 2. The details-panel buttons (Track + History). Simple and
                // error-proof: the Track button ALWAYS renders (in a try-catch
                // so nothing can prevent it). The History button only renders
                // on RW items and its failures never block Track.
                document.querySelectorAll('ul[class*="properties___"]').forEach(panelUl => {
                    try {
                    // Skip if our buttons are already in the DOM
                    if (panelUl.querySelector('.ska-track-btn')) return;

                    const panelListingId = window.location.href.match(/[?&]ID=(\d+)/i)?.[1] || self._lastClickedListingId;
                    if (!panelListingId || !/^\d+$/.test(String(panelListingId))) return;

                    // Find an empty property div (React created it — safe)
                    const propDivs = Array.from(panelUl.querySelectorAll('[class*="property___"]'));
                    const emptyDiv = propDivs.find(d => !d.children.length && !d.textContent.trim());
                    if (!emptyDiv) return;

                    emptyDiv.style.justifyContent = 'center';

                    const already = !!self._listings[panelListingId];

                    const trackBtn = document.createElement('button');
                    trackBtn.className = 'ska-track-btn' + (already ? ' tracked' : '');
                    trackBtn.textContent = already ? 'Tracked' : '+ Track Listing';
                    trackBtn.title = already ? 'Already in Auction Tracker' : 'Add to Auction Tracker';
                    trackBtn.style.marginLeft = '0';
                    trackBtn.style.padding = '6px';
                    trackBtn.style.fontSize = '11px';

                    trackBtn.addEventListener('click', async e => {
                        e.stopPropagation();
                        const idNow = self._lastClickedListingId;
                        if (!idNow || !/^\d+$/.test(String(idNow))) return;
                        if (self._listings[idNow]) return;
                        trackBtn.textContent = 'Tracked';
                        trackBtn.classList.add('tracked');
                        const liClick = document.getElementById(idNow);
                        const clickSeed = liClick ? collectAuctionSeed(liClick) : {};
                        await self.addListing(idNow, clickSeed);
                    });

                    // History button: try to render on RW items, but ANY
                    // failure here must not prevent the Track button
                    let histBtn = null;
                    try {
                        const liNow = document.getElementById(panelListingId);
                        const seed = liNow ? collectAuctionSeed(liNow) : {};
                        const isRWItem = !!seed.uid && (seed.bonuses || []).length > 0;
                        if (isRWItem) {
                            histBtn = document.createElement('button');
                            histBtn.className = 'ska-track-btn hist';
                            histBtn.textContent = '📈 History';
                            histBtn.title = 'Sale history & value for this item';
                            histBtn.style.marginLeft = '0';
                            histBtn.style.padding = '6px';
                            histBtn.style.fontSize = '11px';
                            histBtn.addEventListener('click', e => {
                                e.stopPropagation();
                                const idNow = self._lastClickedListingId;
                                if (!idNow || !/^\d+$/.test(String(idNow))) return;
                                const liClick = document.getElementById(idNow);
                                const clickSeed = liClick ? collectAuctionSeed(liClick) : {};
                                self._showHistoryPopover(histBtn, clickSeed);
                            });
                        }
                    } catch (histErr) {
                        console.warn('🏷️ [AuctionTracker] History button skipped:', histErr.message);
                    }

                    if (histBtn) {
                        const wrap = document.createElement('div');
                        wrap.className = 'ska-track-btns';
                        wrap.appendChild(trackBtn);
                        wrap.appendChild(histBtn);
                        emptyDiv.appendChild(wrap);
                    } else {
                        emptyDiv.appendChild(trackBtn);
                    }

                    } catch (panelErr) {
                        console.error('🏷️ [AuctionTracker] Panel injection error:', panelErr);
                    }
                });
            }

            // Initial pass + observe for lazy-loaded rows. The same observer
            // drives the live re-seed of tracked rows as Torn re-renders them.
            // Mutations from our OWN window (its 1s countdown tick rewrites
            // span text) are ignored so the observer isn't run hot and never
            // consumes the re-seed throttle.
            injectButtons();
            new MutationObserver((muts) => {
                const ourWin = self._win;
                if (ourWin && muts.every(m => ourWin.contains(m.target))) return;
                injectButtons();
                self._reseedTracked();
            })
                .observe(document.body, { childList: true, subtree: true });
        },

        // Inventory (item.php): a lone 📈 History button in the item details
        // panel. The seed is built at CLICK time from the last-clicked item
        // (captured via the click listener in _injectPageButton) — name,
        // bonuses and rarity come from the row/panel; no ask exists in
        // inventory, so the popover shows the variant's sale value.
        _injectInventoryButtons() {
            document.querySelectorAll('ul[class*="properties___"]').forEach(panelUl => {
                try {
                    // Skip if our button is already in the DOM
                    if (panelUl.querySelector('.ska-track-btn.hist')) return;

                    // Build the seed from the panel itself
                    const seed = this._panelSeed(panelUl);
                    if (!seed.itemId || !seed.bonuses || seed.bonuses.length === 0) return;

                    // Find an empty property div (React created it — safe)
                    const propDivs = Array.from(panelUl.querySelectorAll('[class*="property___"]'));
                    const emptyDiv = propDivs.find(d => !d.children.length && !d.textContent.trim());
                    if (!emptyDiv) return;

                    emptyDiv.style.justifyContent = 'center';

                    const btn = document.createElement('button');
                    btn.className = 'ska-track-btn hist';
                    btn.textContent = '📈 History';
                    btn.title = 'Sale history & value for this item';
                    btn.style.marginLeft = '0';
                    btn.style.width = '100%';
                    btn.style.padding = '6px';
                    btn.style.fontSize = '11px';

                    btn.addEventListener('click', e => {
                        e.stopPropagation();
                        const clickSeed = this._panelSeed(panelUl);
                        if (!clickSeed.itemId) return;
                        this._showHistoryPopover(btn, clickSeed);
                    });

                    emptyDiv.appendChild(btn);
                } catch (invErr) {
                    // Silent — the button just doesn't appear for this item
                }
            });
        },

        // Build a seed from the properties panel itself — no row/hover
        // elements needed. Works on the item market (imarket.php), inventory
        // (item.php), and any page with a properties___ React panel.
        _panelSeed(panelUl) {
            const seed = {};

            // Item ID: from the URL's type= parameter (item market), or
            // from the data-item attribute on the panel's ancestor
            const typeMatch = window.location.href.match(/type=(\d+)/i);
            if (typeMatch) {
                seed.itemId = Number(typeMatch[1]);
            }
            if (!seed.itemId) {
                const holder = panelUl.closest('[data-item]') || panelUl.closest('[item]');
                const raw = holder?.getAttribute?.('data-item') || holder?.getAttribute?.('item');
                const id = Number(raw);
                if (Number.isFinite(id) && id > 0) seed.itemId = id;
            }
            if (!seed.itemId && Number.isFinite(this._lastInvItemId) && this._lastInvItemId > 0) {
                seed.itemId = this._lastInvItemId;
            }

            // Fallback: the panel's chart buttons carry an i-data attribute
            // like "i_499_444_153_33" — the first number is the item ID
            if (!seed.itemId) {
                const iDataEl = panelUl.querySelector('[i-data*="i_"]');
                const iDataMatch = iDataEl?.getAttribute('i-data')?.match(/^i_(\d+)/);
                if (iDataMatch) seed.itemId = Number(iDataMatch[1]);
            }

            // Bonus: parse from the panel's Bonus row text ("59% Quicken")
            const bonusRow = Array.from(panelUl.querySelectorAll('li'))
                .find(li => li.textContent.includes('Bonus:'));
            if (bonusRow) {
                const text = bonusRow.textContent.replace('Bonus:', '').trim();
                const bonusMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*([A-Z][A-Za-z]+)/);
                if (bonusMatch) {
                    seed.bonuses = [{
                        name: bonusMatch[2],
                        value: Number(bonusMatch[1]),
                        description: text,
                    }];
                }
            }

            // Rarity: from the CSS classes (yellow___Sn0n2 → yellow)
            const rarityEl = panelUl.querySelector('[class*="rarity___"]');
            if (rarityEl) {
                const cls = rarityEl.className;
                if (/orange/i.test(cls)) seed.rarity = 'orange';
                else if (/yellow/i.test(cls)) seed.rarity = 'yellow';
                else if (/red/i.test(cls)) seed.rarity = 'red';
            }

            // Name: from the closest heading
            const nameEl = panelUl.closest('[class*="itemInfo"]')?.querySelector('h4')
                || document.querySelector('[class*="titleContainer___"] h4, h4[class*="item"], .item-name');
            if (nameEl) seed.name = cleanItemName(nameEl.textContent.trim());

            return seed;
        },

        _inventorySeed(panelUl) {
            const seed = {};
            if (Number.isFinite(this._lastInvItemId) && this._lastInvItemId > 0) {
                seed.itemId = this._lastInvItemId;
            }

            const li = this._lastInvItemEl?.closest?.('li');
            const harvested = li ? collectAuctionSeed(li) : {};
            seed.name = harvested.name
                || cleanItemName(panelUl.closest('[class*="item"]')?.querySelector('h4, .item-name')?.textContent.trim() || '')
                || null;
            seed.bonuses = harvested.bonuses || [];
            seed.rarity = harvested.rarity || null;
            return seed;
        },
    };

    window.SidekickModules.AuctionTracker = AuctionTrackerModule;
    console.log('🏷️ Auction Tracker module registered');
})();
