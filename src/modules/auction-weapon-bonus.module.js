const AuctionWeaponBonusModule = (() => {
    const STORAGE_KEY = 'auction-weapon-bonus';
    const STYLE_ID = 'sidekick-auction-weapon-bonus-styles';
    const PROCESSED_ATTR = 'data-ska-auction-weapon-bonus';
    let observer = null;
    let debounceTimer = null;

    function isAuctionPage() {
        return window.location.href.includes('amarket.php');
    }

    function isItemMarketPage() {
        const url = window.location.href;
        return url.includes('imarket.php') || url.includes('page.php?sid=ItemMarket');
    }

    function isBazaarPage() {
        return window.location.href.includes('bazaar.php');
    }

    function isInventoryPage() {
        const url = window.location.href;
        return url.includes('inventory.php') || url.includes('page.php?sid=inventory');
    }

    function isMarketOrBazaarPage() {
        return isItemMarketPage() || isBazaarPage();
    }

    async function getSettings() {
        return window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
    }

    function shouldRun(settings) {
        return settings?.[STORAGE_KEY]?.isEnabled === true;
    }

    function injectStylesheet() {
        if (document.head.querySelector(`#${STYLE_ID}`)) {
            return;
        }

        const styles = document.createElement('style');
        styles.id = STYLE_ID;
        styles.textContent = `
            .sidekick-auction-bonus-item {
                transition: background-color 0.2s ease, outline 0.2s ease;
            }

            .sidekick-auction-bonus-container {
                display: flex;
                flex-wrap: wrap;
                gap: 6px 10px;
                margin-top: 6px;
            }

            .sidekick-auction-bonus-text {
                display: inline-block;
                padding: 3px 8px;
                border-radius: 10px;
                font-size: 11px;
                line-height: 1.2;
                color: #fff;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                cursor: default;
                transition: filter 0.15s ease;
            }

            .sidekick-auction-bonus-text:hover {
                filter: brightness(1.2);
            }

            .sidekick-auction-bonus--red .sidekick-auction-bonus-text {
                background: rgba(230, 77, 25, 0.22);
                border-color: rgba(230, 77, 25, 0.55);
            }

            .sidekick-auction-bonus--orange .sidekick-auction-bonus-text {
                background: rgba(209, 129, 0, 0.18);
                border-color: rgba(209, 129, 0, 0.65);
            }

            .sidekick-auction-bonus--yellow .sidekick-auction-bonus-text {
                background: rgba(252, 247, 94, 0.16);
                border-color: rgba(255, 255, 0, 0.6);
                color: #1c1c1c;
            }

            .sidekick-auction-bonus-icon-enhanced {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s ease, filter 0.2s ease;
                vertical-align: middle;
                position: relative;
                z-index: 1;
            }

            /* On item market / bazaar: much larger icons */
            .ska-market-page .sidekick-auction-bonus-icon-enhanced,
            .ska-market-page .sidekick-auction-bonus-icon-enhanced i {
                transform: scale(2.8);
                transform-origin: center center;
                filter: drop-shadow(0 0 3px rgba(255,255,255,0.25));
            }

            .ska-market-page .sidekick-auction-bonus-icon-enhanced:hover,
            .ska-market-page .sidekick-auction-bonus-icon-enhanced:hover i {
                transform: scale(3.1);
                filter: drop-shadow(0 0 5px rgba(255,255,255,0.5));
            }

            /* On inventory: same size as auction house, but icons get a red square outline */
            .ska-inventory-page .sidekick-auction-bonus-icon-enhanced {
                outline: 2px solid #cc2222;
                outline-offset: 2px;
                border-radius: 2px;
                transform: scale(1.22);
            }

            .ska-inventory-page .sidekick-auction-bonus-icon-enhanced:hover {
                transform: scale(1.45);
                outline-color: #ff4444;
            }

            /* On auction house: modest size (existing behaviour) */
            .ska-auction-page .sidekick-auction-bonus-icon-enhanced,
            .ska-auction-page .sidekick-auction-bonus-icon-enhanced i {
                transform: scale(1.22);
            }

            /* Spacing so enlarged icons don't overlap adjacent text */
            .ska-market-page .item-bonuses .iconsbonuses {
                display: inline-flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
                padding: 4px 0;
            }

            .sidekick-auction-bonus-container + .item-bonuses {
                margin-top: 4px;
            }

            /* ── Custom bonus tooltip ──────────────────────────────── */
            #ska-bonus-tip {
                position: fixed;
                z-index: 9999999;
                background: #1a1d27;
                border: 1px solid rgba(255,255,255,.14);
                border-radius: 8px;
                padding: 9px 13px;
                font-size: 12px;
                color: #e4e4e7;
                max-width: 240px;
                line-height: 1.55;
                pointer-events: none;
                display: none;
                box-shadow: 0 8px 28px rgba(0,0,0,.6);
                font-family: 'Segoe UI', Arial, sans-serif;
            }
            #ska-bonus-tip strong {
                color: #fff;
                font-size: 12.5px;
                display: block;
                margin-bottom: 4px;
            }
            #ska-bonus-tip span {
                color: rgba(255,255,255,.65);
            }
        `;

        document.head.appendChild(styles);
    }

    // ── Custom tooltip ─────────────────────────────────────────────────────────
    function setupBonusTooltip() {
        if (document.getElementById('ska-bonus-tip')) return;

        const tip = document.createElement('div');
        tip.id = 'ska-bonus-tip';
        document.body.appendChild(tip);

        function positionTip(e) {
            const tw = tip.offsetWidth  || 220;
            const th = tip.offsetHeight || 60;
            let x = e.clientX + 14;
            let y = e.clientY + 14;
            if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - 14;
            if (y + th > window.innerHeight - 8) y = e.clientY - th - 14;
            tip.style.left = `${x}px`;
            tip.style.top  = `${y}px`;
        }

        document.addEventListener('mouseover', (e) => {
            const pill = e.target.closest?.('.sidekick-auction-bonus-text');
            if (!pill) { tip.style.display = 'none'; return; }

            const name = pill.dataset.bonusName || pill.textContent.trim();
            const desc = pill.dataset.bonusDesc || '';
            if (!name) return;

            tip.innerHTML = desc
                ? `<strong>${name}</strong><span>${desc}</span>`
                : `<strong>${name}</strong>`;

            tip.style.display = 'block';
            positionTip(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (tip.style.display === 'none') return;
            const pill = e.target.closest?.('.sidekick-auction-bonus-text');
            if (!pill) { tip.style.display = 'none'; return; }
            positionTip(e);
        });

        document.addEventListener('mouseout', (e) => {
            const pill = e.target.closest?.('.sidekick-auction-bonus-text');
            if (!pill) return;
            // Only hide if we're not moving to a child element of the pill
            if (!pill.contains(e.relatedTarget)) {
                tip.style.display = 'none';
            }
        });
    }

    // ── Bonus extraction ───────────────────────────────────────────────────────

    /**
     * Parse a bonus span and return { label, name, bonus, description }.
     * The span's title attribute contains HTML like:
     *   <b>Plunder</b><br>Steal an additional 20-49% of cash on hand...
     */
    function extractBonusData(span) {
        const raw = span.title || span.getAttribute('data-original-title') || '';

        // Parse name from <b>…</b>
        const nameMatch = raw.match(/<b>([^<]+)<\/b>/i);
        const name = nameMatch?.[1]?.trim()
            || raw.replace(/<[^>]*>/g, '').split('\n')[0].trim();

        // Parse bonus value: "21%", "135%", "30 turns" etc.
        const bonusMatch = raw.match(/(\d+%|\d+\s*turns?)/i);
        const bonus = bonusMatch?.[1]?.trim() || '';

        const label = name ? `${name}${bonus ? ` ${bonus}` : ''}` : '';

        // Parse description: text after <br> following the name
        // Handles: <b>Name</b><br>Description  and  <b>Name</b><br/>Description
        const descMatch = raw.match(/<\/b>\s*<br\s*\/?>\s*([\s\S]*)/i)
            || raw.match(/<br\s*\/?>\s*([\s\S]+)/i);
        const description = descMatch?.[1]
            ? descMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
            : '';

        return { label, name, bonus, description };
    }

    function getBonusData(item) {
        const tooltipSpans = [...item.querySelectorAll('.item-bonuses .iconsbonuses span')];
        return tooltipSpans
            .map(extractBonusData)
            .filter(d => d.label);
    }

    // Legacy wrapper — keep getBonusStrings for market/bazaar icon enhancement path
    function extractBonusText(span) {
        return extractBonusData(span).label;
    }

    function getBonusStrings(item) {
        return getBonusData(item).map(d => d.label).filter(Boolean);
    }

    function getMarketBonusSpans() {
        return [...document.querySelectorAll('.item-bonuses .iconsbonuses span')];
    }

    function enhanceBonusIconSpan(span) {
        if (span.dataset.skaAuctionIconEnhanced === 'true') {
            return;
        }

        const icon = span.querySelector('i');
        if (icon) {
            icon.classList.add('sidekick-auction-bonus-icon-enhanced');
        } else {
            span.classList.add('sidekick-auction-bonus-icon-enhanced');
        }

        span.dataset.skaAuctionIconEnhanced = 'true';
    }

    function updateMarketBonusIcons() {
        if (!isMarketOrBazaarPage()) {
            return;
        }
        getMarketBonusSpans().forEach(enhanceBonusIconSpan);
    }

    function getGlowType(item) {
        const classMatch = item.className.match(/glow-([a-zA-Z0-9_-]+)/);
        if (classMatch) {
            return classMatch[1];
        }

        const outerMatch = item.outerHTML.match(/glow-([a-zA-Z0-9_-]+)/);
        return outerMatch ? outerMatch[1] : null;
    }

    function renderItem(item) {
        if (item.getAttribute(PROCESSED_ATTR) === 'true') {
            return;
        }

        const bonusData = getBonusData(item);
        const titleElement = item.querySelector('span.title');

        if (!titleElement) {
            item.setAttribute(PROCESSED_ATTR, 'true');
            return;
        }

        if (!bonusData.length) {
            item.setAttribute(PROCESSED_ATTR, 'true');
            return;
        }

        let bonusContainer = titleElement.querySelector('.sidekick-auction-bonus-container');
        if (!bonusContainer) {
            bonusContainer = document.createElement('div');
            bonusContainer.className = 'sidekick-auction-bonus-container';
            titleElement.appendChild(bonusContainer);
        }

        // Render pills — store name + description on data attributes for the tooltip
        bonusContainer.innerHTML = bonusData
            .map(({ label, name, description }) => {
                const safeName = name.replace(/"/g, '&quot;');
                const safeDesc = description.replace(/"/g, '&quot;');
                return `<p class="sidekick-auction-bonus-text" data-bonus-name="${safeName}" data-bonus-desc="${safeDesc}">${label}</p>`;
            })
            .join('');

        const colorType = getGlowType(item);
        if (colorType) {
            item.classList.add('sidekick-auction-bonus-item', `sidekick-auction-bonus--${colorType}`);
        }

        item.setAttribute(PROCESSED_ATTR, 'true');
    }

    function getAuctionItems() {
        const listItems = [...document.querySelectorAll('ul.items-list li')];
        return listItems.filter((li) => !li.classList.contains('last') && !li.classList.contains('clear'));
    }

    function updateAuctionItems() {
        getAuctionItems().forEach(renderItem);
    }

    function handleMutations() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updateAuctionItems();
            updateMarketBonusIcons();
        }, 150);
    }

    function observePageChanges(targetElement) {
        if (!targetElement) {
            return;
        }

        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver(handleMutations);
        observer.observe(targetElement, {
            childList: true,
            subtree: true
        });
    }

    function waitForPageReady() {
        return new Promise((resolve) => {
            if (document.body) {
                resolve(document.body);
                return;
            }

            const listener = () => {
                document.removeEventListener('DOMContentLoaded', listener);
                resolve(document.body);
            };

            document.addEventListener('DOMContentLoaded', listener);
        });
    }

    return {
        async init() {
            const auctionPage = isAuctionPage();
            const marketPage = isMarketOrBazaarPage();
            const inventoryPage = isInventoryPage();

            if (!auctionPage && !marketPage && !inventoryPage) {
                return;
            }

            const settings = await getSettings();
            if (auctionPage && !shouldRun(settings)) {
                return;
            }

            // Tag body with page type so CSS selectors scale icons correctly
            if (marketPage) {
                document.body.classList.add('ska-market-page');
            } else if (auctionPage) {
                document.body.classList.add('ska-auction-page');
            } else if (inventoryPage) {
                document.body.classList.add('ska-inventory-page');
            }

            injectStylesheet();
            setupBonusTooltip();

            if (auctionPage) {
                updateAuctionItems();
            }

            if (marketPage || inventoryPage) {
                updateMarketBonusIcons();
            }

            const root = await waitForPageReady();
            observePageChanges(root);

            console.log('[AuctionWeaponBonus] Module initialized');
        }
    };
})();

if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}

window.SidekickModules.AuctionWeaponBonus = AuctionWeaponBonusModule;
console.log('[AuctionWeaponBonus] Registered');
