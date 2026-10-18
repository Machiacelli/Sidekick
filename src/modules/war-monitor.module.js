// War Monitor Module - Enhanced War Page Features
// Shows hospital timers, travel status, and auto-sorts enemies
const WarMonitorModule = {
    isEnabled: false,
    isInitialized: false,
    STORAGE_KEY: 'sidekick_war_monitor',
    apiKey: null,

    running: true,
    foundWar: false,
    pageVisible: !document.hidden,

    // ── Tracked lifecycle handles (cleared in disable(); prevents the
    //    interval/observer stacking flagged in audit item 6) ────────────
    apiIntervalId: null,
    renderIntervalId: null,
    visibilityListener: null,
    bodyObserver: null,
    memberListObserver: null,
    probeTimers: [],
    attackClickListener: null,

    // Sub-option (own checkbox in Settings → War): open war-page attack
    // buttons in a new tab instead of navigating the current one.
    openAttackInNewTab: false,

    memberStatus: new Map(),
    memberLis: new Map(),
    descriptionCache: new Map(),

    lastRequest: null,
    MIN_TIME_SINCE_LAST_REQUEST: 5000,
    TIME_BETWEEN_FRAMES: 500,

    // Initialize module
    async init() {
        // Idempotency guard (same pattern as the other changed modules —
        // a repeated init would stack another storage.onChanged listener).
        if (this.isInitialized) {
            console.log('⚔️ War Monitor already initialized');
            return;
        }
        this.isInitialized = true;

        console.log('⚔️ War Monitor initializing...');

        await this.loadSettings();

        if (this.isEnabled) {
            this.enable();
        }

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && (changes[this.STORAGE_KEY] || changes['sidekick_war_monitor'])) {
                this.loadSettings().then(() => {
                    if (this.isEnabled) this.enable();
                    else this.disable();
                });
            }
        });

        console.log('⚔️ War Monitor initialized');
    },

    // Load settings from storage
    async loadSettings() {
        try {
            const settings = await window.SidekickModules.Core.ChromeStorage.get(this.STORAGE_KEY) || {};
            this.isEnabled = settings.isEnabled === true;
            this.openAttackInNewTab = settings.openAttackInNewTab === true;
            this.apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key') || '';
        } catch (error) {
            console.error('⚔️ Failed to load settings:', error);
        }
    },

    // Save settings to storage
    async saveSettings() {
        try {
            await window.SidekickModules.Core.ChromeStorage.set(this.STORAGE_KEY, {
                isEnabled: this.isEnabled,
                openAttackInNewTab: this.openAttackInNewTab
            });
        } catch (error) {
            console.error('⚔️ Failed to save settings:', error);
        }
    },

    // Enable module
    enable() {
        this.isEnabled = true;
        this.running = true;
        this.saveSettings();
        this.inject();
        console.log('⚔️ War Monitor enabled');
    },

    // Disable module
    disable() {
        this.isEnabled = false;
        this.running = false;
        this.saveSettings();
        this.teardown();
        console.log('⚔️ War Monitor disabled');
    },

    /**
     * Full teardown of everything inject()/setupObservers() created.
     * Without this, every toggle on a factions page stacked another
     * API/render loop pair (audit item 6), and injected CSS kept statuses
     * transparent with frozen overlay text after disabling.
     */
    teardown() {
        if (this.apiIntervalId) {
            clearInterval(this.apiIntervalId);
            this.apiIntervalId = null;
        }
        if (this.renderIntervalId) {
            clearInterval(this.renderIntervalId);
            this.renderIntervalId = null;
        }
        if (this.visibilityListener) {
            document.removeEventListener('visibilitychange', this.visibilityListener);
            this.visibilityListener = null;
        }
        if (this.attackClickListener) {
            document.removeEventListener('click', this.attackClickListener, true);
            this.attackClickListener = null;
        }
        if (this.bodyObserver) {
            this.bodyObserver.disconnect();
            this.bodyObserver = null;
        }
        if (this.memberListObserver) {
            this.memberListObserver.disconnect();
            this.memberListObserver = null;
        }
        this.probeTimers.forEach(t => clearTimeout(t));
        this.probeTimers.forEach(t => clearInterval(t));
        this.probeTimers = [];

        // Remove the injected stylesheet + reset row state. The CSS made
        // .status text transparent (replaced by ::after overlays) — leaving it
        // behind froze "statuses stuck transparent with frozen overlay text".
        document.getElementById('war-monitor-styles')?.remove();
        this.memberLis.clear();
        this.memberStatus.clear();
        this.descriptionCache.clear();
        this.foundWar = false;
    },

    // Inject CSS styles
    injectStyles() {
        if (document.getElementById('war-monitor-styles')) return;

        const style = document.createElement('style');
        style.id = 'war-monitor-styles';
        style.textContent = `
/* Red: targets out of country (traveling / abroad / hospitalized abroad) */
.members-list li:has(div.status.traveling),
.members-list li:has(div.status.abroad),
.members-list li:has(div.status[data-twse-traveling="true"]),
.members-list li[data-location]:not([data-location=""]) {
  background-color: #EB9999 !important;
}
/* Orange: hospital/jail out in 5-10 minutes (beats red) */
.members-list li:has(div.status[data-twse-mid="true"]) {
  background-color: #C4974C !important;
}
/* Green: hospital/jail out in under 5 minutes (highest priority) */
.members-list li:has(div.status[data-twse-highlight="true"]) {
  background-color: #99EB99 !important;
}
.members-list div.status[data-twse-traveling="true"]::after {
  color: #696026 !important;
}

:root .dark-mode .members-list li:has(div.status.traveling),
:root .dark-mode .members-list li:has(div.status.abroad),
:root .dark-mode .members-list li:has(div.status[data-twse-traveling="true"]),
:root .dark-mode .members-list li[data-location]:not([data-location=""]) {
  background-color: #7A4444 !important;
}
:root .dark-mode .members-list li:has(div.status[data-twse-mid="true"]) {
  background-color: #795315 !important;
}
:root .dark-mode .members-list li:has(div.status[data-twse-highlight="true"]) {
  background-color: #446944 !important;
}
:root .dark-mode .members-list div.status[data-twse-traveling="true"]::after {
  color: #FFED76 !important;
}

.members-list div.status {
  position: relative !important;
  color: transparent !important;
}
.members-list div.status::after {
  content: var(--twse-content);
  position: absolute;
  top: 0;
  left: 0;
  width: calc(100% - 10px);
  height: 100%;
  background: inherit;
  display: flex;
  right: 10px;
  justify-content: flex-end;
  align-items: center;
}
.members-list .ok.status::after {
    color: var(--user-status-green-color);
}

.members-list .not-ok.status::after {
    color: var(--user-status-red-color);
}

.members-list .abroad.status::after, .members-list .traveling.status::after {
    color: var(--user-status-blue-color);
}
        `;
        document.head.appendChild(style);
    },

    async inject() {
        if (!window.location.href.includes('factions.php')) {
            console.log('⚔️ Not on factions page, skipping');
            return;
        }

        this.injectStyles();

        // Re-arm safety: enable() can be called repeatedly (storage listener,
        // manual toggles). Don't stack another listener per cycle.
        if (!this.visibilityListener) {
            this.visibilityListener = () => {
                this.pageVisible = !document.hidden;
            };
            document.addEventListener('visibilitychange', this.visibilityListener);
        }

        // Open-attacks-in-new-tab interception (Settings → War sub-option).
        // One delegated CAPTURE listener on document: fires before Torn's own
        // handlers no matter how React re-renders the rows, so it keeps
        // working without any per-row bookkeeping. openAttackInNewTab is
        // read at click time, so the settings checkbox toggles it live.
        if (!this.attackClickListener) {
            this.attackClickListener = (e) => {
                if (!this.running || !this.openAttackInNewTab) return;
                // Let native modifiers through — ctrl/cmd-click already opens
                // a new tab on its own. Only intercept the plain left click.
                if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
                if (!(e.target instanceof Element)) return;
                const link = e.target.closest("a[href*='sid=attack']");
                if (!link) return;
                // War member rows only — not every factions.php link.
                if (!link.closest('li.enemy') && !link.closest('.enemy-faction')) return;
                e.preventDefault();
                e.stopPropagation();
                const win = window.open(link.href, '_blank', 'noopener');
                // Popup blocked — degrade to today's same-window navigation
                // instead of eating the click silently.
                if (!win) window.location.href = link.href;
            };
            document.addEventListener('click', this.attackClickListener, true);
        }

        // Start update intervals — they guard on this.foundWar internally.
        // Stored so teardown()/disable() can actually clear them (the old
        // untracked intervals stacked a fresh API/render pair per toggle —
        // audit item 6).
        if (!this.apiIntervalId) {
            this.apiIntervalId = setInterval(() => {
                if (!this.running || !this.foundWar) return;
                this.updateStatuses();
            }, this.MIN_TIME_SINCE_LAST_REQUEST);
        }
        if (!this.renderIntervalId) {
            this.renderIntervalId = setInterval(() => {
                if (!this.foundWar || !this.running || !this.pageVisible) return;
                this.watch();
            }, this.TIME_BETWEEN_FRAMES);
        }

        this.setupObservers();

        console.log('⚔️ War Monitor injected');
    },

    setupObservers() {
        // Phase 1: find any war container element → set foundWar
        const tryInit = () => {
            if (this.foundWar) return;

            // War-container candidates ONLY. The old probe also matched the
            // plain (non-war) faction member list — `ul.members-list` exists on
            // every factions.php view — which started the 5s API polling loop
            // on pages with no war at all (audit item 6).
            const hasWarEl = document.querySelector(
                'li.enemy, li.your, .faction-war, .f-war-list, ' +
                '[class*="war-list"], [class*="factionWar"], [class*="war-new"], #faction_war_list_id'
            );
            if (!hasWarEl) return;

            console.log('[WarMonitor] Found war container:', hasWarEl.className || hasWarEl.tagName);
            this.foundWar = true;

            // Phase 2: keep trying to extract member rows — React renders them
            // asynchronously AFTER the container, so we poll until we have some
            let memberAttempts = 0;
            const memberPoll = setInterval(() => {
                memberAttempts++;
                this.extractAllMemberLis();
                if (this.memberLis.size > 0 || memberAttempts >= 30) {
                    clearInterval(memberPoll);
                    const idx = this.probeTimers.indexOf(memberPoll);
                    if (idx > -1) this.probeTimers.splice(idx, 1);
                    if (this.memberLis.size > 0) {
                        console.log(`[WarMonitor] Extracted ${this.memberLis.size} member rows after ${memberAttempts} attempt(s)`);
                        this.updateStatuses();
                    } else {
                        // A generic war container can exist on pages without a
                        // rendered member list. This is expected, not an error.
                        console.debug('[WarMonitor] No member rows available on this view');
                    }
                }
            }, 300);
            this.probeTimers.push(memberPoll);
        };

        // MutationObserver catches React renders immediately (tracked so
        // teardown() can disconnect it)
        if (this.bodyObserver) this.bodyObserver.disconnect();
        this.bodyObserver = new MutationObserver(() => tryInit());
        this.bodyObserver.observe(document.body, { subtree: true, childList: true });

        // Bounded probe: 40 × 500ms = 20s of fast polling, then a BOUNDED
        // slow fallback (5 min) instead of polling for tab life. The old
        // slowPoll never stopped when no war container appeared (audit
        // item 6) — a factions page visit without a war left a 2s timer
        // running until the tab closed.
        let fastAttempts = 0;
        const fastPoll = setInterval(() => {
            fastAttempts++;
            tryInit();
            if (fastAttempts >= 40 || this.foundWar) {
                clearInterval(fastPoll);
                const idx = this.probeTimers.indexOf(fastPoll);
                if (idx > -1) this.probeTimers.splice(idx, 1);
                if (!this.foundWar) {
                    let slowAttempts = 0;
                    const SLOW_MAX = 150; // 150 × 2s = 5 minutes, then give up
                    const slowPoll = setInterval(() => {
                        slowAttempts++;
                        tryInit();
                        if (this.foundWar || slowAttempts >= SLOW_MAX) {
                            clearInterval(slowPoll);
                            const i = this.probeTimers.indexOf(slowPoll);
                            if (i > -1) this.probeTimers.splice(i, 1);
                            if (!this.foundWar) {
                                console.debug('[WarMonitor] No war container appeared — probe stopped');
                            }
                        }
                    }, 2000);
                    this.probeTimers.push(slowPoll);
                }
            }
        }, 500);
        this.probeTimers.push(fastPoll);

        // Try immediately after a short delay
        const early = setTimeout(() => tryInit(), 150);
        this.probeTimers.push(early);

        // After members are found, observe the member list for re-renders
        // (tracked + bounded: the old recheck interval ran for tab life when
        // no member list ever appeared)
        if (this.memberListObserver) this.memberListObserver.disconnect();
        this.memberListObserver = new MutationObserver(() => {
            if (this.foundWar) this.extractAllMemberLis();
        });
        let recheckAttempts = 0;
        const recheckMemberObserver = setInterval(() => {
            recheckAttempts++;
            const memberLists = document.querySelectorAll('ul.members-list');
            if (memberLists.length > 0) {
                memberLists.forEach(ul => this.memberListObserver.observe(ul, { childList: true }));
                clearInterval(recheckMemberObserver);
                const idx = this.probeTimers.indexOf(recheckMemberObserver);
                if (idx > -1) this.probeTimers.splice(idx, 1);
            } else if (recheckAttempts >= 120) { // 2 minutes max
                clearInterval(recheckMemberObserver);
                const idx = this.probeTimers.indexOf(recheckMemberObserver);
                if (idx > -1) this.probeTimers.splice(idx, 1);
            }
        }, 1000);
        this.probeTimers.push(recheckMemberObserver);
    },

    extractAllMemberLis() {
        this.memberLis.clear();
        const uls = document.querySelectorAll('ul.members-list');
        uls.forEach(ul => this.extractMemberLis(ul));
    },

    extractMemberLis(ul) {
        const lis = ul.querySelectorAll('li.enemy, li.your');
        lis.forEach(li => {
            const atag = li.querySelector(`a[href^='/profiles.php']`);
            if (!atag) return;
            const id = atag.href.split('ID=')[1];
            this.memberLis.set(id, {
                li: li,
                div: li.querySelector('div.status')
            });
        });
    },

    async updateStatuses() {
        if (!this.running) return;

        const factionIds = this.getFactionIds();
        if (factionIds.length === 0) return;

        if (this.lastRequest && new Date() - this.lastRequest < this.MIN_TIME_SINCE_LAST_REQUEST) {
            return;
        }

        this.lastRequest = new Date();
        for (const id of factionIds) {
            await this.updateStatus(id);
        }
    },

    getFactionIds() {
        const uls = document.querySelectorAll('ul.members-list');
        const ids = [];
        uls.forEach(ul => {
            const a = ul.querySelector(`a[href^='/factions.php']`);
            if (a) {
                const split = a.href.split('ID=');
                if (split.length > 1) ids.push(split[1]);
            }
        });
        return ids;
    },

    async updateStatus(factionId) {
        try {
            // Background proxy (audit item 9): the key must not sit in a
            // page-visible URL / DevTools network log.
            const res = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'proxyFetch',
                    url: `https://api.torn.com/faction/${factionId}?selections=basic&comment=SidekickWarMonitor&key=${encodeURIComponent(this.apiKey)}`,
                }, (r) => resolve(r));
            });
            if (!res?.success) {
                console.warn('⚔️ Faction data fetch failed:', res?.error);
                return;
            }
            const data = res.data;
            if (data.error || !data.members) return;

            const reqTime = Date.now();
            for (const [id, member] of Object.entries(data.members)) {
                const status = member.status;
                status.last_req_time = reqTime;

                // Cache description
                let cached = this.descriptionCache.get(status.description);
                if (!cached) {
                    cached = status.description
                        .replace('South Africa', 'SA')
                        .replace('Cayman Islands', 'CI')
                        .replace('United Kingdom', 'UK')
                        .replace('Argentina', 'Arg')
                        .replace('Switzerland', 'Switz');
                    this.descriptionCache.set(status.description, cached);
                }
                status.description = cached;

                const prev = this.memberStatus.get(id);
                if (prev?.state === status.state) {
                    status.since = prev.since;
                } else {
                    status.since = Date.now();
                }

                this.memberStatus.set(id, status);
            }
        } catch (err) {
            console.error('⚔️ Failed to fetch faction data:', err);
        }
    },

    watch() {
        const deferredWrites = [];
        let dirtySort = false;

        this.memberLis.forEach((elem, id) => {
            const li = elem.li;
            const statusDiv = elem.div;
            if (!li || !statusDiv) return;

            const status = this.memberStatus.get(id);
            if (!status || !this.running) {
                statusDiv.style.setProperty('--twse-content', `"${statusDiv.textContent}"`);
                return;
            }

            // Queue changes
            dirtySort = this.queueUntil(deferredWrites, li, status.until, dirtySort);
            dirtySort = this.queueSince(deferredWrites, li, status.since, dirtySort);

            let dataLocation = '';

            switch (status.state) {
                case 'Hospital':
                case 'Jail':
                    this.handleHospitalStatus(statusDiv, status, li, deferredWrites);
                    dirtySort = this.queueSort(deferredWrites, li, 2, dirtySort);
                    break;
                case 'Traveling':
                case 'Abroad':
                    dataLocation = this.handleTravelStatus(statusDiv, status, li, deferredWrites);
                    break;
                default:
                    statusDiv.style.setProperty('--twse-content', `"${statusDiv.textContent}"`);
                    dirtySort = this.queueSort(deferredWrites, li, 1, dirtySort);
                    deferredWrites.push([statusDiv, 'data-twse-traveling', 'false']);
                    deferredWrites.push([statusDiv, 'data-twse-highlight', 'false']);
                    deferredWrites.push([statusDiv, 'data-twse-mid', 'false']);
                    break;
            }

            if (li.getAttribute('data-location') !== dataLocation) {
                deferredWrites.push([li, 'data-location', dataLocation]);
                dirtySort = true;
            }
        });

        // Apply all changes
        for (const [elem, attr, val] of deferredWrites) {
            elem.setAttribute(attr, val);
        }

        // Always attempt the sort — React rebuilds/reorders this list under us,
        // and that changes nothing we track, so waiting for `dirtySort` left
        // the list in Torn's order until the next status refresh. sortMembers
        // is idempotent and skips the DOM write when order is already right.
        this.sortMembers();

        // Cleanup disconnected elements
        for (const [id, ref] of this.memberLis) {
            if (!ref.li.isConnected) {
                this.memberLis.delete(id);
            }
        }

        // Aggregate enemy locations for Travel Blocker
        this.aggregateAndSaveLocations();
    },

    aggregateAndSaveLocations() {
        const locations = {};
        const getCountry = (desc) => {
            if (desc.includes('SA') || desc.includes('South Africa')) return 'South Africa';
            if (desc.includes('CI') || desc.includes('Cayman')) return 'Cayman Islands';
            if (desc.includes('UAE') || desc.includes('Emirati')) return 'UAE';
            if (desc.includes('China') || desc.includes('Chinese')) return 'China';
            if (desc.includes('Japan') || desc.includes('Japanese')) return 'Japan';
            if (desc.includes('Hawaii') || desc.includes('Hawaiian')) return 'Hawaii';
            if (desc.includes('Mexico') || desc.includes('Mexican')) return 'Mexico';
            if (desc.includes('Canada') || desc.includes('Canadian')) return 'Canada';
            if (desc.includes('Switz') || desc.includes('Swiss')) return 'Switzerland';
            if (desc.includes('UK') || desc.includes('British') || desc.includes('United Kingdom')) return 'United Kingdom';
            if (desc.includes('Arg') || desc.includes('Argentin')) return 'Argentina';
            return null;
        };

        for (const status of this.memberStatus.values()) {
            const country = getCountry(status.description);
            if (!country) continue;

            if (!locations[country]) locations[country] = { going: 0, there: 0, returning: 0 };

            if (status.state === 'Traveling') {
                if (status.description.includes('Returning')) {
                    locations[country].returning++;
                } else if (status.description.includes('Traveling to')) {
                    locations[country].going++;
                }
            } else if (status.state === 'Abroad' || status.state === 'Hospital' || status.state === 'Jail') {
                locations[country].there++;
            }
        }

        try {
            chrome.storage.local.set({ sidekick_enemy_locations: locations });
        } catch (e) {
            console.warn('[WarMonitor] Failed to save enemy locations:', e);
        }
    },

    handleHospitalStatus(statusDiv, status, li, writes) {
        const now = Date.now() / 1000;
        const remaining = Math.round(status.until - now);

        if (!(statusDiv.classList.contains('hospital') || statusDiv.classList.contains('jail'))) {
            statusDiv.style.setProperty('--twse-content', `"${statusDiv.textContent}"`);
            return;
        }

        if (status.description.includes('In a')) {
            writes.push([statusDiv, 'data-twse-traveling', 'true']);
        }

        if (remaining <= 0) {
            writes.push([statusDiv, 'data-twse-highlight', 'false']);
            writes.push([statusDiv, 'data-twse-mid', 'false']);
            return;
        }

        const s = Math.floor(remaining % 60);
        const m = Math.floor((remaining / 60) % 60);
        const h = Math.floor(remaining / 60 / 60);
        const timeStr = `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}`;

        statusDiv.style.setProperty('--twse-content', `"${timeStr}"`);
        writes.push([statusDiv, 'data-twse-highlight', remaining < 300 ? 'true' : 'false']);
        writes.push([statusDiv, 'data-twse-mid', (remaining >= 300 && remaining < 600) ? 'true' : 'false']);
    },

    handleTravelStatus(statusDiv, status, li, writes) {
        if (!(statusDiv.classList.contains('traveling') || statusDiv.classList.contains('abroad'))) {
            statusDiv.style.setProperty('--twse-content', `"${statusDiv.textContent}"`);
            return '';
        }

        let content = '';
        let sortLevel = 6;

        if (status.description.includes('Traveling to ')) {
            sortLevel = 5;
            content = '► ' + status.description.split('Traveling to ')[1];
        } else if (status.description.includes('In ')) {
            sortLevel = 4;
            content = status.description.split('In ')[1];
        } else if (status.description.includes('Returning')) {
            sortLevel = 3;
            content = '◄ ' + status.description.split('Returning to Torn from ')[1];
        } else {
            content = 'Traveling';
        }

        statusDiv.style.setProperty('--twse-content', `"${content}"`);
        // Out of country → red row (via CSS); clear hospital highlight attrs
        writes.push([statusDiv, 'data-twse-traveling', 'true']);
        writes.push([statusDiv, 'data-twse-highlight', 'false']);
        writes.push([statusDiv, 'data-twse-mid', 'false']);
        this.queueSort(writes, li, sortLevel, false);
        return content;
    },

    sortMembers() {
        const uls = document.querySelectorAll('ul.members-list');
        uls.forEach(ul => {
            try {
                const slots = Array.from(ul.childNodes);
                // Only member rows participate in the sort. The old code sorted
                // `childNodes` blindly: text/comment nodes (React inserts
                // <!-- --> markers) crashed the comparator mid-sort, leaving the
                // list half-reordered — the "scrambled" war list.
                const isMember = (n) => n.nodeType === 1 && n.tagName === 'LI' &&
                    (n.classList.contains('enemy') || n.classList.contains('your'));

                const members = slots.filter(isMember);
                if (members.length === 0) return;

                // Attribute reads must be NaN-safe (NaN comparisons give
                // unstable order) and rows without a sort level must sit at
                // the BOTTOM — the old `|| 0` default put unprocessed/React-
                // recreated rows ABOVE the Okay block, which is what
                // scrambled the list every time React rebuilt it.
                const UNKNOWN = 99;
                const level = (li) => {
                    const v = parseInt(li.getAttribute('data-sortA'));
                    return Number.isFinite(v) ? v : UNKNOWN;
                };
                const attrInt = (li, name, fallback) => {
                    const v = parseInt(li.getAttribute(name));
                    return Number.isFinite(v) ? v : fallback;
                };

                const sorted = members.slice().sort((a, b) => {
                    const la = level(a);
                    const lb = level(b);
                    if (la !== lb) return la - lb; // Okay(1) first, Hospital(2) next, travelers below

                    const locA = a.getAttribute('data-location') || '';
                    const locB = b.getAttribute('data-location') || '';
                    if (locA && locB && locA !== locB) return locA.localeCompare(locB);

                    // Same level: Okay rows by most recent status change
                    // (newest on top); everything else by soonest `until` —
                    // i.e. the hospital timer, soonest out first.
                    return la === 1
                        ? attrInt(b, 'data-since', 0) - attrInt(a, 'data-since', 0)
                        : attrInt(a, 'data-until', UNKNOWN) - attrInt(b, 'data-until', UNKNOWN);
                });

                // Slot-preserving rewrite: sorted members fill the slots
                // members already occupy; text nodes and structural rows
                // (li.clear / li.title headers) keep their positions. Skips
                // the DOM write when nothing changed, so a React re-render
                // no longer causes pointless churn.
                let i = 0;
                let changed = false;
                const rebuilt = slots.map((slot) => {
                    if (isMember(slot)) {
                        if (sorted[i] !== slot) changed = true;
                        return sorted[i++];
                    }
                    return slot;
                });
                if (!changed) return;

                const frag = document.createDocumentFragment();
                rebuilt.forEach(n => frag.appendChild(n));
                ul.replaceChildren(frag);
            } catch (err) {
                // A page-structure change must not take down the rest of the
                // watch frame (location aggregation, cleanup) with it.
                console.warn('[WarMonitor] sortMembers failed:', err);
            }
        });
    },

    queueUntil(writes, node, val, dirty) {
        // Guard against literal "undefined" attributes when status.until is
        // missing (audit item 6: String(undefined) === 'undefined' was being
        // written into data-until/since).
        const str = (val === undefined || val === null) ? '' : String(val);
        if (node.getAttribute('data-until') !== str) {
            writes.push([node, 'data-until', str]);
            return true;
        }
        return dirty;
    },

    queueSince(writes, node, val, dirty) {
        const str = (val === undefined || val === null) ? '' : String(val);
        if (node.getAttribute('data-since') !== str) {
            writes.push([node, 'data-since', str]);
            return true;
        }
        return dirty;
    },

    queueSort(writes, node, level, dirty) {
        if (node.getAttribute('data-sortA') !== String(level)) {
            writes.push([node, 'data-sortA', level]);
            return true;
        }
        return dirty;
    },

    pad(n) {
        return n < 10 ? '0' + n : n;
    }
};

// Register module
if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.WarMonitor = WarMonitorModule;

console.log('⚔️ War Monitor module registered');
