// ==UserScript==
// @name         FactionOps™ - Faction War Coordinator
// @namespace    https://tornwar.com
// @version      5.4.2
// @description  Real-time faction war coordination tool for Torn.com
// @author       RussianRob
// @license      MIT (code) — FactionOps™ name and logo are unregistered trademarks of RussianRob; brand use requires permission
// @downloadURL  https://tornwar.com/scripts/factionops.user.js
// @updateURL    https://tornwar.com/scripts/factionops.meta.js
// @match        https://www.torn.com/factions.php?step=your*
// @match        https://www.torn.com/factions.php?step=profile*
// @match        https://www.torn.com/loader.php?sid=attack*
// @match        https://torn.com/loader.php?sid=attack*
// @match        https://www.torn.com/page.php?sid=attack*
// @match        https://torn.com/page.php?sid=attack*
// @match        https://www.torn.com/profiles.php?XID=*
// @match        https://torn.com/profiles.php?XID=*
// @match        https://www.torn.com/war.php*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @connect      tornwar.com
// @connect      localhost
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // 2026-05-24 — PDA Android GM polyfill. TM's @grant occasionally fails
    // to bind GM_xxx as local vars on Android (xentac repro). Defining on
    // window lets the bare GM_xxx(...) call fall through to the global via
    // scope chain. Harmless on iOS — TM's local var always shadows window.
    // Skipped GM_xmlhttpRequest (fetch can't reliably emulate cross-origin).
    (function polyfillGM() {
        const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        if (typeof w.GM_addStyle !== 'function') {
            w.GM_addStyle = function (css) {
                const s = document.createElement('style');
                s.textContent = String(css || '');
                (document.head || document.documentElement).appendChild(s);
                return s;
            };
        }
        if (typeof w.GM_setValue !== 'function') {
            w.GM_setValue = function (k, v) { try { localStorage.setItem('fo:' + k, JSON.stringify(v)); } catch (_) { } };
        }
        if (typeof w.GM_getValue !== 'function') {
            w.GM_getValue = function (k, d) {
                try { const raw = localStorage.getItem('fo:' + k); return raw == null ? d : JSON.parse(raw); }
                catch (_) { return d; }
            };
        }
        if (typeof w.GM_setClipboard !== 'function') {
            w.GM_setClipboard = function (text) {
                try { return navigator.clipboard && navigator.clipboard.writeText(String(text || '')); } catch (_) { }
            };
        }
    })();

    // =========================================================================
    // SECTION 1: CONFIGURATION
    // =========================================================================

    // --- Torn PDA Detection ---
    // warboard-iOS 0.11.297 began exposing flutter_inappwebview so userscripts
    // written for PDA could schedule notifications there. That is genuinely
    // useful, but the object's PRESENCE is how everyone detects PDA -- so this
    // read true inside warboard, took the PDA branch, and disabled SSE (which
    // is broken in PDA's Flutter WebView but works fine in warboard). The
    // result was a transport with no working channel: "network error".
    //
    // --- warboard-iOS Detection ---
    // The warboard app injects its GM shim over a WKWebView message handler named
    // gmBridge; nothing else exposes that. Checked BEFORE IS_PDA because it is
    // what rules PDA out — see below.
    const IS_WARBOARD = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gmBridge);

    // warboard is NOT PDA, even though it now answers PDA's bridge.
    //
    // warboard-iOS 0.11.297 started exposing flutter_inappwebview so userscripts
    // written for PDA could schedule notifications there. Useful — but the
    // object's PRESENCE is how everybody detects PDA, so this read true inside
    // warboard and took the PDA branch, which turns SSE off (canUseSSEStream
    // returns false for PDA, where Flutter's WebView cannot hold a stream).
    // warboard CAN hold one since 0.11.276, so the result was a transport with
    // no working channel and a "network error" on screen.
    //
    // gmBridge rather than __WB_NATIVE_HOST__: the marker only exists in
    // 0.11.297+, while the handler is in every warboard build, so this also
    // covers anyone who has not updated.
    const IS_PDA = typeof window.flutter_inappwebview !== 'undefined' && !IS_WARBOARD;
    const PDA_API_KEY = '###PDA-APIKEY###';

    // Keep in step with @version above -- this is the number the footer shows
    // AND the one sent as scriptVersion, which the server's minimum-version
    // gate parses. Strictly numeric: a suffix would break that comparison.
    const SCRIPT_VERSION = '5.4.2';
    const CHAIN_POLL_ONLY = true;
    const CONFIG = {
        VERSION: SCRIPT_VERSION,
        SERVER_URL: GM_getValue('factionops_server', 'https://tornwar.com'),
        API_KEY: GM_getValue('factionops_apikey', '') || (IS_PDA ? PDA_API_KEY : ''),
        THEME: GM_getValue('factionops_theme', 'dark'),
        CHAIN_ALERT: GM_getValue('factionops_chain_alert', true),
        CHAIN_ALERT_THRESHOLD: GM_getValue('factionops_chain_alert_threshold', 60),
        PDA_NOTIFICATIONS: GM_getValue('factionops_pda_notif', IS_PDA),
        // The war-page display, added 5.2.31. Both shipped without any control
        // at all -- default on, because that is how they have behaved since
        // they landed and somebody who liked it should not have to opt in.
        KEEP_ALIVE: GM_getValue('factionops_keep_alive', false),
        // v5.0.92: opt-in BSP sharing — uploads your BSP cache entries
        // for current war targets to the warboard server, where they
        // become a fallback for teammates whose own BSP cache is empty
        // for those targets.
        SHARE_BSP: GM_getValue('factionops_share_bsp', false),
        // Post the call into Torn faction chat. Default OFF: this writes to a
        // shared channel every member reads, so it must be each member's own
        // explicit choice and must never arrive switched on via an update.
        //
        // Stored as the STRINGS '1'/'0', not a boolean. PDA's GM storage hands
        // values back as strings and `!!"false"` is truthy, so a boolean
        // written here round-trips as permanently-ON for every PDA user who
        // never opted in — precisely the accident this default exists to stop.
        CALL_CHAT: (String(GM_getValue('factionops_call_chat', '0')) === '1') ? '1' : '0',
        // Replace the 1s poll with a hanging GET /api/poll-long (long-poll +
        // deltas) when no SSE/Socket.IO is up (i.e. phones). Default ON, with an
        // auto-fallback to the standard poll if the transport fails on a device.
        USE_LONGPOLL: GM_getValue('factionops_use_longpoll', true),
        // These mirror the SERVER's CALL_EXPIRE_MS / DEAL_EXPIRE_MS, which are
        // the real authority -- the client only prunes its own view. The
        // client's window must never be SHORTER than the server's: a shorter
        // one hides a call the server still holds, so the target reads as free
        // and two people hit it.
        // v5.4.2: calls 15 -> 20 min. Deals said 2 hours here and were being
        // expired by the server at 15 min all along.
        CALL_TIMEOUT: 20 * 60 * 1000,        // 20 minute call expiry
        DEAL_TIMEOUT: 2 * 60 * 60 * 1000,    // 2 hour deal/locked call expiry
        REFRESH_INTERVAL: 30 * 1000,        // 30 second status refresh
        IS_PDA: IS_PDA,
    };

    // Auto-save PDA key on first detection
    if (IS_PDA && !GM_getValue('factionops_apikey', '')) {
        GM_setValue('factionops_apikey', PDA_API_KEY);
    }

    /** Persist a config key and update the live CONFIG object. */
    function setConfig(key, value) {
        CONFIG[key] = value;
        const gmKeys = {
            SERVER_URL: 'factionops_server',
            API_KEY: 'factionops_apikey',
            THEME: 'factionops_theme',
            CHAIN_ALERT: 'factionops_chain_alert',
            CHAIN_ALERT_THRESHOLD: 'factionops_chain_alert_threshold',
            PDA_NOTIFICATIONS: 'factionops_pda_notif',
            KEEP_ALIVE: 'factionops_keep_alive',
            SHARE_BSP: 'factionops_share_bsp',
            CALL_CHAT: 'factionops_call_chat',
            USE_LONGPOLL: 'factionops_use_longpoll',
        };
        if (gmKeys[key]) {
            GM_setValue(gmKeys[key], value);
        }
    }

    // =========================================================================
    // SECTION 1B: PDA-COMPATIBLE HTTP WRAPPER
    // =========================================================================

    /**
     * Cross-platform HTTP request wrapper.
     * Uses PDA_httpGet/PDA_httpPost on Torn PDA, GM_xmlhttpRequest elsewhere.
     * PDA bridge functions support headers: PDA_httpGet(url, headers), PDA_httpPost(url, headers, body)
     */
    function httpRequest(opts) {
        if (IS_PDA) {
            const method = (opts.method || 'GET').toUpperCase();
            if (method === 'GET' && typeof PDA_httpGet === 'function') {
                PDA_httpGet(opts.url, opts.headers || {})
                    .then(r => {
                        const resp = typeof r === 'string'
                            ? { status: 200, responseText: r, statusText: 'OK' }
                            : r;
                        opts.onload && opts.onload(resp);
                    })
                    .catch(e => opts.onerror && opts.onerror(e));
            } else if (method === 'POST' && typeof PDA_httpPost === 'function') {
                PDA_httpPost(opts.url, opts.headers || {}, opts.data || '')
                    .then(r => {
                        const resp = typeof r === 'string'
                            ? { status: 200, responseText: r, statusText: 'OK' }
                            : r;
                        opts.onload && opts.onload(resp);
                    })
                    .catch(e => opts.onerror && opts.onerror(e));
            } else {
                // Fallback: try fetch on PDA if bridge functions unavailable
                fetch(opts.url, {
                    method,
                    headers: opts.headers || {},
                    body: method !== 'GET' ? opts.data : undefined,
                }).then(async (r) => {
                    const text = await r.text();
                    opts.onload && opts.onload({ status: r.status, responseText: text, statusText: r.statusText });
                }).catch(e => opts.onerror && opts.onerror(e));
            }
            return;
        }
        GM_xmlhttpRequest(opts);
    }

    // =========================================================================
    // SECTION 1C: PDA NATIVE NOTIFICATIONS
    // =========================================================================

    /**
     * PDA native notification via flutter_inappwebview.callHandler('scheduleNotification').
     * Uses unique notification IDs per event type (0–9999 range).
     * On non-PDA or when PDA_NOTIFICATIONS is off, this is a no-op.
     *
     * ID ranges (to avoid collisions):
     *   100–199  target_called
     *   200–299  chain_alert
     *   300–399  hospital_pop
     *   400–409  bonus_imminent
     *   600–699  call_stolen
     *   800      war_target
     */
    const pdaNotifCounters = {};
    const pdaNotifFired = new Set(); // dedupe keys like 'chain_alert' or 'call_123'

    function firePdaNotification(type, title, body, urlCallback) {
        if (!IS_PDA || !CONFIG.PDA_NOTIFICATIONS) return;
        if (!window.flutter_inappwebview?.callHandler) return;

        // ID ranges per type
        const ranges = {
            target_called: [100, 199],
            chain_alert: [200, 299],
            hospital_pop: [300, 399],
            bonus_imminent: [400, 409],
            call_stolen: [600, 699],
            war_target: [800, 800],
            assist_request: [900, 999],
        };

        const range = ranges[type];
        if (!range) return;

        // Rotating ID within range
        if (!pdaNotifCounters[type]) pdaNotifCounters[type] = range[0];
        const id = pdaNotifCounters[type];
        pdaNotifCounters[type] = id >= range[1] ? range[0] : id + 1;

        // Schedule 1 second from now (minimum future timestamp required)
        const timestamp = Date.now() + 1000;

        window.flutter_inappwebview.callHandler('scheduleNotification', {
            title: title,
            subtitle: body,
            id: id,
            timestamp: timestamp,
            overwriteID: true,
            launchNativeToast: false,
            urlCallback: urlCallback || '',
        }).then(() => {
            log(`[PDA-Notif] Scheduled: ${type} (id=${id})`);
        }).catch(err => {
            warn(`[PDA-Notif] Failed: ${type}`, err);
        });
    }

    /** Clear PDA dedup set — called when data changes significantly (e.g. new war). */
    function resetPdaNotifDedup() {
        pdaNotifFired.clear();
    }

    // =========================================================================
    // SECTION 2: LOGGING UTILITIES
    // =========================================================================

    const LOG_PREFIX = '[FactionOps]';

    function log(...args) {
        console.log(LOG_PREFIX, ...args);
    }

    function warn(...args) {
        console.warn(LOG_PREFIX, ...args);
    }

    function error(...args) {
        console.error(LOG_PREFIX, ...args);
    }

    // =========================================================================
    // SECTION 3: CSS INJECTION
    // =========================================================================

    function injectStyles() {
        const css = `
/* =====================================================================
   FactionOps CSS — all selectors prefixed with wb- to avoid Torn conflicts
   ===================================================================== */

/* Theme variables — dark by default, light via .wb-theme-light on <html> */
:root {
    --wb-bg: #1a1a2e;
    --wb-bg-secondary: #16213e;
    --wb-text: #e0e0e0;
    --wb-text-muted: #a0a0b8;
    --wb-accent: #0f3460;
    --wb-accent-15: rgba(15,52,96,0.15);
    --wb-accent-20: rgba(15,52,96,0.2);
    --wb-accent-30: rgba(15,52,96,0.3);
    --wb-call-green: #00b894;
    --wb-call-red: #e17055;
    --wb-call-blue: #0984e3;
    --wb-hospital-red: #d63031;
    --wb-travel-blue: #0984e3;
    --wb-jail-gray: #636e72;
    --wb-online-green: #00b894;
    --wb-idle-yellow: #fdcb6e;
    --wb-offline-gray: #636e72;
    --wb-bonus-warning: #ff7675;
    --wb-border: #2d3436;
    --wb-shadow: rgba(0,0,0,0.5);
    --wb-inset-glow: rgba(255,255,255,0.04);
    --wb-inset-border: rgba(255,255,255,0.03);
}

html.wb-theme-light {
    --wb-bg: #f5f5f5;
    --wb-bg-secondary: #ffffff;
    --wb-text: #2d3436;
    --wb-text-muted: #636e72;
    --wb-accent: #d6eaf8;
    --wb-accent-15: rgba(52,152,219,0.08);
    --wb-accent-20: rgba(52,152,219,0.1);
    --wb-accent-30: rgba(52,152,219,0.15);
    --wb-border: #dfe6e9;
    --wb-shadow: rgba(0,0,0,0.12);
    --wb-inset-glow: rgba(0,0,0,0.02);
    --wb-inset-border: rgba(0,0,0,0.05);
}

/* ----- Settings gear icon (bottom-right FAB) ----- */
.wb-settings-gear {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--wb-accent);
    color: var(--wb-text);
    border: 2px solid var(--wb-border);
    cursor: pointer;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.4);
    transition: transform 0.2s ease, background 0.2s ease;
    font-family: Arial, sans-serif;
}
.wb-settings-gear:hover {
    transform: scale(1.1);
    background: var(--wb-call-green);
}

/* ----- Settings modal overlay ----- */
.wb-settings-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1000000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Arial, sans-serif;
}
.wb-settings-modal {
    background: var(--wb-bg);
    border: 1px solid var(--wb-border);
    border-radius: 8px;
    width: 420px;
    max-width: 95vw;
    max-height: 90vh;
    overflow-y: auto;
    padding: 24px;
    color: var(--wb-text);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.wb-settings-modal h2 {
    margin: 0 0 18px;
    font-size: 18px;
    color: var(--wb-call-green);
    display: flex;
    align-items: center;
    gap: 8px;
}
.wb-settings-modal label {
    display: block;
    font-size: 12px;
    color: var(--wb-text);
    margin-bottom: 4px;
    opacity: 0.8;
}
.wb-settings-modal input[type="text"],
.wb-settings-modal input[type="password"] {
    width: 100%;
    padding: 8px 10px;
    border-radius: 4px;
    border: 1px solid var(--wb-border);
    background: var(--wb-bg-secondary);
    color: var(--wb-text);
    font-size: 13px;
    margin-bottom: 14px;
    box-sizing: border-box;
    font-family: monospace;
}
.wb-settings-modal input:focus {
    outline: none;
    border-color: var(--wb-call-green);
}
.wb-settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
}
.wb-settings-row span {
    font-size: 13px;
}

/* Toggle switch */
.wb-toggle {
    position: relative;
    width: 44px;
    height: 24px;
    cursor: pointer;
}
.wb-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
}
.wb-toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--wb-border);
    border-radius: 24px;
    transition: background 0.2s;
}
.wb-toggle-slider::before {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    left: 3px;
    bottom: 3px;
    background: var(--wb-text);
    border-radius: 50%;
    transition: transform 0.2s;
}
.wb-toggle input:checked + .wb-toggle-slider {
    background: var(--wb-call-green);
}
.wb-toggle input:checked + .wb-toggle-slider::before {
    transform: translateX(20px);
}

/* Buttons in settings */
.wb-btn {
    padding: 6px 14px;
    border-radius: 4px;
    border: 1px solid var(--wb-border);
    background: var(--wb-accent);
    color: var(--wb-text);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
    font-family: Arial, sans-serif;
}
.wb-btn:hover {
    background: var(--wb-call-green);
    color: #fff;
}
.wb-btn-danger {
    background: var(--wb-call-red);
}
.wb-btn-danger:hover {
    background: #c0392b;
}
.wb-btn-sm {
    padding: 3px 8px;
    font-size: 11px;
}
.wb-settings-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 18px;
}

/* Connection status indicator */
.wb-connection-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    margin-bottom: 14px;
    padding: 6px 10px;
    border-radius: 4px;
    background: var(--wb-bg-secondary);
}
.wb-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
}
.wb-status-dot.connected    { background: var(--wb-call-green); }
.wb-status-dot.disconnected { background: var(--wb-call-red); }
.wb-status-dot.connecting   { background: var(--wb-idle-yellow); animation: wb-pulse 1s ease-in-out infinite; }

/* ----- Chain monitor bar (fixed at top) ----- */
.wb-chain-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999999 !important;
    padding: 8px 16px;
    background: linear-gradient(135deg, var(--wb-bg) 0%, var(--wb-accent) 100%);
    color: var(--wb-text);
    font-family: Arial, sans-serif;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 2px solid var(--wb-border);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: background 0.3s;
}
.wb-chain-bar.wb-chain-safe {
    border-bottom-color: var(--wb-call-green);
}
.wb-chain-bar.wb-chain-approaching {
    border-bottom-color: var(--wb-idle-yellow);
    background: linear-gradient(135deg, #2d2a0e 0%, #3b3a0c 100%);
}
.wb-chain-bar.wb-chain-imminent {
    border-bottom-color: var(--wb-bonus-warning);
    background: linear-gradient(135deg, #2e0f0f 0%, #4a1010 100%);
}
/* v5.1.63: the imminent glow pulses via a pseudo-element's OPACITY, not via
   box-shadow on the bar itself. box-shadow cannot be GPU-composited, so
   animating it forced a full repaint every frame (~60fps) for the entire time
   a chain was imminent — i.e. exactly when the phone is awake and being
   watched. Opacity animates on the compositor, so the same pulse is
   effectively free. Keep it this way; do not animate box-shadow/filter here. */
.wb-chain-bar.wb-chain-imminent::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: 0 0 20px rgba(255,118,117,0.7);
    animation: wb-chain-pulse 0.6s ease-in-out infinite alternate;
    will-change: opacity;
}
.wb-chain-section {
    display: flex;
    align-items: center;
    gap: 8px;
}
.wb-chain-count {
    font-weight: bold;
    font-size: 16px;
}
.wb-chain-timeout {
    font-family: monospace;
    font-size: 14px;
}
.wb-chain-bonus {
    padding: 2px 8px;
    border-radius: 3px;
    background: var(--wb-bonus-warning);
    color: #000;
    font-weight: bold;
    font-size: 11px;
    text-transform: uppercase;
}
.wb-chain-bar .wb-chain-minimize {
    cursor: pointer;
    font-size: 16px;
    opacity: 0.7;
    transition: opacity 0.15s;
}
.wb-chain-bar .wb-chain-minimize:hover {
    opacity: 1;
}

/* ----- Standalone Next Up bar (replaces chain bar) ----- */
.wb-next-up-standalone {
    padding: 6px 12px;
    background: var(--wb-bg);
    border-bottom: 1px solid var(--wb-border);
    font-family: Arial, sans-serif;
}
.wb-next-up-standalone:empty,
.wb-next-up-standalone .wb-next-up:empty {
    display: none;
}

/* ----- Next Up queue ----- */
.wb-next-up {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--wb-text);
    opacity: 0.85;
}
.wb-next-up-label {
    font-weight: 600;
    color: var(--wb-idle-yellow);
    white-space: nowrap;
}
.wb-next-up-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(255,255,255,0.06);
    border-radius: 3px;
    padding: 2px 6px;
    white-space: nowrap;
}
.wb-next-up-item .wb-next-timer {
    font-family: monospace;
    color: #e74c3c;
    font-weight: 700;
}
.wb-next-up-item.wb-next-imminent {
    background: rgba(214,48,49,0.2);
    animation: wb-pulse 1s ease-in-out infinite;
}
.wb-next-up-item.wb-next-imminent .wb-next-timer {
    color: #ff4444;
}
.wb-next-up-call {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid var(--wb-call-blue);
    background: transparent;
    color: var(--wb-call-blue);
    cursor: pointer;
    line-height: 1.2;
    margin-left: 2px;
}
.wb-next-up-call:hover {
    background: var(--wb-call-blue);
    color: #fff;
}

/* ----- FactionOps cell container — right-aligned in each row ----- */
/* War-page call markers. The row is tinted and striped rather than given
   another cell: .wb-cell-container floats over the RIGHT edge of a row, which
   on a phone is exactly where Torn puts its Attack link, so a badge there
   covers the control people are trying to tap. */
/* The member cell is FULL -- the FFS banner image, the name overlaid on it,
   and the stat estimate all live there, so a badge dropped in gets covered
   and clipped. The row itself carries the signal instead: a thick stripe and
   a tint strong enough to read on a dark theme, plus a full-width caption
   line under the row for the caller's name, which cannot collide with
   anything because it is on its own line. */
.fo-called-row {
    background: rgba(225,112,85,0.26) !important;
    box-shadow: inset 6px 0 0 #e17055;
}
.fo-called-row.fo-called-mine {
    background: rgba(0,184,148,0.26) !important;
    box-shadow: inset 6px 0 0 #00b894;
}
/* The control OVERLAYS the score rather than sitting beside it. During a war
   that number is 0.00 for nearly everyone, so covering it costs almost
   nothing -- and it keeps the row exactly as tall as its neighbours, which
   stacking did not.
   One element carries every state, so there is no second label to align and
   no ambiguity about which row a caller's name belongs to. */
.fo-call-host { position: relative; }

/* Call control, in the Score column (div.points___). That cell holds one
   short number and is the only one on the row with room to spare -- the
   member cell is full of the FFS banner and the right edge is the Attack
   link. */
.fo-wp-call {
    /* Layered and hit-testable. It rendered ON TOP of the score rather than
       under it, which means something in that cell was taking the clicks --
       a button you can see but cannot press is worse than no button. */
    position: absolute; inset: 0; z-index: 40; pointer-events: auto;
    display: flex; align-items: center; justify-content: center;
    padding: 0 2px; box-sizing: border-box;
    /* Fully opaque. At 86% the score bled through behind the label, and on a
       tinted row the row colour came through too. */
    border: 1px solid rgba(225,112,85,.7);
    background: #171310; color: #ff9a72;
    font-size: 10px; font-weight: 700; letter-spacing: .03em;
    text-align: center; cursor: pointer; line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.fo-wp-call:hover { background: #241a15; }
/* DROP sat as dark green on a translucent green panel over an already-green
   row -- three greens fighting, and unreadable. Dark panel, bright text. */
.fo-wp-call.fo-wp-call-drop {
    border-color: rgba(0,184,148,.75); background: #0c1a17; color: #2fe6bb;
}
.fo-wp-call.fo-wp-call-drop:hover { background: #123028; }
/* Stats range bar above Torn's enemy list. Same palette as the call button
   so the two additions read as one thing rather than two scripts. */
/* War-page settings popover. Deliberately not the overlay's centred, page
   dimming modal -- this one hangs off the gear and stays out of the way, so
   the two are never mistaken for each other even at a glance.
   No backticks anywhere in here: this stylesheet is a JS template literal. */
.fo-wp-panel {
    position: absolute; z-index: 2147483000; width: 244px;
    box-sizing: border-box; padding: 10px;
    border: 1px solid rgba(225,112,85,.5); border-radius: 6px;
    background: #14100e; color: #ffd9c9;
    box-shadow: 0 8px 26px rgba(0,0,0,.6);
    font-size: 12px; line-height: 1.35;
}
.fo-wp-prow { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; }
.fo-wp-pstat { font-size: 11px; }
.fo-wp-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; background: #b2bec3; }
.fo-wp-dot.ok { background: #00b894; }
.fo-wp-dot.warn { background: #ffd166; }
.fo-wp-dot.bad { background: #ff7675; }
.fo-wp-sub { margin-left: auto; font-size: 10px; font-weight: 700; }
.fo-wp-sub.ok { color: #00b894; }
.fo-wp-sub.warn { color: #ffd166; }
.fo-wp-sub.bad { color: #ff7675; }
.fo-wp-sub.muted { color: #8a6a5e; }
.fo-wp-plabel {
    display: block; margin: 2px 0 4px; font-size: 10px; font-weight: 700;
    letter-spacing: .06em; text-transform: uppercase; color: #ff9a72;
}
.fo-wp-pin {
    flex: 1 1 auto; min-width: 0; padding: 5px 6px; box-sizing: border-box;
    border: 1px solid rgba(225,112,85,.35); border-radius: 3px;
    background: rgba(0,0,0,.35); color: #ffd9c9;
    font-family: monospace; font-size: 11px;
}
.fo-wp-pin:focus { outline: none; border-color: rgba(225,112,85,.8); }
.fo-wp-pbtn, .fo-wp-pfull {
    padding: 5px 9px; cursor: pointer; white-space: nowrap;
    border: 1px solid rgba(225,112,85,.4); border-radius: 3px;
    background: rgba(0,0,0,.35); color: #ff9a72;
    font-size: 11px; font-weight: 700;
}
.fo-wp-pbtn:hover, .fo-wp-pfull:hover { background: #241a15; }
.fo-wp-pfull { width: 100%; margin-top: 4px; }
.fo-wp-pnote { min-height: 13px; margin: -3px 0 6px; font-size: 10px; color: #8a6a5e; }
/* A rule with a word on it, same device as the settings group headings. */
.fo-wp-psep {
    display: flex; align-items: center; gap: 7px;
    margin: 10px 0 6px; font-size: 10px; font-weight: 700;
    letter-spacing: .07em; text-transform: uppercase; color: #ff9a72; opacity: .8;
}
.fo-wp-psep::after {
    content: ''; flex: 1 1 auto; height: 1px; background: currentColor; opacity: .3;
}
/* The whole row is the label, so the tap target is the row not the box. */
.fo-wp-ptog { cursor: pointer; justify-content: space-between; }
.fo-wp-ptog input { margin: 0; cursor: pointer; flex: 0 0 auto; }


/* Settings section headings. The panel had 48 controls, one title and two
   <hr>s -- no way to navigate it except reading every row. */
.wb-sgroup {
    display: flex; align-items: center; gap: 8px;
    margin: 18px 0 8px; font-size: 11px; font-weight: 700;
    letter-spacing: .08em; text-transform: uppercase;
    color: var(--wb-accent, #e17055); opacity: .85;
}
.wb-sgroup:first-of-type { margin-top: 10px; }
.wb-sgroup span { flex: 0 0 auto; }
/* The rule runs to the right of the label, so the eye catches the break
   without another element to lay out. */
.wb-sgroup::after {
    content: ''; flex: 1 1 auto; height: 1px;
    background: currentColor; opacity: .28;
}

.fo-wp-filter {
    /* width:0 + min-width:100% is not a trick for its own sake — it is what
       keeps this bar from widening the column it sits in.
       Torn's war page floats the enemy list left and your own faction right
       inside a 784px wrapper, and a float is shrink-to-fit: it takes its
       contents' PREFERRED width when that fits. This bar's preferred width is
       everything on one line, 417px, so the enemy column grew from 387 to 417,
       417 + 386 no longer fitted in 784, and your faction's column dropped
       below the enemy's — 3,466px down the page. flex-wrap was already on and
       did not help: wrapping lowers a box's minimum width, never its preferred
       one. A declared width of zero contributes nothing to that calculation,
       and min-width:100% then fills whatever width the LIST settled on. */
    width: 0; min-width: 100%;
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    margin: 4px 0 6px; padding: 5px 8px; box-sizing: border-box;
    border: 1px solid rgba(225,112,85,.45); border-radius: 4px;
    background: #171310; color: #ff9a72;
    font-size: 11px; font-weight: 700; letter-spacing: .03em;
}
.fo-wp-filter-label { text-transform: uppercase; opacity: .85; }
.fo-wp-filter-dash { opacity: .6; }
.fo-wp-filter-in {
    width: 62px; min-width: 0; padding: 4px 6px; box-sizing: border-box;
    border: 1px solid rgba(225,112,85,.35); border-radius: 3px;
    background: rgba(0,0,0,.35); color: #ffd9c9;
    font-family: inherit; font-size: 11px; font-variant-numeric: tabular-nums;
}
.fo-wp-filter-in:focus { outline: none; border-color: rgba(225,112,85,.8); }
.fo-wp-filter-in::placeholder { color: #8a6a5e; }
/* 28px so it stays a real thumb target on a phone. */
.fo-wp-filter-clear {
    min-width: 28px; height: 28px; padding: 0 6px; cursor: pointer;
    border: 1px solid rgba(225,112,85,.35); border-radius: 3px;
    background: rgba(0,0,0,.35); color: #ff9a72;
    font-size: 12px; line-height: 1;
}
.fo-wp-filter-clear:hover { background: #241a15; }
/* Only speaks up when the filter is actually removing somebody. */
/* Hospital countdown in Torn's own status cell. Sits alongside whatever else
   is in there (the FFS banner puts its own chip there) rather than fighting
   another script for the same node. */

.fo-wp-filter-chk {
    display: flex; align-items: center; gap: 4px; cursor: pointer;
    text-transform: none; letter-spacing: 0; font-weight: 600; color: #ffd9c9;
}
.fo-wp-filter-chk input { margin: 0; cursor: pointer; }
/* Pushed to the far right by the count's margin-left:auto when a filter is
   hiding rows, and by its own when nothing is. 28px keeps it a thumb target. */
.fo-wp-filter-gear {
    margin-left: auto; min-width: 28px; height: 28px; padding: 0 6px;
    border: 1px solid rgba(225,112,85,.35); border-radius: 3px;
    background: rgba(0,0,0,.35); color: #ff9a72;
    font-size: 14px; line-height: 1; cursor: pointer;
}
.fo-wp-filter-gear:hover { background: #241a15; }
.fo-wp-filter-count + .fo-wp-filter-gear { margin-left: 6px; }
.fo-wp-filter-count { margin-left: auto; font-weight: 700; color: #8a6a5e; }
.fo-wp-filter-count.is-on { color: #ffd166; }
.fo-wp-call.fo-wp-call-taken {
    border-color: rgba(225,112,85,.45); background: #171310;
    color: #f0b39f; cursor: default;
}

.wb-cell-container {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    gap: 6px;
    align-items: center;
    z-index: 5;
    flex-shrink: 0;
}

/* Ensure rows have room for our right-aligned cells */

/* ----- Call / Status elements in member rows ----- */
.wb-cell {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
    font-family: Arial, sans-serif;
    font-size: 11px;
    vertical-align: middle;
}
/* Attack button */
.wb-attack-btn {
    padding: 2px 10px;
    border-radius: 12px;
    border: 1px solid var(--wb-call-red);
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, transform 0.1s;
    font-family: Arial, sans-serif;
    white-space: nowrap;
    background: rgba(225,112,85,0.15);
    color: var(--wb-call-red);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
}
.wb-attack-btn:hover {
    background: var(--wb-call-red);
    color: #fff;
    transform: scale(1.05);
}

.wb-call-btn {
    padding: 2px 10px;
    border-radius: 12px;
    border: 1px solid var(--wb-border);
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, transform 0.1s;
    font-family: Arial, sans-serif;
    white-space: nowrap;
}
.wb-call-btn {
    background: rgba(9,132,227,0.15);
    color: var(--wb-call-blue);
    border-color: var(--wb-call-blue);
}
.wb-call-btn:hover {
    background: var(--wb-call-blue);
    color: #fff;
    transform: scale(1.05);
}
.wb-call-btn.wb-called-self {
    background: var(--wb-call-green);
    color: #fff;
    font-weight: bold;
}
.wb-call-btn.wb-called-other {
    background: rgba(225,112,85,0.15);
    color: var(--wb-call-red);
    border-color: var(--wb-call-red);
    cursor: default;
}
.wb-uncall-btn {
    padding: 2px 8px;
    border-radius: 12px;
    border: 1px solid var(--wb-call-red);
    background: transparent;
    color: var(--wb-call-red);
    font-size: 10px;
    cursor: pointer;
    margin-left: 4px;
    transition: background 0.15s;
    font-family: Arial, sans-serif;
}
.wb-uncall-btn:hover {
    background: var(--wb-call-red);
    color: #fff;
}

/* Priority tag badges */
.wb-priority-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 9px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    font-family: Arial, sans-serif;
    cursor: default;
}
.wb-priority-high {
    background: rgba(214,48,49,0.2);
    color: var(--wb-hospital-red);
    border: 1px solid rgba(214,48,49,0.4);
}
.wb-priority-medium {
    background: rgba(253,203,110,0.15);
    color: var(--wb-idle-yellow);
    border: 1px solid rgba(253,203,110,0.3);
}
.wb-priority-low {
    background: rgba(9,132,227,0.15);
    color: var(--wb-travel-blue);
    border: 1px solid rgba(9,132,227,0.3);
}
/* Priority selector (leader only) */
.wb-priority-select {
    padding: 1px 4px;
    border-radius: 10px;
    border: 1px solid var(--wb-border);
    background: var(--wb-bg-secondary);
    color: var(--wb-text);
    font-size: 9px;
    font-family: Arial, sans-serif;
    cursor: pointer;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    text-align: center;
    min-width: 52px;
}
.wb-priority-select:focus {
    border-color: var(--wb-call-green);
}
.wb-priority-select option {
    background: var(--wb-bg);
    color: var(--wb-text);
}

/* Status badges */
.wb-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: bold;
    white-space: nowrap;
    font-family: Arial, sans-serif;
}
.wb-status-ok       { background: rgba(0,184,148,0.15); color: var(--wb-call-green); }
.wb-status-hospital { background: rgba(214,48,49,0.15); color: var(--wb-hospital-red); }
.wb-status-travel   { background: rgba(9,132,227,0.15); color: var(--wb-travel-blue); }
.wb-status-jail     { background: rgba(99,110,114,0.15); color: var(--wb-jail-gray); }

/* Online activity dot */
.wb-activity-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 3px;
    flex-shrink: 0;
}
.wb-activity-online  { background: var(--wb-online-green); }
.wb-activity-idle    { background: var(--wb-idle-yellow); }
.wb-activity-offline { background: var(--wb-offline-gray); }

/* Row highlights */
.wb-row-called {
    background: rgba(0,184,148,0.06) !important;
}

/* ----- Group attack / viewers indicator ----- */
.wb-viewers-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: rgba(108,92,231,0.2);
    border: 1px solid rgba(108,92,231,0.4);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
    font-weight: 600;
    color: #a29bfe;
    white-space: nowrap;
    animation: wb-pulse 1.5s ease-in-out infinite;
}
.wb-viewers-badge.wb-viewers-multi {
    background: rgba(214,48,49,0.2);
    border-color: rgba(214,48,49,0.5);
    color: #ff7675;
}

/* ----- BSP / FFS stat display ----- */
.wb-bsp-cell {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    min-width: 48px;
    font-family: monospace;
}
.wb-bsp-value {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
    line-height: 1.2;
}
.wb-bsp-value.wb-bsp-tier-s {
    color: var(--wb-call-red);
}
.wb-bsp-value.wb-bsp-tier-a {
    color: var(--wb-idle-yellow);
}
.wb-bsp-value.wb-bsp-tier-b {
    color: var(--wb-call-green);
}
.wb-bsp-value.wb-bsp-tier-c {
    color: var(--wb-text-muted);
}
.wb-bsp-value.wb-bsp-tier-unknown {
    color: var(--wb-jail-gray);
    font-weight: 400;
}
.wb-bsp-source {
    font-size: 7px;
    font-weight: 400;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.45;
    line-height: 1;
}

/* ----- Attack page overlay ----- */
.wb-attack-overlay {
    position: fixed;
    top: 60px;
    right: 16px;
    z-index: 999997;
    background: var(--wb-bg);
    border: 1px solid var(--wb-border);
    border-radius: 8px;
    padding: 12px 16px;
    color: var(--wb-text);
    font-family: Arial, sans-serif;
    font-size: 12px;
    min-width: 200px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.wb-attack-overlay h4 {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--wb-call-green);
}
.wb-attack-overlay .wb-attack-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
}
#wb-assist-btn {
    position: fixed;
    bottom: 72px;
    right: 14px;
    z-index: 9999999 !important;
    background: linear-gradient(135deg, #ff6b52, #e03a3a);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 6px 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Open Sans", Arial, sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(214, 48, 49, 0.35), inset 0 1px 0 rgba(255,255,255,0.12);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
}
#wb-assist-btn .wb-assist-icon {
    width: 12px;
    height: 12px;
    display: inline-block;
    vertical-align: middle;
    flex-shrink: 0;
    filter: drop-shadow(0 1px 0 rgba(0,0,0,0.25));
}
#wb-assist-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(214, 48, 49, 0.5), inset 0 1px 0 rgba(255,255,255,0.18);
}
#wb-assist-btn:active {
    transform: translateY(0);
    box-shadow: 0 1px 4px rgba(214, 48, 49, 0.4), inset 0 1px 0 rgba(0,0,0,0.12);
}
#wb-assist-btn:disabled {
    background: linear-gradient(135deg, #4a5258, #2d3436);
    color: #b0b8bc;
    border-color: rgba(255,255,255,0.04);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    cursor: not-allowed;
    transform: none;
}

/* ----- Animations ----- */
@keyframes wb-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.5; }
}
@keyframes wb-chain-pulse {
    from { opacity: 0.35; }
    to   { opacity: 1; }
}

/* Ensure Torn content doesn't sit under our chain bar */
body.wb-chain-active {
    padding-top: 42px !important;
}

/* ══════════════════════════════════════════════════════════════════════════
   FactionOps Full Overlay (fo- prefix)
   ══════════════════════════════════════════════════════════════════════════ */

/* ── War Board Container ── */
.fo-overlay {
    width: 100%;
    max-width: 1000px;
    background: var(--wb-bg);
    border: 1px solid var(--wb-border);
    border-radius: 10px;
    box-shadow:
        0 4px 24px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.03),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
    overflow: hidden;
    height: fit-content;
    /* Promote the overlay to its own compositor layer so page-level
       scroll becomes a cheap GPU transform instead of a full repaint. */
    transform: translateZ(0);
    will-change: transform;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
    line-height: 1.5;
    color: var(--wb-text);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    margin: 10px auto;
    box-sizing: border-box;
}
.fo-overlay *, .fo-overlay *::before, .fo-overlay *::after { box-sizing: border-box; }

/* ── Header Bar ── */
.fo-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--wb-bg-secondary);
    border-bottom: 1px solid var(--wb-border);
    gap: 4px 10px;
}

.fo-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 1;
    min-width: 0;
    overflow: visible;
}

.fo-header-center {
    flex: 0 0 100%;
    justify-content: center;
    order: 10;
}

.fo-logo-mark {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    padding: 2px 4px;
    border-radius: 4px;
    transition: background 0.15s ease;
    /* Same click-landing treatment as the Shout button and Cooldowns
       header — Torn's #mainContainer occasionally nulls pointer-events
       on descendants, so lock them in and force this element above the
       default stacking context. */
    pointer-events: auto !important;
    touch-action: manipulation;
    position: relative;
    z-index: 2;
}
.fo-logo-mark * { pointer-events: none; }
.fo-logo-mark:hover { background: rgba(255,255,255,0.06); }
.fo-logo-mark:active { background: rgba(255,255,255,0.12); }

.fo-logo-icon { width: 20px; height: 20px; }

.fo-logo-text {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--wb-text);
    white-space: nowrap;
}

.fo-status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #00b894;
    box-shadow: 0 0 6px rgba(0,184,148,0.6);
    animation: fo-pulse-glow 2s ease-in-out infinite;
    flex-shrink: 0;
}
.fo-status-dot.disconnected {
    background: #e17055;
    box-shadow: 0 0 6px rgba(225,112,85,0.6);
}

@keyframes fo-pulse-glow {
    0%, 100% { box-shadow: 0 0 6px rgba(0,184,148,0.4); }
    50% { box-shadow: 0 0 10px rgba(0,184,148,0.8); }
}

.fo-header-center {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--wb-text-muted);
    white-space: nowrap;
    /* flex/order/width set in .fo-header > .fo-header-center rule above */
}

.fo-header-center strong { color: var(--wb-text); font-weight: 600; }

.fo-war-badge {
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em;
    padding: 2px 6px; border-radius: 4px;
    background: rgba(225,112,85,0.15);
    color: #e17055;
    border: 1px solid rgba(225,112,85,0.25);
}

.fo-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 1;
    flex-wrap: nowrap;
    overflow: visible;
}

.fo-online-badge {
    display: flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 500;
    color: #00b894;
    background: rgba(0,184,148,0.1);
    border: 1px solid rgba(0,184,148,0.2);
    padding: 3px 8px; border-radius: 20px;
}

.fo-online-badge .fo-dot {
    width: 6px; height: 6px;
    border-radius: 50%; background: #00b894;
}

/* ── Torn native chain bar in header ── */
.fo-torn-chain {
    display: flex;
    align-items: center;
    flex-shrink: 0;
}
.fo-torn-chain #barChain,
.fo-torn-chain a#barChain,
.fo-torn-chain [id="barChain"] {
    display: flex !important;
    visibility: visible !important;
    opacity: 1 !important;
    position: relative !important;
    width: auto !important;
    min-width: 160px;
    max-width: 260px;
    height: auto !important;
    min-height: 20px;
    border-radius: 12px;
    overflow: visible !important;
    background: rgba(44,62,80,0.6) !important;
    padding: 2px 10px !important;
    align-items: center;
    gap: 4px;
}
.fo-torn-chain #barChain p,
.fo-torn-chain #barChain span {
    display: inline !important;
    visibility: visible !important;
    opacity: 1 !important;
    position: relative !important;
    font-size: 11px !important;
    line-height: 18px !important;
    color: #dfe6e9 !important;
    white-space: nowrap !important;
}
/* Make the timer text stand out */
.fo-torn-chain #barChain p[class*="bar-timeleft"] {
    color: #fdcb6e !important;
    font-weight: 600 !important;
}
/* Make the chain count stand out */
.fo-torn-chain #barChain p[class*="bar-stats"] {
    color: #00b894 !important;
    font-weight: 700 !important;
}
/* Energy bar display in overlay header */
.fo-energy-display {
    display: flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 600;
    padding: 3px 10px; border-radius: 20px;
    background: rgba(44,62,80,0.7);
    border: 1px solid rgba(116,185,255,0.25);
    white-space: nowrap;
    cursor: default;
}
.fo-energy-label { color: rgba(255,255,255,0.45); font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
.fo-energy-value { color: #74b9ff; font-weight: 700; font-variant-numeric: tabular-nums; }
.fo-energy-value.full { color: #55efc4; }
.fo-energy-timer { color: #fdcb6e; font-size: 10px; font-weight: 500; font-variant-numeric: tabular-nums; }

/* Live chain count + timer display */
.fo-chain-live {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 600;
    padding: 3px 12px; border-radius: 20px;
    background: rgba(44,62,80,0.7);
    border: 1px solid rgba(0,184,148,0.25);
    white-space: nowrap;
}
.fo-chain-live-count { color: #00b894; font-weight: 700; }
.fo-chain-live-sep { color: rgba(255,255,255,0.3); font-weight: 400; }
.fo-chain-live-timer { color: #fdcb6e; font-weight: 600; font-variant-numeric: tabular-nums; }
.fo-chain-live-timer.danger { color: #e17055; animation: fo-pulse 0.6s infinite alternate; }
.fo-chain-live-bonus { color: #e17055; font-weight: 700; font-size: 10px; margin-left: 2px; }
@keyframes fo-pulse { from { opacity: 1; } to { opacity: 0.4; } }

/* Ranked war timer (estimated time to target drop win) */
.fo-war-timer {
    display: flex; align-items: center; gap: 3px;
    font-size: 11px; font-weight: 600;
    padding: 3px 8px; border-radius: 20px;
    flex-shrink: 0;
    background: rgba(108,92,231,0.15);
    border: 1px solid rgba(108,92,231,0.3);
    white-space: nowrap;
    cursor: pointer;
    /* Ensure clicks land — same treatment that fixed the Shout button
       when the overlay lives inside #mainContainer. */
    pointer-events: auto !important;
    touch-action: manipulation;
    isolation: isolate;
    /* Above .fo-broadcast-entry-bar (z-index:10): isolation seals this chip's
       stacking context, so the absolutely-positioned detail tooltip inside it
       can't rise on its own z-index — lifting the whole chip is what puts the
       tooltip over the Shout bar on narrow leader layouts (was hidden behind). */
    z-index: 20;
}
.fo-war-timer-icon { font-size: 12px; }
.fo-war-timer-label { opacity: 0.6; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.fo-war-timer-value { font-variant-numeric: tabular-nums; font-weight: 700; }
.fo-war-timer.safe .fo-war-timer-value { color: #00b894; }
.fo-war-timer.warning .fo-war-timer-value { color: #fdcb6e; }
.fo-war-timer.danger .fo-war-timer-value { color: #e17055; animation: fo-pulse 0.6s infinite alternate; }
.fo-war-timer.waiting .fo-war-timer-value { color: #e17055; font-size: 10px; }
.fo-war-timer { position: relative; }
.fo-war-timer-detail {
    display: none; position: absolute; top: calc(100% + 6px); left: 0;
    background: #1e272e !important; border: 1px solid rgba(108,92,231,0.4);
    border-radius: 8px; padding: 10px 14px; min-width: 200px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 9999;
    font-size: 11px; font-weight: 400; white-space: normal; color: #dfe6e9 !important;
}
.fo-war-timer-detail.open { display: block; }
.fo-war-timer-detail-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
.fo-war-timer-detail-label { color: rgba(255,255,255,0.5) !important; }
.fo-war-timer-detail-val { color: #dfe6e9 !important; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }

/* Fallback: custom chain info when Torn bar not found */
.fo-chain-info {
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; font-weight: 500;
    padding: 3px 10px; border-radius: 20px;
    background: rgba(0,184,148,0.1);
    border: 1px solid rgba(0,184,148,0.2);
    color: var(--wb-text);
}
.fo-chain-info .fo-chain-label { opacity: 0.6; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.fo-chain-info .fo-chain-count { color: #00b894; font-weight: 700; }
.fo-chain-info .fo-chain-timeout { color: #fdcb6e; font-weight: 600; }
.fo-chain-info .fo-chain-timeout.danger { color: var(--wb-hospital-red); }
.fo-chain-info .fo-chain-bonus { color: var(--wb-bonus-warning); font-weight: 700; font-size: 10px; }

/* ── Settings button in header ── */
.fo-settings-btn {
    width: 28px; height: 28px; border-radius: 50%;
    background: rgba(99,110,114,0.2);
    border: 1px solid rgba(99,110,114,0.3);
    color: #b0b0c0; font-size: 15px;
    cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    transition: all 0.15s ease; padding: 0; line-height: 1;
}
.fo-settings-btn:hover {
    background: rgba(99,110,114,0.35);
    color: var(--wb-text);
}

/* ── Next Up bar (inside overlay) ── */
.fo-next-up-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 12px;
    background: var(--wb-accent-15);
    border-bottom: 1px solid rgba(45,52,54,0.4);
    font-size: 11px; min-height: 0;
    overflow-x: auto; overflow-y: hidden;
    white-space: nowrap;
}
.fo-next-up-bar:empty { display: none; }
.fo-turtle-bar {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 5px 10px; font-size: 11px;
    background: rgba(214,48,49,0.10);
    border-bottom: 1px solid rgba(214,48,49,0.25);
}
.fo-turtle-bar:empty { display: none; }
.fo-turtle-label {
    opacity: 0.75; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--wb-hospital-red); font-weight: 700;
}
.fo-turtle-item { display: inline-flex; align-items: center; gap: 5px; }
.fo-turtle-item a { text-decoration: none; color: var(--wb-text); font-weight: 600; }
.fo-turtle-item a:hover { text-decoration: underline; }
.fo-turtle-cost { color: var(--wb-hospital-red); font-weight: 600; }
.fo-next-up-label {
    font-weight: 600; color: #fdcb6e;
    white-space: nowrap; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.05em;
}
.fo-next-up-item {
    display: inline-flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(45,52,54,0.5);
    border-radius: 14px; padding: 2px 8px;
    white-space: nowrap; font-size: 11px; color: #b0b0c0;
}
.fo-next-up-item a { text-decoration: none; color: var(--wb-text); font-weight: 500; }
.fo-next-up-timer {
    font-family: 'JetBrains Mono', monospace;
    color: #e74c3c; font-weight: 700; font-size: 10px;
}
.fo-next-up-item.imminent {
    background: rgba(214,48,49,0.15);
    border-color: rgba(214,48,49,0.3);
}
.fo-next-up-item.imminent .fo-next-up-timer {
    color: #ff4444;
}
.fo-next-up-call {
    font-size: 8px; font-weight: 700;
    padding: 1px 5px; border-radius: 10px;
    border: 1px solid rgba(0,184,148,0.35);
    background: transparent; color: #00b894;
    cursor: pointer; line-height: 1.2;
}
.fo-next-up-call:hover {
    background: rgba(0,184,148,0.15);
}

/* ── Activate FactionOps button (compact pill, left-aligned) ── */
#fo-activate-btn {
    position: fixed !important;
    top: 38px !important;
    left: 10px !important;
    z-index: 99999 !important;
    display: flex !important; align-items: center !important; gap: 4px !important;
    padding: 4px 10px !important;
    font-family: Arial, sans-serif !important;
    font-size: 11px !important; font-weight: 600 !important;
    border: 1px solid #555 !important;
    border-radius: 12px !important;
    background: rgba(30,30,30,0.9) !important; color: #e0e0e0 !important;
    cursor: pointer !important; transition: all 0.2s ease !important;
    white-space: nowrap !important;
    box-sizing: border-box !important;
}
#fo-activate-btn:hover {
    background: rgba(50,50,50,0.95) !important;
    border-color: #777 !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
}
#fo-activate-btn .fo-activate-icon {
    font-size: 12px; line-height: 1;
}

/* ── Sort bar (above col headers) ── v5.0.14, v5.1.2 wrap-on-narrow ── */
.fo-sort-bar {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 12px; background: var(--wb-accent-20);
    border-bottom: 1px solid var(--wb-border);
    font-size: 11px;
    flex-wrap: wrap;  /* v5.1.2: wrap stats filter to a second row when too narrow */
    row-gap: 4px;
}
.fo-sort-label { color: #636e72; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; font-size: 10px; }
.fo-sort-select {
    background: var(--wb-bg-secondary); color: var(--wb-text);
    border: 1px solid var(--wb-border); border-radius: 4px;
    padding: 3px 6px; font: inherit; font-size: 11px; cursor: pointer;
}
.fo-sort-select:hover { border-color: rgba(99,110,114,0.6); }
.fo-sort-select option { background: var(--wb-bg-secondary); color: var(--wb-text); }
.fo-stats-filter-input {
    background: var(--wb-bg-secondary); color: var(--wb-text);
    border: 1px solid var(--wb-border); border-radius: 4px;
    padding: 3px 5px; font: inherit; font-size: 11px;
    width: 48px; text-align: right; min-width: 0;
}
.fo-stats-filter-input:focus { outline: 0; border-color: var(--wb-accent); }
.fo-stats-filter-clear {
    background: none; color: #636e72; border: 0; cursor: pointer;
    font-size: 12px; padding: 0 4px; line-height: 1;
}
.fo-stats-filter-clear:hover { color: var(--wb-text); }
/* The personal-key controls borrow .fo-stats-filter-clear for its flat look,
   but that class is a ~12px-tall box built for a ✕ under a mouse cursor. On a
   360px phone the key button lands within a few px of the filter's ✕ and the
   'Hide online' checkbox, so a thumb miss wipes the stats filter or hides every
   online target mid-war. Give the three NEW controls a real touch box. (The
   pre-existing #fo-stats-filter-clear has the same flaw and is left alone —
   not part of this change.) */
#fo-myffs-btn, #fo-myffs-save, #fo-myffs-clear {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: auto;
    padding: 0 10px;
    letter-spacing: 0;
    text-transform: none;
}
.fo-stats-filter-hint {
    color: #636e72; font-size: 10px; margin-left: 6px;
}
.fo-stats-filter-hint.active { color: var(--wb-accent); font-weight: 600; }

/* ── Column labels ── v5.0.14: 8 → 7 cols (Prior. dropped) ── */
.fo-col-headers {
    display: grid;
    grid-template-columns: 1fr 52px 82px 130px 44px 180px 72px;
    gap: 0; padding: 7px 16px;
    background: var(--wb-accent-20);
    border-bottom: 1px solid var(--wb-border);
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: #636e72; user-select: none;
}

.fo-col-header { padding: 0 4px; white-space: nowrap; }
.fo-col-header.center { text-align: center; }
.fo-col-header.right { text-align: right; }

/* ── Target Rows ── */
.fo-target-list { list-style: none; margin: 0; padding: 0; }

.fo-row {
    display: grid;
    grid-template-columns: 1fr 52px 82px 130px 44px 180px 72px;
    gap: 0; align-items: center;
    padding: 8px 16px;
    border-bottom: 1px solid rgba(45,52,54,0.5);
    background: var(--wb-bg);
    transition: background 0.15s ease;
    position: relative;
    /* Scroll performance: isolate each row's layout/paint and let the
       browser skip off-screen rows entirely while scrolling. */
    contain: layout style paint;
    content-visibility: auto;
    contain-intrinsic-size: auto 48px;
}

.fo-row.is-called::before {
    content: '';
    position: absolute; left: 0; top: 0; bottom: 0;
    width: 3px; border-radius: 0 2px 2px 0;
}

.fo-row:hover { background: var(--wb-accent-20); }
.fo-row:last-child { border-bottom: none; }

.fo-row.is-hospital,
.fo-row.is-jail,
.fo-row.is-travel { opacity: 0.5; }

.fo-row.is-hospital:hover,
.fo-row.is-jail:hover,
.fo-row.is-travel:hover { opacity: 0.7; }

.fo-row.is-called::before { background: #00b894; }
.fo-row.is-called { background: rgba(0,184,148,0.04); }

/* Enemy "just attacked" indicator — sits for 60s after the enemy is
   seen in their faction's attack feed. Yellow sword in the top-right. */
.fo-row.is-attacking::after {
    content: '⚔';
    position: absolute;
    right: 8px;
    top: 6px;
    font-size: 13px;
    color: #fdcb6e;
    text-shadow: 0 0 4px rgba(253,203,110,0.4);
    pointer-events: none;
    animation: fo-attacking-pulse 1.2s ease-in-out infinite alternate;
}
@keyframes fo-attacking-pulse {
    from { opacity: 0.6; }
    to   { opacity: 1; }
}

/* ── Cell styles ── */
.fo-cell { padding: 0 4px; display: flex; align-items: center; min-width: 0; overflow: hidden; }
.fo-cell.center { justify-content: center; }

.fo-priority-badge {
    font-size: 9px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase;
    padding: 2px 7px; border-radius: 4px;
    white-space: nowrap; line-height: 1.4;
}

.fo-priority-badge.high {
    background: rgba(225,112,85,0.15); color: #e17055;
    border: 1px solid rgba(225,112,85,0.3);
}
.fo-priority-badge.med {
    background: rgba(253,203,110,0.12); color: #fdcb6e;
    border: 1px solid rgba(253,203,110,0.25);
}
.fo-priority-badge.low {
    background: rgba(9,132,227,0.12); color: #0984e3;
    border: 1px solid rgba(9,132,227,0.25);
}

.fo-priority-select {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
    background: var(--wb-accent-30); color: var(--wb-text-muted);
    border: 1px solid rgba(45,52,54,0.8); border-radius: 4px;
    padding: 2px 4px; cursor: pointer; outline: none;
    -webkit-appearance: none; appearance: none;
    width: 50px; text-align: center;
}
.fo-priority-select:hover { border-color: rgba(99,110,114,0.6); }
.fo-priority-select option { background: var(--wb-bg-secondary); color: var(--wb-text); }

/* Player Name */
.fo-player-name { display: flex; flex-direction: column; gap: 0; min-width: 0; }

.fo-name-level {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 6px;
    background: rgba(255,255,255,0.06);
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    color: var(--wb-text-muted, #b2bec3);
    vertical-align: middle;
    line-height: 1.4;
    white-space: nowrap;
}

.fo-player-name .fo-name-row {
    display: flex; align-items: center; gap: 6px;
}

.fo-player-name .fo-name {
    font-weight: 600; font-size: 12.5px; color: var(--wb-text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.fo-player-name .fo-pid { font-size: 10px; color: #636e72; font-weight: 400; }
.fo-sub-row { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; }
.fo-bsp-inline {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px; font-weight: 600;
    padding: 1px 4px; border-radius: 8px;
    background: rgba(255,255,255,0.06);
    line-height: 1;
}
.fo-bsp-inline.tier-s { color: #e17055; }
.fo-bsp-inline.tier-a { color: #fdcb6e; }
.fo-bsp-inline.tier-b { color: #00b894; }
.fo-bsp-inline.tier-c { color: var(--wb-text-muted); }
.fo-bsp-inline.tier-unknown { color: #4a4a5a; }

/* ── Group Attack Eye Badge ── */
.fo-eye-badge {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 9px; font-weight: 600;
    color: #fdcb6e;
    background: rgba(253,203,110,0.12);
    border: 1px solid rgba(253,203,110,0.25);
    border-radius: 3px; padding: 1px 5px;
    white-space: nowrap; cursor: default; line-height: 1.3;
}

.fo-eye-badge .fo-eye-icon { font-size: 10px; line-height: 1; }

/* Level */
.fo-level {
    font-size: 11px; font-weight: 500; color: var(--wb-text-muted);
    text-align: center; white-space: nowrap;
}

/* BSP Stats */
.fo-bsp-stat {
    font-size: 11px; font-weight: 600; text-align: center;
    white-space: nowrap; letter-spacing: 0.02em;
}
.fo-bsp-stat.tier-s { color: #e17055; text-shadow: 0 0 8px rgba(225,112,85,0.3); }
.fo-bsp-stat.tier-a { color: #fdcb6e; }
.fo-bsp-stat.tier-b { color: #00b894; }
.fo-bsp-stat.tier-c { color: var(--wb-text-muted); }
.fo-bsp-stat.tier-unknown { color: #4a4a5a; font-weight: 400; font-style: italic; }

.fo-bsp-source {
    font-size: 8px; font-weight: 400;
    letter-spacing: 0.04em; text-transform: uppercase;
    opacity: 0.5; display: block; margin-top: 1px;
}

/* Fair Fight inline badge (sits in sub-row next to BSP) */
.fo-ff-inline {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px; font-weight: 700;
    padding: 1px 5px; border-radius: 8px;
    line-height: 1; white-space: nowrap;
    display: inline-block;
}

/* Personal FF score chip — nests inside .fo-ff-inline, background set inline
   from ffColor() so it uses FFScouter's own blue→green→red ramp. Only rendered
   for a member who set their own FFScouter key. */
.fo-ff-score {
    display: inline-block;
    margin-left: 4px;
    padding: 1px 4px;
    border-radius: 6px;
    color: #fff;
    font-weight: 700;
    text-shadow: 0 1px 1px rgba(0,0,0,0.45);
}

/* Status Pill */
.fo-status-pill {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    font-size: 11px; font-weight: 500;
    padding: 3px 10px; border-radius: 20px;
    white-space: nowrap; line-height: 1;
    /* v4.9.91: bumped floor again for a more prominent shape. */
    min-width: 116px;
}
.fo-status-pill .fo-s-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

.fo-status-pill.ok { background: rgba(0,184,148,0.1); color: #00b894; border: 1px solid rgba(0,184,148,0.2); }
.fo-status-pill.ok .fo-s-dot { background: #00b894; }
.fo-status-pill.hosp { background: rgba(225,112,85,0.1); color: #e17055; border: 1px solid rgba(225,112,85,0.2); }
.fo-status-pill.hosp .fo-s-dot { background: #e17055; }
.fo-status-pill.travel { background: rgba(9,132,227,0.1); color: #0984e3; border: 1px solid rgba(9,132,227,0.2); }
.fo-status-pill.travel .fo-s-dot { background: #0984e3; }
.fo-status-pill.jail { background: rgba(99,110,114,0.15); color: #b2bec3; border: 1px solid rgba(99,110,114,0.25); }
.fo-status-pill.jail .fo-s-dot { background: #636e72; }

/* Online indicator */
.fo-online-dot { width: 8px; height: 8px; border-radius: 50%; margin: 0 auto; }
.fo-online-dot.on { background: #4CAF50; box-shadow: 0 0 5px rgba(76,175,80,0.4); }
.fo-online-dot.idle { background: #fdcb6e; box-shadow: 0 0 5px rgba(253,203,110,0.3); }
.fo-online-dot.off { background: #636e72; }
.fo-rt-badge { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; letter-spacing: 0.04em; line-height: 1.3; display: none; }
.fo-rt-badge.rt { display: inline-block; background: rgba(0,184,148,0.18); color: #00b894; }
.fo-rt-badge.poll { display: inline-block; background: rgba(253,203,110,0.18); color: #fdcb6e; }

/* Call column */
.fo-call-cell { display: flex; align-items: center; gap: 4px; padding: 0 4px; min-width: 0; overflow: hidden; }

.fo-call-btn {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
    padding: 4px 10px; border-radius: 20px;
    border: 1px solid rgba(9,132,227,0.4);
    background: rgba(9,132,227,0.1); color: #0984e3;
    cursor: pointer; transition: all 0.15s ease;
    white-space: nowrap; line-height: 1;
}
.fo-call-btn:hover {
    background: rgba(9,132,227,0.22);
    border-color: rgba(9,132,227,0.6);
    box-shadow: 0 0 8px rgba(9,132,227,0.2);
}

.fo-called-tag {
    display: flex; align-items: center; gap: 4px;
    font-size: 10px; font-weight: 500;
    padding: 3px 8px; border-radius: 20px;
    white-space: nowrap; line-height: 1;
    min-width: 0; overflow: hidden; flex-shrink: 1;
}
.fo-called-tag.fo-called-mine {
    background: rgba(0,184,148,0.12);
    border: 1px solid rgba(0,184,148,0.25);
    color: #00b894;
}
.fo-called-tag.fo-called-other {
    background: rgba(225,112,85,0.12);
    border: 1px solid rgba(225,112,85,0.25);
    color: #e17055;
}
.fo-called-tag .fo-caller-name { max-width: 90px; overflow: hidden; text-overflow: ellipsis; }

.fo-uncall-btn {
    display: flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; border-radius: 50%;
    border: 1px solid rgba(225,112,85,0.3);
    background: rgba(225,112,85,0.1); color: #e17055;
    font-size: 10px; cursor: pointer;
    transition: all 0.15s ease; flex-shrink: 0; line-height: 1;
}
.fo-uncall-btn:hover {
    background: rgba(225,112,85,0.25);
    border-color: rgba(225,112,85,0.5);
}

/* Deal call styling */
.fo-called-tag.fo-called-deal {
    border-color: rgba(253,203,110,0.4);
    background: rgba(253,203,110,0.1);
}
.fo-called-tag.fo-called-deal.fo-called-mine {
    border-color: rgba(253,203,110,0.4);
    background: rgba(253,203,110,0.1);
    color: #fdcb6e;
}
.fo-called-tag.fo-called-deal.fo-called-other {
    border-color: rgba(253,203,110,0.4);
    background: rgba(253,203,110,0.1);
    color: #fdcb6e;
}
.fo-deal-badge {
    font-size: 9px; font-weight: 700;
    padding: 1px 5px; border-radius: 8px;
    background: rgba(253,203,110,0.2);
    color: #fdcb6e;
    white-space: nowrap; flex-shrink: 0;
}

/* Attack button */
.fo-attack-btn {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    padding: 4px 10px; border-radius: 20px;
    border: 1px solid rgba(225,112,85,0.4);
    background: transparent; color: #e17055;
    cursor: pointer; transition: all 0.15s ease;
    text-decoration: none;
    display: inline-flex; align-items: center; gap: 4px;
    line-height: 1; white-space: nowrap;
}
.fo-attack-btn:hover {
    background: rgba(225,112,85,0.15);
    border-color: rgba(225,112,85,0.6);
    box-shadow: 0 0 10px rgba(225,112,85,0.15);
    color: #e17055;
}
.fo-attack-btn .fo-arrow { font-size: 11px; line-height: 1; }

/* ── Footer ── */
.fo-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 16px;
    background: var(--wb-accent-15);
    border-top: 1px solid var(--wb-border);
    font-size: 10px; color: #636e72;
}
.fo-footer-stats { display: flex; gap: 16px; }
.fo-footer-stat { display: flex; align-items: center; gap: 4px; }
.fo-footer-stat .fo-val { color: var(--wb-text-muted); font-weight: 600; }
.fo-footer-version { font-size: 9px; color: #4a4a5a; letter-spacing: 0.04em; }

/* ── Scrollbar inside overlay ── */
.fo-overlay ::-webkit-scrollbar { width: 6px; }
.fo-overlay ::-webkit-scrollbar-track { background: transparent; }
.fo-overlay ::-webkit-scrollbar-thumb { background: var(--wb-border); border-radius: 3px; }
.fo-overlay ::-webkit-scrollbar-thumb:hover { background: #636e72; }

/* ── Responsive ── */
@media (max-width: 700px) {
    .fo-overlay { border-radius: 6px; margin: 4px 0; }
    .fo-header { gap: 4px 8px; padding: 6px 10px; }
    .fo-col-headers, .fo-row {
        /* v5.0.14: 7 cols — Target | (Lvl hidden) | (BSP hidden) | Status | On | Call | Action
           v4.9.92: status column bumped 40 to 108px so the travel /
           hospital pill fits without being clipped by the cell
           boundary. Name column absorbs the delta (still 1fr). */
        grid-template-columns: 1fr 0px 0px 108px 16px 52px 48px;
        padding: 7px 8px;
        column-gap: 6px;
        font-size: 11px;
    }
    /* Hide level and BSP columns on mobile (keep in grid flow).
       v5.0.14: Prior column dropped, so Lvl is now nth-child(2), BSP nth-child(3). */
    .fo-col-headers > :nth-child(2),
    .fo-row > :nth-child(2),
    .fo-col-headers > :nth-child(3),
    .fo-row > :nth-child(3) { visibility: hidden; overflow: hidden; padding: 0 !important; margin: 0; min-width: 0; max-width: 0; font-size: 0; }
    .fo-footer { padding: 6px 12px; flex-wrap: wrap; gap: 4px; }
    .fo-footer-stats { gap: 10px; flex-wrap: wrap; }
    .fo-attack-btn { padding: 3px 8px; font-size: 9px; }
    .fo-call-btn { padding: 3px 8px; font-size: 9px; }
    .fo-called-tag { padding: 2px 6px; font-size: 9px; }
    .fo-called-tag .fo-caller-name { max-width: 34px; }
    .fo-call-cell { overflow: hidden; max-width: 100%; }
    /* v4.9.89: narrow-viewport pill — floor at 78px for consistent
       visual shape on 'OK' / short labels, cap at 140px so very long
       country names ('Dominican Republic') don't blow out the column. */
    .fo-status-pill { padding: 2px 8px; font-size: 9.5px; min-width: 104px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fo-player-name .fo-name { font-size: 11.5px; }
    .fo-player-name .fo-pid { font-size: 9px; }
    .fo-bsp-stat { font-size: 10px; }
    .fo-priority-badge { font-size: 8px; padding: 2px 6px; }
    .fo-priority-select { width: 38px; font-size: 8px; }
    /* Center status pill and online dot */
    .fo-row > :nth-child(5) { justify-content: center; }
    .fo-online-dot { margin: 0 auto; }
    .fo-col-headers > :nth-child(5) { text-align: center; }
    .fo-col-headers > :nth-child(6) { text-align: center; }
}

/* ----- Heatmap toggle button (fixed bottom-right, next to settings gear) ----- */
.wb-heatmap-btn {
    position: fixed;
    bottom: 20px;
    right: 70px;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--wb-accent);
    color: var(--wb-text);
    border: 2px solid var(--wb-border);
    cursor: pointer;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.4);
    transition: transform 0.2s ease, background 0.2s ease;
    font-family: Arial, sans-serif;
}
.wb-heatmap-btn:hover {
    transform: scale(1.1);
    background: var(--wb-call-green);
}

/* ────────── Combined Heatmap modal tabs — v5.0.30 ────────── */
.wb-htm-tabs {
    display: flex; gap: 2px; padding: 0 16px;
    border-bottom: 1px solid #2d4a3e;
    background: rgba(0,0,0,0.2);
}
.wb-htm-tab {
    background: transparent; color: #9ca3af; border: 0;
    padding: 9px 16px; font-size: 12px; font-weight: 600;
    cursor: pointer; border-bottom: 2px solid transparent;
    margin-bottom: -1px;
}
.wb-htm-tab:hover { color: #d1d5db; }
.wb-htm-tab.active { color: #74c69d; border-bottom-color: #74c69d; }
.wb-htm-pane { display: none; }
.wb-htm-pane.active { display: block; }
.wb-htm-activity-grid {
    display: grid;
    grid-template-columns: 30px repeat(24, minmax(14px, 1fr));
    gap: 1px;
    padding: 8px;
    background: #0f1a14; border: 1px solid #1a2e20; border-radius: 6px;
}
.wb-htm-activity-cell {
    aspect-ratio: 1 / 1;
    border-radius: 2px;
    min-height: 14px;
}
.wb-htm-activity-label {
    font-size: 9px; color: #9ca3af; text-align: center;
    align-self: center;
}
.wb-htm-activity-day { font-weight: 600; color: #d1d5db; }

/* ────────── War Payouts modal — v5.0.28 ────────── */
.wb-payouts-backdrop {
    position: fixed; inset: 0; z-index: 99998;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
}
.wb-payouts-modal {
    background: #131a14; color: #d1d5db;
    border: 1px solid #2d4a3e; border-radius: 8px;
    width: 95vw; max-width: 1100px; max-height: 90vh;
    display: flex; flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
    overflow: hidden;
}
.wb-payouts-header {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; border-bottom: 1px solid #2d4a3e;
    background: rgba(255,255,255,0.02);
}
.wb-payouts-header h2 {
    margin: 0; font-size: 15px; font-weight: 700; color: #f3f4f6;
    letter-spacing: 0.3px;
}
.wb-payouts-header .wb-payouts-meta {
    color: #6b7280; font-size: 11px; margin-left: auto;
    margin-right: 8px;
}
.wb-payouts-header select {
    background: #0f1a14; color: #d1d5db; border: 1px solid #2d4a3e;
    border-radius: 4px; padding: 4px 7px; font-size: 11px; cursor: pointer;
}
.wb-payouts-close {
    background: transparent; color: #d1d5db; border: 0;
    font-size: 18px; line-height: 1; cursor: pointer; padding: 4px 8px;
    border-radius: 4px;
}
.wb-payouts-close:hover { background: rgba(255,255,255,0.08); }
.wb-payouts-body {
    overflow: auto; padding: 14px 16px; flex: 1 1 auto;
    display: flex; flex-direction: column; gap: 14px;
}
.wb-payouts-section-label {
    font-size: 10px; color: #6b7280; text-transform: uppercase;
    letter-spacing: 0.4px; font-weight: 600;
}

/* Heatmap grid (member × war) — APK-inspired diverging cells */
.wb-payouts-heatmap {
    border: 1px solid #1a2e20; border-radius: 6px;
    background: #0f1a14; padding: 8px;
    overflow-x: auto;
}
.wb-payouts-heat-row {
    display: grid; align-items: center;
    gap: 2px; padding: 2px 0;
}
.wb-payouts-heat-row.header {
    border-bottom: 1px solid #2d4a3e; padding-bottom: 6px;
    margin-bottom: 4px; font-size: 10px;
    color: #9ca3af; text-transform: uppercase; letter-spacing: 0.4px;
}
.wb-payouts-heat-namecol {
    font-size: 11px; color: #d1d5db; padding: 0 8px 0 4px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    cursor: default;
}
.wb-payouts-heat-namecol .pid {
    color: #6b7280; font-size: 9px; margin-left: 4px;
}
.wb-payouts-heat-cell {
    height: 26px; border-radius: 3px;
    cursor: pointer; transition: outline 100ms;
    display: flex; align-items: center; justify-content: center;
    font-size: 9.5px; font-weight: 600; color: #f3f4f6;
    text-shadow: 0 1px 1px rgba(0,0,0,0.4);
    overflow: hidden;
}
.wb-payouts-heat-cell:hover { outline: 1px solid rgba(255,255,255,0.3); }
.wb-payouts-heat-cell.empty { background: rgba(255,255,255,0.04); cursor: default; color: #4b5563; }
.wb-payouts-heat-cell.selected { outline: 2px solid #74c69d; }
.wb-payouts-heat-warhead {
    font-size: 10px; color: #9ca3af; text-align: center;
    padding: 4px 2px; line-height: 1.25; cursor: pointer;
    border-radius: 3px;
}
.wb-payouts-heat-warhead:hover { background: rgba(255,255,255,0.05); color: #d1d5db; }
.wb-payouts-heat-warhead.selected { background: rgba(116,198,141,0.15); color: #74c69d; }
.wb-payouts-heat-warhead .warhead-result {
    display: inline-block; margin-left: 3px; font-size: 9px;
}
.wb-payouts-heat-totalcol {
    font-size: 10.5px; color: #74c69d; font-weight: 600;
    text-align: right; padding-right: 6px;
}

/* Drilldown table */
.wb-payouts-drilldown {
    border: 1px solid #1a2e20; border-radius: 6px;
    background: #0f1a14; padding: 10px 12px;
    overflow-x: auto;
}
/* v5.0.68: per-war settings overlay (gear icon in modal header). */
.wb-payouts-settings-overlay {
    position: fixed; inset: 0; z-index: 1000002;
    background: rgba(0,0,0,0.65);
    display: flex; align-items: center; justify-content: center;
}
.wb-payouts-settings-panel {
    background: #0f1a14; border: 1px solid #2d4a3e; border-radius: 8px;
    width: 92vw; max-width: 480px; max-height: 88vh;
    display: flex; flex-direction: column;
    color: #d1d5db; font-size: 12px;
}
.wb-payouts-settings-header {
    padding: 12px 14px; border-bottom: 1px solid #2d4a3e;
    display: flex; align-items: center; justify-content: space-between;
}
.wb-payouts-settings-header h3 { margin: 0; font-size: 14px; color: #74c69d; }
.wb-payouts-settings-stale {
    margin: 0 0 12px; padding: 9px 11px; border-radius: 8px;
    background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.4);
    color: #fbbf24; font-size: 12px; line-height: 1.45;
}
.wb-payouts-settings-stale strong { display: block; margin-bottom: 3px; color: #fcd34d; }
.wb-payouts-settings-close {
    background: none; border: 0; color: #d1d5db;
    font-size: 18px; cursor: pointer;
}
.wb-payouts-settings-body {
    padding: 12px 14px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 14px;
}
.wb-payouts-settings-body label {
    display: flex; flex-direction: column; gap: 4px;
}
.wb-payouts-settings-body label span {
    font-size: 11px; color: #74c69d; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
}
.wb-payouts-settings-body input {
    background: #16261d; color: #d1d5db; border: 1px solid #2d4a3e;
    border-radius: 4px; padding: 6px 8px; font-size: 12px;
    font-family: "SF Mono", "Menlo", monospace;
}
.wb-payouts-settings-body input::placeholder { color: #6b7280; }
.wb-payouts-settings-body small {
    font-size: 10px; color: #9ca3af; line-height: 1.4;
}
.wb-payouts-settings-footer {
    padding: 10px 14px; border-top: 1px solid #2d4a3e;
    display: flex; gap: 8px; align-items: center;
}
.wb-payouts-settings-footer button {
    background: #2d4a3e; color: #d1d5db; border: 0;
    border-radius: 4px; padding: 6px 14px; font-size: 11px;
    cursor: pointer; font-weight: 600;
}
.wb-payouts-settings-footer .wb-payouts-settings-save {
    background: #2d6a4f; color: #fff;
}
.wb-payouts-settings-footer .wb-payouts-settings-save:hover { background: #3d8a6f; }
.wb-payouts-settings-footer .wb-payouts-settings-clear {
    background: transparent; color: #ef4444; border: 1px solid #4a1a1a;
}

/* v5.0.61: war-selector pill row at top of payouts modal. */
.wb-payouts-warpicker {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin: 4px 4px 12px;
}
.wb-payouts-warpill {
    background: #0f1a14; color: #d1d5db;
    border: 1px solid #2d4a3e; border-radius: 6px;
    padding: 6px 10px; font-size: 11px; cursor: pointer;
    display: flex; flex-direction: column; gap: 2px; line-height: 1.2;
    transition: background 0.12s, border-color 0.12s;
}
.wb-payouts-warpill:hover { background: #16261d; border-color: #3a5d4d; }
.wb-payouts-warpill.selected {
    background: #1f3a2c; border-color: #74c69d; color: #ffffff;
}
.wb-payouts-warpill .warpill-name { font-weight: 600; }
.wb-payouts-warpill .warpill-meta { font-size: 9.5px; color: #9ca3af; }
.wb-payouts-warpill.selected .warpill-meta { color: #c8e6d2; }
.wb-payouts-drilldown table {
    /* v5.0.51: was width:100% — that forced auto-layout to squeeze
       every column to its min content width, and the long
       \$151,849,807 in the Payout cell would overflow LEFTWARD past
       its cell edge (text-align:right + content > cell width),
       visually smashing through the Share/Score/Attacks columns to
       its left. Letting the table size to content + horizontal scroll
       on overflow keeps every column wide enough for its content. */
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
    font-size: 11px;
}
.wb-payouts-drilldown td,
.wb-payouts-drilldown th { white-space: nowrap; }
/* v5.0.52: separation between EVERY numeric column. The previous
   adjacent-sibling rule (right + right) missed the last gap. A
   brute-force per-cell padding handles every column uniformly.
   v5.0.53: tabular-nums forces every digit to render at the same
   width — without it '75' and '49' (proportional digits) had
   different LEFT-edges when right-aligned, making the column
   visually zigzag down the page. */
.wb-payouts-drilldown td.right,
.wb-payouts-drilldown th.right {
    padding-left: 22px;
    padding-right: 6px;
    /* v5.0.54: tabular-nums alone wasn't enough on iOS Safari —
       system font support for the feature is inconsistent across
       weights, so digits still rendered at slightly different widths
       and the column zigzagged. Force a real monospace font on every
       numeric cell — every digit is guaranteed to be the same width. */
    font-family: "SF Mono", "Menlo", "Monaco", "Cascadia Mono",
                 "Roboto Mono", "DejaVu Sans Mono", "Courier New", monospace;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
}
/* Score column gets a brighter color — was hard to read in dark mode. */
.wb-payouts-drilldown td.col-score { color: #d1d5db; font-weight: 600; }
.wb-payouts-drilldown td.col-attacks {
    color: #74c69d; font-weight: 600; cursor: pointer;
    /* v5.0.54: removed underline-dotted — text-decoration was
       slightly affecting per-cell width on iOS, contributing to
       the column zigzag. Use a small dot indicator instead. */
}
.wb-payouts-drilldown td.col-attacks::after {
    content: " \\00b7";  /* middle dot — lightweight tappability hint */
    color: rgba(116,198,141,0.4);
    margin-left: 1px;
}
.wb-payouts-drilldown td.col-attacks:hover { color: #a3e0c1; }
/* Click-popover for the attacks breakdown (works on touch where
   native title tooltip doesn't). */
.wb-attack-popover {
    position: fixed; z-index: 1000001;
    background: #0f1a14; border: 1px solid #2d4a3e;
    border-radius: 6px; padding: 10px 14px; font-size: 11px;
    color: #d1d5db; box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    min-width: 180px;
}
.wb-attack-popover .pop-title {
    color: #74c69d; font-weight: 600; margin-bottom: 6px;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
}
.wb-attack-popover .pop-row {
    display: flex; justify-content: space-between; gap: 12px;
    padding: 2px 0;
}
.wb-attack-popover .pop-row .pop-cat { color: #9ca3af; }
.wb-attack-popover .pop-row .pop-val { color: #d1d5db; font-weight: 600; }
.wb-payouts-drilldown th {
    text-align: left; padding: 4px 6px; font-size: 9.5px;
    color: #9ca3af; text-transform: uppercase; letter-spacing: 0.3px;
    border-bottom: 1px solid #2d4a3e;
}
.wb-payouts-drilldown td {
    padding: 4px 6px; border-bottom: 1px solid rgba(255,255,255,0.04);
}
.wb-payouts-drilldown td.right,
.wb-payouts-drilldown th.right { text-align: right; }
.wb-payouts-drilldown a.send-btn {
    background: #2d6a4f; color: white; padding: 2px 8px;
    font-size: 10px; border-radius: 3px; text-decoration: none;
}
.wb-payouts-drilldown a.send-btn:hover { background: #3d8a6f; }
.wb-payouts-drilldown .loot-input {
    background: #0f1a14; color: #d1d5db; border: 1px solid #2d4a3e;
    border-radius: 3px; padding: 3px 6px; font-size: 11px; width: 140px;
    margin-left: 6px;
}

/* ----- Heatmap floating panel ----- */
.wb-heatmap-panel {
    position: fixed;
    top: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--wb-bg);
    border: 1px solid var(--wb-border);
    border-radius: 8px;
    z-index: 1000000;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    color: var(--wb-text);
    font-family: monospace;
    /* v5.0.39: dropped min-width 420 → 360 and shrunk cell/label sizes
       below so 7×24 + day labels actually fit on a 360-wide phone
       without the left-side day labels getting clipped. */
    min-width: 360px;
    max-width: 95vw;
}
.wb-heatmap-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    cursor: grab;
    border-bottom: 1px solid var(--wb-border);
    font-size: 14px;
    font-weight: bold;
    color: var(--wb-call-green);
    user-select: none;
}
.wb-heatmap-close {
    background: none;
    border: none;
    color: var(--wb-text);
    font-size: 20px;
    cursor: pointer;
    opacity: 0.6;
    padding: 0 4px;
}
.wb-heatmap-close:hover { opacity: 1; }

.wb-heatmap-grid {
    display: grid;
    /* v5.0.39: 36+24*16+gaps was ~494px wide and clipped on phones —
       shrunk to ~328px (28+24*12+gaps) so the panel actually fits in
       a 360vw viewport with the day labels staying visible. */
    grid-template-columns: 28px repeat(24, 12px);
    gap: 1px;
    padding: 8px 10px;
    justify-content: center;
}
.wb-heatmap-label {
    font-size: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
}
.wb-heatmap-day {
    justify-content: flex-end;
    padding-right: 3px;
}
.wb-heatmap-cell {
    /* v5.0.39: 16→12px to fit the panel on narrow viewports. */
    width: 12px;
    height: 12px;
    border-radius: 2px;
    cursor: default;
}
.wb-heatmap-footer {
    padding: 8px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--wb-border);
}
/* ----- Scout Report modal ----- */
.wb-scout-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 1000001;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Arial, sans-serif;
}
.wb-scout-modal {
    background: var(--wb-bg);
    border: 1px solid var(--wb-border);
    border-radius: 8px;
    width: 750px;
    max-width: 95vw;
    max-height: 90vh;
    overflow-y: auto;
    color: var(--wb-text);
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
.wb-scout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--wb-border);
}
.wb-scout-header h2 {
    margin: 0;
    font-size: 16px;
    color: var(--wb-call-green);
}
.wb-scout-close {
    background: none;
    border: none;
    color: var(--wb-text);
    font-size: 22px;
    cursor: pointer;
    opacity: 0.6;
    padding: 0 4px;
}
.wb-scout-close:hover { opacity: 1; }
.wb-scout-body {
    padding: 16px 20px;
}
.wb-scout-section {
    margin-bottom: 16px;
}
.wb-scout-section h3 {
    margin: 0 0 8px 0;
    font-size: 13px;
    color: var(--wb-call-green);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--wb-border);
    padding-bottom: 4px;
}
.wb-scout-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 16px;
    font-size: 12px;
}
.wb-scout-grid .wb-scout-label {
    color: var(--wb-text-muted);
}
.wb-scout-grid .wb-scout-value {
    font-weight: 600;
    text-align: right;
}
.wb-scout-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-top: 4px;
}
.wb-scout-table th {
    text-align: left;
    font-size: 10px;
    color: var(--wb-text-muted);
    padding: 3px 6px;
    border-bottom: 1px solid var(--wb-border);
    text-transform: uppercase;
}
.wb-scout-table td {
    padding: 3px 6px;
    border-bottom: 1px solid var(--wb-border);
    color: var(--wb-text);
}
.wb-scout-table tr:last-child td { border-bottom: none; }
.wb-scout-bar {
    height: 6px;
    border-radius: 3px;
    background: var(--wb-accent);
    overflow: hidden;
    margin-top: 2px;
}
.wb-scout-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
}
.wb-scout-threat {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
}
.wb-scout-threat.critical { background: #d63031; color: #fff; }
.wb-scout-threat.high { background: #e17055; color: #fff; }
.wb-scout-threat.medium { background: #fdcb6e; color: #2d3436; }
.wb-scout-threat.low { background: #636e72; color: #fff; }
.wb-scout-summary-box {
    background: var(--wb-bg-secondary);
    border: 1px solid var(--wb-border);
    border-radius: 6px;
    padding: 12px;
    font-size: 12px;
    line-height: 1.5;
}
.wb-scout-summary-box .wb-scout-pill {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    margin: 1px 2px;
}
.wb-scout-pill.strength { background: rgba(0,184,148,0.2); color: #00b894; }
.wb-scout-pill.weakness { background: rgba(214,48,49,0.2); color: #ff7675; }
.wb-scout-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    gap: 12px;
    color: var(--wb-text-muted);
    font-size: 13px;
}
.wb-scout-spinner {
    width: 32px; height: 32px;
    border: 3px solid var(--wb-border);
    border-top-color: var(--wb-call-green);
    border-radius: 50%;
    animation: wb-spin 0.8s linear infinite;
}
@keyframes wb-spin { to { transform: rotate(360deg); } }
.wb-scout-compare {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0;
    font-size: 12px;
    margin-bottom: 8px;
}
.wb-scout-compare-side {
    padding: 8px;
    border-radius: 6px;
}
.wb-scout-compare-side.ours { background: rgba(0,184,148,0.08); }
.wb-scout-compare-side.theirs { background: rgba(214,48,49,0.08); }
.wb-scout-compare-vs {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 11px;
    color: var(--wb-text-muted);
    padding: 0 8px;
}
.wb-scout-compare-side h4 {
    margin: 0 0 6px 0;
    font-size: 12px;
    font-weight: 700;
}
.wb-scout-compare-side.ours h4 { color: #00b894; }
.wb-scout-compare-side.theirs h4 { color: #d63031; }
.wb-scout-compare-row {
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
}
.wb-scout-compare-row .lbl { color: var(--wb-text-muted); }
.wb-scout-compare-row .val { font-weight: 600; }
.wb-scout-win-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 700;
    margin: 4px 0;
}
.wb-scout-win-badge.high { background: rgba(0,184,148,0.25); color: #00b894; }
.wb-scout-win-badge.mid { background: rgba(253,203,110,0.25); color: #fdcb6e; }
.wb-scout-win-badge.low { background: rgba(214,48,49,0.25); color: #ff7675; }
.wb-scout-matchup-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-top: 4px;
}
.wb-scout-matchup-table th {
    text-align: center;
    font-size: 10px;
    color: var(--wb-text-muted);
    padding: 3px 4px;
    border-bottom: 1px solid var(--wb-border);
    text-transform: uppercase;
}
.wb-scout-matchup-table td {
    padding: 3px 4px;
    border-bottom: 1px solid rgba(45,52,54,0.3);
    text-align: center;
}
.wb-scout-matchup-table tr:last-child td { border-bottom: none; }
.wb-scout-matchup-table .adv-ours { color: #00b894; }
.wb-scout-matchup-table .adv-theirs { color: #ff7675; }
.wb-scout-matchup-table .adv-even { color: #636e72; }
.wb-scout-tier-row {
    display: grid;
    grid-template-columns: 50px 1fr 30px 30px 1fr;
    gap: 4px;
    align-items: center;
    font-size: 11px;
    padding: 2px 0;
}
.wb-scout-tier-bar {
    height: 10px;
    border-radius: 3px;
    transition: width 0.3s ease;
}
.wb-scout-tier-bar.ours { background: #00b894; justify-self: end; }
.wb-scout-tier-bar.theirs { background: #d63031; justify-self: start; }
.wb-scout-tier-label {
    font-weight: 700;
    text-align: center;
}
.wb-scout-tier-count { text-align: center; font-weight: 600; font-size: 10px; }
.wb-scout-phase {
    background: var(--wb-bg-secondary);
    border: 1px solid var(--wb-border);
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 8px;
}
.wb-scout-phase h4 {
    margin: 0 0 4px 0;
    font-size: 12px;
    color: var(--wb-call-green);
}
.wb-scout-phase p {
    margin: 0 0 6px 0;
    font-size: 11px;
    color: var(--wb-text-muted);
    line-height: 1.4;
}
.wb-scout-target-list {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 4px;
}
.wb-scout-target-chip {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    background: rgba(45,52,54,0.5);
    color: var(--wb-text);
}
.wb-scout-target-chip.weak { background: rgba(0,184,148,0.15); color: #00b894; }
.wb-scout-target-chip.mid { background: rgba(253,203,110,0.15); color: #fdcb6e; }
.wb-scout-target-chip.threat { background: rgba(214,48,49,0.15); color: #ff7675; }
.wb-scout-target-chip.ignore { background: rgba(99,110,114,0.15); color: #636e72; }
.wb-scout-safe-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-top: 4px;
}
.wb-scout-safe-table th {
    text-align: left;
    font-size: 10px;
    color: var(--wb-text-muted);
    padding: 3px 6px;
    border-bottom: 1px solid var(--wb-border);
    text-transform: uppercase;
}
.wb-scout-safe-table td {
    padding: 3px 6px;
    border-bottom: 1px solid rgba(45,52,54,0.3);
}
.wb-scout-safe-table tr:last-child td { border-bottom: none; }
.wb-scout-pct-bar {
    display: inline-block;
    height: 16px;
    border-radius: 3px;
    line-height: 16px;
    font-size: 10px;
    font-weight: 600;
    padding: 0 6px;
    min-width: 30px;
    text-align: center;
}

/* ── Post-War Report Styles ── */
.wb-postwar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 1000001;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Arial, sans-serif;
}
.wb-postwar-modal {
    background: var(--wb-bg);
    border: 1px solid var(--wb-border);
    border-radius: 8px;
    width: 800px;
    max-width: 95vw;
    max-height: 90vh;
    overflow-y: auto;
    color: var(--wb-text);
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
.wb-postwar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--wb-border);
}
.wb-postwar-header h2 {
    margin: 0;
    font-size: 16px;
    color: #fdcb6e;
}
.wb-postwar-close {
    background: none;
    border: none;
    color: var(--wb-text);
    font-size: 22px;
    cursor: pointer;
    opacity: 0.6;
    padding: 0 4px;
}
.wb-postwar-close:hover { opacity: 1; }
.wb-postwar-body {
    padding: 16px 20px;
}
.wb-postwar-section {
    margin-bottom: 16px;
}
.wb-postwar-section h3 {
    margin: 0 0 8px 0;
    font-size: 13px;
    color: #fdcb6e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--wb-border);
    padding-bottom: 4px;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
}
.wb-postwar-section h3::after {
    content: ' \u25BC';
    font-size: 9px;
    opacity: 0.5;
}
.wb-postwar-section h3.collapsed::after {
    content: ' \u25B6';
}
.wb-postwar-section-body {
    overflow: hidden;
    transition: max-height 0.3s ease;
}
.wb-postwar-section-body.collapsed {
    max-height: 0 !important;
    overflow: hidden;
}
.wb-postwar-result-badge {
    display: inline-block;
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 16px;
    font-weight: 700;
    margin: 4px 0;
}
.wb-postwar-result-badge.victory { background: rgba(0,184,148,0.25); color: #00b894; }
.wb-postwar-result-badge.defeat { background: rgba(214,48,49,0.25); color: #ff7675; }
.wb-postwar-result-badge.unknown { background: rgba(99,110,114,0.25); color: #636e72; }
.wb-postwar-score {
    font-size: 24px;
    font-weight: 700;
    text-align: center;
    margin: 8px 0;
}
.wb-postwar-score .our-score { color: #00b894; }
.wb-postwar-score .enemy-score { color: #ff7675; }
.wb-postwar-score .score-sep { color: var(--wb-text-muted); margin: 0 8px; }
.wb-postwar-stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 16px;
    font-size: 12px;
}
.wb-postwar-stat-grid .lbl { color: var(--wb-text-muted); }
.wb-postwar-stat-grid .val { font-weight: 600; text-align: right; }
.wb-postwar-card {
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 6px;
    font-size: 12px;
}
.wb-postwar-card.positive {
    background: rgba(0,184,148,0.08);
    border: 1px solid rgba(0,184,148,0.2);
}
.wb-postwar-card.negative {
    background: rgba(253,203,110,0.08);
    border: 1px solid rgba(253,203,110,0.2);
}
.wb-postwar-card .card-name {
    font-weight: 700;
    font-size: 13px;
}
.wb-postwar-card.positive .card-name { color: #00b894; }
.wb-postwar-card.negative .card-name { color: #fdcb6e; }
.wb-postwar-card .card-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
    font-size: 11px;
    color: var(--wb-text-muted);
}
.wb-postwar-card .card-stats span { white-space: nowrap; }
.wb-postwar-achievement {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: rgba(0,184,148,0.15);
    color: #00b894;
    margin: 2px;
}
.wb-postwar-recommendation {
    background: var(--wb-bg-secondary);
    border: 1px solid var(--wb-border);
    border-radius: 6px;
    padding: 8px 12px;
    margin-bottom: 6px;
    font-size: 12px;
}
.wb-postwar-recommendation .rec-category {
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    margin-bottom: 2px;
}
.wb-postwar-recommendation .rec-category.high { color: #ff7675; }
.wb-postwar-recommendation .rec-category.medium { color: #fdcb6e; }
.wb-postwar-recommendation .rec-text {
    color: var(--wb-text-muted);
    line-height: 1.4;
}
.wb-postwar-member-table-wrap {
    max-height: 400px;
    overflow: auto;
    border: 1px solid var(--wb-border);
    border-radius: 6px;
}
.wb-postwar-member-table {
    min-width: 520px;
    border-collapse: collapse;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}
.wb-postwar-member-table th {
    text-align: left;
    font-size: 10px;
    color: var(--wb-text-muted);
    padding: 6px 8px;
    border-bottom: 1px solid var(--wb-border);
    text-transform: uppercase;
    position: sticky;
    top: 0;
    background: var(--wb-bg);
    z-index: 1;
    white-space: nowrap;
}
.wb-postwar-member-table td {
    padding: 5px 8px;
    border-bottom: 1px solid var(--wb-border);
    color: var(--wb-text);
    white-space: nowrap;
}
.wb-postwar-member-table td:first-child {
    color: var(--wb-text);
    font-weight: 700;
}
.wb-postwar-member-table tr:last-child td { border-bottom: none; }
.wb-postwar-member-table .eff-green { color: #00b894; }
.wb-postwar-member-table .eff-yellow { color: #fdcb6e; }
.wb-postwar-member-table .eff-red { color: #ff7675; }
/* Compact table for the Xanax Accountability section. Mirrors the
   iOS layout: single line of small monospaced numbers per member,
   no horizontal scroll, name truncates if it'd push columns
   off-viewport. */
.wb-postwar-xanax-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    table-layout: fixed;
}
.wb-postwar-xanax-table th {
    text-align: left;
    font-size: 9px;
    color: var(--wb-text-muted);
    padding: 4px 4px;
    border-bottom: 1px solid var(--wb-border);
    text-transform: uppercase;
    white-space: nowrap;
}
.wb-postwar-xanax-table td {
    padding: 3px 4px;
    border-bottom: 1px solid var(--wb-border);
    color: var(--wb-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.wb-postwar-xanax-table tr:last-child td { border-bottom: none; }
.wb-postwar-xanax-table .col-mark  { width: 18px; text-align: center; padding-right: 0; }
.wb-postwar-xanax-table .col-name  { /* takes remaining width */ }
.wb-postwar-xanax-table .col-num   { width: 36px; text-align: right; }
.wb-postwar-xanax-table .col-delta { width: 44px; text-align: right; }
.wb-postwar-energy-bar {
    height: 20px;
    background: var(--wb-bg-secondary);
    border-radius: 4px;
    overflow: hidden;
    margin: 8px 0;
    position: relative;
}
.wb-postwar-energy-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
}
.wb-postwar-energy-bar-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--wb-text);
}

.fo-unavailable-section {
    border-top: 1px solid var(--wb-border);
    margin-top: 2px;
}
.fo-unavail-header {
    padding: 8px 12px;
    font-size: 11px;
    color: #636e72;
    font-weight: 600;
    letter-spacing: 0.3px;
    user-select: none;
    -webkit-user-select: none;
}
.fo-unavail-header:hover {
    color: var(--wb-text);
    background: var(--wb-accent-10);
}
.fo-unavail-list .fo-row {
    opacity: 0.45;
}

/* ── Strategy Indicator Bar ── */
.fo-strategy-bar {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 12px;
    background: rgba(20,20,30,0.85);
    border-bottom: 1px solid rgba(45,52,54,0.4);
    font-size: 11px; min-height: 0;
}
.fo-strategy-bar:empty, .fo-strategy-bar.hidden { display: none; }
.fo-strategy-badge {
    font-size: 14px; font-weight: 800; letter-spacing: 1px;
    padding: 2px 10px; border-radius: 4px;
    text-transform: uppercase; line-height: 1.3;
}
.fo-strategy-badge.push { background: rgba(0,184,148,0.2); color: #00b894; border: 1px solid rgba(0,184,148,0.4); }
.fo-strategy-badge.hold { background: rgba(253,203,110,0.2); color: #fdcb6e; border: 1px solid rgba(253,203,110,0.4); }
.fo-strategy-badge.turtle { background: rgba(116,185,255,0.2); color: #74b9ff; border: 1px solid rgba(116,185,255,0.4); }
.fo-strategy-confidence {
    font-size: 10px; color: var(--wb-text-muted); font-weight: 600;
}
.fo-strategy-timing {
    font-size: 10px; padding: 1px 6px; border-radius: 8px;
    font-weight: 600;
}
.fo-strategy-timing.good { background: rgba(0,184,148,0.15); color: #00b894; }
.fo-strategy-timing.neutral { background: rgba(99,110,114,0.15); color: #b2bec3; }
.fo-strategy-timing.bad { background: rgba(214,48,49,0.15); color: #ff7675; }
.fo-strategy-reasons {
    flex: 1; font-size: 10px; color: #b0b0c0;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.fo-strategy-phase {
    font-size: 9px; color: var(--wb-text-muted); text-transform: uppercase;
    letter-spacing: 0.5px; font-weight: 600;
}

/* ── Enemy Activity Sparkline ── */
.fo-activity-chart {
    display: flex; align-items: flex-end; gap: 1px;
    height: 24px; min-width: 96px;
}
.fo-activity-chart-bar {
    flex: 1; min-width: 3px; border-radius: 1px 1px 0 0;
    background: rgba(116,185,255,0.3); transition: background 0.2s;
}
.fo-activity-chart-bar.current { background: #74b9ff; }
.fo-activity-chart-bar.peak { background: rgba(214,48,49,0.5); }
.fo-activity-chart-bar.dead { background: rgba(0,184,148,0.5); }
.fo-activity-chart-label {
    font-size: 7px; color: var(--wb-text-muted); text-align: center;
    line-height: 1;
}

/* Retal action row injected into Torn's native mini profile card */
.fo-card-retal-row {
    display: flex;
    justify-content: center;
    padding: 6px 8px;
    margin: 6px 0 0 0;
    border-top: 1px solid rgba(255,255,255,0.08);
}
.fo-card-retal-btn {
    /* v5.0.35: REVERTED v5.0.29 absolute positioning + the
       .fo-retal-injected position-relative rule. That CSS broke
       Torn mini-profile invocation because Torn relies on the
       wrapper own positioning to render the popup at the right
       spot — forcing it to relative made hold-to-show mini-profile
       silently fail on faction pages and inside FactionOps. Back
       to inline-flex inside .buttons-list. */
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: linear-gradient(135deg, #ff6b52, #e03a3a);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 2px;
    padding: 1px 5px;
    font: 700 8px/1 Arial, "Open Sans", sans-serif;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
    box-shadow: 0 1px 2px rgba(214,48,49,0.3);
    pointer-events: auto !important;
    touch-action: manipulation;
    user-select: none;
}
.fo-card-retal-btn:hover { transform: translateY(-1px); box-shadow: 0 1px 4px rgba(214,48,49,0.45); }
.fo-card-retal-btn:active { transform: translateY(0); }
.fo-card-retal-btn:disabled { background: #636e72; color: #b0b8bc; cursor: not-allowed; transform: none; }
.fo-card-retal-icon { font-size: 9px; }
/* v5.0.74 .fo-card-retal-btn-upper class removed in v5.0.76 (mini-
   profile injection reverted to bottom .buttons-list). */

/* Faction cooldowns dashboard (Option B — self-reported bars). */
.fo-bars-section {
    border-bottom: 1px solid var(--wb-border);
    background: var(--wb-bg-secondary);
}
.fo-bars-header {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 14px; cursor: pointer; user-select: none;
    font: 600 11px/1 Arial, sans-serif; color: var(--wb-text);
    text-transform: uppercase; letter-spacing: 0.06em;
    /* Ensure clicks land — same treatment that fixed the Shout button
       when the overlay lives inside #mainContainer. */
    pointer-events: auto !important;
    touch-action: manipulation;
    position: relative; z-index: 2;
}
.fo-bars-header * { pointer-events: none; }
.fo-bars-header:hover { background: rgba(255,255,255,0.03); }
.fo-bars-caret { font-size: 9px; transition: transform 0.15s ease; display: inline-block; }
.fo-bars-section.is-open .fo-bars-caret { transform: rotate(90deg); }
.fo-bars-title { opacity: 0.85; }
.fo-bars-count {
    margin-left: auto; font-size: 10px; color: #888;
    background: rgba(255,255,255,0.05); padding: 2px 7px; border-radius: 3px;
}
.fo-bars-list { padding: 6px 12px 10px; }
/* v5.1.6: cooldown column dropped. v5.1.7: energy column widened a
   bit to fit inline number (e.g. '400/150') for xanax-boosted
   members where current > max. */
.fo-bars-row {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr);
    gap: 10px; align-items: center; justify-content: start;
    padding: 4px 4px; font-size: 11px;
    border-bottom: 1px dashed rgba(255,255,255,0.04);
}
.fo-bar-cell .fo-bar-num {
    font-size: 10px; color: #9ca3af; margin-left: 4px;
    font-variant-numeric: tabular-nums; flex-shrink: 0;
}
.fo-bars-row:last-child { border-bottom: none; }
.fo-bars-row .fo-bars-name { font-weight: 600; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fo-bars-row .fo-bars-updated { font-size: 9px; font-weight: 400; color: #6b7280; margin-left: 4px; }
.fo-bar-cell { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; cursor: help; }
.fo-bar-cell .fo-bar-label { font-size: 9px; color: #888; width: 10px; flex-shrink: 0; }
.fo-bar-cell .fo-bar-track {
    flex: 1; height: 5px; background: rgba(255,255,255,0.06);
    border-radius: 2px; overflow: hidden; position: relative;
}
.fo-bar-cell .fo-bar-fill {
    height: 100%; background: var(--wb-call-green);
    transition: width 0.3s ease;
}
.fo-bar-cell.is-nerve .fo-bar-fill { background: #fdcb6e; }
.fo-bars-cd {
    display: flex; gap: 6px;
    min-width: 0;
}
.fo-bars-cd .fo-cd-bar {
    display: flex; align-items: center; gap: 4px;
    flex: 1; min-width: 0;
    cursor: help;
}
.fo-bars-cd .fo-cd-bar-label { font-size: 9px; color: #888; width: 9px; flex-shrink: 0; text-align: center; font-weight: 700; }
.fo-bars-cd .fo-cd-bar-track {
    flex: 1; height: 5px; background: rgba(255,255,255,0.06);
    border-radius: 2px; overflow: hidden; position: relative;
    min-width: 0;
}
.fo-bars-cd .fo-cd-bar-fill {
    height: 100%; background: #ff7675;
    transition: width 0.3s ease;
    border-radius: 2px;
}
.fo-bars-cd .fo-cd-bar.is-drug     .fo-cd-bar-fill { background: #ff7675; }
.fo-bars-cd .fo-cd-bar.is-medical  .fo-cd-bar-fill { background: #74b9ff; }
.fo-bars-cd .fo-cd-bar.is-booster  .fo-cd-bar-fill { background: #a29bfe; }
.fo-bars-cd .fo-cd-bar.is-ready .fo-cd-bar-label { color: #4ade80; }
.fo-bars-cd .fo-cd-bar.is-ready .fo-cd-bar-fill   { width: 0 !important; }
.fo-bars-empty { padding: 8px; color: #888; font-size: 11px; text-align: center; font-style: italic; }

/* Tap-to-show tooltip — works where native title attributes do not (mobile/PDA). */
.fo-tooltip {
    position: absolute;
    z-index: 2147483647;
    background: rgba(0,0,0,0.92);
    color: #fff;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 2px 10px rgba(0,0,0,0.6);
    border: 1px solid rgba(255,255,255,0.08);
    animation: fo-tooltip-fade 0.12s ease-out;
}
@keyframes fo-tooltip-fade { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }

/* Broadcast entry bar */
.fo-broadcast-entry-bar {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 16px; background: var(--wb-bg-secondary);
    border-bottom: 1px solid var(--wb-border);
    /* Create a new stacking context above anything Torn's React might
       layer into #mainContainer after we nested the overlay inside it. */
    position: relative;
    z-index: 10;
    pointer-events: auto;
    isolation: isolate;
}
.fo-broadcast-entry-bar input {
    flex: 1; background: var(--wb-bg); border: 1px solid var(--wb-border);
    color: var(--wb-text); padding: 5px 12px; border-radius: 4px; font-size: 13px;
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
    position: relative; z-index: 1;
    pointer-events: auto !important;
}
.fo-broadcast-entry-bar button {
    background: var(--wb-hospital-red); color: white; border: none;
    padding: 5px 16px; border-radius: 4px; cursor: pointer;
    font-size: 12px; font-weight: 700; text-transform: uppercase;
    transition: all 0.2s ease;
    position: relative; z-index: 2;
    pointer-events: auto !important;
    touch-action: manipulation;
}
.fo-broadcast-entry-bar button:hover {
    filter: brightness(1.2); transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(214,48,49,0.3);
}
`;
        GM_addStyle(css);
        log('Styles injected');
    }

    // =========================================================================
    // SECTION 4: STATE MANAGEMENT
    // =========================================================================

    /** v5.0.14: Per-user sort-mode state for the target list dropdown.
     *  Persisted via GM so the choice survives page reloads. Modes:
     *    smart       → existing priority/timer sort (default)
     *    level-asc   → lowest level first
     *    level-desc  → highest level first
     *    stats-asc   → weakest FFS estimate first (no estimate → bottom)
     *    stats-desc  → strongest FFS estimate first (no estimate → bottom) */
    const SORT_MODE_KEY = 'factionops_sortmode';
    let _sortMode = (() => {
        const v = GM_getValue(SORT_MODE_KEY, 'smart');
        return ['smart', 'level-asc', 'level-desc', 'stats-asc', 'stats-desc'].includes(v) ? v : 'smart';
    })();
    function setSortMode(mode) {
        if (!['smart', 'level-asc', 'level-desc', 'stats-asc', 'stats-desc'].includes(mode)) return;
        _sortMode = mode;
        try { GM_setValue(SORT_MODE_KEY, mode); } catch (_) { }
    }
    /** Cache of FFS estimates keyed by uid. Populated as targets render
     *  (renderBspCell already triggers getFfScouterEstimate); we just
     *  observe the resolved values here. Stats-mode sort reads this
     *  cache synchronously — uids without a cached estimate sort to
     *  the bottom of stats mode. */
    const _ffsStatsCache = new Map();
    /** Single-flight guard for the stats-sort pre-fetch loop. Prevents
     *  N concurrent renderOverlay calls from each kicking off the same
     *  Promise.all when FFS data is still landing. */
    let _ffsRefreshInFlight = false;

    /** Centralised reactive state for the entire extension. */
    const state = {
        connected: false,
        connecting: false,
        jwtToken: GM_getValue('factionops_jwt', ''),
        myPlayerId: null,
        myPlayerName: null,
        myFactionId: null,
        myFactionName: null,
        myFactionPosition: null,
        enemyFactionId: null,
        enemyFactionName: null,
        onlinePlayers: [],
        ourFactionOnline: null, // { online, idle, total } from server
        // v4.9.81: per-target flight info for travel countdown — populated
        // from /api/flights/batch (server proxies FFScouter). Keyed by
        // targetId → { landingAt, destination, returning }.
        flights: {},
        flightsLastFetchedAt: 0,

        // Map of targetId -> { calledBy: { id, name }, calledAt: timestamp }
        calls: {},

        // Map of targetId -> { level, setBy: { id, name }, timestamp }
        priorities: {},

        // Map of targetId -> { status, until, description, activity }
        statuses: {},

        // Map of targetId -> [ { id, name } ] — faction members viewing that attack page
        viewers: {},

        // Chain data
        chain: {
            current: 0,
            max: 0,
            timeout: 0,
            cooldown: 0,
        },

        // Chain alert fired flag (resets when timeout goes back above threshold)
        chainAlertFired: false,
        chainPanicFired: false,

        // Map of playerId → { bars, cooldowns, name, updatedAt } — self-
        // reported faction-member dashboards (Option B cooldown panel).
        memberBars: {},

        // Faction-configured roles allowed to Shout + view Cooldowns. Null
        // until fetched from /api/broadcast/roles on auth; isLeader() falls
        // back to the hardcoded default set when null.
        allowedBroadcastRoles: null,

        // Whether a faction API key has been saved on the server
        factionKeyStored: false,

        // Custom war target (server-synced, set by leader)
        warTarget: null,
        warScores: null,  // { myScore, enemyScore } from server-side ranked war polling
        warEta: null,     // { etaTimestamp, hoursRemaining, currentTarget, calculatedAt } from server
        warEnded: false,
        warResult: null,  // 'victory' | 'defeat' | 'draw'
        warPercentage: null,

        // Strategy recommendation from server
        strategy: null,   // { recommendation, confidence, reasons, timing, enemyPeak, enemyDead, currentPhase }
        enemyActivityByHour: null, // { 0: avgOnline, 1: avgOnline, ... 23: avgOnline }

        // UI references
        ui: {
            chainBar: null,
            settingsOpen: false,
        },
    };

    // Bonus hit milestones used by the chain monitor
    const BONUS_MILESTONES = [
        10, 25, 50, 100, 250, 500, 1000, 2500,
        5000, 10000, 25000, 50000, 100000,
    ];

    /** Return the next bonus milestone at or after `count`, or null. */
    function nextBonusMilestone(count) {
        for (const m of BONUS_MILESTONES) {
            if (m >= count) return m;
        }
        return null;
    }

    // =========================================================================
    // SECTION 5: UTILITY HELPERS
    // =========================================================================

    /**
     * Normalize a raw status string to one of: 'ok', 'hospital', 'jail', 'traveling', 'fallen'.
     * Handles both server-normalized states ("traveling") and raw descriptions ("Traveling to Mexico").
     */
    function normalizeStatus(raw) {
        if (!raw) return 'ok';
        const s = raw.toLowerCase();
        if (s === 'hospital' || s.includes('hospital')) return 'hospital';
        if (s === 'federal' || s.includes('federal')) return 'federal';
        if (s === 'jail' || s.includes('jail')) return 'jail';
        if (s === 'abroad' || s.includes('abroad')) return 'abroad';
        if (s === 'traveling' || s.includes('traveling')) return 'traveling';
        if (s === 'okay' || s === 'ok') return 'ok';
        if (s === 'fallen') return 'fallen';
        return 'ok';
    }

    // ── Own-faction leak defence ─────────────────────────────────────────
    // Many paths can write into state.statuses (server poll/SSE, the
    // getwarusers fetch intercept, profile intercepts, peer relay, socket
    // frames). Every one of them is *meant* to be enemy-only, but a single
    // unguarded path — present or future — puts OUR OWN faction members in
    // the target list with FF chips and ATK buttons: rows that can never be
    // attacked, so noise at best and a misdirected call at worst. Status
    // entries carry no faction id, so once a wrong id is in there nothing
    // downstream can tell it apart.
    //
    // Rather than keep patching ingestion, we keep a positive allow-list of
    // ids that arrived from a source that is enemy-only BY CONSTRUCTION,
    // and filter again where rows are produced.
    //
    // Deliberately module-level and NOT on `state`: it is session memory,
    // must never be serialised out, and must never be overwritten by a
    // server payload landing in applyServerData.
    const confirmedEnemyIds = new Set();

    // Ids proven enemy by the getwarusers intercept, which reads the LIVE war
    // payload and checks each member's own factionID against
    // state.enemyFactionId. That is stronger evidence than anything the
    // server echoes back, so these survive the allow-list rebuild below.
    const warUsersVerifiedIds = new Set();

    // Ids proven to be OUR OWN faction's members. Kept separate from
    // state.memberBars on purpose: memberBars is a *freshness* cache for the
    // Faction Cooldowns panel — the server evicts entries older than 24h
    // (store.js getFactionBars) and the /api/faction/bars handler REPLACES
    // the map wholesale, so it shrinks. Identity must only ever grow within a
    // session, otherwise a member who goes quiet silently becomes "not
    // definitively ours" again and can be rendered as a target.
    const knownOwnMemberIds = new Set();

    // The allow-list may only be used to HIDE once we have an AUTHORITATIVE
    // roster. Verified against the server: /api/poll (routes.js:2524) and the
    // long-poll section diff (routes.js:2561) always ship the whole
    // war.enemyStatuses map, but war-status-monitor.js broadcasts PARTIAL
    // frames over SSE — `{ enemyStatuses: updates }` (:369) and
    // `{ enemyStatuses: { [targetId]: updated } }` (:748). Enforcing
    // membership off a 2-id delta would hide the other 40 enemies, which is
    // exactly the mid-chain empty target list we must never cause. So every
    // enemyStatuses frame UNIONS into the set (delta or not), and only an
    // authoritative snapshot flips this flag and unlocks enforcement.
    let enemyRosterConfirmed = false;

    // Set by the ranked-war intercept when IT flips the enemy faction, so
    // applyServerData can ignore the server's stale echo of the war we just
    // left. See the intercept and the change-detection branch for the full
    // reasoning; 2 minutes comfortably covers the server's detection lag.
    let _intentionalEnemyFlipFrom = null;
    let _intentionalEnemyFlipAt = 0;
    const ENEMY_FLIP_ECHO_GRACE_MS = 120000;

    /**
     * True when this id is one of OUR OWN faction members.
     *
     * Three sources, all definitive — a player is only ever in one faction,
     * and it is never both ours and the enemy's:
     *   1. state.myPlayerId — you cannot attack yourself. Checked FIRST and
     *      independently of any cache, because Torn's realtime feed pushes
     *      updateStatus/updateIcons frames for the logged-in user constantly
     *      (that is how your own status icons update), so without this you
     *      can be inserted into your own target list.
     *   2. knownOwnMemberIds — union-only identity set (see above).
     *   3. state.memberBars — kept as a live fallback for entries that landed
     *      before the harvest below was wired.
     */
    function isOwnFactionMember(id) {
        const key = String(id);
        if (!key) return false;
        if (state.myPlayerId && key === String(state.myPlayerId)) return true;
        if (knownOwnMemberIds.has(key)) return true;
        if (!state.memberBars) return false;
        return Object.prototype.hasOwnProperty.call(state.memberBars, key);
    }

    /**
     * Record ids proven to be our own faction's members. Called from every
     * memberBars delivery and from the getwarusers intercept's own-faction
     * half — the latter matters because memberBars only ever contains members
     * who SELF-REPORT bars, so a teammate who does not run FactionOps is in
     * nobody's memberBars and would otherwise never be recognised as ours.
     */
    function noteOwnMemberIds(ids) {
        if (!ids) return;
        for (const id of ids) {
            const key = String(id);
            if (!key) continue;
            knownOwnMemberIds.add(key);
            // Keep the two sets consistent: the relay filter reads
            // confirmedEnemyIds, so an id we now know is ours must stop
            // vouching for itself there too.
            confirmedEnemyIds.delete(key);
        }
    }

    /**
     * Record ids that came from an enemy-only-by-construction source:
     *   - data.enemyStatuses from the server (built from the war record)
     *   - the getwarusers intercept, which is faction-id guarded and
     *     fail-closed
     * Own-faction ids are rejected at add time, so even a poisoned server
     * payload cannot launder one of our own ids into "confirmed enemy".
     * Ids are String()-normalised because memberBars/statuses keys are
     * strings and one numeric key would silently break every lookup.
     */
    function confirmEnemyIds(ids) {
        if (!ids) return;
        for (const id of ids) {
            const key = String(id);
            if (!key || isOwnFactionMember(key)) continue;
            confirmedEnemyIds.add(key);
        }
    }

    /**
     * REBUILD the allow-list from an authoritative full roster instead of
     * unioning into it.
     *
     * This is the difference between a fix and a laundering machine. The
     * server's war.enemyStatuses is NOT enemy-only by construction: POST
     * /api/status writes any targetId a client reports straight into it with
     * no faction check, so an old-version client (or any future unguarded
     * relay path) can put our own members into the war record, and the next
     * poll hands them back to everyone inside `enemyStatuses`. If we only
     * ever UNIONED, that poisoned id would be allow-listed permanently for
     * the rest of the session and no purge could ever remove it.
     *
     * The server heals itself — war-status-monitor replaces war.enemyStatuses
     * wholesale from the Torn API every cycle — so rebuilding lets that heal
     * reach the client instead of being overridden by a sticky local memory.
     *
     * getwarusers-verified ids are re-added because they were proven against
     * the live war payload, which outranks a server echo.
     *
     * KNOWN, BOUNDED COST — do not "fix" this by going back to union-only: an
     * enemy who joins mid-war and is seen ONLY via Torn's WebSocket push (not
     * yet in the server's roster) drops off the allow-list here and is hidden
     * until the next monitor refetch lands, roughly one poll cycle. That is
     * acceptable; a permanently un-removable own-faction row is not.
     */
    function rebuildConfirmedEnemyIds(rosterIds) {
        confirmedEnemyIds.clear();
        confirmEnemyIds(rosterIds);
        // Re-add live-verified ids AFTER the roster, so they survive even if
        // the server's snapshot lags behind the war page.
        confirmEnemyIds(warUsersVerifiedIds);
    }

    /**
     * Drop the whole allow-list. Called wherever the enemy faction changes
     * and state.statuses is wiped — without this the set holds ids from the
     * PREVIOUS war and would wrongly vouch for them across a war change.
     */
    function resetConfirmedEnemyIds() {
        confirmedEnemyIds.clear();
        // The live-verified set is per-war too — without clearing it, the
        // previous enemy's members would be re-added by every rebuild and
        // keep vouching for themselves after the war changed, which is the
        // exact bug this reset exists to prevent. knownOwnMemberIds is NOT
        // cleared: our own roster does not change when the opponent does.
        warUsersVerifiedIds.clear();
        // Relock enforcement too — the next war's roster has not landed yet,
        // so until it does we must stay permissive rather than hide everyone.
        enemyRosterConfirmed = false;
    }

    /**
     * THE render-time predicate. Every place a target row is produced runs
     * an id through this.
     *
     * CRITICAL BALANCE — this must never hide a genuine enemy mid-war:
     *  - Own-faction identity is definitive, so an id known to be ours is
     *    always dropped (self, harvested war-page roster, or memberBars).
     *  - The allow-list is EMPTY early in a session (before the first poll
     *    returns), and unenforceable until an AUTHORITATIVE roster snapshot
     *    has landed. In either case we fall back to "not one of ours" alone
     *    rather than rendering nobody: a few permissive seconds beats an
     *    empty target list during a chain.
     */
    function isRenderableEnemyId(id) {
        const key = String(id);
        if (isOwnFactionMember(key)) return false;
        if (!enemyRosterConfirmed || confirmedEnemyIds.size === 0) return true;
        return confirmedEnemyIds.has(key);
    }

    // Purge logging state — we want ONE line per purge event (not per row,
    // not per render tick), because this log is how we find out whether the
    // leak is still happening in the field.
    let _lastPurgeSignature = '';
    let _lastPurgeLogAt = 0;

    /**
     * Remove non-enemy ids from state.statuses so the bad row does not
     * persist and existing bad state clears itself. Mirrors
     * isRenderableEnemyId exactly, including the permissive fallback.
     *
     * On "does not disappear on refresh": state.statuses is NOT persisted
     * client-side, so the row surviving a reload was never local memory — it
     * was the server echoing the id back inside enemyStatuses every poll.
     * Purging alone cannot fix that; it is fixed by (a) the relay filter in
     * flushPeerRelay, which stops us feeding own-faction ids into the war
     * record in the first place, and (b) rebuildConfirmedEnemyIds, which
     * lets the server's roster refresh drop a poisoned id from the allow-list
     * instead of us vouching for it forever.
     *
     * Idempotent by construction, which is also the answer to the merge
     * race: a poll already in flight when this runs re-inserts only ids the
     * server vouched for, mergeStatusesMonotonic independently refuses any
     * incoming id we know is ours, and anything else is simply purged again
     * on the next refresh. A genuine enemy purged during a stale window
     * comes straight back on the next poll.
     */
    function purgeNonEnemyStatuses() {
        const removed = [];
        let ours = 0;
        let unconfirmed = 0;
        for (const id of Object.keys(state.statuses)) {
            if (isOwnFactionMember(id)) {
                ours++;
                removed.push(id);
            } else if (enemyRosterConfirmed && confirmedEnemyIds.size > 0
                && !confirmedEnemyIds.has(String(id))) {
                unconfirmed++;
                removed.push(id);
            }
        }
        if (removed.length === 0) return 0;
        for (const id of removed) {
            // Only state.statuses is touched. calls/priorities are
            // server-synced and would be re-delivered anyway; deleting them
            // here would fight the server rather than fix anything.
            delete state.statuses[id];
        }
        const signature = removed.slice().sort().join(',');
        const now = Date.now();
        // Log when the offending set changes, or once a minute if the same
        // ids keep being re-injected — enough to diagnose, never a flood.
        if (signature !== _lastPurgeSignature || (now - _lastPurgeLogAt) > 60000) {
            _lastPurgeSignature = signature;
            _lastPurgeLogAt = now;
            warn('[own-faction-guard] purged ' + removed.length
                + ' non-enemy target(s) from state.statuses ('
                + ours + ' own-faction, ' + unconfirmed + ' unconfirmed)');
        }
        return removed.length;
    }

    /**
     * Merge incoming statuses into state.statuses with a monotonic guard
     * on `until` timers. Prevents server polls from bumping hospital/jail
     * timers UP when a stale Torn API cache is served.
     *
     * Rules:
     *  - If the status CHANGED (e.g. ok→hospital), accept the new until.
     *  - If the status is the same and the new until is HIGHER, keep the
     *    current (lower) value — it's been counting down locally.
     *  - Zero tolerance: timers only go down, never up (even by 1s).
     */
    // Matches enemy-status-diff.js on the server, deliberately: both sides are
    // deciding the same question -- is this `until` moving because a timer is
    // draining, or because a new one was set?
    const UNTIL_JUMP_SEC = 5;

    function mergeStatusesMonotonic(incoming) {
        for (const [targetId, newData] of Object.entries(incoming)) {
            // Race guard against purgeNonEnemyStatuses: a request already in
            // flight when a purge ran must not resurrect an id we removed.
            // Only the DEFINITIVE half of the render predicate is applied
            // here — an id we know is one of our own members can never be a
            // real enemy, so dropping it at ingestion cannot hide a target.
            // The allow-list half stays render-side, where
            // being permissive is safe; enforcing it here could silently
            // discard a genuine enemy that only ever arrives via peer relay.
            if (isOwnFactionMember(targetId)) continue;
            const existing = state.statuses[targetId];
            if (!existing) {
                state.statuses[targetId] = newData;
                rebaseStatusUntil(state.statuses[targetId]);
                maybeAutoUncallOnHospital(targetId, null, normalizeStatus(newData.status));
                continue;
            }
            const oldStatus = normalizeStatus(existing.status);
            const newStatus = normalizeStatus(newData.status);
            const statusChanged = oldStatus !== newStatus;

            // Merge all fields
            state.statuses[targetId] = {
                ...existing,
                ...newData,
            };

            if (statusChanged) {
                maybeAutoUncallOnHospital(targetId, oldStatus, newStatus);
            }

            // Monotonic guard on `until` — timer may only count DOWN while
            // the status is unchanged. Previously this only applied when
            // existing.until > 0, so once the local tick reached 0 a
            // slightly-stale server push (Torn cache lag: e.g. "2s left")
            // would bump the countdown back up to 2s, causing the Next Up
            // bar to visibly rebound 0 → 2 → tick down → 0 → rebound again
            // until Torn's cache finally reported the release.
            if (!statusChanged && Object.prototype.hasOwnProperty.call(newData, 'until')) {
                const existingUntil = typeof existing.until === 'number' ? existing.until : 0;
                const newUntil = typeof newData.until === 'number' ? newData.until : existingUntil;
                // A LARGE jump upward is not cache lag, it is a new hospital
                // sentence stacked on the old one -- ipecac and a wrong blood
                // bag SET the timer to ~60-90 min rather than adding to it, and
                // a defender about to be released uses exactly that to dodge.
                // Status stays 'hospital' throughout, so statusChanged is false
                // and the monotonic guard below would silently discard it: the
                // countdown would run to zero on a target with 50 minutes left.
                // The server already treats this as news (UNTIL_JUMP_SEC in
                // enemy-status-diff.js); this is the client half of that.
                state.statuses[targetId].until = (newUntil > existingUntil + UNTIL_JUMP_SEC)
                    ? newUntil
                    : Math.min(existingUntil, newUntil);
            }
            // v4.9.80: stamp releaseAt so render paths read from an
            // absolute timestamp instead of decrementing a drifting
            // duration each tick. Chose releaseAt = min(existing, new)
            // to mirror the monotonic-down guard above — a later push
            // from Torn's cache can't bump the release time later.
            {
                const curSec = _nowSec();
                const existingReleaseAt = typeof existing.releaseAt === 'number' ? existing.releaseAt : 0;
                const incomingUntil = typeof newData.until === 'number' ? newData.until : 0;
                const incomingReleaseAt = incomingUntil > 0 ? curSec + incomingUntil : 0;
                let merged = 0;
                if (statusChanged) {
                    // Fresh status → trust incoming absolutely.
                    merged = incomingReleaseAt;
                } else if (existingReleaseAt > 0 && incomingReleaseAt > 0) {
                    // Same escape as the `until` guard above: a release time
                    // that moves substantially LATER is a re-hospitalisation,
                    // not a stale push, and min() would throw it away.
                    merged = incomingReleaseAt > existingReleaseAt + UNTIL_JUMP_SEC
                        ? incomingReleaseAt
                        : Math.min(existingReleaseAt, incomingReleaseAt);
                } else {
                    merged = incomingReleaseAt || existingReleaseAt;
                }
                if (merged > 0) state.statuses[targetId].releaseAt = merged;
                else delete state.statuses[targetId].releaseAt;
            }
        }
    }

    /**
     * Parse a duration out of a human-readable string from Torn tooltips.
     * Handles: "1h 23m", "45 minutes", "In hospital for 2 hours 10 mins",
     * "45:23" (MM:SS), "1:23:45" (HH:MM:SS). Returns seconds or 0.
     */
    function parseDurationFromText(text) {
        if (!text) return 0;
        const t = String(text).toLowerCase();
        // HH:MM:SS or MM:SS forms
        const clock = t.match(/(\d+):(\d{2})(?::(\d{2}))?/);
        if (clock) {
            const a = Number(clock[1]) || 0;
            const b = Number(clock[2]) || 0;
            const c = Number(clock[3]) || 0;
            if (clock[3] != null) return a * 3600 + b * 60 + c;
            // Two-group form: MM:SS if first < 60, else HH:MM
            return a < 60 ? a * 60 + b : a * 3600 + b * 60;
        }
        // "1h 23m" / "1 hour 23 minutes"
        const hm = t.match(/(\d+)\s*(?:hour|hr|h)[a-z]*\s*(?:(\d+)\s*(?:minute|min|m))?/);
        if (hm) return (Number(hm[1]) || 0) * 3600 + (Number(hm[2]) || 0) * 60;
        // "45 minutes" / "45 mins" / "45m"
        const mOnly = t.match(/(\d+)\s*(?:minute|min|m)\b/);
        if (mOnly) return Number(mOnly[1]) * 60;
        return 0;
    }

    /**
     * Build a name anchor that mimics Torn's native `.user.name` element as
     * closely as possible by cloning a live example from the page. This
     * preserves whatever wrapper/sub-span structure Torn's own profile-card
     * handler expects — even when that structure changes between Torn
     * releases. Player-specific sub-elements (honor icons, cipher badges,
     * rank chips) are stripped before cloning so we don't leak someone
     * else's data into our overlay row.
     */
    let _nativeNameTemplate = null;
    function getNativeNameTemplate() {
        if (_nativeNameTemplate) return _nativeNameTemplate.cloneNode(true);
        const src = document.querySelector('a.user.name[href^="/profiles.php"]:not(.fo-name):not([data-fo-built])');
        if (!src) return null;
        const template = src.cloneNode(true);
        // Strip player-specific child content
        template.querySelectorAll(
            '.user-information-cipher, .honor-text-wrap, [class*="honor"], [class*="rank"], svg, img'
        ).forEach((el) => el.remove());
        _nativeNameTemplate = template;
        return template.cloneNode(true);
    }

    function buildNameAnchor(playerId, playerName) {
        const template = getNativeNameTemplate();
        let anchor;
        if (template) {
            template.setAttribute('href', `/profiles.php?XID=${playerId}`);
            template.setAttribute('data-placeholder', `${playerName || 'Unknown'} [${playerId}]`);
            template.setAttribute('data-fo-built', '1');
            template.classList.add('fo-name');
            template.style.textDecoration = 'none';
            template.style.color = 'inherit';
            const inner = template.querySelector('.name') || template.querySelector('span');
            if (inner) {
                inner.textContent = playerName || `#${playerId}`;
            } else {
                template.textContent = playerName || `#${playerId}`;
            }
            anchor = template;
        } else {
            // Fallback: manual construction matching the most common pattern.
            anchor = document.createElement('a');
            anchor.className = 'fo-name user name';
            anchor.setAttribute('href', `/profiles.php?XID=${playerId}`);
            anchor.dataset.placeholder = `${playerName || 'Unknown'} [${playerId}]`;
            anchor.style.textDecoration = 'none';
            anchor.style.color = 'inherit';
            const inner = document.createElement('span');
            inner.className = 'name';
            inner.textContent = playerName || `#${playerId}`;
            anchor.appendChild(inner);
        }

        // Copy Torn's native jQuery event handlers onto this anchor. Torn
        // typically binds mouse/touch handlers directly to each `.user.name`
        // element at page load (not via document delegation), so cloned
        // elements don't inherit them. When jQuery is exposed on window, we
        // can read the handler table from a live native element via
        // `$._data(el, 'events')` and re-attach each binding.
        copyNativeUserNameHandlers(anchor);

        return anchor;
    }

    function copyNativeUserNameHandlers(target) {
        try {
            const jq = window.jQuery || window.$;
            if (!jq || !jq._data) return false;
            const source = document.querySelector('a.user.name[href^="/profiles.php"]:not(.fo-name):not([data-fo-built])');
            if (!source) return false;
            const events = jq._data(source, 'events');
            if (!events) return false;
            for (const type in events) {
                const list = events[type];
                if (!list) continue;
                for (const h of list) {
                    const ns = h.namespace ? `.${h.namespace}` : '';
                    try {
                        if (h.selector) {
                            jq(target).on(type + ns, h.selector, h.data, h.handler);
                        } else {
                            jq(target).on(type + ns, h.data, h.handler);
                        }
                    } catch (_) { /* one handler's failure shouldn't block others */ }
                }
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Auto-uncall hook: when a target that I've called transitions into
     * hospital (from any detection path — server push, attacks-feed, peer
     * relay, DOM reader, intercepted attack result), clear my call. Scoped
     * to my own calls so a teammate's call is never stomped. Runs from
     * mergeStatusesMonotonic so it sits at the single chokepoint where all
     * status updates flow through, instead of sprinkled across every
     * detection path.
     */
    function maybeAutoUncallOnHospital(targetId, oldStatus, newStatus) {
        if (newStatus !== 'hospital') return;
        if (oldStatus === 'hospital') return; // not a transition
        const call = state.calls && state.calls[targetId];
        if (!call) {
            log(`[auto-uncall] #${targetId} → hospital: no call exists`);
            return;
        }
        if (!call.calledBy) {
            log(`[auto-uncall] #${targetId} → hospital: call has no calledBy`);
            return;
        }
        // v5.0.82: deal calls persist through hospital. They have a
        // 2-hour DEAL_TIMEOUT (vs 15-min CALL_TIMEOUT) and exist
        // specifically to claim a target for the next attack window,
        // which means they need to survive the hospital trip the deal
        // was likely intending to set up.
        if (call.isDeal) {
            log(`[auto-uncall] #${targetId} → hospital: deal call, persisting`);
            return;
        }
        const caller = String(call.calledBy.id);
        const me = String(state.myPlayerId || '');
        if (caller !== me) {
            log(`[auto-uncall] #${targetId} → hospital: call is ${caller}'s (I am ${me}), skipping`);
            return;
        }
        try {
            emitUncallTarget(targetId);
            log(`[auto-uncall] #${targetId} hospitalized → cleared my call`);
        } catch (e) {
            warn(`[auto-uncall] failed for #${targetId}:`, e);
        }
    }

    // v4.9.80: helpers to ground hospital / jail timers on an absolute unix
    // release timestamp instead of a locally-decremented duration. Prevents
    // tick-drift (dt floating-point accumulation) + server-poll rebounds that
    // required the wall of monotonic-guard patches (3.7.6, 3.8.3, 3.8.4, 3.8.5).
    //
    // v5.1.21 (2026-05-24): prefer Torn's server-synced clock via
    // window.getCurrentTimestamp() so our hospital/jail countdowns match
    // Torn's own UI exactly — no drift from a wrong device clock. Handles
    // both seconds and milliseconds return shapes defensively, and falls
    // back to local time before Torn's bundle has loaded.
    function _nowSec() {
        try {
            const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
            if (typeof w.getCurrentTimestamp === 'function') {
                const t = w.getCurrentTimestamp();
                if (Number.isFinite(t)) {
                    if (t > 1e12) return Math.floor(t / 1000); // returned ms
                    if (t > 1e9) return Math.floor(t);         // returned sec
                }
            }
        } catch (_) { }
        return Math.floor(Date.now() / 1000);
    }
    function rebaseStatusUntil(s) {
        // Call every time `until` is written from a fresh source (merge,
        // init, DOM parse). Records the absolute release time so later
        // reads don't drift.
        if (!s) return;
        const u = Number(s.until);
        if (Number.isFinite(u) && u > 0) {
            s.releaseAt = _nowSec() + u;
        } else {
            delete s.releaseAt;
        }
    }
    function statusRemainingSec(s) {
        if (!s) return 0;
        if (typeof s.releaseAt === 'number' && s.releaseAt > 0) {
            return Math.max(0, s.releaseAt - _nowSec());
        }
        return Math.max(0, Number(s.until) || 0);
    }

    /** Format seconds into compact timer: "Xd Yh", "Xh Ym", or "Xm Ys". */
    function formatTimer(seconds) {
        if (seconds <= 0) return '0s';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s < 10 ? '0' : ''}${s}s`;
        return `${s}s`;
    }

    /** Debounce helper — returns a debounced wrapper. */
    function debounce(fn, ms) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    // ── Peer Relay: report observed enemy status changes to server ──────────
    // Batches intercepted status changes and sends them to the server every 2s.
    // Other connected clients receive the update instantly via SSE/Socket.IO,
    // giving near-real-time enemy status without any Torn API calls.
    let peerRelayBatch = {};
    let peerRelayTimer = null;

    // v5.1.9: WebSocket intercept — monkey-patch window.WebSocket to
    // capture Torn's own real-time push events (the same mechanism
    // CAT script v3 uses for ~100ms hospital detection). Torn sends
    // updateStatus messages via a Centrifugo-style envelope:
    //   { push: { pub: { data: { message: { namespaces: { users: {
    //       actions: { updateStatus: { userId, status: { text, until, ... } } }
    //   } } } } } } }
    // Deep-walk for 'updateStatus' instead of hardcoded path so a
    // Torn restructuring won't immediately break us. Relays through
    // the existing mergeStatusesMonotonic + queuePeerRelay so all the
    // dedup / monotonic / peer-broadcast plumbing applies.
    function deepFindActions(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 8) return null;
        if (obj.actions && typeof obj.actions === 'object') return obj.actions;
        for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (v && typeof v === 'object') {
                const found = deepFindActions(v, depth + 1);
                if (found) return found;
            }
        }
        return null;
    }
    function _normalizeStatusText(t) {
        const s = String(t || '').toLowerCase();
        if (s.includes('hospital')) return 'hospital';
        if (s.includes('travel') || s.includes('abroad')) return 'traveling';
        if (s.includes('jail')) return 'jail';
        if (s.includes('federal')) return 'federal';
        if (s.includes('fallen')) return 'fallen';
        return 'ok';
    }
    // v5.1.10: hospital-countdown regex matching the icon HTML Torn
    // embeds in updateIcons WS messages and getwarusers responses.
    // Handles raw quotes + HTML-entity-escaped ones. Pattern mirrors
    // CAT script's HOSP_REGEX for compatibility.
    const HOSP_ICON_RE = /Hospital[^>]*data-time=(?:'|&#039;|&quot;|")(\d+)(?:'|&#039;|&quot;|")/i;

    // v5.1.11: buffer-while-hidden queue for WS messages. When the tab
    // is in the background on desktop, queue incoming WS frames instead
    // of processing immediately — saves background CPU + DOM thrash
    // and lets us batch the catch-up smoothly on focus return.
    // PDA bypasses this entirely (per v5.0.89 memory note —
    // document.hidden lies in the PDA WebView; always process there).
    const _wsHiddenQueue = [];
    const WS_QUEUE_MAX = 200;
    const WS_DRAIN_PER_RAF = 10;
    let _wsDraining = false;
    function _wsIsHiddenForBuffer() {
        if (IS_PDA) return false;
        return typeof document.hidden === 'boolean' && document.hidden;
    }
    function _wsDrainQueue() {
        if (_wsDraining || _wsHiddenQueue.length === 0) return;
        _wsDraining = true;
        const tick = () => {
            const slice = _wsHiddenQueue.splice(0, WS_DRAIN_PER_RAF);
            for (const data of slice) {
                try { _processWsFrame(data); } catch (_) { }
            }
            if (_wsHiddenQueue.length > 0) {
                requestAnimationFrame(tick);
            } else {
                _wsDraining = false;
            }
        };
        requestAnimationFrame(tick);
    }
    if (typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && _wsHiddenQueue.length > 0) {
                log('[ws-intercept] draining', _wsHiddenQueue.length, 'queued WS frames');
                _wsDrainQueue();
            }
        });
    }

    function handleTornWsMessage(event) {
        const raw = event && event.data;
        if (typeof raw !== 'string' || raw.length < 8 || raw[0] !== '{') return;
        // v5.1.11: queue while tab hidden, process immediately when visible
        if (_wsIsHiddenForBuffer()) {
            _wsHiddenQueue.push(raw);
            if (_wsHiddenQueue.length > WS_QUEUE_MAX) {
                // LRU: drop oldest. Most-recent state is what matters
                // on resume — older state is superseded by mergeStatuses-
                // Monotonic's timestamp guard anyway.
                _wsHiddenQueue.splice(0, _wsHiddenQueue.length - WS_QUEUE_MAX);
            }
            return;
        }
        _processWsFrame(raw);
    }

    function _processWsFrame(raw) {
        try {
            let json;
            try { json = JSON.parse(raw); }
            catch (_) {
                // Torn occasionally ships glued JSON ('{...}{...}')
                const m = String(_).match(/position (\d+)/);
                if (!m) return;
                try { json = JSON.parse(raw.substring(0, parseInt(m[1], 10))); }
                catch (__) { return; }
            }
            const actions = deepFindActions(json);
            if (!actions) return;

            // updateStatus — status text + absolute until timestamp
            if (actions.updateStatus) {
                const u = actions.updateStatus;
                const uid = String(u.userId || u.user_id || '');
                if (uid) {
                    const st = u.status || {};
                    const text = String(st.text || st.status || '');
                    if (text) {
                        const normalized = _normalizeStatusText(text);
                        // until: absolute unix-seconds timestamp from Torn. Falls
                        // back to updateAt for hospital pop targets if until missing.
                        const until = Number(st.until)
                            || (normalized === 'hospital' ? Number(st.updateAt) : 0)
                            || 0;
                        const batch = {};
                        const entry = { status: normalized, until };
                        if (st.details) entry.description = String(st.details);
                        batch[uid] = entry;
                        try { mergeStatusesMonotonic(batch); } catch (_) { }
                        try { queuePeerRelay(batch); } catch (_) { }
                    }
                }
            }

            // v5.1.10 (B): updateIcons — Torn pushes icon HTML for each
            // user. The Hospital icon carries data-time="N" (seconds
            // remaining). Gives us the exact countdown that updateStatus
            // sometimes lacks. Data-time is RELATIVE to the time the WS
            // message was sent, so we convert to absolute by adding to
            // current clock — accurate within a few hundred ms.
            if (actions.updateIcons) {
                const u = actions.updateIcons;
                const uid = String(u.userId || u.user_id || '');
                const html = String(u.icons || '');
                if (uid && html) {
                    const m = html.match(HOSP_ICON_RE);
                    if (m) {
                        const seconds = parseInt(m[1], 10);
                        if (Number.isFinite(seconds) && seconds > 0) {
                            const untilSec = Math.floor(Date.now() / 1000) + seconds;
                            const batch = { [uid]: { status: 'hospital', until: untilSec } };
                            try { mergeStatusesMonotonic(batch); } catch (_) { }
                            try { queuePeerRelay(batch); } catch (_) { }
                        }
                    }
                }
            }
        } catch (_) { /* never throw from WS handler */ }
    }

    // v5.1.10 (A): fetch interceptor for Torn war-page AJAX responses.
    // When the user opens the war page, Torn itself fetches
    // /page.php?sid=factionsUsers&step=getwarusers&warID=... which returns
    // the full enemy faction member list (names + levels + statuses +
    // areas) in one shot. Intercept the response and feed the data into
    // mergeStatusesMonotonic + queuePeerRelay so we get every enemy's
    // current status for free — no Torn API call from our key needed.
    let _fetchInterceptorInstalled = false;
    function installTornFetchInterceptor() {
        if (_fetchInterceptorInstalled) return;
        _fetchInterceptorInstalled = true;
        const tw = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        if (!tw || typeof tw.fetch !== 'function') return;
        const originalFetch = tw.fetch.bind(tw);
        try {
            tw.fetch = async function patchedFetch(...args) {
                const response = await originalFetch(...args);
                try {
                    let url = '';
                    const firstArg = args[0];
                    if (typeof firstArg === 'string') url = firstArg;
                    else if (firstArg && typeof firstArg === 'object' && 'url' in firstArg) url = firstArg.url;
                    if (url && url.includes('step=getwarusers')) {
                        // Clone so the page's own consumer still gets the
                        // body. .text() then JSON.parse to avoid auto-JSON
                        // failures when content-type is unexpected.
                        const clone = response.clone();
                        clone.text().then(text => {
                            if (!text || text[0] !== '{') return;
                            try {
                                const json = JSON.parse(text);
                                const wd = json && json.warDesc;
                                const members = wd && Array.isArray(wd.members) ? wd.members : [];
                                if (members.length === 0) return;
                                const batch = {};
                                let count = 0;
                                for (const m of members) {
                                    const uid = String(m.userID || m.userid || '');
                                    if (!uid) continue;
                                    // getwarusers returns BOTH factions' members in one flat
                                    // array. Filter to the enemy only — without this our own
                                    // faction members leak straight into state.statuses and
                                    // render as targets. Each member carries factionID.
                                    const fid = String(m.factionID || m.faction_id || m.factionId || '');
                                    // Fail closed: only render a member we can positively confirm is the
                                    // enemy faction. Without a known enemyFactionId (no war context — e.g.
                                    // stream not connected / key rate-limited so myFactionId never loaded),
                                    // render NOBODY rather than leaking our own members in as attack targets.
                                    if (state.myFactionId && fid === String(state.myFactionId)) {
                                        // Harvest the OWN-faction half. This is the
                                        // only client-side source of own-member ids
                                        // that does not depend on the member running
                                        // FactionOps: memberBars holds only members
                                        // who self-report bars, so a teammate who
                                        // does not use the script is in nobody's
                                        // memberBars and would otherwise never be
                                        // recognised as ours. Live war payload, so
                                        // it is definitive.
                                        try { noteOwnMemberIds([uid]); } catch (_) { }
                                        continue;
                                    }
                                    if (!state.enemyFactionId || fid !== String(state.enemyFactionId)) continue;
                                    // Proven enemy against the LIVE war payload. That
                                    // outranks any cached identity: state.memberBars
                                    // keeps entries for 24h, so a player who left us
                                    // for the opponent (defector, lent merc, ordinary
                                    // roster churn between back-to-back wars) would
                                    // still look like ours and be hidden — the one
                                    // way a real, attackable enemy could vanish.
                                    // Correct both caches here.
                                    knownOwnMemberIds.delete(uid);
                                    if (state.memberBars) delete state.memberBars[uid];
                                    warUsersVerifiedIds.add(uid);
                                    const st = m.status || {};
                                    const text = String(st.text || st.status || '');
                                    if (!text) continue;
                                    const normalized = _normalizeStatusText(text);
                                    const entry = { status: normalized };
                                    if (m.playername) entry.name = String(m.playername);
                                    if (m.level != null) entry.level = Number(m.level);
                                    if (st.until) entry.until = Number(st.until);
                                    batch[uid] = entry;
                                    count++;
                                }
                                if (count > 0) {
                                    log('[fetch-intercept] getwarusers captured', count, 'members');
                                    // Enemy-only by construction: every uid in
                                    // `batch` passed the fail-closed faction-id
                                    // check above. Confirm BEFORE merging so the
                                    // render filter already vouches for them.
                                    // Union only — deliberately does NOT unlock
                                    // the hide-unconfirmed rule, since we can't
                                    // prove warDesc.members is never paginated.
                                    try { confirmEnemyIds(Object.keys(batch)); } catch (_) { }
                                    try { mergeStatusesMonotonic(batch); } catch (_) { }
                                    try { queuePeerRelay(batch); } catch (_) { }
                                }
                            } catch (_) { /* parse error — skip */ }
                        }).catch(() => { });
                    }
                } catch (_) { /* don't break the page's fetch */ }
                return response;
            };
            log('[fetch-intercept] installed — watching for getwarusers');
        } catch (e) {
            warn('[fetch-intercept] install failed:', e && e.message);
        }
    }
    let _wsInterceptorInstalled = false;
    function installTornWsInterceptor() {
        if (_wsInterceptorInstalled) return;
        _wsInterceptorInstalled = true;
        // Per memory note feedback_tampermonkey_unsafewindow.md: patching
        // window.WebSocket from the userscript sandbox doesn't reach the
        // page's own WebSocket constructor — must use unsafeWindow.
        const tw = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        if (!tw || !tw.WebSocket) return;
        const OriginalWS = tw.WebSocket;
        try {
            tw.WebSocket = function PatchedWS(...args) {
                const sock = new OriginalWS(...args);
                try { sock.addEventListener('message', handleTornWsMessage); } catch (_) { }
                return sock;
            };
            // Preserve constants + prototype so feature-detect code
            // (e.g. WebSocket.OPEN === 1) keeps working.
            Object.defineProperties(tw.WebSocket, {
                prototype: { value: OriginalWS.prototype },
                CONNECTING: { value: OriginalWS.CONNECTING },
                OPEN: { value: OriginalWS.OPEN },
                CLOSING: { value: OriginalWS.CLOSING },
                CLOSED: { value: OriginalWS.CLOSED },
            });
            log('[ws-intercept] installed — listening for Torn status push events');
        } catch (e) {
            warn('[ws-intercept] install failed:', e && e.message);
        }
    }

    function queuePeerRelay(statusBatch) {
        if (!statusBatch || Object.keys(statusBatch).length === 0) return;
        Object.assign(peerRelayBatch, statusBatch);
        if (peerRelayTimer) return; // already scheduled
        // CommandCenter: shortened from 2000ms so peer-observed status
        // changes (e.g. a teammate viewing a target that just got
        // hospitalized) reach the rest of the faction faster.
        peerRelayTimer = setTimeout(flushPeerRelay, 500);
    }

    function flushPeerRelay(viaKeepalive) {
        peerRelayTimer = null;
        const batch = peerRelayBatch;
        peerRelayBatch = {};
        if (Object.keys(batch).length === 0) return;

        // ── Own-faction leak defence: the upstream chokepoint ──
        // Every queuePeerRelay() call site funnels through here, including
        // the pagehide keepalive flush, so this one filter covers them all.
        //
        // This matters more than any render-side filter: POST /api/status
        // merges whatever targetIds we send straight into war.enemyStatuses
        // with no faction check, and the next /api/poll hands that map back
        // to EVERY member of the faction. So an unfiltered relay does not
        // just pollute this tab — it publishes our own members to the whole
        // war as "enemies", on every teammate's screen.
        //
        // The WebSocket intercept is the path that makes this concrete: it
        // relays whatever userId Torn pushes for the page you are looking at,
        // which on the war page includes our own faction's rows.
        //
        // STRICT here, deliberately, unlike the render filter: an id must be
        // positively confirmed enemy, not merely "not known to be ours".
        // Being strict is safe on the relay specifically because dropping a
        // relay costs nothing — the server runs its own pollers and
        // war-status-monitor re-fetches the whole enemy roster every cycle,
        // so a dropped observation is re-derived within one cycle. Being
        // strict at RENDER time would be unsafe, which is why the two
        // predicates differ.
        //
        // Filtering at flush rather than at queue time is intentional: the
        // queue debounces for 500ms, so a first poll landing inside that
        // window can still rescue an observation instead of dropping it.
        for (const id of Object.keys(batch)) {
            if (confirmedEnemyIds.has(String(id)) && !isOwnFactionMember(id)) continue;
            delete batch[id];
        }
        if (Object.keys(batch).length === 0) return;
        const warId = deriveWarId();
        if (!warId || !state.jwtToken) return;
        log(`[peer-relay] Sending ${Object.keys(batch).length} status updates${viaKeepalive ? ' (keepalive)' : ''}`);
        // v5.1.4: use fetch({ keepalive: true }) when the page is
        // unloading. Survives tab close (browser holds the request
        // open past page death) AND supports the Authorization header
        // that /api/status requires (unlike navigator.sendBeacon which
        // can't set custom headers). Falls back to postAction if
        // keepalive fetch fails or isn't supported.
        if (viaKeepalive && typeof fetch === 'function') {
            try {
                fetch(CONFIG.SERVER_URL + '/api/status', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + state.jwtToken,
                    },
                    body: JSON.stringify({ warId, statuses: batch }),
                    keepalive: true,
                }).catch(() => { });
                return;
            } catch (_) { /* fall through to standard postAction */ }
        }
        postAction('/api/status', { warId, statuses: batch }).catch(err => {
            warn('[peer-relay] Failed to send:', err.message);
        });
    }

    // v5.1.4: flush pending peer-relay on tab close. Users who attack
    // in a new tab and close it within the 500ms debounce window were
    // losing their hospital relay → server never broadcast → teammates
    // and the user's own war tab waited for the 15-60s server polls
    // instead of the ~2s peer-relay path. fetch({ keepalive: true })
    // signals the browser to keep the request alive past unload.
    if (typeof window.addEventListener === 'function') {
        const flushOnUnload = () => {
            if (peerRelayTimer) { clearTimeout(peerRelayTimer); peerRelayTimer = null; }
            if (Object.keys(peerRelayBatch).length > 0) flushPeerRelay(true);
        };
        // pagehide fires reliably on both tab close AND mobile Safari
        // going-to-background where beforeunload doesn't. beforeunload
        // is the fallback for older browsers.
        window.addEventListener('pagehide', flushOnUnload);
        window.addEventListener('beforeunload', flushOnUnload);
    }

    /** Extract a Torn player ID from a URL or href string. */
    function extractPlayerId(url) {
        if (!url) return null;
        const m = url.match(/(?:user2ID=|XID=|user=|userId=|ID=)(\d+)/i)
            || url.match(/profiles\.php\?XID=(\d+)/)
            || url.match(/loader\.php\?sid=attack&user2ID=(\d+)/);
        return m ? m[1] : null;
    }

    /** Extract target ID from the current attack page URL or DOM. */
    function getAttackTargetId() {
        // 1. Try URL first
        const m = window.location.href.match(/(?:user2ID=|XID=|user=|userId=|ID=)(\d+)/i);
        if (m) return m[1];

        // 2. Try DOM (Torn React attack page hides ID from URL when resuming)
        // Look for defender's profile link
        const defenderLinks = document.querySelectorAll('[class*="defender"] a[href*="XID="], div[class^="playerArea"] a[href*="XID="]');
        for (const link of defenderLinks) {
            const href = link.getAttribute('href');
            if (href) {
                const domMatch = href.match(/XID=(\d+)/i);
                if (domMatch) return domMatch[1];
            }
        }

        // 3. Fallback to extracting from the player image URL
        const images = document.querySelectorAll('img[src*="images.torn.com/profile"]');
        for (const img of images) {
            // Usually attackers are on the left, defenders on the right. We just want any ID that isn't the user's
            const src = img.getAttribute('src');
            const imgMatch = src.match(/\/(\d+)\//);
            if (imgMatch && imgMatch[1] !== state.myPlayerId) {
                return imgMatch[1];
            }
        }

        return null;
    }

    /** Safely parse JSON, returning null on failure. */
    function safeParse(text) {
        try { return JSON.parse(text); } catch { return null; }
    }

    // ── BSP / FFS stat helpers ──────────────────────────────────────────────

    /**
     * Read BSP prediction from localStorage (sync).
     * Key: tdup.battleStatsPredictor.cache.prediction.<userId>
     * Returns the parsed object (has .TBS) or null.
     */
    // v5.0.88: memoize BSP reads. Each renderOverlay call hits this for
    // every target (90+ targets × 2 render functions per row = ~180
    // localStorage reads + JSON.parse calls per render pass). With the
    // refreshAllRows debounce we're down to 1-2 renders/sec under load,
    // but those still add up — and BSP writes are rare (cache prediction
    // every few minutes per profile visit), so a 30s in-memory cache is
    // safe. Cache miss = original behavior + write; cache hit = no I/O.
    const _bspMemo = new Map(); // userId -> { data, fetchedAt }
    const BSP_MEMO_TTL_MS = 30 * 1000;
    // v5.0.92: faction-shared BSP pool, fetched from the warboard server.
    // Filled in by refreshSharedBsp() on init + periodically. Indexed by
    // userId so a single lookup mirrors the localStorage shape.
    const _sharedBsp = new Map(); // userId -> { TBS, sharedByName, updatedAt }
    function fetchBspPrediction(userId) {
        const now = Date.now();
        const cached = _bspMemo.get(userId);
        if (cached && (now - cached.fetchedAt) < BSP_MEMO_TTL_MS) {
            return cached.data;
        }
        try {
            const raw = localStorage.getItem(
                'tdup.battleStatsPredictor.cache.prediction.' + userId
            );
            if (raw) {
                const pred = JSON.parse(raw);
                const value = pred || null;
                _bspMemo.set(userId, { data: value, fetchedAt: now });
                if (value) return value;
            }
        } catch (e) { /* fall through */ }
        // v5.0.92: no local BSP for this target — try the faction-shared
        // pool. A teammate with a richer BSP cache may have uploaded
        // this entry. Shape matches local: { TBS, ... }.
        const shared = _sharedBsp.get(String(userId));
        if (shared && Number.isFinite(shared.TBS) && shared.TBS > 0) {
            const value = { TBS: shared.TBS, _source: 'shared' };
            _bspMemo.set(userId, { data: value, fetchedAt: now });
            return value;
        }
        _bspMemo.set(userId, { data: null, fetchedAt: now });
        return null;
    }

    // v5.0.92: GET the faction's pooled BSP cache and seed _sharedBsp.
    // Called on script init and on a slow timer (every 30 min). Cheap —
    // typically <20KB JSON, all numeric fields. Also invalidates the
    // _bspMemo so the next render picks up new entries.
    function refreshSharedBsp() {
        if (!state.jwtToken) return;
        const url = CONFIG.SERVER_URL + '/api/faction/bsp-share';
        httpRequest({
            method: 'GET',
            url,
            headers: { Authorization: 'Bearer ' + state.jwtToken },
            onload(res) {
                try {
                    if (res.status !== 200) return;
                    const data = JSON.parse(res.responseText);
                    if (!data || !data.entries) return;
                    let added = 0;
                    for (const [uid, entry] of Object.entries(data.entries)) {
                        if (!entry || !Number.isFinite(Number(entry.TBS))) continue;
                        _sharedBsp.set(String(uid), {
                            TBS: Number(entry.TBS),
                            sharedByName: entry.sharedByName || '?',
                            updatedAt: entry.updatedAt || 0,
                        });
                        added++;
                    }
                    _bspMemo.clear(); // invalidate so next render sees fresh data
                    log('shared BSP refreshed —', added, 'entries from faction pool');
                } catch (_) { /* silent */ }
            },
            onerror() { /* silent */ },
        });
    }

    // v5.0.92: upload local BSP entries for current war targets to the
    // faction-shared pool. Opt-in via CONFIG.SHARE_BSP. Only sends
    // entries the user actually has locally (no point uploading misses).
    function uploadLocalBspToShared() {
        if (!CONFIG.SHARE_BSP) return;
        if (!state.jwtToken) return;
        const targetIds = Object.keys(state.statuses || {});
        if (targetIds.length === 0) return;
        const entries = {};
        let count = 0;
        for (const uid of targetIds) {
            try {
                const raw = localStorage.getItem(
                    'tdup.battleStatsPredictor.cache.prediction.' + uid
                );
                if (!raw) continue;
                const pred = JSON.parse(raw);
                if (!pred || pred.TBS == null) continue;
                const tbs = Number(pred.TBS);
                if (!Number.isFinite(tbs) || tbs <= 0) continue;
                entries[uid] = { TBS: Math.round(tbs) };
                count++;
            } catch (_) { /* skip */ }
        }
        if (count === 0) return;
        const url = CONFIG.SERVER_URL + '/api/faction/bsp-share';
        httpRequest({
            method: 'POST',
            url,
            headers: {
                Authorization: 'Bearer ' + state.jwtToken,
                'Content-Type': 'application/json',
            },
            data: JSON.stringify({ entries }),
            onload(res) {
                if (res.status === 200) log('uploaded', count, 'BSP entries to faction pool');
            },
            onerror() { /* silent */ },
        });
    }

    /**
     * Read FF Scouter estimate from IndexedDB (async).
     * DB "ffscouter-cache", store "cache", key = parseInt(userId).
     * Resolves { total, human } or null.
     */
    function getFfScouterEstimate(userId) {
        return new Promise((resolve) => {
            try {
                const req = window.indexedDB.open('ffscouter-cache', 1);
                req.onerror = () => resolve(null);
                req.onsuccess = () => {
                    try {
                        const db = req.result;
                        const tx = db.transaction('cache', 'readonly');
                        const store = tx.objectStore('cache');
                        const get = store.get(parseInt(userId, 10));
                        // v5.0.17: ALWAYS populate _ffsStatsCache (with a
                        // value OR null) so missing-data uids don't trigger
                        // an infinite stats-sort re-fetch loop. The freeze
                        // in v5.0.16 happened because uids with no FFS data
                        // never got cached, so every renderOverlay() saw
                        // them as "still missing" and kicked off another
                        // Promise.all → re-render → repeat.
                        const _markCache = (val) => {
                            try { _ffsStatsCache.set(String(userId), val); } catch (_) { }
                        };
                        get.onerror = () => { _markCache(null); resolve(null); };
                        get.onsuccess = () => {
                            const r = get.result;
                            if (!r || r.no_data || typeof r.bs_estimate === 'undefined') {
                                _markCache(null);
                                resolve(null);
                            } else {
                                _markCache(Number(r.bs_estimate) || 0);
                                resolve({
                                    total: r.bs_estimate,
                                    human: r.bs_estimate_human || null,
                                });
                            }
                        };
                    } catch (_) {
                        resolve(null);
                    }
                };
            } catch (_) {
                resolve(null);
            }
        });
    }

    /**
     * Format a raw battle-stats number into a compact human string.
     * e.g. 3_200_000_000 → "3.20B", 750_000_000 → "750M".
     */
    function formatBspNumber(n) {
        if (n == null || isNaN(n)) return '\u2014';
        if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
        if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
        return String(Math.round(n));
    }

    /**
     * Classify a raw stat number into a tier for colour coding.
     * S (red, 3 B+), A (yellow, 1-3 B), B (green, 500 M-1 B), C (gray, <500 M).
     */
    function bspTier(n) {
        if (n == null || isNaN(n)) return 'unknown';
        if (n >= 3e9) return 's';
        if (n >= 1e9) return 'a';
        if (n >= 5e8) return 'b';
        return 'c';
    }

    // ── Fair Fight (ffscouter.com) ─────────────────────────────────────────

    /** In-memory FF cache: targetId → { value, keyFp, lastUpdated, bsHuman, fetchedAt } */
    const ffCache = {};
    const FF_CACHE_TTL = 60 * 60 * 1000; // 1 hour
    let ffFetchInFlight = false;

    // ── Personal FFScouter key (per-member) ────────────────────────────────
    // bs_estimate is a property of the TARGET, so the faction can share one
    // key and one server-side cache for it. The FF (fair fight) score is not:
    // it is computed RELATIVE TO THE ATTACKER. A score fetched with the
    // faction owner's key is scored against the OWNER's battle stats, so
    // showing it to a weaker member would tell them a fight is easy when it
    // is not. That is why 5.1.73 showed no FF score at all. A member who sets
    // their OWN FFScouter key gets a score computed against their own stats —
    // and only then is it safe to put an FF number on screen.
    const MY_FFS_KEY_STORE = 'factionops_my_ffs_key';

    /**
     * Read the member's own FFScouter key.
     * PDA's GM storage hands values back as raw STRINGS while the localStorage
     * shim hands back parsed JSON, so coerce rather than trusting the type.
     */
    function getMyFfsKey() {
        if (typeof GM_getValue !== 'function') return '';
        try { return String(GM_getValue(MY_FFS_KEY_STORE, '') || '').trim(); }
        catch (_) { return ''; }
    }

    /**
     * Persist the member's own FFScouter key ('' clears it). We overwrite with
     * '' instead of GM_deleteValue: that function is not in this script's GM
     * shim and is not guaranteed on PDA, where an unguarded GM_* call aborts
     * the whole script.
     */
    function setMyFfsKey(key) {
        if (typeof GM_setValue !== 'function') return;
        try { GM_setValue(MY_FFS_KEY_STORE, String(key || '').trim()); } catch (_) { }
    }

    /** Last-4 mask. Nothing anywhere may render or log more of a key than this. */
    function maskFfsKey(key) {
        const k = String(key || '');
        return k.length >= 4 ? '…' + k.slice(-4) : '…';
    }

    /**
     * Short non-reversible fingerprint (djb2) that stamps each cached FF score
     * with the key that produced it. We stamp the fingerprint rather than the
     * key so no cache entry ever carries key material.
     */
    function ffKeyFp(key) {
        const s = String(key || '');
        if (!s) return '';
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
        return h.toString(36);
    }

    /**
     * The key FF requests go out with: the member's own FFScouter key when set,
     * otherwise their own Torn key (the pre-5.1.74 direct-fallback path).
     * Both are the member's own, so both yield attacker-correct scores.
     */
    function activeFfsKey() {
        const mine = getMyFfsKey();
        if (mine) return { key: mine, fp: ffKeyFp(mine), personal: true };
        const own = CONFIG.API_KEY || '';
        return { key: own, fp: ffKeyFp(own), personal: false };
    }

    /**
     * FF score for a target, but ONLY when it was fetched with the key that is
     * still active. A score cached under a different key is scored against a
     * different attacker's stats — worse than no score, because it looks real.
     */
    function ffValueFor(targetId, snapshot) {
        const c = ffCache[targetId];
        if (!c || typeof c.value !== 'number') return null;
        // activeFfsKey() is a synchronous GM storage read plus a djb2 pass, and
        // this runs once per badge per repaint (and O(n log n) times inside the
        // sort comparator). Callers that loop pass a per-pass snapshot. It stays
        // a PER-PASS snapshot rather than a module-level memo so that clearing
        // the key in another tab still makes the chips vanish on the next
        // repaint instead of hanging around until reload.
        const active = snapshot || activeFfsKey();
        if (!active.fp || c.keyFp !== active.fp) return null;
        return c.value;
    }

    /**
     * FFScouter's own wording, ported from ffs-banner-estimates'
     * get_difficulty_text so the chip reads the way users already expect.
     */
    function ffDifficultyText(ff) {
        if (ff <= 1) return 'Extremely easy';
        if (ff <= 2) return 'Easy';
        if (ff <= 3.5) return 'Moderately difficult';
        if (ff <= 4.5) return 'Difficult';
        return 'May be impossible';
    }

    /**
     * Repaint every "is a personal key live?" readout from storage.
     * Assigned by initWarOverlay once the inline control exists; a no-op until
     * then, and after, because the two surfaces (inline button + Settings
     * status line) can each be absent. This is the ONLY thing telling a member
     * whether the FF numbers on screen were scored against their own stats, so
     * it must never disagree with storage — a green masked button with no key
     * saved would positively assert "these numbers are yours" when they are
     * not shown at all.
     */
    let repaintMyFfsUi = () => { };

    /**
     * Drop every cached FF entry, repaint the key readouts and the badges,
     * then refetch. Called when the personal key is saved or cleared from
     * EITHER surface: entries stamped with the old key must not survive, or a
     * stale attacker-relative score would keep driving both the FF chip and
     * the stats-sort fallback under a different attacker. Every key-change
     * path funnels through here, which is why the repaint lives here rather
     * than in the individual click handlers — the Settings save/clear and the
     * modal-wide Save have no reference to the inline button.
     */
    function resetFfCacheForKeyChange() {
        // A new key deserves a clean verdict: the old key's rejection says
        // nothing about this one, and re-saving is the documented way to retry.
        ffPersonalKeyRejected = false;
        try { repaintMyFfsUi(); } catch (_) { }
        for (const k of Object.keys(ffCache)) delete ffCache[k];
        try { fetchFairFightBatch(); } catch (_) { }
    }

    /**
     * Try the warboard server's cached enemy-stats endpoint first.
     * Server uses the faction's saved FFS key (or the requester's API key as
     * a fallback), caches estimates for 30 minutes per war, and serves the
     * same data to every faction member — so we hit ffscouter.com once per
     * war per 30 min instead of once per browser tab.
     * Resolves to { playerId: bs_estimate } map, or null if unavailable.
     */
    async function fetchEnemyStatsFromServer() {
        const warId = deriveWarId();
        if (!warId || !state.jwtToken) return null;
        try {
            const data = await getAction(`/api/war/${encodeURIComponent(warId)}/enemy-stats`);
            if (!data || !data.estimates) return null;
            return data.estimates;
        } catch (e) {
            // 503 (no FFS key on server) or any other error → caller falls back
            return null;
        }
    }

    /**
     * True when the member's OWN FFScouter key was refused (typo'd, expired,
     * rate-limited) or cannot be used on this host. Drives the button's error
     * state and is cleared on every key change and on the next success. Holds
     * a boolean only — never the key, never the wire error text.
     */
    let ffPersonalKeyRejected = false;

    /** How soon a degraded (personal-key-failed) entry becomes stale again. */
    const FF_DEGRADE_RETRY = 10 * 60 * 1000;

    /**
     * The member's own key failed, so the direct path gave us nothing. Without
     * this they would get NO stat estimates at all — the column the whole
     * faction relies on, which worked fine in 5.1.73 — for the rest of the
     * session, with only a console line to explain it. Degrade to the shared
     * server endpoint, which still yields stat estimates (never an FF score,
     * because the server's key belongs to someone else).
     *
     * The entries are stamped with the CURRENT key's fingerprint even though
     * they carry no FF score. That is deliberate and load-bearing: `needed`
     * below refetches a personal member's entries on fingerprint mismatch, so
     * stamping these null would make every data tick fire another doomed
     * ffscouter call AND another server call — a request storm lasting the
     * whole war. Attribution stays safe because ffValueFor() requires a
     * numeric `value`, so a keyFp sitting on a null-value entry can never put
     * a score on screen. fetchedAt is backdated so the key is retried in ~10
     * minutes instead of sitting dead for the full 1-hour TTL; re-saving the
     * key (even the same one) wipes the cache and retries immediately, which
     * is the manual recovery path the error state points at.
     */
    function ffDegradeToServer(active, ids) {
        ffPersonalKeyRejected = true;
        try { repaintMyFfsUi(); } catch (_) { }
        const ts = Date.now() - (FF_CACHE_TTL - FF_DEGRADE_RETRY);
        const batch = Array.isArray(ids) ? ids : [];
        // Tombstone the batch SYNCHRONOUSLY, before awaiting the server. The
        // server round-trip takes long enough for a data tick to slip through
        // the cleared ffFetchInFlight and fire another doomed direct call plus
        // another server call; with these in place `needed` is already empty.
        // The .then() below upgrades them in place with real stat estimates.
        for (const id of batch) {
            ffCache[id] = { value: null, keyFp: active.fp, stats: null, lastUpdated: 0, bsHuman: null, fetchedAt: ts };
        }
        fetchEnemyStatsFromServer().then((estimates) => {
            const est = estimates || {};
            let okCount = 0;
            // ONLY the batch that just failed. The server map covers every
            // target in the war, and blanket-writing it would overwrite good
            // direct-path entries from earlier successful batches — wiping
            // every FF chip on screen because one later batch timed out.
            for (const id of batch) {
                const n = Number(est[id]);
                if (Number.isFinite(n) && n > 0) {
                    ffCache[id] = {
                        value: null,
                        keyFp: active.fp,
                        stats: n,
                        bsHuman: formatBspNumber(n),
                        lastUpdated: 0,
                        fetchedAt: ts,
                    };
                    okCount++;
                } else {
                    // The server had nothing either. Still needs a backdated
                    // tombstone, or the id stays in `needed` and we hammer both
                    // endpoints on every data tick.
                    ffCache[id] = { value: null, keyFp: active.fp, stats: null, lastUpdated: 0, bsHuman: null, fetchedAt: ts };
                }
            }
            log('FF: direct call unusable — degraded to shared server estimates for', okCount, 'of', batch.length, 'targets');
        }).catch(() => { });
    }

    /**
     * Batch-fetch enemy stat estimates. Server-cached path first
     * (shared across faction, 30-min TTL); direct ffscouter.com call as
     * fallback for when the server has no FFS key or returns an error.
     * The server path returns stat estimates only, so a member with their own
     * FFScouter key skips it entirely: one direct call yields both the stat
     * estimate and their personal, attacker-relative FF score.
     */
    async function fetchFairFightBatch() {
        if (ffFetchInFlight) return;

        // Resolve the key ONCE, here, and carry it through both the server
        // branch and the response handler below. If the member changes their
        // key mid-flight, the in-flight response lands stamped with the OLD
        // fingerprint and is discarded by the guards further down.
        const active = activeFfsKey();
        const allIds = Object.keys(state.statuses);
        const now = Date.now();
        const needed = allIds.filter((id) => {
            const c = ffCache[id];
            if (!c || (now - c.fetchedAt) > FF_CACHE_TTL) return true;
            // Staleness alone is not enough. Under a personal key, an entry
            // produced by a DIFFERENT key — or by the shared server path, which
            // stamps keyFp:null — carries no FF score for this member and never
            // will, yet its fresh fetchedAt would keep it out of `needed` for a
            // full hour. That is how a key saved mid-flight, or saved in another
            // tab, ends with a green button and no chips anywhere.
            // Gated on `personal` because a no-key member's entries are
            // legitimately keyFp:null — without the gate they would refetch on
            // every single data tick.
            if (active.personal && c.keyFp !== active.fp) return true;
            return false;
        });
        if (needed.length === 0) return;

        ffFetchInFlight = true;
        try {
            // Try the server's cached endpoint first — but only when we have no
            // personal key, since the server can't produce a personal FF score.
            const serverEstimates = active.personal ? null : await fetchEnemyStatsFromServer();
            // The key may have changed during that await. Writing now would
            // stamp every target with a FRESH fetchedAt under the old identity;
            // re-dispatch instead so the member sees scores immediately rather
            // than waiting for the next tick to notice the mismatch.
            if (active.fp !== activeFfsKey().fp) {
                ffFetchInFlight = false;
                fetchFairFightBatch();
                return;
            }
            if (serverEstimates && Object.keys(serverEstimates).length > 0) {
                const ts = Date.now();
                for (const [pid, total] of Object.entries(serverEstimates)) {
                    const n = Number(total);
                    if (!Number.isFinite(n) || n <= 0) continue;
                    ffCache[pid] = {
                        value: null,            // server endpoint doesn't return FF score
                        keyFp: null,            // …so there is no attacker to attribute it to
                        stats: n,
                        bsHuman: formatBspNumber(n),
                        lastUpdated: 0,
                        fetchedAt: ts,
                    };
                }
                log('FF: server returned', Object.keys(serverEstimates).length, 'estimates');
                ffFetchInFlight = false;
                return;
            }
        } catch (e) {
            log('FF: server enemy-stats threw:', e && e.message);
        }
        // Direct ffscouter.com call: the primary path when the member set their
        // own FFScouter key, the fallback (with their own Torn key) otherwise.
        // The httpRequest callbacks below reset ffFetchInFlight.
        const apiKey = active.key;
        if (!apiKey) { ffFetchInFlight = false; return; }

        const batchSize = 50;
        const batch = needed.slice(0, batchSize);

        // This is the ONLY path for a member with a personal key. Torn PDA does
        // not expose GM_xmlhttpRequest at all (the polyfill at the top of the
        // file deliberately skips it, and httpRequest() routes PDA through
        // PDA_httpGet for exactly this reason), so a bare call here would blank
        // the entire stats column on the primary mobile host. Go through
        // httpRequest(), and if even that has no transport, degrade to the
        // shared server rather than returning empty-handed.
        if (!IS_PDA && typeof GM_xmlhttpRequest !== 'function') {
            ffFetchInFlight = false;
            if (active.personal) ffDegradeToServer(active, batch);
            return;
        }

        const url = `https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(apiKey)}&targets=${batch.join(',')}`;

        // Counts only — the request URL embeds the key, so it is never logged.
        log(active.personal
            ? 'FF: personal key set, direct ffscouter.com call for'
            : 'FF: server miss, falling back to ffscouter.com for', batch.length, 'targets');

        // A direct call that fails under a PERSONAL key must not leave the
        // member with nothing: fall back to the shared server for stat
        // estimates. Under the Torn-key fallback there is no point — we only
        // got here because the server already came up empty.
        const failed = (why) => {
            log('FF: direct call failed —', why);
            if (active.personal) ffDegradeToServer(active, batch);
        };

        // httpRequest()'s PDA branch ignores timeout/ontimeout, so every path
        // that clears ffFetchInFlight must also be covered by onload/onerror.
        httpRequest({
            method: 'GET',
            url: url,
            timeout: 15000,
            onload: function (resp) {
                ffFetchInFlight = false;
                if (!resp || resp.status !== 200) {
                    // Status code only. The response body of a rejected key can
                    // echo request context, and the URL carries the key itself.
                    log('FF: API returned', resp && resp.status);
                    failed('http ' + (resp && resp.status));
                    return;
                }
                try {
                    const data = JSON.parse(resp.responseText);
                    if (data && data.error) {
                        log('FF: API error:', data.error);
                        failed('api error');
                        return;
                    }
                    if (!Array.isArray(data)) { failed('unexpected response shape'); return; }
                    // We got a usable answer under this key, so any previous
                    // rejection state is stale — clear it and repaint.
                    if (ffPersonalKeyRejected) {
                        ffPersonalKeyRejected = false;
                        try { repaintMyFfsUi(); } catch (_) { }
                    }
                    // Key changed while this was in flight. The entries would be
                    // stamped with the old fp and so never displayed — but they
                    // would carry a FRESH fetchedAt, satisfying FF_CACHE_TTL and
                    // starving the refetch for up to an hour. Discard and go
                    // again under the new key so the member sees scores now.
                    if (active.fp !== activeFfsKey().fp) {
                        ffFetchInFlight = false;
                        fetchFairFightBatch();
                        return;
                    }
                    const ts = Date.now();
                    for (const entry of data) {
                        if (!entry || !entry.player_id) continue;
                        const id = String(entry.player_id);
                        // Normalised cache shape: { value (FF score), keyFp
                        // (fingerprint of the key that scored it), stats (raw
                        // bs_estimate), bsHuman (formatted), lastUpdated,
                        // fetchedAt }. keyFp is what makes the FF score safe to
                        // read back: it identifies WHOSE stats it was scored
                        // against. fair_fight is nullable in the API response.
                        //
                        // keyFp is stamped on EVERY entry this path writes,
                        // including the no-data tombstone and stats-only rows.
                        // The `needed` filter above refetches a personal
                        // member's entries whenever the fingerprint doesn't
                        // match, so leaving these null would put a target with
                        // no FF data into a permanent refetch loop. It stays
                        // attribution-safe because ffValueFor() requires a
                        // numeric `value` before it will return anything.
                        const rawStats = Number(entry.bs_estimate);
                        const stats = Number.isFinite(rawStats) && rawStats > 0 ? rawStats : null;
                        const bsHuman = entry.bs_estimate_human
                            || (stats != null ? formatBspNumber(stats) : null);
                        const ffNum = (entry.no_data || entry.fair_fight == null)
                            ? null : Number(entry.fair_fight);
                        const ffVal = Number.isFinite(ffNum) ? ffNum : null;
                        if (ffVal == null && stats == null) {
                            ffCache[id] = { value: null, keyFp: active.fp, stats: null, lastUpdated: 0, bsHuman: null, fetchedAt: ts };
                        } else {
                            ffCache[id] = {
                                value: ffVal,
                                keyFp: active.fp,
                                stats,
                                lastUpdated: entry.last_updated || 0,
                                bsHuman,
                                fetchedAt: ts,
                            };
                        }
                    }
                    // Re-render inline FF badges. Isolated from the parse try:
                    // a DOM exception in here is not a bad response, and letting
                    // it reach the catch below would degrade a batch that had
                    // just been written correctly.
                } catch (e) {
                    log('FF: parse error', e);
                    failed('parse error');
                }
            },
            onerror: function () { ffFetchInFlight = false; failed('network error'); },
            ontimeout: function () { ffFetchInFlight = false; failed('timeout'); },
        });
    }

    /** Colour for FF value — blue→green→red gradient matching FF Scouter V2. */
    function ffColor(value) {
        let r, g, b;
        if (value <= 1) {
            r = 0x28; g = 0x28; b = 0xc6;
        } else if (value <= 3) {
            const t = (value - 1) / 2;
            r = 0x28;
            g = Math.round(0x28 + (0xc6 - 0x28) * t);
            b = Math.round(0xc6 - (0xc6 - 0x28) * t);
        } else if (value <= 5) {
            const t = (value - 3) / 2;
            r = Math.round(0x28 + (0xc6 - 0x28) * t);
            g = Math.round(0xc6 - (0xc6 - 0x28) * t);
            b = 0x28;
        } else {
            r = 0xc6; g = 0x28; b = 0x28;
        }
        return `rgb(${r},${g},${b})`;
    }

    /**
     * Estimated one-way travel times in minutes (standard / airstrip).
     * Used as a rough fallback when the API doesn't provide an exact timer.
     * Returns midpoint between standard and airstrip as a reasonable guess.
     */
    const TRAVEL_ESTIMATES = {
        'mexico': 17, // 20 std / 14 air
        'canada': 32, // 37 / 26
        'cayman islands': 49, // 57 / 40
        'cayman': 49,
        'hawaii': 103, // 121 / 85
        'united kingdom': 130, // 152 / 107
        'uk': 130,
        'argentina': 161, // 189 / 133
        'switzerland': 144, // 169 / 118
        'japan': 173, // 203 / 142
        'china': 186, // 219 / 153
        'united arab emirates': 220, // 259 / 181
        'uae': 220,
        'south africa': 264, // 311 / 217
    };

    /**
     * Estimate when a traveling opponent will be back in Torn and attackable.
     * - "Returning to Torn from X" → one-way flight time (they're on their way back)
     * - "Traveling to X" → two-way minimum (outbound + return, not counting time abroad)
     * - "In X" / abroad → one-way return flight at minimum
     * Returns a string like "~2h 10m" or null if unknown destination.
     */
    function estimateTravelReturn(description) {
        if (!description) return null;
        const desc = description.toLowerCase();
        let dest = null;
        let mins = 0;
        for (const [d, m] of Object.entries(TRAVEL_ESTIMATES)) {
            if (desc.includes(d)) { dest = d; mins = m; break; }
        }
        if (!dest) {
            // v5.0.27: canary for Torn API change announced 2026-05-13
            // ("Traveling statuses always reference both origin and
            // destination"). If a description CLEARLY refers to travel
            // but our destination table doesn't match anymore, log it
            // once so we notice. Skip non-travel strings entirely.
            if (/travel|return|abroad|airstrip/i.test(desc)) {
                _warnTravelParseFailureOnce(description);
            }
            return null;
        }

        let estimate;
        if (desc.includes('returning')) {
            // Already heading back — one-way flight time
            estimate = mins;
        } else if (desc.includes('traveling to')) {
            // Still outbound — outbound remainder unknown + full return
            // Show at minimum the return flight
            estimate = mins;
            return formatEstimate(estimate) + '+';
        } else {
            // "In X" — abroad, needs to fly back
            estimate = mins;
            return formatEstimate(estimate) + '+';
        }
        return formatEstimate(estimate);
    }

    function formatEstimate(mins) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return h > 0 ? `~${h}h ${m}m` : `~${m}m`;
    }

    // v5.0.27: dedupe travel-parse-failure warnings so we don't spam
    // the console. Each unique normalized desc only logs once per
    // page session.
    const _travelParseFailureSeen = new Set();
    function _warnTravelParseFailureOnce(description) {
        try {
            const key = String(description).slice(0, 96);
            if (_travelParseFailureSeen.has(key)) return;
            _travelParseFailureSeen.add(key);
            console.warn('[FactionOps] travel description did not match any known destination — Torn may have changed the format. Verbatim:', description);
        } catch (_) { }
    }

    // =========================================================================
    // SECTION 6: HTTP POLLING CLIENT
    // =========================================================================

    // ── Polling-based server communication ──────────────────────────────

    // PDA: polling is the primary transport (Socket.IO blocked by WebView)
    // Desktop: polling is a fallback — Socket.IO handles real-time push
    // 200ms was tried and caused client-side "Network error" cascades when
    // requests overlapped and GM_xmlhttpRequest queue filled up. 1000ms is
    // the sweet spot — feels live, stays well under the browser's
    // concurrent-socket limit and the server global rate limiter.
    const POLL_FAST_MS = 5000;   // War active: 5s — FALLBACK path only (long-poll is the default transport)
    const POLL_IDLE_MS = 20000;  // No war: 20s — FALLBACK path only
    const LONGPOLL_GAP_MS = 250; // beta long-poll: tiny reconnect gap (the hang IS the wait)
    let currentPollInterval = POLL_IDLE_MS;

    let pollTimer = null;
    let pollEpoch = 0; // bumped when a fresh poll loop starts, so a stale in-flight long-poll can't reschedule a loop it no longer owns
    let pollErrorCount = 0;
    /** v5.0.24: grace timer that delays the "disconnected" UI by 15s.
     *  Mobile data on PDA has frequent sub-second blips that recover
     *  quickly; without this debounce the connection dot flickers
     *  every time. Only the visual indicator is delayed — internal
     *  state.connected flips immediately so call/uncall behavior is
     *  honest. */
    let _disconnectGraceTimer = null;
    const MAX_POLL_BACKOFF = 30000;

    /** Check if a war is actively running (enemy statuses present = war data flowing). */
    function isWarActive() {
        return Object.keys(state.statuses || {}).length > 0;
    }

    /** Derive a stable warId from factionId (convention: "war_<factionId>"). */
    function deriveWarId() {
        return state.myFactionId ? `war_${state.myFactionId}` : null;
    }

    /**
     * POST a JSON action to the server.
     * On PDA uses fetch(); elsewhere uses GM_xmlhttpRequest.
     * Auto-retries once on network error after 1s delay.
     */
    // v4.9.81: fetch tight landing timestamps for any targets currently
    // showing status=traveling. Debounced so overlapping refresh
    // triggers share one upstream call. Uses the stored API key (not
    // JWT) since the flights endpoint does Torn-key verification.
    let _flightsFetchInFlight = null;
    // v5.0.97: stubbed out — foFlightDiag previously POSTed every call
    // to /api/debug/client-log (up to 30/load), which contributed to
    // the ~10k client-log hits/day we saw in nginx stats. Pure
    // diagnostic with no behavioral dependency; killing the POST
    // saves cellular bytes + server log noise. Console.log only path
    // kept so devs can still inspect via DevTools if needed.
    function foFlightDiag(msg) {
        // no-op — was: POST to /api/debug/client-log
    }
    async function refreshFlightsForTravelers() {
        const FLIGHT_REFRESH_MIN_MS = 60_000;
        if (_flightsFetchInFlight) return _flightsFetchInFlight;
        if (Date.now() - state.flightsLastFetchedAt < FLIGHT_REFRESH_MIN_MS) return;
        // v4.9.84: fall back to CONFIG.API_KEY when GM storage is empty
        // (PDA-managed key case — Torn PDA injects the key via
        // PDA_API_KEY placeholder, not GM storage).
        const apiKey = GM_getValue('factionops_api_key', '') || CONFIG.API_KEY;
        if (!apiKey || apiKey.length < 10) {
            foFlightDiag('skip: no api key (len=' + (apiKey?.length || 0) + ')');
            return;
        }
        const uids = [];
        for (const [targetId, s] of Object.entries(state.statuses || {})) {
            const norm = normalizeStatus(s.status);
            if (norm === 'traveling' || norm === 'abroad') uids.push(targetId);
        }
        foFlightDiag('statuses=' + Object.keys(state.statuses || {}).length + ' travel/abroad=' + uids.length);
        if (!uids.length) return;
        _flightsFetchInFlight = (async () => {
            try {
                // v4.9.83: use httpRequest helper so PDA routes through
                // PDA_httpPost instead of failing on GM_xmlhttpRequest.
                const r = await new Promise((resolve) => {
                    httpRequest({
                        method: 'POST',
                        url: `${CONFIG.SERVER_URL}/api/flights/batch`,
                        headers: { 'Content-Type': 'application/json' },
                        data: JSON.stringify({ key: apiKey, uids }),
                        onload: (resp) => resolve({ ok: resp.status >= 200 && resp.status < 300, data: safeParse(resp.responseText) }),
                        onerror: () => resolve({ ok: false, data: null }),
                    });
                });
                foFlightDiag('fetch ok=' + r.ok + ' keys=' + (r.data && Object.keys(r.data.flights || {}).length));
                if (r.ok && r.data && r.data.flights) {
                    // Merge (don't clobber — stale entries from previous
                    // calls are still useful until we get a fresh value).
                    const touched = [];
                    for (const [uid, fi] of Object.entries(r.data.flights)) {
                        // v4.9.88: accept records with EITHER a landing
                        // time (in-flight) or just a destination (abroad).
                        if (fi && (fi.landingAt > 0 || fi.destination)) {
                            state.flights[uid] = fi;
                            if (state.statuses[uid]) {
                                state.statuses[uid].landingAt = fi.landingAt || 0;
                                state.statuses[uid].flightDest = fi.destination || '';
                                state.statuses[uid].flightReturning = !!fi.returning;
                                touched.push(uid);
                            }
                        }
                    }
                    // v4.9.85: re-render affected rows so the pill picks
                    // up the new landingAt. Without this the pill that
                    // rendered BEFORE flight data arrived stays as
                    // static 'Travel' text with no fo-timer-<uid>
                    // element — so the tick loop has nothing to update.
                    for (const uid of touched) {
                    }
                    // v4.9.93: re-sort so traveling members with tighter
                    // landing times float to the top of the travel
                    // group. Debounced 300ms so multiple batch landings
                    // in quick succession collapse to one DOM reorder.
                    state.flightsLastFetchedAt = Date.now();
                }
            } catch (_) { /* swallow; next tick retries */ }
            finally { _flightsFetchInFlight = null; }
        })();
        return _flightsFetchInFlight;
    }

    function postAction(endpoint, body, _retried) {
        return new Promise((resolve, reject) => {
            if (!state.jwtToken) return reject(new Error('Not authenticated'));
            const url = `${CONFIG.SERVER_URL}${endpoint}`;
            const json = JSON.stringify(body);

            httpRequest({
                method: 'POST',
                url,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.jwtToken}`,
                },
                data: json,
                timeout: 15000,
                onload(res) {
                    const data = safeParse(res.responseText);
                    if (res.status >= 200 && res.status < 300) resolve(data);
                    else reject(new Error((data && data.error) || `HTTP ${res.status}`));
                },
                onerror() {
                    if (!_retried) {
                        // Retry once after 1s
                        setTimeout(() => {
                            postAction(endpoint, body, true).then(resolve, reject);
                        }, 1000);
                    } else {
                        reject(new Error('Network error'));
                    }
                },
                ontimeout() {
                    if (!_retried) {
                        setTimeout(() => {
                            postAction(endpoint, body, true).then(resolve, reject);
                        }, 1000);
                    } else {
                        reject(new Error('Request timed out'));
                    }
                },
            });
        });
    }

    /** POST-based remove action with auth header (PDA compatible — no DELETE method). Auto-retries once. */
    function removeAction(endpoint, _retried) {
        return new Promise((resolve, reject) => {
            if (!state.jwtToken) return reject(new Error('Not authenticated'));
            const url = `${CONFIG.SERVER_URL}${endpoint}`;

            httpRequest({
                method: 'POST',
                url,
                headers: {
                    'Authorization': `Bearer ${state.jwtToken}`,
                    'Content-Type': 'application/json',
                },
                data: '{}',
                timeout: 15000,
                onload(res) {
                    const data = safeParse(res.responseText);
                    if (res.status >= 200 && res.status < 300) resolve(data);
                    else reject(new Error((data && data.error) || `HTTP ${res.status}`));
                },
                onerror() {
                    if (!_retried) {
                        setTimeout(() => removeAction(endpoint, true).then(resolve, reject), 1000);
                    } else {
                        reject(new Error('Network error'));
                    }
                },
                ontimeout() {
                    if (!_retried) {
                        setTimeout(() => removeAction(endpoint, true).then(resolve, reject), 1000);
                    } else {
                        reject(new Error('Request timed out'));
                    }
                },
            });
        });
    }

    /**
     * GET with auth header.
     * Uses httpRequest wrapper which routes through PDA_httpGet (with headers)
     * on Torn PDA, or GM_xmlhttpRequest on desktop.
     */
    /**
     * Who the enemy is farming right now, so somebody can turtle them --
     * hospitalise our own member so the enemy cannot keep scoring off them.
     *
     * Ranked by respect bled rather than by hits: a member giving away 40
     * respect an hour wants taking off the board before one poked twice for
     * nothing. The server reads it from the attack ledger, which already
     * stores incoming attacks.
     */
    const TURTLE_TOP = 3;
    async function refreshTurtleBar() {
        const bar = document.getElementById('fo-turtle-bar');
        if (!bar) return;
        // Admin-only, matching the server. Checked here as well so a member
        // without the role never spends a request learning they cannot have it.
        if (typeof isLeader === 'function' && !isLeader()) { bar.innerHTML = ''; return; }
        const warId = (typeof deriveWarId === 'function') ? deriveWarId() : null;
        if (!warId || !state.jwtToken) { bar.innerHTML = ''; return; }
        let data;
        try {
            data = await getAction(`/api/war/${encodeURIComponent(warId)}/turtle-watch`);
        } catch (e) {
            // Silent: an empty bar is the honest state, and a war overlay is no
            // place for a network error nobody can act on.
            bar.innerHTML = '';
            return;
        }
        const list = (data && Array.isArray(data.members)) ? data.members : [];
        if (!list.length) { bar.innerHTML = ''; return; }
        const items = list.slice(0, TURTLE_TOP).map(m => {
            const mins = m.lastAt ? Math.max(0, Math.round(Date.now() / 1000 - m.lastAt) / 60) : null;
            const ago = mins == null ? '' : (mins < 1 ? ' · just now' : ` · ${Math.round(mins)}m ago`);
            // A link, never a click: the script suggests the hit, the member makes it.
            return `<span class="fo-turtle-item"><a href="https://www.torn.com/page.php?sid=attack&user2ID=${encodeURIComponent(m.playerId)}" target="_blank" rel="noopener">${escapeHtml(m.name)}</a>` +
                `<span class="fo-turtle-cost">-${Math.round(m.respectLost)}</span>` +
                `<span style="opacity:.6">${m.hits} hit${m.hits === 1 ? '' : 's'}${ago}</span></span>`;
        }).join('');
        const more = list.length > TURTLE_TOP ? `<span style="opacity:.5">+${list.length - TURTLE_TOP} more</span>` : '';
        bar.innerHTML = `<span class="fo-turtle-label">\u{1F422} Turtle</span>${items}${more}`;
    }

    function getAction(endpoint) {
        if (!state.jwtToken) return Promise.reject(new Error('Not authenticated'));

        const url = `${CONFIG.SERVER_URL}${endpoint}`;
        return new Promise((resolve, reject) => {
            httpRequest({
                method: 'GET',
                url,
                headers: { 'Authorization': `Bearer ${state.jwtToken}` },
                onload(res) {
                    const data = safeParse(res.responseText);
                    if (res.status >= 200 && res.status < 300) resolve(data);
                    else reject(new Error((data && data.error) || `HTTP ${res.status}`));
                },
                onerror() { reject(new Error('Network error')); },
            });
        });
    }

    /**
     * Single poll cycle: fetch server state, diff against local, fire notifications.
     */
    // ── Long-poll transport (beta, CONFIG.USE_LONGPOLL) ────────────────────
    // When enabled AND no SSE/Socket.IO is up (phones), replace the 1s/5s poll
    // with a hanging GET /api/poll-long: the server holds it until the war state
    // changes (or ~25s), then returns ONLY the changed sections, which we feed
    // through the existing (partial-safe) applyServerData. Idle = one held
    // connection and zero re-renders; a change wakes it in ~1s with a tiny
    // payload. Any timeout/abort is treated as "no change" and we simply re-poll,
    // so it degrades gracefully wherever the platform caps the hold duration.
    let _lpCursor = 0;
    let _lpWarId = null;
    // Auto-fallback: if long-poll NEVER succeeds on this device (broken transport),
    // give up after a few tries and revert to the standard 1s/5s poll for the
    // session. Transient errors after it has worked at least once do NOT disable
    // it (those are just normal network blips, handled by the usual backoff).
    let _lpEverSucceeded = false;
    let _lpFailStreak = 0;
    let _lpDisabled = false;
    function longPollFetch(warId, since, timeoutMs) {
        const url = `${CONFIG.SERVER_URL}/api/poll-long?warId=${encodeURIComponent(warId)}&since=${since || 0}&_t=${Date.now()}`;
        const headers = { 'Authorization': `Bearer ${state.jwtToken}` };
        return new Promise((resolve, reject) => {
            if (!state.jwtToken) return reject(new Error('Not authenticated'));
            const done = (res) => {
                if (!res || typeof res.status !== 'number') return resolve(null);
                if (res.status < 200 || res.status >= 300) return reject(new Error('HTTP ' + res.status));
                try { resolve(JSON.parse(res.responseText)); } catch (_) { resolve(null); }
            };
            if (IS_PDA && typeof PDA_httpGet === 'function') {
                // PDA holds the GET per its native timeout; the server responds in
                // <=25s so we usually get the real delta, otherwise we re-poll.
                PDA_httpGet(url, headers)
                    .then(r => done(typeof r === 'string' ? { status: 200, responseText: r } : r))
                    .catch(e => reject(e instanceof Error ? e : new Error('Network error')));
            } else if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET', url, headers, timeout: timeoutMs,
                    onload: done,
                    onerror: (e) => reject(e instanceof Error ? e : new Error('Network error')),
                    ontimeout: () => resolve(null), // no change within the hold → re-poll
                });
            } else {
                fetch(url, { headers })
                    .then(async r => done({ status: r.status, responseText: await r.text() }))
                    .catch(e => reject(e));
            }
        });
    }
    async function longPollOnce(warId) {
        const myEpoch = pollEpoch;
        // New war (enemy switch / different warId) → resync from version 0.
        if (warId !== _lpWarId) { _lpWarId = warId; _lpCursor = 0; }
        try {
            const data = await longPollFetch(warId, _lpCursor, 35000);
            if (!state.connected) {
                state.connected = true;
                state.connecting = false;
                if (_disconnectGraceTimer) { clearTimeout(_disconnectGraceTimer); _disconnectGraceTimer = null; }
                updateConnectionUI();
            }
            pollErrorCount = 0;
            _lpEverSucceeded = true;
            _lpFailStreak = 0;
            if (data) {
                if (typeof data.v === 'number') _lpCursor = data.v;
                // Partial-safe: applyServerData only touches sections that are present.
                // Section-level diff: when enemyStatuses is present at all it is the
                // WHOLE map (routes.js:2561), so this counts as a full roster.
                if (data.changed) applyServerData(data.changed, { fullRoster: true });
            }
        } catch (err) {
            pollErrorCount++;
            _lpFailStreak++;
            // Never worked on this device → the transport is unsupported here; stop
            // trying and let pollOnce/scheduleNextPoll route back to the standard poll.
            if (!_lpEverSucceeded && _lpFailStreak >= 3 && !_lpDisabled) {
                _lpDisabled = true;
                warn('Long-poll unsupported here — falling back to standard polling for this session');
            }
            if (state.connected && pollErrorCount >= 5) {
                state.connected = false;
                if (_disconnectGraceTimer) clearTimeout(_disconnectGraceTimer);
                _disconnectGraceTimer = setTimeout(() => { _disconnectGraceTimer = null; if (!state.connected) updateConnectionUI(); }, 15000);
                warn('Long-poll failed (5+):', err.message);
            }
            if (err.message && err.message.includes('401')) {
                try { await authenticate(); pollErrorCount = 0; } catch (e) { warn('Re-auth failed:', e.message); }
            }
        } finally {
            // Only reschedule if THIS invocation still owns the current loop — guards
            // against a stop→start flap during the long hang spawning a duplicate loop.
            if (myEpoch === pollEpoch && pollTimer && !sseConnected && !(realtimeSocket && realtimeSocket.connected)) scheduleNextPoll();
        }
    }

    async function pollOnce() {
        const warId = deriveWarId();
        if (!warId || !state.jwtToken) {
            if (IS_PDA) log('pollOnce skip — warId:', warId, 'jwt:', !!state.jwtToken, 'factionId:', state.myFactionId);
            return;
        }

        // Long-poll transport takes over when enabled, not auto-disabled, and no
        // realtime is connected.
        if (CONFIG.USE_LONGPOLL && !_lpDisabled && !sseConnected && !(realtimeSocket && realtimeSocket.connected)) {
            return longPollOnce(warId);
        }

        try {
            const qs = `warId=${encodeURIComponent(warId)}` +
                (state.enemyFactionId ? `&enemyFactionId=${encodeURIComponent(state.enemyFactionId)}` : '');
            const data = await getAction(`/api/poll?${qs}`);

            if (!state.connected) {
                state.connected = true;
                state.connecting = false;
                pollErrorCount = 0;
                // v5.0.24: cancel pending disconnect-grace UI update so
                // we don't flash "disconnected" after we've already
                // recovered.
                if (_disconnectGraceTimer) {
                    clearTimeout(_disconnectGraceTimer);
                    _disconnectGraceTimer = null;
                }
                updateConnectionUI();
                log('Polling connected');
            }

            // /api/poll always returns the whole war.enemyStatuses map
            // (routes.js:2517) — a full roster, so it may unlock hiding.
            applyServerData(data, { fullRoster: true });

        } catch (err) {
            pollErrorCount++;
            // v5.0.24: raised threshold 3 → 5 (mobile data blips are
            // frequent and short; 5 fails ≈ 1 min of real downtime).
            // Plus a 15s grace before the UI shows "disconnected" so
            // brief blips don't flicker the indicator.
            if (state.connected && pollErrorCount >= 5) {
                state.connected = false;
                if (_disconnectGraceTimer) clearTimeout(_disconnectGraceTimer);
                _disconnectGraceTimer = setTimeout(() => {
                    _disconnectGraceTimer = null;
                    if (!state.connected) updateConnectionUI();
                }, 15000);
                warn('Poll failed (5+ consecutive):', err.message);
            } else if (state.connected) {
                log('Poll hiccup (' + pollErrorCount + '/5):', err.message);
            }

            // Re-authenticate on 401
            if (err.message && err.message.includes('401')) {
                try {
                    await authenticate();
                    pollErrorCount = 0;
                } catch (authErr) {
                    warn('Re-auth failed:', authErr.message);
                }
            }
        } finally {
            // Schedule next poll only if still polling and NOT connected via SSE/Socket.IO
            if (pollTimer && !sseConnected && !(realtimeSocket && realtimeSocket.connected)) {
                scheduleNextPoll();
            }
        }
    }

    /** Start the polling loop. */
    function startPolling() {
        if (pollTimer) return; // already running
        if (sseConnected || (realtimeSocket && realtimeSocket.connected)) {
            log('Skipping startPolling — real-time connection active');
            return;
        }
        if (!state.jwtToken) {
            warn('No JWT token — cannot start polling');
            state.connected = false;
            state.connecting = false;
            updateConnectionUI();
            return;
        }

        state.connecting = true;
        updateConnectionUI();
        log('Starting adaptive poll loop (fast=' + POLL_FAST_MS + 'ms, idle=' + POLL_IDLE_MS + 'ms)');

        // Initialize timer placeholder
        pollEpoch++; // new loop generation
        pollTimer = true;

        // Immediate first poll
        pollOnce();
    }

    function scheduleNextPoll() {
        if (!pollTimer || sseConnected || (realtimeSocket && realtimeSocket.connected)) return;

        // In long-poll mode the wait already happened inside the held request, so
        // reconnect after just a tiny gap; error backoff below still applies.
        const longPoll = CONFIG.USE_LONGPOLL && !_lpDisabled && !sseConnected && !(realtimeSocket && realtimeSocket.connected);
        const desired = longPoll ? LONGPOLL_GAP_MS : (isWarActive() ? POLL_FAST_MS : POLL_IDLE_MS);
        if (desired !== currentPollInterval) {
            log('Poll interval changed: ' + currentPollInterval + 'ms → ' + desired + 'ms');
            currentPollInterval = desired;
        }
        const backoff = pollErrorCount > 0
            ? Math.min(currentPollInterval * Math.pow(2, pollErrorCount), MAX_POLL_BACKOFF)
            : currentPollInterval;

        pollTimer = setTimeout(() => {
            // Skip this tick if in backoff (simple jitter)
            if (pollErrorCount > 0 && Math.random() > (currentPollInterval / backoff)) {
                scheduleNextPoll();
                return;
            }
            pollOnce();
        }, backoff);
    }

    /** Stop the polling loop. keepState=true preserves connection state (used when Socket.IO takes over). */
    function stopPolling(keepState) {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
        if (!keepState) {
            state.connected = false;
            state.connecting = false;
            updateConnectionUI();
        }
        pollErrorCount = 0;
        log('Polling stopped' + (keepState ? ' (Socket.IO active)' : ''));
    }

    // ── Socket.IO real-time push (primary) ─────────────────────────────────

    let realtimeSocket = null;
    let hasReceivedInitialData = false;

    /**
     * Apply server data to local state and re-render.
     * Used by both pollOnce() and Socket.IO war_update handler.
     */
    function applyServerData(data, opts) {
        // Is this frame a COMPLETE enemy roster, or a delta?
        //  - callers that know pass { fullRoster: true } (the /api/poll
        //    response and the long-poll section diff, both of which ship the
        //    whole war.enemyStatuses map)
        //  - anything carrying `warId` is a broadcastWarUpdate payload
        //    (routes.js:236), also the full map
        //  - everything else — notably war-status-monitor's SSE deltas — is
        //    treated as partial, so it may add to the allow-list but never
        //    unlocks hiding.
        const _fullRoster = !!(opts && opts.fullRoster) || data.warId != null;

        // Faction cooldown dashboard updates (Option B self-reports,
        // delivered via SSE or Socket.IO payloads).
        //
        // ORDER MATTERS — this block runs BEFORE the enemyStatuses block on
        // purpose. memberBars is one of our own-member identity sources, and
        // confirmEnemyIds() rejects ids it knows are ours. Handling statuses
        // first would mean that on the FIRST poll of every session — the one
        // where memberBars is still empty — any own-faction id present in the
        // server's map got permanently added to the allow-list before we had
        // the evidence to reject it.
        if (data.memberBars && typeof data.memberBars === 'object') {
            console.log('[fo-bars] applyServerData got memberBars:', Object.keys(data.memberBars));
            if (!state.memberBars) state.memberBars = {};
            for (const [pid, entry] of Object.entries(data.memberBars)) {
                state.memberBars[String(pid)] = entry;
            }
            // Feed the union-only identity set: memberBars itself shrinks
            // (24h server-side eviction, wholesale replace at overlay init),
            // and identity must never shrink.
            noteOwnMemberIds(Object.keys(data.memberBars));
            if (typeof renderFactionBars === 'function') renderFactionBars();
        }

        // Is this frame an AUTHORITATIVE complete roster? Three conditions,
        // and all three are load-bearing:
        //
        //  1. _fullRoster — the transport ships the whole map, not a delta.
        //  2. NON-EMPTY — `if (data.enemyStatuses)` is true for `{}`, and the
        //     server legitimately sends `{}` (routes.js wipes the map on an
        //     enemy-faction change). An empty map carries no roster
        //     information; letting it unlock hiding would enforce against
        //     whatever partial set we happened to have and hide real enemies
        //     mid-chain.
        //  3. A faction API key is stored — without one, war-status-monitor
        //     cannot do a roster fetch at all and war.enemyStatuses is built
        //     up incrementally from attack observations, i.e. a handful of
        //     ids. That map is still shipped whole, so completeness cannot be
        //     inferred from the transport alone. Read from `data` when
        //     present because state.factionKeyStored is only assigned further
        //     down this same function, i.e. after this check on the first poll.
        const _rosterIds = data.enemyStatuses ? Object.keys(data.enemyStatuses) : [];
        const _keyStored = (data.factionKeyStored !== undefined)
            ? !!data.factionKeyStored
            : (state.factionKeyStored !== false);
        const _authoritative = _fullRoster && _rosterIds.length > 0 && _keyStored;

        // ── Enemy faction id, including CHANGES ──
        // Handled up here, before statuses are merged, because a change has
        // to wipe the old war's state BEFORE the new war's roster lands in
        // the same payload — wiping afterwards would delete what we just
        // merged.
        //
        // The old code only ever set this when it was unset, so a war flip
        // seen through the server alone left state.enemyFactionId stale,
        // which in turn made the getwarusers guard (`fid !== enemyFactionId`
        // → continue) reject the ENTIRE new enemy roster.
        //
        // Change detection is gated on an authoritative payload on purpose.
        // The ranked-war intercept flips to the new enemy the moment Torn
        // says so, while the server keeps echoing the OLD id for a few
        // seconds until its own detection catches up. Reacting to a bare
        // stale echo would revert us to the previous war — wiping statuses
        // AND calls — and then flip back, thrashing mid-war.
        if (data.enemyFactionId) {
            const _incomingEnemy = String(data.enemyFactionId);
            if (!state.enemyFactionId) {
                // First sighting: adopt it, but never wipe — there is no
                // previous war whose state needs clearing.
                state.enemyFactionId = data.enemyFactionId;
            } else if (_authoritative && _incomingEnemy !== String(state.enemyFactionId)
                // Suppress the server's stale echo of a war the
                // ranked-war intercept just moved us off. That echo is
                // "authoritative" by every structural test — full map,
                // non-empty, key stored — because it IS a complete
                // snapshot, just of the war that already ended.
                // Reverting to it would wipe the new war's statuses and
                // calls and rebuild the allow-list from the dead war's
                // roster, hiding every real target mid-chain. Only the
                // id we flipped away from is suppressed, and only
                // briefly, so a genuine later change still lands.
                && !(_intentionalEnemyFlipFrom === _incomingEnemy
                    && (Date.now() - _intentionalEnemyFlipAt) < ENEMY_FLIP_ECHO_GRACE_MS)) {
                log('[own-faction-guard] server reports enemy faction change '
                    + state.enemyFactionId + ' -> ' + _incomingEnemy + ' — resetting war state');
                state.enemyFactionId = data.enemyFactionId;
                state.statuses = {};
                state.calls = {};
                state.priorities = {};
                resetConfirmedEnemyIds();
            }
        }

        // ── Statuses (target names feed call toasts, so keep this early) ──
        if (data.enemyStatuses) {
            if (_authoritative) {
                // REBUILD rather than union — see rebuildConfirmedEnemyIds.
                // This is what lets the server's own roster refresh evict a
                // poisoned id from our allow-list, instead of us remembering
                // it forever.
                rebuildConfirmedEnemyIds(_rosterIds);
                enemyRosterConfirmed = true;
            } else {
                // Delta, empty, or unverifiable: may ADD to the allow-list
                // (these ids still came from the war record) but must never
                // narrow it and must never unlock hiding.
                confirmEnemyIds(_rosterIds);
            }
            mergeStatusesMonotonic(data.enemyStatuses);
        }

        // ── Priorities ──
        if (data.priorities) {
            state.priorities = data.priorities;
        }

        // ── Diff & notify: calls ──
        if (data.calls) {
            const oldCalls = state.calls;
            for (const [tid, callData] of Object.entries(data.calls)) {
                if (!oldCalls[tid]) {
                    // Only toast for NEW calls after initial load (skip on page refresh)
                    if (hasReceivedInitialData && String(callData.calledBy.id) !== state.myPlayerId) {
                        const targetName = state.statuses[tid]?.name
                            || (data.enemyStatuses && data.enemyStatuses[tid]?.name)
                            || `Target #${tid}`;
                        const dealLabel = callData.isDeal ? ' \uD83D\uDD12 Deal' : '';
                        showCallToast(tid, `${callData.calledBy.name} called ${targetName}${dealLabel}`);
                        // v5.0.84: PDA notification removed per user request
                        // ('can we remove target calls from notification
                        // system?'). The 2s call toast above stays \u2014
                        // it's an inline overlay cue, not a notification.
                    }
                    broadcastStateChange({ type: 'call_update', targetId: tid });
                }
            }
            for (const tid of Object.keys(oldCalls)) {
                if (!data.calls[tid]) {
                    removeCallToast(tid);
                    broadcastStateChange({ type: 'call_update', targetId: tid });
                }
            }
            state.calls = data.calls;
            try { markCalledRows(); } catch (_) { }
        }

        // ── Chain ──
        if (data.chainData && !CHAIN_POLL_ONLY) {
            const oldCurrent = state.chain.current;
            const chainChanged = data.chainData.current !== oldCurrent;
            state.chain.current = data.chainData.current ?? state.chain.current;
            state.chain.max = data.chainData.max ?? state.chain.max;
            // v5.1.65: the server now stores the chain's ABSOLUTE end instant
            // (chainEndsAt, epoch ms) instead of a countdown that decremented
            // every second. Anchoring straight to it is exact — immune to
            // request latency — and, because the stored value only changes when
            // something really happens, it stops re-anchoring on every poll.
            // `timeout` is still sent (server recomputes it) for older clients.
            const serverEndsAt = Number(data.chainData.chainEndsAt);
            if (Number.isFinite(serverEndsAt) && serverEndsAt > 0) {
                setChainDeadline(serverEndsAt);
            } else {
                const serverTimeout = data.chainData.timeout ?? 0;
                if (chainChanged || state.chain.timeout <= 0 || Math.abs(serverTimeout - state.chain.timeout) > 3) {
                    setChainTimeout(serverTimeout);
                }
            }
            state.chain.cooldown = data.chainData.cooldown ?? 0;
            chainCooldownSetAt = Date.now();
            chainCooldownSetVal = data.chainData.cooldown ?? 0;
            updateChainBar();

            if (data.chainData.current && chainChanged) {
                const next = nextBonusMilestone(data.chainData.current + 1);
                const hitsToBonus = next ? next - data.chainData.current : null;
                const isCoolingDown = state.chain.cooldown > 0;
                // Only notify for bonuses above 10 (skip the first bonus at 10 since chain hasn't 'started' yet)
                // Also only fire when already past the first bonus or very close to a meaningful one
                if (!isCoolingDown && hitsToBonus !== null && hitsToBonus <= 3 && hitsToBonus > 0 && data.chainData.current >= 10) {
                    showToast(`BONUS HIT in ${hitsToBonus}! Target: ${next}`, 'error');
                    firePdaNotification('bonus_imminent',
                        '\uD83D\uDCA5 Bonus Hit Imminent',
                        `Chain at ${data.chainData.current}/${next} \u2014 ${hitsToBonus} hit${hitsToBonus > 1 ? 's' : ''} to bonus!`);
                }
            }
        }

        // ── Online players ──
        if (data.onlinePlayers) {
            state.onlinePlayers = data.onlinePlayers;
        }

        // ── Viewers ──
        if (data.viewers) {
            state.viewers = data.viewers;
        }

        // ── Our faction online counts ──
        if (data.ourFactionOnline) {
            state.ourFactionOnline = data.ourFactionOnline;
        }

        // ── Our faction ROSTER — the authoritative answer to "is this ours" ──
        //
        // isOwnFactionMember used to know only teammates who RUN FactionOps
        // (memberBars is self-reported) plus whatever the war page happened to
        // expose. A teammate who runs neither was invisible as ours, so if
        // their id reached state.statuses by any route it rendered as a target
        // and no purge could remove it — the overlay showed Wintermoore and
        // woziwu, who are on our side.
        //
        // This list is Torn's own faction roster, relayed by the server from a
        // fetch it already makes for the online counts. Purge immediately so
        // anyone already showing goes on this delivery, not the next one.
        if (Array.isArray(data.ourMemberIds) && data.ourMemberIds.length) {
            noteOwnMemberIds(data.ourMemberIds);
            purgeNonEnemyStatuses();
        }

        // (enemyFactionId, including change detection, is handled near the
        // top of this function — it must run before the statuses merge.)
        if (data.enemyFactionName) {
            state.enemyFactionName = data.enemyFactionName;
            const enemyEl = document.getElementById('fo-enemy-name');
            if (enemyEl) enemyEl.textContent = data.enemyFactionName;
        }

        // Faction key status
        if (data.factionKeyStored !== undefined) {
            state.factionKeyStored = !!data.factionKeyStored;
        }

        // War target (server-synced)
        if (data.warTarget !== undefined) {
            state.warTarget = data.warTarget;
        }
        if (data.warScores !== undefined) {
            state.warScores = data.warScores;
        }
        if (data.warEta !== undefined) {
            state.warEta = data.warEta;
            // Immediately refresh timer display when server ETA arrives
            if (typeof updateWarTimerDisplay === 'function') updateWarTimerDisplay();
        }
        if (data.warPercentage !== undefined && data.warPercentage !== null) {
            state.warPercentage = data.warPercentage;
        }
        // Show toast for broadcasts received via polling
        if (data.lastBroadcast && data.lastBroadcast.timestamp) {
            const lb = data.lastBroadcast;
            if (!state._lastBroadcastTs || lb.timestamp > state._lastBroadcastTs) {
                // Only show if broadcast is less than 60 seconds old
                if (Date.now() - lb.timestamp < 60000) {
                    showToast(`\uD83D\uDCE3 ${lb.message}`, lb.type || 'info');
                    if (typeof firePdaNotification === 'function') {
                        firePdaNotification('admin_broadcast', 'FactionOps Broadcast', lb.message);
                    }
                }
                state._lastBroadcastTs = lb.timestamp;
            }
        }
        // Show toast for assist requests received via polling
        if (data.lastAssistRequest && data.lastAssistRequest.timestamp) {
            const ar = data.lastAssistRequest;
            if (!state._lastAssistRequestTs || ar.timestamp > state._lastAssistRequestTs) {
                if (Date.now() - ar.timestamp < 60000) {
                    showAssistToast(ar.playerName, ar.targetName, ar.attackUrl);
                    if (typeof firePdaNotification === 'function') {
                        firePdaNotification('assist_request', '⚔️ Assist Needed!',
                            `${ar.playerName} needs help attacking ${ar.targetName}!`,
                            ar.attackUrl);
                    }
                }
                state._lastAssistRequestTs = ar.timestamp;
            }
        }

        if (data.warEnded !== undefined) {
            state.warEnded = data.warEnded;
            state.warResult = data.warResult;
            if (data.warEnded) showWarEndedBanner();
        }

        // ── Removed strategy engine ──
        updateStrategyBar();

        // Refresh UI rows

        // Trigger FF fetch if we have new targets without cached FF data
        fetchFairFightBatch();

        // After first data load, enable call toasts for subsequent updates
        hasReceivedInitialData = true;

        // Broadcast state to other tabs if we're the active tab
        if (!document.hidden) {
            broadcastStateChange({
                type: 'state_update',
                warScores: data.warScores,
                warEta: data.warEta,
                chainData: data.chainData,
                strategy: data.strategy,
                enemyActivityByHour: data.enemyActivityByHour,
            });
        }
    }

    /**
     * Connect Socket.IO for real-time push updates.
     * Falls back to polling if connection fails.
     */
    function connectRealtime() {
        if (realtimeSocket) return; // already connected or connecting
        if (!state.jwtToken) return;

        // --- Real-time Connection Strategy (v4.8.4) ---

        // 1. Always attempt SSE via GM_xmlhttpRequest on desktop.
        // This is the most reliable way to bypass Torn's Page CSP.
        if (canUseSSEStream() && !sseConnected) {
            log('Starting SSE Stream (CSP-bypass)...');
            connectSSEStream();
        }

        // 2. Socket.IO is no longer attempted at all.
        //
        // It has not connected once since 5.1.68. Of 1,614 `fo-transport`
        // reports in the warboard log, exactly 18 carried a live socket, and
        // every one of those was v5.1.67; every report from 5.1.68 onward is
        // `socket:null`. Torn's connect-src CSP covers the Socket.IO handshake,
        // which is a page-context XHR — impossible in the two webview hosts by
        // construction, and failing on desktop too since 5.1.68.
        //
        // Attempting it was not free: `connect_error` fired three times at a 2s
        // reconnection delay before the SSE fallback was allowed to run, so the
        // overlay spent several seconds with no realtime transport at all on
        // every single page load.
        //
        // The chain is now SSE first, started above through GM_xmlhttpRequest —
        // the only channel that escapes Torn's CSP. `realtimeSocket` stays null
        // for the life of the page, which is exactly what every
        // `realtimeSocket && realtimeSocket.connected` guard in the polling path
        // already treats as "no socket", so those guards keep working unchanged
        // rather than needing to be touched.
        //
        // Polling is an ALTERNATIVE to SSE, not a safety net beneath it. Do not
        // read the two as running together: connectSSEStream's onloadstart and
        // its first onprogress both call stopPolling(true), and startPolling /
        // scheduleNextPoll then refuse to restart while `sseConnected` is true.
        // So a live SSE stream means polling is stopped, and anything SSE fails
        // to deliver is not quietly backfilled by a poll.
        //
        // What SSE actually carries: nearly everything. The parser branches on
        // `type` for global_toast / assist_request / enemy_surge, and every
        // other frame falls to the catch-all `applyServerData(data)` below —
        // the same consumer /api/poll-long feeds. That covers the war payload
        // (routes.js:260, the identical object the old war_update emit sent),
        // retals, calls, enemyStatuses and memberBars. The deleted
        // `realtimeSocket.on('war_update')` and `on('war_state')` handlers did
        // nothing but call applyServerData themselves, so removing them removed
        // duplicate plumbing, not a delivery path.
        //
        // Known gaps, NOT introduced here — all dead since 5.1.68, when the
        // socket stopped connecting and took its handlers down with it:
        //   - retal_request reaches nothing at all. No SSE branch, and /api/poll
        //     carries no retal-request field, so "Retal request sent!" shows the
        //     sender a confirmation nobody else ever receives. Fixing it is one
        //     else-if mirroring the assist_request branch.
        //   - chain-monitor.js:249 and :320 emit war_ended and the periodic
        //     war_update to the Socket.IO room only, with no broadcastSSE beside
        //     them, so a quiet stretch can leave an SSE client's score and ETA
        //     frozen until some other event triggers broadcastWarUpdate.

        // One-shot transport report, so which transport actually carries events
        // per host stays answerable from the warboard log instead of inferred.
        //
        // MUST go through GM_xmlhttpRequest, not fetch. Measured on
        // warboard-iOS: every page-context request to tornwar.com fails with
        // "TypeError: Load failed" — even a static .meta.js — because Torn's
        // connect-src CSP is enforced by WKWebView. GM_xhr does the request
        // natively and is the only channel that escapes it, which is exactly why
        // the long-poll uses it too. A fetch-based report would be silently lost
        // on the one host this report exists to describe.
        setTimeout(() => {
            try {
                const body = JSON.stringify({
                    tag: 'fo-transport',
                    data: {
                        v: SCRIPT_VERSION,
                        warboard: IS_WARBOARD,
                        pda: IS_PDA,
                        socket: null,          // permanent: no socket is created
                        sse: !!sseConnected,
                        longpoll: !!(CONFIG.USE_LONGPOLL && !_lpDisabled),
                    },
                });
                const url = CONFIG.SERVER_URL + '/api/debug/client-log';
                if (typeof GM_xmlhttpRequest === 'function') {
                    GM_xmlhttpRequest({
                        method: 'POST', url, data: body,
                        headers: { 'Content-Type': 'application/json' },
                        onload: function () { }, onerror: function () { },
                    });
                } else {
                    fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body,
                    }).catch(() => { });
                }
            } catch (e) { /* diagnostics must never break the overlay */ }
        }, 20000);
    }

    /** Disconnect Socket.IO. */
    function disconnectRealtime() {
        if (realtimeSocket) {
            realtimeSocket.disconnect();
            realtimeSocket = null;
            log('Socket.IO disconnected');
            updateRtBadge(false);
        }
    }

    // ── SSE stream via GM_xmlhttpRequest (Tampermonkey on Chrome) ─────────

    let sseAbort = null;       // abort handle from GM_xmlhttpRequest
    let sseLastLength = 0;     // track how much of responseText we've parsed
    let sseConnected = false;
    let sseRetryTimer = null;
    const SSE_RETRY_MS = 5000; // retry after 5s on disconnect
    // Failed FIRST connects, counted separately from mid-stream drops.
    //
    // The 12s startup watchdog used to be terminal: it aborted, called
    // startPolling() and never tried SSE again for the whole session. One
    // unlucky first connect — a slow request on launch, a network change, the
    // app resuming — and the client sat on polling until the user happened to
    // reload. That is exactly what was seen in the field, and the tell was that
    // reloading always fixed it, because a reload is the only thing that
    // re-enters connectSSEStream.
    //
    // It now retries like the stale watchdog already did, but with a CAP and
    // backoff. The cap matters: this watchdog exists for hosts whose GM shim
    // cannot stream at all (warboard before 0.11.276), and on those an
    // uncapped retry is an infinite doomed request every few seconds, on
    // battery. After SSE_START_MAX_TRIES we stop and let polling own the
    // transport for the session, which is the old behaviour — reached only
    // once we have evidence rather than assumed from one failure.
    let sseStartFailures = 0;
    const SSE_START_MAX_TRIES = 3;
    // Liveness. The 12s watchdog in connectSSEStream only guards the stream
    // STARTING; once sseConnected flipped true nothing ever asked again whether
    // the stream was still alive. A half-open connection — laptop sleeps, phone
    // changes network, a middlebox drops the socket without a FIN — left
    // sseConnected true forever, and because startPolling() refuses to run while
    // sseConnected is true, the overlay sat behind a green RT badge showing
    // pre-drop data until the page was reloaded by hand.
    //
    // The server writes a heartbeat every 5s (routes.js), so silence is a
    // reliable death signal. 20s = four missed heartbeats, chosen so a single
    // slow beat or one throttled timer tick can't trigger a false reconnect.
    let sseLastMessageAt = 0;
    let sseStaleTimer = null;
    const SSE_STALE_MS = 20000;

    /**
     * Can we use GM_xmlhttpRequest streaming?
     * Must be on Tampermonkey (not PDA), and Socket.IO must not already be connected.
     */
    function canUseSSEStream() {
        if (IS_PDA) return false;
        // warboard USED to be skipped here: its GM_xmlhttpRequest resolved only on
        // completion, and an SSE stream never completes, so the request hung and
        // delivered nothing. warboard 0.11.276 implements onloadstart/onprogress
        // streaming, so it can now serve SSE like Stay does — and skipping it would
        // pin warboard to long-polling forever. Older builds are handled by the
        // watchdog in connectSSEStream() rather than by refusing to try.
        if (realtimeSocket && realtimeSocket.connected) return false;
        if (typeof GM_xmlhttpRequest !== 'function') return false;
        return true;
    }

    /** Connect SSE stream via GM_xmlhttpRequest onprogress. */
    function connectSSEStream() {
        if (!canUseSSEStream()) return;
        if (sseAbort) return; // already connected
        if (!state.jwtToken) return;

        const warId = deriveWarId();
        if (!warId || !state.myFactionId) return;

        const url = CONFIG.SERVER_URL + '/api/stream?warId=' + encodeURIComponent(warId)
            + '&token=' + encodeURIComponent(state.jwtToken)
            + (state.enemyFactionId ? '&enemyFactionId=' + encodeURIComponent(state.enemyFactionId) : '');

        log('Connecting SSE stream to', CONFIG.SERVER_URL + '/api/stream');
        sseLastLength = 0;
        sseConnected = false;
        // Start every stream on an empty buffer. sseLastLength was always reset
        // here and in both teardowns, but window.sseBuffer never was — so a
        // stream cut mid-event (between `data:` and its terminating blank line)
        // left a partial JSON fragment behind, and the NEXT stream's first
        // chunk was appended to it. That produced one unparseable event which
        // the catch below swallows silently, and the event lost was the
        // reconnect's initial full-state snapshot — so the overlay kept showing
        // pre-drop data with no error anywhere.
        window.sseBuffer = '';
        sseLastMessageAt = Date.now();
        startSSEStaleWatch();

        // Watchdog: a GM shim without streaming callbacks (warboard before
        // 0.11.276) leaves this request open forever, silently delivering
        // nothing. Give it 12s to report a start, then abort so the connection
        // isn't left dangling and long-poll owns the transport cleanly.
        const sseWatchdog = setTimeout(() => {
            if (sseConnected) return;
            warn('SSE never started after 12s — aborting; host GM shim likely has no onprogress');
            try { if (sseAbort && typeof sseAbort.abort === 'function') sseAbort.abort(); } catch (e) { }
            sseAbort = null;
            // The liveness interval was armed at connect time. Nothing else on
            // this path clears it, and a stream that never started will never
            // reach cleanupSSE, so without this the interval survives every
            // failed attempt and accumulates one timer per retry.
            stopSSEStaleWatch();
            if (!pollTimer) startPolling();
            // Retry the first connect rather than giving up on SSE for the
            // session. Backoff grows per failure so a host that genuinely
            // cannot stream is not hammered while we find that out.
            sseStartFailures++;
            if (sseStartFailures < SSE_START_MAX_TRIES) {
                const delay = SSE_RETRY_MS * sseStartFailures;   // 5s, 10s
                log('SSE start failed (' + sseStartFailures + '/' + SSE_START_MAX_TRIES
                    + ') — retrying in ' + (delay / 1000) + 's');
                if (!sseRetryTimer) {
                    sseRetryTimer = setTimeout(() => {
                        sseRetryTimer = null;
                        if (canUseSSEStream() && state.jwtToken) connectSSEStream();
                    }, delay);
                }
            } else {
                warn('SSE start failed ' + SSE_START_MAX_TRIES
                    + ' times — this host cannot stream; polling owns the transport');
            }
        }, 12000);

        sseAbort = GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'text',
            onloadstart: () => { clearTimeout(sseWatchdog); sseStartFailures = 0; sseConnected = true; sseLastMessageAt = Date.now(); log("SSE stream started"); updateRtBadge("sse"); if (pollTimer) stopPolling(true); },
            timeout: 0,
            onprogress: (resp) => {
                if (!resp || resp.responseText === undefined || resp.responseText === null) {
                    return;
                }
                if (!sseConnected) {
                    clearTimeout(sseWatchdog);
                    sseConnected = true;
                    log('SSE stream connected');
                    updateRtBadge('sse');
                    // Stop polling — SSE is now handling updates
                    if (pollTimer) {
                        stopPolling(true);
                    }
                }

                // Any byte at all — heartbeat, keepalive comment or a real event
                // — proves the stream is still alive. Stamped before parsing so
                // a malformed event still counts as liveness: the connection is
                // the thing being judged here, not the payload.
                sseLastMessageAt = Date.now();

                // Append new data to buffer (using the existing sseLastLength method)
                const responseText = resp.responseText || '';
                const newText = responseText.substring(sseLastLength);
                sseLastLength = responseText.length;

                // Initialize buffer if missing
                if (typeof window.sseBuffer === 'undefined') window.sseBuffer = '';
                window.sseBuffer += newText;

                // Process full events separated by double newline
                let boundary;
                while ((boundary = window.sseBuffer.indexOf('\n\n')) !== -1) {
                    const chunk = window.sseBuffer.slice(0, boundary).trim();
                    window.sseBuffer = window.sseBuffer.slice(boundary + 2); // Remove processed chunk

                    if (!chunk) continue; // Empty heartbeat

                    const match = chunk.match(/^data:\s*(.+)$/s);
                    if (!match) continue; // Skip non-data lines (like : keepalive)

                    try {
                        const data = JSON.parse(match[1]);
                        if (data && data.type === 'global_toast') {
                            showToast(`📣 ${data.message}`, data.type || 'info');
                            if (typeof firePdaNotification === 'function') {
                                firePdaNotification('admin_broadcast', 'FactionOps Broadcast', data.message);
                            }
                        } else if (data && data.type === 'assist_request') {
                            showAssistToast(data.playerName, data.targetName, data.attackUrl);
                            if (typeof firePdaNotification === 'function') {
                                firePdaNotification('assist_request', '⚔️ Assist Needed!',
                                    `${data.playerName} needs help attacking ${data.targetName}!`,
                                    data.attackUrl);
                            }
                        } else if (data && data.type === 'enemy_surge') {
                            const msg = `🚨 +${data.delta} enemies came online in ${data.windowSec}s — ${data.online} now active`;
                            showToast(msg, 'warning');
                            if (typeof firePdaNotification === 'function') {
                                firePdaNotification('enemy_surge', 'Enemy Online Surge', msg);
                            }
                        } else {
                            applyServerData(data);
                        }
                    } catch (_) { }
                }
            },
            onload: () => {
                // Stream ended (server closed)
                log('SSE stream ended by server');
                cleanupSSE();
                scheduleSSERetry();
            },
            onerror: (err) => {
                warn('SSE stream error:', err?.error || err?.statusText || 'unknown');
                cleanupSSE();
                scheduleSSERetry();
            },
            ontimeout: () => {
                warn('SSE stream timeout');
                cleanupSSE();
                scheduleSSERetry();
            }
        });
    }

    /// Watch an ESTABLISHED stream for silence. Separate from the 12s startup
    /// watchdog, which only ever asked whether the stream began.
    ///
    /// Deliberately NOT gated on document.hidden: PDA's WebView reports
    /// hidden=true while the user is actively looking at the page, so gating
    /// would disable the check on the host that needs it most. A background tab
    /// whose timers get throttled may come back, see a large gap and reconnect
    /// unnecessarily — that is the cheap direction to be wrong, since a spurious
    /// reconnect costs one request and a missed death costs the whole war.
    function startSSEStaleWatch() {
        stopSSEStaleWatch();
        sseStaleTimer = setInterval(() => {
            if (!sseConnected) return;
            if (Date.now() - sseLastMessageAt <= SSE_STALE_MS) return;
            warn('SSE silent for ' + Math.round((Date.now() - sseLastMessageAt) / 1000)
                + 's (heartbeat is every 5s) — treating the stream as dead');
            // Abort first so the dead request cannot later fire onload/onerror
            // and race the reconnect we are about to schedule.
            try { if (sseAbort && typeof sseAbort.abort === 'function') sseAbort.abort(); } catch (e) { }
            cleanupSSE();      // clears sseConnected, which is what lets polling restart
            scheduleSSERetry();
            // 30s, not 5s (2026-09-04). The threshold above is still 20s of
            // silence, so a dead stream is caught within 20-50s rather than
            // 20-25s -- the owner traded that window for six times fewer
            // wakeups. This is the ONE timer here that is not overlay dressing:
            // it is what reconnects the stream the war-page call markers read.
        }, 30000);
    }

    function stopSSEStaleWatch() {
        if (sseStaleTimer) { clearInterval(sseStaleTimer); sseStaleTimer = null; }
    }

    function cleanupSSE() {
        stopSSEStaleWatch();
        sseConnected = false;
        sseAbort = null;
        sseLastLength = 0;
        // Drop any half-written event with the stream that was writing it —
        // otherwise the fragment is prepended to the next stream's first chunk
        // and eats that stream's opening full-state snapshot.
        window.sseBuffer = '';

        // Only restart polling if we aren't currently trying to reconnect
        // and no other real-time connection exists.
        if (!sseRetryTimer && !sseConnected && !(realtimeSocket && realtimeSocket.connected)) {
            updateRtBadge(false);
            if (state.jwtToken) startPolling();
        }
    }

    function disconnectSSEStream() {
        if (sseRetryTimer) { clearTimeout(sseRetryTimer); sseRetryTimer = null; }
        stopSSEStaleWatch();
        if (sseAbort && typeof sseAbort.abort === 'function') {
            sseAbort.abort();
        }
        sseConnected = false;
        sseAbort = null;
        sseLastLength = 0;
        window.sseBuffer = '';   // same reason as cleanupSSE
        updateRtBadge(false);
    }

    function scheduleSSERetry() {
        if (sseRetryTimer) return;
        sseRetryTimer = setTimeout(() => {
            sseRetryTimer = null;
            if (canUseSSEStream() && state.jwtToken) {
                connectSSEStream();
            }
        }, SSE_RETRY_MS);
    }

    /** Update the realtime/polling badge. */
    function updateRtBadge(mode) {
        const badge = document.getElementById('fo-rt-badge');
        if (!badge) return;

        const isSocketActive = realtimeSocket && realtimeSocket.connected;
        const isSseActive = sseConnected;

        if (mode === 'sse' || isSseActive) {
            badge.className = 'fo-rt-badge rt';
            badge.textContent = 'RT';
            badge.title = 'SSE stream active';
        } else if (mode === true || mode === 'rt' || isSocketActive) {
            badge.className = 'fo-rt-badge rt';
            badge.textContent = 'RT';
            badge.title = 'Socket.IO realtime active';
        } else {
            badge.className = 'fo-rt-badge poll';
            badge.textContent = 'POLL';
            badge.title = 'Falling back to polling';
        }
    }

    // =========================================================================
    // SECTION 7: AUTH MANAGER
    // =========================================================================

    /**
     * Authenticate with the FactionOps server.
     * Sends the Torn API key to POST /api/auth, receives a JWT.
     */
    function authenticate() {
        return new Promise((resolve, reject) => {
            if (!CONFIG.API_KEY) {
                return reject(new Error('No API key configured'));
            }
            log('Authenticating with server...', IS_PDA ? '(PDA mode)' : '(desktop)');
            if (IS_PDA) log('API key starts with:', CONFIG.API_KEY.substring(0, 4));

            httpRequest({
                method: 'POST',
                url: `${CONFIG.SERVER_URL}/api/auth`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ apiKey: CONFIG.API_KEY, scriptVersion: SCRIPT_VERSION }),
                onload(res) {
                    log('Auth response status:', res.status);
                    const body = safeParse(res.responseText);
                    if (res.status === 426) {
                        const msg = (body && body.error) || 'FactionOps is outdated — please update.';
                        warn('Auth blocked: outdated script.', msg);
                        try {
                            showToast(msg + ' Open Tampermonkey → Check for userscript updates.', 'error');
                        } catch (_) { }
                        return reject(new Error(msg));
                    }
                    if (res.status >= 200 && res.status < 300 && body && body.token) {
                        state.jwtToken = body.token;
                        GM_setValue('factionops_jwt', body.token);
                        if (body.player) {
                            state.myPlayerId = String(body.player.playerId || body.player.id);
                            state.myPlayerName = body.player.playerName || body.player.name;
                            state.myFactionId = String(body.player.factionId || '0');
                            state.myFactionName = body.player.factionName || '';
                            state.myFactionPosition = (body.player.factionPosition || '').toLowerCase();
                        }
                        // Subscription expiry — 'permanent' for owner /
                        // factionops partner; epoch-ms for xanax-paying
                        // factions; null if unknown. Settings modal reads
                        // this to render a "23 days left" line.
                        state.subscriptionExpiresAt = (body.subscriptionExpiresAt !== undefined)
                            ? body.subscriptionExpiresAt
                            : null;
                        log('Authenticated as', state.myPlayerName || 'unknown',
                            '— factionId:', state.myFactionId);

                        // Start self-reporting bars/cooldowns immediately on
                        // auth success — previously this only ran after the
                        // user clicked "Activate FactionOps", so members who
                        // never activated the overlay never reported and
                        // their cooldowns never registered on the faction
                        // panel. startEnergyPoll is idempotent.
                        try { startEnergyPoll(); } catch (_) { }
                        try { startAttacksPoll(); } catch (_) { }

                        // Fetch faction's custom broadcast roles so
                        // isLeader() gates Shout + Cooldowns the same way
                        // the server does. Best-effort — on failure we
                        // keep using the hardcoded defaults.
                        getAction('/api/broadcast/roles').then(resp => {
                            if (resp && Array.isArray(resp.roles)) {
                                state.allowedBroadcastRoles = resp.roles;
                            }
                        }).catch(() => { });

                        // Pool opt-in is now silent. The settings panel
                        // still has the "Share my API key with faction
                        // pool" toggle for anyone who wants to opt out.
                        // Server still returns body.poolingDefaultApplied
                        // for back-compat — just no longer surfaced as
                        // a toast.

                        resolve(body);
                    } else {
                        const msg = (body && body.error) || `HTTP ${res.status}`;
                        warn('Auth failed:', msg);
                        reject(new Error(msg));
                    }
                },
                onerror(e) {
                    warn('Auth network error:', e);
                    reject(new Error('Network error — is the server running?'));
                },
            });
        });
    }

    /**
     * Verify current API key against the server.
     * Returns { valid: true, player: {...} } or throws.
     */
    function verifyApiKey() {
        return new Promise(async (resolve, reject) => {
            if (!CONFIG.API_KEY) {
                return reject(new Error('No API key'));
            }

            if (IS_PDA) {
                try {
                    const resp = await fetch(`${CONFIG.SERVER_URL}/api/auth/verify`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${state.jwtToken}`,
                        },
                        body: JSON.stringify({ apiKey: CONFIG.API_KEY }),
                    });
                    const body = await resp.json();
                    if (resp.ok && body && body.valid) {
                        resolve(body);
                    } else {
                        reject(new Error((body && body.error) || 'Verification failed'));
                    }
                } catch (e) {
                    reject(new Error('Network error'));
                }
                return;
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${CONFIG.SERVER_URL}/api/auth/verify`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.jwtToken}`,
                },
                data: JSON.stringify({ apiKey: CONFIG.API_KEY }),
                onload(res) {
                    const body = safeParse(res.responseText);
                    if (res.status === 200 && body && body.valid) {
                        resolve(body);
                    } else {
                        reject(new Error((body && body.error) || 'Verification failed'));
                    }
                },
                onerror() {
                    reject(new Error('Network error'));
                },
            });
        });
    }

    // =========================================================================
    // SECTION 8: ACTION HELPERS (HTTP POST)
    // =========================================================================

    // v5.0.96: copy call message to clipboard with different wording
    // for regular call vs deal call:
    //   Regular:  'I got <Name>[ in N minutes]'   ← timer included
    //   Deal:     'I have a med deal with <Name>' ← no timer per user
    // Deals are arrangements, not race-the-clock events, so the time
    // suffix doesn't add value there.
    /// The call message. Extracted so the clipboard copy and the faction-chat
    /// post share ONE source of truth — two copies of this wording would drift
    /// the first time either is edited.
    function callChatText(targetId, targetName, isDeal) {
        if (!targetName) return null;
        let text = isDeal
            ? 'I have a med deal with ' + targetName
            : 'I got ' + targetName;
        if (!isDeal) {
            try {
                const s = state.statuses && state.statuses[targetId];
                if (s) {
                    const rem = statusRemainingSec(s);
                    if (rem && rem > 0) {
                        const mins = Math.max(1, Math.round(rem / 60));
                        text += ' in ' + mins + (mins === 1 ? ' minute' : ' minutes');
                    }
                }
            } catch (_) { /* don't let timer calc kill the message */ }
        }
        return text;
    }

    function copyCallTextToClipboard(targetId, targetName, isDeal) {
        const text = callChatText(targetId, targetName, isDeal);
        if (!text) return;
        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(text, 'text');
                return;
            }
        } catch (_) { }
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(text).catch(() => { });
            }
        } catch (_) { }
    }

    // ── Posting a call into Torn faction chat ────────────────────────────
    //
    // Owner-authorized; the owner reports an admin allowed it for another
    // script doing the same thing. The line the admin drew is PRESENCE, not
    // pixels: a script acting while you are asleep is bannable, a script
    // turning one click of yours into a smarter version of itself is not.
    // Pressing CALL is the action; this is that action being carried out.
    // So the ONE rule everything below protects: nothing posts without a
    // fresh CALL press. No timers, no retries, no resend on failure, no send
    // on re-render, no send on uncall.

    // Diagnostics keyed by REASON, not latched once globally. A single global
    // latch spent its one shot on the first benign miss of the page — usually
    // 'no-faction-id' before auth lands — and then never reported the selector
    // break we actually want to hear about. Capped so a Torn rebuild cannot
    // turn this into a flood.
    const _callChatDiagSeen = new Set();
    function reportCallChatDiag(data) {
        try {
            const r = String((data && data.reason) || '?');
            if (_callChatDiagSeen.has(r) || _callChatDiagSeen.size >= 5) return;
            _callChatDiagSeen.add(r);
            const body = JSON.stringify({
                tag: 'fo-call-chat',
                data: Object.assign({ v: SCRIPT_VERSION, pda: IS_PDA, warboard: IS_WARBOARD }, data)
            });
            const url = CONFIG.SERVER_URL + '/api/debug/client-log';
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'POST', url, data: body,
                    headers: { 'Content-Type': 'application/json' },
                    onload: function () { }, onerror: function () { }
                });
            } else {
                fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => { });
            }
        } catch (_) { /* diagnostics must never break a call */ }
    }

    /// Our faction's channel toggle. Scoped to state.myFactionId — a bare
    /// [id^="channel_panel_button:faction-"] matches ANY faction box, and
    /// posting a war call into another faction's chat is the worst outcome
    /// here. The id contains a ':' so it is not a valid bare CSS #id;
    /// getElementById is required (a bare selector throws and kills the handler).
    function factionChatToggleButton() {
        const fid = state.myFactionId;
        if (!fid || String(fid) === '0') return null;   // auth stores '0' for factionless
        return document.getElementById('channel_panel_button:faction-' + fid);
    }

    /// The channel content box. `faction-<id>` is generic enough that other
    /// page markup could use it, so provenance is checked against #chatRoot
    /// rather than trusting the first match in document order.
    function factionChatBox() {
        const fid = state.myFactionId;
        if (!fid || String(fid) === '0') return null;
        const el = document.getElementById('faction-' + fid);
        return (el && el.closest && el.closest('#chatRoot')) ? el : null;
    }

    // One send in flight at a time. Two calls in quick succession would other-
    // wise interleave through the SHARED textarea: A writes its text, B over-
    // writes it, then A's deferred check clicks send while React holds B — A
    // is silently lost and its diagnostic still reports success.
    let _callChatBusy = false;

    function sendCallToChat(text) {
        if (!text || _callChatBusy) return;
        const btn = factionChatToggleButton();
        if (!btn) {
            // These two must stay distinguishable: before auth lands there is
            // no faction id and the miss is benign; afterwards it means Torn
            // renamed the id and the feature is silently broken.
            reportCallChatDiag({
                reason: (!state.myFactionId || String(state.myFactionId) === '0')
                    ? 'no-faction-id' : 'no-channel-button'
            });
            return;
        }
        _callChatBusy = true;
        const wasOpen = /opened___/.test(String(btn.className || ''));
        if (!wasOpen) { try { btn.click(); } catch (_) { } }

        let retried = false;
        const attempt = () => {
            try {
                const box = factionChatBox();
                const ta = box && box.querySelector('textarea[class*="textarea___"]');
                if (!ta) {
                    // Only if WE opened it may React still be mounting the input
                    // row. One re-LOOK, never a re-send: this branch sits
                    // upstream of any send, so it cannot duplicate a message.
                    if (!wasOpen && !retried) { retried = true; setTimeout(attempt, 250); return; }
                    _callChatBusy = false;
                    reportCallChatDiag({ reason: box ? 'no-textarea' : 'no-box', wasOpen });
                    return;
                }
                doSend(box, ta, wasOpen);
            } catch (_) { _callChatBusy = false; }
        };

        function doSend(box, ta, wasOpen2) {
            // NEVER type over a draft, and not merely out of politeness: the
            // send button is disabled ONLY while the box is empty, so with a
            // draft present it is already enabled and `!disabled` proves
            // nothing about whether React took OUR text. If the native setter
            // ever stops working — a Torn rebuild, exactly what the diagnostic
            // exists to catch — we would click send on the user's half-typed
            // draft and post THAT to faction chat while the log said 'ok'.
            if (ta.value) {
                _callChatBusy = false;
                reportCallChatDiag({ reason: 'draft-present', wasOpen: wasOpen2 });
                return;
            }
            // Page realm, not ours: in a true isolated world (Firefox TM Xray)
            // our HTMLTextAreaElement is a different class from the page's, so
            // the setter would not apply and the keyCode expandos below would
            // be invisible to page-world React.
            const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
            let nativeSetter = false;
            try {
                // MUST be HTMLTextAreaElement — the HTMLInputElement setter
                // silently no-ops on a textarea and React never sees the value.
                const d = Object.getOwnPropertyDescriptor(
                    (W.HTMLTextAreaElement || HTMLTextAreaElement).prototype, 'value');
                if (d && typeof d.set === 'function') { d.set.call(ta, text); nativeSetter = true; }
                else { ta.value = text; }
                // React 16+ keeps its OWN copy of the value on the node
                // (_valueTracker) and swallows the change event when the
                // tracker already matches what it reads back. The native
                // setter alone updated the DOM — so the text appeared on
                // screen — while React went on believing the box was empty,
                // which is exactly why the send button never enabled and
                // nothing posted. Rewinding the tracker to '' guarantees a
                // mismatch, so onChange fires and React's state catches up.
                try {
                    const tracker = ta._valueTracker;
                    if (tracker && typeof tracker.setValue === 'function') tracker.setValue('');
                } catch (_) { /* no tracker on this build — the setter alone may suffice */ }
                ta.dispatchEvent(new (W.Event || Event)('input', { bubbles: true }));
            } catch (_) {
                _callChatBusy = false;
                reportCallChatDiag({ reason: 'set-value-threw', wasOpen: wasOpen2, nativeSetter });
                return;
            }
            // React may not flush the disabled -> enabled flip inside dispatch,
            // so the go/no-go check happens after it. setTimeout and NOT rAF:
            // rAF does not run in a hidden tab, which would park the send and
            // fire a stale war call minutes later.
            //
            // POLLED, not a single macrotask. One tick is enough on desktop and
            // usually is not on a phone: every PDA failure in the diag reported
            // enabledAfterInput:false — React simply had not re-rendered yet —
            // while the one PDA success reported true. Desktop sent cleanly in
            // the same conditions, so the difference was how long the device
            // took, not what it supports. Give it up to ~1s, checking often,
            // and fall through to the Enter path only when the button really
            // never enables.
            // 2.5s, not 1s. The first real measurement from a PDA phone came
            // back at waitedMs:452 — React took nearly half a second to flush
            // the disabled -> enabled flip — and that was ONE sample on one
            // device, unloaded. A busier phone mid-chain will be slower, and a
            // budget the observed value already eats half of is not a budget.
            // Overshooting costs nothing: the poll exits the moment the button
            // enables, so a fast device still sends immediately and only a
            // genuine failure waits the full time before reporting.
            const SEND_WAIT_MS = 2500, SEND_POLL_MS = 50;
            const sendStartedAt = Date.now();
            const sendDeadline = sendStartedAt + SEND_WAIT_MS;
            const awaitSendable = () => {
                // Still disabled and time left: look again rather than give up.
                try {
                    const b = factionChatBox();
                    const t = b && b.querySelector('textarea[class*="textarea___"]');
                    const r = t && (t.parentElement || b);
                    const sb = r && (r.querySelector('button[class*="iconWrapper___"]')
                        || b.querySelector('button[class*="iconWrapper___"]'));
                    if (sb && sb.disabled && Date.now() < sendDeadline) {
                        setTimeout(awaitSendable, SEND_POLL_MS);
                        return;
                    }
                } catch (_) { /* fall through to the real check */ }
                finish();
            };
            const finish = () => {
                let clickedSend = false, enterFallback = false, reason = 'ok', enabled = false;
                try {
                    // Re-resolve BOTH nodes. React can remount the input row; a
                    // detached textarea still reports our value (nothing
                    // re-renders a dead node), so Enter would fire into a node
                    // with no listeners while the log claimed success.
                    const liveBox = factionChatBox() || box;
                    const liveTa = liveBox.querySelector('textarea[class*="textarea___"]') || ta;
                    // Scope to the row that OWNS the textarea. Box-wide takes
                    // the first icon button in document order — a header control
                    // or a per-message action would win, would not be disabled,
                    // and we would click a control nobody sanctioned.
                    const row = liveTa.parentElement || liveBox;
                    const sendBtn = row.querySelector('button[class*="iconWrapper___"]')
                        || liveBox.querySelector('button[class*="iconWrapper___"]');
                    if (sendBtn && !sendBtn.disabled) {
                        enabled = true;
                        sendBtn.click();
                        clickedSend = true;
                    } else if (document.contains(liveTa) && liveTa.value === text) {
                        // Enter is tried even when the button sits DISABLED,
                        // which is the case that was failing: the button is
                        // gated on React's state, and if React never took our
                        // value it stays disabled forever. But the textarea's
                        // own onKeyDown handler may read e.target.value — the
                        // DOM value — which IS our text. So the keyboard path
                        // can succeed exactly where the button path cannot.
                        //
                        // Safe because of the draft guard upstream: the box was
                        // empty before we typed, so Enter can only send OUR
                        // text or nothing. It can never send something the user
                        // was part-way through writing.
                        enabled = !!(sendBtn && !sendBtn.disabled);
                        const ev = new (W.KeyboardEvent || KeyboardEvent)('keydown',
                            { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
                        // React's synthetic events read the legacy fields, which
                        // are not settable through the init dict.
                        try {
                            Object.defineProperty(ev, 'keyCode', { get: () => 13 });
                            Object.defineProperty(ev, 'which', { get: () => 13 });
                        } catch (_) { }
                        liveTa.dispatchEvent(ev);
                        enterFallback = true; reason = 'enter-fallback';
                    } else {
                        reason = 'no-send-button-and-value-not-taken';
                    }
                    // Put the box back to empty. It WAS empty before we typed
                    // (the draft guard guarantees that), so leftover text is
                    // not a draft — but the guard on the NEXT call cannot tell
                    // the difference and would refuse forever. One failed send
                    // would otherwise poison every later call.
                    // Takes the node to clear rather than closing over one:
                    // the check below runs 400ms later and must act on
                    // whatever textarea is live THEN, not the one we captured.
                    const clearBox = (node) => {
                        try {
                            if (!node) return;
                            const d2 = Object.getOwnPropertyDescriptor(
                                (W.HTMLTextAreaElement || HTMLTextAreaElement).prototype, 'value');
                            if (d2 && typeof d2.set === 'function') d2.set.call(node, '');
                            else node.value = '';
                            // Seed the tracker with the OLD text so React sees
                            // a change to '' and runs onChange. Setting it to
                            // '' would make React treat the clear as a no-op.
                            const t2 = node._valueTracker;
                            if (t2 && typeof t2.setValue === 'function') t2.setValue(text);
                            node.dispatchEvent(new (W.Event || Event)('input', { bubbles: true }));
                        } catch (_) { }
                    };
                    const done = (r) => {
                        _callChatBusy = false;
                        reportCallChatDiag({
                            reason: r, wasOpen: wasOpen2, nativeSetter,
                            enabledAfterInput: enabled, clickedSend, enterFallback,
                            waitedMs: Date.now() - sendStartedAt
                        });
                    };
                    if (!clickedSend && !enterFallback) { clearBox(liveTa); done(reason); return; }
                    // Torn empties the textarea when a message actually goes
                    // out, so the box is its own receipt. Read it a beat later:
                    // still our text = nothing was sent, whichever path we
                    // took. This is what tells 'the click was swallowed' apart
                    // from 'it worked'. No retry on failure — clean up and
                    // report, and the next post needs a fresh CALL press.
                    setTimeout(() => {
                        let sent, node = null;
                        try {
                            // Re-resolve, do NOT reuse liveTa. 400ms is long
                            // enough for React to remount the input row (an
                            // inbound chat message is enough). A detached node
                            // would read as "gone, so it sent" while the FRESH
                            // textarea still holds our text — reinstating the
                            // permanent draft-present poison this check exists
                            // to prevent.
                            const b2 = factionChatBox() || liveBox;
                            node = b2 && b2.querySelector('textarea[class*="textarea___"]');
                            sent = !node || node.value !== text;
                        } catch (_) { sent = false; }
                        if (!sent) clearBox(node);
                        done((clickedSend ? 'click' : 'enter') + (sent ? '-sent' : '-did-not-send'));
                    }, 400);
                    return;
                } catch (_) { reason = 'send-threw'; }
                _callChatBusy = false;
                reportCallChatDiag({
                    reason, wasOpen: wasOpen2, nativeSetter,
                    enabledAfterInput: enabled, clickedSend, enterFallback,
                    waitedMs: Date.now() - sendStartedAt
                });
            };
            awaitSendable();
        }

        attempt();
    }

    function emitCallTarget(targetId, isDeal) {
        // v5.0.23: removed the silent `if (!state.connected) return;` —
        // PDA users on flaky mobile data flip state.connected=false after
        // just 3 failed polls, then the Call button silently does nothing
        // with zero feedback (Bloodyrein report). postAction has its own
        // auth/network error handling and surfaces real errors via toast,
        // which is what the user actually wants. Also kick polling so
        // state.connected refreshes faster on the next tick.
        const warId = deriveWarId();
        if (!warId) {
            showToast('No active war detected', 'error');
            return;
        }
        if (!state.jwtToken) {
            showToast('Not signed in — open Settings ⚙ and re-enter your API key', 'error');
            return;
        }
        if (!state.connected && typeof startPolling === 'function') {
            // Best-effort: poke polling so the connection state recovers
            // promptly. Doesn't block the call attempt.
            try { startPolling(); } catch (_) { }
        }
        // Preflight: enforce server's per-caller cap client-side so the
        // user gets instant feedback instead of waiting for a 409 round
        // trip. Each player can hold at most ONE regular call and ONE
        // deal call simultaneously (two independent buckets).
        const tid = String(targetId);
        const wantDeal = !!isDeal;
        const existingTid = Object.keys(state.calls).find(t => {
            const c = state.calls[t];
            return c && c.calledBy && String(c.calledBy.id) === String(state.myPlayerId)
                && (!!c.isDeal) === wantDeal && t !== tid;
        });
        if (existingTid) {
            const existingName = (state.statuses[existingTid] && state.statuses[existingTid].name)
                || ('target ' + existingTid);
            showToast(
                `You already have ${wantDeal ? 'a deal call' : 'a call'} on ${existingName} — uncall first`,
                'warning'
            );
            return;
        }
        // Captured BEFORE the optimistic write below destroys the evidence.
        // The preflight above deliberately does not block a re-call of the
        // SAME target, and two paths re-enter here for one gesture: on
        // Android/PDA the Call button binds both a 600ms long-press timer and
        // `contextmenu`, which Chromium fires at ~500ms with no touchcancel to
        // clear the timer; and the Next-Up Call button is rebuilt without
        // filtering on state.calls, so a double-tap re-enters too. A duplicate
        // row update is invisible; a duplicate CHAT POST is two identical war
        // calls in front of the whole faction. So only the chat send is gated.
        const priorCall = state.calls[tid];
        // Optimistic update
        state.calls[tid] = {
            calledBy: { id: state.myPlayerId, name: state.myPlayerName || 'You' },
            calledAt: Date.now(),
            isDeal: !!isDeal,
        };
        // The native war row is not one of updateTargetRow's concerns, so mark
        // it here too -- otherwise pressing Call changes nothing on Torn's own
        // list until the next poll echoes the call back.
        try { markCalledRows(); } catch (_) { }
        const targetName = state.statuses[tid]?.name || null;
        // v5.0.95: copy call message to clipboard — wording branches
        // on isDeal flag. Fires on the optimistic update so clipboard
        // is ready before the server round-trip. Stays HERE and stays
        // synchronous: PDA's clipboard only works inside the tap.
        if (targetName) copyCallTextToClipboard(tid, targetName, !!isDeal);
        // Composed HERE, synchronously, and carried into the .then() below.
        // Computing it after the round-trip lost the " in N minutes" suffix:
        // statusRemainingSec reads state.statuses[tid], and a status refresh
        // landing during the POST replaces that entry, so the timer the
        // clipboard captured was already gone by the time chat asked for it.
        // One composition, one string, clipboard and chat byte-identical.
        const chatText = targetName ? callChatText(tid, targetName, !!isDeal) : null;
        const payload = { warId, targetId: tid, targetName };
        if (isDeal) payload.isDeal = true;
        postAction('/api/call', payload)
            .then(() => {
                // Chat posts only AFTER the server accepts. The clipboard can
                // be optimistic because it is private; this is not. A 409 from
                // a teammate calling first rolls the call back below — but a
                // chat message cannot be retracted, and announcing a call you
                // did not get sends two people at one target.
                if (!chatText || CONFIG.CALL_CHAT !== '1' || priorCall) return;
                // Still ours, and not uncalled during the round trip.
                const now = state.calls[tid];
                if (!now || String(now.calledBy?.id) !== String(state.myPlayerId)) return;
                try { sendCallToChat(chatText); } catch (_) { }
            })
            .catch(e => {
                warn('Call failed:', e.message);
                delete state.calls[tid];
                try { markCalledRows(); } catch (_) { }
                showToast(e.message || 'Call failed', 'error');
            });
    }

    function emitUncallTarget(targetId) {
        // v5.0.23: see emitCallTarget — same silent-no-op fix.
        const warId = deriveWarId();
        if (!warId) {
            showToast('No active war detected', 'error');
            return;
        }
        if (!state.jwtToken) {
            showToast('Not signed in — open Settings ⚙ and re-enter your API key', 'error');
            return;
        }
        if (!state.connected && typeof startPolling === 'function') {
            try { startPolling(); } catch (_) { }
        }
        // Optimistic update
        const tid = String(targetId);
        const prev = state.calls[tid];
        delete state.calls[tid];
        // The native war row is not one of updateTargetRow's concerns, so mark
        // it here too -- otherwise pressing Call changes nothing on Torn's own
        // list until the next poll echoes the call back.
        try { markCalledRows(); } catch (_) { }
        postAction('/api/call', { warId, targetId: tid, action: 'uncall' })
            .catch(e => {
                warn('Uncall failed:', e.message);
                if (prev) state.calls[tid] = prev;
                try { markCalledRows(); } catch (_) { }
                showToast(e.message || 'Uncall failed', 'error');
            });
    }

    /** v5.0.14: priority feature retired per user request. emitSetPriority
     *  is a no-op so any orphan callers don't error; renderPriorityCell
     *  is a no-op so the cell stays empty if it ends up in the DOM
     *  somehow; the priority column has been removed from grids and
     *  the smart-sort no longer floats high-priority targets to the
     *  top. State.priorities + server /api/priority left alone (dormant
     *  but harmless). */
    function emitSetPriority(_targetId, _priority) { /* no-op (retired) */ }

    /** Check if current user has an elevated faction role (leader, co-leader, war leader, banker). */
    /**
     * Watch for Torn's native mini profile card and inject a Retal
     * button into its existing `.buttons-list` row. The card root is
     * reliably identified by its Emotion CSS class prefix
     * `profile-mini-_wrapper` (or legacy `.mini-profile-wrapper`), so
     * we don't need the size/text heuristic we were using before.
     *
     * Pattern adapted from tornwar.com's torn-profile-link-formatter
     * userscript, which has been tracking this card's markup reliably
     * across Torn redesigns.
     *
     * Clicks are handled via document-level capture-phase delegation so
     * injected buttons survive re-renders or DOM replacement.
     */
    function setupRetalCardInjection() {
        if (window.__foRetalCardInjection) return;
        window.__foRetalCardInjection = true;

        let _retalInjectTimer = null;
        const observer = new MutationObserver(() => {
            if (_retalInjectTimer) return; // debounce: don't re-scan on every mutation
            _retalInjectTimer = setTimeout(() => { _retalInjectTimer = null; tryInjectRetalCard(); }, 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        // Also attempt once now in case the card is already on-screen.
        tryInjectRetalCard();

        // Delegated click — capture phase, immune to re-renders.
        document.addEventListener('click', async (e) => {
            const btn = e.target && e.target.closest && e.target.closest('.fo-card-retal-btn');
            if (!btn || btn.disabled) return;
            e.preventDefault();
            e.stopPropagation();

            const targetId = btn.dataset.targetId;
            const targetName = btn.dataset.targetName || `Player [${targetId}]`;
            if (!targetId) return;

            btn.disabled = true;
            const origHtml = btn.innerHTML;
            btn.innerHTML = '<span class="fo-card-retal-icon">\u23F3</span>Sending…';
            try {
                await postAction('/api/assist-request', {
                    warId: deriveWarId() || null,
                    targetId,
                    targetName,
                    mode: 'retal',
                });
                btn.innerHTML = '<span class="fo-card-retal-icon">\u2713</span>Sent!';
                showToast(`Retal request sent for ${targetName}`, 'success');
            } catch (err) {
                btn.innerHTML = '<span class="fo-card-retal-icon">\u26A0</span>Failed';
                showToast(`Retal failed: ${(err && err.message) || 'server error'}`, 'error');
            }
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }, 3000);
        }, true);

        log('[retal-card] mini-profile observer installed');
    }

    /**
     * v5.0.37: pull a real player name out of the mini-profile card.
     * The first <a href*="profiles.php?XID="> in the card is often an
     * icon-only link with empty textContent — using it directly was
     * sending "Player [<id>]" to the server, which surfaced as the
     * bare user ID in push notifications. Try named selectors first,
     * then scan profile links for non-numeric text, then fall back to
     * FactionOps state (enemy onlinePlayers / our memberBars).
     */
    function extractMiniProfileName(card, targetId) {
        const candidates = [
            '[class*="profile-mini-_username"]',
            '[class*="profile-mini-_name"]',
            '[class*="mini-profile-name"]',
            '.profile-mini-name',
            '.honor-text-wrap .honor-text',
            '.honor-text',
        ];
        for (const sel of candidates) {
            try {
                const el = card.querySelector(sel);
                const txt = el && (el.textContent || '').trim();
                if (txt && !/^\s*\[?\d+\]?\s*$/.test(txt) && txt.length < 40) {
                    return txt;
                }
            } catch (_) { /* invalid selector — keep going */ }
        }
        const links = card.querySelectorAll('a[href*="profiles.php?XID="]');
        for (const link of links) {
            const txt = (link.textContent || '').trim();
            if (txt && !/^\s*\[?\d+\]?\s*$/.test(txt) && txt.length < 40) {
                return txt;
            }
        }
        if (targetId) {
            const id = String(targetId);
            if (Array.isArray(state.onlinePlayers)) {
                const m = state.onlinePlayers.find(p => String(p.id) === id);
                if (m && m.name) return m.name;
            }
            if (state.memberBars && state.memberBars[id] && state.memberBars[id].name) {
                return state.memberBars[id].name;
            }
        }
        return null;
    }

    /**
     * Find an un-injected mini profile card and add our Retal button.
     * The `.buttons-list` inside the card is populated a beat after the
     * wrapper appears, so we poll briefly until it shows up.
     */
    function tryInjectRetalCard() {
        const card = document.querySelector(
            '[class*="profile-mini-_wrapper"]:not(.fo-retal-injected), ' +
            '.mini-profile-wrapper:not(.fo-retal-injected)'
        );
        if (!card) return;
        card.classList.add('fo-retal-injected'); // dedup flag — one-time per card

        let attempts = 0;
        const MAX = 25; // 25 × 200ms = 5s total before giving up
        const timer = setInterval(() => {
            attempts += 1;
            const buttonsList = card.querySelector('.buttons-list');
            const nameLink = card.querySelector('a[href*="profiles.php?XID="]');
            if (!buttonsList || !nameLink) {
                if (attempts >= MAX) clearInterval(timer);
                return;
            }
            if (buttonsList.querySelector('.fo-card-retal-btn')) {
                clearInterval(timer);
                return;
            }

            const m = (nameLink.getAttribute('href') || '').match(/XID=(\d+)/i);
            if (!m) { clearInterval(timer); return; }
            const targetId = m[1];
            const realName = extractMiniProfileName(card, targetId);
            const targetName = realName || `Player [${targetId}]`;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fo-card-retal-btn';
            btn.dataset.targetId = targetId;
            btn.dataset.targetName = targetName;
            btn.innerHTML = '<span class="fo-card-retal-icon">\u26A0</span>Retal';

            // v5.0.76: REVERTED v5.0.74/75 upper-row injection per user
            // request \u2014 'was fine where it was'. Back to the simple
            // inline-flex append into .buttons-list (the original v5.0.35
            // location). Note: the draggable PROFILE-PAGE retal button
            // (#wb-assist-btn) is a separate feature and is untouched.
            buttonsList.appendChild(btn);

            clearInterval(timer);
        }, 200);
    }

    /**
     * Document-level delegation for the war-timer popup. Clicking the
     * timer toggles the detail panel; clicking anywhere else closes it.
     * Clicks INSIDE the detail popup itself don't toggle — so you can
     * select text or interact with its contents. Capture-phase and
     * idempotent, same pattern as the Shout button delegation.
     */
    function setupWarTimerDelegation() {
        if (window.__foWarTimerDelegated) return;
        window.__foWarTimerDelegated = true;

        const handle = (e) => {
            const detail = document.getElementById('fo-war-timer-detail');
            if (!detail) return;
            if (!e.target || !e.target.closest) return;
            const onTimer = e.target.closest('#fo-war-timer');
            const insideDetail = e.target.closest('#fo-war-timer-detail');
            if (onTimer && !insideDetail) {
                log('[war-timer] toggle');
                detail.classList.toggle('open');
            } else if (!onTimer) {
                if (detail.classList.contains('open')) {
                    detail.classList.remove('open');
                }
            }
        };
        // Listen on click + pointerdown + touchend in capture phase so
        // PDA/mobile taps trigger even if the click event is suppressed.
        document.addEventListener('click', handle, true);
        document.addEventListener('pointerdown', (e) => {
            // Only handle pointerdown as the toggle trigger — pointerdown
            // reliably fires on PDA where click sometimes doesn't.
            const onTimer = e.target && e.target.closest && e.target.closest('#fo-war-timer');
            if (onTimer) handle(e);
        }, true);

        log('[war-timer] document delegation installed');
    }

    /**
     * Document-level delegation for the Shout button + its Enter-key
     * handler. Runs once at script startup and never goes stale — the
     * overlay can be destroyed, recreated, moved inside #mainContainer,
     * or clobbered by Torn's React reconciliation without breaking the
     * click flow. Capture-phase so we beat any parent handler that might
     * call stopImmediatePropagation.
     */
    function setupLogoMinimizeDelegation() {
        if (window.__foLogoDelegated) return;
        window.__foLogoDelegated = true;

        document.addEventListener('click', (e) => {
            const logo = e.target && e.target.closest && e.target.closest('#fo-overlay .fo-logo-mark');
            if (!logo) return;
            e.preventDefault();
            e.stopPropagation();
            deactivateWarOverlay();
        }, true);

        log('[logo] document delegation installed');
    }

    function setupShoutDelegation() {
        if (window.__foShoutDelegated) return;
        window.__foShoutDelegated = true;

        document.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest && e.target.closest('#fo-btn-send-broadcast');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            sendShoutAction();
        }, true);

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const inp = e.target && e.target.closest && e.target.closest('#fo-input-broadcast');
            if (!inp) return;
            e.preventDefault();
            sendShoutAction();
        }, true);

        log('[shout] document delegation installed');
    }

    function sendShoutAction() {
        log('[shout] action fired');
        const msgInput = document.getElementById('fo-input-broadcast');
        if (!msgInput) {
            showToast('Broadcast input not found', 'error');
            return;
        }
        const msg = msgInput.value.trim();
        log('[shout] msg length:', msg.length);
        if (!msg) {
            showToast('Type something to broadcast first', 'warning');
            return;
        }
        const currentWarId = deriveWarId();
        log('[shout] warId:', currentWarId, 'myFactionId:', state.myFactionId);
        if (!currentWarId) {
            showToast('Error: Could not determine war ID.', 'error');
            return;
        }
        log('[shout] POSTing /api/broadcast');
        postAction('/api/broadcast', { message: msg, type: 'warning', warId: currentWarId })
            .then(data => {
                log('[shout] response:', data);
                if (data && data.success) {
                    msgInput.value = '';
                    showToast('Broadcast sent to faction!', 'success');
                } else {
                    showToast((data && data.error) || 'Failed to send broadcast.', 'error');
                }
            })
            .catch(e => {
                warn('[shout] POST failed:', e && e.message);
                showToast(`Broadcast failed: ${(e && e.message) || 'server error'}`, 'error');
            });
    }

    /**
     * Decode the persisted JWT payload (no signature verification — just
     * to hydrate local state). The server still validates every
     * authenticated request, so trusting the unverified payload locally
     * for UI-rendering purposes is safe. Called at startup so identity
     * fields survive re-auth failures (e.g. Torn rate-limit bounces).
     */
    function hydrateStateFromJwt() {
        if (!state.jwtToken) return;
        try {
            const parts = state.jwtToken.split('.');
            if (parts.length !== 3) return;
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = b64 + '==='.slice((b64.length + 3) % 4);
            const json = atob(padded);
            const payload = JSON.parse(json);
            if (payload.playerId) state.myPlayerId = String(payload.playerId);
            if (payload.playerName) state.myPlayerName = payload.playerName;
            if (payload.factionId) state.myFactionId = String(payload.factionId);
            if (payload.factionName) state.myFactionName = payload.factionName;
            if (payload.factionPosition) {
                state.myFactionPosition = String(payload.factionPosition).toLowerCase();
            }
            log('Hydrated identity from JWT:', state.myPlayerName || '?', 'pos:', state.myFactionPosition);
        } catch (e) {
            warn('Could not hydrate JWT:', e && e.message);
        }
    }

    function isLeader() {
        const isAdmin = String(state.myPlayerId) === '137558';
        if (isAdmin) return true;

        const pos = (state.myFactionPosition || '').toLowerCase();
        // Prefer server-configured roles when we've fetched them (so a faction
        // that added e.g. "warmaster" to broadcastRoles sees the same set
        // gate both Shout and Cooldowns). Fall back to the built-in defaults
        // if we haven't heard from the server yet.
        const serverRoles = Array.isArray(state.allowedBroadcastRoles) && state.allowedBroadcastRoles.length
            ? state.allowedBroadcastRoles.map(r => String(r).toLowerCase())
            : null;
        if (serverRoles) return serverRoles.includes(pos);
        return pos === 'leader' || pos === 'co-leader' || pos === 'war leader' || pos === 'banker';
    }

    // =========================================================================
    // SECTION 9: SETTINGS PANEL
    // =========================================================================

    /** Create and inject the floating gear icon. */
    function createSettingsGear() {
        const gear = document.createElement('div');
        gear.className = 'wb-settings-gear';
        gear.textContent = '\u2699'; // gear unicode
        gear.title = 'FactionOps Settings';
        gear.addEventListener('click', toggleSettings);
        document.body.appendChild(gear);
    }

    /** Toggle the settings modal open/closed. */
    function toggleSettings() {
        if (state.ui.settingsOpen) {
            closeSettings();
        } else {
            openSettings();
        }
    }

    function openSettings() {
        if (state.ui.settingsOpen) return;
        state.ui.settingsOpen = true;

        const overlay = document.createElement('div');
        overlay.className = 'wb-settings-overlay';
        overlay.id = 'wb-settings-overlay';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSettings();
        });

        const modal = document.createElement('div');
        modal.className = 'wb-settings-modal';

        // Determine connection state string
        let connText = 'Disconnected';
        let connClass = 'disconnected';
        if (state.connected) { connText = 'Connected'; connClass = 'connected'; }
        else if (state.connecting) { connText = 'Connecting...'; connClass = 'connecting'; }

        // Subscription line \u2014 always renders so the user knows whether
        // they're permanent (owner / factionops partner), counting down
        // days (xanax sub), or unknown. Color-coded: green = permanent,
        // amber under 7 days, red expired.
        const exp = state.subscriptionExpiresAt;
        let subLabel = 'Subscription: unknown';
        let subColor = '#9ca3af';
        if (exp === 'permanent') {
            subLabel = 'Subscription: \u2605 Permanent';
            subColor = '#4ade80';
        } else if (typeof exp === 'number' && exp > 0) {
            const ms = exp - Date.now();
            if (ms <= 0) {
                subLabel = 'Subscription: expired';
                subColor = '#ef4444';
            } else {
                const days = Math.floor(ms / 86400000);
                const hours = Math.floor((ms % 86400000) / 3600000);
                const text = days >= 1 ? (days + ' day' + (days === 1 ? '' : 's')) : (hours + 'h');
                subLabel = 'Subscription: ' + text + ' remaining';
                subColor = days < 7 ? '#fbbf24' : '#4ade80';
            }
        }

        modal.innerHTML = `
            <h2>\u2699 FactionOps Settings</h2>

            <div class="wb-connection-status">
                <span class="wb-status-dot ${connClass}" id="wb-settings-conn-dot"></span>
                <span id="wb-settings-conn-text">${connText}</span>
            </div>

            <div style="font-size:12px;color:${subColor};margin:-8px 0 14px 0;padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:4px;border-left:3px solid ${subColor};">
                ${escapeHtml(subLabel)}
            </div>

            <div class="wb-sgroup"><span>Connection</span></div>
            <label for="wb-input-apikey">Torn API Key</label>
            <div style="display:flex;gap:6px;margin-bottom:14px;">
                <input type="password" id="wb-input-apikey" value="${escapeHtml(CONFIG.API_KEY)}" placeholder="Your Torn API key" style="margin-bottom:0;flex:1;" ${CONFIG.IS_PDA && CONFIG.API_KEY === PDA_API_KEY ? 'disabled' : ''}>
                <button class="wb-btn wb-btn-sm" id="wb-btn-verify">Verify</button>
            </div>
            ${CONFIG.IS_PDA ? '<div style="font-size:11px;color:#87ceeb;margin-bottom:8px;">\u2705 Torn PDA detected — using PDA-managed API key.</div>' : ''}
            <div id="wb-verify-result" style="font-size:11px;margin-bottom:10px;min-height:14px;"></div>

            <!-- v5.1.74: PER-MEMBER FFScouter key. Distinct from the admin /
                 faction-wide key further down (wb-input-ffs-key, oc_ffs_key),
                 which is shared and can only produce target stat estimates.
                 The FF score is relative to the attacker, so it only means
                 anything when fetched with YOUR key. type="text", never
                 password: a password field makes password managers offer to
                 autofill and save an API key as a site credential. -->
            <div class="wb-sgroup"><span>My keys</span></div>
            <label for="wb-input-my-ffs-key">My FFScouter Key <span style="font-weight:400;opacity:0.6;font-size:11px;">(optional, personal)</span></label>
            <!-- wrap + min-width: three controls don't fit one 360px phone row,
                 and a squeezed key input is unusable — let the buttons drop. -->
            <div style="display:flex;gap:6px;flex-wrap:wrap;row-gap:6px;">
                <input type="text" id="wb-input-my-ffs-key" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Your own key from ffscouter.com" style="margin-bottom:0;flex:1 1 160px;min-width:140px;font-family:monospace;">
                <button class="wb-btn wb-btn-sm" id="wb-btn-save-my-ffs-key">Save</button>
                <button class="wb-btn wb-btn-sm" id="wb-btn-clear-my-ffs-key">Clear</button>
            </div>
            <div id="wb-my-ffs-key-status" style="font-size:11px;opacity:0.7;margin-top:4px;min-height:14px;">
                ${!getMyFfsKey()
                ? 'Not set — stat estimates only, no FF score.'
                : (ffPersonalKeyRejected
                    ? 'Saved (' + escapeHtml(maskFfsKey(getMyFfsKey())) + ') — FFScouter is not returning scores for it; stat estimates only.'
                    : 'Saved (' + escapeHtml(maskFfsKey(getMyFfsKey())) + ') — showing your personal FF scores.')}
            </div>
            <div style="font-size:11px;opacity:0.6;margin:4px 0 14px 0;">
                A fair-fight score is calculated against <b>your</b> battle stats, so
                the faction's shared key can't produce one for you — a score fetched
                with someone else's key would call a fight easy that isn't. Set your
                own key (any Torn key registered at
                <a href="https://ffscouter.com" target="_blank" style="color:#60a5fa;">ffscouter.com</a>)
                and each target gets an FF chip next to its stat estimate.
                Stored only in this browser; sent only to ffscouter.com.
            </div>

            <div class="wb-sgroup"><span>Alerts</span></div>
            <div class="wb-settings-row">
                <span>Chain Break Alert</span>
                <label class="wb-toggle">
                    <input type="checkbox" id="wb-toggle-chain-alert" ${CONFIG.CHAIN_ALERT ? 'checked' : ''}>
                    <span class="wb-toggle-slider"></span>
                </label>
            </div>
            <div id="wb-chain-alert-threshold-row" style="display:${CONFIG.CHAIN_ALERT ? 'flex' : 'none'};align-items:center;gap:8px;margin-bottom:14px;">
                <span style="font-size:12px;opacity:0.8;">Alert when chain timer below</span>
                <input type="text" id="wb-input-chain-threshold" value="${CONFIG.CHAIN_ALERT_THRESHOLD}" style="width:50px;margin-bottom:0;text-align:center;">
                <span style="font-size:12px;opacity:0.8;">seconds</span>
            </div>

            <div class="wb-settings-row">
                <span>PDA Notifications</span>
                <label class="wb-toggle">
                    <input type="checkbox" id="wb-toggle-pda-notif" ${CONFIG.PDA_NOTIFICATIONS ? 'checked' : ''}>
                    <span class="wb-toggle-slider"></span>
                </label>
            </div>
            <div style="font-size:11px;opacity:0.6;margin-bottom:8px;">
                Native push notifications for calls, chain alerts, bonus hits, and war targets.
            </div>
            <button class="wb-btn wb-btn-sm" id="fo-btn-test-pda-notif" style="margin-bottom:14px;font-size:11px;">Test PDA Notification</button>
            <div id="fo-pda-notif-result" style="font-size:11px;margin-bottom:10px;min-height:14px;"></div>

            <button class="wb-btn wb-btn-sm" id="fo-btn-test-toast" style="margin-bottom:14px;font-size:11px;">Test Toast Notification</button>

            <div class="wb-sgroup"><span>Preferences</span></div>
            <div class="wb-settings-row">
                <span>Share my BSP stats with faction</span>
                <label class="wb-toggle">
                    <input type="checkbox" id="wb-toggle-share-bsp" ${CONFIG.SHARE_BSP ? 'checked' : ''}>
                    <span class="wb-toggle-slider"></span>
                </label>
            </div>

            <div class="wb-settings-row">
                <span>Post my calls to faction chat</span>
                <label class="wb-toggle">
                    <input type="checkbox" id="wb-toggle-call-chat" ${CONFIG.CALL_CHAT === '1' ? 'checked' : ''}>
                    <span class="wb-toggle-slider"></span>
                </label>
            </div>
            <div style="font-size:11px;opacity:0.6;margin-bottom:14px;">
                Typing the call into Torn's faction chat for you when you press
                Call — the same text that already goes to your clipboard. Off by
                default, and it only ever fires from a Call you pressed. If
                faction chat is closed, or you were mid-way through typing
                something, it leaves the message on your clipboard instead.
            </div>

            <div style="font-size:11px;opacity:0.6;margin-bottom:14px;">
                <strong>Faction key pool:</strong> your API key is used
                alongside other officers' keys to spread the faction's
                server-side polling load (chain, war status, hospital
                events) so rate limits don't cascade. This happens
                automatically for everyone signed in. Please sign in with a
                <strong>Limited</strong> key — never a Full key.
            </div>

            <div class="wb-settings-row">
                <span>Theme</span>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:11px;opacity:0.6;">Dark</span>
                    <label class="wb-toggle">
                        <input type="checkbox" id="wb-toggle-theme" ${CONFIG.THEME === 'light' ? 'checked' : ''}>
                        <span class="wb-toggle-slider"></span>
                    </label>
                    <span style="font-size:11px;opacity:0.6;">Light</span>
                </div>
            </div>

            <div class="wb-settings-row">
                <span>Stay Active</span>
                <label class="wb-toggle">
                    <input type="checkbox" id="wb-toggle-keep-alive" ${CONFIG.KEEP_ALIVE ? 'checked' : ''}>
                    <span class="wb-toggle-slider"></span>
                </label>
            </div>

            ${isLeader() ? `
            <div class="wb-sgroup"><span>Faction setup</span></div>
            <label>Faction API Key</label>
            <div style="font-size:11px;opacity:0.7;margin-bottom:8px;">
                Provide a Limited API key for server-side war status updates. This lets the server poll Torn directly instead of relying on page data.
            </div>
            <div style="font-size:11px;margin-bottom:8px;">
                <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" rel="noopener" style="color:#87ceeb;text-decoration:underline;">Create a Limited key on Torn</a>
            </div>
            <div id="wb-faction-key-status" style="font-size:11px;margin-bottom:8px;min-height:14px;"></div>
            <div id="wb-faction-key-input-row" style="display:flex;gap:6px;margin-bottom:14px;">
                <input type="text" id="wb-input-faction-key" placeholder="Paste faction API key" style="margin-bottom:0;flex:1;">
                <button class="wb-btn wb-btn-sm" id="wb-btn-save-faction-key">Save Key</button>
            </div>
            <div id="wb-faction-key-saved-row" style="display:none;align-items:center;gap:8px;margin-bottom:14px;">
                <span style="color:var(--wb-call-green);font-size:12px;">Key saved \u2713</span>
                <button class="wb-btn wb-btn-sm wb-btn-danger" id="wb-btn-remove-faction-key">Remove</button>
            </div>

                <label for="wb-input-ffs-key">FFScouter API Key <span style="font-weight:400;opacity:0.6;font-size:11px;">(optional, admin-only)</span></label>
                <div style="display:flex;gap:6px;">
                    <!-- type=text, never password. A password field makes the
                         browser's password manager offer to save and then
                         autofill Torn API keys, which silently overwrites what
                         the admin typed and stores a credential where nobody
                         expects to find one. The key is never at rest in this
                         field anyway: the saved value is shown only as a masked
                         placeholder, and .value is cleared the moment it saves,
                         so there is nothing here for type=password to conceal. -->
                    <input type="text" id="wb-input-ffs-key" spellcheck="false" autocomplete="off"
                           placeholder="Paste a Torn key registered at ffscouter.com" style="margin-bottom:0;flex:1;font-family:monospace;">
                    <button class="wb-btn wb-btn-sm" id="wb-btn-save-ffs-key">Save</button>
                </div>
                <div id="fo-ffs-key-result" style="font-size:11px;opacity:0.6;margin-top:4px;min-height:14px;">
                    Any Torn API key that's been registered at
                    <a href="https://ffscouter.com" target="_blank" style="color:#60a5fa;">ffscouter.com</a>.
                    Used server-side (never leaves the server) for:
                    <ul style="margin:4px 0 4px 18px;padding:0;font-size:11px;">
                      <li><b>Flight tracker</b> — live landing countdown on travel pills in the war overlay</li>
                      <li><b>Abroad destinations</b> — shows country name ('UK', 'Mexico') on abroad pills</li>
                      <li><b>OC delay attribution</b> (when OC Spawn Assistance is installed) — backdates blocker delays to real takeoff time</li>
                    </ul>
                    Shared with OC Spawn Assistance. Leave blank to keep the existing key, or enter a new one to replace.
                </div>
            </div>
            <div style="font-size:11px;opacity:0.6;margin-bottom:14px;">
                Keeps your Torn activity fresh while the warboard is open, so enemies can't tell you're idle.
            </div>

                <label for="wb-input-broadcast-roles">Custom Admin Roles (comma-separated)</label>
                <div style="display:flex;gap:6px;">
                    <input type="text" id="wb-input-broadcast-roles" placeholder="e.g. leader,co-leader,banker,warmaster" style="margin-bottom:0;flex:1;">
                    <button class="wb-btn wb-btn-sm" id="wb-btn-save-roles">Save</button>
                </div>
                <div style="font-size:11px;opacity:0.6;margin-top:4px;">
                    Faction positions counted as admins. Admins can use "Shout"
                    and view post-war reports. <br>
                    <span id="fo-enabled-roles-label">Loading enabled roles...<br></span>
                    <em>Note: Saving a list replaces the defaults. Clear and save to reset.</em>
                </div>
            </div>

            <!-- Enemy Online Surge — admin-only per-faction config. Server runs
                 the watcher on data clients are already pushing, so zero extra
                 Torn API cost. Defaults: disabled / +5 enemies / 60s / 10min. -->
            <div style="margin: 14px 0;">
            <div class="wb-sgroup"><span>War</span></div>
                <label>Enemy Online Surge Alert <span style="font-weight:400;opacity:0.6;font-size:11px;">(admin-only)</span></label>
                <div style="font-size:11px;opacity:0.7;margin-bottom:8px;">
                    Push notification when N+ enemies come online inside a short window — coordinated-rally signal during war.
                </div>
                <div class="wb-settings-row" style="margin-bottom:8px;">
                    <span>Enable surge alerts</span>
                    <label class="wb-toggle">
                        <input type="checkbox" id="wb-toggle-surge-enabled">
                        <span class="wb-toggle-slider"></span>
                    </label>
                </div>
                <div id="wb-surge-tunables" style="display:none;">
                    <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                        <span style="font-size:12px;opacity:0.8;flex:1;">Trigger when</span>
                        <input type="number" id="wb-input-surge-threshold" min="1" max="50" step="1" style="width:60px;text-align:center;margin-bottom:0;">
                        <span style="font-size:12px;opacity:0.8;">enemies online within</span>
                        <input type="number" id="wb-input-surge-window" min="30" max="600" step="10" style="width:70px;text-align:center;margin-bottom:0;">
                        <span style="font-size:12px;opacity:0.8;">seconds</span>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                        <span style="font-size:12px;opacity:0.8;flex:1;">Re-fire cooldown</span>
                        <input type="number" id="wb-input-surge-cooldown" min="60" max="3600" step="60" style="width:70px;text-align:center;margin-bottom:0;">
                        <span style="font-size:12px;opacity:0.8;">seconds (60–3600)</span>
                    </div>
                </div>
                <button class="wb-btn wb-btn-sm" id="wb-btn-save-surge" style="margin-top:4px;">Save surge settings</button>
                <div id="wb-surge-result" style="font-size:11px;opacity:0.7;margin-top:4px;min-height:14px;"></div>
            </div>

            <!-- v4.9.82: faction-wide FFScouter key for flight tracker. Shared
                 with OC Spawn Assistance (oc_ffs_key in faction settings),
                 so setting it here also enables OC delay attribution and
                 vice versa. -->
            <div style="margin: 14px 0;">
            ` : ''}
            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:14px 0;">

            ${isLeader() ? `
            <label>War Target (Respect)</label>
            <div style="font-size:11px;opacity:0.7;margin-bottom:8px;">
                Set a custom respect target for terms/ranked wars. All faction members will see progress toward this goal.
            </div>
            <div style="display:flex;gap:6px;margin-bottom:14px;">
                <input type="text" id="fo-input-war-target" value="${state.warTarget ? state.warTarget.value : ''}" placeholder="e.g. 10000" style="margin-bottom:0;flex:1;" inputmode="numeric">
                <button class="wb-btn wb-btn-sm" id="fo-btn-set-war-target">Set</button>
                <button class="wb-btn wb-btn-sm wb-btn-danger" id="fo-btn-clear-war-target" ${state.warTarget ? '' : 'disabled'}>Clear</button>
            </div>
            <div id="fo-war-target-result" style="font-size:11px;margin-bottom:10px;min-height:14px;"></div>
            ` : (state.warTarget ? `
            <div style="font-size:11px;margin-bottom:14px;">
                <span style="opacity:0.6;">War Target:</span> <strong style="color:#74b9ff;">${parseInt(state.warTarget.value).toLocaleString()}</strong>
                <span style="opacity:0.5;"> (set by ${escapeHtml(state.warTarget.setBy.name)})</span>
            </div>
            ` : '')}

            <div class="wb-sgroup"><span>Advanced</span></div>
            <div class="wb-settings-row">
                <span>Long-poll transport (beta)</span>
                <label class="wb-toggle">
                    <input type="checkbox" id="wb-toggle-longpoll" ${CONFIG.USE_LONGPOLL ? 'checked' : ''}>
                    <span class="wb-toggle-slider"></span>
                </label>
            </div>
            <div style="font-size:11px;opacity:0.6;margin-bottom:14px;">
                Experimental. On phones this replaces the 1-second poll with a
                held connection that only wakes on real changes — much lighter on
                CPU/battery. Falls back automatically if unsupported; desktop uses
                real-time and is unaffected. Takes effect within a few seconds.
            </div>

            <div style="margin: 14px 0;">
            <label for="wb-input-server">Server URL</label>
            <input type="text" id="wb-input-server" value="${escapeHtml(CONFIG.SERVER_URL)}" placeholder="http://localhost:3000">

            ${state.myPlayerId === '137558' ? `
            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:14px 0;">
            <div style="margin-bottom:14px;">
                <label>Admin Tools</label>
                <button class="wb-btn wb-btn-sm" id="wb-btn-view-logs" style="width:100%;">View PM2 Server Logs</button>
            </div>
            ` : ''}

            <div class="wb-settings-actions">
                <button class="wb-btn wb-btn-danger" id="wb-btn-disconnect">Disconnect</button>
                <button class="wb-btn" id="wb-btn-save">Save &amp; Connect</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // ---- Event listeners inside modal ----

        document.getElementById('wb-btn-verify').addEventListener('click', async () => {
            const resultEl = document.getElementById('wb-verify-result');
            const apiKey = document.getElementById('wb-input-apikey').value.trim();
            if (!apiKey) {
                resultEl.textContent = 'Please enter an API key.';
                resultEl.style.color = 'var(--wb-call-red)';
                return;
            }
            resultEl.textContent = 'Verifying...';
            resultEl.style.color = 'var(--wb-idle-yellow)';
            try {
                setConfig('API_KEY', apiKey);
                setConfig('SERVER_URL', document.getElementById('wb-input-server').value.trim() || 'http://localhost:3000');
                await authenticate();
                resultEl.textContent = `Verified! Player: ${state.myPlayerName || state.myPlayerId}`;
                resultEl.style.color = 'var(--wb-call-green)';
            } catch (e) {
                resultEl.textContent = `Error: ${e.message}`;
                resultEl.style.color = 'var(--wb-call-red)';
            }
        });

        // ---- Personal FFScouter key ----
        // Both handlers wipe ffCache: entries fetched under the previous key
        // are scored against a different attacker and must not outlive it.
        // The input is never repopulated with the key — only a last-4 mask is
        // ever shown, and the key is never logged.
        const myFfsStatusEl = document.getElementById('wb-my-ffs-key-status');
        const myFfsInputEl = document.getElementById('wb-input-my-ffs-key');

        if (myFfsInputEl) {
            document.getElementById('wb-btn-save-my-ffs-key').addEventListener('click', () => {
                const key = myFfsInputEl.value.trim();
                if (!key) {
                    myFfsStatusEl.textContent = 'Paste a key first, or press Clear to remove the saved one.';
                    myFfsStatusEl.style.color = 'var(--wb-idle-yellow)';
                    return;
                }
                setMyFfsKey(key);
                myFfsInputEl.value = '';   // don't leave the key sitting in the DOM
                myFfsStatusEl.textContent = `Saved (${maskFfsKey(key)}) — showing your personal FF scores.`;
                myFfsStatusEl.style.color = 'var(--wb-call-green)';
                resetFfCacheForKeyChange();
            });

            document.getElementById('wb-btn-clear-my-ffs-key').addEventListener('click', () => {
                setMyFfsKey('');
                myFfsInputEl.value = '';
                myFfsStatusEl.textContent = 'Cleared — stat estimates only, no FF score.';
                myFfsStatusEl.style.color = '';
                resetFfCacheForKeyChange();
            });
        }

        document.getElementById('wb-toggle-theme').addEventListener('change', (e) => {
            const theme = e.target.checked ? 'light' : 'dark';
            setConfig('THEME', theme);
            applyTheme();
        });

        document.getElementById('wb-toggle-chain-alert').addEventListener('change', (e) => {
            setConfig('CHAIN_ALERT', e.target.checked);
            const thresholdRow = document.getElementById('wb-chain-alert-threshold-row');
            if (thresholdRow) thresholdRow.style.display = e.target.checked ? 'flex' : 'none';
        });

        document.getElementById('wb-input-chain-threshold').addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (val > 0 && val <= 300) {
                setConfig('CHAIN_ALERT_THRESHOLD', val);
            } else {
                e.target.value = CONFIG.CHAIN_ALERT_THRESHOLD;
            }
        });

        const shareBspEl = document.getElementById('wb-toggle-share-bsp');
        if (shareBspEl) {
            shareBspEl.addEventListener('change', (e) => {
                setConfig('SHARE_BSP', e.target.checked);
                if (e.target.checked) {
                    // Immediate upload so faction sees the new data right away.
                    try { uploadLocalBspToShared(); } catch (_) { }
                    showToast('Sharing your BSP cache with faction', 'info');
                } else {
                    showToast('Stopped sharing BSP cache', 'info');
                }
            });
        }

        const callChatToggle = document.getElementById('wb-toggle-call-chat');
        if (callChatToggle) {
            callChatToggle.addEventListener('change', (e) => {
                // '1'/'0' strings, never booleans — PDA's GM storage returns
                // strings and `!!"false"` is truthy, which would leave this
                // permanently on for anyone who switched it off there.
                setConfig('CALL_CHAT', e.target.checked ? '1' : '0');
                showToast(e.target.checked
                    ? 'Calls will be typed into faction chat'
                    : 'Calls stay on your clipboard only', 'info');
            });
        }

        document.getElementById('wb-toggle-keep-alive').addEventListener('change', (e) => {
            setConfig('KEEP_ALIVE', e.target.checked);
            if (e.target.checked) {
                startKeepAlive();
            } else {
                stopKeepAlive();
            }
        });

        const longPollToggle = document.getElementById('wb-toggle-longpoll');
        if (longPollToggle) {
            longPollToggle.addEventListener('change', (e) => {
                // The transport is re-chosen on the next poll cycle (pollOnce reads
                // CONFIG.USE_LONGPOLL each time), so no reload is needed.
                setConfig('USE_LONGPOLL', e.target.checked);
                showToast('Long-poll ' + (e.target.checked ? 'enabled' : 'disabled') + ' — applies within a few seconds', 'info');
            });
        }

        // Key-pool participation is automatic and mandatory for everyone signed
        // in (see the disclosure note in settings) — the opt-out toggle was removed
        // so every officer's key helps even the server-side API-call load.

        const pdaNotifToggle = document.getElementById('wb-toggle-pda-notif');
        if (pdaNotifToggle) {
            pdaNotifToggle.addEventListener('change', (e) => {
                setConfig('PDA_NOTIFICATIONS', e.target.checked);
            });
        }

        const testPdaBtn = document.getElementById('fo-btn-test-pda-notif');
        if (testPdaBtn) {
            testPdaBtn.addEventListener('click', () => {
                const resultEl = document.getElementById('fo-pda-notif-result');
                if (!window.flutter_inappwebview?.callHandler) {
                    if (resultEl) resultEl.innerHTML = '<span style="color:#e17055;">Not running in PDA — handler not available</span>';
                    return;
                }
                const testId = 9999; // Use ID 9999 for test (won't collide with real notifications)
                const timestamp = Date.now() + 3000; // 3 seconds from now
                if (resultEl) resultEl.innerHTML = '<span style="color:#74b9ff;">Scheduling test notification (3s)...</span>';
                window.flutter_inappwebview.callHandler('scheduleNotification', {
                    title: '\uD83D\uDD14 FactionOps Test',
                    subtitle: 'PDA notifications are working!',
                    id: testId,
                    timestamp: timestamp,
                    overwriteID: true,
                    launchNativeToast: true,
                    toastMessage: 'Test notification scheduled — fires in 3 seconds',
                    toastColor: 'green',
                    toastDurationSeconds: 3,
                    urlCallback: '',
                }).then((resp) => {
                    log('[PDA-Test] scheduleNotification response:', resp);
                    if (resultEl) resultEl.innerHTML = '<span style="color:#00b894;">\u2713 Scheduled! Check for notification in ~3s. Response: ' + JSON.stringify(resp) + '</span>';
                }).catch((err) => {
                    warn('[PDA-Test] scheduleNotification error:', err);
                    if (resultEl) resultEl.innerHTML = '<span style="color:#e17055;">\u2717 Error: ' + (err?.message || err) + '</span>';
                });
            });
        }

        // Test Toast button
        const testToastBtn = document.getElementById('fo-btn-test-toast');
        if (testToastBtn) {
            testToastBtn.addEventListener('click', () => {
                showToast('Toast notifications are working!', 'success');
            });
        }

        // War target — set/clear (leader only)
        const warTargetSetBtn = document.getElementById('fo-btn-set-war-target');
        const warTargetClearBtn = document.getElementById('fo-btn-clear-war-target');
        if (warTargetSetBtn) {
            warTargetSetBtn.addEventListener('click', async () => {
                const resultEl = document.getElementById('fo-war-target-result');
                const input = document.getElementById('fo-input-war-target');
                const val = input.value.trim().replace(/,/g, '');
                const num = parseInt(val, 10);
                if (!val || isNaN(num) || num <= 0) {
                    resultEl.textContent = 'Enter a valid positive number.';
                    resultEl.style.color = 'var(--wb-call-red)';
                    return;
                }
                resultEl.textContent = 'Saving...';
                resultEl.style.color = 'var(--wb-idle-yellow)';
                try {
                    const resp = await postAction('/api/war-target', { warId: deriveWarId(), target: num });
                    if (resp && resp.ok) {
                        state.warTarget = resp.warTarget;
                        resultEl.textContent = 'Target set: ' + num.toLocaleString() + ' respect';
                        resultEl.style.color = 'var(--wb-call-green)';
                        if (warTargetClearBtn) warTargetClearBtn.disabled = false;
                    } else {
                        resultEl.textContent = (resp && resp.error) || 'Failed to set target';
                        resultEl.style.color = 'var(--wb-call-red)';
                    }
                } catch (e) {
                    resultEl.textContent = 'Error: ' + e.message;
                    resultEl.style.color = 'var(--wb-call-red)';
                }
            });
        }
        if (warTargetClearBtn) {
            warTargetClearBtn.addEventListener('click', async () => {
                const resultEl = document.getElementById('fo-war-target-result');
                resultEl.textContent = 'Clearing...';
                resultEl.style.color = 'var(--wb-idle-yellow)';
                try {
                    const resp = await postAction('/api/war-target', { warId: deriveWarId(), target: null });
                    if (resp && resp.ok) {
                        state.warTarget = null;
                        const input = document.getElementById('fo-input-war-target');
                        if (input) input.value = '';
                        resultEl.textContent = 'Target cleared.';
                        resultEl.style.color = 'var(--wb-call-green)';
                        warTargetClearBtn.disabled = true;
                    } else {
                        resultEl.textContent = (resp && resp.error) || 'Failed to clear target';
                        resultEl.style.color = 'var(--wb-call-red)';
                    }
                } catch (e) {
                    resultEl.textContent = 'Error: ' + e.message;
                    resultEl.style.color = 'var(--wb-call-red)';
                }
            });
        }

        // Faction API key — check if one already exists
        (async () => {
            if (state.factionKeyStored) {
                showFactionKeySaved();
            }

            // Fetch current broadcast roles
            try {
                const resp = await getAction('/api/broadcast/roles');
                if (resp && resp.roles) {
                    const label = document.getElementById('fo-enabled-roles-label');
                    const input = document.getElementById('wb-input-broadcast-roles');
                    if (label) label.innerHTML = 'Enabled roles: <span style="color:#00b894;">' + resp.roles.join(', ') + '</span><br>';

                    const defaults = ['leader', 'co-leader', 'war leader', 'banker'];
                    const isDefault = resp.roles.length === 4 && resp.roles.every(r => defaults.includes(r));
                    if (input && !isDefault) input.value = resp.roles.join(', ');
                }
            } catch (_) { }

            // v4.9.82: check whether a faction-wide FFS key is already
            // configured so we can show a masked placeholder.
            try {
                const apiKey = GM_getValue('factionops_api_key', '') || CONFIG.API_KEY;
                if (apiKey && apiKey.length >= 10) {
                    const ffsInput = document.getElementById('wb-input-ffs-key');
                    const url = `${CONFIG.SERVER_URL}/api/oc/settings?key=${encodeURIComponent(apiKey)}`;
                    httpRequest({
                        method: 'GET',
                        url,
                        onload(r) {
                            const d = safeParse(r.responseText);
                            if (r.status >= 200 && r.status < 300 && d && d.ffs_key_set && ffsInput) {
                                const last4 = d.ffs_key_last4 || '';
                                ffsInput.placeholder = `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${last4}  (type to replace)`;
                            }
                        },
                        onerror() { /* leave default placeholder */ },
                    });
                }
            } catch (_) { }
        })();

        document.getElementById('wb-btn-save-roles').addEventListener('click', async () => {
            const rolesInput = document.getElementById('wb-input-broadcast-roles').value.trim();
            const roles = rolesInput ? rolesInput.split(',').map(r => r.trim().toLowerCase()) : [];

            try {
                const resp = await postAction('/api/broadcast/roles', { roles });
                if (resp && resp.success) {
                    showToast('Broadcast roles updated!', 'success');
                    const label = document.getElementById('fo-enabled-roles-label');
                    if (label && resp.roles) {
                        label.innerHTML = 'Enabled roles: <span style="color:#00b894;">' + resp.roles.join(', ') + '</span><br>';
                    }
                } else {
                    showToast(resp.error || 'Failed to update roles', 'error');
                }
            } catch (e) {
                showToast('Failed to connect to server.', 'error');
            }
        });

        // ── Enemy Online Surge config (admin-only) ──────────────────────
        // Hydrate the four inputs from the server's current config, wire
        // the toggle to show/hide the tunables, and POST the bundle on save.
        const surgeToggle = document.getElementById('wb-toggle-surge-enabled');
        const surgeTunables = document.getElementById('wb-surge-tunables');
        const surgeThreshold = document.getElementById('wb-input-surge-threshold');
        const surgeWindow = document.getElementById('wb-input-surge-window');
        const surgeCooldown = document.getElementById('wb-input-surge-cooldown');
        const surgeResult = document.getElementById('wb-surge-result');
        const surgeBtn = document.getElementById('wb-btn-save-surge');
        function applySurgeConfig(cfg) {
            if (!cfg) return;
            surgeToggle.checked = !!cfg.enabled;
            surgeThreshold.value = cfg.jumpThreshold;
            surgeWindow.value = cfg.windowSec;
            surgeCooldown.value = cfg.cooldownSec;
            surgeTunables.style.display = surgeToggle.checked ? 'block' : 'none';
        }
        surgeToggle.addEventListener('change', () => {
            surgeTunables.style.display = surgeToggle.checked ? 'block' : 'none';
        });
        getAction('/api/enemy-surge/settings')
            .then(r => applySurgeConfig(r && r.settings))
            .catch(() => { /* admin-only — silent for non-admins */ });
        surgeBtn.addEventListener('click', async () => {
            surgeResult.textContent = 'Saving...';
            surgeResult.style.color = '#9ca3af';
            try {
                const body = {
                    enabled: !!surgeToggle.checked,
                    jumpThreshold: Number(surgeThreshold.value),
                    windowSec: Number(surgeWindow.value),
                    cooldownSec: Number(surgeCooldown.value),
                };
                const resp = await postAction('/api/enemy-surge/settings', body);
                if (resp && resp.ok) {
                    applySurgeConfig(resp.settings);
                    surgeResult.textContent = '✓ Saved';
                    surgeResult.style.color = '#4ade80';
                } else {
                    surgeResult.textContent = (resp && resp.error) || 'Failed to save';
                    surgeResult.style.color = '#ef4444';
                }
            } catch (e) {
                surgeResult.textContent = 'Failed: ' + (e.message || 'network error');
                surgeResult.style.color = '#ef4444';
            }
        });

        // v4.9.82: save faction-wide FFS key via the existing
        // /api/oc/ffs-key endpoint (body-only, admin-gated server-side).
        // Pulls caller's own Torn API key from GM storage so factionops
        // admins can set it without installing OC Spawn Assistance.
        document.getElementById('wb-btn-save-ffs-key').addEventListener('click', () => {
            const resultEl = document.getElementById('fo-ffs-key-result');
            const input = document.getElementById('wb-input-ffs-key');
            const ffsKey = input.value.trim();
            if (!ffsKey) {
                resultEl.textContent = 'Enter a key to save (leave blank to keep existing).';
                resultEl.style.color = '#fbbf24';
                return;
            }
            const apiKey = GM_getValue('factionops_api_key', '') || CONFIG.API_KEY;
            if (!apiKey || apiKey.length < 10) {
                resultEl.textContent = 'Verify your Torn API key first.';
                resultEl.style.color = '#ef4444';
                return;
            }
            resultEl.textContent = 'Saving…';
            resultEl.style.color = '#9ca3af';
            httpRequest({
                method: 'POST',
                url: `${CONFIG.SERVER_URL}/api/oc/ffs-key`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ key: apiKey, ffsKey }),
                onload(r) {
                    const d = safeParse(r.responseText);
                    if (r.status >= 200 && r.status < 300) {
                        resultEl.textContent = `Saved — ••••${ffsKey.slice(-4)}`;
                        resultEl.style.color = '#00b894';
                        input.value = '';
                        input.placeholder = `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${ffsKey.slice(-4)}  (type to replace)`;
                    } else {
                        resultEl.textContent = d?.error || `Save failed (HTTP ${r.status})`;
                        resultEl.style.color = '#ef4444';
                    }
                },
                onerror() {
                    resultEl.textContent = 'Network error — could not reach server.';
                    resultEl.style.color = '#ef4444';
                },
            });
        });

        document.getElementById('wb-btn-save-faction-key').addEventListener('click', async () => {
            const statusEl = document.getElementById('wb-faction-key-status');
            const keyVal = document.getElementById('wb-input-faction-key').value.trim();
            if (!keyVal) {
                statusEl.textContent = 'Please paste an API key.';
                statusEl.style.color = 'var(--wb-call-red)';
                return;
            }
            statusEl.textContent = 'Saving...';
            statusEl.style.color = 'var(--wb-idle-yellow)';
            try {
                const resp = await postAction('/api/faction-key', { apiKey: keyVal });
                if (resp && resp.ok) {
                    statusEl.textContent = '';
                    state.factionKeyStored = true;
                    showFactionKeySaved();
                } else {
                    statusEl.textContent = (resp && resp.error) || 'Failed to save key';
                    statusEl.style.color = 'var(--wb-call-red)';
                }
            } catch (e) {
                statusEl.textContent = 'Error: ' + e.message;
                statusEl.style.color = 'var(--wb-call-red)';
            }
        });

        document.getElementById('wb-btn-remove-faction-key').addEventListener('click', async () => {
            const statusEl = document.getElementById('wb-faction-key-status');
            statusEl.textContent = 'Removing...';
            statusEl.style.color = 'var(--wb-idle-yellow)';
            try {
                const resp = await removeAction('/api/faction-key/remove');
                if (resp && resp.ok) {
                    statusEl.textContent = '';
                    state.factionKeyStored = false;
                    showFactionKeyInput();
                } else {
                    statusEl.textContent = (resp && resp.error) || 'Failed to remove key';
                    statusEl.style.color = 'var(--wb-call-red)';
                }
            } catch (e) {
                statusEl.textContent = 'Error: ' + e.message;
                statusEl.style.color = 'var(--wb-call-red)';
            }
        });

        function showFactionKeySaved() {
            const inputRow = document.getElementById('wb-faction-key-input-row');
            const savedRow = document.getElementById('wb-faction-key-saved-row');
            if (inputRow) inputRow.style.display = 'none';
            if (savedRow) savedRow.style.display = 'flex';
        }

        function showFactionKeyInput() {
            const inputRow = document.getElementById('wb-faction-key-input-row');
            const savedRow = document.getElementById('wb-faction-key-saved-row');
            if (inputRow) inputRow.style.display = 'flex';
            if (savedRow) savedRow.style.display = 'none';
        }

        const viewLogsBtn = document.getElementById('wb-btn-view-logs');

        if (viewLogsBtn) {
            viewLogsBtn.addEventListener('click', async () => {
                viewLogsBtn.textContent = 'Loading...';
                viewLogsBtn.disabled = true;
                try {
                    const resp = await getAction('/api/admin/pm2-logs');
                    if (resp && resp.ok !== false) {
                        const logsModal = document.createElement('div');
                        logsModal.className = 'wb-settings-modal';
                        logsModal.style.width = '800px';
                        logsModal.style.maxWidth = '95vw';
                        logsModal.innerHTML = `
                            <h2>PM2 Server Logs</h2>
                            <label>Out Log</label>
                            <pre style="background:#111;color:#0f0;padding:10px;border-radius:4px;overflow-x:auto;max-height:300px;font-size:11px;margin-bottom:14px;">${escapeHtml(resp.out || 'Empty')}</pre>
                            <label>Error Log</label>
                            <pre style="background:#111;color:#f00;padding:10px;border-radius:4px;overflow-x:auto;max-height:300px;font-size:11px;margin-bottom:14px;">${escapeHtml(resp.err || 'Empty')}</pre>
                            <button class="wb-btn" id="wb-btn-close-logs">Close</button>
                        `;
                        const overlay2 = document.createElement('div');
                        overlay2.className = 'wb-settings-overlay';
                        overlay2.style.zIndex = '1000001'; // Above settings modal
                        overlay2.appendChild(logsModal);
                        document.body.appendChild(overlay2);
                        document.getElementById('wb-btn-close-logs').addEventListener('click', () => {
                            document.body.removeChild(overlay2);
                        });
                    } else {
                        alert('Failed to fetch logs: ' + (resp.error || 'Unknown error'));
                    }
                } catch (e) {
                    alert('Error: ' + e.message);
                } finally {
                    viewLogsBtn.textContent = 'View PM2 Server Logs';
                    viewLogsBtn.disabled = false;
                }
            });
        }

        document.getElementById('wb-btn-disconnect').addEventListener('click', () => {
            stopPolling();
            disconnectRealtime();
            disconnectSSEStream();
            stopKeepAlive();
            closeSettings();
        });

        document.getElementById('wb-btn-save').addEventListener('click', async () => {
            const serverUrl = document.getElementById('wb-input-server').value.trim() || 'http://localhost:3000';
            const apiKey = document.getElementById('wb-input-apikey').value.trim();

            setConfig('SERVER_URL', serverUrl);
            setConfig('API_KEY', apiKey);

            // This modal-wide Save closes the panel, so a member who pastes
            // their FFScouter key and hits Save here instead of the field's own
            // Save button would silently lose it. Commit it too. Only a
            // non-empty value: clearing is deliberate and stays on Clear.
            const myFfsPending = (document.getElementById('wb-input-my-ffs-key') || {}).value;
            if (myFfsPending && String(myFfsPending).trim()) {
                setMyFfsKey(String(myFfsPending).trim());
                resetFfCacheForKeyChange();
            }

            stopPolling();
            disconnectRealtime();
            disconnectSSEStream();
            if (apiKey) {
                try {
                    await authenticate();
                    startPolling();
                    connectRealtime();
                } catch (e) {
                    warn('Auth failed on save:', e.message);
                    if (state.jwtToken) { startPolling(); connectRealtime(); }
                }
            }
            closeSettings();
        });
    }

    function closeSettings() {
        state.ui.settingsOpen = false;
        const overlay = document.getElementById('wb-settings-overlay');
        if (overlay) overlay.remove();
    }

    /** Escape HTML for safe insertion into innerHTML. */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /** Update connection indicators wherever they appear. */
    function updateConnectionUI() {
        // Settings modal indicator
        const dot = document.getElementById('wb-settings-conn-dot');
        const text = document.getElementById('wb-settings-conn-text');
        if (dot && text) {
            dot.className = 'wb-status-dot ' +
                (state.connected ? 'connected' : state.connecting ? 'connecting' : 'disconnected');
            text.textContent = state.connected ? 'Connected' : state.connecting ? 'Connecting...' : 'Offline';
        }

        // Gear icon color hint
        const gear = document.querySelector('.wb-settings-gear');
        if (gear) {
            gear.style.borderColor = state.connected
                ? 'var(--wb-call-green)'
                : state.connecting
                    ? 'var(--wb-idle-yellow)'
                    : 'var(--wb-call-red)';
        }
    }

    /** Apply theme class to html element. */
    function applyTheme() {
        document.documentElement.classList.toggle('wb-theme-light', CONFIG.THEME === 'light');
    }

    // =========================================================================
    // SECTION 10: CHAIN MONITOR BAR
    // =========================================================================

    /** Create a standalone Next Up bar (no chain info) inserted into the page flow. */
    function createStandaloneNextUp() {
        if (document.getElementById('wb-next-up-standalone')) return;

        const bar = document.createElement('div');
        bar.id = 'wb-next-up-standalone';
        bar.className = 'wb-next-up-standalone';
        bar.innerHTML = '<div class="wb-next-up" id="wb-next-up"></div>';

        // Insert before the member list or at top of content
        const content = document.querySelector('.faction-war') || document.querySelector('.content-wrapper') || document.querySelector('#mainContainer');
        if (content && content.firstChild) {
            content.insertBefore(bar, content.firstChild);
        } else {
            document.body.prepend(bar);
        }
    }

    /** Create or update the chain monitor bar fixed to the top of the page. */
    function createChainBar() {
        if (state.ui.chainBar) return; // already exists

        const bar = document.createElement('div');
        bar.className = 'wb-chain-bar wb-chain-safe';
        bar.id = 'wb-chain-bar';

        bar.innerHTML = `
            <div class="wb-chain-section">
                <span>Chain:</span>
                <span class="wb-chain-count" id="wb-chain-count">0/0</span>
                <span id="wb-chain-bonus-badge" class="wb-chain-bonus" style="display:none;"></span>
            </div>
            <div class="wb-next-up" id="wb-next-up"></div>
            <div class="wb-chain-section">
                <span>Timeout:</span>
                <span class="wb-chain-timeout" id="wb-chain-timeout">--:--</span>
            </div>
            <div class="wb-chain-section">
                <span class="wb-chain-minimize" id="wb-chain-minimize" title="Minimize">\u2715</span>
            </div>
        `;

        document.body.appendChild(bar);
        document.body.classList.add('wb-chain-active');

        state.ui.chainBar = bar;

        document.getElementById('wb-chain-minimize').addEventListener('click', () => {
            bar.style.display = 'none';
            document.body.classList.remove('wb-chain-active');
        });

        updateChainBar();
    }

    /**
     * Forward intercepted chain data to the server so all faction members
     * see the update instantly (instead of waiting for the 30s poll).
     */
    // Chain data forwarding removed — server polls Torn API directly for chain alerts.
    // Client only handles local audio beep + PDA notification.

    /** Update chain bar contents and styling. */
    function updateChainBar() {
        // Compute chain display values
        const countText = `${state.chain.current || 0}/${state.chain.max || '??'}`;
        let timeoutText = '--:--';
        if (state.chain.timeout > 0) {
            timeoutText = formatTimer(state.chain.timeout);
        } else if (state.chain.cooldown > 0) {
            timeoutText = `CD: ${formatTimer(state.chain.cooldown)}`;
        }
        const next = nextBonusMilestone(state.chain.current + 1);
        const hitsToBonus = next ? next - state.chain.current : null;
        let bonusText = '';
        let showBonus = false;
        // Only show bonus indicator when chain >= 10 (past first bonus or approaching a real one)
        if (hitsToBonus !== null && hitsToBonus <= 10 && state.chain.current >= 10) {
            showBonus = true;
            bonusText = hitsToBonus <= 0 ? `BONUS ${next}!` : `BONUS in ${hitsToBonus}`;
        }
        const isDanger = state.chain.timeout > 0 && state.chain.timeout <= 30;

        // Update floating chain bar (if visible)
        const bar = state.ui.chainBar;
        if (bar && bar.style.display !== 'none') {
            const countEl = document.getElementById('wb-chain-count');
            const timeoutEl = document.getElementById('wb-chain-timeout');
            const bonusBadge = document.getElementById('wb-chain-bonus-badge');
            if (countEl) countEl.textContent = countText;
            if (timeoutEl) timeoutEl.textContent = timeoutText;
            if (bonusBadge) {
                bonusBadge.style.display = showBonus ? 'inline' : 'none';
                if (showBonus) bonusBadge.textContent = bonusText;
            }
            bar.classList.remove('wb-chain-safe', 'wb-chain-approaching', 'wb-chain-imminent');
            if (hitsToBonus !== null && hitsToBonus <= 3) {
                bar.classList.add('wb-chain-imminent');
            } else if (hitsToBonus !== null && hitsToBonus <= 10) {
                bar.classList.add('wb-chain-approaching');
            } else {
                bar.classList.add('wb-chain-safe');
            }
        }

        // Update live chain display in overlay header
        const liveCount = document.getElementById('fo-chain-live-count');
        const liveTimer = document.getElementById('fo-chain-live-timer');
        const liveBonus = document.getElementById('fo-chain-live-bonus');
        if (liveCount) liveCount.textContent = countText;
        if (liveTimer) {
            liveTimer.textContent = timeoutText;
            liveTimer.classList.toggle('danger', isDanger);
        }
        if (liveBonus) {
            liveBonus.style.display = showBonus ? 'inline' : 'none';
            if (showBonus) liveBonus.textContent = bonusText;
        }

        // Update overlay header fallback chain info (only when Torn native bar wasn't found)
        const fallback = document.getElementById('fo-chain-fallback');
        if (fallback && fallback.style.display !== 'none') {
            const foCount = document.getElementById('fo-chain-count');
            const foTimeout = document.getElementById('fo-chain-timeout');
            const foBonus = document.getElementById('fo-chain-bonus');
            if (foCount) foCount.textContent = countText;
            if (foTimeout) {
                foTimeout.textContent = timeoutText;
                foTimeout.classList.toggle('danger', isDanger);
            }
            if (foBonus) {
                foBonus.style.display = showBonus ? 'inline' : 'none';
                if (showBonus) foBonus.textContent = bonusText;
            }
        }
    }

    // ---- Chain break sound alert via Web Audio API ----
    function playChainAlert() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const beep = (startTime) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 800;
                osc.type = 'square';
                gain.gain.value = 0.3;
                osc.start(startTime);
                osc.stop(startTime + 0.1);
            };
            const now = ctx.currentTime;
            beep(now);
            beep(now + 0.2);
            beep(now + 0.4);
        } catch (e) {
            warn('Chain alert audio failed:', e);
        }
    }

    // Client-side countdown for chain timeout/cooldown
    let chainTimerRAF = null;
    // Wall-clock anchor for chain timeout — any source (intercepted API, server
    // poll, BroadcastChannel) calls setChainTimeout(); tick() derives current
    // timeout from elapsed wall-clock time so the countdown never jumps.
    let chainTimeoutAnchor = 0;    // timeout value when last set (seconds)
    let chainTimeoutAnchorAt = 0;  // Date.now() when last set
    let lastChainCurrent = -1;     // track chain count for monotonic guard
    let chainLastIncreaseAt = 0;
    let _prevChainCurrentForAlert = -1;
    let _lastChainSource = 'none';
    function _chainAlertDiag(kind) {
        const sh = chainLastIncreaseAt > 0 ? Math.round((Date.now() - chainLastIncreaseAt) / 1000) : -1;
        try { httpRequest({ method: 'POST', url: CONFIG.SERVER_URL + '/api/debug/client-log', headers: { 'Content-Type': 'application/json' }, data: JSON.stringify({ tag: 'fo-chain-alert', data: { v: SCRIPT_VERSION, kind, cur: state.chain.current, to: Math.round(state.chain.timeout), anchor: Math.round(chainTimeoutAnchor || 0), anchorAge: chainTimeoutAnchorAt ? Math.round((Date.now() - chainTimeoutAnchorAt) / 1000) : -1, src: _lastChainSource, sinceHit: sh, pollOnly: CHAIN_POLL_ONLY } }), onload() { }, onerror() { } }); } catch (_) { }
    }

    function setChainTimeout(value, source) {
        if (source) _lastChainSource = source;
        // Monotonic guard: chain timers only count DOWN, so reject values
        // that are HIGHER than our current countdown — they come from stale
        // cached API responses. Allow higher values only when chain count
        // changed (a new hit legitimately resets the timer).
        const chainCountChanged = state.chain.current !== lastChainCurrent;
        if (!chainCountChanged && chainTimeoutAnchorAt > 0 && chainTimeoutAnchor > 0) {
            const elapsed = (Date.now() - chainTimeoutAnchorAt) / 1000;
            const currentCountdown = Math.max(0, chainTimeoutAnchor - elapsed);
            // Only accept if new value is at or below current countdown (+2s tolerance)
            if (value > currentCountdown + 2) {
                return; // stale/cached — ignore
            }
        }
        lastChainCurrent = state.chain.current;
        state.chain.timeout = value;
        chainTimeoutAnchor = value;
        chainTimeoutAnchorAt = Date.now();
    }
    /**
     * v5.1.65: anchor the countdown to an ABSOLUTE end instant from the server.
     * Preferred over setChainTimeout(seconds), which has to guess how much of
     * the value was eaten by request latency. Re-anchoring to the same deadline
     * is a no-op, so a repeated poll no longer nudges the display.
     */
    function setChainDeadline(endsAtMs) {
        if (!Number.isFinite(endsAtMs) || endsAtMs <= 0) return;
        const remaining = Math.max(0, (endsAtMs - Date.now()) / 1000);
        // Same deadline (within a second) — nothing to do.
        if (chainTimeoutAnchorAt > 0 &&
            Math.abs((chainTimeoutAnchorAt + chainTimeoutAnchor * 1000) - endsAtMs) < 1000) return;
        lastChainCurrent = state.chain.current;
        state.chain.timeout = remaining;
        chainTimeoutAnchor = remaining;
        chainTimeoutAnchorAt = Date.now();
    }

    // Cooldown wall-clock anchors (cooldown only comes from server, no conflict)
    let chainCooldownSetAt = 0;
    let chainCooldownSetVal = 0;

    function startChainTimer() {
        if (chainTimerRAF) return; // already running

        function tick() {
            // Derive timeout from wall-clock since last anchor — never
            // decrement state.chain.timeout directly (prevents jump when
            // multiple sources set different values).
            if (chainTimeoutAnchorAt > 0 && chainTimeoutAnchor > 0) {
                const elapsed = (Date.now() - chainTimeoutAnchorAt) / 1000;
                state.chain.timeout = Math.max(0, chainTimeoutAnchor - elapsed);
            }
            if (_prevChainCurrentForAlert >= 0 && state.chain.current > _prevChainCurrentForAlert) {
                chainLastIncreaseAt = Date.now();
            }
            _prevChainCurrentForAlert = state.chain.current;
            const _sinceHit = chainLastIncreaseAt > 0 ? (Date.now() - chainLastIncreaseAt) / 1000 : Infinity;
            const chainTimeoutPlausible = state.chain.timeout >= (300 - _sinceHit) - 60;
            // Chain break sound + notification alerts (only during active wars)
            // Only alert if chain data is fresh (anchor set within last 60s — avoids stale countdown alerts)
            const anchorAge = chainTimeoutAnchorAt > 0 ? (Date.now() - chainTimeoutAnchorAt) / 1000 : Infinity;
            const chainDataFresh = anchorAge < 120; // anchor less than 2 min old
            const _chainFocusOK = IS_PDA || (typeof document.hasFocus === 'function' ? document.hasFocus() : !document.hidden);
            // Fire on ANY active chain you're watching (not war-only): the focus
            // gate keeps it compliant, current>=10 + freshness keep it relevant.
            if (CONFIG.CHAIN_ALERT && _chainFocusOK && chainDataFresh && chainTimeoutPlausible && state.chain.timeout > 0 && state.chain.current >= 10) {
                // Panic at 30s
                if (state.chain.timeout <= 30 && !state.chainPanicFired) {
                    _chainAlertDiag('panic');
                    playChainAlert();
                    firePdaNotification('chain_alert',
                        '\uD83D\uDD34 CHAIN DYING! ' + Math.round(state.chain.timeout) + 's!',
                        `Chain ${state.chain.current} is about to break! ${Math.round(state.chain.timeout)}s left \u2014 HIT NOW!`);
                    state.chainPanicFired = true;
                    // Warning at 60s
                } else if (state.chain.timeout <= CONFIG.CHAIN_ALERT_THRESHOLD && !state.chainAlertFired) {
                    _chainAlertDiag('warn');
                    playChainAlert();
                    firePdaNotification('chain_alert',
                        '\uD83D\uDEA8 CHAIN BREAKING!',
                        `Chain ${state.chain.current} \u2014 ${Math.round(state.chain.timeout)}s remaining! Attack now!`);
                    state.chainAlertFired = true;
                }
            }
            if (state.chain.timeout > CONFIG.CHAIN_ALERT_THRESHOLD) {
                state.chainAlertFired = false;
                state.chainPanicFired = false;
            }
            if (chainCooldownSetAt > 0 && chainCooldownSetVal > 0) {
                const elapsed = (Date.now() - chainCooldownSetAt) / 1000;
                state.chain.cooldown = Math.max(0, chainCooldownSetVal - elapsed);
            }

            updateChainBar();
            updateEnergyDisplay();
            chainTimerRAF = requestAnimationFrame(tick);
        }

        chainTimerRAF = requestAnimationFrame(tick);
    }

    // Re-sync chain timer immediately when the tab becomes visible again.
    // Wall-clock approach already gives the correct value; just force a repaint.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            updateChainBar();
            // Immediately refresh war stats and poll server when tab becomes visible
            if (typeof updateWarTimer === 'function') updateWarTimer();
            if (typeof updateWarTimerDisplay === 'function') updateWarTimerDisplay();
            // v5.0.25: PDA WebView pauses JS when backgrounded. On resume,
            // any accumulated pollErrorCount from missed/timed-out polls
            // would falsely trip the disconnect threshold. Reset the
            // error counter and the grace timer here so a fresh poll
            // starts from a clean slate. The next pollOnce() below sets
            // state.connected=true on success.
            pollErrorCount = 0;
            if (_disconnectGraceTimer) {
                clearTimeout(_disconnectGraceTimer);
                _disconnectGraceTimer = null;
            }
            pollOnce();
        }
    });

    // Direct Torn API chain polling — uses the player's own API key to get
    // chain data every 5 seconds, independent of the server poll.
    let chainPollInterval = null;
    const CHAIN_POLL_MS = 30000; // 30 seconds (Torn API caches for 29s anyway)

    function startDirectChainPoll() {
        if (chainPollInterval) return; // already running

        function pollChain() {
            if (!CONFIG.API_KEY || !state.myFactionId) return;

            const url = `https://api.torn.com/faction/${state.myFactionId}?selections=chain&key=${encodeURIComponent(CONFIG.API_KEY)}`;

            httpRequest({
                method: 'GET',
                url,
                onload(res) {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.error) return;
                        if (data.chain) {
                            const chain = data.chain;
                            const oldCurrent = state.chain.current;
                            state.chain.current = chain.current || 0;
                            state.chain.max = chain.max || 0;
                            let adjustedTimeout = chain.timeout || 0;
                            if (data.timestamp && adjustedTimeout > 0) {
                                const cacheAge = Math.floor(Date.now() / 1000) - data.timestamp;
                                if (cacheAge > 0 && cacheAge < 300) {
                                    adjustedTimeout = Math.max(0, adjustedTimeout - cacheAge);
                                }
                            }
                            setChainTimeout(adjustedTimeout, 'poll');
                            state.chain.cooldown = chain.cooldown || 0;
                            updateChainBar();

                            if (chain.current !== oldCurrent) {
                                // Bonus-imminent alert. The original lived in the now-dead
                                // !CHAIN_POLL_ONLY block, so under poll-only it never fired.
                                // Fire on each hit within 3 of the next bonus milestone.
                                const nextBonus = nextBonusMilestone(chain.current + 1);
                                const hitsToBonus = nextBonus ? nextBonus - chain.current : null;
                                const coolingDown = (chain.cooldown || 0) > 0;
                                const focusOK = IS_PDA || (typeof document.hasFocus === 'function' ? document.hasFocus() : !document.hidden);
                                if (CONFIG.CHAIN_ALERT && focusOK && !coolingDown && hitsToBonus !== null && hitsToBonus > 0 && hitsToBonus <= 3 && chain.current >= 10) {
                                    showToast(`BONUS HIT in ${hitsToBonus}! Target: ${nextBonus}`, 'error');
                                    playChainAlert();
                                    firePdaNotification('bonus_imminent',
                                        '💥 Bonus Hit Imminent',
                                        `Chain at ${chain.current}/${nextBonus} — ${hitsToBonus} hit${hitsToBonus > 1 ? 's' : ''} to bonus!`);
                                }
                            }

                            // Forward to warboard so the server's chain
                            // monitor can gate its own Torn fetch — saves
                            // the pool budget. Best-effort, silent on
                            // failure. Includes Torn's response timestamp
                            // so the server can reject stale snapshots.
                            const warId = deriveWarId();
                            if (warId && state.jwtToken) {
                                postAction('/api/chain-update', {
                                    warId,
                                    chainData: {
                                        current: chain.current || 0,
                                        max: chain.max || 0,
                                        timeout: chain.timeout || 0,
                                        cooldown: chain.cooldown || 0,
                                        modifier: chain.modifier || 1,
                                        serverTimestamp: data.timestamp || Math.floor(Date.now() / 1000),
                                    },
                                }).catch(() => { });
                            }
                        }
                    } catch (e) {
                        // Parse error — skip silently
                    }
                },
                onerror() {
                    // Network error — skip silently
                },
            });
        }

        pollChain();
        chainPollInterval = setInterval(pollChain, CHAIN_POLL_MS);
        log(`Direct chain poll started (every ${CHAIN_POLL_MS / 1000}s)`);
    }

    function stopDirectChainPoll() {
        if (chainPollInterval) {
            clearInterval(chainPollInterval);
            chainPollInterval = null;
            log('Direct chain poll stopped');
        }
    }

    // ---- Energy bar via API ----
    // v5.0.91: 60s → 300s. v5.0.98: 300s → 600s (aligned with the
    // attacks + ffscouter polls so the cellular radio wakes once per
    // 10-min cycle instead of three times). Energy display still
    // counts down in real time between polls via anchored ticktime
    // so the absolute value is at most 10 min stale, smoothly.
    const ENERGY_POLL_MS = 10 * 60 * 1000; // 10 minutes
    let energyPollInterval = null;
    let energyState = { current: 0, max: 0, ticktime: 0, fulltime: 0 };
    let energyTickAnchorAt = 0; // wall-clock when we last set ticktime
    let energyTickAnchorVal = 0; // ticktime value at anchor

    function pollEnergy() {
        if (!CONFIG.API_KEY) return;
        // v5.0.90: dropped 'cooldowns' from Torn API selections + from the
        // /api/me/bars POST body per user request. The cooldowns dashboard
        // still gets data from other faction members' polls. Smaller
        // Torn API response + less work per tick for this client.
        const url = `https://api.torn.com/user/?selections=bars&key=${encodeURIComponent(CONFIG.API_KEY)}`;
        httpRequest({
            method: 'GET',
            url,
            onload(res) {
                try {
                    const data = JSON.parse(res.responseText);
                    if (data.error) return;
                    if (data.energy) {
                        energyState.current = data.energy.current || 0;
                        energyState.max = data.energy.maximum || 0;
                        energyState.ticktime = data.energy.ticktime || 0;
                        energyState.fulltime = data.energy.fulltime || 0;
                        energyTickAnchorVal = energyState.ticktime;
                        energyTickAnchorAt = Date.now();
                        updateEnergyDisplay();
                    }
                    // Self-report bars only — no cooldowns (v5.0.90).
                    const bars = {
                        energy: data.energy, nerve: data.nerve,
                        happy: data.happy, life: data.life, chain: data.chain,
                    };
                    if (state.jwtToken && bars) {
                        postAction('/api/me/bars', { bars }).catch(() => { });
                    }
                } catch (e) { /* silent */ }
            },
            onerror() { /* silent */ },
        });
    }

    function startEnergyPoll() {
        if (energyPollInterval) return;
        pollEnergy();
        energyPollInterval = setInterval(pollEnergy, ENERGY_POLL_MS);
        log('Energy poll started (every ' + Math.round(ENERGY_POLL_MS / 1000) + 's)');
    }

    function stopEnergyPoll() {
        if (energyPollInterval) {
            clearInterval(energyPollInterval);
            energyPollInterval = null;
        }
    }

    // ---- Attack telemetry via personal API ----
    // Polls /user/?selections=attacks every 60s (the user's own key, no
    // pool budget) and POSTs the last-100 fight history to warboard.
    // Server attributes each fight to the active war by faction +
    // timestamp window and dedupes by Torn fight ID — produces richer
    // per-attack analytics in the post-war report than the faction
    // attacks-feed alone (mug $, modifiers, defends, KO outcomes).
    // v5.0.97: 60s → 5 min. v5.0.98: 5 min → 10 min (aligned with
    // bars + ffscouter polls so the cellular radio wakes once per
    // 10-min cycle). Server-side polling backstop still catches any
    // attacks this client misses, so the post-war ledger stays
    // complete — just settles ~20 min after war end instead of ~10.
    const ATTACKS_POLL_MS = 10 * 60 * 1000;
    let attacksPollInterval = null;

    function pollAttacks() {
        if (!CONFIG.API_KEY || !state.jwtToken) return;
        const url = `https://api.torn.com/user/?selections=attacks&key=${encodeURIComponent(CONFIG.API_KEY)}&comment=warboard-attacks`;
        httpRequest({
            method: 'GET',
            url,
            onload(res) {
                try {
                    const data = JSON.parse(res.responseText);
                    if (data.error || !data.attacks) return;
                    if (Object.keys(data.attacks).length === 0) return;
                    postAction('/api/me/attacks', { attacks: data.attacks }).catch(() => { });
                } catch (e) { /* silent */ }
            },
            onerror() { /* silent */ },
        });
    }

    function startAttacksPoll() {
        if (attacksPollInterval) return;
        pollAttacks();
        attacksPollInterval = setInterval(pollAttacks, ATTACKS_POLL_MS);
        log('Attack telemetry poll started (every ' + Math.round(ATTACKS_POLL_MS / 1000) + 's)');
    }

    function stopAttacksPoll() {
        if (attacksPollInterval) {
            clearInterval(attacksPollInterval);
            attacksPollInterval = null;
        }
    }

    function updateEnergyDisplay() {
        const valEl = document.getElementById('fo-energy-value');
        const timerEl = document.getElementById('fo-energy-timer');
        if (!valEl) return;

        valEl.textContent = `${energyState.current}/${energyState.max}`;
        valEl.classList.toggle('full', energyState.current >= energyState.max);

        if (timerEl) {
            if (energyState.current >= energyState.max) {
                timerEl.textContent = '';
            } else if (energyState.fulltime > 0) {
                // Show time until full
                const elapsed = (Date.now() - energyTickAnchorAt) / 1000;
                const remaining = Math.max(0, energyState.fulltime - elapsed);
                if (remaining > 0) {
                    const mins = Math.floor(remaining / 60);
                    const secs = Math.floor(remaining % 60);
                    timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                } else {
                    timerEl.textContent = '';
                }
            } else {
                timerEl.textContent = '';
            }
        }
    }

    // ---- DOM-based chain reader (zero API calls) ----
    // Watches Torn's native #barChain element for changes and extracts
    // chain count + timer directly from the DOM text content.
    let chainDOMObserver = null;
    let chainDOMReadInterval = null;

    let chainBarRef = null; // cached reference to the moved #barChain element

    // Push the DOM-read chain to warboard so its chain-monitor gates its own
    // Torn poll (saves the shared pool-key budget). DOM-sourced = no Torn call,
    // so it works even when the user's key is rate-limited. Throttled to ~5s
    // (under the server's 8s freshness gate) + immediately on a count change.
    let _lastChainPushAt = 0;
    let _lastChainPushCurrent = -1;
    function pushChainToServer() {
        if (!state.jwtToken) return;
        const warId = deriveWarId();
        if (!warId) return;
        const c = state.chain;
        if (!c || typeof c.current !== 'number') return;
        const now = Date.now();
        // v5.1.65: only push when the chain ACTUALLY moved. The old rule
        // ("push if unchanged and >5s since last") was a 12/min heartbeat per
        // member; each one rewrote war.chainData, bumped the long-poll version
        // and woke every other member's radio. The server polls the chain
        // itself every ~10s, so an unchanged push tells it nothing it does not
        // already know. A 60s floor is kept purely as a liveness signal.
        const changed = c.current !== _lastChainPushCurrent;
        if (!changed && now - _lastChainPushAt < 60000) return;
        _lastChainPushAt = now;
        _lastChainPushCurrent = c.current;
        postAction('/api/chain-update', {
            warId,
            chainData: {
                current: c.current || 0,
                timeout: c.timeout || 0,
                cooldown: c.cooldown || 0,
                serverTimestamp: Math.floor(now / 1000),
            },
        }).catch(() => { });
    }

    function parseChainFromDOM() {
        const bar = chainBarRef || document.getElementById('barChain');
        if (!bar) return false;

        // bar-stats contains text like "1/10" or "Chain: 1,234/100,000"
        const statsEl = bar.querySelector('p[class*="bar-stats"]');
        // bar-timeleft contains text like "04:21" or "4:21"
        const timeleftEl = bar.querySelector('p[class*="bar-timeleft"]');
        // bar-value may contain the progress bar fill

        let changed = false;

        if (statsEl) {
            const text = statsEl.textContent.trim();
            // Extract numbers from "Chain: 1,234 / 100,000" or "1/10" etc.
            const match = text.match(/(\d[\d,.\s]*)\s*\/\s*(\d[\d,.\s]*)/);
            if (match) {
                const current = parseInt(match[1].replace(/[^\d]/g, ''), 10);
                const max = parseInt(match[2].replace(/[^\d]/g, ''), 10);
                if (!isNaN(current) && current !== state.chain.current) {
                    state.chain.current = current;
                    changed = true;
                }
                if (!isNaN(max)) state.chain.max = max;
            }
        }

        if (timeleftEl) {
            const text = timeleftEl.textContent.trim();
            // Parse "MM:SS" or "M:SS" or "HH:MM:SS" into seconds
            const parts = text.split(':').map(p => parseInt(p, 10));
            let seconds = 0;
            if (parts.length === 2 && parts.every(p => !isNaN(p))) {
                seconds = parts[0] * 60 + parts[1];
            } else if (parts.length === 3 && parts.every(p => !isNaN(p))) {
                seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
            if (seconds <= 0 && (text === '' || text === '00:00')) {
                state.chain.timeout = 0;
                chainTimeoutAnchor = 0;
                chainTimeoutAnchorAt = 0;
            }
        }

        if (changed) {
        }

        pushChainToServer();
        return true;
    }

    function startChainDOMObserver(barElement) {
        if (chainDOMObserver) return; // already running

        const bar = barElement || chainBarRef || document.getElementById('barChain');
        if (!bar) {
            log('Cannot start chain DOM observer — #barChain not found');
            return false;
        }
        chainBarRef = bar; // cache for parseChainFromDOM

        // Initial read
        parseChainFromDOM();

        // Watch for mutations (Torn's JS updates text content)
        chainDOMObserver = new MutationObserver(() => {
            parseChainFromDOM();
        });
        chainDOMObserver.observe(bar, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        // Backup only — the MutationObserver above is the real detector, and
        // the server independently polls the chain every ~10s. v5.1.65: 2s ->
        // 10s; a 2-second re-parse of Torn's chain bar bought nothing that the
        // observer had not already caught a moment earlier.
        // The 10s re-parse was removed 2026-09-04. Its own note called it a
        // backup only -- the MutationObserver above is the real detector and
        // the server polls chain independently, so nothing lost a source.

        log('Chain DOM observer started (zero API calls)');
        return true;
    }

    function stopChainDOMObserver() {
        if (chainDOMObserver) {
            chainDOMObserver.disconnect();
            chainDOMObserver = null;
        }
        if (chainDOMReadInterval) {
            clearInterval(chainDOMReadInterval);
            chainDOMReadInterval = null;
        }
        chainBarRef = null;
    }

    // =========================================================================
    // SECTION 11: STATUS COUNTDOWN TIMERS
    // =========================================================================

    // We keep a set of active timers that decrement `until` fields in
    // state.statuses. A single rAF loop handles all of them.
    let statusTimerRAF = null;
    let statusTimerLast = 0;

    function startStatusTimers() {
        if (statusTimerRAF) return;
        statusTimerLast = performance.now();
        let nextUpAccum = 0; // throttle next-up DOM writes to ~1s
        let flightsAccum = 0; // throttle flight-refresh to 60s intervals
        // Fire one immediate refresh so countdown chips don't take 60s
        // to appear on first render.
        refreshFlightsForTravelers();

        function tick(now) {
            const dt = (now - statusTimerLast) / 1000;
            statusTimerLast = now;
            let anyActive = false;

            for (const targetId of Object.keys(state.statuses)) {
                const s = state.statuses[targetId];
                // v4.9.80: don't decrement s.until any more — read
                // remaining from the absolute releaseAt we stamped on
                // update. Decrement approach drifted over time and
                // required monotonic-guard patches when server polls
                // rebounded the timer. Absolute timestamp = no drift.
                // Lazy-rebase for legacy state from disk or pre-upgrade
                // payloads that only carry the duration.
                if (typeof s.releaseAt !== 'number' && s.until > 0) {
                    rebaseStatusUntil(s);
                }
                const remaining = statusRemainingSec(s);
                if (remaining > 0) {
                    // Keep the cached duration roughly in sync for any
                    // legacy readers that still consult s.until directly.
                    s.until = remaining;
                    anyActive = true;
                    // Update just the timer text in the DOM for efficiency.
                    // Guard with a value check: assigning textContent fires a DOM
                    // mutation even when unchanged, and this loop runs every frame
                    // while the seconds value only ticks 1/s — writing only on
                    // change cuts ~98% of timer mutations. (Battery: the war page's
                    // reactive querySelectorAll storms off our DOM mutations.)
                    const _tt = formatTimer(remaining);
                    const timerEl = document.getElementById(`wb-timer-${targetId}`);
                    if (timerEl && timerEl.textContent !== _tt) {
                        timerEl.textContent = _tt;
                    }
                    // Also update overlay timer element
                    const foTimerEl = document.getElementById(`fo-timer-${targetId}`);
                    if (foTimerEl && foTimerEl.textContent !== _tt) {
                        foTimerEl.textContent = _tt;
                    }
                }
            }

            // Update the Next Up queue roughly once per second
            nextUpAccum += dt;
            if (nextUpAccum >= 1) {
                nextUpAccum = 0;
                // v4.9.81: tick live travel countdowns — landingAt is
                // absolute, so each pass computes remaining exactly.
                for (const targetId of Object.keys(state.statuses)) {
                    const s = state.statuses[targetId];
                    if (normalizeStatus(s.status) !== 'traveling') continue;
                    const la = Number(s.landingAt) || 0;
                    if (la <= 0) continue;
                    const rem = Math.max(0, la - _nowSec());
                    const fId = `fo-timer-${targetId}`;
                    const wId = `wb-timer-${targetId}`;
                    const fEl = document.getElementById(fId);
                    const wEl = document.getElementById(wId);
                    const label = rem > 0 ? formatTimer(rem) : 'Landing';
                    if (fEl && fEl.textContent !== label) fEl.textContent = label;
                    if (wEl && wEl.textContent !== label) wEl.textContent = label;
                }
            }
            // Periodic flight-info refresh (60s cadence).
            flightsAccum += dt;
            if (flightsAccum >= 60) {
                flightsAccum = 0;
                refreshFlightsForTravelers();
                // v4.9.94: also nudge the sort once a minute so new
                // landing data / newly-boarded flights re-order
                // without waiting for an unrelated trigger.
            }

            statusTimerRAF = requestAnimationFrame(tick);
        }

        // Kick off the rAF loop.
        statusTimerRAF = requestAnimationFrame(tick);
    }

    /**
     * Enemy just-attacked indicator. The server emits `lastAttackAt`
     * (unix seconds) whenever an enemy is seen mid-attack. We tag rows
     * with `.is-attacking` for 60 seconds after that timestamp so the
     * overlay shows "this enemy is busy right now."
     *
     * Also fires a toast + PDA notification when the target is one YOU
     * called — signals "don't hit your call yet, they're mid-swing."
     * Scoped to your own calls so it doesn't spam with every enemy
     * attack across the faction.
     */
    const _lastAttackingState = {}; // targetId → boolean, for transition detection
    const _lastAttackToastAt = {};  // targetId → unix seconds, for per-enemy toast rate-limit
    const ATTACK_TOAST_COOLDOWN = 120; // seconds — don't re-toast same enemy within this window
    /**
     * Render the faction cooldowns panel (Option B self-reported bars).
     * One row per member with energy bar, nerve bar, and cooldowns
     * (drug/medical/booster). Sorted by "ready to attack" — full energy
     * + no drug cooldown first.
     */
    function renderFactionBars() {
        const list = document.getElementById('fo-bars-list');
        const countEl = document.getElementById('fo-bars-count');
        if (!list) return;

        const entries = Object.entries(state.memberBars || {});
        if (countEl) countEl.textContent = String(entries.length);

        if (entries.length === 0) {
            list.innerHTML = '<div class="fo-bars-empty">No faction members reporting yet.</div>';
            return;
        }

        // Project energy forward from the last report timestamp using
        // Torn's own regen metadata (ticktime, interval, increment, fulltime).
        // Assumes the member hasn't spent energy in the gap — if they
        // attacked while offline we'll over-count, same tradeoff as
        // cooldowns. interval already bakes in donator vs non-donator.
        function projectEnergy(energyObj, ageSec) {
            if (!energyObj || !energyObj.maximum) return { current: 0, maximum: 0, pct: 0 };
            const max = energyObj.maximum;
            const cur0 = Number(energyObj.current) || 0;
            const increment = Number(energyObj.increment) || 5;
            const interval = Number(energyObj.interval) || 600;
            const ticktime = Number(energyObj.ticktime) || 0;
            const fulltime = Number(energyObj.fulltime) || 0;
            // v5.1.7: don't cap at max — energy can exceed max via
            // xanax (250e per pop) and the user wants to see the
            // actual number. Bar fill clamps at 100% visually but the
            // text shows the real value.
            if (cur0 >= max) {
                return {
                    current: cur0, maximum: max,
                    pct: Math.min(100, Math.round(100 * cur0 / max)),
                };
            }
            if (fulltime > 0 && ageSec >= fulltime) return { current: max, maximum: max, pct: 100 };
            let projected = cur0;
            if (ageSec >= ticktime && interval > 0 && increment > 0) {
                const ticks = 1 + Math.floor((ageSec - ticktime) / interval);
                // Cap projection at max for the regen path (you only
                // regen UP to max; over-max only comes from drugs).
                projected = Math.min(max, cur0 + ticks * increment);
            }
            return { current: projected, maximum: max, pct: Math.round(100 * projected / max) };
        }

        // Sort: higher projected energy% first; secondary by name.
        const nowMs = Date.now();
        entries.sort((a, b) => {
            const ageA = a[1]?.updatedAt ? Math.max(0, (nowMs - a[1].updatedAt) / 1000) : 0;
            const ageB = b[1]?.updatedAt ? Math.max(0, (nowMs - b[1].updatedAt) / 1000) : 0;
            const pa = projectEnergy(a[1]?.bars?.energy, ageA).pct;
            const pb = projectEnergy(b[1]?.bars?.energy, ageB).pct;
            if (pb !== pa) return pb - pa;
            return (a[1]?.name || '').localeCompare(b[1]?.name || '');
        });

        // v5.1.6: cooldowns column dropped — we stopped polling
        // cooldowns in v5.0.90 to save cellular/CPU, so the values
        // were going stale anyway. Drug/Medical/Booster bars and their
        // projection math removed from the row render. Just energy +
        // name now. The CSS grid was also re-tuned from 3 cols to 2.
        const html = entries.map(([pid, info]) => {
            const bars = info.bars || {};
            const eRaw = bars.energy || { current: 0, maximum: 0 };
            const ageSec = info.updatedAt ? Math.max(0, (Date.now() - info.updatedAt) / 1000) : 0;
            const e = projectEnergy(eRaw, ageSec);
            const ePct = e.pct;
            const fmtAgo = (ts) => {
                if (!ts) return '—';
                const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
                if (sec < 60) return `${sec}s`;
                const totalMin = Math.floor(sec / 60);
                if (totalMin < 60) return `${totalMin}m`;
                const totalHr = Math.floor(totalMin / 60);
                const remMin = totalMin % 60;
                if (totalHr < 24) return remMin > 0 ? `${totalHr}h${remMin}m` : `${totalHr}h`;
                const days = Math.floor(totalHr / 24);
                const remHr = totalHr % 24;
                return remHr > 0 ? `${days}d${remHr}h` : `${days}d`;
            };
            const name = escapeHtml(info.name || `#${pid}`);
            // v5.1.7: show the energy NUMBER inline next to the bar.
            // Especially important when current > maximum (xanax-boosted
            // members) where the bar visually maxes at 100% but the
            // actual value is e.g. 175/150 or 400/150.
            const overMax = e.current > e.maximum;
            const numText = overMax
                ? `<b>${e.current}</b>/${e.maximum}`  // bold the over-max number to call attention
                : `${e.current}/${e.maximum}`;
            const energyTip = `Energy: ${e.current}/${e.maximum} (${ePct}%)`;
            return `
                <div class="fo-bars-row">
                    <div class="fo-bar-cell is-energy" title="${energyTip}" data-fo-tip="${energyTip}">
                        <span class="fo-bar-label">E</span>
                        <div class="fo-bar-track"><div class="fo-bar-fill" style="width:${Math.min(100, ePct)}%"></div></div>
                        <span class="fo-bar-num"${overMax ? ' style="color:#74c69d;"' : ''}>${numText}</span>
                    </div>
                    <div class="fo-bars-name" title="${name} — last update ${fmtAgo(info.updatedAt)}" data-fo-tip="${name} — ${fmtAgo(info.updatedAt)}">${name} <span class="fo-bars-updated">${fmtAgo(info.updatedAt)}</span></div>
                </div>
            `;
        }).join('');
        list.innerHTML = html;
    }

    /**
     * Tap-to-show tooltip system. Native `title` attributes don't fire on
     * mobile/PDA (no hover), so we overlay a simple custom tooltip that
     * pops up when you tap any element with `data-fo-tip`. Hover on
     * desktop still uses the native title. Tooltip auto-dismisses on the
     * next tap-anywhere or scroll.
     */
    function setupFoTooltips() {
        if (window.__foTooltipBound) return;
        window.__foTooltipBound = true;
        let tipEl = null;
        let tipFor = null;
        function hideTip() {
            if (tipEl) { tipEl.remove(); tipEl = null; tipFor = null; }
        }
        function showTip(el) {
            const text = el.getAttribute('data-fo-tip');
            if (!text) return;
            if (tipFor === el) { hideTip(); return; } // tap same pill again → dismiss
            hideTip();
            tipEl = document.createElement('div');
            tipEl.className = 'fo-tooltip';
            tipEl.textContent = text;
            document.body.appendChild(tipEl);
            tipFor = el;
            const rect = el.getBoundingClientRect();
            const tw = tipEl.offsetWidth;
            const th = tipEl.offsetHeight;
            let left = rect.left + rect.width / 2 - tw / 2;
            let top = rect.top - th - 6;
            if (top < 4) top = rect.bottom + 6; // flip below if no room above
            left = Math.max(4, Math.min(left, window.innerWidth - tw - 4));
            tipEl.style.left = `${left + window.scrollX}px`;
            tipEl.style.top = `${top + window.scrollY}px`;
        }
        document.addEventListener('click', (e) => {
            const trigger = e.target.closest && e.target.closest('[data-fo-tip]');
            if (trigger) {
                e.stopPropagation();
                showTip(trigger);
            } else {
                hideTip();
            }
        }, true);
        document.addEventListener('scroll', hideTip, true);
        window.addEventListener('resize', hideTip);
    }

    /** Wire the cooldowns panel header to toggle collapse/expand. */
    function setupFactionBarsToggle() {
        // Delegate at document level with capture — survives any DOM
        // re-renders (Torn's React occasionally replaces overlay children),
        // and fires before page-level handlers that might stopPropagation.
        if (window.__foBarsToggleBound) return;
        window.__foBarsToggleBound = true;
        document.addEventListener('click', (e) => {
            const header = e.target.closest && e.target.closest('#fo-bars-toggle');
            if (!header) return;
            const list = document.getElementById('fo-bars-list');
            const section = document.getElementById('fo-bars-section');
            if (!list || !section) return;
            const open = list.style.display !== 'none';
            list.style.display = open ? 'none' : 'block';
            section.classList.toggle('is-open', !open);
        }, true);

        // Tick projected cooldowns forward every 60s so bars visibly decay
        // even when no new member_bars broadcasts arrive (e.g. whole faction
        // offline). Cheap: one DOM write per tick, skipped when collapsed.
        if (!window.__foBarsTickInterval) {
            window.__foBarsTickInterval = setInterval(() => {
                const list = document.getElementById('fo-bars-list');
                if (!list || list.style.display === 'none') return;
                if (!Object.keys(state.memberBars || {}).length) return;
                renderFactionBars();
            }, 60000);
        }

        // Tick the Next Up hospital timers every second. Previously the
        // queue text only repainted on new status_update events, so the
        // visible countdown could lag up to a full poll cycle (15s)
        // behind reality and then jump. statusRemainingSec already reads
        // from a wall-clock anchor (s.releaseAt = nowSec + s.until at
        // arrival time), so a 1s tick gives an exact, smooth count.
        // Cheap: when target IDs haven't changed it's just N timer-text
        // updates (top 5), no DOM rebuild.
        // The 1s next-up tick was removed 2026-09-04. updateNextUp still runs
        // whenever call or status data arrives, so the list stays correct --
        // its countdowns just step on data rather than sweeping every second.
    }

    // =========================================================================
    // SECTION 12: DOM MANIPULATION — WAR PAGE ENHANCEMENT
    // =========================================================================

    // Track which rows we've already enhanced to avoid double-injection.

    /**
     * Multiple possible selectors for member rows across different Torn pages.
     * Torn frequently changes its HTML, so we try several patterns.
     */
    const MEMBER_LIST_SELECTORS = [
        // Traced live from an Attack link up to its container:
        //
        //   a.t-blue  ->  div.attack___  ->  li.enemy  ->  ul.members-list
        //     ->  div.members-cont  ->  div…enemy-faction  ->  div.faction-war
        //
        // The ENEMY list specifically: there are TWO ul.members-list on the
        // page, one per faction, so a bare `.members-list li` matches 171 rows
        // -- both rosters plus their headers -- and marks people on our side.
        // members-list, enemy and enemy-faction are stable classes; the
        // ___hash suffixes rotate per build and are not matched on.
        '.enemy-faction ul.members-list li.enemy',
        'ul.members-list li.enemy',
        // Fallbacks, in case Torn drops the .enemy marker. Broader, and the
        // per-row own-faction guard is what keeps them honest.
        //
        // `ul.f-war-list > li[class*="warListItem"]` looks right and is NOT:
        // it matches the war HEADER rows ("Chain active", the scores), two of
        // them, with no links in it. Put first it wins the race in
        // findMemberRows() and the real list is never reached, which is
        // exactly the bug this replaced.
        //
        // `.faction-war .members-list li` below needs a .faction-war ancestor
        // that this page does not have, which is why the original list found
        // nothing here at all.
        '.members-list li',
        '.members-list .table-body > li',
        '.faction-war .members-list li',
        '.ranked-war-list li',
        '.enemy-faction .member-list li',
        '.f-war-list .table-body > li',
        '.war-list li.table-row',
        '.faction-war-list .table-body li',
        '#faction-war-list li',
        '.war-main .members-cont li',
    ];

    const MEMBER_CONTAINER_SELECTORS = [
        '.members-list',
        '.faction-war',
        '.ranked-war-list',
        '.enemy-faction .member-list',
        '.f-war-list',
        '.war-list',
        '.faction-war-list',
        '#faction-war-list',
        '.war-main .members-cont',
        '#war-root',
        '#factions-page-wrap',
        '#mainContainer',
    ];

    /** Try to find member rows using multiple selectors. */
    function findMemberRows() {
        for (const sel of MEMBER_LIST_SELECTORS) {
            const rows = document.querySelectorAll(sel);
            if (rows.length > 0) {
                log(`Found ${rows.length} member rows with selector: ${sel}`);
                return rows;
            }
        }
        return [];
    }

    /** Find the container element to observe for mutations. */
    function findMemberContainer() {
        for (const sel of MEMBER_CONTAINER_SELECTORS) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return document.getElementById('mainContainer') || document.body;
    }

    /**
     * The member container, or nothing — never the page.
     *
     * findMemberContainer falls back to #mainContainer and then to <body>,
     * which is the right answer for "where do I look for rows" and the wrong
     * one for "what should I watch for changes": a subtree observer on <body>
     * fires for every write any script on the page makes, and this page has
     * several writing constantly.
     */
    function findMemberContainerStrict() {
        for (const sel of MEMBER_CONTAINER_SELECTORS) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    /** Get the player name from a row. */
    function getPlayerNameFromRow(row) {
        // Try common selectors for player names
        const nameSelectors = [
            '.user.name',
            '.member-name',
            '.honorWrap a',
            'a[href*="profiles.php"]',
            '.name-wrap a',
            '.userName',
        ];

        for (const sel of nameSelectors) {
            const el = row.querySelector(sel);
            if (el && el.textContent.trim()) {
                return el.textContent.trim();
            }
        }
        return 'Unknown';
    }

    /**
     * Enhance a single member row with FactionOps columns.
     * Injects Attack, Call, and Status cells into the row.
     */
    /**
     * Mark war-page rows whose target somebody has called.
     *
     * Tints the row and puts a small tag beside the NAME rather than covering
     * the right edge, which is where Torn's Attack link sits on a narrow
     * screen. (The old in-page row enhancer put a container there; it was
     * unreachable and was deleted in 5.2.45.)
     *
     * Runs whether or not the overlay has been opened -- the whole point is
     * that somebody who never presses "Activate FactionOps" can still see that
     * a target is taken.
     */
    /**
     * The player id for one war row.
     *
     * NOT getPlayerIdFromRow(): that walks every a[href] in document order and
     * returns the first id it can parse, and the FIRST link in one of these
     * rows is the faction:
     *
     *   div.factionWrap___ -> a  /factions.php?step=profile&ID=40692
     *   div.honorWrap___   -> a  /profiles.php?XID=3703493        <- the player
     *   div.attack         -> a  /page.php?sid=attack&user2ID=3703493
     *
     * So it returned 40692 for all 78 rows, state.calls[40692] was undefined
     * every time, and nothing marked -- with rows:78 and withId:78 in the
     * diagnostic, which read as healthy. Only sampleIds being 40692 repeated
     * gave it away.
     *
     * Matched on the id parameters that mean a PLAYER, never on link order.
     */
    function uidFromWarRow(row) {
        const a = row.querySelector('a[href*="user2ID="], a[href*="XID="]');
        if (!a) return null;
        const m = String(a.getAttribute('href') || '').match(/(?:user2ID|XID)=(\d+)/);
        return m ? m[1] : null;
    }

    /**
     * The stats range bar, above the enemy list on Torn's own war page.
     *
     * Re-injected on the same 5s pass as the call buttons, because React
     * rebuilds this list and takes our nodes with it. Idempotent: it returns
     * early once its own id is present, so a normal tick costs one lookup.
     *
     * Values live in the same GM keys the overlay's filter used, so a range
     * set before 5.2.23 is still there and still applies.
     */
    function ensureWarFilterBar() {
        if (document.getElementById('fo-wp-filter')) return;
        const list = document.querySelector('.enemy-faction ul.members-list')
            || document.querySelector('ul.members-list');
        if (!list || !list.parentElement) return;

        const bar = document.createElement('div');
        bar.id = 'fo-wp-filter';
        bar.className = 'fo-wp-filter';
        bar.innerHTML =
            '<span class="fo-wp-filter-label">Stats</span>' +
            '<input class="fo-wp-filter-in" id="fo-wp-min" placeholder="min" ' +
            'spellcheck="false" autocomplete="off" autocapitalize="off" inputmode="text">' +
            '<span class="fo-wp-filter-dash">\u2013</span>' +
            '<input class="fo-wp-filter-in" id="fo-wp-max" placeholder="max" ' +
            'spellcheck="false" autocomplete="off" autocapitalize="off" inputmode="text">' +
            '<button type="button" class="fo-wp-filter-clear" id="fo-wp-clear" title="Clear">\u2715</button>' +
            '<label class="fo-wp-filter-chk"><input type="checkbox" id="fo-wp-hide-online">Hide online</label>' +
            '<label class="fo-wp-filter-chk" title="Last action 5+ min ago -- Torn\'s idle and offline both">' +
            '<input type="checkbox" id="fo-wp-hide-offline">Hide offline</label>' +
            '<label class="fo-wp-filter-chk" title="Abroad, flying, or in a foreign hospital -- nobody you can hit from Torn">' +
            '<input type="checkbox" id="fo-wp-hide-abroad">Hide abroad</label>' +
            '<span class="fo-wp-filter-count" id="fo-wp-count"></span>' +
            // Settings without opening the overlay. The gear used to live only
            // in the overlay header, so reaching it from the war page meant
            // activating the whole thing -- which is the one surface we keep
            // deliberately unbuilt here.
            '<button type="button" class="fo-wp-filter-gear" id="fo-wp-settings" ' +
            'title="FactionOps settings" aria-label="FactionOps settings">\u2699</button>';
        list.parentElement.insertBefore(bar, list);

        const minEl = bar.querySelector('#fo-wp-min');
        const maxEl = bar.querySelector('#fo-wp-max');
        minEl.value = fmtStatsForInput(_statsFilterMin);
        maxEl.value = fmtStatsForInput(_statsFilterMax);

        const apply = function () {
            _statsFilterMin = parseStatsInput(minEl.value);
            _statsFilterMax = parseStatsInput(maxEl.value);
            try {
                GM_setValue('factionops_stats_filter_min', _statsFilterMin || 0);
                GM_setValue('factionops_stats_filter_max', _statsFilterMax || 0);
            } catch (_) { }
            // Repaint now rather than waiting out the 5s tick.
            try { markCalledRows(); } catch (_) { }
        };
        // 'change' alone leaves a phone user staring at an unchanged list until
        // the field loses focus; 'input' is what makes typing feel connected.
        minEl.addEventListener('input', apply);
        maxEl.addEventListener('input', apply);
        bar.querySelector('#fo-wp-clear').addEventListener('click', function () {
            minEl.value = ''; maxEl.value = ''; apply();
        });
        const onEl = bar.querySelector('#fo-wp-hide-online');
        const offEl = bar.querySelector('#fo-wp-hide-offline');
        onEl.checked = _hideOnline;
        offEl.checked = _hideOffline;
        onEl.addEventListener('change', function () {
            _hideOnline = onEl.checked;
            try { GM_setValue('factionops_hide_online', _hideOnline); } catch (_) { }
            try { markCalledRows(); } catch (_) { }
        });
        offEl.addEventListener('change', function () {
            _hideOffline = offEl.checked;
            try { GM_setValue('factionops_hide_offline', _hideOffline); } catch (_) { }
            try { markCalledRows(); } catch (_) { }
        });
        const abEl = bar.querySelector('#fo-wp-hide-abroad');
        abEl.checked = _hideAbroad;
        abEl.addEventListener('change', function () {
            _hideAbroad = abEl.checked;
            try { GM_setValue('factionops_hide_abroad', _hideAbroad); } catch (_) { }
            try { markCalledRows(); } catch (_) { }
        });

        bar.querySelector('#fo-wp-settings').addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            // openSettings appends its own modal to document.body and reads
            // nothing off the overlay, so it works with the overlay unbuilt.
            try { openWarSettings(); } catch (err) { log('[settings] ' + (err && err.message)); }
        });

        // Torn's list is clickable underneath; typing must not reach it.
        bar.addEventListener('click', function (e) { e.stopPropagation(); });
    }

    /**
     * The stat estimate, as a chip in the member cell.
     *
     * The points cell is taken by the Call control and the attack cell is a
     * link that must stay clickable, so this goes in the member cell -- the
     * widest one, and where a person already looks to size a target up.
     *
     * Costs nothing: fetchBspPrediction is a synchronous read of Battle Stats
     * Predictor's own localStorage, and the FFScouter half is already being
     * fetched by applyServerData.
     */

    /**
    * War-page settings: a popover under the gear, deliberately NOT the
    * overlay's centred modal.
    *
    * Different shape because it holds different things. The overlay panel is
    * configuration -- keys, roles, faction setup. This is what is on screen
    * right now, and every one of these three shipped between 5.2.24 and
    * 5.2.29 with no control at all.
    *
    * No FFScouter or BSP key here on purpose: those are separate userscripts
    * that render on this page themselves and hold their own keys. Asking for
    * them twice invites somebody to paste a key into the wrong script.
    */
    function closeWarSettings() {
        var el = document.getElementById('fo-wp-panel');
        if (el) el.remove();
        document.removeEventListener('click', warSettingsOutside, true);
    }

    function warSettingsOutside(e) {
        var panel = document.getElementById('fo-wp-panel');
        if (!panel) return;
        if (panel.contains(e.target)) return;
        if (e.target.closest && e.target.closest('#fo-wp-settings')) return;
        closeWarSettings();
    }

    function subLine() {
        var exp = state.subscriptionExpiresAt;
        if (exp === 'permanent') return { txt: 'Permanent', cls: 'ok' };
        if (typeof exp === 'number' && exp > 0) {
            var d = Math.floor((exp - Date.now()) / 86400000);
            if (d <= 0) return { txt: 'Expired', cls: 'bad' };
            return { txt: d + ' day' + (d === 1 ? '' : 's') + ' left', cls: d < 7 ? 'warn' : 'ok' };
        }
        return { txt: 'Unknown', cls: 'muted' };
    }

    function openWarSettings() {
        if (document.getElementById('fo-wp-panel')) { closeWarSettings(); return; }
        var gear = document.getElementById('fo-wp-settings');
        var sub = subLine();
        var conn = state.connected ? ['Connected', 'ok']
            : state.connecting ? ['Connecting\u2026', 'warn'] : ['Disconnected', 'bad'];

        var el = document.createElement('div');
        el.id = 'fo-wp-panel';
        el.className = 'fo-wp-panel';
        el.innerHTML =
            '<div class="fo-wp-prow fo-wp-pstat">' +
            '<span class="fo-wp-dot ' + conn[1] + '"></span><b>' + conn[0] + '</b>' +
            '<span class="fo-wp-sub ' + sub.cls + '">' + sub.txt + '</span>' +
            '</div>' +
            '<label class="fo-wp-plabel">Torn API key</label>' +
            '<div class="fo-wp-prow">' +
            // text, never password: a password field makes the browser
            // offer to save and autofill Torn API keys.
            '<input type="text" class="fo-wp-pin" id="fo-wp-key" spellcheck="false" ' +
            'autocomplete="off" autocapitalize="off" autocorrect="off" ' +
            'placeholder="' + (CONFIG.API_KEY ? '\u2022\u2022\u2022\u2022 ' + CONFIG.API_KEY.slice(-4) : 'paste your key') + '">' +
            '<button type="button" class="fo-wp-pbtn" id="fo-wp-key-save">Save</button>' +
            '</div>' +
            '<div class="fo-wp-pnote" id="fo-wp-key-note"></div>' +
            '<div class="fo-wp-psep">On this page</div>' +
            row('fo-wp-t-chat', 'Post calls to chat', CONFIG.CALL_CHAT === '1') +
            '<div class="fo-wp-psep">Alerts</div>' +
            row('fo-wp-t-chain', 'Chain alert', CONFIG.CHAIN_ALERT) +
            row('fo-wp-t-pda', 'PDA notifications', CONFIG.PDA_NOTIFICATIONS) +
            '<button type="button" class="fo-wp-pfull" id="fo-wp-full">Full settings\u2026</button>';

        function row(id, label, on) {
            return '<label class="fo-wp-prow fo-wp-ptog"><span>' + label + '</span>' +
                '<input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '></label>';
        }

        document.body.appendChild(el);
        // Anchored under the gear, clamped so it cannot hang off a phone.
        if (gear) {
            var r = gear.getBoundingClientRect();
            var w = 244;
            el.style.top = Math.round(r.bottom + window.scrollY + 6) + 'px';
            el.style.left = Math.round(Math.max(8, Math.min(
                r.right + window.scrollX - w, window.innerWidth + window.scrollX - w - 8))) + 'px';
        }

        var bind = function (id, key, after) {
            var c = el.querySelector('#' + id);
            if (!c) return;
            c.addEventListener('change', function () {
                setConfig(key, c.checked);
                if (after) { try { after(); } catch (_) { } }
            });
        };
        // NOT via bind(): CALL_CHAT is stored as the strings '1' and '0', never a
        // boolean. PDA's GM storage hands values back as strings and !!"false"
        // is truthy, so a boolean here would leave this permanently on for
        // anyone who switched it off on a phone. Same reason the overlay's own
        // handler writes it this way.
        var chatEl = el.querySelector('#fo-wp-t-chat');
        if (chatEl) chatEl.addEventListener('change', function () {
            setConfig('CALL_CHAT', chatEl.checked ? '1' : '0');
        });
        bind('fo-wp-t-chain', 'CHAIN_ALERT');
        bind('fo-wp-t-pda', 'PDA_NOTIFICATIONS');

        el.querySelector('#fo-wp-key-save').addEventListener('click', function () {
            var v = el.querySelector('#fo-wp-key').value.trim();
            var note = el.querySelector('#fo-wp-key-note');
            if (!v) { note.textContent = 'Nothing to save.'; return; }
            setConfig('API_KEY', v);
            note.textContent = 'Saved \u2014 reconnecting\u2026';
            try { authenticate(); } catch (_) { }
        });
        el.querySelector('#fo-wp-full').addEventListener('click', function () {
            closeWarSettings();
            try { openSettings(); } catch (_) { }
        });
        el.addEventListener('click', function (e) { e.stopPropagation(); });
        // capture phase, so a tap outside closes even though Torn's own
        // handlers stop propagation on much of this page.
        setTimeout(function () {
            document.addEventListener('click', warSettingsOutside, true);
        }, 0);
    }

    function markCalledRows() {
        // Everything below is WAR-VIEW furniture, and findMemberRows falls back
        // to a bare `.members-list li` -- which the faction page's own roster
        // matches. The sort that once flexed that list is gone (5.3.0), but the
        // guard stays: the call buttons, the tint and the filter have no
        // business on a roster page either.
        //
        // li.enemy is the structural marker for an enemy war list. Requiring it
        // means that if Torn ever drops the class the feature degrades to OFF
        // rather than deranging a page it was never meant to touch.
        if (!document.querySelector('li.enemy')) {
            var bar = document.getElementById('fo-wp-filter');
            if (bar) bar.remove();
            return;
        }
        let rows;
        try { rows = findMemberRows(); } catch (_) { return; }
        try { ensureWarFilterBar(); } catch (_) { }
        let hidden = 0, total = 0;
        // Sorted at the end of this 5s pass, never on the 1s tick: a row that
        // jumped the moment its timer expired would move under a thumb that is
        // already coming down, and that is how you attack the wrong person.
        let seen = 0;
        for (const row of rows || []) {
            let targetId;
            try { targetId = uidFromWarRow(row); } catch (_) { continue; }
            if (!targetId) continue;
            // The range filter. passesStatsFilter shows a target whose stats
            // cannot be estimated -- on this page a hidden row is one nobody
            // attacks, so a missing FFScouter reading must never quietly
            // remove somebody from the war.
            total++;
            let show = true;
            try { show = passesStatsFilter(targetId) && passesActivityFilter(targetId); } catch (_) { }
            row.style.display = show ? '' : 'none';
            if (!show) { hidden++; continue; }   // no point dressing a hidden row
            const call = (state.calls || {})[targetId];
            try { ensureCallButton(row, targetId, call); } catch (_) { }
            if (!call) {
                row.classList.remove('fo-called-row', 'fo-called-mine');
                continue;
            }
            const mine = call.calledBy && String(call.calledBy.id) === String(state.myPlayerId);
            row.classList.add('fo-called-row');
            row.classList.toggle('fo-called-mine', !!mine);
            // The tint and stripe say "taken"; ensureCallButton above says by
            // whom. Nothing else is drawn on the row itself.
            // carries CALL / DROP / who has it, so a second label would sit
            // underneath the overlay where it cannot be read.

        }
        // Say how much is being hidden. A filter left on from a previous war
        // would otherwise look like a short enemy faction.
        const countEl = document.getElementById('fo-wp-count');
        if (countEl) {
            countEl.textContent = hidden ? ('hiding ' + hidden + ' of ' + total) : '';
            countEl.classList.toggle('is-on', hidden > 0);
        }
    }

    /**
     * A Call control in the Score column.
     *
     * div.points___ holds one short number and is the only cell on the row
     * with room: the member cell is full of the FFS banner, and div.attack is
     * a control that must not be covered. The score itself is left in place --
     * the button goes underneath it.
     */
    function ensureCallButton(row, targetId, call) {
        const cell = row.querySelector('[class*="points"]');
        if (!cell) return;
        cell.classList.add('fo-call-host');
        let btn = cell.querySelector('.fo-wp-call');
        const mine = call && call.calledBy && String(call.calledBy.id) === String(state.myPlayerId);
        // Taken shows WHO rather than the word TAKEN: the name is the useful
        // half, and this is now the only place it appears.
        const who = (call && call.calledBy && call.calledBy.name) || 'TAKEN';
        const label = !call ? 'CALL'
            : (mine ? 'DROP' : (call.isDeal ? '\uD83D\uDD12 ' : '') + who);
        if (!btn) {
            btn = document.createElement('div');
            btn.className = 'fo-wp-call';
            const onTap = function (e) {
                e.stopPropagation();
                e.preventDefault();
                // Only ever act on our own call, never steal somebody else's.
                const cur = (state.calls || {})[targetId];
                const isMine = cur && cur.calledBy && String(cur.calledBy.id) === String(state.myPlayerId);
                try {
                    if (!cur) emitCallTarget(targetId);
                    else if (isMine) emitUncallTarget(targetId);
                } catch (err) {
                    // Local only. This used to POST to the debug endpoint while
                    // the button was being proven; an empty catch here would
                    // swallow a real failure, so it keeps the message.
                    log('[calls] tap failed: ' + (err && err.message));
                }
            };
            // touchend as well as click, because on a phone a tap inside a
            // React row can be swallowed before it ever becomes a click.
            //
            // But touchend on its own knows nothing about whether the finger
            // moved: scrolling the page with a finger that happened to land
            // on this button still ends with a touchend here, and that was
            // firing the call. So track where the touch started and only act
            // if it stayed put -- a scroll cancels itself on the first move.
            const TAP_SLOP_PX = 12;    // finger wander that still reads as a tap
            const TAP_MAX_MS = 700;    // longer is a press or a drag, not a tap
            // Hold for a deal call. Below TAP_MAX_MS on purpose: the hold has
            // to win before the tap gate would accept the same gesture, or a
            // 650ms press would place a deal AND then a normal call.
            const HOLD_MS = 600;
            let touchStart = null;
            let lastTouchFire = -Infinity;
            let holdTimer = null;
            let holdFired = false;

            const strayed = function (pt, s) {
                return Math.abs(pt.clientX - s.x) > TAP_SLOP_PX ||
                    Math.abs(pt.clientY - s.y) > TAP_SLOP_PX;
            };

            const cancelHold = function () {
                if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
            };

            /**
             * A deal call: ours for fifteen minutes, and it shows a lock to
             * everybody else. Only offered on a target nobody has -- holding
             * somebody else's call must not steal it, and holding your own
             * would be an odd way to ask for a drop.
             */
            const startHold = function () {
                cancelHold();
                holdFired = false;
                const cur = (state.calls || {})[targetId];
                if (cur) return;                       // taken: nothing to deal
                holdTimer = setTimeout(function () {
                    holdTimer = null;
                    holdFired = true;
                    touchStart = null;                 // the tap gate must not also fire
                    try {
                        emitCallTarget(targetId, true);
                        showToast('\uD83D\uDD12 Deal call \u2014 yours for 2 hours', 'info');
                    } catch (err) {
                        log('[calls] deal failed: ' + (err && err.message));
                    }
                }, HOLD_MS);
            };

            btn.addEventListener('touchstart', function (e) {
                // Two fingers is a pinch or a stray palm, never a call.
                if (e.touches && e.touches.length > 1) { touchStart = null; cancelHold(); return; }
                const t = e.touches && e.touches[0];
                touchStart = t ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
                if (touchStart) startHold();
            }, { passive: true });

            btn.addEventListener('touchmove', function (e) {
                if (!touchStart) return;
                const t = e.touches && e.touches[0];
                // A scroll cancels the hold too, or dragging the page past a
                // CALL button would place a deal on whoever it started over.
                if (t && strayed(t, touchStart)) { touchStart = null; cancelHold(); }
            }, { passive: true });

            btn.addEventListener('touchcancel', function () {
                touchStart = null;
                cancelHold();
            }, { passive: true });

            btn.addEventListener('touchend', function (e) {
                const s = touchStart;
                touchStart = null;
                cancelHold();
                if (holdFired) { holdFired = false; lastTouchFire = Date.now(); return; }
                if (!s) return;                                 // moved, or multi-touch
                if (Date.now() - s.at > TAP_MAX_MS) return;     // a press, not a tap
                const t = e.changedTouches && e.changedTouches[0];
                if (t && strayed(t, s)) return;                 // ended somewhere else
                lastTouchFire = Date.now();
                onTap(e);
            }, { passive: false });

            btn.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                startHold();
            });
            btn.addEventListener('mouseup', cancelHold);
            btn.addEventListener('mouseleave', cancelHold);

            // Right-click is the mouse's version of a hold, and matches what
            // the overlay's own call button has always done.
            btn.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                e.stopPropagation();
                cancelHold();
                if ((state.calls || {})[targetId]) return;
                try {
                    emitCallTarget(targetId, true);
                    showToast('\uD83D\uDD12 Deal call \u2014 yours for 2 hours', 'info');
                } catch (err) { log('[calls] deal failed: ' + (err && err.message)); }
            });

            btn.addEventListener('click', function (e) {
                // The synthetic click that trails a touch we already acted on.
                // Without this the button calls and instantly drops again.
                if (Date.now() - lastTouchFire < 900) {
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                // A completed hold already did the work; the mouseup that ends
                // it still arrives here as a click.
                if (holdFired) { holdFired = false; e.preventDefault(); return; }
                onTap(e);
            });
            cell.appendChild(btn);
        }
        if (btn.textContent !== label) btn.textContent = label;
        btn.classList.toggle('fo-wp-call-drop', !!mine);
        btn.classList.toggle('fo-wp-call-taken', !!call && !mine);
        btn.title = !call ? 'Call this target'
            : (mine ? 'Drop your call' : 'Called by ' +
                ((call.calledBy && call.calledBy.name) || 'someone'));
    }

    // ---- Cell renderers ----

    function renderCallCell(container, targetId) {
        container.innerHTML = '';
        const callData = state.calls[targetId];

        if (!callData) {
            // Not called — show Call button
            const btn = document.createElement('button');
            btn.className = 'wb-call-btn';
            btn.textContent = 'Call';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                emitCallTarget(targetId);
            });
            container.appendChild(btn);
        } else if (callData.calledBy && String(callData.calledBy.id) === state.myPlayerId) {
            // Called by us
            const btn = document.createElement('span');
            btn.className = 'wb-call-btn wb-called-self';
            btn.textContent = callData.isDeal ? '\uD83D\uDD12 DEAL' : 'CALLED';
            container.appendChild(btn);

            const uncallBtn = document.createElement('button');
            uncallBtn.className = 'wb-uncall-btn';
            uncallBtn.textContent = '\u2715';
            uncallBtn.title = 'Uncall';
            uncallBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                emitUncallTarget(targetId);
            });
            container.appendChild(uncallBtn);
        } else {
            // Called by someone else
            const badge = document.createElement('span');
            badge.className = 'wb-call-btn wb-called-other';
            const nameText = callData.calledBy ? callData.calledBy.name : 'Called';
            badge.textContent = callData.isDeal ? `\uD83D\uDD12 ${nameText}` : nameText;
            badge.title = `${callData.isDeal ? 'Deal call' : 'Called'} by ${callData.calledBy ? callData.calledBy.name : 'unknown'}`;
            container.appendChild(badge);
        }
    }

    function renderStatusCell(container, targetId) {
        container.innerHTML = '';
        const statusData = state.statuses[targetId];

        if (!statusData) {
            // No status data yet — show placeholder
            const badge = document.createElement('span');
            badge.className = 'wb-status-badge wb-status-ok';
            badge.innerHTML = '<span class="wb-activity-dot wb-activity-offline"></span> --';
            container.appendChild(badge);
            return;
        }

        const badge = document.createElement('span');
        let activityClass = 'wb-activity-offline';
        if (statusData.activity === 'online') activityClass = 'wb-activity-online';
        else if (statusData.activity === 'idle') activityClass = 'wb-activity-idle';

        const dot = `<span class="wb-activity-dot ${activityClass}"></span>`;
        const barRemaining = statusRemainingSec(statusData);
        const timerSpan = barRemaining > 0
            ? `<span id="wb-timer-${targetId}">${formatTimer(barRemaining)}</span>`
            : '';

        const normalizedSt = normalizeStatus(statusData.status);
        switch (normalizedSt) {
            case 'ok':
                badge.className = 'wb-status-badge wb-status-ok';
                badge.innerHTML = `${dot} OK`;
                break;
            case 'hospital':
                badge.className = 'wb-status-badge wb-status-hospital';
                badge.innerHTML = `${dot} Hosp: ${timerSpan}`;
                break;
            case 'traveling': {
                badge.className = 'wb-status-badge wb-status-travel';
                const travelTimer = timerSpan || '';
                const estimate = !travelTimer ? estimateTravelReturn(statusData.description) : null;
                const timeStr = travelTimer || (estimate ? `<span style="opacity:0.6">${estimate}</span>` : '');
                badge.innerHTML = `${dot} Travel: ${statusData.description || ''} ${timeStr}`;
                break;
            }
            case 'jail':
                badge.className = 'wb-status-badge wb-status-jail';
                badge.innerHTML = `${dot} Jail: ${timerSpan}`;
                break;
            default:
                badge.className = 'wb-status-badge wb-status-ok';
                badge.innerHTML = `${dot} ${statusData.status || '??'}`;
        }

        container.appendChild(badge);
    }

    /**
     * Render the priority cell for a target.
     * Leaders/co-leaders see a dropdown; others see a read-only badge (or nothing).
     */
    function renderPriorityCell(container, _targetId) {
        if (container) container.innerHTML = '';
        return; // v5.0.14: priority retired
        const prioData = state.priorities[targetId];
        const level = prioData ? prioData.level : null;

        if (isLeader()) {
            // Show a dropdown selector for leaders
            const select = document.createElement('select');
            select.className = 'wb-priority-select';
            select.title = 'Set target priority';

            const options = [
                { value: '', label: '\u2014' },
                { value: 'high', label: '\u{1F534} High' },
                { value: 'medium', label: '\u{1F7E1} Med' },
                { value: 'low', label: '\u{1F535} Low' },
            ];
            for (const opt of options) {
                const el = document.createElement('option');
                el.value = opt.value;
                el.textContent = opt.label;
                if (opt.value === (level || '')) el.selected = true;
                select.appendChild(el);
            }

            select.addEventListener('change', (e) => {
                e.stopPropagation();
                const val = select.value || null;
                emitSetPriority(targetId, val);
            });
            select.addEventListener('click', (e) => e.stopPropagation());

            container.appendChild(select);
        } else if (level) {
            // Non-leaders see a read-only badge
            const badge = document.createElement('span');
            badge.className = `wb-priority-badge wb-priority-${level}`;
            const labels = { high: '\u{1F534} HIGH', medium: '\u{1F7E1} MED', low: '\u{1F535} LOW' };
            badge.textContent = labels[level] || level.toUpperCase();
            badge.title = prioData.setBy ? `Set by ${prioData.setBy.name}` : '';
            container.appendChild(badge);
        }
    }

    /**
     * Render the BSP/FFS estimated-stats cell for a target.
     * Tries BSP prediction (sync localStorage) first, then FFS (async IndexedDB).
     * Shows the formatted number + a tiny "bsp" / "ffs" source label underneath.
     */
    function renderBspCell(container, targetId) {
        container.innerHTML = '';

        const wrapper = document.createElement('span');
        wrapper.className = 'wb-bsp-cell';

        // 1. Try BSP prediction (synchronous)
        const pred = fetchBspPrediction(targetId);
        if (pred && pred.TBS != null) {
            const num = Number(pred.TBS);
            const tier = bspTier(num);

            const val = document.createElement('span');
            val.className = `wb-bsp-value wb-bsp-tier-${tier}`;
            val.textContent = formatBspNumber(num);
            val.title = num.toLocaleString() + ' (BSP prediction)';
            wrapper.appendChild(val);

            const src = document.createElement('span');
            src.className = 'wb-bsp-source';
            src.textContent = 'bsp';
            wrapper.appendChild(src);

            container.appendChild(wrapper);
            return;
        }

        // 2. FFS fallback (async) — show dash while loading
        const val = document.createElement('span');
        val.className = 'wb-bsp-value wb-bsp-tier-unknown';
        val.textContent = '\u2014';
        wrapper.appendChild(val);
        container.appendChild(wrapper);

        getFfScouterEstimate(targetId).then((ffs) => {
            if (!ffs) return;                       // leave dash
            const num = Number(ffs.total);
            if (isNaN(num)) return;

            const tier = bspTier(num);
            val.className = `wb-bsp-value wb-bsp-tier-${tier}`;
            val.textContent = ffs.human || formatBspNumber(num);
            val.title = num.toLocaleString() + ' (FF Scouter)';

            const src = document.createElement('span');
            src.className = 'wb-bsp-source';
            src.textContent = 'ffs';
            wrapper.appendChild(src);
        });
    }

    /**
     * Render a small badge showing how many faction members are viewing
     * this target's attack page. Shows nothing if 0 viewers.
     */
    function renderViewersBadge(container, targetId) {
        container.innerHTML = '';
        const viewers = state.viewers[targetId];
        if (!viewers || viewers.length === 0) return;

        const badge = document.createElement('span');
        badge.className = 'wb-viewers-badge' + (viewers.length >= 2 ? ' wb-viewers-multi' : '');
        const names = viewers.map(v => v.name).join(', ');
        badge.textContent = `\uD83D\uDC41 ${viewers.length}`;
        badge.title = `Attacking: ${names}`;
        container.appendChild(badge);
    }

    /** Apply/remove row highlight classes based on call state. */
    function applyRowHighlights(row, targetId) {
        const isCalled = !!state.calls[targetId];
        row.classList.toggle('wb-row-called', isCalled);
    }

    let warEndedBannerShown = false;

    /** Re-render all enhanced rows (after bulk state update). */
    // v5.0.87: debounce refreshAllRows. SSE/socket war_update messages
    // can arrive in bursts (status update + call update + bars update
    // in the same tick) and each previously triggered a full overlay
    // render. Now state merges still happen immediately on every
    // message (correctness), but the UI refresh coalesces to one call
    // per debounce window. PDA gets a longer window since it's CPU-
    // constrained.
    const REFRESH_DEBOUNCE_MS = IS_PDA ? 500 : 200;
    let _refreshDebounceTimer = null;
    // visibilitychange catch-up — only meaningful for desktop where
    // the hidden-skip actually fires. PDA never skips so no catch-up
    // needed there either.
    if (!IS_PDA && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                if (_refreshDebounceTimer) {
                    clearTimeout(_refreshDebounceTimer);
                    _refreshDebounceTimer = null;
                }
            }
        });
    }

    // =========================================================================
    // SECTION 12B: FULL OVERLAY — WAR PAGE REPLACEMENT
    // =========================================================================

    /** Show an "Activate FactionOps" button on any faction/war page. */
    function showActivateButton() {
        if (document.getElementById('fo-activate-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'fo-activate-btn';
        btn.innerHTML = '<span class="fo-activate-icon">&#x2694;</span> Activate FactionOps';
        btn.addEventListener('click', () => {
            btn.remove();
            initWarOverlay();
        });

        // Fixed-position banner — append to body to avoid Torn layout interference
        document.body.appendChild(btn);
    }

    // ── Move / restore Torn's native chain bar ──
    let tornChainOriginalParent = null; // remember where #barChain came from
    let tornChainOriginalNext = null;   // sibling reference for restore

    function moveTornChainBar(retryCount) {
        retryCount = retryCount || 0;
        const container = document.getElementById('fo-torn-chain');
        if (!container) return;

        // Try multiple selectors for Torn's chain bar
        // Desktop: a#barChain  |  PDA may use different structure
        const chainBar = document.getElementById('barChain')
            || document.querySelector('a#barChain')
            || document.querySelector('[class*="chain-bar"]')
            || document.querySelector('[class*="chainBar"]');

        if (chainBar) {
            // Remember original position so we can put it back on cleanup
            tornChainOriginalParent = chainBar.parentNode;
            tornChainOriginalNext = chainBar.nextSibling;
            // Move (not clone) — Torn's JS keeps updating it in place
            container.appendChild(chainBar);
            container.style.display = '';
            const _fbHide = document.getElementById('fo-chain-fallback');
            if (_fbHide) _fbHide.style.display = 'none';
            log('Moved Torn chain bar into overlay header');

            // Cache reference before Torn's JS can lose the ID
            chainBarRef = chainBar;

            startDirectChainPoll();

            // Give PDA's DOM a tick to settle after the move, then start observer
            // Pass the element directly — getElementById may fail after move in PDA
            setTimeout(() => {
                if (startChainDOMObserver(chainBar)) {
                    usingChainDOM = true;
                    log('Chain: DOM for count, API poll for timeout');
                } else {
                    // Observer couldn't start even though bar was found — fall back
                    log('DOM observer failed after move — falling back to API poll');
                    startDirectChainPoll();
                }
            }, 50);
        } else if (retryCount < 10) {
            // Chain bar may not have loaded yet — retry with increasing delay
            const delay = 500 * (retryCount + 1);
            log(`Torn chain bar not found yet, retry ${retryCount + 1}/10 in ${delay}ms`);
            setTimeout(() => moveTornChainBar(retryCount + 1), delay);
        } else {
            // All retries exhausted — show fallback custom chain display
            log('Torn chain bar not found after 10 retries — falling back to API poll');
            container.style.display = 'none';
            const fallback = document.getElementById('fo-chain-fallback');
            if (fallback) fallback.style.display = '';
            // Fall back to API-based chain polling
            startDirectChainPoll();

            // Keep watching — bar might appear later (PDA slow load)
            watchForLateChainBar(container);
        }
    }

    /** Watch for #barChain appearing late (after retries exhausted) */
    let lateChainWatcher = null;
    function watchForLateChainBar(container) {
        if (lateChainWatcher) return;
        lateChainWatcher = new MutationObserver(() => {
            const chainBar = document.getElementById('barChain');
            if (!chainBar || chainBar.closest('#fo-torn-chain')) return; // already moved

            // Found it late — move it and switch to DOM reader
            log('Late-detected #barChain — moving into overlay and switching to DOM reader');
            lateChainWatcher.disconnect();
            lateChainWatcher = null;

            tornChainOriginalParent = chainBar.parentNode;
            tornChainOriginalNext = chainBar.nextSibling;
            container.appendChild(chainBar);
            chainBarRef = chainBar;
            container.style.display = '';
            const fallback = document.getElementById('fo-chain-fallback');
            if (fallback) fallback.style.display = 'none';

            startDirectChainPoll();
            setTimeout(() => {
                if (startChainDOMObserver(chainBar)) {
                    usingChainDOM = true;
                    log('Switched to DOM chain reader after late detection');
                } else {
                    startDirectChainPoll();
                }
            }, 50);
        });
        lateChainWatcher.observe(document.body, { childList: true, subtree: true });
        // Auto-stop after 60s to avoid indefinite watching
        setTimeout(() => {
            if (lateChainWatcher) {
                lateChainWatcher.disconnect();
                lateChainWatcher = null;
            }
        }, 60000);
    }

    function restoreTornChainBar() {
        if (!tornChainOriginalParent) return;
        const chainBar = document.getElementById('barChain');
        if (chainBar && tornChainOriginalParent) {
            // Put it back where it was
            if (tornChainOriginalNext) {
                tornChainOriginalParent.insertBefore(chainBar, tornChainOriginalNext);
            } else {
                tornChainOriginalParent.appendChild(chainBar);
            }
            log('Restored Torn #barChain to original location');
        }
        tornChainOriginalParent = null;
        tornChainOriginalNext = null;
    }

    /**
     * Tear down the full-page overlay and bring Torn's native page back,
     * then re-show the "Activate FactionOps" pill so the user can re-open
     * the overlay on demand. Triggered by clicking the logo in the header.
     */
    function deactivateWarOverlay() {
        // Chain bar first, so Torn finds it back in its original parent
        // before we restore the surrounding content.
        restoreTornChainBar();

        // Restore Torn's hidden content (initWarOverlay stashed each child's
        // previous display value in data-fo-prev-display).
        const mainContent = document.getElementById('mainContainer')
            || document.querySelector('.content-wrapper');
        if (mainContent) {
            for (const child of Array.from(mainContent.children)) {
                if (child.id === 'fo-overlay') continue;
                if ('foPrevDisplay' in child.dataset) {
                    child.style.display = child.dataset.foPrevDisplay || '';
                    delete child.dataset.foPrevDisplay;
                }
            }
            delete mainContent.dataset.foHidden;
        }

        const overlay = document.getElementById('fo-overlay');
        if (overlay) overlay.remove();

        // The war-ended banner tracks "already shown" with a module flag that
        // gates re-renders. Resetting it here lets a subsequent re-activate
        // rebuild the banner instead of silently skipping it.
        warEndedBannerShown = false;

        // Re-offer the activate pill so the user can re-open on demand.
        showActivateButton();
    }

    // Track whether we're using DOM-based chain reading (no API calls)
    let usingChainDOM = false;

    // =========================================================================
    // SECTION 11B: WAR STATS & TIMER
    // =========================================================================

    let warTargetNotifiedThisSession = false;
    let warTimerEtaMs = null;
    let warTimerLastCalc = null;

    function warTimerDetailRow(label, val) {
        return '<div class="fo-war-timer-detail-row">'
            + '<span class="fo-war-timer-detail-label">' + label + '</span>'
            + '<span class="fo-war-timer-detail-val">' + val + '</span>'
            + '</div>';
    }

    function updateWarTimer() {
        if (state.warEnded) return;
        const warTimerEl = document.getElementById('fo-war-timer');
        const warTimerValue = document.getElementById('fo-war-timer-value');
        const warTimerDetail = document.getElementById('fo-war-timer-detail');
        if (!warTimerEl || !warTimerValue) return;

        // ── Read timer + score from DOM (Bulletproof Text Scanner) ──
        let lead = null, currentTarget = null, totalElapsedHours = null;
        let timerDays = 0, timerHours = 0, timerMinutes = 0;

        const warHeader = document.querySelector('[class*="rankedWar"]') || document.querySelector('[class*="rankBox"]') || document.querySelector('.faction-war');
        const timerEl = warHeader ? warHeader.querySelector('[class*="timer_"]') : null;
        const targetBox = warHeader ? warHeader.querySelector('[class*="target_"]') : null;

        // 1. Try standard desktop React classes first
        if (targetBox) {
            const match = targetBox.innerText.match(/(\d[\d,.\s]*)\s*\/\s*(\d[\d,.\s]*)/);
            if (match) {
                lead = parseInt(match[1].replace(/[^\d]/g, ''), 10);
                currentTarget = parseInt(match[2].replace(/[^\d]/g, ''), 10);
            }
        }
        if (timerEl) {
            const text = timerEl.textContent.trim();
            const timeParts = text.match(/\d+/g);
            if (timeParts) {
                if (timeParts.length >= 4) {
                    timerDays = parseInt(timeParts[0], 10) || 0;
                    timerHours = parseInt(timeParts[1], 10) || 0;
                    timerMinutes = parseInt(timeParts[2], 10) || 0;
                } else if (timeParts.length === 3) {
                    const hh = parseInt(timeParts[0], 10) || 0;
                    timerDays = Math.floor(hh / 24);
                    timerHours = hh % 24;
                    timerMinutes = parseInt(timeParts[1], 10) || 0;
                }
            }
        }

        // 2. PDA Fallback / Hidden Tab Fallback: Scan the raw text of the hidden Torn page
        if (lead === null || currentTarget === null || timerDays + timerHours + timerMinutes === 0) {
            // Only scan text if we are actually on the main faction war page where the timer exists
            const isMainWarPage = document.querySelector('.faction-war') !== null || document.querySelector('#factions') !== null;

            if (isMainWarPage) {
                const hiddenContainer = document.querySelector('[data-fo-hidden="true"]') || document.body;
                const allText = hiddenContainer.textContent || "";

                // Extract target: Look for "number / number" where right side is >= 1000
                const targetMatch = allText.match(/([\d,]{1,})\s*\/\s*([\d,]{4,})/);
                if (targetMatch) {
                    lead = parseInt(targetMatch[1].replace(/[^\d]/g, ''), 10);
                    currentTarget = parseInt(targetMatch[2].replace(/[^\d]/g, ''), 10);
                }

                // Extract elapsed time: Torn timers usually have 3 segments like "34:50:12" or "1 days 10:50:12"
                const timeMatches = [...allText.matchAll(/(?:WAR\s*)?(?:(\d+)\s*[dD]\s*)?(\d{1,3})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?/g)];
                for (let m of timeMatches) {
                    const p1 = parseInt(m[1]) || 0; // days
                    const p2 = parseInt(m[2]) || 0; // hours (or days)
                    const p3 = parseInt(m[3]) || 0; // mins (or hours)
                    const p4 = parseInt(m[4]) || 0; // secs (or mins)

                    if (m[4] || p2 > 5) {
                        timerDays = p1; timerHours = p2; timerMinutes = p3;
                        break;
                    }
                }
            }
        }

        // 3. Server Fallback: If DOM scanning completely failed (e.g. we are on the Armory tab)
        if (lead === null || currentTarget === null || timerDays + timerHours + timerMinutes === 0) {
            // Abort local calculation and just let the background sync handle it
            if (state.warEta && state.warScores) {
                warTimerEtaMs = null; // Forces updateWarTimerDisplay to use state.warEta.etaTimestamp
                // Also update the pct if needed
                const effectiveScore = state.warScores.myScore != null ? state.warScores.myScore : (Math.max(state.warScores.myScore, state.warScores.enemyScore) || 0);
                const currentPct = (effectiveScore != null && state.warEta.currentTarget) ? Math.min(100, Math.round((effectiveScore / state.warEta.currentTarget) * 100)) : 0;
                if (currentPct !== null && !document.hidden && state.warPercentage !== currentPct) {
                    state.warPercentage = currentPct;
                    broadcastStateChange({ type: 'war_update', pct: currentPct });
                }
            } else {
                document.getElementById('fo-war-timer-value').textContent = "SYNCING...";
            }
            return;
        }

        totalElapsedHours = (timerDays * 24) + timerHours + (timerMinutes / 60);

        const myFactionScore = (state.warScores && state.warScores.myScore != null) ? state.warScores.myScore : lead;
        const effectiveScore = myFactionScore;

        if (effectiveScore === null || currentTarget === null || totalElapsedHours === null) return;

        // Calculate our scoring rate from the very start
        const ourScoreRate = totalElapsedHours > 0 ? (effectiveScore / totalElapsedHours) : 0;

        // "Waiting" state for new wars
        if (lead === 0 && currentTarget > 0 && totalElapsedHours < 2) {
            const display = timerDays > 0 ? `${timerDays}d ${timerHours}h ${timerMinutes}m`
                : timerHours > 0 ? `${timerHours}h ${timerMinutes}m`
                    : `${timerMinutes}m`;
            warTimerEl.className = 'fo-war-timer waiting';
            warTimerValue.textContent = display;
            if (warTimerDetail) warTimerDetail.innerHTML =
                warTimerDetailRow('Status', 'War not started')
                + warTimerDetailRow('Starts in', display)
                + warTimerDetailRow('Target', currentTarget.toLocaleString());
            return;
        }

        // Reverted ETA Logic: Pure decay against whoever is currently winning
        const calculateHoursRemaining = (goal, isDecaying) => {
            // 'lead' is the highest score extracted directly from Torn's UI
            const scoreToUse = lead !== null ? lead : effectiveScore;
            const currentGap = goal - scoreToUse;
            if (currentGap <= 0) return 0;

            const dropHours = Math.max(0, Math.floor(totalElapsedHours - 24));
            const originalTarget = currentTarget / (1 - (dropHours * 0.01));
            const DROP_PER_HOUR = isDecaying ? (originalTarget * 0.01) : 0;

            if (totalElapsedHours >= 24) {
                // Ignore our scoring momentum, just calculate pure decay to the lead score
                const closingSpeed = DROP_PER_HOUR;
                return closingSpeed > 0 ? (currentGap / closingSpeed) : 999;
            } else {
                // If under 24 hours, add the time until decay actually starts
                const timeTo24h = 24 - totalElapsedHours;
                return timeTo24h + (DROP_PER_HOUR > 0 ? (currentGap / DROP_PER_HOUR) : 999);
            }
        };

        let currentPct = null;

        if (state.warTarget && state.warTarget.value) {
            const goal = state.warTarget.value;
            const remaining = goal - effectiveScore;
            const pct = Math.min(100, Math.round((effectiveScore / goal) * 100));
            currentPct = pct;

            if (remaining <= 0) {
                // Custom goal reached, show prediction to actual Ranked War target
                const notifiedKey = 'fo_notified_' + deriveWarId() + '_' + goal;
                if (!warTargetNotifiedThisSession) {
                    warTargetNotifiedThisSession = true;
                    if (GM_getValue(notifiedKey, false) !== true) {
                        GM_setValue(notifiedKey, true);
                        postAction('/api/war-target-reached', { warId: deriveWarId(), lead: effectiveScore }).catch(() => { });
                        firePdaNotification('war_target', '🎯 War Target Reached!', `Faction hit ${effectiveScore.toLocaleString()} / ${goal.toLocaleString()} respect — hold the line!`);
                        postAction('/api/set-war-target', { warId: deriveWarId(), value: null }).catch(() => { });
                        state.warTarget = null;
                    }
                }

                const hoursRemainingFloat = calculateHoursRemaining(currentTarget, true);
                warTimerEtaMs = Date.now() + (hoursRemainingFloat * 3600000);
                warTimerLastCalc = Date.now();

                if (hoursRemainingFloat <= 0) {
                    const isLosing = state.warScores && (state.warScores.enemyScore > state.warScores.myScore);
                    warTimerEl.className = 'fo-war-timer ' + (isLosing ? 'danger' : 'safe');
                    warTimerValue.textContent = isLosing ? '✗ LOST' : '✓ WON';
                } else {
                    const totalMin = Math.floor(hoursRemainingFloat * 60);
                    const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
                    const mm = (totalMin % 60).toString().padStart(2, '0');
                    const urgency = hoursRemainingFloat <= 2 ? 'danger' : hoursRemainingFloat <= 6 ? 'warning' : 'safe';
                    warTimerEl.className = 'fo-war-timer ' + urgency;
                    warTimerValue.textContent = hh + ':' + mm;
                }
            } else {
                // Custom goal NOT reached, show progress + prediction to goal
                const hoursRemainingFloat = calculateHoursRemaining(goal, false);
                // Only set ETA if estimate is reasonable (< 96h) — otherwise display loop would show nonsense
                if (hoursRemainingFloat <= 96) {
                    warTimerEtaMs = Date.now() + (hoursRemainingFloat * 3600000);
                    warTimerLastCalc = Date.now();
                } else {
                    warTimerEtaMs = null;
                }
                const totalMin = Math.floor(hoursRemainingFloat * 60);
                const urgency = pct >= 80 ? 'safe' : pct >= 50 ? 'warning' : 'danger';
                warTimerEl.className = 'fo-war-timer ' + urgency;
                // Hide time estimate if it exceeds 96h (longer than any war) — rate is too unreliable
                if (hoursRemainingFloat > 96) {
                    warTimerValue.textContent = pct + '%';
                } else {
                    const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
                    const mm = (totalMin % 60).toString().padStart(2, '0');
                    warTimerValue.textContent = pct + '% (' + hh + ':' + mm + ')';
                }
                // Populate tooltip with custom war target details
                if (warTimerDetail) {
                    const ourScore = state.warScores ? state.warScores.myScore : (lead || 0);
                    const enemyScore = state.warScores ? state.warScores.enemyScore : 0;
                    warTimerDetail.innerHTML =
                        warTimerDetailRow('Custom Target', goal.toLocaleString())
                        + warTimerDetailRow('Our Score', ourScore.toLocaleString())
                        + warTimerDetailRow('Enemy Score', enemyScore.toLocaleString())
                        + warTimerDetailRow('Progress', pct + '%')
                        + warTimerDetailRow('War Target', currentTarget ? currentTarget.toLocaleString() : '\u2014')
                        + warTimerDetailRow('Elapsed', elapsedStr || '\u2014');
                }
            }
        } else {
            // Main Ranked War Block (Target Decay + Our Rate)
            const hoursRemainingFloat = calculateHoursRemaining(currentTarget, true);
            const myScore = state.warScores?.myScore ?? 0;
            const enemyScore = state.warScores?.enemyScore ?? 0;
            const isLosing = enemyScore > myScore;

            // Only propagate a reasonable ETA. `calculateHoursRemaining`
            // returns 999 as a sentinel when scores/target DOM read
            // fails — don't ship that downstream.
            if (hoursRemainingFloat > 0 && hoursRemainingFloat <= 96) {
                warTimerEtaMs = Date.now() + (hoursRemainingFloat * 3600000);
                warTimerLastCalc = Date.now();
                if (state.jwtToken) {
                    postAction('/api/war-timer-report', {
                        warId: deriveWarId(),
                        etaTimestamp: warTimerEtaMs,
                        calculatedAt: Date.now(),
                    }).catch(() => { });
                }
            } else {
                warTimerEtaMs = null;
            }

            if (hoursRemainingFloat > 96) {
                // Unreliable estimate — show current score progress
                // toward target instead of a bogus 999h reading.
                const ourScore = state.warScores ? myScore : (lead || 0);
                const pct = currentTarget > 0
                    ? Math.min(100, Math.round(100 * ourScore / currentTarget))
                    : 0;
                const urgency = pct >= 80 ? 'safe' : pct >= 50 ? 'warning' : 'danger';
                warTimerEl.className = 'fo-war-timer ' + urgency;
                warTimerValue.textContent = pct + '%';
            } else if (hoursRemainingFloat <= 0) {
                // Our ETA elapsed. Only flip to WON/LOST if Torn has
                // officially confirmed the war ended; otherwise hold at
                // 0h 00m with the leading-side color.
                if (state.warEnded) {
                    warTimerEl.className = 'fo-war-timer ' + (isLosing ? 'danger' : 'safe');
                    warTimerValue.textContent = isLosing ? 'LOST' : 'WON';
                } else {
                    warTimerEl.className = 'fo-war-timer ' + (isLosing ? 'danger' : 'safe');
                    warTimerValue.textContent = '0h 00m';
                }
            } else {
                const totalMin = Math.floor(hoursRemainingFloat * 60);
                const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
                const mm = (totalMin % 60).toString().padStart(2, '0');
                const urgency = hoursRemainingFloat <= 2 ? 'danger' : hoursRemainingFloat <= 6 ? 'warning' : 'safe';
                warTimerEl.className = 'fo-war-timer ' + urgency;
                warTimerValue.textContent = hh + ':' + mm;
            }

            // Populate the detail popup box
            if (warTimerDetail) {
                const dropHrs = Math.max(0, Math.floor(totalElapsedHours - 24));
                const origTarget = currentTarget / (1 - (dropHrs * 0.01));
                const dropPerHr = origTarget * 0.01;
                const gap = currentTarget - (lead !== null ? lead : effectiveScore);

                warTimerDetail.innerHTML =
                    warTimerDetailRow('Target Score', Math.round(currentTarget).toLocaleString()) +
                    warTimerDetailRow('Lead Score', Math.round(lead !== null ? lead : effectiveScore).toLocaleString()) +
                    warTimerDetailRow('Score Gap', Math.round(gap).toLocaleString()) +
                    warTimerDetailRow('Target Decay/hr', Math.round(dropPerHr).toLocaleString());
            }
        }

        if (currentPct !== null && !document.hidden && state.warPercentage !== currentPct) {
            state.warPercentage = currentPct;
            broadcastStateChange({ type: 'war_update', pct: currentPct });
        }
    }

    function updateWarTimerDisplay() {
        if (state.warEnded) return;
        const warTimerEl = document.getElementById('fo-war-timer');
        const warTimerValue = document.getElementById('fo-war-timer-value');
        if (!warTimerEl || !warTimerValue) return;

        const eta = state.warEta;
        const etaMs = warTimerEtaMs !== null ? warTimerEtaMs : (eta && eta.etaTimestamp !== undefined && eta.etaTimestamp !== null ? eta.etaTimestamp : null);
        if (etaMs === null && !eta?.preDropPhase && !eta?.preWarPhase) return;

        if (eta?.preWarPhase) {
            warTimerEl.className = 'fo-war-timer waiting';
            warTimerValue.textContent = 'Pre-War';
            return;
        }

        if (eta?.preDropPhase) {
            if (state.warTarget && state.warTarget.value && state.warPercentage !== null) {
                // Show server-cached percentage on non-war pages
                const pct = state.warPercentage;
                const urgency = pct >= 80 ? 'safe' : pct >= 50 ? 'warning' : 'danger';
                warTimerEl.className = 'fo-war-timer ' + urgency;
                warTimerValue.textContent = pct + '%';
                // Populate tooltip from server data
                const detail = document.getElementById('fo-war-timer-detail');
                if (detail && state.warScores) {
                    detail.innerHTML =
                        warTimerDetailRow('Custom Target', state.warTarget.value.toLocaleString())
                        + warTimerDetailRow('Our Score', (state.warScores.myScore || 0).toLocaleString())
                        + warTimerDetailRow('Enemy Score', (state.warScores.enemyScore || 0).toLocaleString())
                        + warTimerDetailRow('Progress', pct + '%')
                        + warTimerDetailRow('Phase', 'Pre-24h (no decay yet)');
                }
                return;
            }
            warTimerEl.className = 'fo-war-timer waiting';
            warTimerValue.textContent = 'Pre-24h';
            return;
        }

        const msLeft = etaMs - Date.now();
        const totalSec = Math.floor(msLeft / 1000);

        // Show WON / LOST only when Torn has officially confirmed the
        // war ended (winner !== 0 in the rankedwars response, mirrored
        // to state.warEnded by the server). Previously we also treated
        // `eta.hoursRemaining === 0` as an end-of-war signal, but the
        // ETA reaches 0 whenever the leading faction exceeds the decayed
        // target — which happens *before* the war actually resolves,
        // giving a false "WON" readout while fighting continues.
        if (totalSec <= 0) {
            const myScore = state.warScores?.myScore ?? 0;
            const enemyScore = state.warScores?.enemyScore ?? 0;
            const targetVal = eta?.currentTarget ?? null;
            const isLosing = enemyScore > myScore;

            if (state.warEnded) {
                // Torn officially called the war — show final result.
                warTimerEl.className = 'fo-war-timer ' + (isLosing ? 'danger' : 'safe');
                warTimerValue.textContent = isLosing ? 'LOST' : 'WON';
                if (warTimerDetail) warTimerDetail.innerHTML =
                    warTimerDetailRow('Result', isLosing ? 'Loss' : 'Win')
                    + warTimerDetailRow('Our Score', myScore.toLocaleString())
                    + warTimerDetailRow('Enemy Score', enemyScore.toLocaleString())
                    + (targetVal ? warTimerDetailRow('Target', targetVal.toLocaleString()) : '');
            } else {
                // Our computed ETA expired but Torn hasn't confirmed a
                // winner yet (common: lead exceeded decayed target but
                // the game engine is still ticking). Hold the timer at
                // 0h 00m with the leading-side's color rather than
                // flashing a misleading WON / LOST.
                warTimerEl.className = 'fo-war-timer ' + (isLosing ? 'danger' : 'safe');
                warTimerValue.textContent = '0h 00m';
                if (warTimerDetail) warTimerDetail.innerHTML =
                    warTimerDetailRow('Our Score', myScore.toLocaleString())
                    + warTimerDetailRow('Enemy Score', enemyScore.toLocaleString())
                    + (targetVal ? warTimerDetailRow('Target', targetVal.toLocaleString()) : '')
                    + warTimerDetailRow('Status', 'Ending — awaiting official result');
            }
            return;
        }

        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;

        let timeStr = '';
        if (hrs > 0) {
            timeStr = hrs.toString().padStart(2, '0') + ':' + mins.toString().padStart(2, '0');
        } else {
            timeStr = mins + 'm ' + secs.toString().padStart(2, '0') + 's';
        }

        if (state.warTarget && state.warTarget.value && state.warPercentage !== null && state.warPercentage < 100) {
            // Hide time if estimate exceeds 96h (rate too unreliable early in war)
            warTimerValue.textContent = hrs > 96 ? state.warPercentage + '%' : state.warPercentage + '% (' + timeStr + ')';
        } else {
            warTimerValue.textContent = timeStr;
        }

        const hrsLeft = totalSec / 3600;
        const urg = state.warPercentage !== null && state.warPercentage < 100
            ? (state.warPercentage >= 80 ? 'safe' : state.warPercentage >= 50 ? 'warning' : 'danger')
            : (hrsLeft <= 2 ? 'danger' : hrsLeft <= 6 ? 'warning' : 'safe');
        warTimerEl.className = 'fo-war-timer ' + urg;
    }

    function initWarOverlay() {
        startChainTimer();
        // Chain data source will be decided after overlay is built
        // (we need #barChain to be in the DOM first)
        startStatusTimers();
        startCallPruner();
        startKeepAlive();
        updateChainBar();

        // Hide Torn's main content but keep the container itself visible so
        // we can insert the overlay INSIDE it. Torn typically scopes its
        // native profile-card delegation to #mainContainer; nesting the
        // overlay inside lets those handlers fire on our name elements.
        const mainContent = document.getElementById('mainContainer')
            || document.querySelector('.content-wrapper');
        if (mainContent) {
            mainContent.dataset.foHidden = 'true';
            for (const child of Array.from(mainContent.children)) {
                if (child.id === 'fo-overlay') continue;
                if (!('foPrevDisplay' in child.dataset)) {
                    child.dataset.foPrevDisplay = child.style.display || '';
                }
                child.style.display = 'none';
            }
        }

        // Create the overlay if it doesn't already exist
        if (document.getElementById('fo-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'fo-overlay';
        overlay.className = 'fo-overlay';

        // ── Header ──
        overlay.innerHTML = `
            <div class="fo-header">
                <div class="fo-header-left">
                    <div class="fo-logo-mark">
                        <svg class="fo-logo-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="FactionOps">
                            <rect x="1" y="1" width="18" height="18" rx="3" stroke="#e17055" stroke-width="1.5" fill="none"/>
                            <path d="M6 6h8M6 10h5M6 14h8" stroke="#e0e0e0" stroke-width="1.5" stroke-linecap="round"/>
                            <circle cx="15" cy="14" r="2" fill="#00b894"/>
                        </svg>
                        <span class="fo-logo-text">FactionOps</span>
                    </div>
                    <div class="fo-status-dot${state.connected ? '' : ' disconnected'}" id="fo-conn-dot" title="${state.connected ? 'Connected' : 'Disconnected'}"></div>
                    <span class="fo-rt-badge" id="fo-rt-badge"></span>
                    ${isLeader() ? `<button class="fo-settings-btn" id="fo-heatmap-header-btn" title="War Payouts">&#x1F4B0;</button>` : ''}
                    <button class="fo-settings-btn" id="fo-settings-btn" title="Settings">&#x2699;</button>
                    <div class="fo-energy-display" id="fo-energy-display" title="Energy">
                        <span class="fo-energy-label">E</span>
                        <span class="fo-energy-value" id="fo-energy-value">--/--</span>
                        <span class="fo-energy-timer" id="fo-energy-timer"></span>
                    </div>
                </div>
                <div class="fo-header-center">
                    <span class="fo-war-badge" id="fo-war-type">War</span>
                    <span>vs</span>
                    <strong id="fo-enemy-name">${escapeHtml(state.enemyFactionName || state.enemyFactionId || 'Enemy Faction')}</strong>
                </div>
                <div class="fo-header-right">
                    <div class="fo-torn-chain" id="fo-torn-chain">
                        <!-- Torn's native #barChain will be moved here -->
                    </div>
                    <div class="fo-chain-info" id="fo-chain-fallback" style="display:none;">
                        <span class="fo-chain-label">Chain</span>
                        <span class="fo-chain-count" id="fo-chain-count">${state.chain.current || 0}/${state.chain.max || '??'}</span>
                        <span class="fo-chain-timeout" id="fo-chain-timeout">${state.chain.timeout > 0 ? formatTimer(state.chain.timeout) : '--:--'}</span>
                        <span class="fo-chain-bonus" id="fo-chain-bonus" style="display:none;"></span>
                    </div>
                    <div class="fo-war-timer waiting" id="fo-war-timer" title="Ranked War Timer">
                        <span class="fo-war-timer-icon">🕓</span>
                        <span class="fo-war-timer-label">War</span>
                        <span class="fo-war-timer-value" id="fo-war-timer-value">--:--</span>
                        <div class="fo-war-timer-detail" id="fo-war-timer-detail"></div>
                    </div>
                    <button class="fo-settings-btn" id="fo-enemy-heatmap-btn" title="Activity Heatmap (us vs enemy, divergent)">&#x1F4C8;</button>
                    <button class="fo-settings-btn" id="fo-scout-btn" title="War Analysis">&#x1F50D;</button>
                    <button class="fo-settings-btn" id="fo-postwar-btn" title="Post-War Report">&#x1F4CB;</button>
                    <div class="fo-online-badge"><span class="fo-dot"></span><span id="fo-online-count">${state.ourFactionOnline ? state.ourFactionOnline.online : state.onlinePlayers.length} us</span> · <span id="fo-enemy-online-count">0 enemy</span></div>
                </div>
            </div>
            <div class="fo-turtle-bar" id="fo-turtle-bar"></div>
            ${isLeader() ? `
            <div class="fo-broadcast-entry-bar">
                <input type="text" id="fo-input-broadcast" placeholder="Broadcast message to faction..." maxlength="150">
                <button type="button" id="fo-btn-send-broadcast">Shout</button>
            </div>
            <div class="fo-bars-section" id="fo-bars-section">
                <div class="fo-bars-header" id="fo-bars-toggle">
                    <span class="fo-bars-caret">\u25B6</span>
                    <span class="fo-bars-title">Faction Cooldowns</span>
                    <span class="fo-bars-count" id="fo-bars-count">0</span>
                </div>
                <div class="fo-bars-list" id="fo-bars-list" style="display:none;"></div>
            </div>
            ` : ''}
            <!-- Targets moved to Torn's own war page (2026-09-04). The sort bar,
                 column headers and target list lived here; the personal FFScouter
                 key sat in the sort bar because FF only ever showed on a target
                 row. The render code that filled them was deleted in 5.2.23. -->
            <div class="fo-footer">
                <div class="fo-footer-stats">
                </div>
                <span class="fo-footer-version">v${CONFIG.VERSION || '3.0.0'}</span>
            </div>
        `;

        // Insert the overlay INSIDE the hidden main container so Torn's
        // delegated event handlers (profile-card tooltips in particular,
        // which are scoped to #mainContainer) fire on our name elements.
        const hiddenMain = document.querySelector('[data-fo-hidden="true"]');
        if (hiddenMain) {
            hiddenMain.appendChild(overlay);
        } else {
            document.body.appendChild(overlay);
        }

        // Clicking the logo closes the overlay and brings back the
        // "Activate FactionOps" pill so the user can re-open on demand.
        // Uses the same document-level delegated click (capture phase)
        // pattern as the Shout button / Cooldowns header — local
        // listeners are unreliable when the overlay is nested inside
        // Torn's #mainContainer.
        const logoEl = overlay.querySelector('.fo-logo-mark');
        if (logoEl) logoEl.title = 'Click to minimize FactionOps';
        setupLogoMinimizeDelegation();

        // v5.0.14 / v5.0.18: wire the sort dropdown. Listener is direct
        // (not delegated) since the dropdown is rebuilt with the overlay.
        // For stats modes, we schedule ONE delayed re-render 1.5s after
        // the dropdown change so the user sees the sort apply once the
        // background pre-fetch has had time to populate the FFS cache.
        // The setTimeout is single-shot — no recursion possible.
        // v5.1.8: sort dropdown removed — stats range filter replaces
        // the manual sort modes (Level/Stats asc/desc). Smart sort is
        // the default and only mode now. applyManualSort still exists
        // for backward compat but returns immediately for _sortMode='smart'.
        // Force _sortMode back to 'smart' in case it was persisted as
        // something else from before this version.
        try { setSortMode('smart'); } catch (_) { }

        // v5.1.1: stats range filter — min/max inputs hide targets
        // outside the range. Unknown-stats targets always pass.
        const minEl = overlay.querySelector('#fo-stats-filter-min');
        const maxEl = overlay.querySelector('#fo-stats-filter-max');
        const clearEl = overlay.querySelector('#fo-stats-filter-clear');
        function fmtBackToInput(n) {
            if (n == null) return '';
            if (n >= 1e9) return (n / 1e9).toString().replace(/\.0$/, '') + 'B';
            if (n >= 1e6) return (n / 1e6).toString().replace(/\.0$/, '') + 'M';
            if (n >= 1e3) return (n / 1e3).toString().replace(/\.0$/, '') + 'K';
            return String(Math.round(n));
        }
        if (minEl && _statsFilterMin) minEl.value = fmtBackToInput(_statsFilterMin);
        if (maxEl && _statsFilterMax) maxEl.value = fmtBackToInput(_statsFilterMax);
        if (clearEl) {
            clearEl.addEventListener('click', () => {
                if (minEl) minEl.value = '';
                if (maxEl) maxEl.value = '';
            });
        }

        // Personal FFScouter key, inline on the Stats row. Same storage and the
        // same cache invalidation as the Settings field — two surfaces, one
        // value — so whichever one you touch, both read back the same state on
        // the next render.
        const myFfsBtn = overlay.querySelector('#fo-myffs-btn');
        const myFfsRow = overlay.querySelector('#fo-myffs-row');
        const myFfsInput = overlay.querySelector('#fo-myffs-input');
        if (myFfsBtn && myFfsRow && myFfsInput) {
            // The button IS the status readout: masked last-4 and an accent
            // colour when a personal key is live, muted when it is not. Without
            // this a member has no way to tell whether the FF numbers they are
            // reading are their own — which is the entire point of the feature.
            function paintMyFfsBtn() {
                const k = getMyFfsKey();
                const label = overlay.querySelector('#fo-myffs-label');
                const rejected = k && ffPersonalKeyRejected;
                if (label) label.textContent = !k ? 'FF' : (rejected ? 'FF?' : maskFfsKey(k));
                // Set the whole `border` shorthand, not borderColor: the shared
                // .fo-stats-filter-clear class sets `border: 0`, so a colour
                // alone lands on a zero-width border and renders nothing — half
                // the "your key is live" affordance would silently not appear.
                // --wb-call-red is the theme's existing warning tone and is
                // defined in both light and dark palettes.
                const accent = rejected ? 'var(--wb-call-red)' : 'var(--wb-call-green)';
                myFfsBtn.style.color = k ? accent : '';
                myFfsBtn.style.border = k ? ('1px solid ' + accent) : '';
                myFfsBtn.title = !k
                    ? 'Your own FFScouter key — FF scores are relative to YOUR stats, so they only appear with your own key'
                    // Deliberately neutral: the same state covers a rejected
                    // key, a rate limit and a dropped connection, and claiming
                    // "your key is bad" on a network blip would send people
                    // hunting a key that is fine.
                    : (rejected
                        ? 'FFScouter is not returning scores — showing shared stat estimates only. Check your key, or tap to re-enter it.'
                        : 'Your personal FFScouter key is set — FF scores are computed against your own stats');
            }
            // Publish the repaint so every key-change path reaches it, including
            // the Settings field and the modal-wide Save, which have no handle
            // on this button. Without it a Settings-side Clear leaves the button
            // green with a stale mask — positively asserting "these FF numbers
            // are yours" when none are being shown at all.
            repaintMyFfsUi = function () {
                try { paintMyFfsBtn(); } catch (_) { }
                // The Settings modal is created and destroyed on demand, so its
                // status line may be absent — refresh it only when present.
                try {
                    const st = document.getElementById('wb-my-ffs-key-status');
                    if (st) {
                        const k = getMyFfsKey();
                        st.textContent = k
                            ? (ffPersonalKeyRejected
                                ? 'Saved (' + maskFfsKey(k) + ') — FFScouter is not returning scores for it; stat estimates only.'
                                : 'Saved (' + maskFfsKey(k) + ') — showing your personal FF scores.')
                            : 'Not set — stat estimates only, no FF score.';
                        st.style.color = k ? (ffPersonalKeyRejected ? 'var(--wb-idle-yellow)' : 'var(--wb-call-green)') : '';
                    }
                } catch (_) { }
            };
            paintMyFfsBtn();
            myFfsBtn.addEventListener('click', () => {
                const open = myFfsRow.style.display !== 'none';
                myFfsRow.style.display = open ? 'none' : 'flex';
                // Clear UNCONDITIONALLY, not just on open. Typing a key and then
                // dismissing the panel with this same button used to leave the
                // raw key sitting in a hidden <input> in the live Torn DOM for
                // the rest of the page session — readable by every other
                // userscript on the page. Never pre-fill it either.
                myFfsInput.value = '';
                if (!open) myFfsInput.focus();
            });
            const saveBtn = overlay.querySelector('#fo-myffs-save');
            if (saveBtn) saveBtn.addEventListener('click', () => {
                const k = myFfsInput.value.trim();
                if (!k) return;
                setMyFfsKey(k);
                myFfsInput.value = '';
                myFfsRow.style.display = 'none';
                // Drop every cached score stamped with the previous key, so a
                // number computed for someone else can never survive the switch.
                // This also repaints the button via repaintMyFfsUi.
                resetFfCacheForKeyChange();
            });
            // The soft keyboard's Go/Done key. Without it a phone user must
            // dismiss the keyboard — which on iOS often scrolls the sort bar
            // away — before they can reach Save.
            myFfsInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveBtn && saveBtn.click(); }
            });
            const clrBtn = overlay.querySelector('#fo-myffs-clear');
            if (clrBtn) clrBtn.addEventListener('click', () => {
                setMyFfsKey('');
                myFfsInput.value = '';
                myFfsRow.style.display = 'none';
                resetFfCacheForKeyChange();
            });
        }

        // v5.1.5: hide-online checkbox handler
        const hideOnlineEl = overlay.querySelector('#fo-hide-online');
        if (hideOnlineEl) {
            hideOnlineEl.checked = _hideOnline;
            hideOnlineEl.addEventListener('change', () => {
                _hideOnline = hideOnlineEl.checked;
                try { GM_setValue('factionops_hide_online', _hideOnline); } catch (_) { }
            });
        }
        // v5.1.12: hide-offline checkbox handler. 'Offline' = activity
        // not online (i.e. idle or offline — last action 5+ min ago).
        const hideOfflineEl = overlay.querySelector('#fo-hide-offline');
        if (hideOfflineEl) {
            hideOfflineEl.checked = _hideOffline;
            hideOfflineEl.addEventListener('change', () => {
                _hideOffline = hideOfflineEl.checked;
                try { GM_setValue('factionops_hide_offline', _hideOffline); } catch (_) { }
            });
        }

        // Check if war already ended (persisted state from server)
        if (state.warEnded) {
            setTimeout(showWarEndedBanner, 500);
        }

        // Set RT badge initial state. v5.0.86: dropped the 5s setInterval
        // wakeup — updateRtBadge is already called event-driven on every
        // socket connect/disconnect/SSE message (lines 4457, 4476, 4569,
        // 4596, 4640, 4649, 4729, 4742) so the polled wakeup was
        // redundant noise. On PDA every interval tick crosses the
        // JS→native bridge; killing it cuts background CPU. If badge
        // drift becomes a problem a 60s safety poll can be added back.
        updateRtBadge();

        // Move Torn's native #barChain into our overlay header
        moveTornChainBar();
        startEnergyPoll();
        startAttacksPoll();

        // Fetch Fair Fight data from ffscouter.com (initial + periodic refresh)
        fetchFairFightBatch();
        setInterval(fetchFairFightBatch, 10 * 60 * 1000); // v5.0.98: 5 min → 10 min, aligned with bars/attacks polls

        // v5.0.92: shared-BSP pool. Pull on init + every 30 min. Push
        // own BSP entries (opt-in via CONFIG.SHARE_BSP) on init + every
        // 6 hours — entries change rarely so frequent uploads are
        // wasted bandwidth.
        setTimeout(refreshSharedBsp, 2000);  // wait for JWT to be set
        setInterval(refreshSharedBsp, 30 * 60 * 1000);
        setTimeout(uploadLocalBspToShared, 5000);
        setInterval(uploadLocalBspToShared, 6 * 60 * 60 * 1000);

        // v5.1.9: WebSocket intercept — primary fast path for hospital
        // detection (~100ms vs ~2s for news scrape). Falls behind news
        // + attack-result intercept + server polls as defense-in-depth.
        try { installTornWsInterceptor(); } catch (_) { }

        // v5.1.10: fetch interceptor — captures Torn's own war-page
        // ajax (step=getwarusers) for instant full-faction status
        // hydration without a separate Torn API call from our key.
        try { installTornFetchInterceptor(); } catch (_) { }

        // v5.0.30: combined heatmap modal — single 📊 button opens a
        // tabbed modal with Activity + Payouts heatmaps. Was two separate
        // buttons (📊 + 💰) before; user requested one combined entry
        // point matching the APK pattern.
        const heatmapHeaderBtn = document.getElementById('fo-heatmap-header-btn');
        if (heatmapHeaderBtn) {
            heatmapHeaderBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openCombinedHeatmapModal();
            });
        }

        // v5.0.33: 📈 button now opens a COMBINED activity heatmap
        // (our faction + enemy, APK-style divergent green/red), not the
        // enemy-only view it had before. Falls back to single-faction
        // render if there's no current war / no enemy faction known.
        const enemyHeatmapBtn = document.getElementById('fo-enemy-heatmap-btn');
        if (enemyHeatmapBtn) {
            enemyHeatmapBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.enemyFactionId) {
                    toggleCombinedHeatmapPanel(
                        state.myFactionId, state.myFactionName,
                        state.enemyFactionId, state.enemyFactionName,
                    );
                } else {
                    // No active war — just show our own heatmap.
                    toggleHeatmapPanel(state.myFactionId, state.myFactionName);
                }
            });
        }

        // Wire up scout report button in overlay header
        const scoutBtn = document.getElementById('fo-scout-btn');
        if (scoutBtn) {
            scoutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openScoutReport();
            });
        }

        // Wire up post-war report button in overlay header
        const postwarBtn = document.getElementById('fo-postwar-btn');
        if (postwarBtn) {
            postwarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openPostWarReport();
            });
        }

        // Wire up settings button in overlay header
        const settingsBtn = document.getElementById('fo-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSettings();
            });
        }

        // Hide the floating gear and heatmap FABs when overlay is active
        const fab = document.querySelector('.wb-settings-gear');
        if (fab) fab.style.display = 'none';
        const heatmapFab = document.getElementById('wb-heatmap-toggle');
        if (heatmapFab) heatmapFab.style.display = 'none';

        // Faction cooldowns panel — fetch initial snapshot + render,
        // then wire the collapse toggle on the section header.
        console.log('[fo-bars] init: fetching /api/faction/bars…');
        getAction('/api/faction/bars').then((r) => {
            console.log('[fo-bars] /api/faction/bars response:', r);
            if (r && r.memberBars) {
                // NOTE this REPLACES the map (the panel wants a clean
                // snapshot), whereas applyServerData merges into it. That is
                // why identity lives in the union-only knownOwnMemberIds set
                // and not in memberBars: opening the overlay must not be able
                // to shrink our notion of who is on our side.
                state.memberBars = r.memberBars;
                noteOwnMemberIds(Object.keys(r.memberBars));
                console.log('[fo-bars] applied memberBars, keys=', Object.keys(r.memberBars));
                renderFactionBars();
            } else {
                console.warn('[fo-bars] response had no memberBars, running empty render');
                renderFactionBars();
            }
        }).catch((err) => { console.warn('[fo-bars] /api/faction/bars FAILED:', err); renderFactionBars(); });
        setupFactionBarsToggle();
        setupFoTooltips();

        // ── Ranked War Timer popup: document-level capture-phase
        //    delegation, same pattern that fixed the Shout button.
        //    Per-element click listeners get clobbered by Torn's React
        //    reconciliation inside #mainContainer; delegation survives
        //    DOM rebuilds and can't be swallowed by competing
        //    stopPropagation in bubble phase.
        setupWarTimerDelegation();

        if (typeof updateWarTimer === 'function') {
            updateWarTimer();
            // Self-ticking removed 2026-09-04 (was 30s + 1s). Both still run
            // on data arrival; the chip steps instead of sweeping.
        }

        // Every 90s: often enough to catch somebody being farmed, rare enough
        // that it costs nothing. Reads a server cache, not Torn's API.
        if (typeof refreshTurtleBar === 'function') {
            refreshTurtleBar();
            // 90s refresh removed 2026-09-04 -- populates once on open.
        }

        // Wire up broadcast button in overlay (leader/banker only)
        const shoutBtn = document.getElementById('fo-btn-send-broadcast');
        log('[shout-wire] button in DOM?', !!shoutBtn);
        if (shoutBtn) {
            // Visual diagnostic — if you mousedown/touchstart this button and
            // nothing flashes, the button isn't receiving input events.
            const flashDiag = () => {
                const prev = shoutBtn.style.background;
                shoutBtn.style.background = '#fdcb6e';
                setTimeout(() => { shoutBtn.style.background = prev; }, 250);
            };
            shoutBtn.addEventListener('mousedown', flashDiag, true);
            shoutBtn.addEventListener('touchstart', flashDiag, true);
            shoutBtn.addEventListener('pointerdown', flashDiag, true);

            const sendShout = () => {
                log('[shout] click fired');
                const msgInput = document.getElementById('fo-input-broadcast');
                if (!msgInput) {
                    log('[shout] input element missing');
                    showToast('Broadcast input not found', 'error');
                    return;
                }
                const msg = msgInput.value.trim();
                log('[shout] msg length:', msg.length);
                if (!msg) {
                    showToast('Type something to broadcast first', 'warning');
                    return;
                }
                const currentWarId = deriveWarId();
                log('[shout] warId:', currentWarId, 'myFactionId:', state.myFactionId);
                if (!currentWarId) {
                    showToast('Error: Could not determine war ID.', 'error');
                    return;
                }
                log('[shout] POSTing /api/broadcast');
                postAction('/api/broadcast', { message: msg, type: 'warning', warId: currentWarId })
                    .then(data => {
                        log('[shout] response:', data);
                        if (data && data.success) {
                            msgInput.value = '';
                            showToast('Broadcast sent to faction!', 'success');
                        } else {
                            showToast((data && data.error) || 'Failed to send broadcast.', 'error');
                        }
                    })
                    .catch(e => {
                        warn('[shout] POST failed:', e && e.message);
                        showToast(`Broadcast failed: ${(e && e.message) || 'server error'}`, 'error');
                    });
            };
            shoutBtn.addEventListener('click', sendShout);
            const msgInput = document.getElementById('fo-input-broadcast');
            if (msgInput) {
                msgInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') sendShout();
                });
            }
        }

        log('War overlay initialised');
    }

    /** Simple HTML escape. */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /** Render the priority cell for overlay rows. */
    function renderOverlayPriorityCell(cell, targetId) {
        cell.innerHTML = '';
        const prio = state.priorities[targetId];
        const level = prio ? prio.level : null;

        if (isLeader()) {
            // Leaders get a dropdown — hidden until a priority is set or cell is tapped
            const sel = document.createElement('select');
            sel.className = 'fo-priority-select';
            sel.title = 'Set priority';
            if (!level) sel.style.opacity = '0'; // invisible when no priority
            ['', 'high', 'med', 'low'].forEach((val) => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = val ? val.toUpperCase() : '';
                if (val === (level || '')) opt.selected = true;
                sel.appendChild(opt);
            });
            // Show on interaction
            sel.addEventListener('focus', () => { sel.style.opacity = '1'; cell.dataset.foActive = '1'; });
            sel.addEventListener('mousedown', () => { sel.style.opacity = '1'; cell.dataset.foActive = '1'; });
            sel.addEventListener('change', () => {
                delete cell.dataset.foActive;
                emitSetPriority(targetId, sel.value || null);
            });
            sel.addEventListener('blur', () => {
                delete cell.dataset.foActive;
                if (!sel.value) sel.style.opacity = '0';
            });
            cell.appendChild(sel);
        } else if (level) {
            const badge = document.createElement('span');
            badge.className = `fo-priority-badge ${level}`;
            badge.textContent = level.charAt(0).toUpperCase() + level.slice(1);
            cell.appendChild(badge);
        }
    }

    // v5.1.1: stats range filter state. Both bounds optional; null
    // means unbounded. Persisted via GM_setValue so it survives
    // page reload / refresh.
    let _statsFilterMin = null;
    let _statsFilterMax = null;
    // v5.1.5: hide-online toggle. When true, targets with
    // activity==='online' are hidden from the attackable list.
    let _hideOnline = false;
    // v5.1.12: hide-offline toggle. 'Offline' here means 'last action
    // 5+ min ago' per user — matches Torn's idle+offline activity
    // states (online = <5 min, idle = 5-7 min, offline = 7+ min).
    let _hideOffline = false;
    // v5.4.1: hide-abroad toggle. Abroad, in the air, or in a foreign
    // hospital -- all of them unattackable from Torn.
    let _hideAbroad = false;
    try {
        const m = Number(GM_getValue('factionops_stats_filter_min', 0));
        if (Number.isFinite(m) && m > 0) _statsFilterMin = m;
        const x = Number(GM_getValue('factionops_stats_filter_max', 0));
        if (Number.isFinite(x) && x > 0) _statsFilterMax = x;
        _hideOnline = !!GM_getValue('factionops_hide_online', false);
        _hideOffline = !!GM_getValue('factionops_hide_offline', false);
        _hideAbroad = !!GM_getValue('factionops_hide_abroad', false);
    } catch (_) { }

    // Online / idle / offline, from the server's enemyStatuses -- the same
    // field the overlay filtered on. Torn's own row has an online icon, but
    // reading state is steadier: the icon is React's to repaint.
    //
    // 'Offline' follows the overlay's meaning: last action 5+ min ago, which
    // is Torn's idle AND offline both. Unknown activity SHOWS, for the same
    // reason unknown stats do -- a hidden row is a target nobody attacks.
    /**
     * Is this target out of reach from Torn?
     *
     * Three states mean the same thing on a call sheet: abroad, on a plane, and
     * in a foreign hospital. None of them can be attacked from here, so on a
     * long war list they are rows to scroll past.
     *
     * The foreign hospital is the one that needs care. Its state is Hospital
     * like any other and only the wording separates it -- Torn writes "In a
     * Swiss hospital for 4 minutes" abroad and plain "In hospital for 10
     * minutes" at home. Getting that backwards would hide most of a war, so the
     * country wording is required rather than merely the word hospital.
     */
    function isAwayFromTorn(status, description) {
        const st = String(status || '').toLowerCase();
        if (st === 'abroad' || st === 'traveling' || st === 'travelling') return true;
        if (st !== 'hospital') return false;
        // "In a Swiss hospital", "In a South African hospital" -- a country
        // sits between the article and the word. "In hospital" has none.
        return /\bin\s+an?\s+\S.*\bhospital\b/i.test(String(description || ''));
    }

    function passesActivityFilter(targetId) {
        if (!_hideOnline && !_hideOffline && !_hideAbroad) return true;
        const st = (state.statuses || {})[targetId];
        if (_hideAbroad && st && isAwayFromTorn(st.status, st.description)) return false;
        const act = st && st.activity ? String(st.activity).toLowerCase() : null;
        if (!act) return true;
        if (_hideOnline && act === 'online') return false;
        if (_hideOffline && act !== 'online') return false;
        return true;
    }

    // Parses what a person types into the range boxes: "10m", "1.5B",
    // "750,000". Restored in 5.2.24 -- it went with the overlay's sort bar in
    // 5.2.23, and the war-page range filter needs the same parsing.
    function parseStatsInput(str) {
        if (str == null) return null;
        const t = String(str).trim().toUpperCase().replace(/,/g, '');
        if (!t) return null;
        const m = t.match(/^([\d.]+)\s*([KMB])?$/);
        if (!m) return null;
        const n = parseFloat(m[1]);
        if (!Number.isFinite(n) || n <= 0) return null;
        const u = m[2] === 'B' ? 1e9 : m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : 1;
        return n * u;
    }

    // Renders a stored number back into the box the way it was typed.
    function fmtStatsForInput(n) {
        if (n == null) return '';
        if (n >= 1e9) return String(n / 1e9).replace(/\.0$/, '') + 'B';
        if (n >= 1e6) return String(n / 1e6).replace(/\.0$/, '') + 'M';
        if (n >= 1e3) return String(n / 1e3).replace(/\.0$/, '') + 'K';
        return String(Math.round(n));
    }

    // Returns the best stats estimate for a target, or null if unknown.
    // Same chain as renderInlineBsp / sort: BSP TBS → FFS bs_estimate
    // → ffCache bsHuman midpoint. Used by the range filter.
    function getTargetStatsEstimate(targetId) {
        try {
            const bsp = fetchBspPrediction(targetId);
            if (bsp && bsp.TBS != null) {
                const n = Number(bsp.TBS);
                if (Number.isFinite(n)) return n;
            }
        } catch (_) { }
        const ffs = _ffsStatsCache.get(String(targetId));
        if (typeof ffs === 'number') return ffs;
        const cc = (typeof ffCache !== 'undefined') ? ffCache[targetId] : null;
        if (cc && cc.bsHuman) {
            const mid = parseBsHumanMid(cc.bsHuman);
            if (mid !== null) return mid;
        }
        return null;
    }

    // Returns true if the target passes the current min/max stats
    // filter. Unknown-stats targets always pass — we can't tell, so
    // we don't hide them (otherwise war coverage gets unreliable
    // immediately if FFS hasn't filled in for new enemies).
    function passesStatsFilter(targetId) {
        if (_statsFilterMin == null && _statsFilterMax == null) return true;
        const n = getTargetStatsEstimate(targetId);
        if (n == null) return true; // unknown → show
        if (_statsFilterMin != null && n < _statsFilterMin) return false;
        if (_statsFilterMax != null && n > _statsFilterMax) return false;
        return true;
    }

    // Parse 'bsHuman' range string ("10M-50M", "1.2B", "500K") to a
    // midpoint number, for picking the BSP color tier. Mirrors the
    // sort-side parser added in v5.0.79.
    function parseBsHumanMid(s) {
        if (!s || typeof s !== 'string') return null;
        const unit = (u) => u === 'B' ? 1e9 : u === 'M' ? 1e6 : u === 'K' ? 1e3 : 1;
        const parts = s.split('-').map(p => p.trim());
        const toNum = (p) => {
            const m = p.match(/^([\d.]+)\s*([KMB])?$/i);
            if (!m) return null;
            const n = parseFloat(m[1]);
            if (!Number.isFinite(n)) return null;
            return n * unit((m[2] || '').toUpperCase());
        };
        const a = toNum(parts[0]);
        if (a === null) return null;
        const b = parts[1] ? toNum(parts[1]) : null;
        return b !== null ? (a + b) / 2 : a;
    }

    /** Render the call cell for overlay rows. */
    function renderOverlayCallCell(cell, targetId) {
        cell.innerHTML = '';
        const callData = state.calls[targetId];

        if (callData) {
            const tag = document.createElement('span');
            const isMine = callData.calledBy && String(callData.calledBy.id) === state.myPlayerId;
            tag.className = 'fo-called-tag ' + (isMine ? 'fo-called-mine' : 'fo-called-other')
                + (callData.isDeal ? ' fo-called-deal' : '');
            const callerName = document.createElement('span');
            callerName.className = 'fo-caller-name';
            if (callData.isDeal) {
                callerName.textContent = (isMine ? 'Mine' : (callData.calledBy ? callData.calledBy.name : 'Someone'));
            } else {
                callerName.textContent = isMine ? 'Mine' : (callData.calledBy ? callData.calledBy.name : 'Someone');
            }
            tag.appendChild(callerName);

            // Deal badge
            if (callData.isDeal) {
                const dealBadge = document.createElement('span');
                dealBadge.className = 'fo-deal-badge';
                dealBadge.textContent = '\uD83D\uDD12 Deal';
                dealBadge.title = 'Multi-hit deal \u2014 2 hour timeout';
                tag.appendChild(dealBadge);
            }
            cell.appendChild(tag);

            // Only the caller can uncall their own target
            if (isMine) {
                const uncallBtn = document.createElement('button');
                uncallBtn.className = 'fo-uncall-btn';
                uncallBtn.title = 'Uncall';
                uncallBtn.textContent = '\u2715';
                uncallBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    emitUncallTarget(targetId);
                });
                cell.appendChild(uncallBtn);
            }
        } else {
            const btn = document.createElement('button');
            btn.className = 'fo-call-btn';
            btn.textContent = 'Call';

            // Long-press / right-click = deal call
            let longPressTimer = null;
            let longPressTriggered = false;

            btn.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // only left button
                longPressTriggered = false;
                longPressTimer = setTimeout(() => {
                    longPressTriggered = true;
                    emitCallTarget(targetId, true);
                    showToast('\uD83D\uDD12 Deal call placed (2 hours)', 'info');
                }, 600);
            });
            btn.addEventListener('mouseup', () => {
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            });
            btn.addEventListener('mouseleave', () => {
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            });

            // Touch support for PDA
            btn.addEventListener('touchstart', (e) => {
                longPressTriggered = false;
                longPressTimer = setTimeout(() => {
                    longPressTriggered = true;
                    emitCallTarget(targetId, true);
                    showToast('\uD83D\uDD12 Deal call placed (2 hours)', 'info');
                }, 600);
            }, { passive: true });
            btn.addEventListener('touchend', (e) => {
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                if (longPressTriggered) { e.preventDefault(); return; }
            });
            btn.addEventListener('touchmove', () => {
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            }, { passive: true });

            // Normal click = regular call
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (longPressTriggered) return; // already handled by long-press
                emitCallTarget(targetId, false);
            });

            // Right-click = deal call (desktop)
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                emitCallTarget(targetId, true);
                showToast('\uD83D\uDD12 Deal call placed (2 hours)', 'info');
            });

            cell.appendChild(btn);
        }
    }

    /** Update footer stats. */
    function updateOverlayFooter() {
        const ids = Object.keys(state.statuses);
        const hiddenStatuses = ['federal', 'fallen', 'traveling', 'abroad'];
        let total = 0, available = 0, called = 0, hosp = 0;

        for (const tid of ids) {
            const s = state.statuses[tid] || {};
            const status = normalizeStatus(s.status);
            if (hiddenStatuses.includes(status)) continue; // skip traveling/hidden from counts
            total++;
            if (status === 'ok') available++;
            if (status === 'hospital') hosp++;
            if (state.calls[tid]) called++;
        }

        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(val);
        };
        set('fo-stat-targets', total);
        set('fo-stat-available', available);
        set('fo-stat-called', called);
        set('fo-stat-hosp', hosp);
    }

    // =========================================================================
    // SECTION 13: AUTO-SORT
    // =========================================================================

    /**
     * Sort priority for a target. Lower number = higher in the list.
     *  -1: Called by ME (pinned to top)
     *   0: High priority + online (uncalled)
     *   1: OK + online
     *   1.5: OK + idle/offline
     *   2: Hospital
     *   3: Traveling
     *   4: Jail
     *   5: Called by others (sinks to bottom)
     */
    function sortPriority(targetId) {
        const s = state.statuses[targetId];
        const status = normalizeStatus(s ? s.status : 'ok');
        const callData = state.calls[targetId];
        const isCalled = !!callData;
        const isOnline = s && s.activity === 'online';

        // Called by ME → pin to top
        if (isCalled && callData.calledBy && String(callData.calledBy.id) === state.myPlayerId) return -1;
        // Called by others → sink to bottom
        if (isCalled) return 5;

        // v5.0.14: high-priority float-to-top retired with priority feature.

        switch (status) {
            case 'ok':
                return isOnline ? 1 : 1.5;
            case 'hospital':
                return 2;
            case 'traveling':
            case 'abroad':
                return 3;
            case 'jail':
                return 4;
            case 'federal':
            case 'fallen':
                return 7;
            default:
                return 6;
        }
    }

    /** Secondary sort: remaining timer (ascending).
     *  - Hospital / jail:           time until release
     *  - Traveling with landingAt:  time until landing (closest first)
     *  - Traveling without landing: big number → bottom of travel group
     *  - Abroad (no landing):       big number → bottom of travel group
     *  - Everything else:           0
     */
    function sortTimerValue(targetId) {
        const s = state.statuses[targetId];
        if (!s) return 0;
        const status = normalizeStatus(s.status);
        if (status === 'traveling' || status === 'abroad') {
            const la = Number(s.landingAt) || 0;
            if (la > 0) return Math.max(0, la - _nowSec());
            // No landing data yet — pile at the bottom of the travel
            // group so actively-landing members take the top slots.
            return 9e9;
        }
        return statusRemainingSec(s);
    }

    // =========================================================================
    // SECTION 14: ATTACK PAGE ENHANCEMENT
    // =========================================================================

    /**
     * When on the attack page (loader.php?sid=attack), show a small overlay
     * with call info for the current target.
     */
    function createAttackOverlay() {
        const targetId = getAttackTargetId();
        if (!targetId) {
            console.warn('[FactionOps] Could not find target ID in URL for Assist button.');
            return;
        }

        log('Attack page detected — target:', targetId);

        const overlay = document.createElement('div');
        overlay.className = 'wb-attack-overlay';
        overlay.id = 'wb-attack-overlay';

        overlay.innerHTML = `
            <h4>FactionOps</h4>
            <div class="wb-attack-row">
                <span>Target:</span>
                <span id="wb-atk-target">#${escapeHtml(targetId)}</span>
            </div>
            <div class="wb-attack-row">
                <span>Call:</span>
                <span id="wb-atk-call">--</span>
            </div>
            <div class="wb-attack-row">
                <span>Also here:</span>
                <span id="wb-atk-viewers" style="color:#a29bfe;">--</span>
            </div>
            <div style="margin-top:8px;">
                <button class="wb-btn wb-btn-sm" id="wb-atk-uncall">Quick Uncall</button>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('wb-atk-uncall').addEventListener('click', () => {
            emitUncallTarget(targetId);
        });

        updateAttackOverlay(targetId);
    }

    /** Update attack overlay with current state for the given target. */
    function updateAttackOverlay(targetId) {
        const callEl = document.getElementById('wb-atk-call');
        if (!callEl) return;

        const callData = state.calls[targetId];
        if (callData && callData.calledBy) {
            callEl.textContent = `Called by ${callData.calledBy.name}`;
            callEl.style.color = 'var(--wb-call-green)';
        } else {
            callEl.textContent = 'Uncalled';
            callEl.style.color = 'var(--wb-text)';
        }

        // Update viewers (others on this same attack page)
        const viewersEl = document.getElementById('wb-atk-viewers');
        if (viewersEl) {
            const viewers = (state.viewers[targetId] || []).filter(
                v => String(v.id) !== state.myPlayerId
            );
            if (viewers.length > 0) {
                viewersEl.textContent = viewers.map(v => v.name).join(', ');
                viewersEl.style.color = viewers.length >= 2 ? '#ff7675' : '#a29bfe';
            } else {
                viewersEl.textContent = 'None';
                viewersEl.style.color = 'var(--wb-text)';
            }
        }
    }

    /**
     * Create the floating ASSIST button on attack pages.
     * Sends a request for backup to all faction members.
     */
    // v5.0.75: draggable Retal/Assist button helper. Restores saved
    // position on create; persists on drop. Suppresses click event
    // if the pointer moved more than 3px so dragging never fires a
    // stray retal request.
    function makeAssistBtnDraggable(btn, mode) {
        const KEY = 'wb_assist_btn_pos_' + (mode || 'default');
        try {
            const saved = GM_getValue(KEY, null);
            const pos = saved && typeof saved === 'string' ? JSON.parse(saved) : saved;
            if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                const x = Math.max(0, Math.min(window.innerWidth - 60, pos.x));
                const y = Math.max(0, Math.min(window.innerHeight - 40, pos.y));
                btn.style.left = x + 'px';
                btn.style.top = y + 'px';
                btn.style.right = 'auto';
                btn.style.bottom = 'auto';
            }
        } catch (_) { }
        let dragging = false, moved = false, startX = 0, startY = 0, btnX = 0, btnY = 0;
        const onDown = (e) => {
            const t = e.touches ? e.touches[0] : e;
            dragging = true; moved = false;
            startX = t.clientX; startY = t.clientY;
            const r = btn.getBoundingClientRect();
            btnX = r.left; btnY = r.top;
            btn.style.transition = 'none';
        };
        const onMove = (e) => {
            if (!dragging) return;
            const t = e.touches ? e.touches[0] : e;
            const dx = t.clientX - startX, dy = t.clientY - startY;
            if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moved = true;
            if (!moved) return;
            btn.style.left = Math.max(0, Math.min(window.innerWidth - btn.offsetWidth, btnX + dx)) + 'px';
            btn.style.top = Math.max(0, Math.min(window.innerHeight - btn.offsetHeight, btnY + dy)) + 'px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
            if (e.cancelable) e.preventDefault();
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            btn.style.transition = '';
            if (moved) {
                try { GM_setValue(KEY, JSON.stringify({ x: btn.offsetLeft, y: btn.offsetTop })); } catch (_) { }
                const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); btn.removeEventListener('click', swallow, true); };
                btn.addEventListener('click', swallow, true);
                setTimeout(() => btn.removeEventListener('click', swallow, true), 200);
            }
        };
        btn.addEventListener('mousedown', onDown);
        btn.addEventListener('touchstart', onDown, { passive: true });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchend', onUp);
        document.addEventListener('touchcancel', onUp);
    }

    function createAssistButton() {
        if (document.getElementById('wb-assist-btn')) return;

        const targetId = getAttackTargetId();
        if (!targetId) {
            // Torn React takes a moment to render the DOM, retry a few times
            if (window.location.href.includes('sid=attack') || window.location.href.includes('profiles.php')) {
                setTimeout(createAssistButton, 1000);
            }
            return;
        }

        // Retal mode on standalone profile pages (profiles.php?XID=...);
        // classic Assist on attack pages. Same backend endpoint, different
        // mode / wording / icon.
        const isProfilePage = window.location.href.includes('profiles.php');
        const mode = isProfilePage ? 'retal' : 'assist';
        const label = isProfilePage ? 'Retal' : 'Assist';
        const svgPath = isProfilePage
            ? 'M12 5V1L5 8l7 7v-4a6 6 0 0 1 6 6 6 6 0 0 1-6 6 6 6 0 0 1-6-6H4a8 8 0 0 0 8 8 8 8 0 0 0 8-8 8 8 0 0 0-8-8Z'
            : 'M6.92 5 5 6.92l6.31 6.31-2.18 2.18a2.4 2.4 0 1 0 1.06 1.06l2.18-2.18 2.17 2.17a2.4 2.4 0 1 0 1.06-1.06L13.43 13.3 19.74 7 17.82 5.08l-5.51 5.51-5.39-5.59Z';

        const btn = document.createElement('button');
        btn.id = 'wb-assist-btn';
        btn.dataset.mode = mode;
        btn.innerHTML = `
            <svg class="wb-assist-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="${svgPath}"/>
            </svg>
            <span>${label}</span>
        `;

        // v5.0.75: make the profile-page Retal button draggable. Persists
        // position per-mode (retal vs assist save separately) via
        // GM_setValue. CSS default is bottom-right; first drag overrides
        // and sticks. Click suppressed if we actually moved (>3px) so
        // drag-to-reposition doesn't fire the retal request.
        makeAssistBtnDraggable(btn, mode);

        let cooldownTimer = null;

        btn.addEventListener('click', async () => {
            if (btn.disabled) return;

            // Retal mode allows a missing warId — the server picks any
            // active war for the caller's faction as the broadcast room.
            const warId = deriveWarId();
            if (!warId && mode === 'assist') {
                showToast('Not connected to a war', 'warning');
                return;
            }

            // v5.0.40: extract target name. Profile pages (profiles.php)
            // don't have any of the attack-page selectors, so retal
            // notifications were falling back to "Player [<id>]" / bare
            // user ID. Try a wider net plus document.title and the
            // FactionOps state lookup before falling back.
            let targetName = null;
            const nameSelectors = [
                // Attack page (defender side)
                '.defender .username',
                '[class*="defender"] [class*="userName"]',
                '.playersModelWrap .right .username',
                '[class*="user-information"] [class*="username"]',
                // Profile page (top header — multiple Torn variants)
                '[class*="profile-_username"]',
                '[class*="user-information-name"]',
                '.user-info-name',
                'h4[class*="title"]',
            ];
            for (const sel of nameSelectors) {
                try {
                    const el = document.querySelector(sel);
                    const txt = el && (el.textContent || '').trim();
                    if (txt && !/^\s*\[?\d+\]?\s*$/.test(txt) && txt.length < 40) {
                        targetName = txt;
                        break;
                    }
                } catch (_) { /* invalid selector — keep going */ }
            }
            // document.title fallback — Torn profile pages set it to
            // something like "PlayerName | TORN" or "PlayerName [123456] - TORN".
            if (!targetName && isProfilePage) {
                const title = (document.title || '').trim();
                const m = title.match(/^([^|\-\[]+?)(?:\s*[\[|-]|\s*$)/);
                const candidate = m && m[1] && m[1].trim();
                if (candidate && !/^\s*\[?\d+\]?\s*$/.test(candidate) && candidate.length < 40) {
                    targetName = candidate;
                }
            }
            // FactionOps state lookup (war enemies / our faction members).
            if (!targetName && targetId) {
                const id = String(targetId);
                if (Array.isArray(state.onlinePlayers)) {
                    const m = state.onlinePlayers.find(p => String(p.id) === id);
                    if (m && m.name) targetName = m.name;
                }
                if (!targetName && state.memberBars && state.memberBars[id] && state.memberBars[id].name) {
                    targetName = state.memberBars[id].name;
                }
            }

            try {
                await postAction('/api/assist-request', {
                    warId: warId || null,
                    targetId,
                    targetName: targetName || `Player [${targetId}]`,
                    mode,
                });
                showToast(mode === 'retal' ? 'Retal request sent!' : 'Assist request sent!', 'success');
            } catch (err) {
                showToast(`Failed to send ${mode} request`, 'error');
                return;
            }

            // Disable for 30 seconds to prevent spam. Snapshot the
            // original label/icon HTML so the cooldown reset restores
            // mode-appropriate content (e.g. "Retal" on profile pages
            // instead of the old hardcoded "Assist").
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            let remaining = 30;
            btn.innerHTML = `⏳ ${remaining}s`;
            cooldownTimer = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(cooldownTimer);
                    cooldownTimer = null;
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                } else {
                    btn.innerHTML = `⏳ ${remaining}s`;
                }
            }, 1000);
        });

        document.body.appendChild(btn);
    }

    // =========================================================================
    // SECTION 15: FETCH / XHR INTERCEPTION
    // =========================================================================

    /**
     * Intercept window.fetch to passively capture Torn's own API responses.
     * This lets us extract status data, attack results, and chain info without
     * making our own API calls (saving rate-limit budget).
     */
    function installFetchInterceptor() {
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const response = await originalFetch.apply(this, args);
            try {
                const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
                if (typeof url === 'string' && (url.includes('api.torn.com') || url.includes('torn.com'))) {
                    const clone = response.clone();
                    clone.json().then((data) => {
                        handleInterceptedData(url, data);
                    }).catch(() => { /* ignore parse failures */ });
                }
            } catch (e) {
                // Interception must never break the page
            }
            return response;
        };
        log('Fetch interceptor installed');
    }

    /**
     * Intercept XMLHttpRequest for older Torn code paths that still use XHR.
     */
    function installXHRInterceptor() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._wbUrl = url;
            return originalOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function (...args) {
            if (this._wbUrl && typeof this._wbUrl === 'string' && this._wbUrl.includes('api.torn.com')) {
                this.addEventListener('load', function () {
                    try {
                        const data = JSON.parse(this.responseText);
                        handleInterceptedData(this._wbUrl, data);
                    } catch (e) {
                        // Ignore
                    }
                });
            }
            return originalSend.apply(this, args);
        };
        log('XHR interceptor installed');
    }

    /**
     * Process intercepted Torn API data.
     * We look for faction member data, chain status, and attack results.
     */
    function handleInterceptedData(url, data) {
        if (!data || data.error) return;

        // Faction member data (may contain member statuses)
        // GUARD: Only update members the server already told us are enemy targets.
        // Without this, Torn's own-faction member list (loaded on factions.php?step=your)
        // leaks into state.statuses before the server has sent enemyStatuses,
        // causing the overlay to briefly show our own faction members.
        if (data.members) {
            const statusBatch = {};
            const memberList = Array.isArray(data.members)
                ? data.members.map(m => [String(m.id), m])
                : Object.entries(data.members);
            for (const [memberId, member] of memberList) {
                const mid = String(memberId);
                // Skip members not already known as enemy targets
                if (!state.statuses[mid]) continue;
                const statusInfo = parseInterceptedMemberStatus(member);
                if (statusInfo) {
                    // Preserve existing name/level if this payload doesn't provide them
                    const existing = state.statuses[mid] || {};
                    if (!statusInfo.name && existing.name) statusInfo.name = existing.name;
                    if (statusInfo.level == null && existing.level != null) statusInfo.level = existing.level;
                    statusBatch[mid] = statusInfo;
                }
            }

            // Use monotonic merge so intercepted API can't bump timers up
            if (Object.keys(statusBatch).length > 0) {
                log('[intercept] ' + (Array.isArray(data.members) ? 'v2' : 'v1') + ' members payload → ' + Object.keys(statusBatch).length + ' enemy status update(s)');
                mergeStatusesMonotonic(statusBatch);

                // Peer relay — report changes to server for other faction members
                queuePeerRelay(statusBatch);
            }

            // Update DOM for each affected target
            for (const targetId of Object.keys(statusBatch)) {
            }

            // Refresh the Next Up queue after status changes
        }

        // Chain data — intercepted API is the fast path for timeout
        if (data.chain) {
            const chain = data.chain;
            state.chain.current = chain.current || 0;
            state.chain.max = chain.max || 0;
            let adjustedTimeout = chain.timeout || 0;
            // Compensate for Torn API cache age
            if (data.timestamp && adjustedTimeout > 0) {
                const cacheAge = Math.floor(Date.now() / 1000) - data.timestamp;
                if (cacheAge > 0 && cacheAge < 300) {
                    adjustedTimeout = Math.max(0, adjustedTimeout - cacheAge);
                }
            }
            setChainTimeout(adjustedTimeout, 'intercept');
            state.chain.cooldown = chain.cooldown || 0;
            chainCooldownSetAt = Date.now();
            chainCooldownSetVal = state.chain.cooldown;
            updateChainBar();
            // Forward chain data to server so all faction members see it instantly
        }

        // Ranked war data — extract enemy faction
        if (data.rankedwars && typeof data.rankedwars === 'object') {
            for (const [wid, warData] of Object.entries(data.rankedwars)) {
                const factions = warData.factions;
                if (!factions || typeof factions !== 'object') continue;
                const fids = Object.keys(factions);
                if (fids.length !== 2) continue;
                const myFid = state.myFactionId;
                if (!myFid) continue;
                const enemyFid = fids.find(f => String(f) !== String(myFid));
                if (enemyFid && state.enemyFactionId !== enemyFid) {
                    // Remember which war we flipped AWAY from, and when. The
                    // server detects a war change on its own schedule, so for
                    // a short window after this it keeps echoing the OLD
                    // enemy id alongside the OLD war's complete roster — a
                    // payload that looks fully authoritative. Without this
                    // record, applyServerData's change detection would treat
                    // that echo as a real change and revert us to the dead
                    // war, hiding every genuine new-war target right when the
                    // chain starts. This intercept read Torn's own payload,
                    // so it outranks a server echo until the server catches up.
                    _intentionalEnemyFlipFrom = state.enemyFactionId ? String(state.enemyFactionId) : null;
                    _intentionalEnemyFlipAt = Date.now();

                    // WIPE STALE WAR DATA if enemy changed (bug fix)
                    state.statuses = {};
                    state.calls = {};
                    state.priorities = {};
                    // The allow-list is per-war. Ids confirmed against the
                    // PREVIOUS enemy would otherwise keep vouching for
                    // themselves after the war changed.
                    resetConfirmedEnemyIds();

                    state.enemyFactionId = enemyFid;
                    state.enemyFactionName = factions[enemyFid]?.name || null;
                    log('Intercepted ranked war — enemy faction:', enemyFid, state.enemyFactionName);
                    const enemyEl = document.getElementById('fo-enemy-name');
                    if (enemyEl && state.enemyFactionName) enemyEl.textContent = state.enemyFactionName;

                    pollOnce();
                }
            }
        }

        // Single-player profile data — shape returned by /user/:id?selections=profile
        // and a few of Torn's internal profile fetches. Near-zero-latency update
        // for whichever enemy a teammate is currently looking at.
        if (data.player_id && data.status && typeof data.status === 'object' && !data.members) {
            const mid = String(data.player_id);
            // Only update enemies we already track — don't leak arbitrary profile views.
            if (state.statuses[mid]) {
                const statusInfo = parseInterceptedMemberStatus(data);
                if (statusInfo) {
                    const existing = state.statuses[mid];
                    if (!statusInfo.name && existing.name) statusInfo.name = existing.name;
                    if (statusInfo.level == null && existing.level != null) statusInfo.level = existing.level;
                    const batch = { [mid]: statusInfo };
                    mergeStatusesMonotonic(batch);
                    queuePeerRelay(batch);
                    log(`[profile-intercept] Updated ${mid} from profile response`);
                }
            }
        }

        // Attack result — a teammate's attack just resolved.
        //
        // Two independent flows here:
        //   A. If the target was hospitalized, flip status locally and
        //      peer-relay (fastest possible signal; no Torn API cache in
        //      the way). Auto-uncall then fires via mergeStatusesMonotonic's
        //      status-transition hook.
        //   B. If the target was attacked/mugged (non-hospital successful
        //      hit), the call is still "spent" — your own hit landed, the
        //      target isn't a useful target for you right now. Uncall MY
        //      call directly (scoped to calledBy.id === myPlayerId).
        if (data.result) {
            log('Attack result intercepted:', data.result);
            const targetId = getAttackTargetId();
            if (targetId) {
                // ── A: hospital flip ───────────────────────────────────
                if (data.result.hospitalized) {
                    const minutesFromResult =
                        (typeof data.result.hospitalized === 'object' && data.result.hospitalized.minutes) ||
                        data.result.hospital_time ||
                        data.result.hospitalTime ||
                        (data.result.hospital && data.result.hospital.minutes) ||
                        0;
                    const untilSec = minutesFromResult > 0 ? minutesFromResult * 60 : 30 * 60;
                    const existing = state.statuses[targetId] || {};
                    const statusInfo = {
                        status: 'hospital',
                        until: untilSec,
                        description: 'Hospitalized',
                        activity: 'offline',
                    };
                    if (existing.name) statusInfo.name = existing.name;
                    if (existing.level != null) statusInfo.level = existing.level;

                    const batch = { [targetId]: statusInfo };
                    mergeStatusesMonotonic(batch);
                    queuePeerRelay(batch);
                    log(`[attack-result] Target ${targetId} marked hospital (${minutesFromResult || '~30'}m)`);
                    // Auto-uncall on hospital runs via maybeAutoUncallOnHospital
                    // inside mergeStatusesMonotonic.
                }

                // ── B: direct uncall on any successful hit outcome ─────
                // Attacked / Mugged / (defeated / special variants) all
                // mean "my hit landed, this call is done." Hospital is a
                // superset of this — covered too.
                const hitOutcomes =
                    data.result.hospitalized ||
                    data.result.mugged ||
                    data.result.attacked ||
                    data.result.leave ||
                    data.result.special;
                if (hitOutcomes) {
                    const existingCall = state.calls[targetId];
                    if (existingCall && existingCall.calledBy &&
                        String(existingCall.calledBy.id) === String(state.myPlayerId)) {
                        emitUncallTarget(targetId);
                        log(`[attack-result] Auto-uncalled #${targetId} after successful hit`);
                    }
                }
            }
        }
    }

    /**
     * Parse a Torn member object into our status format.
     */
    function parseInterceptedMemberStatus(member) {
        if (!member) return null;

        let status = 'ok';
        let until = 0;
        let description = '';
        let activity = 'offline';
        const name = member.name || null;
        const level = member.level != null ? Number(member.level) : null;

        // Status
        if (member.status) {
            const s = member.status;
            const state_str = (s.state || '').toLowerCase();
            // Use Date.now()/1000 (not Math.floor) for sub-second precision —
            // avoids rounding that causes timers to jump up by ~1s.
            const nowSec = Date.now() / 1000;
            if (state_str === 'hospital') {
                status = 'hospital';
                until = s.until ? Math.max(0, s.until - nowSec) : 0;
            } else if (state_str === 'federal' || state_str === 'fallen') {
                status = state_str;
            } else if (state_str === 'jail') {
                status = 'jail';
                until = s.until ? Math.max(0, s.until - nowSec) : 0;
            } else if (state_str === 'traveling' || state_str === 'abroad') {
                status = state_str;
                description = s.description || '';
                until = s.until ? Math.max(0, s.until - nowSec) : 0;
            } else {
                status = 'ok';
            }
        }

        // Activity (online/idle/offline)
        if (member.last_action) {
            const la = member.last_action;
            if (la.status) {
                activity = la.status.toLowerCase();
            }
        }

        return { status, until, description, activity, name, level };
    }

    // =========================================================================
    // SECTION 16: MUTATION OBSERVER
    // =========================================================================

    let observer = null;

    /**
     * Check all enhanced member rows for DOM status changes.
     * Compares DOM-read status against state.statuses and forwards
     * any changes to the server so all faction members see them instantly.
     */
    let _lastDomStatusCheck = 0;

    // =========================================================================
    // SECTION 17: PERIODIC REFRESH
    // =========================================================================

    // Periodic refresh is handled by the polling loop (Section 6).

    /**
     * Periodically prune expired calls (calls older than CALL_TIMEOUT).
     */
    function startCallPruner() {
        setInterval(() => {
            const now = Date.now();
            let pruned = 0;
            for (const [targetId, callData] of Object.entries(state.calls)) {
                const timeout = callData.isDeal ? CONFIG.DEAL_TIMEOUT : CONFIG.CALL_TIMEOUT;
                if (callData.calledAt && (now - callData.calledAt) > timeout) {
                    delete state.calls[targetId];
                    pruned++;
                }
            }
            if (pruned > 0) {
                log(`Pruned ${pruned} expired calls`);
            }
        }, 30000); // check every 30s
    }

    // =========================================================================
    // SECTION 17B: TORN KEEP-ALIVE (ANTI-IDLE)
    // =========================================================================

    /**
     * Periodically pings the Torn API to keep the user's last_action timestamp
     * fresh while the warboard is open, preventing enemies from seeing them as
     * idle on their profile. Uses a lightweight /user/?selections=timestamp call.
     */
    let keepAliveTimer = null;
    const KEEP_ALIVE_INTERVAL = 75 * 1000; // 75 seconds

    function startKeepAlive() {
        if (keepAliveTimer) return; // already running
        if (!CONFIG.KEEP_ALIVE || !CONFIG.API_KEY) return;

        // Only run when overlay is active and war is ongoing
        if (!document.getElementById('fo-overlay') || !isWarActive()) return;

        log('Keep-alive started (interval: ' + (KEEP_ALIVE_INTERVAL / 1000) + 's)');
        keepAliveTimer = setInterval(() => {
            // Stop if overlay was removed or war ended or setting toggled off
            if (!document.getElementById('fo-overlay') || !isWarActive() || !CONFIG.KEEP_ALIVE) {
                stopKeepAlive();
                return;
            }
            keepAlivePing();
        }, KEEP_ALIVE_INTERVAL);

        // Fire one immediately so the user is marked active right away
        keepAlivePing();
    }

    function stopKeepAlive() {
        if (keepAliveTimer) {
            clearInterval(keepAliveTimer);
            keepAliveTimer = null;
            log('Keep-alive stopped');
        }
    }

    function keepAlivePing() {
        const apiKey = CONFIG.API_KEY;
        if (!apiKey) return;

        httpRequest({
            method: 'GET',
            url: 'https://api.torn.com/user/?selections=timestamp&key=' + apiKey,
            onload(res) {
                if (res.status === 200) {
                    log('Keep-alive ping OK');
                } else {
                    warn('Keep-alive ping failed: HTTP ' + res.status);
                }
            },
            onerror() {
                warn('Keep-alive ping network error');
            },
        });
    }

    // =========================================================================
    // SECTION 18: PAGE DETECTION & ROUTER
    // =========================================================================

    /**
     * Detect if the current page is a war page vs a regular faction page.
     * Torn war pages have specific URL hashes or DOM elements that distinguish
     * them from the member list, info tab, etc.
     */
    function isWarContext() {
        const hash = window.location.hash.toLowerCase();
        const url = window.location.href.toLowerCase();

        // war.php is always a war page
        if (url.includes('war.php')) return true;

        // Hash-based war indicators on factions.php
        if (hash.includes('war') || hash.includes('ranked')) return true;

        // DOM-based detection: look for war-specific elements
        const warDomIndicators = [
            '.faction-war',
            '.ranked-war-list',
            '.f-war-list',
            '#faction-war-list',
            '#war-root',
            '.war-main',
            '.war-list',
            '[class*="warList"]',
            '[class*="rankedWar"]',
            '[class*="raidWar"]',
            '.enemy-faction',
        ];
        for (const sel of warDomIndicators) {
            if (document.querySelector(sel)) return true;
        }

        return false;
    }

    /**
     * Calls-only mode: connect, watch the member list, mark called rows.
     *
     * Deliberately does NOT call initWarOverlay(). That builds the overlay,
     * hides Torn's own page content, and starts four timers (chain, statuses,
     * call pruner, keep-alive). None of that is needed to answer "is this one
     * taken", and the overlay is a live suspect for phone lag.
     *
     * It DOES need the connection: on a war page nothing authenticates until
     * the button is pressed, so without this there is no calls data at all.
     */
    let callsOnlyStarted = false;
    async function startCallsOnlyMode() {
        if (callsOnlyStarted) return;
        callsOnlyStarted = true;

        // Draw before authenticating. None of the row furniture needs a token
        // -- the buttons, the hospital timers, the filter bar and the sort all
        // read the DOM and local state -- only ACTING on a call does. Waiting
        // on a server round trip first is why the page sat there looking dead
        // for ten to fifteen seconds while FFScouter, which waits for nothing,
        // had its numbers in already.
        //
        // Before auth state.calls is empty, so every row simply reads CALL;
        // the real call state arrives with the first poll and repaints.
        try { markCalledRows(); } catch (_) { }

        // The war list is a React table that repaints on its own, so a one-off
        // pass loses the marks the moment Torn re-renders a row. Attached here
        // rather than after auth so a list that paints late is still caught.
        //
        // 5.2.52: this observer used to call markCalledRows() directly, and
        // markCalledRows WRITES INTO THE SUBTREE IT WATCHES — call buttons,
        // hospital chips, an inline `order` on every row. Each write raised
        // more mutations, which ran it again: a loop with nothing to stop it,
        // across ninety-eight rows, which is what was heating Android phones.
        //
        // Two guards now. The observer is disconnected for the duration of the
        // pass, so our own writes are never recorded; and the callback is
        // debounced, so a React repaint that arrives as fifty mutations costs
        // one pass instead of fifty.
        var moHost = findMemberContainerStrict();
        var MO_OPTS = { childList: true, subtree: true };
        var moTimer = null, mo = null;
        var markSafely = function () {
            if (mo) mo.disconnect();
            try { markCalledRows(); } catch (_) { }
            if (mo && moHost && document.contains(moHost)) mo.observe(moHost, MO_OPTS);
        };
        if (moHost) {
            try {
                mo = new MutationObserver(function () {
                    if (moTimer) return;
                    moTimer = setTimeout(function () { moTimer = null; markSafely(); }, 250);
                });
                mo.observe(moHost, MO_OPTS);
            } catch (_) { }
        }
        // Without a specific container there is no observer at all. The old
        // fallback watched document.body with subtree:true — every change any
        // script made anywhere on the page triggered a full 98-row repaint.
        // The five-second sweep below is the net for a list that appears late.
        setInterval(function () { markSafely(); }, 5000);

        try {
            if (!state.jwtToken) await authenticate();
            if (!state.jwtToken) return;          // no key saved: nothing to show
            startPolling();
            connectRealtime();
        } catch (e) {
            log('calls-only: not connecting (' + (e && e.message) + ')');
            return;
        }
        markCalledRows();   // repaint with real call state now that it can arrive
    }

    function detectPageAndInit() {
        const url = window.location.href;

        if (url.includes('sid=attack') || url.includes('profiles.php')) {
            log('Page: Attack');
            initAttackPage();
        } else if (url.includes('factions.php') || url.includes('war.php')) {
            log('Page: Faction/War — showing activate button');
            showActivateButton();
            // Calls-only mode runs alongside the activate button: it marks
            // called rows on Torn's own war page, so the one thing a member
            // needs mid-war -- has somebody already got this target -- is
            // visible without opening the overlay at all.
            startCallsOnlyMode();
        } else {
            log('Page: Unknown — running in passive mode');
            // Re-create settings/heatmap if they were removed on an attack page
            if (!document.querySelector('.wb-settings-gear')) createSettingsGear();
            if (!document.getElementById('wb-heatmap-toggle')) createHeatmapButton();
        }
    }

    /** Initialise attack page enhancements. */
    function initAttackPage() {
        // Remove FactionOps overlay if it exists (shouldn't be on attack pages)
        const foOverlay = document.getElementById('fo-overlay');
        if (foOverlay) {
            foOverlay.remove();
        }
        const foActivateBtn = document.getElementById('fo-activate-btn');
        if (foActivateBtn) {
            foActivateBtn.remove();
        }
        // Remove settings gear and heatmap button from attack pages
        const settingsGear = document.querySelector('.wb-settings-gear');
        if (settingsGear) settingsGear.remove();
        const heatmapBtn = document.getElementById('wb-heatmap-toggle');
        if (heatmapBtn) heatmapBtn.remove();
        const heatmapPanel = document.getElementById('wb-heatmap-panel');
        if (heatmapPanel) heatmapPanel.remove();
        // Restore Torn's main content if it was hidden
        const mainContent = document.getElementById('mainContainer')
            || document.querySelector('.content-wrapper');
        if (mainContent && mainContent.dataset.foHidden === 'true') {
            for (const child of Array.from(mainContent.children)) {
                if (child.id === 'fo-overlay') continue;
                if ('foPrevDisplay' in child.dataset) {
                    child.style.display = child.dataset.foPrevDisplay;
                    delete child.dataset.foPrevDisplay;
                } else {
                    child.style.display = '';
                }
            }
            delete mainContent.dataset.foHidden;
        }

        startStatusTimers();

        // Report viewing target to server (so war page shows who's on which attack)
        const targetId = getAttackTargetId();
        if (targetId) {
            reportViewing(targetId);
        }

        // Show the floating Assist button
        createAssistButton();

        // Scrape the attack-page DOM for the target's visible status. Torn
        // populates this sidebar text lazily, so retry a handful of times
        // over ~15s to catch it once it renders.
        scheduleAttackPageStatusScrape();
    }

    /**
     * Retry-driven scrape of the attack page's visible target status.
     * Zero API cost — we already loaded this page. Peer-relays whatever
     * we parse so the rest of the faction sees the update within ~500ms.
     */
    function scheduleAttackPageStatusScrape() {
        let attempts = 0;
        // Scrape every 1s for 60s so we catch the target's post-attack
        // status transition (hospital/mugged/etc.) whenever Torn's sidebar
        // updates. Don't early-exit on first success — the first read just
        // reflects pre-attack state, and we need subsequent reads to catch
        // the transition that triggers auto-uncall.
        const maxAttempts = 60;
        const intervalMs = 1000;
        const timer = setInterval(() => {
            readAttackTargetStatusFromDOM();
            attempts += 1;
            if (attempts >= maxAttempts) {
                clearInterval(timer);
            }
        }, intervalMs);
        // Also try once immediately in case the DOM is already there.
        setTimeout(readAttackTargetStatusFromDOM, 250);
    }

    /**
     * Parse the attack page sidebar for target status text (hospital / jail /
     * okay / traveling / fallen). Returns true if a status was extracted.
     * Narrow: only updates an enemy we already track, so rogue DOM reads
     * can't pollute state.
     */
    function readAttackTargetStatusFromDOM() {
        const targetId = getAttackTargetId();
        if (!targetId || !state.statuses[targetId]) return false;

        const raw = extractAttackPageStatusText();
        if (!raw) return false;

        const lower = raw.toLowerCase();
        let status = null;
        let until = 0;
        let description = raw.length < 120 ? raw : '';

        if (lower.includes('hospital')) {
            status = 'hospital';
            // Parse durations: "1h 23m", "45m", "23 minutes", etc.
            const hm = lower.match(/(\d+)\s*h(?:our)?s?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?/);
            if (hm) {
                const h = Number(hm[1]) || 0;
                const mm = Number(hm[2]) || 0;
                until = (h * 60 + mm) * 60;
            } else {
                const mOnly = lower.match(/(\d+)\s*m(?:in(?:ute)?s?)?/);
                if (mOnly) until = Number(mOnly[1]) * 60;
            }
        } else if (lower.includes('jail')) {
            status = 'jail';
            const mOnly = lower.match(/(\d+)\s*m(?:in(?:ute)?s?)?/);
            if (mOnly) until = Number(mOnly[1]) * 60;
        } else if (lower.includes('traveling') || lower.includes('abroad')
            || lower.includes('in ') && /in\s+(mexico|japan|canada|hawaii|uk|switzerland|china|argentina|south africa|cayman)/i.test(raw)) {
            status = lower.includes('traveling') ? 'traveling' : 'abroad';
        } else if (lower.includes('federal')) {
            status = 'federal';
        } else if (lower.includes('fallen')) {
            status = 'fallen';
        } else if (lower.includes('okay') || /^\s*ok\b/i.test(raw)) {
            status = 'ok';
        } else {
            return false;
        }

        const existing = state.statuses[targetId];
        const statusInfo = {
            status, until, description,
            activity: existing.activity || 'offline',
            name: existing.name || null,
            level: existing.level != null ? existing.level : null,
        };

        const batch = { [targetId]: statusInfo };
        mergeStatusesMonotonic(batch);
        queuePeerRelay(batch);
        log(`[attack-dom] Target ${targetId} status from DOM: ${status}${until ? ` (${Math.round(until / 60)}m)` : ''}`);
        return true;
    }

    function extractAttackPageStatusText() {
        // Torn's attack page renders the opponent status in a couple of
        // places depending on version. Try several; take the first that
        // contains one of the recognisable status words.
        const needles = ['hospital', 'jail', 'okay', 'traveling', 'abroad', 'federal', 'fallen'];
        const candidates = [
            ...document.querySelectorAll('[class*="playerStatus"]'),
            ...document.querySelectorAll('[class*="userStatus"]'),
            ...document.querySelectorAll('[class*="statusText"]'),
            ...document.querySelectorAll('.info-table [class*="status"]'),
            ...document.querySelectorAll('[class*="user-info"] [class*="status"]'),
            ...document.querySelectorAll('.status-display'),
            ...document.querySelectorAll('[class*="status"][class*="wrap"]'),
        ];
        for (const el of candidates) {
            const text = (el.textContent || '').trim();
            if (!text || text.length > 200) continue;
            const lower = text.toLowerCase();
            if (needles.some(n => lower.includes(n))) return text;
        }
        return null;
    }

    /** Report to the server which target we're currently viewing. */
    function reportViewing(targetId) {
        if (!state.connected) return;
        postAction('/api/viewing', { targetId }).catch(() => { });
    }

    /** Clear viewing status when leaving the attack page. */
    function clearViewing() {
        if (!state.connected) return;
        postAction('/api/viewing', { targetId: null }).catch(() => { });
    }

    // =========================================================================
    // SECTION 19: CALL EXPIRY VISUAL FEEDBACK
    // =========================================================================

    /* v5.1.64: updateCallAges deleted — a self-rearming requestAnimationFrame loop
       that could never do anything. It looked up `wb-call-<id>` ids belonging to
       the in-page row enhancer, which was itself unreachable and has since been
       deleted outright (5.2.45). So every lookup missed while the loop held the
       render pipeline off frame-idle at ~60fps, on every matched Torn page,
       with its handle never stored so nothing could cancel it. If call-age
       fading is wanted again, target `fo-call-<id>` from the existing 1Hz
       accumulator, not rAF. */

    // =========================================================================
    // SECTION 20: TAB COORDINATION
    // =========================================================================

    /**
     * Use BroadcastChannel to coordinate between multiple Torn tabs running
     * FactionOps. This prevents duplicate socket connections and keeps state in
     * sync across tabs.
     */
    let broadcastChannel = null;

    function setupTabCoordination() {
        try {
            broadcastChannel = new BroadcastChannel('factionops_sync');
            broadcastChannel.onmessage = (event) => {
                const msg = event.data;
                if (!msg || !msg.type) return;

                switch (msg.type) {
                    case 'state_update':
                        // Another tab pushed a state change
                        if (msg.calls) state.calls = { ...state.calls, ...msg.calls };
                        if (msg.priorities) state.priorities = { ...state.priorities, ...msg.priorities };
                        if (msg.statuses) mergeStatusesMonotonic(msg.statuses);
                        if (msg.warScores) state.warScores = msg.warScores;
                        if (msg.warEta) state.warEta = msg.warEta;

                        if ((msg.chain || msg.chainData) && !CHAIN_POLL_ONLY) {
                            const c = msg.chain || msg.chainData;
                            const { timeout, cooldown, ...rest } = c;
                            Object.assign(state.chain, rest);
                            if (timeout != null) {
                                setChainTimeout(timeout);
                            }
                            if (cooldown != null) {
                                state.chain.cooldown = cooldown;
                                chainCooldownSetAt = Date.now();
                                chainCooldownSetVal = cooldown;
                            }
                        }
                        updateChainBar();
                        if (typeof updateWarTimer === 'function') updateWarTimer();
                        if (typeof updateWarTimerDisplay === 'function') updateWarTimerDisplay();
                        break;
                    case 'call_update':
                        break;
                    case 'war_update':
                        if (msg.pct !== undefined) {
                            state.warPercentage = msg.pct;
                            const val = document.getElementById('fo-war-timer-value');
                            if (val) val.textContent = msg.pct + '%';
                        }
                        break;
                }
            };
            log('Tab coordination via BroadcastChannel active');
        } catch (e) {
            warn('BroadcastChannel not available — tab sync disabled');
        }
    }

    /** Broadcast a state change to other tabs. */
    function broadcastStateChange(data) {
        if (broadcastChannel) {
            try {
                broadcastChannel.postMessage(data);
            } catch (e) {
                // Ignore — might fail if channel is closed
            }
        }
    }

    // =========================================================================
    // SECTION 21: KEYBOARD SHORTCUTS
    // =========================================================================

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Alt+W: toggle settings
            if (e.altKey && e.key === 'w') {
                e.preventDefault();
                toggleSettings();
            }
            // Escape: close settings
            if (e.key === 'Escape' && state.ui.settingsOpen) {
                closeSettings();
            }
        });
    }

    // =========================================================================
    // SECTION 22: NOTIFICATION HELPERS
    // =========================================================================

    /**
     * Show a brief toast notification at the top of the page.
     * Used for events like "Target called" or "Chain approaching bonus".
     */
    // ── Call toasts ──
    // v5.0.81: auto-dismiss after 2s (was: persistent-until-uncalled).
    // User reported toasts were piling up on the page, especially on PDA.
    // removeCallToast() is still called when a target gets uncalled so a
    // toast that's still visible gets cleared early.
    const activeCallToasts = new Map();    // targetId → toast element
    const callToastTimers = new Map();     // targetId → setTimeout handle

    function ensureCallToastContainer() {
        let container = document.getElementById('fo-call-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'fo-call-toast-container';
            container.style.cssText = `
                position: fixed;
                top: ${state.ui.chainBar ? '52px' : '10px'};
                left: 50%;
                transform: translateX(-50%);
                z-index: 1000001;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }
        return container;
    }

    function showCallToast(targetId, message) {
        // Remove existing toast for this target if any
        removeCallToast(targetId);

        const container = ensureCallToastContainer();
        const toast = document.createElement('div');
        toast.style.cssText = `
            padding: 8px 18px;
            border-radius: 6px;
            font-family: Arial, sans-serif;
            font-size: 13px;
            color: #fff;
            background: var(--wb-accent);
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
            white-space: nowrap;
        `;
        toast.textContent = message;
        container.appendChild(toast);
        activeCallToasts.set(targetId, toast);

        requestAnimationFrame(() => { toast.style.opacity = '1'; });

        // v5.0.81: auto-dismiss after 2s.
        const timer = setTimeout(() => removeCallToast(targetId), 2000);
        callToastTimers.set(targetId, timer);
    }

    function removeCallToast(targetId) {
        // Clear any pending auto-dismiss timer so it doesn't fire after
        // the element is already gone.
        const t = callToastTimers.get(targetId);
        if (t) { clearTimeout(t); callToastTimers.delete(targetId); }
        const toast = activeCallToasts.get(targetId);
        if (toast) {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
            activeCallToasts.delete(targetId);
        }
    }

    // =========================================================================
    // WAR ENDED BANNER
    // =========================================================================

    function showWarEndedBanner() {
        if (warEndedBannerShown) return;

        // Don't mark as shown until we actually insert the banner
        const nextUp = document.getElementById('fo-next-up');
        if (!nextUp) return; // overlay not ready yet, will retry on next refresh

        warEndedBannerShown = true;

        const result = state.warResult || 'unknown';
        const isVictory = result === 'victory';
        const isDefeat = result === 'defeat';
        const myScore = state.warScores?.myScore || 0;
        const enemyScore = state.warScores?.enemyScore || 0;
        const color = isVictory ? '#00b894' : isDefeat ? '#ff7675' : '#fdcb6e';
        const label = isVictory ? 'VICTORY' : isDefeat ? 'DEFEAT' : 'WAR OVER';

        // Update war timer to show result
        const timerEl = document.getElementById('fo-war-timer');
        const timerVal = document.getElementById('fo-war-timer-value');
        if (timerEl && timerVal) {
            timerEl.className = 'fo-war-timer ' + (isVictory ? 'safe' : 'danger');
            timerVal.textContent = label;
        }

        // Hide strategy bar and scout button
        const stratBar = document.getElementById('fo-strategy-bar');
        if (stratBar) stratBar.style.display = 'none';
        const scoutBtn = document.getElementById('fo-scout-btn');
        if (scoutBtn) scoutBtn.style.display = 'none';

        // Show banner above target list
        if (nextUp && !document.getElementById('fo-war-ended-banner')) {
            const banner = document.createElement('div');
            banner.id = 'fo-war-ended-banner';
            banner.style.cssText = `
                text-align:center; padding:12px 16px; margin:0;
                background:${isVictory ? 'rgba(0,184,148,0.12)' : 'rgba(214,48,49,0.12)'};
                border-bottom:1px solid ${color}40;
            `;
            banner.innerHTML = `
                <div style="font-size:20px;font-weight:800;color:${color};letter-spacing:0.1em;">${label}</div>
                <div style="font-size:13px;color:var(--wb-text);margin-top:4px;">
                    ${myScore.toLocaleString()} \u2013 ${enemyScore.toLocaleString()}
                </div>
                <div style="font-size:11px;color:var(--wb-text-muted);margin-top:4px;">Tap the clipboard icon to view the post-war report</div>
            `;
            nextUp.parentElement.insertBefore(banner, nextUp.nextSibling);
        }

        // Gray out target list
        const targetList = document.getElementById('fo-target-list');
        if (targetList) {
            targetList.style.opacity = '0.4';
            targetList.style.pointerEvents = 'none';
        }
        // Hide NEXT UP bar
        const nextUpBar = document.getElementById('fo-next-up');
        if (nextUpBar) nextUpBar.style.display = 'none';

        log('War ended: ' + label + ' (' + myScore + ' vs ' + enemyScore + ')');
    }

    // =========================================================================
    // STRATEGY INDICATOR
    // =========================================================================

    function updateStrategyBar() {
        const bar = document.getElementById('fo-strategy-bar');
        if (bar) bar.remove();
    }

    // =========================================================================
    // SCOUT REPORT
    // =========================================================================

    function openScoutReport() {
        // Don't open if already open
        if (document.getElementById('wb-scout-overlay')) return;

        const warId = deriveWarId();
        if (!warId) {
            showToast('Not connected to a war', 'error');
            return;
        }
        if (!state.enemyFactionId) {
            showToast('No enemy faction detected yet', 'error');
            return;
        }

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'wb-scout-overlay';
        overlay.id = 'wb-scout-overlay';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeScoutReport();
        });

        const modal = document.createElement('div');
        modal.className = 'wb-scout-modal';
        modal.innerHTML = `
            <div class="wb-scout-header">
                <h2>\u2694\uFE0F War Analysis</h2>
                <button class="wb-scout-close" id="wb-scout-close">\u00D7</button>
            </div>
            <div class="wb-scout-body" id="wb-scout-body">
                <div class="wb-scout-loading">
                    <div class="wb-scout-spinner"></div>
                    <span>Analyzing both factions...</span>
                </div>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.getElementById('wb-scout-close').addEventListener('click', closeScoutReport);

        // Fetch report
        fetchScoutReport(warId);
    }

    function closeScoutReport() {
        const overlay = document.getElementById('wb-scout-overlay');
        if (overlay) overlay.remove();
    }

    /** Gather all BSP/FFS stat estimates from client caches. */
    function gatherStatEstimates() {
        const estimates = {};

        // BSP predictions from localStorage
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('tdup.battleStatsPredictor.cache.prediction.')) {
                    const userId = key.replace('tdup.battleStatsPredictor.cache.prediction.', '');
                    try {
                        const pred = JSON.parse(localStorage.getItem(key));
                        if (pred && pred.TBS != null) {
                            estimates[userId] = { total: Number(pred.TBS), source: 'bsp' };
                        }
                    } catch (_) { }
                }
            }
        } catch (_) { }

        // FF Scouter from in-memory cache — override BSP if FFS has data
        for (const [id, entry] of Object.entries(ffCache)) {
            if (entry && entry.bsHuman) {
                // Parse human-readable like "3.5B", "750M" into a number
                const parsed = parseHumanStats(entry.bsHuman);
                if (parsed != null) {
                    // Only override if no BSP estimate exists (BSP is usually more accurate)
                    if (!estimates[id]) {
                        estimates[id] = { total: parsed, source: 'ffs' };
                    }
                }
            }
        }

        return estimates;
    }

    /** Parse human stat strings like "3.5B", "750M", "250K" to numbers. */
    function parseHumanStats(str) {
        if (!str || typeof str !== 'string') return null;
        const match = str.trim().match(/^([\d.]+)\s*([TGBMK])?/i);
        if (!match) return null;
        const num = parseFloat(match[1]);
        if (isNaN(num)) return null;
        const suffix = (match[2] || '').toUpperCase();
        if (suffix === 'T') return num * 1e12;
        if (suffix === 'G' || suffix === 'B') return num * 1e9;
        if (suffix === 'M') return num * 1e6;
        if (suffix === 'K') return num * 1e3;
        return num;
    }

    async function fetchScoutReport(warId) {
        try {
            const url = `${CONFIG.SERVER_URL}/api/war/${encodeURIComponent(warId)}/scout-report`;
            const estimates = gatherStatEstimates();
            const body = JSON.stringify({ estimates });
            const data = await new Promise((resolve, reject) => {
                httpRequest({
                    method: 'POST',
                    url,
                    headers: {
                        'Authorization': `Bearer ${state.jwtToken}`,
                        'Content-Type': 'application/json',
                    },
                    data: body,
                    timeout: 30000,
                    onload(r) {
                        const d = safeParse(r.responseText);
                        if (r.status >= 200 && r.status < 300) resolve(d);
                        else reject(new Error((d && d.error) || `HTTP ${r.status}`));
                    },
                    onerror() { reject(new Error('Network error')); },
                    ontimeout() { reject(new Error('Request timed out')); },
                });
            });

            if (data && data.report) {
                renderScoutReport(data.report);
            } else {
                throw new Error('Invalid response');
            }
        } catch (e) {
            warn('Scout report failed:', e.message);
            const body = document.getElementById('wb-scout-body');
            if (body) {
                body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--wb-call-red);">
                    <div style="font-size:24px;margin-bottom:8px;">\u26A0</div>
                    <div>${escapeHtml(e.message)}</div>
                </div>`;
            }
        }
    }

    function formatDuration(seconds) {
        if (seconds < 60) return seconds + 's';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
        return Math.floor(seconds / 86400) + 'd';
    }

    // Waterfall of the win-probability calculation. Renders report.winBreakdown
    // (base 50 → each factor's ± points → clamped final) as horizontal floating
    // bars on a 0–100 scale: green helps us, red hurts us, neutral = totals /
    // no-effect. Every row is labelled with its Δ so colour isn't the only channel.
    // Collapsed by default so it doesn't dominate the report.
    function renderWinWaterfall(bd) {
        if (!Array.isArray(bd) || bd.length < 2) return '';
        const GREEN = 'var(--wb-online-green, #00b894)';
        const RED = '#d63031';
        const NEUTRAL = 'var(--wb-text-muted, #636e72)';
        const final = bd[bd.length - 1];
        const finalPct = final ? final.running : '';
        // Favorability shade for the final bar: green when favored, red when not,
        // darker the stronger the edge (light near 50%, deep toward 5/95).
        const favColor = (wp) => {
            if (wp === 50) return NEUTRAL;
            const fav = wp >= 50, t = Math.min(1, Math.abs(wp - 50) / 45);
            return `hsl(${fav ? 135 : 4},${fav ? 58 : 62}%,${fav ? (66 - t * 38) : (60 - t * 22)}%)`;
        };
        const FAV = favColor(finalPct);
        // Diverging chart: every bar radiates from the even (50%) line — right &
        // green when it helps, left & red when it hurts, length = its points.
        // Symmetric domain around 50 so the centre line is dead centre.
        const net = Math.abs((finalPct || 50) - 50);
        const maxDelta = Math.max(0, ...bd.map(b => Math.abs(b.delta || 0)));
        const M = Math.max(net, maxDelta) + 4;
        const pos = (v) => ((v - (50 - M)) / (2 * M)) * 100; // value → %
        const C = pos(50);
        const rows = bd.map(b => {
            const isFinal = b.final;
            let seg;
            if (isFinal) {
                const lo = pos(Math.min(50, b.running)), hi = pos(Math.max(50, b.running));
                seg = `<div style="position:absolute;top:3px;height:14px;left:${lo}%;width:${hi - lo}%;background:${FAV};border-radius:3px;"></div>`;
            } else if (!b.delta) {
                seg = `<div style="position:absolute;top:6px;left:${C}%;width:7px;height:7px;border-radius:50%;background:${NEUTRAL};transform:translateX(-3px);"></div>`;
            } else {
                const end = pos(50 + b.delta);
                const lo = Math.min(C, end), hi = Math.max(C, end);
                const col = b.delta > 0 ? GREEN : RED;
                seg = `<div style="position:absolute;top:3px;height:14px;left:${lo}%;width:${hi - lo}%;background:${col};border-radius:3px;"></div>`;
            }
            // running-total label at its cumulative position (the 50→…→final path)
            if (!isFinal) seg += `<div style="position:absolute;top:4px;left:${pos(b.running)}%;font-size:8px;color:var(--wb-text-muted);transform:translateX(3px);font-variant-numeric:tabular-nums;">${b.running}</div>`;
            const vs = (b.us != null || b.them != null) && !isFinal
                ? `<span style="color:var(--wb-text-muted);font-weight:400;font-size:9px;"> ${b.us != null ? escapeHtml(b.us) : '—'} v ${b.them != null ? escapeHtml(b.them) : '—'}</span>` : '';
            const dLabel = isFinal ? finalPct + '%' : b.delta > 0 ? '+' + b.delta : b.delta < 0 ? '−' + Math.abs(b.delta) : '0';
            const dCol = isFinal ? FAV : b.delta > 0 ? GREEN : b.delta < 0 ? RED : NEUTRAL;
            return `<div style="display:grid;grid-template-columns:120px 1fr 40px;align-items:center;gap:6px;padding:2px 0;${isFinal ? 'border-top:1px solid var(--wb-border);margin-top:3px;padding-top:5px;' : ''}">
                <div style="font-size:10px;${isFinal ? 'font-weight:700;' : 'font-weight:600;'}">${escapeHtml(b.factor)}${vs}</div>
                <div style="position:relative;height:20px;">${seg}<div style="position:absolute;top:-2px;bottom:-2px;left:50%;width:1px;background:var(--wb-border);opacity:.5;"></div></div>
                <div style="text-align:right;font-size:11px;font-weight:700;color:${dCol};font-variant-numeric:tabular-nums;">${dLabel}</div>
            </div>`;
        }).join('');
        const clampNote = final && final.clamped ? `<div style="font-size:9px;color:var(--wb-text-muted);margin-top:3px;">Clamped to 5–95 (raw ${final.raw}).</div>` : '';
        return `<details class="wb-scout-waterfall" style="margin-bottom:8px;">
            <summary style="cursor:pointer;font-size:11px;color:var(--wb-text-muted);text-align:center;">Why ${finalPct}%? — factor breakdown</summary>
            <div style="margin-top:6px;padding:6px 4px;">
                ${rows}
                <div style="display:flex;gap:12px;justify-content:center;font-size:9px;color:var(--wb-text-muted);margin-top:5px;">
                    <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${GREEN};vertical-align:-1px;"></span> helps us</span>
                    <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${RED};vertical-align:-1px;"></span> hurts us</span>
                    <span>midline = even (50%)</span>
                </div>
                ${clampNote}
            </div>
        </details>`;
    }

    // One war's own 24-hour profile, drawn inside its expander. The combined
    // chart above answers "when do they hit"; this answers "was that this war
    // or the one before it" — a faction that pushed 03:00 in one war and 20:00
    // in the next averages to a flat line that describes neither.
    //
    // Scaled to THIS war's own peak, deliberately: against the combined maximum
    // a 485-hit war would render as a row of invisible stubs, and its shape is
    // the whole point of showing it.
    function warHourBars(w) {
        const hrs = (w && w.hoursUTC) || [];
        if (!hrs.length) return '';
        const max = Math.max(...hrs, 1);
        const bars = hrs.map((v, h) => {
            const pct = Math.round(v / max * 100);
            const on = v > 0;
            return `<div title="${String(h).padStart(2, '0')}:00 — ${v.toLocaleString()} hits" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:26px;">
                <div style="width:70%;height:${on ? Math.max(6, pct) : 0}%;background:${pct >= 70 ? '#d63031' : pct >= 30 ? '#e17055' : '#74b9ff'};border-radius:1px 1px 0 0;"></div>
                <div style="font-size:6px;color:var(--wb-text-muted);margin-top:1px;line-height:1;">${h % 6 === 0 ? h : ''}</div>
            </div>`;
        }).join('');
        return `<div style="display:flex;align-items:flex-end;gap:1px;margin:2px 0 4px 0;">${bars}</div>`;
    }

    // What one bar is made of, per war. An hour's total says how hard they hit
    // then; the split says whether that is a habit across wars or one war
    // skewing the whole profile — which the aggregate cannot show.
    function hourTip(aw, h, total) {
        const hh = String(h).padStart(2, '0') + ':00';
        const wars = (aw && aw.wars) || [];
        const parts = wars
            .map((w) => ({ name: w.opponent || 'unknown', n: (w.hoursUTC || [])[h] || 0 }))
            .filter((x) => x.n > 0)
            .sort((a, b) => b.n - a.n);
        if (!parts.length) return `${hh} — ${total.toLocaleString()} hits`;
        // Newlines render as separate lines in a native title tooltip.
        return `${hh} — ${total.toLocaleString()} hits\n` +
            parts.map((x) => `  vs ${x.name}: ${x.n.toLocaleString()}`).join('\n');
    }

    // One expandable row per war, listing every chain that faction ran in it.
    // The histogram above sums chains into hour-buckets, which cannot tell you
    // whether a tall 20:00 bar is one long push or four short ones — this can.
    // All of it comes from the same payload the histogram is already built from.
    function chainBreakdown(aw) {
        const wars = (aw && aw.wars) || [];
        if (!wars.length) return '';
        const hhmm = (t) => {
            const d = new Date(t * 1000);
            return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
        };
        const dmy = (t) => {
            const d = new Date(t * 1000);
            return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
        };
        // Idle stretches are whole days; hours only matter for a same-week turnaround.
        const days = (sec) => {
            const d = Math.floor(sec / 86400);
            if (d >= 1) return d + ' day' + (d === 1 ? '' : 's');
            const h = Math.round(sec / 3600);
            return h + 'h';
        };
        const dur = (c) => {
            if (!c.end) return '';
            const m = Math.round((c.end - c.start) / 60);
            return m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + 'm';
        };
        const rows = wars.map((w) => {
            const lines = w.chains.map((c) => `<div style="display:flex;gap:6px;font-size:9px;line-height:1.6;">
                    <span style="width:38px;color:var(--wb-text);font-weight:600;">${hhmm(c.start)}</span>
                    <span style="width:56px;text-align:right;color:#e17055;">${c.hits.toLocaleString()} hits</span>
                    <span style="width:52px;text-align:right;color:var(--wb-text-muted);">${dur(c)}</span>
                    <span style="color:var(--wb-text-muted);">${c.respect != null ? c.respect.toLocaleString() + ' resp' : ''}</span>
                </div>`).join('');
            return `<details style="margin-top:4px;">
                <summary style="font-size:9px;color:var(--wb-text-muted);cursor:pointer;list-style:none;">
                    <b style="color:var(--wb-text);">vs ${w.opponent ? escapeHtml(w.opponent) : "unknown"}</b>
                    · ${dmy(w.start)}${w.end > w.start ? '\u2013' + dmy(w.end) : ''} · ${w.chains.length} chain${w.chains.length === 1 ? '' : 's'} · ${w.hits.toLocaleString()} hits${w.idleBefore ? ' · <span style="color:var(--wb-text-muted);">' + days(w.idleBefore) + ' idle before</span>' : ''}
                </summary>
                <div style="padding:4px 0 2px 6px;">${warHourBars(w)}${lines}</div>
            </details>`;
        }).join('');
        return `<div style="margin-top:6px;border-top:1px solid var(--wb-border);padding-top:4px;">
            <div style="font-size:9px;color:var(--wb-text-muted);margin-bottom:2px;">Every chain, per war (TCT) — biggest first</div>
            ${rows}
        </div>`;
    }

    function renderScoutReport(report) {
        const body = document.getElementById('wb-scout-body');
        if (!body) return;

        const wo = report.warOverview;
        const te = report.topEnd;
        const st = report.statTiers;
        const sh = report.safeHits;
        const act = report.activity;
        const comp = report.composition;
        const bp = report.battlePlan;
        const wp = report.winProbability;
        const bd = report.winBreakdown; // per-factor waterfall of the win %
        const wr = report.winReasoning;
        const sw = report.strengthsWeaknesses;
        const ev = report.enemyVulnerabilities;
        const we = report.warEffort; // war-effort roster (>=5 hits, avg recent wars)
        const inact = report.inactivePlayers; // {our, enemy} inactive 24h+
        const aw = report.enemyAttackWindows; // {hoursUTC[24]} chain-activity
        const etf = we && we.enemy ? we.enemy.topFighters : null; // enemy top 5

        const winClass = wp >= 70 ? 'high' : wp >= 40 ? 'mid' : 'low';

        function fmtNum(n) { return n != null ? Number(n).toLocaleString() : '\u2014'; }
        function chipClass(m) {
            if (!m) return '';
            if (m.stats != null) {
                if (m.stats >= 1e9) return 'threat';
                if (m.stats >= 250e6) return 'mid';
                return 'weak';
            }
            if (m.level >= 75) return 'threat';
            if (m.level >= 50) return 'mid';
            return 'weak';
        }
        function renderChips(list, cls) {
            if (!list || list.length === 0) return '<span style="color:var(--wb-text-muted);font-size:10px;">None</span>';
            return list.map(m => {
                const statStr = m.statsFormatted ? ` (${m.statsFormatted})` : '';
                return `<span class="wb-scout-target-chip ${cls || chipClass(m)}">${escapeHtml(m.name)} Lv${m.level}${statStr}</span>`;
            }).join('');
        }

        let html = '';

        // ── A. WAR OVERVIEW ──
        html += `<div class="wb-scout-section">
            <h3>War Overview</h3>
            <div style="text-align:center;margin-bottom:8px;">
                <span class="wb-scout-win-badge ${winClass}">Win Probability: ${wp}%</span>
            </div>
            ${renderWinWaterfall(bd)}
            <div class="wb-scout-compare">
                <div class="wb-scout-compare-side ours">
                    <h4>${escapeHtml(wo.our.name)}</h4>
                    <div class="wb-scout-compare-row"><span class="lbl">Members</span><span class="val">${wo.our.memberCount}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Respect</span><span class="val">${fmtNum(wo.our.respect)}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Best Chain</span><span class="val">${fmtNum(wo.our.bestChain)}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Age</span><span class="val">${fmtNum(wo.our.age)}d</span></div>
                </div>
                <div class="wb-scout-compare-vs">VS</div>
                <div class="wb-scout-compare-side theirs">
                    <h4>${escapeHtml(wo.enemy.name)}</h4>
                    <div class="wb-scout-compare-row"><span class="lbl">Members</span><span class="val">${wo.enemy.memberCount}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Respect</span><span class="val">${fmtNum(wo.enemy.respect)}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Best Chain</span><span class="val">${fmtNum(wo.enemy.bestChain)}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Age</span><span class="val">${fmtNum(wo.enemy.age)}d</span></div>
                </div>
            </div>
            ${wr.length > 0 ? `<div style="font-size:10px;color:var(--wb-text-muted);text-align:center;">${wr.map(r => escapeHtml(r)).join(' \u2022 ')}</div>` : ''}
        </div>`;

        // ── B. TOP-END COMPARISON ──
        html += `<div class="wb-scout-section">
            <h3>Top-End Comparison</h3>
            <table class="wb-scout-matchup-table">
                <tr>
                    <th>#</th>
                    <th style="color:#00b894">Our Fighter</th>
                    <th>Lv</th>
                    <th>Stats</th>
                    <th></th>
                    <th style="color:#d63031">Their Fighter</th>
                    <th>Lv</th>
                    <th>Stats</th>
                    <th>Edge</th>
                </tr>
                ${te.matchups.map(mu => {
            const o = mu.ours;
            const t = mu.theirs;
            const advClass = mu.advantage === 'ours' ? 'adv-ours' : mu.advantage === 'theirs' ? 'adv-theirs' : 'adv-even';
            const advSymbol = mu.advantage === 'ours' ? '\u25C0' : mu.advantage === 'theirs' ? '\u25B6' : '\u2022';
            return `<tr>
                        <td style="color:var(--wb-text-muted)">${mu.rank}</td>
                        <td style="text-align:left;color:#00b894">${o ? escapeHtml(o.name) : '\u2014'}</td>
                        <td>${o ? o.level : ''}</td>
                        <td>${o && o.statsFormatted ? o.statsFormatted : '\u2014'}${o && o.source ? ' <span style="font-size:9px;opacity:0.5">' + o.source + '</span>' : ''}</td>
                        <td class="${advClass}" style="font-size:10px">${advSymbol}</td>
                        <td style="text-align:left;color:#d63031">${t ? escapeHtml(t.name) : '\u2014'}</td>
                        <td>${t ? t.level : ''}</td>
                        <td>${t && t.statsFormatted ? t.statsFormatted : '\u2014'}${t && t.source ? ' <span style="font-size:9px;opacity:0.5">' + t.source + '</span>' : ''}</td>
                        <td class="${advClass}" style="font-weight:700">${mu.advantage === 'ours' ? '+' : mu.advantage === 'theirs' ? '\u2013' : '='}</td>
                    </tr>`;
        }).join('')}
            </table>
            ${!wo.hasEstimates ? '<div style="font-size:10px;color:var(--wb-text-muted);margin-top:4px;text-align:center;">No stat estimates available \u2014 ranked by level. Install BSP or FFS for stat-based comparison.</div>' : ''}
        </div>`;

        // ── C. STAT TIER BREAKDOWN ──
        const maxTier = Math.max(...st.labels.map(l => Math.max(st.our[l], st.enemy[l])), 1);
        html += `<div class="wb-scout-section">
            <h3>Stat Tier Breakdown</h3>
            <div style="font-size:10px;color:var(--wb-text-muted);margin-bottom:6px;">${st.hasEstimates ? 'Based on BSP/FFS estimates' : 'Based on level (no stat estimates)'}</div>
            ${st.labels.map(label => {
            const ourW = Math.round((st.our[label] / maxTier) * 100);
            const enemyW = Math.round((st.enemy[label] / maxTier) * 100);
            return `<div class="wb-scout-tier-row">
                    <div class="wb-scout-tier-label">${label}</div>
                    <div style="display:flex;justify-content:flex-end;align-items:center;">
                        <span class="wb-scout-tier-count" style="color:#00b894;margin-right:4px;">${st.our[label]}</span>
                        <div class="wb-scout-tier-bar ours" style="width:${ourW}%;min-width:${st.our[label] > 0 ? 4 : 0}px;"></div>
                    </div>
                    <div style="text-align:center;font-size:9px;color:var(--wb-text-muted)">${st.descriptions[label]}</div>
                    <div style="display:flex;align-items:center;">
                        <div class="wb-scout-tier-bar theirs" style="width:${enemyW}%;min-width:${st.enemy[label] > 0 ? 4 : 0}px;"></div>
                        <span class="wb-scout-tier-count" style="color:#d63031;margin-left:4px;">${st.enemy[label]}</span>
                    </div>
                    <div></div>
                </div>`;
        }).join('')}
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--wb-text-muted);margin-top:4px;padding:0 4px;">
                <span style="color:#00b894">Us</span>
                <span style="color:#d63031">Them</span>
            </div>
        </div>`;

        // ── D. SAFE HIT THRESHOLDS ──
        html += `<div class="wb-scout-section">
            <h3>Safe Hit Thresholds</h3>
            ${!sh.hasEstimates ? '<div style="font-size:10px;color:var(--wb-text-muted);margin-bottom:4px;">Estimated from levels (install BSP/FFS for accuracy)</div>' : ''}
            <table class="wb-scout-safe-table">
                <tr><th>Your Stats</th><th>Safe to Hit</th></tr>
                ${sh.thresholds.map(t => `<tr>
                    <td style="font-weight:600">${t.label}</td>
                    <td>${t.desc}</td>
                </tr>`).join('')}
            </table>
            <div style="display:flex;gap:12px;margin-top:8px;">
                <div style="flex:1;">
                    <div style="font-size:10px;color:var(--wb-text-muted);margin-bottom:2px;">Your roster that can hit</div>
                    <div class="wb-scout-pct-bar" style="width:${sh.ourCanHitPct}%;background:rgba(0,184,148,0.3);color:#00b894;">${sh.ourCanHitPct}%</div>
                </div>
                <div style="flex:1;">
                    <div style="font-size:10px;color:var(--wb-text-muted);margin-bottom:2px;">Their roster farmable</div>
                    <div class="wb-scout-pct-bar" style="width:${sh.enemyFarmablePct}%;background:rgba(214,48,49,0.3);color:#ff7675;">${sh.enemyFarmablePct}%</div>
                </div>
            </div>
        </div>`;

        // ── E. ACTIVITY & AVAILABILITY ──
        html += `<div class="wb-scout-section">
            <h3>Activity & Availability</h3>
            <div class="wb-scout-compare">
                <div class="wb-scout-compare-side ours">
                    <h4>Our Activity</h4>
                    <div class="wb-scout-compare-row"><span class="lbl">Online</span><span class="val" style="color:#00b894">${act.our.online}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Idle</span><span class="val" style="color:#fdcb6e">${act.our.idle}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Offline</span><span class="val" style="color:#636e72">${act.our.offline}</span></div>
                    <div class="wb-scout-compare-row" style="border-top:1px solid var(--wb-border);padding-top:4px;margin-top:4px;"><span class="lbl">Combat Ready</span><span class="val" style="color:#e17055;font-weight:700">${act.our.activeCombatRoster}</span></div>
                </div>
                <div class="wb-scout-compare-vs">VS</div>
                <div class="wb-scout-compare-side theirs">
                    <h4>Enemy Activity</h4>
                    <div class="wb-scout-compare-row"><span class="lbl">Online</span><span class="val" style="color:#00b894">${act.enemy.online}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Idle</span><span class="val" style="color:#fdcb6e">${act.enemy.idle}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Offline</span><span class="val" style="color:#636e72">${act.enemy.offline}</span></div>
                    <div class="wb-scout-compare-row" style="border-top:1px solid var(--wb-border);padding-top:4px;margin-top:4px;"><span class="lbl">Combat Ready</span><span class="val" style="color:#e17055;font-weight:700">${act.enemy.activeCombatRoster}</span></div>
                </div>
            </div>`;

        // War-effort roster: how many members actually FOUGHT (>=5 hits), averaged
        // over each faction's recent finished wars. Time-independent, unlike the
        // live "Combat Ready" snapshot above — and it's what drives the win-prob
        // active-roster factor when available.
        if (we && ((we.our && we.our.avg != null) || (we.enemy && we.enemy.avg != null))) {
            const ourWe = we.our || {}, enemyWe = we.enemy || {};
            const usedWe = we.usedForWinFactor === 'war-effort';
            const perWarRows = (side) => {
                const pw = (side && side.perWar) || [];
                if (!pw.length) return '<div style="font-size:10px;color:var(--wb-text-muted)">no war history</div>';
                return pw.map(w => `<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--wb-text-muted)"><span>vs ${escapeHtml(w.opp || '?')}</span><span style="color:#e17055">${w.hitters}</span></div>`).join('');
            };
            html += `<div style="margin-top:8px;">
                <div style="font-size:11px;font-weight:600;color:var(--wb-text-muted);margin-bottom:4px;">
                    War Effort &mdash; fighters with &ge;${(ourWe.minHits || enemyWe.minHits || 5)} hits, avg last ${Math.max(ourWe.warsUsed || 0, enemyWe.warsUsed || 0) || 5} wars
                    ${usedWe ? '<span style="color:#00b894"> ✓ used for win %</span>' : '<span style="opacity:0.6"> (live snapshot used instead)</span>'}
                </div>
                <div class="wb-scout-compare">
                    <div class="wb-scout-compare-side ours">
                        <div class="wb-scout-compare-row"><span class="lbl">Avg fighters</span><span class="val" style="color:#e17055;font-weight:700">${ourWe.avg != null ? ourWe.avg : '—'}</span></div>
                        <div class="wb-scout-compare-row"><span class="lbl">Energy used</span><span class="val" style="color:#74b9ff">${ourWe.avgEnergy != null ? ourWe.avgEnergy.toLocaleString() + 'e' : '—'}</span></div>
                        ${ourWe.perFighterEnergy ? `<div class="wb-scout-compare-row"><span class="lbl">Per fighter</span><span class="val" style="color:var(--wb-text-muted)">${ourWe.perFighterEnergy.toLocaleString()}e</span></div>` : ''}
                        ${perWarRows(ourWe)}
                    </div>
                    <div class="wb-scout-compare-vs">VS</div>
                    <div class="wb-scout-compare-side theirs">
                        <div class="wb-scout-compare-row"><span class="lbl">Avg fighters</span><span class="val" style="color:#e17055;font-weight:700">${enemyWe.avg != null ? enemyWe.avg : '—'}</span></div>
                        <div class="wb-scout-compare-row"><span class="lbl">Energy used</span><span class="val" style="color:#74b9ff">${enemyWe.avgEnergy != null ? enemyWe.avgEnergy.toLocaleString() + 'e' : '—'}</span></div>
                        ${enemyWe.perFighterEnergy ? `<div class="wb-scout-compare-row"><span class="lbl">Per fighter</span><span class="val" style="color:var(--wb-text-muted)">${enemyWe.perFighterEnergy.toLocaleString()}e</span></div>` : ''}
                        ${perWarRows(enemyWe)}
                    </div>
                </div>
                <div style="font-size:9px;color:var(--wb-text-muted);margin-top:3px;">Energy = active roster's total attacks × 25e, avg over recent wars — how much sustained pressure they can bring.</div>
            </div>`;
        }

        // Enemy top fighters — who does the damage, and how much energy they burn.
        if (etf && etf.length) {
            html += `<div style="margin-top:8px;">
                <div style="font-size:11px;font-weight:600;color:var(--wb-text-muted);margin-bottom:4px;">Enemy Top Fighters (avg per war)</div>
                <table class="wb-scout-table">
                    <tr><th>Fighter</th><th style="text-align:center">Lvl</th><th style="text-align:right">Attacks</th><th style="text-align:right">Energy</th></tr>
                    ${etf.map(f => `<tr>
                        <td>${escapeHtml(f.name)}</td>
                        <td style="text-align:center">${f.level}</td>
                        <td style="text-align:right;color:#e17055;font-weight:700">${f.avgAttacks}</td>
                        <td style="text-align:right;color:#74b9ff">${f.avgEnergy.toLocaleString()}e</td>
                    </tr>`).join('')}
                </table>
            </div>`;
        }

        // Enemy attack windows — when they run chains, from recent wars. hoursUTC
        // is a 24-slot histogram of chained hits; convert to the viewer's local
        // time so "when do they hit" reads right wherever you are.
        if (aw && aw.source === 'chains' && aw.totalHits > 0) {
            // Show in TCT (Torn City Time = UTC), which is how Torn shows time —
            // hoursUTC is already UTC, so no conversion.
            const local = aw.hoursUTC;
            const max = Math.max(...local, 1);
            const tzName = 'TCT';
            const bars = local.map((v, h) => {
                const pct = Math.round(v / max * 100);
                const on = v > 0;
                // Label every active hour (bold) + faint 0/6/12/18 refs, so each
                // push hour is numbered rather than just every-3rd tick.
                const lbl = on ? `<b style="color:var(--wb-text)">${h}</b>` : (h % 6 === 0 ? h : '');
                return `<div title="${hourTip(aw, h, v)}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:46px;">
                    <div style="width:70%;height:${on ? Math.max(6, pct) : 0}%;background:${pct >= 70 ? '#d63031' : pct >= 30 ? '#e17055' : '#74b9ff'};border-radius:2px 2px 0 0;"></div>
                    <div style="font-size:7px;color:var(--wb-text-muted);margin-top:1px;line-height:1;">${lbl}</div>
                </div>`;
            }).join('');
            const peaks = local.map((v, h) => ({ h, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3)
                .map(x => `${String(x.h).padStart(2, '0')}:00`).join(', ');
            html += `<div style="margin-top:8px;">
                <div style="font-size:11px;font-weight:600;color:var(--wb-text-muted);margin-bottom:2px;">Enemy Attack Windows <span style="font-weight:400">(when their hits land · ${tzName})</span></div>
                <div style="display:flex;align-items:flex-end;gap:1px;">${bars}</div>
                <div style="font-size:9px;color:var(--wb-text-muted);margin-top:3px;">Busiest hours: <b>${peaks}</b>. From ${aw.totalChains} chains (${aw.totalHits.toLocaleString()} hits) across their last ${aw.warsUsed} wars, each chain\'s hits spread across the hours it ran — so a long chain counts everywhere it was live, not just where it started. Chained hits only \u2014 not their total attacks, and a chain counts every hit in it whether the target was in the war or not.</div>
                ${chainBreakdown(aw)}
            </div>`;
        }

        // Inactive players (24h+ since last action) for BOTH factions. Ours =
        // likely no-shows to chase up; theirs = safe/dead-weight targets.
        if (inact && ((inact.our && inact.our.length) || (inact.enemy && inact.enemy.length))) {
            const ourIn = inact.our || [], enemyIn = inact.enemy || [];
            const list = (arr, color) => {
                if (!arr.length) return '<div style="font-size:10px;color:var(--wb-text-muted)">none</div>';
                return arr.slice(0, 12).map(m => `<div style="display:flex;justify-content:space-between;font-size:10px;"><span style="color:${color}">${escapeHtml(m.name)} <span style="color:var(--wb-text-muted)">Lv${m.level}</span></span><span style="color:var(--wb-text-muted)">${formatDuration(m.lastActionAgo)}</span></div>`).join('')
                    + (arr.length > 12 ? `<div style="opacity:0.5;font-size:10px">... and ${arr.length - 12} more</div>` : '');
            };
            html += `<div style="margin-top:8px;">
                <div style="font-size:11px;font-weight:600;color:var(--wb-text-muted);margin-bottom:4px;">Inactive Players (24h+)</div>
                <div class="wb-scout-compare">
                    <div class="wb-scout-compare-side ours">
                        <div class="wb-scout-compare-row"><span class="lbl">Ours inactive</span><span class="val" style="color:#fdcb6e;font-weight:700">${ourIn.length}</span></div>
                        ${list(ourIn, '#fdcb6e')}
                    </div>
                    <div class="wb-scout-compare-vs">VS</div>
                    <div class="wb-scout-compare-side theirs">
                        <div class="wb-scout-compare-row"><span class="lbl">Theirs inactive</span><span class="val" style="color:#00b894;font-weight:700">${enemyIn.length}</span></div>
                        ${list(enemyIn, '#00b894')}
                    </div>
                </div>
            </div>`;
        }

        // Enemy vulnerability windows
        if (ev) {
            html += `<div style="margin-top:8px;">
                <div style="font-size:11px;font-weight:600;color:var(--wb-text-muted);margin-bottom:4px;">Enemy Vulnerabilities</div>
                <div class="wb-scout-grid">
                    <span class="wb-scout-label">Hospitalized</span><span class="wb-scout-value" style="color:#d63031">${ev.hospitalized.length}</span>
                    <span class="wb-scout-label">Jailed</span><span class="wb-scout-value" style="color:#636e72">${ev.jailed.length}</span>
                    <span class="wb-scout-label">Traveling</span><span class="wb-scout-value" style="color:#0984e3">${ev.traveling.length}</span>
                    <span class="wb-scout-label">Inactive (24h+)</span><span class="wb-scout-value" style="color:#636e72">${ev.inactive.length}</span>
                </div>`;
            if (ev.hospitalized.length > 0) {
                html += `<table class="wb-scout-table" style="margin-top:4px;">
                    <tr><th>Hospitalized Enemy</th><th style="text-align:center">Lvl</th><th style="text-align:right">Time Left</th></tr>
                    ${ev.hospitalized.slice(0, 8).map(m => `<tr>
                        <td style="color:#d63031">${escapeHtml(m.name)}</td>
                        <td style="text-align:center">${m.level}</td>
                        <td style="text-align:right">${formatDuration(m.remaining)}</td>
                    </tr>`).join('')}
                    ${ev.hospitalized.length > 8 ? `<tr><td colspan="3" style="opacity:0.5;font-size:10px">... and ${ev.hospitalized.length - 8} more</td></tr>` : ''}
                </table>`;
            }
            html += `</div>`;
        }
        html += `</div>`;

        // ── F. FACTION COMPOSITION ──
        html += `<div class="wb-scout-section">
            <h3>Faction Composition</h3>
            <div class="wb-scout-compare">
                <div class="wb-scout-compare-side ours">
                    <h4>Our Roster</h4>
                    <div class="wb-scout-compare-row"><span class="lbl">New (&lt;30d)</span><span class="val">${comp.our.newMembers}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Veterans (&gt;1y)</span><span class="val">${comp.our.veterans}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Avg Days</span><span class="val">${fmtNum(comp.our.avgDaysInFaction)}</span></div>
                </div>
                <div class="wb-scout-compare-vs">VS</div>
                <div class="wb-scout-compare-side theirs">
                    <h4>Their Roster</h4>
                    <div class="wb-scout-compare-row"><span class="lbl">New (&lt;30d)</span><span class="val">${comp.enemy.newMembers}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Veterans (&gt;1y)</span><span class="val">${comp.enemy.veterans}</span></div>
                    <div class="wb-scout-compare-row"><span class="lbl">Avg Days</span><span class="val">${fmtNum(comp.enemy.avgDaysInFaction)}</span></div>
                </div>
            </div>
        </div>`;

        // ── G. TACTICAL BATTLE PLAN ──
        const phaseLabel = bp.warPhase === 'pre' ? 'Pre-War Battle Plan' : 'Tactical Battle Plan';
        const phaseNote = bp.warPhase === 'pre'
            ? '<div style="font-size:11px;color:#74b9ff;margin-bottom:8px;padding:6px 8px;background:rgba(116,185,255,0.08);border-radius:4px;border:1px solid rgba(116,185,255,0.15);">War has not started yet \u2014 this is a pre-war scouting plan based on current enemy roster.</div>'
            : bp.warPhase === 'opening'
                ? '<div style="font-size:11px;color:#00b894;margin-bottom:8px;padding:6px 8px;background:rgba(0,184,148,0.08);border-radius:4px;border:1px solid rgba(0,184,148,0.15);">War is in opening phase \u2014 focus on building chain.</div>'
                : '';
        html += `<div class="wb-scout-section">
            <h3>${phaseLabel}</h3>
            ${phaseNote}
            <div class="wb-scout-phase">
                <h4>Phase 1: Opening (0\u2013200 hits)</h4>
                <p>${escapeHtml(bp.opening.description)}</p>
                <div style="font-size:10px;color:var(--wb-text-muted);margin-bottom:2px;">Chain targets (their weak):</div>
                <div class="wb-scout-target-list">${renderChips(bp.opening.chainTargets, 'weak')}</div>
                ${bp.opening.ourChainers.length > 0 ? `<div style="font-size:10px;color:var(--wb-text-muted);margin:4px 0 2px;">Our chainers:</div><div class="wb-scout-target-list">${renderChips(bp.opening.ourChainers, 'weak')}</div>` : ''}
            </div>
            <div class="wb-scout-phase">
                <h4>Phase 2: Mid-War (200\u20131000 hits)</h4>
                <p>${escapeHtml(bp.midWar.description)}</p>
                <div style="font-size:10px;color:var(--wb-text-muted);margin-bottom:2px;">Perma-hospital targets:</div>
                <div class="wb-scout-target-list">${renderChips(bp.midWar.permaTargets, 'mid')}</div>
            </div>
            <div class="wb-scout-phase">
                <h4>Phase 3: Endgame</h4>
                <p>${escapeHtml(bp.endgame.description)}</p>
                <div style="font-size:10px;color:var(--wb-text-muted);margin-bottom:2px;">Enemy threats to neutralize:</div>
                <div class="wb-scout-target-list">${renderChips(bp.endgame.enemyThreats, 'threat')}</div>
                ${bp.endgame.ourHitters.length > 0 ? `<div style="font-size:10px;color:var(--wb-text-muted);margin:4px 0 2px;">Deploy our top hitters:</div><div class="wb-scout-target-list">${renderChips(bp.endgame.ourHitters, 'threat')}</div>` : ''}
            </div>
            ${bp.keyPermaTargets.length > 0 ? `<div style="margin-top:6px;padding:8px;background:rgba(214,48,49,0.08);border-radius:6px;border:1px solid rgba(214,48,49,0.2);">
                <div style="font-size:11px;font-weight:700;color:#ff7675;margin-bottom:4px;">Priority Perma-Hospital Targets</div>
                <div class="wb-scout-target-list">${renderChips(bp.keyPermaTargets, 'threat')}</div>
            </div>` : ''}

        </div>`;

        // ── H. STRENGTHS & WEAKNESSES ──
        html += `<div class="wb-scout-section">
            <h3>Strengths & Weaknesses</h3>
            <div class="wb-scout-compare">
                <div class="wb-scout-compare-side ours">
                    <h4>Our Faction</h4>
                    ${sw.our.strengths.length > 0 ? `<div style="margin-bottom:4px;">${sw.our.strengths.map(s => `<span class="wb-scout-pill strength">${escapeHtml(s)}</span>`).join(' ')}</div>` : ''}
                    ${sw.our.weaknesses.length > 0 ? `<div>${sw.our.weaknesses.map(w => `<span class="wb-scout-pill weakness">${escapeHtml(w)}</span>`).join(' ')}</div>` : ''}
                    ${sw.our.strengths.length === 0 && sw.our.weaknesses.length === 0 ? '<div style="font-size:10px;color:var(--wb-text-muted)">No notable traits</div>' : ''}
                </div>
                <div class="wb-scout-compare-vs"></div>
                <div class="wb-scout-compare-side theirs">
                    <h4>Enemy Faction</h4>
                    ${sw.enemy.strengths.length > 0 ? `<div style="margin-bottom:4px;">${sw.enemy.strengths.map(s => `<span class="wb-scout-pill strength">${escapeHtml(s)}</span>`).join(' ')}</div>` : ''}
                    ${sw.enemy.weaknesses.length > 0 ? `<div>${sw.enemy.weaknesses.map(w => `<span class="wb-scout-pill weakness">${escapeHtml(w)}</span>`).join(' ')}</div>` : ''}
                    ${sw.enemy.strengths.length === 0 && sw.enemy.weaknesses.length === 0 ? '<div style="font-size:10px;color:var(--wb-text-muted)">No notable traits</div>' : ''}
                </div>
            </div>
        </div>`;

        // ── I. LIVE STRATEGY (Removed) ──

        body.innerHTML = html;
    }

    // =========================================================================
    // POST-WAR REPORT
    // =========================================================================

    function openPostWarReport() {
        if (document.getElementById('wb-postwar-overlay')) return;

        const warId = deriveWarId();
        if (!warId) {
            showToast('Not connected to a war', 'error');
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'wb-postwar-overlay';
        overlay.id = 'wb-postwar-overlay';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePostWarReport();
        });

        const modal = document.createElement('div');
        modal.className = 'wb-postwar-modal';
        modal.innerHTML = `
            <div class="wb-postwar-header">
                <h2>\uD83C\uDFC6 Post-War Report</h2>
                <button class="wb-postwar-close" id="wb-postwar-close">\u00D7</button>
            </div>
            <div class="wb-postwar-body" id="wb-postwar-body">
                <div class="wb-scout-loading">
                    <div class="wb-scout-spinner"></div>
                    <span>Analyzing war performance...</span>
                </div>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.getElementById('wb-postwar-close').addEventListener('click', closePostWarReport);
        fetchPostWarReport(warId);
    }

    function closePostWarReport() {
        const overlay = document.getElementById('wb-postwar-overlay');
        if (overlay) overlay.remove();
    }

    async function fetchPostWarReport(warId) {
        try {
            const url = `${CONFIG.SERVER_URL}/api/war/${encodeURIComponent(warId)}/post-war-report`;
            const estimates = gatherStatEstimates();
            const body = JSON.stringify({ estimates });
            const data = await new Promise((resolve, reject) => {
                httpRequest({
                    method: 'POST',
                    url,
                    headers: {
                        'Authorization': `Bearer ${state.jwtToken}`,
                        'Content-Type': 'application/json',
                    },
                    data: body,
                    timeout: 30000,
                    onload(r) {
                        const d = safeParse(r.responseText);
                        if (r.status >= 200 && r.status < 300) resolve(d);
                        else reject(new Error((d && d.error) || `HTTP ${r.status}`));
                    },
                    onerror() { reject(new Error('Network error')); },
                    ontimeout() { reject(new Error('Request timed out')); },
                });
            });

            if (data && data.report) {
                renderPostWarReport(data.report);
            } else {
                throw new Error('Invalid response');
            }
        } catch (e) {
            warn('Post-war report failed:', e.message);
            const body = document.getElementById('wb-postwar-body');
            if (body) {
                body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--wb-call-red);">
                    <div style="font-size:24px;margin-bottom:8px;">\u26A0</div>
                    <div>${escapeHtml(e.message)}</div>
                </div>`;
            }
        }
    }

    function renderPostWarReport(report) {
        const body = document.getElementById('wb-postwar-body');
        if (!body) return;

        const ws = report.warSummary || {};
        const fp = report.factionPerformance || {};
        const ee = report.energyEfficiency || {};
        const ph = report.positiveHighlights || {};
        const nh = report.negativeHighlights || {};
        const recs = report.recommendations || [];
        const mt = report.memberTable || [];
        const xa = report.xanaxAccountability || null;

        function fmtNum(n) { return n != null ? Number(n).toLocaleString() : '\u2014'; }
        function fmtResp(n) { return n != null ? Number(n).toFixed(2) : '\u2014'; }

        function effClass(pct) {
            if (pct >= 120) return 'eff-green';
            if (pct >= 80) return 'eff-yellow';
            return 'eff-red';
        }

        function makeSection(title, contentHtml, collapsed) {
            const colClass = collapsed ? ' collapsed' : '';
            return `<div class="wb-postwar-section">
                <h3 class="wb-postwar-toggle${colClass}">${title}</h3>
                <div class="wb-postwar-section-body${colClass}">${contentHtml}</div>
            </div>`;
        }

        let html = '';

        // ── A. WAR SUMMARY ──
        const resultClass = ws.result === 'VICTORY' ? 'victory' : ws.result === 'DEFEAT' ? 'defeat' : 'unknown';
        let summaryContent = `
            <div style="text-align:center;">
                <span class="wb-postwar-result-badge ${resultClass}">${ws.result || 'UNKNOWN'}</span>
            </div>
            <div class="wb-postwar-score">
                <span class="our-score">${fmtNum(ws.ourScore)}</span>
                <span class="score-sep">-</span>
                <span class="enemy-score">${fmtNum(ws.enemyScore)}</span>
            </div>
            <div style="text-align:center;font-size:11px;color:var(--wb-text-muted);margin-bottom:8px;">
                ${escapeHtml(ws.ourName || 'Us')} vs ${escapeHtml(ws.enemyName || 'Enemy')}
            </div>
            <div class="wb-postwar-stat-grid">
                <span class="lbl">Our Total Hits</span><span class="val">${fmtNum(ws.totalOurHits)}</span>
                <span class="lbl">Enemy Total Hits</span><span class="val">${fmtNum(ws.totalEnemyHits)}</span>
                <span class="lbl">Total Respect Earned</span><span class="val">${fmtNum(ws.totalRespect)}</span>
                ${ws.durationFormatted ? `<span class="lbl">War Duration</span><span class="val">${escapeHtml(ws.durationFormatted)}</span>` : ''}
            </div>`;
        html += makeSection('War Summary', summaryContent, false);

        // ── B. OVERALL FACTION PERFORMANCE ──
        const effColor = fp.efficiencyRating >= 70 ? '#00b894' : fp.efficiencyRating >= 40 ? '#fdcb6e' : '#ff7675';
        let perfContent = `
            <div class="wb-postwar-stat-grid">
                <span class="lbl">Participating Members</span><span class="val">${fp.participationCount} / ${fp.totalRoster}</span>
                <span class="lbl">Participation Rate</span><span class="val" style="color:${fp.participationRate >= 70 ? '#00b894' : fp.participationRate >= 50 ? '#fdcb6e' : '#ff7675'}">${fp.participationRate}%</span>
                <span class="lbl">Avg Hits per Member</span><span class="val">${fp.avgHitsPerMember}</span>
                <span class="lbl">Avg Respect per Hit</span><span class="val">${fmtResp(fp.avgRespectPerHit)}</span>
                ${fp.avgFairFight != null ? `<span class="lbl">Avg Fair Fight</span><span class="val">${fp.avgFairFight.toFixed(2)}</span>` : ''}
                <span class="lbl">Efficiency Rating</span><span class="val" style="color:${effColor};font-size:14px;">${fp.efficiencyRating}/100</span>
            </div>`;
        html += makeSection('Overall Faction Performance', perfContent, false);

        // ── C. ENERGY EFFICIENCY ANALYSIS ──
        const barColor = ee.efficiencyPct >= 80 ? '#00b894' : ee.efficiencyPct >= 60 ? '#fdcb6e' : '#ff7675';
        let energyContent = `
            <div class="wb-postwar-stat-grid" style="margin-bottom:8px;">
                <span class="lbl">Total Estimated Energy</span><span class="val">${fmtNum(ee.totalEstimatedEnergy)}</span>
                <span class="lbl">Estimated Wasted Energy</span><span class="val" style="color:#ff7675">${fmtNum(ee.totalWastedEnergy)}</span>
                <span class="lbl">Faction Avg Respect/Hit</span><span class="val">${fmtResp(ee.factionAvgRespectPerHit)}</span>
            </div>
            <div class="wb-postwar-energy-bar">
                <div class="wb-postwar-energy-bar-fill" style="width:${ee.efficiencyPct}%;background:${barColor};"></div>
                <div class="wb-postwar-energy-bar-label">Energy Efficiency: ${ee.efficiencyPct}%</div>
            </div>`;
        if (ee.members && ee.members.filter(m => m.isBelowThreshold).length > 0) {
            energyContent += `<div style="font-size:10px;color:var(--wb-text-muted);margin-top:4px;">Members below 50% of faction avg respect/hit are flagged for energy waste.</div>`;
        }
        html += makeSection('Energy Efficiency Analysis', energyContent, false);

        // ── D. INDIVIDUAL HIGHLIGHTS: POSITIVE ──
        let posContent = '';
        if (ph.achievements && ph.achievements.length > 0) {
            posContent += `<div style="margin-bottom:8px;">${ph.achievements.map(a =>
                `<span class="wb-postwar-achievement">${escapeHtml(a.title)}: ${escapeHtml(a.name)} (${escapeHtml(a.value)})</span>`
            ).join('')}</div>`;
        }
        if (ph.topPerformers && ph.topPerformers.length > 0) {
            for (const m of ph.topPerformers) {
                posContent += `<div class="wb-postwar-card positive">
                    <div class="card-name">${escapeHtml(m.name)} <span style="font-size:10px;font-weight:400;color:var(--wb-text-muted)">Lv${m.level}</span></div>
                    <div class="card-stats">
                        <span>Hits: ${m.attacks}</span>
                        ${m.assists ? `<span>Assists: ${m.assists}</span>` : ''}
                        <span>Respect: ${fmtNum(m.respect)}</span>
                        <span>Resp/Hit: ${fmtResp(m.respectPerHit)}</span>
                        <span>Score: ${fmtNum(m.score)}</span>
                    </div>
                </div>`;
            }
        } else {
            posContent += '<div style="font-size:11px;color:var(--wb-text-muted);">No performance data available.</div>';
        }
        html += makeSection('Top Performers', posContent, false);

        // ── E. INDIVIDUAL HIGHLIGHTS: NEGATIVE ──
        let negContent = '';
        if (nh.areasToImprove && nh.areasToImprove.length > 0) {
            for (const m of nh.areasToImprove) {
                negContent += `<div class="wb-postwar-card negative">
                    <div class="card-name">${escapeHtml(m.name)} <span style="font-size:10px;font-weight:400;color:var(--wb-text-muted)">Lv${m.level}</span></div>
                    <div class="card-stats">
                        <span>Hits: ${m.attacks}</span>
                        <span>Respect: ${fmtNum(m.respect)}</span>
                        ${m.attacks > 0 ? `<span>Resp/Hit: ${fmtResp(m.respectPerHit)}</span>` : ''}
                        <span>Score: ${fmtNum(m.score)}</span>
                    </div>
                    <div style="font-size:10px;color:#fdcb6e;margin-top:3px;">${escapeHtml(m.issue)}</div>
                </div>`;
            }
        } else {
            negContent += '<div style="font-size:11px;color:var(--wb-text-muted);">No notable issues — great performance across the board!</div>';
        }
        html += makeSection('Areas to Improve', negContent, false);

        // ── F. AREAS FOR IMPROVEMENT ──
        let recContent = '';
        if (recs.length > 0) {
            for (const r of recs) {
                recContent += `<div class="wb-postwar-recommendation">
                    <div class="rec-category ${r.priority || 'medium'}">${escapeHtml(r.category)}</div>
                    <div class="rec-text">${escapeHtml(r.text)}</div>
                </div>`;
            }
        } else {
            recContent += '<div style="font-size:11px;color:var(--wb-text-muted);">No specific recommendations — solid performance overall.</div>';
        }
        html += makeSection('Recommendations', recContent, false);

        // ── G. MEMBER PERFORMANCE TABLE ──
        let tableContent = `<div class="wb-postwar-member-table-wrap">
            <table class="wb-postwar-member-table">
                <tr>
                    <th>Name</th>
                    <th style="text-align:center">Lv</th>
                    <th style="text-align:center">Hits</th>
                    <th style="text-align:right">Respect</th>
                    <th style="text-align:right">Resp/Hit</th>
                    <th style="text-align:center">Def</th>
                    <th style="text-align:right">Bled</th>
                    <th style="text-align:right">Net Score</th>
                </tr>`;
        for (const m of mt) {
            const ec = effClass(m.efficiencyPct);
            tableContent += `<tr>
                <td>${escapeHtml(m.name)}</td>
                <td style="text-align:center">${m.level}</td>
                <td style="text-align:center">${m.attacks}</td>
                <td style="text-align:right">${fmtNum(m.respect)}</td>
                <td style="text-align:right">${m.attacks > 0 ? fmtResp(m.respectPerHit) : '\u2014'}</td>
                <td style="text-align:center">${m.timesAttacked || 0}</td>
                <td style="text-align:right;color:#ff7675">${m.respectBled ? fmtResp(m.respectBled) : '\u2014'}</td>
                <td style="text-align:right;font-weight:600;color:${m.netScore < 0 ? '#ff7675' : m.netScore > 0 ? '#00b894' : 'inherit'}">${fmtResp(m.netScore)}</td>
            </tr>`;
        }
        tableContent += `</table></div>`;
        // ── G. XANAX ACCOUNTABILITY ──
        // Per-member xanax-vs-attacks audit. The server already sorted
        // rows by deficit DESC, so worst offenders surface first. Rule:
        // 1 xanax = 250 energy = 10 expected war attacks. Window covers
        // the 24h pre-war stacking phase + the war itself. Plain
        // numbers, no excuses; leader can interpret context.
        if (xa && (xa.membersWhoTook || 0) > 0) {
            let xanaxContent = `
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
                    <span class="wb-postwar-achievement">${xa.totalXanaxTaken} total</span>
                    <span class="wb-postwar-achievement">${xa.membersWhoTook} members</span>
                    <span class="wb-postwar-achievement" style="${xa.membersFlagged > 0 ? 'background:rgba(255,118,117,.18);color:#ff7675;' : 'background:rgba(0,184,148,.18);color:#00b894;'}">${xa.membersFlagged} flagged</span>
                </div>
                <div style="font-size:10px;color:var(--wb-text-muted);margin-bottom:6px;">${escapeHtml(xa.rule || '1 xanax = 10 expected attacks (war + non-war)')}</div>
                <table class="wb-postwar-xanax-table">
                <thead><tr>
                    <th class="col-mark"></th>
                    <th class="col-name">Member</th>
                    <th class="col-num">X</th>
                    <th class="col-num">Hits</th>
                    <th class="col-num">Need</th>
                    <th class="col-delta">Δ</th>
                </tr></thead><tbody>`;
            for (const r of (xa.rows || [])) {
                const flagBg = r.flagged ? 'background:rgba(255,118,117,.06);' : '';
                const flagMark = r.flagged
                    ? '<span style="color:#ff7675">⚠</span>'
                    : '<span style="color:#00b894">✓</span>';
                const deficitColor = r.flagged ? '#ff7675' : 'var(--wb-text-muted)';
                xanaxContent += `<tr style="${flagBg}">
                    <td class="col-mark">${flagMark}</td>
                    <td class="col-name">${escapeHtml(r.name || '?')}</td>
                    <td class="col-num">${r.xanaxTaken}</td>
                    <td class="col-num" title="${r.attacks} war">${r.allAttempts != null ? r.allAttempts : r.attacks}</td>
                    <td class="col-num" style="color:var(--wb-text-muted)">${r.expectedAttacks}</td>
                    <td class="col-delta" style="font-weight:${r.flagged ? '600' : '400'};color:${deficitColor}">${r.attackDeficit > 0 ? '-' + r.attackDeficit : '—'}</td>
                </tr>`;
            }
            xanaxContent += `</tbody></table>`;
            html += makeSection('Xanax Accountability', xanaxContent, false);
        }

        html += makeSection('Member Performance', tableContent, true);

        body.innerHTML = html;

        // Wire up collapsible sections
        body.querySelectorAll('.wb-postwar-toggle').forEach(h3 => {
            h3.addEventListener('click', () => {
                h3.classList.toggle('collapsed');
                const sectionBody = h3.nextElementSibling;
                if (sectionBody) sectionBody.classList.toggle('collapsed');
            });
        });
    }

    let toastContainer = null;

    function getToastContainer() {
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'wb-toast-container';
            toastContainer.style.cssText = `
                position: fixed;
                top: ${state.ui && state.ui.chainBar ? '52px' : '10px'};
                left: 50%;
                transform: translateX(-50%);
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                pointer-events: none;
            `;
            document.body.appendChild(toastContainer);
        }
        // Update position dynamically in case UI shifted
        toastContainer.style.top = state.ui && state.ui.chainBar ? '52px' : '10px';
        return toastContainer;
    }

    function showToast(message, type = 'info') {
        const container = getToastContainer();
        const toast = document.createElement('div');

        let bg, border, icon;
        switch (type) {
            case 'success':
                bg = 'rgba(0, 184, 148, 0.95)'; // var(--wb-call-green)
                border = '#00b894';
                icon = '✓';
                break;
            case 'warning':
                bg = 'rgba(253, 203, 110, 0.95)'; // var(--wb-idle-yellow)
                border = '#fdcb6e';
                icon = '⚠️';
                break;
            case 'error':
                bg = 'rgba(214, 48, 49, 0.95)'; // var(--wb-call-red)
                border = '#d63031';
                icon = '✕';
                break;
            case 'info':
            case 'global_toast':
            default:
                bg = 'rgba(9, 132, 227, 0.95)'; // var(--wb-accent)
                border = '#0984e3';
                icon = 'ℹ';
        }

        // Special handling for broadcasts
        if (message.startsWith('📣')) {
            icon = '📣';
            message = message.substring(1).trim();
            bg = 'rgba(108, 92, 231, 0.95)'; // Purple for broadcasts
            border = '#6c5ce7';
        }

        toast.style.cssText = `
            background: ${bg};
            border-left: 4px solid ${border};
            backdrop-filter: blur(4px);
            padding: 10px 16px 10px 12px;
            border-radius: 6px;
            font-family: 'Open Sans', Arial, sans-serif;
            font-size: 13px;
            color: ${type === 'warning' ? '#000' : '#fff'};
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            opacity: 0;
            transform: translateY(-15px) scale(0.95);
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            pointer-events: auto;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 200px;
            max-width: 450px;
            line-height: 1.4;
            position: relative;
            overflow: hidden;
            box-sizing: border-box;
        `;

        toast.innerHTML = `
            <div style="font-size: 16px; display: flex; align-items: center; justify-content: center; width: 20px;">${icon}</div>
            <div style="flex: 1; word-wrap: break-word;">${message}</div>
        `;

        // v5.0.80: fixed 2-second duration per user request. Assist
        // toasts (showAssistToast) keep their 15s because they're
        // interactive — user must tap the ATTACK button.
        const duration = 2000;

        // Progress bar at the bottom
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: rgba(255,255,255,0.4);
            width: 100%;
            transition: width ${duration}ms linear;
        `;
        if (type === 'warning') progressBar.style.background = 'rgba(0,0,0,0.2)';
        toast.appendChild(progressBar);

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0) scale(1)';
            requestAnimationFrame(() => {
                progressBar.style.width = '0%';
            });
        });

        // Removal logic
        let removeTimeout;
        const removeToast = () => {
            clearTimeout(removeTimeout);
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-15px) scale(0.95)';
            toast.style.marginTop = `-${toast.offsetHeight}px`; // animate collapse
            setTimeout(() => toast.remove(), 300);
        };

        removeTimeout = setTimeout(removeToast, duration);
        toast.addEventListener('click', removeToast);
    }

    /**
     * Show a prominent assist request toast with an ATTACK button.
     * Stays for 15 seconds and includes a direct attack link.
     */
    function showAssistToast(playerName, targetName, attackUrl, opts) {
        const kind = (opts && opts.kind) || 'assist';
        log(`[${kind.toUpperCase()}-TOAST]`, playerName, targetName, attackUrl);
        const container = getToastContainer();
        const toast = document.createElement('div');

        toast.style.cssText = `
            background: rgba(214, 48, 49, 0.95);
            border-left: 4px solid #e17055;
            backdrop-filter: blur(4px);
            padding: 10px 16px 10px 12px;
            border-radius: 6px;
            font-family: 'Open Sans', Arial, sans-serif;
            font-size: 13px;
            color: #fff;
            box-shadow: 0 4px 16px rgba(214, 48, 49, 0.4);
            opacity: 0;
            transform: translateY(-15px) scale(0.95);
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            pointer-events: auto;
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 280px;
            max-width: 500px;
            line-height: 1.4;
            position: relative;
            overflow: hidden;
            box-sizing: border-box;
        `;

        const escapedPlayer = escapeHtml(playerName);
        const escapedTarget = escapeHtml(targetName);
        const icon = kind === 'retal' ? '\u26A0\uFE0F' : '\u2694\uFE0F';
        const verb = kind === 'retal' ? 'wants retal on' : 'needs assist on';
        toast.innerHTML = `
            <div style="font-size: 18px; display: flex; align-items: center; justify-content: center; width: 24px;">${icon}</div>
            <div style="flex: 1; word-wrap: break-word;">
                <strong>${escapedPlayer}</strong> ${verb} <strong>${escapedTarget}</strong>!
            </div>
            <a href="${escapeHtml(attackUrl)}" target="_blank" rel="noopener" style="
                background: #fff;
                color: #d63031;
                font-weight: 700;
                font-size: 12px;
                padding: 6px 14px;
                border-radius: 4px;
                text-decoration: none;
                white-space: nowrap;
                flex-shrink: 0;
            ">ATK</a>
        `;

        const duration = 15000;
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: rgba(255,255,255,0.4);
            width: 100%;
            transition: width ${duration}ms linear;
        `;
        toast.appendChild(progressBar);
        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0) scale(1)';
            requestAnimationFrame(() => {
                progressBar.style.width = '0%';
            });
        });

        let removeTimeout;
        const removeToast = () => {
            clearTimeout(removeTimeout);
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-15px) scale(0.95)';
            toast.style.marginTop = `-${toast.offsetHeight}px`;
            setTimeout(() => toast.remove(), 300);
        };

        removeTimeout = setTimeout(removeToast, duration);
        // Click anywhere except the ATK button to dismiss
        toast.addEventListener('click', (e) => {
            if (e.target.tagName !== 'A') removeToast();
        });
    }

    // Notifications are now driven by the polling diff logic in pollOnce() (Section 6).

    // =========================================================================
    // SECTION 23: MEMBER ACTIVITY HEATMAP
    // =========================================================================

    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    /** Fetch heatmap data from the server. Returns the heatmap object or {}. */
    async function fetchHeatmapData(factionId = null) {
        try {
            const qs = factionId ? `?factionId=${encodeURIComponent(factionId)}` : '';
            const url = `${CONFIG.SERVER_URL}/api/heatmap${qs}`;
            const res = await new Promise((resolve, reject) => {
                httpRequest({
                    method: 'GET',
                    url,
                    headers: { 'Authorization': `Bearer ${state.jwtToken}` },
                    onload(r) {
                        const d = safeParse(r.responseText);
                        if (r.status >= 200 && r.status < 300) resolve(d);
                        else reject(new Error((d && d.error) || `HTTP ${r.status}`));
                    },
                    onerror() { reject(new Error('Network error')); },
                });
            });
            return (res && res.heatmap) || {};
        } catch (e) {
            warn('Failed to fetch heatmap:', e.message);
            return {};
        }
    }

    /** Ask the server to reset heatmap data. */
    async function resetServerHeatmap(factionId = null) {
        try {
            const body = factionId ? { factionId } : {};
            await postAction('/api/heatmap/remove', body);
        } catch (e) {
            warn('Failed to reset heatmap:', e.message);
            showToast('Failed to reset heatmap: ' + e.message, 'error');
        }
    }

    /**
     * Convert server UTC heatmap data to the user's local timezone.
     * Shifts day/hour buckets by the local UTC offset.
     */
    function utcHeatmapToLocal(utcData) {
        const localData = {};
        const offsetHours = -(new Date().getTimezoneOffset() / 60); // e.g. EDT = -4 → offset = -4

        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                const bucket = (utcData[d] && utcData[d][h]) || null;
                if (!bucket || bucket.samples === 0) continue;

                let localH = h + offsetHours;
                let localD = d;
                if (localH >= 24) { localH -= 24; localD = (localD + 1) % 7; }
                if (localH < 0) { localH += 24; localD = (localD + 6) % 7; }

                if (!localData[localD]) localData[localD] = {};
                if (!localData[localD][localH]) localData[localD][localH] = { total: 0, samples: 0 };
                localData[localD][localH].total += bucket.total;
                localData[localD][localH].samples += bucket.samples;
            }
        }
        return localData;
    }

    function createHeatmapButton() {
        if (document.getElementById('wb-heatmap-toggle')) return;
        const btn = document.createElement('button');
        btn.id = 'wb-heatmap-toggle';
        btn.className = 'wb-heatmap-btn';
        btn.textContent = '\uD83D\uDCCA';
        btn.title = 'Member Activity Heatmap';
        btn.style.display = 'block';
        btn.addEventListener('click', () => toggleHeatmapPanel());
        document.body.appendChild(btn);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  COMBINED HEATMAP MODAL — v5.0.30
    //
    //  Single 📊 button opens this modal. Two tabs: Activity (day×hour
    //  grid of online %) and Payouts (member×war contribution heatmap).
    //  Replaces the previous split where 📊 opened a draggable activity
    //  panel and a separate 💰 button opened the payouts modal — user
    //  asked for one combined entry point.
    // ═══════════════════════════════════════════════════════════════════════
    let _htmModalState = {
        activeTab: GM_getValue('factionops_htm_tab', 'activity'),
        activityData: null,
        activityFetchedAt: 0,
    };

    function openCombinedHeatmapModal() {
        const existing = document.getElementById('wb-payouts-backdrop');
        if (existing) { existing.remove(); return; }
        const isAdmin = isLeader();
        if (!isAdmin) {
            // Non-admins shouldn't see the modal at all (admin-gated data).
            return;
        }
        const backdrop = document.createElement('div');
        backdrop.id = 'wb-payouts-backdrop';
        backdrop.className = 'wb-payouts-backdrop';
        // v5.0.32: stripped the Activity tab — modal is payouts-only
        // per user request ('remove activity from payouts'). The combined-
        // activity heatmap can come back as a separate feature later if
        // wanted; for now the 💰 button strictly opens payouts.
        backdrop.innerHTML = `
            <div class="wb-payouts-modal" id="wb-payouts-modal">
                <div class="wb-payouts-header">
                    <h2>💰 War Payouts</h2>
                    <span class="wb-payouts-meta" id="wb-htm-meta"></span>
                    <button class="wb-payouts-close" id="wb-payouts-close" title="Close">✕</button>
                </div>
                <div class="wb-payouts-body" id="wb-payouts-body">
                    <div class="wb-htm-pane active" id="wb-htm-pane-payouts"></div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        const close = () => { backdrop.remove(); document.removeEventListener('keydown', escClose); };
        const escClose = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escClose);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
        document.getElementById('wb-payouts-close').addEventListener('click', close);
        // Straight to payouts.
        loadHtmPayouts();
    }

    async function loadHtmActivity() {
        const pane = document.getElementById('wb-htm-pane-activity');
        const meta = document.getElementById('wb-htm-meta');
        if (!pane) return;
        pane.innerHTML = '<div style="padding:24px;color:#9ca3af;font-size:13px;text-align:center;">Loading activity heatmap…</div>';
        if (meta) meta.textContent = 'activity · loading';
        try {
            // Reuse cached data within 60s — heatmap aggregates slowly so
            // a fresh fetch on every tab-switch is wasteful.
            let raw;
            if (_htmModalState.activityData && (Date.now() - _htmModalState.activityFetchedAt) < 60_000) {
                raw = _htmModalState.activityData;
            } else {
                raw = await fetchHeatmapData(state.myFactionId);
                _htmModalState.activityData = raw;
                _htmModalState.activityFetchedAt = Date.now();
            }
            const data = utcHeatmapToLocal(raw); // shift to local TZ
            renderHtmActivity(pane, data);
            if (meta) meta.textContent = `activity · ${state.myFactionName || ''}`;
        } catch (e) {
            pane.innerHTML = `<div style="padding:24px;color:#ef4444;font-size:13px;text-align:center;">Activity heatmap failed: ${escapeHtml(e.message)}</div>`;
            if (meta) meta.textContent = 'activity · failed';
        }
    }

    function renderHtmActivity(pane, data) {
        let totalSamples = 0, maxPct = 0;
        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                const b = (data[d] && data[d][h]) || { total: 0, samples: 0, membersTotal: 0 };
                totalSamples += b.samples;
                if (b.samples > 0) {
                    if (b.membersTotal > 0) {
                        const pct = (b.total / b.membersTotal) * 100;
                        if (pct > maxPct) maxPct = pct;
                    } else {
                        const avg = b.total / b.samples;
                        if (avg > maxPct) maxPct = avg;
                    }
                }
            }
        }
        if (totalSamples === 0) {
            pane.innerHTML = '<div style="padding:24px;color:#9ca3af;font-size:13px;text-align:center;">No activity data yet — server collects it as members are seen online.</div>';
            return;
        }
        let html = `<div class="wb-payouts-section-label">Hour-of-week activity (your local time) — based on ${totalSamples.toLocaleString()} samples</div>`;
        html += '<div class="wb-htm-activity-grid">';
        // Corner spacer + hour labels row
        html += '<div></div>';
        for (let h = 0; h < 24; h++) {
            html += `<div class="wb-htm-activity-label">${h % 3 === 0 ? h : ''}</div>`;
        }
        // Day rows
        const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        for (let d = 0; d < 7; d++) {
            html += `<div class="wb-htm-activity-label wb-htm-activity-day">${DAYS[d]}</div>`;
            for (let h = 0; h < 24; h++) {
                const b = (data[d] && data[d][h]) || { total: 0, samples: 0, membersTotal: 0 };
                if (b.samples === 0) {
                    html += '<div class="wb-htm-activity-cell" style="background:rgba(255,255,255,0.04);"></div>';
                    continue;
                }
                const avg = b.total / b.samples;
                const avgMembers = b.membersTotal > 0 ? b.membersTotal / b.samples : 0;
                const pct = avgMembers > 0 ? (avg / avgMembers) * 100 : avg;
                const intensity = maxPct > 0 ? pct / maxPct : 0;
                let bg;
                if (intensity >= 0.95) bg = `rgba(255,118,117,${(intensity * 0.9 + 0.1).toFixed(2)})`;
                else if (intensity >= 0.8) bg = `rgba(253,203,110,${(intensity * 0.9 + 0.1).toFixed(2)})`;
                else bg = `rgba(0,184,148,${(intensity * 0.9 + 0.1).toFixed(2)})`;
                const tip = `${DAYS[d]} ${String(h).padStart(2, '0')}:00 — avg ${avg.toFixed(1)}${avgMembers > 0 ? ` of ${Math.round(avgMembers)} (${pct.toFixed(0)}%)` : ''} · ${b.samples} samples`;
                html += `<div class="wb-htm-activity-cell" style="background:${bg};" title="${escapeHtml(tip)}"></div>`;
            }
        }
        html += '</div>';
        html += `<div style="font-size:10px;color:#6b7280;margin-top:6px;text-align:center;">Green → orange → red as activity climbs. Hover any cell for the exact %.</div>`;
        pane.innerHTML = html;
    }

    async function loadHtmPayouts() {
        const pane = document.getElementById('wb-htm-pane-payouts');
        if (!pane) return;
        // Reuse the payouts render — it expects the body container.
        // Inject the existing controls (mode + refresh) inline.
        if (!pane.dataset.initialised) {
            pane.dataset.initialised = '1';
            pane.innerHTML = `
                <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;font-size:11px;">
                    <span style="color:#9ca3af;">Mode:</span>
                    <select id="wb-htm-payouts-mode" style="background:#0f1a14;color:#d1d5db;border:1px solid #2d4a3e;border-radius:4px;padding:3px 7px;font-size:11px;">
                        <option value="dynamic"${_payoutsModalState.mode === 'dynamic' ? ' selected' : ''}>FF Mode</option>
                        <option value="static"${_payoutsModalState.mode === 'static' ? ' selected' : ''}>Termed Mode</option>
                    </select>
                    <button id="wb-htm-payouts-refresh" style="background:#2d4a3e;color:#d1d5db;border:0;border-radius:3px;padding:3px 9px;font-size:11px;cursor:pointer;">Refresh</button>
                    <button id="wb-htm-payouts-gear" title="Per-war payout settings" style="background:none;border:1px solid #2d4a3e;border-radius:3px;color:#d1d5db;font-size:14px;cursor:pointer;padding:1px 8px;line-height:1.2;">⚙</button>
                    <span id="wb-htm-payouts-meta" style="color:#6b7280;margin-left:auto;"></span>
                </div>
                <div id="wb-payouts-body-inner"></div>
            `;
            pane.querySelector('#wb-htm-payouts-mode').addEventListener('change', async (e) => {
                _payoutsModalState.mode = e.target.value;
                try { GM_setValue('factionops_payouts_mode', e.target.value); } catch (_) { }
                await fetchAndRenderPayoutsHeatmap();
            });
            pane.querySelector('#wb-htm-payouts-refresh').addEventListener('click', async () => {
                await fetchAndRenderPayoutsHeatmap(true);
            });
            // v5.0.69: gear button → settings panel (was added to a
            // different modal that this flow doesn't actually use).
            pane.querySelector('#wb-htm-payouts-gear').addEventListener('click', () => {
                openPayoutsSettingsPanel();
            });
        }
        await fetchAndRenderPayoutsHeatmap();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  WAR PAYOUTS — v5.0.28 (rendering reused by the combined modal)
    //
    //  Member × War heatmap (APK-inspired) showing each faction member's
    //  payout score across all ended wars. Click a war column to drill
    //  down to the per-member breakdown for that war (with Send buttons
    //  that copy the dollar amount + open Torn's Controls tab).
    //
    //  Auth uses CONFIG.API_KEY against the resolveVaultCaller-gated
    //  /api/war/payouts/* endpoints (admin role required server-side).
    // ═══════════════════════════════════════════════════════════════════════
    let _payoutsModalState = {
        mode: GM_getValue('factionops_payouts_mode', 'dynamic'),
        selectedWarId: null,
        data: null,
    };

    async function openPayoutsModal() {
        // Toggle: if already open, close.
        const existing = document.getElementById('wb-payouts-backdrop');
        if (existing) { existing.remove(); return; }
        const backdrop = document.createElement('div');
        backdrop.id = 'wb-payouts-backdrop';
        backdrop.className = 'wb-payouts-backdrop';
        backdrop.innerHTML = `
            <div class="wb-payouts-modal" id="wb-payouts-modal">
                <div class="wb-payouts-header">
                    <h2>💰 War Payouts</h2>
                    <select id="wb-payouts-mode">
                        <option value="dynamic"${_payoutsModalState.mode === 'dynamic' ? ' selected' : ''}>FF Mode</option>
                        <option value="static"${_payoutsModalState.mode === 'static' ? ' selected' : ''}>Termed Mode</option>
                    </select>
                    <button id="wb-payouts-refresh" style="background:#2d4a3e;color:#d1d5db;border:0;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;">Refresh</button>
                    <button id="wb-payouts-gear" title="Per-war payout settings" style="background:none;border:0;color:#d1d5db;font-size:18px;cursor:pointer;padding:2px 6px;">⚙</button>
                    <span class="wb-payouts-meta" id="wb-payouts-meta">Loading…</span>
                    <button class="wb-payouts-close" id="wb-payouts-close" title="Close">✕</button>
                </div>
                <div class="wb-payouts-body" id="wb-payouts-body">
                    <div style="padding:24px;color:#9ca3af;font-size:13px;text-align:center;">
                        Loading heatmap…
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        // Close handlers
        const close = () => { backdrop.remove(); document.removeEventListener('keydown', escClose); };
        const escClose = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escClose);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
        document.getElementById('wb-payouts-close').addEventListener('click', close);
        // Mode change
        document.getElementById('wb-payouts-mode').addEventListener('change', async (e) => {
            _payoutsModalState.mode = e.target.value;
            try { GM_setValue('factionops_payouts_mode', e.target.value); } catch (_) { }
            await fetchAndRenderPayoutsHeatmap();
        });
        document.getElementById('wb-payouts-refresh').addEventListener('click', async () => {
            await fetchAndRenderPayoutsHeatmap(true);
        });
        // v5.0.68: gear button → settings panel for the currently
        // selected war. Only meaningful after data is loaded (so we
        // know which warId is selected).
        document.getElementById('wb-payouts-gear').addEventListener('click', () => {
            openPayoutsSettingsPanel();
        });
        await fetchAndRenderPayoutsHeatmap();
    }

    // ── v5.0.68: per-war payout-calc settings panel ─────────────────────
    function openPayoutsSettingsPanel() {
        const data = _payoutsModalState.data;
        const warId = _payoutsModalState.selectedWarId;
        if (!data || !warId) return;
        const war = (data.wars || []).find(w => String(w.warId) === String(warId));
        if (!war) return;
        const existing = document.getElementById('wb-payouts-settings-overlay');
        if (existing) { existing.remove(); return; }

        const cur = war.settings || {};
        const overlay = document.createElement('div');
        overlay.id = 'wb-payouts-settings-overlay';
        overlay.className = 'wb-payouts-settings-overlay';
        overlay.innerHTML = `
            <div class="wb-payouts-settings-panel">
                <div class="wb-payouts-settings-header">
                    <h3>Settings — vs ${escapeHtml(war.enemyFactionName || '?')}</h3>
                    <button class="wb-payouts-settings-close" title="Close">✕</button>
                </div>
                <div class="wb-payouts-settings-body">
                    ${war.settingsApplied === false ? `
                    <div class="wb-payouts-settings-stale">
                        <strong>These weights are saved but not applied.</strong>
                        This war has ended and there is no stored attack log to recompute it from,
                        so the figures below still come from the archived calculation. Saving will
                        keep the settings for later, but the numbers will not move.
                    </div>` : ''}
                    <label>
                        <span>Loot total ($)</span>
                        <input type="number" id="wb-set-loot" min="0" step="1" placeholder="auto: ${(war.lootTotal || 0).toLocaleString()}" value="${cur.lootOverride != null ? cur.lootOverride : ''}">
                        <small>Auto-detected from cache market values. Override here with the actual amount you got from selling caches + treasury.</small>
                    </label>
                    <label>
                        <span>Payout pool %</span>
                        <input type="number" id="wb-set-payoutpct" min="0" max="100" step="1" placeholder="80" value="${cur.payoutPct != null ? Math.round(cur.payoutPct * 100) : ''}">
                        <small>Percent of loot distributed to members; rest goes to faction. Default 80.</small>
                    </label>
                    <label>
                        <span>Assist weight</span>
                        <input type="number" id="wb-set-assist" min="0" step="0.05" placeholder="0.3" value="${cur.assistWeight != null ? cur.assistWeight : ''}">
                        <small>Multiplier on assist contribution. Default 0.3 = group-hit participants pay ~30% of a solo war hit. Set 0 to pay assists nothing; 1 to count them as full war hits.</small>
                    </label>
                    <label>
                        <span>Non-war hit weight</span>
                        <input type="number" id="wb-set-nonwar" min="0" step="0.05" placeholder="0.3" value="${cur.nonWarWeight != null ? cur.nonWarWeight : ''}">
                        <small>Multiplier for hits during the war that weren't ranked-war attacks. Default 0.3 (assist-level).</small>
                    </label>
                    <label>
                        <span>Turtle pay ($ each)</span>
                        <input type="number" id="wb-set-turtlepay" min="0" step="100000" placeholder="0" value="${cur.turtlePay != null ? cur.turtlePay : ''}">
                        <small>A flat amount per friendly hospitalisation, paid off the <b>top</b> of the pool \u2014 turtlers first, everyone else splits what is left, so the faction share is untouched. Capped at the pool and shared out in proportion if it would exceed it. Set this and the turtle weight below is ignored, so a turtle is never paid twice.</small>
                    </label>
                    <label>
                        <span>Turtle weight</span>
                        <input type="number" id="wb-set-turtle" min="0" step="0.05" placeholder="0" value="${cur.turtleWeight != null ? cur.turtleWeight : ''}">
                        <small>Score per friendly hospitalisation \u2014 hitting our own member so the enemy cannot farm them. Default 0: counted and shown, but unpaid. A turtle earns no respect, so this is a flat score in both modes.</small>
                    </label>
                    <label>
                        <span>Loss attack weight</span>
                        <input type="number" id="wb-set-failed" min="0" step="0.05" placeholder="0" value="${cur.failedWeight != null ? cur.failedWeight : ''}">
                        <small>Flat score per lost attempt (defended/stalemate/lost/escaped). Default 0 — no payout for losses. Set 0.1 to reward effort with ~10% of a war-hit's payout per attempt.</small>
                    </label>
                </div>
                <div class="wb-payouts-settings-footer">
                    <button class="wb-payouts-settings-clear" type="button">Clear overrides</button>
                    <div style="flex:1"></div>
                    <button class="wb-payouts-settings-cancel" type="button">Cancel</button>
                    <button class="wb-payouts-settings-save" type="button">Save & recompute</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const closeOverlay = () => overlay.remove();
        overlay.querySelector('.wb-payouts-settings-close').addEventListener('click', closeOverlay);
        overlay.querySelector('.wb-payouts-settings-cancel').addEventListener('click', closeOverlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });

        const apiKey = CONFIG.API_KEY;
        const post = (settings) => new Promise((resolve, reject) => {
            httpRequest({
                method: 'POST',
                url: `${CONFIG.SERVER_URL}/api/war/${encodeURIComponent(warId)}/payout-settings?key=${apiKey}`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(settings),
                onload(res) {
                    const d = safeParse(res.responseText);
                    if (res.status >= 200 && res.status < 300) resolve(d);
                    else reject(new Error((d && d.error) || `HTTP ${res.status}`));
                },
                onerror() { reject(new Error('Network error')); },
            });
        });

        overlay.querySelector('.wb-payouts-settings-save').addEventListener('click', async () => {
            const settings = {};
            const loot = overlay.querySelector('#wb-set-loot').value.trim();
            const pct = overlay.querySelector('#wb-set-payoutpct').value.trim();
            const asw = overlay.querySelector('#wb-set-assist').value.trim();
            const nw = overlay.querySelector('#wb-set-nonwar').value.trim();
            const fw = overlay.querySelector('#wb-set-failed').value.trim();
            const tw = overlay.querySelector('#wb-set-turtle').value.trim();
            const tp = overlay.querySelector('#wb-set-turtlepay').value.trim();
            if (loot !== '') settings.lootOverride = Number(loot);
            if (pct !== '') settings.payoutPct = Number(pct) / 100;
            if (asw !== '') settings.assistWeight = Number(asw);
            if (nw !== '') settings.nonWarWeight = Number(nw);
            if (fw !== '') settings.failedWeight = Number(fw);
            if (tw !== '') settings.turtleWeight = Number(tw);
            if (tp !== '') settings.turtlePay = Number(tp);
            try {
                await post(settings);
                closeOverlay();
                showToast('Settings saved — recomputing…', 'info');
                await fetchAndRenderPayoutsHeatmap(true);
            } catch (e) {
                showToast(`Save failed: ${e.message}`, 'error');
            }
        });
        overlay.querySelector('.wb-payouts-settings-clear').addEventListener('click', async () => {
            try {
                await post({}); // empty body → all defaults restored
                closeOverlay();
                showToast('Overrides cleared — recomputing…', 'info');
                await fetchAndRenderPayoutsHeatmap(true);
            } catch (e) {
                showToast(`Clear failed: ${e.message}`, 'error');
            }
        });
    }

    async function fetchAndRenderPayoutsHeatmap(forceFresh = false) {
        // v5.0.30: render into the combined modal's payouts pane inner
        // container if present; fall back to the old wb-payouts-body
        // for any callers that still target the standalone modal.
        const body = document.getElementById('wb-payouts-body-inner')
            || document.getElementById('wb-payouts-body');
        const meta = document.getElementById('wb-htm-payouts-meta')
            || document.getElementById('wb-payouts-meta');
        if (!body) return;
        body.innerHTML = '<div style="padding:24px;color:#9ca3af;font-size:13px;text-align:center;">Crunching numbers — pulling every war attack and weighting them. Can take a few seconds…</div>';
        if (meta) meta.textContent = '…';
        const apiKey = CONFIG.API_KEY;
        if (!apiKey) {
            body.innerHTML = '<div style="padding:24px;color:#ef4444;font-size:13px;text-align:center;">No API key configured — open Settings ⚙ and paste your Torn API key.</div>';
            return;
        }
        const params = new URLSearchParams({ key: apiKey, mode: _payoutsModalState.mode });
        if (forceFresh) params.set('fresh', '1');
        try {
            const data = await new Promise((resolve, reject) => {
                httpRequest({
                    method: 'GET',
                    url: `${CONFIG.SERVER_URL}/api/war/payouts/heatmap?${params.toString()}`,
                    onload(res) {
                        const d = safeParse(res.responseText);
                        if (res.status >= 200 && res.status < 300) resolve(d);
                        else reject(new Error((d && d.error) || `HTTP ${res.status}`));
                    },
                    onerror() { reject(new Error('Network error')); },
                    timeout: 60_000, // big calc; allow 60s
                    ontimeout() { reject(new Error('Request timed out')); },
                });
            });
            _payoutsModalState.data = data;
            renderPayoutsHeatmap(body, data);
            if (meta) meta.textContent = `${data.wars.length} wars · ${data.members.length} members · ${new Date(data.generatedAt).toLocaleTimeString()}`;
        } catch (e) {
            body.innerHTML = `<div style="padding:24px;color:#ef4444;font-size:13px;text-align:center;">Failed to load: ${escapeHtml(e.message)}</div>`;
            if (meta) meta.textContent = 'failed';
        }
    }

    function renderPayoutsHeatmap(container, data) {
        // v5.0.61: dropped the member×war heatmap matrix entirely per
        // user request — only the per-war drilldown is rendered now.
        // Wars list goes into a small selector pill row at the top so
        // admins can switch between wars without the matrix overhead.
        const wars = Array.isArray(data.wars) ? data.wars : [];
        const members = Array.isArray(data.members) ? data.members : [];
        if (members.length === 0 || wars.length === 0) {
            container.innerHTML = '<div style="padding:24px;color:#9ca3af;font-size:13px;text-align:center;">No payout data yet — finish a ranked war and check back here.</div>';
            return;
        }

        // Default to the most recent war if no selection or selection
        // points to a war no longer in the data.
        const knownWarIds = new Set(wars.map(w => String(w.warId)));
        if (!_payoutsModalState.selectedWarId || !knownWarIds.has(String(_payoutsModalState.selectedWarId))) {
            // Wars come back most-recent first from listEligibleWars sort.
            _payoutsModalState.selectedWarId = String(wars[0].warId);
        }

        // War-selector pills. Each pill: enemy name + date + W/L badge.
        let html = `<div class="wb-payouts-warpicker">`;
        for (const w of wars) {
            const date = w.warEndedAt ? new Date(w.warEndedAt).toISOString().slice(5, 10) : '—';
            const result = w.warResult === 'victory' ? '<span style="color:#74c69d">✓</span>'
                : w.warResult === 'defeat' ? '<span style="color:#ef4444">✗</span>'
                    : '<span style="color:#9ca3af">=</span>';
            const sel = String(w.warId) === String(_payoutsModalState.selectedWarId) ? ' selected' : '';
            html += `<button class="wb-payouts-warpill${sel}" data-war="${escapeHtml(w.warId)}" type="button">`
                + `<span class="warpill-name">${escapeHtml((w.enemyFactionName || '?'))}</span>`
                + `<span class="warpill-meta">${date} ${result}</span>`
                + `</button>`;
        }
        html += `</div>`;
        // Drilldown lives below the picker.
        html += `<div id="wb-payouts-drill"></div>`;

        container.innerHTML = html;

        // Wire pill clicks → re-render with new selection.
        container.querySelectorAll('.wb-payouts-warpill').forEach(el => {
            el.addEventListener('click', () => {
                const warId = el.dataset.war;
                if (String(warId) === String(_payoutsModalState.selectedWarId)) return;
                _payoutsModalState.selectedWarId = warId;
                renderPayoutsHeatmap(container, data);
            });
        });

        if (_payoutsModalState.selectedWarId) {
            renderPayoutsDrilldown(_payoutsModalState.selectedWarId);
        }
    }

    function renderPayoutsDrilldown(warId) {
        const drill = document.getElementById('wb-payouts-drill');
        if (!drill || !_payoutsModalState.data) return;
        const data = _payoutsModalState.data;
        const war = data.wars.find(w => String(w.warId) === String(warId));
        if (!war) { drill.innerHTML = ''; return; }
        if (war.error) {
            drill.innerHTML = `<div class="wb-payouts-drilldown" style="color:#ef4444;">War ${escapeHtml(warId)} failed to load: ${escapeHtml(war.error)}</div>`;
            return;
        }
        // Pull this war's members from the matrix. v5.0.41: now also
        // includes per-war attack count + breakdown so the table can
        // surface 'how did I earn this score' columns (Atk, Asst, War,
        // Retal). Without these the drilldown only showed score+payout
        // and there was no way to see attack counts at all.
        const rows = data.members
            .filter(m => m.scoresByWar[warId] != null && m.scoresByWar[warId] > 0)
            .map(m => {
                const bd = (m.breakdownByWar && m.breakdownByWar[warId]) || {};
                return {
                    playerId: m.playerId,
                    name: m.name,
                    score: m.scoresByWar[warId],
                    tornScore: (m.tornScoresByWar && m.tornScoresByWar[warId]) || 0,
                    avgFf: (m.avgFfByWar && m.avgFfByWar[warId]) || 0,
                    payout: m.payoutsByWar[warId] || 0,
                    attacks: (m.attacksByWar && m.attacksByWar[warId]) || 0,
                    totalAttacks: (m.totalAttacksByWar && m.totalAttacksByWar[warId]) || (m.attacksByWar && m.attacksByWar[warId]) || 0,
                    bd_war: bd.war_hit || 0,
                    bd_retal: bd.retal || 0,
                    bd_overseas: (bd.overseas_war || 0) + (bd.os_chain || 0),
                    bd_chain: bd.chain_hit || 0,
                    bd_assist: bd.assist || 0,
                    bd_non_war: bd.non_war || 0,
                    bd_failed: bd.failed || 0,
                };
            })
            .sort((a, b) => b.score - a.score);
        const totalScore = rows.reduce((s, m) => s + m.score, 0);
        const fmt$ = n => '$' + (n || 0).toLocaleString();
        // Compact category-breakdown tooltip helper.
        const bdTooltip = r => {
            const parts = [];
            if (r.bd_war) parts.push(`War: ${r.bd_war}`);
            if (r.bd_retal) parts.push(`Retal: ${r.bd_retal}`);
            if (r.bd_overseas) parts.push(`Overseas: ${r.bd_overseas}`);
            if (r.bd_chain) parts.push(`Chain: ${r.bd_chain}`);
            if (r.bd_assist) parts.push(`Assist: ${r.bd_assist}`);
            return parts.join(' · ') || 'no breakdown data';
        };

        // v5.0.42: surface the cache-by-cache loot breakdown so admins
        // can verify the auto-detected total instead of guessing where
        // it came from. Source label tells them "this is from item
        // market values" vs "this is a respect/points fallback".
        const sourceLabel = war.lootSource === 'caches+cash' ? 'cache market values'
            : war.lootSource === 'cash' ? 'cash reward'
                : war.lootSource === 'points' ? 'points × $5K'
                    : war.lootSource === 'override' ? 'admin override'
                        : 'auto';
        let lootDetail = '';
        if (war.lootBreakdown && Array.isArray(war.lootBreakdown.items) && war.lootBreakdown.items.length > 0) {
            const lines = war.lootBreakdown.items
                .filter(it => it.lineTotal > 0)
                .map(it => `${escapeHtml(it.name)} ×${it.quantity} = ${fmt$(it.lineTotal)}`);
            if (war.lootBreakdown.cash > 0) lines.unshift(`Cash: ${fmt$(war.lootBreakdown.cash)}`);
            lootDetail = `<div style="margin-top:6px;padding:8px 10px;background:rgba(116,198,141,0.07);border:1px solid rgba(116,198,141,0.18);border-radius:4px;font-size:11px;line-height:1.6;color:#9ca3af;">
                <div style="color:#74c69d;font-weight:600;margin-bottom:4px;">Loot estimate (${escapeHtml(sourceLabel)})</div>
                ${lines.join('<br>')}
                <div style="margin-top:4px;font-size:10px;opacity:0.7;">Market prices — actual realized loot may vary if you sell below market or add treasury cash.</div>
            </div>`;
        }

        // v5.0.60: surface the 80/20 split so admins can see how much
        // of the loot is being distributed vs retained by the faction.
        // Saved-but-not-applied has to be visible from the board itself. The
        // whole class of bug this came from was settings being silently ignored,
        // and a warning you have to open a panel to find is barely a warning.
        const staleLine = war.settingsApplied === false
            ? ' · <span style="color:#f59e0b">custom weights saved but NOT applied (archived war)</span>'
            : '';
        // Off the top, so the shares below will not reconcile against the pool
        // unless this is stated.
        const turtleLine = (war.turtlePaid > 0)
            ? ` · ${fmt$(war.turtlePaid)} paid flat for turtling${war.turtleCapped ? ' <span style="color:#f59e0b">(capped at the pool)</span>' : ''}`
            : '';
        const splitLine = (war.payoutPct != null && war.payoutPool != null && war.factionShare != null)
            ? ` · payout pool ${fmt$(war.payoutPool)} (${Math.round(war.payoutPct * 100)}%) · faction keeps ${fmt$(war.factionShare)}`
            : '';
        let html = `<div class="wb-payouts-section-label">Drilldown — vs ${escapeHtml(war.enemyFactionName || '?')} · ${escapeHtml(war.warResult || '?')} · loot ${fmt$(war.lootTotal)} <span style="opacity:0.6;font-size:10px;">(${escapeHtml(sourceLabel)})</span>${splitLine}${turtleLine}${staleLine} · total score ${war.totalScore}</div>`;
        html += lootDetail;
        html += `<div class="wb-payouts-drilldown"><table>`;
        // v5.0.45: simplified to 5 columns. Earlier 11-column layout
        // (Atk · FF · War · Retal · Asst · OS · Fair · Torn · Share · Payout)
        // crammed too much in — admins couldn't read what the numbers
        // meant. The breakdown (war/retal/assist/OS counts), FF, and
        // Torn-score comparison still live in the row tooltip for any
        // admin who wants the detail.
        // v5.0.52: reordered so Payout is leftmost numeric column
        // (it's what admins actually act on). Attacks is last and is
        // a click-popover trigger showing the per-category breakdown.
        html += `<thead><tr>`
            + `<th>Member</th>`
            + `<th class="right">Payout</th>`
            + `<th class="right">Share</th>`
            + `<th class="right" title="Score driving payout shares. FF Mode: fair_score = respect ÷ war ÷ chain_bonus ÷ warlord_bonus (FF-aware). Termed Mode: 1.0 per war hit, 0.3 per assist or non-war hit (every successful hit pays equally regardless of FF).">Score</th>`
            + `<th class="right">Attacks</th>`
            + `</tr></thead><tbody>`;
        // v5.0.56: pre-format every row's numeric values, then compute
        // the max width per column so we can left-pad shorter values
        // with non-breaking spaces. With monospace font + uniform
        // string length, every cell's content has identical width and
        // every column lines up perfectly across rows. Without this
        // padding the user saw e.g. '$67,089' shifting columns vs
        // '$151,849,807' in the same column.
        const formatted = rows.map(r => {
            const share = totalScore > 0 ? (r.score / totalScore) * 100 : 0;
            return {
                payout: fmt$(r.payout),
                share: share.toFixed(1) + '%',
                score: (Number(r.score) || 0).toFixed(2),
                attacks: String(r.attacks || ''),
            };
        });
        const padTo = {
            payout: Math.max(...formatted.map(f => f.payout.length), 1),
            share: Math.max(...formatted.map(f => f.share.length), 1),
            score: Math.max(...formatted.map(f => f.score.length), 1),
            attacks: Math.max(...formatted.map(f => f.attacks.length), 1),
        };
        const NBSP = ' ';
        const lpad = (s, n) => NBSP.repeat(Math.max(0, n - s.length)) + s;

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const f = formatted[i];
            const share = totalScore > 0 ? (r.score / totalScore) * 100 : 0;
            // Rich row tooltip with everything-you-might-want-to-know
            const detailParts = [];
            if (r.avgFf) detailParts.push(`Avg FF: ${r.avgFf.toFixed(2)}`);
            if (r.tornScore) detailParts.push(`Torn score: ${r.tornScore}`);
            const bdParts = [];
            if (r.bd_war) bdParts.push(`War ${r.bd_war}`);
            if (r.bd_retal) bdParts.push(`Retal ${r.bd_retal}`);
            if (r.bd_assist) bdParts.push(`Asst ${r.bd_assist}`);
            if (r.bd_overseas) bdParts.push(`OS ${r.bd_overseas}`);
            if (bdParts.length) detailParts.push(`Breakdown: ${bdParts.join(' · ')}`);
            // Per-row tooltip (kept for desktop hover) — but the real
            // breakdown is in the click-popover wired below.
            const rowTip = `${r.name} [${r.playerId}]\n${detailParts.join('\n')}`;
            // Encode breakdown as data attrs so the popover can read them
            // without re-deriving from data.
            const bdJson = JSON.stringify({
                war: r.bd_war, retal: r.bd_retal, assist: r.bd_assist,
                overseas: r.bd_overseas, chain: r.bd_chain,
                non_war: r.bd_non_war,
                failed: r.bd_failed,
                avgFf: r.avgFf, tornScore: r.tornScore,
                warAttacks: r.attacks, totalAttacks: r.totalAttacks,
                name: r.name,
            });
            html += `<tr title="${escapeHtml(rowTip)}">`;
            // 💵 Pay: opens the faction Controls → Give to user tab prefilled
            // with this member + their payout (you still hit Give). No autosend.
            const _payAmt = Math.round(Number(r.payout) || 0);
            const _payLink = (_payAmt > 0 && r.playerId != null)
                ? ` <a class="wb-pay-btn" href="https://www.torn.com/factions.php?step=your#/tab=controls&addMoneyTo=${encodeURIComponent(r.playerId)}&money=${_payAmt}" target="_blank" rel="noopener" title="Add ${fmt$(_payAmt)} to balance — prefilled, you confirm" style="margin-left:6px;text-decoration:none;font-size:13px;">💵</a>`
                : '';
            html += `<td><a href="/profiles.php?XID=${escapeHtml(r.playerId)}" target="_blank" rel="noopener" style="color:#d1d5db;text-decoration:none;">${escapeHtml(r.name)}</a>${_payLink}</td>`;
            html += `<td class="right" style="color:#74c69d;font-weight:600;">${lpad(f.payout, padTo.payout)}</td>`;
            html += `<td class="right" style="color:#9ca3af;">${lpad(f.share, padTo.share)}</td>`;
            html += `<td class="right col-score">${lpad(f.score, padTo.score)}</td>`;
            html += `<td class="right col-attacks" data-breakdown='${escapeHtml(bdJson)}' title="Tap for attack breakdown">${lpad(f.attacks || '—', padTo.attacks)}</td>`;
            html += `</tr>`;
        }
        html += `</tbody></table></div>`;
        drill.innerHTML = html;

        // ── Wire click-popover on Attacks cell ──────────────────────────
        // Native title tooltip doesn't work on touch (PDA, phone) and is
        // sluggish on desktop. Custom popover sits over the cell on click,
        // closes on second click / outside click / Escape.
        const closePopover = () => {
            const existing = document.getElementById('wb-attack-popover');
            if (existing) existing.remove();
        };
        drill.querySelectorAll('td.col-attacks').forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasOpen = document.getElementById('wb-attack-popover');
                closePopover();
                if (wasOpen && wasOpen.dataset.forCell === cell.dataset.breakdown) return;
                let bd;
                try { bd = JSON.parse(cell.dataset.breakdown || '{}'); } catch (_) { return; }
                const pop = document.createElement('div');
                pop.id = 'wb-attack-popover';
                pop.className = 'wb-attack-popover';
                pop.dataset.forCell = cell.dataset.breakdown;
                const rows = [];
                // v5.0.57: war-vs-total ratio at the top so admins can
                // see how focused each member was on war attacks vs
                // off-war chains. Only war attacks contribute to score.
                if (bd.totalAttacks && bd.warAttacks != null) {
                    const pct = bd.totalAttacks > 0
                        ? Math.round((bd.warAttacks / bd.totalAttacks) * 100)
                        : 0;
                    rows.push(['War / Total', `${bd.warAttacks} / ${bd.totalAttacks} (${pct}%)`]);
                }
                if (bd.war) rows.push(['War hits', bd.war]);
                if (bd.retal) rows.push(['Retals', bd.retal]);
                if (bd.assist) rows.push(['Assists', bd.assist]);
                if (bd.overseas) rows.push(['Overseas', bd.overseas]);
                if (bd.chain) rows.push(['Chain hits', bd.chain]);
                if (bd.non_war) rows.push(['Non-war hits', `${bd.non_war} (×0.3 weight)`]);
                if (bd.failed) rows.push(['Losses', String(bd.failed)]);
                if (bd.avgFf) rows.push(['Avg FF', bd.avgFf.toFixed(2)]);
                if (bd.tornScore) rows.push(['Torn score', bd.tornScore]);
                pop.innerHTML = `<div class="pop-title">${escapeHtml(bd.name || 'Attack breakdown')}</div>`
                    + rows.map(([k, v]) => `<div class="pop-row"><span class="pop-cat">${escapeHtml(String(k))}</span><span class="pop-val">${escapeHtml(String(v))}</span></div>`).join('');
                document.body.appendChild(pop);
                // Position above-or-below the cell, clamped to viewport.
                const rect = cell.getBoundingClientRect();
                const popRect = pop.getBoundingClientRect();
                let top = rect.bottom + 6;
                if (top + popRect.height > window.innerHeight - 8) {
                    top = Math.max(8, rect.top - popRect.height - 6);
                }
                let left = rect.right - popRect.width;
                if (left < 8) left = 8;
                pop.style.top = top + 'px';
                pop.style.left = left + 'px';
            });
        });
        // Outside-click + Escape close
        if (!window.__wbAttackPopoverGlobal) {
            window.__wbAttackPopoverGlobal = true;
            document.addEventListener('click', (e) => {
                if (e.target.closest('.wb-attack-popover')) return;
                if (e.target.closest('td.col-attacks')) return;
                closePopover();
            }, true);
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closePopover();
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  COMBINED ACTIVITY HEATMAP — v5.0.34
    //
    //  Mirrors the warboard-native APK's HeatmapTab: ONE day×hour grid
    //  showing both factions' activity simultaneously. Each cell is
    //  diverging-colored: green if WE're more active that hour, red if
    //  THEY are, neutral grey when even / no data. Intensity scales
    //  with |delta| / max-abs-delta across the matrix.
    // ═══════════════════════════════════════════════════════════════════════
    function toggleCombinedHeatmapPanel(ourId, ourName, enemyId, enemyName) {
        const existing = document.getElementById('wb-heatmap-panel');
        if (existing) {
            // Toggle off if it's already showing the combined view for
            // the same matchup; otherwise re-render with the new pair.
            const sig = `${ourId}-vs-${enemyId}`;
            if (existing.dataset.combinedSig === sig) {
                existing.remove();
                return;
            }
            existing.remove();
        }
        renderCombinedHeatmapPanel(ourId, ourName, enemyId, enemyName);
    }

    async function renderCombinedHeatmapPanel(ourId, ourName, enemyId, enemyName) {
        const [oursRaw, theirsRaw] = await Promise.all([
            fetchHeatmapData(ourId).catch(() => ({})),
            fetchHeatmapData(enemyId).catch(() => ({})),
        ]);
        const ours = utcHeatmapToLocal(oursRaw);
        const theirs = utcHeatmapToLocal(theirsRaw);

        // Per-cell pct (active members / total members), then delta.
        const cellPct = (data, d, h) => {
            const b = (data[d] && data[d][h]) || null;
            if (!b || b.samples === 0) return null;
            const avg = b.total / b.samples;
            const avgMembers = b.membersTotal > 0 ? b.membersTotal / b.samples : 0;
            return avgMembers > 0 ? (avg / avgMembers) * 100 : avg;
        };

        // Find max absolute delta for normalization.
        let maxAbsDelta = 0;
        let totalSamples = 0;
        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                const o = cellPct(ours, d, h);
                const t = cellPct(theirs, d, h);
                const ob = (ours[d] && ours[d][h]) || null;
                const tb = (theirs[d] && theirs[d][h]) || null;
                if (ob) totalSamples += ob.samples;
                if (tb) totalSamples += tb.samples;
                if (o == null && t == null) continue;
                const delta = (o || 0) - (t || 0);
                if (Math.abs(delta) > maxAbsDelta) maxAbsDelta = Math.abs(delta);
            }
        }
        if (maxAbsDelta < 1) maxAbsDelta = 1;

        const panel = document.createElement('div');
        panel.id = 'wb-heatmap-panel';
        panel.className = 'wb-heatmap-panel';
        panel.dataset.combinedSig = `${ourId}-vs-${enemyId}`;

        // Restore saved position. Match renderHeatmapPanel exactly:
        // set left/top WITHOUT touching transform — the CSS keeps
        // translateX(-50%) so offsetLeft / saved-left stays consistent
        // with how the single-faction panel persists position.
        const savedPos = GM_getValue('factionops_heatmap_pos', null);
        if (savedPos) {
            try {
                const pos = typeof savedPos === 'string' ? JSON.parse(savedPos) : savedPos;
                if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
                    panel.style.left = pos.left + 'px';
                    panel.style.top = pos.top + 'px';
                }
            } catch (_) { }
        }

        // Header (draggable)
        const header = document.createElement('div');
        header.className = 'wb-heatmap-header';
        header.style.cursor = 'move';
        header.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:13px;font-weight:600;">📈 Activity — combined</span>
                <span style="font-size:10px;color:#22c55e;font-weight:700;">${escapeHtml(ourName || 'Us')}</span>
                <span style="font-size:10px;color:#9ca3af;">vs</span>
                <span style="font-size:10px;color:#ef4444;font-weight:700;">${escapeHtml(enemyName || 'Enemy')}</span>
            </div>
            <button class="wb-heatmap-close" title="Close">✕</button>
        `;
        panel.appendChild(header);
        header.querySelector('.wb-heatmap-close').addEventListener('click', () => panel.remove());

        // Drag handlers — mirror the single-faction panel exactly so
        // both panels round-trip position the same way (offsetLeft/Top
        // is the un-translated value; CSS translateX(-50%) handles the
        // visual centering offset).
        let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.wb-heatmap-close')) return;
            isDragging = true;
            dragOffsetX = e.clientX - panel.offsetLeft;
            dragOffsetY = e.clientY - panel.offsetTop;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panel.style.left = (e.clientX - dragOffsetX) + 'px';
            panel.style.top = (e.clientY - dragOffsetY) + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                GM_setValue('factionops_heatmap_pos', JSON.stringify({
                    left: panel.offsetLeft, top: panel.offsetTop,
                }));
            }
        });

        if (totalSamples === 0) {
            const msg = document.createElement('div');
            msg.style.cssText = 'padding:16px;font-size:12px;opacity:0.7;text-align:center;';
            msg.textContent = 'No activity data yet for either faction.';
            panel.appendChild(msg);
            document.body.appendChild(panel);
            return;
        }

        // Diverging-color legend
        const legend = document.createElement('div');
        legend.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 12px 4px;font-size:10px;color:#9ca3af;';
        legend.innerHTML = `
            <span style="color:#ef4444;font-weight:700;">Enemy</span>
            <div style="flex:1;height:8px;border-radius:2px;background:linear-gradient(to right,#ef4444,rgba(255,255,255,0.2),#22c55e);"></div>
            <span style="color:#22c55e;font-weight:700;">Us</span>
        `;
        panel.appendChild(legend);

        // Grid
        const grid = document.createElement('div');
        grid.className = 'wb-heatmap-grid';
        grid.appendChild(document.createElement('div')); // corner spacer
        for (let h = 0; h < 24; h++) {
            const lbl = document.createElement('div');
            lbl.className = 'wb-heatmap-label wb-heatmap-hour';
            lbl.textContent = h % 3 === 0 ? h : '';
            grid.appendChild(lbl);
        }
        const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        for (let d = 0; d < 7; d++) {
            const dayLbl = document.createElement('div');
            dayLbl.className = 'wb-heatmap-label wb-heatmap-day';
            dayLbl.textContent = DAYS[d];
            grid.appendChild(dayLbl);
            for (let h = 0; h < 24; h++) {
                const cell = document.createElement('div');
                cell.className = 'wb-heatmap-cell';
                const o = cellPct(ours, d, h);
                const t = cellPct(theirs, d, h);
                if (o == null && t == null) {
                    cell.style.backgroundColor = 'rgba(255,255,255,0.04)';
                    cell.title = `${DAYS[d]} ${String(h).padStart(2, '0')}:00 — no data`;
                } else {
                    const op = o || 0, tp = t || 0;
                    const delta = op - tp; // + = us more active
                    const intensity = Math.min(1, Math.abs(delta) / maxAbsDelta);
                    const alpha = (0.18 + intensity * 0.72).toFixed(2);
                    if (delta > 0.5) {
                        cell.style.backgroundColor = `rgba(34,197,94,${alpha})`;
                    } else if (delta < -0.5) {
                        cell.style.backgroundColor = `rgba(239,68,68,${alpha})`;
                    } else {
                        cell.style.backgroundColor = 'rgba(255,255,255,0.10)';
                    }
                    cell.title = `${DAYS[d]} ${String(h).padStart(2, '0')}:00\n` +
                        `Us: ${op.toFixed(1)}%  ·  Enemy: ${tp.toFixed(1)}%\n` +
                        `Δ: ${delta > 0 ? '+' : ''}${delta.toFixed(1)} pts`;
                }
                grid.appendChild(cell);
            }
        }
        panel.appendChild(grid);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'wb-heatmap-footer';
        footer.innerHTML = `<span style="font-size:11px;opacity:0.6;">${totalSamples.toLocaleString()} total samples · max Δ ${maxAbsDelta.toFixed(1)} pts</span>`;
        panel.appendChild(footer);

        document.body.appendChild(panel);
    }

    function toggleHeatmapPanel(factionId = null, factionName = null) {
        const existing = document.getElementById('wb-heatmap-panel');
        if (existing) {
            const currentId = existing.dataset.factionId || '';
            const targetId = factionId ? String(factionId) : '';
            existing.remove();
            if (currentId === targetId) return;
        }
        renderHeatmapPanel(factionId, factionName);
    }

    async function renderHeatmapPanel(factionId = null, factionName = null) {
        const existing = document.getElementById('wb-heatmap-panel');
        if (existing) existing.remove();

        const data = await fetchHeatmapData(factionId); // Already in UTC = TCT

        // Find max average percentage for color scaling
        let maxPct = 0;
        let totalSamples = 0;
        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                const bucket = (data[d] && data[d][h]) || { total: 0, samples: 0, membersTotal: 0 };
                totalSamples += bucket.samples;
                if (bucket.samples > 0) {
                    // Use stored membersTotal if available, fallback to 1 to avoid div by zero
                    const membersTotal = bucket.membersTotal || 0;
                    if (membersTotal > 0) {
                        const pct = (bucket.total / membersTotal) * 100;
                        if (pct > maxPct) maxPct = pct;
                    } else {
                        // Compatibility for old data: use raw count for maxAvg (we'll handle scaling below)
                        const avg = bucket.total / bucket.samples;
                        if (avg > maxPct) maxPct = avg;
                    }
                }
            }
        }

        const panel = document.createElement('div');
        panel.id = 'wb-heatmap-panel';
        panel.className = 'wb-heatmap-panel';
        if (factionId) panel.dataset.factionId = factionId;

        // Restore saved position
        const savedPos = GM_getValue('factionops_heatmap_pos', null);
        if (savedPos) {
            try {
                const pos = typeof savedPos === 'string' ? JSON.parse(savedPos) : savedPos;
                panel.style.left = pos.left + 'px';
                panel.style.top = pos.top + 'px';
            } catch (e) { /* ignore */ }
        }

        // Header
        const header = document.createElement('div');
        header.className = 'wb-heatmap-header';
        const title = factionName ? `Activity: ${factionName}` : 'Member Activity Heatmap';
        header.innerHTML = `<span>${title} <span style="font-size:10px;opacity:0.5;">(TCT)</span></span>`;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '\u00D7';
        closeBtn.className = 'wb-heatmap-close';
        closeBtn.addEventListener('click', () => panel.remove());
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // Make panel draggable by header
        let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
        header.addEventListener('mousedown', (e) => {
            if (e.target === closeBtn) return;
            isDragging = true;
            dragOffsetX = e.clientX - panel.offsetLeft;
            dragOffsetY = e.clientY - panel.offsetTop;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panel.style.left = (e.clientX - dragOffsetX) + 'px';
            panel.style.top = (e.clientY - dragOffsetY) + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                GM_setValue('factionops_heatmap_pos', JSON.stringify({
                    left: panel.offsetLeft,
                    top: panel.offsetTop,
                }));
            }
        });

        if (totalSamples === 0) {
            const msg = document.createElement('div');
            msg.style.cssText = 'padding:16px;font-size:12px;opacity:0.7;text-align:center;';
            msg.textContent = 'No activity data yet. The server collects data automatically when a faction API key is set.';
            panel.appendChild(msg);
            document.body.appendChild(panel);
            return;
        }

        // Grid container
        const grid = document.createElement('div');
        grid.className = 'wb-heatmap-grid';

        // Corner spacer
        const spacer = document.createElement('div');
        spacer.className = 'wb-heatmap-label';
        grid.appendChild(spacer);

        // Hour labels (every 3rd hour)
        for (let h = 0; h < 24; h++) {
            const lbl = document.createElement('div');
            lbl.className = 'wb-heatmap-label wb-heatmap-hour';
            lbl.textContent = h % 3 === 0 ? h : '';
            grid.appendChild(lbl);
        }

        // Rows
        for (let d = 0; d < 7; d++) {
            // Day label
            const dayLbl = document.createElement('div');
            dayLbl.className = 'wb-heatmap-label wb-heatmap-day';
            dayLbl.textContent = DAY_LABELS[d];
            grid.appendChild(dayLbl);

            for (let h = 0; h < 24; h++) {
                const cell = document.createElement('div');
                cell.className = 'wb-heatmap-cell';
                const bucket = (data[d] && data[d][h]) || { total: 0, samples: 0, membersTotal: 0 };

                const avg = bucket.samples > 0 ? bucket.total / bucket.samples : 0;
                const avgMembers = (bucket.membersTotal && bucket.samples > 0) ? bucket.membersTotal / bucket.samples : 0;
                const pct = avgMembers > 0 ? (avg / avgMembers) * 100 : 0;

                // Color intensity logic: scale based on percentage relative to maxPct
                // If no member data (old records), fallback to raw count intensity
                let intensity = 0;
                if (avgMembers > 0) {
                    intensity = maxPct > 0 ? pct / maxPct : 0;
                } else {
                    intensity = maxPct > 0 ? avg / maxPct : 0;
                }

                if (bucket.samples === 0) {
                    cell.style.backgroundColor = 'rgba(255,255,255,0.05)';
                } else if (intensity >= 0.95) {
                    // Top 5% peak activity - High contrast Red/Pink
                    cell.style.backgroundColor = `rgba(255, 118, 117, ${(intensity * 0.9 + 0.1).toFixed(2)})`;
                    cell.style.boxShadow = '0 0 8px rgba(255, 118, 117, 0.4)';
                    cell.style.zIndex = '1';
                } else if (intensity >= 0.8) {
                    // Very high activity - Yellow/Orange
                    cell.style.backgroundColor = `rgba(253, 203, 110, ${(intensity * 0.9 + 0.1).toFixed(2)})`;
                } else {
                    // Normal activity - Green gradient
                    cell.style.backgroundColor = `rgba(0, 184, 148, ${(intensity * 0.9 + 0.1).toFixed(2)})`;
                }

                let tooltip = `${DAY_LABELS[d]} ${String(h).padStart(2, '0')}:00 TCT\n`;
                tooltip += `Avg Active: ${avg.toFixed(1)}`;
                if (avgMembers > 0) {
                    tooltip += ` / ${Math.round(avgMembers)} (${pct.toFixed(1)}%)`;
                }
                tooltip += `\nTotal Samples: ${bucket.samples}`;

                cell.title = tooltip;
                grid.appendChild(cell);
            }
        }
        panel.appendChild(grid);

        // Legend
        const legend = document.createElement('div');
        legend.style.cssText = 'display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px; padding: 10px 16px 2px; font-size: 11px; color: var(--wb-text-muted); border-top: 1px solid rgba(255,255,255,0.05); margin-top: 8px;';

        const p25 = (maxPct * 0.25).toFixed(0);
        const p50 = (maxPct * 0.50).toFixed(0);
        const p80 = (maxPct * 0.80).toFixed(0);
        const p95 = (maxPct * 0.95).toFixed(0);

        legend.innerHTML = `
            <div style="display:flex; align-items:center; gap:4px;">
                <div style="width:10px;height:10px;background:rgba(255,255,255,0.05);border-radius:2px;"></div>
                <span>No Data</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px; margin-left: 8px;">
                <div style="display:flex; align-items:center; gap:4px;">
                    <div style="width:10px;height:10px;background:rgba(0,184,148,0.2);border-radius:2px;"></div>
                    <span>&gt;0%</span>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                    <div style="width:10px;height:10px;background:rgba(0,184,148,0.6);border-radius:2px;"></div>
                    <span>~${p25}%</span>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                    <div style="width:10px;height:10px;background:rgba(0,184,148,1.0);border-radius:2px;"></div>
                    <span>~${p50}%</span>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                    <div style="width:10px;height:10px;background:rgba(253,203,110,0.9);border-radius:2px;"></div>
                    <span>~${p80}%+</span>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                    <div style="width:10px;height:10px;background:rgba(255,118,117,1.0);box-shadow:0 0 4px rgba(255,118,117,0.5);border-radius:2px;"></div>
                    <span>Peak (${p95}%+)</span>
                </div>
            </div>
        `;
        panel.appendChild(legend);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'wb-heatmap-footer';
        footer.innerHTML = `<span style="font-size:11px;opacity:0.6;">Based on ${totalSamples} total samples</span>`;

        // Only show reset if viewing our own faction heatmap, or we are a leader viewing the current enemy's heatmap
        const isOwnFaction = !factionId || String(factionId) === String(state.myFactionId);
        const isCurrentEnemy = String(factionId) === String(state.enemyFactionId);
        const canReset = isLeader() && (isOwnFaction || isCurrentEnemy);

        const resetBtn = document.createElement('button');
        if (canReset) {
            resetBtn.className = 'wb-btn wb-btn-sm wb-btn-danger';
            resetBtn.textContent = 'Reset Data';
            resetBtn.addEventListener('click', async () => {
                if (!confirm('Are you sure you want to permanently reset this heatmap data?')) return;
                await resetServerHeatmap(factionId);
                panel.remove();
                renderHeatmapPanel(factionId, factionName);
            });
        }

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'wb-btn wb-btn-sm';
        refreshBtn.textContent = 'Refresh';
        refreshBtn.addEventListener('click', () => {
            panel.remove();
            renderHeatmapPanel(factionId, factionName);
        });
        footer.appendChild(refreshBtn);
        if (canReset) footer.appendChild(resetBtn);
        panel.appendChild(footer);

        document.body.appendChild(panel);
    }

    // =========================================================================
    // SECTION 27: MINI PROFILE CARDS (CommandCenter) — REMOVED
    // Using Torn's native profile card instead; see rebindTornProfileCards().
    // =========================================================================

    // =========================================================================
    // SECTION 26: MAIN INITIALISATION
    // =========================================================================

    async function main() {
        log('Initialising FactionOps v' + SCRIPT_VERSION);
        if (IS_PDA) log('Torn PDA detected — using PDA-managed API key');

        // 1. Inject CSS
        injectStyles();

        // 2. Apply theme
        applyTheme();

        // 3. Create settings gear (only on non-war, non-attack pages)
        const url = window.location.href;
        const isWarOrAttack = url.includes('factions.php') || url.includes('war.php') || url.includes('sid=attack');
        if (!isWarOrAttack) {
            createSettingsGear();
        }

        // 3b. Create heatmap toggle button (only on non-war, non-attack pages)
        if (!isWarOrAttack) {
            createHeatmapButton();
        }

        // 4. Set up keyboard shortcuts
        setupKeyboardShortcuts();

        // 5. Set up tab coordination
        setupTabCoordination();

        // 6. Install fetch/XHR interceptors for passive data collection
        installFetchInterceptor();
        installXHRInterceptor();

        // 6b. Seed state from cached JWT so features that depend on
        //     identity (isLeader → Shout button, myPlayerId checks, etc.)
        //     still work if the upcoming re-auth gets 429'd by Torn.
        hydrateStateFromJwt();

        // 6c. Install Shout delegation at document level — immune to
        //     overlay rebuilds, React reconciliation, or clobbered
        //     per-element listeners.
        setupShoutDelegation();

        // 6d. Watch for Torn's native mini profile card and inject a
        //     Retal action button into it.
        setupRetalCardInjection();

        // 7. Authenticate, start polling + Socket.IO
        if (CONFIG.API_KEY) {
            try {
                await authenticate();
                startPolling();
                connectRealtime();
            } catch (e) {
                warn('Initial auth failed:', e.message);
                if (state.jwtToken) {
                    startPolling();
                    connectRealtime();
                } else {
                    showToast('Not configured — click the gear icon to set up', 'warning');
                }
            }
        } else {
            log('No API key configured — open settings to get started');
            showToast('FactionOps: Click the gear icon to configure', 'info');
        }

        // 8. Detect page type and initialise appropriate enhancements
        detectPageAndInit();

        log('FactionOps initialised');
    }

    // =========================================================================
    // SECTION 25: HANDLE TORN NAVIGATION
    // =========================================================================

    /**
     * Torn uses hash-based navigation and AJAX page loads. We need to detect
     * when the user navigates to a different section and re-initialise.
     */
    let lastUrl = window.location.href;

    function watchNavigation() {
        // Check for URL changes periodically (hashchange + popstate don't
        // catch all of Torn's navigation patterns)
        setInterval(() => {
            if (window.location.href !== lastUrl) {
                log('Navigation detected:', lastUrl, '->', window.location.href);
                lastUrl = window.location.href;
                onNavigate();
            }
        }, 1000);

        window.addEventListener('hashchange', () => {
            log('Hash change detected');
            onNavigate();
        });

        window.addEventListener('popstate', () => {
            log('Popstate detected');
            onNavigate();
        });
    }

    function onNavigate() {
        // Disconnect old observer
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        // Remove old UI elements that are page-specific
        const chainBar = document.getElementById('wb-chain-bar');
        if (chainBar) chainBar.remove();
        state.ui.chainBar = null;
        document.body.classList.remove('wb-chain-active');

        const attackOverlay = document.getElementById('wb-attack-overlay');
        if (attackOverlay) {
            attackOverlay.remove();
            clearViewing(); // Tell server we left the attack page
        }
        const assistBtn = document.getElementById('wb-assist-btn');
        if (assistBtn) assistBtn.remove();

        // Restore Torn's chain bar to its original position before removing overlay
        restoreTornChainBar();

        // Remove FactionOps activate button and war overlay, restore hidden Torn elements
        const foBtn = document.getElementById('fo-activate-btn');
        if (foBtn) foBtn.remove();
        const foOverlay = document.getElementById('fo-overlay');
        if (foOverlay) foOverlay.remove();

        const hiddenEl = document.querySelector('[data-fo-hidden="true"]');
        if (hiddenEl) {
            hiddenEl.style.display = '';
            delete hiddenEl.dataset.foHidden;
        }

        // Cancel status timer RAF
        if (statusTimerRAF) {
            cancelAnimationFrame(statusTimerRAF);
            statusTimerRAF = null;
        }
        if (chainTimerRAF) {
            cancelAnimationFrame(chainTimerRAF);
            chainTimerRAF = null;
        }
        stopDirectChainPoll();
        stopChainDOMObserver();
        stopEnergyPoll();
        stopAttacksPoll();
        stopKeepAlive();
        if (lateChainWatcher) {
            lateChainWatcher.disconnect();
            lateChainWatcher = null;
        }
        usingChainDOM = false;

        // Re-detect page and init
        setTimeout(() => detectPageAndInit(), 500);
    }

    // =========================================================================
    // SECTION 26: STARTUP
    // =========================================================================

    // Wait for DOM to be ready (we're @run-at document-idle, but double-check)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            main();
            watchNavigation();
        });

    } else {
        main();
        watchNavigation();
    }

})();
