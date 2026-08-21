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
                    const settings =
                        await window.SidekickModules.Core.ChromeStorage.get(
                            'sidekick_settings'
                        );

                    if (
                        settings &&
                        settings['crime-cracking']
                    ) {
                        return (
                            settings['crime-cracking'].isEnabled !== false
                        );
                    }
                }

                return false;
            } catch (error) {
                console.error(
                    'Error loading Cracking settings:',
                    error
                );
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
            this.LAST_INPUT = {
                key: null,
                time: 0
            };

            this.MIN_LENGTH = 4;
            this.MAX_LENGTH = 10;

            this.WORDLIST_URL =
                'https://gitlab.com/kalilinux/packages/seclists/-/raw/kali/master/Passwords/Common-Credentials/Pwdb_top-1000000.txt?ref_type=heads';

            this.DOWNLOAD_MIN_DELTA = 20;

            this.DB_NAME = 'crack';
            this.STORE_NAME = 'dictionary';
            this.EXCL_STORAGE_PREFIX = 'crack_excl_';

            this.debug = false;

            this._intervalId = setInterval(
                () => this.scanCrimePage(),
                50
            );

            this.keydownHandler = event => {
                if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.altKey
                ) {
                    return;
                }

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

            if (badge) {
                badge.remove();
            }

            const panels = document.querySelectorAll(
                '.__crackhelp_panel'
            );

            panels.forEach(panel => panel.remove());
        },

        setStatus(message) {
            if (
                this.debug &&
                message
            ) {
                console.log(
                    '[Crack] Status:',
                    message
                );
            }
        },

        crackLog(...args) {
            if (this.debug) {
                console.log(
                    '[Crack]',
                    ...args
                );
            }
        },

        injectHeaderBadge() {
            if (
                window.location.hash !== '#/cracking'
            ) {
                return;
            }

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
                const currentUrl =
                    window.location.href;

                if (currentUrl !== lastUrl) {
                    lastUrl = currentUrl;

                    const oldBadge =
                        document.getElementById(
                            'sidekick-cracking-badge'
                        );

                    if (oldBadge) {
                        oldBadge.remove();
                    }
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
                sugBg: 'rgba(30, 32, 36, 0.95)',
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
            span.style.fontSize =
                `${theme.sugFontPx}px`;
            span.style.color = theme.sugText;
            span.style.fontWeight = 'bold';
        },

        applyPanelTheme(panel) {
            const theme = this.getTheme();

            if (!panel) return;

            panel.style.background =
                theme.sugBg;
            panel.style.color =
                theme.sugText;
            panel.style.fontSize =
                `${theme.sugFontPx}px`;
            panel.style.textAlign =
                'center';
            panel.style.position =
                'absolute';
            panel.style.zIndex =
                '9999';

            const listDiv = panel.querySelector(
                ':scope > div'
            );

            if (!listDiv) return;

            for (
                const child of
                Array.from(listDiv.children)
            ) {
                if (
                    child.dataset &&
                    child.dataset.kind === 'sug'
                ) {
                    this.styleSugSpan(child);
                }
            }
        },

        gmRequest(opts) {
            return new Promise(
                (resolve, reject) => {
                    const timeout =
                        opts.timeout || 30000;

                    let finished = false;

                    const timeoutId =
                        setTimeout(() => {
                            if (finished) return;

                            finished = true;

                            reject(
                                new Error(
                                    'Dictionary request timed out'
                                )
                            );
                        }, timeout + 1000);

                    chrome.runtime.sendMessage(
                        {
                            action:
                                'proxyFetch',
                            url:
                                opts.url,
                            method:
                                opts.method ||
                                'GET',
                            headers:
                                opts.headers || {
                                    Accept:
                                        'text/plain, */*; q=0.1'
                                },
                            body:
                                opts.data ||
                                null,
                            responseType:
                                'text',
                            timeout
                        },
                        result => {
                            if (finished) return;

                            finished = true;
                            clearTimeout(
                                timeoutId
                            );

                            if (
                                chrome.runtime
                                    .lastError
                            ) {
                                reject(
                                    new Error(
                                        chrome.runtime
                                            .lastError
                                            .message
                                    )
                                );
                                return;
                            }

                            if (
                                !result?.success
                            ) {
                                reject(
                                    new Error(
                                        result?.error ||
                                        'Background dictionary request failed'
                                    )
                                );
                                return;
                            }

                            resolve({
                                status:
                                    result.status,
                                statusText:
                                    result.statusText ||
                                    '',
                                responseText:
                                    typeof result.data ===
                                        'string'
                                        ? result.data
                                        : '',
                                response: null,
                                responseHeaders:
                                    result.responseHeaders ||
                                    ''
                            });
                        }
                    );
                }
            );
        },

        isGzipPath(pathOrUrl) {
            try {
                const path = String(
                    pathOrUrl || ''
                );

                const cleanPath =
                    path.split('?')[0];

                return /\.gz$/i.test(
                    cleanPath
                );
            } catch (_) {
                return false;
            }
        },

        async gunzipArrayBufferToText(
            arrayBuffer
        ) {
            if (!arrayBuffer) return '';

            if (
                typeof DecompressionStream !==
                'function'
            ) {
                throw new Error(
                    'Your browser does not support DecompressionStream(gzip).'
                );
            }

            const decompressionStream =
                new DecompressionStream('gzip');

            const stream =
                new Blob([arrayBuffer])
                    .stream()
                    .pipeThrough(
                        decompressionStream
                    );

            return await new Response(
                stream
            ).text();
        },

        async responseToText(
            response,
            pathOrUrl
        ) {
            if (
                this.isGzipPath(pathOrUrl)
            ) {
                return await this.gunzipArrayBufferToText(
                    response.response
                );
            }

            return (
                response.responseText || ''
            );
        },

        openDB() {
            return new Promise(
                (resolve, reject) => {
                    const request =
                        indexedDB.open(
                            this.DB_NAME,
                            1
                        );

                    request.onupgradeneeded =
                        () => {
                            const database =
                                request.result;

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
                        resolve(
                            request.result
                        );

                    request.onerror = () =>
                        reject(
                            request.error
                        );
                }
            );
        },

        async idbSet(key, value) {
            const database =
                await this.openDB();

            return new Promise(
                (resolve, reject) => {
                    const transaction =
                        database.transaction(
                            this.STORE_NAME,
                            'readwrite'
                        );

                    transaction
                        .objectStore(
                            this.STORE_NAME
                        )
                        .put(value, key);

                    transaction.oncomplete =
                        resolve;

                    transaction.onerror =
                        () =>
                            reject(
                                transaction.error
                            );
                }
            );
        },

        async idbGet(key) {
            const database =
                await this.openDB();

            return new Promise(
                (resolve, reject) => {
                    const transaction =
                        database.transaction(
                            this.STORE_NAME,
                            'readonly'
                        );

                    const request =
                        transaction
                            .objectStore(
                                this.STORE_NAME
                            )
                            .get(key);

                    request.onsuccess =
                        () =>
                            resolve(
                                request.result
                            );

                    request.onerror =
                        () =>
                            reject(
                                request.error
                            );
                }
            );
        },

        captureKey(key) {
            if (!key) return;

            const match =
                String(key).match(
                    /^[A-Za-z0-9._]$/
                );

            if (!match) return;

            this.LAST_INPUT.key =
                key.toUpperCase();

            this.LAST_INPUT.time =
                performance.now();
        },

        async commitBucketsToIDB(
            buckets
        ) {
            for (
                const lengthString of
                Object.keys(buckets)
            ) {
                const length =
                    Number(lengthString);

                const newWords =
                    Array.from(
                        buckets[
                        lengthString
                        ]
                    );

                let existing =
                    await this.idbGet(
                        `len_${length}`
                    );

                if (!existing) {
                    existing = [];
                }

                const merged =
                    Array.from(
                        new Set([
                            ...existing,
                            ...newWords
                        ])
                    );

                await this.idbSet(
                    `len_${length}`,
                    merged
                );

                this.dict[length] =
                    merged;

                this._buildIndex(
                    length
                );
            }
        },

        _buildIndex(length) {
            if (!this.dictIndex) {
                this.dictIndex = [];
            }

            const index = {};

            for (
                const word of
                this.dict[length] || []
            ) {
                const character =
                    word[0];

                if (!index[character]) {
                    index[character] =
                        [];
                }

                index[character].push(
                    word
                );
            }

            this.dictIndex[length] =
                index;
        },

        async fetchAndIndex(
            url,
            onProgress
        ) {
            this.setStatus(
                'Downloading base wordlist…'
            );

            let response;

            try {
                response =
                    await this.gmRequest({
                        method: 'GET',
                        url,
                        timeout: 90000,
                        responseType: 'text'
                    });
            } catch (error) {
                throw error;
            }

            if (
                response.status < 200 ||
                response.status >= 300 ||
                !response.responseText
            ) {
                const error =
                    new Error(
                        `Bad response from base wordlist: ${response.status}`
                    );

                error.status =
                    response.status;

                throw error;
            }

            this.setStatus('Indexing…');

            const lines =
                (
                    response.responseText ||
                    ''
                ).split(/\r?\n/);

            const buckets = {};
            let processed = 0;

            for (const rawLine of lines) {
                processed += 1;

                const word =
                    (rawLine || '')
                        .trim()
                        .toUpperCase();

                if (!word) continue;

                if (
                    !/^[A-Z0-9_.]+$/.test(
                        word
                    )
                ) {
                    continue;
                }

                const length =
                    word.length;

                if (
                    length <
                    this.MIN_LENGTH ||
                    length >
                    this.MAX_LENGTH
                ) {
                    continue;
                }

                if (
                    !buckets[length]
                ) {
                    buckets[length] =
                        new Set();
                }

                buckets[length].add(
                    word
                );

                if (
                    processed % 5000 ===
                    0 &&
                    typeof onProgress ===
                    'function'
                ) {
                    onProgress({
                        phase:
                            '1M-index',
                        processed,
                        pct: null
                    });

                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                0
                            )
                    );
                }
            }

            await this.commitBucketsToIDB(
                buckets
            );

            this.setStatus(
                '1M cached'
            );

            return {
                totalProcessed:
                    processed
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
            this.setStatus(
                'Loading from cache…'
            );

            let hasData = false;
            this.dict = [];

            for (
                let length =
                    this.MIN_LENGTH;
                length <=
                this.MAX_LENGTH;
                length += 1
            ) {
                const words =
                    await this.idbGet(
                        `len_${length}`
                    );

                if (
                    words &&
                    words.length
                ) {
                    this.dict[length] =
                        words;
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
                    attempt <
                    maximumAttempts;
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

                        const wait =
                            delays[
                            Math.min(
                                attempt,
                                delays.length -
                                1
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
                            await new Promise(
                                resolve =>
                                    setTimeout(
                                        resolve,
                                        wait
                                    )
                            );
                        }
                    }
                }

                if (!succeeded) {
                    this.crackLog(
                        'Giving up on base download for now.',
                        lastError
                    );

                    this.dictLoading =
                        false;

                    this.dictLoaded =
                        false;

                    setTimeout(() => {
                        this.loadDict().catch(
                            () => { }
                        );
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
                let length =
                    this.MIN_LENGTH;
                length <=
                this.MAX_LENGTH;
                length += 1
            ) {
                if (
                    this.dict[length]
                ) {
                    this._buildIndex(
                        length
                    );
                }
            }

            this.setStatus('');
        },

        loadExclusions(rowKey, length) {
            const raw =
                sessionStorage.getItem(
                    this.EXCL_STORAGE_PREFIX +
                    rowKey +
                    '_' +
                    length
                );

            let saved = [];

            if (raw) {
                try {
                    saved =
                        JSON.parse(raw);
                } catch (_) {
                    saved = [];
                }
            }

            const exclusions =
                new Array(length);

            for (
                let position = 0;
                position < length;
                position += 1
            ) {
                const savedPosition =
                    Array.isArray(
                        saved[position]
                    )
                        ? saved[position]
                        : typeof saved[
                            position
                        ] === 'string'
                            ? saved[
                                position
                            ].split('')
                            : [];

                exclusions[position] =
                    new Set(
                        savedPosition
                            .map(character =>
                                String(
                                    character ||
                                    ''
                                ).toUpperCase()
                            )
                            .filter(Boolean)
                    );
            }

            return exclusions;
        },

        saveExclusions(
            rowKey,
            length,
            exclusions
        ) {
            const saved =
                new Array(length);

            for (
                let position = 0;
                position < length;
                position += 1
            ) {
                saved[position] =
                    Array.from(
                        exclusions[
                        position
                        ] || new Set()
                    );
            }

            sessionStorage.setItem(
                this.EXCL_STORAGE_PREFIX +
                rowKey +
                '_' +
                length,
                JSON.stringify(saved)
            );
        },

        schedulePanelUpdate(panel) {
            if (!panel) return;

            const rowKey =
                panel.dataset.rowkey;

            if (
                this.panelUpdateTimers.has(
                    rowKey
                )
            ) {
                clearTimeout(
                    this.panelUpdateTimers.get(
                        rowKey
                    )
                );
            }

            this.panelUpdateTimers.set(
                rowKey,
                setTimeout(() => {
                    panel.updateSuggestions();

                    this.panelUpdateTimers.delete(
                        rowKey
                    );
                }, 0)
            );
        },

        addExclusion(
            rowKey,
            position,
            letter,
            length
        ) {
            const normalizedLetter =
                String(letter || '')
                    .toUpperCase();

            if (!normalizedLetter) return;

            const exclusions =
                this.loadExclusions(
                    rowKey,
                    length
                );

            if (
                !exclusions[position]
            ) {
                exclusions[position] =
                    new Set();
            }

            const previousSize =
                exclusions[
                    position
                ].size;

            exclusions[position].add(
                normalizedLetter
            );

            if (
                exclusions[position]
                    .size !== previousSize
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

                this.schedulePanelUpdate(
                    panel
                );
            }
        },

        suggest(pattern, rowKey) {
            const length =
                pattern.length;

            if (
                length <
                this.MIN_LENGTH ||
                length >
                this.MAX_LENGTH
            ) {
                return [];
            }

            if (!this.dict[length]) {
                return [];
            }

            const maximumSuggestions = 5;

            const normalizedPattern =
                Array.from(
                    pattern.toUpperCase(),
                    character =>
                        /^[A-Z0-9.]$/.test(
                            character
                        )
                            ? character
                            : '*'
                ).join('');

            const index =
                this.dictIndex &&
                this.dictIndex[length];

            let candidates;

            if (
                index &&
                normalizedPattern[0] !==
                '*'
            ) {
                candidates =
                    index[
                    normalizedPattern[0]
                    ] || [];
            } else {
                candidates =
                    this.dict[length];
            }

            const exclusions =
                this.loadExclusions(
                    rowKey,
                    length
                );

            const collectMatches =
                applyExclusions => {
                    const matches = [];

                    outer:
                    for (
                        const word of
                        candidates
                    ) {
                        for (
                            let position = 0;
                            position <
                            length;
                            position += 1
                        ) {
                            const patternCharacter =
                                normalizedPattern[
                                position
                                ];

                            if (
                                patternCharacter !==
                                '*' &&
                                patternCharacter !==
                                word[position]
                            ) {
                                continue outer;
                            }

                            if (
                                applyExclusions
                            ) {
                                const rejected =
                                    exclusions[
                                    position
                                    ];

                                if (
                                    rejected &&
                                    rejected.has(
                                        word[
                                        position
                                        ]
                                    )
                                ) {
                                    continue outer;
                                }
                            }
                        }

                        matches.push(word);

                        if (
                            matches.length >=
                            maximumSuggestions
                        ) {
                            break;
                        }
                    }

                    return matches;
                };

            const strictMatches =
                collectMatches(true);

            if (strictMatches.length) {
                return strictMatches;
            }

            return collectMatches(false);
        },

        prependPanelToRow(
            row,
            pattern,
            rowKey
        ) {
            let panel =
                row.querySelector(
                    '.__crackhelp_panel'
                );

            if (!panel) {
                panel =
                    document.createElement(
                        'div'
                    );

                panel.className =
                    '__crackhelp_panel';

                panel.dataset.rowkey =
                    rowKey;

                panel.dataset.pattern =
                    pattern;

                panel._seq = 0;

                panel.style.cssText =
                    'text-align:center; position:absolute; z-index:9999;';

                panel.style.border =
                    `1px solid ${this.getTheme().uiBorder}`;

                panel.style.borderRadius =
                    '4px';

                const listDiv =
                    document.createElement(
                        'div'
                    );

                listDiv.style.cssText =
                    'margin-top:2px;';

                panel.appendChild(
                    listDiv
                );

                panel.updateSuggestions =
                    () => {
                        const currentPattern =
                            panel.dataset
                                .pattern || '';

                        const currentRowKey =
                            panel.dataset
                                .rowkey;

                        this.applyPanelTheme(
                            panel
                        );

                        if (
                            !this.dictLoaded &&
                            this.dictLoading
                        ) {
                            if (
                                !listDiv.firstChild ||
                                listDiv
                                    .firstChild
                                    .textContent !==
                                '(loading dictionary…)'
                            ) {
                                listDiv.innerHTML =
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
                            index <
                            suggestions.length;
                            index += 1
                        ) {
                            let span =
                                listDiv
                                    .children[
                                index
                                ];

                            if (!span) {
                                span =
                                    document.createElement(
                                        'span'
                                    );

                                span.dataset.kind =
                                    'sug';

                                listDiv.appendChild(
                                    span
                                );
                            }

                            if (
                                span.textContent !==
                                suggestions[
                                index
                                ]
                            ) {
                                span.textContent =
                                    suggestions[
                                    index
                                    ];
                            }

                            this.styleSugSpan(
                                span
                            );
                        }

                        while (
                            listDiv.children
                                .length >
                            suggestions.length
                        ) {
                            listDiv.removeChild(
                                listDiv.lastChild
                            );
                        }

                        if (
                            suggestions.length ===
                            0
                        ) {
                            if (
                                !listDiv.firstChild
                            ) {
                                const span =
                                    document.createElement(
                                        'span'
                                    );

                                span.dataset.kind =
                                    'msg';

                                span.textContent =
                                    this.dictLoaded
                                        ? '(no matches)'
                                        : '(loading dictionary…)';

                                span.style.padding =
                                    '2px 4px';

                                span.style.color =
                                    this.dictLoaded
                                        ? '#a00'
                                        : '#ff0';

                                span.style.background =
                                    'transparent';

                                span.style.fontSize =
                                    `${this.getTheme().sugFontPx}px`;

                                listDiv.appendChild(
                                    span
                                );
                            } else {
                                const span =
                                    listDiv.firstChild;

                                const message =
                                    this.dictLoaded
                                        ? '(no matches)'
                                        : '(loading dictionary…)';

                                if (
                                    span.textContent !==
                                    message
                                ) {
                                    span.textContent =
                                        message;
                                }

                                span.style.color =
                                    this.dictLoaded
                                        ? '#a00'
                                        : '#ff0';

                                span.style.background =
                                    'transparent';

                                span.style.fontSize =
                                    `${this.getTheme().sugFontPx}px`;
                            }
                        }
                    };

                row.prepend(panel);
                this.applyPanelTheme(panel);
            } else {
                panel.dataset.pattern =
                    pattern;

                this.applyPanelTheme(panel);
            }

            this.schedulePanelUpdate(panel);

            return panel;
        },

        async isWordInLocalDict(word) {
            const length =
                word.length;

            if (!this.dict[length]) {
                const words =
                    await this.idbGet(
                        `len_${length}`
                    );

                if (!words) return false;

                this.dict[length] =
                    words;
            }

            return this.dict[
                length
            ].includes(word);
        },

        async addWordToLocalCache(
            word
        ) {
            const length =
                word.length;

            if (
                length <
                this.MIN_LENGTH ||
                length >
                this.MAX_LENGTH
            ) {
                return;
            }

            let words =
                await this.idbGet(
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

                if (
                    !this.dict[length]
                ) {
                    this.dict[length] =
                        [];
                }

                if (
                    !this.dict[
                        length
                    ].includes(word)
                ) {
                    this.dict[
                        length
                    ].push(word);
                }

                this._buildIndex(length);

                this.crackLog(
                    'Added to local cache:',
                    word
                );
            }
        },

        getRowKey(crimeOption) {
            if (
                !crimeOption.dataset
                    .crackKey
            ) {
                crimeOption.dataset
                    .crackKey =
                    String(Date.now()) +
                    '-' +
                    Math.floor(
                        Math.random() *
                        100000
                    );
            }

            return crimeOption.dataset
                .crackKey;
        },

        attachSlotSensors(
            crimeOption,
            rowKey
        ) {
            if (
                crimeOption.dataset
                    .crackDelegated === '1'
            ) {
                return;
            }

            crimeOption.dataset
                .crackDelegated = '1';

            const slotSelector =
                '[class^="charSlot"]:not([class*="charSlotDummy"])';

            const incorrectLineSelector =
                '[class*="incorrectGuessLine"]';

            const onVisualCue = event => {
                const target =
                    event.target;

                const slot =
                    target.closest &&
                    target.closest(
                        slotSelector
                    );

                if (
                    !slot ||
                    !crimeOption.contains(
                        slot
                    )
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
                    getComputedStyle(
                        slot
                    ).borderColor ===
                    'rgb(130, 201, 30)'
                ) {
                    return;
                }

                const now =
                    performance.now();

                const shown =
                    (
                        slot.textContent ||
                        ''
                    ).trim();

                if (
                    shown &&
                    /^[A-Za-z0-9._]$/.test(
                        shown
                    )
                ) {
                    return;
                }

                const previous =
                    this.prevRowStates.get(
                        rowKey
                    ) || null;

                const hasRowLastInput =
                    Boolean(
                        previous &&
                        previous.lastInput &&
                        now -
                        previous
                            .lastInput
                            .time <=
                        1800 &&
                        previous.lastInput
                            .i === position
                    );

                const isIncorrectEvent =
                    target.matches &&
                    target.matches(
                        incorrectLineSelector
                    );

                const freshGlobalInput =
                    now -
                    (
                        this.LAST_INPUT
                            .time || 0
                    ) <=
                    1800;

                let letter = null;

                if (hasRowLastInput) {
                    letter =
                        previous.lastInput
                            .letter;
                } else if (
                    isIncorrectEvent &&
                    freshGlobalInput &&
                    this.LAST_INPUT.key
                ) {
                    letter =
                        this.LAST_INPUT.key
                            .toUpperCase();
                } else {
                    return;
                }

                if (
                    !/^[A-Za-z0-9._]$/.test(
                        letter
                    )
                ) {
                    return;
                }

                const length =
                    slots.length;

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
                    panel &&
                    panel.updateSuggestions
                ) {
                    this.schedulePanelUpdate(
                        panel
                    );
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
                location.hash !==
                '#/cracking'
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
                const crimeOption of
                crimeOptions
            ) {
                const rowKey =
                    this.getRowKey(
                        crimeOption
                    );

                this.attachSlotSensors(
                    crimeOption,
                    rowKey
                );

                const characterSlots =
                    crimeOption.querySelectorAll(
                        '[class^="charSlot"]:not([class*="charSlotDummy"])'
                    );

                const currentCharacters =
                    [];

                for (
                    const characterSlot of
                    characterSlots
                ) {
                    const rawCharacter =
                        (
                            characterSlot
                                .textContent ||
                            ''
                        )
                            .trim()
                            .toUpperCase();

                    const revealedCharacter =
                        /^[A-Z0-9.]$/.test(
                            rawCharacter
                        )
                            ? rawCharacter
                            : '*';

                    currentCharacters.push(
                        revealedCharacter
                    );
                }

                const pattern =
                    currentCharacters.join(
                        ''
                    );

                const now =
                    performance.now();

                const length =
                    currentCharacters.length;

                const previous =
                    this.prevRowStates.get(
                        rowKey
                    ) || {
                        chars:
                            Array(
                                length
                            ).fill('*')
                    };

                for (
                    let position = 0;
                    position < length;
                    position += 1
                ) {
                    const oldCharacter =
                        previous.chars[
                        position
                        ];

                    const newCharacter =
                        currentCharacters[
                        position
                        ];

                    if (
                        oldCharacter ===
                        '*' &&
                        newCharacter !==
                        '*'
                    ) {
                        previous.lastInput = {
                            i: position,
                            letter:
                                newCharacter,
                            time: now
                        };
                    }

                    if (
                        oldCharacter !==
                        '*' &&
                        newCharacter ===
                        '*'
                    ) {
                        if (
                            previous.lastInput &&
                            previous
                                .lastInput
                                .i ===
                            position &&
                            previous
                                .lastInput
                                .letter ===
                            oldCharacter &&
                            now -
                            previous
                                .lastInput
                                .time <=
                            1800
                        ) {
                            this.addExclusion(
                                rowKey,
                                position,
                                oldCharacter,
                                length
                            );
                        }
                    }
                }

                this.prevRowStates.set(
                    rowKey,
                    {
                        chars:
                            currentCharacters,
                        lastInput:
                            previous.lastInput,
                        time: now
                    }
                );

                if (
                    !/[*]/.test(
                        pattern
                    )
                ) {
                    const newWord =
                        pattern.toUpperCase();

                    if (
                        /^[A-Z0-9_.]+$/.test(
                            newWord
                        )
                    ) {
                        (async () => {
                            const exists =
                                await this.isWordInLocalDict(
                                    newWord
                                );

                            if (!exists) {
                                await this.addWordToLocalCache(
                                    newWord
                                );
                            }
                        })();
                    }
                }

                if (
                    !/^[*]+$/.test(
                        pattern
                    )
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