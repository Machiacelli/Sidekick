/**
 * Sidekick Chrome Extension - Cracking Module
 */

(function () {
    'use strict';

    console.log('💻 Loading Sidekick Cracking Module...');

    const CrackingModule = {
        isInitialized: false,
        isEnabled: false,
        _intervalId: null,

        async init() {
            if (this.isInitialized) return;
            console.log('💻 Initializing Cracking Module...');

            try {
                this.isEnabled = await this.loadSettings();
                if (this.isEnabled) {
                    this.enable();
                }
                this.isInitialized = true;
                console.log('✅ Cracking Module initialized');
            } catch (error) {
                console.error('❌ Failed to initialize Cracking Module:', error);
            }
        },

        async loadSettings() {
            try {
                if (window.SidekickModules?.Core?.ChromeStorage?.get) {
                    const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                    if (settings && settings['crime-cracking']) {
                        return settings['crime-cracking'].isEnabled !== false;
                    }
                }
                return false;
            } catch (error) {
                console.error('Error loading Cracking settings:', error);
                return false;
            }
        },

        enable() {
            if (this._enabledInternal) return;
            this._enabledInternal = true;
            console.log('💻 Enabling Cracking Module');
            this.startModule();
        },

        disable() {
            if (!this._enabledInternal) return;
            this._enabledInternal = false;
            console.log('💻 Disabling Cracking Module');
            this.stopModule();
        },

        async toggle() {
            this.isEnabled = !this.isEnabled;

            if (this.isEnabled) {
                this.enable();
            } else {
                this.disable();
            }
        },

        startModule() {
            this.dict = [];
            this.dictLoaded = false;
            this.dictLoading = false;
            this.prevRowStates = new Map();
            this.panelUpdateTimers = new Map();
            this.LAST_INPUT = { key: null, time: 0 };

            this.MIN_LENGTH = 4;
            this.MAX_LENGTH = 10;
            this.WORDLIST_URL =
                'https://gitlab.com/kalilinux/packages/seclists/-/raw/kali/master/Passwords/Common-Credentials/Pwdb_top-1000000.txt?ref_type=heads';

            this.DB_NAME = 'crack';
            this.STORE_NAME = 'dictionary';
            this.EXCL_STORAGE_PREFIX = 'crack_excl_';

            this.debug = false;

            this._intervalId = setInterval(
                () => this.scanCrimePage(),
                50
            );

            this.keydownHandler = event => {
                if (event.metaKey || event.ctrlKey || event.altKey) return;
                this.captureKey(event.key);
            };

            window.addEventListener(
                'keydown',
                this.keydownHandler,
                true
            );

            this.loadDict();
            this.startNavWatcher();
        },

        stopModule() {
            if (this._intervalId) {
                clearInterval(this._intervalId);
                this._intervalId = null;
            }

            if (this._navWatcher) {
                clearInterval(this._navWatcher);
                this._navWatcher = null;
            }

            if (this.keydownHandler) {
                window.removeEventListener(
                    'keydown',
                    this.keydownHandler,
                    true
                );

                this.keydownHandler = null;
            }

            const badge = document.getElementById(
                'sidekick-cracking-badge'
            );

            if (badge) badge.remove();

            document
                .querySelectorAll('.__crackhelp_panel')
                .forEach(panel => panel.remove());
        },

        setStatus(message) {
            if (this.debug && message) {
                console.log('[Crack] Status:', message);
            }
        },

        crackLog(...args) {
            if (this.debug) {
                console.log('[Crack]', ...args);
            }
        },

        injectHeaderBadge() {
            if (window.location.hash !== '#/cracking') return;

            if (
                document.getElementById(
                    'sidekick-cracking-badge'
                )
            ) {
                return;
            }

            const header = document.querySelector(
                'div.appHeader___tG_Ot h4.heading___BtymB'
            );

            if (!header) return;

            const badge = document.createElement('span');

            badge.id = 'sidekick-cracking-badge';
            badge.title = 'Sidekick Cracking active';

            badge.style.cssText = [
                'display:inline-flex',
                'align-items:center',
                'justify-content:center',
                'width:16px',
                'height:16px',
                'border-radius:50%',
                'background:linear-gradient(135deg,#66BB6A,#4CAF50)',
                'color:#fff',
                'font-size:10px',
                'font-weight:bold',
                'margin-left:6px',
                'vertical-align:middle',
                'flex-shrink:0',
                'box-shadow:0 0 4px rgba(102,187,106,0.6)'
            ].join(';');

            badge.textContent = '✓';
            header.appendChild(badge);
        },

        startNavWatcher() {
            if (this._navWatcher) return;

            let lastUrl = window.location.href;

            this._navWatcher = setInterval(() => {
                const currentUrl = window.location.href;

                if (currentUrl !== lastUrl) {
                    lastUrl = currentUrl;

                    const oldBadge = document.getElementById(
                        'sidekick-cracking-badge'
                    );

                    if (oldBadge) oldBadge.remove();
                }

                this.injectHeaderBadge();
            }, 400);

            this.injectHeaderBadge();
        },

        getTheme() {
            return {
                uiBg: '#222',
                uiText: '#fff',
                uiBorder: 'rgba(255,255,255,0.2)',
                sugBg: 'rgba(30,32,36,0.95)',
                sugText: '#4fa854',
                sugFontPx: 12
            };
        },

        styleSugSpan(span) {
            const theme = this.getTheme();

            span.style.padding = '2px 4px';
            span.style.margin = '0 2px';
            span.style.display = 'inline-block';
            span.style.borderRadius = '3px';
            span.style.fontSize = `${theme.sugFontPx}px`;
            span.style.color = theme.sugText;
            span.style.fontWeight = 'bold';
        },

        applyPanelTheme(panel) {
            const theme = this.getTheme();

            if (!panel) return;

            panel.style.background = theme.sugBg;
            panel.style.color = theme.sugText;
            panel.style.fontSize = `${theme.sugFontPx}px`;
            panel.style.textAlign = 'center';
            panel.style.position = 'absolute';
            panel.style.zIndex = '9999';

            const list = panel.querySelector(':scope > div');

            if (!list) return;

            for (const child of Array.from(list.children)) {
                if (child.dataset?.kind === 'sug') {
                    this.styleSugSpan(child);
                }
            }
        },

        gmRequest(options) {
            return new Promise(async (resolve, reject) => {
                try {
                    const method = options.method || 'GET';

                    const headers = options.headers || {
                        Accept: 'application/json, text/plain, */*; q=0.1'
                    };

                    const requestOptions = {
                        method,
                        headers
                    };

                    if (options.data) {
                        requestOptions.body = options.data;
                    }

                    const controller = new AbortController();

                    const timeoutId = setTimeout(
                        () => controller.abort(),
                        options.timeout || 30000
                    );

                    requestOptions.signal = controller.signal;

                    const response = await fetch(
                        options.url,
                        requestOptions
                    );

                    clearTimeout(timeoutId);

                    let responseText = '';
                    let responseData = null;

                    if (options.responseType === 'arraybuffer') {
                        responseData = await response.arrayBuffer();
                    } else {
                        responseText = await response.text();
                    }

                    resolve({
                        status: response.status,
                        statusText: response.statusText,
                        responseText,
                        response: responseData,
                        responseHeaders: [...response.headers]
                            .map(([key, value]) => `${key}: ${value}`)
                            .join('\r\n')
                    });
                } catch (error) {
                    reject(error);
                }
            });
        },

        openDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(
                    this.DB_NAME,
                    1
                );

                request.onupgradeneeded = () => {
                    const database = request.result;

                    if (
                        !database.objectStoreNames.contains(
                            this.STORE_NAME
                        )
                    ) {
                        database.createObjectStore(
                            this.STORE_NAME
                        );
                    }
                };

                request.onsuccess = () =>
                    resolve(request.result);

                request.onerror = () =>
                    reject(request.error);
            });
        },

        async idbSet(key, value) {
            const database = await this.openDB();

            return new Promise((resolve, reject) => {
                const transaction = database.transaction(
                    this.STORE_NAME,
                    'readwrite'
                );

                transaction
                    .objectStore(this.STORE_NAME)
                    .put(value, key);

                transaction.oncomplete = resolve;
                transaction.onerror = () =>
                    reject(transaction.error);
            });
        },

        async idbGet(key) {
            const database = await this.openDB();

            return new Promise((resolve, reject) => {
                const transaction = database.transaction(
                    this.STORE_NAME,
                    'readonly'
                );

                const request = transaction
                    .objectStore(this.STORE_NAME)
                    .get(key);

                request.onsuccess = () =>
                    resolve(request.result);

                request.onerror = () =>
                    reject(request.error);
            });
        },

        captureKey(key) {
            if (!key) return;

            const match = String(key).match(
                /^[A-Za-z0-9._]$/
            );

            if (!match) return;

            this.LAST_INPUT.key = key.toUpperCase();
            this.LAST_INPUT.time = performance.now();
        },

        async commitBucketsToIDB(buckets) {
            for (const lengthString of Object.keys(buckets)) {
                const length = Number(lengthString);
                const newWords = Array.from(
                    buckets[lengthString]
                );

                let existingWords = await this.idbGet(
                    `len_${length}`
                );

                if (!existingWords) {
                    existingWords = [];
                }

                const mergedWords = Array.from(
                    new Set([
                        ...existingWords,
                        ...newWords
                    ])
                );

                await this.idbSet(
                    `len_${length}`,
                    mergedWords
                );

                this.dict[length] = mergedWords;
                this._buildIndex(length);
            }
        },

        _buildIndex(length) {
            if (!this.dictIndex) {
                this.dictIndex = [];
            }

            const index = {};

            for (const word of this.dict[length] || []) {
                const firstCharacter = word[0];

                if (!index[firstCharacter]) {
                    index[firstCharacter] = [];
                }

                index[firstCharacter].push(word);
            }

            this.dictIndex[length] = index;
        },

        async fetchAndIndex(url, onProgress) {
            this.setStatus('Downloading base wordlist…');

            const response = await this.gmRequest({
                method: 'GET',
                url,
                timeout: 90000,
                responseType: 'text'
            });

            if (
                response.status < 200 ||
                response.status >= 300 ||
                !response.responseText
            ) {
                const error = new Error(
                    `Bad response from base wordlist: ${response.status}`
                );

                error.status = response.status;
                throw error;
            }

            this.setStatus('Indexing…');

            const lines = response.responseText.split(
                /\r?\n/
            );

            const buckets = {};
            let processed = 0;

            for (const rawLine of lines) {
                processed += 1;

                const word = String(rawLine || '')
                    .trim()
                    .toUpperCase();

                if (!word) continue;
                if (!/^[A-Z0-9_.]+$/.test(word)) continue;

                const length = word.length;

                if (
                    length < this.MIN_LENGTH ||
                    length > this.MAX_LENGTH
                ) {
                    continue;
                }

                if (!buckets[length]) {
                    buckets[length] = new Set();
                }

                buckets[length].add(word);

                if (
                    processed % 5000 === 0 &&
                    typeof onProgress === 'function'
                ) {
                    onProgress({
                        phase: '1M-index',
                        processed,
                        pct: null
                    });

                    await new Promise(resolve =>
                        setTimeout(resolve, 0)
                    );
                }
            }

            await this.commitBucketsToIDB(buckets);
            this.setStatus('1M cached');

            return {
                totalProcessed: processed
            };
        },

        async loadDict() {
            if (
                this.dictLoaded ||
                this.dictLoading
            ) {
                return;
            }

            this.dictLoading = true;
            this.setStatus('Loading from cache…');

            let hasData = false;
            this.dict = [];

            for (
                let length = this.MIN_LENGTH;
                length <= this.MAX_LENGTH;
                length += 1
            ) {
                const words = await this.idbGet(
                    `len_${length}`
                );

                if (words?.length) {
                    this.dict[length] = words;
                    hasData = true;
                }
            }

            if (!hasData) {
                this.crackLog(
                    'No cache found. Downloading dictionary…'
                );

                const maximumAttempts = 4;
                const delays = [
                    0,
                    3000,
                    10000,
                    30000
                ];

                let succeeded = false;
                let lastError = null;

                for (
                    let attempt = 0;
                    attempt < maximumAttempts;
                    attempt += 1
                ) {
                    try {
                        await this.fetchAndIndex(
                            this.WORDLIST_URL,
                            progress => {
                                if (
                                    progress.phase ===
                                    '1M-index'
                                ) {
                                    this.setStatus(
                                        `Indexing 1M… processed ${progress.processed}`
                                    );
                                }
                            }
                        );

                        succeeded = true;
                        break;
                    } catch (error) {
                        lastError = error;

                        const wait = delays[
                            Math.min(
                                attempt,
                                delays.length - 1
                            )
                        ];

                        this.crackLog(
                            `Base download failed (try ${attempt + 1}/${maximumAttempts})`,
                            error
                        );

                        this.setStatus(
                            `Download failed (try ${attempt + 1}/${maximumAttempts}) — retrying in ${Math.ceil(wait / 1000)}s…`
                        );

                        if (wait) {
                            await new Promise(resolve =>
                                setTimeout(resolve, wait)
                            );
                        }
                    }
                }

                if (!succeeded) {
                    this.crackLog(
                        'Giving up on base download for now.',
                        lastError
                    );

                    this.dictLoading = false;
                    this.dictLoaded = false;

                    setTimeout(() => {
                        this.loadDict().catch(() => {});
                    }, 60000);

                    this.setStatus(
                        'Failed to fetch base wordlist (will retry)...'
                    );

                    return;
                }
            } else {
                this.crackLog(
                    'Dictionary loaded from IndexedDB'
                );
            }

            this.dictLoaded = true;
            this.dictLoading = false;

            if (!this.dictIndex) {
                this.dictIndex = [];
            }

            for (
                let length = this.MIN_LENGTH;
                length <= this.MAX_LENGTH;
                length += 1
            ) {
                if (this.dict[length]) {
                    this._buildIndex(length);
                }
            }

            this.setStatus('');
        },

        loadExclusions(rowKey, length) {
            const storageKey =
                this.EXCL_STORAGE_PREFIX +
                rowKey +
                '_' +
                length;

            const rawValue =
                sessionStorage.getItem(storageKey);

            let storedValues = [];

            if (rawValue) {
                try {
                    storedValues = JSON.parse(rawValue);
                } catch (_) {}
            }

            const exclusions = new Array(length);

            for (
                let position = 0;
                position < length;
                position += 1
            ) {
                const storedPosition =
                    storedValues[position];

                const letters = Array.isArray(
                    storedPosition
                )
                    ? storedPosition
                    : typeof storedPosition === 'string'
                        ? storedPosition.split('')
                        : [];

                exclusions[position] = new Set(
                    letters
                        .map(letter =>
                            String(letter || '')
                                .toUpperCase()
                        )
                        .filter(Boolean)
                );
            }

            return exclusions;
        },

        saveExclusions(rowKey, length, exclusions) {
            const values = new Array(length);

            for (
                let position = 0;
                position < length;
                position += 1
            ) {
                values[position] = Array.from(
                    exclusions[position] ||
                    new Set()
                );
            }

            sessionStorage.setItem(
                this.EXCL_STORAGE_PREFIX +
                    rowKey +
                    '_' +
                    length,
                JSON.stringify(values)
            );
        },

        schedulePanelUpdate(panel) {
            if (!panel) return;

            const rowKey = panel.dataset.rowkey;

            if (
                this.panelUpdateTimers.has(rowKey)
            ) {
                clearTimeout(
                    this.panelUpdateTimers.get(rowKey)
                );
            }

            this.panelUpdateTimers.set(
                rowKey,
                setTimeout(() => {
                    panel.updateSuggestions();
                    this.panelUpdateTimers.delete(rowKey);
                }, 0)
            );
        },

        addExclusion(
            rowKey,
            position,
            letter,
            length
        ) {
            const normalizedLetter = String(
                letter || ''
            ).toUpperCase();

            if (!normalizedLetter) return;

            const exclusions = this.loadExclusions(
                rowKey,
                length
            );

            if (!exclusions[position]) {
                exclusions[position] = new Set();
            }

            const previousSize =
                exclusions[position].size;

            exclusions[position].add(
                normalizedLetter
            );

            if (
                exclusions[position].size !==
                previousSize
            ) {
                this.saveExclusions(
                    rowKey,
                    length,
                    exclusions
                );

                const panel =
                    document.querySelector(
                        `.__crackhelp_panel[data-rowkey="${rowKey}"]`
                    );

                this.schedulePanelUpdate(panel);
            }
        },

        suggest(pattern, rowKey) {
            const length = pattern.length;

            if (
                length < this.MIN_LENGTH ||
                length > this.MAX_LENGTH
            ) {
                return [];
            }

            if (!this.dict[length]) {
                return [];
            }

            const maximumSuggestions = 5;
            const normalizedPattern =
                pattern.toUpperCase();

            const index =
                this.dictIndex?.[length];

            let candidates;

            if (
                index &&
                normalizedPattern[0] !== '*'
            ) {
                candidates =
                    index[normalizedPattern[0]] || [];
            } else {
                candidates = this.dict[length];
            }

            const exclusions = this.loadExclusions(
                rowKey,
                length
            );

            const collectMatches = applyExclusions => {
                const results = [];

                outer:
                for (const word of candidates) {
                    for (
                        let position = 0;
                        position < length;
                        position += 1
                    ) {
                        const patternCharacter =
                            normalizedPattern[position];

                        if (
                            patternCharacter !== '*' &&
                            patternCharacter !==
                                word[position]
                        ) {
                            continue outer;
                        }

                        if (applyExclusions) {
                            const positionExclusions =
                                exclusions[position];

                            if (
                                positionExclusions?.has(
                                    word[position]
                                )
                            ) {
                                continue outer;
                            }
                        }
                    }

                    results.push(word);

                    if (
                        results.length >=
                        maximumSuggestions
                    ) {
                        break;
                    }
                }

                return results;
            };

            const strictResults =
                collectMatches(true);

            if (strictResults.length) {
                return strictResults;
            }

            /*
             * Torn virtualizes and reuses cracking rows.
             * Older listeners could attach rejected letters
             * to the next password rendered in the same node.
             *
             * If exclusions remove every possible match,
             * retry using the visible pattern alone.
             */
            const hasExclusions = exclusions.some(
                set => set && set.size > 0
            );

            return hasExclusions
                ? collectMatches(false)
                : strictResults;
        },

        prependPanelToRow(
            row,
            pattern,
            rowKey
        ) {
            let panel = row.querySelector(
                '.__crackhelp_panel'
            );

            if (!panel) {
                panel = document.createElement('div');

                panel.className =
                    '__crackhelp_panel';

                panel.dataset.rowkey = rowKey;
                panel.dataset.pattern = pattern;
                panel._seq = 0;

                panel.style.cssText =
                    'text-align:center; position:absolute; z-index:9999;';

                panel.style.border =
                    `1px solid ${this.getTheme().uiBorder}`;

                panel.style.borderRadius = '4px';

                const list =
                    document.createElement('div');

                list.style.cssText =
                    'margin-top:2px;';

                panel.appendChild(list);

                panel.updateSuggestions = () => {
                    const currentPattern =
                        panel.dataset.pattern || '';

                    const currentRowKey =
                        panel.dataset.rowkey;

                    this.applyPanelTheme(panel);

                    if (
                        !this.dictLoaded &&
                        this.dictLoading
                    ) {
                        if (
                            !list.firstChild ||
                            list.firstChild.textContent !==
                                '(loading dictionary…)'
                        ) {
                            list.innerHTML =
                                '<span style="padding:2px;color:#ff0;">(loading dictionary…)</span>';
                        }

                        return;
                    }

                    const suggestions =
                        this.suggest(
                            currentPattern,
                            currentRowKey
                        );

                    let index = 0;

                    for (
                        ;
                        index < suggestions.length;
                        index += 1
                    ) {
                        let span =
                            list.children[index];

                        if (!span) {
                            span =
                                document.createElement(
                                    'span'
                                );

                            span.dataset.kind = 'sug';
                            list.appendChild(span);
                        }

                        if (
                            span.textContent !==
                            suggestions[index]
                        ) {
                            span.textContent =
                                suggestions[index];
                        }

                        this.styleSugSpan(span);
                    }

                    while (
                        list.children.length >
                        suggestions.length
                    ) {
                        list.removeChild(
                            list.lastChild
                        );
                    }

                    if (
                        suggestions.length === 0
                    ) {
                        const text =
                            this.dictLoaded
                                ? '(no matches)'
                                : '(loading dictionary…)';

                        let span = list.firstChild;

                        if (!span) {
                            span =
                                document.createElement(
                                    'span'
                                );

                            span.dataset.kind = 'msg';
                            list.appendChild(span);
                        }

                        span.textContent = text;
                        span.style.padding = '2px 4px';
                        span.style.color =
                            this.dictLoaded
                                ? '#a00'
                                : '#ff0';

                        span.style.background =
                            'transparent';

                        span.style.fontSize =
                            `${this.getTheme().sugFontPx}px`;
                    }
                };

                row.prepend(panel);
                this.applyPanelTheme(panel);
            } else {
                if (
                    panel.dataset.rowkey !== rowKey
                ) {
                    const previousRowKey =
                        panel.dataset.rowkey;

                    if (
                        previousRowKey &&
                        this.panelUpdateTimers.has(
                            previousRowKey
                        )
                    ) {
                        clearTimeout(
                            this.panelUpdateTimers.get(
                                previousRowKey
                            )
                        );

                        this.panelUpdateTimers.delete(
                            previousRowKey
                        );
                    }

                    panel.dataset.rowkey = rowKey;

                    const list =
                        panel.querySelector(
                            ':scope > div'
                        );

                    if (list) {
                        list.replaceChildren();
                    }
                }

                panel.dataset.pattern = pattern;
                this.applyPanelTheme(panel);
            }

            this.schedulePanelUpdate(panel);
            return panel;
        },

        async isWordInLocalDict(word) {
            const length = word.length;

            if (!this.dict[length]) {
                const words = await this.idbGet(
                    `len_${length}`
                );

                if (!words) return false;
                this.dict[length] = words;
            }

            return this.dict[length].includes(word);
        },

        async addWordToLocalCache(word) {
            const length = word.length;

            if (
                length < this.MIN_LENGTH ||
                length > this.MAX_LENGTH
            ) {
                return;
            }

            let words = await this.idbGet(
                `len_${length}`
            );

            if (!words) {
                words = [];
            }

            if (!words.includes(word)) {
                words.push(word);

                await this.idbSet(
                    `len_${length}`,
                    words
                );

                if (!this.dict[length]) {
                    this.dict[length] = [];
                }

                if (
                    !this.dict[length].includes(word)
                ) {
                    this.dict[length].push(word);
                }

                this._buildIndex(length);

                this.crackLog(
                    'Added to local cache:',
                    word
                );
            }
        },

        getVirtualRowIdentity(crimeOption) {
            const identityAttributes = [
                'data-index',
                'data-row-index',
                'aria-rowindex',
                'data-key'
            ];

            let element = crimeOption;

            for (
                let depth = 0;
                element && depth < 6;
                depth += 1,
                element = element.parentElement
            ) {
                for (
                    const attribute of
                    identityAttributes
                ) {
                    const value =
                        element.getAttribute?.(
                            attribute
                        );

                    if (
                        value !== null &&
                        value !== ''
                    ) {
                        return `${attribute}:${value}`;
                    }
                }
            }

            return null;
        },

        hashRowIdentity(identity) {
            let hash = 2166136261;

            for (
                let index = 0;
                index < identity.length;
                index += 1
            ) {
                hash ^= identity.charCodeAt(index);
                hash = Math.imul(
                    hash,
                    16777619
                );
            }

            return (hash >>> 0).toString(36);
        },

        getRowKey(crimeOption) {
            const identity =
                this.getVirtualRowIdentity(
                    crimeOption
                );

            if (
                identity &&
                crimeOption.dataset.crackIdentity !==
                    identity
            ) {
                const previousRowKey =
                    crimeOption.dataset.crackKey;

                if (previousRowKey) {
                    this.prevRowStates.delete(
                        previousRowKey
                    );

                    if (
                        this.panelUpdateTimers.has(
                            previousRowKey
                        )
                    ) {
                        clearTimeout(
                            this.panelUpdateTimers.get(
                                previousRowKey
                            )
                        );

                        this.panelUpdateTimers.delete(
                            previousRowKey
                        );
                    }
                }

                crimeOption.dataset.crackIdentity =
                    identity;

                crimeOption.dataset.crackKey =
                    `row-${this.hashRowIdentity(identity)}`;
            }

            if (!crimeOption.dataset.crackKey) {
                crimeOption.dataset.crackKey =
                    String(Date.now()) +
                    '-' +
                    Math.floor(
                        Math.random() * 100000
                    );
            }

            return crimeOption.dataset.crackKey;
        },

        attachSlotSensors(crimeOption) {
            if (
                crimeOption.dataset.crackDelegated ===
                '1'
            ) {
                return;
            }

            crimeOption.dataset.crackDelegated = '1';

            const slotSelector =
                '[class^="charSlot"]:not([class*="charSlotDummy"])';

            const incorrectLineSelector =
                '[class*="incorrectGuessLine"]';

            const onVisualCue = event => {
                const rowKey =
                    this.getRowKey(crimeOption);

                const target = event.target;

                const slot =
                    target.closest?.(slotSelector);

                if (
                    !slot ||
                    !crimeOption.contains(slot)
                ) {
                    return;
                }

                const slots =
                    crimeOption.querySelectorAll(
                        slotSelector
                    );

                const position =
                    Array.prototype.indexOf.call(
                        slots,
                        slot
                    );

                if (position < 0) return;

                if (
                    getComputedStyle(slot)
                        .borderColor ===
                    'rgb(130, 201, 30)'
                ) {
                    return;
                }

                const now = performance.now();

                const shownCharacter =
                    String(
                        slot.textContent || ''
                    ).trim();

                if (
                    shownCharacter &&
                    /^[A-Za-z0-9._]$/.test(
                        shownCharacter
                    )
                ) {
                    return;
                }

                const previousState =
                    this.prevRowStates.get(rowKey) ||
                    null;

                const hasRowInput = Boolean(
                    previousState?.lastInput &&
                    now -
                        previousState.lastInput.time <=
                        1800 &&
                    previousState.lastInput.i ===
                        position
                );

                const isIncorrectLineEvent =
                    target.matches?.(
                        incorrectLineSelector
                    );

                const hasFreshGlobalInput =
                    now -
                        (this.LAST_INPUT.time || 0) <=
                    1800;

                let letter = null;

                if (hasRowInput) {
                    letter =
                        previousState.lastInput.letter;
                } else if (
                    isIncorrectLineEvent &&
                    hasFreshGlobalInput &&
                    this.LAST_INPUT.key
                ) {
                    letter =
                        this.LAST_INPUT.key.toUpperCase();
                } else {
                    return;
                }

                if (
                    !/^[A-Za-z0-9._]$/.test(letter)
                ) {
                    return;
                }

                const length = slots.length;

                this.addExclusion(
                    rowKey,
                    position,
                    letter,
                    length
                );

                const panel =
                    document.querySelector(
                        `.__crackhelp_panel[data-rowkey="${rowKey}"]`
                    );

                if (
                    panel?.updateSuggestions
                ) {
                    this.schedulePanelUpdate(panel);
                }
            };

            crimeOption.addEventListener(
                'animationstart',
                onVisualCue,
                true
            );

            crimeOption.addEventListener(
                'transitionend',
                onVisualCue,
                true
            );
        },

        scanCrimePage() {
            if (
                location.hash !== '#/cracking'
            ) {
                return;
            }

            const currentCrime =
                document.querySelector(
                    '[class^="currentCrime"]'
                );

            if (!currentCrime) return;

            const container =
                currentCrime.querySelector(
                    '[class^="virtualList"]'
                );

            if (!container) return;

            const crimeOptions =
                container.querySelectorAll(
                    '[class^="crimeOptionWrapper"]'
                );

            for (
                const crimeOption of crimeOptions
            ) {
                const rowKey =
                    this.getRowKey(crimeOption);

                this.attachSlotSensors(crimeOption);

                const characterSlots =
                    crimeOption.querySelectorAll(
                        '[class^="charSlot"]:not([class*="charSlotDummy"])'
                    );

                const currentCharacters = [];

                for (
                    const slot of characterSlots
                ) {
                    const character = String(
                        slot.textContent || ''
                    )
                        .trim()
                        .toUpperCase();

                    currentCharacters.push(
                        character || '*'
                    );
                }

                const pattern =
                    currentCharacters.join('');

                const now = performance.now();
                const length =
                    currentCharacters.length;

                const previousState =
                    this.prevRowStates.get(rowKey) || {
                        chars:
                            Array(length).fill('*')
                    };

                for (
                    let position = 0;
                    position < length;
                    position += 1
                ) {
                    const previousCharacter =
                        previousState.chars[position];

                    const currentCharacter =
                        currentCharacters[position];

                    if (
                        previousCharacter === '*' &&
                        currentCharacter !== '*'
                    ) {
                        previousState.lastInput = {
                            i: position,
                            letter: currentCharacter,
                            time: now
                        };
                    }

                    if (
                        previousCharacter !== '*' &&
                        currentCharacter === '*'
                    ) {
                        if (
                            previousState.lastInput &&
                            previousState.lastInput.i ===
                                position &&
                            previousState.lastInput
                                .letter ===
                                previousCharacter &&
                            now -
                                previousState.lastInput
                                    .time <=
                                1800
                        ) {
                            this.addExclusion(
                                rowKey,
                                position,
                                previousCharacter,
                                length
                            );
                        }
                    }
                }

                this.prevRowStates.set(rowKey, {
                    chars: currentCharacters,
                    lastInput:
                        previousState.lastInput,
                    time: now
                });

                if (!/[*]/.test(pattern)) {
                    const completedWord =
                        pattern.toUpperCase();

                    if (
                        /^[A-Z0-9_.]+$/.test(
                            completedWord
                        )
                    ) {
                        (async () => {
                            const exists =
                                await this.isWordInLocalDict(
                                    completedWord
                                );

                            if (!exists) {
                                await this.addWordToLocalCache(
                                    completedWord
                                );
                            }
                        })();
                    }
                }

                if (
                    !/^[*]+$/.test(pattern)
                ) {
                    this.prependPanelToRow(
                        crimeOption,
                        pattern,
                        rowKey
                    );
                }
            }
        }
    };

    window.SidekickModules =
        window.SidekickModules || {};

    window.SidekickModules.Cracking =
        CrackingModule;

    console.log(
        '✅ Sidekick Cracking Module loaded and ready'
    );
})();