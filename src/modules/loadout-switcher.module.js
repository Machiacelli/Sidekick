/**
 * Sidekick Chrome Extension - Loadout Switcher Module
 * Adds quick loadout change buttons on the Items page.
 * Ported from "Torn Loadout Switcher" by Ramin Quluzades / Silmaril [2665762] (MIT)
 */

(function () {
    'use strict';

    console.log('👕 Loading Sidekick Loadout Switcher Module...');

    const STYLE_ID = 'sk-loadout-switcher-style';
    const LS_RFCV = 'silmaril-loadout-switcher-rfcv';
    const LS_TITLES = 'silmaril-loadout-switcher-titles';
    const LS_SELECTED = 'silmaril-loadout-switcher-selected-loadouts';
    const rfcvArg = 'rfcv=';
    const SET_LOADOUT_URL = '/page.php?sid=itemsLoadouts&step=changeLoadout&setID={loadoutId}&rfcv={rfcv}';
    const GET_EQUIPPED_URL = '/page.php?sid=itemsLoadouts&step=getEquippedItems';

    const LoadoutSwitcherModule = {
        isInitialized: false,
        isEnabled: false,
        _intervalId: null,
        _rfcv: null,
        _rfcvUpdatedThisSession: false,
        _loadoutTitles: {},
        _selectedLoadouts: '1,2,3',
        _selectedLoadoutsArray: ['1', '2', '3'],
        _observer: null,

        async init() {
            if (this.isInitialized) return;
            console.log('👕 Initializing Loadout Switcher Module...');
            try {
                this.isEnabled = await this.loadSettings();
                if (this.isEnabled) await this.enable();
                this.isInitialized = true;
                console.log('✅ Loadout Switcher Module initialized');
            } catch (err) {
                console.error('❌ Loadout Switcher init failed:', err);
            }
        },

        async loadSettings() {
            try {
                if (window.SidekickModules?.Core?.ChromeStorage?.get) {
                    const s = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                    if (s?.['loadout-switcher']) return s['loadout-switcher'].isEnabled !== false;
                }
                return true;
            } catch { return true; }
        },

        async saveSettings(enabled) {
            try {
                if (window.SidekickModules?.Core?.ChromeStorage?.get) {
                    const s = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
                    s['loadout-switcher'] = s['loadout-switcher'] || {};
                    s['loadout-switcher'].isEnabled = enabled;
                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', s);
                }
                this.isEnabled = enabled;
            } catch (err) { console.error('❌ Failed to save Loadout Switcher settings:', err); }
        },

        async enable() {
            if (!window.location.pathname.startsWith('/item.php')) return;
            console.log('👕 Enabling Loadout Switcher...');
            this.isEnabled = true;
            await this.saveSettings(true);

            // Load persisted state
            this._rfcv = localStorage.getItem(LS_RFCV) ?? null;
            this._selectedLoadouts = localStorage.getItem(LS_SELECTED) ?? '1,2,3';
            this._selectedLoadoutsArray = this._selectedLoadouts.split(',');
            try {
                const t = localStorage.getItem(LS_TITLES);
                if (t) this._loadoutTitles = JSON.parse(t);
            } catch { this._loadoutTitles = {}; }

            this._injectStyles();
            this._startRfcvCapture();

            // Poll until the loadouts title element exists, then attach UI
            this._intervalId = setInterval(() => this._tryAttach(), 50);

            // Fetch titles after a short delay (rfcv might not be ready yet)
            setTimeout(() => this._fetchTitlesManually(), 1500);
        },

        async disable() {
            console.log('👕 Disabling Loadout Switcher...');
            this.isEnabled = false;
            await this.saveSettings(false);
            if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
            if (this._observer) { this._observer.disconnect(); this._observer = null; }
            document.querySelectorAll('.silmaril-torn-loadout-switcher-container').forEach(el => el.remove());
            const style = document.getElementById(STYLE_ID);
            if (style) style.remove();
        },

        async toggle() {
            if (this.isEnabled) await this.disable();
            else await this.enable();
        },

        // ── rfcv capture ──────────────────────────────────────────────────────

        _captureRfcvFromUrl(url) {
            if (this._rfcvUpdatedThisSession) return;
            if (typeof url !== 'string') return;
            const idx = url.indexOf(rfcvArg);
            if (idx < 0) return;
            this._rfcv = url.substring(idx + rfcvArg.length).split('&')[0];
            localStorage.setItem(LS_RFCV, this._rfcv);
            // Activate buttons that were disabled waiting for rfcv
            document.querySelectorAll('.silmaril-torn-loadout-switcher-container button')
                .forEach(b => b.classList.remove('disabled'));
            this._rfcvUpdatedThisSession = true;
            this._fetchTitlesManually();
        },

        _startRfcvCapture() {
            try {
                performance.getEntriesByType('resource').forEach(e => this._captureRfcvFromUrl(e.name));
                new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) this._captureRfcvFromUrl(entry.name);
                }).observe({ type: 'resource', buffered: true });
            } catch (e) {
                console.warn('[LoadoutSwitcher] PerformanceObserver unavailable:', e);
            }
        },

        // ── UI injection ──────────────────────────────────────────────────────

        _tryAttach() {
            // Find the title element inside #loadoutsRoot
            const titleEl = [...document.querySelectorAll('#loadoutsRoot [class*=title___]')]
                .find(el => Array.from(el.classList).some(c => c.startsWith('title___')));
            if (!titleEl) return;
            if (titleEl.querySelector('.silmaril-torn-loadout-switcher-container')) return;

            const container = document.createElement('div');
            container.className = 'silmaril-torn-loadout-switcher-container';

            const wave = document.createElement('div');
            wave.className = 'wave';
            container.appendChild(wave);

            this._addButtons(container);
            titleEl.appendChild(container);
        },

        _addButtons(container) {
            // Loadout buttons
            this._selectedLoadoutsArray.forEach(loadout => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = this._rfcv === null ? 'torn-btn disabled' : 'torn-btn';
                btn.setAttribute('data-loadout-number', loadout);
                btn.textContent = this._loadoutTitles[loadout] ?? loadout;
                btn.title = loadout;
                btn.addEventListener('click', (e) => this._handleLoadoutClick(e, container));
                container.appendChild(btn);
            });

            // Settings (⚙) button
            const settingsBtn = document.createElement('button');
            settingsBtn.type = 'button';
            settingsBtn.title = 'Settings';
            settingsBtn.className = 'torn-btn';
            settingsBtn.textContent = '⚙';
            settingsBtn.addEventListener('click', () => {
                const input = prompt(
                    'Enter which loadouts (1–9) to show, comma-separated (default: 1,2,3):',
                    this._selectedLoadouts
                );
                const wave = container.querySelector('.wave');
                if (input !== null && input.trim().length > 0) {
                    localStorage.setItem(LS_SELECTED, input.trim());
                    this._selectedLoadouts = input.trim();
                    this._selectedLoadoutsArray = this._selectedLoadouts.split(',');
                    // Rebuild buttons
                    container.querySelectorAll('button, a').forEach(el => el.remove());
                    this._addButtons(container);
                    wave.style.backgroundColor = 'green';
                } else {
                    wave.style.backgroundColor = 'yellow';
                    wave.style.animationDuration = '3s';
                }
                wave.style.animation = 'none';
                void wave.offsetHeight; // reflow
                wave.style.animation = null;
            });
            container.appendChild(settingsBtn);
        },

        async _handleLoadoutClick(e, container) {
            const loadout = e.target.getAttribute('data-loadout-number');
            if (e.target.classList.contains('disabled')) return;
            const url = SET_LOADOUT_URL
                .replace('{loadoutId}', loadout)
                .replace('{rfcv}', this._rfcv);
            await this._sendSetLoadout(url, container);
        },

        async _sendSetLoadout(url, container) {
            const wave = container.querySelector('.wave');
            try {
                const res = await fetch(url, { method: 'GET' });
                wave.style.backgroundColor = res.ok ? 'green' : 'red';
                if (!res.ok) wave.style.animationDuration = '5s';
            } catch {
                wave.style.backgroundColor = 'red';
                wave.style.animationDuration = '5s';
            }
            wave.style.animation = 'none';
            void wave.offsetHeight;
            wave.style.animation = null;
        },

        // ── Title fetching ────────────────────────────────────────────────────

        async _fetchTitlesManually() {
            if (!this._rfcv) return;
            try {
                const res = await fetch(`${GET_EQUIPPED_URL}&rfcv=${this._rfcv}`);
                const data = await res.json();
                if (data?.currentLoadouts) {
                    for (const key of Object.keys(data.currentLoadouts)) {
                        this._loadoutTitles[key] = data.currentLoadouts[key].title;
                    }
                    this._persistTitles();
                    this._refreshButtonText();
                }
            } catch (e) {
                console.warn('[LoadoutSwitcher] Title fetch failed:', e);
            }
        },

        _persistTitles() {
            try { localStorage.setItem(LS_TITLES, JSON.stringify(this._loadoutTitles)); } catch { }
        },

        _refreshButtonText() {
            document.querySelectorAll('.silmaril-torn-loadout-switcher-container button[data-loadout-number]')
                .forEach(btn => {
                    const loadout = btn.getAttribute('data-loadout-number');
                    const title = this._loadoutTitles[loadout];
                    if (title) { btn.textContent = title; btn.title = loadout; }
                });
        },

        // ── Styles ────────────────────────────────────────────────────────────

        _injectStyles() {
            if (document.getElementById(STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                div#loadoutsRoot p[class^=title___] {
                    overflow-y: hidden;
                    overflow-x: auto;
                }
                div.silmaril-torn-loadout-switcher-container {
                    display: inline-flex;
                    align-items: center;
                    margin-left: 5px;
                    gap: 4px;
                }
                div.silmaril-torn-loadout-switcher-container button.torn-btn {
                    height: 23px !important;
                    line-height: 23px !important;
                }
                .wave-animation { position: relative; overflow: hidden; }
                .wave {
                    pointer-events: none;
                    position: absolute;
                    width: 100%;
                    height: 33px;
                    background-color: transparent;
                    opacity: 0;
                    transform: translateX(-100%);
                    animation: sk-waveAnimation 3s cubic-bezier(0, 0, 0, 1);
                }
                @keyframes sk-waveAnimation {
                    0%   { opacity: 1; transform: translateX(-100%); }
                    100% { opacity: 0; transform: translateX(100%); }
                }
                @media (max-width: 768px) {
                    div[class^=main___] > div[class^=content___] { margin-top: 10px; }
                }
            `;
            document.head.appendChild(style);
        }
    };

    window.SidekickModules = window.SidekickModules || {};
    window.SidekickModules.LoadoutSwitcher = LoadoutSwitcherModule;
    console.log('✅ Loadout Switcher Module loaded and ready');
})();
