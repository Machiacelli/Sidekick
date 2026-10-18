/**
 * Sidekick Chrome Extension - Event Ticker Module
 * Shows rolling notifications for Torn events between clock and logo
 * Version: 1.0.0
 */

(function () {
    'use strict';

    console.log("🎪 Loading Sidekick Event Ticker Module...");

    const EventTicker = {
        name: 'EventTicker',
        isInitialized: false,
        tickerElement: null,
        currentEventIndex: 0,
        rotationInterval: null,
        playerSignupDate: null,
        playerBirthdayChecked: false,

        // Nearest event timer data
        tornEvents: null,
        nearestEvent: null,
        userEventStartTime: null,
        lastApiUpdate: 0,
        apiUpdateInterval: 1800,
        // Personal calendar start times change rarely (bar usage); 15 min
        // staleness is far below notification granularity but stops the old
        // 60-second cadence from costing one API call per minute, forever,
        // on every open Torn tab.
        userCalendarUpdateInterval: 900,
        countdownInterval: null,
        tickerWrapper: null,
        tickerAnimation: null,
        tickerAnimationDuration: 12000,
        calendarRefreshInFlight: false,
        // Retry-storm guard state: the countdown loop re-kicks
        // fetchNearestEvent once per SECOND while the current nearest event
        // sits in the past. If calendar fetches keep failing (e.g. Torn 504s)
        // that turns into a request per second, maxing the user's 100/min
        // API quota and starving every other module. These fields back off
        // exponentially until one fetch succeeds.
        calendarFailureCount: 0,
        calendarBackoffUntil: 0,
        // Timestamp (ms) of the countdown loop's last fetchNearestEvent kick
        // while a future countdown was on display. Bounds those re-kicks to
        // one per minute so the 15/30-min cache TTLs stay effective inside a
        // long-lived tab without adding API pressure.
        lastFetchKick: 0,

        events: [
            {
                startMonth: 1, startDay: 19,
                endMonth: 1, endDay: 25,
                name: "Awareness Week",
                feature: "+Awareness boost",
                notification: "City map looking like a garage sale – Awareness Week is live."
            },
            {
                startMonth: 1, startDay: 30,
                endMonth: 1, endDay: 31,
                name: "Weekend Road Trip",
                feature: "2× racing points & Racing skill",
                notification: "Engines loud, egos louder – Weekend Road Trip live."
            },
            {
                startMonth: 2, startDay: 14,
                endMonth: 2, endDay: 15,
                name: "Valentine's Day",
                feature: "Love Juice drug",
                notification: "Nothing says love like questionable liquid in a syringe. Happy V-Day."
            },
            {
                startMonth: 3, startDay: 6,
                endMonth: 3, endDay: 7,
                name: "Employee Appreciation Day",
                feature: "3× company training stats & job points",
                notification: "Your boss suddenly cares. Enjoy it—it'll wear off Monday."
            },
            {
                startMonth: 3, startDay: 17,
                endMonth: 3, endDay: 18,
                name: "St. Patrick's Day",
                feature: "2× alcohol effects; Green Stout item",
                notification: "Drink up – St. Patrick's Day bonuses live.",
                blockCooldown: "booster"
            },
            {
                startMonth: 4, startDay: 1,
                endMonth: 4, endDay: 9,
                name: "Easter Egg Hunt",
                feature: "Eggs spawn on Torn pages",
                notification: "Crack eggs, not skulls… or both. Easter in Torn."
            },
            {
                startMonth: 4, startDay: 20,
                endMonth: 4, endDay: 21,
                name: "420 Day",
                feature: "3× cannabis nerve; 5× overdose risk",
                notification: "The city smells funny. Must be April 20th again."
            },
            {
                startMonth: 5, startDay: 17,
                endMonth: 5, endDay: 18,
                name: "Museum Day",
                feature: "10% bonus on museum exchange points",
                notification: "Museum Day: plushies finally worth something."
            },
            {
                startMonth: 6, startDay: 13,
                endMonth: 6, endDay: 14,
                name: "World Blood Donor Day",
                feature: "50% medical cooldown & life loss reduction",
                notification: "Half-price blood loss today. Go stab someone to celebrate.",
                blockCooldown: "medical"
            },
            {
                startMonth: 7, startDay: 6,
                endMonth: 7, endDay: 7,
                name: "World Population Day",
                feature: "2× XP from attacks",
                notification: "Double XP for attacks – Population Day active."
            },
            {
                startMonth: 7, startDay: 28,
                endMonth: 7, endDay: 29,
                name: "World Tiger Day",
                feature: "5× hunting experience",
                notification: "Tiger Day: hunt like it owes you money."
            },
            {
                startMonth: 7, startDay: 31,
                endMonth: 8, endDay: 1,
                name: "International Beer Day",
                feature: "5× nerve from beer items",
                notification: "Cheers! Every pint is five crimes closer to jail.",
                blockCooldown: "booster"
            },
            {
                startMonth: 9, startDay: 26,
                endMonth: 9, endDay: 27,
                name: "Tourism Day",
                feature: "Double travel item capacity",
                notification: "Smuggling limit doubled. Customs is crying."
            },
            {
                startMonth: 10, startDay: 10,
                endMonth: 10, endDay: 11,
                name: "CaffeineCon 2025",
                feature: "2× energy drink effects",
                notification: "Stock the Red Cow, it's CaffeineCon time.",
                blockCooldown: "booster"
            },
            {
                startMonth: 10, startDay: 24,
                endMonth: 11, endDay: 1,
                name: "Trick or Treat",
                feature: "Treat trade for basket upgrades/prizes",
                notification: "Basket's empty. Go beat someone up for candy."
            },
            {
                startMonth: 11, startDay: 15,
                endMonth: 11, endDay: 16,
                name: "Torn Anniversary",
                feature: "",
                notification: "Torn is celebrating its birthday today!"
            },
            {
                startMonth: 11, startDay: 14,
                endMonth: 11, endDay: 15,
                name: "World Diabetes Day",
                feature: "3× happy from candy",
                notification: "World Diabetes Day: Torn's running on pure sugar highs.",
                blockCooldown: "booster"
            },
            {
                startMonth: 11, startDay: 27,
                endMonth: 11, endDay: 28,
                name: "Black Friday",
                feature: "$1 bazaar \"dollar sale\" community frenzy",
                notification: "Black Friday: $1 bazaar chaos, refresh or cry."
            },
            {
                startMonth: 12, startDay: 4,
                endMonth: 12, endDay: 5,
                name: "Slash Wednesday",
                feature: "Hospital times reduced by 75%",
                notification: "Slash Wednesday live: ER now with a fast lane."
            },
            {
                startMonth: 12, startDay: 19,
                endMonth: 12, endDay: 31,
                name: "Christmas Town",
                feature: "Seasonal map-based event with treasure",
                notification: "Christmas Town: snow, loot, and sketchy Santa."
            }
        ],

        async init() {
            if (this.isInitialized) {
                console.log("🎪 Event Ticker already initialized");
                return;
            }

            try {
                const settings =
                    await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
                const calSetting = settings['event-calendar'];

                if (calSetting && calSetting.isEnabled === false) {
                    console.log('🎪 Event Ticker: disabled in settings, skipping init');
                    this.isInitialized = true;
                    return;
                }
            } catch (e) {
                // Storage not ready. Continue initialization.
            }

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local' || !changes.sidekick_settings) return;

                const newSettings = changes.sidekick_settings.newValue || {};
                const calSetting = newSettings['event-calendar'];
                const enabled = !calSetting || calSetting.isEnabled !== false;

                if (!enabled && this.tickerElement) {
                    this.tickerElement.style.display = 'none';
                } else if (enabled && this.tickerElement) {
                    this.tickerElement.style.display = '';
                }
            });

            // Load persisted date corrections (written by autoCorrectEventDates
            // from the live API calendar) into the static table IN MEMORY.
            // The old code DELETED 'event_calendar_overrides' on every boot
            // (leftover debug line), which made corrections never persist —
            // the static fallback data could never self-heal. Keep the array
            // as bootstrap-of-last-resort, let the API keep its dates current.
            try {
                await this.applyKnownDateCorrections();
            } catch (e) {
                console.warn("Failed to load event date corrections", e);
            }

            console.log('🎪 Event Ticker: Initializing...');

            try {
                const storedStartTime =
                    await window.SidekickModules.Core.ChromeStorage.get(
                        'userEventStartTime'
                    );

                if (
                    typeof storedStartTime === 'string' &&
                    storedStartTime.trim()
                ) {
                    this.userEventStartTime = storedStartTime.trim();
                    console.log(
                        '📦 Event Ticker: Loaded cached user event start time:',
                        this.userEventStartTime
                    );
                }
            } catch (error) {
                console.warn(
                    '⚠️ Event Ticker: Error loading cached times:',
                    error
                );
            }

            this.fetchPlayerBirthday();

            this.fetchNearestEvent();
            this.startCountdown();
            this.waitForTicker();

            this.isInitialized = true;
        },

        async fetchPlayerBirthday() {
            if (this.playerBirthdayChecked) return;

            try {
                console.log(
                    '🎂 Event Ticker: Fetching player birthday from Torn API...'
                );

                // Storage reads use the ChromeStorage wrapper (chrome.storage
                // with localStorage fallback). This used to read 'torn_api_key'
                // — a key NOTHING in the codebase ever writes — so the
                // birthday countdown silently never worked. The real key is
                // 'sidekick_api_key'. Fixed 2026-10-08.
                const apiKey =
                    await window.SidekickModules.Core.ChromeStorage.get(
                        'sidekick_api_key'
                    ) || '';

                if (!apiKey) {
                    console.log(
                        '⚠️ Event Ticker: No API key found, skipping birthday check'
                    );
                    this.playerBirthdayChecked = true;
                    return;
                }

                // Background proxy — never expose the key on a page-visible
                // request (rule #14). 'profile' returns { name, signup, ... }.
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: 'fetchTornApi',
                        apiKey,
                        selections: ['profile']
                    }, (r) => resolve(r));
                });

                if (!response?.success) {
                    console.warn(
                        '❌ Event Ticker: Birthday API proxy failed:',
                        response?.error
                    );
                    this.playerBirthdayChecked = true;
                    return;
                }

                // The proxy stores the raw v1 `user?selections=profile`
                // response object under `profile`; depending on API version
                // the `signup` field sits at the top level or inside the
                // nested `profile` object — accept both.
                const signup = response.profile?.signup
                    || response.profile?.profile?.signup;

                if (signup) {
                    this.playerSignupDate = new Date(signup);
                    console.log(
                        '✅ Event Ticker: Player joined Torn on',
                        signup
                    );

                    const yearsInTorn = this.getYearsInTorn();
                    console.log(
                        `🎉 Event Ticker: Player has been in Torn for ${yearsInTorn} years!`
                    );
                }

                this.playerBirthdayChecked = true;
            } catch (error) {
                console.error(
                    '❌ Event Ticker: Failed to fetch player birthday:',
                    error
                );
                this.playerBirthdayChecked = true;
            }
        },

        async fetchNearestEvent() {
            if (this.calendarRefreshInFlight) return;
            this.calendarRefreshInFlight = true;

            const storage = window.SidekickModules.Core.ChromeStorage;
            const currentTime = Math.floor(Date.now() / 1000);

            try {
                const cachedEventsValue = await storage.get('torn_events');
                const cachedEvents = Array.isArray(cachedEventsValue)
                    ? cachedEventsValue
                    : (
                        Array.isArray(cachedEventsValue?.torn_events)
                            ? cachedEventsValue.torn_events
                            : null
                    );

                const eventsUpdateValue =
                    await storage.get('torn_events_update');

                const eventsLastUpdate = Number(
                    typeof eventsUpdateValue === 'number'
                        ? eventsUpdateValue
                        : eventsUpdateValue?.torn_events_update
                ) || 0;

                const userCalendarUpdateValue =
                    await storage.get('user_calendar_update');

                const userCalendarLastUpdate = Number(
                    typeof userCalendarUpdateValue === 'number'
                        ? userCalendarUpdateValue
                        : userCalendarUpdateValue?.user_calendar_update
                ) || 0;

                if (cachedEvents) {
                    this.tornEvents = cachedEvents;
                }

                const shouldFetchEvents =
                    !cachedEvents ||
                    currentTime - eventsLastUpdate >= this.apiUpdateInterval;

                const shouldFetchUserTime =
                    !this.userEventStartTime ||
                    currentTime - userCalendarLastUpdate >=
                    this.userCalendarUpdateInterval;

                if (!shouldFetchEvents && !shouldFetchUserTime) {
                    this.calculateNearestEvent();
                    this.refreshTickerIfReady();
                    return;
                }

                // Backoff: skip the fetch entirely (but keep rendering from
                // cached data) while a previous failure's cooldown is active.
                if (
                    (shouldFetchEvents || shouldFetchUserTime) &&
                    Date.now() < this.calendarBackoffUntil
                ) {
                    this.calculateNearestEvent();
                    this.refreshTickerIfReady();
                    return;
                }

                const apiKey = await storage.get('sidekick_api_key');

                if (!apiKey) {
                    console.log(
                        '⚠️ Event Ticker: No API key for calendar fetch'
                    );
                    this.calculateNearestEvent();
                    this.refreshTickerIfReady();
                    return;
                }

                const requests = [];

                if (shouldFetchEvents) {
                    console.log(
                        '🔄 Event Ticker: Fetching Torn calendar from API...'
                    );

                    requests.push(
                        this.fetchTornCalendar(apiKey).then(async events => {
                            this.tornEvents = events;

                            await storage.set('torn_events', events);
                            await storage.set(
                                'torn_events_update',
                                currentTime
                            );
                            await this.autoCorrectEventDates(events);

                            console.log(
                                `✅ Event Ticker: Fetched ${events.length} Torn events from /v2/torn/calendar`
                            );
                        })
                    );
                }

                if (shouldFetchUserTime) {
                    console.log(
                        '🔄 Event Ticker: Fetching personal calendar time from API...'
                    );

                    requests.push(
                        this.fetchUserCalendarStartTime(apiKey).then(
                            async startTime => {
                                // Stamp the refresh cadence even when the
                                // response carries no start_time — otherwise
                                // shouldFetchUserTime stays true forever and
                                // every later cycle re-attempts the call.
                                await storage.set(
                                    'user_calendar_update',
                                    currentTime
                                );

                                if (!startTime) return;

                                this.userEventStartTime = startTime;

                                await storage.set(
                                    'userEventStartTime',
                                    startTime
                                );

                                console.log(
                                    '✅ Event Ticker: Personal event start time:',
                                    startTime,
                                    'TCT'
                                );
                            }
                        )
                    );
                }

                const results = await Promise.allSettled(requests);

                const failedCount = results.filter(
                    result => result.status === 'rejected'
                ).length;

                if (failedCount > 0) {
                    this.calendarFailureCount++;
                    const backoffMs = Math.min(
                        60000 * Math.pow(2, this.calendarFailureCount - 1),
                        this.apiUpdateInterval * 1000
                    );
                    this.calendarBackoffUntil = Date.now() + backoffMs;
                    console.warn(
                        `⚠️ Event Ticker: Calendar request failed (${failedCount}/${results.length}); retrying in ${Math.round(backoffMs / 1000)}s (using cached/global fallback):`,
                        ...results
                            .filter(result => result.status === 'rejected')
                            .map(result => result.reason)
                    );
                } else {
                    this.calendarFailureCount = 0;
                    this.calendarBackoffUntil = 0;
                }

                this.calculateNearestEvent();
                this.refreshTickerIfReady();
            } catch (error) {
                console.error(
                    '❌ Event Ticker: Failed to update calendar:',
                    error
                );
                this.calculateNearestEvent();
                this.refreshTickerIfReady();
            } finally {
                this.calendarRefreshInFlight = false;
            }
        },

        async fetchCalendarJson(path, apiKey) {
            // Background proxy — Authorization header (with the key) lives in
            // the isolated world, never on a page-visible fetch (rule #14).
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'proxyFetch',
                    url: `https://api.torn.com/v2/${path}`,
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `ApiKey ${apiKey}`
                    }
                }, (r) => resolve(r));
            });

            if (!response?.success) {
                throw new Error(`${path}: ${response?.error || 'background proxy failed'}`);
            }

            let data = response.data;

            // The proxy JSON-parses the body for us; tolerate a raw string
            // just in case.
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (error) {
                    throw new Error(`${path} returned invalid JSON`);
                }
            }

            if (data?.error) {
                const apiError = data?.error;
                const message =
                    apiError?.error ||
                    apiError?.message ||
                    `HTTP ${response.status}`;

                throw new Error(`${path}: ${message}`);
            }

            return data;
        },

        async fetchTornCalendar(apiKey) {
            const data = await this.fetchCalendarJson(
                'torn/calendar',
                apiKey
            );

            const events = Array.isArray(data?.calendar?.events)
                ? data.calendar.events
                : [];

            const competitions = Array.isArray(
                data?.calendar?.competitions
            )
                ? data.calendar.competitions
                : [];

            return events.concat(competitions);
        },

        async fetchUserCalendarStartTime(apiKey) {
            const data = await this.fetchCalendarJson(
                'user/calendar',
                apiKey
            );

            const startTime = data?.calendar?.start_time;

            return typeof startTime === 'string' && startTime.trim()
                ? startTime.trim()
                : null;
        },

        parseTctStartTime(startTime) {
            if (typeof startTime !== 'string') return null;

            const value = startTime.trim();
            const timeMatch = value.match(
                /(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?:\s*TCT)?(?:$|\s)/i
            );

            if (timeMatch) {
                return {
                    hours: Number(timeMatch[1]),
                    minutes: Number(timeMatch[2]),
                    seconds: Number(timeMatch[3] || 0)
                };
            }

            const parsed = new Date(value);

            if (!Number.isNaN(parsed.getTime())) {
                return {
                    hours: parsed.getUTCHours(),
                    minutes: parsed.getUTCMinutes(),
                    seconds: parsed.getUTCSeconds()
                };
            }

            return null;
        },

        applyPersonalStartTime(eventStartTimestamp, personalStartTime) {
            if (!Number.isFinite(Number(eventStartTimestamp))) {
                return null;
            }

            const time = this.parseTctStartTime(personalStartTime);
            if (!time) return null;

            const eventDate =
                new Date(Number(eventStartTimestamp) * 1000);

            return Math.floor(
                Date.UTC(
                    eventDate.getUTCFullYear(),
                    eventDate.getUTCMonth(),
                    eventDate.getUTCDate(),
                    time.hours,
                    time.minutes,
                    time.seconds
                ) / 1000
            );
        },

        resolveEventStartTime(event) {
            const globalStart = Number(event?.start);

            if (!Number.isFinite(globalStart)) return null;

            if (
                event.fixed_start_time !== false ||
                !this.userEventStartTime
            ) {
                return globalStart;
            }

            const personalStart = this.applyPersonalStartTime(
                globalStart,
                this.userEventStartTime
            );

            if (personalStart === null) {
                console.warn(
                    `⚠️ Event Ticker: Could not parse personal calendar time "${this.userEventStartTime}"; using global time for ${event.title || 'event'}`
                );
                return globalStart;
            }

            return personalStart;
        },

        refreshTickerIfReady() {
            if (this.tickerElement) {
                this.updateTickerDisplay();
            }
        },

        // Tolerant reader for the overrides map: ChromeStorage.get returns
        // the stored VALUE directly (the map itself), but legacy writes may
        // have wrapped it as { event_calendar_overrides: {...} }. Accept both
        // shapes so auto-corrected dates actually get applied.
        extractOverridesMap(storage) {
            if (!storage || typeof storage !== 'object') return {};
            if (storage.event_calendar_overrides && typeof storage.event_calendar_overrides === 'object') {
                return storage.event_calendar_overrides;
            }
            return storage;
        },

        // Year-suffix-tolerant event-name matching: live API titles can drop
        // or change a trailing year ("CaffeineCon" vs "CaffeineCon 2025"),
        // which made exact-name corrections silently miss. Strip a trailing
        // 4-digit year before comparing (same convention as the notifier).
        stripEventYearSuffix(name) {
            return String(name || '').replace(/\s*20\d{2}\s*$/, '').trim();
        },

        findStaticEventByApiTitle(apiTitle) {
            const normalized = this.normalizeEventName(apiTitle);
            if (!normalized) return null;

            // Exact normalized match first
            const exact = this.events.find(
                event => this.normalizeEventName(event.name) === normalized
            );
            if (exact) return exact;

            // Then year-stripped match ("CaffeineCon" ↔ "CaffeineCon 2025")
            const apiBase = this.stripEventYearSuffix(normalized);
            if (!apiBase) return null;

            return this.events.find(event => {
                const staticNorm = this.normalizeEventName(event.name);
                return staticNorm &&
                    this.stripEventYearSuffix(staticNorm) === apiBase;
            }) || null;
        },

        /**
         * Merge persisted date corrections (from the live API calendar) back
         * into `this.events` IN MEMORY. This is what makes the hardcoded
         * fallback data updatable: once the API has supplied the correct
         * dates for an occurrence, every consumer of `ticker.events` — the
         * roller's upcoming/active lists, getDaysUntil, the notifier's
         * settings list — sees corrected dates without each having to call
         * getEventDates(). Text (feature/notification) stays code-owned; only
         * month/day fields are corrected.
         */
        async applyKnownDateCorrections() {
            const storage = await window.SidekickModules.Core.ChromeStorage.get(
                'event_calendar_overrides'
            );

            const overrides = this.extractOverridesMap(storage);
            const overrideEntries = Object.entries(overrides || {});
            if (overrideEntries.length === 0) return 0;

            let applied = 0;

            for (const [normalizedApiName, correction] of overrideEntries) {
                if (!correction || typeof correction !== 'object') continue;

                const startMonth = Number(correction.startMonth);
                const startDay = Number(correction.startDay);
                if (!startMonth || !startDay) continue;

                // Map the API-normalized key onto a static entry (exact match
                // first, year-suffix-stripped fallback).
                const staticEvent = this.findStaticEventByApiTitle(normalizedApiName);
                if (!staticEvent) continue;

                staticEvent.startMonth = startMonth;
                staticEvent.startDay = startDay;
                if (Number(correction.endMonth) && Number(correction.endDay)) {
                    staticEvent.endMonth = Number(correction.endMonth);
                    staticEvent.endDay = Number(correction.endDay);
                }
                applied++;
            }

            if (applied > 0) {
                console.log(`📅 Event Ticker: Applied ${applied} persisted date correction(s) to the static table`);
            }

            return applied;
        },

        async autoCorrectEventDates(apiEvents) {
            try {
                const storage =
                    await window.SidekickModules.Core.ChromeStorage.get(
                        'event_calendar_overrides'
                    );

                const overrides =
                    this.extractOverridesMap(storage);

                let correctionsMade = 0;

                for (const apiEvent of apiEvents) {
                    if (!apiEvent.title || !apiEvent.start) continue;

                    // Year-suffix tolerant: live title "CaffeineCon" updates
                    // the curated "CaffeineCon 2025" entry.
                    const hardcodedEvent =
                        this.findStaticEventByApiTitle(apiEvent.title);

                    if (hardcodedEvent) {
                        // Derive month/day in UTC (TCT) — local getDate()
                        // can write off-by-one dates for starts near
                        // midnight UTC.
                        const apiStartDate =
                            new Date(apiEvent.start * 1000);

                        // The static table's endDay is an EXCLUSIVE day
                        // boundary (a one-day event is "10 okt // 11 okt"),
                        // while the API end timestamp is the last live
                        // second (…23:59:59). Round the API end UP to the
                        // next UTC-day boundary so auto-corrected events
                        // keep their final day instead of ending a day (or,
                        // for one-day events, the WHOLE window) early.
                        const apiEndDate = apiEvent.end
                            ? new Date(
                                Math.ceil(apiEvent.end / 86400) *
                                86400 *
                                1000
                            )
                            : apiStartDate;

                        const apiDates = {
                            startMonth: apiStartDate.getUTCMonth() + 1,
                            startDay: apiStartDate.getUTCDate(),
                            endMonth: apiEndDate.getUTCMonth() + 1,
                            endDay: apiEndDate.getUTCDate()
                        };

                        const normalizedApiName =
                            this.normalizeEventName(apiEvent.title);

                        const datesDiffer =
                            apiDates.startMonth !==
                            hardcodedEvent.startMonth ||
                            apiDates.startDay !==
                            hardcodedEvent.startDay ||
                            apiDates.endMonth !==
                            hardcodedEvent.endMonth ||
                            apiDates.endDay !==
                            hardcodedEvent.endDay;

                        if (datesDiffer) {
                            overrides[normalizedApiName] = apiDates;
                            correctionsMade++;

                            // Apply in memory immediately too, so this page
                            // load's roller/settings list show corrected
                            // dates without waiting for a reload.
                            hardcodedEvent.startMonth = apiDates.startMonth;
                            hardcodedEvent.startDay = apiDates.startDay;
                            hardcodedEvent.endMonth = apiDates.endMonth;
                            hardcodedEvent.endDay = apiDates.endDay;

                            console.log(
                                `📅 AUTO-CORRECTED "${hardcodedEvent.name}": → ${apiDates.startMonth}/${apiDates.startDay}`
                            );
                        }
                    }
                }

                if (correctionsMade > 0) {
                    await window.SidekickModules.Core.ChromeStorage.set(
                        'event_calendar_overrides',
                        overrides
                    );

                    console.log(
                        `✅ Auto-corrected ${correctionsMade} event date(s) from API`
                    );
                }
            } catch (error) {
                console.error(
                    '❌ Failed to auto-correct event dates:',
                    error
                );
            }
        },

        calculateNearestEvent() {
            if (!this.tornEvents || this.tornEvents.length === 0) {
                return;
            }

            const currentTime = Math.round(Date.now() / 1000);
            const upcomingEvents = [];

            for (const event of this.tornEvents) {
                const globalStart = Number(event?.start);
                const globalEnd = Number(event?.end);

                if (!Number.isFinite(globalStart)) continue;

                // The GLOBAL window decides liveness: once the world-start
                // has passed, the event is live (shown by the rotation) and
                // must never re-qualify as a "next" countdown — even when a
                // personal start-time stamp still sits in the future (the
                // live-CaffeineCon-countdown bug: a globally-live event kept
                // counting down to its 16:00 TCT personal anchor). Personal
                // anchors may only adjust the countdown BEFORE the global
                // start; a window that already closed is dropped as well.
                if (currentTime >= globalStart) continue;

                if (
                    Number.isFinite(globalEnd) &&
                    currentTime >= globalEnd
                ) {
                    continue;
                }

                const eventStartTime =
                    this.resolveEventStartTime(event);

                if (eventStartTime === null) continue;

                const diff = eventStartTime - currentTime;

                if (diff >= 0) {
                    upcomingEvents.push({
                        ...event,
                        start: eventStartTime,
                        diff
                    });
                }
            }

            if (upcomingEvents.length === 0) {
                this.nearestEvent = null;
                console.log(
                    '⏰ Event Ticker: No upcoming events found'
                );
                return;
            }

            upcomingEvents.sort((a, b) => a.diff - b.diff);
            this.nearestEvent = upcomingEvents[0];

            console.log(
                '⏱️ Event Ticker: Next event:',
                this.nearestEvent.title,
                'in',
                this.formatCountdown(this.nearestEvent.diff)
            );
        },

        formatCountdown(seconds) {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor(
                (seconds % 86400) / 3600
            );
            const minutes = Math.floor(
                (seconds % 3600) / 60
            );
            const secs = seconds % 60;

            if (days > 0) {
                return `${days}d ${hours
                    .toString()
                    .padStart(2, '0')}:${minutes
                        .toString()
                        .padStart(2, '0')}:${secs
                            .toString()
                            .padStart(2, '0')}`;
            }

            return `${hours
                .toString()
                .padStart(2, '0')}:${minutes
                    .toString()
                    .padStart(2, '0')}:${secs
                        .toString()
                        .padStart(2, '0')}`;
        },

        startCountdown() {
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
            }

            this.countdownInterval = setInterval(() => {
                if (this.nearestEvent) {
                    const currentTime =
                        Math.round(Date.now() / 1000);

                    const timeUntil =
                        this.nearestEvent.start - currentTime;

                    if (timeUntil <= 0) {
                        this.fetchNearestEvent();
                    } else if (
                        Date.now() - this.lastFetchKick >= 60000
                    ) {
                        // A displayed (future) countdown must not freeze the
                        // data behind it: without a bounded re-kick the
                        // 15/30-min cache TTLs only ever apply on page load,
                        // so stale calendar/personal-anchor data would sit
                        // on screen until the countdown hits zero. Quota-safe:
                        // fetchNearestEvent still self-throttles via its
                        // in-flight guard, cache TTLs and failure backoff.
                        this.lastFetchKick = Date.now();
                        this.fetchNearestEvent();
                    }
                }
            }, 1000);
        },

        getYearsInTorn() {
            if (!this.playerSignupDate) return 0;

            const now = new Date();
            const years =
                now.getFullYear() -
                this.playerSignupDate.getFullYear();

            const thisYearBirthday = new Date(
                now.getFullYear(),
                this.playerSignupDate.getMonth(),
                this.playerSignupDate.getDate()
            );

            if (now < thisYearBirthday) {
                return years - 1;
            }

            return years;
        },

        isTornBirthdayToday() {
            if (!this.playerSignupDate) return false;

            const now = new Date();
            const signupMonth =
                this.playerSignupDate.getMonth();
            const signupDay =
                this.playerSignupDate.getDate();

            return (
                now.getMonth() === signupMonth &&
                now.getDate() === signupDay
            );
        },

        isTornBirthdaySoon(daysAhead = 7) {
            if (!this.playerSignupDate) return false;

            const now = new Date();
            const signupMonth =
                this.playerSignupDate.getMonth();
            const signupDay =
                this.playerSignupDate.getDate();

            let birthdayThisYear = new Date(
                now.getFullYear(),
                signupMonth,
                signupDay
            );

            if (birthdayThisYear < now) {
                birthdayThisYear = new Date(
                    now.getFullYear() + 1,
                    signupMonth,
                    signupDay
                );
            }

            const daysUntil = Math.floor(
                (birthdayThisYear - now) /
                (1000 * 60 * 60 * 24)
            );

            return daysUntil >= 0 && daysUntil <= daysAhead;
        },

        waitForTicker() {
            let attempts = 0;
            const maxAttempts = 100;

            const checkTicker = setInterval(() => {
                attempts++;

                const placeholder =
                    document.getElementById(
                        'sidekick-ticker-placeholder'
                    );

                if (placeholder) {
                    console.log(
                        '✅ Event Ticker: Found placeholder, creating ticker...'
                    );
                    clearInterval(checkTicker);
                    this.createTicker();
                    this.startRotation();
                } else if (attempts >= maxAttempts) {
                    console.error(
                        '❌ Event Ticker: Timeout waiting for placeholder after 10 seconds'
                    );
                    clearInterval(checkTicker);
                }
            }, 100);
        },

        createTicker() {
            if (
                document.getElementById(
                    'sidekick-event-ticker'
                )
            ) {
                console.log(
                    '⚠️ Event Ticker: Ticker already exists, skipping creation'
                );
                return;
            }

            const placeholder =
                document.getElementById(
                    'sidekick-ticker-placeholder'
                );

            if (!placeholder) {
                console.warn(
                    '⚠️ Event Ticker: Placeholder not found, retrying in 200ms...'
                );
                setTimeout(() => this.createTicker(), 200);
                return;
            }

            console.log(
                '🎪 Event Ticker: Creating ticker element...'
            );

            let style =
                document.getElementById(
                    'sidekick-ticker-styles'
                );

            if (!style) {
                style = document.createElement('style');
                style.id = 'sidekick-ticker-styles';
                document.head.appendChild(style);
            }

            style.textContent = `
                .sidekick-ticker-scrolling {
                    animation: none;
                    will-change: transform;
                    backface-visibility: hidden;
                    -webkit-font-smoothing: antialiased;
                }
            `;

            const ticker = document.createElement('div');
            ticker.id = 'sidekick-event-ticker';
            ticker.style.cssText = `
                display: flex;
                align-items: center;
                width: 100%;
                overflow: hidden;
                position: relative;
                min-height: 20px;
                margin: 0;
            `;

            const scrollWrapper =
                document.createElement('div');

            scrollWrapper.style.cssText = `
                flex: 1;
                overflow: hidden;
                position: relative;
            `;

            const textContainer =
                document.createElement('div');

            textContainer.id = 'sidekick-ticker-text';
            textContainer.className =
                'sidekick-ticker-scrolling';

            textContainer.style.cssText = `
                color: #ccc;
                font-size: 11px;
                white-space: nowrap;
                display: inline-block;
                opacity: 1;
                animation: none;
                will-change: transform;
            `;

            scrollWrapper.appendChild(textContainer);
            ticker.appendChild(scrollWrapper);

            placeholder.innerHTML = '';
            placeholder.appendChild(ticker);

            this.tickerElement = textContainer;
            this.tickerWrapper = scrollWrapper;

            console.log(
                '✅ Event Ticker: Created seamlessly in top bar'
            );

            this.setTickerText('Loading events...');
            this.updateTickerDisplay();
        },

        getCurrentUTC() {
            const now = new Date();

            return new Date(
                Date.UTC(
                    now.getUTCFullYear(),
                    now.getUTCMonth(),
                    now.getUTCDate(),
                    now.getUTCHours(),
                    now.getUTCMinutes(),
                    now.getUTCSeconds()
                )
            );
        },

        async isEventActive(event, now = null) {
            if (!now) {
                now = this.getCurrentUTC();
            }

            const currentYear = now.getUTCFullYear();
            const currentMonth = now.getUTCMonth() + 1;

            const dates = await this.getEventDates(event);

            let startDate = new Date(
                Date.UTC(
                    currentYear,
                    dates.startMonth - 1,
                    dates.startDay,
                    0,
                    0,
                    0
                )
            );

            let endDate = new Date(
                Date.UTC(
                    currentYear,
                    dates.endMonth - 1,
                    dates.endDay,
                    0,
                    0,
                    0
                )
            );

            if (dates.endMonth < dates.startMonth) {
                if (currentMonth >= dates.startMonth) {
                    endDate = new Date(
                        Date.UTC(
                            currentYear + 1,
                            dates.endMonth - 1,
                            dates.endDay,
                            0,
                            0,
                            0
                        )
                    );
                } else {
                    startDate = new Date(
                        Date.UTC(
                            currentYear - 1,
                            dates.startMonth - 1,
                            dates.startDay,
                            0,
                            0,
                            0
                        )
                    );
                }
            }

            return now >= startDate && now < endDate;
        },

        async getActiveEvents() {
            const now = this.getCurrentUTC();
            const activeEvents = [];

            for (const event of this.events) {
                if (await this.isEventActive(event, now)) {
                    activeEvents.push(event);
                }
            }

            if (this.isTornBirthdayToday()) {
                const years = this.getYearsInTorn();

                activeEvents.push({
                    name: "Your Torn Birthday",
                    feature: "Personal celebration",
                    notification:
                        `🎂 Happy Torn Birthday! ${years} year${years !== 1 ? 's' : ''} of mayhem and counting!`,
                    isBirthday: true
                });
            }

            return activeEvents;
        },

        async getNextEvent() {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentTime = now.getTime();

            let nextEvent = null;
            let minTimeDiff = Infinity;

            for (
                let yearOffset = 0;
                yearOffset <= 1;
                yearOffset++
            ) {
                const checkYear = currentYear + yearOffset;

                for (const event of this.events) {
                    const dates =
                        await this.getEventDates(event);

                    const eventStart = new Date(
                        checkYear,
                        dates.startMonth - 1,
                        dates.startDay
                    );

                    eventStart.setHours(0, 0, 0, 0);

                    const timeDiff =
                        eventStart.getTime() - currentTime;

                    if (
                        timeDiff > 0 &&
                        timeDiff < minTimeDiff
                    ) {
                        minTimeDiff = timeDiff;

                        nextEvent = {
                            ...event,
                            startMonth: dates.startMonth,
                            startDay: dates.startDay,
                            endMonth: dates.endMonth,
                            endDay: dates.endDay,
                            startDate: eventStart,
                            timeDiff
                        };
                    }
                }
            }

            if (
                this.playerSignupDate &&
                !this.isTornBirthdayToday()
            ) {
                const nextBirthday =
                    this.getNextBirthday();

                if (nextBirthday) {
                    const birthdayDiff =
                        nextBirthday.getTime() -
                        currentTime;

                    if (
                        birthdayDiff > 0 &&
                        birthdayDiff < minTimeDiff
                    ) {
                        const years =
                            this.getYearsInTorn() + 1;

                        nextEvent = {
                            name: "Your Torn Birthday",
                            feature:
                                `${years} year${years !== 1 ? "s" : ""} celebration`,
                            startDate: nextBirthday,
                            timeDiff: birthdayDiff,
                            isBirthday: true
                        };
                    }
                }
            }

            return nextEvent;
        },

        getNextBirthday() {
            if (!this.playerSignupDate) return null;

            const now = new Date();
            const currentYear = now.getFullYear();
            const signupMonth =
                this.playerSignupDate.getMonth();
            const signupDay =
                this.playerSignupDate.getDate();

            let nextBirthday = new Date(
                currentYear,
                signupMonth,
                signupDay
            );

            nextBirthday.setHours(0, 0, 0, 0);

            if (nextBirthday <= now) {
                nextBirthday = new Date(
                    currentYear + 1,
                    signupMonth,
                    signupDay
                );
                nextBirthday.setHours(0, 0, 0, 0);
            }

            return nextBirthday;
        },

        getUpcomingEvents(daysAhead = 7) {
            const now = new Date();

            const future = new Date(
                now.getTime() +
                daysAhead * 24 * 60 * 60 * 1000
            );

            const upcomingEvents = this.events.filter(event => {
                const currentYear = now.getFullYear();

                let eventStart = new Date(
                    currentYear,
                    event.startMonth - 1,
                    event.startDay
                );

                if (eventStart < now) {
                    eventStart = new Date(
                        currentYear + 1,
                        event.startMonth - 1,
                        event.startDay
                    );
                }

                return eventStart > now && eventStart <= future;
            });

            if (
                this.isTornBirthdaySoon(daysAhead) &&
                !this.isTornBirthdayToday()
            ) {
                const signupMonth =
                    this.playerSignupDate.getMonth();

                const signupDay =
                    this.playerSignupDate.getDate();

                const birthdayThisYear = new Date(
                    now.getFullYear(),
                    signupMonth,
                    signupDay
                );

                const birthdayDate =
                    birthdayThisYear < now
                        ? new Date(
                            now.getFullYear() + 1,
                            signupMonth,
                            signupDay
                        )
                        : birthdayThisYear;

                const daysUntil = Math.floor(
                    (birthdayDate - now) /
                    (1000 * 60 * 60 * 24)
                );

                const years =
                    this.getYearsInTorn() + 1;

                upcomingEvents.push({
                    name: "Your Torn Birthday",
                    feature: `${years} years in Torn`,
                    notification:
                        `Your Torn anniversary is coming up!`,
                    isBirthday: true,
                    daysUntil
                });
            }

            return upcomingEvents;
        },

        // Live events straight from the API calendar (global window
        // [start, end) contains now) that the static active rotation does
        // not already show — matched year-suffix-tolerantly, so API
        // "CaffeineCon 2026" dedupes against the curated "CaffeineCon 2025"
        // entry while brand-new events with no static twin still display.
        getApiLiveEvents(activeEvents) {
            if (!Array.isArray(this.tornEvents)) return [];

            const currentTime = Math.round(Date.now() / 1000);

            const liveNames = new Set(
                activeEvents
                    .map(event =>
                        this.stripEventYearSuffix(
                            this.normalizeEventName(event?.name)
                        )
                    )
                    .filter(Boolean)
            );

            const out = [];

            for (const event of this.tornEvents) {
                const globalStart = Number(event?.start);
                const globalEnd = Number(event?.end);

                if (!Number.isFinite(globalStart)) continue;
                if (currentTime < globalStart) continue;

                if (
                    Number.isFinite(globalEnd) &&
                    currentTime >= globalEnd
                ) {
                    continue;
                }

                const baseName = this.stripEventYearSuffix(
                    this.normalizeEventName(event?.title)
                );

                if (!baseName) continue;
                if (liveNames.has(baseName)) continue;

                out.push({
                    name: event.title,
                    feature: event.subtitle || '',
                    notification: event.description || '',
                    start: globalStart
                });
            }

            return out;
        },

        /**
         * One entry list for the whole ticker rotation: static actives
         * (auto-corrected dates), API-window live events, the countdown to
         * the nearest future API event, and static upcomings. The countdown
         * used to early-return and monopolize the ticker — folding it in as
         * a rotation entry is what lets a live event display WHILE the
         * next-event timer keeps ticking.
         */
        async buildRotationEntries() {
            const entries = [];

            const activeEvents =
                await this.getActiveEvents();

            activeEvents.forEach(event => {
                entries.push({
                    ...event,
                    type: 'active',
                    displayText: event.isBirthday
                        ? event.notification
                        : `🔴 LIVE: ${event.notification}`
                });
            });

            this.getApiLiveEvents(activeEvents).forEach(event => {
                entries.push({
                    ...event,
                    type: 'active',
                    displayText:
                        `🔴 LIVE: ${event.notification || event.name}`
                });
            });

            if (this.nearestEvent) {
                const currentTime =
                    Math.round(Date.now() / 1000);

                const timeUntil =
                    this.nearestEvent.start - currentTime;

                if (timeUntil > 0) {
                    entries.push({
                        name: this.nearestEvent.title,
                        type: 'countdown',
                        displayText:
                            `⏰ Next Event: ${this.nearestEvent.title} in ${this.formatCountdown(timeUntil)}`
                    });
                }
            }

            const nearestBaseName =
                this.stripEventYearSuffix(
                    this.normalizeEventName(
                        this.nearestEvent?.title
                    )
                );

            this.getUpcomingEvents(7)
                .filter(event => {
                    const daysUntil =
                        this.getDaysUntil(event);

                    if (daysUntil > 7) return false;

                    // The nearest event already has its own countdown
                    // entry — don't duplicate it as a "Coming" line.
                    const baseName =
                        this.stripEventYearSuffix(
                            this.normalizeEventName(event.name)
                        );

                    return (
                        !nearestBaseName ||
                        baseName !== nearestBaseName
                    );
                })
                .forEach(event => {
                    if (
                        event.isBirthday &&
                        event.daysUntil !== undefined
                    ) {
                        const daysText =
                            event.daysUntil === 0
                                ? 'tomorrow'
                                : event.daysUntil === 1
                                    ? 'in 1 day'
                                    : `in ${event.daysUntil} days`;

                        entries.push({
                            ...event,
                            type: 'upcoming',
                            displayText:
                                `🎂 Your Torn Birthday is ${daysText}! (${event.feature})`
                        });
                    } else {
                        const daysUntil =
                            this.getDaysUntil(event);

                        const timeText =
                            daysUntil === 0
                                ? 'tomorrow'
                                : daysUntil === 1
                                    ? 'in 1 day'
                                    : `in ${daysUntil + 1} days`;

                        entries.push({
                            ...event,
                            type: 'upcoming',
                            displayText:
                                `📅 Coming ${timeText}: ${event.name} - ${event.feature}`
                        });
                    }
                });

            return entries;
        },

        async updateTickerDisplay(prebuiltEntries) {
            if (!this.tickerElement) {
                console.warn(
                    '⚠️ Event Ticker: tickerElement not ready, skipping update'
                );
                return;
            }

            if (this.isUpdating) {
                console.log(
                    '⚠️ Event Ticker: Update already in progress, skipping'
                );
                return;
            }

            this.isUpdating = true;

            try {
                const allRelevantEvents = Array.isArray(prebuiltEntries)
                    ? prebuiltEntries
                    : await this.buildRotationEntries();

                let displayText = '';

                console.log(
                    '🔄 Event Ticker: Updating display...',
                    {
                        nearestEvent: !!this.nearestEvent,
                        rotationCount: allRelevantEvents.length,
                        currentIndex: this.currentEventIndex
                    }
                );

                if (allRelevantEvents.length > 0) {
                    const eventToShow =
                        allRelevantEvents[
                        this.currentEventIndex %
                        allRelevantEvents.length
                        ];

                    displayText =
                        eventToShow.displayText;

                    console.log(
                        `✅ Event Ticker: Showing event ${(this.currentEventIndex % allRelevantEvents.length) + 1}/${allRelevantEvents.length}:`,
                        eventToShow.name,
                        `(${eventToShow.type})`
                    );

                    this.setTickerText(displayText);
                } else {
                    const nextEvent =
                        await this.getNextEvent();

                    if (nextEvent) {
                        const timeUntilSeconds =
                            Math.floor(
                                nextEvent.timeDiff / 1000
                            );

                        if (nextEvent.isBirthday) {
                            displayText =
                                `🎂 Next Event: Your Torn Birthday in ${this.formatCountdown(timeUntilSeconds)}`;
                        } else {
                            displayText =
                                `⏰ Next Event: ${nextEvent.name} in ${this.formatCountdown(timeUntilSeconds)}`;
                        }

                        console.log(
                            '✅ Event Ticker: Showing countdown to next event:',
                            nextEvent.name
                        );
                    } else {
                        displayText =
                            '✨ No events currently scheduled - Stay sharp, stay violent';

                        console.log(
                            '📭 Event Ticker: No next event found, showing fallback message'
                        );
                    }

                    this.setTickerText(displayText);
                }
            } finally {
                this.isUpdating = false;
            }
        },

        setTickerText(text) {
            if (
                !this.tickerElement ||
                !this.tickerWrapper
            ) {
                return;
            }

            if (this.tickerAnimation) {
                this.tickerAnimation.cancel();
                this.tickerAnimation = null;
            }

            this.tickerElement.textContent = text;
            this.tickerElement.style.opacity = '1';

            const wrapperWidth = Math.max(
                1,
                this.tickerWrapper.clientWidth
            );

            const textWidth = Math.max(
                1,
                this.tickerElement.scrollWidth
            );

            const startTransform =
                `translate3d(${wrapperWidth}px, 0, 0)`;

            const endTransform =
                `translate3d(-${textWidth}px, 0, 0)`;

            if (
                typeof this.tickerElement.animate ===
                'function'
            ) {
                this.tickerAnimation =
                    this.tickerElement.animate(
                        [
                            {
                                transform:
                                    startTransform
                            },
                            {
                                transform:
                                    endTransform
                            }
                        ],
                        {
                            duration:
                                this.tickerAnimationDuration,
                            easing: 'linear',
                            fill: 'forwards'
                        }
                    );
            } else {
                this.tickerElement.style.transition =
                    'none';

                this.tickerElement.style.transform =
                    startTransform;

                requestAnimationFrame(() => {
                    this.tickerElement.style.transition =
                        `transform ${this.tickerAnimationDuration}ms linear`;

                    this.tickerElement.style.transform =
                        endTransform;
                });
            }
        },

        getDaysUntil(event) {
            const now = new Date();
            const currentYear = now.getFullYear();

            let eventStart = new Date(
                currentYear,
                event.startMonth - 1,
                event.startDay
            );

            if (eventStart < now) {
                eventStart = new Date(
                    currentYear + 1,
                    event.startMonth - 1,
                    event.startDay
                );
            }

            const diffTime = eventStart - now;

            return Math.floor(
                diffTime / (1000 * 60 * 60 * 24)
            );
        },

        startRotation() {
            this.scheduleNextRotation();

            console.log(
                '✅ Event Ticker: Sequential rotation started'
            );
        },

        async scheduleNextRotation() {
            // Build the same entry list the display renders so the
            // rotation index and logged X/Y totals match reality.
            const entries =
                await this.buildRotationEntries();

            const totalEvents = entries.length;

            if (totalEvents > 1) {
                this.currentEventIndex++;

                console.log(
                    `🔄 Event Ticker: Rotating to event ${(this.currentEventIndex % totalEvents) + 1}/${totalEvents}`
                );
            }

            await this.updateTickerDisplay(entries);

            this.rotationInterval = setTimeout(() => {
                this.scheduleNextRotation();
            }, 12000);
        },

        normalizeEventName(name) {
            if (!name) return '';

            return name
                .toLowerCase()
                .trim()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, ' ');
        },

        async getEventDates(event) {
            try {
                const storage =
                    await window.SidekickModules.Core.ChromeStorage.get(
                        'event_calendar_overrides'
                    );

                const overrides =
                    this.extractOverridesMap(storage);

                const normalized =
                    this.normalizeEventName(event.name);

                const override =
                    overrides[normalized];

                if (override) {
                    console.log(
                        `📅 Using calendar override for "${event.name}":`,
                        override
                    );

                    return {
                        startMonth: override.startMonth,
                        startDay: override.startDay,
                        endMonth: override.endMonth,
                        endDay: override.endDay
                    };
                }

                return {
                    startMonth: event.startMonth,
                    startDay: event.startDay,
                    endMonth: event.endMonth,
                    endDay: event.endDay
                };
            } catch (error) {
                console.error(
                    '❌ Error getting event dates:',
                    error
                );

                return {
                    startMonth: event.startMonth,
                    startDay: event.startDay,
                    endMonth: event.endMonth,
                    endDay: event.endDay
                };
            }
        },

        stopRotation() {
            if (this.rotationInterval) {
                clearTimeout(this.rotationInterval);
                this.rotationInterval = null;
            }
        },

        destroy() {
            this.stopRotation();

            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }

            if (this.tickerAnimation) {
                this.tickerAnimation.cancel();
                this.tickerAnimation = null;
            }

            this.calendarRefreshInFlight = false;
            this.isUpdating = false;

            if (
                this.tickerElement &&
                this.tickerElement.parentElement
            ) {
                this.tickerElement.parentElement.remove();
            }

            this.tickerElement = null;
            this.tickerWrapper = null;
        }
    };

    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    window.SidekickModules.EventTicker = EventTicker;

    console.log('✅ Event Ticker Module loaded');
})();