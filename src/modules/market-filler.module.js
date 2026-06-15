// Item Market Filler Module
// Adds Fill + Info buttons to the RIGHT of each item row (outside native Torn UI)
// so the price field is never cropped. Info popup opens to the right.
// Settings shared with sidekick_market_filler_prefs (same key as PriceFiller module).

const MarketFillerModule = (() => {
    const MARKET_TAX = 0.05;
    const PREFS_KEY  = 'sidekick_market_filler_prefs';

    let priceDelta       = '-1';
    let marketSlotOffset = 0;
    let pageObserver     = null;
    let listingCache     = {};

    // ─── Settings ─────────────────────────────────────────────────────────────
    async function CS() { return window.SidekickModules?.Core?.ChromeStorage; }

    async function loadSettings() {
        try {
            const cs = await CS();
            if (!cs) return;
            const data = await cs.get(PREFS_KEY);
            if (data) {
                priceDelta       = data.imPriceDelta       ?? data.priceDelta       ?? '-1';
                marketSlotOffset = data.imSlotOffset        ?? data.marketSlotOffset ?? 0;
            }
        } catch (e) { console.error('[MarketFiller] loadSettings:', e); }
    }

    async function savePrefs(patch) {
        try {
            const cs = await CS();
            if (!cs) return;
            const cur = await cs.get(PREFS_KEY) || {};
            await cs.set(PREFS_KEY, { ...cur, ...patch });
        } catch (e) { console.error('[MarketFiller] savePrefs:', e); }
    }

    // ─── Styles ───────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('sk-mf-styles')) return;
        const s = document.createElement('style');
        s.id = 'sk-mf-styles';
        s.textContent = `
            .sk-mf-action-wrap {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-left: 8px;
                flex-shrink: 0;
                vertical-align: middle;
            }
            .sk-mf-fill-btn, .sk-mf-info-btn {
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 700;
                height: 24px;
                padding: 0 8px;
                white-space: nowrap;
                transition: background .15s, box-shadow .15s;
                font-family: inherit;
                line-height: 24px;
            }
            .sk-mf-fill-btn {
                background: linear-gradient(135deg, #3a8a3e, #4fa854);
                color: #fff;
            }
            .sk-mf-fill-btn:hover:not(.active) {
                background: linear-gradient(135deg, #4aa84e, #62c066);
                box-shadow: 0 0 6px rgba(95,204,106,0.4);
            }
            .sk-mf-fill-btn.active {
                background: linear-gradient(135deg, #1a4a2e, #254f30);
                color: #7fbd84;
            }
            .sk-mf-info-btn {
                background: rgba(91,155,213,0.15);
                border: 1px solid rgba(91,155,213,0.35);
                color: #5b9bd5;
            }
            .sk-mf-info-btn:hover {
                background: rgba(91,155,213,0.28);
            }
            #sk-mf-popup {
                display: none;
                position: fixed;
                z-index: 99999;
                background: #1a2332;
                border: 1px solid rgba(95,204,106,0.2);
                border-radius: 8px;
                padding: 10px 14px;
                font-size: 13px;
                color: #ccc;
                box-shadow: 0 6px 24px rgba(0,0,0,0.7);
                min-width: 230px;
                max-width: 300px;
                pointer-events: auto;
            }
            #sk-mf-popup-drag {
                cursor: move;
                font-size: 11px;
                color: rgba(95,204,106,0.6);
                border-bottom: 1px solid rgba(255,255,255,0.08);
                padding-bottom: 6px;
                margin-bottom: 8px;
                user-select: none;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #sk-mf-popup-close {
                cursor: pointer;
                color: #888;
                font-size: 18px;
                line-height: 1;
                padding: 0 2px;
            }
            #sk-mf-popup-close:hover { color: #fff; }
            .sk-mf-listing-row {
                cursor: pointer;
                padding: 4px 2px;
                border-radius: 4px;
                transition: background .1s;
                font-size: 12px;
            }
            .sk-mf-listing-row:hover { background: rgba(255,255,255,0.07); }
            #sk-mf-popup-footer {
                margin-top: 8px;
                border-top: 1px solid rgba(255,255,255,0.07);
                padding-top: 6px;
                font-size: 10px;
                color: rgba(255,255,255,0.35);
                display: flex;
                gap: 8px;
                align-items: center;
            }
            #sk-mf-edit-link {
                color: #5b9bd5;
                cursor: pointer;
                text-decoration: none;
                margin-left: auto;
            }
            #sk-mf-edit-link:hover { text-decoration: underline; }
        `;
        document.head.appendChild(s);
    }

    // ─── Popup ─────────────────────────────────────────────────────────────────
    let popupDragX = 0, popupDragY = 0, isDragging = false;
    let recentFill = null;

    function ensurePopup() {
        if (document.getElementById('sk-mf-popup')) return;
        const el = document.createElement('div');
        el.id = 'sk-mf-popup';
        el.innerHTML = `
            <div id="sk-mf-popup-drag">
                ⋮⋮ Market Filler
                <span id="sk-mf-popup-close">×</span>
            </div>
            <div id="sk-mf-popup-body"></div>
            <div id="sk-mf-popup-footer">
                Offset: <b id="sk-mf-delta-lbl"></b> &nbsp;|&nbsp; Slot: <b id="sk-mf-slot-lbl"></b>
                <a id="sk-mf-edit-link" href="#">Edit</a>
            </div>`;
        document.body.appendChild(el);

        el.querySelector('#sk-mf-popup-close').onclick = () => el.style.display = 'none';
        el.querySelector('#sk-mf-edit-link').onclick = e => { e.preventDefault(); openSettingsPrompt(); };

        const drag = el.querySelector('#sk-mf-popup-drag');
        drag.addEventListener('mousedown', e => {
            isDragging = true;
            popupDragX = e.clientX - el.offsetLeft;
            popupDragY = e.clientY - el.offsetTop;
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            el.style.left = (e.clientX - popupDragX) + 'px';
            el.style.top  = (e.clientY - popupDragY) + 'px';
        });
        document.addEventListener('mouseup', () => isDragging = false);
    }

    function showPopup(anchorEl, listings, loading) {
        ensurePopup();
        const popup = document.getElementById('sk-mf-popup');
        const body  = popup.querySelector('#sk-mf-popup-body');
        popup.querySelector('#sk-mf-delta-lbl').textContent = priceDelta;
        popup.querySelector('#sk-mf-slot-lbl').textContent  = `#${marketSlotOffset + 1}`;

        if (loading) {
            body.innerHTML = '<span style="color:#888;">Loading prices…</span>';
        } else if (!listings?.length) {
            body.innerHTML = '<span style="color:#e57373;">No listings found</span>';
        } else {
            body.innerHTML = listings.slice(0, 5).map((l, i) => `
                <div class="sk-mf-listing-row" data-price="${l.price}">
                    <b style="color:rgba(255,255,255,0.7);">#${i + 1}</b>
                    <span style="color:#eee;"> ${l.amount}x</span>
                    @ <span style="color:#5fcc6a;">$${fmt(l.price)}</span>
                    <span style="color:rgba(255,255,255,0.35);font-size:10px;"> ($${fmt(Math.round(l.price*(1-MARKET_TAX)))} net)</span>
                </div>`).join('');
            popup.querySelectorAll('.sk-mf-listing-row').forEach(row => {
                row.addEventListener('click', () => {
                    const p = parseInt(row.dataset.price, 10) - 1;
                    recentFill?.forEach(inp => { inp.value = p; inp.dispatchEvent(new Event('input', {bubbles:true})); });
                });
            });
        }

        popup.style.display = 'block';
        // Position to the RIGHT of anchor
        const rect = anchorEl.getBoundingClientRect();
        const popupW = 250;
        let left = rect.right + 8;
        if (left + popupW > window.innerWidth - 10) left = rect.left - popupW - 8;
        let top = Math.max(10, rect.top + window.scrollY - 10);
        popup.style.left = left + 'px';
        popup.style.top  = top + 'px';
    }

    // ─── Price helpers ─────────────────────────────────────────────────────────
    function applyDelta(num, formula) {
        const m = String(formula).match(/^([+-]?)(\d+(?:\.\d+)?)(%)?$/);
        if (!m) return num;
        const sign = m[1] === '-' ? -1 : 1;
        const val  = parseFloat(m[2]);
        const adj  = m[3] ? (num * val / 100) : val;
        return Math.round(num + sign * adj);
    }

    function fmt(n) { return new Intl.NumberFormat('en-US').format(n); }

    function openSettingsPrompt() {
        const current = marketSlotOffset > 0 ? `${priceDelta}[${marketSlotOffset}]` : priceDelta;
        const input = prompt(
            'Price offset formula:\n' +
            '  -1      → cheapest listing minus $1\n' +
            '  +0      → exact match\n' +
            '  -1%     → 1% below cheapest\n' +
            '  -1[1]   → 2nd cheapest minus $1\n\nCurrent:', current
        );
        if (input === null) return;
        const slotM = input.match(/\[(\d+)\]$/);
        if (slotM) {
            marketSlotOffset = parseInt(slotM[1], 10);
            priceDelta = input.replace(/\[\d+\]$/, '').trim();
        } else {
            priceDelta = input.trim();
            marketSlotOffset = 0;
        }
        savePrefs({ imPriceDelta: priceDelta, imSlotOffset: marketSlotOffset });
        // Update any open popup footer
        const dl = document.getElementById('sk-mf-delta-lbl');
        const sl = document.getElementById('sk-mf-slot-lbl');
        if (dl) dl.textContent = priceDelta;
        if (sl) sl.textContent = `#${marketSlotOffset + 1}`;
    }

    // ─── API ──────────────────────────────────────────────────────────────────
    async function fetchListings(itemId) {
        const now = Date.now();
        if (listingCache[itemId]?.ts && now - listingCache[itemId].ts < 30000)
            return listingCache[itemId].data;
        try {
            const cs = await CS();
            const key = cs ? await cs.get('sidekick_api_key') : null;
            if (!key) return null;
            const resp = await fetch(`https://api.torn.com/v2/market?id=${itemId}&selections=itemMarket&key=${key}&comment=SidekickMarketFiller`);
            const json = await resp.json();
            if (json.error) return null;
            const data = json.itemmarket?.listings || json.data?.itemmarket?.listings || null;
            listingCache[itemId] = { ts: Date.now(), data };
            return data;
        } catch { return null; }
    }

    // ─── Fill logic ───────────────────────────────────────────────────────────
    async function doFill(fillBtn, infoBtn, itemId, priceInputs, qtyInputs) {
        const wasActive = fillBtn.classList.contains('active');
        if (wasActive) {
            fillBtn.classList.remove('active');
            fillBtn.textContent = 'Fill';
            priceInputs.forEach(i => { i.value = ''; i.dispatchEvent(new Event('input',{bubbles:true})); });
            qtyInputs?.forEach(i => { i.value = ''; i.dispatchEvent(new Event('input',{bubbles:true})); });
            document.getElementById('sk-mf-popup')?.style && (document.getElementById('sk-mf-popup').style.display = 'none');
            return;
        }
        fillBtn.classList.add('active');
        fillBtn.textContent = 'Clear';
        recentFill = priceInputs;
        showPopup(infoBtn, null, true);
        const listings = await fetchListings(itemId);
        if (listings?.length) {
            const ref   = listings[Math.min(marketSlotOffset, listings.length - 1)];
            const price = applyDelta(ref.price, priceDelta);
            if (price > 0) {
                priceInputs.forEach(i => { i.value = price; i.dispatchEvent(new Event('input',{bubbles:true})); });
                qtyInputs?.forEach(i => { i.value = 9999999; i.dispatchEvent(new Event('input',{bubbles:true})); });
            }
        }
        showPopup(infoBtn, listings, false);
    }

    // ─── DOM injection ────────────────────────────────────────────────────────
    function getItemId(row) {
        const btn = row.querySelector('[aria-controls]');
        if (btn) {
            const m = (btn.getAttribute('aria-controls') || '').match(/-(\d+)-/);
            if (m) return m[1];
        }
        const img = row.querySelector('img[src*="/items/"]');
        if (img) {
            const m = (img.src || '').match(/\/items\/(\d+)\//i);
            if (m) return m[1];
        }
        return null;
    }

    function injectRowActions(row) {
        if (row.querySelector('.sk-mf-action-wrap')) return;

        const itemId = getItemId(row);
        if (!itemId) return;

        // Find price inputs
        const priceInputs = [...row.querySelectorAll('[class*="priceInputWrapper"] input.input-money, input.input-money[placeholder="Price"]')]
            .filter(i => !i.type || i.type !== 'hidden');
        const qtyInputs   = [...row.querySelectorAll('[class*="amountInput"] input.input-money, input.input-money[placeholder="Qty"]')]
            .filter(i => !i.type || i.type !== 'hidden');
        if (!priceInputs.length) return;

        // Build button group
        const wrap = document.createElement('span');
        wrap.className = 'sk-mf-action-wrap';

        const fillBtn = document.createElement('button');
        fillBtn.type = 'button';
        fillBtn.className = 'sk-mf-fill-btn';
        fillBtn.textContent = 'Fill';
        fillBtn.title = 'Fill price & quantity from cheapest listing';

        const infoBtn = document.createElement('button');
        infoBtn.type = 'button';
        infoBtn.className = 'sk-mf-info-btn';
        infoBtn.textContent = 'ℹ';
        infoBtn.title = 'Show current listings';

        fillBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); doFill(fillBtn, infoBtn, itemId, priceInputs, qtyInputs); });
        infoBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fetchListings(itemId).then(l => showPopup(infoBtn, l, false)); });

        wrap.append(fillBtn, infoBtn);

        // Inject to the right of the row — find best parent to append to
        // For the React item market table: each row is [class*=itemRowWrapper]
        // We place it after the price cell by appending to the row itself
        const priceCell = row.querySelector('[class*="priceInputWrapper"]') || row.querySelector('[class*="price___"]') || row.querySelector('.price');
        if (priceCell && priceCell.parentNode) {
            priceCell.parentNode.insertBefore(wrap, priceCell.nextSibling);
        } else {
            row.style.position = 'relative';
            row.appendChild(wrap);
        }

        row.dataset.skMfDone = '1';
    }

    function processPage() {
        document.querySelectorAll('[class*="itemRowWrapper"]:not([data-sk-mf-done]), [class*="sellerRow___"]:not([data-sk-mf-done]), [class*="rowWrapper___"]:not([data-sk-mf-done])').forEach(injectRowActions);
        // Also try list items
        document.querySelectorAll('li[class*="item"]:not([data-sk-mf-done])').forEach(li => {
            if (li.querySelector('input.input-money[placeholder="Price"]')) injectRowActions(li);
        });
    }

    // ─── Module lifecycle ─────────────────────────────────────────────────────
    function isOnItemMarket() {
        const url = window.location.href;
        return url.includes('page.php?sid=ItemMarket') || url.includes('imarket.php');
    }

    return {
        isEnabled: false,

        async init() {
            await loadSettings();
            const cs = await CS();
            if (!cs) return;
            const settings = await cs.get('sidekick_settings');
            this.isEnabled = settings?.['market-filler']?.isEnabled === true ||
                             settings?.['price-filler']?.isEnabled === true;
            if (this.isEnabled) this.enable();
        },

        enable() {
            this.isEnabled = true;
            if (!isOnItemMarket()) return;
            injectStyles();
            processPage();
            let tries = 0;
            const poll = setInterval(() => { processPage(); if (++tries >= 30) clearInterval(poll); }, 500);
            const root = document.getElementById('item-market-root') || document.querySelector('[class*="itemMarket"]') || document.body;
            if (pageObserver) pageObserver.disconnect();
            pageObserver = new MutationObserver(() => processPage());
            pageObserver.observe(root, { childList: true, subtree: true });
        },

        disable() {
            this.isEnabled = false;
            pageObserver?.disconnect(); pageObserver = null;
            document.getElementById('sk-mf-popup')?.remove();
            document.getElementById('sk-mf-styles')?.remove();
        },

        // Called from settings panel when prefs change
        updateSetting(key, value) {
            if (key === 'priceDelta' || key === 'imPriceDelta') priceDelta = value;
            if (key === 'slotOffset' || key === 'imSlotOffset') marketSlotOffset = parseInt(value, 10) || 0;
        }
    };
})();

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.MarketFiller = MarketFillerModule;
console.log('[MarketFiller] Module registered');
