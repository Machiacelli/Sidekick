// Christmas Helper Module
// This module manages the enabled/disabled state of the Christmas Town helpers.
// The actual logic runs in christmas-helper-inject.js (MAIN world) to bypass CSP
// and intercept fetch/DOM. We use localStorage to pass settings to the injector.

const ChristmasHelperModule = {
    zoomEnabled: false,
    beersEnabled: false,

    STORAGE_KEY_ZOOM: 'christmas_zoom',
    STORAGE_KEY_BEERS: 'christmas_beers',
    LS_KEY_ZOOM: 'sidekick_christmas_zoom',
    LS_KEY_BEERS: 'sidekick_christmas_beers',

    async init() {
        console.log('🎄 Christmas Helper initializing...');
        await this.loadSettings();

        // React to settings changes from the popup/settings page
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.sidekick_settings) {
                this.loadSettings();
            }
        });

        console.log(`🎄 Christmas Helper initialized. Zoom: ${this.zoomEnabled}, Beers: ${this.beersEnabled}`);
    },

    async loadSettings() {
        return new Promise(resolve => {
            chrome.storage.local.get(['sidekick_settings'], (result) => {
                const unified = result.sidekick_settings || {};

                const zoomVal = unified[this.STORAGE_KEY_ZOOM];
                const beersVal = unified[this.STORAGE_KEY_BEERS];

                this.zoomEnabled = zoomVal && typeof zoomVal.isEnabled === 'boolean' ? zoomVal.isEnabled : false;
                this.beersEnabled = beersVal && typeof beersVal.isEnabled === 'boolean' ? beersVal.isEnabled : false;

                // Sync to localStorage for MAIN world script
                localStorage.setItem(this.LS_KEY_ZOOM, this.zoomEnabled ? 'true' : 'false');
                localStorage.setItem(this.LS_KEY_BEERS, this.beersEnabled ? 'true' : 'false');

                resolve();
            });
        });
    },

    async saveSettings() {
        try {
            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
            settings[this.STORAGE_KEY_ZOOM] = { isEnabled: this.zoomEnabled };
            settings[this.STORAGE_KEY_BEERS] = { isEnabled: this.beersEnabled };
            await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', settings);
        } catch (error) {
            console.error('🎄 Failed to save Christmas settings:', error);
        }
    },

    enableZoom() {
        this.zoomEnabled = true;
        localStorage.setItem(this.LS_KEY_ZOOM, 'true');
        this.saveSettings();
    },

    disableZoom() {
        this.zoomEnabled = false;
        localStorage.setItem(this.LS_KEY_ZOOM, 'false');
        this.saveSettings();
    },

    enableBeers() {
        this.beersEnabled = true;
        localStorage.setItem(this.LS_KEY_BEERS, 'true');
        this.saveSettings();
    },

    disableBeers() {
        this.beersEnabled = false;
        localStorage.setItem(this.LS_KEY_BEERS, 'false');
        this.saveSettings();
    }
};

if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.ChristmasHelper = ChristmasHelperModule;

console.log('🎄 Christmas Helper module registered');
