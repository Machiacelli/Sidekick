/**
 * Sidekick Chrome Extension — Nice Helper Module
 * Automatically targets the nearest NICE honor (69/420) pattern per stat
 * and redirects the auto-gym to the correct gym:
 *   • Far from target   → best (max-gain) gym for fast progress
 *   • Approaching       → highest gym whose gain/session fits the landing zone
 *   • Precision zone    → slowest available gym; per-session fine-tuning
 *
 * Only a single on/off toggle is exposed to the user.
 * Everything else is calculated automatically from the Torn API.
 *
 * Communicates with auto-gym-switch-inject.js via localStorage:
 *   sidekick_merit_active     — 'true' when enabled
 *   sidekick_merit_target_gym — gym ID to use (overrides max-gain selection)
 *
 * Version: 1.0.0
 * Author: Machiacelli
 */
(function () {
    'use strict';
    if (!window.SidekickModules) window.SidekickModules = {};

    // ── Storage / LS keys ─────────────────────────────────────────────────────
    const STORAGE_KEY         = 'sidekick_merit_calculator';
    const LS_MERIT_ACTIVE     = 'sidekick_merit_active';
    const LS_MERIT_TARGET_GYM = 'sidekick_merit_target_gym';

    // ── Gym multiplier table ──────────────────────────────────────────────────
    // Mirrors auto-gym-switch-inject.js gym ratios
    const GYM_INFO = {
        1:  { str:2,   spe:2,   def:2,   dex:2   },
        2:  { str:2.4, spe:2.4, def:2.7, dex:2.4 },
        3:  { str:2.7, spe:3.2, def:3.0, dex:2.7 },
        4:  { str:3.2, spe:3.2, def:3.2, dex:0   },
        5:  { str:3.4, spe:3.6, def:3.4, dex:3.2 },
        6:  { str:3.4, spe:3.6, def:3.6, dex:3.8 },
        7:  { str:3.7, spe:0,   def:3.7, dex:3.7 },
        8:  { str:4,   spe:4,   def:4,   dex:4   },
        9:  { str:4.8, spe:4.4, def:4,   dex:4.2 },
        10: { str:4.4, spe:4.6, def:4.8, dex:4.4 },
        11: { str:5,   spe:4.6, def:5.2, dex:4.6 },
        12: { str:5,   spe:5.2, def:5,   dex:5   },
        13: { str:5,   spe:5.4, def:4.8, dex:5.2 },
        14: { str:5.5, spe:5.7, def:5.5, dex:5.2 },
        15: { str:0,   spe:5.5, def:5.5, dex:5.7 },
        16: { str:6,   spe:6,   def:6,   dex:6   },
        17: { str:6,   spe:6.2, def:6.4, dex:6.2 },
        18: { str:6.5, spe:6.4, def:6.2, dex:6.2 },
        19: { str:6.4, spe:6.5, def:6.4, dex:6.8 },
        20: { str:6.4, spe:6.4, def:6.8, dex:7   },
        21: { str:7,   spe:6.4, def:6.4, dex:6.5 },
        22: { str:6.8, spe:6.5, def:7,   dex:6.5 },
        23: { str:6.8, spe:7,   def:7,   dex:6.8 },
        24: { str:7.3, spe:7.3, def:7.3, dex:7.3 },
        25: { str:0,   spe:0,   def:7.5, dex:7.5 },
        26: { str:7.5, spe:7.5, def:0,   dex:0   },
        27: { str:8,   spe:0,   def:0,   dex:0   },
        28: { str:0,   spe:0,   def:8,   dex:0   },
        29: { str:0,   spe:8,   def:0,   dex:0   },
        30: { str:0,   spe:0,   def:0,   dex:8   },
        31: { str:9,   spe:9,   def:9,   dex:9   },
        32: { str:10,  spe:10,  def:10,  dex:10  },
        33: { str:3.4, spe:3.4, def:4.6, dex:0   },
    };

    const STAT_LABELS = { str: 'Strength', def: 'Defense', spe: 'Speed', dex: 'Dexterity' };
    const STAT_ICONS  = { str: '💪', def: '🛡️', spe: '⚡', dex: '🎯' };

    // ══════════════════════════════════════════════════════════════════════════
    //  NICE NUMBER MATH ENGINE
    // ══════════════════════════════════════════════════════════════════════════

    /** Find all '69' / '420' substrings in the INTEGER part of a stat */
    function findNicePatterns(value) {
        const s = Math.floor(value).toString();
        const found = [];
        for (let i = 0; i < s.length - 1; i++) {
            if (s.substring(i, i + 2) === '69')  found.push({ type: '69',  pos: i, len: 2 });
        }
        for (let i = 0; i < s.length - 2; i++) {
            if (s.substring(i, i + 3) === '420') found.push({ type: '420', pos: i, len: 3 });
        }
        return found;
    }

    /** Count across all 4 stats — returns { total, has69, has420, perStat, earned } */
    function countNiceNumbers(stats) {
        let total = 0, has69 = false, has420 = false;
        const perStat = {};
        for (const k of ['str', 'def', 'spe', 'dex']) {
            const p = findNicePatterns(stats[k] || 0);
            perStat[k] = p;
            total += p.length;
            if (p.some(x => x.type === '69'))  has69  = true;
            if (p.some(x => x.type === '420')) has420 = true;
        }
        return { total, has69, has420, perStat, earned: total >= 5 && has69 && has420 };
    }

    /**
     * Width of the "landing zone" — the number of consecutive integers
     * that all contain the nice pattern at the same position.
     * e.g. "69" at position 3 of a 7-digit number → trailing 2 digits free → zone = 100
     */
    function getRangeWidth(target) {
        const s  = Math.floor(target).toString();
        const ps = findNicePatterns(target);
        if (!ps.length) return 1;
        let minW = Infinity;
        for (const p of ps) {
            const w = Math.pow(10, s.length - p.pos - p.len);
            if (w < minW) minW = w;
        }
        return minW;
    }

    /** Find the next N integer values above statVal that contain a nice pattern */
    function findNextNiceTargets(statVal, numResults = 8) {
        const floor       = Math.floor(statVal);
        const candidates  = new Set();
        const lenCurrent  = floor.toString().length;

        for (const niceStr of ['69', '420']) {
            const niceNum = parseInt(niceStr);
            for (let len = lenCurrent; len <= lenCurrent + 1; len++) {
                if (niceStr.length > len) continue;
                for (let pos = 0; pos <= len - niceStr.length; pos++) {
                    const suffixLen  = len - pos - niceStr.length;
                    const suffixMult = Math.pow(10, suffixLen);
                    const niceBlock  = niceNum * suffixMult;

                    if (pos === 0) {
                        if (niceBlock + suffixMult - 1 > floor) {
                            candidates.add(Math.max(floor + 1, niceBlock));
                        }
                    } else {
                        const prefixMult = Math.pow(10, len - pos);
                        const prefixMin  = Math.pow(10, pos - 1);
                        const prefixMax  = Math.pow(10, pos) - 1;
                        const startPfx   = Math.max(prefixMin, Math.ceil((floor - niceBlock + 1) / prefixMult));

                        if (startPfx <= prefixMax) {
                            const rMin = startPfx * prefixMult + niceBlock;
                            if (rMin > floor) candidates.add(rMin);
                            if (startPfx > prefixMin) {
                                const prev = (startPfx - 1) * prefixMult + niceBlock;
                                if (prev + suffixMult - 1 > floor) candidates.add(Math.max(floor + 1, prev));
                            }
                        }
                    }
                }
            }
        }

        return [...candidates]
            .filter(v => v > floor)
            .sort((a, b) => a - b)
            .slice(0, numResults)
            .map(v => ({ value: v, distance: v - floor, patterns: findNicePatterns(v), rangeWidth: getRangeWidth(v) }));
    }

    /** Estimated stat gain per training session (5 energy default) */
    function gainPerSession(gymMult, statVal, happy, energyPerSess) {
        return gymMult * Math.pow(Math.max(statVal, 1), 0.4) / 1000 * happy * energyPerSess;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SMART DECISION ENGINE
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Pick the best next target across all 4 stats.
     * Scoring: distance weighted by what we still need (420 > 69, double-nice bonus).
     */
    function findBestTarget(stats, status) {
        if (status.earned) return null;

        const need420 = !status.has420;
        const need69  = !status.has69;
        let best = null, bestScore = Infinity;

        for (const k of ['str', 'def', 'spe', 'dex']) {
            const val     = stats[k] || 0;
            const targets = findNextNiceTargets(val, 8);

            for (const t of targets) {
                const gives420  = t.patterns.some(p => p.type === '420');
                const gives69   = t.patterns.some(p => p.type === '69');
                const isDouble  = t.patterns.length >= 2;

                let score = t.distance;
                // Weight by priority: 420 is harder (rarer digit combination)
                if (need420 && gives420) score *= 0.35;
                if (need69  && gives69)  score *= 0.60;
                if (isDouble)            score *= 0.50; // Two nice numbers in one hit

                if (score < bestScore) {
                    bestScore = score;
                    best = { statKey: k, target: t };
                }
            }
        }
        return best;
    }

    /**
     * Choose which gym to use based on how close we are to the target.
     *
     * Phase logic (using 5E sessions at default happy 2000):
     *   bulk      — >30 sessions away → use the best (max-gain) gym
     *   approach  — 5-30 sessions     → use highest gym that stays inside the zone
     *   precision — <5 sessions       → use lowest available gym for that stat
     *
     * Returns { gymId, phase, gps, sessionsLeft }
     */
    function selectGym(statKey, statVal, targetVal, happy) {
        const dist = targetVal - statVal;
        const rw   = getRangeWidth(targetVal);
        const ENERGY = 5;

        let bestId = null, bestMult = 0;
        let lowestId = null, lowestMult = Infinity;
        let precisionId = null, precisionMult = 0;

        for (const [id, r] of Object.entries(GYM_INFO)) {
            const m = r[statKey] || 0;
            if (!m) continue;
            const gps = gainPerSession(m, statVal, happy, ENERGY);

            if (m > bestMult)    { bestMult    = m; bestId    = parseInt(id); }
            if (m < lowestMult)  { lowestMult  = m; lowestId  = parseInt(id); }
            // Precision: gps fits comfortably inside the landing zone (≤ rw/2)
            if (gps <= rw / 2 && m > precisionMult) { precisionMult = m; precisionId = parseInt(id); }
        }

        const gpsAtBest   = gainPerSession(bestMult, statVal, happy, ENERGY);
        const sessionsLeft = gpsAtBest > 0 ? dist / gpsAtBest : Infinity;

        if (sessionsLeft > 30) {
            return { gymId: bestId, phase: 'bulk', gps: gpsAtBest, sessionsLeft };
        } else if (gpsAtBest <= rw) {
            return { gymId: bestId, phase: 'approach', gps: gpsAtBest, sessionsLeft };
        } else {
            const g  = precisionId || lowestId;
            const m2 = GYM_INFO[g]?.[statKey] || 0;
            const gps2 = gainPerSession(m2, statVal, happy, ENERGY);
            return { gymId: g, phase: 'precision', gps: gps2, sessionsLeft: gps2 > 0 ? dist / gps2 : Infinity };
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  FORMAT HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    /** Comma-formatted integer */
    function fmt(n) { return Math.floor(n).toLocaleString(); }

    /**
     * Format a stat value as HTML with 69→green and 420→amber highlighted digits.
     * No purple — uses the extension's green (#5fcc6a) for 69, amber (#fbbf24) for 420.
     */
    function fmtStatHL(value) {
        const s  = Math.floor(value).toString();
        const ps = findNicePatterns(value);

        const opens  = [];
        const closes = [];
        for (const p of ps) {
            const color = p.type === '420' ? '#fbbf24' : '#5fcc6a';
            opens[p.pos] = (opens[p.pos] || '') +
                `<span style="color:${color};font-weight:900;text-shadow:0 0 7px ${color}55;">`;
            closes[p.pos + p.len - 1] = (closes[p.pos + p.len - 1] || '') + '</span>';
        }

        let out = '';
        for (let i = 0; i < s.length; i++) {
            if (opens[i])  out += opens[i];
            out += s[i];
            if (closes[i]) out += closes[i];
            const rem = s.length - i - 1;
            if (rem > 0 && rem % 3 === 0) out += ',';
        }
        return out;
    }

    const PHASE_TEXT = {
        bulk:      { label: 'Max gains',      color: '#5fcc6a', hint: 'Far from target — using best gym for fast progress' },
        approach:  { label: 'Fine approach',  color: '#fbbf24', hint: 'Getting close — best gym still fits the landing zone' },
        precision: { label: 'Precision mode', color: '#f97316', hint: 'Almost there — using lower gym to fine-tune final steps' },
    };

    // ══════════════════════════════════════════════════════════════════════════
    //  MODULE
    // ══════════════════════════════════════════════════════════════════════════
    const NiceHelperModule = {
        isEnabled:  false,
        _analysis:  null, // { statKey, target, gymId, phase, gps, sessionsLeft, status, stats }
        _observer:  null,

        // ── Init ─────────────────────────────────────────────────────────────
        async init() {
            console.log('🎯 Initializing Nice Helper Module...');
            try {
                await this._loadSettings();
                this._syncLS();
                this._watchForPanel();
                if (this.isEnabled) {
                    // Non-blocking background analysis
                    this._runAnalysis().catch(e => console.warn('🎯 Nice Helper analysis error:', e));
                }
                console.log('✅ Nice Helper Module initialized');
            } catch (e) {
                console.error('❌ Nice Helper init error:', e);
            }
        },

        // ── Settings ─────────────────────────────────────────────────────────
        async _loadSettings() {
            const CS = window.SidekickModules?.Core?.ChromeStorage;
            if (!CS) return;
            const s = await CS.get(STORAGE_KEY);
            if (s) this.isEnabled = s.isEnabled ?? false;
        },

        async _saveSettings() {
            const CS = window.SidekickModules?.Core?.ChromeStorage;
            if (CS) await CS.set(STORAGE_KEY, { isEnabled: this.isEnabled });
        },

        // ── localStorage sync (read by auto-gym-switch-inject.js MAIN world) ─
        _syncLS() {
            localStorage.setItem(LS_MERIT_ACTIVE,     this.isEnabled ? 'true' : '');
            localStorage.setItem(LS_MERIT_TARGET_GYM, this._analysis?.gymId
                ? String(this._analysis.gymId)
                : '');
        },

        // ── API fetch ─────────────────────────────────────────────────────────
        async _fetchFromAPI() {
            const CS = window.SidekickModules?.Core?.ChromeStorage;
            if (!CS) return null;
            const key = await CS.get('sidekick_api_key');
            if (!key) return null;

            // Fetch battle stats + basic (for current happy)
            const [bsResp, basicResp] = await Promise.all([
                fetch(`https://api.torn.com/user/?selections=battlestats&key=${key}`),
                fetch(`https://api.torn.com/user/?selections=basic&key=${key}`),
            ]);
            const bs    = await bsResp.json();
            const basic = await basicResp.json();

            if (bs.error) { console.warn('🎯 API error:', bs.error); return null; }

            const stats = {
                str: bs.strength  || 0,
                def: bs.defense   || 0,
                spe: bs.speed     || 0,
                dex: bs.dexterity || 0,
            };

            // Extract current happy — try several known field locations
            const happy =
                basic?.happy?.current          ??
                basic?.personalstats?.happy    ??
                basic?.happy                   ??
                2000; // conservative fallback

            return { stats, happy: Math.max(100, Number(happy) || 2000) };
        },

        // ── Core analysis (runs automatically in background) ──────────────────
        async _runAnalysis() {
            const data = await this._fetchFromAPI();
            if (!data) {
                console.warn('🎯 Nice Helper: could not fetch API data');
                return;
            }

            const { stats, happy } = data;
            const status           = countNiceNumbers(stats);
            const best             = findBestTarget(stats, status);

            if (!best || status.earned) {
                this._analysis = { earned: true, status, stats };
            } else {
                const { statKey, target } = best;
                const gymResult = selectGym(statKey, stats[statKey] || 0, target.value, happy);
                this._analysis  = {
                    statKey,
                    target,
                    gymId:       gymResult.gymId,
                    phase:       gymResult.phase,
                    gps:         gymResult.gps,
                    sessionsLeft: gymResult.sessionsLeft,
                    status,
                    stats,
                    happy,
                };
            }

            this._syncLS();

            // Refresh the status card if the settings panel is currently open
            const panel = document.getElementById('skp-tab-merits');
            if (panel) this._renderStatus(panel);
        },

        // ── Watch for settings panel ──────────────────────────────────────────
        _watchForPanel() {
            const self = this;
            this._observer = new MutationObserver(() => {
                const panel = document.getElementById('skp-tab-merits');
                if (panel && !panel._nhBound) {
                    panel._nhBound = true;
                    self._setupPanel(panel);
                }
            });
            this._observer.observe(document.body, { childList: true, subtree: true });
        },

        // ── Wire up the settings panel ────────────────────────────────────────
        _setupPanel(panel) {
            const self = this;
            const tog  = panel.querySelector('#skp-tog-merit-calc');
            if (tog) {
                // Trust the TOGGLE_MAP's loaded value as the source of truth for initial state.
                // Update our internal flag to match in case storage loaded after our init.
                // (TOGGLE_MAP already ran its async load into tog.checked by the time the panel appears.)
                setTimeout(() => {
                    self.isEnabled = tog.checked;
                    self._renderStatus(panel);
                }, 50);

                tog.addEventListener('change', async () => {
                    self.isEnabled = tog.checked;
                    // TOGGLE_MAP's own listener handles persistence — no need to _saveSettings here.
                    // Just clear LS and re-run analysis as needed.
                    if (self.isEnabled) {
                        self._syncLS();
                        self._renderStatus(panel, true); // show "Analysing…"
                        await self._runAnalysis();
                    } else {
                        self._analysis = null;
                        self._syncLS();
                        self._renderStatus(panel);
                    }
                });
            }
            this._renderStatus(panel);
        },

        // ── Build and inject the status card ─────────────────────────────────
        _renderStatus(panel, loading = false) {
            const el = panel?.querySelector('#skp-nice-status');
            if (!el) return;

            if (!this.isEnabled) {
                el.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,.4);padding:4px 0;">Enable Nice Helper to see training recommendations.</div>';
                return;
            }

            if (loading || !this._analysis) {
                el.innerHTML = `<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px 12px;font-size:11px;color:rgba(255,255,255,.5);display:flex;align-items:center;gap:8px;">
                    <span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.12);border-top-color:#5fcc6a;border-radius:50%;animation:nh-spin .8s linear infinite;flex-shrink:0;"></span>
                    Fetching your stats and calculating best target…
                    <style>@keyframes nh-spin{to{transform:rotate(360deg);}}</style>
                </div>`;
                return;
            }

            const { earned, status, stats, statKey, target, gymId, phase, gps, sessionsLeft } = this._analysis;

            // Progress pips
            const pips = [0,1,2,3,4].map(i => {
                const on = i < status.total;
                const bg = on
                    ? (status.earned ? '#4ade80' : '#5fcc6a')
                    : 'rgba(255,255,255,.12)';
                const shadow = on && status.earned ? 'box-shadow:0 0 5px #4ade8088;' : '';
                return `<div style="width:10px;height:10px;border-radius:50%;background:${bg};${shadow}flex-shrink:0;"></div>`;
            }).join('');

            const badge = (label, ok, okColor, failColor) =>
                `<span style="padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;background:${ok
                    ? `${okColor}18` : 'rgba(248,113,113,.08)'};color:${ok ? okColor : '#f87171'};border:1px solid ${ok
                    ? `${okColor}33` : 'rgba(248,113,113,.2)'};">${label} ${ok ? '✅' : '❌'}</span>`;

            if (earned) {
                el.innerHTML = `<div style="background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.2);border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:20px;margin-bottom:4px;">🎉</div>
                    <div style="font-weight:700;font-size:13px;color:#4ade80;">NICE Honor Achieved!</div>
                    <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:4px;">All 5 nice numbers found across your battle stats</div>
                </div>`;
                return;
            }

            const phaseInfo     = PHASE_TEXT[phase] || PHASE_TEXT.bulk;
            const targetPatTypes = [...new Set(target.patterns.map(p => p.type))].join(' + ');
            const sess           = isFinite(sessionsLeft) ? `~${Math.ceil(sessionsLeft)}` : '?';
            const rw             = target.rangeWidth;
            const statVal        = stats[statKey] || 0;

            el.innerHTML = `
<style>@keyframes nh-spin{to{transform:rotate(360deg);}}</style>
<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:11px 13px;">

    <!-- Progress row -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ccc;">
            <div style="display:flex;gap:3px;">${pips}</div>
            <span><strong style="color:${status.earned ? '#4ade80' : '#f1f5f9'}">${status.total}/5</strong></span>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
            ${badge('69', status.has69, '#5fcc6a', '#f87171')}
            ${badge('420', status.has420, '#fbbf24', '#f87171')}
        </div>
    </div>

    <!-- Target stat + value -->
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;">
        <span style="font-size:11px;color:rgba(255,255,255,.45);font-weight:600;min-width:72px;">${STAT_ICONS[statKey]} ${STAT_LABELS[statKey]}</span>
        <span style="font-size:15px;font-weight:800;color:#f1f5f9;letter-spacing:-0.5px;font-feature-settings:"tnum";">${fmtStatHL(statVal)}</span>
    </div>

    <!-- Target line -->
    <div style="display:flex;align-items:center;gap:8px;font-size:11px;margin-bottom:2px;">
        <span style="color:rgba(255,255,255,.4);min-width:72px;">Target</span>
        <span style="font-weight:700;color:#f1f5f9;">${fmt(target.value)}</span>
        <span style="color:rgba(255,255,255,.3);font-size:10px;">[${targetPatTypes}]</span>
        <span style="color:rgba(255,255,255,.35);">+${fmt(target.distance)}</span>
    </div>
    <div style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:10px;padding-left:80px;">
        Landing zone: ${fmt(rw)} wide (${fmt(target.value)}–${fmt(target.value + rw - 1)})
    </div>

    <!-- Gym + phase -->
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:6px;padding:7px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div>
            <div style="font-size:11px;color:rgba(255,255,255,.45);">Auto-gym →</div>
            <div style="font-size:13px;font-weight:700;color:#5fcc6a;">Gym #${gymId}</div>
        </div>
        <div style="text-align:right;">
            <div style="font-size:11px;font-weight:700;color:${phaseInfo.color};">${phaseInfo.label}</div>
            <div style="font-size:10px;color:rgba(255,255,255,.35);">${sess} sessions · ~${fmt(gps)} gain/train</div>
        </div>
    </div>
    <div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:5px;">${phaseInfo.hint}</div>

</div>`;
        },

        // Public toggle (satisfies existing TOGGLE_MAP wiring via skp-tog-merit-calc)
        async toggle() {
            this.isEnabled = !this.isEnabled;
            await this._saveSettings();
            this._syncLS();
            return this.isEnabled;
        },
    };

    window.SidekickModules.MeritCalculator = NiceHelperModule;
    console.log('✅ Nice Helper Module loaded');
})();
