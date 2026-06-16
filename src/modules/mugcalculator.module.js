/**
 * Mug Calculator Module
 * Calculates potential mug value from Item Market and Bazaar listings
 * 100% client-side - uses only Torn's official API, no third-party backends
 * Version: 2.1.0 - Rich popup with life/faction/revivable/last-action
 */

const MugCalculatorModule = (() => {
    const CACHE_DURATION = 5000; // Cache player data for 5 seconds
    const dataCache = {};
    let currentPopups = [];
    const processedRows = new Set();
    let isEnabled = false;

    return {
        name: 'MugCalculator',

        async initialize() {
            console.log('[Sidekick] Initializing Mug Calculator Module...');

            if (!window.SidekickModules?.Core?.ChromeStorage) {
                console.warn('[Sidekick] Core module not available, Mug Calculator disabled');
                return;
            }

            const storageKey = 'sidekick_mug_calculator';
            const settings = await window.SidekickModules.Core.ChromeStorage.get(storageKey) || {};
            isEnabled = settings.isEnabled === true;

            if (!isEnabled) {
                console.log('[Sidekick] Mug Calculator is disabled');
                return;
            }

            this.addGlobalStyles();
            this.setupURLChangeListener();

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setup());
            } else {
                this.setup();
            }

            console.log('[Sidekick] Mug Calculator Module initialized');
        },

        setup() {
            setTimeout(() => {
                this.waitForElements('[class*="rowWrapper___"], [class*="sellerRow___"], [class*="itemRowWrapper"]', () => {
                    this.processAllMarketRows();
                    this.observeMarketRows();
                });
                this.waitForElements('#fullListingsView, #topCheapestView', () => {
                    this.processAllBazaarRows();
                    this.observeBazaarRows();
                });
                // Point market support — uses ul.users-point-sell li structure
                if (window.location.pathname.includes('pmarket.php') || window.location.href.includes('pmarket.php')) {
                    this.waitForElements('ul.users-point-sell li', () => {
                        this.processAllPMarketRows();
                        this.observePMarketRows();
                    }, 20, 500);
                }
                setInterval(() => this.processAllMarketRows(), 2000);
            }, 1000);

            document.addEventListener('click', (e) => {
                if (!currentPopups.some(popup => popup.contains(e.target))) {
                    this.closeAllPopups();
                }
            });
        },

        addGlobalStyles() {
            const css = `
            .mugInfoIcon {
                margin-left: 5px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: #007bff;
                color: white;
                border-radius: 50%;
                width: 16px;
                height: 16px;
                font-size: 11px;
                font-weight: bold;
                text-align: center;
                line-height: 16px;
                z-index: 1000 !important;
                flex-shrink: 0;
            }
            .mugInfoIcon:hover { background: #0056b3; }
            .mugInfoPopup {
                position: fixed;
                color: #333;
                border: 1px solid #ccc;
                padding: 12px;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.18);
                font-size: 12px;
                z-index: 99999;
                display: none;
                background-color: #fff;
                min-width: 220px;
                max-width: 260px;
                font-family: Arial, sans-serif;
                line-height: 1.5;
            }
            .mugInfoPopup.visible { display: block !important; }
            .mugPopupClose {
                position: absolute;
                top: 6px;
                right: 6px;
                background: #d9534f;
                color: white;
                border: none;
                border-radius: 50%;
                width: 18px;
                height: 18px;
                font-size: 13px;
                line-height: 18px;
                text-align: center;
                cursor: pointer;
                padding: 0;
            }
            .mugPopupClose:hover { background: #c9302c; }
            .mugLifeBar {
                height: 6px;
                border-radius: 3px;
                margin: 2px 0 6px 0;
                background: #e0e0e0;
                overflow: hidden;
            }
            .mugLifeBarFill {
                height: 100%;
                border-radius: 3px;
                transition: width 0.3s;
            }
            .mugSection {
                border-top: 1px solid #eee;
                margin-top: 8px;
                padding-top: 8px;
            }
            `;
            const el = document.createElement('style');
            el.textContent = css;
            document.head.appendChild(el);
        },

        waitForElements(selector, callback, maxAttempts = 10, interval = 500) {
            let attempts = 0;
            const check = () => {
                attempts++;
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    callback(elements);
                } else if (attempts < maxAttempts) {
                    setTimeout(check, interval);
                }
            };
            check();
        },

        extractUserId(href) {
            const match = href.match(/XID=(\d+)/);
            return match ? match[1] : null;
        },

        // Mug formula matching Torn's actual mechanics:
        // Base steal = 10% + 1% per merit (capped at 20% with 10 merits)
        // Plunder add-on: extra flat % if wearing plunder equipment
        // Clothing Store 7+ stars: 75% reduction on the stolen amount
        calculateMugAmount(cashOnHand, mugMerits, plunderPercent, hasClothingProtection) {
            const baseRate = 0.10 + (Math.min(mugMerits, 10) * 0.01); // 10–20%
            const plunderRate = plunderPercent > 0 ? (plunderPercent / 100) : 0;
            let mugAmount = Math.floor(cashOnHand * (baseRate + plunderRate));
            if (hasClothingProtection) {
                mugAmount = Math.floor(mugAmount * 0.25); // 75% reduction
            }
            return mugAmount;
        },

        getStatusColor(state) {
            if (!state) return '#f0f0f0';
            const s = state.toLowerCase();
            if (s.includes('hospital')) return '#ffd6d6';
            if (s.includes('jail')) return '#ffe5cc';
            if (s.includes('traveling') || s.includes('abroad')) return '#d6eaff';
            if (s.includes('okay') || s.includes('idle')) return '#d6f5d6';
            return '#f0f0f0';
        },

        // Format a relative "last action" string from a unix timestamp
        formatRelativeTime(unixTs) {
            if (!unixTs) return 'Unknown';
            const diff = Math.floor((Date.now() / 1000) - unixTs);
            if (diff < 60) return `${diff}s ago`;
            if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
            return `${Math.floor(diff / 86400)}d ago`;
        },

        createInfoPopup(player, mugAmount, newCostPerItem, cashOnHand) {
            const popup = document.createElement('div');
            popup.className = 'mugInfoPopup';

            const state = player.status?.state || 'Unknown';
            const statusDesc = player.status?.description || state;
            const until = player.status?.until || 0;
            const bgColor = this.getStatusColor(state);

            // Status countdown
            let statusLine = `<strong>Status:</strong> ${statusDesc}`;
            if (until > Date.now() / 1000 && until > 0) {
                const secsLeft = Math.max(0, Math.floor(until - Date.now() / 1000));
                const m = Math.floor(secsLeft / 60);
                const s = secsLeft % 60;
                statusLine += ` <span style="font-weight:normal;font-size:11px">(${m}m ${s}s)</span>`;
            }

            // Life bar
            const lifeMax = player.life?.maximum || player.life?.max_life || 0;
            const lifeCur = player.life?.current || player.life?.current_life || 0;
            const lifePct = lifeMax > 0 ? Math.round((lifeCur / lifeMax) * 100) : 0;
            const lifeColor = lifePct < 33 ? '#d9534f' : lifePct < 66 ? '#f0ad4e' : '#5cb85c';
            const revivable = player.revivable ? '<span style="color:#5cb85c;font-weight:bold">YES</span>'
                : '<span style="color:#d9534f;font-weight:bold">NO</span>';

            // Faction
            const factionLine = player.faction?.faction_name
                ? `<strong>Faction:</strong> ${player.faction.faction_tag ? `[${player.faction.faction_tag}] ` : ''}${player.faction.faction_name}<br>`
                : '';

            // Clothing protection warning
            const protectionNote = player.hasClothingProtection
                ? `<div style="background:#fff3cd;padding:4px 6px;border-radius:3px;border:1px solid #ffc107;margin-top:6px;font-size:11px;">⚠️ <strong>75% Mug Protection</strong> (Clothing Store 7★)</div>`
                : '';

            const mugPct = cashOnHand > 0 ? (mugAmount / cashOnHand * 100).toFixed(2) : '0.00';

            popup.innerHTML = `
                <button class="mugPopupClose" title="Close">×</button>
                <div>
                    <strong>Level:</strong> ${player.level || '?'}<br>
                    ${statusLine}<br>
                    <strong>Last Action:</strong> ${this.formatRelativeTime(player.last_action?.timestamp)}<br>
                    ${factionLine}
                </div>
                <div class="mugSection">
                    <strong>Life:</strong> <span style="color:${lifeColor};font-weight:bold">${lifeCur.toLocaleString()}</span> / ${lifeMax.toLocaleString()} &nbsp;<small>(Revive: ${revivable})</small>
                    <div class="mugLifeBar"><div class="mugLifeBarFill" style="width:${lifePct}%;background:${lifeColor}"></div></div>
                </div>
                <div class="mugSection">
                    <strong>Cash on hand:</strong> $${cashOnHand.toLocaleString()}<br>
                    <strong>Mug:</strong> ~${mugPct}% ≈ <strong>$${mugAmount.toLocaleString()}</strong><br>
                    <strong>Item cost after mug:</strong> $${newCostPerItem.toLocaleString()}
                    ${protectionNote}
                </div>
            `;

            popup.style.borderLeft = `5px solid ${lifeColor}`;
            popup.style.backgroundColor = bgColor;

            popup.querySelector('.mugPopupClose').addEventListener('click', () => {
                popup.remove();
                const idx = currentPopups.indexOf(popup);
                if (idx > -1) currentPopups.splice(idx, 1);
            });

            return popup;
        },

        positionPopup(icon, popup) {
            const rect = icon.getBoundingClientRect();
            popup.style.visibility = 'hidden';
            popup.style.display = 'block';
            const ph = popup.offsetHeight;
            const pw = popup.offsetWidth;
            popup.style.display = '';
            popup.style.visibility = '';

            let top = rect.bottom + 5;
            let left = rect.left;
            if (top + ph > window.innerHeight - 5) top = rect.top - ph - 5;
            if (left + pw > window.innerWidth - 5) left = window.innerWidth - pw - 5;
            if (left < 5) left = 5;
            popup.style.top = `${top}px`;
            popup.style.left = `${left}px`;
        },

        closeAllPopups() {
            currentPopups.forEach(p => p.remove());
            currentPopups = [];
        },

        // Fetch player profile from Torn API via background script
        async fetchPlayerData(playerId) {
            const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
            if (!apiKey) {
                console.error('[MugCalc] No API key found');
                return null;
            }

            const cacheKey = `mc_${playerId}`;
            const now = Date.now();
            if (dataCache[cacheKey] && (now - dataCache[cacheKey].ts < CACHE_DURATION)) {
                return dataCache[cacheKey].data;
            }

            try {
                // profile selection returns: level, status, life, faction, last_action, revivable, job
                const response = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        action: 'fetchTornApi',
                        apiKey,
                        selections: ['profile'],
                        userId: playerId
                    }, (res) => {
                        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                        else resolve(res);
                    });
                });

                if (!response?.success) throw new Error(response?.error || 'API fetch failed');

                const p = response.profile;
                if (!p) throw new Error('No profile in response');

                // Check Clothing Store 7+ star protection
                let hasClothingProtection = false;
                if (p.job?.company_id) {
                    try {
                        const cr = await new Promise((resolve, reject) => {
                            chrome.runtime.sendMessage({
                                action: 'fetchTornApi',
                                apiKey,
                                selections: [],
                                endpoint: `company/${p.job.company_id}`
                            }, (res) => {
                                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                                else resolve(res);
                            });
                        });
                        if (cr?.success && cr.company?.company_type === 5 && (cr.company?.stars || 0) >= 7) {
                            hasClothingProtection = true;
                        }
                    } catch { /* ignore — non-critical */ }
                }

                // money_onhand from personalstats is the cleanest "cash in pocket" field
                // It comes from the profile selection under personal_stats in some API versions.
                // Fall back to 0 — caller will use the market listing value instead.
                const cashOnHand = p.money_onhand || p.moneyOnHand || p.personal_stats?.moneyOnHand || 0;

                const data = {
                    level: p.level || 0,
                    status: p.status || { state: 'Unknown' },
                    life: p.life || { current: 0, maximum: 0 },
                    last_action: p.last_action || null,
                    revivable: p.revivable || false,
                    faction: p.faction || null,
                    cashOnHand,
                    hasClothingProtection
                };

                dataCache[cacheKey] = { data, ts: now };
                return data;

            } catch (err) {
                console.error('[MugCalc] fetchPlayerData error:', err);
                return null;
            }
        },

        async handleMugIconClick(listingTotal, quantity, threshold, sellerLink, icon) {
            try {
                const mugMerits = parseInt(await window.SidekickModules.Core.ChromeStorage.get('mugMerits') || 0, 10);
                const noPlunder = await window.SidekickModules.Core.ChromeStorage.get('mugNoPlunder');
                const plunderPct = noPlunder === true ? 0 : parseFloat(await window.SidekickModules.Core.ChromeStorage.get('mugPlunder') || 0);

                const playerId = this.extractUserId(sellerLink.href);
                if (!playerId) { console.error('[MugCalc] No player ID'); return; }

                const player = await this.fetchPlayerData(playerId);
                if (!player) return;

                // Use cash on hand from API if available; otherwise use listing total as a proxy
                const cashOnHand = player.cashOnHand > 0 ? player.cashOnHand : listingTotal;

                const mugAmount = this.calculateMugAmount(cashOnHand, mugMerits, plunderPct, player.hasClothingProtection);
                const newCostPerItem = quantity > 0 ? Math.floor((listingTotal - mugAmount) / quantity) : 0;

                const popup = this.createInfoPopup(player, mugAmount, newCostPerItem, cashOnHand);
                document.body.appendChild(popup);
                this.positionPopup(icon, popup);
                popup.classList.add('visible');
                currentPopups.push(popup);

            } catch (err) {
                console.error('[MugCalc] handleMugIconClick error:', err);
            }
        },

        async attachInfoIconForMarketRow(row) {
            if (processedRows.has(row) && row.querySelector('.mugInfoIcon')) return;
            if (processedRows.has(row) && !row.querySelector('.mugInfoIcon')) processedRows.delete(row);

            const sellerLink = row.querySelector("a[href*='profiles.php?XID=']");
            let priceElement = row.querySelector('[class*="price___" i]') || row.querySelector('.price') || row.querySelector('[class*="cost___" i]');
            
            if (!priceElement) {
                // Fallback: look for an element with a dollar sign amount
                const els = Array.from(row.querySelectorAll('span, div, p')).filter(e => e.children.length === 0 && /\$[\d,]+/.test(e.textContent));
                if (els.length > 0) priceElement = els[0];
            }

            if (!sellerLink || !priceElement) return;

            const priceText = priceElement.textContent.replace(/\$/g, '').replace(/,/g, '');
            const price = parseInt(priceText, 10);
            if (isNaN(price)) return;

            const availableElem = row.querySelector('[class*="available___" i]') || row.querySelector('[class*="qty___" i]') || row.querySelector('[class*="quantity" i]');
            const availText = availableElem ? availableElem.textContent.replace(/ available|,/gi, '') : '1';
            const available = parseInt(availText, 10) || 1;
            const listingTotal = price * available;

            const threshold = parseInt(await window.SidekickModules.Core.ChromeStorage.get('mugThreshold') || 0, 10);
            if (listingTotal < threshold) return;
            if (row.querySelector('.mugInfoIcon')) { processedRows.add(row); return; }

            const icon = document.createElement('div');
            icon.className = 'mugInfoIcon';
            icon.textContent = 'i';
            priceElement.parentNode.insertBefore(icon, priceElement.nextSibling);

            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeAllPopups();
                this.handleMugIconClick(listingTotal, available, threshold, sellerLink, icon);
            });

            processedRows.add(row);
        },

        async attachInfoIconForBazaarRow(row) {
            if (processedRows.has(row) && row.querySelector('.mugInfoIcon')) return;
            if (processedRows.has(row) && !row.querySelector('.mugInfoIcon')) processedRows.delete(row);

            const cells = row.querySelectorAll('td');
            if (cells.length < 4) return;

            const price = parseInt(cells[0].innerText.replace('$', '').replace(/,/g, ''), 10);
            const quantity = parseInt(cells[1].innerText.replace(/,/g, ''), 10);
            const listingTotal = price * quantity;

            const threshold = parseInt(await window.SidekickModules.Core.ChromeStorage.get('mugThreshold') || 0, 10);
            if (listingTotal < threshold) return;

            const sellerLink = cells[3].querySelector("a[href*='profiles.php?XID=']");
            if (!sellerLink) return;
            if (row.querySelector('.mugInfoIcon')) { processedRows.add(row); return; }

            const icon = document.createElement('div');
            icon.className = 'mugInfoIcon';
            icon.textContent = 'i';
            cells[3].appendChild(icon);

            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeAllPopups();
                this.handleMugIconClick(listingTotal, quantity, threshold, sellerLink, icon);
            });

            processedRows.add(row);
        },

        processAllMarketRows() {
            const links = document.querySelectorAll("a[href*='profiles.php?XID=']");
            links.forEach(link => {
                const row = link.closest('li, tr, [class*="row___" i], [class*="seller___" i], [class*="item___" i], .item-row');
                if (row) {
                    this.attachInfoIconForMarketRow(row);
                }
            });
        },

        observeMarketRows() {
            const container = document.querySelector('[class*="sellerListWrapper" i], [class*="items___" i], [class*="itemMarket" i]') || document.body;
            if (!container) return;
            new MutationObserver((mutations) => {
                // Throttle calls using the 2s interval rather than processing every single mutation
                // The interval is already running setup().
            }).observe(container, { childList: true, subtree: true });
        },

        processAllBazaarRows() {
            document.querySelectorAll('#fullListingsView table tbody tr, #topCheapestView table tbody tr')
                .forEach(row => this.attachInfoIconForBazaarRow(row));
        },

        observeBazaarRows() {
            document.querySelectorAll('#fullListingsView, #topCheapestView').forEach(container => {
                new MutationObserver((mutations) => {
                    mutations.forEach(m => m.addedNodes.forEach(node => {
                        if (node.nodeType !== 1) return;
                        if (node.matches('table tbody tr')) {
                            this.attachInfoIconForBazaarRow(node);
                        } else {
                            node.querySelectorAll?.('table tbody tr')?.forEach(r => this.attachInfoIconForBazaarRow(r));
                        }
                    }));
                }).observe(container, { childList: true, subtree: true });
            });
        },

        // =============================================================
        // Point Market (pmarket.php) support
        // DOM: ul.users-point-sell > li > span.expander
        //   span.user-info     → contains seller link a.user.name[href*=XID=]
        //   span.points        → amount of points
        //   span.cost-each     → price per point
        //   span.total-price   → total listing price
        // =============================================================
        async attachInfoIconForPMarketRow(li) {
            if (!li) return;
            if (li.classList.contains('sidekick-pm-processed') && li.querySelector('.mugInfoIcon')) return;

            const expander = li.querySelector('span.expander');
            if (!expander) return;

            const sellerLink = expander.querySelector('span.user-info a.user.name[href*="XID="]');
            if (!sellerLink) return;

            const parseSpan = (sel) => {
                const el = expander.querySelector(sel);
                if (!el) return 0;
                // skip screen-reader wai children
                const text = Array.from(el.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && !n.classList.contains('wai')))
                    .map(n => n.textContent.trim())
                    .join('');
                return parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
            };

            const quantity = parseSpan('span.points');
            const costEach = parseSpan('span.cost-each');
            const totalPrice = parseSpan('span.total-price');

            if (!quantity || !costEach) return;
            const listingTotal = totalPrice > 0 ? totalPrice : costEach * quantity;

            const threshold = parseInt(await window.SidekickModules.Core.ChromeStorage.get('mugThreshold') || 0, 10);
            if (threshold > 0 && listingTotal < threshold) return;

            // Mark processed BEFORE async work to avoid races
            li.classList.add('sidekick-pm-processed');

            const costEachSpan = expander.querySelector('span.cost-each');
            if (!costEachSpan || costEachSpan.querySelector('.mugInfoIcon')) return;

            const icon = document.createElement('div');
            icon.className = 'mugInfoIcon';
            icon.textContent = 'i';
            icon.title = 'Mug info';
            icon.style.cssText = 'display:inline-block;vertical-align:middle;margin-left:4px;';
            costEachSpan.appendChild(icon);

            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeAllPopups();
                this.handlePMarketIconClick(listingTotal, quantity, costEach, threshold, sellerLink, icon);
            });
        },


        async handlePMarketIconClick(listingTotal, quantity, costEach, threshold, sellerLink, icon) {
            try {
                const mugMerits = parseInt(await window.SidekickModules.Core.ChromeStorage.get('mugMerits') || 0, 10);
                const noPlunder = await window.SidekickModules.Core.ChromeStorage.get('mugNoPlunder');
                const plunderPct = noPlunder === true ? 0 : parseFloat(await window.SidekickModules.Core.ChromeStorage.get('mugPlunder') || 0);

                const playerId = this.extractUserId(sellerLink.href);
                if (!playerId) return;

                const player = await this.fetchPlayerData(playerId);
                if (!player) return;

                const cashOnHand = player.cashOnHand > 0 ? player.cashOnHand : listingTotal;
                const mugAmount = this.calculateMugAmount(cashOnHand, mugMerits, plunderPct, player.hasClothingProtection);

                const netCash = Math.max(0, listingTotal - mugAmount);
                const effectiveCostEach = quantity > 0 ? Math.floor(netCash / quantity) : 0;

                const popup = this.createPMarketPopup(player, mugAmount, effectiveCostEach, costEach, quantity, cashOnHand);
                document.body.appendChild(popup);
                this.positionPopup(icon, popup);
                popup.classList.add('visible');
                currentPopups.push(popup);
            } catch (err) {
                console.error('[MugCalc] handlePMarketIconClick error:', err);
            }
        },

        createPMarketPopup(player, mugAmount, effectiveCostEach, originalCostEach, quantity, cashOnHand) {
            const popup = document.createElement('div');
            popup.className = 'mugInfoPopup';

            const state = player.status?.state || 'Unknown';
            const statusDesc = player.status?.description || state;
            const until = player.status?.until || 0;
            const bgColor = this.getStatusColor(state);

            let statusLine = `<strong>Status:</strong> ${statusDesc}`;
            if (until > Date.now() / 1000 && until > 0) {
                const secsLeft = Math.max(0, Math.floor(until - Date.now() / 1000));
                statusLine += ` <span style="font-weight:normal;font-size:11px">(${Math.floor(secsLeft / 60)}m ${secsLeft % 60}s)</span>`;
            }

            const lifeMax = player.life?.maximum || player.life?.max_life || 0;
            const lifeCur = player.life?.current || player.life?.current_life || 0;
            const lifePct = lifeMax > 0 ? Math.round((lifeCur / lifeMax) * 100) : 0;
            const lifeColor = lifePct < 33 ? '#d9534f' : lifePct < 66 ? '#f0ad4e' : '#5cb85c';
            const revivable = player.revivable
                ? '<span style="color:#5cb85c;font-weight:bold">YES</span>'
                : '<span style="color:#d9534f;font-weight:bold">NO</span>';

            const factionLine = player.faction?.faction_name
                ? `<strong>Faction:</strong> ${player.faction.faction_tag ? `[${player.faction.faction_tag}] ` : ''}${player.faction.faction_name}<br>`
                : '';

            const mugPct = cashOnHand > 0 ? (mugAmount / cashOnHand * 100).toFixed(2) : '0.00';
            const saving = originalCostEach - effectiveCostEach;

            popup.innerHTML = `
                <button class="mugPopupClose" title="Close">&times;</button>
                <div>
                    <strong>Level:</strong> ${player.level || '?'}<br>
                    ${statusLine}<br>
                    <strong>Last Action:</strong> ${this.formatRelativeTime(player.last_action?.timestamp)}<br>
                    ${factionLine}
                </div>
                <div class="mugSection">
                    <strong>Life:</strong> <span style="color:${lifeColor};font-weight:bold">${lifeCur.toLocaleString()}</span> / ${lifeMax.toLocaleString()} &nbsp;<small>(Revive: ${revivable})</small>
                    <div class="mugLifeBar"><div class="mugLifeBarFill" style="width:${lifePct}%;background:${lifeColor}"></div></div>
                </div>
                <div class="mugSection">
                    <strong>Cash on hand:</strong> $${cashOnHand.toLocaleString()}<br>
                    <strong>Mug:</strong> ~${mugPct}% &asymp; <strong>$${mugAmount.toLocaleString()}</strong><br>
                    <strong>Listed:</strong> $${originalCostEach.toLocaleString()}/pt &times; ${quantity.toLocaleString()} pts<br>
                    <strong>Effective cost/pt after mug:</strong> $${effectiveCostEach.toLocaleString()}
                    ${saving > 0 ? `<span style="color:#5cb85c;font-size:11px"> (save $${saving.toLocaleString()}/pt)</span>` : ''}
                </div>
            `;

            popup.style.borderLeft = `5px solid ${lifeColor}`;
            popup.style.backgroundColor = bgColor;

            popup.querySelector('.mugPopupClose').addEventListener('click', () => {
                popup.remove();
                const idx = currentPopups.indexOf(popup);
                if (idx > -1) currentPopups.splice(idx, 1);
            });

            return popup;
        },

        processAllPMarketRows() {
            document.querySelectorAll('ul.users-point-sell > li').forEach(li => this.attachInfoIconForPMarketRow(li));
        },

        observePMarketRows() {
            new MutationObserver(() => this.processAllPMarketRows())
                .observe(document.body, { childList: true, subtree: true });
            console.log('[MugCalc] pmarket observer attached to body');
        },

        setupURLChangeListener() {
            const origPush = history.pushState;
            history.pushState = function () {
                origPush.apply(history, arguments);
                window.dispatchEvent(new Event('locationchange'));
            };
            window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
            window.addEventListener('hashchange', () => window.dispatchEvent(new Event('locationchange')));
            window.addEventListener('locationchange', () => {
                processedRows.clear();
                this.processAllMarketRows();
            });
        },

        async destroy() {
            this.closeAllPopups();
            processedRows.clear();
        }
    };
})();

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.MugCalculator = MugCalculatorModule;
