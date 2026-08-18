// Bazaar Filler Module
// Adds a "Fill" button to bazaar listings (Add and Manage tabs) that auto-fills
// the lowest bazaar price minus $1 (configurable), using the Weav3r API.
// A small info button shows the 5 lowest bazaar prices.
// Forked from Bazaar Filler by Weav3r

const BazaarFillerModule = (() => {
    const PREFS_STORAGE_KEY =
        'sidekick_bazaar_filler_prefs';

    const WEAV3R_URL =
        'https://weav3r.dev/api/marketplace/';

    const CACHE_TTL_MS = 60 * 1000;

    const CLR_BTN =
        'linear-gradient(135deg, #3a8a3e, #4fa854)';

    const CLR_BTN_HVR =
        'linear-gradient(135deg, #4aa84e, #62c066)';

    const CLR_CLR =
        'linear-gradient(135deg, #1a4a2e, #254f30)';

    const CLR_SOLID = '#4fa854';
    const CLR_PEEK = 'rgba(79,168,84,0.18)';
    const CLR_PEEK_HVR = 'rgba(79,168,84,0.35)';

    let prefs = {
        priceDelta: '-1',
        slotOffset: 0
    };

    const weav3rCache = new Map();

    let bazaarObserver = null;
    let activePopup = null;
    let hashChangeHandler = null;
    let pageScanTimer = null;

    async function loadPrefs() {
        try {
            const data =
                await window.SidekickModules.Core.ChromeStorage.get(
                    PREFS_STORAGE_KEY
                );

            if (data) {
                Object.assign(prefs, data);
            }
        } catch (error) {
            console.error(
                '[BazaarFiller] loadPrefs:',
                error
            );
        }
    }

    async function savePrefs() {
        try {
            await window.SidekickModules.Core.ChromeStorage.set(
                PREFS_STORAGE_KEY,
                prefs
            );
        } catch (error) {
            console.error(
                '[BazaarFiller] savePrefs:',
                error
            );
        }
    }

    async function fetchBazaarListings(itemId) {
        const cached =
            weav3rCache.get(itemId);

        if (
            cached &&
            Date.now() - cached.ts < CACHE_TTL_MS
        ) {
            return cached.listings;
        }

        try {
            const response = await fetch(
                `${WEAV3R_URL}${itemId}`
            );

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}`
                );
            }

            const data = await response.json();

            const listings =
                (data?.listings || []).map(listing => ({
                    price: listing.price,
                    amount:
                        listing.quantity ??
                        listing.amount ??
                        1
                }));

            weav3rCache.set(itemId, {
                listings,
                ts: Date.now()
            });

            return listings;
        } catch (error) {
            console.error(
                '[BazaarFiller] fetchBazaarListings error:',
                error
            );
            return null;
        }
    }

    function calcFillPrice(listings) {
        if (
            !listings ||
            listings.length === 0
        ) {
            return null;
        }

        const reference =
            listings[
            Math.min(
                prefs.slotOffset,
                listings.length - 1
            )
            ];

        return applyDelta(
            reference.price,
            prefs.priceDelta
        );
    }

    function applyDelta(number, formula) {
        const match =
            String(formula).match(
                /^([+-]?)(\d+(?:\.\d+)?)(%)?$/
            );

        if (!match) return number;

        const sign =
            match[1] === '-' ? -1 : 1;

        const value =
            parseFloat(match[2]);

        const adjustment =
            match[3]
                ? number * value / 100
                : value;

        return Math.round(
            number + sign * adjustment
        );
    }

    function formatNumber(number) {
        return new Intl.NumberFormat(
            'en-US'
        ).format(number);
    }

    function triggerReact(element, ...events) {
        events.forEach(eventName => {
            element.dispatchEvent(
                new Event(eventName, {
                    bubbles: true
                })
            );
        });
    }

    function injectStyles() {
        if (
            document.getElementById(
                'sk-bf-styles'
            )
        ) {
            return;
        }

        const style =
            document.createElement('style');

        style.id = 'sk-bf-styles';

        style.textContent = `
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
                transition:
                    background 0.15s,
                    box-shadow 0.15s;
                white-space: nowrap;
                letter-spacing: 0.3px;
            }

            .sk-bf-btn:hover {
                background: ${CLR_BTN_HVR};
                box-shadow:
                    0 0 6px
                    rgba(79, 168, 84, 0.5);
            }

            .sk-bf-btn.sk-bf-active {
                background: ${CLR_CLR} !important;
                box-shadow:
                    0 0 0 2px
                    ${CLR_SOLID}
                    inset;
            }

            .sk-bf-peek {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                background: ${CLR_PEEK};
                border:
                    1px solid
                    rgba(79, 168, 84, 0.35);
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

            .sk-bf-peek:hover {
                background: ${CLR_PEEK_HVR};
            }

            #sk-bf-popup {
                display: none;
                position: fixed;
                z-index: 99999;
                background: #1e2430;
                border:
                    1px solid
                    rgba(79, 168, 84, 0.45);
                border-radius: 8px;
                padding: 10px 14px;
                font-size: 13px;
                color: #ccc;
                box-shadow:
                    0 4px 20px
                    rgba(0, 0, 0, 0.7);
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
                border-bottom:
                    1px solid
                    rgba(79, 168, 84, 0.2);
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

            .sk-bf-popup-close:hover {
                color: #ccc;
            }

            .sk-bf-row {
                cursor: pointer;
                padding: 3px 0;
                border-radius: 3px;
                transition: background 0.1s;
            }

            .sk-bf-row:hover {
                background:
                    rgba(255, 255, 255, 0.07);
            }

            .sk-bf-row-num {
                color: ${CLR_SOLID};
                font-weight: bold;
                margin-right: 3px;
            }

            .sk-bf-row-net {
                color: #666;
                font-size: 11px;
            }

            .sk-bf-footer {
                margin-top: 8px;
                border-top:
                    1px solid
                    rgba(255, 255, 255, 0.07);
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

            .sk-bf-footer-edit:hover {
                text-decoration: underline;
            }

            .sk-bf-footer-refresh {
                background: none;
                border:
                    1px solid
                    rgba(79, 168, 84, 0.4);
                border-radius: 3px;
                color: ${CLR_SOLID};
                font-size: 10px;
                cursor: pointer;
                padding: 1px 5px;
                transition: background 0.12s;
            }

            .sk-bf-footer-refresh:hover {
                background:
                    rgba(79, 168, 84, 0.15);
            }
        `;

        document.head.appendChild(style);
    }

    function ensurePopup() {
        if (
            document.getElementById(
                'sk-bf-popup'
            )
        ) {
            return;
        }

        const popup =
            document.createElement('div');

        popup.id = 'sk-bf-popup';

        popup.innerHTML = `
            <div class="sk-bf-popup-header">
                <span>🛒 Bazaar Prices</span>
                <span
                    class="sk-bf-popup-close"
                    id="sk-bf-close"
                >×</span>
            </div>

            <div
                id="sk-bf-body"
                style="min-height:26px;"
            ></div>

            <div class="sk-bf-footer">
                <span>
                    Offset:
                    <b id="sk-bf-delta-lbl"></b>
                    &nbsp;
                    Slot:
                    <b id="sk-bf-slot-lbl"></b>
                </span>

                <span
                    style="
                        display:flex;
                        gap:6px;
                        align-items:center;
                    "
                >
                    <button
                        class="sk-bf-footer-refresh"
                        id="sk-bf-refresh"
                    >↻</button>

                    <a
                        href="#"
                        class="sk-bf-footer-edit"
                        id="sk-bf-edit"
                    >Edit</a>
                </span>
            </div>
        `;

        document.body.appendChild(popup);

        popup.querySelector(
            '#sk-bf-close'
        ).onclick = hidePopup;

        popup.querySelector(
            '#sk-bf-edit'
        ).onclick = event => {
            event.preventDefault();
            openSettingsPrompt();
        };

        document.addEventListener(
            'click',
            event => {
                if (
                    activePopup &&
                    !popup.contains(event.target) &&
                    !event.target.classList.contains(
                        'sk-bf-peek'
                    )
                ) {
                    hidePopup();
                }
            },
            true
        );
    }

    function hidePopup() {
        const popup =
            document.getElementById(
                'sk-bf-popup'
            );

        if (popup) {
            popup.style.display = 'none';
        }

        activePopup = null;
    }

    async function showPeekPopup(
        peekButton,
        itemId,
        getRecentInputs
    ) {
        ensurePopup();

        const popup =
            document.getElementById(
                'sk-bf-popup'
            );

        popup.querySelector(
            '#sk-bf-delta-lbl'
        ).textContent = prefs.priceDelta;

        popup.querySelector(
            '#sk-bf-slot-lbl'
        ).textContent =
            `#${prefs.slotOffset + 1}`;

        const peekRect =
            peekButton.getBoundingClientRect();

        popup.style.display = 'block';
        popup.style.left = '-9999px';
        popup.style.top = '-9999px';

        renderPopupBody(
            popup,
            null,
            true
        );

        const popupHeight =
            popup.offsetHeight;

        const popupWidth =
            popup.offsetWidth;

        const row =
            peekButton.closest(
                'li.clearfix, ' +
                'div[class*=row___], ' +
                'div[class*=item___]'
            ) || peekButton;

        const rowRect =
            row.getBoundingClientRect();

        let left =
            rowRect.right + 10;

        let top =
            peekRect.top +
            window.scrollY -
            popupHeight / 2 +
            peekRect.height / 2;

        if (
            left + popupWidth + 10 >
            window.innerWidth
        ) {
            left =
                rowRect.left -
                popupWidth -
                10;
        }

        if (left < 6) {
            left = 6;
        }

        if (top < 6) {
            top = 6;
        }

        if (
            top + popupHeight >
            window.scrollY +
            window.innerHeight -
            6
        ) {
            top =
                window.scrollY +
                window.innerHeight -
                popupHeight -
                6;
        }

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;

        activePopup = popup;

        const listings =
            await fetchBazaarListings(itemId);

        renderPopupBody(
            popup,
            listings,
            false,
            getRecentInputs
        );

        const refreshButton =
            popup.querySelector(
                '#sk-bf-refresh'
            );

        refreshButton.onclick = async () => {
            weav3rCache.delete(itemId);
            refreshButton.textContent = '…';

            const fresh =
                await fetchBazaarListings(
                    itemId
                );

            renderPopupBody(
                popup,
                fresh,
                false,
                getRecentInputs
            );

            refreshButton.textContent = '↻';
        };
    }

    function renderPopupBody(
        popup,
        listings,
        loading,
        getRecentInputs
    ) {
        const body =
            popup.querySelector(
                '#sk-bf-body'
            );

        if (loading) {
            body.innerHTML =
                '<span style="color:#888;">Loading prices…</span>';
            return;
        }

        if (
            !listings ||
            listings.length === 0
        ) {
            body.innerHTML =
                '<span style="color:#e57373;">No bazaar listings found</span>';
            return;
        }

        body.innerHTML =
            listings
                .slice(0, 5)
                .map(
                    (listing, index) => `
                        <div
                            class="sk-bf-row"
                            data-price="${listing.price}"
                            style="padding:3px 4px;"
                        >
                            <span class="sk-bf-row-num">
                                #${index + 1}
                            </span>

                            ${listing.amount}x
                            @
                            $${formatNumber(listing.price)}
                        </div>
                    `
                )
                .join('');

        body.querySelectorAll(
            '.sk-bf-row'
        ).forEach(row => {
            row.addEventListener(
                'click',
                () => {
                    const price =
                        parseInt(
                            row.getAttribute(
                                'data-price'
                            ),
                            10
                        ) - 1;

                    const inputs =
                        getRecentInputs?.() || [];

                    inputs.forEach(input => {
                        input.value = price;
                    });

                    if (inputs[0]) {
                        triggerReact(
                            inputs[0],
                            'input',
                            'keyup'
                        );
                    }
                }
            );
        });
    }

    function openSettingsPrompt() {
        const current =
            prefs.slotOffset > 0
                ? `${prefs.priceDelta}[${prefs.slotOffset}]`
                : prefs.priceDelta;

        const input = prompt(
            'Bazaar price offset formula:\n' +
            '  -1      → cheapest listing minus $1 (default)\n' +
            '  +0      → exact match\n' +
            '  -1%     → 1% below cheapest\n' +
            '  -1[1]   → 2nd cheapest minus $1\n\n' +
            'Current:',
            current
        );

        if (input === null) return;

        const slotMatch =
            input.match(/\[(\d+)\]$/);

        prefs.slotOffset =
            slotMatch
                ? parseInt(slotMatch[1], 10)
                : 0;

        prefs.priceDelta =
            (
                slotMatch
                    ? input.replace(
                        /\[\d+\]$/,
                        ''
                    )
                    : input
            ).trim();

        savePrefs();
    }

    async function handleFill(
        event,
        itemId,
        getPriceInputs,
        getQuantityInputs
    ) {
        event.preventDefault();
        event.stopPropagation();

        const button =
            event.currentTarget;

        const wasActive =
            button.classList.contains(
                'sk-bf-active'
            );

        if (wasActive) {
            button.classList.remove(
                'sk-bf-active'
            );

            button.textContent = 'Fill';

            const inputs =
                getPriceInputs();

            inputs.forEach(input => {
                input.value = '';
            });

            if (inputs[0]) {
                triggerReact(
                    inputs[0],
                    'input',
                    'keyup'
                );
            }

            getQuantityInputs?.()
                ?.forEach(input => {
                    input.value = '';
                });

            return;
        }

        button.classList.add(
            'sk-bf-active'
        );

        button.textContent = 'Clear';

        const listings =
            await fetchBazaarListings(
                itemId
            );

        const price =
            calcFillPrice(listings);

        if (
            price !== null &&
            price > 0
        ) {
            const inputs =
                getPriceInputs();

            inputs.forEach(input => {
                input.value = price;
            });

            if (inputs[0]) {
                triggerReact(
                    inputs[0],
                    'input',
                    'keyup'
                );
            }

            const quantityInputs =
                getQuantityInputs?.() || [];

            if (
                quantityInputs.length > 0
            ) {
                quantityInputs.forEach(
                    input => {
                        input.value = 9999999;
                    }
                );

                triggerReact(
                    quantityInputs[0],
                    'input',
                    'keyup'
                );
            }
        } else if (listings === null) {
            button.title =
                'Weav3r API error – could not fetch prices';

            button.style.opacity = '0.6';
        }
    }

    function processAddPage() {
        document.querySelectorAll(
            'ul.items-cont ' +
            'li.clearfix' +
            ':not([data-sk-bf-done])'
        ).forEach(row => {
            if (
                row.classList.contains(
                    'disabled'
                )
            ) {
                return;
            }

            const priceWrapper =
                row.querySelector(
                    'div.price'
                );

            if (!priceWrapper) return;

            const image =
                row.querySelector(
                    'div.image-wrap img'
                );

            const itemId =
                extractItemId(image);

            if (!itemId) return;

            row.setAttribute(
                'data-sk-bf-done',
                '1'
            );

            injectAddButtons(
                row,
                priceWrapper,
                itemId
            );
        });
    }

    function injectAddButtons(
        row,
        priceWrapper,
        itemId
    ) {
        if (
            priceWrapper.querySelector(
                '.sk-bf-btn'
            )
        ) {
            return;
        }

        const fillButton =
            document.createElement('button');

        fillButton.type = 'button';
        fillButton.className = 'sk-bf-btn';
        fillButton.textContent = 'Fill';

        fillButton.title =
            'Fill price from cheapest Bazaar listing (Weav3r)';

        fillButton.addEventListener(
            'click',
            event =>
                handleFill(
                    event,
                    itemId,
                    () => [
                        ...row.querySelectorAll(
                            'div.price input'
                        )
                    ],
                    () => {
                        const checkbox =
                            row.querySelector(
                                'div.amount.choice-container ' +
                                'input[type="checkbox"]'
                            );

                        if (checkbox) {
                            if (!checkbox.checked) {
                                checkbox.click();
                            }

                            return [];
                        }

                        return [
                            ...row.querySelectorAll(
                                'div.amount input'
                            )
                        ];
                    }
                )
        );

        const infoButton =
            document.createElement('button');

        infoButton.type = 'button';
        infoButton.className =
            'sk-bf-info-btn';

        infoButton.title =
            'Show 5 lowest bazaar prices';

        infoButton.textContent = 'ℹ';

        infoButton.style.cssText = `
            cursor: pointer;
            background:
                rgba(91, 155, 213, 0.12);
            color: #5b9bd5;
            border:
                1px solid
                rgba(91, 155, 213, 0.3);
            padding: 0 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            height: 26px;
            line-height: 24px;
            vertical-align: middle;
            flex-shrink: 0;
            transition: background 0.15s;
        `;

        infoButton.addEventListener(
            'click',
            event => {
                event.stopPropagation();

                const popup =
                    document.getElementById(
                        'sk-bf-popup'
                    );

                if (
                    popup &&
                    popup.style.display ===
                    'block' &&
                    popup.dataset.forItem ===
                    itemId
                ) {
                    hidePopup();
                    return;
                }

                if (popup) {
                    popup.dataset.forItem =
                        itemId;
                }

                showPeekPopup(
                    infoButton,
                    itemId,
                    () => [
                        ...row.querySelectorAll(
                            'div.price input'
                        )
                    ]
                );
            }
        );

        const wrapper =
            document.createElement('span');

        wrapper.className =
            'sk-bf-action-wrap';

        wrapper.style.cssText = `
            display: flex;
            align-items: center;
            margin-left: 8px;
            gap: 4px;
        `;

        wrapper.append(
            fillButton,
            infoButton
        );

        const group =
            priceWrapper.querySelector(
                '.input-money-group'
            ) ||
            priceWrapper.firstElementChild ||
            priceWrapper;

        const parent =
            group.parentElement || row;

        parent.style.display = 'flex';
        parent.style.alignItems = 'center';
        parent.appendChild(wrapper);
    }

    function processManagePage() {
        document.querySelectorAll(
            'div[class*=row___]' +
            ':not([data-sk-bf-done])'
        ).forEach(row => {
            const priceWrapper =
                row.querySelector(
                    'div[class*=price___], ' +
                    'div.price'
                );

            if (!priceWrapper) return;

            const image =
                row.querySelector(
                    'div[class*=imgContainer___] img, ' +
                    'div.image-wrap img'
                );

            const itemId =
                extractItemId(image);

            if (!itemId) return;

            row.setAttribute(
                'data-sk-bf-done',
                '1'
            );

            injectManageButtons(
                row,
                priceWrapper,
                itemId
            );
        });
    }

    function injectManageButtons(
        row,
        priceWrapper,
        itemId
    ) {
        if (
            priceWrapper.querySelector(
                '.sk-bf-btn'
            )
        ) {
            return;
        }

        const fillButton =
            document.createElement('button');

        fillButton.type = 'button';
        fillButton.className = 'sk-bf-btn';
        fillButton.textContent = 'Fill';

        fillButton.title =
            'Fill price & quantity from cheapest Bazaar listing (Weav3r)';

        fillButton.addEventListener(
            'click',
            async event => {
                event.stopPropagation();

                const itemContainer =
                    row.querySelector(
                        'div[class*=item___]'
                    );

                const isExpanded =
                    itemContainer
                        ?.className
                        ?.includes(
                            'active___'
                        );

                if (
                    itemContainer &&
                    !isExpanded
                ) {
                    const manageButton =
                        row.querySelector(
                            'button[aria-label="Manage"]'
                        );

                    if (manageButton) {
                        manageButton.click();

                        await new Promise(
                            resolve =>
                                setTimeout(
                                    resolve,
                                    160
                                )
                        );
                    }
                }

                await handleFill(
                    event,
                    itemId,
                    () => {
                        const isMobile =
                            window.innerWidth <=
                            784;

                        if (isMobile) {
                            return [
                                ...row.querySelectorAll(
                                    '[class*=priceMobile___] ' +
                                    '.input-money-group input'
                                )
                            ];
                        }

                        return [
                            ...row.querySelectorAll(
                                'div[class*=price___] ' +
                                '.input-money-group input, ' +
                                'div.price input'
                            )
                        ];
                    },
                    () => {
                        const quantity =
                            row.querySelector(
                                'div.amount input, ' +
                                '[class*=amount___] input'
                            );

                        if (!quantity) {
                            return [];
                        }

                        const quantityValue =
                            row.querySelector(
                                'span.t-hide ' +
                                'span:last-child'
                            )
                                ?.textContent
                                ?.trim() ||
                            '9999999';

                        quantity.value =
                            quantityValue;

                        triggerReact(
                            quantity,
                            'input',
                            'keyup'
                        );

                        return [];
                    }
                );
            }
        );

        const infoButton =
            document.createElement('button');

        infoButton.type = 'button';
        infoButton.className =
            'sk-bf-info-btn';

        infoButton.title =
            'Show 5 lowest bazaar prices';

        infoButton.textContent = 'ℹ';

        infoButton.style.cssText = `
            cursor: pointer;
            background:
                rgba(91, 155, 213, 0.12);
            color: #5b9bd5;
            border:
                1px solid
                rgba(91, 155, 213, 0.3);
            padding: 0 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            height: 26px;
            line-height: 24px;
            vertical-align: middle;
            flex-shrink: 0;
            transition: background 0.15s;
        `;

        infoButton.addEventListener(
            'click',
            event => {
                event.stopPropagation();

                const popup =
                    document.getElementById(
                        'sk-bf-popup'
                    );

                if (
                    popup &&
                    popup.style.display ===
                    'block' &&
                    popup.dataset.forItem ===
                    itemId
                ) {
                    hidePopup();
                    return;
                }

                if (popup) {
                    popup.dataset.forItem =
                        itemId;
                }

                showPeekPopup(
                    infoButton,
                    itemId,
                    () => {
                        const isMobile =
                            window.innerWidth <=
                            784;

                        if (isMobile) {
                            return [
                                ...row.querySelectorAll(
                                    '[class*=priceMobile___] ' +
                                    '.input-money-group input'
                                )
                            ];
                        }

                        return [
                            ...row.querySelectorAll(
                                'div[class*=price___] ' +
                                '.input-money-group input, ' +
                                'div.price input'
                            )
                        ];
                    }
                );
            }
        );

        const wrapper =
            document.createElement('span');

        wrapper.className =
            'sk-bf-action-wrap';

        wrapper.style.cssText = `
            display: flex;
            align-items: center;
            margin-left: 8px;
            gap: 4px;
        `;

        wrapper.append(
            fillButton,
            infoButton
        );

        const priceCell =
            priceWrapper.closest(
                'div[class*="price___"]'
            ) || priceWrapper;

        if (
            priceCell &&
            priceCell.parentNode
        ) {
            priceCell.parentNode.insertBefore(
                wrapper,
                priceCell.nextSibling
            );
        } else {
            row.appendChild(wrapper);
        }
    }

    function extractItemId(image) {
        if (!image?.src) return null;

        const match =
            image.src.match(/\/(\d+)\//);

        return match ? match[1] : null;
    }

    /*
     * The editable Add page and confirmation page both use #/add.
     * Confirmation is detected from its prompt and Confirm control.
     */
    function isAddConfirmationPage() {
        const pageText =
            document.body?.innerText || '';

        if (
            !/Are you sure you want to add\s+\d+\s+items?\s+across/i
                .test(pageText)
        ) {
            return false;
        }

        return Array.from(
            document.querySelectorAll(
                'button, ' +
                'input[type="submit"], ' +
                'input[type="button"], ' +
                'a'
            )
        ).some(control => {
            const label =
                control.tagName === 'INPUT'
                    ? control.value
                    : control.textContent;

            return /^\s*confirm\s*$/i.test(
                label || ''
            );
        });
    }

    function removeAddPageControls() {
        hidePopup();

        document.querySelectorAll(
            '.sk-bf-action-wrap'
        ).forEach(control => {
            control.remove();
        });

        document.querySelectorAll(
            'ul.items-cont ' +
            'li[data-sk-bf-done]'
        ).forEach(row => {
            row.removeAttribute(
                'data-sk-bf-done'
            );
        });
    }

    function runPageScan() {
        const hash =
            window.location.hash;

        if (hash.startsWith('#/add')) {
            if (
                isAddConfirmationPage()
            ) {
                removeAddPageControls();
                return;
            }

            processAddPage();
        }

        if (
            hash.startsWith('#/manage')
        ) {
            processManagePage();
        }

        if (!hash) {
            processAddPage();
            processManagePage();
        }
    }

    function schedulePageScan(
        delay = 150
    ) {
        if (pageScanTimer) {
            clearTimeout(pageScanTimer);
        }

        pageScanTimer = setTimeout(() => {
            pageScanTimer = null;
            runPageScan();
        }, delay);
    }

    function setupObserver() {
        if (bazaarObserver) {
            bazaarObserver.disconnect();
        }

        bazaarObserver =
            new MutationObserver(() => {
                schedulePageScan(150);
            });

        const root =
            document.getElementById(
                'bazaarRoot'
            ) ||
            document.querySelector(
                '.content-wrapper'
            ) ||
            document.body;

        bazaarObserver.observe(root, {
            childList: true,
            subtree: true
        });

        if (!hashChangeHandler) {
            hashChangeHandler = () => {
                schedulePageScan(200);
            };

            window.addEventListener(
                'hashchange',
                hashChangeHandler
            );
        }

        schedulePageScan(300);
    }

    function isOnBazaar() {
        return window.location.href.includes(
            'bazaar.php'
        );
    }

    return {
        isEnabled: false,

        async init() {
            console.log(
                '[BazaarFiller] Init…'
            );

            await loadPrefs();

            const settings =
                await window.SidekickModules.Core.ChromeStorage.get(
                    'sidekick_settings'
                );

            this.isEnabled =
                settings
                    ?.['bazaar-filler']
                    ?.isEnabled === true;

            if (this.isEnabled) {
                this.enable();
            }

            console.log(
                '[BazaarFiller] Init done, enabled:',
                this.isEnabled
            );
        },

        enable() {
            this.isEnabled = true;

            if (!isOnBazaar()) return;

            injectStyles();
            ensurePopup();
            setupObserver();

            console.log(
                '[BazaarFiller] Enabled on bazaar page'
            );
        },

        disable() {
            this.isEnabled = false;

            if (bazaarObserver) {
                bazaarObserver.disconnect();
                bazaarObserver = null;
            }

            if (pageScanTimer) {
                clearTimeout(pageScanTimer);
                pageScanTimer = null;
            }

            if (hashChangeHandler) {
                window.removeEventListener(
                    'hashchange',
                    hashChangeHandler
                );

                hashChangeHandler = null;
            }

            hidePopup();

            document.getElementById(
                'sk-bf-popup'
            )?.remove();

            document.getElementById(
                'sk-bf-styles'
            )?.remove();

            console.log(
                '[BazaarFiller] Disabled'
            );
        }
    };
})();

if (!window.SidekickModules) {
    window.SidekickModules = {};
}

window.SidekickModules.BazaarFiller =
    BazaarFillerModule;

console.log(
    '[BazaarFiller] Module registered'
);