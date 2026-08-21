/**
 * Sidekick Trade Assistant
 * Displays Torn market values and profile-adjusted trade values.
 *
 * Safety notes:
 * - Runs only on trade.php.
 * - Uses one debounced MutationObserver; no polling loop.
 * - Disconnects the observer while changing Sidekick-owned DOM.
 * - Uses the Torn item catalogue at most once per 24 hours.
 */
(function () {
    'use strict';

    const SETTINGS_KEY = 'sidekick_trading_settings';
    const CATALOG_KEY = 'sidekick_trade_item_catalog';
    const CATALOG_MAX_AGE = 24 * 60 * 60 * 1000;
    const MODULE_ID = 'sidekick-trade-assistant';

    let settings = null;
    let catalog = {};
    let catalogByName = new Map();
    let activeProfile = 'public';
    let observer = null;
    let processTimer = null;
    let initialized = false;
    const rwDetailsByArmoryId = new Map();

    const normalizeText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
    const normalizeName = value => normalizeText(value).toLowerCase();

    function isTradePage() {
        return window.location.pathname.toLowerCase().endsWith('/trade.php');
    }

    function waitForStorage(timeout = 10000) {
        return new Promise((resolve, reject) => {
            const started = Date.now();
            const check = () => {
                const storage = window.SidekickModules?.Core?.ChromeStorage;
                if (storage) return resolve(storage);
                if (Date.now() - started >= timeout) return reject(new Error('Sidekick storage did not become available'));
                setTimeout(check, 100);
            };
            check();
        });
    }

    function normalizeSettings(value) {
        const source = value && typeof value === 'object' ? value : {};
        const display = source.display && typeof source.display === 'object' ? source.display : {};
        const normalizeProfile = profileValue => {
            const profile = profileValue && typeof profileValue === 'object' ? profileValue : {};
            return {
                defaultRate: String(profile.defaultRate ?? '100'),
                categories: profile.categories && typeof profile.categories === 'object' ? profile.categories : {}
            };
        };
        return {
            display: {
                enabled: display.enabled !== false,
                showMarketValue: display.showMarketValue !== false,
                showBuyPrice: display.showBuyPrice !== false,
                showTotals: display.showTotals !== false,
                defaultProfile: display.defaultProfile === 'friendly' ? 'friendly' : 'public'
            },
            profiles: {
                public: normalizeProfile(source.profiles?.public),
                friendly: normalizeProfile(source.profiles?.friendly)
            }
        };
    }

    function catalogFromLocalStorage() {
        try {
            const stored = JSON.parse(localStorage.getItem('tornItems') || '{}');
            const result = {};
            Object.entries(stored).forEach(([id, item]) => {
                if (!item?.name) return;
                result[id] = {
                    id: String(id),
                    name: item.name,
                    marketValue: String(item.market_value ?? item.marketValue ?? '0'),
                    type: item.type || ''
                };
            });
            return result;
        } catch {
            return {};
        }
    }

    function indexCatalog() {
        catalogByName = new Map();
        Object.values(catalog).forEach(item => {
            if (!item?.name) return;
            catalogByName.set(normalizeName(item.name), item);
        });
    }

    async function loadCatalog(storage) {
        const cached = await storage.get(CATALOG_KEY).catch(() => null);
        if (cached?.items && typeof cached.items === 'object') catalog = cached.items;

        const fallback = catalogFromLocalStorage();
        if (!Object.keys(catalog).length) catalog = fallback;
        indexCatalog();

        const cacheAge = Date.now() - Number(cached?.updatedAt || 0);
        const hasTypes = Object.values(catalog).some(item => normalizeText(item.type));
        if (cacheAge < CATALOG_MAX_AGE && hasTypes) return;

        const apiKey = await storage.get('sidekick_api_key').catch(() => '');
        if (!apiKey) return;

        try {
            const response = await fetch(
                `https://api.torn.com/torn/?selections=items&key=${encodeURIComponent(apiKey)}&comment=SidekickTradeAssistant`
            );
            const data = await response.json();
            if (!response.ok || data.error || !data.items) {
                throw new Error(data.error?.error || `Torn API returned ${response.status}`);
            }

            const items = {};
            Object.entries(data.items).forEach(([id, item]) => {
                if (item.tradeable === false || !item.name) return;
                items[id] = {
                    id: String(id),
                    name: item.name,
                    marketValue: String(item.market_value ?? '0'),
                    type: item.type || item.category || '',
                    image: item.image || ''
                };
            });

            catalog = items;
            indexCatalog();
            await storage.set(CATALOG_KEY, { updatedAt: Date.now(), items });
        } catch (error) {
            console.warn('[TradeAssistant] Could not refresh the Torn item catalogue; using cached values.', error);
        }
    }

    function mapItemTypeToCategory(type) {
        const normalized = normalizeName(type);
        const aliases = {
            armor: 'Armor', armour: 'Armor', melee: 'Melee', primary: 'Primary', secondary: 'Secondary',
            alcohol: 'Alcohol', booster: 'Boosters', boosters: 'Boosters', candy: 'Candy', drug: 'Drugs', drugs: 'Drugs',
            'energy drink': 'Energy Drinks', 'energy drinks': 'Energy Drinks', enhancer: 'Enhancers', enhancers: 'Enhancers',
            medical: 'Medical', temporary: 'Temporary', artifact: 'Artifacts', artifacts: 'Artifacts', car: 'Cars', cars: 'Cars',
            clothing: 'Clothing', flower: 'Flowers', flowers: 'Flowers', jewelry: 'Jewelry', jewellery: 'Jewelry',
            material: 'Materials', materials: 'Materials', miscellaneous: 'Miscellaneous', plushie: 'Plushies', plushies: 'Plushies',
            special: 'Special', 'supply pack': 'Supply Packs', 'supply packs': 'Supply Packs', tool: 'Tools', tools: 'Tools',
            property: 'Basic Properties', 'basic property': 'Basic Properties', 'upgraded property': 'Fully Upgraded Properties'
        };
        return aliases[normalized] || normalizeText(type) || '';
    }

    function parseMoneyInteger(value) {
        const cleaned = String(value ?? '').replace(/[$,\s]/g, '');
        if (!/^\d+$/.test(cleaned)) return null;
        try { return BigInt(cleaned); } catch { return null; }
    }

    function parseDecimal(value) {
        const cleaned = String(value ?? '').replace(/[$,\s%]/g, '');
        if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
        const [whole, fraction = ''] = cleaned.split('.');
        return {
            scaled: BigInt(whole + fraction),
            scale: fraction.length
        };
    }

    function multiplyMarketValue(marketValue, quantity, rate) {
        const market = parseMoneyInteger(marketValue);
        const parsedRate = parseDecimal(rate);
        if (market === null || parsedRate === null) return null;
        return {
            scaled: market * BigInt(quantity) * parsedRate.scaled,
            scale: parsedRate.scale + 2
        };
    }

    function multiplyFixedPrice(value, quantity) {
        const parsed = parseDecimal(value);
        if (!parsed) return null;
        return { scaled: parsed.scaled * BigInt(quantity), scale: parsed.scale };
    }

    function sumDecimals(values) {
        const usable = values.filter(Boolean);
        if (!usable.length) return { scaled: 0n, scale: 0 };
        const scale = Math.max(...usable.map(value => value.scale));
        const scaled = usable.reduce((total, value) => {
            return total + value.scaled * (10n ** BigInt(scale - value.scale));
        }, 0n);
        return { scaled, scale };
    }

    function subtractDecimals(left, right) {
        const scale = Math.max(left.scale, right.scale);
        const leftScaled = left.scaled * (10n ** BigInt(scale - left.scale));
        const rightScaled = right.scaled * (10n ** BigInt(scale - right.scale));
        return { scaled: leftScaled - rightScaled, scale };
    }

    function toWholeDollars(value) {
        if (!value) return null;
        if (value.scale <= 0) return value;
        return {
            scaled: value.scaled / (10n ** BigInt(value.scale)),
            scale: 0
        };
    }

    function absoluteDecimal(value) {
        return {
            scaled: value.scaled < 0n ? -value.scaled : value.scaled,
            scale: value.scale
        };
    }

    function formatDecimal(value) {
        if (!value) return '0';
        const negative = value.scaled < 0n;
        const absolute = negative ? -value.scaled : value.scaled;
        let digits = absolute.toString();
        if (value.scale > 0) {
            digits = digits.padStart(value.scale + 1, '0');
            const split = digits.length - value.scale;
            let fraction = digits.slice(split).replace(/0+$/, '');
            digits = digits.slice(0, split) + (fraction ? `.${fraction}` : '');
        }
        const [integer, fraction] = digits.split('.');
        const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
    }

    function formatMoney(value) {
        return `$${formatDecimal(value)}`;
    }

    function parseTradeLinkIdentifiers(link) {
        if (!link) return { itemId: '', armoryId: '' };
        try {
            const url = new URL(link.href || link.getAttribute('href') || '', location.href);
            const hashParams = new URLSearchParams(url.hash.replace(/^#\/?/, ''));
            return {
                itemId: url.searchParams.get('itemID') || hashParams.get('itemID') || '',
                armoryId: url.searchParams.get('armoryID') || hashParams.get('armoryID') || ''
            };
        } catch {
            return { itemId: '', armoryId: '' };
        }
    }

    function parseTooltipDetails(row, itemId, itemName, armoryId = '') {
        const icon = row.querySelector('.networth-info-icon');
        const tooltipHtml = icon?.getAttribute('title') ||
            icon?.getAttribute('data-original-title') ||
            icon?.getAttribute('data-tooltip-content') || '';
        if (!tooltipHtml) {
            return rwDetailsByArmoryId.get(armoryId) || { isRw: false, fingerprint: '', label: itemName };
        }

        const holder = document.createElement('div');
        holder.innerHTML = tooltipHtml;
        const valueFromClass = className => {
            const marker = holder.querySelector(`.${className}`);
            return normalizeText(marker?.parentElement?.querySelector('span')?.textContent);
        };
        const bonusName = normalizeText(holder.querySelector('b')?.textContent);
        const tooltipText = normalizeText(holder.textContent);
        const bonusPercent = tooltipText.match(/(\d+(?:\.\d+)?)%/)?.[1] || '';
        const damage = valueFromClass('bonus-attachment-item-damage-bonus');
        const accuracy = valueFromClass('bonus-attachment-item-accuracy-bonus');
        const rarity = valueFromClass('bonus-attachment-item-rarity-bonus');
        const isRw = Boolean(bonusName || damage || accuracy || rarity);
        const fingerprint = isRw
            ? [itemId || '', normalizeName(itemName), bonusName, bonusPercent, damage, accuracy, rarity].join('|')
            : '';
        const details = [bonusName && `${bonusName}${bonusPercent ? ` ${bonusPercent}%` : ''}`, damage && `${damage} DMG`, accuracy && `${accuracy} ACC`, rarity]
            .filter(Boolean)
            .join(' · ');
        const result = { isRw, fingerprint, label: details ? `${itemName} — ${details}` : itemName };
        if (isRw && armoryId) rwDetailsByArmoryId.set(armoryId, result);
        return result;
    }

    function parseTradeItem(row, side) {
        const nameElement = row.querySelector('.name');
        if (!nameElement || nameElement.classList.contains('inactive')) return null;
        const rawName = normalizeText(nameElement.childNodes[0]?.textContent || nameElement.textContent);
        if (!rawName || /^no items in trade$/i.test(rawName)) return null;

        const quantityMatch = rawName.match(/\s+x(\d+)$/i);
        const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
        const name = normalizeText(quantityMatch ? rawName.slice(0, quantityMatch.index) : rawName);
        const removeLink = row.querySelector('a[href*="step=remove"]');
        let itemId = '';
        let armoryId = '';

        const identifiers = parseTradeLinkIdentifiers(removeLink);
        itemId = identifiers.itemId;
        armoryId = identifiers.armoryId;

        const catalogItem = catalog[itemId] || catalogByName.get(normalizeName(name)) || null;
        if (!itemId && catalogItem?.id) itemId = catalogItem.id;
        const tooltip = parseTooltipDetails(row, itemId, name, armoryId);
        const isRw = (armoryId && armoryId !== '0') || tooltip.isRw;

        return {
            row,
            nameElement,
            side,
            name,
            quantity,
            itemId,
            armoryId: armoryId && armoryId !== '0' ? armoryId : '',
            isRw,
            fingerprint: tooltip.fingerprint,
            label: tooltip.label,
            catalogItem
        };
    }

    function collectTradeItems() {
        const trade = document.querySelector('#trade-container .trade-cont');
        if (!trade) return { trade: null, left: [], right: [] };
        const result = { trade, left: [], right: [] };

        ['left', 'right'].forEach(side => {
            const column = trade.querySelector(`:scope > .user.${side}`);
            if (!column) return;
            let rows = [...column.querySelectorAll(':scope > ul.cont > li.color2 > ul.desc > li')];
            if (!rows.length) rows = [...column.querySelectorAll(':scope > ul.cont > li:nth-child(2) > ul.desc > li')];
            rows.forEach(row => {
                const item = parseTradeItem(row, side);
                if (item) result[side].push(item);
            });
        });
        return result;
    }

    function allExceptions(profile) {
        const result = [];
        Object.entries(profile.categories || {}).forEach(([category, record]) => {
            (Array.isArray(record?.exceptions) ? record.exceptions : []).forEach(exception => {
                result.push({ category, exception });
            });
        });
        return result;
    }

    function findException(profile, item) {
        const exceptions = allExceptions(profile);
        return exceptions.find(({ exception }) => {
            const uid = normalizeText(exception.uid || (/^\d{8,}$/.test(normalizeText(exception.item)) ? exception.item : ''));
            if (item.armoryId && uid) return uid === item.armoryId;
            if (item.isRw && exception.fingerprint && item.fingerprint) return exception.fingerprint === item.fingerprint;
            if (item.isRw) return false;

            const exceptionItemId = normalizeText(exception.itemId || (/^\d+$/.test(normalizeText(exception.item)) ? exception.item : ''));
            if (exceptionItemId && item.itemId) return exceptionItemId === item.itemId;
            return normalizeName(exception.item || exception.label) === normalizeName(item.name);
        }) || null;
    }

    function categoryForItem(item) {
        return mapItemTypeToCategory(item.catalogItem?.type || '');
    }

    function effectiveCategoryRate(profile, category) {
        const custom = profile.categories?.[category]?.rate;
        return normalizeText(custom) || normalizeText(profile.defaultRate) || '100';
    }

    function valueTradeItem(item, profile) {
        const exceptionMatch = findException(profile, item);
        const marketValue = parseMoneyInteger(item.catalogItem?.marketValue);
        const marketTotal = item.isRw || marketValue === null
            ? null
            : { scaled: marketValue * BigInt(item.quantity), scale: 0 };

        if (exceptionMatch?.exception?.rule === 'fixed') {
            return {
                marketTotal,
                buyTotal: toWholeDollars(multiplyFixedPrice(exceptionMatch.exception.value, item.quantity)),
                ruleLabel: 'Fixed item price',
                exceptionMatch
            };
        }

        if (item.isRw && !exceptionMatch) {
            return { marketTotal: null, buyTotal: null, ruleLabel: 'RW price required', exceptionMatch: null };
        }

        if (marketValue === null) {
            return { marketTotal: null, buyTotal: null, ruleLabel: 'Market value unavailable', exceptionMatch };
        }

        const category = exceptionMatch?.category || categoryForItem(item);
        const rate = exceptionMatch?.exception?.rule === 'percentage'
            ? normalizeText(exceptionMatch.exception.value)
            : effectiveCategoryRate(profile, category);
        return {
            marketTotal,
            buyTotal: toWholeDollars(multiplyMarketValue(item.catalogItem.marketValue, item.quantity, rate)),
            ruleLabel: `${rate}%`,
            exceptionMatch
        };
    }

    function ensureStyles() {
        if (document.getElementById(`${MODULE_ID}-styles`)) return;
        const style = document.createElement('style');
        style.id = `${MODULE_ID}-styles`;
        style.textContent = `
            .sk-ta-values{display:block;clear:both;margin-top:2px;font-size:10px;line-height:14px;color:#aaa;white-space:normal;}
            .sk-ta-market{color:#79bfff;margin-right:8px;}
            .sk-ta-buy{color:#75d77e;margin-right:8px;font-weight:700;}
            .sk-ta-rule{color:#aaa;font-weight:400;}
            .sk-ta-missing{color:#ffb25c;margin-right:8px;font-weight:700;}
            .sk-ta-rw-button{padding:1px 5px;border:1px solid rgba(255,173,90,.45);border-radius:4px;background:rgba(255,173,90,.12);color:#ffbd72;font:600 9px Arial,sans-serif;cursor:pointer;vertical-align:middle;}
            .sk-ta-rw-button:hover{background:rgba(255,173,90,.25);color:#fff;}
            #${MODULE_ID}-panel{margin-top:10px;border:1px solid #444;border-radius:5px;background:#252525;color:#ddd;font:12px Arial,sans-serif;overflow:hidden;}
            .sk-ta-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;background:#1d1d1d;border-bottom:1px solid #444;}
            .sk-ta-panel-title{font-size:13px;font-weight:700;color:#7ddd75;}
            .sk-ta-profile-label{margin-left:auto;color:#999;font-size:10px;}
            .sk-ta-profiles{display:flex;border:1px solid #555;border-radius:5px;overflow:hidden;}
            .sk-ta-profile{padding:5px 12px;border:0;border-right:1px solid #555;background:#333;color:#aaa;font:600 11px Arial,sans-serif;cursor:pointer;}
            .sk-ta-profile:last-child{border-right:0;}
            .sk-ta-profile.active{background:linear-gradient(135deg,#75d77e,#ffad5a);color:#111;}
            .sk-ta-summary{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#444;}
            .sk-ta-side{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#292929;padding:8px 10px;min-width:0;}
            .sk-ta-side span{color:#aaa;}
            .sk-ta-side strong{color:#eee;white-space:nowrap;}
            .sk-ta-result{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;background:#202020;border-top:1px solid #444;}
            .sk-ta-result-label{font-size:12px;font-weight:700;color:#ccc;}
            .sk-ta-result strong{font-size:15px;color:#7ddd75;}
            .sk-ta-result[data-result="pay"] strong{color:#ffbd72;}
            .sk-ta-result[data-result="unavailable"] strong{color:#ffb25c;}
            @media(max-width:600px){.sk-ta-panel-head{align-items:flex-start;flex-wrap:wrap}.sk-ta-profile-label{margin-left:0}.sk-ta-summary{grid-template-columns:1fr}.sk-ta-side{padding:7px 10px;}}
        `;
        document.head.appendChild(style);
    }

    async function saveRwPrice(item, currentValue) {
        const storage = window.SidekickModules.Core.ChromeStorage;
        const requested = prompt(`Fixed price for ${item.label}`, currentValue || '');
        if (requested === null) return;
        if (parseMoneyInteger(requested) === null) {
            alert('Enter a whole-dollar price using digits, with optional commas.');
            return;
        }

        const profile = settings.profiles[activeProfile];
        const category = categoryForItem(item) || 'Primary';
        profile.categories[category] ||= { rate: '', exceptions: [] };
        profile.categories[category].exceptions ||= [];
        const exceptions = profile.categories[category].exceptions;
        const existingIndex = exceptions.findIndex(exception => {
            return (item.armoryId && String(exception.uid || '') === item.armoryId) ||
                (item.fingerprint && exception.fingerprint === item.fingerprint);
        });
        const exception = {
            id: existingIndex >= 0 ? exceptions[existingIndex].id : (globalThis.crypto?.randomUUID?.() || `trade-${Date.now()}`),
            item: item.name,
            label: item.label,
            itemId: item.itemId,
            uid: item.armoryId,
            fingerprint: item.fingerprint,
            rule: 'fixed',
            value: requested.trim()
        };
        if (existingIndex >= 0) exceptions[existingIndex] = exception;
        else exceptions.push(exception);

        await storage.set(SETTINGS_KEY, settings);
        scheduleProcess(0);
    }

    function renderItemValue(item, valuation) {
        let container = item.nameElement.querySelector(':scope > .sk-ta-values');
        if (!container) {
            container = document.createElement('span');
            container.className = 'sk-ta-values';
            item.nameElement.appendChild(container);
        }
        container.replaceChildren();

        if (settings.display.showMarketValue && valuation.marketTotal) {
            const market = document.createElement('span');
            market.className = 'sk-ta-market';
            market.textContent = `Market: ${formatMoney(valuation.marketTotal)}`;
            container.appendChild(market);
        }

        if (settings.display.showBuyPrice && valuation.buyTotal) {
            const buy = document.createElement('span');
            buy.className = 'sk-ta-buy';
            const action = item.side === 'left' ? 'You receive' : 'You pay';
            const priceList = activeProfile === 'public' ? 'Public' : 'Friendly';
            buy.textContent = `${action}: ${formatMoney(valuation.buyTotal)} `;
            const rule = document.createElement('span');
            rule.className = 'sk-ta-rule';
            rule.textContent = `(${priceList} ${valuation.ruleLabel})`;
            buy.appendChild(rule);
            container.appendChild(buy);
        }

        if (item.isRw) {
            if (!valuation.buyTotal) {
                const missing = document.createElement('span');
                missing.className = 'sk-ta-missing';
                missing.textContent = 'RW price required';
                container.appendChild(missing);
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sk-ta-rw-button';
            button.textContent = valuation.exceptionMatch ? 'Edit RW price' : 'Set RW price';
            button.title = item.label;
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                saveRwPrice(item, valuation.exceptionMatch?.exception?.value || '').catch(error => {
                    console.error('[TradeAssistant] Failed to save RW price:', error);
                });
            });
            container.appendChild(button);
        } else if (!valuation.marketTotal) {
            const missing = document.createElement('span');
            missing.className = 'sk-ta-missing';
            missing.textContent = 'Market value unavailable';
            container.appendChild(missing);
        }
    }

    function sideTitle(trade, side) {
        return normalizeText(trade.querySelector(`:scope > .user.${side} > .title-black`)?.textContent) || (side === 'left' ? 'Your side' : 'Other player');
    }

    function setText(element, text) {
        if (element.textContent !== text) element.textContent = text;
    }

    function renderPanel(collected, valuations) {
        if (!settings.display.showTotals) {
            document.getElementById(`${MODULE_ID}-panel`)?.remove();
            return;
        }

        let panel = document.getElementById(`${MODULE_ID}-panel`);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = `${MODULE_ID}-panel`;
            panel.innerHTML = `
                <div class="sk-ta-panel-head">
                    <div class="sk-ta-panel-title">Sidekick Trade Calculator</div>
                    <div class="sk-ta-profile-label">Price list:</div>
                    <div class="sk-ta-profiles" role="group" aria-label="Price list">
                        <button type="button" class="sk-ta-profile" data-profile="public">Public</button>
                        <button type="button" class="sk-ta-profile" data-profile="friendly">Friendly</button>
                    </div>
                </div>
                <div class="sk-ta-summary">
                    <div class="sk-ta-side" data-side="left"><span>Your items</span><strong data-value="price"></strong></div>
                    <div class="sk-ta-side" data-side="right"><span>Their items</span><strong data-value="price"></strong></div>
                </div>
                <div class="sk-ta-result" data-result="none"><div class="sk-ta-result-label"></div><strong></strong></div>
            `;
            collected.trade.insertAdjacentElement('afterend', panel);
            panel.querySelectorAll('.sk-ta-profile').forEach(button => {
                button.addEventListener('click', () => {
                    activeProfile = button.dataset.profile === 'friendly' ? 'friendly' : 'public';
                    scheduleProcess(0);
                });
            });
        }

        panel.querySelectorAll('.sk-ta-profile').forEach(button => {
            button.classList.toggle('active', button.dataset.profile === activeProfile);
        });

        ['left', 'right'].forEach(side => {
            const sidePanel = panel.querySelector(`[data-side="${side}"]`);
            const sideValues = valuations[side];
            setText(
                sidePanel.querySelector('[data-value="price"]'),
                sideValues.buyMissing ? 'Incomplete' : formatMoney(sideValues.buy)
            );
        });

        const hasMissingBuyPrices = valuations.left.buyMissing || valuations.right.buyMissing;
        const difference = subtractDecimals(valuations.right.buy, valuations.left.buy);
        const result = panel.querySelector('.sk-ta-result');
        const resultLabel = result.querySelector('.sk-ta-result-label');
        const resultValue = result.querySelector('strong');

        if (hasMissingBuyPrices) {
            result.dataset.result = 'unavailable';
            setText(resultLabel, 'TOTAL UNAVAILABLE');
            setText(resultValue, 'Set missing item prices');
        } else if (difference.scaled > 0n) {
            result.dataset.result = 'pay';
            setText(resultLabel, 'YOU PAY');
            setText(resultValue, formatMoney(absoluteDecimal(difference)));
        } else if (difference.scaled < 0n) {
            result.dataset.result = 'receive';
            setText(resultLabel, 'YOU RECEIVE');
            setText(resultValue, formatMoney(absoluteDecimal(difference)));
        } else {
            result.dataset.result = 'none';
            setText(resultLabel, 'NO MONEY NEEDED');
            setText(resultValue, '$0');
        }
    }

    function processTrade() {
        clearTimeout(processTimer);
        if (!isTradePage() || !settings?.display?.enabled) {
            document.getElementById(`${MODULE_ID}-panel`)?.remove();
            return;
        }

        observer?.disconnect();
        try {
            ensureStyles();
            const collected = collectTradeItems();
            if (!collected.trade) return;
            const profile = settings.profiles[activeProfile];
            const valuations = {
                left: { marketItems: [], buyItems: [], marketMissing: 0, buyMissing: 0 },
                right: { marketItems: [], buyItems: [], marketMissing: 0, buyMissing: 0 }
            };

            ['left', 'right'].forEach(side => {
                collected[side].forEach(item => {
                    const valuation = valueTradeItem(item, profile);
                    renderItemValue(item, valuation);
                    if (valuation.marketTotal) valuations[side].marketItems.push(valuation.marketTotal);
                    else valuations[side].marketMissing += 1;
                    if (valuation.buyTotal) valuations[side].buyItems.push(valuation.buyTotal);
                    else valuations[side].buyMissing += 1;
                });
                valuations[side].market = sumDecimals(valuations[side].marketItems);
                valuations[side].buy = sumDecimals(valuations[side].buyItems);
            });

            renderPanel(collected, valuations);
        } catch (error) {
            console.error('[TradeAssistant] Failed to process the trade:', error);
        } finally {
            observeTradeChanges();
        }
    }

    function scheduleProcess(delay = 180) {
        clearTimeout(processTimer);
        processTimer = setTimeout(processTrade, delay);
    }

    function observeTradeChanges() {
        if (!observer) {
            observer = new MutationObserver(() => scheduleProcess());
        }
        observer.disconnect();
        observer.observe(document.body, { childList: true, subtree: true });
    }

    async function initialize() {
        if (initialized) return;
        initialized = true;
        if (!isTradePage()) return;
        const storage = await waitForStorage();
        settings = normalizeSettings(await storage.get(SETTINGS_KEY));
        activeProfile = settings.display.defaultProfile;
        await loadCatalog(storage);

        observeTradeChanges();
        window.addEventListener('hashchange', () => scheduleProcess(100));
        window.addEventListener('popstate', () => scheduleProcess(100));
        chrome.storage?.onChanged?.addListener((changes, areaName) => {
            if (areaName !== 'local' || !changes[SETTINGS_KEY]) return;
            settings = normalizeSettings(changes[SETTINGS_KEY].newValue);
            if (!['public', 'friendly'].includes(activeProfile)) activeProfile = settings.display.defaultProfile;
            scheduleProcess(0);
        });
        scheduleProcess(0);
        console.log('[TradeAssistant] Initialized');
    }

    const TradeAssistantModule = {
        init: initialize,
        refresh: () => scheduleProcess(0),
        getCatalog: () => catalog
    };

    window.SidekickModules ||= {};
    window.SidekickModules.TradeAssistant = TradeAssistantModule;
    initialize().catch(error => console.error('[TradeAssistant] Initialization failed:', error));
})();
