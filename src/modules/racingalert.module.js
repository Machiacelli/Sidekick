/**
 * Racing Alert Module
 * Keeps a red racing icon visible when not in a race to alert the user.
 * Converted from xedx's Torn Racing Alert userscript.
 */

const RacingAlertModule = (() => {
    let isEnabled = false;
    let checkInterval = null;
    let domObserver = null;
    let scheduledFrame = null;
    let loadHandler = null;
    let animatedIcons = true;

    const CUSTOM_ICON_ID = 'sidekick-race-icon';
    const ANIMATION_CLASS = 'sidekick-racing-highlight';
    const STATUS_ICONS_SELECTOR = '[class^="status-icons"]';
    const RED_ICON_SELECTOR = '[class^="icon18_"]';
    const GREEN_ICON_SELECTOR = '[class^="icon17_"]';
    const ABROAD_ICON_SELECTOR = '[class^="icon71_"]';

    const raceIconRed = `
        <li id="${CUSTOM_ICON_ID}" class="icon18___wusPZ">
            <a href="/page.php?sid=racing"
               tabindex="0"
               i-data="i_37_86_17_17"></a>
        </li>
    `;

    return {
        name: 'RacingAlert',

        async initialize() {
            console.log(
                '[Sidekick] Initializing Racing Alert...'
            );

            if (
                !window.SidekickModules
                    ?.Core
                    ?.ChromeStorage
            ) {
                console.warn(
                    '[Sidekick] Core module not available, Racing Alert disabled'
                );
                return;
            }

            const settings =
                await window.SidekickModules.Core.ChromeStorage.get(
                    'sidekick_racing_alert'
                );

            isEnabled =
                settings?.isEnabled === true;

            animatedIcons =
                settings?.animatedIcons !== false;

            if (!isEnabled) {
                console.log(
                    '[Sidekick] Racing Alert is disabled'
                );
                return;
            }

            this.addStyles();
            this.startMonitoring();

            console.log(
                '[Sidekick] Racing Alert initialized'
            );
        },

        addStyles() {
            if (
                document.getElementById(
                    'sidekick-racing-alert-styles'
                )
            ) {
                return;
            }

            const style =
                document.createElement('style');

            style.id =
                'sidekick-racing-alert-styles';

            style.textContent = `
                .${ANIMATION_CLASS} {
                    animation:
                        sidekick-racing-highlight
                        2s
                        linear
                        infinite;
                }

                @keyframes sidekick-racing-highlight {
                    0%, 49% {
                        opacity: 1;
                    }

                    50%, 100% {
                        opacity: 0.3;
                    }
                }
            `;

            document.head.appendChild(style);
        },

        /*
         * Finds a real Torn racing icon while explicitly excluding
         * the icon created by this module.
         */
        getStockIcon(selector) {
            return Array.from(
                document.querySelectorAll(selector)
            ).find(icon => {
                const listItem =
                    icon.matches?.('li')
                        ? icon
                        : icon.closest?.('li');

                return (
                    listItem?.id !==
                    CUSTOM_ICON_ID
                );
            }) || null;
        },

        hasStockRaceIcons() {
            return Boolean(
                this.getStockIcon(
                    RED_ICON_SELECTOR
                ) ||
                this.getStockIcon(
                    GREEN_ICON_SELECTOR
                )
            );
        },

        isAbroad() {
            return (
                document.querySelector(
                    ABROAD_ICON_SELECTOR
                ) !== null
            );
        },

        /*
         * Collapse multiple DOM mutations into a single check.
         * This prevents mutation storms during Torn SPA updates.
         */
        scheduleCheck() {
            if (
                !isEnabled ||
                scheduledFrame !== null
            ) {
                return;
            }

            scheduledFrame =
                requestAnimationFrame(() => {
                    scheduledFrame = null;
                    this.handleCheck();
                });
        },

        handleCheck() {
            if (!isEnabled) return;

            const existingCustomIcon =
                document.getElementById(
                    CUSTOM_ICON_ID
                );

            const stockRedIcon =
                this.getStockIcon(
                    RED_ICON_SELECTOR
                );

            if (stockRedIcon) {
                const stockListItem =
                    stockRedIcon.matches?.('li')
                        ? stockRedIcon
                        : stockRedIcon.closest?.('li');

                stockListItem?.classList.toggle(
                    ANIMATION_CLASS,
                    animatedIcons
                );
            }

            /*
             * Torn displays its own race icon while the player is
             * registered for or participating in a race.
             *
             * The previous version mistakenly counted the Sidekick
             * icon as a Torn stock icon. It therefore added its icon,
             * detected it as stock, removed it, and immediately added
             * it again through the MutationObserver.
             */
            if (
                this.isAbroad() ||
                this.hasStockRaceIcons()
            ) {
                existingCustomIcon?.remove();
                return;
            }

            if (existingCustomIcon) {
                existingCustomIcon.classList.toggle(
                    ANIMATION_CLASS,
                    animatedIcons
                );
                return;
            }

            const statusIcons =
                document.querySelector(
                    STATUS_ICONS_SELECTOR
                );

            if (!statusIcons) return;

            statusIcons.insertAdjacentHTML(
                'beforeend',
                raceIconRed
            );

            const newIcon =
                document.getElementById(
                    CUSTOM_ICON_ID
                );

            newIcon?.classList.toggle(
                ANIMATION_CLASS,
                animatedIcons
            );
        },

        /*
         * Ignore unrelated page mutations. The old observer ran the
         * race check for every DOM change anywhere inside its target.
         */
        mutationAffectsStatusIcons(mutations) {
            const relevantSelector = [
                STATUS_ICONS_SELECTOR,
                RED_ICON_SELECTOR,
                GREEN_ICON_SELECTOR,
                ABROAD_ICON_SELECTOR,
                `#${CUSTOM_ICON_ID}`
            ].join(',');

            return mutations.some(mutation => {
                const target = mutation.target;

                if (
                    target?.nodeType ===
                    Node.ELEMENT_NODE &&
                    target.closest?.(
                        STATUS_ICONS_SELECTOR
                    )
                ) {
                    return true;
                }

                const changedNodes = [
                    ...mutation.addedNodes,
                    ...mutation.removedNodes
                ];

                return changedNodes.some(node => {
                    if (
                        node.nodeType !==
                        Node.ELEMENT_NODE
                    ) {
                        return false;
                    }

                    return Boolean(
                        node.matches?.(
                            relevantSelector
                        ) ||
                        node.querySelector?.(
                            relevantSelector
                        )
                    );
                });
            });
        },

        startMonitoring() {
            /*
             * Prevent duplicate intervals and observers if the module
             * is initialized more than once.
             */
            if (checkInterval || domObserver) {
                this.scheduleCheck();
                return;
            }

            if (
                document.readyState ===
                'complete'
            ) {
                this.scheduleCheck();
            } else {
                loadHandler = () => {
                    loadHandler = null;
                    this.scheduleCheck();
                };

                window.addEventListener(
                    'load',
                    loadHandler,
                    { once: true }
                );
            }

            /*
             * Slow fallback in case Torn changes race state without a
             * relevant DOM mutation.
             */
            checkInterval = setInterval(() => {
                this.scheduleCheck();
            }, 5000);

            domObserver =
                new MutationObserver(mutations => {
                    if (
                        this.mutationAffectsStatusIcons(
                            mutations
                        )
                    ) {
                        this.scheduleCheck();
                    }
                });

            domObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        },

        stopMonitoring() {
            if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = null;
            }

            if (domObserver) {
                domObserver.disconnect();
                domObserver = null;
            }

            if (scheduledFrame !== null) {
                cancelAnimationFrame(
                    scheduledFrame
                );
                scheduledFrame = null;
            }

            if (loadHandler) {
                window.removeEventListener(
                    'load',
                    loadHandler
                );
                loadHandler = null;
            }

            document.getElementById(
                CUSTOM_ICON_ID
            )?.remove();

            document.querySelectorAll(
                `.${ANIMATION_CLASS}`
            ).forEach(icon => {
                icon.classList.remove(
                    ANIMATION_CLASS
                );
            });
        },

        async destroy() {
            isEnabled = false;

            this.stopMonitoring();

            document.getElementById(
                'sidekick-racing-alert-styles'
            )?.remove();

            console.log(
                '[Sidekick] Racing Alert destroyed'
            );
        }
    };
})();

if (!window.SidekickModules) {
    window.SidekickModules = {};
}

window.SidekickModules.RacingAlert =
    RacingAlertModule;

if (
    typeof module !== 'undefined' &&
    module.exports
) {
    module.exports = RacingAlertModule;
}