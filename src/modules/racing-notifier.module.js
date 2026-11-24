/**
 * Racing Notifier Module
 * Adds a "Track" button at the start of the race-name column on the Torn
 * racing page, letting the name itself truncate ("...") instead of the
 * row growing or wrapping.
 * Polls the Torn API /v2/racing/races and alerts when a tracked race is
 * about to start, with race-duration conflict warnings.
 * Owns the race-status behaviour too: while enabled, the race icon in
 * Torn's status area flashes whenever the player is NOT in a race.
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
        raceDetailUrl: 'https://api.torn.com/v2/racing',
        maxDetailFetchesPerPoll: 15,
        // Only these error codes mean the race itself does not exist.
        // Rate limits (5), key problems (1/2) and network failures are
        // transient: treating those as "gone" once wiped whole tracked
        // lists on a page load, because every module fires at once and
        // the API answers with code 5 for the burst.
        goneRaceErrorCodes: [6, 7],
        pollMs: 30000,
        // Torn's default races query caps results at the current server
        // time, so a race that has not started yet is missing from it
        // entirely — it only appears once it is already running. The
        // poll therefore asks for an explicit window: one hour back
        // (races in progress, for conflict checks) through six hours
        // ahead (any custom race worth tracking).
        raceWindowBackSec: 3600,
        // Floor for the forward window; the real value grows with the
        // alert/conflict settings (see pollRaces).
        upcomingWindowFloorSec: 1800,
        alertBeforeMinutes: 10,
        conflictWarningMinutes: 5,
        trackButtonClass: 'sidekick-race-track-btn',
        trackButtonIdPrefix: 'sidekick-race-track-',
        trackedRacesKey: 'racing-notifier-tracked',
        notifiedRacesKey: 'racing-notifier-notified',
        styleId: 'sidekick-racing-notifier-styles',
        flashAnimationClass: 'sidekick-racing-highlight',
        statusIconsSelector: '[class^="status-icons"]',
        inRaceIconSelector: '[class^="icon17_"]',
        idleIconSelector: '[class^="icon18_"]',
        abroadIconSelector: '[class^="icon71_"]',
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
    injectTimer: null,
    lastRaceData: null,
    raceDataCached: false,
    lastRaceCount: 0,
    lastPollAt: null,
    lastApiError: null,
    lastServerNow: null,
    apiKeyPresent: false,
    flashInterval: null,
    flashObserver: null,
    flashFrame: null,
    flashLoadHandler: null,

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
            const list = Array.isArray(data)
                ? data
                : (data && Array.isArray(data[this.CONFIG.trackedRacesKey]) ? data[this.CONFIG.trackedRacesKey] : null);
            if (list) {
                this.trackedRaces = new Set(list.map(String));
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
            const list = Array.isArray(data)
                ? data
                : (data && Array.isArray(data[this.CONFIG.notifiedRacesKey]) ? data[this.CONFIG.notifiedRacesKey] : null);
            if (list) {
                this.notifiedRaces = new Set(list.map(String));
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
        this.startIconFlash();

        if (this.isOnRacingPage()) {
            this.injectTrackButtons();
        }

        this.saveSettings();
        this.publishStatus();
        console.log('🏁 Racing Notifier enabled');
    },

    // Disable module
    disable() {
        console.log('🏁 Disabling Racing Notifier');
        this.isEnabled = false;
        this.settings.isEnabled = false;

        this.stopPolling();
        this.stopObserver();
        this.stopIconFlash();
        this.removeTrackButtons();

        this.saveSettings();
        this.publishStatus();
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
                padding: 2px 5px !important;
                font-size: 10px !important;
                font-weight: 600 !important;
                font-family: inherit !important;
                cursor: pointer !important;
                white-space: nowrap !important;
                display: inline-block !important;
                line-height: 1.3 !important;
            }
            .${this.CONFIG.trackButtonClass}.tracked {
                background: #4CAF50 !important;
            }
            .${this.CONFIG.trackButtonClass}:hover {
                opacity: 0.9 !important;
            }

            /* The name cell becomes a flex row: button (never shrinks) +
               name text (shrinks and ellipsizes). Torn's own column
               widths stay untouched — the text gives up the space. */
            .sk-race-track-name-cell {
                display: flex;
                align-items: center;
            }
            .sk-race-track-name-btn {
                flex: 0 0 auto;
                margin: 0 6px 0 0;
            }
            .sk-race-name-text {
                display: block;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            /* Race icon flash: the idle status icon blinks while the
               player is not in a race. */
            .${this.CONFIG.flashAnimationClass} {
                animation: sidekick-racing-highlight 2s linear infinite;
            }
            @keyframes sidekick-racing-highlight {
                0%, 49% { opacity: 1; }
                50%, 100% { opacity: 0.3; }
            }
        `;
        document.head.appendChild(style);
    },

    // Remove track buttons from DOM, restoring every name cell we touched
    removeTrackButtons() {
        document.querySelectorAll('.sk-race-track-name-cell').forEach(cell => this.undoNameCellPlacement(cell));

        document.querySelectorAll(`.${this.CONFIG.trackButtonClass}`).forEach(btn => btn.remove());
    },

    // Find race rows on the racing page and add track buttons to them.
    // The button goes at the start of the race-name column — see
    // placeTrackButton.
    injectTrackButtons() {
        if (!this.isEnabled) return;

        document.querySelectorAll('.custom-events-wrap .events-list > li:not(.clear)').forEach(raceRow => {
            try {
                const existingTrack = raceRow.querySelector(`.${this.CONFIG.trackButtonClass}`);
                if (existingTrack) return;

                const raceId = this.extractRaceId(raceRow);
                if (!raceId) return;

                // Collapsed accordion rows have no rendered body row to
                // attach to; the observer injects the button as soon as
                // the row is expanded.
                if (!raceRow.querySelector('.acc-body .event-info')) return;

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

                this.placeTrackButton(raceRow, trackBtn);
            } catch (err) {
                console.warn('🏁 Racing Notifier: skipped a race row:', err.message);
            }
        });
    },

    // Place the button at the START of the race-name column, inline in
    // front of the name. The column keeps the width Torn gave it; the
    // name text shrinks and ellipsizes ("...") instead of the row
    // growing or wrapping, so every other column — start time, drivers,
    // fee, join — stays exactly where Torn put it.
    placeTrackButton(raceRow, trackBtn) {
        const nameCell = raceRow.querySelector('.acc-body .event-info li.name');
        if (!nameCell) return false;

        try {
            return this.placeInNameCell(nameCell, trackBtn, raceRow);
        } catch (err) {
            console.warn('🏁 Racing Notifier: name-column placement failed:', err.message);
            this.undoNameCellPlacement(nameCell);
            return false;
        }
    },

    // Turn the name cell into a flex row: button (never shrinks) first,
    // name text second (shrinks, ellipsizes). Everything Torn rendered
    // inside the cell — the name link, icons, any nested wrappers —
    // moves into the text element untouched.
    placeInNameCell(nameCell, trackBtn, raceRow) {
        const rowUl = nameCell.closest('.event-info');
        const rowHeightBefore = raceRow.offsetHeight;
        const ulHeightBefore = rowUl ? rowUl.offsetHeight : 0;
        const cellTopsBefore = this.cellTops(raceRow);

        const nameText = document.createElement('span');
        nameText.className = 'sk-race-name-text';
        while (nameCell.firstChild) {
            nameText.appendChild(nameCell.firstChild);
        }

        trackBtn.classList.add('sk-race-track-name-btn');
        trackBtn.style.cssText +=
            'flex: 0 0 auto !important;' +
            'margin: 0 6px 0 0 !important;';

        nameCell.appendChild(trackBtn);
        nameCell.appendChild(nameText);
        nameCell.classList.add('sk-race-track-name-cell');
        nameCell.style.cssText +=
            'display: flex !important;' +
            'align-items: center !important;';

        if (this.nameCellPlacementIsClean(trackBtn, nameText, raceRow, rowUl, ulHeightBefore, rowHeightBefore, cellTopsBefore)) {
            return true;
        }

        this.undoNameCellPlacement(nameCell);
        return false;
    },

    // A name-column placement is clean when nothing in the row grew or
    // wrapped to another line (the row and the list keep their height,
    // and no cell reports a different top), the button renders at full
    // clickable size, the name text keeps usable width, and the button
    // is fully visible inside the races container.
    nameCellPlacementIsClean(trackBtn, nameText, raceRow, rowUl, ulHeightBefore, rowHeightBefore, cellTopsBefore) {
        if (raceRow.offsetHeight > rowHeightBefore + 3) return false;

        if (ulHeightBefore && rowUl && rowUl.offsetHeight > ulHeightBefore + 3) return false;

        if (!this.cellTopsUnchanged(raceRow, cellTopsBefore)) return false;

        const btnRect = trackBtn.getBoundingClientRect();
        if (btnRect.width < 30 || btnRect.height < 12) return false;

        if (nameText.getBoundingClientRect().width < 20) return false;

        return this.isFullyVisible(trackBtn, raceRow);
    },

    // Put the name cell back exactly as Torn rendered it: buttons and
    // wrapper out, original children back in place, inline styles off.
    undoNameCellPlacement(nameCell) {
        nameCell.querySelectorAll(`.${this.CONFIG.trackButtonClass}`).forEach(btn => btn.remove());

        nameCell.querySelectorAll('.sk-race-name-text').forEach(wrapper => {
            while (wrapper.firstChild) {
                nameCell.insertBefore(wrapper.firstChild, wrapper);
            }
            wrapper.remove();
        });

        nameCell.classList.remove('sk-race-track-name-cell');
        nameCell.style.removeProperty('display');
        nameCell.style.removeProperty('align-items');
    },

    // Vertical offset of every list item in the row, keyed by element.
    // A cell that wrapped to the next line reports a different top —
    // that is the scrambled layout these checks exist to catch.
    cellTops(raceRow) {
        const tops = new Map();
        raceRow.querySelectorAll('.event-info li').forEach(li => tops.set(li, li.offsetTop));
        return tops;
    },

    cellTopsUnchanged(raceRow, topsBefore) {
        let unchanged = true;

        raceRow.querySelectorAll('.event-info li').forEach(li => {
            const before = topsBefore.get(li);
            if (before !== undefined && Math.abs(li.offsetTop - before) > 2) unchanged = false;
        });

        return unchanged;
    },

    // Insert the button as a right-floated cell at the end of a row (just
    // before its li.clear clearfix) and report whether the placement is
    // clean. Rejected placements are undone so the next candidate starts
    // from an untouched row — except best-effort ones, which stay.
    // The cell's styles are set INLINE with !important: Torn's own
    // stylesheet targets "ul.event-info li" (float, fixed and possibly
    // nth-child widths), and a plain class rule loses that fight — the
    // button then lands mid-row and pushes the other columns down.
    tryFloatCell(rowUl, trackBtn, raceRow, rowHeightBefore, bestEffort = false) {
        const cell = document.createElement('li');
        cell.className = 'sk-race-track-cell';
        cell.style.cssText =
            'float: right !important;' +
            'width: auto !important;' +
            'display: block !important;' +
            'margin: 0 !important;' +
            'padding: 0 0 0 8px !important;' +
            'list-style: none !important;' +
            'line-height: 1 !important;';
        cell.appendChild(trackBtn);

        const ulHeightBefore = rowUl.offsetHeight;

        const clearLi = rowUl.querySelector('li.clear');
        rowUl.insertBefore(cell, clearLi || null);

        if (this.placementIsClean(trackBtn, raceRow, rowUl, ulHeightBefore, rowHeightBefore)) return true;

        if (!bestEffort) cell.remove();
        return false;
    },

    // A placement is clean when neither the race row nor the line we
    // attached to grew (growth means the float wrapped and pushed the
    // columns after it down a level — the scrambled layout to avoid),
    // the button renders at full clickable size, it stays inside the
    // row's box, it does not cover the Join anchor, and it is fully
    // visible inside the races container.
    placementIsClean(trackBtn, raceRow, rowUl, ulHeightBefore, rowHeightBefore) {
        if (rowUl.offsetHeight > ulHeightBefore + 3) return false;
        if (raceRow.offsetHeight > rowHeightBefore + 3) return false;

        const btnRect = trackBtn.getBoundingClientRect();
        if (btnRect.width < 30 || btnRect.height < 10) return false;

        const ulRect = rowUl.getBoundingClientRect();
        if (btnRect.right > ulRect.right + 2) return false;
        if (btnRect.left < ulRect.left - 2) return false;

        const joinAnchor = raceRow.querySelector('.join a');
        if (joinAnchor) {
            const anchorRect = joinAnchor.getBoundingClientRect();

            if (
                btnRect.left < anchorRect.right &&
                btnRect.right > anchorRect.left &&
                btnRect.top < anchorRect.bottom &&
                btnRect.bottom > anchorRect.top
            ) {
                return false;
            }
        }

        return this.isFullyVisible(trackBtn, raceRow);
    },

    // Would the element render at full size, inside the viewport, and not
    // clipped by any ancestor between it and the races container?
    isFullyVisible(el, stopAt) {
        const rect = el.getBoundingClientRect();

        if (rect.width < 30 || rect.height < 10) return false;
        if (rect.right > window.innerWidth || rect.left < 0) return false;

        const limit = stopAt?.closest?.('.custom-events-wrap') || document.body;

        let node = el.parentElement;
        while (node && node !== limit) {
            const style = window.getComputedStyle(node);

            if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
                const nodeRect = node.getBoundingClientRect();

                if (
                    rect.right > nodeRect.right + 1 ||
                    rect.left < nodeRect.left - 1 ||
                    rect.bottom > nodeRect.bottom + 1 ||
                    rect.top < nodeRect.top - 1
                ) {
                    return false;
                }
            }

            node = node.parentElement;
        }

        return true;
    },

    // Extract the race ID for a row. The Join anchor is deliberately NOT
    // required: some rows render their Join area as an expand arrow
    // instead of a link, and collapsed rows may not render the body at all.
    // 1. Password-protected races: hidden input in the password form.
    // 2. Races with a confirm / long-race dialog: the join URL carries id=.
    // 3. Any link inside the row that carries id=.
    // 4. "No suitable car" rows expose no ID in the DOM at all — match the
    //    row against cached /racing/races data instead.
    extractRaceId(raceRow) {
        const domId = this.raceIdFromDom(raceRow);

        // The cached race list is the source of truth for IDs: a link
        // inside a row can carry a series or dialog id rather than the
        // race itself. An id the list knows is trusted; otherwise the
        // title/laps/drivers match wins over an unknown DOM id.
        if (domId && this.raceIdIsKnown(domId)) return domId;

        return this.matchRaceIdFromApi(raceRow) || domId;
    },

    raceIdFromDom(raceRow) {
        const idInput = raceRow.querySelector('.notification-wrap input[name="id"]');
        if (idInput?.value) return String(idInput.value).trim();

        const dialogLink = raceRow.querySelector('.notification-wrap a[href*="id="]');
        if (dialogLink) {
            const match = (dialogLink.getAttribute('href') || '').match(/[?&]id=(\d+)/i);
            if (match) return match[1];
        }

        const rowLink = raceRow.querySelector('a[href*="id="]');
        if (rowLink) {
            const match = (rowLink.getAttribute('href') || '').match(/[?&]id=(\d+)/i);
            if (match) return match[1];
        }

        return null;
    },

    // An empty cache can't contradict the DOM, so any id is accepted.
    raceIdIsKnown(id) {
        if (!this.lastRaceData?.length) return true;
        return this.lastRaceData.some(race => String(race.id) === String(id));
    },

    // Match a DOM race row to an API race by title, laps and driver counts.
    // Returns the ID only on a single confident match, so a generic title
    // ("race") shared by several rows never resolves to the wrong race.
    matchRaceIdFromApi(raceRow) {
        if (!this.lastRaceData?.length) return null;

        const rowName = (raceRow.querySelector('.name')?.textContent || '').trim().toLowerCase();
        if (!rowName) return null;

        const lapsText = raceRow.querySelector('.track .laps')?.textContent || '';
        const lapsMatch = lapsText.match(/\((\d+)\s*laps?\)/i);
        const laps = lapsMatch ? parseInt(lapsMatch[1], 10) : null;

        const driversText = raceRow.querySelector('.drivers')?.textContent || '';
        const driversMatch = driversText.match(/(\d+)\s*\/\s*(\d+)/);
        const current = driversMatch ? parseInt(driversMatch[1], 10) : null;
        const maximum = driversMatch ? parseInt(driversMatch[2], 10) : null;

        const candidates = this.lastRaceData
            .filter(race => (race.title || '').trim().toLowerCase() === rowName)
            .map(race => {
                let score = 1;
                if (laps !== null && race.laps === laps) score += 2;
                if (current !== null && race.participants?.current === current) score += 2;
                if (maximum !== null && race.participants?.maximum === maximum) score += 2;
                return { race, score };
            })
            .filter(entry => entry.score >= 5) // title + at least two corroborating fields
            .sort((a, b) => b.score - a.score);

        return candidates.length === 1 ? String(candidates[0].race.id) : null;
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

    // Start mutation observer to re-inject track buttons when DOM changes.
    // Debounced: Torn SPA navigation fires bursts of mutations, and our own
    // button insertions trigger the observer again.
    startObserver() {
        if (this.observer) return;

        this.observer = new MutationObserver(() => {
            if (!this.isOnRacingPage() || !this.isEnabled) return;

            clearTimeout(this.injectTimer);
            this.injectTimer = setTimeout(() => {
                this.injectTimer = null;
                this.injectTrackButtons();
            }, 150);
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

        if (this.injectTimer) {
            clearTimeout(this.injectTimer);
            this.injectTimer = null;
        }
    },

    // ─── Race icon flash (runs on every Torn page) ──────────────────

    // A real Torn racing icon, excluding any leftover custom icon.
    getStockIcon(selector) {
        return Array.from(document.querySelectorAll(selector)).find(icon => {
            const listItem = icon.matches?.('li') ? icon : icon.closest?.('li');
            return listItem?.id !== 'sidekick-race-icon';
        }) || null;
    },

    isAbroad() {
        return document.querySelector(this.CONFIG.abroadIconSelector) !== null;
    },

    // Collapse DOM mutations into a single check so Torn's SPA update
    // bursts don't queue a flood of animation frames.
    scheduleFlashCheck() {
        if (!this.isEnabled || this.flashFrame !== null) return;

        this.flashFrame = requestAnimationFrame(() => {
            this.flashFrame = null;
            this.handleFlashCheck();
        });
    },

    handleFlashCheck() {
        if (!this.isEnabled) return;

        const existingCustomIcon = document.getElementById('sidekick-race-icon');
        const stockInRaceIcon = this.getStockIcon(this.CONFIG.inRaceIconSelector);
        const stockIdleIcon = this.getStockIcon(this.CONFIG.idleIconSelector);

        if (this.isAbroad()) {
            existingCustomIcon?.remove();
            return;
        }

        // In a race: leave Torn's own icon completely alone so its
        // hover info keeps working, and make sure the idle icon isn't
        // left blinking.
        if (stockInRaceIcon) {
            stockIdleIcon?.classList.remove(this.CONFIG.flashAnimationClass);
            existingCustomIcon?.remove();
            return;
        }

        // Not in a race: blink the icon Torn already renders. Drop any
        // leftover custom icon first.
        existingCustomIcon?.remove();

        const idleListItem = stockIdleIcon?.matches?.('li')
            ? stockIdleIcon
            : stockIdleIcon?.closest?.('li');

        if (idleListItem) {
            idleListItem.classList.add(this.CONFIG.flashAnimationClass);
        }
    },

    flashMutationIsRelevant(mutations) {
        const relevantSelector = [
            this.CONFIG.statusIconsSelector,
            this.CONFIG.inRaceIconSelector,
            this.CONFIG.idleIconSelector,
            this.CONFIG.abroadIconSelector,
        ].join(',');

        return mutations.some(mutation => {
            const target = mutation.target;

            if (target?.nodeType === Node.ELEMENT_NODE &&
                target.closest?.(this.CONFIG.statusIconsSelector)) {
                return true;
            }

            const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];

            return changedNodes.some(node =>
                node.nodeType === Node.ELEMENT_NODE &&
                (node.matches?.(relevantSelector) || node.querySelector?.(relevantSelector))
            );
        });
    },

    startIconFlash() {
        if (this.flashInterval || this.flashObserver) {
            this.scheduleFlashCheck();
            return;
        }

        if (document.readyState === 'complete') {
            this.scheduleFlashCheck();
        } else {
            this.flashLoadHandler = () => {
                this.flashLoadHandler = null;
                this.scheduleFlashCheck();
            };
            window.addEventListener('load', this.flashLoadHandler, { once: true });
        }

        // Slow fallback in case Torn changes race state without a
        // relevant DOM mutation.
        this.flashInterval = setInterval(() => this.scheduleFlashCheck(), 5000);

        this.flashObserver = new MutationObserver(mutations => {
            if (!this.isEnabled) return;
            if (this.flashMutationIsRelevant(mutations)) this.scheduleFlashCheck();
        });

        this.flashObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    },

    stopIconFlash() {
        if (this.flashInterval) {
            clearInterval(this.flashInterval);
            this.flashInterval = null;
        }

        if (this.flashObserver) {
            this.flashObserver.disconnect();
            this.flashObserver = null;
        }

        if (this.flashFrame !== null) {
            cancelAnimationFrame(this.flashFrame);
            this.flashFrame = null;
        }

        if (this.flashLoadHandler) {
            window.removeEventListener('load', this.flashLoadHandler);
            this.flashLoadHandler = null;
        }

        // Leftover custom icon from the old standalone Racing Alert module.
        document.getElementById('sidekick-race-icon')?.remove();

        document.querySelectorAll(`.${this.CONFIG.flashAnimationClass}`).forEach(icon => {
            icon.classList.remove(this.CONFIG.flashAnimationClass);
        });
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

    // Torn's own clock, in unix seconds. Race schedules are SERVER time,
    // so a machine clock that drifted (or a response Date header that
    // CORS hides) silently breaks every countdown.
    async fetchServerTime(apiKey) {
        try {
            const url = `${this.CONFIG.raceDetailUrl}/timestamp?key=${encodeURIComponent(apiKey)}`;
            const response = await fetch(url);

            if (!response.ok) return null;

            const data = await response.json();
            const t = Number(data?.timestamp);

            return Number.isFinite(t) ? t : null;
        } catch (error) {
            return null;
        }
    },

    // One page of CUSTOM races inside a start-time window.
    // cat=custom is essential: official races start every few seconds,
    // so an unfiltered list fills its 100-result cap with races that
    // start sooner than a tracked one — which is exactly how every
    // tracked race went missing from the feed.
    async fetchRaceWindow(apiKey, from, to, cat, sort) {
        try {
            const url = `${this.CONFIG.apiUrl}?key=${encodeURIComponent(apiKey)}`
                + `&cat=${encodeURIComponent(cat)}&sort=${sort}&limit=100`
                + `&from=${Math.floor(from)}&to=${Math.floor(to)}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.warn('🏁 Racing Notifier: races list responded with status', response.status);
                return [];
            }

            const data = await response.json();

            if (data?.error) {
                console.warn('🏁 Racing Notifier: races list error', data.error.code, data.error.error || data.error);
                this.lastApiError = data.error.error || `code ${data.error.code}`;
                return [];
            }

            this.lastApiError = null;
            const races = data?.races || data?.data || [];

            return Array.isArray(races) ? races : [];
        } catch (error) {
            console.warn('🏁 Racing Notifier: races list fetch failed:', error.message);
            return [];
        }
    },

    // Tracked races that neither window covered. The detail endpoint
    // answers only for races that have already FINISHED, so:
    //   finished   -> schedule available; the normal cleanup untracks it
    //   error 20   -> unfinished, just outside the window: kept
    //   error 6/7  -> the id does not exist: untracked
    //   other      -> transient (rate limit, key, network): kept
    // Requests are sequential and capped: Torn allows 100 calls/min.
    async resolveUnknownTracked(apiKey, knownIds, now) {
        const found = [];
        const gone = [];
        const outside = [];
        let budget = this.CONFIG.maxDetailFetchesPerPoll;

        for (const raceId of this.trackedRaces) {
            if (budget <= 0) break;
            if (knownIds.has(raceId)) continue;

            budget--;

            try {
                const url = `${this.CONFIG.raceDetailUrl}/${encodeURIComponent(raceId)}/race?key=${encodeURIComponent(apiKey)}`;
                const response = await fetch(url);

                if (!response.ok) {
                    console.warn('🏁 Racing Notifier: race', raceId, 'lookup failed with status', response.status, '— tracking kept');
                    continue;
                }

                const data = await response.json();

                if (data?.error) {
                    const code = Number(data.error.code);

                    if (code === 20) {
                        outside.push(raceId);
                        console.log('🏁 Racing Notifier: tracked race', raceId, 'starts beyond the polling window — kept');
                    } else if (this.CONFIG.goneRaceErrorCodes.includes(code)) {
                        gone.push(raceId);
                        console.log('🏁 Racing Notifier: tracked race', raceId, 'no longer exists (code', code + ') — untracked');
                    } else {
                        console.warn('🏁 Racing Notifier: race', raceId, 'lookup failed with code', code, '— tracking kept:', data.error.error || data.error);
                    }
                    continue;
                }

                if (data?.race) {
                    found.push(data.race);

                    if (data.race.schedule?.start && data.race.schedule.start <= now) {
                        console.log('🏁 Racing Notifier: tracked race', raceId, 'already started — will be untracked');
                    }
                }
            } catch (error) {
                console.warn('🏁 Racing Notifier: race', raceId, 'lookup failed:', error.message);
            }
        }

        return { races: found, gone, outside };
    },

    // Poll the Torn API for race data
    async pollRaces() {
        if (!this.isEnabled) return;

        try {
            const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
            if (!apiKey) {
                this.apiKeyPresent = false;
                this.publishStatus();
                console.debug('🏁 Racing Notifier: no API key, skipping poll');
                return;
            }

            // Every timestamp in the feed is Torn SERVER time, so the clock and
            // both windows come from the server's own clock.
            const serverClock = await this.fetchServerTime(apiKey);
            this.lastServerNow = serverClock;

            const now = serverClock ?? Date.now() / 1000;

            // The alert feed. cat=available returns only races that are
            // still OPEN, sorted soonest-first, so a race 15 minutes out
            // sits at the top instead of behind a hundred official races
            // — which is how every tracked race went missing before.
            const upcomingSec = Math.max(
                this.CONFIG.upcomingWindowFloorSec,
                (Math.max(this.settings.alertBeforeMinutes, this.settings.conflictWarningMinutes) + 10) * 60
            );
            const openRaces = await this.fetchRaceWindow(apiKey, now - 60, now + upcomingSec, 'available', 'ASC');

            // The cleanup feed: custom races that started recently,
            // newest first. A race drops out of "available" the moment it
            // starts, so without this it could not be untracked when it
            // starts.
            const recentRaces = await this.fetchRaceWindow(apiKey, now - this.CONFIG.raceWindowBackSec, now, 'custom', 'DESC');

            const listRaces = [...openRaces, ...recentRaces];

            this.lastApiError = null;
            this.lastRaceCount = listRaces.length;
            this.lastPollAt = Date.now();
            this.apiKeyPresent = true;

            // Cache every poll: rows with no ID in the DOM ("no suitable
            // car") are matched against this list.
            this.lastRaceData = listRaces;

            // The first fetch usually lands after the initial DOM pass, so
            // give those rows one more injection attempt now that the
            // cache exists.
            if (!this.raceDataCached) {
                this.raceDataCached = true;

                if (this.isOnRacingPage()) {
                    this.injectTrackButtons();
                }
            }

            if (this.trackedRaces.size === 0) {
                await this.publishStatus();
                return;
            }

            const alertBeforeMs = this.settings.alertBeforeMinutes * 60 * 1000;
            const conflictWarningMs = this.settings.conflictWarningMinutes * 60 * 1000;

            // Anything tracked that neither feed covered. The detail
            // endpoint answers only for races that have already FINISHED,
            // so its coverage is partial by nature — see the method.
            const unknown = await this.resolveUnknownTracked(apiKey, new Set(listRaces.map(r => String(r.id))), now);

            if (unknown.gone.length) {
                unknown.gone.forEach(id => {
                    this.trackedRaces.delete(id);
                    this.notifiedRaces.delete(id);
                });
                await this.saveTrackedRaces();
                console.log('🏁 Racing Notifier: races no longer available, untracked:', unknown.gone.join(', '));
            }

            const raceById = new Map();
            [...listRaces, ...unknown.races].forEach(race => raceById.set(String(race.id), race));
            this.lastRaceData = Array.from(raceById.values());

            for (const raceId of this.trackedRaces) {
                const race = raceById.get(raceId);

                if (!race) {
                    if (unknown.outside.includes(raceId)) continue; // already logged by the resolver
                    console.log('🏁 Racing Notifier: tracked race', raceId, 'could not be found in either feed');
                } else if (race.schedule?.start) {
                    const minsLeft = Math.round((race.schedule.start - now) / 60);

                    if (minsLeft <= 0) {
                        console.log('🏁 Racing Notifier: tracked race', raceId, 'has started — untracking');
                    } else {
                        console.log('🏁 Racing Notifier: tracked race', raceId, 'starts in', minsLeft, 'minutes');
                    }
                } else {
                    console.log('🏁 Racing Notifier: tracked race', raceId, 'has no schedule.start');
                }
            }

            const newlyNotified = new Set();

            for (const race of raceById.values()) {
                const raceId = String(race.id);
                if (!this.trackedRaces.has(raceId)) continue;

                const startTime = race.schedule?.start;
                const endTime = race.schedule?.end;

                if (!startTime) continue;

                const timeUntilStart = (startTime - now) * 1000;

                // Alert when race is about to start
                if (timeUntilStart > 0 && timeUntilStart <= alertBeforeMs) {
                    if (!this.notifiedRaces.has(raceId) && !newlyNotified.has(raceId)) {
                        this.sendRaceStartAlert(race, Math.round(timeUntilStart / 60000));
                        newlyNotified.add(raceId);
                        this.notifiedRaces.add(raceId);
                    }
                }

                // Conflict warning: race overlaps with another tracked race
                if (endTime && timeUntilStart > 0 && timeUntilStart <= conflictWarningMs) {
                    for (const otherId of this.trackedRaces) {
                        if (otherId === raceId) continue;
                        const otherRace = raceById.get(otherId);
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
                const race = raceById.get(notifiedId);
                if (!race || race.schedule?.start <= now || !this.trackedRaces.has(notifiedId)) {
                    this.notifiedRaces.delete(notifiedId);
                }
            }

            // A race whose start has passed can never alert again, so it
            // is untracked and forgotten: out of the list, out of the
            // notified list, out of storage. Races absent from the window
            // are left alone (the logs above identify them) — dropping
            // them would hide a wrongly tracked id.
            const startedRaces = [];
            for (const raceId of this.trackedRaces) {
                const race = raceById.get(raceId);
                if (race?.schedule?.start && race.schedule.start <= now) {
                    startedRaces.push(raceId);
                }
            }
            if (startedRaces.length) {
                startedRaces.forEach(id => {
                    this.trackedRaces.delete(id);
                    this.notifiedRaces.delete(id);
                });
                await this.saveTrackedRaces();
                console.log('🏁 Racing Notifier: untracked started race(s):', startedRaces.join(', '));
            }

            await this.saveNotifiedRaces();
            await this.publishStatus();

        } catch (error) {
            this.lastApiError = error?.message || String(error);
            this.publishStatus();
            console.error('🏁 Racing Notifier poll error:', error);
        }
    },

    // Send race start alert. minutesLeft is computed from the Torn server
// clock, so the text stays truthful even when the machine clock drifts.
    sendRaceStartAlert(race, minutesLeft) {
        const title = `Race starting soon: ${race.title || 'Unknown Race'}`;
        const mins = Number.isFinite(minutesLeft)
            ? minutesLeft
            : Math.round((race.schedule.start - Date.now() / 1000) / 60);
        const message = `Starts in ${mins} minutes`;

        console.log('🏁 Racing Notifier alert:', title, '-', message);

        if (this.settings.desktopNotifications && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: chrome.runtime.getURL('assets/icons/swissknife-48.png'),
                tag: `racing-notifier-${race.id}`,
                requireInteraction: false,
            });
        }

        if (window.NotificationCenter) {
            window.NotificationCenter.emit({
                moduleId: 'racing-notifier',
                type: 'warning',
                title,
                message,
            }).catch(() => {});
        }

        if (window.SidekickModules?.Core?.NotificationSystem) {
            window.SidekickModules.Core.NotificationSystem.show(title, message, 'warning');
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

        if (window.NotificationCenter) {
            window.NotificationCenter.emit({
                moduleId: 'racing-notifier',
                type: 'error',
                title,
                message,
            }).catch(() => {});
        }

        if (window.SidekickModules?.Core?.NotificationSystem) {
            window.SidekickModules.Core.NotificationSystem.show(title, message, 'error');
        }
    },

    // Public API for settings panel
    getTrackedRaces() {
        return Array.from(this.trackedRaces);
    },

    // Torn server time in unix seconds, from the response Date header.
    // Returns null when the header is absent or unparsable.
    serverNowFrom(response) {
        try {
            const header = response?.headers?.get?.('Date');
            if (!header) return null;
            const t = new Date(header).getTime();
            return Number.isFinite(t) ? t / 1000 : null;
        } catch (error) {
            return null;
        }
    },

    // Mirror the health report into the PAGE's world — content scripts run
    // in an isolated world that the page console cannot reach, which is
    // why SidekickModules is not defined there. Read it with:
    //   JSON.parse(sessionStorage.getItem('sidekick_racing_notifier_status'))
    async publishStatus() {
        const now = Date.now() / 1000;

        // What is actually on disk, so an in-memory/storage mismatch
        // (save never happened vs. load never restored) is visible.
        let storedTracked = null;
        try {
            const stored = await window.SidekickModules.Core.ChromeStorage.get(this.CONFIG.trackedRacesKey);
            storedTracked = Array.isArray(stored)
                ? stored
                : (stored && Array.isArray(stored[this.CONFIG.trackedRacesKey]) ? stored[this.CONFIG.trackedRacesKey] : null);
        } catch (error) {
            storedTracked = 'error: ' + (error?.message || error);
        }

        const report = {
            isEnabled: this.isEnabled,
            isPolling: this.pollInterval !== null,
            isFlashing: this.flashInterval !== null,
            apiKeyPresent: this.apiKeyPresent === true,
            alertBeforeMinutes: this.settings.alertBeforeMinutes,
            tracked: Array.from(this.trackedRaces),
            storedTracked,
            racesInLastPoll: this.lastRaceCount,
            lastPollSecondsAgo: this.lastPollAt ? Math.round(now - this.lastPollAt / 1000) : null,
            lastApiError: this.lastApiError,
            clockVsServerSeconds: this.lastServerNow !== null
                ? Math.round((now - this.lastServerNow) * 10) / 10
                : null,
        };

        try {
            sessionStorage.setItem('sidekick_racing_notifier_status', JSON.stringify(report));
        } catch (error) {
            // storage can be full or blocked — the event below still fires
        }

        try {
            document.dispatchEvent(new CustomEvent('sidekick-racing-notifier-status', { detail: report }));
        } catch (error) {
            // no CustomEvent in this context — storage copy is enough
        }

        return report;
    },

    // Same report, logged into the extension's own console.
    async debugStatus() {
        const report = await this.publishStatus();
        console.log('🏁 Racing Notifier status:', report);
        return report;
    },
};

if (!window.SidekickModules) {
    window.SidekickModules = {};
}

window.SidekickModules.RacingNotifier = RacingNotifierModule;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RacingNotifierModule;
}
