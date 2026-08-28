// Christmas Helper - Page World Injector
// Runs in MAIN world at document_start on christmas_town.php
// Manages "Bigger Window" map zoom and "Fast Beers" auto-buy button.

(function () {
    'use strict';

    if (window.SIDEKICK_CHRISTMAS_INJECTED) return;
    window.SIDEKICK_CHRISTMAS_INJECTED = true;

    const ZOOM_ENABLED = localStorage.getItem('sidekick_christmas_zoom') === 'true';
    const BEERS_ENABLED = localStorage.getItem('sidekick_christmas_beers') === 'true';

    if (!ZOOM_ENABLED && !BEERS_ENABLED) return;

    console.log(`🎄 [Christmas Injector] Loaded. Zoom: ${ZOOM_ENABLED}, Beers: ${BEERS_ENABLED}`);

    // ==========================================
    // FAST BEERS
    // ==========================================
    if (BEERS_ENABLED) {
        let active = false;
        const originalFetch = window.fetch;
        
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            
            try {
                if (response.url.includes('christmas_town.php?q=miniGameAction') && args[1] && args[1].body && typeof args[1].body === 'string' && args[1].body.includes('{"gameType":"gameGiftShop","action":"getItems"}')) {
                    const res = await response.clone().json();
                    if (res.shopType === 'Beer tent' && !active) {
                        setTimeout(() => { hookBeerButton(); }, 100);
                    }
                } else if (active && response.url.includes('christmas_town.php?q=move')) {
                    unHookBeerButton();
                }
            } catch(e) { }

            return response;
        };

        function hookBeerButton() {
            if (getBucks() === 0 || active) {
                active = false;
                return;
            }
            active = true;
            
            if (!document.getElementById('buyBeerBtn')) {
                const btnHtml = `<button id="buyBeerBtn" style="color: var(--default-blue-color); cursor: pointer; margin-right: 10px; font-weight: bold; background: transparent; border: none;">Gimme beer glasses!</button>
                <span id="buyBeerResult" style="font-size: 12px; font-weight: 100;"></span>`;
                
                const statusTitle = document.querySelector('div.status-title > div');
                if (statusTitle) {
                    statusTitle.insertAdjacentHTML('beforebegin', btnHtml);
                    
                    document.getElementById('buyBeerBtn').addEventListener('click', async () => {
                        document.getElementById('buyBeerResult').textContent = '';
                        
                        try {
                            const res = await originalFetch('christmas_town.php?q=miniGameAction', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json; charset=UTF-8',
                                    'X-Requested-With': 'XMLHttpRequest'
                                },
                                body: JSON.stringify({
                                    gameType: 'gameGiftShop',
                                    action: 'buyItem',
                                    result: {
                                        giftShopType: 'basic',
                                        itemType: 816,
                                        itemCategory: 'tornItems'
                                    }
                                })
                            });
                            
                            const obj = await res.json();
                            
                            if (obj.success === false) {
                                document.getElementById('buyBeerResult').textContent = obj.error;
                                document.getElementById('buyBeerResult').style.color = 'red';
                            } else if (obj.userData && obj.userData.userStatus === "ok") {
                                document.getElementById('buyBeerResult').textContent = 'Added to your items.';
                                document.getElementById('buyBeerResult').style.color = 'green';

                                const bucks = getBucks();
                                if (bucks === 0) {
                                    unHookBeerButton();
                                }
                                
                                const qtySpan = document.querySelector('div.status-title > div > div > span > span');
                                if (qtySpan) qtySpan.textContent = bucks;
                            } else {
                                const msg = obj.userData && obj.userData.message && obj.userData.message.trim() !== '' ? obj.userData.message : 'Something went wrong.';
                                document.getElementById('buyBeerResult').textContent = msg;
                                document.getElementById('buyBeerResult').style.color = 'red';
                            }
                        } catch (err) {
                            document.getElementById('buyBeerResult').textContent = 'Error sending request';
                            document.getElementById('buyBeerResult').style.color = 'red';
                        }
                    });
                }
            }
        }

        function unHookBeerButton() {
            active = false;
            const btn = document.getElementById('buyBeerBtn');
            const res = document.getElementById('buyBeerResult');
            if (btn) btn.remove();
            if (res) res.remove();
        }

        function getBucks() {
            const bucksEl = document.querySelector('ul.items-list > li.bucks > span.quantity');
            return bucksEl ? parseInt(bucksEl.textContent.replace(/,/g, ''), 10) : 0;
        }
    }


    // ==========================================
    // BIGGER WINDOW (ZOOM)
    // ==========================================
    if (ZOOM_ENABLED) {
        const MIN_ZOOM = 1.0, MAX_ZOOM = 4.0, ZOOM_STEP = 0.25;
        let ZOOM = 2.35;
        try { 
            const saved = localStorage.getItem('sidekick_ct_zoom_level');
            if (saved) ZOOM = parseFloat(saved);
        } catch(e) {}
     
        const saveZoom = () => { try { localStorage.setItem('sidekick_ct_zoom_level', ZOOM); } catch(e) {} };
     
        const applyZoom = () => {
            const mapContainer = document.querySelector('.user-map-container');
            if (!mapContainer) return;
            const mapContent = Array.from(mapContainer.children).find(el => !el.classList.contains('title-wrap'));
            if (mapContent) mapContent.style.zoom = ZOOM;
            const display = document.querySelector('#ct-zoom-display');
            if (display) display.textContent = ZOOM.toFixed(2) + 'x';
        };
     
        const adjustZoom = (delta) => {
            ZOOM = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(ZOOM + delta).toFixed(2)));
            saveZoom();
            applyZoom();
        };
     
        const createControls = () => {
            if (document.querySelector('#ct-zoom-controls')) return;
            document.head.insertAdjacentHTML('beforeend', `<style>
                #ct-zoom-controls{position:fixed;top:10px;right:10px;z-index:9999;background:rgba(30,30,30,.95);border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:8px;font-family:'Segoe UI',Arial,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,0.15)}
                #ct-zoom-controls button{background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;width:30px;height:30px;font-size:18px;cursor:pointer;transition:background .2s;display:flex;align-items:center;justify-content:center;}
                #ct-zoom-controls button:hover{background:rgba(255,255,255,0.2)}
                #ct-zoom-display{color:#4CAF50;font-size:14px;min-width:55px;text-align:center;font-weight:bold}
                #ct-zoom-label{color:#aaa;font-size:12px;margin-right:5px;}
            </style>`);
            const controls = document.createElement('div');
            controls.id = 'ct-zoom-controls';
            controls.innerHTML = `<span id="ct-zoom-label">Map Zoom</span><button id="ct-zoom-out">−</button><span id="ct-zoom-display">${ZOOM.toFixed(2)}x</span><button id="ct-zoom-in">+</button><button id="ct-zoom-reset" style="font-size:14px;">↺</button>`;
            document.body.appendChild(controls);
            
            document.querySelector('#ct-zoom-out').addEventListener('click', () => adjustZoom(-ZOOM_STEP));
            document.querySelector('#ct-zoom-in').addEventListener('click', () => adjustZoom(ZOOM_STEP));
            document.querySelector('#ct-zoom-reset').addEventListener('click', () => { ZOOM = 2.35; saveZoom(); applyZoom(); });
        };
     
        const setStyles = (selector, styles) => {
            const el = document.querySelector(selector);
            if (el) el.style.cssText = styles;
        };
     
        const initZoom = () => {
            const mapContainer = document.querySelector('.user-map-container');
            if (!mapContainer) {
                setTimeout(initZoom, 500);
                return;
            }
     
            createControls();
            
            setStyles('.title-wrap', 'display:flex!important;visibility:visible!important;width:100%;z-index:100;position:relative;flex-shrink:0');
            setStyles('.map-title', 'display:flex!important;visibility:visible!important;align-items:center;gap:8px');
            setStyles('.messageInput___l_krn', 'display:block!important;visibility:visible!important');
            setStyles('.makeGesture___vNQvt', 'display:block!important;visibility:visible!important;cursor:pointer');
            
            applyZoom();
     
            const ctWrap = document.querySelector('.ct-wrap');
            const statusArea = document.querySelector('.status-area-container');
            const itemsContainer = document.querySelector('.items-container');
            if (!ctWrap || !statusArea || !itemsContainer) return;
     
            ctWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center';
     
            let bottomWrapper = document.querySelector('#ct-bottom-wrapper');
            if (!bottomWrapper) {
                bottomWrapper = document.createElement('div');
                bottomWrapper.id = 'ct-bottom-wrapper';
                bottomWrapper.style.cssText = 'display:flex;width:100%;gap:12px;margin-top:12px;align-items:flex-start';
                ctWrap.appendChild(bottomWrapper);
            }
     
            statusArea.style.cssText = 'flex:1 1 auto;min-width:450px';
            itemsContainer.style.cssText = 'flex:0 0 auto;width:280px;max-width:320px';
     
            const swiperPagination = itemsContainer.querySelector('.swiper-pagination');
            if (swiperPagination) swiperPagination.style.cssText = 'display:flex!important;justify-content:center;gap:8px;margin-top:10px;position:relative!important;bottom:auto!important';
            
            itemsContainer.querySelectorAll('.swiper-pagination-bullet').forEach(b => {
                b.style.cssText = 'pointer-events:auto!important;cursor:pointer!important;width:10px;height:10px;display:inline-block';
            });
     
            bottomWrapper.appendChild(statusArea);
            bottomWrapper.appendChild(itemsContainer);
            
            setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
        };
     
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(initZoom, 1000));
        } else {
            setTimeout(initZoom, 1000);
        }
    }

})();
