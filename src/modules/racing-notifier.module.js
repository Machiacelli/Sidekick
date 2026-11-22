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
        trackButtonIdPrefix: 'sidekick-race-track-',
        dropdownId: 'sidekick-racing-notifier-dropdown',
        trackedRacesKey: 'racing-notifier-tracked',
        notifiedRacesKey: 'racing-notifier-notified',
        styleId: 'sidekick-racing-notifier-styles',
        joinButtonText: 'Join',
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
    scheduledPoll: null,

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

        if (this.settings.alertBeforeMinutes !== undefined) {
            this.settings.alertBeforeMinutes = this.settings.alertBeforeMinutes;
        }
        if (this.settings.conflictWarningMinutes !== undefined) {
            this.settings.conflictWarningMinutes = this.settings.conflictWarningMinutes;
        }
        if (this.settings.desktopNotifications !== undefined) {
            this.settings.desktopNotifications = this.settings.desktopNotifications;
        }

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
            this.renderDropdown();
        }

        this.saveSettings();
        console.log('🏁 Racing Notifier enabled');
    },

    // Disable module
    disable() {
        console.log('�1 Disabling Racing Notifier');
        this.isEnabled = false;
        this.settings.isEnabled = false;

        this.stopPolling();
        this.stopObserver();
        this.removeDropdown();
        this.removeTrackButtons();

        this.saveSettings();
        console.log('🏁 Racing Notifier disabled');
    },

    // Check if current page is the Torn racing page
    isOnRacingPage() {
        return window.location.href.includes('page.php?sid=racing') ||
               window.location.href.includes('/racing');
    },

    // Inject CSS styles
    addStyles() {
        if (document.getElementById(this.CONFIG.styleId)) return;

        const style = document.createElement('style');
        style.id = this.CONFIG.styleId;
        style.textContent = `
            .sidekick-race-track-btn {
                background: #2196F3 !important;
                color: white !important;
                border: none !important;
                border-radius: 4px !important;
                padding: 4px 8px !important;
                font-size: 11px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                margin-left: 6px !important;
                display: inline-flex !important;
                align-items: center !important;
                gap: 4px !important;
                white-space: nowrap !important;
            }
            .sidekick-race-track-btn.tracked {
                background: #4CAF50 !important;
            }
            .sidekick-race-track-btn:hover {
                opacity: 0.9 !important;
            }
            .sidekick-race-track-btn:active {
                transform: scale(0.95) !important;
            }
            #${this.CONFIG.dropdownId} {
                position: fixed !important;
                top: 60px !important;
                right: 20px !important;
                z-index: 999999 !important;
                width: 320px !important;
                background: #1a1a1a !important;
                border: 1px solid #444 !important;
                border-radius: 8px !important;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
                color: #fff !important;
                display: none !important;
                flex-direction: column !important;
            }
            #${this.CONFIG.dropdownId}.open {
                display: flex !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-dropdown-header {
                padding: 12px !important;
                border-bottom: 1px solid #333 !important;
                font-weight: 600 !important;
                font-size: 14px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-dropdown-close {
                background: none !important;
                border: none !important;
                color: #888 !important;
                cursor: pointer !important;
                font-size: 18px !important;
                padding: 0 !important;
                line-height: 1 !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-dropdown-empty {
                padding: 20px !important;
                text-align: center !important;
                color: #888 !important;
                font-size: 13px !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-item {
                padding: 10px 12px !important;
                border-bottom: 1px solid #222 !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                cursor: pointer !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-item:hover {
                background: #222 !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-item:last-child {
                border-bottom: none !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-item-info {
                flex: 1 !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-item-title {
                font-weight: 600 !important;
                font-size: 13px !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-item-time {
                font-size: 11px !important;
                color: #888 !important;
                margin-top: 2px !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-item-untrack {
                background: none !important;
                border: none !important;
                color: #ff6b6b !important;
                cursor: pointer !important;
                font-size: 11px !important;
                padding: 2px 6px !important;
                border-radius: 3px !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-item-untrack:hover {
                background: rgba(255,107,107,0.1) !important;
            }
            #${this.CONFIG.dropdownId} .sk-race-dropdown-footer {
                padding: 10px 12px !important;
                border-top: 1px solid #333 !important;
                font-size: 11px !important;
                color: #666 !important;
                text-align: center !important;
            }
        `;
        document.head.appendChild(style);
    },

    // Remove track buttons from DOM
    removeTrackButtons() {
        document.querySelectorAll(`.${this.CONFIG.trackButtonIdPrefix}`).forEach(btn => btn.remove());
    },

    // Find join buttons on the racing page and add track buttons next to them
    injectTrackButtons() {
        if (!this.isEnabled) return;

        // Find join buttons by text content
        const joinButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
            .filter(el => {
                const text = el.textContent || el.innerText || '';
                return text.trim() === this.CONFIG.joinButtonText ||
                       text.trim().startsWith(this.CONFIG.joinButtonText);
            });

        joinButtons.forEach(btn => {
            // Skip if already has a track button sibling
            const existingTrack = btn.parentElement?.querySelector(`.${this.CONFIG.trackButtonIdPrefix}`);
            if (existingTrack) return;

            const raceId = this.extractRaceId(btn);
            if (!raceId) return;

            const isTracked = this.trackedRaces.has(raceId);

            const trackBtn = document.createElement('button');
            trackBtn.type = 'button';
            trackBtn.className = `sidekick-race-track-btn ${this.CONFIG.trackButtonIdPrefix}${raceId} ${isTracked ? 'tracked' : ''}`;
            trackBtn.setAttribute('data-race-id', raceId);
            trackBtn.setAttribute('aria-label', isTracked ? 'Untrack race' : 'Track race');
            trackBtn.textContent = isTracked ? 'Untrack' : 'Track';

            trackBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleTrackRace(raceId, trackBtn);
            });

            // Insert after the join button
            btn.parentElement?.insertBefore(trackBtn, btn.nextSibling);
        });
    },

    // Extract race ID from a join button element
    extractRaceId(btn) {
        // Try data attributes first
        for (const attr of ['data-race-id', 'data-race', 'data-id', 'data-raceid']) {
            const val = btn.getAttribute(attr);
            if (val) return val;
        }

        // Try closest container with data attributes
        const container = btn.closest('[data-race-id], [data-race], [data-id]');
        if (container) {
            for (const attr of ['data-race-id', 'data-race', 'data-id', 'data-raceid']) {
                const val = container.getAttribute(attr);
                if (val) return val;
            }
        }

        // Try href attribute for race URL patterns
        const href = btn.getAttribute('href') || btn.closest('a')?.getAttribute('href');
        if (href) {
            const match = href.match(/racing\/(\d+)|race=(\d+)|sid=racing&id=(\d+)|race_id=(\d+)/i);
            if (match) {
                return match[1] || match[2] || match[3] || match[4];
            }
        }

        // Try to find race ID in nearby text or sibling elements
        const parent = btn.parentElement;
        if (parent) {
            const text = parent.textContent || parent.innerText || '';
            const match = text.match(/race\s*#?(\d+)/i);
            if (match) return match[1];
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
        this.renderDropdown();
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

        // Run immediately
        this.pollRaces();
    },

    // Stop API polling
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.scheduledPoll !== null) {
            cancelAnimationFrame(this.scheduledPoll);
            this.scheduledPoll = null;
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
                            // Check overlap: race starts before other ends and after other starts
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

            // Clean up old notified entries for races that have started or are no longer tracked
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

        // Emit to notification center
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

    // Render the tracked races dropdown
    renderDropdown() {
        this.removeDropdown();

        if (!this.isEnabled) return;

        const dropdown = document.createElement('div');
        dropdown.id = this.CONFIG.dropdownId;
        dropdown.className = 'open';

        const header = document.createElement('div');
        header.className = 'sk-race-dropdown-header';
        header.innerHTML = `
            <div>Tracked Races (${this.trackedRaces.size})</div>
            <button class="sk-race-dropdown-close">✕</button>
        `;
        header.querySelector('.sk-race-dropdown-close').addEventListener('click', () => {
            dropdown.classList.remove('open');
        });
        dropdown.appendChild(header);

        if (this.trackedRaces.size === 0) {
            const empty = document.createElement('div');
            empty.className = 'sk-race-dropdown-empty';
            empty.textContent = 'No races tracked. Click "Track" on the racing page.';
            dropdown.appendChild(empty);
        } else {
            for (const raceId of this.trackedRaces) {
                const item = document.createElement('div');
                item.className = 'sk-race-item';

                const untrackBtn = document.createElement('button');
                untrackBtn.className = 'sk-race-item-untrack';
                untrackBtn.textContent = 'Untrack';
                untrackBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const btn = document.querySelector(`.${this.CONFIG.trackButtonIdPrefix}${raceId}`);
                    if (btn) this.toggleTrackRace(raceId, btn);
                });

                const info = document.createElement('div');
                info.className = 'sk-race-item-info';
                info.innerHTML = `
                    <div class="sk-race-item-title">Race #${raceId}</div>
                    <div class="sk-race-item-time">Tracked</div>
                `;

                item.appendChild(info);
                item.appendChild(untrackBtn);
                dropdown.appendChild(item);
            }
        }

        const footer = document.createElement('div');
        footer.className = 'sk-race-dropdown-footer';
        footer.textContent = 'Alerts before race start • Conflict warnings';
        dropdown.appendChild(footer);

        document.body.appendChild(dropdown);
    },

    // Remove dropdown from DOM
    removeDropdown() {
        const existing = document.getElementById(this.CONFIG.dropdownId);
        if (existing) existing.remove();
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
