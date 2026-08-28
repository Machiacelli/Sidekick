/**
 * Sidekick Chrome Extension - Player ID Linker Module
 * Turns common Torn player-ID references into profile links.
 *
 * The ID belonging to the profile currently on screen stays as plain text.
 * Chat is the exception: every player ID in chat remains linkable.
 */

const PlayerIdLinkerModule = (() => {
    const PLAYER_REFERENCE = /\[(\d{5,8})\]|#(\d{5,8})(?!\d)|player\s*id[:\s]+(\d{5,8})/gi;
    const IGNORED_PARENTS = 'a, script, style, textarea, input, button, select, option, noscript';
    const SCAN_INTERVAL_MS = 1200;

    let scanTimer = null;
    let scanInProgress = false;

    function getViewedProfileId() {
        if (!window.location.pathname.toLowerCase().endsWith('/profiles.php')) return '';

        const match = window.location.search.match(/[?&]xid=(\d{5,8})(?:&|$)/i);
        return match ? match[1] : '';
    }

    function isInsideChat(textNode) {
        let element = textNode.parentElement;

        while (element && element !== document.body) {
            const classText = element.getAttribute('class') || '';
            const idText = element.getAttribute('id') || '';
            const elementIdentity = `${classText} ${idText}`.toLowerCase();

            if (elementIdentity.includes('chat')) return true;
            element = element.parentElement;
        }

        return false;
    }

    function shouldIgnore(textNode) {
        const parent = textNode.parentElement;
        return !parent || Boolean(parent.closest(IGNORED_PARENTS));
    }

    function makeProfileLink(playerId, label) {
        const link = document.createElement('a');
        link.href = `/profiles.php?XID=${playerId}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'sidekick-player-id-link';
        link.style.color = '#8abeef';
        link.style.fontWeight = 'inherit';
        link.title = `View player ${playerId}'s profile`;
        link.textContent = label;
        return link;
    }

    function linkReferencesInText(textNode) {
        if (!textNode.isConnected || shouldIgnore(textNode)) return;

        const text = textNode.nodeValue;
        if (!text || text.length < 5) return;

        PLAYER_REFERENCE.lastIndex = 0;
        if (!PLAYER_REFERENCE.test(text)) return;
        PLAYER_REFERENCE.lastIndex = 0;

        const viewedProfileId = getViewedProfileId();
        const insideChat = isInsideChat(textNode);
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        let createdLink = false;
        let match;

        while ((match = PLAYER_REFERENCE.exec(text)) !== null) {
            const playerId = match[1] || match[2] || match[3];
            fragment.appendChild(
                document.createTextNode(text.slice(cursor, match.index))
            );

            if (insideChat || playerId !== viewedProfileId) {
                fragment.appendChild(makeProfileLink(playerId, match[0]));
                createdLink = true;
            } else {
                fragment.appendChild(document.createTextNode(match[0]));
            }

            cursor = PLAYER_REFERENCE.lastIndex;
        }

        if (!createdLink || !textNode.isConnected) return;

        fragment.appendChild(document.createTextNode(text.slice(cursor)));
        textNode.parentNode.replaceChild(fragment, textNode);
    }

    function scanPage() {
        if (scanInProgress || document.hidden || !document.body) return;
        scanInProgress = true;

        try {
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode(textNode) {
                        if (shouldIgnore(textNode)) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        PLAYER_REFERENCE.lastIndex = 0;

                        return PLAYER_REFERENCE.test(textNode.nodeValue || '')
                            ? NodeFilter.FILTER_ACCEPT
                            : NodeFilter.FILTER_SKIP;
                    }
                }
            );

            const matches = [];
            let textNode;

            while ((textNode = walker.nextNode())) {
                matches.push(textNode);
            }

            matches.forEach(linkReferencesInText);
        } finally {
            scanInProgress = false;
        }
    }

    return {
        name: 'PlayerIdLinker',

        init() {
            if (scanTimer !== null) return;

            scanPage();
            scanTimer = window.setInterval(scanPage, SCAN_INTERVAL_MS);
            document.addEventListener('visibilitychange', scanPage);

            console.log('🔗 Player ID Linker: initialized');
        }
    };
})();

if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}

window.SidekickModules.PlayerIdLinker = PlayerIdLinkerModule;

console.log('🔗 Player ID Linker module registered');