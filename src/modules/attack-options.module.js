/**
 * Sidekick Chrome Extension - Attack Options Module
 * Hides Mug and Hospitalize options post-attack based on Termed War Mode or Arrest Mode
 * Version: 1.0.1
 */

(function () {
    'use strict';

    console.log("⚔️ Loading Sidekick Attack Options Module...");

    const AttackOptionsModule = {
        isInitialized: false,
        termedWarMode: false,
        
        styleElement: null,
        fallbackObserver: null,

        // Detect if we're on the attack page
        isAttackPage() {
            const href = window.location.href.toLowerCase();
            const pathname = window.location.pathname.toLowerCase();
            const sid = (new URLSearchParams(window.location.search).get('sid') || '').toLowerCase();

            return pathname.includes('loader.php')
                || (pathname.includes('page.php') && sid === 'attack')
                || href.includes('/loader.php?sid=attack')
                || pathname.includes('loader2.php'); // Sometimes loader2
        },

        // Initialize the module
        async init() {
            if (this.isInitialized) return;
            
            try {
                await this.loadSettings();
                this.isInitialized = true;
                
                // Add storage change listener
                if (window.chrome && chrome.storage && chrome.storage.onChanged) {
                    chrome.storage.onChanged.addListener((changes, namespace) => {
                        if (namespace === 'local' && changes.sidekick_settings) {
                            this.loadSettings();
                        }
                    });
                }
                
                this.apply();
                
                // Watch for SPA navigation
                let lastHref = location.href;
                new MutationObserver(() => {
                    if (location.href !== lastHref) {
                        lastHref = location.href;
                        setTimeout(() => this.apply(), 250);
                    }
                }).observe(document.body || document.documentElement, { childList: true, subtree: true });
                
                console.log("✅ Attack Options Module initialized successfully");
            } catch (error) {
                console.error("❌ Attack Options Module initialization failed:", error);
            }
        },

        async loadSettings() {
            try {
                if (!window.SidekickModules?.Core?.ChromeStorage) return;
                
                const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
                
                this.termedWarMode = settings['termed-war-mode']?.isEnabled === true;
                
                console.log(`⚔️ Attack Options: Termed War Mode = ${this.termedWarMode}`);
                
                // Re-apply if already on page
                this.apply();
            } catch (error) {
                console.error('Failed to load attack options settings:', error);
            }
        },

        apply() {
            if (!this.isAttackPage()) {
                this.removeStyle();
                return;
            }

            const shouldHide = this.termedWarMode;
            
            if (shouldHide) {
                this.injectStyle();
            } else {
                this.removeStyle();
            }
        },

        injectStyle() {
            if (this.styleElement) return;
            
            this.styleElement = document.createElement('style');
            this.styleElement.id = 'sidekick-attack-options-style';
            this.styleElement.textContent = `
                /* CSS selectors might fail on React buttons without attributes, but we include them anyway */
                a[href*="step=mug" i], 
                a[href*="step=hospitalize" i],
                button[aria-label*="Mug" i], 
                button[aria-label*="Hospitalize" i],
                [class*="mug___" i],
                [class*="hospitalize___" i],
                [class*="actionMug___" i],
                [class*="actionHospitalize___" i],
                /* The main reliable hook added by our MutationObserver */
                [data-sk-hidden-opt="true"] {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    position: absolute !important;
                    width: 0 !important;
                    height: 0 !important;
                    pointer-events: none !important;
                }
            `;
            
            document.head.appendChild(this.styleElement);
            console.log('✅ Attack Options: CSS injected');
            
            this.startFallbackObserver();
        },

        removeStyle() {
            if (this.styleElement) {
                this.styleElement.remove();
                this.styleElement = null;
                console.log('⏹️ Attack Options: CSS removed');
            }
            this.stopFallbackObserver();
        },
        
        startFallbackObserver() {
            if (this.fallbackObserver) return;
            
            this.fallbackObserver = new MutationObserver((mutations) => {
                // Find all buttons or elements that might be the choice buttons
                const buttons = document.querySelectorAll('button, a, [class*="btn" i], [class*="button" i], [role="button"], [class*="action" i], li');
                for (const btn of buttons) {
                    if (btn.dataset.skHiddenOpt === 'true') continue;
                    
                    const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
                    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const cls = (btn.className || '').toString().toLowerCase();

                    const isMug = text === 'mug' || text.match(/^mug\s*\(/) || aria.includes('mug') || cls.includes('mug___');
                    const isHosp = text === 'hospitalize' || text.match(/^hospitalize\s*\(/) || aria.includes('hospitalize') || cls.includes('hospitalize___');

                    if (isMug || isHosp) {
                        // Mark it so our CSS hides it
                        btn.dataset.skHiddenOpt = 'true';
                        
                        // Directly force hide via styles as fallback
                        btn.style.setProperty('display', 'none', 'important');
                        btn.style.setProperty('visibility', 'hidden', 'important');
                        btn.style.setProperty('width', '0', 'important');
                        btn.style.setProperty('height', '0', 'important');
                        
                        // Also try to hide the parent if it's an only child wrapper
                        if (btn.parentElement && btn.parentElement.children.length === 1 && !btn.parentElement.className.includes('dialog')) {
                            btn.parentElement.dataset.skHiddenOpt = 'true';
                            btn.parentElement.style.setProperty('display', 'none', 'important');
                            btn.parentElement.style.setProperty('visibility', 'hidden', 'important');
                        }
                    }
                }
            });
            
            // Observe attributes so if React replaces className or style, we can re-apply if needed
            this.fallbackObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'disabled'] });
        },
        
        stopFallbackObserver() {
            if (this.fallbackObserver) {
                this.fallbackObserver.disconnect();
                this.fallbackObserver = null;
            }
        }
    };

    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    window.SidekickModules.AttackOptions = AttackOptionsModule;
})();
