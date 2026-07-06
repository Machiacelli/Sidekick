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
    const STORAGE_KEY   = 'sidekick_auction_tracker';
    const WINDOW_KEY    = 'sidekick_auction_tracker_window';
    const REFRESH_MS    = 60_000;   // auto-refresh every 60 s
    const STYLE_ID      = 'ska-tracker-styles';
    const WIN_ID        = 'ska-tracker-win';
    const INJECT_ATTR   = 'data-ska-tracked';

    // Category → accent colour mapping (matches Torn rarity glow palette)
    const CATEGORY_COLORS = {
        weapon:   { border: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  label: 'Weapon'   },
        armor:    { border: '#3b82f6', bg: 'rgba(59,130,246,0.08)',   label: 'Armor'    },
        clothing: { border: '#ec4899', bg: 'rgba(236,72,153,0.08)',   label: 'Clothing' },
        drug:     { border: '#a855f7', bg: 'rgba(168,85,247,0.08)',   label: 'Drug'     },
        medical:  { border: '#22c55e', bg: 'rgba(34,197,94,0.08)',    label: 'Medical'  },
        enhancer: { border: '#06b6d4', bg: 'rgba(6,182,212,0.08)',    label: 'Enhancer' },
        item:     { border: '#78716c', bg: 'rgba(120,113,108,0.08)',  label: 'Item'     },
    };

    // ── Torn API item_type → category key ─────────────────────────────────────
    function categoryFromType(type) {
        if (!type) return 'item';
        const t = type.toLowerCase();
        if (t.includes('weapon') || t.includes('melee') || t.includes('primary') || t.includes('secondary') || t.includes('temporary'))  return 'weapon';
        if (t.includes('armor') || t.includes('armour')) return 'armor';
        if (t.includes('clothing'))                        return 'clothing';
        if (t.includes('drug'))                            return 'drug';
        if (t.includes('medical'))                         return 'medical';
        if (t.includes('enhancer'))                        return 'enhancer';
        return 'item';
    }

    // ── Module ─────────────────────────────────────────────────────────────────
    const AuctionTrackerModule = {
        isInitialized: false,
        _win:          null,   // DOM window element
        _listings:     {},     // { id: { ...cached data } }
        _refreshTimer: null,
        _winState:     { x: 120, y: 80, width: 520 },

        // ── Init ───────────────────────────────────────────────────────────────
        async init() {
            if (this.isInitialized) return;
            try {
                await this._loadState();
                this._injectStyles();
                this._injectPageButton();   // track-button on amarket.php rows
                this.isInitialized = true;
                console.log('🏷️ Auction Tracker initialized');
            } catch (e) {
                console.error('❌ Auction Tracker init error:', e);
            }
        },

        // ── Public: called by ui.module.js when user clicks "+ Auction Tracker" ──
        async open() {
            if (!this.isInitialized) await this.init();
            if (this._win && document.contains(this._win)) {
                // bring to front
                this._win.style.zIndex = this._nextZ();
                return;
            }
            this._buildWindow();
            this._startRefresh();
            await this._refreshAll();
        },

        // ── State persistence ──────────────────────────────────────────────────
        async _loadState() {
            const CS = window.SidekickModules?.Core?.ChromeStorage;
            if (!CS) return;
            const saved = await CS.get(STORAGE_KEY);
            if (saved?.listings) this._listings = saved.listings;
            const ws = await CS.get(WINDOW_KEY);
            if (ws) this._winState = { ...this._winState, ...ws };
        },

        async _saveState() {
            const CS = window.SidekickModules?.Core?.ChromeStorage;
            if (!CS) return;
            await CS.set(STORAGE_KEY,  { listings: this._listings });
            await CS.set(WINDOW_KEY,   this._winState);
        },

        // ── Listing data API ──────────────────────────────────────────────────
        async _fetchListing(listingId) {
            const CS  = window.SidekickModules?.Core?.ChromeStorage;
            const key = CS ? await CS.get('sidekick_api_key') : null;
            if (!key) throw new Error('No API key configured');

            return new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action:   'fetchTornApi',
                    apiKey:   key,
                    selections: [],
                    endpoint: `market/${listingId}`,
                }, res => {
                    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                    if (!res?.success) return reject(new Error(res?.error || 'API error'));
                    resolve(res);
                });
            });
        },

        // ── Add a listing (called by inject button or manually) ───────────────
        async addListing(listingId, seedData = {}) {
            listingId = String(listingId).trim();
            if (!listingId) return;
            if (!this.isInitialized) await this.init();

            // Store seed data immediately so the UI shows the row right away
            this._listings[listingId] = {
                id:        listingId,
                addedAt:   Date.now(),
                loading:   true,
                ...seedData,
            };
            await this._saveState();

            if (this._win && document.contains(this._win)) {
                this._renderList();
            } else {
                await this.open();
            }

            // Fire background fetch
            this._refreshOne(listingId);
        },

        async _refreshOne(listingId) {
            try {
                const data = await this._fetchListing(listingId);
                const prev = this._listings[listingId] || {};

                // Parse Torn market API response
                // The endpoint returns { success, market: { ...listing fields }, item: { ...} }
                const market = data.market || data;
                const item   = data.item   || {};

                const price    = market.cost        ?? market.price      ?? prev.price    ?? 0;
                const prevPrice = prev.price && !prev.loading ? prev.price : null;

                this._listings[listingId] = {
                    id:          listingId,
                    addedAt:     prev.addedAt || Date.now(),
                    loading:     false,
                    name:        item.name        || market.item_name     || prev.name     || `Listing #${listingId}`,
                    category:    categoryFromType(item.type || market.item_type || prev.category || ''),
                    sellerId:    market.seller_id  || market.user_id      || prev.sellerId || null,
                    sellerName:  market.seller_name || market.name        || prev.sellerName || '—',
                    price,
                    prevPrice,
                    quantity:    market.quantity   ?? prev.quantity       ?? 1,
                    bids:        market.bids       ?? prev.bids           ?? 0,
                    timeLeft:    market.time_left  ?? market.expires      ?? prev.timeLeft ?? null,
                    bonuses:     item.bonuses      || market.bonuses      || prev.bonuses  || [],
                    sold:        market.sold       === 1 || market.is_sold === true || prev.sold || false,
                    refreshedAt: Date.now(),
                };
            } catch (e) {
                console.warn(`🏷️ [AuctionTracker] Could not refresh listing ${listingId}:`, e.message);
                if (this._listings[listingId]) {
                    this._listings[listingId].error   = e.message;
                    this._listings[listingId].loading = false;
                }
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

        // ── Auto-refresh ──────────────────────────────────────────────────────
        _startRefresh() {
            this._stopRefresh();
            this._refreshTimer = setInterval(() => this._refreshAll(), REFRESH_MS);
        },
        _stopRefresh() {
            if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
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
                min-width: 420px;
                min-height: 180px;
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

            /* Toolbar */
            #${WIN_ID} .ska-tw-toolbar {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 14px;
                border-bottom: 1px solid rgba(255,255,255,.06);
                flex-shrink: 0;
            }
            #${WIN_ID} .ska-tw-addinput {
                flex: 1;
                background: rgba(255,255,255,.06);
                border: 1px solid rgba(255,255,255,.1);
                border-radius: 6px;
                padding: 5px 10px;
                color: #fff;
                font-size: 11.5px;
                font-family: inherit;
                outline: none;
                transition: border-color .15s;
            }
            #${WIN_ID} .ska-tw-addinput:focus { border-color: rgba(245,158,11,.55); }
            #${WIN_ID} .ska-tw-addinput::placeholder { color: rgba(255,255,255,.3); }
            #${WIN_ID} .ska-tw-addbtn {
                background: rgba(245,158,11,.18);
                border: 1px solid rgba(245,158,11,.45);
                color: #f59e0b;
                border-radius: 6px;
                padding: 5px 13px;
                font-size: 11.5px;
                cursor: pointer;
                transition: background .15s;
                font-weight: 600;
                font-family: inherit;
            }
            #${WIN_ID} .ska-tw-addbtn:hover { background: rgba(245,158,11,.3); }

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
                color: #ef4444;
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
            const contentArea = document.getElementById('sidekick-content');
            const maxW = contentArea ? contentArea.clientWidth : window.innerWidth;
            const maxH = contentArea ? contentArea.clientHeight : window.innerHeight;
            
            let startX = this._winState.x || 10;
            let startY = this._winState.y || 10;
            
            // If the saved position is outside the container (e.g. from previous position:fixed), reset it
            if (startX > maxW - 50) startX = 10;
            if (startY > maxH - 50) startY = 10;
            
            win.style.left   = `${startX}px`;
            win.style.top    = `${startY}px`;
            win.style.width  = `${Math.min(this._winState.width || 520, maxW - 20)}px`;
            this._win = win;

            win.innerHTML = `
                <div class="ska-tw-header" id="ska-tw-drag">
                    <span class="ska-tw-title">🏷️ Auction Tracker</span>
                    <div class="ska-tw-actions">
                        <button class="ska-tw-btn" id="ska-tw-refresh" title="Refresh all listings">↻ Refresh</button>
                    </div>
                    <button class="ska-tw-close" id="ska-tw-close" title="Close">×</button>
                </div>
                <div class="ska-tw-toolbar">
                    <input class="ska-tw-addinput" id="ska-tw-input"
                           placeholder="Paste listing URL or ID (e.g. 42069) and press Add"
                           type="text" />
                    <button class="ska-tw-addbtn" id="ska-tw-add">+ Add</button>
                </div>
                <div class="ska-tw-body" id="ska-tw-body"></div>
                <div class="ska-tw-resize" id="ska-tw-resize"></div>
            `;

            const contentArea = document.getElementById('sidekick-content');
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

            const input = win.querySelector('#ska-tw-input');
            const addFn = () => {
                const raw = input.value.trim();
                if (!raw) return;
                const id = this._parseListingId(raw);
                if (!id) { input.style.borderColor = '#ef4444'; return; }
                input.style.borderColor = '';
                input.value = '';
                this.addListing(id);
            };
            win.querySelector('#ska-tw-add').addEventListener('click', addFn);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') addFn(); });

            this._makeDraggable(win.querySelector('#ska-tw-drag'), win);
            this._makeResizable(win.querySelector('#ska-tw-resize'), win);

            // Click-to-front
            win.addEventListener('mousedown', () => { win.style.zIndex = this._nextZ(); });

            this._renderList();
        },

        // ── Parse a listing ID from URL or raw number ─────────────────────────
        _parseListingId(raw) {
            // Full URL: https://www.torn.com/amarket.php#/p=item&step=item&ID=12345&tab=...
            const urlMatch = raw.match(/ID=(\d+)/i) || raw.match(/listing[=/](\d+)/i);
            if (urlMatch) return urlMatch[1];
            // Plain number
            if (/^\d+$/.test(raw)) return raw;
            return null;
        },

        // ── Render the listing list ───────────────────────────────────────────
        _renderList() {
            const body = this._win?.querySelector('#ska-tw-body');
            if (!body) return;

            const entries = Object.values(this._listings);
            if (!entries.length) {
                body.innerHTML = `<div class="ska-tw-empty">
                    No listings tracked yet.<br>
                    Paste a listing ID above, or click <strong>+ Track</strong> on any auction listing.
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
            const cat   = CATEGORY_COLORS[l.category] || CATEGORY_COLORS.item;
            const catBg = cat.bg;
            const clr   = cat.border;

            const price   = l.price    ? `$${Number(l.price).toLocaleString()}` : '—';
            const seller  = l.sellerId
                ? `<a href="https://www.torn.com/profiles.php?XID=${l.sellerId}" target="_blank" rel="noopener"
                      style="color:${clr};text-decoration:none;">${l.sellerName || l.sellerId}</a>`
                : (l.sellerName || '—');

            // Price change indicator
            let priceChange = '';
            if (l.prevPrice && l.price && l.price !== l.prevPrice) {
                const diff = l.price - l.prevPrice;
                priceChange = diff < 0
                    ? `<span class="ska-l-drop">▼ $${Math.abs(diff).toLocaleString()}</span>`
                    : `<span class="ska-l-rise">▲ $${diff.toLocaleString()}</span>`;
            }

            // Time left
            const timeLeft = l.timeLeft ? this._formatTime(l.timeLeft) : '';
            const timeStr  = timeLeft ? `⏱ ${timeLeft}` : '';

            // Bids
            const bidsStr = l.bids !== undefined && l.bids !== null ? `🔨 ${l.bids} bid${l.bids !== 1 ? 's' : ''}` : '';

            // Sold badge
            const soldBadge = l.sold ? `<span class="ska-l-sold-badge">⚠️ Sold / Expired</span>` : '';

            // Bonuses
            let bonusesHTML = '';
            if (Array.isArray(l.bonuses) && l.bonuses.length) {
                const pills = l.bonuses.map(b => {
                    const name = b.name || b.bonus_name || b;
                    const val  = b.value || b.percentage || '';
                    return `<span class="ska-l-bonus">${name}${val ? ` ${val}%` : ''}</span>`;
                }).join('');
                bonusesHTML = `<div class="ska-l-bonuses">${pills}</div>`;
            }

            const loading = l.loading
                ? `<span class="ska-l-loading">Fetching data…</span>`
                : '';
            const errMsg = l.error && !l.loading
                ? `<span class="ska-l-error">⚠ ${l.error}</span>`
                : '';

            // Last refreshed
            const refreshedStr = l.refreshedAt
                ? `<span title="Last refreshed">🔄 ${this._relTime(l.refreshedAt)}</span>`
                : '';

            return `
            <div class="ska-listing${l.sold ? ' sold' : ''}"
                 style="border-left-color:${clr};background:linear-gradient(135deg,${catBg},rgba(255,255,255,.02));">
                <div class="ska-l-row1">
                    <span class="ska-l-cat" style="background:${catBg};color:${clr};border:1px solid ${clr}33;">${cat.label}</span>
                    <span class="ska-l-name" title="${(l.name || '').replace(/"/g, '&quot;')}">${l.name || `Listing #${l.id}`}</span>
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
            return h > 0 ? `${h}h ${m}m` : `${m}m`;
        },
        _relTime(ts) {
            const s = Math.floor((Date.now() - ts) / 1000);
            if (s < 60)  return `${s}s ago`;
            if (s < 3600) return `${Math.floor(s/60)}m ago`;
            return `${Math.floor(s/3600)}h ago`;
        },

        // ── Close window ──────────────────────────────────────────────────────
        _close() {
            this._stopRefresh();
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
                    win.style.top  = `${ny}px`;
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
                    const nw = Math.max(380, sw + ev.clientX - sx);
                    const nh = Math.max(180, sh + ev.clientY - sy);
                    win.style.width  = `${nw}px`;
                    win.style.height = `${nh}px`;
                };
                const up = () => {
                    document.removeEventListener('mousemove', move);
                    document.removeEventListener('mouseup', up);
                    this._winState.width  = win.offsetWidth;
                    this._winState.height = win.offsetHeight;
                    this._saveState();
                };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up);
                e.preventDefault();
            });
        },

        // ── Inject "Track" button on amarket.php listing rows ─────────────────
        _injectPageButton() {
            if (!window.location.href.includes('amarket.php')) return;

            const self = this;

            function injectButtons() {
                // 1. Torn auction rows have bid buttons — find the listing ID from the row
                document.querySelectorAll('ul.items-list li').forEach(li => {
                    if (li.classList.contains('last') || li.classList.contains('clear')) return;
                    if (li.getAttribute(INJECT_ATTR)) return;
                    li.setAttribute(INJECT_ATTR, 'pending');

                    // Try to find an ID from the bid/view link or data attributes
                    const bidLink  = li.querySelector('a[href*="step=item"]') || li.querySelector('a[href*="ID="]');
                    const listingId = bidLink
                        ? (bidLink.href.match(/ID=(\d+)/i)?.[1])
                        : null;

                    if (!listingId) return;

                    // Capture clicks on the row to remember the active listing ID
                    li.addEventListener('click', () => {
                        self._lastClickedListingId = listingId;
                    }, true);

                    // Grab item name from DOM for seed data
                    const nameEl = li.querySelector('.title-wrap h4, span.title, .item-name');
                    const name   = nameEl?.textContent.trim() || null;

                    // Find the price element to anchor the button next to
                    const priceEl = li.querySelector('.price-wrap, .current-bid, [class*="price"]');
                    if (!priceEl) return;

                    const already = self._listings[listingId];

                    const btn = document.createElement('button');
                    btn.className    = 'ska-track-btn' + (already ? ' tracked' : '');
                    btn.textContent  = already ? '✓ Tracked' : '+ Track';
                    btn.title        = already ? 'Already in Auction Tracker' : 'Add to Auction Tracker';
                    btn.setAttribute(INJECT_ATTR, listingId);

                    if (!already) {
                        btn.addEventListener('click', async e => {
                            e.stopPropagation();
                            btn.textContent = '✓ Tracked';
                            btn.classList.add('tracked');
                            await self.addListing(listingId, { name });
                        });
                    }

                    priceEl.appendChild(btn);
                    li.setAttribute(INJECT_ATTR, listingId);
                });

                // 2. Inject into the React details panel if open
                document.querySelectorAll('ul[class*="properties___"]').forEach(panelUl => {
                    if (panelUl.getAttribute(INJECT_ATTR)) return;
                    
                    // We can usually get the listing ID from the URL when a panel is open,
                    // otherwise fall back to the row that was just clicked.
                    const urlMatch = window.location.href.match(/ID=(\d+)/i) || window.location.href.match(/listing[=/](\d+)/i);
                    const panelListingId = (urlMatch ? urlMatch[1] : null) || self._lastClickedListingId;

                    if (!panelListingId) return;
                    panelUl.setAttribute(INJECT_ATTR, 'pending');
                    
                    const already = self._listings[panelListingId];
                    
                    // Find an empty property div to inject into, instead of adding a new li
                    const propDivs = Array.from(panelUl.querySelectorAll('.property___gpda9'));
                    const emptyDiv = propDivs.find(d => !d.children.length && !d.textContent.trim());
                    
                    if (!emptyDiv) return;
                    
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
                    
                    if (!already) {
                        trackBtn.addEventListener('click', async e => {
                            e.stopPropagation();
                            trackBtn.textContent = 'Tracked';
                            trackBtn.classList.add('tracked');
                            
                            // Try to find the title from the panel header
                            const titleEl = document.querySelector('[class*="titleContainer___"] h4, .title-wrap h4');
                            const name = titleEl?.textContent.trim() || null;
                            
                            await self.addListing(panelListingId, { name });
                        });
                    }
                    
                    emptyDiv.appendChild(trackBtn);
                    panelUl.setAttribute(INJECT_ATTR, panelListingId);
                });
            }

            // Initial pass + observe for lazy-loaded rows
            injectButtons();
            new MutationObserver(() => injectButtons())
                .observe(document.body, { childList: true, subtree: true });
        },
    };

    window.SidekickModules.AuctionTracker = AuctionTrackerModule;
    console.log('🏷️ Auction Tracker module registered');
})();
