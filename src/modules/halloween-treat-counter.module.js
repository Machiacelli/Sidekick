/**
 * Sidekick Chrome Extension - Halloween Treat Counter Module
 *
 * Shows the Halloween basket treat balance and the event total as a small
 * floating pill on Torn's attack page.
 *
 * Data sources (read-only, via the background proxyFetch so the key is never
 * exposed in a page-visible URL):
 *   - GET /v2/user/competition            -> active event, basket name, treats collected total
 *   - GET /v2/user/log?log=2536,2540,2535 -> basket balance ledger
 *       2536 = treats gained, 2540 = treats spent on an upgrade,
 *       2535 = treats exchanged (empties the basket)
 *
 * Balance rule (same as the classic community scripts): sum of gains since the
 * most recent exchange, minus upgrade costs after it. The counter is kept in
 * chrome.storage with an `asof` timestamp cursor plus a recent-row-id window,
 * so refreshes only fetch new log rows.
 *
 * Torn's Oct 2026 scripting rules: no background polling. Refreshes are
 * event-driven (attack page load, attack finish via the MAIN-world
 * `sidekick:attack-result` relay, or a manual click) and every fetch requires
 * the tab to be focused and visible.
 */

(function () {
    "use strict";

    const STORAGE_KEY = "sidekick_halloween_treats";
    const CACHE_KEY = "sidekick_halloween_treats_cache";
    const PILL_ID = "sidekick-halloween-treat-counter";
    const STYLE_ID = "sidekick-halloween-treat-counter-style";
    const ATTACK_RESULT_EVENT = "sidekick:attack-result";

    const LOG_IDS = "2536,2540,2535";
    const LOG_PAGE_SIZE = 100;
    const MAX_LOG_PAGES = 15;
    const FULL_SYNC_MAX_PAGES = 40;
    const MIN_FETCH_INTERVAL_MS = 30 * 1000;
    const POST_ATTACK_REFRESH_MS = 32 * 1000;
    const RATE_LIMIT_BACKOFF_MS = 60 * 1000;
    const RECENT_ID_LIMIT = 500;
    const DIALOG_SCAN_MAX_TRIES = 12;
    const DIALOG_SCAN_INTERVAL_MS = 750;

    const DEFAULT_CACHE = {
        balance: null,
        total: null,
        basketName: "",
        eventActive: null,
        asof: 0,
        recentIds: [],
        lastFetch: 0,
        lastError: ""
    };

    const HalloweenTreatCounterModule = {
        isInitialized: false,
        isEnabled: false,
        cache: structuredClone(DEFAULT_CACHE),

        _hrefTimer: null,
        _lastHref: "",
        _observer: null,
        _updateTimer: null,
        _inFlight: null,
        _postAttackTimer: null,
        _dialogScanTimer: null,
        _dialogScanTries: 0,
        _pendingGain: 0,
        _backoffUntil: 0,
        _attackResultListener: null,
        _loggedResultShape: false,

        async init() {
            if (this.isInitialized) return;

            console.log("🎃 Initializing Halloween Treat Counter...");

            try {
                await this.waitForCore();
                await this.loadSettings();
                await this.loadCache();

                chrome.storage.onChanged.addListener((changes, area) => {
                    if (area !== "local" || !changes[STORAGE_KEY]) return;
                    this.loadSettings().then(() => {
                        if (this.isEnabled) this.enable();
                        else this.disable();
                    });
                });

                if (this.isEnabled) this.enable();

                this.isInitialized = true;

                console.log("✅ Halloween Treat Counter initialized");
            } catch (error) {
                console.error("❌ Halloween Treat Counter failed to initialize:", error);
            }
        },

        waitForCore() {
            return new Promise(resolve => {
                const check = () => {
                    if (window.SidekickModules?.Core?.ChromeStorage) {
                        resolve();
                    } else {
                        setTimeout(check, 100);
                    }
                };

                check();
            });
        },

        async loadSettings() {
            const saved = await window.SidekickModules.Core.ChromeStorage.get(STORAGE_KEY);
            this.isEnabled = typeof saved?.isEnabled === "boolean" ? saved.isEnabled : false;
        },

        async loadCache() {
            const saved = await window.SidekickModules.Core.ChromeStorage.get(CACHE_KEY);
            this.cache = {
                ...structuredClone(DEFAULT_CACHE),
                ...(saved || {})
            };
        },

        async saveCache() {
            await window.SidekickModules.Core.ChromeStorage.set(CACHE_KEY, this.cache);
        },

        enable() {
            this.isEnabled = true;
            this.startMonitoring();
            console.log("✅ Halloween Treat Counter enabled");
        },

        disable() {
            this.isEnabled = false;
            this.stopMonitoring();
            console.log("🛑 Halloween Treat Counter disabled");
        },

        startMonitoring() {
            this.stopMonitoring();

            this._attackResultListener = event => this.handleAttackResult(event.detail);
            document.addEventListener(ATTACK_RESULT_EVENT, this._attackResultListener);

            // Torn's React attack page re-renders the header mid-fight; the
            // pill lives inside that tree, so watch for wipes and re-attach.
            this._observer = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    if (!this.isOwnMutation(mutation)) {
                        this.requestUpdate();
                        break;
                    }
                }
            });
            this._observer.observe(document.body, { childList: true, subtree: true });

            this._lastHref = location.href;
            this._hrefTimer = setInterval(() => {
                if (location.href === this._lastHref) return;
                this._lastHref = location.href;
                this.update();
            }, 500);

            this.update();
        },

        stopMonitoring() {
            if (this._attackResultListener) {
                document.removeEventListener(ATTACK_RESULT_EVENT, this._attackResultListener);
                this._attackResultListener = null;
            }
            if (this._observer) {
                this._observer.disconnect();
                this._observer = null;
            }
            clearTimeout(this._updateTimer);
            this._updateTimer = null;
            clearInterval(this._hrefTimer);
            this._hrefTimer = null;
            clearTimeout(this._postAttackTimer);
            this._postAttackTimer = null;
            clearTimeout(this._dialogScanTimer);
            this._dialogScanTimer = null;
            this._dialogScanTries = 0;
            this._pendingGain = 0;
            this.removePill();
        },

        isAttackPage() {
            const path = location.pathname.toLowerCase();
            const sid = (new URLSearchParams(location.search).get("sid") || "").toLowerCase();
            return (path.endsWith("/page.php") || path.endsWith("/loader.php")) && sid === "attack";
        },

        isEventSeason(now = new Date()) {
            const month = now.getUTCMonth();
            const day = now.getUTCDate();
            return (month === 9 && day >= 20) || (month === 10 && day <= 5);
        },

        eventStartTs() {
            return Math.floor(Date.UTC(new Date().getUTCFullYear(), 9, 20) / 1000);
        },

        update() {
            if (!this.isEnabled || !this.isAttackPage() || !this.isEventSeason()) {
                this.removePill();
                return;
            }
            this.renderPill();
            this.maybeRefresh(false);
        },

        requestUpdate() {
            clearTimeout(this._updateTimer);
            this._updateTimer = setTimeout(() => {
                this._updateTimer = null;
                this.update();
            }, 250);
        },

        isOwnMutation(mutation) {
            const pill = document.getElementById(PILL_ID);
            if (!pill) return false;
            const target = mutation.target;
            const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
            return !!element && (element === pill || pill.contains(element));
        },

        maybeRefresh(force) {
            if (!this.isEnabled || !this.isAttackPage() || !this.isEventSeason()) return;
            if (!document.hasFocus() || document.visibilityState !== "visible") return;
            if (Date.now() < this._backoffUntil) return;

            const now = Date.now();
            if (!force && this.cache.lastFetch && now - this.cache.lastFetch < MIN_FETCH_INTERVAL_MS) return;

            if (this._inFlight) return this._inFlight;
            this._inFlight = this.refresh().finally(() => {
                this._inFlight = null;
            });
            return this._inFlight;
        },

        async refresh() {
            const apiKey = await window.SidekickModules.Core.ChromeStorage.get("sidekick_api_key");
            if (!apiKey) {
                this.cache.lastError = "NO_KEY";
                this.cache.lastFetch = Date.now();
                await this.saveCache();
                this.renderPill();
                return;
            }

            try {
                const competition = await this.fetchCompetition(apiKey);
                const active = !!(competition && /halloween|trick/i.test(String(competition.name || "")));
                this.cache.eventActive = active;
                if (active) {
                    const total = this.parseCount(
                        competition.treats_collected_total != null
                            ? competition.treats_collected_total
                            : competition.treats_collected
                    );
                    if (total !== null) this.cache.total = total;
                    this.cache.basketName = typeof competition.basket === "string"
                        ? competition.basket
                        : (competition.basket?.name || "");
                }
            } catch (_) {
                // The event total is optional; keep whatever we already cached.
            }

            if (this.cache.eventActive === false) {
                this.cache.lastError = "";
                this.cache.lastFetch = Date.now();
                await this.saveCache();
                this.removePill();
                return;
            }

            try {
                await this.refreshBalance(apiKey);
                this.cache.lastError = "";
                this._pendingGain = 0;
            } catch (error) {
                const code = error?.apiErrorCode;
                if (code === 5) {
                    this._backoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
                    this.cache.lastError = "RATE";
                } else if (code === 16) {
                    this.cache.lastError = "ACCESS";
                } else if (code === 2 || code === 13 || code === 14) {
                    this.cache.lastError = "KEY";
                } else {
                    this.cache.lastError = String(error?.message || "Log request failed").slice(0, 120);
                }
            }

            this.cache.lastFetch = Date.now();
            await this.saveCache();
            this.renderPill();
        },

        async refreshBalance(apiKey) {
            const incremental = this.cache.asof > 0 && this.cache.balance !== null;
            const from = incremental ? Math.max(0, this.cache.asof - 2) : this.eventStartTs();
            let recent = new Set(incremental ? (this.cache.recentIds || []) : []);

            const firstPass = await this.fetchLogRows(apiKey, from, MAX_LOG_PAGES);
            let swept = this.sweepRows(firstPass.rows, recent);
            let balance = incremental && !swept.sawExchange
                ? this.cache.balance + swept.run
                : swept.run;

            if (!firstPass.exhausted && !swept.sawExchange) {
                // More than one page window of unseen rows (e.g. first sync of a
                // heavy attacker): recompute from the event start to stay exact.
                const fullPass = await this.fetchLogRows(apiKey, this.eventStartTs(), FULL_SYNC_MAX_PAGES);
                recent = new Set();
                const fullSwept = this.sweepRows(fullPass.rows, recent);
                if (fullPass.exhausted) {
                    swept = fullSwept;
                    balance = fullSwept.run;
                }
            }

            this.cache.balance = Math.max(0, balance);
            if (swept.maxTs > 0) this.cache.asof = Math.max(this.cache.asof || 0, swept.maxTs + 1);
            this.cache.recentIds = Array.from(recent).slice(-RECENT_ID_LIMIT);
        },

        sweepRows(rows, recentSet) {
            const sorted = [...rows].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            let run = 0;
            let sawExchange = false;
            let maxTs = 0;

            for (const row of sorted) {
                const key = String(row.id ?? "");
                if (key) {
                    if (recentSet.has(key)) continue;
                    recentSet.add(key);
                }

                const logId = row.details?.id ?? row.log;
                const data = row.data || {};

                if (logId === 2535) {
                    run = 0;
                    sawExchange = true;
                } else if (logId === 2536) {
                    const treats = this.parseCount(data.treats);
                    if (treats !== null) run += treats;
                } else if (logId === 2540) {
                    const cost = this.parseCount(data.cost);
                    if (cost !== null) run -= cost;
                }

                if ((row.timestamp || 0) > maxTs) maxTs = row.timestamp || 0;
            }

            return { run, sawExchange, maxTs };
        },

        async fetchLogRows(apiKey, from, maxPages) {
            const rows = [];
            let to = null;

            for (let page = 0; page < maxPages; page++) {
                let url = `https://api.torn.com/v2/user/log?log=${LOG_IDS}&limit=${LOG_PAGE_SIZE}&from=${from}` +
                    `&key=${encodeURIComponent(apiKey)}&comment=SidekickHalloweenTreats`;
                if (to !== null) url += `&to=${to}`;

                const data = await this.fetchJson(url);
                const pageRows = Array.isArray(data.log)
                    ? data.log
                    : Object.values(data.log || {});
                rows.push(...pageRows);

                if (pageRows.length < LOG_PAGE_SIZE) {
                    return { rows, exhausted: true };
                }

                to = (pageRows[pageRows.length - 1].timestamp || 0) - 1;
            }

            return { rows, exhausted: false };
        },

        async fetchCompetition(apiKey) {
            const url = `https://api.torn.com/v2/user/competition?key=${encodeURIComponent(apiKey)}&comment=SidekickHalloweenTreats`;
            const data = await this.fetchJson(url);
            return data.competition || data;
        },

        async fetchJson(url) {
            const response = await this.proxyFetch(url);
            const data = response?.success ? response.data : null;
            if (!data) {
                throw new Error(response?.error || "Torn API request failed");
            }
            if (data.error) {
                const error = new Error(data.error.error || "Torn API error");
                error.apiErrorCode = data.error.code;
                throw error;
            }
            return data;
        },

        proxyFetch(url) {
            return new Promise(resolve => {
                try {
                    chrome.runtime.sendMessage({ action: "proxyFetch", url }, response => {
                        if (chrome.runtime.lastError) {
                            resolve({ success: false, error: chrome.runtime.lastError.message });
                            return;
                        }
                        resolve(response || { success: false, error: "No response from background" });
                    });
                } catch (error) {
                    resolve({ success: false, error: error?.message || "Extension context unavailable" });
                }
            });
        },

        handleAttackResult(detail) {
            if (!this.isEnabled || !this.isAttackPage() || !this.isEventSeason()) return;

            let parsed = null;
            try {
                parsed = JSON.parse(detail);
            } catch (_) {
                return;
            }
            const result = parsed?.result;

            if (!this._loggedResultShape && result) {
                this._loggedResultShape = true;
                console.debug("[HalloweenTreatCounter] Attack result payload:", result);
            }

            const gain = this.findGainInResult(result);
            if (gain !== null) {
                this._pendingGain += gain;
                this.renderPill();
            } else {
                this._dialogScanTries = 0;
                this.scheduleDialogScan();
            }

            // Torn's API service cache holds responses for up to 30 seconds, so
            // the authoritative refresh is scheduled just past that window. The
            // timer resets on every attack, so chains only fetch once per burst.
            clearTimeout(this._postAttackTimer);
            this._postAttackTimer = setTimeout(() => {
                this._postAttackTimer = null;
                this.maybeRefresh(true);
            }, POST_ATTACK_REFRESH_MS);
        },

        findGainInResult(result) {
            if (!result || typeof result !== "object") return null;
            const visit = (obj, depth) => {
                if (!obj || typeof obj !== "object" || depth > 2) return null;
                for (const [key, value] of Object.entries(obj)) {
                    if (/treat/i.test(key)) {
                        const count = this.parseCount(value);
                        if (count !== null && count >= 0) return count;
                    }
                    const nested = visit(value, depth + 1);
                    if (nested !== null) return nested;
                }
                return null;
            };
            return visit(result, 0);
        },

        scheduleDialogScan() {
            clearTimeout(this._dialogScanTimer);
            this._dialogScanTimer = setTimeout(() => {
                this._dialogScanTimer = null;
                const gain = this.scanDialogForGain();
                if (gain !== null) {
                    this._pendingGain += gain;
                    this.renderPill();
                    return;
                }
                this._dialogScanTries++;
                if (this._dialogScanTries < DIALOG_SCAN_MAX_TRIES) {
                    this.scheduleDialogScan();
                }
            }, DIALOG_SCAN_INTERVAL_MS);
        },

        scanDialogForGain() {
            const nodes = document.querySelectorAll('[class*="dialog-title" i], [class*="halloween" i]');
            for (const node of nodes) {
                const text = (node.textContent || "").replace(/\s+/g, " ");
                let match = /\+\s?(\d[\d,]*)\s*treats?/i.exec(text);
                if (match) return this.parseCount(match[1]);
                match = /(?:gained|received|won)\s+(\d[\d,]*)\s+treats?/i.exec(text);
                if (match) return this.parseCount(match[1]);
            }
            return null;
        },

        parseCount(value) {
            if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
            if (typeof value !== "string" && typeof value !== "number") return null;
            const parsed = parseInt(String(value).replace(/[,\s]/g, ""), 10);
            return Number.isFinite(parsed) ? parsed : null;
        },

        renderPill() {
            if (!this.isEnabled || !this.isAttackPage() || !this.isEventSeason() || this.cache.eventActive === false) {
                this.removePill();
                return;
            }

            const pill = this.ensurePill();
            const balanceEl = pill.querySelector(".sk-htc-balance");
            const chipEl = pill.querySelector(".sk-htc-chip");
            const totalEl = pill.querySelector(".sk-htc-total");
            const error = this.cache.lastError || "";

            if (error === "NO_KEY") {
                balanceEl.textContent = "—";
                chipEl.hidden = true;
                totalEl.hidden = true;
                pill.title = "Sidekick Treat Counter\nSet your Sidekick API key in Sidekick settings to count treats.";
                return;
            }

            let displayBalance = this.cache.balance;
            if (displayBalance !== null && this._pendingGain > 0) {
                displayBalance += this._pendingGain;
            }

            balanceEl.textContent = displayBalance !== null
                ? displayBalance.toLocaleString("en-US")
                : (this._inFlight ? "…" : "—");
            chipEl.hidden = !(this._pendingGain > 0);
            chipEl.textContent = this._pendingGain > 0
                ? `+${this._pendingGain.toLocaleString("en-US")}`
                : "";
            totalEl.hidden = this.cache.total === null;
            totalEl.textContent = this.cache.total !== null
                ? `Total ${this.cache.total.toLocaleString("en-US")}`
                : "";

            const lines = ["Sidekick Treat Counter"];
            lines.push(displayBalance !== null
                ? `Basket balance: ${displayBalance.toLocaleString("en-US")}`
                : "Basket balance: unknown");
            if (this.cache.total !== null) lines.push(`Event total: ${this.cache.total.toLocaleString("en-US")}`);
            if (this.cache.basketName) lines.push(`Basket: ${this.cache.basketName}`);
            if (this.cache.lastFetch) lines.push(`Updated: ${this.updatedAgoText(this.cache.lastFetch)}`);
            if (error === "ACCESS") lines.push("API key needs Limited Access to count the basket balance");
            else if (error === "KEY") lines.push("API key issue - check your Sidekick API key");
            else if (error === "RATE") lines.push("Torn API rate limit reached - retrying later");
            else if (error) lines.push(`API: ${error}`);
            lines.push("Click to refresh");
            pill.title = lines.join("\n");
        },

        updatedAgoText(timestampMs) {
            const seconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000));
            if (seconds < 60) return `${seconds}s ago`;
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes}m ago`;
            return `${Math.floor(minutes / 60)}h ago`;
        },

        findHeaderAnchor() {
            return document.querySelector('#attack-root h4[class*="title___"]')
                || document.querySelector("#attack-root h4");
        },

        ensurePill() {
            let pill = document.getElementById(PILL_ID);
            const anchor = this.findHeaderAnchor();

            // Migrate a floating fallback into the header once it renders.
            if (pill && pill.classList.contains("sk-htc-floating") && anchor) {
                this.removePill();
                pill = null;
            }

            if (pill) return pill;

            this.ensureStyle();

            pill = document.createElement("div");
            pill.id = PILL_ID;
            if (!anchor) pill.classList.add("sk-htc-floating");

            const icon = document.createElement("span");
            icon.className = "sk-htc-icon";
            icon.textContent = "🎃";

            const balance = document.createElement("span");
            balance.className = "sk-htc-balance";
            balance.textContent = "…";

            const chip = document.createElement("span");
            chip.className = "sk-htc-chip";
            chip.hidden = true;

            const total = document.createElement("span");
            total.className = "sk-htc-total";
            total.hidden = true;

            pill.append(icon, balance, chip, total);

            pill.addEventListener("click", () => {
                this._pendingGain = 0;
                this.renderPill();
                this.maybeRefresh(true);
            });

            if (anchor) {
                anchor.insertAdjacentElement("afterend", pill);
            } else {
                document.body.appendChild(pill);
            }
            return pill;
        },

        ensureStyle() {
            if (document.getElementById(STYLE_ID)) return;

            const style = document.createElement("style");
            style.id = STYLE_ID;
            style.textContent = `
#sidekick-halloween-treat-counter {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    margin-left: 12px;
    vertical-align: middle;
    background: rgba(24, 20, 16, 0.95);
    border: 1px solid #ff8a1f;
    border-radius: 14px;
    color: #fff;
    font: 600 11px/1.2 "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
    cursor: pointer;
    user-select: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    white-space: nowrap;
}
#sidekick-halloween-treat-counter.sk-htc-floating {
    position: fixed;
    bottom: 16px;
    left: 16px;
    z-index: 10001;
    margin-left: 0;
    padding: 6px 12px;
    font-size: 12px;
}
#sidekick-halloween-treat-counter .sk-htc-icon { font-size: 12px; }
#sidekick-halloween-treat-counter .sk-htc-balance { color: #5fcc6a; font-weight: 700; }
#sidekick-halloween-treat-counter .sk-htc-chip { color: #ff8a1f; font-weight: 700; }
#sidekick-halloween-treat-counter .sk-htc-total { color: #b9b9b9; font-size: 9px; font-weight: 400; }
`;
            document.head.appendChild(style);
        },

        removePill() {
            document.getElementById(PILL_ID)?.remove();
        }
    };

    window.SidekickModules = window.SidekickModules || {};
    window.SidekickModules.HalloweenTreatCounter = HalloweenTreatCounterModule;

    HalloweenTreatCounterModule.init();

})();
