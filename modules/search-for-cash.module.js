/**
 * Sidekick Chrome Extension - Search for Cash Module
 * Evaluates SFC choices and visually highlights the best button.
 * Adapted from original userscript (MIT) for the Sidekick module pattern.
 */
const SearchForCashModule = (() => {
    const STORAGE_KEY  = 'crime-sfc';
    const SFC_HASH     = '/searchforcash';
    const BADGE_ID     = 'sidekick-sfc-badge';

    let enabled     = false;
    let scheduled   = null;
    let navWatcher  = null;
    let lastUrl     = '';
    let backoff     = 900;

    // ── Config ─────────────────────────────────────────────────────────────────
    const CFG = {
        baseIntervalMs:   [700, 1200],
        backoffCeilMs:    60000,
        backoffGrow:      1.6,
        backoffShrink:    0.6,
        absoluteFloorPct: 45,

        itemWeight: {
            TRASH:    0.25,
            SUBWAY:   0.30,
            JUNKYARD: 1.00,
            BEACH:    0.35,
            CEMETERY: 0.55,
            FOUNTAIN: 0.15,
        },

        thresholds: {
            TRASH:    70,
            SUBWAY:   70,
            JUNKYARD: 58,
            BEACH:    75,
            CEMETERY: 75,
            FOUNTAIN: 72,
        },

        bonuses: {
            junkyardSunMon:           10,
            junkyardBase:              6,
            cemeteryOffHours:          8,
            cemeteryGroundsPenalty:  -25,
            beachPenalty:             -8,
            trashPenalty:             -5,
            subwayPenalty:            -4,
            fountainPenalty:          -8,
            fountainLateMonth:         5,
            fountainEarlyPenalty:     -6,
        },
    };

    // ── Utilities ──────────────────────────────────────────────────────────────
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n | 0));
    const rnd   = (a, b) => Math.random() * (b - a) + a;
    const rndMs = (range) => Math.floor(rnd(range[0], range[1] + 1));

    function isCrimesPage() {
        const url = new URL(window.location.href);
        return (url.pathname.endsWith('/page.php') || url.pathname.endsWith('/loader.php'))
            && url.searchParams.get('sid') === 'crimes';
    }
    function isSFCPage() { return isCrimesPage() && window.location.hash.includes(SFC_HASH); }

    // ── DOM helpers ───────────────────────────────────────────────────────────
    function parseTrailingPct(label) {
        const m = /\((\d{1,3})%\)\s*$/.exec(label || '');
        return m ? clamp(parseInt(m[1], 10), 0, 100) : null;
    }

    function enumerateTiles() {
        return Array.from(document.querySelectorAll('[class*="crimeOptionWrapper"]'))
            .map((tile, idx) => {
                const pctNode = tile.querySelector('[class*="densityTooltipTrigger"][aria-label*="%"]');
                const aria    = pctNode?.getAttribute('aria-label') || '';
                const pct     = parseTrailingPct(aria);
                const btn     = tile.querySelector('[class*="commitButtonSection"] button');
                if (!pctNode || !btn || pct == null) return null;
                const isDisabled = btn.getAttribute('aria-disabled')?.toLowerCase() === 'true';
                return { tile, pct, btn, isDisabled, idx };
            })
            .filter(Boolean);
    }

    // ── Scoring ───────────────────────────────────────────────────────────────
    const NAMES = ['TRASH', 'SUBWAY', 'JUNKYARD', 'BEACH', 'CEMETERY', 'FOUNTAIN'];

    function getTct() {
        const d = new Date();
        return { dow: d.getUTCDay(), hour: d.getUTCHours(), dom: d.getUTCDate() };
    }
    function isWeekday(dow) { return dow >= 1 && dow <= 5; }

    function dynamicThreshold(name, base, t) {
        if (name === 'BEACH') return Math.max(base, 75);
        if (name === 'FOUNTAIN') {
            if (t.dom <= 7)  return Math.min(90, base + 6);
            if (t.dom >= 24) return Math.max(55, base - 6);
        }
        return base;
    }

    function itemBias(name) { return 0.5 + 0.5 * (CFG.itemWeight[name] ?? 0.5); }

    function computeScore(job, t) {
        const name  = NAMES[job.idx];
        let   score = job.pct * itemBias(name);

        if (name === 'JUNKYARD') {
            score += CFG.bonuses.junkyardBase;
            if (t.dow === 0 || (t.dow === 1 && t.hour < 12)) score += CFG.bonuses.junkyardSunMon;
        }
        if (name === 'CEMETERY') {
            const grounds = isWeekday(t.dow) && t.hour >= 9 && t.hour < 17;
            score += grounds ? CFG.bonuses.cemeteryGroundsPenalty : CFG.bonuses.cemeteryOffHours;
        }
        if (name === 'BEACH')    score += CFG.bonuses.beachPenalty;
        if (name === 'TRASH')    score += CFG.bonuses.trashPenalty;
        if (name === 'SUBWAY')   score += CFG.bonuses.subwayPenalty;
        if (name === 'FOUNTAIN') {
            score += CFG.bonuses.fountainPenalty;
            if (t.dom >= 24) score += CFG.bonuses.fountainLateMonth;
            if (t.dom <= 7)  score += CFG.bonuses.fountainEarlyPenalty;
        }
        return score;
    }

    function chooseBest(tiles) {
        const t = getTct();
        const evaluated = tiles.map(j => {
            const name   = NAMES[j.idx];
            const thr    = dynamicThreshold(name, CFG.thresholds[name] ?? 65, t);
            const meets  = j.pct >= Math.max(CFG.absoluteFloorPct, thr);
            const score  = computeScore(j, t);
            return { ...j, name, thr, meets, score };
        });

        const passers = evaluated.filter(x => x.meets);
        if (passers.length) return passers.reduce((a, b) => a.score >= b.score ? a : b);

        const floorPass = evaluated.filter(x => x.pct >= CFG.absoluteFloorPct);
        if (floorPass.length) return floorPass.reduce((a, b) => a.score >= b.score ? a : b);

        return evaluated.reduce((a, b) => a.pct >= b.pct ? a : b);
    }

    // ── UI ────────────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('sk-sfc-style')) return;
        const s = document.createElement('style');
        s.id = 'sk-sfc-style';
        s.textContent = `
            .sk-sfc-btn {
                outline: 3px solid #4caf50 !important;
                box-shadow: 0 0 0 3px rgba(76,175,80,.25), 0 0 10px rgba(76,175,80,.55) !important;
                animation: skSfcPulse 1.8s infinite;
            }
            .sk-sfc-tile { position: relative !important; }
            .sk-sfc-badge {
                position: absolute; top: 6px; right: 6px;
                background: #4caf50; color: #fff; font-weight: 600;
                padding: 2px 8px; font-size: 12px; border-radius: 12px;
                pointer-events: none; z-index: 10;
            }
            @keyframes skSfcPulse {
                0%   { box-shadow: 0 0 0 3px rgba(76,175,80,.25), 0 0 10px rgba(76,175,80,.55); }
                70%  { box-shadow: 0 0 0 10px rgba(76,175,80,0),  0 0 6px  rgba(76,175,80,.4); }
                100% { box-shadow: 0 0 0 3px rgba(76,175,80,.25), 0 0 10px rgba(76,175,80,.55); }
            }
        `;
        document.head.appendChild(s);
    }

    function clearSuggestion() {
        document.querySelectorAll('.sk-sfc-btn').forEach(el => el.classList.remove('sk-sfc-btn'));
        document.querySelectorAll('.sk-sfc-badge').forEach(el => el.remove());
        document.querySelectorAll('.sk-sfc-tile').forEach(el => el.classList.remove('sk-sfc-tile'));
    }

    function applySuggestion(pick) {
        clearSuggestion();
        if (!pick?.btn) return;
        pick.tile.classList.add('sk-sfc-tile');
        const badge = document.createElement('div');
        badge.className = 'sk-sfc-badge';
        badge.textContent = 'Suggested';
        pick.tile.appendChild(badge);
        pick.btn.classList.add('sk-sfc-btn');
    }

    // ── Header badge ──────────────────────────────────────────────────────────
    function injectHeaderBadge() {
        if (document.getElementById(BADGE_ID)) return;
        const h4 = document.querySelector('div.appHeader___tG_Ot h4.heading___BtymB');
        if (!h4) return;
        const badge = document.createElement('span');
        badge.id    = BADGE_ID;
        badge.title = 'Sidekick Search for Cash active';
        badge.style.cssText = [
            'display:inline-flex', 'align-items:center', 'justify-content:center',
            'width:16px', 'height:16px', 'border-radius:50%',
            'background:linear-gradient(135deg,#66BB6A,#4CAF50)',
            'color:#fff', 'font-size:10px', 'font-weight:bold',
            'margin-left:6px', 'vertical-align:middle', 'flex-shrink:0',
            'box-shadow:0 0 4px rgba(102,187,106,0.6)',
        ].join(';');
        badge.textContent = '\u2713';
        h4.appendChild(badge);
    }

    function removeHeaderBadge() {
        document.getElementById(BADGE_ID)?.remove();
    }

    // ── Scan + suggest ────────────────────────────────────────────────────────
    function trySuggest() {
        if (!enabled || !isSFCPage()) { clearSuggestion(); return false; }
        injectStyles();
        injectHeaderBadge();

        const tiles   = enumerateTiles();
        if (!tiles.length) { clearSuggestion(); return false; }

        const active  = tiles.filter(j => !j.isDisabled);
        if (!active.length) { clearSuggestion(); return false; }

        applySuggestion(chooseBest(active));
        return true;
    }

    // ── Scheduler ─────────────────────────────────────────────────────────────
    function schedule(ms) {
        clearTimeout(scheduled);
        scheduled = setTimeout(() => tick(), ms);
    }

    function tick() {
        if (document.hidden) { schedule(Math.min(CFG.backoffCeilMs, backoff * 1.5)); return; }
        const suggested = trySuggest();
        backoff = suggested
            ? Math.max(rndMs(CFG.baseIntervalMs), Math.floor(backoff * CFG.backoffShrink))
            : Math.min(CFG.backoffCeilMs, Math.floor(backoff * CFG.backoffGrow));
        schedule(backoff + Math.floor(rnd(-150, 250)));
    }

    function stopScheduler() {
        clearTimeout(scheduled);
        scheduled = null;
    }

    // ── Nav watcher ───────────────────────────────────────────────────────────
    function startNavWatcher() {
        if (navWatcher) return;
        lastUrl    = window.location.href;
        navWatcher = setInterval(() => {
            const cur = window.location.href;
            if (cur === lastUrl) return;
            lastUrl = cur;
            if (isSFCPage()) {
                stopScheduler();
                backoff = rndMs(CFG.baseIntervalMs);
                tick();
            } else {
                stopScheduler();
                clearSuggestion();
                removeHeaderBadge();
            }
        }, 300);
    }

    // ── Module API ────────────────────────────────────────────────────────────
    return {
        async init() {
            // Load settings — default OFF (opt-in feature)
            try {
                const settings = await window.SidekickModules?.Core?.ChromeStorage?.get('sidekick_settings');
                const entry    = settings?.[STORAGE_KEY];
                enabled        = entry ? entry.isEnabled === true : false;
            } catch (e) {
                enabled = false;
            }

            startNavWatcher();
            window.addEventListener('hashchange', () => {
                stopScheduler();
                if (isSFCPage() && enabled) { backoff = rndMs(CFG.baseIntervalMs); tick(); }
                else { clearSuggestion(); removeHeaderBadge(); }
            });
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && isSFCPage() && enabled) tick();
            });

            if (enabled && isSFCPage()) { backoff = rndMs(CFG.baseIntervalMs); tick(); }
            console.log(`[SFC] Initialized — ${enabled ? 'enabled' : 'disabled'}`);
        },

        enable() {
            enabled = true;
            if (isSFCPage()) { backoff = rndMs(CFG.baseIntervalMs); tick(); }
        },

        disable() {
            enabled = false;
            stopScheduler();
            clearSuggestion();
            removeHeaderBadge();
        },

        async toggle() {
            if (enabled) this.disable(); else this.enable();
            return enabled;
        },
    };
})();

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.SearchForCash = SearchForCashModule;
console.log('[SFC] Registered');
