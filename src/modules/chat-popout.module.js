/**
 * Sidekick Chat Popout
 * Opens one selected Torn conversation in a separate, user-triggered,
 * resizable window.
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

    function findChatPanels() {
        const chatRoot = document.getElementById('chatRoot');
        if (!chatRoot) return [];
        return Array.from(new Set(
            Array.from(chatRoot.querySelectorAll(composerSelector()))
                .map(findChatPanel)
                .filter(Boolean)
        ));
    }

    function getStableToken(panel) {
        const attributes = ['data-chat-id', 'data-user-id', 'data-channel-id', 'data-id', 'id'];
        const elements = [panel, ...panel.querySelectorAll('[data-chat-id], [data-user-id], [data-channel-id], [data-id], [id]')];
        for (const element of elements) {
            for (const attribute of attributes) {
                const value = element.getAttribute?.(attribute);
                if (value && value.length < 120 && !/^chatRoot$/i.test(value)) return `${attribute}:${value}`;
            }
        }
        return '';
    }

    function getChatLabel(panel) {
        const ignored = /^(close|minimi[sz]e|maximi[sz]e|settings|send|type your message|last message|view)$/i;
        const preferred = Array.from(panel.querySelectorAll(
            '[class*="header" i] [class*="name" i], [class*="title" i], [class*="name" i], header strong, header span, strong'
        ));
        const fallback = Array.from(panel.querySelectorAll('span, a, button'));
        for (const element of [...preferred, ...fallback]) {
            const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text || text.length > 60 || ignored.test(text) || /^\d{1,2}:\d{2}/.test(text)) continue;
            if (element.closest(`.${SINGLE_BUTTON_CLASS}`)) continue;
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
                background: #171717 !important;
            }
            body > *:not(#chatRoot):not(script):not(link):not(style) { display: none !important; }
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
            const chatRoot = document.getElementById('chatRoot');
            if (!chatRoot) return false;
            chatRoot.style.setProperty('display', 'block', 'important');
            chatRoot.style.setProperty('position', 'fixed', 'important');
            chatRoot.style.setProperty('inset', '0', 'important');
            chatRoot.style.setProperty('width', '100vw', 'important');
            chatRoot.style.setProperty('height', '100vh', 'important');

            if (descriptor) {
                const panels = findChatPanels();
                const selected = panels.find(panel => descriptorsMatch(panel, descriptor));
                panels.forEach(panel => {
                    panel.classList.toggle('sk-chat-single-selected', panel === selected);
                    panel.classList.toggle('sk-chat-single-hidden', panel !== selected);
                });
            }
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
                .sk-chat-conversation-detached { display: none !important; }
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
            const button = document.createElement('button');
            button.className = className;
            button.type = 'button';
            button.title = title;
            button.setAttribute('aria-label', title);
            button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3z"></path><path fill="currentColor" d="M5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path></svg>';
            const activate = event => {
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); action();
            };
            button.addEventListener('pointerdown', event => {
                event.stopPropagation(); event.stopImmediatePropagation();
            }, true);
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
                const controls = Array.from(panel.querySelectorAll('button'));
                const close = controls.find(button => /close/i.test(`${button.title} ${button.getAttribute('aria-label')}`));
                const minimize = controls.find(button => /minimi[sz]e/i.test(`${button.title} ${button.getAttribute('aria-label')}`));
                const header = close?.parentElement || minimize?.parentElement
                    || panel.querySelector('[class*="header" i], header');
                if (!header) continue;
                const button = this.makeIconButton(SINGLE_BUTTON_CLASS, 'Pop out this chat', () => this.openSinglePopout(panel));
                header.insertBefore(button, minimize || close || null);
            }
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
            popupDocument.head.replaceChildren();
            popupDocument.body.replaceChildren();
            popupDocument.title = `${descriptor.label || 'Torn Chat'} — Torn Chat`;
            this.copyStylesToPopup(popupDocument);

            const override = popupDocument.createElement('style');
            override.textContent = `
                html, body { width:100%; height:100%; min-width:0; margin:0; padding:0; overflow:hidden; background:#171717; }
                #sk-chat-mirror-root { position:fixed; inset:0; overflow:hidden; background:#171717; }
                #sk-chat-mirror-root > .sk-chat-mirror-panel {
                    position:absolute !important; inset:0 !important;
                    width:100% !important; min-width:0 !important; max-width:none !important;
                    height:100% !important; min-height:0 !important; max-height:none !important;
                    margin:0 !important; transform:none !important; opacity:1 !important;
                    visibility:visible !important; box-sizing:border-box !important;
                }
                #sk-chat-mirror-root .${SINGLE_BUTTON_CLASS},
                #sk-chat-mirror-root #${BUTTON_ID} { display:none !important; }
            `;
            popupDocument.head.appendChild(override);

            const mirrorRoot = popupDocument.createElement('div');
            mirrorRoot.id = 'sk-chat-mirror-root';
            popupDocument.body.appendChild(mirrorRoot);

            const entry = {
                window: popup,
                panel,
                originalDisplay: getComputedStyle(panel).display === 'none' ? 'flex' : getComputedStyle(panel).display,
                mirrorRoot,
                clonePanel: null,
                observer: null,
                renderTimer: null,
                rendering: false
            };
            this.singlePopouts.set(key, entry);

            const render = () => {
                if (entry.rendering || popup.closed || !entry.panel?.isConnected) return;
                entry.rendering = true;
                try {
                    const clone = entry.panel.cloneNode(true);
                    clone.classList.remove('sk-chat-conversation-detached');
                    clone.classList.add('sk-chat-mirror-panel');
                    clone.style.setProperty('display', entry.originalDisplay, 'important');
                    entry.mirrorRoot.replaceChildren(clone);
                    entry.clonePanel = clone;

                    const originals = [entry.panel, ...entry.panel.querySelectorAll('*')];
                    const clones = [clone, ...clone.querySelectorAll('*')];
                    originals.forEach((original, index) => {
                        const copied = clones[index];
                        if (!copied) return;
                        if (original.scrollHeight > original.clientHeight) {
                            copied.scrollTop = original.scrollTop || original.scrollHeight;
                        }
                    });
                } finally {
                    entry.rendering = false;
                }
            };

            const queueRender = () => {
                clearTimeout(entry.renderTimer);
                entry.renderTimer = setTimeout(render, 40);
            };

            const findOriginalTarget = target => {
                if (!entry.clonePanel || !target) return null;
                const path = getNodePath(target, entry.clonePanel);
                return path ? getNodeAtPath(entry.panel, path) : null;
            };

            mirrorRoot.addEventListener('click', event => {
                const original = findOriginalTarget(event.target);
                if (!original) return;
                event.preventDefault();
                event.stopPropagation();
                original.click?.();
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
                original.dispatchEvent(new Event('input', { bubbles: true }));
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
                if (event.key === 'Enter') event.preventDefault();
            }, true);

            mirrorRoot.addEventListener('scroll', event => {
                const original = findOriginalTarget(event.target);
                if (original) original.scrollTop = event.target.scrollTop;
            }, true);

            entry.observer = new MutationObserver(queueRender);
            entry.observer.observe(panel, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true
            });
            render();
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

        hideMainChat() { document.documentElement.classList.add('sk-chat-popout-detached'); },
        restoreMainChat() { document.documentElement.classList.remove('sk-chat-popout-detached'); },

        startCloseWatcher() {
            if (this.closeWatcher) return;
            this.closeWatcher = setInterval(() => {
                if (this.popoutWindow?.closed) {
                    this.popoutWindow = null;
                    this.restoreMainChat();
                }
                for (const [key, entry] of this.singlePopouts) {
                    if (!entry.window.closed) continue;
                    entry.observer?.disconnect();
                    clearTimeout(entry.renderTimer);
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
