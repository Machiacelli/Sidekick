// War Target Caller — MAIN-world attack-result injector
//
// Runs ONLY on attack pages (loader.php?sid=attack* / page.php?sid=attack*),
// at document_start in the page's own JS world. Patches window.fetch and
// XMLHttpRequest (same pattern as FactionOps factionops.js §15) to passively
// read Torn's own attack-resolution JSON — zero extra API calls.
//
// When an attack resolves with a successful outcome (attacked / mugged /
// hospitalized / leave / special), it dispatches:
//
//   document.dispatchEvent(new CustomEvent('sidekick:attack-result', {
//       detail: JSON.stringify({ targetId, result })
//   }));
//
// The detail is STRINGIFIED — non-primitive details are stripped when a
// CustomEvent crosses from the MAIN world into an isolated-world listener
// (repo rule #4; the loadout-switcher bridge established this pattern).
//
// RULE #5: NO chrome.* APIs in this file — it runs in the page world where
// extension APIs do not exist. All extension work happens in the isolated
// partner (war-target-caller.module.js), which listens for the event.
(function () {
    'use strict';

    const ATTACK_RESULT_EVENT = 'sidekick:attack-result';

    /** Extract the defender's player ID: URL first (user2ID=), DOM fallback. */
    function getAttackTargetId() {
        // 1. Attack page URL carries the defender id
        const m = window.location.href.match(/(?:user2ID=|XID=|userId=)(\d+)/i);
        if (m) return m[1];

        // 2. Torn's React attack page can hide the id from the URL mid-fight;
        //    fall back to the defender's profile link in the DOM.
        const defenderLinks = document.querySelectorAll(
            '[class*="defender"] a[href*="XID="], div[class^="playerArea"] a[href*="XID="]'
        );
        for (const link of defenderLinks) {
            const href = link.getAttribute('href');
            if (href) {
                const domMatch = href.match(/XID=(\d+)/i);
                if (domMatch) return domMatch[1];
            }
        }
        return null;
    }

    /** Did this attack result contain a successful hit? */
    function isSuccessfulHit(result) {
        if (!result || typeof result !== 'object') return false;
        return !!(result.hospitalized || result.mugged || result.attacked ||
            result.leave || result.special);
    }

    /** Parse + relay an intercepted response body to the isolated world. */
    function processResponseText(text) {
        let data;
        try {
            data = JSON.parse(text);
        } catch (_) {
            return; // not JSON — ignore
        }
        if (!data || !data.result) return;

        if (isSuccessfulHit(data.result)) {
            const targetId = getAttackTargetId();
            if (targetId) {
                document.dispatchEvent(new CustomEvent(ATTACK_RESULT_EVENT, {
                    detail: JSON.stringify({ targetId, result: data.result })
                }));
                console.log('[WarTargetCaller-inject] Successful attack result relayed for target', targetId);
            }
        }
    }

    /** True when a URL is one of Torn's own attack endpoints we tap. */
    function isAttackEndpoint(url) {
        return typeof url === 'string' &&
            (url.includes('loader.php?sid=attack') ||
                url.includes('page.php?sid=attack') ||
                url.includes('step=attack'));
    }

    // ── Fetch patch ─────────────────────────────────────────────────────────
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
        window.fetch = async function (...args) {
            const response = await originalFetch.apply(this, args);
            try {
                const url = typeof args[0] === 'string'
                    ? args[0]
                    : (args[0] && args[0].url);
                if (isAttackEndpoint(url)) {
                    const clone = response.clone();
                    clone.text().then(processResponseText).catch(() => { /* ignore */ });
                }
            } catch (_) {
                // Interception must never break the page
            }
            return response;
        };
    }

    // ── XHR patch (older Torn code paths) ───────────────────────────────────
    if (typeof XMLHttpRequest !== 'undefined') {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._skAttackUrl = url;
            return originalOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function (...args) {
            if (isAttackEndpoint(this._skAttackUrl)) {
                this.addEventListener('load', () => {
                    try {
                        processResponseText(this.responseText);
                    } catch (_) { /* ignore */ }
                });
            }
            return originalSend.apply(this, args);
        };
    }
})();
