// War Monitor Module - Enhanced War Page Features
// Shows hospital timers, travel status, and auto-sorts enemies
const WarMonitorModule = {
    isEnabled: false,
    STORAGE_KEY: 'sidekick_war_monitor',
    apiKey: null,

    running: true,
    foundWar: false,
    pageVisible: !document.hidden,

    memberStatus: new Map(),
    memberLis: new Map(),
    descriptionCache: new Map(),

    lastRequest: null,
    MIN_TIME_SINCE_LAST_REQUEST: 10000,
    TIME_BETWEEN_FRAMES: 500,

    everSorted: false,

    // Initialize module
    async init() {
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
            this.apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key') || '';
        } catch (error) {
            console.error('⚔️ Failed to load settings:', error);
        }
    },

    // Save settings to storage
    async saveSettings() {
        try {
            await window.SidekickModules.Core.ChromeStorage.set(this.STORAGE_KEY, {
                isEnabled: this.isEnabled
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
        console.log('⚔️ War Monitor disabled');
    },

    // Inject CSS styles
    injectStyles() {
        if (document.getElementById('war-monitor-styles')) return;

        const style = document.createElement('style');
        style.id = 'war-monitor-styles';
        style.textContent = `
.members-list li:has(div.status[data-twse-highlight="true"]) {
  background-color: #99EB99 !important;
}
.members-list li:has(div.status[data-twse-status-differs="true"]) {
  background-color: #C4974C !important;
}
.members-list div.status[data-twse-traveling="true"]::after {
  color: #696026 !important;
}

:root .dark-mode .members-list li:has(div.status[data-twse-highlight="true"]) {
  background-color: #446944 !important;
}
:root .dark-mode .members-list li:has(div.status[data-twse-status-differs="true"]) {
  background-color: #795315 !important;
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

        document.addEventListener('visibilitychange', () => {
            this.pageVisible = !document.hidden;
        });

        // Start update intervals — they guard on this.foundWar internally
        setInterval(() => {
            if (!this.running || !this.foundWar) return;
            this.updateStatuses();
        }, this.MIN_TIME_SINCE_LAST_REQUEST);

        setInterval(() => {
            if (!this.foundWar || !this.running || !this.pageVisible) return;
            this.watch();
        }, this.TIME_BETWEEN_FRAMES);

        this.setupObservers();

        console.log('⚔️ War Monitor injected');
    },

    setupObservers() {
        // Phase 1: find any war container element → set foundWar
        const tryInit = () => {
            if (this.foundWar) return;

            const hasWarEl = document.querySelector(
                'ul.members-list, li.enemy, li.your, .faction-war, .f-war-list, ' +
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
                    if (this.memberLis.size > 0) {
                        console.log(`[WarMonitor] Extracted ${this.memberLis.size} member rows after ${memberAttempts} attempt(s)`);
                        this.updateStatuses();
                    } else {
                        console.warn('[WarMonitor] No member rows found after 9s');
                    }
                }
            }, 300);
        };

        // MutationObserver catches React renders immediately
        const observer = new MutationObserver(() => tryInit());
        observer.observe(document.body, { subtree: true, childList: true });

        // Aggressive polling for the first 20s in case observer misses early render
        let fastAttempts = 0;
        const fastPoll = setInterval(() => {
            fastAttempts++;
            tryInit();
            if (fastAttempts >= 40 || this.foundWar) {
                clearInterval(fastPoll);
                if (!this.foundWar) {
                    const slowPoll = setInterval(() => {
                        tryInit();
                        if (this.foundWar) clearInterval(slowPoll);
                    }, 2000);
                }
            }
        }, 500);

        // Try immediately after a short delay
        setTimeout(tryInit, 150);

        // After members are found, observe the member list for re-renders
        const memberListObserver = new MutationObserver(() => {
            if (this.foundWar) this.extractAllMemberLis();
        });
        const recheckMemberObserver = setInterval(() => {
            const memberLists = document.querySelectorAll('ul.members-list');
            if (memberLists.length > 0) {
                memberLists.forEach(ul => memberListObserver.observe(ul, { childList: true }));
                clearInterval(recheckMemberObserver);
            }
        }, 1000);
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
            const resp = await fetch(`https://api.torn.com/faction/${factionId}?selections=basic&key=${this.apiKey}`);
            const data = await resp.json();

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
                    status.traveling_error_bar = prev.traveling_error_bar || 0;
                } else {
                    status.since = Date.now();
                    if (prev?.state !== 'Traveling') {
                        status.traveling_error_bar = Date.now() - (prev?.last_req_time || 0);
                    }
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

        if (dirtySort) {
            this.sortMembers();
        }

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
            if (remaining >= 0) {
                writes.push([statusDiv, 'data-twse-status-differs', 'true']);
            }
            statusDiv.style.setProperty('--twse-content', `"${statusDiv.textContent}"`);
            return;
        }

        if (status.description.includes('In a')) {
            writes.push([statusDiv, 'data-twse-traveling', 'true']);
        }

        if (remaining <= 0) {
            writes.push([statusDiv, 'data-twse-highlight', 'false']);
            return;
        }

        const s = Math.floor(remaining % 60);
        const m = Math.floor((remaining / 60) % 60);
        const h = Math.floor(remaining / 60 / 60);
        const timeStr = `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}`;

        statusDiv.style.setProperty('--twse-content', `"${timeStr}"`);
        writes.push([statusDiv, 'data-twse-highlight', remaining < 300 ? 'true' : 'false']);
    },

    handleTravelStatus(statusDiv, status, li, writes) {
        if (!(statusDiv.classList.contains('traveling') || statusDiv.classList.contains('abroad'))) {
            if (statusDiv.textContent === 'Okay') {
                writes.push([statusDiv, 'data-twse-status-differs', 'true']);
            }
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
        this.queueSort(writes, li, sortLevel, false);
        return content;
    },

    sortMembers() {
        const uls = document.querySelectorAll('ul.members-list');
        uls.forEach(ul => {
            const lis = Array.from(ul.childNodes).sort((a, b) => {
                const sortA = parseInt(a.getAttribute('data-sortA') || 0);
                const sortB = parseInt(b.getAttribute('data-sortA') || 0);
                if (sortA !== sortB) return sortA - sortB;

                const locA = a.getAttribute('data-location') || '';
                const locB = b.getAttribute('data-location') || '';
                if (locA && locB && locA !== locB) return locA.localeCompare(locB);

                const sort = a.getAttribute('data-sortA');
                if (sort === '0' || sort === '1') {
                    return parseInt(b.getAttribute('data-since')) - parseInt(a.getAttribute('data-since'));
                } else {
                    return parseInt(a.getAttribute('data-until')) - parseInt(b.getAttribute('data-until'));
                }
            });

            const frag = document.createDocumentFragment();
            lis.forEach(li => frag.appendChild(li));
            ul.appendChild(frag);
        });
    },

    queueUntil(writes, node, val, dirty) {
        if (node.getAttribute('data-until') !== String(val)) {
            writes.push([node, 'data-until', val]);
            return true;
        }
        return dirty;
    },

    queueSince(writes, node, val, dirty) {
        if (node.getAttribute('data-since') !== String(val)) {
            writes.push([node, 'data-since', val]);
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
