/**
 * Sidekick Chat Popout
 * Opens one selected Torn conversation in a separate, user-triggered,
 * resizable window.
 *
 * Chat 3.1 compatibility (2026-10-09): Torn replaced the Sendbird-backed chat
 * with its own system and rebuilt the DOM. Key facts the discovery logic now
 * relies on:
 *   - The old `#chatRoot` wrapper no longer exists. Conversation windows are
 *     floating panels (direct or near-direct body children) whose class lists
 *     contain `root___*` CSS-module names and whose id IS the conversation id
 *     (e.g. id="4024011" for a chat with player 4024011).
 *   - Window headers use `header___*` classes; the title is a span with BOTH a
 *     title-attribute and text (e.g. <span title="kurdiskaraven">kurdiskaraven</span>).
 *   - The minimize/close controls are no longer titled <button> elements; they
 *     are <svg aria-label="Minimize"> / <svg aria-label="Close"> icons inside
 *     the draggable header. Controls are therefore located by aria-label (on
 *     any element type), not by button title.
 *   - The composer is still a textarea with placeholder "Type your message here...".
 *   - The message list is virtualized (absolutely-positioned windows inside a
 *     sized scroll wrapper). Hiding a detached panel with display:none would
 *     collapse those measurements; detached panels are hidden with
 *     visibility:hidden instead so the virtualizer keeps working.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'chat-popout';
    const POPUP_NAME = 'SidekickTornChat';
    const SINGLE_PREFIX = 'SidekickTornChatMirror:';
    const SIZE_KEY = 'sidekick-chat-popout-size';
    const BUTTON_ID = 'sk-chat-popout-button';
    const SINGLE_BUTTON_CLASS = 'sk-chat-single-popout-button';
    const STYLE_ID = 'sk-chat-popout-style';
    const DEFAULT_SIZE = { width: 420, height: 680 };
    const isWholePopout = window.name === POPUP_NAME;
    // Singular chats use an about:blank mirror managed by the opener. They
    // must not start a second Torn Chat instance: Torn transfers Chat 3 back
    // to whichever Torn tab is active, which caused the empty black window.
    const isSinglePopout = false;
    const isPopoutWindow = isWholePopout;

    function normalize(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function composerSelector() {
        return 'textarea, input[placeholder*="message" i], [contenteditable="true"]';
    }

    function findChatPanel(composer) {
        const chatRoot = document.getElementById('chatRoot');
        if (!chatRoot || !composer) return null;
        let current = composer.parentElement;
        let candidate = current;
        while (current && current !== chatRoot) {
            const composerCount = current.querySelectorAll(composerSelector()).length;
            if (composerCount === 1) {
                candidate = current;
                const controls = Array.from(current.querySelectorAll('button'));
                const hasWindowControl = controls.some(button => /close|minimi[sz]e|maximi[sz]e/i.test(
                    `${button.title || ''} ${button.getAttribute('aria-label') || ''}`
                ));
                const hasHeader = current.querySelector('[class*="header" i], header');
                const rect = current.getBoundingClientRect();
                if (hasWindowControl || (hasHeader && rect.width >= 220 && rect.height >= 120)) break;
            }
            const parent = current.parentElement;
            if (!parent || parent === chatRoot || parent.querySelectorAll(composerSelector()).length > 1) break;
            current = parent;
        }
        return candidate;
    }

    function isChat31Window(element) {
        if (!element || element === document.body || element.id === 'chatRoot') return false;
        if (typeof element.className !== 'string' || !/\broot___\w+/.test(element.className)) return false;
        if (!element.querySelector('[class*="header___"]')) return false;
        // Chat 3.1 renders the window controls as svg icons carrying
        // aria-label="Minimize"/"Close". Requiring BOTH keeps generic
        // `root___`-classed app containers and other floating windows (which
        // may have a close control but no minimize) from being mistaken for
        // chat windows.
        if (!element.querySelector('[aria-label="Minimize" i]')) return false;
        if (!element.querySelector('[aria-label="Close" i]')) return false;
        return Boolean(element.querySelector(composerSelector()));
    }

    function findChat31Window(composer) {
        let current = composer.parentElement;
        while (current && current !== document.body) {
            if (isChat31Window(current)) return current;
            current = current.parentElement;
        }
        return null;
    }

    function findChatPanels() {
        const panels = new Set();

        // The module IIFE can run before document.body exists (document_start
        // timing / HEAD placement): a chat window cannot have mounted yet,
        // and the body-level passes below need body to iterate at all.
        if (!document.body) return [];

        // Legacy Chat 2.x/3.x: conversation panels live inside #chatRoot and
        // are resolved by walking up from each composer. Skip when the
        // container is gone - findChatPanel depends on it.
        const chatRoot = document.getElementById('chatRoot');
        if (chatRoot) {
            Array.from(chatRoot.querySelectorAll(composerSelector()))
                .map(findChatPanel)
                .filter(Boolean)
                .forEach(panel => panels.add(panel));
        }

        // Chat 3.1: `#chatRoot` no longer exists. Conversation windows are
        // floating panels (near-direct body children) with `root___*`
        // CSS-module classes, a `header___*` child, svg minimize/close
        // controls and their own composer. Resolve from each composer so we
        // only ever pick the nearest qualifying ancestor (the window root),
        // never a big unrelated container that happens to wrap everything.
        Array.from(document.body.querySelectorAll(composerSelector()))
            .map(composer => findChat31Window(composer))
            .filter(Boolean)
            .forEach(panel => panels.add(panel));

        return Array.from(panels);
    }

    function getStableToken(panel) {
        const attributes = ['data-chat-id', 'data-user-id', 'data-channel-id', 'data-id', 'id'];
        const elements = [panel, ...panel.querySelectorAll('[data-chat-id], [data-user-id], [data-channel-id], [data-id], [id]')];
        for (const element of elements) {
            for (const attribute of attributes) {
                const value = element.getAttribute?.(attribute);
                if (!value || value.length >= 120) continue;
                if (/^chatRoot$/i.test(value)) continue;
                // Chat 3.1 litters the window with internal svg ids such as
                // "icon_74", "icon_gradient74_default", "start" and "end".
                // They are not stable identifiers, so never use them as tokens.
                if (attribute === 'id' && !/^\d+$/.test(value)
                    && /^(icon|icon_gradient|start|end)/i.test(value)) continue;
                return `${attribute}:${value}`;
            }
        }
        return '';
    }

    function getChatLabel(panel) {
        const ignored = /^(close|minimi[sz]e|maximi[sz]e|settings|send|type your message|last message|view)$/i;
        const isOurs = element => element.closest(`.${SINGLE_BUTTON_CLASS}`) || element.closest(`#${BUTTON_ID}`);
        const cleanTitle = element => {
            if (isOurs(element)) return null;
            const title = element.getAttribute && element.getAttribute('title');
            if (!title) return null;
            const text = String(title).replace(/\s+/g, ' ').trim();
            if (!text || text.length > 60 || ignored.test(text)) return null;
            return text;
        };

        // Chat 3.1 names conversations with <span title="<name>">name</span>
        // inside the window header. Trust the header-scoped title first - it
        // can't collide with message-body tooltip titles.
        for (const element of Array.from(panel.querySelectorAll(
            '[class*="header" i] span[title], [class*="header" i] [title], header span[title]'
        ))) {
            const title = cleanTitle(element);
            if (title) return title;
        }

        const preferred = Array.from(panel.querySelectorAll(
            '[class*="header" i] [class*="name" i], [class*="title" i], [class*="name" i], header strong, header span, strong'
        ));
        const fallback = Array.from(panel.querySelectorAll('span, a, button'));
        // Wider title pass, still filtered: on the legacy chat the window
        // controls carry titles ("Close", "Minimize") that must never win.
        for (const element of [...preferred, ...fallback]) {
            const title = cleanTitle(element);
            if (title) return title;
        }
        for (const element of [...preferred, ...fallback]) {
            const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text || text.length > 60 || ignored.test(text) || /^\d{1,2}:\d{2}/.test(text)) continue;
            if (isOurs(element)) continue;
            return text;
        }
        return 'Torn chat';
    }

    function describePanel(panel) {
        return { token: getStableToken(panel), label: getChatLabel(panel) };
    }

    function parseSingleDescriptor() {
        if (!isSinglePopout) return null;
        try {
            return JSON.parse(decodeURIComponent(window.name.slice(SINGLE_PREFIX.length)));
        } catch {
            return { token: '', label: '' };
        }
    }

    function descriptorsMatch(panel, descriptor) {
        const candidate = describePanel(panel);
        if (descriptor?.token && candidate.token === descriptor.token) return true;
        return Boolean(descriptor?.label && normalize(candidate.label) === normalize(descriptor.label));
    }

    function getNodePath(node, root) {
        const path = [];
        let current = node;
        while (current && current !== root) {
            const parent = current.parentNode;
            if (!parent) return null;
            path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
            current = parent;
        }
        return current === root ? path : null;
    }

    function getNodeAtPath(root, path) {
        let current = root;
        for (const index of path || []) {
            current = current?.childNodes?.[index];
            if (!current) return null;
        }
        return current;
    }

    function installPopoutWindow() {
        window.__SIDEKICK_CHAT_POPOUT__ = true;
        const descriptor = parseSingleDescriptor();

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            html, body {
                width: 100% !important; height: 100% !important; min-width: 0 !important;
                margin: 0 !important; padding: 0 !important; overflow: hidden !important;
                background: #171717 !important; color-scheme: dark !important;
            }
            #chatRoot {
                display: block !important; position: fixed !important; inset: 0 !important;
                width: 100vw !important; height: 100vh !important; max-width: none !important;
                max-height: none !important; z-index: 2147483647 !important;
            }
            #${BUTTON_ID}, .${SINGLE_BUTTON_CLASS} { display: none !important; }
            .sk-chat-single-hidden { display: none !important; }
            .sk-chat-single-selected {
                display: block !important; position: fixed !important; inset: 0 !important;
                width: 100vw !important; min-width: 0 !important; max-width: none !important;
                height: 100vh !important; min-height: 0 !important; max-height: none !important;
                margin: 0 !important; transform: none !important; z-index: 2147483647 !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
        document.title = descriptor?.label ? `${descriptor.label} — Torn Chat` : 'Torn Chat';

        const applyLayout = () => {
            // Bodies may not exist yet when the module IIFE runs (HEAD /
            // document_start timing). Bail out and let the MutationObserver
            // re-run this once <body> mounts.
            if (!document.body) return false;

            // Legacy chat: force the single container full-viewport.
            const chatRoot = document.getElementById('chatRoot');
            if (chatRoot) {
                chatRoot.style.setProperty('display', 'block', 'important');
                chatRoot.style.setProperty('position', 'fixed', 'important');
                chatRoot.style.setProperty('inset', '0', 'important');
                chatRoot.style.setProperty('width', '100vw', 'important');
                chatRoot.style.setProperty('height', '100vh', 'important');
            }

            const panels = findChatPanels();
            const selected = descriptor
                ? panels.find(panel => descriptorsMatch(panel, descriptor))
                : null;

            // Hide every body child that is not the legacy chat container and
            // does not host a (for singular mode: the matching) chat window.
            // Chat 3.1 windows are body-level floats themselves, so they must
            // survive this pass - the old `body > *:not(#chatRoot)` CSS rule
            // blanked them out.
            for (const child of Array.from(document.body.children)) {
                if (/^(script|link|style)$/i.test(child.tagName)) continue;
                if (child === chatRoot) { child.classList.remove('sk-chat-single-hidden'); continue; }
                const keep = selected
                    ? child === selected || child.contains(selected)
                    : panels.some(panel => child === panel || child.contains(panel));
                child.classList.toggle('sk-chat-single-hidden', !keep);
            }

            // Singular popout: pin the matching window to the viewport and
            // silence the others. Whole-chat popout: let every window float
            // where Torn placed it.
            panels.forEach(panel => {
                const isTarget = descriptor ? panel === selected : true;
                panel.classList.toggle('sk-chat-single-selected', descriptor ? isTarget : false);
                if (descriptor) panel.classList.toggle('sk-chat-single-hidden', !isTarget);
            });
            return true;
        };

        applyLayout();
        const observer = new MutationObserver(applyLayout);
        observer.observe(document.documentElement, { childList: true, subtree: true });

        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                try {
                    localStorage.setItem(SIZE_KEY, JSON.stringify({
                        width: Math.max(320, window.outerWidth),
                        height: Math.max(420, window.outerHeight)
                    }));
                } catch { /* Optional. */ }
            }, 250);
        });
    }

    if (isPopoutWindow) installPopoutWindow();

    const ChatPopoutModule = {
        isEnabled: false,
        observer: null,
        popoutWindow: null,
        singlePopouts: new Map(),
        closeWatcher: null,
        ensureTimer: null,

        async init() {
            if (isPopoutWindow) return;
            await this.loadSettings();
            if (this.isEnabled) this.enable(false);

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local' || !changes.sidekick_settings) return;
                const enabled = changes.sidekick_settings.newValue?.[STORAGE_KEY]?.isEnabled === true;
                if (enabled === this.isEnabled) return;
                if (enabled) this.enable(false);
                else this.disable(false);
            });
        },

        loadSettings() {
            return new Promise(resolve => {
                chrome.storage.local.get('sidekick_settings', result => {
                    this.isEnabled = result.sidekick_settings?.[STORAGE_KEY]?.isEnabled === true;
                    resolve();
                });
            });
        },

        async saveSettings() {
            const settings = await new Promise(resolve => {
                chrome.storage.local.get('sidekick_settings', result => resolve(result.sidekick_settings || {}));
            });
            settings[STORAGE_KEY] = { ...(settings[STORAGE_KEY] || {}), isEnabled: this.isEnabled };
            await chrome.storage.local.set({ sidekick_settings: settings });
        },

        enable(save = true) {
            this.isEnabled = true;
            if (save) this.saveSettings();
            this.injectStyles();
            this.startObserver();
            this.ensureButtons();
        },

        disable(save = true) {
            this.isEnabled = false;
            if (save) this.saveSettings();
            this.stopObserver();
            document.getElementById(BUTTON_ID)?.remove();
            document.querySelectorAll(`.${SINGLE_BUTTON_CLASS}`).forEach(button => button.remove());
            document.getElementById(STYLE_ID)?.remove();
            if (this.popoutWindow && !this.popoutWindow.closed) this.popoutWindow.close();
            for (const entry of this.singlePopouts.values()) {
                entry.observer?.disconnect();
                clearTimeout(entry.renderTimer);
                clearInterval(entry.valueSyncTimer);
                if (!entry.window.closed) entry.window.close();
                entry.panel?.classList.remove('sk-chat-conversation-detached');
            }
            this.singlePopouts.clear();
            this.popoutWindow = null;
            this.restoreMainChat();
            this.stopCloseWatcher();
        },

        injectStyles() {
            if (document.getElementById(STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                html.sk-chat-popout-detached #chatRoot { display: none !important; }
                .sk-chat-popout-hidden-main {
                    visibility: hidden !important;
                    pointer-events: none !important;
                }
                .sk-chat-conversation-detached {
                    visibility: hidden !important;
                    pointer-events: none !important;
                }
                #${BUTTON_ID} {
                    width:36px !important; min-width:36px !important; height:36px !important;
                    margin:0 2px !important; padding:0 !important; display:inline-flex !important;
                    align-items:center !important; justify-content:center !important; flex:0 0 36px !important;
                    color:#8faeb4 !important; background:rgba(25,25,25,.92) !important;
                    border:1px solid rgba(143,174,180,.45) !important; border-radius:5px !important;
                    cursor:pointer !important; box-sizing:border-box !important; position:relative !important;
                    z-index:2147483647 !important; pointer-events:auto !important; touch-action:manipulation !important;
                }
                #${BUTTON_ID}:hover { color:#eaf0f1 !important; border-color:#8faeb4 !important; }
                #${BUTTON_ID} svg { width:18px !important; height:18px !important; pointer-events:none !important; }
                .${SINGLE_BUTTON_CLASS} {
                    width:25px !important; min-width:25px !important; height:25px !important; min-height:25px !important;
                    padding:0 !important; margin-left:auto !important; display:inline-flex !important;
                    align-items:center !important; justify-content:center !important; color:#a9b7ba !important;
                    background:transparent !important; border:0 !important; border-radius:3px !important;
                    cursor:pointer !important; pointer-events:auto !important; position:relative !important;
                    z-index:2147483647 !important; flex:0 0 25px !important;
                }
                .${SINGLE_BUTTON_CLASS}:hover { color:#fff !important; background:rgba(255,255,255,.1) !important; }
                .${SINGLE_BUTTON_CLASS} svg { width:14px !important; height:14px !important; pointer-events:none !important; }
            `;
            (document.head || document.documentElement).appendChild(style);
        },

        startObserver() {
            if (this.observer) return;
            this.observer = new MutationObserver(() => {
                clearTimeout(this.ensureTimer);
                this.ensureTimer = setTimeout(() => this.ensureButtons(), 100);
            });
            this.observer.observe(document.documentElement, { childList: true, subtree: true });
        },

        stopObserver() {
            this.observer?.disconnect();
            this.observer = null;
            clearTimeout(this.ensureTimer);
            this.ensureTimer = null;
        },

        findToolbar() {
            const chatRoot = document.getElementById('chatRoot');
            if (!chatRoot) return null;
            const anchor = chatRoot.querySelector('button[id*="settings"], button[id*="people"], button[id*="notes"]')
                || chatRoot.querySelector('button[class*="root___"]');
            return anchor?.parentElement || null;
        },

        makeIconButton(className, title, action) {
            // Chat 3.1's header is itself a draggable <button> that contains
            // the minimize/close svg icons. Injecting a real <button> there
            // would nest interactive elements, so the control is a span with
            // role=button (Torn uses the same pattern for its own header
            // icons). It works as a plain button everywhere else too.
            const button = document.createElement('span');
            button.className = className;
            button.setAttribute('role', 'button');
            button.setAttribute('tabindex', '0');
            button.title = title;
            button.setAttribute('aria-label', title);
            button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3z"></path><path fill="currentColor" d="M5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path></svg>';
            const activate = event => {
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); action();
            };
            // The Chat 3.1 header is a draggable <button>: swallowing the
            // low-level press events keeps Torn's drag handler from starting
            // a window drag when the user grabs our control.
            const swallowPress = event => {
                event.stopPropagation(); event.stopImmediatePropagation();
            };
            button.addEventListener('pointerdown', swallowPress, true);
            button.addEventListener('mousedown', swallowPress, true);
            button.addEventListener('click', activate, true);
            button.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') activate(event);
            }, true);
            return button;
        },

        ensureButtons() {
            if (!this.isEnabled) return;
            document.getElementById(BUTTON_ID)?.remove();

            for (const panel of findChatPanels()) {
                if (panel.querySelector(`.${SINGLE_BUTTON_CLASS}`)) continue;
                const anchor = this.findHeaderAnchor(panel);
                if (!anchor) continue;
                const button = this.makeIconButton(SINGLE_BUTTON_CLASS, 'Pop out this chat', () => this.openSinglePopout(panel));
                anchor.header.insertBefore(button, anchor.before || null);
            }
        },

        findHeaderAnchor(panel) {
            // Chat 3.1: minimize/close are svg icons carrying
            // aria-label="Minimize"/"Close" - not titled <button> elements.
            // Scan any element type and find the header they live in.
            const controls = Array.from(panel.querySelectorAll('[aria-label], [title], button'));
            const labelOf = element => `${element.getAttribute('aria-label') || ''} ${element.title || ''}`;
            const close = controls.find(element => /close/i.test(labelOf(element)));
            const minimize = controls.find(element => /minimi[sz]e/i.test(labelOf(element)));
            const control = close || minimize;
            const header = control?.closest('[class*="header" i], header')
                || (control ? control.parentElement : null)
                || panel.querySelector('[class*="header" i], header');
            if (!header) return null;
            return { header, before: minimize || close || null };
        },

        getSavedSize() {
            try {
                const saved = JSON.parse(localStorage.getItem(SIZE_KEY));
                if (Number.isFinite(saved?.width) && Number.isFinite(saved?.height)) {
                    return { width: Math.max(320, Math.round(saved.width)), height: Math.max(420, Math.round(saved.height)) };
                }
            } catch { /* Defaults. */ }
            return DEFAULT_SIZE;
        },

        getWindowFeatures() {
            const { width, height } = this.getSavedSize();
            const left = Math.max(0, Math.round(window.screenX + window.outerWidth - width));
            const top = Math.max(0, Math.round(window.screenY + 40));
            return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
        },

        navigatePopup(popup) {
            try {
                if (popup.location.href === 'about:blank') popup.location.replace(`${window.location.origin}/`);
            } catch {
                popup.location.href = `${window.location.origin}/`;
            }
            popup.focus();
        },

        copyStylesToPopup(popupDocument) {
            const base = popupDocument.createElement('base');
            base.href = document.baseURI;
            popupDocument.head.appendChild(base);

            document.querySelectorAll('link[rel="stylesheet"], style').forEach(source => {
                if (source.tagName === 'LINK') {
                    const link = popupDocument.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = source.href;
                    popupDocument.head.appendChild(link);
                    return;
                }
                const style = popupDocument.createElement('style');
                style.textContent = source.textContent || '';
                popupDocument.head.appendChild(style);
            });
        },

        setupSingleMirror(popup, panel, descriptor, key) {
            const popupDocument = popup.document;
            // Force dark BEFORE any other document work: a fresh about:blank
            // renders with the UA's white default and light form controls,
            // which both flashes light and leaves input/scrollbars light.
            // Direct inline properties on the root element win without
            // waiting for stylesheet parsing.
            try {
                popupDocument.documentElement.style.setProperty('background', '#171717', 'important');
                popupDocument.documentElement.style.setProperty('color-scheme', 'dark', 'important');
            } catch { /* non-fatal */ }
            popupDocument.head.replaceChildren();
            popupDocument.body.replaceChildren();
            popupDocument.title = `${descriptor.label || 'Torn Chat'} — Torn Chat`;
            this.copyStylesToPopup(popupDocument);

            const override = popupDocument.createElement('style');
            override.textContent = `
                html, body {
                    width:100% !important; height:100% !important; min-width:0 !important;
                    margin:0 !important; padding:0 !important; overflow:hidden !important;
                    background:#171717 !important; color-scheme: dark !important; color:#c9c9c9 !important;
                }
                #sk-chat-mirror-root {
                    position:fixed; inset:0; overflow:auto; background:#171717 !important;
                    display:flex; flex-direction:column; align-items:center; justify-content:flex-start;
                }
                #sk-chat-mirror-root > .sk-chat-mirror-panel {
                    flex: 0 0 auto !important;
                    margin:0 !important; transform:none !important; opacity:1 !important;
                    visibility:visible !important; box-sizing:border-box !important;
                    box-shadow:none !important;
                }
                #sk-chat-mirror-root .${SINGLE_BUTTON_CLASS},
                #sk-chat-mirror-root #${BUTTON_ID} { display:none !important; }
                /* Dark scrollbars for every scrollable surface in the popup,
                   including Torn's virtualized list. */
                ::-webkit-scrollbar { width:10px !important; height:10px !important; }
                ::-webkit-scrollbar-track { background:#242424 !important; }
                ::-webkit-scrollbar-thumb {
                    background:#4a4a4a !important; border:2px solid #242424 !important; border-radius:5px !important;
                }
                ::-webkit-scrollbar-thumb:hover { background:#6a6a6a !important; }
                ::selection { background:rgba(143,174,180,.45) !important; }
            `;
            popupDocument.head.appendChild(override);

            // A window.open('', name) popup inherits the opener's origin, so
            // the history API can relabel its ADDRESS PILL from about:blank
            // to a real same-origin path WITHOUT navigation or reload. Chrome
            // always renders the pill for popup windows (browser UI, cannot
            // be removed by pages) - but with a real URL, page title and
            // favicon the popup presents like a normal app window instead of
            // an unlabeled about:blank.
            try {
                const labelSlug = encodeURIComponent(
                    String(descriptor.label || 'chat').replace(/\s+/g, '-').slice(0, 48)
                );
                popup.history.replaceState(null, '', `/chat-popout#${labelSlug}`);
            } catch { /* pill stays about:blank on exotic origins */ }
            const favicon = popupDocument.createElement('link');
            favicon.rel = 'icon';
            favicon.href = 'https://www.torn.com/favicon.ico';
            popupDocument.head.appendChild(favicon);

            // Torn's app shell (fonts, theme variables, dark styling resets)
            // hangs off html/body-level classes that a fresh popup document
            // does not carry. Copy the opener's root classes so root-scoped
            // CSS resolves exactly as on the main page; the mirror markup
            // keeps its own class list.
            try {
                if (document.documentElement.className) {
                    popupDocument.documentElement.className = document.documentElement.className;
                }
                if (document.body?.className) {
                    popupDocument.body.className = document.body.className;
                }
            } catch { /* non-fatal */ }

            const mirrorRoot = popupDocument.createElement('div');
            mirrorRoot.id = 'sk-chat-mirror-root';
            popupDocument.body.appendChild(mirrorRoot);

            // THE MIRROR TREE IS BUILT ONCE. Every later change in the
            // original conversation window is replayed node-by-node from its
            // MutationRecords, so avatars (GIFs), iframes and CSS transitions
            // are never restarted. The previous design rebuilt the entire
            // clone on every mutation batch; the live Chat 3.1 (React)
            // mutates several times per second - typing-indicator ticks,
            // presence updates, virtualizer repositioning, composer
            // auto-grow style writes - and each full rebuild repainted the
            // whole popup with visibly restarting animations: the flicker.
            const clone = panel.cloneNode(true);
            clone.classList.remove(
                'sk-chat-conversation-detached',
                'sk-chat-popout-hidden-main',
                'sk-chat-single-hidden'
            );
            const originalDisplay = getComputedStyle(panel).display === 'none' ? 'flex' : getComputedStyle(panel).display;
            clone.classList.add('sk-chat-mirror-panel');
            clone.style.setProperty('display', originalDisplay, 'important');
            // SIZE PARITY: the virtualizer decides which rows exist based on
            // the original window's box. Stretching the clone to fill the
            // popup (old behavior) created regions with no backing DOM -
            // the disappearing/reappearing text - and made every scroll
            // computation disagree between the documents. Render the mirror
            // at the original's exact pixel size instead; the popup simply
            // centers it on dark background.
            const syncMirrorPanelBox = () => {
                if (popup.closed) return;
                const rect = panel.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    clone.style.setProperty('width', `${Math.round(rect.width)}px`, 'important');
                    clone.style.setProperty('height', `${Math.round(rect.height)}px`, 'important');
                }
            };
            syncMirrorPanelBox();
            mirrorRoot.appendChild(clone);

            const entry = {
                window: popup,
                panel,
                mirrorRoot,
                clonePanel: clone,
                observer: null,
                renderTimer: null
            };
            this.singlePopouts.set(key, entry);
            // Geometry snapshot for the minimized-guard below: if Torn
            // collapses the detached original (its focus moved to the
            // popup), restore its height so the virtualizer keeps
            // rendering and the mirror does not go blank.
            entry.detachedHeight = panel.offsetHeight || 0;

            // Original node -> mirror counterpart, for EVERY node kind
            // (elements, text, comments) so characterData records replay too.
            const mirrors = new Map();
            // Value-bearing and scroll-capable mirrors, resolved at
            // registration time: the live chat mutates several times per
            // second, so the periodic syncs must not iterate the whole map.
            const inputNodes = new Set();
            const scrollNodes = new Set();
            const scrollListenerAdded = new WeakSet();
            // Mirror containers the user has scrolled AWAY from the bottom
            // of. The hidden original is auto-pinned to the newest message,
            // so copying its scrollTop on every batch would yank readers back
            // down on each incoming message. While a container is parked the
            // original→mirror scroll sync is suppressed; scrolling back to
            // the bottom unparks it and following resumes.
            const readerParked = new WeakSet();
            const PIN_THRESHOLD = 48;
            const isPinnedToBottom = element => Boolean(element)
                && element.scrollHeight > element.clientHeight + 1
                && element.scrollTop + element.clientHeight >= element.scrollHeight - PIN_THRESHOLD;
            // The popup is freely resizable, so mirror viewports can differ
            // in height from the original's. Copying ABSOLUTE scrollTop
            // between mismatched geometries jittered the bottom view and
            // re-yanked readers. The sync is therefore INTENT-BASED:
            //   original pinned-to-bottom → mirror pinned-to-bottom
            //   original parked/scrolled  → mirror keeps its own position
            // (reading intent in the mirror still parks, as before).
            const maxScrollTop = element => Math.max(0, element.scrollHeight - element.clientHeight);
            const pinToBottom = element => { element.scrollTop = maxScrollTop(element); };
            const classify = (originalNode, mirrorNode) => {
                if (originalNode.nodeType !== 1) return;
                if (/^(TEXTAREA|INPUT|SELECT)$/.test(mirrorNode.tagName)) inputNodes.add([originalNode, mirrorNode]);
                else if (/scroll|viewport|message|virtual/i.test(`${originalNode.className || ''} ${originalNode.id || ''}`)) {
                    scrollNodes.add([originalNode, mirrorNode]);
                }
                // Elements can become scrollable later (virtualizer mounts,
                // content grows): one scroll event on the mirror registers
                // the pair so subsequent syncs follow it. WeakSet prevents
                // duplicate entries when the same node scrolls repeatedly.
                if (!scrollListenerAdded.has(mirrorNode)) {
                    scrollListenerAdded.add(mirrorNode);
                    mirrorNode.addEventListener('scroll', () => scrollNodes.add([originalNode, mirrorNode]), { passive: true });
                }
            };
            const registerAll = (originalNode, mirrorNode) => {
                const walk = (o, m) => {
                    mirrors.set(o, m);
                    classify(o, m);
                    const oChildren = o.childNodes, mChildren = m.childNodes;
                    const length = Math.min(oChildren.length, mChildren.length);
                    for (let i = 0; i < length; i++) walk(oChildren[i], mChildren[i]);
                };
                walk(originalNode, mirrorNode);
            };
            const unregisterAll = originalNode => {
                const walk = node => {
                    mirrors.delete(node);
                    for (const child of node.childNodes) walk(child);
                };
                walk(originalNode);
                // Entry pairs hold removed nodes; pruning via filter keeps
                // the sets small without a second traversal.
                for (const pairSet of [inputNodes, scrollNodes]) {
                    for (const pair of [...pairSet]) {
                        if (!pair[0].isConnected || !pair[1].isConnected) pairSet.delete(pair);
                    }
                }
            };
            registerAll(panel, clone);

            // React rerenders rewrite className wholesale, which would wipe
            // the classes this module layers on. Route class mutations
            // through this sanitizer instead of replaying them verbatim.
            const OWN_CLASSES = ['sk-chat-conversation-detached', 'sk-chat-popout-hidden-main', 'sk-chat-single-hidden'];
            const applyOriginalClasses = (originalNode, mirrorNode) => {
                mirrorNode.setAttribute('class', originalNode.getAttribute('class') || '');
                mirrorNode.classList.remove(...OWN_CLASSES);
                if (mirrorNode === clone) mirrorNode.classList.add('sk-chat-mirror-panel');
            };

            // Textareas/inputs keep their text in DOM PROPERTIES, which
            // clone/import does not copy. Sync on demand; the focused mirror
            // field is skipped so live typing is never interrupted. After a
            // relayed send the sync also runs UNFOCUSED so the composer
            // clears in the mirror when Torn clears the original.
            const syncInputValues = (respectFocus = true) => {
                if (popup.closed) return;
                const active = popup.document.activeElement;
                for (const [originalNode, mirrorNode] of inputNodes) {
                    if (respectFocus && mirrorNode === active) continue;
                    if (mirrorNode.value !== originalNode.value) mirrorNode.value = originalNode.value;
                }
            };

            // Auto-scrolls (new message arriving) change the original's
            // scrollTop PROPERTY, which no MutationRecord carries - replay
            // it manually whenever the content structure changed. Only
            // structure-bearing batches pay the layout-read cost.
            // Mirror nodes whose NEXT scroll event is the echo of a
            // module-driven sync move. The relay skips that echo: the
            // position came FROM the original, so writing it back is a
            // pointless feedback write that can lag one position behind if
            // the original moved again in between. Tracked per node because
            // one sync pass can move several containers whose events fire
            // in arbitrary order.
            const suppressScrollRelay = new WeakSet();

            const syncScrollPositions = () => {
                for (const [originalNode, mirrorNode] of scrollNodes) {
                    if (mirrorNode.scrollHeight <= mirrorNode.clientHeight + 1) continue;
                    // Reader is up in history: never drag them back down;
                    // leave their position alone so a busy channel cannot
                    // interrupt reading.
                    if (readerParked.has(mirrorNode)) continue;
                    if (isPinnedToBottom(originalNode)) {
                        // Original auto-pins to the newest message: the
                        // mirror follows as INTENT (go to your own bottom),
                        // never as a copied pixel value - the two viewports
                        // can be different heights after a popup resize.
                        if (!isPinnedToBottom(mirrorNode)) {
                            suppressScrollRelay.add(mirrorNode);
                            pinToBottom(mirrorNode);
                        }
                        continue;
                    }
                    // Original was repositioned elsewhere (loaded history,
                    // search jump): fall back to proportional syncing so a
                    // different viewport height cannot fight the position.
                    const originalMax = maxScrollTop(originalNode);
                    if (originalMax > 0 && !isPinnedToBottom(mirrorNode)) {
                        const ratio = originalNode.scrollTop / originalMax;
                        const target = Math.round(ratio * maxScrollTop(mirrorNode));
                        if (Math.abs(mirrorNode.scrollTop - target) > 1) {
                            suppressScrollRelay.add(mirrorNode);
                            mirrorNode.scrollTop = target;
                        }
                    }
                }
            };

            // Torn minimizes chat windows that lose focus - including the
            // detached original this mirror replays from. A minimized
            // original stops rendering messages (virtualizer + display
            // rules), which blanks the mirror "randomly". Guard: whenever
            // the original collapses below its detached height, restore it
            // and re-assert the visibility-based detach.
            const guardOriginalVisibility = () => {
                if (!panel.isConnected) return;
                const rect = panel.getBoundingClientRect();
                if (rect.height > 0 && rect.height < (entry.detachedHeight * 0.5)) {
                    panel.style.setProperty('height', `${entry.detachedHeight}px`, 'important');
                }
                if (!panel.classList.contains('sk-chat-conversation-detached')) {
                    panel.classList.add('sk-chat-conversation-detached');
                }
                // Panel-box parity: keep the mirror rendered at the
                // original's CURRENT size (the original can be drag-resized,
                // and guard restores above may change its height).
                syncMirrorPanelBox();
            };

            // Actions that can send (click relay, Enter) may also CLEAR the
            // composer via React state - property-only, invisible to the
            // observer. Schedule one unconditional value refresh so the
            // mirror follows within ~300ms. (entry.renderTimer is reused so
            // the existing cleanup paths clear it.)
            const scheduleComposerSync = () => {
                clearTimeout(entry.renderTimer);
                entry.renderTimer = setTimeout(() => {
                    entry.renderTimer = null;
                    if (!popup.closed && panel.isConnected) syncInputValues(false);
                }, 300);
            };

            // Controlled-input value changes are DOM PROPERTIES: invisible
            // to MutationObserver. A relayed click/Enter schedules an
            // immediate follow-up (scheduleComposerSync), but Torn can also
            // rewrite the composer through other state paths. This tiny
            // poll (a few string compares per tick, NO tree rebuilds) closes
            // the gap without touching layout or restarting animations.
            // It also re-runs the scroll sync: after the reader returns to
            // the bottom (unparked), a follow must resume promptly even if
            // no DOM mutation happens to carry it. Parked containers are
            // excluded inside syncScrollPositions itself.
            entry.valueSyncTimer = setInterval(() => {
                if (popup.closed) return;
                if (!panel.isConnected) return;
                syncInputValues();
                syncScrollPositions();
                guardOriginalVisibility();
            }, 700);

            const importNode = originalNode => popupDocument.importNode(originalNode, true);

            const replayMutations = records => {
                if (popup.closed) return;
                let structureChanged = false;
                for (const record of records) {
                    try {
                        if (record.type === 'childList') {
                            const mirrorParent = mirrors.get(record.target);
                            if (!mirrorParent) continue;
                            // A virtualizer or reorder moves nodes as
                            // SAME-BATCH remove+insert pairs. Importing a
                            // fresh mirror for the re-inserted node restarts
                            // avatar GIFs and loses scroll/caret state -
                            // visible glitching on every scroll. Reuse the
                            // already-cloned mirror node instead of
                            // re-importing, and only import what is truly
                            // new to this batch.
                            const batchMoved = new Map(
                                record.removedNodes
                                    .filter(node => mirrors.has(node))
                                    .map(node => [node, mirrors.get(node)])
                            );
                            for (const removed of record.removedNodes) {
                                const mirrorRemoved = batchMoved.get(removed);
                                if (mirrorRemoved?.parentNode) {
                                    mirrorRemoved.parentNode.removeChild(mirrorRemoved);
                                }
                                if (!batchMoved.has(removed)) unregisterAll(removed);
                            }
                            for (const added of record.addedNodes) {
                                // Reuse the batch-moved mirror when present
                                // (preserves GIFs/state); import only truly
                                // new nodes. registerAll is idempotent for
                                // moved pairs and resolves new ones.
                                const mirrorAdded = batchMoved.get(added) || importNode(added);
                                const nextMirror = added.nextSibling ? mirrors.get(added.nextSibling) : null;
                                mirrorParent.insertBefore(mirrorAdded, nextMirror || null);
                                registerAll(added, mirrorAdded);
                            }
                            structureChanged = true;
                        } else if (record.type === 'characterData') {
                            const mirrorText = mirrors.get(record.target);
                            if (mirrorText) mirrorText.data = record.target.data;
                        } else if (record.type === 'attributes') {
                            const mirrorNode = mirrors.get(record.target);
                            if (!mirrorNode || typeof mirrorNode.setAttribute !== 'function') continue;
                            if (record.attributeName === 'class') {
                                applyOriginalClasses(record.target, mirrorNode);
                            } else {
                                const value = record.target.getAttribute(record.attributeName);
                                if (value === null) mirrorNode.removeAttribute(record.attributeName);
                                else mirrorNode.setAttribute(record.attributeName, value);
                            }
                        }
                    } catch { /* one un-replayable record must not stop the rest */ }
                }
                if (structureChanged) syncScrollPositions();
                syncInputValues();

                // React rewrites the original window's className on
                // focus/visibility changes (the `visible___*` class toggles),
                // wiping the detached class this module added and flashing
                // the conversation back over the main page. Restore it on
                // sight: the resulting mutation replays through the mirror
                // sanitizer too, so both sides stay correct.
                if (records.some(record => record.type === 'attributes'
                    && record.attributeName === 'class' && record.target === panel)
                    && !panel.classList.contains('sk-chat-conversation-detached')) {
                    panel.classList.add('sk-chat-conversation-detached');
                }
            };

            const findOriginalTarget = target => {
                if (!entry.clonePanel || !target) return null;
                const path = getNodePath(target, entry.clonePanel);
                return path ? getNodeAtPath(entry.panel, path) : null;
            };

            mirrorRoot.addEventListener('click', event => {
                // Real links navigate THIS popup window; relaying their click
                // to the hidden original would drive the MAIN torn tab to
                // the link target instead.
                if (event.target.closest?.('a[href]')) return;
                const original = findOriginalTarget(event.target);
                if (!original) return;
                event.preventDefault();
                event.stopPropagation();
                original.click?.();
                scheduleComposerSync();
            }, true);

            mirrorRoot.addEventListener('input', event => {
                const original = findOriginalTarget(event.target);
                if (!original || !('value' in original)) return;
                const proto = original instanceof HTMLTextAreaElement
                    ? HTMLTextAreaElement.prototype
                    : HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                if (setter) setter.call(original, event.target.value);
                else original.value = event.target.value;
                // React 16+ tracks a value tracker on controlled inputs; a
                // plain Event('input') whose target already holds the value
                // is treated as a no-op and the UI never re-renders.
                // Dispatch a standards InputEvent with data so React's
                // synthetic onKeyDown/onChange pipeline actually sees a
                // change, matching real user typing as closely as possible.
                original.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    data: event.data,
                    inputType: event.inputType || 'insertText'
                }));
            }, true);

            mirrorRoot.addEventListener('keydown', event => {
                const original = findOriginalTarget(event.target);
                if (!original) return;
                original.dispatchEvent(new KeyboardEvent('keydown', {
                    key: event.key,
                    code: event.code,
                    keyCode: event.keyCode,
                    which: event.which,
                    ctrlKey: event.ctrlKey,
                    shiftKey: event.shiftKey,
                    altKey: event.altKey,
                    metaKey: event.metaKey,
                    bubbles: true,
                    cancelable: true
                }));
                if (event.key === 'Enter') {
                    // Enter can send, which clears the composer via React
                    // state (property-only). Follow up with a value refresh.
                    scheduleComposerSync();
                    event.preventDefault();
                }
            }, true);
            // Many chat composers (Torn's included) send on keyup, not
            // keydown - relaying both matches real typing. Without this,
            // Enter in the popup typed newlines into the hidden composer
            // but never sent.
            mirrorRoot.addEventListener('keyup', event => {
                const original = findOriginalTarget(event.target);
                if (!original) return;
                original.dispatchEvent(new KeyboardEvent('keyup', {
                    key: event.key,
                    code: event.code,
                    keyCode: event.keyCode,
                    which: event.which,
                    ctrlKey: event.ctrlKey,
                    shiftKey: event.shiftKey,
                    altKey: event.altKey,
                    metaKey: event.metaKey,
                    bubbles: true,
                    cancelable: true
                }));
                if (event.key === 'Enter') scheduleComposerSync();
            }, true);

            mirrorRoot.addEventListener('scroll', event => {
                const target = event.target;
                // Track reader intent: leaving the bottom parks the
                // container (auto-follow suppressed); returning to the
                // bottom unparks it. Module-driven sync echoes are allowed
                // to update parking too (they move the mirror toward a
                // position the original already holds).
                if (target?.nodeType === 1 && target.scrollHeight > target.clientHeight + 1) {
                    if (isPinnedToBottom(target)) readerParked.delete(target);
                    else readerParked.add(target);
                }
                // The echo of a module-driven sync move: the original
                // already holds this position (it is where the mirror got
                // it), so nothing to relay - consume and stop.
                if (target?.nodeType === 1 && suppressScrollRelay.delete(target)) return;
                const original = findOriginalTarget(target);
                if (!original) return;
                // Scroll events arrive asynchronously and may be stale:
                // between the user's scroll and this handler, a sync may
                // already have moved the mirror again. Only relay a position
                // that genuinely matches what the mirror shows NOW;
                // otherwise a queued second event would write a stale value
                // over a newer one.
                if (original.scrollTop !== target.scrollTop) original.scrollTop = target.scrollTop;
            }, true);

            entry.observer = new MutationObserver(replayMutations);
            entry.observer.observe(panel, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true
            });
            syncInputValues(false);

            // SPAWN SCROLL FIX: the copied stylesheets load asynchronously.
            // Before they apply, the mirror list renders unstyled - no fixed
            // viewport height, so there is nothing overflowable to scroll
            // and an immediate syncScrollPositions() would leave it at the
            // TOP of history. Pin to the newest messages only AFTER the
            // stylesheet has actually loaded and the viewport has its real
            // size. Two belted attempts (marker sync + load event) cover
            // both styles arriving later and cached-instant cases.
            const pinAfterStyles = () => {
                if (popup.closed) return;
                syncScrollPositions();
                // Pin every non-parked scrollable that has nothing better
                // to do; the list is brand-new so nothing is parked yet and
                // defaulting to bottom matches the original's auto-pin.
                for (const [, mirrorNode] of scrollNodes) {
                    if (!readerParked.has(mirrorNode) && maxScrollTop(mirrorNode) > 0) {
                        suppressScrollRelay.add(mirrorNode);
                        pinToBottom(mirrorNode);
                    }
                }
            };
            requestAnimationFrame(() => setTimeout(pinAfterStyles, 60));
            requestAnimationFrame(() => setTimeout(pinAfterStyles, 400));
            popup.addEventListener('load', pinAfterStyles);

            panel.classList.add('sk-chat-conversation-detached');
            popup.focus();
        },

        openPopout() {
            if (this.popoutWindow && !this.popoutWindow.closed) {
                this.popoutWindow.focus(); this.hideMainChat(); return;
            }
            const popup = window.open('', POPUP_NAME, this.getWindowFeatures());
            if (!popup) {
                console.warn('[ChatPopout] Popup blocked. Allow popups for torn.com.');
                return;
            }
            this.popoutWindow = popup;
            this.navigatePopup(popup);
            this.hideMainChat();
            this.startCloseWatcher();
        },

        openSinglePopout(panel) {
            const descriptor = describePanel(panel);
            const key = descriptor.token || normalize(descriptor.label);
            const existing = this.singlePopouts.get(key);
            if (existing && !existing.window.closed) {
                existing.window.focus();
                panel.classList.add('sk-chat-conversation-detached');
                return;
            }
            const popupName = `${SINGLE_PREFIX}${encodeURIComponent(JSON.stringify(descriptor))}`;
            const popup = window.open('', popupName, this.getWindowFeatures());
            if (!popup) {
                console.warn('[ChatPopout] Popup blocked. Allow popups for torn.com.');
                return;
            }
            try {
                this.setupSingleMirror(popup, panel, descriptor, key);
            } catch (error) {
                popup.close();
                panel.classList.remove('sk-chat-conversation-detached');
                console.error('[ChatPopout] Could not create singular chat mirror:', error);
                return;
            }
            this.startCloseWatcher();
        },

        hideMainChat() {
            document.documentElement.classList.add('sk-chat-popout-detached');
            findChatPanels()
                .forEach(panel => panel.classList.add('sk-chat-popout-hidden-main'));
        },
        restoreMainChat() {
            document.documentElement.classList.remove('sk-chat-popout-detached');
            document.querySelectorAll('.sk-chat-popout-hidden-main')
                .forEach(panel => panel.classList.remove('sk-chat-popout-hidden-main'));
        },

        startCloseWatcher() {
            if (this.closeWatcher) return;
            this.closeWatcher = setInterval(() => {
                if (this.popoutWindow?.closed) {
                    this.popoutWindow = null;
                    this.restoreMainChat();
                }
                for (const [key, entry] of this.singlePopouts) {
                    if (entry.window.closed) continue;
                    // The live conversation window can disappear on its own
                    // (user hits Torn's close icon via another surface, chat
                    // reload). A mirror pointing at a detached panel would
                    // freeze forever, so retire it together with the popup.
                    if (entry.panel && !entry.panel.isConnected) {
                        entry.observer?.disconnect();
                        clearTimeout(entry.renderTimer);
                        clearInterval(entry.valueSyncTimer);
                        if (!entry.window.closed) entry.window.close();
                        this.singlePopouts.delete(key);
                        continue;
                    }
                }
                for (const [key, entry] of this.singlePopouts) {
                    if (!entry.window.closed) continue;
                    entry.observer?.disconnect();
                    clearTimeout(entry.renderTimer);
                    clearInterval(entry.valueSyncTimer);
                    entry.panel?.classList.remove('sk-chat-conversation-detached');
                    this.singlePopouts.delete(key);
                }
                if (!this.popoutWindow && this.singlePopouts.size === 0) this.stopCloseWatcher();
            }, 750);
        },

        stopCloseWatcher() {
            if (this.closeWatcher) clearInterval(this.closeWatcher);
            this.closeWatcher = null;
        }
    };

    window.SidekickModules = window.SidekickModules || {};
    window.SidekickModules.ChatPopout = ChatPopoutModule;
})();
