/**
 * Racing Notifier Module
 * Adds a "Track" button next to each Join button on the Torn racing page.
 * Polls the Torn API /v2/racing/races and alerts when a tracked race is
 * about to start, with race-duration conflict warnings.
 * Separate enable/disable switch from the icon-only Racing Alert.
 */

const RacingNotifierModule = {
    name: 'Racing Notifier',
    description: 'Tracks races and alerts before they start',
    version: '1.0.0',

    // Configuration
    CONFIG: {
        storageKey: 'sidekick_settings',
        subKey: 'racing-notifier',
        apiUrl: 'https://api.torn.com/v2/racing/races',
        pollMs: 30000,
        alertBeforeMinutes: 10,
        conflictWarningMinutes: 5,
        trackButtonClass: 'sidekick-race-track-btn',
        trackButtonIdPrefix: 'sidekick-race-track-',
        trackedRacesKey: 'racing-notifier-tracked',
        notifiedRacesKey: 'racing-notifier-notified',
        styleId: 'sidekick-racing-notifier-styles',
    },

    // State
    isEnabled: false,
    settings: {
        isEnabled: false,
        alertBeforeMinutes: 10,
        conflictWarningMinutes: 5,
        desktopNotifications: true,
    },
    trackedRaces: new Set(),
    notifiedRaces: new Set(),
    pollInterval: null,
    observer: null,

    // Initialize module
    async init() {
        console.log('🏁 Racing Notifier module initializing...');

        await this.loadSettings();
        await this.loadTrackedRaces();
        await this.loadNotifiedRaces();

        if (this.isEnabled) {
            this.enable();
        }

        console.log('🏁 Racing Notifier module initialized');
    },

    // Load settings from Chrome storage
    async loadSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get(this.CONFIG.storageKey);
            if (data && data[this.CONFIG.subKey]) {
                const moduleSettings = data[this.CONFIG.subKey];
                this.isEnabled = moduleSettings.isEnabled === true;
                this.settings = {
                    isEnabled: moduleSettings.isEnabled === true,
                    alertBeforeMinutes: moduleSettings.alertBeforeMinutes !== undefined ? moduleSettings.alertBeforeMinutes : 10,
                    conflictWarningMinutes: moduleSettings.conflictWarningMinutes !== undefined ? moduleSettings.conflictWarningMinutes : 5,
                    desktopNotifications: moduleSettings.desktopNotifications !== undefined ? moduleSettings.desktopNotifications : true,
                };
            } else {
                this.settings = {
                    isEnabled: false,
                    alertBeforeMinutes: 10,
                    conflictWarningMinutes: 5,
                    desktopNotifications: true,
                };
            }
        } catch (error) {
            console.error('🏁 Failed to load Racing Notifier settings:', error);
            this.settings = {
                isEnabled: false,
                alertBeforeMinutes: 10,
                conflictWarningMinutes: 5,
                desktopNotifications: true,
            };
        }
    },

    // Save settings to Chrome storage
    async saveSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get(this.CONFIG.storageKey) || {};
            data[this.CONFIG.subKey] = this.settings;
            await window.SidekickModules.Core.ChromeStorage.set(this.CONFIG.storageKey, data);
        } catch (error) {
            console.error('🏁 Failed to save Racing Notifier settings:', error);
        }
    },

    // Update settings from settings panel
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.isEnabled = this.settings.isEnabled === true;

        if (this.isEnabled) {
            this.enable();
        } else {
            this.disable();
        }

        this.saveSettings();
    },

    // Load tracked race IDs from storage
    async loadTrackedRaces() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get(this.CONFIG.trackedRacesKey);
            if (data && data[this.CONFIG.trackedRacesKey] && Array.isArray(data[this.CONFIG.trackedRacesKey])) {
                this.trackedRaces = new Set(data[this.CONFIG.trackedRacesKey]);
            }
        } catch (error) {
            console.error('🏁 Failed to load tracked races:', error);
        }
    },

    // Save tracked race IDs to storage
    async saveTrackedRaces() {
        try {
            const arr = Array.from(this.trackedRaces);
            await window.SidekickModules.Core.ChromeStorage.set(this.CONFIG.trackedRacesKey, arr);
        } catch (error) {
            console.error('🏁 Failed to save tracked races:', error);
        }
    },

    // Load notified race IDs (to avoid duplicate notifications)
    async loadNotifiedRaces() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get(this.CONFIG.notifiedRacesKey);
            if (data && data[this.CONFIG.notifiedRacesKey] && Array.isArray(data[this.CONFIG.notifiedRacesKey])) {
                this.notifiedRaces = new Set(data[this.CONFIG.notifiedRacesKey]);
            }
        } catch (error) {
            console.error('🏁 Failed to load notified races:', error);
        }
    },

    // Save notified race IDs
    async saveNotifiedRaces() {
        try {
            const arr = Array.from(this.notifiedRaces);
            await window.SidekickModules.Core.ChromeStorage.set(this.CONFIG.notifiedRacesKey, arr);
        } catch (error) {
            console.error('🏁 Failed to save notified races:', error);
        }
    },

    // Enable module
    enable() {
        console.log('🏁 Enabling Racing Notifier');
        this.isEnabled = true;
        this.settings.isEnabled = true;

        this.addStyles();
        this.startPolling();
        this.startObserver();

        if (this.isOnRacingPage()) {
            this.injectTrackButtons();
        }

        this.saveSettings();
        console.log('🏁 Racing Notifier enabled');
    },

    // Disable module
    disable() {
        console.log('🏁 Disabling Racing Notifier');
        this.isEnabled = false;
        this.settings.isEnabled = false;

        this.stopPolling();
        this.stopObserver();
        this.removeTrackButtons();

        this.saveSettings();
        console.log('🏁 Racing Notifier disabled');
    },

    // Check if current page is the Torn racing page
    isOnRacingPage() {
        return window.location.href.includes('page.php?sid=racing') ||
               window.location.href.includes('/racing');
    },

    // Inject CSS styles for track button
    addStyles() {
        if (document.getElementById(this.CONFIG.styleId)) return;

        const style = document.createElement('style');
        style.id = this.CONFIG.styleId;
        style.textContent = `
            .${this.CONFIG.trackButtonClass} {
                background: #2196F3 !important;
                color: white !important;
                border: none !important;
                border-radius: 4px !important;
                padding: 4px 8px !important;
                font-size: 11px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                margin-left: 6px !important;
                white-space: nowrap !important;
            }
            .${this.CONFIG.trackButtonClass}.tracked {
                background: #4CAF50 !important;
            }
            .${this.CONFIG.trackButtonClass}:hover {
                opacity: 0.9 !important;
            }
        `;
        document.head.appendChild(style);
    },

    // Remove track buttons from DOM
    removeTrackButtons() {
        document.querySelectorAll(`.${this.CONFIG.trackButtonClass}`).forEach(btn => btn.remove());
    },

    // Find track columns on the racing page and add track buttons to them
    injectTrackButtons() {
        if (!this.isEnabled) return;

        const trackCells = document.querySelectorAll('li.track');
        trackCells.forEach(cell => {
            const existingTrack = cell.querySelector(`.${this.CONFIG.trackButtonClass}`);
            if (existingTrack) return;

            const raceRow = cell.closest('.acc-body');
            const joinLink = raceRow?.querySelector('.join a');
            if (!joinLink) return;

            const raceId = this.extractRaceId(joinLink);
            if (!raceId) return;

            const isTracked = this.trackedRaces.has(raceId);

            const trackBtn = document.createElement('button');
            trackBtn.type = 'button';
            trackBtn.className = `${this.CONFIG.trackButtonClass} ${this.CONFIG.trackButtonIdPrefix}${raceId} ${isTracked ? 'tracked' : ''}`;
            trackBtn.setAttribute('data-race-id', raceId);
            trackBtn.setAttribute('aria-label', isTracked ? 'Untrack race' : 'Track race');
            trackBtn.textContent = isTracked ? 'Untrack' : 'Track';

            trackBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleTrackRace(raceId, trackBtn);
            });

            cell.appendChild(trackBtn);
        });
    },

    // Extract race ID from a join link element
    extractRaceId(link) {
        // Try href first (e.g. ...id=21700599...)
        const href = link.getAttribute('href');
        if (href) {
            const match = href.match(/[?&]id=(\d+)/i);
            if (match) return match[1];
        }

        // Traverse up to .acc-body and find notification-wrap input[name="id"]
        const accBody = link.closest('.acc-body');
        if (accBody) {
            const idInput = accBody.querySelector('.notification-wrap input[name="id"]');
            if (idInput && idInput.value) return idInput.value;
        }

        return null;
    },

    // Toggle tracking for a race
    async toggleTrackRace(raceId, btn) {
        if (this.trackedRaces.has(raceId)) {
            this.trackedRaces.delete(raceId);
            this.notifiedRaces.delete(raceId);
            btn.classList.remove('tracked');
            btn.textContent = 'Track';
            btn.setAttribute('aria-label', 'Track race');
        } else {
            this.trackedRaces.add(raceId);
            btn.classList.add('tracked');
            btn.textContent = 'Untrack';
            btn.setAttribute('aria-label', 'Untrack race');
        }

        await this.saveTrackedRaces();
    },

    // Start mutation observer to re-inject track buttons when DOM changes
    startObserver() {
        if (this.observer) return;

        this.observer = new MutationObserver(() => {
            if (this.isOnRacingPage() && this.isEnabled) {
                this.injectTrackButtons();
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    },

    // Stop mutation observer
    stopObserver() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    },

    // Start API polling
    startPolling() {
        if (this.pollInterval) return;

        this.pollInterval = setInterval(() => {
            this.pollRaces();
        }, this.CONFIG.pollMs);

        this.pollRaces();
    },

    // Stop API polling
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    },

    // Poll the Torn API for race data
    async pollRaces() {
        if (!this.isEnabled || this.trackedRaces.size === 0) return;

        try {
            const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
            if (!apiKey) {
                console.debug('🏁 Racing Notifier: no API key, skipping poll');
                return;
            }

            const url = `${this.CONFIG.apiUrl}?key=${encodeURIComponent(apiKey)}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.warn('🏁 Racing Notifier: API responded with status', response.status);
                return;
            }

            const data = await response.json();
            const races = data?.races || data?.data || [];

            if (!Array.isArray(races)) return;

            const now = Date.now() / 1000;
            const alertBeforeMs = this.settings.alertBeforeMinutes * 60 * 1000;
            const conflictWarningMs = this.settings.conflictWarningMinutes * 60 * 1000;

            const newlyNotified = new Set();

            for (const race of races) {
                const raceId = String(race.id);
                if (!this.trackedRaces.has(raceId)) continue;

                const startTime = race.schedule?.start;
                const endTime = race.schedule?.end;

                if (!startTime) continue;

                const timeUntilStart = (startTime - now) * 1000;

                // Alert when race is about to start
                if (timeUntilStart > 0 && timeUntilStart <= alertBeforeMs) {
                    if (!this.notifiedRaces.has(raceId) && !newlyNotified.has(raceId)) {
                        this.sendRaceStartAlert(race);
                        newlyNotified.add(raceId);
                        this.notifiedRaces.add(raceId);
                    }
                }

                // Conflict warning: race overlaps with another tracked race
                if (endTime && timeUntilStart > 0 && timeUntilStart <= conflictWarningMs) {
                    for (const otherId of this.trackedRaces) {
                        if (otherId === raceId) continue;
                        const otherRace = races.find(r => String(r.id) === otherId);
                        if (otherRace && otherRace.schedule?.end) {
                            const otherStart = otherRace.schedule.start;
                            const otherEnd = otherRace.schedule.end;
                            if (startTime < otherEnd && startTime > otherStart) {
                                if (!this.notifiedRaces.has(`conflict_${raceId}_${otherId}`)) {
                                    this.sendConflictAlert(race, otherRace);
                                    this.notifiedRaces.add(`conflict_${raceId}_${otherId}`);
                                }
                            }
                        }
                    }
                }
            }

            for (const notifiedId of Array.from(this.notifiedRaces)) {
                if (notifiedId.startsWith('conflict_')) continue;
                const race = races.find(r => String(r.id) === notifiedId);
                if (!race || race.schedule?.start <= now || !this.trackedRaces.has(notifiedId)) {
                    this.notifiedRaces.delete(notifiedId);
                }
            }

            await this.saveNotifiedRaces();

        } catch (error) {
            console.error('🏁 Racing Notifier poll error:', error);
        }
    },

    // Send race start alert
    sendRaceStartAlert(race) {
        const title = `Race starting soon: ${race.title || 'Unknown Race'}`;
        const message = `Starts in ${Math.round((race.schedule.start - Date.now() / 1000) / 60)} minutes`;

        console.log('🏁 Racing Notifier alert:', title, '-', message);

        if (this.settings.desktopNotifications && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: chrome.runtime.getURL('assets/icons/swissknife-48.png'),
                tag: `racing-notifier-${race.id}`,
                requireInteraction: false,
            });
        }

        if (window.SidekickModules?.Core?.NotificationCenter) {
            window.SidekickModules.Core.NotificationCenter.emit({
                moduleId: 'racing-notifier',
                type: 'warning',
                title,
                message,
            }).catch(() => {});
        }
    },

    // Send conflict alert
    sendConflictAlert(race, otherRace) {
        const title = 'Race schedule conflict';
        const message = `"${race.title || 'Unknown'}" overlaps with "${otherRace.title || 'Unknown'}"`;

        console.log('🏁 Racing Notifier conflict:', title, '-', message);

        if (this.settings.desktopNotifications && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: chrome.runtime.getURL('assets/icons/swissknife-48.png'),
                tag: `racing-notifier-conflict-${race.id}-${otherRace.id}`,
                requireInteraction: false,
            });
        }

        if (window.SidekickModules?.Core?.NotificationCenter) {
            window.SidekickModules.Core.NotificationCenter.emit({
                moduleId: 'racing-notifier',
                type: 'error',
                title,
                message,
            }).catch(() => {});
        }
    },

    // Public API for settings panel
    getTrackedRaces() {
        return Array.from(this.trackedRaces);
    },
};

if (!window.SidekickModules) {
    window.SidekickModules = {};
}

window.SidekickModules.RacingNotifier = RacingNotifierModule;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RacingNotifierModule;
}
