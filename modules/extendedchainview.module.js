/**
 * Extended Chain View Module
 * Extends faction chain attack history beyond the usual 10 attacks
 */

const ExtendedChainViewModule = (() => {
    // Module state
    let isEnabled = false;
    let maxExtLength = 10;
    let initialState = 'closed';
    let listObserver = null;
    let nodeObserver = null;
    let updateTimerId = null;
    let savedTarget = null;
    let watchdogId = null;
    let lastUrl = '';

    return {
        name: 'ExtendedChainView',

        async initialize() {
            console.log('[Sidekick] Initializing Extended Chain View...');

            if (!window.SidekickModules?.Core?.ChromeStorage) {
                console.warn('[Sidekick] Core module not available, Extended Chain View disabled');
                return;
            }

            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_extended_chain_view');
            isEnabled = settings?.isEnabled === true;
            maxExtLength = settings?.maxExtLength || 10;
            initialState = settings?.initialState || 'closed';

            if (!isEnabled) {
                console.log('[Sidekick] Extended Chain View is disabled');
                return;
            }

            this.addStyles();
            this.startWatchdog();

            console.log('[Sidekick] Extended Chain View initialized');
        },

        startWatchdog() {
            watchdogId = setInterval(() => {
                const currentUrl = window.location.href;
                if (currentUrl === lastUrl) return;
                lastUrl = currentUrl;

                const isChainPage = currentUrl.includes('factions.php') && currentUrl.includes('war/chain');
                if (isChainPage) {
                    this.installExtendedUI();
                } else if (savedTarget) {
                    this.stopMonitoring();
                }
            }, 300);
        },

        addStyles() {
            if (!document.getElementById('sidekick-extended-chain-styles')) {
                const style = document.createElement('style');
                style.id = 'sidekick-extended-chain-styles';
                style.textContent = `
                    #ext-hdr-caret {
                        height: 20px;
                        padding: 5px 10px 0px 20px;
                    }
                    .caret-wrap {
                        display: flex;
                        justify-content: center;
                        float: right;
                        height: 20px;
                    }
                    .hdr-blk { display: block; }
                    .hdr-none { display: none; }
                    #ext-chain-view {
                        border-top: 1px solid #4a9eff;
                    }
                `;
                document.head.appendChild(style);
            }
        },

        getListHdr() {
            return `
                <div id="hdr-extended" class="sortable-box t-blue-cont h">
                     <div class="title main-title title-black active box" role="table" aria-level="5" style="height: 5px;">
                     </div>
                 </div>
            `;
        },

        addUpdateStartTime(liNode) {
            const mult = { "s": 1, "m": 60, "h": 3600 };

            let disp = liNode.querySelector('.time')?.textContent;
            if (!disp) return 0;

            let parts = disp.split(' ');
            let s = parseInt(parts[0]);
            let m = mult[parts[1]] || 1;
            let secsElapsed = Number(s) * Number(m);
            let secsNow = Math.floor(new Date().getTime() / 1000);

            liNode.setAttribute('data-se', secsElapsed);
            liNode.setAttribute('data-sn', secsNow);

            if (!liNode.getAttribute('data-uuid')) {
                liNode.setAttribute('data-uuid', Math.floor(Math.random() * 900000000) + 100000000);
            }
        },

        removeListElement(li) {
            if (li) li.remove();
        },

        updateItemTimes() {
            const secsNow = Math.floor(new Date().getTime() / 1000);
            const list = document.querySelectorAll('#ext-chain-view > li.ext-li');

            list.forEach((liNode) => {
                const timeNode = liNode.querySelector('.time');
                if (!timeNode) return;

                const secsElapsed = Number(liNode.getAttribute('data-se'));
                const secsThen = Number(liNode.getAttribute('data-sn'));
                const secsDiff = secsNow - secsThen;
                const secsDisplay = secsDiff + secsElapsed;

                let textOut;
                if (secsDisplay > 3599) {
                    textOut = Math.floor(secsDisplay / 3600) + ' h';
                } else if (secsDisplay > 59) {
                    textOut = Math.floor(secsDisplay / 60) + ' m';
                } else {
                    textOut = secsDisplay + ' s';
                }

                timeNode.textContent = textOut;
            });
        },

        reconnectLiNodes() {
            if (!savedTarget || !nodeObserver) return;

            const liList = savedTarget.querySelectorAll('li');
            const nodeConfig = { childList: true, subtree: true, characterData: true };

            liList.forEach(liNode => {
                nodeObserver.observe(liNode, nodeConfig);
            });
        },

        installObserver(targetNode) {
            const nodeConfig = { childList: true, subtree: true, characterData: true };
            const listConfig = { childList: true };
            savedTarget = targetNode;

            if (listObserver) listObserver.disconnect();
            if (nodeObserver) nodeObserver.disconnect();

            nodeObserver = new MutationObserver((mutationsList) => {
                nodeObserver.disconnect();
                for (const mutation of mutationsList) {
                    if (mutation.type === 'characterData') {
                        const node = mutation.target;
                        const liNode = node.closest ? node.closest('li') : null;
                        if (liNode) {
                            this.addUpdateStartTime(liNode);
                        }
                    }
                }
                this.reconnectLiNodes();
            });

            const liList = targetNode.querySelectorAll('li');
            liList.forEach(liNode => {
                this.addUpdateStartTime(liNode);
                nodeObserver.observe(liNode, nodeConfig);
            });

            listObserver = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        mutation.removedNodes.forEach(node => {
                            if (node.nodeName === 'LI') {
                                const newNode = node.cloneNode(true);
                                newNode.classList.add('ext-li');

                                const extView = document.getElementById('ext-chain-view');
                                if (extView) {
                                    extView.prepend(newNode);

                                    const extItems = extView.querySelectorAll('li');
                                    if (extItems.length > maxExtLength) {
                                        const lastItem = extView.querySelector('li:last-child');
                                        this.removeListElement(lastItem);
                                    }
                                }
                            }
                        });

                        mutation.addedNodes.forEach(node => {
                            if (node.nodeName === 'LI') {
                                this.addUpdateStartTime(node);
                                nodeObserver.observe(node, nodeConfig);
                            }
                        });
                    }
                }
            });

            listObserver.observe(targetNode, listConfig);
        },

        installExtendedUI(retries = 0) {
            const rootUL = document.querySelector('.chain-attacks-list.recent-attacks');
            if (!rootUL) {
                if (retries++ < 20) {
                    setTimeout(() => this.installExtendedUI(retries), 250);
                    return;
                }
                return;
            }

            if (!document.getElementById('ext-chain-view')) {
                const rootClone = rootUL.cloneNode(false);
                rootClone.id = 'ext-chain-view';
                rootClone.classList.add('hdr-blk');

                rootUL.insertAdjacentHTML('afterend', this.getListHdr());
                document.getElementById('hdr-extended').appendChild(rootClone);
            }

            this.installObserver(rootUL);

            if (!updateTimerId) {
                updateTimerId = setInterval(() => this.updateItemTimes(), 1000);
            }
        },

        stopMonitoring() {
            if (listObserver) {
                listObserver.disconnect();
                listObserver = null;
            }
            if (nodeObserver) {
                nodeObserver.disconnect();
                nodeObserver = null;
            }
            if (updateTimerId) {
                clearInterval(updateTimerId);
                updateTimerId = null;
            }

            const extView = document.getElementById('ext-chain-view');
            if (extView) extView.remove();

            const hdrExtended = document.getElementById('hdr-extended');
            if (hdrExtended) hdrExtended.remove();

            savedTarget = null;
        },

        async destroy() {
            if (watchdogId) clearInterval(watchdogId);
            this.stopMonitoring();

            const styleEl = document.getElementById('sidekick-extended-chain-styles');
            if (styleEl) styleEl.remove();

            console.log('[Sidekick] Extended Chain View destroyed');
        }
    };
})();

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.ExtendedChainView = ExtendedChainViewModule;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExtendedChainViewModule;
}
