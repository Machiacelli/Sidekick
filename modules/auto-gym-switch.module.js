// Auto Gym Switch Module
// The actual fetch interception runs in auto-gym-switch-inject.js (MAIN world,
// document_start) because content scripts cannot override window.fetch for the
// page's own JavaScript. This module (isolated world) only manages the
// enabled/disabled state, written to localStorage so the inject script can read it.
// Forked from Auto gym switch by Stephen Lynx

const AutoGymSwitchModule = {
    isEnabled: false,
    STORAGE_KEY: 'auto-gym-switch',
    LS_KEY: 'sidekick_auto_gym_enabled',

    async init() {
        console.log('💪 Auto Gym Switch initializing...');
        await this.loadSettings();

        if (this.isEnabled) {
            this.enable();
        } else {
            localStorage.setItem(this.LS_KEY, 'false');
        }

        // React to settings changes from the popup
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.sidekick_settings) {
                this.loadSettings().then(() => {
                    localStorage.setItem(this.LS_KEY, this.isEnabled ? 'true' : 'false');
                });
            }
        });

        console.log('💪 Auto Gym Switch initialized, enabled:', this.isEnabled);
    },

    async loadSettings() {
        return new Promise(resolve => {
            chrome.storage.local.get(['sidekick_settings', 'sidekick_auto_gym_switch'], (result) => {
                // Primary: unified settings format
                const unified = result.sidekick_settings || {};
                const unifiedVal = unified[this.STORAGE_KEY];

                // Fallback: legacy key format saved by the settings panel
                const legacyVal = result.sidekick_auto_gym_switch;

                console.log('💪 Raw storage for auto-gym-switch:', {
                    unified: unifiedVal,
                    legacy: legacyVal
                });

                if (unifiedVal && typeof unifiedVal.isEnabled === 'boolean') {
                    this.isEnabled = unifiedVal.isEnabled;
                } else if (legacyVal && typeof legacyVal.isEnabled === 'boolean') {
                    // Migrate legacy value into unified format
                    this.isEnabled = legacyVal.isEnabled;
                    if (!unified[this.STORAGE_KEY]) {
                        unified[this.STORAGE_KEY] = { isEnabled: this.isEnabled };
                        chrome.storage.local.set({ sidekick_settings: unified });
                    }
                } else {
                    this.isEnabled = false;
                }

                // Always sync localStorage so the inject script reads the correct state
                localStorage.setItem(this.LS_KEY, this.isEnabled ? 'true' : 'false');
                console.log('💪 Auto Gym Switch settings loaded, enabled:', this.isEnabled);
                resolve();
            });
        });
    },

    async saveSettings() {
        try {
            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
            settings[this.STORAGE_KEY] = { isEnabled: this.isEnabled };
            await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', settings);
        } catch (error) {
            console.error('💪 Failed to save settings:', error);
        }
    },

    enable() {
        this.isEnabled = true;
        localStorage.setItem(this.LS_KEY, 'true');
        this.saveSettings();
        console.log('💪 Auto Gym Switch enabled');
    },

    disable() {
        this.isEnabled = false;
        localStorage.setItem(this.LS_KEY, 'false');
        this.saveSettings();
        console.log('💪 Auto Gym Switch disabled');
    }
};

if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.AutoGymSwitch = AutoGymSwitchModule;

console.log('💪 Auto Gym Switch module registered');
