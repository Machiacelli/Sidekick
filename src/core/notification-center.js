/**
 * Sidekick Notification Center
 * Centralized notification management system
 */

const NotificationCenter = {
    MAX_NOTIFICATIONS: 50,
    STORAGE_KEY: 'sidekick_notifications',

    /**
     * Emit a new notification
     * @param {Object} notification - Notification object
     */
    async emit(notification) {
        if (!notification.moduleId || !notification.type || !notification.title) {
            console.error('Invalid notification:', notification);
            return;
        }

        const fullNotification = {
            id: crypto.randomUUID(),
            moduleId: notification.moduleId,
            type: notification.type, // success|info|warning|error
            title: notification.title,
            message: notification.message || '',
            timestamp: Date.now(),
            read: false,
            action: notification.action || null
        };

        // Get existing notifications
        const notifications = await this.getAll();

        // Add new notification at the beginning
        notifications.unshift(fullNotification);

        // Keep only last MAX_NOTIFICATIONS
        const trimmed = notifications.slice(0, this.MAX_NOTIFICATIONS);

        // Save to storage
        await chrome.storage.local.set({ [this.STORAGE_KEY]: trimmed });

        console.log('📬 Notification emitted:', fullNotification);

        return fullNotification;
    },

    /**
     * Get all notifications
     */
    async getAll() {
        const result = await chrome.storage.local.get([this.STORAGE_KEY]);
        return result[this.STORAGE_KEY] || [];
    },

    /**
     * Get recent notifications (limited)
     * @param {number} limit - Number of notifications to retrieve
     */
    async getRecent(limit = 10) {
        const all = await this.getAll();
        return all.slice(0, limit);
    },

    /**
     * Mark notification as read
     * @param {string} id - Notification ID
     */
    async markAsRead(id) {
        const notifications = await this.getAll();
        const notification = notifications.find(n => n.id === id);

        if (notification) {
            notification.read = true;
            await chrome.storage.local.set({ [this.STORAGE_KEY]: notifications });
        }
    },

    /**
     * Clear all notifications
     */
    async clearAll() {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: [] });
        console.log('🧹 All notifications cleared');
    },

    /**
     * Delete a specific notification
     * @param {string} id - Notification ID
     */
    async delete(id) {
        const notifications = await this.getAll();
        const filtered = notifications.filter(n => n.id !== id);
        await chrome.storage.local.set({ [this.STORAGE_KEY]: filtered });
    },

    /**
     * Get unread count
     */
    async getUnreadCount() {
        const all = await this.getAll();
        return all.filter(n => !n.read).length;
    }
};

// Export onto window so isolated-world modules (which gate on
// `if (window.NotificationCenter)`) can reach the API. Previously this was a
// bare top-level const, so those call sites silently never fired.
window.NotificationCenter = NotificationCenter;

// MANIFEST V3 FIX: Bridge between page context and content script
// Listen for custom events from page-context modules.
// MAIN-world dispatchers must send a STRINGIFIED detail (Chrome strips
// non-serialized detail when CustomEvents cross worlds) — see
// notification-bridge-page.js. Tolerate object details from same-world
// dispatchers for backwards compatibility.
window.addEventListener('sidekick:emitNotification', async (event) => {
    let notification = event.detail;
    if (typeof notification === 'string') {
        try {
            notification = JSON.parse(notification);
        } catch (e) {
            console.error('📬 Bridge: failed to parse stringified notification detail:', e);
            return;
        }
    }
    console.log('📬 Bridge received notification request:', notification);

    // Emit using the real NotificationCenter (which has chrome.storage access)
    await NotificationCenter.emit(notification);
});

// Inject bridge into page context via external script (bypasses CSP)
const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/core/notification-bridge-page.js');
script.onload = function () {
    this.remove();
    console.log('📬 NotificationCenter bridge script loaded');
};
script.onerror = function () {
    console.error('📬 Failed to load notification bridge script');
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

console.log('📬 NotificationCenter loaded and ready');
