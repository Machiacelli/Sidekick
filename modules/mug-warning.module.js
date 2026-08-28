// Mug Warning Module - Warns before mugging the same person twice
// Shows customizable modal when viewing/attacking recently mugged players
const MugWarningModule = {
    isEnabled: false,
    STORAGE_KEY: 'mug-warning',
    IGNORED_KEY: 'mug_targets',
    MUG_INFO_KEY: 'mug_info',

    // Settings
    hoursThreshold: 24,
    modalBgColor: '#ff4d4d',
    modalTextColor: '#ffffff',
    settingsBgColor: '#2b2b2b',
    settingsTextColor: '#ffffff',
    buttonTextColor: '#ffffff',

    apiKey: null,
    lastCheckTime: 0,
    MIN_CHECK_INTERVAL: 5000, // 5 seconds

    // Initialize module
    async init() {
        console.log('⚠️ Mug Warning initializing...');

        await this.loadSettings();

        if (this.isEnabled) {
            this.enable();
        }

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[this.STORAGE_KEY]) {
                this.loadSettings();
            }
        });

        console.log('⚠️ Mug Warning initialized');
    },

    // Load settings
    async loadSettings() {
        try {
            const settings = await window.SidekickModules.Core.ChromeStorage.get(this.STORAGE_KEY) || {};
            this.isEnabled = settings.enabled || false;
            this.hoursThreshold = settings.hoursThreshold || 24;
            this.modalBgColor = settings.modalBgColor || '#ff4d4d';
            this.modalTextColor = settings.modalTextColor || '#ffffff';
            this.settingsBgColor = settings.settingsBgColor || '#2b2b2b';
            this.settingsTextColor = settings.settingsTextColor || '#ffffff';
            this.buttonTextColor = settings.buttonTextColor || '#ffffff';

            this.apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key') || '';
        } catch (error) {
            console.error('⚠️ Failed to load settings:', error);
        }
    },

    // Save settings
    async saveSettings() {
        try {
            await window.SidekickModules.Core.ChromeStorage.set(this.STORAGE_KEY, {
                enabled: this.isEnabled,
                hoursThreshold: this.hoursThreshold,
                modalBgColor: this.modalBgColor,
                modalTextColor: this.modalTextColor,
                settingsBgColor: this.settingsBgColor,
                settingsTextColor: this.settingsTextColor,
                buttonTextColor: this.buttonTextColor
            });
        } catch (error) {
            console.error('⚠️ Failed to save settings:', error);
        }
    },

    // Enable module
    enable() {
        this.isEnabled = true;
        this.saveSettings();
        this.startMonitoring();
        console.log('⚠️ Mug Warning enabled');
    },

    // Disable module
    disable() {
        this.isEnabled = false;
        this.saveSettings();
        console.log('⚠️ Mug Warning disabled');
    },

    // Start monitoring for profiles/attacks
    startMonitoring() {
        if (!this.isEnabled) return;

        // Check if on profile or attack page
        if (this.isProfilePage() || this.isAttackPage()) {
            this.checkForRecentMug();
        }

        // Observer for SPA navigation
        const observer = new MutationObserver(() => {
            if (this.isProfilePage() || this.isAttackPage()) {
                this.checkForRecentMug();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    },

    isProfilePage() {
        return /profiles\.php|profile\.php|pda\.php/.test(location.pathname + location.search);
    },

    isAttackPage() {
        return /loader\.php/.test(location.pathname) && this.getAttackTargetId();
    },

    getProfileId() {
        try {
            const url = new URL(window.location.href);
            return url.searchParams.get('XID') || url.searchParams.get('ID') || null;
        } catch {
            return null;
        }
    },

    getAttackTargetId() {
        try {
            const url = new URL(window.location.href);
            return url.searchParams.get('user2ID') || null;
        } catch {
            return null;
        }
    },

    async checkForRecentMug() {
        console.log('⚠️ Mug Warning: checkForRecentMug() called');

        if (!this.apiKey) {
            console.log('⚠️ Mug Warning: No API key, skipping');
            return;
        }

        // Rate limiting
        const now = Date.now();
        if (now - this.lastCheckTime < this.MIN_CHECK_INTERVAL) {
            console.log('⚠️ Mug Warning: Rate limited, skipping');
            return;
        }
        this.lastCheckTime = now;

        const targetId = this.getProfileId() || this.getAttackTargetId();
        if (!targetId) {
            console.log('⚠️ Mug Warning: No target ID found');
            return;
        }

        console.log(`⚠️ Mug Warning: Checking player ID ${targetId}...`);

        // Check if ignored
        if (await this.isIgnored(targetId)) {
            console.log(`⚠️ Mug Warning: Player ${targetId} is in mug targets list (ignored)`);
            return;
        }

        // Check for recent mug
        try {
            console.log(`⚠️ Mug Warning: Fetching attacks from API...`);
            const resp = await fetch(`https://api.torn.com/user/?selections=attacks&key=${this.apiKey}`, { cache: 'no-store' });
            const data = await resp.json();

            if (data.error || !data.attacks) {
                console.log('⚠️ Mug Warning: API error or no attacks', data.error);
                return;
            }

            const attacks = Object.values(data.attacks);
            const cutoff = Date.now() - (this.hoursThreshold * 3600 * 1000);
            console.log(`⚠️ Mug Warning: Checking ${attacks.length} attacks (threshold: ${this.hoursThreshold}h)`);

            for (const attack of attacks) {
                const timestamp = this.extractTimestamp(attack);
                if (timestamp && timestamp >= cutoff && this.attackIndicatesMug(attack, targetId)) {
                    console.log(`⚠️ Mug Warning: MATCH FOUND! Showing warning...`);
                    this.showWarningModal(targetId, new Date(timestamp).toISOString());
                    return;
                }
            }

            console.log(`⚠️ Mug Warning: No recent mugs found for ${targetId}`);
        } catch (error) {
            console.error('⚠️ Failed to check attacks:', error);
        }
    },

    extractTimestamp(attack) {
        try {
            const fields = ['time', 'timestamp', 'timestamp_ended'];
            for (const field of fields) {
                if (attack[field] !== undefined) {
                    const t = parseInt(attack[field]);
                    if (!isNaN(t)) return t * 1000; // Convert to milliseconds
                }
            }
        } catch { }
        return null;
    },

    attackIndicatesMug(attack, targetId) {
        try {
            const text = JSON.stringify(attack).toLowerCase();
            return /mug(g?ed|ging)/.test(text) && text.includes(String(targetId));
        } catch { }
        return false;
    },

    showWarningModal(profileId, whenIso) {
        if (document.getElementById('sidekick-mug-modal')) return;

        const overlay = document.createElement('div');
        overlay.id = 'sidekick-mug-modal';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999999,
            padding: '10px',
            boxSizing: 'border-box'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            background: this.modalBgColor,
            color: this.modalTextColor,
            padding: '16px',
            borderRadius: '10px',
            textAlign: 'center',
            width: '90%',
            maxWidth: '400px',
            fontWeight: '700',
            boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
            lineHeight: '1.4'
        });

        // Calculate time
        const now = Date.now();
        let timeText = 'unknown';
        let timeColor = '#000000';
        if (whenIso) {
            const mugTime = Date.parse(whenIso);
            if (!isNaN(mugTime)) {
                const diffMs = Math.max(0, now - mugTime);
                const diffHrs = Math.floor(diffMs / 3600000);
                const diffMins = Math.floor((diffMs % 3600000) / 60000);
                timeText = `${diffHrs}h ${diffMins}m ago`;
                if (diffHrs >= 12 && diffHrs < this.hoursThreshold) {
                    timeColor = '#00ff00';
                }
            }
        }

        modal.innerHTML = `
            <div style="font-size:18px;margin-bottom:8px">⚠️ WARNING</div>
            <div style="font-size:14px;font-weight:600;margin-bottom:10px">You mugged this player within the last ${this.hoursThreshold} hours</div>
            <div style="font-size:14px">Time since last mug: <span style="font-weight:700;color:${timeColor}">${timeText}</span></div>
        `;

        const buttons = document.createElement('div');
        Object.assign(buttons.style, {
            display: 'flex',
            justifyContent: 'center',
            marginTop: '16px',
            gap: '10px'
        });

        const addTargetBtn = document.createElement('button');
        addTargetBtn.innerText = 'Set Mug Target';
        const dismissBtn = document.createElement('button');
        dismissBtn.innerText = 'Dismiss';

        [addTargetBtn, dismissBtn].forEach(b => {
            Object.assign(b.style, {
                padding: '8px 14px',
                border: `2px solid ${this.buttonTextColor}`,
                borderRadius: '6px',
                background: 'transparent',
                color: this.buttonTextColor,
                fontWeight: '700',
                cursor: 'pointer'
            });
            b.onmouseover = () => { b.style.background = this.buttonTextColor; b.style.color = this.modalBgColor; };
            b.onmouseout = () => { b.style.background = 'transparent'; b.style.color = this.buttonTextColor; };
        });

        addTargetBtn.onclick = async () => {
            await this.addMugTarget(profileId);
            overlay.remove();
        };
        dismissBtn.onclick = () => overlay.remove();

        buttons.append(addTargetBtn, dismissBtn);
        modal.appendChild(buttons);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },

    async addMugTarget(id) {
        try {
            const targets = await window.SidekickModules.Core.ChromeStorage.get(this.IGNORED_KEY) || {};
            targets[id] = true;
            await window.SidekickModules.Core.ChromeStorage.set(this.IGNORED_KEY, targets);
        } catch (error) {
            console.error('⚠️ Failed to add mug target:', error);
        }
    },

    async removeMugTarget(id) {
        try {
            const targets = await window.SidekickModules.Core.ChromeStorage.get(this.IGNORED_KEY) || {};
            delete targets[id];
            await window.SidekickModules.Core.ChromeStorage.set(this.IGNORED_KEY, targets);
        } catch (error) {
            console.error('⚠️ Failed to remove mug target:', error);
        }
    },

    async getMugTargets() {
        try {
            return await window.SidekickModules.Core.ChromeStorage.get(this.IGNORED_KEY) || {};
        } catch {
            return {};
        }
    },

    async isIgnored(id) {
        const targets = await this.getMugTargets();
        return !!targets[id];
    }
};

// Register module
if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.MugWarning = MugWarningModule;

console.log('⚠️ Mug Warning module registered');
