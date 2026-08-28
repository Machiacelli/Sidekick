/**
 * Scamming (Crime Morale) Module - MAIN WORLD
 * Runs in the page's main world so it can access Torn's jQuery and intercept fetch.
 * Adapted from Crime Morale by tobytorn [1617955] (MIT).
 *
 * NOTE: This file is injected via a separate manifest content_scripts entry
 * with "world": "MAIN" and "run_at": "document_start".
 * It is self-initializing — no call from main.js required.
 */
(function () {
    'use strict';

    if (window.SIDEKICK_SCAMMING_INJECTED) return;
    window.SIDEKICK_SCAMMING_INJECTED = true;
    console.log('[Scamming] Script loaded in MAIN world');

    const STORAGE_KEY = 'crime-scamming';
    const LOCAL_STORAGE_PREFIX = 'CRIME_MORALE_';
    const STYLE_ELEMENT_ID = 'CRIME-MORALE-STYLE';

    // ── Storage helpers ──────────────────────────────────────────────────────
    function getLS(key, def) {
        try { return JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_PREFIX + key)) ?? def; }
        catch { return def; }
    }
    function setLS(key, value) {
        window.localStorage.setItem(LOCAL_STORAGE_PREFIX + key, JSON.stringify(value));
    }
    const getValue = getLS;
    const setValue = setLS;

    // ── Style injection ───────────────────────────────────────────────────────
    function addStyle(css) {
        const existing = document.getElementById(STYLE_ELEMENT_ID);
        const style = existing ?? (() => {
            const s = document.createElement('style');
            s.id = STYLE_ELEMENT_ID;
            document.head.appendChild(s);
            return s;
        })();
        style.appendChild(document.createTextNode(css));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function formatLifetime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const text =
            hours >= 72 ? `${Math.floor(hours / 24)}d`
                : hours > 0 ? `${hours}h`
                    : seconds >= 0 ? `${Math.floor(seconds / 60)}m`
                        : '';
        const color = hours >= 24 ? 't-gray-c' : hours >= 12 ? 't-yellow' : hours >= 0 ? 't-red' : '';
        return { seconds, hours, text, color };
    }

    function isCrimesPage() {
        const url = new URL(window.location.href);
        return (
            (url.pathname.endsWith('/page.php') || url.pathname.endsWith('/loader.php')) &&
            url.searchParams.get('sid') === 'crimes'
        );
    }

    function isScammingPage() {
        return isCrimesPage() && window.location.hash.includes('/scamming');
    }

    // ── Sidekick header badge ─────────────────────────────────────────────────
    const BADGE_ID = 'sidekick-scamming-badge';

    function injectHeaderBadge() {
        if (document.getElementById(BADGE_ID)) return;
        const h4 = document.querySelector('div.appHeader___tG_Ot h4.heading___BtymB');
        if (!h4) return;
        const badge = document.createElement('span');
        badge.id = BADGE_ID;
        badge.title = 'Sidekick Scamming active';
        badge.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            'width:16px',
            'height:16px',
            'border-radius:50%',
            'background:linear-gradient(135deg,#66BB6A,#4CAF50)',
            'color:#fff',
            'font-size:10px',
            'font-weight:bold',
            'margin-left:6px',
            'vertical-align:middle',
            'flex-shrink:0',
            'box-shadow:0 0 4px rgba(102,187,106,0.6)',
        ].join(';');
        badge.textContent = '\u2713';
        h4.appendChild(badge);
    }

    function removeHeaderBadge() {
        const b = document.getElementById(BADGE_ID);
        if (b) b.remove();
    }

    // ── ScammingSolver ────────────────────────────────────────────────────────
    class ScammingSolver {
        get BASE_ACTION_COST() { return this.algo === 'meritGrift' ? 0.001 : 0.02; }
        get FAILURE_COST_MAP() {
            return this.algo === 'merit' || this.algo === 'meritGrift'
                ? { 1: 0, 20: 0, 40: 0, 60: 0, 80: 0 }
                : { 1: 1, 20: 1, 40: 1, 60: 0.5, 80: 0.33 };
        }
        get CONCERN_SUCCESS_RATE_MAP() {
            return { 'young adult': 0.55, 'middle-aged': 0.5, senior: 0.45, professional: 0.4, affluent: 0.35, '': 0.5 };
        }
        get CELL_VALUE_MAP() {
            return this.algo === 'merit'
                ? { low: 2, medium: 2, high: 2, fail: -20 }
                : this.algo === 'meritGrift'
                    ? { low: 0, medium: 1, high: 1, fail: 0 }
                    : { low: 0.5, medium: 1.5, high: 2.5, fail: -20 };
        }
        get SAFE_CELL_SET() { return new Set(['neutral', 'low', 'medium', 'high', 'temptation']); }
        get DISPLACEMENT() {
            return {
                1: { strong: [[10, 19], [15, 29], [18, 35], [21, 39], [22, 42], [23, 44]], soft: [[3, 7], [5, 11], [6, 13], [6, 14], [7, 15], [7, 16]], back: [[-4, -2], [-6, -3], [-7, -4], [-8, -4], [-9, -4], [-9, -5]] },
                20: { strong: [[8, 15], [12, 23], [15, 28], [16, 31], [18, 33], [18, 35]], soft: [[3, 7], [5, 11], [6, 13], [6, 14], [7, 15], [7, 16]], back: [[-4, -2], [-6, -3], [-7, -4], [-8, -4], [-9, -4], [-9, -5]] },
                40: { strong: [[7, 13], [11, 20], [13, 24], [14, 27], [15, 29], [16, 30]], soft: [[3, 6], [5, 9], [6, 11], [6, 12], [7, 13], [7, 14]], back: [[-4, -2], [-6, -3], [-7, -4], [-8, -4], [-9, -4], [-9, -5]] },
                60: { strong: [[6, 11], [9, 17], [11, 20], [12, 23], [13, 24], [14, 25]], soft: [[2, 4], [3, 6], [4, 7], [4, 8], [4, 9], [5, 9]], back: [[-4, -2], [-6, -3], [-7, -4], [-8, -4], [-9, -4], [-9, -5]] },
                80: { strong: [[5, 9], [8, 14], [9, 17], [10, 19], [11, 20], [12, 21]], soft: [[2, 3], [3, 5], [4, 6], [4, 6], [4, 7], [5, 7]], back: [[-3, -2], [-5, -3], [-6, -4], [-6, -4], [-7, -4], [-7, -5]] },
            };
        }
        get MERIT_MASK_MAP() { return { temptation: 1n << 50n, sensitivity: 1n << 51n, hesitation: 1n << 52n, concern: 1n << 53n }; }
        get MERIT_REQUIREMENT_MASK() { return 0xfn << 50n; }

        constructor(algo, bar, targetLevel, round, suspicion, mark) {
            this.algo = algo; this.bar = bar; this.targetLevel = targetLevel;
            this.failureCost = this.FAILURE_COST_MAP[this.targetLevel];
            this.initialRound = round; this.initialSuspicion = suspicion; this.mark = mark;
            this.driftArrayMap = new Map(); this.dp = new Map();
            this.resolvingMasks = new Array(50);
            for (let pip = 0; pip < 50; pip++) {
                if (this.resolvingMasks[pip]) continue;
                if (this.bar[pip] !== 'hesitation' && this.bar[pip] !== 'concern') { this.resolvingMasks[pip] = 0n; continue; }
                let mask = this.algo === 'merit' ? this.MERIT_MASK_MAP[this.bar[pip]] : 0n;
                for (let e = pip; e < 50 && this.bar[e] === this.bar[pip]; e++) mask += 1n << BigInt(e);
                for (let e = pip; e < 50 && this.bar[e] === this.bar[pip]; e++) this.resolvingMasks[e] = mask;
            }
        }

        solve(round, pip, resolvingBitmap, multiplierUsed, driftBitmap) {
            if (this.algo === 'merit') {
                for (let p = 0; p < 50; p++) {
                    if (this._isResolved(p, resolvingBitmap)) resolvingBitmap |= this.MERIT_MASK_MAP[this.bar[p]] ?? 0n;
                }
                resolvingBitmap |= BigInt(driftBitmap) << 50n;
            }
            return this._visit(round - multiplierUsed, resolvingBitmap, multiplierUsed, pip)[pip];
        }

        _visit(round, resolvingBitmap, minMulti, singlePip = undefined) {
            const dpKey = BigInt(round) | (resolvingBitmap << 6n);
            if (minMulti === 0) { const v = this.dp.get(dpKey); if (v) return v; }
            const result = new Array(50);
            this.dp.set(dpKey, result);
            if (this._estimateSuspicion(round) >= 50) {
                for (let p = 0; p < 50; p++) result[p] = this._getCellResult(p, resolvingBitmap);
                return result;
            }
            const driftArray = this._getDriftArray(resolvingBitmap);
            const [pb, pe] = singlePip !== undefined ? [singlePip, singlePip + 1] : [0, 50];
            for (let pip = pb; pip < pe; pip++) {
                const best = this._getCellResult(pip, resolvingBitmap);
                if (this.bar[pip] === 'fail') { result[pip] = best; continue; }
                if (!this._isResolved(pip, resolvingBitmap)) {
                    if (this.bar[pip] === 'hesitation') { result[pip] = this._visit(round, resolvingBitmap | this.resolvingMasks[pip], 0)[pip]; continue; }
                    if (this.bar[pip] === 'concern') {
                        const rr = this._visit(round + 1, resolvingBitmap | this.resolvingMasks[pip], 0);
                        const ur = this._visit(round + 1, resolvingBitmap, 0);
                        const csr = this.CONCERN_SUCCESS_RATE_MAP[this.mark] ?? this.CONCERN_SUCCESS_RATE_MAP[''];
                        const val = rr[pip].value * csr + (ur[pip].value - this.failureCost) * (1 - csr) - this.BASE_ACTION_COST;
                        result[pip] = { value: Math.max(0, val), action: val > 0 ? 'resolve' : 'abandon', multi: 0 };
                        continue;
                    }
                }
                for (let multi = minMulti; multi <= 5; multi++) {
                    const sus = this._estimateSuspicion(round + multi);
                    const nrr = this._visit(round + multi + 1, resolvingBitmap, 0);
                    const actions = pip > 0 ? ['strong', 'soft', 'back'] : ['strong', 'soft'];
                    for (const action of actions) {
                        const da = this.DISPLACEMENT[this.targetLevel.toString()]?.[action]?.[multi];
                        if (!da) continue;
                        const [mn, mx] = da;
                        let tot = 0;
                        for (let d = mn; d <= mx; d++) {
                            const lp = Math.max(Math.min(pip + d, 49), 0);
                            const np = driftArray[lp];
                            if (lp < sus || np < sus) { tot += this.CELL_VALUE_MAP.fail; }
                            else {
                                if (!this.SAFE_CELL_SET.has(this.bar[lp]) && !this._isResolved(lp, resolvingBitmap)) tot -= this.failureCost;
                                tot -= this.BASE_ACTION_COST;
                                const lr = this.algo === 'merit' && np !== lp
                                    ? this._visit(round + multi + 1, resolvingBitmap | this.MERIT_MASK_MAP[this.bar[lp]], 0)
                                    : nrr;
                                tot += lr[np].value;
                            }
                        }
                        const avg = tot / (mx - mn + 1) - this.BASE_ACTION_COST * multi;
                        if (avg > best.value) { best.value = avg; best.action = action; best.multi = multi; }
                    }
                }
                result[pip] = best;
            }
            return result;
        }

        _getDriftArray(resolvingBitmap) {
            const cached = this.driftArrayMap.get(resolvingBitmap);
            if (cached) return cached;
            const arr = new Array(50);
            this.driftArrayMap.set(resolvingBitmap, arr);
            for (let pip = 0; pip < 50; pip++) {
                let np = pip;
                if (this.bar[pip] === 'temptation') {
                    while (np + 1 < 50 && (!this.SAFE_CELL_SET.has(this.bar[np]) || this.bar[np] === 'temptation') && !this._isResolved(np, resolvingBitmap)) np++;
                } else if (this.bar[pip] === 'sensitivity') {
                    while (np > 0 && this.bar[np] !== 'neutral' && !this._isResolved(np, resolvingBitmap)) np--;
                }
                arr[pip] = np;
            }
            return arr;
        }

        _getCellResult(pip, resolvingBitmap) {
            let value = this.CELL_VALUE_MAP[this.bar[pip]] ?? 0;
            if (this.algo === 'merit' && (resolvingBitmap & this.MERIT_REQUIREMENT_MASK) !== this.MERIT_REQUIREMENT_MASK) value = Math.min(value, 0);
            const action = this.bar[pip] === 'fail' ? 'fail' : value > 0 ? 'capitalize' : 'abandon';
            return { value, action, multi: 0 };
        }

        _estimateSuspicion(round) {
            if (round <= this.initialRound) return this.initialSuspicion;
            const pre = [0, 0, 0, 0, 2, 5, 8, 11, 16, 23, 34, 50][round] ?? 50;
            const cur = Math.floor(this.initialSuspicion * 1.5 ** (round - this.initialRound));
            return Math.max(pre, cur);
        }

        _isResolved(pip, resolvingBitmap) { return ((1n << BigInt(pip)) & resolvingBitmap) !== 0n; }
    }

    // ── ScammingStore ─────────────────────────────────────────────────────────
    class ScammingStore {
        get TARGET_LEVEL_MAP() {
            return { 'delivery scam': 1, 'family scam': 1, 'prize scam': 1, 'charity scam': 20, 'tech support scam': 20, 'vacation scam': 40, 'tax scam': 40, 'advance-fee scam': 60, 'job scam': 60, 'romance scam': 80, 'investment scam': 80 };
        }
        get SPAM_ID_MAP() {
            return { 295: 'delivery', 293: 'family', 291: 'prize', 297: 'charity', 299: 'tech support', 301: 'vacation', 303: 'tax', 305: 'advance-fee', 307: 'job', 309: 'romance', 311: 'investment' };
        }
        constructor() {
            this.data = getValue('scamming', {});
            this.data.targets = this.data.targets ?? {};
            this.data.farms = this.data.farms ?? {};
            this.data.spams = this.data.spams ?? {};
            this.data.defaultAlgo = this.data.defaultAlgo ?? 'exp';
            this.data.algoNotice = this.data.algoNotice ?? {};
            this.unsyncedSet = new Set(Object.keys(this.data.targets));
            this.solvers = {}; this.lastSolutions = {}; this.cash = undefined;
        }
        update(data) {
            this._updateTargets(data.DB?.crimesByType?.targets);
            this._updateFarms(data.DB?.additionalInfo?.currentOngoing);
            this._updateSpams(data.DB?.currentUserStats?.crimesByIDAttempts, data.DB?.crimesByType?.methods);
            this.cash = data.DB?.user?.money;
            this._save();
        }
        setDefaultAlgo(algo, observer) {
            this.data.defaultAlgo = algo;
            // Re-solve every existing target that has this algo available,
            // then signal the observer to re-render so checkmarks move immediately.
            let changed = false;
            for (const target of Object.values(this.data.targets)) {
                if (!target.algos) continue;
                const idx = target.algos.indexOf(algo);
                if (idx === 0) continue; // already using this algo
                if (idx > 0) {
                    // Rotate so the chosen algo is first
                    target.algos = [...target.algos.slice(idx), ...target.algos.slice(0, idx)];
                } else {
                    // algo not feasible for this target — skip
                    continue;
                }
                target.solution = null;
                this._solve(target);
                changed = true;
            }
            this._save();
            if (changed && observer) observer.refreshAll();
        }
        changeAlgo(target) { target.algos.push(target.algos.shift()); target.solution = null; this._solve(target); this._save(); }
        setAlgoNoticeRead(algo) { this.data.algoNotice[algo] = true; this._save(); }
        _save() { setValue('scamming', this.data); }

        _updateTargets(targets) {
            if (!targets) return;
            for (const target of targets) {
                const stored = this.data.targets[target.subID];
                if (stored && !target.new && target.bar) {
                    stored.driftBitmap = stored.driftBitmap ?? 0;
                    stored.turns = stored.turns ?? target.turns ?? 0;
                    stored.mark = (target.target ?? '').toLowerCase();
                    let updated = false;
                    if (stored.multiplierUsed !== target.multiplierUsed || stored.pip !== target.pip || stored.turns !== (target.turns ?? 0)) {
                        stored.multiplierUsed = target.multiplierUsed; stored.pip = target.pip;
                        stored.turns = target.turns ?? 0; stored.expire = target.expire; updated = true;
                    }
                    if (updated && this.unsyncedSet.has(stored.id)) stored.unsynced = true;
                    this.unsyncedSet.delete(stored.id);
                    if (stored.bar) {
                        for (let pip = 0; pip < 50; pip++) {
                            if (target.bar[pip] === stored.bar[pip]) continue;
                            if (target.bar[pip] === 'fail' && stored.suspicion <= pip) { stored.suspicion = pip + 1; updated = true; }
                            if (target.bar[pip] === 'neutral' && (BigInt(stored.resolvingBitmap) & (1n << BigInt(pip))) === 0n) { stored.resolvingBitmap = (BigInt(stored.resolvingBitmap) | (1n << BigInt(pip))).toString(); updated = true; }
                        }
                        if (target.firstPip) {
                            if (stored.bar[target.firstPip] === 'temptation') stored.driftBitmap |= 1;
                            if (stored.bar[target.firstPip] === 'sensitivity') stored.driftBitmap |= 2;
                        }
                    }
                    if (updated) stored.round = stored.unsynced ? this._estimateRound(target) : stored.round + 1;
                    if (!stored.bar) { stored.bar = target.bar; updated = true; }
                    if (updated || !stored.solution) this._solve(stored);
                } else {
                    const mu = target.multiplierUsed ?? 0, pip = target.pip ?? 0;
                    const round = mu === 0 && pip === 0 ? 0 : Math.max(1, mu);
                    const stored = { id: target.subID, email: target.email, level: this.TARGET_LEVEL_MAP[target.scamMethod?.toLowerCase()] ?? 999, mark: '', round, turns: target.turns ?? 0, multiplierUsed: mu, pip, expire: target.expire, bar: target.bar ?? null, suspicion: 0, resolvingBitmap: '0', driftBitmap: 0, algos: null, solution: null, unsynced: round > 0 };
                    this.data.targets[target.subID] = stored;
                    this._solve(stored);
                }
            }
            const now = Math.floor(Date.now() / 1000);
            for (const target of Object.values(this.data.targets)) {
                if (target.expire < now) delete this.data.targets[target.id];
            }
        }
        _updateFarms(currentOngoing) {
            if (typeof currentOngoing !== 'object' || !(currentOngoing.length > 0)) return;
            for (const item of currentOngoing) {
                if (!item.type) continue;
                this.data.farms[item.type] = { expire: item.timeEnded };
            }
        }
        _updateSpams(crimesByIDAttempts, methods) {
            if (!crimesByIDAttempts || !methods) return;
            const now = Math.floor(Date.now() / 1000);
            for (const [id, count] of Object.entries(crimesByIDAttempts)) {
                const type = this.SPAM_ID_MAP[id];
                const method = methods.find(x => String(x.crimeID) === id);
                if (!type || !method) continue;
                const stored = this.data.spams[id];
                if (stored) {
                    if (count !== stored.count) { stored.count = count; stored.accurate = now - stored.ts < 3600; stored.since = now; }
                    stored.ts = now; stored.depreciation = method.depreciation;
                } else {
                    this.data.spams[id] = { count, accurate: false, since: null, ts: now, depreciation: method.depreciation };
                }
            }
        }
        _solve(target) {
            if (!target.bar) return;
            this.lastSolutions[target.id] = target.solution;
            let solver = this.solvers[target.id];
            if (!solver || solver.algo !== target.algos?.[0] || target.suspicion > 0) {
                if (!target.algos) {
                    target.algos = ['exp'];
                    if (this._isDecepticonFeasible(target)) target.algos.push('merit');
                    if (this._isGriftHorseFeasible(target)) target.algos.push('meritGrift');
                    const di = target.algos.indexOf(this.data.defaultAlgo);
                    if (di > 0) target.algos = [...target.algos.slice(di), ...target.algos.slice(0, di)];
                }
                solver = new ScammingSolver(target.algos[0], target.bar, target.level, target.round, target.suspicion, target.mark);
                this.solvers[target.id] = solver;
            }
            target.solution = solver.solve(target.round, target.pip, BigInt(target.resolvingBitmap), target.multiplierUsed, target.driftBitmap);
        }
        _estimateRound(target) {
            return Math.max(0, (target.turns ?? 0) - (target.temptationAttempt ?? 0) - (target.sensitivityAttempt ?? 0) + (target.hesitationAttempt ?? 0));
        }
        _isDecepticonFeasible(target) {
            const cells = new Set(target.bar);
            return cells.has('temptation') && cells.has('sensitivity') && cells.has('hesitation') && cells.has('concern');
        }
        _isGriftHorseFeasible(target) { return target.mark === 'affluent'; }
    }

    // ── ScammingObserver ──────────────────────────────────────────────────────
    // Vanilla JS only — Torn's React crimes page does not expose jQuery globally.
    class ScammingObserver {
        constructor() {
            this.store = new ScammingStore();
            this.crimeOptions = null; this.farmIcons = null;
            this.spamOptions = null; this.virtualLists = null;
            this.observer = new MutationObserver((mutations) => {
                const isAdd = mutations.some(m => [...m.addedNodes].some(n => n instanceof HTMLElement));
                if (!isAdd) return;
                for (const el of this.crimeOptions) {
                    if (!el.classList.contains('cm-sc-seen')) { el.classList.add('cm-sc-seen'); this._refreshCrimeOption(el); }
                }
                for (const el of this.farmIcons) {
                    if (!el.classList.contains('cm-sc-seen')) { el.classList.add('cm-sc-seen'); this._refreshFarm(el); }
                }
                for (const el of this.spamOptions) {
                    if (!el.classList.contains('cm-sc-seen')) { el.classList.add('cm-sc-seen'); this._refreshSpam(el); }
                }
                for (const el of this.virtualLists) {
                    if (!el.classList.contains('cm-sc-seen')) { el.classList.add('cm-sc-seen'); this._refreshSettings(el); }
                }
            });
        }
        start() {
            if (this.crimeOptions) return;
            this.crimeOptions = document.body.getElementsByClassName('crime-option');
            this.farmIcons = document.body.getElementsByClassName('scraperPhisher___lS7va');
            this.spamOptions = document.body.getElementsByClassName('optionWithLevelRequirement___CojuV');
            this.virtualLists = document.body.getElementsByClassName('virtualList___noLef');
            const root = document.querySelector('.scamming-root') ?? document.body;
            this.observer.observe(root, { subtree: true, childList: true });
        }
        stop() { this.crimeOptions = null; this.observer.disconnect(); }
        onNewData() {
            this.start();
            for (const el of this.crimeOptions) this._refreshCrimeOption(el);
            for (const el of this.farmIcons) this._refreshFarm(el);
            for (const el of this.spamOptions) this._refreshSpam(el);
            for (const el of this.virtualLists) {
                if (!el.classList.contains('cm-sc-seen')) { el.classList.add('cm-sc-seen'); this._refreshSettings(el); }
            }
        }
        refreshAll() {
            for (const el of this.crimeOptions) { el.classList.remove('cm-sc-seen'); this._refreshCrimeOption(el); }
        }

        // Create a DOM element from an HTML string
        _mkEl(html) {
            const t = document.createElement('template');
            t.innerHTML = html.trim();
            return t.content.firstElementChild;
        }

        _buildHintEl(target, solution, lastSolution, showGriftNotice) {
            const actionText = { strong: 'Fast Fwd', soft: 'Soft Fwd', back: 'Back', capitalize: '$$$', abandon: 'Abandon', resolve: 'Resolve' }[solution.action] ?? 'N/A';
            const algo = target.algos?.[0];
            const algoText = { exp: 'Exp', merit: 'Decep', meritGrift: 'Grift' }[algo] ?? 'Score';
            const score = Math.floor(solution.value * 100);
            const scoreText = `${score}${algo === 'meritGrift' ? '%' : ''}`;
            const scoreColor = algo === 'meritGrift'
                ? (score < 30 ? 't-red' : score < 60 ? 't-yellow' : 't-green')
                : (score < 30 ? 't-red' : score < 100 ? 't-yellow' : 't-green');
            const scoreDiff = lastSolution ? score - Math.floor(lastSolution.value * 100) : 0;
            const scoreDiffColor = scoreDiff > 0 ? 't-green' : 't-red';
            const scoreDiffText = scoreDiff !== 0 ? `(${scoreDiff > 0 ? '+' : ''}${scoreDiff})` : '';
            let rspText = solution.multi > target.multiplierUsed ? 'Accel' : actionText;
            let rspColor = '';
            let fullRspText = solution.multi > 0 ? `(${target.multiplierUsed}/${solution.multi} + ${actionText})` : '';
            if (target.unsynced) { rspText = 'Unsynced'; rspColor = 't-gray-c'; fullRspText = fullRspText || `(${actionText})`; }

            const w = document.createElement('span');
            w.className = 'cm-sc-info cm-sc-hint cm-sc-hint-content';
            if (showGriftNotice) {
                w.innerHTML = `<span><span class="cm-sc-algo">${algoText}</span></span><span class="cm-sc-notice t-blue">Click to read about this strategy</span>`;
                w.querySelector('.cm-sc-notice').addEventListener('click', () => {
                    const msg = 'Warning: The "Grift Horse" strategy is highly aggressive and does NOT avoid critical failures.\n\nClick OK to proceed, or Cancel to choose a safer alternative.';
                    if (confirm(msg)) { this.store.setAlgoNoticeRead(algo); location.reload(); }
                });
            } else {
                w.innerHTML = `<span><span class="cm-sc-algo">${algoText}</span>: <span class="${scoreColor}">${scoreText}</span><span class="${scoreDiffColor}">${scoreDiffText}</span></span><span class="cm-sc-hint-action"><span class="${rspColor}">${rspText}</span> <span class="t-gray-c">${fullRspText}</span></span>`;
            }
            const lvBtn = document.createElement('span');
            lvBtn.className = 'cm-sc-hint-button t-blue';
            lvBtn.textContent = `Lv${target.level}`;
            w.appendChild(lvBtn);
            return w;
        }

        _refreshCrimeOption(element) { this._refreshTarget(element); this._refreshFarmButton(element); }

        _refreshTarget(element) {
            const emailEl = element.querySelector('span.email___ga8BY');
            if (!emailEl) return;
            const email = emailEl.textContent;
            const target = Object.values(this.store.data.targets).find(x => x.email === email);
            if (!target) return;

            const wrapper = emailEl.parentElement;
            const hasHint = !!wrapper.querySelector('.cm-sc-hint-content');

            // Remove stale info nodes
            wrapper.querySelectorAll('.cm-sc-info').forEach(e => e.remove());
            wrapper.classList.add('cm-sc-info-wrapper');
            Array.from(wrapper.children).forEach(c => c.classList.add('cm-sc-orig-info'));

            const solution = target.solution;
            if (solution) {
                if (!hasHint) wrapper.classList.remove('cm-sc-hint-hidden');
                const algo = target.algos?.[0];
                const showGriftNotice = algo === 'meritGrift' && !this.store.data.algoNotice[algo];
                const actionAttr = showGriftNotice ? '' : solution.multi > target.multiplierUsed ? 'accelerate' : solution.action;
                element.setAttribute('data-cm-action', actionAttr);
                element.classList.toggle('cm-sc-unsynced', !showGriftNotice && (target.unsynced ?? false));

                const hintEl = this._buildHintEl(target, solution, this.store.lastSolutions[target.id], showGriftNotice);
                wrapper.appendChild(hintEl);

                const hintBtn = document.createElement('span');
                hintBtn.className = 'cm-sc-info cm-sc-orig-info cm-sc-hint-button t-blue';
                hintBtn.textContent = 'Hint';
                wrapper.appendChild(hintBtn);

                wrapper.querySelectorAll('.cm-sc-hint-button').forEach(btn => {
                    btn.addEventListener('click', () => wrapper.classList.toggle('cm-sc-hint-hidden'));
                });

                if (target.algos?.length > 1) {
                    const algoEl = wrapper.querySelector('.cm-sc-algo');
                    if (algoEl) {
                        algoEl.classList.add('t-blue', 'cm-sc-active');
                        algoEl.addEventListener('click', () => { this.store.changeAlgo(target); this._refreshTarget(element); });
                    }
                }
            } else {
                wrapper.classList.add('cm-sc-hint-hidden');
            }

            const now = Math.floor(Date.now() / 1000);
            const lifetime = formatLifetime(target.expire - now);
            const ltEl = document.createElement('span');
            ltEl.className = `cm-sc-info ${lifetime.color}`;
            ltEl.textContent = lifetime.text;
            emailEl.before(ltEl);

            const cells = element.querySelectorAll('.cell___ZwSaW');
            if (cells.length >= 50) {
                cells.forEach(c => c.querySelectorAll('.cm-sc-scale').forEach(e => e.remove()));
                for (let i = 0; i < 50; i++) {
                    const dist = i - target.pip;
                    const label = dist % 5 !== 0 || dist === 0 || dist < -5 ? '' : dist % 10 === 0 ? (dist / 10).toString() : "'";
                    let scaleEl = cells[i].querySelector('.cm-sc-scale');
                    if (!scaleEl) { scaleEl = document.createElement('div'); scaleEl.className = 'cm-sc-scale'; cells[i].appendChild(scaleEl); }
                    scaleEl.textContent = label;
                }
            }

            const accBtn = element.querySelectorAll('.response-type-button')[3];
            if (accBtn) {
                accBtn.querySelectorAll('.cm-sc-multiplier').forEach(e => e.remove());
                if (target.multiplierUsed > 0) {
                    const mEl = document.createElement('div');
                    mEl.className = 'cm-sc-multiplier';
                    mEl.textContent = target.multiplierUsed;
                    accBtn.appendChild(mEl);
                }
            }
        }

        _refreshFarmButton(element) {
            if (!element.querySelector('.emailAddresses___ky_qG')) return;
            const btn = element.querySelector('.commitButtonSection___wJfnI button');
            if (btn) btn.classList.toggle('cm-sc-low-cash', this.store.cash < 10000);
        }

        _refreshFarm(element) {
            const label = element.getAttribute('aria-label') ?? '';
            const farm = Object.entries(this.store.data.farms).find(([type]) => label.toLowerCase().includes(type))?.[1];
            if (!farm) return;
            const now = Math.floor(Date.now() / 1000);
            const lt = formatLifetime(farm.expire - now);
            element.querySelectorAll('.cm-sc-farm-lifetime').forEach(e => e.remove());
            const ltEl = document.createElement('div');
            ltEl.className = `cm-sc-farm-lifetime ${lt.color}`;
            ltEl.textContent = lt.text;
            element.appendChild(ltEl);
        }

        _refreshSpam(element) {
            if (!element.closest('.dropdownList')) return;
            let label = '';
            element.childNodes.forEach(n => { if (n.nodeType === Node.TEXT_NODE) label += n.textContent; });
            const spam = Object.entries(this.store.data.spams).find(([id]) => label.toLowerCase().includes(this.store.SPAM_ID_MAP[id]))?.[1];
            element.classList.add('cm-sc-spam-option');
            element.querySelectorAll('.cm-sc-spam-elapsed').forEach(e => e.remove());
            if (!spam || !spam.since || spam.depreciation) return;
            const now = Math.floor(Date.now() / 1000);
            const elapsed = formatLifetime(now - spam.since);
            if (!spam.accurate) elapsed.text = '> ' + elapsed.text;
            if (elapsed.hours >= 24 * 8) elapsed.text = '> 7d';
            if (elapsed.hours >= 24 && elapsed.hours < 72) elapsed.color = 't-green';
            const elEl = document.createElement('div');
            elEl.className = `cm-sc-spam-elapsed ${elapsed.color}`;
            elEl.textContent = elapsed.text;
            element.appendChild(elEl);
        }

        _refreshSettings(element) {
            const store = this.store;
            const self = this;
            const defaultAlgo = store.data.defaultAlgo;
            const settingsEl = document.createElement('div');
            settingsEl.className = 'cm-sc-settings';
            settingsEl.innerHTML = `
                <span>Default Strategy:</span>
                <span class="cm-sc-algo-option t-blue" data-cm-value="exp">Exp</span>
                <span class="cm-sc-algo-option t-blue" data-cm-value="merit">Decepticon</span>
                <span class="cm-sc-algo-option t-blue" data-cm-value="meritGrift">Grift Horse</span>
            `;
            const activeOpt = settingsEl.querySelector(`[data-cm-value="${defaultAlgo}"]`);
            if (activeOpt) activeOpt.classList.add('cm-sc-active');
            settingsEl.querySelectorAll('.cm-sc-algo-option').forEach(opt => {
                opt.addEventListener('click', function () {
                    store.setDefaultAlgo(this.getAttribute('data-cm-value'), self);
                    settingsEl.querySelectorAll('.cm-sc-algo-option').forEach(o => o.classList.remove('cm-sc-active'));
                    this.classList.add('cm-sc-active');
                });
            });
            element.before(settingsEl);
        }
    }

    const scammingObserver = new ScammingObserver();

    // ── Fetch interception ────────────────────────────────────────────────────
    let fetchIntercepted = false;
    function interceptFetch() {
        if (fetchIntercepted) return;
        fetchIntercepted = true;
        const origFetch = window.fetch;
        window.fetch = async (...args) => {
            const rsp = await origFetch(...args);
            try {
                const url = new URL(args[0], location.origin);
                const params = new URLSearchParams(url.search);
                const crimeType = params.get('typeID') ?? args[1]?.body?.get?.('typeID');
                if (url.pathname === '/page.php' && params.get('sid') === 'crimesData' && crimeType) {
                    const data = await rsp.clone().json();
                    if (crimeType === '12') {
                        scammingObserver.store.update(data);
                        scammingObserver.onNewData();
                    }
                }
            } catch { /* ignore */ }
            return rsp;
        };
        console.log('[Scamming] fetch intercepted');
    }

    // ── CSS ───────────────────────────────────────────────────────────────────
    function renderStyle() {
        addStyle(`
            .cm-sc-info { transform: translateY(1px); }
            .cm-sc-notice, .cm-sc-hint-button { cursor: pointer; }
            .cm-sc-info-wrapper.cm-sc-hint-hidden > .cm-sc-hint,
            .cm-sc-info-wrapper:not(.cm-sc-hint-hidden) > .cm-sc-orig-info { display: none; }
            .cm-sc-hint-content { display:flex;justify-content:space-between;flex-grow:1;gap:5px;white-space:nowrap;overflow:hidden; }
            .cm-sc-notice, .cm-sc-hint-action { flex-shrink:1;overflow:hidden;text-overflow:ellipsis; }
            .cm-sc-seen[data-cm-action=strong] .response-type-button:nth-child(1):after,
            .cm-sc-seen[data-cm-action=soft] .response-type-button:nth-child(2):after,
            .cm-sc-seen[data-cm-action=back] .response-type-button:nth-child(3):after,
            .cm-sc-seen[data-cm-action=accelerate] .response-type-button:nth-child(4):after,
            .cm-sc-seen[data-cm-action=capitalize] .response-type-button:nth-child(5):after {
                content:'\u2713';color:var(--crimes-green-color);position:absolute;top:0;right:0;font-size:12px;font-weight:bolder;line-height:1;z-index:999;
            }
            .cm-sc-seen.cm-sc-unsynced[data-cm-action=strong] .response-type-button:nth-child(1):after,
            .cm-sc-seen.cm-sc-unsynced[data-cm-action=soft] .response-type-button:nth-child(2):after,
            .cm-sc-seen.cm-sc-unsynced[data-cm-action=back] .response-type-button:nth-child(3):after,
            .cm-sc-seen.cm-sc-unsynced[data-cm-action=accelerate] .response-type-button:nth-child(4):after,
            .cm-sc-seen.cm-sc-unsynced[data-cm-action=capitalize] .response-type-button:nth-child(5):after { content:'?'; }
            .cm-sc-seen[data-cm-action=abandon] .response-type-button:after {
                content:'\u2715';color:var(--crimes-stats-criticalFails-color);position:absolute;top:0;right:0;font-size:12px;font-weight:bolder;line-height:1;z-index:999;
            }
            .cm-sc-scale { position:absolute;top:0;left:0;width:100%;height:calc(100% + 10px);line-height:1;font-size:8px;display:flex;align-items:flex-end;justify-content:center; }
            .cm-sc-multiplier { position:absolute;bottom:0;right:0;color:var(--crimes-baseText-color);text-align:right;font-size:10px;line-height:1; }
            .cm-sc-farm-lifetime { padding-top:2px;text-align:center; }
            .cm-sc-spam-option .levelLabel___LNbg8, .cm-sc-spam-option .separator___C2skk { display:none; }
            .cm-sc-spam-elapsed { position:absolute;right:-5px; }
            .cm-sc-settings { height:40px;width:100%;background:var(--default-bg-panel-color);border-bottom:1px solid var(--crimes-crimeOption-borderBottomColor);padding-left:10px;box-sizing:border-box;display:flex;align-items:center;gap:20px; }
            .cm-sc-algo-option { cursor:pointer;line-height:1.5;border-top:2px solid #0000;border-bottom:2px solid #0000; }
            .cm-sc-algo-option.cm-sc-active { border-bottom-color:var(--default-blue-color); }
            .cm-sc-algo.cm-sc-active { cursor:pointer; }
            .cm-sc-algo.cm-sc-active:before { content:'\u21bb '; }
            .cm-sc-low-cash:after { content:'Low Cash';color:var(--default-red-color);position:absolute;width:100%;left:0;top:calc(100% - 4px);line-height:1;font-size:12px; }
        `);
    }

    // ── Settings check (MAIN world — use chrome.storage.local directly) ───────
    function isEnabledInSettings() {
        return new Promise(resolve => {
            try {
                chrome.storage.local.get('sidekick_settings', result => {
                    const entry = result?.sidekick_settings?.[STORAGE_KEY];
                    // Default to ENABLED when key is absent (no toggle saved yet)
                    resolve(entry === undefined ? true : entry.isEnabled === true);
                });
            } catch {
                // chrome.storage not accessible — default to enabled
                resolve(true);
            }
        });
    }

    // ── Self-initialization ──────────────────────────────────────────────────
    let started = false;
    async function tryStart() {
        if (!isScammingPage()) return;
        if (started) return;
        const enabled = await isEnabledInSettings();
        if (!enabled) { console.log('[Scamming] Disabled in settings'); return; }

        renderStyle();
        started = true;
        console.log('[Scamming] Module active');

        // Inject badge — retry until the React header renders
        const badgeInterval = setInterval(() => {
            if (!isScammingPage()) { clearInterval(badgeInterval); removeHeaderBadge(); return; }
            injectHeaderBadge();
            if (document.getElementById(BADGE_ID)) clearInterval(badgeInterval);
        }, 200);
    }

    // Intercept fetch immediately so we never miss the first crimes data request.
    interceptFetch();

    // URL polling — Torn uses history.pushState (not hashchange) for SPA navigation.
    let lastUrl = window.location.href;
    setInterval(() => {
        const current = window.location.href;
        if (current === lastUrl) return;
        lastUrl = current;
        if (isScammingPage()) {
            started = false;
            tryStart();
        } else {
            // Left scamming page — allow re-init on next visit
            started = false;
            removeHeaderBadge();
        }
    }, 300);

    // Run on initial load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryStart);
    } else {
        tryStart();
    }

    console.log('[Scamming] Script registered (MAIN world)');
})();