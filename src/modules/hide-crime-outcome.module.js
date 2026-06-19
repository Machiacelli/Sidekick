/**
 * Hide Crime Outcome Module
 * Hides / transforms the crime outcome panel on the crimes page.
 * Ported from Kwack's [2190604] userscript — rewritten for Chrome extension context.
 * Version: 1.0.0
 */

const HideCrimeOutcomeModule = {
    name: 'Hide Crime Outcome',
    version: '1.0.0',

    STORAGE_KEY: 'hide-crime-outcome',
    STYLES_ID: 'sidekick-hide-crime-styles',

    MODES: {
        DISABLED: 0,
        HIDDEN:   1,
        MINIMAL:  2,
        TOAST:    3,
    },

    // State
    isEnabled: false,
    mode: 0, // MODES.DISABLED

    _observer: null,
    _toastListenerAttached: false,

    // ─── Helpers ─────────────────────────────────────────────────────────────

    isCrimesPage() {
        const p = window.location.href;
        return p.includes('/loader.php?sid=crimes') || p.includes('/page.php?sid=crimes');
    },

    // ─── Init ────────────────────────────────────────────────────────────────

    async init() {
        console.log('🦹 Hide Crime Outcome: initializing...');
        await this.loadSettings();

        this.apply();
        this._startPageWatcher();

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.sidekick_settings) {
                this.loadSettings().then(() => this.apply());
            }
        });

        console.log('🦹 Hide Crime Outcome: initialized');
    },

    // ─── Settings ────────────────────────────────────────────────────────────

    async loadSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
            if (data && data[this.STORAGE_KEY]) {
                const s = data[this.STORAGE_KEY];
                this.isEnabled = s.isEnabled || false;
                this.mode = s.mode != null ? s.mode : this.MODES.DISABLED;
                this.hideChainText = s.hideChainText || false;
            }
        } catch (e) {
            console.error('🦹 Hide Crime Outcome: failed to load settings:', e);
        }
    },

    async saveSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
            data[this.STORAGE_KEY] = { isEnabled: this.isEnabled, mode: this.mode, hideChainText: this.hideChainText };
            await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', data);
        } catch (e) {
            console.error('🦹 Hide Crime Outcome: failed to save settings:', e);
        }
    },

    // ─── Core Logic ──────────────────────────────────────────────────────────

    apply() {
        if (!this.isCrimesPage()) {
            this._teardown();
            return;
        }

        const shouldHidePanel = this.isEnabled && this.mode !== this.MODES.DISABLED;
        if (!shouldHidePanel && !this.hideChainText) {
            this._teardown();
            return;
        }

        this._injectStyles();
        this._applyBodyClass();

        if (this.isEnabled && this.mode === this.MODES.TOAST) {
            this._ensureToastContainer();
            this._injectFetchIntercept();
        } else {
            document.getElementById('sk-crime-toast-wrap')?.remove();
        }

        if (this.hideChainText) {
            this._startChainTextObserver();
        } else {
            this._stopChainTextObserver();
        }
    },

    _teardown() {
        document.getElementById(this.STYLES_ID)?.remove();
        document.getElementById('sk-crime-toast-wrap')?.remove();
        document.body.classList.remove(
            'sk-crimes-hidden',
            'sk-crimes-minimal',
            'sk-crimes-toast',
            'sk-crimes-hide-chain'
        );
        this._stopChainTextObserver();
    },

    _applyBodyClass() {
        document.body.classList.remove('sk-crimes-hidden', 'sk-crimes-minimal', 'sk-crimes-toast', 'sk-crimes-hide-chain');
        const map = ['', 'hidden', 'minimal', 'toast'];
        if (this.isEnabled && this.mode > 0 && this.mode < map.length) {
            document.body.classList.add(`sk-crimes-${map[this.mode]}`);
        }
        if (this.hideChainText) {
            document.body.classList.add('sk-crimes-hide-chain');
        }
    },

    _injectStyles() {
        if (document.getElementById(this.STYLES_ID)) return;

        const style = document.createElement('style');
        style.id = this.STYLES_ID;
        style.textContent = `
            /* ── HIDE CHAIN TEXT ── */
            body.sk-crimes-hide-chain div[class*="streak___"] {
                display: none !important;
            }

            /* ── HIDDEN mode ── */
            body.sk-crimes-hidden [class*="outcomePanel_"],
            body.sk-crimes-hidden [class*="outcomeWrapper_"],
            body.sk-crimes-hidden [class*="outcome-panel"],
            body.sk-crimes-hidden [class*="crimeResults"],
            body.sk-crimes-hidden [class*="resultContainer"] {
                display: none !important;
            }

            /* ── MINIMAL mode ── */
            body.sk-crimes-minimal [class*="story___"],
            body.sk-crimes-minimal [class*="storyText"],
            body.sk-crimes-minimal [class*="crimeStory"],
            body.sk-crimes-minimal [class*="outcomeStory"] {
                display: none !important;
            }

            /* ── TOAST mode ── */
            body.sk-crimes-toast [class*="outcomePanel_"],
            body.sk-crimes-toast [class*="outcomeWrapper_"],
            body.sk-crimes-toast [class*="outcome-panel"],
            body.sk-crimes-toast [class*="crimeResults"],
            body.sk-crimes-toast [class*="resultContainer"] {
                display: none !important;
            }

            /* ── Toast UI ── */
            #sk-crime-toast-wrap {
                position: fixed;
                bottom: 22px;
                right: 22px;
                z-index: 9999999;
                display: flex;
                flex-direction: column-reverse;
                gap: 8px;
                pointer-events: none;
            }

            .sk-crime-toast-card {
                background: linear-gradient(145deg, #1e272b, #263238);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 10px;
                padding: 11px 14px;
                min-width: 220px;
                max-width: 300px;
                font-family: Arial, sans-serif;
                font-size: 12px;
                color: rgba(255,255,255,0.85);
                box-shadow: 0 6px 24px rgba(0,0,0,0.55);
                pointer-events: auto;
                animation: sk-crime-toast-slide 0.28s cubic-bezier(.2,.8,.4,1) both;
                border-left: 3px solid #555;
            }

            .sk-crime-toast-card.sk-result-success    { border-left-color: #66BB6A; }
            .sk-crime-toast-card.sk-result-failure    { border-left-color: #FF9800; }
            .sk-crime-toast-card.sk-result-critical   { border-left-color: #ef5350; }
            .sk-crime-toast-card.sk-result-jail       { border-left-color: #ef5350; }

            .sk-crime-toast-result {
                font-weight: 700;
                font-size: 13px;
                margin-bottom: 4px;
            }
            .sk-result-success  .sk-crime-toast-result { color: #66BB6A; }
            .sk-result-failure  .sk-crime-toast-result { color: #FF9800; }
            .sk-result-critical .sk-crime-toast-result { color: #ef5350; }
            .sk-result-jail     .sk-crime-toast-result { color: #ef5350; }

            .sk-crime-toast-reward {
                color: rgba(255,255,255,0.6);
                font-size: 11px;
            }

            @keyframes sk-crime-toast-slide {
                from { transform: translateX(18px); opacity: 0; }
                to   { transform: translateX(0);    opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    },

    // ─── Toast ───────────────────────────────────────────────────────────────

    _ensureToastContainer() {
        if (document.getElementById('sk-crime-toast-wrap')) return;
        const wrap = document.createElement('div');
        wrap.id = 'sk-crime-toast-wrap';
        document.body.appendChild(wrap);
    },

    showToast(result, reward) {
        const wrap = document.getElementById('sk-crime-toast-wrap');
        if (!wrap) return;

        const resultLower = (result || '').toLowerCase();
        let cls = 'sk-result-failure';
        if (resultLower.includes('success')) cls = 'sk-result-success';
        else if (resultLower.includes('jail') || resultLower.includes('hospital')) cls = 'sk-result-jail';
        else if (resultLower.includes('critical')) cls = 'sk-result-critical';

        const card = document.createElement('div');
        card.className = `sk-crime-toast-card ${cls}`;

        const title = document.createElement('div');
        title.className = 'sk-crime-toast-result';
        title.textContent = result || 'Unknown';

        const sub = document.createElement('div');
        sub.className = 'sk-crime-toast-reward';
        sub.textContent = reward || '';

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = 'position:absolute;top:4px;right:6px;background:none;border:none;color:#888;cursor:pointer;font-size:16px;line-height:1;padding:0;';
        closeBtn.onclick = (e) => { e.stopPropagation(); card.remove(); };
        card.appendChild(closeBtn);

        card.appendChild(title);
        card.appendChild(sub);
        wrap.appendChild(card);

        // Keep only 1 toast visible as per user request
        const cards = wrap.querySelectorAll('.sk-crime-toast-card');
        if (cards.length > 1) {
            for (let i = 0; i < cards.length - 1; i++) {
                cards[i].remove();
            }
        }
    },

    // ─── Fetch Intercept (toast mode) ────────────────────────────────────────

    _injectFetchIntercept() {
        // Inject once per page load — injects into MAIN world via script tag
        if (document.getElementById('sk-crime-fetch-hook')) return;

        const script = document.createElement('script');
        script.id = 'sk-crime-fetch-hook';
        const code = `
            (function() {
                if (window.__skCrimeFetchHooked) return;
                window.__skCrimeFetchHooked = true;
                const _orig = window.fetch;
                window.fetch = function(...args) {
                    return _orig.apply(this, args).then(function(r) {
                        try {
                            const u = new URL(r.url.startsWith('http') ? r.url : window.location.origin + '/' + r.url);
                            const isCrimeAttempt = (
                                (u.pathname === '/page.php' && u.searchParams.get('sid') === 'crimesData' && u.searchParams.get('step') === 'attempt') ||
                                (u.pathname === '/loader.php' && u.searchParams.get('sid') === 'crimes' && u.searchParams.get('step') === 'attempt') ||
                                (u.pathname.includes('/loader.php') && u.searchParams.get('sid') === 'crimes')
                            );
                            if (isCrimeAttempt) {
                                r.clone().json().then(function(data) {
                                    var outcome = data && (data.DB && data.DB.outcome || data.outcome);
                                    if (!outcome) return;
                                    var result = outcome.result || '';
                                    var rewards = (outcome.rewards || []).map(function(rw) {
                                        var t = (rw.type || '').toLowerCase();
                                        if (t === 'money') return rw.value ? '$' + Number(rw.value).toLocaleString() : 'Money';
                                        if (t === 'items' && Array.isArray(rw.value)) return rw.value.map(function(v) { return (v.amount || 1) + 'x ' + (v.name || 'Item'); }).join(', ');
                                        if (t === 'jail') return 'Jailed';
                                        if (t === 'hospital') return 'Hospitalized';
                                        return rw.type || '';
                                    }).filter(Boolean).join(' · ') || '';
                                    document.dispatchEvent(new CustomEvent('sk-crime-outcome', { detail: { result: result, reward: rewards } }));
                                }).catch(function() {});
                            }
                        } catch(e) {}
                        return r;
                    });
                };
            })();
        `;
        
        try {
            const blob = new Blob([code], { type: 'application/javascript' });
            script.src = URL.createObjectURL(blob);
            document.head.appendChild(script);
            setTimeout(() => {
                script.remove();
                URL.revokeObjectURL(script.src);
            }, 1000);
        } catch (err) {
            // Fallback
            script.textContent = code;
            document.head.appendChild(script);
            script.remove();
        }

        // Listen for the dispatched event from the MAIN world
        if (!this._toastListenerAttached) {
            this._toastListenerAttached = true;
            document.addEventListener('sk-crime-outcome', (e) => {
                if (this.isEnabled && this.mode === this.MODES.TOAST) {
                    this.showToast(e.detail.result, e.detail.reward);
                }
            });
        }
    },

    // ─── SPA Navigation Watcher ──────────────────────────────────────────────

    _startPageWatcher() {
        let lastHref = location.href;
        new MutationObserver(() => {
            if (location.href !== lastHref) {
                lastHref = location.href;
                setTimeout(() => {
                    // Re-apply after React re-renders the route
                    this._teardown();
                    this.apply();
                }, 250);
            }
        }).observe(document.body || document.documentElement, { childList: true, subtree: true });
    },

    // ─── Chain Text Observer ─────────────────────────────────────────────────
    _chainTextObserver: null,
    _startChainTextObserver() {
        if (this._chainTextObserver) return;
        this._chainTextObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.textContent && node.textContent.includes('times in a row')) {
                            const storyWrapper = node.closest('[class*="outcomePanel_"]') || node.closest('[class*="storyText"]');
                            if (storyWrapper) {
                                // Find the specific element containing the text and hide it
                                const elements = storyWrapper.querySelectorAll('div, span, p');
                                for (const el of elements) {
                                    if (el.textContent.includes('times in a row') && el.children.length === 0) {
                                        el.style.display = 'none';
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        const container = document.querySelector('[class*="crimesContainer"]') || document.body;
        this._chainTextObserver.observe(container, { childList: true, subtree: true });
    },

    _stopChainTextObserver() {
        if (this._chainTextObserver) {
            this._chainTextObserver.disconnect();
            this._chainTextObserver = null;
        }
    },

    // ─── Public API ──────────────────────────────────────────────────────────

    enable() {
        this.isEnabled = true;
        this.saveSettings();
        this.apply();
    },

    disable() {
        this.isEnabled = false;
        this.saveSettings();
        this._teardown();
    },
};

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.HideCrimeOutcome = HideCrimeOutcomeModule;
console.log('🦹 Hide Crime Outcome module registered');
