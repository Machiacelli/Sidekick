/**
 * Flight Tracker Module
 * Automatically reads player travel status from profile page DOM.
 * Opens a persistent live window showing status + countdown on "Returning" state.
 */

(function () {
    'use strict';

    // ── Travel times per country (seconds) ────────────────────────────────────
    // Keyed by the normalized country name as it appears in Torn status text
    const TRAVEL_TIMES = {
        'Mexico': { standard: 26 * 60, airstrip: 18 * 60, business: 8 * 60 },
        'Cayman Islands': { standard: 35 * 60, airstrip: 25 * 60, business: 11 * 60 },
        'Canada': { standard: 41 * 60, airstrip: 29 * 60, business: 12 * 60 },
        'Hawaii': { standard: 134 * 60, airstrip: 94 * 60, business: 40 * 60 },
        'United Kingdom': { standard: 159 * 60, airstrip: 111 * 60, business: 48 * 60 },
        'Argentina': { standard: 167 * 60, airstrip: 117 * 60, business: 50 * 60 },
        'Switzerland': { standard: 175 * 60, airstrip: 123 * 60, business: 53 * 60 },
        'Japan': { standard: 225 * 60, airstrip: 158 * 60, business: 68 * 60 },
        'China': { standard: 242 * 60, airstrip: 169 * 60, business: 72 * 60 },
        'United Arab Emirates': { standard: 271 * 60, airstrip: 190 * 60, business: 81 * 60 },
        'South Africa': { standard: 297 * 60, airstrip: 208 * 60, business: 89 * 60 },
    };

    // Country name aliases from Torn status text
    const COUNTRY_ALIASES = {
        'ciudad juárez': 'Mexico', 'ciudad juarez': 'Mexico',
        'george town': 'Cayman Islands',
        'toronto': 'Canada',
        'honolulu': 'Hawaii',
        'london': 'United Kingdom', 'uk': 'United Kingdom',
        'buenos aires': 'Argentina',
        'zurich': 'Switzerland',
        'tokyo': 'Japan',
        'beijing': 'China',
        'dubai': 'United Arab Emirates', 'uae': 'United Arab Emirates',
        'johannesburg': 'South Africa',
    };

    function normalizeCountry(raw) {
        if (!raw) return null;
        const lower = raw.trim().toLowerCase();
        return COUNTRY_ALIASES[lower] || Object.keys(TRAVEL_TIMES).find(k => k.toLowerCase() === lower) || raw.trim();
    }

    function getTravelTime(country, planeType) {
        const c = TRAVEL_TIMES[country];
        if (!c) return null;
        if (planeType === 'airstrip') return c.airstrip;
        if (planeType === 'business') return c.business;
        return c.standard;
    }

    // ── Module ────────────────────────────────────────────────────────────────
    const FlightTrackerModule = {
        isInitialized: false,

        // Per-player tracking state stored in memory (not persisted — tracking
        // only makes sense while the profile page is open)
        // { playerId: { name, status, country, planeType, landingTime, countdownInterval, observer, windowEl } }
        tracking: new Map(),

        async init() {
            console.log('✈️ Flight Tracker: initializing…');
            try {
                await this._waitForCore();
                this._setupPageObserver();
                this.isInitialized = true;
                console.log('✅ Flight Tracker ready');
            } catch (e) {
                console.error('❌ Flight Tracker init failed:', e);
            }
        },

        // Wait for SidekickModules.Core
        _waitForCore() {
            return new Promise(resolve => {
                const check = () => window.SidekickModules?.Core ? resolve() : setTimeout(check, 100);
                check();
            });
        },

        // Watch for Torn's SPA navigation (URL changes without full reload)
        _setupPageObserver() {
            this._onPageChange();
            // Torn re-renders content; watch for URL changes via MutationObserver
            let lastHref = location.href;
            new MutationObserver(() => {
                if (location.href !== lastHref) {
                    lastHref = location.href;
                    this._onPageChange();
                }
            }).observe(document.body, { childList: true, subtree: true });
        },

        _onPageChange() {
            const match = location.href.match(/profiles\.php.*XID=(\d+)/);
            if (match) {
                const playerId = match[1];
                // Inject button once the link list is ready
                this._injectButton(playerId);
            }
        },

        // ── Button injection ──────────────────────────────────────────────────
        async _injectButton(playerId) {
            if (document.getElementById(`sidekick-track-btn-${playerId}`)) return;

            // Wait for the actions buttons-list to exist
            const buttonsList = await this._waitForElement('div.buttons-list', 5000);
            if (!buttonsList) return;
            if (document.getElementById(`sidekick-track-btn-${playerId}`)) return;

            // Inject a one-time style block for our button
            if (!document.getElementById('sk-ft-btn-style')) {
                const s = document.createElement('style');
                s.id = 'sk-ft-btn-style';
                s.textContent = `
                    .sidekick-flight-tracker-btn {
                        position: relative;
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        box-sizing: border-box !important;
                        flex: 0 0 auto !important;
                        min-width: 38px;
                        min-height: 38px;
                        margin-top: 0 !important;
                        vertical-align: top !important;
                        overflow: hidden !important;
                        cursor: pointer;
                        outline: none;
                        filter: drop-shadow(0 0 3px #4CAF50);
                    }
                    .sidekick-flight-tracker-btn > img {
                        margin: auto !important;
                        pointer-events: none;
                    }
                    .sidekick-flight-tracker-btn .sk-ft-dot {
                        position: absolute;
                        top: 6px;
                        right: 6px;
                        width: 7px;
                        height: 7px;
                        border-radius: 50%;
                        background: #4CAF50;
                        box-shadow: 0 0 4px #4CAF50;
                        display: none;
                        pointer-events: none;
                    }
                    .sidekick-flight-tracker-btn.sk-ft-tracking .sk-ft-dot {
                        display: block;
                    }
                `;
                document.head.appendChild(s);
            }

            const btn = document.createElement('a');
            btn.id = `sidekick-track-btn-${playerId}`;
            // Use Torn's base button class so flex spacing, borders and vertical
            // alignment match the surrounding profile actions.
            btn.className = 'profile-button active sidekick-flight-tracker-btn';
            btn.setAttribute('role', 'button');
            btn.setAttribute('data-is-tooltip-opened', 'false');

            const referenceButton = buttonsList.querySelector(
                '.profile-button:not(.sidekick-flight-tracker-btn)'
            );
            if (referenceButton) {
                const referenceRect = referenceButton.getBoundingClientRect();
                if (referenceRect.width > 0 && referenceRect.height > 0) {
                    btn.style.setProperty('width', `${referenceRect.width}px`, 'important');
                    btn.style.setProperty('height', `${referenceRect.height}px`, 'important');
                    btn.style.setProperty('max-width', `${referenceRect.width}px`, 'important');
                    btn.style.setProperty('max-height', `${referenceRect.height}px`, 'important');
                }
            }

            const isTracking = this.tracking.has(playerId);
            this._setButtonState(btn, isTracking);

            // Append after Torn's own profile actions.
            buttonsList.appendChild(btn);

            btn.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                this._showActionMenu(playerId, btn);
            });
        },

        // ── Action menu ──────────────────────────────────────────────────────
        _showActionMenu(playerId, btn) {
            // Remove any existing menu
            document.querySelector(".sk-action-menu")?.remove();

            const menu = document.createElement("div");
            menu.className = "sk-action-menu";

            const addItem = (text, onClick) => {
                const item = document.createElement("div");
                item.className = "sk-action-menu-item";
                item.textContent = text;

                item.onclick = () => {
                    menu.remove();
                    onClick();
                };

                menu.appendChild(item);
            };

            // Existing Flight Tracker functionality
            addItem("Track Target", () => {
                this._handleButtonClick(playerId, btn);
            });

            // Halloween Helper
            if (window.SidekickModules?.HalloweenHelper?.isEnabled()) {

                addItem("Add to Halloween List", async () => {

                    let username = "Unknown";
                    
                    try {
                        const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                        if (apiKey) {
                            const response = await fetch(`https://api.torn.com/user/${playerId}?selections=profile&key=${apiKey}`);
                            const data = await response.json();
                            if (data && data.name) {
                                username = data.name;
                            }
                        }
                    } catch (e) {
                        console.error('Sidekick: Failed to fetch username from API', e);
                    }

                    // Fallback if API fails or no key
                    if (username === "Unknown") {
                        const userLink = document.querySelector(`a[href*="XID=${playerId}"]`);
                        if (userLink && userLink.innerText) {
                            username = userLink.innerText.trim();
                        } else if (document.title.includes(" - Profile")) {
                            username = document.title.split(" [")[0].trim();
                        } else if (document.title.includes("'s profile")) {
                            username = document.title.split("'s profile")[0].trim();
                        }
                    }

                    await window.SidekickModules.HalloweenHelper.addTarget(
                        playerId,
                        username
                    );

                    console.log("Added to Halloween list:", username);
                    
                    if (window.SidekickModules?.UI?.showNotification) {
                        window.SidekickModules.UI.showNotification(
                            'Halloween Helper',
                            `Added ${username} to Trick or Treat List.`,
                            'success'
                        );
                    }

                });

            }

            document.body.appendChild(menu);

            const rect = btn.getBoundingClientRect();

            menu.style.left = `${rect.left}px`;
            menu.style.top = `${rect.bottom + 5}px`;

            setTimeout(() => {
                const close = (e) => {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener("click", close);
                    }
                };

                document.addEventListener("click", close);
            }, 0);
        },

        // Sidekick project icon — sized 28px inside a constrained 38×38 button
        _iconImg(isTracking) {
            const url = chrome.runtime.getURL('assets/icons/swissknife-48.png');
            const extra = isTracking ? 'filter:drop-shadow(0 0 4px #4CAF50);opacity:1;' : 'opacity:0.65;';
            // Enforce 28×28 via style so no external CSS can override the attribute
            return `<img src="${url}" style="display:block;width:28px;height:28px;max-width:28px;max-height:28px;${extra}" alt="Sidekick">`;
        },

        _setButtonState(btn, isTracking) {
            btn.title = isTracking ? 'Flight Tracker — click to view' : 'Track this player\'s flight';
            btn.setAttribute('aria-label', isTracking ? 'Flight tracker active' : 'Track flight');
            btn.classList.toggle('sk-ft-tracking', isTracking);
            btn.innerHTML = `
                ${this._iconImg(isTracking)}
                <span class="sk-ft-dot"></span>
            `;
        },

        // ── Button click ──────────────────────────────────────────────────────
        _handleButtonClick(playerId, btn) {
            if (this.tracking.has(playerId)) {
                // Toggle window visibility if already tracking
                const state = this.tracking.get(playerId);
                if (state.windowEl && document.body.contains(state.windowEl)) {
                    if (state.windowEl.style.display === 'none') {
                        state.windowEl.style.display = 'block';
                    } else {
                        state.windowEl.style.display = 'none';
                    }
                } else {
                    this._openWindow(playerId, btn);
                }
            } else {
                this._startTracking(playerId, btn);
            }
        },

        // ── Start tracking ────────────────────────────────────────────────────
        _startTracking(playerId, btn) {
            const name = this._getPlayerName();
            const state = {
                name,
                status: 'unknown',
                country: null,
                planeType: null,
                landingTime: null,
                countdownInterval: null,
                observer: null,
                windowEl: null,
            };
            this.tracking.set(playerId, state);
            this._setButtonState(btn, true);

            // Read status immediately, then open window
            this._readStatus(playerId);
            this._openWindow(playerId, btn);

            // Watch DOM for status changes (Torn updates status text dynamically)
            const observer = new MutationObserver(this._debounce(() => {
                this._readStatus(playerId);
            }, 400));
            observer.observe(document.body, { childList: true, subtree: true, characterData: true });
            state.observer = observer;

            // Cleanup if user navigates away
            window.addEventListener('beforeunload', () => this._stopTracking(playerId), { once: true });
        },

        // Read status from DOM — also falls back to 'home' when no travel text found
        _readStatus(playerId) {
            const state = this.tracking.get(playerId);
            if (!state) return;

            const { text, planeType } = this._scanStatusDOM();

            // If no travel text found at all, player is in Torn
            if (!text) {
                const prevStatus = state.status;
                state.status = 'home';
                state.country = null;
                if (prevStatus === 'returning') {
                    this._clearCountdown(state);
                    state.landingTime = null;
                }
                this._refreshWindow(playerId);
                return;
            }

            const parsed = this._parseStatus(text);
            if (!parsed) {
                // Text found but doesn't match travel patterns — treat as home
                const prevStatus = state.status;
                state.status = 'home';
                state.country = null;
                if (prevStatus === 'returning') {
                    this._clearCountdown(state);
                    state.landingTime = null;
                }
                this._refreshWindow(playerId);
                return;
            }

            const country = normalizeCountry(parsed.country);
            const prevStatus = state.status;

            state.status = parsed.status;
            state.country = country;
            if (planeType) state.planeType = planeType;

            // Start countdown the moment we detect "returning"
            if (parsed.status === 'returning' && prevStatus !== 'returning' && country) {
                this._startCountdown(playerId, country, state.planeType || 'standard');
            }

            // If status changed back from returning (landed), stop countdown
            if (parsed.status !== 'returning' && prevStatus === 'returning') {
                this._clearCountdown(state);
                state.landingTime = null;
            }

            this._refreshWindow(playerId);
        },

        // Scan page DOM for travel status text and plane type
        _scanStatusDOM() {
            // ── Priority 1: Torn profile travel banner ────────────────────────
            // The banner appears as a styled div/anchor with text like
            // "Torn to South Africa" or "South Africa to Torn"
            const bannerSelectors = [
                '[class*="travel"]',
                '[class*="traveling"]',
                'a[href*="travel"]',
                '[class*="status"]',
                '[class*="userStatus"]',
                '[class*="icons"]',
            ];
            for (const sel of bannerSelectors) {
                for (const el of document.querySelectorAll(sel)) {
                    // Only check leaf-ish text (avoid grabbing whole page sections)
                    const rawText = el.textContent?.trim() || '';
                    // Use first line only when the element spans multiple lines
                    const firstLine = rawText.split(/\n/)[0].trim();
                    for (const candidate of [firstLine, rawText]) {
                        if (!candidate || candidate.length > 80) continue;
                        const parsed = this._parseStatus(candidate);
                        if (parsed) {
                            const planeType = this._detectPlaneType(el);
                            return { text: candidate, planeType };
                        }
                    }
                }
            }

            // ── Priority 2: Broad text-node walk ──────────────────────────────
            const wrapper = document.querySelector('.content-wrapper, #mainContainer, body');
            if (!wrapper) return { text: null, planeType: null };

            const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                const text = (node.textContent?.trim() || '');
                if (!text || text.length > 80) continue;
                if (this._parseStatus(text)) {
                    const planeType = this._detectPlaneType(node.parentElement);
                    return { text, planeType };
                }
            }

            return { text: null, planeType: null };
        },

        // Detect plane type from element or its nearby siblings/parents
        _detectPlaneType(el) {
            // Walk up to find a container that may have travel-class children
            let node = el;
            for (let i = 0; i < 6; i++) {
                if (!node) break;
                const cls = (node.className || '').toString().toLowerCase();
                if (cls.includes('airstrip')) return 'airstrip';
                if (cls.includes('business')) return 'business';
                // Check images inside
                const imgs = node.querySelectorAll?.('img') || [];
                for (const img of imgs) {
                    const src = (img.src || '').toLowerCase();
                    if (src.includes('airstrip')) return 'airstrip';
                    if (src.includes('business')) return 'business';
                }
                node = node.parentElement;
            }
            return 'standard';
        },

        // Parse status text → { status, country } or null
        _parseStatus(text) {
            if (!text) return null;

            text = text.trim();
            let m;

            // Travel 2.0 route format
            // Torn to Country = outbound
            // Country to Torn = returning
            m = text.match(/^(.+?)\s+to\s+(.+)$/i);
            if (m) {
                const from = m[1].trim();
                const to = m[2].trim();

                if (/^torn$/i.test(from) && this._isTornCountry(to)) {
                    return {
                        status: 'traveling',
                        country: to
                    };
                }

                if (/^torn$/i.test(to) && this._isTornCountry(from)) {
                    return {
                        status: 'returning',
                        country: from
                    };
                }
            }

            // Legacy outbound
            m = text.match(/(?:Traveling(?:\s+from\s+Torn)?\s+to)\s+(.+?)(?:\s*$|\n)/i);
            if (m) {
                const country = m[1].trim();
                if (this._isTornCountry(country)) {
                    return {
                        status: 'traveling',
                        country
                    };
                }
            }

            // Legacy returning
            m = text.match(/Returning\s+to\s+Torn(?:\s+from\s+(.+?))?(?:\s*$|\n)/i);
            if (m) {
                return {
                    status: 'returning',
                    country: (m[1] || '').trim() || null
                };
            }

            // Abroad
            m = text.match(/^In\s+(.+?)(?:\s*$|\n)/i);
            if (m) {
                const country = m[1].trim();
                if (this._isTornCountry(country)) {
                    return {
                        status: 'abroad',
                        country
                    };
                }
            }

            return null;
        },

        // Torn’s exact travel destinations (case-insensitive allowlist)
        _isTornCountry(name) {
            const TORN_COUNTRIES = [
                'Mexico', 'Cayman Islands', 'Canada', 'Hawaii',
                'United Kingdom', 'UK', 'Argentina', 'Switzerland',
                'Japan', 'China', 'UAE', 'Dubai', 'South Africa',
            ];
            const n = name.trim().toLowerCase();
            return TORN_COUNTRIES.some(c => c.toLowerCase() === n ||
                n.startsWith(c.toLowerCase()));
        },

        // ── Countdown ─────────────────────────────────────────────────────────
        _startCountdown(playerId, country, planeType) {
            const state = this.tracking.get(playerId);
            if (!state) return;
            this._clearCountdown(state);

            const secs = getTravelTime(country, planeType);
            if (!secs) {
                console.warn(`✈️ [FlightTracker] No travel time for ${country} / ${planeType}`);
                return;
            }

            state.landingTime = Date.now() + secs * 1000;
            console.log(`✈️ [FlightTracker] Countdown started: ${country} ${planeType} → ${secs}s`);

            state.countdownInterval = setInterval(() => {
                this._refreshWindow(playerId);
                if (state.landingTime && Date.now() >= state.landingTime) {
                    this._clearCountdown(state);
                }
            }, 1000);
        },

        _clearCountdown(state) {
            if (state.countdownInterval) {
                clearInterval(state.countdownInterval);
                state.countdownInterval = null;
            }
        },

        // ── Live tracker window ─────────────────────────────────────────────────
        _openWindow(playerId, anchorBtn) {
            const state = this.tracking.get(playerId);
            if (!state) return;

            // Remove old window if it exists
            state.windowEl?.remove();
            if (state._resizeListener) {
                window.removeEventListener('resize', state._resizeListener);
                state._resizeListener = null;
            }

            // If anchorBtn is null (called from _refreshWindow), look it up
            const anchor = anchorBtn || document.getElementById(`sidekick-track-btn-${playerId}`);

            const win = document.createElement('div');
            win.id = `sidekick-ft-win-${playerId}`;
            win.style.cssText = `
                position: fixed;
                min-width: 260px;
                max-width: 340px;
                background: #141414;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 10px;
                padding: 0;
                color: #fff;
                font-family: Arial, sans-serif;
                font-size: 13px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.7);
                z-index: 9999999;
                user-select: none;
            `;

            win.innerHTML = this._buildWindowHTML(playerId);
            document.body.appendChild(win);
            state.windowEl = win;

            // Position helper — clamps to current viewport
            const positionWindow = () => {
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const pw = win.offsetWidth || 300;
                const ph = win.offsetHeight || 200;

                let left, top;

                if (anchor) {
                    const rect = anchor.getBoundingClientRect();
                    left = rect.right - pw;         // right-align with button
                    top = rect.bottom + 8;         // just below button
                } else {
                    left = vw - pw - 10;
                    top = 200;
                }

                // Clamp so the popup is always fully within the viewport
                left = Math.max(8, Math.min(left, vw - pw - 8));
                top = Math.max(8, Math.min(top, vh - ph - 8));

                win.style.left = `${left}px`;
                win.style.top = `${top}px`;
            };

            // Position immediately, then again once painted (to get real dimensions)
            positionWindow();
            requestAnimationFrame(positionWindow);

            // Reposition on every resize so it never goes off-screen
            state._resizeListener = positionWindow;
            window.addEventListener('resize', positionWindow);

            this._attachWindowListeners(win, playerId, anchor);
        },

        _buildWindowHTML(playerId) {
            const state = this.tracking.get(playerId);
            if (!state) return '';

            // Header
            let statusLine = '';
            let statusColor = '#aaa';
            let countdownHTML = '';

            const planeLabel = state.planeType === 'airstrip' ? '🛩️ Airstrip'
                : state.planeType === 'business' ? '💼 Business'
                    : '✈️ Commercial';
            const planeBadge = `<span style="font-size:11px;color:#999;margin-left:6px;">${planeLabel}</span>`;

            if (state.status === 'traveling' && state.country) {
                statusLine = `🛫 Waiting for arrival in <strong>${state.country}</strong>${planeBadge}`;
                statusColor = '#FFB74D';
            } else if (state.status === 'abroad' && state.country) {
                statusLine = `🌍 In <strong>${state.country}</strong> — waiting for return${planeBadge}`;
                statusColor = '#64B5F6';
            } else if (state.status === 'returning' && state.country) {
                statusLine = `🛬 Returning from <strong>${state.country}</strong>${planeBadge}`;
                statusColor = '#81C784';
                if (state.landingTime) {
                    const remaining = Math.max(0, Math.floor((state.landingTime - Date.now()) / 1000));
                    if (remaining === 0) {
                        countdownHTML = `<div style="margin-top:10px;padding:8px 10px;background:rgba(76,175,80,0.15);
                            border-radius:6px;color:#81C784;font-size:14px;font-weight:bold;text-align:center;">
                            🏠 Landed in Torn!
                        </div>`;
                    } else {
                        const urgentColor = remaining <= 60 ? '#F44336' : remaining <= 300 ? '#FF9800' : '#81C784';
                        countdownHTML = `<div style="margin-top:10px;padding:8px 10px;background:rgba(0,0,0,0.3);border-radius:6px;text-align:center;">
                            <div style="font-size:11px;color:#aaa;margin-bottom:4px;">Estimated arrival in</div>
                            <div style="font-size:22px;font-weight:bold;color:${urgentColor};font-variant-numeric:tabular-nums;">
                                ${this._fmtSeconds(remaining)}
                            </div>
                        </div>`;
                    }
                }
            } else if (state.status === 'home') {
                statusLine = `🏠 In <strong>Torn</strong>`;
                statusColor = '#aaa';
            } else {
                statusLine = `<span style="color:#666">👁️ Monitoring status…</span>`;
            }

            return `
            <div style="background:rgba(255,255,255,0.05);border-radius:10px 10px 0 0;
                padding:12px 14px;display:flex;justify-content:space-between;align-items:center;
                border-bottom:1px solid rgba(255,255,255,0.08);">
                <span style="font-weight:bold;font-size:13px;">✈️ Tracking: <span style="color:#81C784;">${state.name || 'Player'}</span></span>
                <div style="display:flex;gap:6px;align-items:center;">
                    <button class="ft-stop-btn" title="Stop tracking"
                        style="background:rgba(244,67,54,0.15);border:1px solid rgba(244,67,54,0.3);
                        color:#F44336;border-radius:4px;cursor:pointer;font-size:11px;padding:2px 7px;">■ Stop</button>
                    <button class="ft-hide-btn" title="Hide window"
                        style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);
                        color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;padding:2px 7px;">✕</button>
                </div>
            </div>
            <div style="padding:12px 14px;">
                <div style="color:${statusColor};line-height:1.6;">${statusLine}</div>
                ${countdownHTML}
            </div>`;
        },

        _refreshWindow(playerId) {
            const state = this.tracking.get(playerId);
            if (!state?.windowEl || !document.body.contains(state.windowEl)) return;
            state.windowEl.innerHTML = this._buildWindowHTML(playerId);
            this._attachWindowListeners(state.windowEl, playerId, null);
        },

        _attachWindowListeners(win, playerId, anchorBtn) {
            win.querySelector('.ft-stop-btn')?.addEventListener('click', () => {
                if (confirm(`Stop tracking ${this.tracking.get(playerId)?.name || 'this player'}?`)) {
                    this._stopTracking(playerId);
                }
            });
            win.querySelector('.ft-hide-btn')?.addEventListener('click', () => {
                win.style.display = 'none';
            });
        },

        // ── Stop tracking ─────────────────────────────────────────────────────
        _stopTracking(playerId) {
            const state = this.tracking.get(playerId);
            if (!state) return;
            this._clearCountdown(state);
            state.observer?.disconnect();
            if (state._resizeListener) {
                window.removeEventListener('resize', state._resizeListener);
            }
            state.windowEl?.remove();
            this.tracking.delete(playerId);

            const btn = document.querySelector('.sidekick-flight-tracker-btn');
            if (btn) this._setButtonState(btn, false);
        },

        // ── Helpers ───────────────────────────────────────────────────────────
        _waitForElement(selector, timeout = 3000) {
            const el = document.querySelector(selector);
            if (el) return Promise.resolve(el);
            return new Promise(resolve => {
                const obs = new MutationObserver(() => {
                    const found = document.querySelector(selector);
                    if (found) { obs.disconnect(); resolve(found); }
                });
                obs.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
            });
        },

        _getPlayerName() {
            const selectors = ['#skip-to-content', '.basic-information h4', 'h4[class*="name"]'];
            for (const s of selectors) {
                const el = document.querySelector(s);
                if (el) return el.textContent.trim().replace(/\[.*?\]/g, '').trim();
            }
            return 'Unknown';
        },

        _fmtSeconds(secs) {
            if (secs <= 0) return '0s';
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = secs % 60;
            if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
            if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
            return `${s}s`;
        },

        _debounce(fn, delay) {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn(...args), delay);
            };
        },
    };

    // ── Register ──────────────────────────────────────────────────────────────
    if (!window.SidekickModules) window.SidekickModules = {};
    window.SidekickModules.FlightTracker = FlightTrackerModule;
    console.log('✅ Flight Tracker module loaded');
})();
