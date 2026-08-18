/**
 * Sidekick Chrome Extension - Player ID Linker Module
 * Automatically hyperlinks Torn player IDs (e.g. [1234567] or #1234567) to their profiles.
 * Always-on — no settings toggle.
 *
 * Strategy:
 *  - Uses a MutationObserver on document.body to catch dynamically rendered nodes.
 *  - Skips linking on the player's own profile page (profiles.php?XID=<own_id>).
 *  - Wraps IDs found in text nodes matching common Torn patterns.
 *  - Never double-wraps (checks parent is not already an anchor).
 */

const PlayerIdLinkerModule = (() => {
    // Matches patterns like [1234567], #1234567, or bare numeric IDs preceded by
    // "ID:" / "Player ID:" — we keep the pattern conservative to avoid false positives.
    // Group 1 = the numeric ID.
    const ID_PATTERN = /(?<!\/)(?:\[(\d{5,8})\]|#(\d{5,8})(?!\d)|(?:player\s*id[:\s]+)(\d{5,8}))/gi;
    const PROFILE_BASE = 'https://www.torn.com/profiles.php?XID=';

    let ownId = null;
    let observer = null;
    let processing = false; // re-entrancy guard

    // ── Own ID detection ───────────────────────────────────────────────────────

    async function detectOwnId() {
        // Try chrome storage first (API key based)
        return new Promise(resolve => {
            chrome.storage.local.get(['torn_player_id', 'sidekick_api_key', 'sidekick_settings'], result => {
                if (result.torn_player_id) {
                    resolve(String(result.torn_player_id));
                    return;
                }
                // Fall back to reading the page's own profile link in the sidebar
                const profileLink = document.querySelector('a[href*="profiles.php?XID="]');
                if (profileLink) {
                    const m = profileLink.href.match(/XID=(\d+)/);
                    if (m) { resolve(m[1]); return; }
                }
                resolve(null);
            });
        });
    }

    function isProfilePage() {
        return window.location.href.includes('profiles.php');
    }

    function isOwnProfilePage() {
        if (!ownId) return false;
        const url = window.location.href;
        return url.includes('profiles.php') && url.includes(`XID=${ownId}`);
    }

    // ── Link injection ─────────────────────────────────────────────────────────

    // Profile header containers: skip these on any profile page so the title/ID
    // heading is not hyperlinked, but chat (torn-chat) is always allowed.
    const PROFILE_HEADER_SELECTORS = [
        '.profile-wrapper',
        '.profile-wrapper-col',
        '.info-table',
        '[class*="basicInfo"]',
        '[class*="playerName"]',
        '[class*="profileTitle"]',
        'h1',
        '.profile-header',
    ];

    function shouldSkipNode(node) {
        // Don't process inside scripts, styles, inputs, or existing anchors
        const tag = node.parentElement?.tagName?.toLowerCase();
        if (['script', 'style', 'textarea', 'input', 'a', 'noscript'].includes(tag)) return true;

        // G1: On any profile page, skip the page title/header sections
        // but ALLOW chat — chat containers have 'chat' in their id/class
        if (isProfilePage()) {
            // Allow if inside a chat element
            let el = node.parentElement;
            while (el && el !== document.body) {
                const cls = (el.className || '').toLowerCase();
                const id = (el.id || '').toLowerCase();
                if (cls.includes('chat') || id.includes('chat')) return false; // allow
                el = el.parentElement;
            }
            // Skip if inside a profile header area
            for (const sel of PROFILE_HEADER_SELECTORS) {
                if (node.parentElement?.closest(sel)) return true;
            }
        }

        return false;
    }

    function wrapIdsInText(textNode) {
        const text = textNode.nodeValue;
        if (!text || text.length < 5) return;

        // Reset regex state
        ID_PATTERN.lastIndex = 0;
        if (!ID_PATTERN.test(text)) return;
        ID_PATTERN.lastIndex = 0;

        const frag = document.createDocumentFragment();
        let lastIndex = 0;
        let match;

        while ((match = ID_PATTERN.exec(text)) !== null) {
            const id = match[1] || match[2] || match[3];
            if (!id) continue;
            if (id === ownId) continue; // never link own ID

            const before = text.slice(lastIndex, match.index);
            if (before) frag.appendChild(document.createTextNode(before));

            const a = document.createElement('a');
            a.href = `${PROFILE_BASE}${id}`;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.cssText = 'color:#8abeef;text-decoration:none;font-weight:inherit;';
            a.title = `View player ${id}'s profile`;
            a.textContent = match[0]; // preserve original text (e.g. "[1234567]")
            a.addEventListener('mouseenter', () => { a.style.textDecoration = 'underline'; });
            a.addEventListener('mouseleave', () => { a.style.textDecoration = 'none'; });
            frag.appendChild(a);

            lastIndex = match.index + match[0].length;
        }

        if (lastIndex === 0) return; // nothing matched after test
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));

        textNode.parentNode.replaceChild(frag, textNode);
    }

    function processNode(root) {
        if (!root) return;
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
                    ID_PATTERN.lastIndex = 0;
                    return ID_PATTERN.test(node.nodeValue)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_SKIP;
                }
            }
        );

        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        // Process collected nodes (avoids live-NodeList mutation issues)
        nodes.forEach(wrapIdsInText);
    }

    // ── MutationObserver ───────────────────────────────────────────────────────

    function startObserver() {
        if (observer) observer.disconnect();

        observer = new MutationObserver(mutations => {
            if (processing || isOwnProfilePage()) return;
            processing = true;

            const added = [];
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) added.push(node);
                    else if (node.nodeType === Node.TEXT_NODE) wrapIdsInText(node);
                });
            });
            added.forEach(processNode);

            processing = false;
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ── URL watchdog (SPA navigation) ──────────────────────────────────────────

    function startWatchdog() {
        let lastUrl = window.location.href;
        setInterval(() => {
            const url = window.location.href;
            if (url === lastUrl) return;
            lastUrl = url;

            // Re-scan the page after React has re-rendered (short delay)
            if (!isOwnProfilePage()) {
                setTimeout(() => processNode(document.body), 600);
            }
        }, 300);
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    return {
        name: 'PlayerIdLinker',

        async init() {
            console.log('🔗 Player ID Linker: initializing');

            ownId = await detectOwnId();
            console.log('🔗 Player ID Linker: own ID =', ownId);

            if (isOwnProfilePage()) {
                console.log('🔗 Player ID Linker: skipping own profile page');
            } else {
                // Initial scan once DOM is ready
                processNode(document.body);
            }

            startObserver();
            startWatchdog();

            console.log('🔗 Player ID Linker: initialized');
        }
    };
})();

if (typeof window.SidekickModules === 'undefined') window.SidekickModules = {};
window.SidekickModules.PlayerIdLinker = PlayerIdLinkerModule;

console.log('🔗 Player ID Linker module registered');
