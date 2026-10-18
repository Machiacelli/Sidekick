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
    // How long a per-target "did we mug them recently?" answer stays fresh.
    // Profile/attack pages re-check on every mutation burst; without a TTL
    // cache those sweeps would hit the Torn API on each DOM change.
    MUG_RESULT_TTL: 10 * 60 * 1000, // 10 minutes
    _mugCache: new Map(),

    // Initialize module
    async init() {
        console.log('⚠️ Mug Warning initializing...');

        await this.loadSettings();

        if (this.isEnabled) {
            this.enable();
        }

        // Listen for storage changes. enable()/disable() from the settings
        // panel already handle arming; this also covers the toolbar popup
        // path, which only writes storage — re-arm or tear down here so the
        // observer always matches the enabled state.
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[this.STORAGE_KEY]) {
                this.loadSettings().then(() => {
                    if (this.isEnabled) {
                        this.startMonitoring();
                    } else if (this._observer) {
                        this._observer.disconnect();
                        this._observer = null;
                    }
                });
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

    // Start monitoring for profiles/attacks
    startMonitoring() {
        if (!this.isEnabled) return;

        // Re-arming after a disable/enable cycle must not stack observers
        // (the same leak pattern flagged for war-monitor / chaintimer).
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }

        // Check if on profile or attack page
        if (this.isProfilePage() || this.isAttackPage()) {
            this.checkForRecentMug();
        }

        // Observer for SPA navigation
        this._observer = new MutationObserver(() => {
            if (this.isProfilePage() || this.isAttackPage()) {
                this.checkForRecentMug();
            }
        });

        this._observer.observe(document.body, { childList: true, subtree: true });
    },

    // Disable module
    disable() {
        this.isEnabled = false;
        this.saveSettings();
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        console.log('⚠️ Mug Warning disabled');
    },

    isProfilePage() {
        return /profiles\.php|profile\.php|pda\.php/.test(location.pathname + location.search);
    },

    // Torn moved attack pages from loader.php to page.php?sid=attack; support
    // both (same pattern as attack-button-mover / war-target-caller).
    isAttackPage() {
        const path = location.pathname.toLowerCase();
        const sid = (new URLSearchParams(location.search).get('sid') || '').toLowerCase();
        const attack = (path.endsWith('page.php') || path.endsWith('loader.php')) && sid === 'attack';
        return attack && this.getAttackTargetId();
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
            // Modern attacks live at page.php?sid=attack with user2ID=; legacy
            // loader.php used the same param. Try all known param spellings.
            for (const key of ['user2ID', 'user2Id', 'XID', 'xid']) {
                const value = url.searchParams.get(key);
                if (/^\d+$/.test(value || '')) return value;
            }
            return null;
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

        // Check for recent mug (result cached per target with a short TTL so
        // re-views don't re-hit the API)
        try {
            console.log(`⚠️ Mug Warning: Fetching recent attacks from API...`);

            const result = await this.fetchRecentMug(targetId, this.hoursThreshold);
            if (result === null) {
                console.log('⚠️ Mug Warning: API error or unavailable — skipping (fail silent)');
                return;
            }

            if (!result.mugged) {
                console.log(`⚠️ Mug Warning: No recent mugs found for ${targetId}`);
                return;
            }

            console.log(`⚠️ Mug Warning: MATCH FOUND! Showing warning...`);
            this.showWarningModal(targetId, new Date(result.timestamp).toISOString());
        } catch (error) {
            console.error('⚠️ Failed to check attacks:', error);
        }
    },

    /**
     * Check whether WE mugged `targetId` within the last `hours` hours.
     *
     * Efficiency notes (audit items 1–2; see PROJECT_CONTEXT "Torn API ToS"):
     * - Result is cached per target (+hours threshold) with a TTL, so the
     *   per-view "fetch the whole attacks log" behaviour is gone: profile
     *   and attack-page sweeps (MutationObserver fires on every DOM change)
     *   now hit the API at most once per target per TTL window.
     * - Transport goes through the background `proxyFetch` so the API key
     *   never appears in a content-script URL / page DevTools network log.
     * - Matches structurally on the attack object's fields
     *   (`defender_id` + `result === 'Mugged'`) instead of the old
     *   stringified-JSON substring match, which false-positived when the
     *   target ID appeared inside any numeric field (money, damage, etc.).
     */
    async fetchRecentMug(targetId, hours) {
        const cacheKey = `${targetId}:${hours}`;

        const now = Date.now();
        const cached = this._mugCache.get(cacheKey);
        if (cached && (now - cached.at) < this.MUG_RESULT_TTL) {
            return cached.result;
        }

        const result = await this._fetchAttacksViaProxy(targetId, hours);
        if (result !== null) {
            this._mugCache.set(cacheKey, { at: now, result });
        }
        return result;
    },

    async _fetchAttacksViaProxy(targetId, hours) {
        let response;
        try {
            response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'proxyFetch',
                    // Same transport as crime-notifier/travel-blocker: the
                    // background worker makes the request, so the key never
                    // shows up in the page's network tab. Only the fetched
                    // result is cached long-term (per target, with TTL); the
                    // structural scan below stops at the first match in the
                    // check window and never stringifies entries.
                    url: `https://api.torn.com/user/?selections=attacks&comment=SidekickMugWarning&key=${encodeURIComponent(this.apiKey)}`,
                }, (res) => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else resolve(res);
                });
            });
        } catch (error) {
            console.warn('⚠️ Mug Warning: proxy fetch failed:', error.message);
            return null;
        }

        if (!response?.success) {
            console.warn('⚠️ Mug Warning: API error:', response?.error);
            return null;
        }

        const data = response.data;
        if (data?.error || !data?.attacks) {
            console.warn('⚠️ Mug Warning: Torn API error:', data?.error?.error || 'no attacks payload');
            return null;
        }

        const attacks = Object.values(data.attacks);
        if (!attacks.length) return { mugged: false, timestamp: 0 };

        const cutoff = Date.now() - (hours * 3600 * 1000);
        let latest = 0;
        for (const attack of attacks) {
            // Structural match: WE attacked THEM and the result was a mug.
            // (The old JSON.stringify substring match could false-positive
            // when the target ID digits appeared inside any numeric field.)
            if (String(attack.defender_id || attack.defenderId || '') !== String(targetId)) continue;
            if ((attack.result || '').toLowerCase() !== 'mugged') continue;

            const ts = this.extractTimestamp(attack);
            if (ts && ts >= cutoff && ts > latest) latest = ts;
        }

        return latest > 0 ? { mugged: true, timestamp: latest } : { mugged: false, timestamp: 0 };
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
