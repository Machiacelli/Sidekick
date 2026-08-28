// Chat Alert Module - Browser Tab Notifications for Unread Messages
// Adds red badge to favicon and updates title with unread count
const ChatAlertModule = {
    isEnabled: false,
    STORAGE_KEY: 'chat-alert',
    CHECK_INTERVAL: 2000,

    originalFavicon: null,
    lastCount: 0,
    checkInterval: null,
    titleObserver: null,

    canvas: null,
    ctx: null,

    // Initialize module
    async init() {
        console.log('💬 Chat Alert initializing...');

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

        console.log('💬 Chat Alert initialized');
    },

    // Load settings from storage
    async loadSettings() {
        try {
            const settings = await window.SidekickModules.Core.ChromeStorage.get(this.STORAGE_KEY) || {};
            this.isEnabled = settings.enabled || false;
        } catch (error) {
            console.error('💬 Failed to load settings:', error);
        }
    },

    // Save settings to storage
    async saveSettings() {
        try {
            await window.SidekickModules.Core.ChromeStorage.set(this.STORAGE_KEY, {
                enabled: this.isEnabled
            });
        } catch (error) {
            console.error('💬 Failed to save settings:', error);
        }
    },

    // Enable module
    enable() {
        this.isEnabled = true;
        this.saveSettings();
        this.setupCanvas();
        this.loadFavicon();
        console.log('💬 Chat Alert enabled');
    },

    // Disable module
    disable() {
        this.isEnabled = false;
        this.saveSettings();
        this.stopChecking();
        this.restoreFavicon();
        this.restoreTitle();
        console.log('💬 Chat Alert disabled');
    },

    // Setup canvas for favicon rendering
    setupCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 32;
        this.canvas.height = 32;
        this.ctx = this.canvas.getContext('2d');
    },

    // Load original favicon
    loadFavicon() {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            this.originalFavicon = img;
            this.startChecking();
        };
        img.onerror = () => {
            console.warn('💬 Failed to load favicon, using default');
            this.startChecking();
        };
        img.src = 'https://www.torn.com/favicon.ico';
    },

    // Start checking for unread messages
    startChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        // Set up title observer
        this.setupTitleObserver();

        // Start checking
        this.checkInterval = setInterval(() => {
            if (this.isEnabled) {
                this.checkChat();
            }
        }, this.CHECK_INTERVAL);

        // Initial check
        this.checkChat();
    },

    // Stop checking
    stopChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        if (this.titleObserver) {
            this.titleObserver.disconnect();
            this.titleObserver = null;
        }
    },

    // Set up observer to reapply count when title changes
    setupTitleObserver() {
        if (this.titleObserver) {
            this.titleObserver.disconnect();
        }

        const titleElement = document.querySelector('title');
        if (!titleElement) return;

        this.titleObserver = new MutationObserver(() => {
            if (this.lastCount > 0) {
                // Torn changed the title, reapply our count
                this.updateTitle(this.lastCount);
            }
        });

        this.titleObserver.observe(titleElement, { childList: true });
    },

    // Get clean title without count prefix
    getCleanTitle() {
        const title = document.title;
        // Remove "(1) " or "(9+) " from the start
        return title.replace(/^\(\d+\+?\)\s/, '');
    },

    // Update title with count
    updateTitle(count) {
        const clean = this.getCleanTitle();
        if (count > 0) {
            const newTitle = `(${count}) ${clean}`;
            if (document.title !== newTitle) {
                document.title = newTitle;
            }
        } else {
            if (document.title !== clean) {
                document.title = clean;
            }
        }
    },

    // Update favicon with badge
    updateFavicon(count) {
        if (!this.originalFavicon || !this.ctx) return;

        const head = document.getElementsByTagName('head')[0];
        const existingLink = document.querySelector("link[rel*='icon']");
        const link = existingLink || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';

        if (count > 0) {
            // Clear and draw original favicon
            this.ctx.clearRect(0, 0, 32, 32);
            this.ctx.drawImage(this.originalFavicon, 0, 0, 32, 32);

            // Draw red badge circle
            this.ctx.beginPath();
            this.ctx.arc(22, 10, 10, 0, 2 * Math.PI, false);
            this.ctx.fillStyle = '#ff0000';
            this.ctx.fill();
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.stroke();

            // Draw count text
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(count > 9 ? '9+' : count.toString(), 22, 10.5);

            link.href = this.canvas.toDataURL('image/png');
        } else {
            link.href = this.originalFavicon.src;
        }

        // Apply favicon
        if (existingLink) {
            head.removeChild(existingLink);
        }
        head.appendChild(link);

        // Apply title
        this.updateTitle(count);
    },

    // Check chat for unread messages
    checkChat() {
        const chatRoot = document.getElementById('chatRoot');
        if (!chatRoot) return;

        const badges = chatRoot.querySelectorAll('[class*="messageCount"]');
        let total = 0;

        badges.forEach(badge => {
            const text = badge.innerText.trim();
            const val = parseInt(text);
            // Check if badge is visible (height > 0) and has valid count
            if (badge.getBoundingClientRect().height > 0 && !isNaN(val) && val > 0) {
                total += val;
            }
        });

        if (total !== this.lastCount) {
            this.updateFavicon(total);
            this.lastCount = total;
        }
    },

    // Restore original favicon
    restoreFavicon() {
        if (!this.originalFavicon) return;

        const head = document.getElementsByTagName('head')[0];
        const existingLink = document.querySelector("link[rel*='icon']");
        const link = existingLink || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = this.originalFavicon.src;

        if (existingLink) {
            head.removeChild(existingLink);
        }
        head.appendChild(link);
    },

    // Restore original title
    restoreTitle() {
        document.title = this.getCleanTitle();
        this.lastCount = 0;
    }
};

// Register module
if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.ChatAlert = ChatAlertModule;

console.log('💬 Chat Alert module registered');
