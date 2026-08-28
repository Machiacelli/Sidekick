/**
 * Sidekick popup quick controls.
 * Each registry entry deliberately mirrors settings.module.js so both UIs
 * read and write the same isEnabled flag.
 */
(function () {
    'use strict';

    const PINNED_KEY = 'sidekick_popup_pinned_modules';
    const NOTIFICATIONS_KEY = 'sidekick_notifications';
    const DEFAULT_PINNED = [
        'locked-items',
        'bunker-bucks',
        'price-filler',
        'war-monitor',
        'quick-deposit',
        'crime-notifier'
    ];

    const ICONS = {
        Personal: '../assets/icons/Profile.png',
        Gym: '../assets/icons/Features.png',
        Economy: '../assets/icons/Trading.png',
        Utility: '../assets/icons/General.png',
        Reminders: '../assets/icons/Events.png',
        Crimes: '../assets/icons/Crimes.png',
        War: '../assets/icons/War.png',
        Missions: '../assets/icons/Missions.png',
        Events: '../assets/icons/Events.png',
        Medical: '../assets/icons/blood-bag-2.png',
        Mugging: '../assets/icons/MugCalc.png',
        Merits: '../assets/icons/Features.png'
    };

    const MODULES = [
        { id: 'fast-attack', name: 'Fast Attack', category: 'Personal', storageKey: 'sidekick_attack_button_mover', defaultEnabled: true },
        { id: 'attack-online-status', name: 'Attack Online Status', category: 'Personal', storageKey: 'sidekick_settings', subKey: 'attack-online-status', defaultEnabled: true },
        { id: 'loadout-switcher', name: 'Loadout Switcher', category: 'Personal', storageKey: 'sidekick_settings', subKey: 'loadout-switcher', defaultEnabled: false },
        { id: 'locked-items', name: 'Locked Items', category: 'Personal', storageKey: 'sidekick_settings', subKey: 'locked-items', defaultEnabled: false },
        { id: 'weapon-xp', name: 'Weapon XP Tracker', category: 'Personal', storageKey: 'sidekick_weapon_xp_tracker', defaultEnabled: false },
        { id: 'stats-tracker', name: 'Stats Tracker', category: 'Personal', storageKey: 'sidekick_stats_tracker_window', defaultEnabled: false },

        { id: 'special-gym-ratios', name: 'Special Gym Ratios', category: 'Gym', storageKey: 'sidekick_settings', subKey: 'special-gym-ratios', defaultEnabled: true },
        { id: 'auto-gym-switch', name: 'Automatic Gym Switch', category: 'Gym', storageKey: 'sidekick_settings', subKey: 'auto-gym-switch', defaultEnabled: false },
        { id: 'block-training', name: 'Gym Blocker / Block Training', category: 'Gym', storageKey: 'sidekick_blocktraining', enabledKeys: ['isEnabled', 'isBlocked'], defaultEnabled: false },

        { id: 'market-max-quantity', name: 'Market Max Quantity', category: 'Economy', storageKey: 'sidekick_market_max_qty', defaultEnabled: true },
        { id: 'price-filler', name: 'Price Filler', category: 'Economy', storageKey: 'sidekick_settings', subKey: 'price-filler', defaultEnabled: false },
        { id: 'bazaar-filler', name: 'Bazaar Filler', category: 'Economy', storageKey: 'sidekick_settings', subKey: 'bazaar-filler', defaultEnabled: false },
        { id: 'quick-deposit', name: 'Quick Deposit', category: 'Economy', storageKey: 'sidekick_settings', subKey: 'quick-deposit', defaultEnabled: false },
        { id: 'bunker-bucks', name: 'Bunker Bucks', category: 'Economy', storageKey: 'sidekick_settings', subKey: 'bunker-bucks', defaultEnabled: false },
        { id: 'trade-assistant', name: 'Trade Assistant', category: 'Economy', storageKey: 'sidekick_trading_settings', subKey: 'display', enabledKey: 'enabled', defaultEnabled: true },

        { id: 'time-on-tab', name: 'Time on Tab', category: 'Utility', storageKey: 'sidekick_time_on_tab', defaultEnabled: false },
        { id: 'random-target', name: 'Random Target', category: 'Utility', storageKey: 'sidekick_random_target', defaultEnabled: false },
        { id: 'chat-popout', name: 'Chat Popout', category: 'Utility', storageKey: 'sidekick_settings', subKey: 'chat-popout', defaultEnabled: false },
        { id: 'legible-names', name: 'Legible Player Names', category: 'Utility', storageKey: 'sidekick_settings', subKey: 'legible-names', defaultEnabled: false },
        { id: 'xanax-viewer', name: 'Xanax Viewer', category: 'Utility', storageKey: 'sidekick_xanax_viewer', defaultEnabled: false },
        { id: 'refill-blocker', name: 'Refill Blocker', category: 'Utility', storageKey: 'sidekick_refill_blocker', defaultEnabled: false },
        { id: 'auction-weapon-bonus', name: 'Auction Weapon Bonus', category: 'Utility', storageKey: 'sidekick_settings', subKey: 'auction-weapon-bonus', defaultEnabled: false },
        { id: 'oc-weights', name: 'OC Weights', category: 'Utility', storageKey: 'sidekick_settings', subKey: 'oc-weights', defaultEnabled: true },
        { id: 'chat-alert', name: 'Chat Alert', category: 'Utility', storageKey: 'chat-alert', enabledKey: 'enabled', defaultEnabled: false },

        { id: 'travel-blocker', name: 'Travel Blocker', category: 'Reminders', storageKey: 'sidekick_travel_blocker', defaultEnabled: true },
        { id: 'racing-alert', name: 'Racing Alert', category: 'Reminders', storageKey: 'sidekick_racing_alert', defaultEnabled: false },
        { id: 'rehab-warning', name: 'Rehab Warning', category: 'Reminders', storageKey: 'sidekick_rehab_warning', defaultEnabled: false },
        { id: 'blood-bag-reminder', name: 'Blood Bag Reminder', category: 'Reminders', storageKey: 'sidekick_settings', subKey: 'blood-bag-reminder', defaultEnabled: false },
        { id: 'browser-notifications', name: 'Browser Desktop Notifications', category: 'Reminders', storageKey: 'sidekick_notification_prefs', enabledKey: 'windowsNotifications', defaultEnabled: false },

        { id: 'crime-sfc', name: 'Search for Cash Helper', category: 'Crimes', storageKey: 'sidekick_settings', subKey: 'crime-sfc', defaultEnabled: false },
        { id: 'crime-notifier', name: 'Shoplifting Notifier', category: 'Crimes', storageKey: 'sidekick_settings', subKey: 'crime-notifier', defaultEnabled: false },
        { id: 'crime-pickpocketing', name: 'Pickpocketing Helper', category: 'Crimes', storageKey: 'sidekick_settings', subKey: 'crime-pickpocketing', defaultEnabled: false },
        { id: 'crime-burglary', name: 'Burglary Helper', category: 'Crimes', storageKey: 'sidekick_settings', subKey: 'crime-burglary', defaultEnabled: false },
        { id: 'crime-disposal', name: 'Disposal Helper', category: 'Crimes', storageKey: 'sidekick_settings', subKey: 'crime-disposal', defaultEnabled: false },
        { id: 'crime-cracking', name: 'Cracking Helper', category: 'Crimes', storageKey: 'sidekick_settings', subKey: 'crime-cracking', defaultEnabled: false },
        { id: 'crime-scamming', name: 'Scamming Helper', category: 'Crimes', storageKey: 'sidekick_settings', subKey: 'crime-scamming', defaultEnabled: false },
        { id: 'crime-hustling', name: 'Hustling Helper', category: 'Crimes', storageKey: 'sidekick_settings', subKey: 'crime-hustling', defaultEnabled: false },
        { id: 'hide-crime-outcome', name: 'Crime Outcome Customization', category: 'Crimes', storageKey: 'sidekick_settings', subKey: 'hide-crime-outcome', defaultEnabled: false, onEnable: { mode: 1 }, onDisable: { mode: 0 } },

        { id: 'chain-timer', name: 'Chain Timer', category: 'War', storageKey: 'sidekick_chain_timer', defaultEnabled: false },
        { id: 'war-monitor', name: 'War Monitor', category: 'War', storageKey: 'sidekick_war_monitor', defaultEnabled: false },
        { id: 'extended-chain-view', name: 'Extended Chain View', category: 'War', storageKey: 'sidekick_extended_chain_view', defaultEnabled: false },
        { id: 'termed-war-mode', name: 'Termed War Mode', category: 'War', storageKey: 'sidekick_settings', subKey: 'termed-war-mode', defaultEnabled: false },
        { id: 'war-target-caller', name: 'War Target Caller', category: 'War', storageKey: 'sidekick_war_target_caller', defaultEnabled: false },

        { id: 'mission-tracker', name: 'Mission Tracker', category: 'Missions', storageKey: 'sidekick_settings', subKey: 'mission-tracker', defaultEnabled: false },
        { id: 'book-notifier', name: 'Book Notifier', category: 'Missions', storageKey: 'sidekick_settings', subKey: 'book-notifier', defaultEnabled: false },

        { id: 'event-calendar', name: 'Event Calendar', category: 'Events', storageKey: 'sidekick_settings', subKey: 'event-calendar', defaultEnabled: false },
        { id: 'easter-helper', name: 'Easter Egg Helper', category: 'Events', storageKey: 'sidekick_egg_helper', defaultEnabled: false },
        { id: 'halloween-helper', name: 'Halloween Helper', category: 'Events', storageKey: 'sidekick_halloween', defaultEnabled: false },
        { id: 'christmas-zoom', name: 'Christmas Zoom', category: 'Events', storageKey: 'sidekick_settings', subKey: 'christmas_zoom', defaultEnabled: false },
        { id: 'christmas-beers', name: 'Christmas Beer Counter', category: 'Events', storageKey: 'sidekick_settings', subKey: 'christmas_beers', defaultEnabled: false },

        { id: 'smart-medical', name: 'Smart Medical Button', category: 'Medical', storageKey: 'sidekick_smart_medical', defaultEnabled: false },
        { id: 'mug-calculator', name: 'Mug Calculator', category: 'Mugging', storageKey: 'sidekick_mug_calculator', defaultEnabled: false },
        { id: 'mug-warning', name: 'Mug Warning', category: 'Mugging', storageKey: 'mug-warning', enabledKey: 'enabled', defaultEnabled: false },
        { id: 'merit-calculator', name: 'Merit Calculator', category: 'Merits', storageKey: 'sidekick_merit_calculator', defaultEnabled: false }
    ].map(module => Object.freeze({ ...module, icon: ICONS[module.category] || ICONS.Utility }));

    const MODULE_BY_ID = new Map(MODULES.map(module => [module.id, module]));
    const state = {
        pinned: [],
        customizeDraft: new Set(),
        values: new Map(),
        pinSaveQueue: Promise.resolve(),
        toastTimer: null
    };

    const elements = {};

    document.addEventListener('DOMContentLoaded', initialize);

    async function initialize() {
        cacheElements();
        wireNavigation();
        setVersion();

        state.pinned = await loadPinnedModules();
        await refreshModuleValues();
        renderControls();
        await refreshNotificationIndicator();

        chrome.storage.onChanged.addListener(handleStorageChange);
    }

    function cacheElements() {
        [
            'controlsView', 'customizeView', 'notificationsView', 'controlList',
            'customizeList', 'moduleSearch', 'notificationDot', 'notificationsList',
            'notificationsEmpty', 'toast'
        ].forEach(id => { elements[id] = document.getElementById(id); });
    }

    function wireNavigation() {
        document.getElementById('customizeButton').addEventListener('click', openCustomizer);
        document.getElementById('customizeDoneButton').addEventListener('click', saveCustomizer);
        document.getElementById('notificationsButton').addEventListener('click', openNotifications);
        document.getElementById('notificationsBackButton').addEventListener('click', () => showView('controlsView'));
        document.getElementById('clearNotificationsButton').addEventListener('click', clearNotifications);
        document.getElementById('settingsButton').addEventListener('click', () => sendToActiveTornTab('openSettings'));
        document.getElementById('reportBugButton').addEventListener('click', () => sendToActiveTornTab('openBugReporter'));
        elements.moduleSearch.addEventListener('input', renderCustomizer);
    }

    function setVersion() {
        const version = chrome.runtime.getManifest().version;
        document.getElementById('versionText').textContent = `Chrome Extension v${version}`;
    }

    function showView(viewId) {
        document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === viewId));
    }

    async function loadPinnedModules() {
        const result = await chrome.storage.local.get(PINNED_KEY);
        const hasSavedSelection = Array.isArray(result[PINNED_KEY]);
        const saved = hasSavedSelection ? result[PINNED_KEY] : DEFAULT_PINNED;
        const valid = [...new Set(saved)].filter(id => MODULE_BY_ID.has(id));
        return hasSavedSelection ? valid : [...DEFAULT_PINNED];
    }

    async function refreshModuleValues() {
        const keys = [...new Set(MODULES.map(module => module.storageKey))];
        const stored = await chrome.storage.local.get(keys);
        MODULES.forEach(module => state.values.set(module.id, readModuleValue(module, stored[module.storageKey])));
    }

    function readModuleValue(module, storedValue) {
        if (!storedValue || typeof storedValue !== 'object') return Boolean(module.defaultEnabled);
        const settings = module.subKey ? storedValue[module.subKey] : storedValue;
        if (!settings || typeof settings !== 'object') return Boolean(module.defaultEnabled);
        if (Array.isArray(module.enabledKeys)) {
            const values = module.enabledKeys
                .map(key => settings[key])
                .filter(value => typeof value === 'boolean');
            return values.length ? values.some(Boolean) : Boolean(module.defaultEnabled);
        }
        const enabledKey = module.enabledKey || 'isEnabled';
        return typeof settings[enabledKey] === 'boolean'
            ? settings[enabledKey]
            : Boolean(module.defaultEnabled);
    }

    async function writeModuleValue(module, enabled) {
        const result = await chrome.storage.local.get(module.storageKey);
        const root = result[module.storageKey] && typeof result[module.storageKey] === 'object'
            ? { ...result[module.storageKey] }
            : {};

        const enabledKey = module.enabledKey || 'isEnabled';
        const extra = enabled ? module.onEnable : module.onDisable;
        const target = module.subKey
            ? { ...(root[module.subKey] && typeof root[module.subKey] === 'object' ? root[module.subKey] : {}) }
            : root;

        if (Array.isArray(module.enabledKeys)) {
            module.enabledKeys.forEach(key => { target[key] = enabled; });
        } else {
            target[enabledKey] = enabled;
        }
        if (extra && typeof extra === 'object') Object.assign(target, extra);
        if (module.subKey) root[module.subKey] = target;

        await chrome.storage.local.set({ [module.storageKey]: root });
        state.values.set(module.id, enabled);
        await broadcastModuleUpdate(module, enabled);
    }

    function renderControls() {
        elements.controlList.replaceChildren();

        if (!state.pinned.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No quick controls pinned. Use Customize to add modules.';
            elements.controlList.appendChild(empty);
            return;
        }

        state.pinned.forEach(id => {
            const module = MODULE_BY_ID.get(id);
            if (!module) return;
            elements.controlList.appendChild(createControlRow(module));
        });
    }

    function createControlRow(module) {
        const row = document.createElement('div');
        row.className = 'control-row';
        row.dataset.moduleId = module.id;

        const icon = document.createElement('div');
        icon.className = 'module-icon';
        const iconImage = document.createElement('img');
        iconImage.src = module.icon;
        iconImage.alt = '';
        icon.appendChild(iconImage);

        const details = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'module-name';
        name.textContent = module.name;
        const status = document.createElement('div');
        status.className = 'module-status';
        details.append(name, status);

        const switchLabel = document.createElement('label');
        switchLabel.className = 'switch';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('aria-label', `Toggle ${module.name}`);
        checkbox.checked = state.values.get(module.id) === true;
        const track = document.createElement('span');
        track.className = 'switch-track';
        switchLabel.append(checkbox, track);

        updateStatus(status, checkbox.checked);
        checkbox.addEventListener('change', async () => {
            const nextValue = checkbox.checked;
            checkbox.disabled = true;
            try {
                await writeModuleValue(module, nextValue);
                updateStatus(status, nextValue);
                showToast(`${module.name} ${nextValue ? 'enabled' : 'disabled'}`);
            } catch (error) {
                checkbox.checked = !nextValue;
                updateStatus(status, checkbox.checked);
                showToast(`Could not update ${module.name}`, true);
                console.error('[Sidekick Popup] Toggle failed:', error);
            } finally {
                checkbox.disabled = false;
            }
        });

        row.append(icon, details, switchLabel);
        return row;
    }

    function updateStatus(element, enabled) {
        element.textContent = enabled ? 'Enabled' : 'Off';
        element.classList.toggle('enabled', enabled);
    }

    function openCustomizer() {
        state.customizeDraft = new Set(state.pinned);
        elements.moduleSearch.value = '';
        renderCustomizer();
        showView('customizeView');
        elements.moduleSearch.focus();
    }

    function renderCustomizer() {
        const query = elements.moduleSearch.value.trim().toLowerCase();
        elements.customizeList.replaceChildren();

        MODULES
            .filter(module => !query || `${module.name} ${module.category}`.toLowerCase().includes(query))
            .forEach(module => {
                const label = document.createElement('label');
                label.className = 'picker-row';

                const image = document.createElement('img');
                image.src = module.icon;
                image.alt = '';

                const details = document.createElement('div');
                const name = document.createElement('div');
                name.className = 'module-name';
                name.textContent = module.name;
                const category = document.createElement('div');
                category.className = 'picker-category';
                category.textContent = module.category;
                details.append(name, category);

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = state.customizeDraft.has(module.id);
                checkbox.setAttribute('aria-label', `Pin ${module.name}`);
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) state.customizeDraft.add(module.id);
                    else state.customizeDraft.delete(module.id);
                    queuePinnedSelectionSave()
                        .then(() => showToast('Selection saved'))
                        .catch(error => {
                            console.error('[Sidekick Popup] Could not save quick controls:', error);
                            showToast('Could not save selection', true);
                        });
                });

                label.append(image, details, checkbox);
                elements.customizeList.appendChild(label);
            });
    }

    async function saveCustomizer() {
        await queuePinnedSelectionSave();
        renderControls();
        showView('controlsView');
        showToast('Quick controls updated');
    }

    function queuePinnedSelectionSave() {
        const selection = MODULES
            .filter(module => state.customizeDraft.has(module.id))
            .map(module => module.id);
        state.pinned = selection;

        state.pinSaveQueue = state.pinSaveQueue
            .catch(() => undefined)
            .then(async () => {
                await chrome.storage.local.set({ [PINNED_KEY]: selection });
                const verification = await chrome.storage.local.get(PINNED_KEY);
                const saved = verification[PINNED_KEY];
                if (!Array.isArray(saved) || JSON.stringify(saved) !== JSON.stringify(selection)) {
                    throw new Error('Pinned module verification failed');
                }
            });
        return state.pinSaveQueue;
    }

    async function openNotifications() {
        await renderNotifications();
        showView('notificationsView');
    }

    async function renderNotifications() {
        const result = await chrome.storage.local.get(NOTIFICATIONS_KEY);
        const notifications = Array.isArray(result[NOTIFICATIONS_KEY]) ? result[NOTIFICATIONS_KEY].slice(0, 15) : [];
        elements.notificationsList.replaceChildren();
        elements.notificationsEmpty.hidden = notifications.length !== 0;

        notifications.forEach(notification => {
            const card = document.createElement('article');
            card.className = `notification-card ${safeNotificationType(notification.type)}`;

            const titleRow = document.createElement('div');
            titleRow.className = 'notification-title-row';
            const title = document.createElement('div');
            title.className = 'notification-title';
            title.textContent = notification.title || 'Sidekick';
            const time = document.createElement('time');
            time.className = 'notification-time';
            time.textContent = formatTimeAgo(notification.timestamp);
            titleRow.append(title, time);
            card.appendChild(titleRow);

            if (notification.message) {
                const message = document.createElement('div');
                message.className = 'notification-message';
                message.textContent = notification.message;
                card.appendChild(message);
            }

            elements.notificationsList.appendChild(card);
        });

        if (notifications.some(notification => notification.read === false)) {
            const all = Array.isArray(result[NOTIFICATIONS_KEY]) ? result[NOTIFICATIONS_KEY] : [];
            await chrome.storage.local.set({
                [NOTIFICATIONS_KEY]: all.map(notification => ({ ...notification, read: true }))
            });
        }
        elements.notificationDot.hidden = true;
    }

    async function clearNotifications() {
        await chrome.storage.local.set({ [NOTIFICATIONS_KEY]: [] });
        await renderNotifications();
        showToast('Notifications cleared');
    }

    async function refreshNotificationIndicator() {
        const result = await chrome.storage.local.get(NOTIFICATIONS_KEY);
        const notifications = Array.isArray(result[NOTIFICATIONS_KEY]) ? result[NOTIFICATIONS_KEY] : [];
        elements.notificationDot.hidden = !notifications.some(notification => notification.read === false);
    }

    function safeNotificationType(type) {
        return ['success', 'warning', 'error', 'info'].includes(type) ? type : 'info';
    }

    function formatTimeAgo(timestamp) {
        const value = Number(timestamp);
        if (!Number.isFinite(value)) return '';
        const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
        if (seconds < 60) return 'Now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
        return `${Math.floor(seconds / 86400)}d`;
    }

    async function broadcastModuleUpdate(module, enabled) {
        const tabs = await chrome.tabs.query({ url: ['https://www.torn.com/*', 'https://*.torn.com/*'] });
        await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, {
            action: 'updateModuleSettings',
            moduleId: module.subKey || module.id,
            settings: { isEnabled: enabled }
        })));
    }

    async function sendToActiveTornTab(action) {
        const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
            url: ['https://www.torn.com/*', 'https://*.torn.com/*']
        });
        if (!tabs[0]) {
            showToast('Open Torn before using this action', true);
            return;
        }

        try {
            await chrome.tabs.sendMessage(tabs[0].id, { action });
            window.close();
        } catch (error) {
            showToast('Sidekick is not ready on this Torn tab', true);
        }
    }

    async function handleStorageChange(changes, areaName) {
        if (areaName !== 'local') return;

        if (changes[PINNED_KEY]) {
            state.pinned = await loadPinnedModules();
            renderControls();
        }

        if (changes[NOTIFICATIONS_KEY]) {
            await refreshNotificationIndicator();
            if (elements.notificationsView.classList.contains('active')) await renderNotifications();
        }

        if (MODULES.some(module => changes[module.storageKey])) {
            await refreshModuleValues();
            renderControls();
        }
    }

    function showToast(message, isError = false) {
        clearTimeout(state.toastTimer);
        elements.toast.textContent = message;
        elements.toast.classList.toggle('error', isError);
        elements.toast.classList.add('visible');
        state.toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 1800);
    }
})();
