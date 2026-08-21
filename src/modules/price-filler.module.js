/**
 * Price Filler Module
 * Handles automatic price filling on:
 *  - bazaar.php  (Add and Manage tabs, adapted from Customizable Bazaar Filler)
 *  - Item Market (page.php?sid=ItemMarket)
 * 
 * Settings stored in chrome.storage.local:
 *   sidekick_price_filler_prefs  – pricing preferences (source, offsets, etc.)
 * Module enabled/disabled via:
 *   sidekick_settings['price-filler'].isEnabled
 */

const PriceFillerModule = (() => {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------
    let prefs = {
        apiKey: '',
        pricingSource: 'Market Value', // 'Market Value' | 'Item Market' | 'Bazaars/weav3r.dev'
        marketMarginOffset: 0,
        marketMarginType: 'absolute',
        itemMarketListing: 1,
        itemMarketOffset: -1,
        itemMarketMarginType: 'absolute',
        itemMarketClamp: false,
        bazaarListing: 1,
        bazaarMarginOffset: 0,
        bazaarMarginType: 'absolute',
        bazaarClamp: false,
        blackFridayMode: false,
        imPriceDelta: '-1',      // Item Market filler offset formula
        imSlotOffset: 0,         // Item Market filler slot
    };

    const PREFS_KEY = 'sidekick_price_filler_prefs';
    let itemMarketCache = {};
    let weav3rCache = {};
    let pageObserver = null;
    let bazaarObserver = null;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------
    async function loadPrefs() {
        try {
            const d = await window.SidekickModules.Core.ChromeStorage.get(PREFS_KEY);
            if (d) Object.assign(prefs, d);
            // Also try to get apiKey from the main sidekick key if not set
            if (!prefs.apiKey) {
                const key = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                if (key) prefs.apiKey = key;
            }
        } catch (e) { console.error('[PriceFiller] loadPrefs:', e); }
    }

    async function savePrefs() {
        try {
            await window.SidekickModules.Core.ChromeStorage.set(PREFS_KEY, prefs);
        } catch (e) { console.error('[PriceFiller] savePrefs:', e); }
    }

    // -------------------------------------------------------------------------
    // Torn items cache (localStorage – same key as Bazaar Filler TM script)
    // -------------------------------------------------------------------------
    function getStoredItems() {
        try { return JSON.parse(localStorage.getItem('tornItems') || '{}'); }
        catch { return {}; }
    }

    function getItemIdByName(name) {
        const items = getStoredItems();
        for (const [id, info] of Object.entries(items)) {
            if (info.name === name) return id;
        }
        return null;
    }

    async function refreshTornItems() {
        if (!prefs.apiKey) return;
        try {
            const resp = await fetch(`https://api.torn.com/torn/?key=${prefs.apiKey}&selections=items&comment=SidekickPriceFiller`);
            const data = await resp.json();
            if (!data.items) throw new Error(data.error?.error || 'No items in response');
            const filtered = {};
            for (const [id, item] of Object.entries(data.items)) {
                if (item.tradeable) filtered[id] = { name: item.name, market_value: item.market_value };
            }
            localStorage.setItem('tornItems', JSON.stringify(filtered));
            localStorage.setItem('tornItems_ts', String(Date.now()));
        } catch (e) { console.error('[PriceFiller] refreshTornItems:', e); }
    }

    function maybeRefreshItems() {
        const ts = parseInt(localStorage.getItem('tornItems_ts') || '0', 10);
        const age = Date.now() - ts;
        if (!localStorage.getItem('tornItems') || age > 86400000) refreshTornItems();
    }

    // -------------------------------------------------------------------------
    // API calls
    // -------------------------------------------------------------------------
    async function fetchItemMarketData(itemId) {
        const now = Date.now();
        if (itemMarketCache[itemId]?.time && now - itemMarketCache[itemId].time < 30000)
            return itemMarketCache[itemId].data;
        if (!prefs.apiKey) return null;
        const resp = await fetch(`https://api.torn.com/v2/market/${itemId}/itemmarket?comment=SidekickPriceFiller`, {
            headers: { Authorization: 'ApiKey ' + prefs.apiKey }
        });
        const data = await resp.json();
        if (data.error) { console.warn('[PriceFiller] API error:', data.error); return null; }
        itemMarketCache[itemId] = { time: now, data };
        return data;
    }

    async function fetchWeav3rData(itemId) {
        const now = Date.now();
        if (weav3rCache[itemId]?.time && now - weav3rCache[itemId].time < 60000)
            return weav3rCache[itemId].data;
        const resp = await fetch(`https://weav3r.dev/api/marketplace/${itemId}`);
        const data = await resp.json();
        weav3rCache[itemId] = { time: now, data };
        return data;
    }

    // -------------------------------------------------------------------------
    // Price calculation
    // -------------------------------------------------------------------------
    async function calculatePrice(itemName, itemId, matchedItem) {
        if (!matchedItem) return null;

        if (prefs.pricingSource === 'Market Value') {
            const mv = matchedItem.market_value || 0;
            let price = mv;
            if (prefs.marketMarginType === 'percentage') price = Math.round(mv * (1 + prefs.marketMarginOffset / 100));
            else price = mv + prefs.marketMarginOffset;
            return { price, marketValue: mv };
        }

        if (prefs.pricingSource === 'Item Market' && itemId) {
            const data = await fetchItemMarketData(itemId).catch(() => null);
            const listings = data?.itemmarket?.listings;
            if (!listings?.length) return null;
            const idx = Math.min((prefs.itemMarketListing || 1) - 1, listings.length - 1);
            let price = listings[idx].price;
            if (prefs.itemMarketMarginType === 'percentage') price = Math.round(price * (1 + prefs.itemMarketOffset / 100));
            else price += prefs.itemMarketOffset;
            if (prefs.itemMarketClamp && matchedItem.market_value) price = Math.max(price, matchedItem.market_value);
            return { price, marketValue: matchedItem.market_value, listings: listings.slice(0, 5) };
        }

        if (prefs.pricingSource === 'Bazaars/weav3r.dev' && itemId) {
            const data = await fetchWeav3rData(itemId).catch(() => null);
            if (!data?.listings?.length) return null;
            const idx = Math.min((prefs.bazaarListing || 1) - 1, data.listings.length - 1);
            let price = data.listings[idx].price;
            if (prefs.bazaarMarginType === 'percentage') price = Math.round(price * (1 + prefs.bazaarMarginOffset / 100));
            else price += prefs.bazaarMarginOffset;
            if (prefs.bazaarClamp && matchedItem.market_value) price = Math.max(price, matchedItem.market_value);
            return { price, marketValue: matchedItem.market_value };
        }

        return null;
    }

    function applyDeltaFormula(num, formula) {
        const m = String(formula).match(/^([+-]?)(\d+(?:\.\d+)?)(%)?$/);
        if (!m) return num;
        const sign = m[1] === '-' ? -1 : 1;
        const val = parseFloat(m[2]);
        const adj = m[3] ? (num * val / 100) : val;
        return Math.round(num + sign * adj);
    }

    // -------------------------------------------------------------------------
    // Price color helpers
    // -------------------------------------------------------------------------
    function getPriceColor(listed, mv) {
        if (!mv) return '';
        const ratio = listed / mv;
        const dark = document.body.classList.contains('dark-mode');
        if (ratio >= 0.998 && ratio <= 1.002) return '';
        if (ratio < 0.998) {
            const t = Math.min((0.998 - ratio) / 0.05, 1.2);
            return dark ? `rgb(${Math.round(255 - t * 65)},${Math.round(255 - t * 185)},${Math.round(255 - t * 185)})`
                : `rgb(${Math.round(180 - t * 40)},${Math.round(60 - t * 40)},${Math.round(60 - t * 40)})`;
        }
        const t = Math.min((ratio - 1.002) / 0.05, 1.2);
        return dark ? `rgb(${Math.round(255 - t * 185)},${Math.round(255 - t * 65)},${Math.round(255 - t * 185)})`
            : `rgb(${Math.round(60 - t * 40)},${Math.round(160 - t * 40)},${Math.round(60 - t * 40)})`;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    function fmt(n) { return new Intl.NumberFormat('en-US').format(n); }

    function triggerEvents(el, ...events) {
        events.forEach(evt => el.dispatchEvent(new Event(evt, { bubbles: true })));
    }

    function setControlledInputValue(input, value) {
        if (!input) return;

        const prototype = Object.getPrototypeOf(input);
        const valueSetter = Object.getOwnPropertyDescriptor(
            prototype,
            'value'
        )?.set;

        if (valueSetter) {
            valueSetter.call(input, String(value));
        } else {
            input.value = String(value);
        }

        triggerEvents(input, 'input', 'change', 'keyup');
    }

    function setCheckboxState(checkbox, checked) {
        if (
            !checkbox ||
            checkbox.disabled ||
            checkbox.checked === checked
        ) {
            return;
        }

        checkbox.click();

        if (checkbox.checked === checked) return;

        const prototype = Object.getPrototypeOf(checkbox);
        const checkedSetter = Object.getOwnPropertyDescriptor(
            prototype,
            'checked'
        )?.set;

        if (checkedSetter) {
            checkedSetter.call(checkbox, checked);
        } else {
            checkbox.checked = checked;
        }

        triggerEvents(checkbox, 'input', 'change');
    }

    function getRowSelectionInputs(row) {
        return [
            ...row.querySelectorAll(
                'input[type="checkbox"]'
            )
        ].filter(input =>
            !input.classList.contains('sk-pf-check') &&
            !input.disabled
        );
    }

    // -------------------------------------------------------------------------
    // BAZAAR – Add page (#/add)
    // -------------------------------------------------------------------------
    async function fillAddRow(row, checked) {
        const qtyInput = row.querySelector(
            '.amount input:not([type="checkbox"])'
        );
        const priceInput = row.querySelector('.price input');
        const choiceCheckbox = row.querySelector(
            'div.amount.choice-container ' +
            'input[type="checkbox"]'
        );

        if (!checked) {
            setControlledInputValue(qtyInput, '');
            setControlledInputValue(priceInput, '');
            priceInput.style.color = '';
            setCheckboxState(choiceCheckbox, false);
            return;
        }

        if (!choiceCheckbox) {
            const qty = row.querySelector('.item-amount.qty')?.textContent.trim() || '';
            setControlledInputValue(qtyInput, qty);
        }

        if (prefs.blackFridayMode) {
            setControlledInputValue(priceInput, '1');
            setCheckboxState(choiceCheckbox, true);
            return;
        }

        const itemName = row.querySelector('.name-wrap span.t-overflow')?.textContent.trim();
        if (!itemName) return;
        const itemId = getItemIdByName(itemName);
        const items = getStoredItems();
        const matchedItem = Object.values(items).find(i => i.name === itemName);

        const result = await calculatePrice(itemName, itemId, matchedItem).catch(() => null);
        if (!result) return;

        setControlledInputValue(priceInput, fmt(result.price));
        priceInput.style.color = result.marketValue ? getPriceColor(result.price, result.marketValue) : '';
        setCheckboxState(choiceCheckbox, true);
    }

    // -------------------------------------------------------------------------
    // BAZAAR – Manage page (#/manage)
    // -------------------------------------------------------------------------
    async function fillManageRow(row, checked) {
        const priceInput = row.querySelector('.price___DoKP7 input.input-money') || row.querySelector('[class*="priceInputWrapper"] input.input-money') || row.querySelector('input.input-money[placeholder="Price"]');
        if (!priceInput) return;

        const quantityInputs = [
            ...row.querySelectorAll(
                'div.amount input:not([type="checkbox"]), ' +
                '[class*=amount___] input:not([type="checkbox"]), ' +
                'input.input-money[placeholder="Qty"]'
            )
        ].filter(input => input.type !== 'hidden');

        const selectionInputs =
            getRowSelectionInputs(row);

        if (!checked) {
            quantityInputs.forEach(input => {
                setControlledInputValue(input, '');
            });

            setControlledInputValue(priceInput, '');
            priceInput.style.color = '';

            selectionInputs.forEach(input => {
                setCheckboxState(input, false);
            });

            return;
        }

        if (prefs.blackFridayMode) {
            setControlledInputValue(priceInput, '1');

            selectionInputs.forEach(input => {
                setCheckboxState(input, true);
            });

            return;
        }

        let itemId = null;
        let matchedItem = null;

        const img = row.querySelector('div[class*=imgContainer___] img, div.image-wrap img, img[src*="/images/items/"]');
        if (img) {
            itemId = (img.src.match(/\/items\/(\d+)\//i) || img.src.match(/\/(\d+)\//) || [])[1];
        }

        const items = getStoredItems();
        if (itemId && items[itemId]) {
            matchedItem = items[itemId];
        } else {
            const itemName = row.querySelector('.desc___VJSNQ b')?.textContent.trim() || row.querySelector('[class*="nameWrap"] b')?.textContent.trim();
            if (itemName) {
                itemId = getItemIdByName(itemName);
                matchedItem = Object.values(items).find(i => i.name === itemName);
            }
        }

        const result = await calculatePrice(matchedItem?.name || '', itemId, matchedItem).catch(() => null);
        if (!result) return;

        setControlledInputValue(priceInput, fmt(result.price));
        priceInput.style.color = result.marketValue ? getPriceColor(result.price, result.marketValue) : '';
        
        // Fill quantity
        const qtyValue =
            row.querySelector(
                'span.t-hide span:last-child'
            )?.textContent?.trim() ||
            '9999999';

        quantityInputs.forEach(input => {
            setControlledInputValue(input, qtyValue);
        });

        selectionInputs.forEach(input => {
            setCheckboxState(input, true);
        });
    }

    // -------------------------------------------------------------------------
    // BAZAAR – Checkbox injection
    // -------------------------------------------------------------------------
    function injectBazaarStyles() {
        if (document.getElementById('sk-pf-bazaar-styles')) return;
        const s = document.createElement('style');
        s.id = 'sk-pf-bazaar-styles';
        s.textContent = `
            .sk-pf-check {
                width:15px; height:15px; border-radius:3px;
                appearance:none; outline:none; cursor:pointer;
                border:1px solid #4e535a; background:#2f3237;
                flex-shrink:0;
            }
            .sk-pf-check:checked { background:#5b9bd5; border-color:#5b9bd5; }
            .sk-pf-add-wrap {
                position:absolute; top:50%; right:8px;
                width:30px; height:30px;
                transform:translateY(-50%); cursor:pointer;
                display:flex; align-items:center; justify-content:center;
            }
            .sk-pf-manage-btn {
                display:inline-flex; align-items:center; gap:4px;
                padding:2px 7px; margin-right:4px;
                background:rgba(91,155,213,0.12); border:1px solid rgba(91,155,213,0.3);
                border-radius:4px; cursor:pointer; font-size:11px; color:#5b9bd5;
                white-space:nowrap; flex-shrink:0; transition:background .15s;
                height:22px; line-height:1;
            }
            .sk-pf-manage-btn:hover { background:rgba(91,155,213,0.25); }
            .sk-pf-manage-btn.active { background:rgba(91,155,213,0.3); border-color:#5b9bd5; }
            .sk-pf-settings-link {
                display:inline-flex; align-items:center; gap:6px;
                padding:4px 8px; margin:0 4px;
                background:rgba(91,155,213,0.15); border:1px solid rgba(91,155,213,0.3);
                border-radius:4px; cursor:pointer; font-size:12px; color:#5b9bd5;
            .sk-pf-settings-link:hover { background:rgba(91,155,213,0.25); }
            .sk-pf-bf-link { color:#28a745 !important; border-color:rgba(40,167,69,0.4) !important; background:rgba(40,167,69,0.1) !important; }
        `;
        document.head.appendChild(s);
    }

    function addBazaarCheckboxes() {
        const hash = window.location.hash;

        if (isOnBazaar() && hash === '#/add') {
            document.querySelectorAll('.items-cont .title-wrap').forEach(titleWrap => {
                if (titleWrap.querySelector('.sk-pf-add-wrap')) return;
                titleWrap.style.position = 'relative';
                const wrap = document.createElement('div');
                wrap.className = 'sk-pf-add-wrap';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'sk-pf-check';
                cb.addEventListener('change', async (e) => {
                    e.stopPropagation();
                    const row = cb.closest('li.clearfix');
                    await fillAddRow(row, cb.checked).catch(err => console.error('[PriceFiller]', err));
                });
                wrap.appendChild(cb);
                titleWrap.appendChild(wrap);
            });
        }

        if ((isOnBazaar() && hash === '#/manage') || isOnItemMarket()) {
            const rows = document.querySelectorAll('.item___jLJcf, [class*="itemRowWrapper"]');
            rows.forEach(row => {
                if (row.querySelector('.sk-pf-action-wrap')) return;

                const priceWrap = row.querySelector('.price___DoKP7') || row.querySelector('[class*="priceInputWrapper"]');
                if (!priceWrap) return;

                const wrap = document.createElement('span');
                wrap.className = 'sk-pf-action-wrap';
                wrap.style.cssText = 'display:flex;align-items:center;margin-left:8px;gap:4px;';

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'sk-pf-manage-btn sk-pf-fill-btn';
                btn.textContent = 'Fill';
                btn.title = 'Fill price & quantity using Price Filler settings';
                btn.style.cssText = `cursor:pointer;background:linear-gradient(135deg, #3a8a3e, #4fa854);color:#fff;border:none;
                    padding:0 8px;border-radius:4px;font-size:11px;font-weight:600;height:26px;line-height:26px;
                    margin-right:0px;vertical-align:middle;flex-shrink:0;transition:background 0.15s, box-shadow 0.15s;`;
                btn.addEventListener('mouseenter', () => { if (!btn.classList.contains('active')) { btn.style.background = 'linear-gradient(135deg, #4aa84e, #62c066)'; btn.style.boxShadow = '0 0 6px rgba(79,168,84,0.5)'; } });
                btn.addEventListener('mouseleave', () => { if (!btn.classList.contains('active')) { btn.style.background = 'linear-gradient(135deg, #3a8a3e, #4fa854)'; btn.style.boxShadow = ''; } });

                const infoBtn = document.createElement('button');
                infoBtn.type = 'button';
                infoBtn.className = 'sk-pf-info-btn';
                infoBtn.textContent = 'ℹ';
                infoBtn.title = 'Show prices';
                infoBtn.style.cssText = `cursor:pointer;background:rgba(91,155,213,0.12);color:#5b9bd5;border:1px solid rgba(91,155,213,0.3);
                    padding:0 8px;border-radius:4px;font-size:11px;font-weight:600;height:26px;line-height:24px;
                    vertical-align:middle;flex-shrink:0;transition:background 0.15s;`;

                let isFilled = false;
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    isFilled = !isFilled;
                    btn.classList.toggle('active', isFilled);
                    btn.textContent = isFilled ? 'Clear' : 'Fill';
                    btn.style.background = isFilled ? 'linear-gradient(135deg, #1a4a2e, #254f30)' : 'linear-gradient(135deg, #3a8a3e, #4fa854)';
                    await fillManageRow(row, isFilled).catch(err => console.error('[PriceFiller]', err));
                });

                infoBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const img = row.querySelector('div[class*=imgContainer___] img, div.image-wrap img, img[src*="/images/items/"]');
                    const itemId = img ? (img.src.match(/\/items\/(\d+)\//i) || img.src.match(/\/(\d+)\//) || [])[1] : null;
                    if (!itemId) return;

                    ensureImPopup();
                    const popup = document.getElementById('sk-pf-im-popup');
                    
                    if (prefs.pricingSource === 'Item Market') {
                        popup.querySelector('#sk-pf-im-delta-lbl').textContent = String(prefs.itemMarketOffset);
                        popup.querySelector('#sk-pf-im-slot-lbl').textContent = String(prefs.itemMarketListing);
                    } else {
                        popup.querySelector('#sk-pf-im-delta-lbl').textContent = String(prefs.bazaarMarginOffset);
                        popup.querySelector('#sk-pf-im-slot-lbl').textContent = String(prefs.bazaarListing);
                    }
                    
                    showImPopup(infoBtn, null, true);
                    
                    if (prefs.pricingSource === 'Item Market') {
                        const data = await fetchItemMarketData(itemId).catch(() => null);
                        const listings = data?.itemmarket?.listings;
                        showImPopup(infoBtn, listings, false);
                    } else {
                        const wData = await fetchWeav3rData(itemId).catch(() => null);
                        if (wData?.listings) {
                            const formattedListings = wData.listings.slice(0, 5).map(l => ({
                                price: l.price,
                                amount: l.quantity || 1
                            }));
                            showImPopup(infoBtn, formattedListings, false);
                        } else {
                            showImPopup(infoBtn, [], false);
                        }
                    }
                });

                wrap.append(btn, infoBtn);

                const parent = priceWrap.parentElement || row;
                parent.style.display = 'flex';
                parent.style.alignItems = 'center';
                parent.appendChild(wrap);
            });
        }
    }

    function addBazaarSettingsButton() {
        if (document.getElementById('sk-pf-settings-btn')) return;
        const container = document.querySelector('.linksContainer___LiOTN');
        if (!container) return;

        // Settings button
        const settingsBtn = document.createElement('a');
        settingsBtn.id = 'sk-pf-settings-btn';
        settingsBtn.href = '#';
        settingsBtn.className = 'sk-pf-settings-link';
        settingsBtn.innerHTML = `<span>⚙</span><span>Price Filler Settings</span>`;
        settingsBtn.addEventListener('click', e => { e.preventDefault(); openSettingsModal(); });
        container.insertBefore(settingsBtn, container.firstChild);

        // Black Friday toggle
        const bfBtn = document.createElement('a');
        bfBtn.id = 'sk-pf-bf-btn';
        bfBtn.href = '#';
        bfBtn.className = 'sk-pf-settings-link' + (prefs.blackFridayMode ? ' sk-pf-bf-link' : '');
        bfBtn.innerHTML = `<span>💰</span><span>Black Friday: ${prefs.blackFridayMode ? 'ON' : 'OFF'}</span>`;
        bfBtn.addEventListener('click', e => {
            e.preventDefault();
            prefs.blackFridayMode = !prefs.blackFridayMode;
            savePrefs();
            bfBtn.querySelector('span:last-child').textContent = `Black Friday: ${prefs.blackFridayMode ? 'ON' : 'OFF'}`;
            bfBtn.classList.toggle('sk-pf-bf-link', prefs.blackFridayMode);
        });
        container.insertBefore(bfBtn, settingsBtn.nextSibling);
    }

    // -------------------------------------------------------------------------
    // Settings Modal (Bazaar)
    // -------------------------------------------------------------------------
    function openSettingsModal() {
        document.getElementById('sk-pf-modal-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'sk-pf-modal-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const dark = document.body.classList.contains('dark-mode');
        const bg = dark ? '#2f3237' : '#fff';
        const fg = dark ? '#eee' : '#000';
        const inputStyle = `width:100%;padding:6px;box-sizing:border-box;background:${dark ? '#3c3f41' : '#fff'};color:${fg};border:1px solid ${dark ? '#555' : '#ccc'};border-radius:4px;`;
        const labelStyle = `display:block;margin-bottom:4px;font-weight:bold;`;

        overlay.innerHTML = `
        <div style="background:${bg};color:${fg};padding:20px;border-radius:8px;width:420px;max-width:92%;max-height:90vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.5);font-family:Arial,sans-serif;">
            <h2 style="margin-top:0;font-size:16px;">🛒 Price Filler Settings</h2>
            <hr style="border-color:#555;margin:10px 0;">
            
            <label style="${labelStyle}">Torn API Key</label>
            <div style="display:flex;gap:8px;margin-bottom:14px;">
                <input id="sk-pf-apikey" style="${inputStyle}flex:1;" type="text" value="${prefs.apiKey}" placeholder="Enter API key">
                <button id="sk-pf-refresh-items" title="Refresh market values" style="padding:6px 10px;cursor:pointer;border-radius:4px;border:1px solid #555;background:${dark ? '#444' : '#eee'};">↻</button>
            </div>
            
            <label style="${labelStyle}">Pricing Source</label>
            <select id="sk-pf-source" style="${inputStyle}margin-bottom:14px;">
                <option value="Market Value">Market Value</option>
                <option value="Item Market">Item Market</option>
                <option value="Bazaars/weav3r.dev">Bazaars / weav3r.dev</option>
            </select>
            
            <div id="sk-pf-mv-opts" style="display:none;margin-bottom:14px;padding:10px;border:1px solid #444;border-radius:6px;">
                <b>Market Value Options</b>
                <label style="${labelStyle}margin-top:8px;">Margin offset (e.g. -1000 for $1000 less)</label>
                <input id="sk-pf-mv-offset" type="number" style="${inputStyle}" value="${prefs.marketMarginOffset}">
                <label style="${labelStyle}margin-top:8px;">Margin type</label>
                <select id="sk-pf-mv-type" style="${inputStyle}">
                    <option value="absolute">Absolute ($)</option>
                    <option value="percentage">Percentage (%)</option>
                </select>
            </div>
            
            <div id="sk-pf-im-opts" style="display:none;margin-bottom:14px;padding:10px;border:1px solid #444;border-radius:6px;">
                <b>Item Market Options</b>
                <label style="${labelStyle}margin-top:8px;">Listing index (1 = cheapest)</label>
                <input id="sk-pf-im-listing" type="number" style="${inputStyle}" value="${prefs.itemMarketListing}" min="1">
                <label style="${labelStyle}margin-top:8px;">Margin offset (e.g. -1 for $1 less)</label>
                <input id="sk-pf-im-offset" type="number" style="${inputStyle}" value="${prefs.itemMarketOffset}">
                <label style="${labelStyle}margin-top:8px;">Margin type</label>
                <select id="sk-pf-im-type" style="${inputStyle}">
                    <option value="absolute">Absolute ($)</option>
                    <option value="percentage">Percentage (%)</option>
                </select>
                <label style="display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer;">
                    <input id="sk-pf-im-clamp" type="checkbox" ${prefs.itemMarketClamp ? 'checked' : ''}> Clamp minimum to Market Value
                </label>
            </div>
            
            <div id="sk-pf-bz-opts" style="display:none;margin-bottom:14px;padding:10px;border:1px solid #444;border-radius:6px;">
                <b>weav3r.dev Options</b>
                <label style="${labelStyle}margin-top:8px;">Listing index (1 = cheapest)</label>
                <input id="sk-pf-bz-listing" type="number" style="${inputStyle}" value="${prefs.bazaarListing}" min="1">
                <label style="${labelStyle}margin-top:8px;">Margin offset</label>
                <input id="sk-pf-bz-offset" type="number" style="${inputStyle}" value="${prefs.bazaarMarginOffset}">
                <label style="${labelStyle}margin-top:8px;">Margin type</label>
                <select id="sk-pf-bz-type" style="${inputStyle}">
                    <option value="absolute">Absolute ($)</option>
                    <option value="percentage">Percentage (%)</option>
                </select>
                <label style="display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer;">
                    <input id="sk-pf-bz-clamp" type="checkbox" ${prefs.bazaarClamp ? 'checked' : ''}> Clamp minimum to Market Value
                </label>
            </div>

            <hr style="border-color:#555;margin:10px 0;">
            <div style="text-align:right;display:flex;gap:8px;justify-content:flex-end;">
                <button id="sk-pf-save" style="padding:6px 16px;cursor:pointer;background:#5b9bd5;color:#fff;border:none;border-radius:4px;">Save</button>
                <button id="sk-pf-cancel" style="padding:6px 16px;cursor:pointer;background:#555;color:#fff;border:none;border-radius:4px;">Cancel</button>
            </div>
            <div id="sk-pf-modal-msg" style="margin-top:8px;font-size:12px;text-align:center;min-height:18px;"></div>
        </div>`;

        document.body.appendChild(overlay);

        // Pre-fill selects
        overlay.querySelector('#sk-pf-source').value = prefs.pricingSource;
        overlay.querySelector('#sk-pf-mv-type').value = prefs.marketMarginType;
        overlay.querySelector('#sk-pf-im-type').value = prefs.itemMarketMarginType;
        overlay.querySelector('#sk-pf-bz-type').value = prefs.bazaarMarginType;

        function toggleOpts() {
            const src = overlay.querySelector('#sk-pf-source').value;
            overlay.querySelector('#sk-pf-mv-opts').style.display = src === 'Market Value' ? '' : 'none';
            overlay.querySelector('#sk-pf-im-opts').style.display = src === 'Item Market' ? '' : 'none';
            overlay.querySelector('#sk-pf-bz-opts').style.display = src === 'Bazaars/weav3r.dev' ? '' : 'none';
        }
        overlay.querySelector('#sk-pf-source').addEventListener('change', toggleOpts);
        toggleOpts();

        overlay.querySelector('#sk-pf-refresh-items').addEventListener('click', async () => {
            const key = overlay.querySelector('#sk-pf-apikey').value.trim();
            if (!key) { overlay.querySelector('#sk-pf-modal-msg').textContent = '⚠️ Enter API key first'; return; }
            prefs.apiKey = key;
            overlay.querySelector('#sk-pf-modal-msg').textContent = 'Refreshing...';
            await refreshTornItems();
            overlay.querySelector('#sk-pf-modal-msg').textContent = '✓ Market values refreshed!';
        });

        overlay.querySelector('#sk-pf-save').addEventListener('click', async () => {
            prefs.apiKey = overlay.querySelector('#sk-pf-apikey').value.trim();
            prefs.pricingSource = overlay.querySelector('#sk-pf-source').value;
            prefs.marketMarginOffset = Number(overlay.querySelector('#sk-pf-mv-offset').value);
            prefs.marketMarginType = overlay.querySelector('#sk-pf-mv-type').value;
            prefs.itemMarketListing = Number(overlay.querySelector('#sk-pf-im-listing').value);
            prefs.itemMarketOffset = Number(overlay.querySelector('#sk-pf-im-offset').value);
            prefs.itemMarketMarginType = overlay.querySelector('#sk-pf-im-type').value;
            prefs.itemMarketClamp = overlay.querySelector('#sk-pf-im-clamp').checked;
            prefs.bazaarListing = Number(overlay.querySelector('#sk-pf-bz-listing').value);
            prefs.bazaarMarginOffset = Number(overlay.querySelector('#sk-pf-bz-offset').value);
            prefs.bazaarMarginType = overlay.querySelector('#sk-pf-bz-type').value;
            prefs.bazaarClamp = overlay.querySelector('#sk-pf-bz-clamp').checked;
            // Clear caches when source changes
            itemMarketCache = {};
            weav3rCache = {};
            await savePrefs();
            overlay.remove();
        });

        overlay.querySelector('#sk-pf-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    }

    // -------------------------------------------------------------------------
    // BAZAAR – Page wiring
    // -------------------------------------------------------------------------
    function runBazaarUI() {
        injectBazaarStyles();
        addBazaarCheckboxes();
        addBazaarSettingsButton();
    }

    function setupBazaarObserver() {
        if (bazaarObserver) bazaarObserver.disconnect();
        let debounce;
        bazaarObserver = new MutationObserver(() => {
            clearTimeout(debounce);
            debounce = setTimeout(runBazaarUI, 150);
        });
        const root = document.querySelector('#bazaarRoot') || document.body;
        bazaarObserver.observe(root, { childList: true, subtree: true });

        window.addEventListener('hashchange', () => setTimeout(runBazaarUI, 200));
        setTimeout(runBazaarUI, 300);
    }

    // -------------------------------------------------------------------------
    // ITEM MARKET – Fill button
    // -------------------------------------------------------------------------
    let imPopupDragX = 0, imPopupDragY = 0, imDragging = false;

    function ensureImPopup() {
        if (document.getElementById('sk-pf-im-popup')) return;
        const el = document.createElement('div');
        el.id = 'sk-pf-im-popup';
        el.style.cssText = `display:none;position:fixed;z-index:99999;
            background:#1e2430;border:1px solid #444;border-radius:8px;
            padding:10px 14px;font-size:13px;color:#ccc;
            box-shadow:0 4px 20px rgba(0,0,0,0.7);min-width:230px;
            pointer-events:auto;top:80px;left:200px;`;
        el.innerHTML = `
            <div id="sk-pf-im-drag" style="cursor:move;font-size:11px;color:#666;border-bottom:1px solid #333;padding-bottom:6px;margin-bottom:8px;user-select:none;">
                &#9776; Prices Info
                <span id="sk-pf-im-close" style="float:right;cursor:pointer;color:#888;font-size:16px;line-height:1;">&times;</span>
            </div>
            <div id="sk-pf-im-body" style="min-height:30px;"></div>
            <div style="margin-top:8px;border-top:1px solid #333;padding-top:6px;font-size:11px;color:#666;">
                Margin: <b id="sk-pf-im-delta-lbl"></b> &nbsp;|&nbsp; Slot: <b id="sk-pf-im-slot-lbl"></b>
                &nbsp;&nbsp;<a id="sk-pf-im-edit" href="#" style="color:#5b9bd5;">Edit</a>
            </div>`;
        document.body.appendChild(el);
        el.querySelector('#sk-pf-im-close').onclick = () => { el.style.display = 'none'; };
        el.querySelector('#sk-pf-im-edit').onclick = e => { e.preventDefault(); openSettingsModal(); };
        const drag = el.querySelector('#sk-pf-im-drag');
        drag.addEventListener('mousedown', e => {
            imDragging = true; imPopupDragX = e.clientX - el.offsetLeft; imPopupDragY = e.clientY - el.offsetTop; e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!imDragging) return;
            el.style.left = (e.clientX - imPopupDragX) + 'px'; el.style.top = (e.clientY - imPopupDragY) + 'px';
        });
        document.addEventListener('mouseup', () => { imDragging = false; });
    }

    function showImPopup(anchor, listings, loading) {
        const popup = document.getElementById('sk-pf-im-popup');
        if (!popup) return;
        const body = popup.querySelector('#sk-pf-im-body');
        const MARKET_TAX = 0.05;
        if (loading) {
            body.innerHTML = '<span style="color:#888;">Loading prices...</span>';
        } else if (!listings?.length) {
            body.innerHTML = '<span style="color:#e57373;">No listings found</span>';
        } else {
            body.innerHTML = listings.slice(0, 5).map((l, i) => {
                const net = Math.round(l.price * (1 - MARKET_TAX));
                return `<div class="sk-pf-im-row" data-price="${l.price}" style="padding:3px 0;">
                    <b>#${i + 1}</b> ${l.amount}x @ $${fmt(l.price)}
                    <span style="color:#666;font-size:11px;"> ($${fmt(net)} after tax)</span>
                </div>`;
            }).join('');
            popup.querySelectorAll('.sk-pf-im-row').forEach(row => {
                row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.06)'; });
                row.addEventListener('mouseleave', () => { row.style.background = ''; });
            });
        }
        popup.style.display = 'block';
        const rect = anchor.getBoundingClientRect();
        
        const row = anchor.closest('li.clearfix, div[class*=row___], div[class*=itemRowWrapper___]') || anchor;
        const rowRect = row.getBoundingClientRect();
        
        let left = rowRect.right + 10;
        let top = Math.max(8, rect.top + window.scrollY - 10);
        
        if (left + popup.offsetWidth > window.innerWidth) {
            left = rowRect.left - popup.offsetWidth - 10;
        }
        
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
    }

    function isOnItemMarket() {
        const url = window.location.href;
        return url.includes('page.php?sid=ItemMarket') ||
            url.includes('imarket.php') ||
            (url.includes('page.php') && url.includes('ItemMarket'));
    }

    function isOnBazaar() {
        return window.location.href.includes('bazaar.php');
    }

    function setupUIObserver() {
        if (bazaarObserver) bazaarObserver.disconnect();
        let debounce;
        bazaarObserver = new MutationObserver(() => {
            clearTimeout(debounce);
            debounce = setTimeout(runBazaarUI, 150);
        });
        const root = document.querySelector('#bazaarRoot') || document.getElementById('item-market-root') || document.querySelector('[class*="itemMarket"]') || document.body;
        bazaarObserver.observe(root, { childList: true, subtree: true });

        window.addEventListener('hashchange', () => setTimeout(runBazaarUI, 200));
        setTimeout(runBazaarUI, 300);
    }

    // -------------------------------------------------------------------------
    // Module lifecycle
    // -------------------------------------------------------------------------
    return {
        isEnabled: false,

        async init() {
            console.log('[PriceFiller] Init...');
            await loadPrefs();

            // Read enabled flag from sidekick_settings['price-filler']
            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
            this.isEnabled = settings?.['price-filler']?.isEnabled === true;

            if (this.isEnabled) this.enable();
            console.log('[PriceFiller] Init done, enabled:', this.isEnabled);
        },

        enable() {
            this.isEnabled = true;
            maybeRefreshItems();

            if (isOnBazaar() || isOnItemMarket()) {
                ensureImPopup();
                setupUIObserver();
            }
        },

        disable() {
            this.isEnabled = false;
            bazaarObserver?.disconnect();
            bazaarObserver = null;
            document.getElementById('sk-pf-im-popup')?.remove();
            document.getElementById('sk-pf-bazaar-styles')?.remove();
        },
        
        openSettings() {
            if (typeof openSettingsModal === 'function') {
                openSettingsModal();
            }
        }
    };
})();

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.PriceFiller = PriceFillerModule;
console.log('[PriceFiller] Module registered');
