/**
 * Sidekick Chrome Extension - Event Notifier Module
 * Fires acknowledge-required (sticky) notifications for upcoming Torn events.
 * Event/dates data comes from EventTicker (single source of truth).
 * Sticky banner follows the rehab-warning pattern: fixed card, × to
 * acknowledge, acknowledgement stored per event so it never re-fires.
 * Version: 1.0.0
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'sidekick_event_notifier';
    const CHECK_INTERVAL_MS = 5 * 60 * 1000; // re-check every 5 minutes
    const DAY_MS = 24 * 60 * 60 * 1000;

    // ---- Pre-Event Cooldown Guard: base cooldown hours per class ----
    // (before faction merit / perk reductions). Booster: a booster item
    // normally puts a 48h consumption cooldown on that item class.
    // Medical: blood bags / morphine etc. put ~6h medical cooldown.
    const BASE_COOLDOWN_HOURS = {
        booster: 48,
        medical: 6
    };

    // Perk/cooldown modifiers carry a TOTAL effective duration per class —
    // recomputed from the API each refresh and persisted as fallback data.
    const COOLDOWN_CLASS_CATEGORIES = {
        booster: ['alcohol', 'energy drink', 'candy'],
        medical: ['medical', 'blood bag', 'morphine', 'firstaid']
    };

    const EventNotifierModule = {
        name: 'EventNotifier',
        isInitialized: false,

        // ---- state ----
        isEnabled: false,
        leadTimeHours: 24,              // fire N hours before event start
        eventsEnabled: {},              // { "<normalized event name>": true/false }
        blockEnabled: {},               // { "<normalized event name>": true/false } (Pre-Event Cooldown Guard)
        cooldownDurations: {},          // { className: hours } — TOTAL effective cooldown per class (API-derived)
        cooldownDataAt: 0,              // when cooldownDurations was computed
        cooldownFetchInFlight: null,    // promise dedup
        guardClickListener: null,
        checkTimer: null,
        bannerElement: null,
        lastSystemNotifAckKey: null,    // ackKey of the most recent OS notification sent

        // ---- settings ----

        async loadSettings() {
            try {
                const Core = window.SidekickModules.Core;
                const data = await Core.ChromeStorage.get(STORAGE_KEY) || {};

                // One-time migration (ackVersion 2): acknowledgements recorded
                // before 2026-10-08 may have come from the old static-date
                // fallback, which fired alerts up to a week early (wrong dates
                // from the static event table, e.g. "starts in 1 day (47h)"
                // a week before the real date). Wipe them once so genuinely
                // upcoming events still alert; new acknowledgements keep the
                // stamp and are preserved.
                if (data.ackVersion !== 2) {
                    if (data.acknowledged) {
                        delete data.acknowledged;
                        console.log('[Event Notifier] Cleared pre-fix acknowledgements (static-date fallback removed)');
                    }
                    data.ackVersion = 2;
                    await Core.ChromeStorage.set(STORAGE_KEY, data);
                }

                this.isEnabled = !!data.isEnabled;
                this.leadTimeHours = Number(data.leadTimeHours) > 0 ? Number(data.leadTimeHours) : 24;
                this.eventsEnabled = (data.events && typeof data.events === 'object') ? { ...data.events } : {};
                this.blockEnabled = (data.block && typeof data.block === 'object') ? { ...data.block } : {};

                // Persisted API-derived cooldown data — the user's saved
                // fallback. Used when the API/perks pipeline can't run (no
                // key, API down, error-5 backoff) instead of raw defaults.
                const savedCooldowns = (data.cooldownData && typeof data.cooldownData === 'object')
                    ? data.cooldownData : null;
                if (savedCooldowns && savedCooldowns.durations && Number(savedCooldowns.fetchedAt) > 0) {
                    this.cooldownDurations = { ...savedCooldowns.durations };
                    this.cooldownDataAt = Number(savedCooldowns.fetchedAt);
                }
            } catch (e) {
                console.warn('[Event Notifier] Failed to load settings:', e);
            }
        },

        async saveSettings() {
            try {
                // Read-merge so we never clobber the `acknowledged` map
                const data = await window.SidekickModules.Core.ChromeStorage.get(STORAGE_KEY) || {};
                data.isEnabled = this.isEnabled;
                data.leadTimeHours = this.leadTimeHours;
                data.events = { ...this.eventsEnabled };
                data.block = { ...this.blockEnabled };
                await window.SidekickModules.Core.ChromeStorage.set(STORAGE_KEY, data);
            } catch (e) {
                console.error('[Event Notifier] Failed to save settings:', e);
            }
        },

        // Persist the API-derived cooldown data as the user's saved fallback
        // (loaded back on future sessions when the API can't be reached).
        async saveCooldownFallback() {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get(STORAGE_KEY) || {};
                data.cooldownData = {
                    durations: { ...this.cooldownDurations },
                    fetchedAt: this.cooldownDataAt
                };
                await window.SidekickModules.Core.ChromeStorage.set(STORAGE_KEY, data);
            } catch (e) {
                console.warn('[Event Notifier] Failed to save cooldown fallback:', e);
            }
        },

        // ---- Pre-Event Cooldown Guard: user's total cooldown durations ----

        // Extract a percent integer from a perk/cooldwown-modifier string,
        // e.g. "Max boost cooldown is reduced by 20%" → 20.
        extractCooldownReductionPct(text, classNeedles) {
            const s = String(text || '').toLowerCase();
            const classMatch = classNeedles.some(n => s.includes(n));
            if (!classMatch) return 0;
            const m = s.match(/(\d+)(?:\s*\.\s*\d+)?\s*%/);
            return m ? Math.min(90, parseInt(m[1], 10)) : 0;
        },

        // The user's TOTAL effective cooldown per class: base duration minus
        // every percent reduction the account has (faction merits, factions
        // upgrades, education, job, stocks — anything the perks selections
        // expose). Recomputed at most once per day and persisted as fallback
        // data; on failure the last saved value (or the raw base) is used.
        async refreshCooldownDurations(force = false) {
            const now = Date.now();
            const TTL_MS = 24 * 60 * 60 * 1000;
            if (!force && this.cooldownDataAt && now - this.cooldownDataAt < TTL_MS) {
                return this.cooldownDurations;
            }
            if (this.cooldownFetchInFlight) return this.cooldownFetchInFlight;

            this.cooldownFetchInFlight = (async () => {
                try {
                    const apiKey = await window.SidekickModules.Core.ChromeStorage.get(
                        window.SidekickModules.Core.STORAGE_KEYS?.API_KEY || 'sidekick_api_key'
                    );
                    if (!apiKey) {
                        // No key — fall back to saved data or raw base hours
                        if (!this.cooldownDataAt) {
                            this.cooldownDurations = this.defaultCooldownDurations();
                        }
                        return this.cooldownDurations;
                    }

                    // Pull perk strings via the background proxy (rule #14: key
                    // never on a page-visible request). Both faction perks and
                    // merits reduce these cooldowns; perks selections aggregate
                                       // everything, so one call computes the total.
                    const res = await new Promise((resolve) => {
                        chrome.runtime.sendMessage({
                            action: 'proxyFetch',
                            url: `https://api.torn.com/user/?selections=perks&comment=SidekickEventGuard&key=${encodeURIComponent(apiKey)}`
                        }, (r) => resolve(r));
                    });

                    if (!res?.success) {
                        throw new Error(res?.error || 'perks proxy failed');
                    }

                    const data = res.data;
                    if (data?.error) {
                        throw new Error(data.error.error || 'API error');
                    }

                    // Perk strings come as arrays under *_perks keys — merge
                    // everything that could carry a cooldown modifier.
                    const perkStrings = [];
                    for (const [key, value] of Object.entries(data || {})) {
                        if (/(_perks|_merits| faction)$/.test(key) && Array.isArray(value)) {
                            perkStrings.push(...value.map(String));
                        }
                    }
                    if (Array.isArray(data.faction_perks)) perkStrings.push(...data.faction_perks.map(String));
                    if (Array.isArray(data.education_perks)) perkStrings.push(...data.education_perks.map(String));
                    if (Array.isArray(data.job_perks)) perkStrings.push(...data.job_perks.map(String));
                    if (Array.isArray(data.stock_perks)) perkStrings.push(...data.stock_perks.map(String));
                    if (Array.isArray(data.company_perks)) perkStrings.push(...data.company_perks.map(String));
                    if (Array.isArray(data.book_perks)) perkStrings.push(...data.book_perks.map(String));
                    if (Array.isArray(data.merit_perks)) perkStrings.push(...data.merit_perks.map(String));

                    const boosterNeedles = ['booster cooldown', 'boost cooldown', 'booster item cooldown'];
                    const medicalNeedles = ['medical cooldown', 'medical item cooldown'];

                    let boosterPct = 0;
                    let medicalPct = 0;
                    for (const perk of perkStrings) {
                        boosterPct += this.extractCooldownReductionPct(perk, boosterNeedles);
                        medicalPct += this.extractCooldownReductionPct(perk, medicalNeedles);
                    }
                    boosterPct = Math.min(90, boosterPct);
                    medicalPct = Math.min(90, medicalPct);

                    this.cooldownDurations = {
                        booster: Math.max(1, Math.round(BASE_COOLDOWN_HOURS.booster * (100 - boosterPct) / 100)),
                        medical: Math.max(1, Math.round(BASE_COOLDOWN_HOURS.medical * (100 - medicalPct) / 100))
                    };
                    this.cooldownDataAt = now;

                    await this.saveCooldownFallback();

                    console.log('[Event Notifier] Cooldown durations from API:', {
                        ...this.cooldownDurations,
                        boosterPct,
                        medicalPct
                    });

                    return this.cooldownDurations;
                } catch (e) {
                    console.warn('[Event Notifier] Cooldown refresh failed; using fallback data:', e);
                    if (!this.cooldownDataAt) {
                        this.cooldownDurations = this.defaultCooldownDurations();
                    }
                    return this.cooldownDurations;
                } finally {
                    this.cooldownFetchInFlight = null;
                }
            })();

            return this.cooldownFetchInFlight;
        },

        defaultCooldownDurations() {
            return { booster: BASE_COOLDOWN_HOURS.booster, medical: BASE_COOLDOWN_HOURS.medical };
        },

        // Listen for live setting changes while a Torn tab stays open
        attachStorageListener() {
            if (this._listenerAttached) return;
            this._listenerAttached = true;
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local' || !changes[STORAGE_KEY]) return;
                this.loadSettings().then(() => {
                    if (this.isEnabled) {
                        this.checkEvents(); // immediate re-check with new settings
                    } else {
                        this.hideBanner();
                        this.stopGuard();
                    }
                });
            });
        },

        // ---- event matching ----

        normalizeEventName(name) {
            if (!name) return '';
            return name.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
        },

        /**
         * The ticker hydrates its live API calendar asynchronously (storage
         * cache read + possible API fetch), so on a fresh page load our first
         * check can run before that data lands. Wait (bounded) for exactly
         * that data — the same data the sidebar roller counts down from —
         * instead of racing it. Kicking fetchNearestEvent also feeds the
         * notifier when the roller UI itself is disabled in settings.
         */
        async ensureTickerData(ticker) {
            // Fast path: once hydrated (in memory), never poll again.
            if (Array.isArray(ticker.tornEvents)) return true;

            // Quota guard: fetchNearestEvent has its own in-flight guard and
            // 30-min cache-age logic, but if the API is persistently failing we
            // would still re-run this wait loop on every 5-minute checkEvents.
            // Cap the full kick-and-wait cycles per page load; after the cap,
            // just report whatever data the ticker's own init path produced.
            const MAX_FULL_CYCLES = 3;
            if ((this._ensureCycles || 0) >= MAX_FULL_CYCLES) {
                return Array.isArray(ticker.tornEvents);
            }
            this._ensureCycles = (this._ensureCycles || 0) + 1;

            let attempts = 0;
            while (!Array.isArray(ticker.tornEvents) && attempts < 4) {
                if (typeof ticker.fetchNearestEvent === 'function') {
                    try { ticker.fetchNearestEvent(); } catch (e) { /* non-fatal */ }
                }
                await new Promise(resolve => setTimeout(resolve, 1500));
                attempts++;
            }
            return Array.isArray(ticker.tornEvents);
        },

        /**
         * Build the list of candidate events with their start timestamps (ms).
         * Uses EXACTLY the same source the sidebar ticker counts down from:
         * EventTicker's live API calendar (tornEvents with unix `start`,
         * resolved through the ticker's personal-start-time resolver). We
         * only alert on what that source actually returned — we never guess
         * dates from the ticker's static array, whose hardcoded dates drift
         * from the real calendar (that drift caused week-off false alarms).
         * Read-only reuse — we never modify the ticker's data.
         */
        async getUpcomingEventTimestamps() {
            const ticker = window.SidekickModules?.EventTicker;
            if (!ticker) return [];

            await this.ensureTickerData(ticker);

            const out = [];
            const eventsFromApi = Array.isArray(ticker.tornEvents) ? ticker.tornEvents : [];

            if (eventsFromApi.length === 0) return out; // calendar not hydrated yet — no guessing

            for (const event of eventsFromApi) {
                if (typeof ticker.resolveEventStartTime !== 'function') continue;
                const resolved = ticker.resolveEventStartTime(event);
                if (resolved === null || !Number.isFinite(Number(resolved))) continue;

                const title = event.title || 'Event';
                const normalizedName = this.normalizeEventName(title);

                out.push({
                    name: title,
                    normalizedName,
                    feature: event.subtitle || '',
                    notificationText: event.description || '',
                    start: Number(resolved) * 1000,
                    fromApi: true
                });
            }

            return out;
        },

        // Unique-per-occurrence key: same event firing in Nov 2026 and Nov 2027
        // gets different keys, so it re-fires each year even after acknowledging.
        buildAcknowledgementKey(event) {
            const year = new Date(event.start).getFullYear();
            return `${event.normalizedName}#${year}`;
        },

        // Settings toggles are stored under the ticker's curated static names
        // (that's what the settings list renders); live API calendar titles can
        // differ slightly — most commonly by a year suffix ("CaffeineCon" vs
        // "CaffeineCon 2025"). An event counts as user-enabled when the exact
        // normalized API title is toggled OR a year-stripped static twin is.
        stripYearSuffix(name) {
            return String(name || '').replace(/\s*20\d{2}\s*$/, '').trim();
        },

        isEventUserEnabled(event) {
            if (this.eventsEnabled[event.normalizedName] === true) return true;

            const staticEvents = window.SidekickModules?.EventTicker?.events;
            if (!Array.isArray(staticEvents)) return false;

            const apiBase = this.stripYearSuffix(event.normalizedName);
            if (!apiBase) return false;

            for (const staticEvent of staticEvents) {
                const staticNorm = this.normalizeEventName(staticEvent?.name);
                if (this.stripYearSuffix(staticNorm) === apiBase &&
                    this.eventsEnabled[staticNorm] === true) {
                    return true;
                }
            }

            return false;
        },

        async getAcknowledged() {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get(STORAGE_KEY) || {};
                return (data.acknowledged && typeof data.acknowledged === 'object') ? data.acknowledged : {};
            } catch (e) {
                return {};
            }
        },

        async saveAcknowledged(ackMap) {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get(STORAGE_KEY) || {};
                // Prune entries older than 1 year to keep storage tidy
                const cutoff = Date.now() - DAY_MS * 365;
                const pruned = {};
                for (const [key, ts] of Object.entries(ackMap)) {
                    if (Number(ts) >= cutoff) pruned[key] = ts;
                }
                data.acknowledged = pruned;
                await window.SidekickModules.Core.ChromeStorage.set(STORAGE_KEY, data);
            } catch (e) {
                console.error('[Event Notifier] Failed to save acknowledgements:', e);
            }
        },

        // ---- main check ----

        async checkEvents() {
            if (!this.isEnabled) return;

            try {
                // Pre-Event Cooldown Guard: keep the API-derived cooldown
                // durations fresh (daily TTL; saved as fallback data) so block
                // windows are computed with current perk/merit reductions.
                await this.refreshCooldownDurations();

        // (Re-)arm the item-page guard each cycle — block windows are
        // time-based, so a window that opens between page loads is
                // enforced as soon as the next tick runs. Arming happens BEFORE
                // the banner path, which returns early when an alert is up.
                this.startGuard();

                // Cache the active block windows for the SYNCHRONOUS click
                // handler (computed at most once per CHECK_INTERVAL_MS).
                this._blockWindows = await this.computeBlockWindows();

                const acknowledged = await this.getAcknowledged();
                const upcoming = await this.getUpcomingEventTimestamps();
                const leadMs = this.leadTimeHours * 60 * 60 * 1000;
                const now = Date.now();

                // Find the highest-priority unacknowledged event within lead time
                let alertEvent = null;
                for (const event of upcoming) {
                    const isUserEnabled = this.isEventUserEnabled(event);

                    if (!isUserEnabled) continue;

                    const msUntilStart = event.start - now;
                    if (msUntilStart < 0) continue; // already started/past — don't re-alert

                    if (msUntilStart > leadMs) continue; // not within lead window

                    const ackKey = this.buildAcknowledgementKey(event);
                    if (acknowledged[ackKey]) continue; // acknowledged already for this year

                    if (!alertEvent || event.start < alertEvent.start) {
                        alertEvent = event; // alert on the soonest one first
                    }
                }

                if (alertEvent) {
                    this.showBanner(alertEvent, now);
                    // Companion OS notification (gated by the user's Browser
                    // Desktop Notifications pref) — sticky until interacted.
                    // Sent once per occurrence: later re-checks that re-render
                    // the same banner do not re-fire the OS notification.
                    const alertAckKey = this.buildAcknowledgementKey(alertEvent);
                    if (this.lastSystemNotifAckKey !== alertAckKey) {
                        this.lastSystemNotifAckKey = alertAckKey;
                        await this.sendSystemNotification(alertEvent, this.timeTextFor(alertEvent, now));
                    }
                    return; // banner shown; wait for acknowledge before alerting the next event
                } else {
                    this.hideBanner();
                }
            } catch (error) {
                console.error('[Event Notifier] checkEvents failed:', error);
            }
        },

        // Helper: format remaining time exactly like the banner does
        timeTextFor(event, now) {
            const hoursLeft = Math.max(0, Math.ceil((event.start - now) / (60 * 60 * 1000)));
            const daysLeft = Math.floor(hoursLeft / 24);
            return daysLeft > 0
                ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${hoursLeft}h)`
                : `${hoursLeft}h`;
        },

        // ---- Pre-Event Cooldown Guard ----

        // Map item DOM category → cooldown class. Torn's inventory li
        // elements carry data-category (e.g. "Medical", "Alcohol",
        // "Energy drink", "Candy"); matching is substring-tolerant so minor
        // markup variants don't slip through. Returns null for items that
        // don't trigger a guardable cooldown class.
        cooldownClassForElement(el) {
            const categories = [];
            if (el?.getAttribute) {
                const cat = el.getAttribute('data-category');
                if (cat) categories.push(cat);
                const type2 = el.getAttribute('data-type2');
                if (type2) categories.push(type2);
                const title = el.querySelector?.('span.name, .name, .title-wrap')?.textContent;
                if (title) categories.push(title);
            }
            const haystack = categories.join(' ').toLowerCase();
            if (!haystack) return null;

            for (const [className, needles] of Object.entries(COOLDOWN_CLASS_CATEGORIES)) {
                if (needles.some(n => haystack.includes(n))) {
                    return className;
                }
            }
            return null;
        },

        /**
         * All active block windows: for every event the user toggled for
         * blocking AND that declares a blockCooldown class, the window is
         * [eventStart − totalCooldown, eventStart). Reads event start times
         * from the same live API calendar the roller uses (plus the marched
         * static table as fallback via Part 1). Returns
         * [{ event, class, from, until }].
         */
        async computeBlockWindows() {
            const windows = [];
            const ticker = window.SidekickModules?.EventTicker;
            if (!ticker) return windows;

            const upcoming = await this.getUpcomingEventTimestamps();
            const now = Date.now();

            for (const event of upcoming) {
                const isBlockEnabled = this.isEventBlockEnabled(event);
                if (!isBlockEnabled) continue;

                const className = this.eventBlockClass(event);
                if (!className) continue;

                const totalHours = Number(this.cooldownDurations?.[className]);
                if (!totalHours || totalHours <= 0) continue;

                const from = event.start - totalHours * 3600 * 1000;
                if (now >= event.start) continue; // event already started/past

                windows.push({ event, class: className, from, until: event.start });
            }

            return windows;
        },

        // The event's declared cooldown class — from the ticker's static
        // metadata (blockCooldown field), matched year-tolerantly against
        // the live API title.
        eventBlockClass(event) {
            const staticEvents = window.SidekickModules?.EventTicker?.events;
            if (!Array.isArray(staticEvents)) return null;

            const apiBase = this.stripYearSuffix(event.normalizedName);

            for (const staticEvent of staticEvents) {
                if (!staticEvent?.blockCooldown) continue;
                const staticNorm = this.normalizeEventName(staticEvent.name);
                if (staticNorm === event.normalizedName ||
                    this.stripYearSuffix(staticNorm) === apiBase) {
                    return staticEvent.blockCooldown;
                }
            }
            return null;
        },

        // Per-event block toggle: exact key first, then year-stripped twin.
        isEventBlockEnabled(event) {
            if (this.blockEnabled[event.normalizedName] === true) return true;

            const staticEvents = window.SidekickModules?.EventTicker?.events;
            if (!Array.isArray(staticEvents)) return false;

            const apiBase = this.stripYearSuffix(event.normalizedName);
            if (!apiBase) return false;

            for (const staticEvent of staticEvents) {
                const staticNorm = this.normalizeEventName(staticEvent?.name);
                if (this.stripYearSuffix(staticNorm) === apiBase &&
                    this.blockEnabled[staticNorm] === true) {
                    return true;
                }
            }

            return false;
        },

        // The single active window covering the given class right now (or
        // null). SYNCHRONOUS — reads windows cached by the last checkEvents()
        // cycle. The click handler MUST stay synchronous: preventDefault/
        // stopPropagation only work while the event is still dispatching, so
        // the (async) window computation happens on the 5-min check cycle and
        // its result is cached; windows last for hours, so a ≤5-min stale
        // boundary errs slightly conservative at both ends (blocks up to one
        // tick past the event start, opens up to one tick late) — never wrong
        // by a day.
        blockForClassAt(className, nowMs) {
            const windows = Array.isArray(this._blockWindows) ? this._blockWindows : [];
            return windows.find(w => w.class === className && nowMs >= w.from && nowMs < w.until) || null;
        },

        // Fire a system notification via the background service worker.
        // Honors `sidekick_notification_prefs.windowsNotifications`; the
        // generic 'notification' action doesn't check that pref itself, so
        // the gate lives here.
        async sendSystemNotification(event, timeText) {
            try {
                const cs = window.SidekickModules?.Core?.ChromeStorage;
                if (!cs) return;
                const prefs = await cs.get('sidekick_notification_prefs') || {};
                if (prefs.windowsNotifications !== true) return;

                await chrome.runtime.sendMessage({
                    action: 'notification',
                    title: `🎪 ${event.name} starts in ${timeText}`,
                    message: `Acknowledge this alert in your Torn tab. ${event.feature || ''}`.trim(),
                    requireInteraction: true
                });
            } catch (e) {
                console.warn('[Event Notifier] System notification failed:', e);
            }
        },

        // ---- Pre-Event Cooldown Guard: item-page enforcement ----

        // Guard applies on inventory pages only (item.php). Intercepts Use
        // presses in the CAPTURE phase (RefillBlocker pattern — robust against
        // Torn's React re-renders, which would silently re-enable a merely
        // disabled button). A blocked press stops the event
        // (stopPropagation + preventDefault) and spawns a popup explaining the
        // upcoming event. Windows re-evaluate on the 5-min check cycle without
        // needing a page reload.
        guardActive() {
            return window.location.href.includes('item.php');
        },

        handleGuardClick(e) {
            // Fully SYNCHRONOUS — see blockForClassAt. Never await before
            // calling preventDefault/stopPropagation.
            if (!this.isEnabled || !this.guardActive()) return;

            // Find the item element the press belongs to
            let node = e.target;
            while (node && node !== document) {
                if (node instanceof Element && node.hasAttribute?.('data-item')) break;
                node = node.parentElement;
            }
            if (!node || !(node instanceof Element)) return;

            const className = this.cooldownClassForElement(node);
            if (!className) return;

            // Only presses on use/activate controls are intercepted
            const actionText = String(e.target.textContent || '').toLowerCase().trim();
            const ariaLabel = String(e.target.getAttribute?.('aria-label') || '').toLowerCase();
            const isUsePress = e.target.closest?.('a[class*="use"], button[class*="use"], [aria-label*="use" i]')
                || actionText === 'use'
                || ariaLabel.includes('use');
            if (!isUsePress) return;

            const block = this.blockForClassAt(className, Date.now());
            if (!block) return;

            // BLOCK: kill the press and tell the user about the event
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            console.log('[Event Notifier] Blocked use of', className, 'item — Pre-Event Cooldown Guard');

            this.showGuardPopup(block, className);
        },

        // Popup explaining the block: what event, when, why. Auto-dismisses
        // after 8s; click anywhere on it to close.
        showGuardPopup(block, className) {
            const now = Date.now();
            const hoursLeft = Math.max(1, Math.ceil((block.until - now) / 3600000));
            const cooldownHours = this.cooldownDurations?.[className] || '?';
            const featureLine = block.event.feature
                ? `<div style="font-size:11px;margin:4px 0;color:#bbb;">${this.escapeHtml(block.event.feature)}</div>`
                : '';

            const existing = document.getElementById('sk-guard-popup');
            if (existing) existing.remove();

            const popup = document.createElement('div');
            popup.id = 'sk-guard-popup';
            popup.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 1000000;
                background: #1a2332;
                border: 1px solid #e05565;
                border-left: 4px solid #e05565;
                padding: 18px 22px;
                border-radius: 6px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.7);
                color: #fff;
                font-family: inherit;
                line-height: 1.5;
                max-width: 420px;
                cursor: pointer;
            `;
            popup.innerHTML = `
                <div style="font-size:13px;margin-bottom:8px;"><b>⛔ Item use blocked</b></div>
                <div style="font-size:12px;margin-bottom:4px;">
                    <b>${this.escapeHtml(block.event.name)}</b> starts in <b>${hoursLeft}h</b> — using a
                    <b>${className}</b> item now would put your ~<b>${cooldownHours}h</b> cooldown
                    past the event start.
                </div>
                ${featureLine}
                <div style="font-size:11px;color:#e0c37a;margin-top:6px;">Click to dismiss and wait for the event to begin.</div>
            `;

            popup.addEventListener('click', () => popup.remove());
            document.body.appendChild(popup);
            setTimeout(() => popup.remove(), 8000);
        },

        startGuard() {
            if (this.guardClickListener) return; // already armed
            if (!this.guardActive()) return; // item pages only
            this.guardClickListener = (e) => this.handleGuardClick(e);
            document.addEventListener('click', this.guardClickListener, { capture: true });
            console.log('[Event Notifier] Pre-Event Cooldown Guard armed on item page');
        },

        stopGuard() {
            if (this.guardClickListener) {
                document.removeEventListener('click', this.guardClickListener, { capture: true });
                this.guardClickListener = null;
            }
            const popup = document.getElementById('sk-guard-popup');
            if (popup) popup.remove();
        },

        // ---- sticky banner (rehab-warning pattern) ----

        showBanner(event, now) {
            const hoursLeft = Math.max(0, Math.ceil((event.start - now) / (60 * 60 * 1000)));
            const daysLeft = Math.floor(hoursLeft / 24);
            const timeText = daysLeft > 0
                ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${hoursLeft}h)`
                : `${hoursLeft}h`;

            const featureLine = event.feature
                ? `<div style="font-size:11px; margin:2px 0; color:#bbb;">${event.feature}</div>`
                : '';

            const msgHtml = `
                <div style="margin-bottom: 6px;"><b>🎪 Event starting soon</b></div>
                <div style="font-size:13px; margin-bottom: 4px;">
                    <b>${this.escapeHtml(event.name)}</b> starts in <b>${timeText}</b>.
                </div>
                ${featureLine}
                <div style="font-size:11px; color:#e0c37a;">Click × to acknowledge and dismiss this alert.</div>
            `;

            if (!this.bannerElement) {
                this.bannerElement = document.createElement('div');
                this.bannerElement.id = 'sk-event-notifier-banner';
                this.bannerElement.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    width: 300px;
                    background: #1a2332;
                    border-left: 4px solid #e0c37a;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                    color: #fff;
                    padding: 12px 16px;
                    border-radius: 6px;
                    z-index: 999999;
                    font-family: inherit;
                    line-height: 1.4;
                    cursor: default;
                `;
                document.body.appendChild(this.bannerElement);
            }

            this.bannerElement.innerHTML = `
                <div style="position: absolute; top: 8px; right: 8px; cursor: pointer; color: #888; font-size: 16px; line-height: 1;" class="sk-en-close">×</div>
                ${msgHtml}
            `;
            this.bannerElement.style.display = 'block';

            const ackKey = this.buildAcknowledgementKey(event);
            this.bannerElement.querySelector('.sk-en-close').addEventListener('click', async () => {
                this.hideBanner();
                const ack = await this.getAcknowledged();
                ack[ackKey] = Date.now();
                await this.saveAcknowledged(ack);
                // Immediately re-check in case another event is also within lead time
                this.checkEvents();
            });
        },

        hideBanner() {
            if (this.bannerElement) {
                this.bannerElement.style.display = 'none';
            }
        },

        escapeHtml(value) {
            return String(value ?? '').replace(/[&<>"']/g, (ch) => {
                switch (ch) {
                    case '&': return '&#038;';
                    case '<': return '&#060;';
                    case '>': return '&#062;';
                    case '"': return '&#034;';
                    default: return '&#039;'; // single quote
                }
            });
        },

        // ---- lifecycle ----

        startChecks() {
            this.stopChecks();
            this.checkEvents();
            this.checkTimer = setInterval(() => this.checkEvents(), CHECK_INTERVAL_MS);
        },

        stopChecks() {
            if (this.checkTimer) {
                clearInterval(this.checkTimer);
                this.checkTimer = null;
            }
        },

        async init() {
            if (this.isInitialized) return;

            await this.loadSettings();
            this.attachStorageListener();

            if (this.isEnabled) {
                this.startChecks();
                this.startGuard(); // item pages: arm immediately; windows re-check on click
            }

            this.isInitialized = true;
            console.log('[Event Notifier] Initialized (enabled:', this.isEnabled + ')');
        },

        // Allow settings UI to force an immediate re-check
        refreshNow() {
            if (this.isEnabled) this.checkEvents();
        },

        destroy() {
            this.stopChecks();
            this.stopGuard();
            this.hideBanner();
            this.isInitialized = false;
        }
    };

    if (!window.SidekickModules) window.SidekickModules = {};
    window.SidekickModules.EventNotifier = EventNotifierModule;
    console.log('[Event Notifier] Module registered');
})();
