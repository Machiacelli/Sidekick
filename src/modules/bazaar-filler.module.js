// Bazaar Filler Module
// Adds a "Fill" button to bazaar listings (Add and Manage tabs) that auto-fills
// the lowest bazaar price minus $1 (configurable), using the Weav3r API.
// A small peek button (👁) next to each item lets the user manually view the
// 5 lowest bazaar prices without the popup opening automatically.
// Popup opens to the RIGHT of the item/row to stay out of the way.
// Forked from Bazaar Filler by Weav3r

const BazaarFillerModule = (() => {
    const SETTINGS_KEY = 'bazaar-filler';
    const PREFS_STORAGE_KEY = 'sidekick_bazaar_filler_prefs';
    const WEAV3R_URL = 'https://weav3r.dev/api/marketplace/';
    const CACHE_TTL_MS = 60 * 1000; // 60 seconds

    // Sidekick theme colours (green gradient family)
    const CLR_BTN = 'linear-gradient(135deg, #3a8a3e, #4fa854)';
    const CLR_BTN_HVR = 'linear-gradient(135deg, #4aa84e, #62c066)';
    const CLR_CLR = 'linear-gradient(135deg, #1a4a2e, #254f30)';
    const CLR_SOLID = '#4fa854';   // Solid fallback for outline / active ring
    const CLR_PEEK = 'rgba(79,168,84,0.18)';
    const CLR_PEEK_HVR = 'rgba(79,168,84,0.35)';

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    let prefs = {
        priceDelta: '-1',       // formula applied to cheapest listing
        slotOffset: 0,          // 0 = cheapest (1st), 1 = 2nd cheapest, etc.
    };

    const weav3rCache = new Map(); // itemId → { listings, ts }
    let bazaarObserver = null;
    let activePopup = null; // currently visible peek popup element

    // -----------------------------------------------------------------------
    // Settings
    // -----------------------------------------------------------------------
    async function loadPrefs() {
        try {
            const d = await window.SidekickModules.Core.ChromeStorage.get(PREFS_STORAGE_KEY);
            if (d) Object.assign(prefs, d);
        } catch (e) { console.error('[BazaarFiller] loadPrefs:', e); }
    }

    async function savePrefs() {
        try {
            await window.SidekickModules.Core.ChromeStorage.set(PREFS_STORAGE_KEY, prefs);
        } catch (e) { console.error('[BazaarFiller] savePrefs:', e); }
    }

    // -----------------------------------------------------------------------
    // Weav3r API
    // -----------------------------------------------------------------------
    async function fetchBazaarListings(itemId) {
        const cached = weav3rCache.get(itemId);
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.listings;

        try {
            const resp = await fetch(`${WEAV3R_URL}${itemId}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const listings = (data?.listings || []).map(l => ({ price: l.price, amount: l.quantity ?? l.amount ?? 1 }));
            weav3rCache.set(itemId, { listings, ts: Date.now() });
            return listings;
        } catch (e) {
            console.error('[BazaarFiller] fetchBazaarListings error:', e);
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // Price helpers
    // -----------------------------------------------------------------------
    function calcFillPrice(listings) {
        if (!listings || listings.length === 0) return null;
        const ref = listings[Math.min(prefs.slotOffset, listings.length - 1)];
        return applyDelta(ref.price, prefs.priceDelta);
    }

    function applyDelta(num, formula) {
        const m = String(formula).match(/^([+-]?)(\d+(?:\.\d+)?)(%)?$/);
        if (!m) return num;
        const sign = m[1] === '-' ? -1 : 1;
        const val = parseFloat(m[2]);
        const adj = m[3] ? (num * val / 100) : val;
        return Math.round(num + sign * adj);
    }

    function fmt(n) { return new Intl.NumberFormat('en-US').format(n); }

    function triggerReact(el, ...events) {
        events.forEach(evt => el.dispatchEvent(new Event(evt, { bubbles: true })));
    }

    // -----------------------------------------------------------------------
    // Inject shared styles (once)
    // -----------------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('sk-bf-styles')) return;
        const s = document.createElement('style');
        s.id = 'sk-bf-styles';
        s.textContent = `
            .sk-bf-btn {
                cursor: pointer;
                background: ${CLR_BTN};
                color: #fff;
                border: none;
                padding: 0 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                height: 26px;
                line-height: 26px;
                margin-right: 4px;
                vertical-align: middle;
                flex-shrink: 0;
                transition: background 0.15s, box-shadow 0.15s;
                white-space: nowrap;
                letter-spacing: 0.3px;
            }
            .sk-bf-btn:hover { background: ${CLR_BTN_HVR}; box-shadow: 0 0 6px rgba(79,168,84,0.5); }
            .sk-bf-btn.sk-bf-active {
                background: ${CLR_CLR} !important;
                box-shadow: 0 0 0 2px ${CLR_SOLID} inset;
            }

            /* Peek button — tiny eye icon beside the item name */
            .sk-bf-peek {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                background: ${CLR_PEEK};
                border: 1px solid rgba(79,168,84,0.35);
                border-radius: 3px;
                font-size: 11px;
                width: 20px;
                height: 20px;
                margin-left: 4px;
                vertical-align: middle;
                flex-shrink: 0;
                transition: background 0.12s;
                user-select: none;
                line-height: 1;
            }
            .sk-bf-peek:hover { background: ${CLR_PEEK_HVR}; }

            /* Popup */
            #sk-bf-popup {
                display: none;
                position: fixed;
                z-index: 99999;
                background: #1e2430;
                border: 1px solid rgba(79,168,84,0.45);
                border-radius: 8px;
                padding: 10px 14px;
                font-size: 13px;
                color: #ccc;
                box-shadow: 0 4px 20px rgba(0,0,0,0.7);
                min-width: 200px;
                max-width: 260px;
                pointer-events: auto;
            }
            .sk-bf-popup-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 11px;
                color: ${CLR_SOLID};
                border-bottom: 1px solid rgba(79,168,84,0.2);
                padding-bottom: 6px;
                margin-bottom: 7px;
                font-weight: 600;
                letter-spacing: 0.3px;
            }
            .sk-bf-popup-close {
                cursor: pointer;
                color: #888;
                font-size: 16px;
                line-height: 1;
            }
            .sk-bf-popup-close:hover { color: #ccc; }
            .sk-bf-row {
                cursor: pointer;
                padding: 3px 0;
                border-radius: 3px;
                transition: background 0.1s;
            }
            .sk-bf-row:hover { background: rgba(255,255,255,0.07); }
            .sk-bf-row-num { color: ${CLR_SOLID}; font-weight: bold; margin-right: 3px; }
            .sk-bf-row-net { color: #666; font-size: 11px; }
            .sk-bf-footer {
                margin-top: 8px;
                border-top: 1px solid rgba(255,255,255,0.07);
                padding-top: 6px;
                font-size: 11px;
                color: #666;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 6px;
            }
            .sk-bf-footer-edit {
                color: ${CLR_SOLID};
                cursor: pointer;
                text-decoration: none;
                font-weight: 600;
            }
            .sk-bf-footer-edit:hover { text-decoration: underline; }
            .sk-bf-footer-refresh {
                background: none;
                border: 1px solid rgba(79,168,84,0.4);
                border-radius: 3px;
                color: ${CLR_SOLID};
                font-size: 10px;
                cursor: pointer;
                padding: 1px 5px;
                transition: background 0.12s;
            }
            .sk-bf-footer-refresh:hover { background: rgba(79,168,84,0.15); }
        `;
        document.head.appendChild(s);
    }

    // -----------------------------------------------------------------------
    // Popup
    // -----------------------------------------------------------------------
    function ensurePopup() {
        if (document.getElementById('sk-bf-popup')) return;
        const el = document.createElement('div');
        el.id = 'sk-bf-popup';
        el.innerHTML = `
            <div class="sk-bf-popup-header">
                <span>🛒 Bazaar Prices</span>
                <span class="sk-bf-popup-close" id="sk-bf-close">×</span>
            </div>
            <div id="sk-bf-body" style="min-height:26px;"></div>
            <div class="sk-bf-footer">
                <span>Offset: <b id="sk-bf-delta-lbl"></b> &nbsp;Slot: <b id="sk-bf-slot-lbl"></b></span>
                <span style="display:flex;gap:6px;align-items:center;">
                    <button class="sk-bf-footer-refresh" id="sk-bf-refresh">↻</button>
                    <a href="#" class="sk-bf-footer-edit" id="sk-bf-edit">Edit</a>
                </span>
            </div>
        `;
        document.body.appendChild(el);

        el.querySelector('#sk-bf-close').onclick = hidePopup;
        el.querySelector('#sk-bf-edit').onclick = e => { e.preventDefault(); openSettingsPrompt(); };

        // Close if user clicks outside
        document.addEventListener('click', e => {
            if (activePopup && !el.contains(e.target) && !e.target.classList.contains('sk-bf-peek')) {
                hidePopup();
            }
        }, true);
    }

    function hidePopup() {
        const el = document.getElementById('sk-bf-popup');
        if (el) el.style.display = 'none';
        activePopup = null;
    }

    /**
     * Show the peek popup to the RIGHT of peekBtn's parent item row.
     * @param {HTMLElement} peekBtn  – the 👁 button that was clicked
     * @param {string}      itemId
     * @param {Function}    getRecentInputs – returns current price inputs for click-to-use
     */
    async function showPeekPopup(peekBtn, itemId, getRecentInputs) {
        ensurePopup();
        const popup = document.getElementById('sk-bf-popup');

        // Update labels
        popup.querySelector('#sk-bf-delta-lbl').textContent = prefs.priceDelta;
        popup.querySelector('#sk-bf-slot-lbl').textContent = `#${prefs.slotOffset + 1}`;

        // Position: RIGHT of the item row, vertically centred on the peek button
        const peekRect = peekBtn.getBoundingClientRect();
        // We'll position it after layout so we know popup height
        popup.style.display = 'block';
        popup.style.left = '-9999px';
        popup.style.top = '-9999px';

        // Render loading state
        renderPopupBody(popup, null, true);

        // Recalculate position now popup is in flow
        const popupH = popup.offsetHeight;
        const popupW = popup.offsetWidth;

        // Try to anchor right of the row container
        const row = peekBtn.closest('li.clearfix, div[class*=row___], div[class*=item___]') || peekBtn;
        const rowRect = row.getBoundingClientRect();

        let left = rowRect.right + 10;
        let top = peekRect.top + window.scrollY - (popupH / 2) + (peekRect.height / 2);

        // Clamp to viewport
        if (left + popupW + 10 > window.innerWidth) left = rowRect.left - popupW - 10;
        if (left < 6) left = 6;
        if (top < 6) top = 6;
        if (top + popupH > window.scrollY + window.innerHeight - 6) {
            top = window.scrollY + window.innerHeight - popupH - 6;
        }

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
        activePopup = popup;

        // Fetch and render
        const listings = await fetchBazaarListings(itemId);
        renderPopupBody(popup, listings, false, getRecentInputs);

        // Refresh button
        const refreshBtn = popup.querySelector('#sk-bf-refresh');
        refreshBtn.onclick = async () => {
            weav3rCache.delete(itemId);
            refreshBtn.textContent = '…';
            const fresh = await fetchBazaarListings(itemId);
            renderPopupBody(popup, fresh, false, getRecentInputs);
            refreshBtn.textContent = '↻';
        };
    }

    function renderPopupBody(popup, listings, loading, getRecentInputs) {
        const body = popup.querySelector('#sk-bf-body');
        if (loading) {
            body.innerHTML = '<span style="color:#888;">Loading prices…</span>';
            return;
        }
        if (!listings || listings.length === 0) {
            body.innerHTML = '<span style="color:#e57373;">No bazaar listings found</span>';
            return;
        }

        body.innerHTML = listings.slice(0, 5).map((l, i) =>
            `<div class="sk-bf-row" data-price="${l.price}" style="padding:3px 4px;">
                <span class="sk-bf-row-num">#${i + 1}</span>
                ${l.amount}x @ $${fmt(l.price)}
            </div>`
        ).join('');

        body.querySelectorAll('.sk-bf-row').forEach(row => {
            row.addEventListener('click', () => {
                const p = parseInt(row.getAttribute('data-price'), 10) - 1;
                const inputs = getRecentInputs?.() || [];
                inputs.forEach(inp => { inp.value = p; });
                if (inputs[0]) triggerReact(inputs[0], 'input', 'keyup');
            });
        });
    }

    // -----------------------------------------------------------------------
    // Settings prompt
    // -----------------------------------------------------------------------
    function openSettingsPrompt() {
        const current = prefs.slotOffset > 0
            ? `${prefs.priceDelta}[${prefs.slotOffset}]`
            : prefs.priceDelta;
        const input = prompt(
            'Bazaar price offset formula:\n' +
            '  -1      → cheapest listing minus $1 (default)\n' +
            '  +0      → exact match\n' +
            '  -1%     → 1% below cheapest\n' +
            '  -1[1]   → 2nd cheapest minus $1\n\n' +
            'Current:', current
        );
        if (input === null) return;
        const slotM = input.match(/\[(\d+)\]$/);
        prefs.slotOffset = slotM ? parseInt(slotM[1], 10) : 0;
        prefs.priceDelta = (slotM ? input.replace(/\[\d+\]$/, '') : input).trim();
        savePrefs();
    }

    // -----------------------------------------------------------------------
    // Fill handler (shared by Add and Manage)
    // -----------------------------------------------------------------------
    async function handleFill(e, itemId, getPriceInputs, getQtyInputs) {
        e.preventDefault();
        e.stopPropagation();

        const btn = e.currentTarget;
        const wasActive = btn.classList.contains('sk-bf-active');

        if (wasActive) {
            // Clear mode
            btn.classList.remove('sk-bf-active');
            btn.textContent = 'Fill';
            const inputs = getPriceInputs();
            inputs.forEach(i => { i.value = ''; });
            if (inputs[0]) triggerReact(inputs[0], 'input', 'keyup');
            getQtyInputs?.()?.forEach(i => { i.value = ''; });
            return;
        }

        btn.classList.add('sk-bf-active');
        btn.textContent = 'Clear';

        const listings = await fetchBazaarListings(itemId);
        const price = calcFillPrice(listings);

        if (price !== null && price > 0) {
            const inputs = getPriceInputs();
            inputs.forEach(i => { i.value = price; });
            if (inputs[0]) triggerReact(inputs[0], 'input', 'keyup');

            const qtyInputs = getQtyInputs?.() || [];
            if (qtyInputs.length > 0) {
                qtyInputs.forEach(i => { i.value = 9999999; });
                triggerReact(qtyInputs[0], 'input', 'keyup');
            }
        } else if (listings === null) {
            btn.title = 'Weav3r API error – could not fetch prices';
            btn.style.opacity = '0.6';
        }
    }

    // -----------------------------------------------------------------------
    // ADD page (#/add) – inject Fill + Peek into each item row
    // -----------------------------------------------------------------------
    function processAddPage() {
        document.querySelectorAll('ul.items-cont li.clearfix:not([data-sk-bf-done])').forEach(li => {
            if (li.classList.contains('disabled')) return;
            const priceWrap = li.querySelector('div.price');
            if (!priceWrap) return;

            const image = li.querySelector('div.image-wrap img');
            const itemId = extractItemId(image);
            if (!itemId) return;

            li.setAttribute('data-sk-bf-done', '1');
            injectAddButtons(li, priceWrap, itemId);
        });
    }

    function injectAddButtons(li, priceWrap, itemId) {
        if (priceWrap.querySelector('.sk-bf-btn')) return;

        // --- Fill button ---
        const fillBtn = document.createElement('button');
        fillBtn.type = 'button';
        fillBtn.className = 'sk-bf-btn';
        fillBtn.textContent = 'Fill';
        fillBtn.title = 'Fill price from cheapest Bazaar listing (Weav3r)';

        fillBtn.addEventListener('click', e =>
            handleFill(
                e, itemId,
                () => [...li.querySelectorAll('div.price input')],
                () => {
                    const cb = li.querySelector('div.amount.choice-container input[type="checkbox"]');
                    if (cb) { if (!cb.checked) cb.click(); return []; }
                    return [...li.querySelectorAll('div.amount input')];
                }
            )
        );

        // --- Info button (was peek) ---
        const peekBtn = document.createElement('button');
        peekBtn.type = 'button';
        peekBtn.className = 'sk-bf-info-btn';
        peekBtn.title = 'Show 5 lowest bazaar prices';
        peekBtn.textContent = 'ℹ';
        peekBtn.style.cssText = `cursor:pointer;background:rgba(91,155,213,0.12);color:#5b9bd5;border:1px solid rgba(91,155,213,0.3);
            padding:0 8px;border-radius:4px;font-size:11px;font-weight:600;height:26px;line-height:24px;
            vertical-align:middle;flex-shrink:0;transition:background 0.15s;`;

        peekBtn.addEventListener('click', e => {
            e.stopPropagation();
            const popup = document.getElementById('sk-bf-popup');
            if (popup && popup.style.display === 'block' && popup.dataset.forItem === itemId) {
                hidePopup();
                return;
            }
            if (popup) popup.dataset.forItem = itemId;
            showPeekPopup(peekBtn, itemId, () => [...li.querySelectorAll('div.price input')]);
        });

        const wrap = document.createElement('span');
        wrap.className = 'sk-bf-action-wrap';
        wrap.style.cssText = 'display:flex;align-items:center;margin-left:8px;gap:4px;';
        wrap.append(fillBtn, peekBtn);

        const group = priceWrap.querySelector('.input-money-group') || priceWrap.firstElementChild || priceWrap;
        const parent = group.parentElement || li;
        parent.style.display = 'flex';
        parent.style.alignItems = 'center';
        parent.appendChild(wrap);
    }

    // -----------------------------------------------------------------------
    // MANAGE page (#/manage) – inject Fill + Peek into each managed row
    // -----------------------------------------------------------------------
    function processManagePage() {
        // React-rendered rows
        document.querySelectorAll('div[class*=row___]:not([data-sk-bf-done])').forEach(row => {
            // Target the price container instead of desc
            const priceWrap = row.querySelector('div[class*=price___], div.price');
            if (!priceWrap) return;
            const image = row.querySelector('div[class*=imgContainer___] img, div.image-wrap img');
            const itemId = extractItemId(image);
            if (!itemId) return;

            row.setAttribute('data-sk-bf-done', '1');
            injectManageButtons(row, priceWrap, itemId);
        });
    }

    function injectManageButtons(row, priceWrap, itemId) {
        if (priceWrap.querySelector('.sk-bf-btn')) return;

        const fillBtn = document.createElement('button');
        fillBtn.type = 'button';
        fillBtn.className = 'sk-bf-btn';
        fillBtn.textContent = 'Fill';
        fillBtn.title = 'Fill price & quantity from cheapest Bazaar listing (Weav3r)';

        fillBtn.addEventListener('click', async e => {
            e.stopPropagation();
            const itemContainer = row.querySelector('div[class*=item___]');
            const isExpanded = itemContainer?.className?.includes('active___');
            if (itemContainer && !isExpanded) {
                const manageBtn = row.querySelector('button[aria-label="Manage"]');
                if (manageBtn) {
                    manageBtn.click();
                    await new Promise(r => setTimeout(r, 160));
                }
            }

            await handleFill(
                e, itemId,
                () => {
                    const isMobile = window.innerWidth <= 784;
                    if (isMobile) return [...row.querySelectorAll('[class*=priceMobile___] .input-money-group input')];
                    return [...row.querySelectorAll('div[class*=price___] .input-money-group input, div.price input')];
                },
                () => {
                    const qty = row.querySelector('div.amount input, [class*=amount___] input');
                    if (!qty) return [];
                    const qtyVal = row.querySelector('span.t-hide span:last-child')?.textContent?.trim() || '9999999';
                    qty.value = qtyVal;
                    triggerReact(qty, 'input', 'keyup');
                    return [];
                }
            );
        });

        const peekBtn = document.createElement('button');
        peekBtn.type = 'button';
        peekBtn.className = 'sk-bf-info-btn';
        peekBtn.title = 'Show 5 lowest bazaar prices';
        peekBtn.textContent = 'ℹ';
        peekBtn.style.cssText = `cursor:pointer;background:rgba(91,155,213,0.12);color:#5b9bd5;border:1px solid rgba(91,155,213,0.3);
            padding:0 8px;border-radius:4px;font-size:11px;font-weight:600;height:26px;line-height:24px;
            vertical-align:middle;flex-shrink:0;transition:background 0.15s;`;

        peekBtn.addEventListener('click', e => {
            e.stopPropagation();
            const popup = document.getElementById('sk-bf-popup');
            if (popup && popup.style.display === 'block' && popup.dataset.forItem === itemId) {
                hidePopup();
                return;
            }
            if (popup) popup.dataset.forItem = itemId;
            showPeekPopup(peekBtn, itemId, () => {
                const isMobile = window.innerWidth <= 784;
                if (isMobile) return [...row.querySelectorAll('[class*=priceMobile___] .input-money-group input')];
                return [...row.querySelectorAll('div[class*=price___] .input-money-group input, div.price input')];
            });
        });

        const wrap = document.createElement('span');
        wrap.className = 'sk-bf-action-wrap';
        wrap.style.cssText = 'display:flex;align-items:center;margin-left:8px;gap:4px;';
        wrap.append(fillBtn, peekBtn);

        const priceCell = priceWrap.closest('div[class*="price___"]') || priceWrap;
        if (priceCell && priceCell.parentNode) {
            priceCell.parentNode.insertBefore(wrap, priceCell.nextSibling);
        } else {
            row.appendChild(wrap);
        }
    }

    // -----------------------------------------------------------------------
    // Item ID extraction
    // -----------------------------------------------------------------------
    function extractItemId(img) {
        if (!img?.src) return null;
        const m = img.src.match(/\/(\d+)\//);
        return m ? m[1] : null;
    }

    // -----------------------------------------------------------------------
    // Page scanner – runs on every mutation / hash change
    // -----------------------------------------------------------------------
    function runPageScan() {
        const hash = window.location.hash;
        if (hash.startsWith('#/add')) processAddPage();
        if (hash.startsWith('#/manage')) processManagePage();
        // Also try both in case hash is empty or unknown
        if (!hash) { processAddPage(); processManagePage(); }
    }

    // -----------------------------------------------------------------------
    // Observer setup
    // -----------------------------------------------------------------------
    function setupObserver() {
        if (bazaarObserver) bazaarObserver.disconnect();

        let debounce;
        bazaarObserver = new MutationObserver(() => {
            clearTimeout(debounce);
            debounce = setTimeout(runPageScan, 150);
        });

        const root = document.getElementById('bazaarRoot')
            || document.querySelector('.content-wrapper')
            || document.body;
        bazaarObserver.observe(root, { childList: true, subtree: true });

        window.addEventListener('hashchange', () => setTimeout(runPageScan, 200));
        setTimeout(runPageScan, 300);
    }

    // -----------------------------------------------------------------------
    // Is this page a bazaar page?
    // -----------------------------------------------------------------------
    function isOnBazaar() {
        return window.location.href.includes('bazaar.php');
    }

    // -----------------------------------------------------------------------
    // Module lifecycle
    // -----------------------------------------------------------------------
    return {
        isEnabled: false,

        async init() {
            console.log('[BazaarFiller] Init…');
            await loadPrefs();

            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
            this.isEnabled = settings?.['bazaar-filler']?.isEnabled === true;

            if (this.isEnabled) this.enable();
            console.log('[BazaarFiller] Init done, enabled:', this.isEnabled);
        },

        enable() {
            this.isEnabled = true;
            if (!isOnBazaar()) return; // Only inject on bazaar pages

            injectStyles();
            ensurePopup();
            setupObserver();
            console.log('[BazaarFiller] Enabled on bazaar page');
        },

        disable() {
            this.isEnabled = false;
            bazaarObserver?.disconnect();
            bazaarObserver = null;
            hidePopup();
            document.getElementById('sk-bf-popup')?.remove();
            document.getElementById('sk-bf-styles')?.remove();
            console.log('[BazaarFiller] Disabled');
        }
    };
})();

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.BazaarFiller = BazaarFillerModule;
console.log('[BazaarFiller] Module registered');
