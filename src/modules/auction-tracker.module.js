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
    const REFRESH_MS = 60_000;   // sale-resolution cycle (ended auctions only)
    const RESEED_MS = 2_000;      // live re-harvest throttle while on amarket
    const MAX_SALE_ATTEMPTS = 5;  // clean-miss budget before settling as expired
    const SALE_RETRY_GAP_SEC = 55;
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

    function parseMoneyText(text) {
        const digits = String(text || '').replace(/[^0-9]/g, '');
        return digits ? Number(digits) : null;
    }

    // Torn amarket titles carry the rarity tag + instance number after the
    // item name itself — e.g. "P90 (common 2341234123)". The tag's on-screen
    // ALL-CAPS look comes from CSS text-transform; the DOM text is lowercase,
    // so we can't match on case. Instead strip a trailing parenthetical when
    // it contains a long digit run (the item-instance uid — 5+ digits, never
    // part of a real item name) or an ALL-CAPS token; genuine parentheticals
    // like "... (large)" or "... (x5)" are left alone.
    function cleanItemName(raw) {
        return String(raw || '')
            .replace(/\s*\((?:[^()]*\d{5,}[^()]*|[^()]*\b[A-Z]{2,}\b[^()]*)\)\s*$/, '')
            .trim();
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

        // Item id + item-instance uid: the hooks the sale-resolution lookup
        // anchors on (item-scoped completed-sales feed).
        const hover = li.querySelector('.item-hover');
        const itemId = Number(hover?.getAttribute('item'))
            || Number(li.querySelector('.item-name')?.getAttribute('href')?.match(/[?&]ID=(\d+)/)?.[1])
            || Number(li.querySelector('img[src*="/images/items/"]')?.getAttribute('src')?.match(/\/images\/items\/(\d+)\//)?.[1]);
        if (Number.isFinite(itemId) && itemId > 0) seed.itemId = itemId;
        const uidRaw = hover?.getAttribute('armoury');
        if (uidRaw && /^\d+$/.test(String(uidRaw).trim())) seed.uid = String(uidRaw).trim();

        const bidText = li.querySelector('.c-bid-wrap, .top-bid-mob-wrap, .price-wrap')?.textContent || '';
        const price = /none/i.test(bidText) ? 0 : parseMoneyText(bidText);
        if (price !== null) seed.price = price;

        const bids = Number(li.querySelector('.bids-wrap')?.textContent.match(/(\d+)\s*bids?/i)?.[1] ?? 0);
        if (bids) seed.bids = bids;

        const endsAt = parseEndsTitle(
            li.querySelector('.time-wrap span[title], .time-mob-wrap span[title], span[title*="Ends on"]')?.getAttribute('title')
        );
        if (endsAt) seed.endsAt = endsAt;

        const glowEl = li.querySelector('.item-plate[class*="glow-"], [class*="glow-"]');
        const rarity = (glowEl?.className.match(/glow-(yellow|orange|red)/) || li.className.match(/glow-(yellow|orange|red)/))?.[1];
        if (rarity) seed.rarity = rarity;

        const bonuses = Array.from(li.querySelectorAll('.iconsbonuses .bonus-attachment-icons[title], .iconsbonuses span[title]'))
            .map(span => {
                const raw = span.getAttribute('title') || '';
                const bName = raw.match(/<b[^>]*>\s*([^<]+?)\s*<\/b>/i)?.[1]
                    || raw.split(/<br/i)[0].replace(/<[^>]*>/g, '').trim();
                if (!bName) return null;
                const description = raw.split(/<br\s*\/?>/i).slice(1).join(' ').replace(/<[^>]*>/g, '').trim();
                const value = Number(description.match(/(\d+(?:\.\d+)?)\s*%/)?.[1] ?? 0) || 0;
                return { name: bName, value, description };
            })
            .filter(Boolean);
        if (bonuses.length) seed.bonuses = bonuses;

        const category = li.closest('#types-tab-1') ? 'weapon'
            : li.closest('#types-tab-2') ? 'armor' : null;
        if (category) seed.category = category;

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
        },

        async _saveState() {
            const CS = window.SidekickModules?.Core?.ChromeStorage;
            if (!CS) return;
            await CS.set(STORAGE_KEY, { listings: this._listings });
            await CS.set(WINDOW_KEY, this._winState);
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

            const path = `market/${itemId}/auctionhouse?from=${fromSec}&to=${toSec}&limit=100&sort=DESC`;
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
        // available): same seller with the sale ending inside a ±15 min
        // window of the row's advertised end time.
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
            return Math.abs(sale.timestamp - l.endsAt) <= 900;
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
                const sales = await this._fetchItemSales(l.itemId, l.endsAt - 600, l.endsAt + 3600);
                if (sales === null) return; // no API key — silent, retry later

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
            const ids = Object.keys(this._listings);
            for (const id of ids) await this._refreshOne(id);
        },

        _removeListing(listingId) {
            delete this._listings[listingId];
            this._saveState();
            this._renderList();
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
        // resolver the moment a tracked auction's timer hits 0.
        _startCountdown() {
            this._stopCountdown();
            this._tickTimer = setInterval(() => {
                if (!this._win || !document.contains(this._win)) return;
                const nowSec = Math.floor(Date.now() / 1000);
                this._win.querySelectorAll('.ska-l-time[data-ends]').forEach(el => {
                    const remaining = Number(el.dataset.ends) - nowSec;
                    el.textContent = `⏱ ${remaining > 0 ? this._formatTime(remaining) : 'Ended'}`;
                    el.classList.toggle('ended', remaining <= 0);
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
            #${WIN_ID} .ska-tw-actions {
                display: flex;
                gap: 6px;
                align-items: center;
            }
            #${WIN_ID} .ska-tw-btn {
                background: rgba(255,255,255,.07);
                border: 1px solid rgba(255,255,255,.1);
                color: rgba(255,255,255,.75);
                border-radius: 5px;
                padding: 3px 9px;
                font-size: 11px;
                cursor: pointer;
                transition: background .15s;
                font-family: inherit;
            }
            #${WIN_ID} .ska-tw-btn:hover { background: rgba(255,255,255,.14); color: #fff; }
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

            #${WIN_ID} .ska-l-row2 {
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 11px;
                color: rgba(255,255,255,.55);
                flex-wrap: wrap;
            }
            #${WIN_ID} .ska-l-price {
                font-weight: 700;
                font-size: 12px;
                color: #fff;
            }
            #${WIN_ID} .ska-l-drop { color: #22c55e; font-size: 10.5px; margin-left: -8px; }
            #${WIN_ID} .ska-l-rise { color: #ef4444; font-size: 10.5px; margin-left: -8px; }
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
                    <div class="ska-tw-actions">
                        <button class="ska-tw-btn" id="ska-tw-refresh" title="Refresh all listings">↻ Refresh</button>
                    </div>
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
            win.querySelector('#ska-tw-refresh').addEventListener('click', () => this._refreshAll());


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

            // Sort by addedAt descending (newest first)
            entries.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

            body.innerHTML = entries.map(l => this._listingHTML(l)).join('');

            // Wire delete buttons
            body.querySelectorAll('.ska-l-del').forEach(btn => {
                btn.addEventListener('click', () => this._removeListing(btn.dataset.id));
            });
        },

        _listingHTML(l) {
            const cat = CATEGORY_COLORS[l.category] || CATEGORY_COLORS.item;
            const accent = RARITY_COLORS[l.rarity] || cat;
            const catBg = cat.bg;
            const catClr = cat.border;
            const clr = accent.border;

            const name = l.name || `Listing #${l.id}`;
            const price = l.price ? `$${Number(l.price).toLocaleString()}` : '—';
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
            // the data-ends spans in place between API refreshes
            let timeStr = '';
            if (l.endsAt) {
                const remaining = l.endsAt - Math.floor(Date.now() / 1000);
                timeStr = remaining > 0
                    ? `<span class="ska-l-time" data-ends="${l.endsAt}">⏱ ${this._formatTime(remaining)}</span>`
                    : `<span class="ska-l-time ended">⏱ Ended</span>`;
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
                    <button class="ska-l-del" data-id="${l.id}" title="Remove">×</button>
                </div>
                <div class="ska-l-row2">
                    ${loading}
                    ${errMsg}
                    ${l.price ? `<span class="ska-l-price">${price}</span>${priceChange}` : ''}
                    ${seller ? `Seller: ${seller}` : ''}
                    ${bidsStr}
                    ${timeStr}
                    ${soldBadge}
                    ${refreshedStr}
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
            return `${Math.floor(s / 3600)}h ago`;
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
            if (!window.location.href.includes('amarket.php')) return;

            const self = this;

            function injectButtons() {
                // 1. Auction rows — attach the (invisible) click-capture once
                document.querySelectorAll('ul.items-list li[id], #auction-house-tabs li[id]').forEach(li => {
                    if (li.classList.contains('last') || li.classList.contains('clear')) return;
                    if (li.getAttribute(INJECT_ATTR)) return;

                    const listingId = /^\d+$/.test(li.id) ? li.id : null;
                    if (!listingId) return;
                    li.setAttribute(INJECT_ATTR, 'listener');

                    li.addEventListener('click', () => {
                        self._lastClickedListingId = listingId;
                    }, true);
                });

                // 2. The details-panel track button. The panel is reused
                // across listings, so rebind whenever the open listing
                // changes and resolve the id at CLICK time — a button frozen
                // to a previous listing would track the wrong auction.
                document.querySelectorAll('ul[class*="properties___"]').forEach(panelUl => {
                    const panelListingId = window.location.href.match(/[?&]ID=(\d+)/i)?.[1] || self._lastClickedListingId;
                    if (!panelListingId || !/^\d+$/.test(String(panelListingId))) return;
                    if (panelUl.getAttribute(INJECT_ATTR) === String(panelListingId)) return;

                    // Retire a button bound to a previous listing
                    panelUl.querySelector('.ska-track-btn')?.remove();
                    panelUl.setAttribute(INJECT_ATTR, String(panelListingId));

                    const already = !!self._listings[panelListingId];

                    // Find an empty property div to inject into, instead of adding a new li
                    const propDivs = Array.from(panelUl.querySelectorAll('[class*="property___"]'));
                    const emptyDiv = propDivs.find(d => !d.children.length && !d.textContent.trim());

                    if (!emptyDiv) {
                        // No slot yet — allow a later pass to retry
                        panelUl.removeAttribute(INJECT_ATTR);
                        return;
                    }

                    emptyDiv.style.justifyContent = 'center';

                    const trackBtn = document.createElement('button');
                    trackBtn.className = 'ska-track-btn' + (already ? ' tracked' : '');
                    trackBtn.textContent = already ? 'Tracked' : '+ Track Listing';
                    trackBtn.title = already ? 'Already in Auction Tracker' : 'Add to Auction Tracker';
                    // Override some row button styles for the panel
                    trackBtn.style.marginLeft = '0';
                    trackBtn.style.width = '100%';
                    trackBtn.style.padding = '6px';
                    trackBtn.style.fontSize = '11px';

                    trackBtn.addEventListener('click', async e => {
                        e.stopPropagation();
                        const idNow = self._lastClickedListingId;
                        if (!idNow || !/^\d+$/.test(String(idNow))) return;
                        if (self._listings[idNow]) return;

                        trackBtn.textContent = 'Tracked';
                        trackBtn.classList.add('tracked');

                        const liNow = document.getElementById(idNow);
                        const seed = liNow ? collectAuctionSeed(liNow) : {};
                        if (!seed.name) {
                            const titleEl = document.querySelector('[class*="titleContainer___"] h4, .title-wrap h4, .item-name');
                            if (titleEl) seed.name = cleanItemName(titleEl.textContent.trim());
                        }

                        await self.addListing(idNow, seed);
                    });

                    emptyDiv.appendChild(trackBtn);
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
    };

    window.SidekickModules.AuctionTracker = AuctionTrackerModule;
    console.log('🏷️ Auction Tracker module registered');
})();
