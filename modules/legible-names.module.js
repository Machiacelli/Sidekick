// Legible Names Module
// Converts Torn's tiny honor-bar name sprites into a larger, more legible font.
// Based on "Torn: More Legible Player Names" by GingerBeardMan (GNU GPLv3).
// Adapted for Sidekick by Machiacelli.

const LegibleNamesModule = {
    STORAGE_KEY: 'legible-names',
    isEnabled: false,
    observer: null,

    async init() {
        console.log('🔤 Legible Names: initializing...');
        await this.loadSettings();
        if (this.isEnabled) this.enable();

        // React to toggle changes from the settings panel
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            const newSettings = changes['sidekick_settings']?.newValue;
            if (newSettings) {
                const enabled = newSettings[this.STORAGE_KEY]?.isEnabled === true;
                if (enabled !== this.isEnabled) {
                    enabled ? this.enable() : this.disable();
                }
            }
        });

        console.log('🔤 Legible Names: initialized, enabled=', this.isEnabled);
    },

    async loadSettings() {
        try {
            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
            this.isEnabled = settings?.[this.STORAGE_KEY]?.isEnabled === true;
        } catch (e) {
            console.error('🔤 Legible Names: failed to load settings', e);
        }
    },

    enable() {
        this.isEnabled = true;
        this._injectFont();
        this._injectStyles();
        this._processAll();
        this._startObserver();
        console.log('🔤 Legible Names: enabled');
    },

    disable() {
        this.isEnabled = false;
        this._stopObserver();
        // Remove injected elements
        document.getElementById('sk-legible-names-font')?.remove();
        document.getElementById('sk-legible-names-style')?.remove();
        // Remove injected name overlays
        document.querySelectorAll('.sk-legible-custom-text').forEach(el => el.remove());
        // Restore hidden sprites
        document.querySelectorAll('.honor-text-svg').forEach(el => el.style.removeProperty('display'));
        console.log('🔤 Legible Names: disabled');
    },

    _injectFont() {
        if (document.getElementById('sk-legible-names-font')) return;
        const link = document.createElement('link');
        link.id = 'sk-legible-names-font';
        link.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@700&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    },

    _injectStyles() {
        if (document.getElementById('sk-legible-names-style')) return;
        const style = document.createElement('style');
        style.id = 'sk-legible-names-style';
        style.textContent = `
            .sk-legible-custom-text {
                font-family: 'Manrope', sans-serif !important;
                font-weight: 700 !important;
                font-size: 12px !important;
                color: white !important;
                text-transform: uppercase !important;
                letter-spacing: 0.5px !important;
                pointer-events: none !important;
                position: absolute !important;
                top: 50%;
                left: 0;
                transform: translateY(-50%);
                width: 100% !important;
                height: auto;
                display: flex !important;
                align-items: center;
                justify-content: center;
                text-align: center !important;
                line-height: 1 !important;
                margin: 0 !important;
                padding: 0 !important;
                z-index: 10 !important;
            }
            .sk-legible-custom-text.sk-outline-black {
                text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
            }
            .sk-legible-custom-text.sk-outline-blue {
                text-shadow: -1px -1px 0 #310AF5, 1px -1px 0 #310AF5, -1px 1px 0 #310AF5, 1px 1px 0 #310AF5;
            }
            .sk-legible-custom-text.sk-outline-red {
                text-shadow: -1px -1px 0 #ff4d4d, 1px -1px 0 #ff4d4d, -1px 1px 0 #ff4d4d, 1px 1px 0 #ff4d4d;
            }
            .sk-legible-custom-text.sk-outline-green {
                text-shadow: -1px -1px 0 #3B9932, 1px -1px 0 #3B9932, -1px 1px 0 #3B9932, 1px 1px 0 #3B9932;
            }
            .sk-legible-custom-text.sk-outline-orange {
                text-shadow: -1px -1px 0 #ff9c40, 1px -1px 0 #ff9c40, -1px 1px 0 #ff9c40, 1px 1px 0 #ff9c40;
            }
            .sk-legible-custom-text.sk-outline-purple {
                text-shadow: -1px -1px 0 #c080ff, 1px -1px 0 #c080ff, -1px 1px 0 #c080ff, 1px 1px 0 #c080ff;
            }
        `;
        document.head.appendChild(style);
    },

    _getOutlineClass(wrap) {
        if (wrap.classList.contains('admin'))     return 'sk-outline-red';
        if (wrap.classList.contains('officer'))   return 'sk-outline-green';
        if (wrap.classList.contains('moderator')) return 'sk-outline-orange';
        if (wrap.classList.contains('helper'))    return 'sk-outline-purple';
        if (wrap.classList.contains('blue'))      return 'sk-outline-blue';
        return 'sk-outline-black';
    },

    _processAll() {
        document.querySelectorAll('.honor-text-wrap').forEach(wrap => {
            const sprite = wrap.querySelector('.honor-text-svg');
            if (sprite) sprite.style.display = 'none';

            if (wrap.querySelector('.sk-legible-custom-text')) return; // already done

            const text = (
                wrap.getAttribute('data-title') ||
                wrap.getAttribute('aria-label') ||
                wrap.innerText ||
                ''
            ).trim().toUpperCase();

            if (!text) return;

            const div = document.createElement('div');
            div.className = `sk-legible-custom-text ${this._getOutlineClass(wrap)}`;
            div.textContent = text;
            wrap.appendChild(div);
        });
    },

    _startObserver() {
        if (this.observer) return;
        this.observer = new MutationObserver(() => {
            if (this.isEnabled) this._processAll();
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
    },

    _stopObserver() {
        this.observer?.disconnect();
        this.observer = null;
    },
};

// Register module
if (typeof window.SidekickModules === 'undefined') window.SidekickModules = {};
window.SidekickModules.LegibleNames = LegibleNamesModule;
console.log('🔤 Legible Names module registered');
