/**
 * Sidekick Travel Blocker Module (isolated world)
 *
 * Blocks travel when it conflicts with an upcoming Organized Crime window
 * or a drug cooldown that would lapse mid-trip. During an ACTIVE WAR all
 * blocking is paused (members must be able to fly to the fight); enemy
 * presence badges stay visible for information either way.
 *
 * History: this module previously ran in the MAIN world, where chrome.* is
 * undefined — its very first storage read threw
 * "Cannot read properties of undefined (reading 'local')" and the module
 * never functioned. It does no page-JS hooking (pure DOM reads/writes), so
 * it now runs as a standard isolated-world module using Core.ChromeStorage
 * and the background proxyFetch, like the rest of the codebase.
 *
 * Rules (each independently toggleable in Settings → Reminders → shelf):
 *   oc_watcher    — OC Status (sidebar icons: OC ready / no OC) and the
 *                   OC Window: block when the round trip (flight x2 +
 *                   configurable buffer minutes) would outlast the OC ready
 *                   time of a crime you are in.
 *   drug_cooldown — block when the drug cooldown would end during the round
 *                   trip (e.g. 4h cooldown vs a 5h round trip = blocked).
 *   war_watch     — count badges of enemies per destination; blocking only
 *                   applies outside an active war.
 */

const TravelBlockerModule = {
    isEnabled: false,
    STORAGE_KEY: 'sidekick_travel_blocker',
    LOCATIONS_KEY: 'sidekick_enemy_locations',

    OC_WINDOW_DEFAULT_MIN: 5,
    COOLDOWN_CACHE_MS: 60_000,
    CRIMES_CACHE_MS: 60_000,
    WAR_CHECK_MS: 120_000,
    OBSERVER_DEBOUNCE_MS: 250,
    RECHECK_MS: 60_000,

    apiKey: '',
    settings: null,
    enemyLocations: {},

    warActive: null,        // null = unknown, true/false = last known state
    warCheckedAt: 0,
    warPauseLogged: false,

    // TTL caches — the old per-page-load freeze meant a 4h cooldown seen at
    // page load never counted down and never re-evaluated.
    cache: {
        myId: null,
        cooldowns: null,
        cooldownsAt: 0,
        crimes: null,
        crimesAt: 0
    },

    observer: null,
    enforceInterval: null,
    enforceTimer: null,
    enforcing: false,
    buttonOriginals: new WeakMap(), // blocked button el -> pre-block state

    async init() {
        console.log('🚧 Travel Blocker initializing...');

        await this.loadSettings();

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes[this.LOCATIONS_KEY] && this.isEnabled) {
                // Fresh enemy data from War Monitor — invalidate the war
                // check and re-evaluate soon.
                this.warCheckedAt = 0;
                this.scheduleEnforce();
            }
            if (changes[this.STORAGE_KEY]) {
                this.loadSettings().then(() => {
                    if (this.isEnabled) this.enable();
                    else this.disable();
                });
            }
        });

        if (this.isEnabled) {
            this.enable();
        }

        console.log('🚧 Travel Blocker initialized');
    },

    async loadSettings() {
        try {
            const Core = window.SidekickModules.Core;
            const raw = await Core.ChromeStorage.get(this.STORAGE_KEY) || {};
            this.isEnabled = raw.isEnabled !== false; // default ON (popup defaultEnabled: true)
            this.settings = {
                // The settings panel's saveToggle stores sub-switches as
                // { isEnabled: bool } objects — read both shapes. (The old
                // module's truthiness check meant sub-toggles never
                // actually turned a rule off.)
                oc_watcher: this.ruleEnabled(raw.oc_watcher, true),
                drug_cooldown: this.ruleEnabled(raw.drug_cooldown, true),
                war_watch: this.ruleEnabled(raw.war_watch, true),
                ocWindowMin: this.saneMinutes(raw.ocWindowMin)
            };
            this.apiKey = await Core.ChromeStorage.get(Core.STORAGE_KEYS.API_KEY) || '';
        } catch (error) {
            console.error('🚧 Failed to load settings:', error);
        }
    },

    ruleEnabled(v, def) {
        if (typeof v === 'boolean') return v;
        if (v && typeof v === 'object' && typeof v.isEnabled === 'boolean') return v.isEnabled;
        return def;
    },

    saneMinutes(v) {
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n > 0 ? n : this.OC_WINDOW_DEFAULT_MIN;
    },

    enable() {
        this.isEnabled = true;
        this.injectStyles();
        this.startObserver();
        this.scheduleEnforce();
        // Guard against double-enable (storage listener firing while already
        // on): clear any previous interval before arming a new one.
        if (this.enforceInterval) clearInterval(this.enforceInterval);
        this.enforceInterval = setInterval(() => this.runEnforcement(), this.RECHECK_MS);
    },

    disable() {
        this.isEnabled = false;
        this.stopObserver();
        this.restoreAll();
    },

    injectStyles() {
        if (document.getElementById('sk-tb-styles')) return;
        const style = document.createElement('style');
        style.id = 'sk-tb-styles';
        style.textContent = `
            .sk-block-overlay {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6); display: flex; align-items: center;
                justify-content: center; z-index: 5; pointer-events: none;
                border-radius: 5px;
            }
            .sk-war-badges {
                position: absolute; top: 5px; right: 5px; display: flex; gap: 4px; z-index: 10;
            }
            .sk-war-badge {
                color: #fff; border-radius: 50%; width: 18px; height: 18px;
                display: flex; align-items: center; justify-content: center;
                font-size: 10px; font-weight: bold;
            }
        `;
        document.head.appendChild(style);
    },

    startObserver() {
        if (this.observer) return;
        // Observe body-wide: Torn navigates to the travel agency via SPA
        // transitions sometimes, so DOM presence (not the URL) is the gate.
        this.observer = new MutationObserver(() => this.scheduleEnforce());
        this.observer.observe(document.body, { childList: true, subtree: true });
    },

    stopObserver() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.enforceInterval) {
            clearInterval(this.enforceInterval);
            this.enforceInterval = null;
        }
        if (this.enforceTimer) {
            clearTimeout(this.enforceTimer);
            this.enforceTimer = null;
        }
    },

    /**
     * Debounced enforcement. Raw observer callbacks fire on our own DOM
     * writes (overlays, badges, BLOCKED text) — without the debounce this
     * loops immediately after every enforcement pass.
     */
    scheduleEnforce() {
        if (this.enforceTimer) return;
        this.enforceTimer = setTimeout(() => {
            this.enforceTimer = null;
            this.runEnforcement();
        }, this.OBSERVER_DEBOUNCE_MS);
    },

    hasTravelUI() {
        return document.querySelectorAll('.travel-agency .destination').length > 0;
    },

    // ------------------------------------------------------------------
    // Torn API (via background proxyFetch — CORS/CSP-exempt, isolated world)
    // ------------------------------------------------------------------

    async apiFetch(path) {
        if (!this.apiKey) return null;
        try {
            const res = await window.SidekickModules.Core.SafeMessageSender.sendToBackground({
                action: 'proxyFetch',
                url: `https://api.torn.com${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(this.apiKey)}&comment=SidekickTravelBlocker`,
                timeout: 10_000
            });
            if (!res?.success) return null;
            const data = res.data;
            if (data && data.error) {
                console.warn('🚧 Travel Blocker: Torn API error:', data.error.error || data.error);
                return null;
            }
            return data;
        } catch (err) {
            console.warn('🚧 Travel Blocker: API fetch failed:', err?.message || err);
            return null;
        }
    },

    async getMyId() {
        if (this.cache.myId) return this.cache.myId;
        const profile = await this.apiFetch('/v2/user/profile');
        if (profile) {
            const id = profile.id ?? profile.base?.id;
            if (id) this.cache.myId = String(id);
        }
        return this.cache.myId;
    },

    async getCooldowns() {
        if (this.cache.cooldowns && Date.now() - this.cache.cooldownsAt < this.COOLDOWN_CACHE_MS) {
            return this.cache.cooldowns;
        }
        const data = await this.apiFetch('/user/?selections=cooldowns');
        if (data && data.cooldowns) {
            this.cache.cooldowns = { drug: Number(data.cooldowns.drug) || 0 };
            this.cache.cooldownsAt = Date.now();
        }
        return this.cache.cooldowns;
    },

    async getCrimes() {
        if (this.cache.crimes && Date.now() - this.cache.crimesAt < this.CRIMES_CACHE_MS) {
            return this.cache.crimes;
        }
        const data = await this.apiFetch('/v2/faction/crimes');
        let crimes = null;
        if (data && Array.isArray(data.crimes)) crimes = data.crimes;
        else if (data && data.crimes && typeof data.crimes === 'object') crimes = Object.values(data.crimes);
        if (crimes) {
            this.cache.crimes = crimes;
            this.cache.crimesAt = Date.now();
        }
        return crimes;
    },

    // ------------------------------------------------------------------
    // War state
    // ------------------------------------------------------------------

    async refreshEnemyLocations() {
        try {
            this.enemyLocations =
                await window.SidekickModules.Core.ChromeStorage.get(this.LOCATIONS_KEY) || {};
        } catch (_) { /* keep last known */ }
    },

    /**
     * Active-war detection, cached WAR_CHECK_MS. Layers:
     *   1. War Monitor's tracked enemies: sidekick_enemy_locations is only
     *      populated while a war page is being scraped, and a war page open
     *      in any tab keeps it fresh — clearing when the war ends.
     *   2. Direct API layer (defensive shape-matching — endpoint shapes vary
     *      across API revisions; any live-seeming war entry counts).
     * Fail-safe direction: with no positive signal we report "no war", i.e.
     * blocking stays armed — pausing requires positive evidence.
     */
    async checkWarActive() {
        if (this.warActive !== null && Date.now() - this.warCheckedAt < this.WAR_CHECK_MS) {
            return this.warActive;
        }
        this.warCheckedAt = Date.now();

        // Layer 1: tracked enemy presence (cheap, no API cost).
        const anyTracked = Object.values(this.enemyLocations || {}).some(
            l => ((l.going || 0) + (l.there || 0) + (l.returning || 0)) > 0
        );
        if (anyTracked) {
            this.warActive = true;
            return true;
        }

        // Layer 2: API (defensive).
        let active = false;
        const wars = await this.apiFetch('/v2/faction/wars');
        if (wars && typeof wars === 'object') {
            const entries = Array.isArray(wars) ? wars
                : (Array.isArray(wars.wars) ? wars.wars
                    : (wars.wars && typeof wars.wars === 'object' ? Object.values(wars.wars) : []));
            const nowSec = Math.floor(Date.now() / 1000);
            active = entries.some(w => {
                if (!w) return false;
                const start = Number(w.start ?? w.start_at ?? w.started ?? 0);
                const end = Number(w.end ?? w.end_at ?? w.expiry ?? 0);
                if (!start) return false;
                return start <= nowSec && (!end || end >= nowSec);
            });
        }

        this.warActive = active;
        return active;
    },

    // ------------------------------------------------------------------
    // Rules
    // ------------------------------------------------------------------

    parseTravelTime(str) {
        if (!str) return 0;
        let hours = 0, mins = 0;
        const hMatch = str.match(/(\d+)\s*h/i);
        if (hMatch) hours = parseInt(hMatch[1]);
        const mMatch = str.match(/(\d+)\s*m/i);
        if (mMatch) mins = parseInt(mMatch[1]);
        if (hours === 0 && mins === 0) return 0;
        return (hours * 3600) + (mins * 60);
    },

    /** Round trip = flight out + flight back + configurable OC buffer minutes. */
    roundTripSeconds(ctx) {
        return (ctx.flightTimeSeconds * 2) + (this.settings.ocWindowMin * 60);
    },

    fmtHMS(seconds) {
        const s = Math.max(0, Math.round(seconds));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    },

    async evaluateOC(ctx) {
        // --- OC Status (sidebar icons first — instant, no API) ---
        const sidebarRoot = document.getElementById('sidebarroot');
        if (sidebarRoot) {
            const ocCompleted = sidebarRoot.querySelector('li[class*="icon90"]');
            if (ocCompleted) return { reason: 'Your OC is ready to view.' };

            const inOC = sidebarRoot.querySelector('li[class*="icon85"], li[class*="icon89"]');
            if (!inOC) return { reason: 'You have no active Organized Crime.' };
        }

        // --- OC Window (API: is the round trip longer than ready time?) ---
        if (!ctx.flightTimeSeconds) return null;
        const [myId, crimes] = await Promise.all([this.getMyId(), this.getCrimes()]);
        if (!myId || !crimes) return null;

        const now = Math.floor(Date.now() / 1000);
        const roundTrip = this.roundTripSeconds(ctx);

        for (const crime of crimes) {
            const status = String(crime.status || '').toLowerCase();
            if (status !== 'ready' && status !== 'preparing') continue;
            const participants = crime.participants || [];
            const isParticipant = participants.some(p => String(p.id) === myId);
            if (!isParticipant) continue;

            if (status === 'ready') {
                return { reason: `You have an Organized Crime ready now! (${crime.name})` };
            }
            const readyAt = Number(crime.ready_at ?? crime.readyAt ?? 0);
            if (readyAt > 0) {
                const timeUntil = readyAt - now;
                if (timeUntil > 0 && roundTrip >= timeUntil) {
                    return { reason: `Round trip takes longer than your OC ready time (${crime.name})` };
                }
            }
        }
        return null;
    },

    async evaluateDrug(ctx) {
        if (!ctx.flightTimeSeconds) return null;
        const cooldowns = await this.getCooldowns();
        if (!cooldowns) return null;

        const drugCd = cooldowns.drug || 0;
        if (drugCd > 0 && this.roundTripSeconds(ctx) >= drugCd) {
            return { reason: `Drug cooldown (${this.fmtHMS(drugCd)}) would end during the round trip` };
        }
        return null;
    },

    async evaluateWar(ctx) {
        if (!ctx.country) return null;
        const locs = this.enemyLocations?.[ctx.country];
        if (!locs) return null;
        const count = (locs.going || 0) + (locs.there || 0) + (locs.returning || 0);
        if (count === 0) return null;
        return { reason: `Enemy faction has ${count} member${count === 1 ? '' : 's'} in/traveling to ${ctx.country}` };
    },

    // ------------------------------------------------------------------
    // Enforcement
    // ------------------------------------------------------------------

    isTravelButton(btn) {
        const t = btn.textContent.trim();
        return t === 'Travel' || t === 'Standard' || t === 'Airstrip';
    },

    blockButtons(buttons, blockers) {
        const title = blockers.map(b => `[${b.label}] ${b.reason}`).join('\n');
        for (const btn of buttons) {
            if (!this.isTravelButton(btn)) continue;
            if (!this.buttonOriginals.has(btn)) {
                this.buttonOriginals.set(btn, {
                    text: btn.textContent,
                    title: btn.title,
                    disabled: btn.disabled,
                    pointerEvents: btn.style.pointerEvents
                });
            }
            btn.disabled = true;
            btn.textContent = 'BLOCKED';
            btn.title = title;
            btn.classList.add('script-disabled-button');
            btn.style.pointerEvents = 'none';
        }
    },

    restoreButtons(buttons) {
        for (const btn of buttons) {
            const orig = this.buttonOriginals.get(btn);
            if (!orig) continue;
            btn.disabled = orig.disabled;
            btn.textContent = orig.text;
            btn.title = orig.title;
            btn.classList.remove('script-disabled-button');
            btn.style.pointerEvents = orig.pointerEvents;
            this.buttonOriginals.delete(btn);
        }
    },

    ensureXOverlay(target) {
        let overlay = target.querySelector(':scope > .sk-block-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sk-block-overlay';
            overlay.innerHTML = `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#e05565" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            overlay.addEventListener('click', (e) => e.stopPropagation(), false);
            if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
            target.appendChild(overlay);
        }
        return overlay;
    },

    injectWarBadges() {
        if (!this.settings?.war_watch) return;
        const targets = document.querySelectorAll('.travel-agency .destination');
        for (const target of targets) {
            const nameEl = target.querySelector('.name');
            if (!nameEl) continue;
            const locs = this.enemyLocations?.[nameEl.textContent.trim()];
            if (!locs) continue;

            const total = (locs.going || 0) + (locs.there || 0) + (locs.returning || 0);

            let badgeWrap = target.querySelector(':scope > .sk-war-badges');
            if (total === 0) {
                if (badgeWrap) badgeWrap.remove();
                continue;
            }
            if (!badgeWrap) {
                badgeWrap = document.createElement('div');
                badgeWrap.className = 'sk-war-badges';
                if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
                target.appendChild(badgeWrap);
            }

            const chips = [];
            if (locs.going > 0) chips.push(`<div class="sk-war-badge" title="${locs.going} enemies traveling here" style="background:rgba(224,152,32,0.8)">${locs.going}</div>`);
            if (locs.there > 0) chips.push(`<div class="sk-war-badge" title="${locs.there} enemies already here" style="background:rgba(224,85,101,0.8)">${locs.there}</div>`);
            if (locs.returning > 0) chips.push(`<div class="sk-war-badge" title="${locs.returning} enemies returning from here" style="background:rgba(77,159,255,0.8)">${locs.returning}</div>`);
            badgeWrap.innerHTML = chips.join('');
        }
    },

    clearTarget(target, buttons) {
        const overlay = target.querySelector(':scope > .sk-block-overlay');
        if (overlay) overlay.remove();
        this.restoreButtons(buttons);
    },

    async enforceRules() {
        if (!this.settings || !this.isEnabled || !this.hasTravelUI()) return;

        await this.refreshEnemyLocations();
        this.injectWarBadges();

        // Global war pause: during an active war, no destination is blocked —
        // the faction must be able to fly to the fight. Badges above stay.
        const warActive = await this.checkWarActive();
        if (warActive) {
            if (!this.warPauseLogged) {
                this.warPauseLogged = true;
                console.log('🚧 Travel Blocker: active war detected — blocking paused, badges remain');
            }
            document.querySelectorAll('.travel-agency .destination').forEach(t =>
                this.clearTarget(t, t.querySelectorAll('a.torn-btn.btn-dark-bg, button.torn-btn.btn-dark-bg')));
            return;
        }
        this.warPauseLogged = false;

        const rules = [
            { id: 'oc_watcher', label: 'OC Timing', evaluate: (ctx) => this.evaluateOC(ctx) },
            { id: 'drug_cooldown', label: 'Drug Cooldown', evaluate: (ctx) => this.evaluateDrug(ctx) },
            { id: 'war_watch', label: 'War Watch', evaluate: (ctx) => this.evaluateWar(ctx) }
        ];

        const targets = document.querySelectorAll('.travel-agency .destination');
        for (const target of targets) {
            const nameEl = target.querySelector('.name');
            if (!nameEl) continue;

            let flightTimeSeconds = 0;
            const timeEl = target.querySelector('div[class*="time_"]');
            if (timeEl) flightTimeSeconds = this.parseTravelTime(timeEl.textContent);

            const buttons = target.querySelectorAll('a.torn-btn.btn-dark-bg, button.torn-btn.btn-dark-bg');
            if (!buttons.length) continue;

            const ctx = { country: nameEl.textContent.trim(), flightTimeSeconds };

            const blockers = [];
            for (const rule of rules) {
                if (!this.settings[rule.id]) continue;
                try {
                    const res = await rule.evaluate(ctx);
                    if (res) blockers.push({ label: rule.label, reason: res.reason });
                } catch (err) {
                    console.warn(`🚧 Travel Blocker error in ${rule.id}:`, err?.message || err);
                }
            }

            if (blockers.length > 0) {
                this.ensureXOverlay(target);
                this.blockButtons(buttons, blockers);
            } else {
                this.clearTarget(target, buttons);
            }
        }
    },

    async runEnforcement() {
        if (this.enforcing) return;
        this.enforcing = true;
        try {
            await this.enforceRules();
        } catch (err) {
            console.warn('🚧 Travel Blocker enforcement error:', err?.message || err);
        } finally {
            this.enforcing = false;
        }
    },

    /** Remove every visual the module applied (used on disable). */
    restoreAll() {
        document.querySelectorAll('.sk-block-overlay, .sk-war-badges').forEach(el => el.remove());
        document.querySelectorAll('.travel-agency .destination a.torn-btn.btn-dark-bg, .travel-agency .destination button.torn-btn.btn-dark-bg')
            .forEach(btn => this.restoreButtons([btn]));
    }
};

if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.TravelBlocker = TravelBlockerModule;
console.log('🚧 Travel Blocker module registered');