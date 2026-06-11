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
        userEventEndTime: null,
        lastApiUpdate: 0,
        apiUpdateInterval: 1800, // 30 minutes in seconds
        countdownInterval: null,

        // Event data from events.txt
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
                notification: "Drink up – St. Patrick's Day bonuses live."
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
                notification: "Half-price blood loss today. Go stab someone to celebrate."
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
                notification: "Cheers! Every pint is five crimes closer to jail."
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
                notification: "Stock the Red Cow, it's CaffeineCon time."
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
                notification: "World Diabetes Day: Torn's running on pure sugar highs."
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

            console.log('🎪 Event Ticker: Initializing...');

            // Load cached user event start time
            try {
                const storage = await window.SidekickModules.Core.ChromeStorage.get('userEventStartTime');
                if (storage && storage.userEventStartTime) {
                    this.userEventStartTime = storage.userEventStartTime;
                    console.log('📦 Event Ticker: Loaded cached user event start time:', this.userEventStartTime);
                }

                // Load cached user event end time
                const endStorage = await window.SidekickModules.Core.ChromeStorage.get('userEventEndTime');
                if (endStorage && endStorage.userEventEndTime) {
                    this.userEventEndTime = endStorage.userEventEndTime;
                    console.log('📦 Event Ticker: Loaded cached user event end time:', this.userEventEndTime);
                }
            } catch (error) {
                console.warn('⚠️ Event Ticker: Error loading cached times:', error);
            }

            // Fetch player's Torn birthday
            this.fetchPlayerBirthday();

            // Scrape calendar if needed (yearly)
            this.scrapeCalendarPage().catch(err => {
                console.warn('⚠️ Event Ticker: Calendar scrape failed (non-fatal):', err);
            });

            // Fetch nearest event from Torn calendar
            this.fetchNearestEvent();

            // Start countdown timer
            this.startCountdown();

            // Wait for sidebar to be created
            this.waitForTicker();

            this.isInitialized = true;
        },

        async fetchPlayerBirthday() {
            if (this.playerBirthdayChecked) return;

            try {
                console.log('🎂 Event Ticker: Fetching player birthday from Torn API...');
                const storage = await window.SidekickModules.Core.ChromeStorage.get('torn_api_key');
                const apiKey = (storage && storage.torn_api_key) ? storage.torn_api_key : '';

                if (!apiKey) {
                    console.log('⚠️ Event Ticker: No API key found, skipping birthday check');
                    this.playerBirthdayChecked = true;
                    return;
                }

                const response = await fetch(`https://api.torn.com/user/?selections=profile&key=${apiKey}`);
                const data = await response.json();

                if (data.error) {
                    console.error('❌ Event Ticker: API error:', data.error);
                    this.playerBirthdayChecked = true;
                    return;
                }

                if (data.signup) {
                    this.playerSignupDate = new Date(data.signup);
                    console.log('✅ Event Ticker: Player joined Torn on', data.signup);

                    const yearsInTorn = this.getYearsInTorn();
                    console.log(`🎉 Event Ticker: Player has been in Torn for ${yearsInTorn} years!`);
                }

                this.playerBirthdayChecked = true;
            } catch (error) {
                console.error('❌ Event Ticker: Failed to fetch player birthday:', error);
                this.playerBirthdayChecked = true;
            }
        },

        async fetchNearestEvent() {
            try {
                const currentTime = Math.round(Date.now() / 1000);
                const cachedEvents = await window.SidekickModules.Core.ChromeStorage.get('torn_events');
                const lastUpdateStorage = await window.SidekickModules.Core.ChromeStorage.get('torn_events_update');
                const lastUpdate = (lastUpdateStorage && lastUpdateStorage.torn_events_update) ? lastUpdateStorage.torn_events_update : 0;

                // Check if we need to update (30 min interval)
                if (cachedEvents && cachedEvents.torn_events && (currentTime - lastUpdate) < this.apiUpdateInterval) {
                    this.tornEvents = cachedEvents.torn_events;
                    this.calculateNearestEvent();
                    return;
                }

                console.log('🔄 Event Ticker: Fetching Torn calendar from API...');
                const storage = await window.SidekickModules.Core.ChromeStorage.get('torn_api_key');
                const apiKey = (storage && storage.torn_api_key) ? storage.torn_api_key : '';

                if (!apiKey) {
                    console.log('⚠️ Event Ticker: No API key for calendar fetch');
                    return;
                }

                const response = await fetch(`https://api.torn.com/v2/torn/?selections=calendar&key=${apiKey}`);
                const data = await response.json();

                if (data.error) {
                    console.error('❌ Event Ticker: Calendar API error:', data.error);
                    return;
                }

                if (data.calendar) {
                    // Store user's personal event start time from calendar
                    if (data.calendar.start_time) {
                        this.userEventStartTime = data.calendar.start_time.toLowerCase().split(" tct")[0];
                        await window.SidekickModules.Core.ChromeStorage.set('userEventStartTime', this.userEventStartTime);
                        console.log('⏰ Event Ticker: User personal event start time:', this.userEventStartTime);
                    }

                    // Store user's personal event end time from calendar
                    if (data.calendar.end_time) {
                        this.userEventEndTime = data.calendar.end_time.toLowerCase().split(" tct")[0];
                        await window.SidekickModules.Core.ChromeStorage.set('userEventEndTime', this.userEventEndTime);
                        console.log('⏰ Event Ticker: User personal event end time:', this.userEventEndTime);
                    }

                    let events = data.calendar.events || [];
                    if (data.calendar.competitions) {
                        events = events.concat(data.calendar.competitions);
                    }

                    this.tornEvents = events;
                    await window.SidekickModules.Core.ChromeStorage.set('torn_events', events);
                    await window.SidekickModules.Core.ChromeStorage.set('torn_events_update', currentTime);

                    // AUTO-CORRECT hardcoded dates using API data
                    await this.autoCorrectEventDates(events);

                    console.log(`✅ Event Ticker: Fetched ${events.length} Torn events`);
                    this.calculateNearestEvent();
                }
            } catch (error) {
                console.error('❌ Event Ticker: Failed to fetch calendar:', error);
            }
        },

        // Auto-correct hardcoded dates when API provides better data
        async autoCorrectEventDates(apiEvents) {
            try {
                const storage = await window.SidekickModules.Core.ChromeStorage.get('event_calendar_overrides');
                const overrides = storage?.event_calendar_overrides || {};
                let correctionsMade = 0;

                for (const apiEvent of apiEvents) {
                    if (!apiEvent.title || !apiEvent.start) continue;

                    const normalizedApiName = this.normalizeEventName(apiEvent.title);

                    // Find matching hardcoded event
                    const hardcodedEvent = this.events.find(e =>
                        this.normalizeEventName(e.name) === normalizedApiName
                    );

                    if (hardcodedEvent) {
                        // Convert API timestamps to month/day
                        const apiStartDate = new Date(apiEvent.start * 1000);
                        const apiEndDate = apiEvent.end ? new Date(apiEvent.end * 1000) : apiStartDate;

                        const apiDates = {
                            startMonth: apiStartDate.getUTCMonth() + 1,
                            startDay: apiStartDate.getUTCDate(),
                            endMonth: apiEndDate.getUTCMonth() + 1,
                            endDay: apiEndDate.getUTCDate()
                        };

                        // Check if dates differ from hardcoded
                        const datesDiffer =
                            apiDates.startMonth !== hardcodedEvent.startMonth ||
                            apiDates.startDay !== hardcodedEvent.startDay ||
                            apiDates.endMonth !== hardcodedEvent.endMonth ||
                            apiDates.endDay !== hardcodedEvent.endDay;

                        if (datesDiffer) {
                            overrides[normalizedApiName] = apiDates;
                            correctionsMade++;

                            console.log(`📅 AUTO-CORRECTED "${hardcodedEvent.name}": ${hardcodedEvent.startMonth}/${hardcodedEvent.startDay} → ${apiDates.startMonth}/${apiDates.startDay}`);
                        }
                    }
                }

                if (correctionsMade > 0) {
                    await window.SidekickModules.Core.ChromeStorage.set('event_calendar_overrides', overrides);
                    console.log(`✅ Auto-corrected ${correctionsMade} event date(s) from API`);
                }

            } catch (error) {
                console.error('❌ Failed to auto-correct event dates:', error);
            }
        },

        calculateNearestEvent() {
            if (!this.tornEvents || this.tornEvents.length === 0) return;

            const currentTime = Math.round(Date.now() / 1000);
            let upcomingEvents = [];

            // Check if user's personal event has ended
            let userEventEnded = false;
            let userEndTimestamp = null;
            if (this.userEventEndTime) {
                try {
                    const userEndDate = new Date(this.userEventEndTime);
                    userEndTimestamp = Math.round(userEndDate.getTime() / 1000);
                    if (currentTime >= userEndTimestamp) {
                        userEventEnded = true;
                        console.log('⏰ Event Ticker: User\'s personal event period has ended');
                    }
                } catch (e) {
                    console.warn('Failed to parse user event end time:', e);
                }
            }

            for (let event of this.tornEvents) {
                // Use user's personal event start time if available
                let eventStartTime = event.start;

                if (this.userEventStartTime && event.title && event.title.toLowerCase().includes('competition')) {
                    try {
                        const userStartDate = new Date(this.userEventStartTime);
                        const userStartTimestamp = Math.round(userStartDate.getTime() / 1000);

                        if (Math.abs(userStartTimestamp - event.start) < 86400) { // Within 24 hours
                            eventStartTime = userStartTimestamp;
                            console.log(`⏰ Using personal start time for ${event.title}: ${this.userEventStartTime}`);
                        }
                    } catch (e) {
                        console.warn('Failed to parse user event start time:', e);
                    }
                }

                // Skip ACTIVE competitions if user's personal event period has ended
                if (userEventEnded && event.title && event.title.toLowerCase().includes('competition')) {
                    const diff = eventStartTime - currentTime;
                    if (diff < 0) {
                        console.log(`⏰ Skipping active ${event.title} - user's event period ended`);
                        continue;
                    }
                }

                const diff = eventStartTime - currentTime;
                if (diff >= 0) {
                    upcomingEvents.push({ ...event, start: eventStartTime, diff: diff });
                }
            }

            if (upcomingEvents.length === 0) {
                this.nearestEvent = null;
                console.log('⏰ Event Ticker: No upcoming events found');
                return;
            }

            upcomingEvents.sort((a, b) => a.diff - b.diff);
            this.nearestEvent = upcomingEvents[0];

            console.log('⏱️ Event Ticker: Next event:', this.nearestEvent.title, 'in', this.formatCountdown(this.nearestEvent.diff));
        },

        formatCountdown(seconds) {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;

            if (days > 0) {
                return `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        },

        startCountdown() {
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
            }

            this.countdownInterval = setInterval(() => {
                if (this.nearestEvent) {
                    const currentTime = Math.round(Date.now() / 1000);
                    const timeUntil = this.nearestEvent.start - currentTime;

                    if (timeUntil <= 0) {
                        this.fetchNearestEvent();
                    }
                }
            }, 1000);
        },

        getYearsInTorn() {
            if (!this.playerSignupDate) return 0;

            const now = new Date();
            const years = now.getFullYear() - this.playerSignupDate.getFullYear();

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
            const signupMonth = this.playerSignupDate.getMonth();
            const signupDay = this.playerSignupDate.getDate();

            return now.getMonth() === signupMonth && now.getDate() === signupDay;
        },

        isTornBirthdaySoon(daysAhead = 7) {
            if (!this.playerSignupDate) return false;

            const now = new Date();
            const signupMonth = this.playerSignupDate.getMonth();
            const signupDay = this.playerSignupDate.getDate();

            let birthdayThisYear = new Date(now.getFullYear(), signupMonth, signupDay);

            if (birthdayThisYear < now) {
                birthdayThisYear = new Date(now.getFullYear() + 1, signupMonth, signupDay);
            }

            const daysUntil = Math.floor((birthdayThisYear - now) / (1000 * 60 * 60 * 24));
            return daysUntil >= 0 && daysUntil <= daysAhead;
        },

        waitForTicker() {
            let attempts = 0;
            const maxAttempts = 100; // 10 seconds

            const checkTicker = setInterval(() => {
                attempts++;
                const placeholder = document.getElementById('sidekick-ticker-placeholder');

                if (placeholder) {
                    console.log('✅ Event Ticker: Found placeholder, creating ticker...');
                    clearInterval(checkTicker);
                    this.createTicker();
                    this.startRotation();
                } else if (attempts >= maxAttempts) {
                    console.error('❌ Event Ticker: Timeout waiting for placeholder after 10 seconds');
                    clearInterval(checkTicker);
                }
            }, 100);
        },

        createTicker() {
            if (document.getElementById('sidekick-event-ticker')) {
                console.log('⚠️ Event Ticker: Ticker already exists, skipping creation');
                return;
            }

            const placeholder = document.getElementById('sidekick-ticker-placeholder');
            if (!placeholder) {
                console.warn('⚠️ Event Ticker: Placeholder not found, retrying in 200ms...');
                setTimeout(() => this.createTicker(), 200);
                return;
            }

            console.log('🎪 Event Ticker: Creating ticker element...');

            // Add CSS keyframes for scrolling animation
            if (!document.getElementById('sidekick-ticker-styles')) {
                const style = document.createElement('style');
                style.id = 'sidekick-ticker-styles';
                style.textContent = `
                    @keyframes sidekick-ticker-scroll {
                        0% { transform: translateX(100%); }
                        100% { transform: translateX(-100%); }
                    }
                    
                    .sidekick-ticker-scrolling {
                        animation: sidekick-ticker-scroll 20s linear infinite;
                    }
                `;
                document.head.appendChild(style);
            }

            // Create ticker container
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

            // Scrolling wrapper
            const scrollWrapper = document.createElement('div');
            scrollWrapper.style.cssText = `
                flex: 1;
                overflow: hidden;
                position: relative;
            `;

            // Text container with scrolling animation
            const textContainer = document.createElement('div');
            textContainer.id = 'sidekick-ticker-text';
            textContainer.className = 'sidekick-ticker-scrolling';
            textContainer.style.cssText = `
                color: #ccc;
                font-size: 11px;
                white-space: nowrap;
                display: inline-block;
                transition: opacity 0.3s ease;
            `;

            scrollWrapper.appendChild(textContainer);
            ticker.appendChild(scrollWrapper);

            // Append to placeholder instead of replacing it
            placeholder.innerHTML = '';
            placeholder.appendChild(ticker);

            this.tickerElement = textContainer;
            console.log('✅ Event Ticker: Created seamlessly in top bar');

            // Show initial message
            this.updateTickerDisplay();
        },

        // ===== UTC TIMING HELPERS =====

        // Get current time in UTC (Torn uses UTC/TCT)
        getCurrentUTC() {
            const now = new Date();
            return new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                now.getUTCHours(),
                now.getUTCMinutes(),
                now.getUTCSeconds()
            ));
        },

        // Check if a date is within an event's range (UTC-based)
        async isEventActive(event, now = null) {
            // Use UTC if no time provided
            if (!now) {
                now = this.getCurrentUTC();
            }

            const currentYear = now.getUTCFullYear();
            const currentMonth = now.getUTCMonth() + 1;
            const currentDay = now.getUTCDate();

            // Get merged dates (calendar override + hardcoded fallback)
            const dates = await this.getEventDates(event);

            // Create UTC dates for comparison
            let startDate = new Date(Date.UTC(currentYear, dates.startMonth - 1, dates.startDay, 0, 0, 0));
            let endDate = new Date(Date.UTC(currentYear, dates.endMonth - 1, dates.endDay, 0, 0, 0));

            // Handle events that span year boundary
            if (dates.endMonth < dates.startMonth) {
                if (currentMonth >= dates.startMonth) {
                    endDate = new Date(Date.UTC(currentYear + 1, dates.endMonth - 1, dates.endDay, 0, 0, 0));
                } else {
                    startDate = new Date(Date.UTC(currentYear - 1, dates.startMonth - 1, dates.startDay, 0, 0, 0));
                }
            }

            return now >= startDate && now < endDate; // Use < instead of <= for end date
        },

        async getActiveEvents() {
            const now = this.getCurrentUTC(); // Use UTC for consistency

            // Filter active events with async isEventActive
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
                    notification: `🎂 Happy Torn Birthday! ${years} year${years !== 1 ? 's' : ''} of mayhem and counting!`,
                    isBirthday: true
                });
            }

            return activeEvents;
        },

        // Get the next upcoming event (for countdown)
        getNextEvent() {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentTime = now.getTime();

            let nextEvent = null;
            let minTimeDiff = Infinity;

            // Check all events for the current year and next year
            for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
                const checkYear = currentYear + yearOffset;

                for (const event of this.events) {
                    const eventStart = new Date(checkYear, event.startMonth - 1, event.startDay);
                    eventStart.setHours(0, 0, 0, 0);

                    const timeDiff = eventStart.getTime() - currentTime;

                    // Only consider future events
                    if (timeDiff > 0 && timeDiff < minTimeDiff) {
                        minTimeDiff = timeDiff;
                        nextEvent = {
                            ...event,
                            startDate: eventStart,
                            timeDiff: timeDiff
                        };
                    }
                }
            }

            // Check for upcoming birthday if we have player data
            if (this.playerSignupDate && !this.isTornBirthdayToday()) {
                const nextBirthday = this.getNextBirthday();
                if (nextBirthday) {
                    const birthdayDiff = nextBirthday.getTime() - currentTime;
                    if (birthdayDiff > 0 && birthdayDiff < minTimeDiff) {
                        const years = this.getYearsInTorn() + 1;
                        nextEvent = {
                            name: "Your Torn Birthday",
                            feature: `${years} year${years !== 1 ? 's' : ''} celebration`,
                            startDate: nextBirthday,
                            timeDiff: birthdayDiff,
                            isBirthday: true
                        };
                    }
                }
            }

            return nextEvent;
        },

        // Get next birthday date
        getNextBirthday() {
            if (!this.playerSignupDate) return null;

            const now = new Date();
            const currentYear = now.getFullYear();
            const signupMonth = this.playerSignupDate.getMonth();
            const signupDay = this.playerSignupDate.getDate();

            let nextBirthday = new Date(currentYear, signupMonth, signupDay);
            nextBirthday.setHours(0, 0, 0, 0);

            // If this year's birthday has passed, get next year's
            if (nextBirthday <= now) {
                nextBirthday = new Date(currentYear + 1, signupMonth, signupDay);
                nextBirthday.setHours(0, 0, 0, 0);
            }

            return nextBirthday;
        },

        getUpcomingEvents(daysAhead = 7) {
            const now = new Date();
            const future = new Date(now.getTime() + (daysAhead * 24 * 60 * 60 * 1000));

            const upcomingEvents = this.events.filter(event => {
                const currentYear = now.getFullYear();
                let eventStart = new Date(currentYear, event.startMonth - 1, event.startDay);

                if (eventStart < now) {
                    eventStart = new Date(currentYear + 1, event.startMonth - 1, event.startDay);
                }

                return eventStart > now && eventStart <= future;
            });

            if (this.isTornBirthdaySoon(daysAhead) && !this.isTornBirthdayToday()) {
                const signupMonth = this.playerSignupDate.getMonth();
                const signupDay = this.playerSignupDate.getDate();
                const birthdayThisYear = new Date(now.getFullYear(), signupMonth, signupDay);
                const birthdayDate = birthdayThisYear < now
                    ? new Date(now.getFullYear() + 1, signupMonth, signupDay)
                    : birthdayThisYear;

                const daysUntil = Math.floor((birthdayDate - now) / (1000 * 60 * 60 * 24));
                const years = this.getYearsInTorn() + 1;

                upcomingEvents.push({
                    name: "Your Torn Birthday",
                    feature: `${years} years in Torn`,
                    notification: `Your Torn anniversary is coming up!`,
                    isBirthday: true,
                    daysUntil: daysUntil
                });
            }

            return upcomingEvents;
        },

        async updateTickerDisplay() {
            if (!this.tickerElement) {
                console.warn('⚠️ Event Ticker: tickerElement not ready, skipping update');
                return;
            }

            // Prevent multiple simultaneous updates
            if (this.isUpdating) {
                console.log('⚠️ Event Ticker: Update already in progress, skipping');
                return;
            }
            this.isUpdating = true;

            const activeEvents = await this.getActiveEvents(); // Now awaits async function
            const upcomingEvents = this.getUpcomingEvents(7); // Increased range to catch more events

            let displayText = '';

            console.log('🔄 Event Ticker: Updating display...', {
                nearestEvent: !!this.nearestEvent,
                activeCount: activeEvents.length,
                upcomingCount: upcomingEvents.length,
                currentIndex: this.currentEventIndex
            });

            // Priority 1: Show nearest API event countdown
            if (this.nearestEvent) {
                const currentTime = Math.round(Date.now() / 1000);
                const timeUntil = this.nearestEvent.start - currentTime;

                if (timeUntil > 0) {
                    displayText = `⏰ Next Event: ${this.nearestEvent.title} in ${this.formatCountdown(timeUntil)}`;
                    console.log('✅ Event Ticker: Showing API countdown:', displayText);
                    this.setTickerText(displayText);
                    this.isUpdating = false;
                    return;
                }
            }

            // Combine active and upcoming events for rotation
            let allRelevantEvents = [];

            // Add active events
            activeEvents.forEach(event => {
                allRelevantEvents.push({
                    ...event,
                    type: 'active',
                    displayText: event.isBirthday ? event.notification : `🔴 LIVE: ${event.notification}`
                });
            });

            // Add upcoming events (filter to next 7 days)
            upcomingEvents.filter(event => {
                const daysUntil = this.getDaysUntil(event);
                return daysUntil <= 7; // Only show events within a week
            }).forEach(event => {
                if (event.isBirthday && event.daysUntil !== undefined) {
                    const daysText = event.daysUntil === 0 ? 'tomorrow' :
                        event.daysUntil === 1 ? 'in 1 day' :
                            `in ${event.daysUntil} days`;
                    allRelevantEvents.push({
                        ...event,
                        type: 'upcoming',
                        displayText: `🎂 Your Torn Birthday is ${daysText}! (${event.feature})`
                    });
                } else {
                    const daysUntil = this.getDaysUntil(event);
                    const timeText = daysUntil === 0 ? 'tomorrow' :
                        daysUntil === 1 ? 'in 1 day' :
                            `in ${daysUntil + 1} days`;
                    allRelevantEvents.push({
                        ...event,
                        type: 'upcoming',
                        displayText: `📅 Coming ${timeText}: ${event.name} - ${event.feature}`
                    });
                }
            });

            // Show events in rotation if we have any
            if (allRelevantEvents.length > 0) {
                const eventToShow = allRelevantEvents[this.currentEventIndex % allRelevantEvents.length];
                displayText = eventToShow.displayText;

                console.log(`✅ Event Ticker: Showing event ${(this.currentEventIndex % allRelevantEvents.length) + 1}/${allRelevantEvents.length}:`, eventToShow.name, `(${eventToShow.type})`);

                this.setTickerText(displayText);
            } else {
                // Show countdown to next event when no active events
                const nextEvent = this.getNextEvent();
                if (nextEvent) {
                    const timeUntilMs = nextEvent.timeDiff;
                    const timeUntilSeconds = Math.floor(timeUntilMs / 1000);

                    if (nextEvent.isBirthday) {
                        displayText = `🎂 Next Event: Your Torn Birthday in ${this.formatCountdown(timeUntilSeconds)}`;
                    } else {
                        displayText = `⏰ Next Event: ${nextEvent.name} in ${this.formatCountdown(timeUntilSeconds)}`;
                    }
                    console.log('✅ Event Ticker: Showing countdown to next event:', nextEvent.name);
                } else {
                    displayText = '✨ No events currently scheduled - Stay sharp, stay violent';
                    console.log('📭 Event Ticker: No next event found, showing fallback message');
                }

                this.setTickerText(displayText);
            }

            this.isUpdating = false;
        },

        // Helper method to set ticker text with smooth transition
        setTickerText(text) {
            // Clear any existing transition timeout
            if (this.transitionTimeout) {
                clearTimeout(this.transitionTimeout);
            }

            this.tickerElement.style.opacity = '0.5';
            this.transitionTimeout = setTimeout(() => {
                this.tickerElement.textContent = text;
                this.tickerElement.style.opacity = '1';
                this.transitionTimeout = null;
            }, 150);
        },

        getDaysUntil(event) {
            const now = new Date();
            const currentYear = now.getFullYear();
            let eventStart = new Date(currentYear, event.startMonth - 1, event.startDay);

            if (eventStart < now) {
                eventStart = new Date(currentYear + 1, event.startMonth - 1, event.startDay);
            }

            const diffTime = eventStart - now;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
        },

        startRotation() {
            this.scheduleNextRotation();
            console.log('✅ Event Ticker: Sequential rotation started');
        },

        scheduleNextRotation() {
            const activeEvents = this.getActiveEvents();
            const upcomingEvents = this.getUpcomingEvents(7).filter(event => {
                const daysUntil = this.getDaysUntil(event);
                return daysUntil <= 7;
            });

            const totalEvents = activeEvents.length + upcomingEvents.length;

            if (totalEvents > 1) {
                this.currentEventIndex++;
                console.log(`🔄 Event Ticker: Rotating to event ${(this.currentEventIndex % totalEvents) + 1}/${totalEvents}`);
            }

            this.updateTickerDisplay();

            // Schedule next rotation only after current one completes
            this.rotationInterval = setTimeout(() => {
                this.scheduleNextRotation();
            }, 12000); // 12 seconds per message
        },

        // ===== CALENDAR SCRAPING SYSTEM =====

        // Normalize event name for matching (lowercase, trim, remove special chars)
        normalizeEventName(name) {
            if (!name) return '';
            return name
                .toLowerCase()
                .trim()
                .replace(/[^\w\s]/g, '') // Remove punctuation
                .replace(/\s+/g, ' '); // Normalize spaces
        },

        // Check if we should scrape the calendar
        async shouldScrapeCalendar() {
            try {
                const storage = await window.SidekickModules.Core.ChromeStorage.get('calendar_last_scraped_year');
                const lastScrapedYear = storage?.calendar_last_scraped_year || 0;
                const currentYear = new Date().getFullYear();

                console.log(`📅 Calendar scrape check: last=${lastScrapedYear}, current=${currentYear}`);
                return currentYear > lastScrapedYear;
            } catch (error) {
                console.error('❌ Error checking scrape status:', error);
                return true; // Scrape on error to be safe
            }
        },

        // Scrape Torn calendar page for event dates
        async scrapeCalendarPage(forceRefresh = false) {
            try {
                // Check if we need to scrape
                if (!forceRefresh) {
                    const shouldScrape = await this.shouldScrapeCalendar();
                    if (!shouldScrape) {
                        console.log('📅 Calendar already scraped this year, skipping');
                        return;
                    }
                }

                const isCalendarPage = window.location.pathname.includes('calendar.php');
                if (!isCalendarPage) {
                    const existing = await window.SidekickModules.Core.ChromeStorage.get('event_calendar_overrides');
                    const cachedOverrides = existing?.event_calendar_overrides || {};
                    const cachedCount = Object.keys(cachedOverrides).length;

                    console.log(`📅 Calendar scrape skipped: not on calendar.php (cached overrides: ${cachedCount})`);
                    if (!forceRefresh && cachedCount > 0) {
                        return {
                            success: true,
                            usedCachedOverrides: true,
                            cachedCount
                        };
                    }

                    console.warn('⚠️ Event Ticker: Calendar refresh requires opening Torn calendar page once (Cloudflare blocks direct background fetches).');
                    return {
                        success: false,
                        requiresCalendarPage: true,
                        cachedCount
                    };
                }

                console.log('🔄 Scraping Torn calendar page from current DOM...');
                const currentYear = new Date().getFullYear();
                const overrides = this.extractCalendarOverridesFromDocument(document);

                // Store overrides and update last scraped year
                await window.SidekickModules.Core.ChromeStorage.set('event_calendar_overrides', overrides);
                await window.SidekickModules.Core.ChromeStorage.set('calendar_last_scraped_year', currentYear);

                console.log(`✅ Calendar scraped successfully! Found ${Object.keys(overrides).length} events`);
                console.log('📅 Event overrides:', overrides);

                return overrides;

            } catch (error) {
                console.error('❌ Failed to scrape calendar:', error);
                return null;
            }
        },

        extractCalendarOverridesFromDocument(doc) {
            const overrides = {};

            // Torn calendar markup can vary, so try multiple selectors.
            const eventElements = doc.querySelectorAll(
                '.calendarEvents .event, .calendar-wrap .event-item, .calendar-event, div[class*="calendar"] div[class*="event"]'
            );
            console.log(`📅 Found ${eventElements.length} event elements on calendar`);

            const monthMap = {
                'jan': 1, 'january': 1,
                'feb': 2, 'february': 2,
                'mar': 3, 'march': 3,
                'apr': 4, 'april': 4,
                'may': 5,
                'jun': 6, 'june': 6,
                'jul': 7, 'july': 7,
                'aug': 8, 'august': 8,
                'sep': 9, 'sept': 9, 'september': 9,
                'oct': 10, 'october': 10,
                'nov': 11, 'november': 11,
                'dec': 12, 'december': 12
            };

            eventElements.forEach(eventEl => {
                try {
                    const nameEl = eventEl.querySelector('.event-name, .name, h3, h4, strong, b') || eventEl;
                    const eventName = nameEl.textContent?.trim();
                    if (!eventName) return;

                    const dateEl = eventEl.querySelector('.event-date, .date, .time');
                    const dateText = (dateEl?.textContent || eventEl.textContent || '').trim();

                    const dateMatch = dateText.match(/\b(\w+)\s+(\d+)(?:\s*[-–]\s*(?:(\w+)\s+)?(\d+))?/i);
                    if (!dateMatch) return;

                    const [, startMonth, startDay, endMonth, endDay] = dateMatch;
                    const startMonthNum = monthMap[startMonth.toLowerCase()];
                    const endMonthNum = endMonth ? monthMap[endMonth.toLowerCase()] : startMonthNum;
                    if (!startMonthNum) return;

                    const normalized = this.normalizeEventName(eventName);
                    overrides[normalized] = {
                        startMonth: startMonthNum,
                        startDay: parseInt(startDay, 10),
                        endMonth: endMonthNum,
                        endDay: parseInt(endDay || startDay, 10)
                    };

                    console.log(`✅ Scraped: "${eventName}" = ${startMonthNum}/${startDay} - ${endMonthNum}/${endDay || startDay}`);
                } catch (err) {
                    console.warn('⚠️ Failed to parse event:', err);
                }
            });

            return overrides;
        },

        // Get merged event dates (override + hardcoded fallback)
        async getEventDates(event) {
            try {
                // Load overrides from storage
                const storage = await window.SidekickModules.Core.ChromeStorage.get('event_calendar_overrides');
                const overrides = storage?.event_calendar_overrides || {};

                const normalized = this.normalizeEventName(event.name);
                const override = overrides[normalized];

                if (override) {
                    console.log(`📅 Using calendar override for "${event.name}":`, override);
                    return {
                        startMonth: override.startMonth,
                        startDay: override.startDay,
                        endMonth: override.endMonth,
                        endDay: override.endDay
                    };
                }

                // Fall back to hardcoded dates
                return {
                    startMonth: event.startMonth,
                    startDay: event.startDay,
                    endMonth: event.endMonth,
                    endDay: event.endDay
                };
            } catch (error) {
                console.error('❌ Error getting event dates:', error);
                // Fall back to hardcoded on error
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
            }
            if (this.transitionTimeout) {
                clearTimeout(this.transitionTimeout);
                this.transitionTimeout = null;
            }
            this.isUpdating = false;
            if (this.tickerElement && this.tickerElement.parentElement) {
                this.tickerElement.parentElement.remove();
            }
        }
    };

    // Register module
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }
    window.SidekickModules.EventTicker = EventTicker;

    console.log('✅ Event Ticker Module loaded');
})();