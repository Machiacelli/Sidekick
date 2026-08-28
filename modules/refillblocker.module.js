/**
 * Refill Blocker Module
 * Prevents accidental refills when Energy/Nerve bars aren't empty
 * Converted from xedx's Torn Disable Refills userscript
 */

const RefillBlockerModule = (() => {
    // Module state
    let isEnabled = false;
    let safetyOn = true;
    let barsData = null;
    let checkboxElement = null;
    let clickListener = null;

    return {
        name: 'RefillBlocker',

        async initialize() {
            console.log('[Sidekick] Initializing Refill Blocker...');

            // Check if Core module is available
            if (!window.SidekickModules?.Core?.ChromeStorage) {
                console.warn('[Sidekick] Core module not available, Refill Blocker disabled');
                return;
            }

            // Check if module is enabled
            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_refill_blocker');
            isEnabled = settings?.isEnabled === true;
            safetyOn = settings?.safetyOn !== false;

            if (!isEnabled) {
                console.log('[Sidekick] Refill Blocker is disabled');
                return;
            }

            // Only run on points page
            if (!window.location.href.includes('points.php')) {
                return;
            }

            // Start the module
            this.startBlocking();

            console.log('[Sidekick] Refill Blocker initialized');
        },

        async fetchBarsData() {
            const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
            if (!apiKey) {
                console.warn('[Sidekick] No API key found');
                return null;
            }

            try {
                const response = await fetch(`https://api.torn.com/user/?selections=bars&key=${apiKey}`);
                const data = await response.json();

                if (data.error) {
                    console.error('[Sidekick] API Error:', data.error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('[Sidekick] Failed to fetch bars data:', error);
                return null;
            }
        },

        async addSafetyCheckbox() {
            const titleBar = document.querySelector("#mainContainer > div.content-wrapper.m-left20 > div.content-title");
            if (!titleBar) {
                setTimeout(() => this.addSafetyCheckbox(), 100);
                return;
            }

            // Check if already added
            if (document.getElementById('sidekick-refill-confirm')) {
                return;
            }

            const checkboxHTML = `
                <div style="margin-top: 10px; padding: 10px; background: rgba(255,193,7,0.1); border-left: 3px solid #FFC107; border-radius: 4px;">
                    <input type="checkbox" id="sidekick-refill-confirm" name="sidekick-refill-confirm" ${safetyOn ? 'checked' : ''} style="margin-right: 8px;">
                    <label for="sidekick-refill-confirm" style="color: #FFC107; font-weight: 500; cursor: pointer;">
                        🛡️ Safety Net! (Prevents accidental refills when bars aren't empty)
                    </label>
                </div>
            `;

            titleBar.insertAdjacentHTML('afterend', checkboxHTML);

            checkboxElement = document.getElementById('sidekick-refill-confirm');
            if (checkboxElement) {
                checkboxElement.addEventListener('click', async () => {
                    safetyOn = checkboxElement.checked;
                    await this.saveSafetyState();
                    console.log('[Sidekick] Refill safety:', safetyOn ? 'ON' : 'OFF');
                });
            }
        },

        async saveSafetyState() {
            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_refill_blocker') || {};
            settings.safetyOn = safetyOn;
            await window.SidekickModules.Core.ChromeStorage.set('sidekick_refill_blocker', settings);
        },

        handleRefillClick(e) {
            if (!safetyOn || !barsData) return;

            const target = e.target;
            const parent = target.parentElement;

            // Check if clicking on a refill button
            let isEnergyRefill = false;
            let isNerveRefill = false;

            if (target.classList.length > 1) {
                isEnergyRefill = target.classList[1]?.indexOf('energy') > -1;
                isNerveRefill = target.classList[1]?.indexOf('nerve') > -1;
            } else if (parent && parent.classList.length > 1) {
                isEnergyRefill = parent.classList[1]?.indexOf('energy') > -1;
                isNerveRefill = parent.classList[1]?.indexOf('nerve') > -1;
            }

            // Block refill if bars aren't empty
            if (isEnergyRefill && barsData.energy.current > 0) {
                e.stopPropagation();
                e.preventDefault();
                this.showWarning('Energy');
                console.log('[Sidekick] Blocked Energy refill - bar not empty');
                return false;
            }

            if (isNerveRefill && barsData.nerve.current > 0) {
                e.stopPropagation();
                e.preventDefault();
                this.showWarning('Nerve');
                console.log('[Sidekick] Blocked Nerve refill - bar not empty');
                return false;
            }
        },

        showWarning(barType) {
            if (window.SidekickModules?.Core?.NotificationSystem) {
                window.SidekickModules.Core.NotificationSystem.show(
                    'Refill Blocked',
                    `${barType} is not empty! Uncheck safety to refill anyway.`,
                    'warning',
                    3000
                );
            }
        },

        async startBlocking() {
            // Fetch current bars data
            barsData = await this.fetchBarsData();
            if (!barsData) {
                console.warn('[Sidekick] Could not fetch bars data');
                return;
            }

            console.log('[Sidekick] Bars data:', {
                energy: barsData.energy.current,
                nerve: barsData.nerve.current
            });

            // Add safety checkbox
            this.addSafetyCheckbox();

            // Add click listener to refill buttons
            const refillContainer = document.querySelector("#mainContainer > div.content-wrapper > ul");
            if (refillContainer) {
                clickListener = (e) => this.handleRefillClick(e);
                refillContainer.addEventListener('click', clickListener, { capture: true });
                console.log('[Sidekick] Refill blocker active');
            }

            // Refresh bars data every 30 seconds
            setInterval(async () => {
                barsData = await this.fetchBarsData();
            }, 30000);
        },

        stopBlocking() {
            // Remove checkbox
            const checkbox = document.getElementById('sidekick-refill-confirm');
            if (checkbox) {
                checkbox.parentElement.remove();
            }

            // Remove click listener
            if (clickListener) {
                const refillContainer = document.querySelector("#mainContainer > div.content-wrapper > ul");
                if (refillContainer) {
                    refillContainer.removeEventListener('click', clickListener, { capture: true });
                }
                clickListener = null;
            }
        },

        async destroy() {
            this.stopBlocking();
            barsData = null;
            checkboxElement = null;
            console.log('[Sidekick] Refill Blocker destroyed');
        }
    };
})();

// Register module
if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.RefillBlocker = RefillBlockerModule;

// Export for use in main.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RefillBlockerModule;
}
