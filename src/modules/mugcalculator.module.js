/**
 * Mug Calculator Module
 * Calculates potential mug value from Item Market, Bazaar, and Point Market listings.
 * 100% client-side — uses only Torn's official API via background.js. No third-party servers.
 *
 * Version: 3.1.0 — Fully local, no worker dependency
 */

const MugCalculatorModule = (() => {
    // ── Constants ───────────────────────────────────────────────────────────
    const CACHE_DURATION = 5000;      // ms — cache player data per session

    const dataCache = {};
    let currentPopups = [];
    const processedRows = new WeakSet(); // WeakSet avoids memory leaks on removed DOM nodes
    let isEnabled = false;

    // ── Helpers ─────────────────────────────────────────────────────────────

    function formatRelativeTime(unixTs) {
        if (!unixTs) return 'Unknown';
        const diff = Math.floor((Date.now() / 1000) - unixTs);
        if (diff < 60)    return `${diff}s ago`;
        if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    function statusIcon(state) {
        switch ((state || '').toLowerCase()) {
            case 'hospital':  return '🏥';
            case 'jail':      return '🔒';
            case 'traveling': return '✈️';
            case 'abroad':    return '🌍';
            case 'federal':   return '🚓';
            case 'okay':      return '🟢';
            default:          return '';
        }
    }

    /**
     * Mug range calculation — actual Torn mechanics.
     *
     * Base steal: 5% of cash on hand, RNG up to 10% (lower values favoured).
     * Masterful Looting (merits): multiplies the BASE by up to 50%.
     *   - each merit adds +5% to the multiplier (10 merits = ×1.5)
     *   - 0 merits → 5% – 10%
     *   - 10 merits → 7.5% – 15%
     * Plunder (weapon bonus): adds a flat 20–49% additively on top.
     *   Formula: base_pct × (1 + merit_bonus + plunder_bonus)
     *   - 0 merits, 0% plunder  →  5.00% – 10.00%
     *   - 10 merits, 0% plunder →  7.50% – 15.00%  (base × 1.5)
     *   - 0 merits, 49% plunder →  7.45% – 14.90%  (base × 1.49)
     *   - 10 merits + 49% plunder → 9.95% – 19.90% (base × 1.99)
     * Clothing Store 7★: 75% reduction (×0.25) on both ends.
     * Source: https://wiki.torn.com/wiki/Mug
     */
    function calculateMugRange(cashOnHand, mugMerits, plunderPercent, clothingProtection) {
        const merits  = Math.min(Math.max(parseInt(mugMerits, 10) || 0, 0), 10);
        const plunder = parseFloat(plunderPercent) || 0;

        // Merits and plunder are both additive bonuses on the base multiplier:
        // total = 1 + merit_bonus + plunder_bonus
        // mug_pct = base_pct × total
        const meritBonus   = merits * 0.05;   // 0→0, 10 merits→0.5
        const plunderBonus = plunder / 100;    // 0%→0, 49%→0.49
        const totalMult    = 1 + meritBonus + plunderBonus;

        let mugMinPct = 0.05 * totalMult;
        let mugMaxPct = 0.10 * totalMult;

        if (clothingProtection) {
            mugMinPct *= 0.25;  // 75% reduction
            mugMaxPct *= 0.25;
        }

        const mugMin = Math.floor(cashOnHand * mugMinPct);
        const mugMax = Math.floor(cashOnHand * mugMaxPct);

        return {
            mugMin,
            mugMax,
            minPct: parseFloat((mugMinPct * 100).toFixed(2)),
            maxPct: parseFloat((mugMaxPct * 100).toFixed(2)),
        };
    }

    // ── CSS ─────────────────────────────────────────────────────────────────

    function addGlobalStyles() {
        if (document.getElementById('sidekick-mugcalc-styles')) return;
        const css = `
            /* ── Mug Info Icon ─────────────────────────────────── */
            .mugInfoIcon {
                margin-left: 5px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: #f59e0b;
                color: #0f1117;
                border-radius: 50%;
                width: 16px;
                height: 16px;
                font-size: 10px;
                font-weight: 800;
                text-align: center;
                line-height: 16px;
                z-index: 1000 !important;
                flex-shrink: 0;
                transition: background 0.15s, transform 0.15s;
                user-select: none;
            }
            .mugInfoIcon:hover {
                background: #d97706;
                transform: scale(1.15);
            }

            /* ── Loading Spinner ───────────────────────────────── */
            .mugLoadingSpinner {
                display: inline-block;
                width: 22px;
                height: 22px;
                border: 2px solid #27272a;
                border-top-color: #f59e0b;
                border-radius: 50%;
                animation: mugSpinAnim 0.65s linear infinite;
            }
            @keyframes mugSpinAnim { to { transform: rotate(360deg); } }

            /* ── Popup Base ────────────────────────────────────── */
            .mugInfoPopup {
                position: fixed;
                background: #1a1d27;
                color: #e4e4e7;
                border: 1px solid #27272a;
                border-radius: 8px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.55);
                font-size: 12px;
                z-index: 99999;
                display: none;
                min-width: 230px;
                max-width: 280px;
                font-family: 'DM Sans', Arial, sans-serif;
                line-height: 1.5;
                padding: 0;
                overflow: hidden;
            }
            .mugInfoPopup.visible { display: block !important; }

            /* ── Popup Loading variant ─────────────────────────── */
            .mugInfoPopup.loading {
                padding: 24px 32px;
                text-align: center;
                display: flex !important;
                align-items: center;
                justify-content: center;
            }

            /* ── Popup Header ──────────────────────────────────── */
            .mugPopupHeader {
                padding: 10px 12px 8px;
                border-bottom: 1px solid #27272a;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .mugPopupHeaderName {
                font-size: 13px;
                font-weight: 700;
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .mugPopupHeaderName a {
                text-decoration: none;
                transition: opacity 0.15s;
            }
            .mugPopupHeaderName a:hover { opacity: 0.8; }

            /* ── Popup Close ───────────────────────────────────── */
            .mugPopupClose {
                background: none;
                border: none;
                color: #71717a;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                line-height: 1;
                flex-shrink: 0;
                transition: color 0.15s;
            }
            .mugPopupClose:hover { color: #e4e4e7; }

            /* ── Popup Body ────────────────────────────────────── */
            .mugPopupBody {
                padding: 10px 12px;
            }
            .mugPopupRow {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                margin-bottom: 3px;
            }
            .mugPopupLabel {
                font-size: 10px;
                font-weight: 600;
                color: #71717a;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                flex-shrink: 0;
                margin-right: 6px;
            }
            .mugPopupValue {
                font-size: 12px;
                color: #e4e4e7;
                text-align: right;
            }

            /* ── Life Bar ──────────────────────────────────────── */
            .mugLifeBarWrap {
                height: 4px;
                border-radius: 2px;
                background: #27272a;
                margin: 4px 0 8px;
                overflow: hidden;
            }
            .mugLifeBarFill {
                height: 100%;
                border-radius: 2px;
                transition: width 0.3s;
            }

            /* ── Section divider ───────────────────────────────── */
            .mugPopupDivider {
                border: none;
                border-top: 1px solid #27272a;
                margin: 8px 0;
            }

            /* ── Mug range highlight ───────────────────────────── */
            .mugRangeMin { color: #22c55e; font-weight: 700; }
            .mugRangeMax { color: #e4e4e7; }

            /* ── Effective cost range ──────────────────────────── */
            .mugEffBest  { color: #22c55e; font-weight: 700; }
            .mugEffWorst { color: #71717a; }

            /* ── Warning note ──────────────────────────────────── */
            .mugClothingNote {
                background: rgba(239,68,68,0.12);
                border: 1px solid rgba(239,68,68,0.3);
                color: #ef4444;
                border-radius: 4px;
                padding: 4px 7px;
                font-size: 10px;
                margin-top: 6px;
                line-height: 1.4;
            }

            /* ── Footer ────────────────────────────────────────── */
            .mugPopupFooter {
                padding: 7px 12px;
                border-top: 1px solid #27272a;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .mugAttackBtn {
                display: inline-flex;
                align-items: center;
                gap: 3px;
                padding: 4px 10px;
                background: #f59e0b;
                color: #0f1117;
                border: none;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                text-decoration: none;
                transition: background 0.15s;
            }
            .mugAttackBtn:hover { background: #d97706; }

            /* ── Error state ───────────────────────────────────── */
            .mugInfoPopup.error {
                border-left: 4px solid #ef4444;
                padding: 12px;
                display: block !important;
            }
            .mugErrorMsg {
                color: #ef4444;
                font-size: 12px;
                font-weight: 600;
            }
        `;
        const el = document.createElement('style');
        el.id = 'sidekick-mugcalc-styles';
        el.textContent = css;
        document.head.appendChild(el);
    }

    // ── Popup creation ───────────────────────────────────────────────────────

    function createLoadingPopup() {
        const popup = document.createElement('div');
        popup.className = 'mugInfoPopup loading visible';
        popup.innerHTML = '<div class="mugLoadingSpinner"></div>';
        return popup;
    }

    function createErrorPopup(message) {
        const popup = document.createElement('div');
        popup.className = 'mugInfoPopup error visible';
        popup.innerHTML = `
            <button class="mugPopupClose" style="position:absolute;top:8px;right:8px;">&times;</button>
            <div class="mugErrorMsg">⚠ Error</div>
            <div style="color:#a1a1aa;font-size:11px;margin-top:4px;">${message}</div>
        `;
        popup.querySelector('.mugPopupClose').addEventListener('click', () => {
            popup.remove();
            const i = currentPopups.indexOf(popup);
            if (i > -1) currentPopups.splice(i, 1);
        });
        return popup;
    }

    /**
     * Build the rich popup from pre-computed data.
     * Works with both worker response shape and direct API shape.
     */
    function createInfoPopup(data, listingTotal, quantity) {
        const {
            // identification
            playerId, playerName,
            // state
            level = 0, state = 'Unknown', status_description,
            status_until = 0, life_current = 0, life_max = 0,
            revivable = false, last_action_timestamp = 0,
            // faction
            faction_name = null, faction_tag = null,
            // money
            cash_on_hand = 0,
            // clothing
            clothing_protection = false, clothing_note = null,
            // mug range
            mug_min_pct = 0, mug_max_pct = 0,
            mug_min_value = 0, mug_max_value = 0,
            // visual
            background_color = '#f59e0b',
        } = data;

        // Effective listing costs after mugging
        const costAfterMaxMug = quantity > 0 ? Math.max(0, Math.floor((listingTotal - mug_max_value) / quantity)) : 0;
        const costAfterMinMug = quantity > 0 ? Math.max(0, Math.floor((listingTotal - mug_min_value) / quantity)) : 0;

        // Life bar
        const lifePct = life_max > 0 ? Math.round((life_current / life_max) * 100) : 0;
        const lifeColor = lifePct < 33 ? '#ef4444' : lifePct < 66 ? '#f59e0b' : '#22c55e';

        // Status countdown
        let statusLine = status_description || state;
        if (status_until > 0) {
            const secsLeft = Math.max(0, Math.floor(status_until - Date.now() / 1000));
            const m = Math.floor(secsLeft / 60);
            const s = secsLeft % 60;
            statusLine += ` <span style="color:#71717a;font-weight:400">(${m}m ${s}s)</span>`;
        }

        const sIcon = statusIcon(state);
        const factionLine = faction_name
            ? `<div class="mugPopupRow">
                <span class="mugPopupLabel">Faction</span>
                <span class="mugPopupValue">${faction_tag ? `[${faction_tag}] ` : ''}${faction_name}</span>
               </div>`
            : '';

        const clothingNoteHtml = clothing_note
            ? `<div class="mugClothingNote">${clothing_note}</div>`
            : '';

        const popup = document.createElement('div');
        popup.className = 'mugInfoPopup visible';
        popup.style.borderLeft = `4px solid ${background_color}`;

        popup.innerHTML = `
            <div class="mugPopupHeader">
                ${sIcon ? `<span style="font-size:13px" title="${state}">${sIcon}</span>` : ''}
                <div class="mugPopupHeaderName">
                    <a href="https://www.torn.com/profiles.php?XID=${playerId}"
                       target="_blank" rel="noopener noreferrer"
                       style="color:${background_color}">
                        ${playerName || 'Unknown'}${playerId ? ` [${playerId}]` : ''}
                    </a>
                </div>
                <button class="mugPopupClose">&times;</button>
            </div>

            <div class="mugPopupBody">
                <!-- Player info -->
                <div class="mugPopupRow">
                    <span class="mugPopupLabel">Level</span>
                    <span class="mugPopupValue">${level}</span>
                </div>
                <div class="mugPopupRow">
                    <span class="mugPopupLabel">Status</span>
                    <span class="mugPopupValue">${statusLine}</span>
                </div>
                <div class="mugPopupRow">
                    <span class="mugPopupLabel">Last Action</span>
                    <span class="mugPopupValue">${formatRelativeTime(last_action_timestamp)}</span>
                </div>
                ${factionLine}

                <!-- Life bar -->
                <div class="mugPopupRow" style="margin-top:6px;">
                    <span class="mugPopupLabel">Life</span>
                    <span class="mugPopupValue">
                        <span style="color:${lifeColor};font-weight:700">${life_current.toLocaleString()}</span>
                        / ${life_max.toLocaleString()}
                        &nbsp;<small style="color:#71717a">Revive:
                            ${revivable
                                ? '<span style="color:#22c55e;font-weight:700">YES</span>'
                                : '<span style="color:#ef4444;font-weight:700">NO</span>'}
                        </small>
                    </span>
                </div>
                <div class="mugLifeBarWrap">
                    <div class="mugLifeBarFill" style="width:${lifePct}%;background:${lifeColor}"></div>
                </div>

                <hr class="mugPopupDivider">

                <!-- Money & mug calculation -->
                <div class="mugPopupRow">
                    <span class="mugPopupLabel">Listing Total</span>
                    <span class="mugPopupValue">$${cash_on_hand.toLocaleString()}</span>
                </div>
                <div class="mugPopupRow">
                    <span class="mugPopupLabel">Mug %</span>
                    <span class="mugPopupValue">
                        <span class="mugRangeMin">${mug_min_pct.toFixed(2)}%</span>
                        <span style="color:#52525b"> – </span>
                        <span class="mugRangeMax">${mug_max_pct.toFixed(2)}%</span>
                    </span>
                </div>
                <div class="mugPopupRow">
                    <span class="mugPopupLabel">Est. Mug</span>
                    <span class="mugPopupValue">
                        <span class="mugRangeMin">$${mug_min_value.toLocaleString()}</span>
                        <span style="color:#52525b"> – </span>
                        <span class="mugRangeMax">$${mug_max_value.toLocaleString()}</span>
                    </span>
                </div>
                <div class="mugPopupRow">
                    <span class="mugPopupLabel">Eff. Cost/item</span>
                    <span class="mugPopupValue">
                        <span class="mugEffBest">$${costAfterMaxMug.toLocaleString()}</span>
                        <span style="color:#52525b"> – </span>
                        <span class="mugEffWorst">$${costAfterMinMug.toLocaleString()}</span>
                    </span>
                </div>
                ${clothingNoteHtml}
            </div>

            <div class="mugPopupFooter">
                <a class="mugAttackBtn"
                   href="https://www.torn.com/page.php?sid=attack&user2ID=${playerId}"
                   target="_blank" rel="noopener noreferrer">⚔ Attack</a>
            </div>
        `;

        popup.querySelector('.mugPopupClose').addEventListener('click', () => {
            popup.remove();
            const i = currentPopups.indexOf(popup);
            if (i > -1) currentPopups.splice(i, 1);
        });

        return popup;
    }

    // ── Popup positioning ────────────────────────────────────────────────────

    function positionPopup(icon, popup) {
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
        if (top < 5) top = 5;
        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
    }

    function closeAllPopups() {
        currentPopups.forEach(p => p.remove());
        currentPopups = [];
    }

    // ── Data fetching ────────────────────────────────────────────────────────

    /**
     * Fetch target profile from Torn API via background.js, then compute the
     * mug range entirely client-side.
     * listingTotal is used as the cash basis — money_onhand is private in Torn API.
     */
    async function fetchMugData(apiKey, playerId, mugMerits, plunderPercent, listingTotal) {
        const cacheKey = `mc_${playerId}_${mugMerits}_${plunderPercent}_${listingTotal}`;
        const now = Date.now();
        if (dataCache[cacheKey] && (now - dataCache[cacheKey].ts < CACHE_DURATION)) {
            return dataCache[cacheKey].data;
        }

        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'fetchTornApi',
                apiKey,
                selections: ['profile'],
                userId: playerId,
            }, (res) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(res);
            });
        });

        if (!response?.success) throw new Error(response?.error || 'API fetch failed');
        const p = response.profile;
        if (!p) throw new Error('No profile in response');

        // Optional: check if target works at a 7★ Clothing Store (75% mug reduction)
        let clothingProtection = false;
        let clothingNote = null;
        if (p.job?.company_id) {
            try {
                const cr = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        action: 'fetchTornApi',
                        apiKey,
                        selections: [],
                        endpoint: `company/${p.job.company_id}`,
                    }, (res) => {
                        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                        else resolve(res);
                    });
                });
                if (cr?.success && cr.company?.company_type === 5 && (cr.company?.rating || cr.company?.stars || 0) >= 7) {
                    clothingProtection = true;
                    clothingNote = `⚠️ Clothing Store ${cr.company.rating || cr.company.stars}★ — 75% mug protection active`;
                }
            } catch { /* non-critical */ }
        }

        // Use listing total as cash basis
        const cashOnHand = listingTotal || 0;
        const { mugMin, mugMax, minPct, maxPct } = calculateMugRange(cashOnHand, mugMerits, plunderPercent, clothingProtection);

        const state = p.status?.state || 'Unknown';
        const stateColors = {
            okay: '#22c55e', hospital: '#ef4444', jail: '#f59e0b',
            traveling: '#3b82f6', abroad: '#3b82f6', federal: '#dc2626',
        };

        const data = {
            success: true,
            level: p.level || 0,
            state,
            status_description: p.status?.description || state,
            status_until: p.status?.until || 0,
            life_current: p.life?.current || 0,
            life_max: p.life?.maximum || 0,
            revivable: p.revivable || false,
            last_action_timestamp: p.last_action?.timestamp || 0,
            faction_name: p.faction?.faction_name || null,
            faction_tag: p.faction?.faction_tag || null,
            cash_on_hand: cashOnHand,
            clothing_protection: clothingProtection,
            clothing_note: clothingNote,
            mug_min_pct: minPct,
            mug_max_pct: maxPct,
            mug_min_value: mugMin,
            mug_max_value: mugMax,
            background_color: stateColors[(state || '').toLowerCase()] || '#71717a',
        };

        dataCache[cacheKey] = { data, ts: now };
        return data;
    }

    // ── Icon click handler ───────────────────────────────────────────────────

    async function handleMugIconClick(listingTotal, quantity, sellerLink, icon, playerName) {
        const apiKey     = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
        const mugMerits  = parseInt(await window.SidekickModules.Core.ChromeStorage.get('mugMerits') || 0, 10);
        const noPlunder  = await window.SidekickModules.Core.ChromeStorage.get('mugNoPlunder');
        const plunderPct = noPlunder === true ? 0 : parseFloat(await window.SidekickModules.Core.ChromeStorage.get('mugPlunder') || 0);

        if (!apiKey) {
            const errPopup = createErrorPopup('No API key configured in Sidekick settings.');
            document.body.appendChild(errPopup);
            positionPopup(icon, errPopup);
            currentPopups.push(errPopup);
            return;
        }

        // Show loading spinner immediately
        const loadingPopup = createLoadingPopup();
        document.body.appendChild(loadingPopup);
        positionPopup(icon, loadingPopup);
        currentPopups.push(loadingPopup);

        try {
            const playerId = extractUserId(sellerLink.href);
            if (!playerId) {
                loadingPopup.remove();
                currentPopups.splice(currentPopups.indexOf(loadingPopup), 1);
                return;
            }

            const data = await fetchMugData(apiKey, playerId, mugMerits, plunderPct, listingTotal);
            data.playerId   = playerId;
            data.playerName = playerName || extractSellerName(sellerLink);

            loadingPopup.remove();
            const li = currentPopups.indexOf(loadingPopup);
            if (li > -1) currentPopups.splice(li, 1);

            const popup = createInfoPopup(data, listingTotal, quantity);
            document.body.appendChild(popup);
            positionPopup(icon, popup);
            currentPopups.push(popup);

        } catch (err) {
            loadingPopup.remove();
            const li = currentPopups.indexOf(loadingPopup);
            if (li > -1) currentPopups.splice(li, 1);

            console.error('[MugCalc] Error:', err);
            const errPopup = createErrorPopup('Failed to fetch data. Check your API key in Sidekick settings.');
            document.body.appendChild(errPopup);
            positionPopup(icon, errPopup);
            currentPopups.push(errPopup);
        }
    }

    // ── DOM helpers ──────────────────────────────────────────────────────────

    function extractUserId(href) {
        const match = href.match(/XID=(\d+)/);
        return match ? match[1] : null;
    }

    function extractSellerName(sellerLink) {
        if (!sellerLink) return '';
        const aria = sellerLink.getAttribute('aria-label') || '';
        const ariaMatch = aria.match(/^(.+?)\s*\[/);
        if (ariaMatch?.[1]) return ariaMatch[1].trim();
        const text = (sellerLink.textContent || '').trim();
        return text.split(/\s+/).pop() || '';
    }

    function waitForElements(selector, callback, maxAttempts = 10, interval = 500) {
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
    }

    // ── Row attachment (Market) ───────────────────────────────────────────────

    async function attachInfoIconForMarketRow(row) {
        if (processedRows.has(row) && row.querySelector('.mugInfoIcon')) return;

        const sellerLink = row.querySelector("a[href*='profiles.php?XID=']");
        let priceElement = row.querySelector('[class*="price___" i]') || row.querySelector('.price') || row.querySelector('[class*="cost___" i]');

        if (!priceElement) {
            const els = Array.from(row.querySelectorAll('span, div, p'))
                .filter(e => e.children.length === 0 && /\$[\d,]+/.test(e.textContent));
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

        const playerName = extractSellerName(sellerLink);

        const icon = document.createElement('div');
        icon.className = 'mugInfoIcon';
        icon.textContent = 'i';
        icon.title = 'Mug calculator';
        priceElement.parentNode.insertBefore(icon, priceElement.nextSibling);

        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllPopups();
            handleMugIconClick(listingTotal, available, sellerLink, icon, playerName);
        });

        processedRows.add(row);
    }

    // ── Row attachment (Bazaar) ───────────────────────────────────────────────

    async function attachInfoIconForBazaarRow(row) {
        if (processedRows.has(row) && row.querySelector('.mugInfoIcon')) return;

        const cells = row.querySelectorAll('td');
        if (cells.length < 4) return;

        const price    = parseInt(cells[0].innerText.replace('$', '').replace(/,/g, ''), 10);
        const quantity = parseInt(cells[1].innerText.replace(/,/g, ''), 10);
        const listingTotal = price * quantity;

        const threshold = parseInt(await window.SidekickModules.Core.ChromeStorage.get('mugThreshold') || 0, 10);
        if (listingTotal < threshold) return;

        const sellerLink = cells[3].querySelector("a[href*='profiles.php?XID=']");
        if (!sellerLink) return;
        if (row.querySelector('.mugInfoIcon')) { processedRows.add(row); return; }

        const playerName = extractSellerName(sellerLink);

        const icon = document.createElement('div');
        icon.className = 'mugInfoIcon';
        icon.textContent = 'i';
        icon.title = 'Mug calculator';
        cells[3].appendChild(icon);

        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllPopups();
            handleMugIconClick(listingTotal, quantity, sellerLink, icon, playerName);
        });

        processedRows.add(row);
    }

    // ── Row attachment (Point Market) ─────────────────────────────────────────

    async function attachInfoIconForPMarketRow(li) {
        if (!li) return;
        if (li.classList.contains('sidekick-pm-processed') && li.querySelector('.mugInfoIcon')) return;

        const expander = li.querySelector('span.expander');
        if (!expander) return;

        const sellerLink = expander.querySelector('span.user-info a.user.name[href*="XID="]');
        if (!sellerLink) return;

        const parseSpan = (sel) => {
            const el = expander.querySelector(sel);
            if (!el) return 0;
            const text = Array.from(el.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && !n.classList.contains('wai')))
                .map(n => n.textContent.trim())
                .join('');
            return parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
        };

        const quantity   = parseSpan('span.points');
        const costEach   = parseSpan('span.cost-each');
        const totalPrice = parseSpan('span.total-price');
        if (!quantity || !costEach) return;
        const listingTotal = totalPrice > 0 ? totalPrice : costEach * quantity;

        const threshold = parseInt(await window.SidekickModules.Core.ChromeStorage.get('mugThreshold') || 0, 10);
        if (threshold > 0 && listingTotal < threshold) return;

        li.classList.add('sidekick-pm-processed');

        const costEachSpan = expander.querySelector('span.cost-each');
        if (!costEachSpan || costEachSpan.querySelector('.mugInfoIcon')) return;

        const playerName = extractSellerName(sellerLink);

        const icon = document.createElement('div');
        icon.className = 'mugInfoIcon';
        icon.textContent = 'i';
        icon.title = 'Mug calculator';
        icon.style.cssText = 'display:inline-block;vertical-align:middle;margin-left:4px;';
        costEachSpan.appendChild(icon);

        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllPopups();
            handleMugIconClick(listingTotal, quantity, sellerLink, icon, playerName);
        });
    }

    // ── Process all ───────────────────────────────────────────────────────────

    function processAllMarketRows() {
        const url = window.location.href;
        // Only scan on allowed pages (allowlist enforced by setup(), but guard here too)
        if (!url.includes('imarket.php') && !url.includes('page.php?sid=ItemMarket')) return;
        const links = document.querySelectorAll("a[href*='profiles.php?XID=']");
        links.forEach(link => {
            const row = link.closest('li, tr, [class*="row___" i], [class*="seller___" i], [class*="item___" i], .item-row');
            if (row) attachInfoIconForMarketRow(row);
        });
    }


    function processAllBazaarRows() {
        document.querySelectorAll('#fullListingsView table tbody tr, #topCheapestView table tbody tr')
            .forEach(row => attachInfoIconForBazaarRow(row));
    }

    function processAllPMarketRows() {
        document.querySelectorAll('ul.users-point-sell > li')
            .forEach(li => attachInfoIconForPMarketRow(li));
    }

    // ── Observers ────────────────────────────────────────────────────────────

    function observeMarketRows() {
        const container = document.querySelector('[class*="sellerListWrapper" i], [class*="items___" i], [class*="itemMarket" i]') || document.body;
        new MutationObserver(() => processAllMarketRows())
            .observe(container, { childList: true, subtree: true });
    }

    function observeBazaarRows() {
        document.querySelectorAll('#fullListingsView, #topCheapestView').forEach(container => {
            new MutationObserver((mutations) => {
                mutations.forEach(m => m.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (node.matches('table tbody tr')) attachInfoIconForBazaarRow(node);
                    else node.querySelectorAll?.('table tbody tr')?.forEach(r => attachInfoIconForBazaarRow(r));
                }));
            }).observe(container, { childList: true, subtree: true });
        });
    }

    function observePMarketRows() {
        new MutationObserver(() => processAllPMarketRows())
            .observe(document.body, { childList: true, subtree: true });
    }

    // ── URL change listener ───────────────────────────────────────────────────

    function setupURLChangeListener() {
        const origPush = history.pushState;
        history.pushState = function () {
            origPush.apply(history, arguments);
            window.dispatchEvent(new Event('locationchange'));
        };
        window.addEventListener('popstate',   () => window.dispatchEvent(new Event('locationchange')));
        window.addEventListener('hashchange', () => window.dispatchEvent(new Event('locationchange')));
        window.addEventListener('locationchange', () => {
            processAllMarketRows();
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    return {
        name: 'MugCalculator',

        async initialize() {
            console.log('[Sidekick] Initializing Mug Calculator Module (v3.0)...');

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

            addGlobalStyles();
            setupURLChangeListener();

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setup());
            } else {
                this.setup();
            }

            console.log('[Sidekick] Mug Calculator Module v3.0 initialized');
        },

        setup() {
            setTimeout(() => {
                const url = window.location.href;

                // Allowlist: only run on Item Market and Points Market
                const isItemMarket = url.includes('imarket.php') || url.includes('page.php?sid=ItemMarket');
                const isPMarket    = url.includes('pmarket.php');

                if (!isItemMarket && !isPMarket) {
                    console.log('[Sidekick] Mug Calculator: not on an allowed page, skipping.');
                    return;
                }

                if (isItemMarket) {
                    waitForElements('[class*="rowWrapper___"], [class*="sellerRow___"], [class*="itemRowWrapper"]', () => {
                        processAllMarketRows();
                        observeMarketRows();
                    });
                    // Periodic sweep for lazily loaded rows
                    setInterval(() => processAllMarketRows(), 2000);
                }

                if (isPMarket) {
                    waitForElements('ul.users-point-sell li', () => {
                        processAllPMarketRows();
                        observePMarketRows();
                    }, 20, 500);
                }
            }, 1000);

            document.addEventListener('click', (e) => {
                if (!currentPopups.some(popup => popup.contains(e.target))) {
                    closeAllPopups();
                }
            });
        },

        async destroy() {
            closeAllPopups();
        },

        /** Flush the in-memory cache so the next popup re-fetches with updated settings. */
        clearCache() {
            Object.keys(dataCache).forEach(k => delete dataCache[k]);
        },
    };
})();

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.MugCalculator = MugCalculatorModule;
