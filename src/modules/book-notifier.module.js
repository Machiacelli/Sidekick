// Mission Rewards Book Notifier Module
// Shows a "Book: None" or "Book: [Name]" line after the Company Addiction section
const BookNotifierModule = {
    isEnabled: false,
    checkInterval: null,
    statusElement: null,
    CHECK_INTERVAL_MS: 12 * 60 * 60 * 1000, // 12 hours
    STORAGE_KEY: 'book-notifier',

    async init() {
        console.log('[BookNotifier] Initializing...');
        await this.loadSettings();
        if (this.isEnabled) this.enable();
        console.log('[BookNotifier] Initialized');
    },

    async loadSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
            if (data && data[this.STORAGE_KEY]) {
                this.isEnabled = data[this.STORAGE_KEY].isEnabled || false;
            }
        } catch (error) {
            console.error('[BookNotifier] Failed to load settings:', error);
        }
    },

    async saveSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
            data[this.STORAGE_KEY] = { isEnabled: this.isEnabled };
            await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', data);
        } catch (error) {
            console.error('[BookNotifier] Failed to save settings:', error);
        }
    },

    enable() {
        this.isEnabled = true;
        this.saveSettings();
        this.insertStatusLine();
        this.showStatusLine(null, true); // "Checking..."
        this.checkForBook();
        if (this.checkInterval) clearInterval(this.checkInterval);
        this.checkInterval = setInterval(() => this.checkForBook(), this.CHECK_INTERVAL_MS);
        console.log('[BookNotifier] Enabled');
    },

    disable() {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        this.saveSettings();
        if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
        this.removeStatusLine();
        console.log('[BookNotifier] Disabled');
    },

    // Insert the status <section> right after #companyAddictionLevel
    insertStatusLine() {
        if (document.getElementById('sidekick-book-status')) return;

        const tryInsert = () => {
            const anchor = document.getElementById('companyAddictionLevel');
            if (!anchor || !anchor.parentNode) return false;

            const section = document.createElement('section');
            section.id = 'sidekick-book-status';
            section.style.cssText = 'font-size: 12px; padding: 2px 0;';
            anchor.parentNode.insertBefore(section, anchor.nextSibling);
            this.statusElement = section;
            return true;
        };

        if (!tryInsert()) {
            // Page might not have rendered yet — poll for up to 15s
            let tries = 0;
            const poll = setInterval(() => {
                tries++;
                if (tryInsert() || tries >= 30) clearInterval(poll);
            }, 500);
        }
    },

    showStatusLine(bookName, checking) {
        const section = document.getElementById('sidekick-book-status');
        if (!section) { this.insertStatusLine(); return; }

        if (checking) {
            section.style.color = '#888';
            section.innerHTML = '<span class="title">Book: </span><span>Checking...</span>';
            return;
        }

        if (bookName && !['No API key', 'API error', 'No missions data', 'Check failed'].includes(bookName)) {
            // Book found — green, hyperlinked
            section.style.color = '#4CAF50';
            section.innerHTML = `<a href="https://www.torn.com/missions.php" target="_blank" style="color:#4CAF50;font-weight:bold;text-decoration:none;"><span class="title">Book: </span>${bookName}</a>`;
        } else if (bookName) {
            // Error state
            section.style.color = '#e57373';
            section.innerHTML = `<span class="title">Book: </span><span>${bookName}</span>`;
        } else {
            // No book — dim/neutral, no link
            section.style.color = '';
            section.innerHTML = `<a href="https://www.torn.com/missions.php" target="_blank" style="color:rgba(255,255,255,0.4);text-decoration:none;"><span class="title">Book: </span><span>None</span></a>`;
        }
    },

    async checkForBook() {
        try {
            const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
            if (!apiKey) { this.showStatusLine('No API key', false); return; }

            const response = await chrome.runtime.sendMessage({
                action: 'fetchTornApi',
                apiKey: apiKey,
                selections: ['missions'],
                comment: 'BookNotifierModule'
            });

            if (!response || !response.success || response.error) {
                this.showStatusLine('API error', false); return;
            }
            if (!response.missions) {
                this.showStatusLine(null, false); return; // No missions data = treat as no book
            }

            const bookRewards = (response.missions?.rewards || []).filter(r => r.details?.type === 'Book');
            const bookName = bookRewards.length > 0 ? (bookRewards[0].details?.name || 'Book Available') : null;
            this.showStatusLine(bookName, false);

        } catch (error) {
            console.error('[BookNotifier] Error:', error);
            this.showStatusLine('Check failed', false);
        }
    },

    removeStatusLine() {
        const el = document.getElementById('sidekick-book-status');
        if (el) { el.remove(); this.statusElement = null; }
    }
};

if (typeof window.SidekickModules === 'undefined') window.SidekickModules = {};
window.SidekickModules.BookNotifier = BookNotifierModule;
console.log('[BookNotifier] Module registered');
