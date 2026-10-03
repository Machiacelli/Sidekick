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

    const EventNotifierModule = {
        name: 'EventNotifier',
        isInitialized: false,

        // ---- state ----
        isEnabled: false,
        leadTimeHours: 24,              // fire N hours before event start
        eventsEnabled: {},              // { "<normalized event name>": true/false }
        checkTimer: null,
        bannerElement: null,
        lastSystemNotifAckKey: null,    // ackKey of the most recent OS notification sent

        // ---- settings ----

        async loadSettings() {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get(STORAGE_KEY) || {};
                this.isEnabled = !!data.isEnabled;
                this.leadTimeHours = Number(data.leadTimeHours) > 0 ? Number(data.leadTimeHours) : 24;
                this.eventsEnabled = (data.events && typeof data.events === 'object') ? { ...data.events } : {};
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
                await window.SidekickModules.Core.ChromeStorage.set(STORAGE_KEY, data);
            } catch (e) {
                console.error('[Event Notifier] Failed to save settings:', e);
            }
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
         * Build the list of candidate events with their start timestamps (ms).
         * EventTicker's live API calendar (tornEvents with unix `start`) takes
         * priority; the static array only supplies events the API didn't
         * return. Read-only reuse of those sources — we never modify them.
         */
        async getUpcomingEventTimestamps() {
            const ticker = window.SidekickModules?.EventTicker;
            if (!ticker) return [];

            const now = new Date();
            const out = [];
            const seenNames = new Set();

            // 1. API-backed calendar first (unix seconds, personal-start-time
            //    aware via the ticker's resolver). These are the freshest
            //    dates, so any matching static entry is skipped below.
            const eventsFromApi = Array.isArray(ticker.tornEvents) ? ticker.tornEvents : [];
            for (const event of eventsFromApi) {
                if (typeof ticker.resolveEventStartTime !== 'function') continue;
                const resolved = ticker.resolveEventStartTime(event);
                if (resolved === null || !Number.isFinite(Number(resolved))) continue;

                const title = event.title || 'Event';
                const normalizedName = this.normalizeEventName(title);
                seenNames.add(normalizedName);

                out.push({
                    name: title,
                    normalizedName,
                    feature: event.subtitle || '',
                    notificationText: event.description || '',
                    start: Number(resolved) * 1000,
                    fromApi: true
                });
            }

            // 2. Static fallback entries — only for events the API calendar
            //    didn't cover (keeps dates consistent; avoids double-alerts).
            const staticEvents = Array.isArray(ticker.events) ? ticker.events : [];

            for (const event of staticEvents) {
                const normalizedName = this.normalizeEventName(event.name);
                if (seenNames.has(normalizedName)) continue; // API already covered it

                try {
                    const dates = await ticker.getEventDates(event);
                    const startMonth = Number(dates.startMonth);
                    const startDay = Number(dates.startDay);
                    if (!startMonth || !startDay) continue;

                    // This year's occurrence; if already past, the next
                    // occurrence is next year.
                    let startDate = new Date(now.getFullYear(), startMonth - 1, startDay);

                    if (startDate.getTime() <= now) {
                        startDate = new Date(now.getFullYear() + 1, startMonth - 1, startDay);
                    }

                    seenNames.add(normalizedName);
                    out.push({
                        name: event.name,
                        normalizedName,
                        feature: event.feature || '',
                        notificationText: event.notification || '',
                        start: startDate.getTime(),
                        fromApi: false
                    });
                } catch (e) {
                    console.warn('[Event Notifier] Failed processing event dates for', event?.name, e);
                }
            }

            return out;
        },

        // Unique-per-occurrence key: same event firing in Nov 2026 and Nov 2027
        // gets different keys, so it re-fires each year even after acknowledging.
        buildAcknowledgementKey(event) {
            const year = new Date(event.start).getFullYear();
            return `${event.normalizedName}#${year}`;
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
                const acknowledged = await this.getAcknowledged();
                const upcoming = await this.getUpcomingEventTimestamps();
                const leadMs = this.leadTimeHours * 60 * 60 * 1000;
                const now = Date.now();

                // Find the highest-priority unacknowledged event within lead time
                let alertEvent = null;
                for (const event of upcoming) {
                    const isUserEnabled = this.eventsEnabled[event.normalizedName] === true;

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
            this.hideBanner();
            this.isInitialized = false;
        }
    };

    if (!window.SidekickModules) window.SidekickModules = {};
    window.SidekickModules.EventNotifier = EventNotifierModule;
    console.log('[Event Notifier] Module registered');
})();
