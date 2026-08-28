/**
 * Book Notifier Module
 * Checks if the user has any unclaimed Book rewards from missions.
 * Uses Torn API v2.
 */

const BookNotifierModule = {
    name: 'Book Notifier',
    version: '1.1.0',
    STORAGE_KEY: 'book-notifier',

    ICON_ID: 'sk-book-notifier-icon',
    STYLES_ID: 'sk-book-notifier-styles',

    isEnabled: false,
    openInNewTab: false,
    checkIntervalMinutes: 5,

    pollTimer: null,
    countdownTimer: null,
    observer: null,
    activeBooks: null,

    // ─── Init ────────────────────────────────────────────────────────────────

    async init() {
        console.log('📚 Book Notifier: initializing...');
        await this.loadSettings();

        if (this.isEnabled) {
            this.startPolling();
        }

        this.startObserver();

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.sidekick_settings) {
                const oldEnabled = this.isEnabled;
                const oldInterval = this.checkIntervalMinutes;
                this.loadSettings().then(() => {
                    if (this.isEnabled && (!oldEnabled || this.checkIntervalMinutes !== oldInterval)) {
                        this.startPolling();
                    } else if (!this.isEnabled && oldEnabled) {
                        this.stopPolling();
                        this.removeIcon();
                    }
                });
            }
        });
    },

    // ─── Settings ────────────────────────────────────────────────────────────

    async loadSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
            if (data && data[this.STORAGE_KEY]) {
                const s = data[this.STORAGE_KEY];
                this.isEnabled = s.isEnabled || false;
                this.openInNewTab = s.openInNewTab || false;
                this.checkIntervalMinutes = s.checkIntervalMinutes || 5;
            }
        } catch (e) {
            console.error('📚 Book Notifier: failed to load settings:', e);
        }
    },

    async saveSettings() {
        try {
            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
            data[this.STORAGE_KEY] = {
                isEnabled: this.isEnabled,
                openInNewTab: this.openInNewTab,
                checkIntervalMinutes: this.checkIntervalMinutes
            };
            await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', data);
        } catch (e) {
            console.error('📚 Book Notifier: failed to save settings:', e);
        }
    },

    // ─── Polling ─────────────────────────────────────────────────────────────

    startPolling() {
        this.stopPolling();
        this.checkBooks();
        this.pollTimer = setInterval(() => this.checkBooks(), this.checkIntervalMinutes * 60 * 1000);
    },

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    },

    async getApiKey() {
        try {
            return await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key') || '';
        } catch {
            return '';
        }
    },

    async fetchData(url) {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'proxyFetch', url });
            if (response && response.success) return response.data;
            throw new Error(response?.error || 'Background fetch failed');
        } catch {
            const r = await fetch(url);
            return r.json();
        }
    },

    async checkBooks() {
        const apiKey = await this.getApiKey();
        if (!apiKey) return;

        try {
            const data = await this.fetchData(`https://api.torn.com/v2/user/missions?key=${apiKey}`);
            if (data.error) {
                console.warn('📚 Book Notifier: API error:', data.error.error);
                return;
            }

            const rewards = data.missions?.rewards || [];

            // Look for any reward that is a Book
            const books = rewards
                .filter(r => r.details && r.details.type === 'Book')
                .sort((a, b) => {
                    const aExpiry = Number(a.expires_at) || Number.MAX_SAFE_INTEGER;
                    const bExpiry = Number(b.expires_at) || Number.MAX_SAFE_INTEGER;
                    return aExpiry - bExpiry;
                });

            if (books.length > 0) {
                this.activeBooks = books;
                this.showStatusLine(books);
            } else {
                this.activeBooks = [];
                this.showStatusLine(null);
            }
        } catch (e) {
            console.error('📚 Book Notifier: check failed:', e);
        }
    },

    // ─── Status Line ─────────────────────────────────────────────────────────

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    formatRemaining(expiresAt, nowSeconds = Math.floor(Date.now() / 1000)) {
        const total = Math.max(0, Math.ceil(Number(expiresAt) - nowSeconds));
        const days = Math.floor(total / 86400);
        const hours = Math.floor((total % 86400) / 3600);
        const totalHours = Math.floor(total / 3600);
        const minutes = Math.ceil(total / 60);

        if (days > 0) return `${days}d ${hours}h`;
        if (totalHours > 0) return `${totalHours}h`;
        if (total < 60) return '<1m';
        if (minutes > 0) return `${minutes}m`;
        return 'Expired';
    },

    startCountdown() {
        if (this.countdownTimer) return;
        this.updateCountdown();
        this.countdownTimer = setInterval(() => this.updateCountdown(), 30000);
    },

    stopCountdown() {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
    },

    updateCountdown() {
        if (!Array.isArray(this.activeBooks) || this.activeBooks.length === 0) {
            this.stopCountdown();
            return;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const availableBooks = this.activeBooks.filter(book => {
            const expiresAt = Number(book.expires_at);
            return !Number.isFinite(expiresAt) || expiresAt <= 0 || expiresAt > nowSeconds;
        });

        if (availableBooks.length !== this.activeBooks.length) {
            this.activeBooks = availableBooks;
            this.showStatusLine(availableBooks.length > 0 ? availableBooks : null);
            return;
        }

        const countdown = document.getElementById('sk-book-notifier-countdown');
        if (!countdown) return;

        const expiresAt = Number(availableBooks[0]?.expires_at);
        if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
            countdown.textContent = 'No expiry';
            return;
        }

        countdown.textContent = this.formatRemaining(expiresAt, nowSeconds);
        countdown.title = `Removed from rewards at ${new Date(expiresAt * 1000).toLocaleString()}`;
    },

    insertStatusLine() {
        if (document.getElementById(this.ICON_ID)) return;

        const anchor = document.getElementById('companyAddictionLevel') || document.querySelector('.tt-sidebar-information section');
        const container = document.querySelector('.tt-sidebar-information');

        if (!container && !anchor) return false;

        const section = document.createElement('section');
        section.id = this.ICON_ID;
        section.style.cssText = 'order: 0;'; // Place it above OC timer

        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(section, anchor.nextSibling);
        } else if (container) {
            container.appendChild(section);
        }

        return true;
    },

    showStatusLine(books) {
        let section = document.getElementById(this.ICON_ID);
        if (!section) {
            if (!this.insertStatusLine()) return;
            section = document.getElementById(this.ICON_ID);
        }

        const count = books ? books.length : 0;

        if (count > 0) {
            const firstName = books[0]?.details?.name?.replace(/^Book\s*:\s*/i, '') || 'Book Available';
            const moreBooks = count > 1 ? ` +${count - 1}` : '';
            const target = this.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : '';
            section.innerHTML = `<a class="title" href="/page.php?sid=missions"${target}>Book: </a><span><a href="/page.php?sid=missions"${target} style="color:#4CAF50;font-weight:bold;text-decoration:none;">${this.escapeHtml(firstName)}${moreBooks}</a> <span style="color:#aaa;white-space:nowrap;">· <span id="sk-book-notifier-countdown">--</span></span></span>`;
            this.startCountdown();
            this.updateCountdown();
        } else {
            section.innerHTML = `<a class="title" href="/page.php?sid=missions">Book: </a><span style="color:#777;">None</span>`;
            this.stopCountdown();
        }
    },

    removeIcon() {
        document.getElementById(this.ICON_ID)?.remove();
    },

    // ─── Observer ────────────────────────────────────────────────────────────

    startObserver() {
        if (this.observer) return;
        let debounceTimer = null;
        this.observer = new MutationObserver(() => {
            if (!this.isEnabled) return;

            const container = document.querySelector('.tt-sidebar-information');
            if (container && !document.getElementById(this.ICON_ID)) {
                if (this.activeBooks !== null) {
                    this.showStatusLine(this.activeBooks);
                } else {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => this.checkBooks(), 5000);
                }
            }
        });
        this.observer.observe(document.documentElement, { childList: true, subtree: true });
    },

    stopObserver() {
        if (this.observer) { this.observer.disconnect(); this.observer = null; }
    },

    // ─── Public API ──────────────────────────────────────────────────────────

    enable() {
        this.isEnabled = true;
        this.saveSettings();
        this.startPolling();
    },

    disable() {
        this.isEnabled = false;
        this.saveSettings();
        this.stopPolling();
        this.stopCountdown();
        this.removeIcon();
    },
};

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.BookNotifier = BookNotifierModule;
console.log('📚 Book Notifier module registered');
