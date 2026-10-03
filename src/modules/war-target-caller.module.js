// FactionOps Target Caller Module
// Thanks to RussianRob for the script and the go ahead to use it in Sidekick!
// A full two-way participant in the FactionOps war room (tornwar.com):
//   - Claims made here are POSTed to the server and appear for every
//     FactionOps / Sidekick user in the same war.
//   - Claims made by FactionOps users show up here within one poll tick (~5s).
//
// Transport: the background service worker's `proxyFetch` action (this
// codebase's established cross-origin pattern). Service-worker fetches are
// exempt from the page's CSP, and `https://tornwar.com/*` lives in the
// manifest host_permissions, so no Cloudflare Worker hop is needed.
//
// The auth JWT is held in module memory only — re-authenticated lazily per
// page load and replayed on 401s (same pattern as the FactionOps userscript's
// postAction/getAction helpers). The server is the single source of truth
// for claims; nothing claim-related is persisted locally anymore. The old
// module's sidekick_wtc_data storage key is retired on init.
//
// One server, one contract (verified against the FactionOps reference
// client, factionops.js v5.4.2):
//   POST /api/auth  { apiKey, scriptVersion }  -> { token, player: {...} }
//   GET  /api/poll?warId=war_<myFactionId>      -> { calls: {targetId: {calledBy, calledAt, isDeal}}, ... }
//   POST /api/call  { warId, targetId, targetName [, isDeal | action:'uncall'] }
const WarTargetCallerModule = {
    isEnabled: false,
    STORAGE_KEY: 'sidekick_war_target_caller',
    LEGACY_DATA_KEY: 'sidekick_wtc_data', // old module's local-only claims — removed on init

    SERVER_URL: 'https://tornwar.com',
    POLL_INTERVAL_MS: 5000,
    AUTH_RETRY_INTERVAL_MS: 60000,
    REQUEST_TIMEOUT_MS: 12000,
    CLIENT_NAME: 'sidekick',

    // ── Claim time limits (policy: every call maxes out at 20 min) ────
    CALL_MAX_MS: 20 * 60 * 1000,       // a claim older than this is dead
    CALL_MIN_HOSPITAL_MS: 20 * 60 * 1000, // hospitalized > 20 min remaining can't be called
    sweepTimer: null,                    // local expiry sweep (see startExpirySweep)

    // ── Faction gate ─────────────────────────────────────────────────
    // Only members of this faction may use the tornwar.com war room. Everyone
    // else falls back to "copy mode": the ✔️ button still appears on enemy
    // rows, but clicking it ONLY copies the claim message to the clipboard —
    // no server auth, no polling, no shared claim state.
    REQUIRED_FACTION_NAME: 'Dead Fragment',
    factionCheckDone: false,   // result cached for the page session
    isDeadFragment: false,     // false until proven true — fail CLOSED to copy mode
    factionCheckPromise: null,  // single-flight guard so enable()/re-enables share one lookup


    auth: null, // { token, playerId, playerName, factionId } — memory only, per page load
    calls: {},  // authoritative server state: targetId -> { calledBy:{id,name}, calledAt, isDeal }
    rowNameById: new Map(), // targetId -> display name scraped from the war panel rows
    colorCache: new Map(),  // caller name (lowercased) -> stable HSL colour
    flashTid: null, // targetId currently showing the "Copied to clipboard" confirmation
    flashUntil: 0,   // epoch ms — renderers must not overwrite that row before this

    pollTimer: null,
    pollBusy: false,
    pollFailedCount: 0,
    authWarned: false,
    authRetryMode: false, // true while the server's version gate (426) rejects auth — slowed polling
    membersObserver: null,

    async init() {
        console.log('🎯 FactionOps Target Caller initializing...');

        await this.loadSettings();

        // The server is now the authority for claims; the old module's
        // locally-persisted claim data (`sidekick_wtc_data`) is stale and
        // must never be resurrected. Same retirement pattern background.js
        // uses for `sidekick_secondary_api_key`.
        try {
            await window.SidekickModules.Core.ChromeStorage.remove(this.LEGACY_DATA_KEY);
        } catch (_) { /* non-fatal */ }

        if (this.isEnabled) {
            this.enable();
        }

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[this.STORAGE_KEY]) {
                this.loadSettings().then(() => {
                    if (this.isEnabled) this.enable();
                    else this.disable();
                });
            }
        });

        // Auto-release after a successful attack. The MAIN-world injector
        // (war-target-caller-inject.js, attack pages only) patches fetch/XHR
        // and relays Torn's own attack-resolution JSON via a CustomEvent with
        // a STRINGIFIED detail (repo rule #4 — non-primitive details are
        // stripped crossing worlds). Registered here so it works on ALL
        // pages, not just factions.php: claims are only ever made there, but
        // the attack happens on loader.php?sid=attack, a different page load.
        document.addEventListener('sidekick:attack-result', (e) => {
            this.handleAttackResult(e.detail);
        });

        console.log('🎯 FactionOps Target Caller initialized');
    },

    async loadSettings() {
        try {
            const settings = await window.SidekickModules.Core.ChromeStorage.get(this.STORAGE_KEY) || {};
            this.isEnabled = settings.isEnabled === true;
        } catch (error) {
            console.error('🎯 Failed to load settings:', error);
        }
    },

    async enable() {
        this.isEnabled = true;
        this.injectStyles();

        if (window.location.href.includes('factions.php')) {
            // Faction gate runs BEFORE any tornwar.com traffic. Non-members
            // (and anyone whose faction can't be determined) get the local
            // copy-to-clipboard mode instead of the shared war room.
            await this.ensureFactionChecked();
            this.startMembersObserver();
            if (this.isDeadFragment) {
                this.startPolling();
                this.startExpirySweep();
            } else {
                console.log('🎯 FactionOps Target Caller: not in ' + this.REQUIRED_FACTION_NAME + ' — copy-paste mode (claims are copied to your clipboard only, not shared)');
            }
        }
    },

    /**
     * Resolve (once per page load) whether the user is in the required
     * faction, via the user's own Torn API key through the background
     * fetchTornApi proxy. Fail-closed: any error, missing key, or a
     * factionless profile yields copy mode — we must never send a
     * non-member's claims to the FactionOps server.
     */
    async ensureFactionChecked() {
        if (this.factionCheckDone) return this.isDeadFragment;
        if (this.factionCheckPromise) return this.factionCheckPromise;

        this.factionCheckPromise = (async () => {
            const Core = window.SidekickModules.Core;
            let factionName = null;
            try {
                const apiKey = await Core.ChromeStorage.get(Core.STORAGE_KEYS.API_KEY);
                if (apiKey) {
                    const res = await Core.SafeMessageSender.sendToBackground({
                        action: 'fetchTornApi',
                        apiKey,
                        selections: ['profile'],
                    });
                    if (res?.success) {
                        factionName = res.profile?.faction?.faction_name || null;
                    }
                }
            } catch (error) {
                console.warn('🎯 FactionOps Target Caller: faction check failed — defaulting to copy-paste mode:', error?.message || error);
            }

            this.isDeadFragment = !!factionName &&
                String(factionName).trim().toLowerCase() === this.REQUIRED_FACTION_NAME.toLowerCase();
            this.factionCheckDone = true;
            return this.isDeadFragment;
        })();

        return this.factionCheckPromise;
    },

    disable() {
        this.isEnabled = false;
        this.stopPolling();
        this.stopExpirySweep();

        if (this.membersObserver) {
            this.membersObserver.disconnect();
            this.membersObserver = null;
        }

        this.calls = {};
        this.rowNameById.clear();

        // Remove visuals
        document.querySelectorAll('.sk-wtc-badge, .sk-wtc-btn').forEach(el => el.remove());
        document.querySelectorAll('.sk-wtc-row-anchor').forEach(el => el.classList.remove('sk-wtc-row-anchor'));
    },

    injectStyles() {
        if (document.getElementById('war-target-caller-styles')) return;

        const style = document.createElement('style');
        style.id = 'war-target-caller-styles';
        style.textContent = `
            .sk-wtc-btn {
                background: transparent;
                border: none;
                padding: 0;
                font-size: 12px;
                cursor: pointer;
                margin-right: 3px;
                vertical-align: middle;
                line-height: 1;
            }
            .sk-wtc-btn:hover {
                transform: scale(1.1);
            }
            .sk-wtc-btn:active {
                transform: scale(0.9);
            }
            .sk-wtc-badge {
                /* Overlays EXACTLY the level + score columns (edges measured
                   in JS from those cells); status/attack stay uncovered. The
                   whole overlay is one hit target: dblclick = attack,
                   right-click = release (own claims). Name truncates with an
                   ellipsis — it does not need to fit. */
                position: absolute;
                top: 0;
                right: 0;
                height: 100%;
                z-index: 5;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.3px;
                padding: 0 6px;
                box-sizing: border-box;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                line-height: 1.3;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
            }
            .sk-wtc-badge span.sk-wtc-name {
                overflow: hidden;
                text-overflow: ellipsis;
            }
            /* Rows must establish a positioning context for the badge and
               the claim button — done in JS on the li (addBadgeAnchor).
               overflow:hidden clips the badge's text at the row's own
               bounds so a long caller name can never bleed into the rows
               above or below. */
            .sk-wtc-row-anchor {
                position: relative !important;
                overflow: hidden;
            }
            .sk-wtc-error {
                /* !important — per-caller colours are set inline on the badge,
                   and inline styles would otherwise hide the error tint. */
                color: #ff4d4d !important;
                border-color: #ff4d4d !important;
                background: rgba(80, 0, 0, 0.7) !important;
            }
        `;
        document.head.appendChild(style);
    },

    // ------------------------------------------------------------------
    // Server plumbing (all via background `proxyFetch`)
    // ------------------------------------------------------------------

    /** True when this page's copy of the extension API is gone — happens
     *  after Sidekick is reloaded/updated while a Torn tab stays open. The
     *  page keeps running the OLD code and every message to the background
     *  service worker fails with "Extension context invalidated" until the
     *  tab is refreshed. Detectable via chrome.runtime.id vanishing. */
    extensionContextDead() {
        return typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id;
    },

    scriptVersion() {
        // Sent to /api/auth alongside the key — whitelisted server-side by
        // FactionOps so Sidekick traffic can be told apart in his telemetry.
        try {
            return `${this.CLIENT_NAME}-${chrome.runtime.getManifest().version}`;
        } catch (_) {
            return this.CLIENT_NAME;
        }
    },

    async ensureAuth(force = false) {
        if (this.auth && !force) return this.auth;

        const Core = window.SidekickModules.Core;
        const apiKey = await Core.ChromeStorage.get(Core.STORAGE_KEYS.API_KEY);
        if (!apiKey) {
            if (!this.authWarned) {
                this.authWarned = true;
                console.warn('🎯 FactionOps Target Caller: no Torn API key set — cannot authenticate with tornwar.com. Set your key in Sidekick settings.');
            }
            this.stopPolling();
            return null;
        }

        const res = await Core.SafeMessageSender.sendToBackground({
            action: 'proxyFetch',
            url: `${this.SERVER_URL}/api/auth`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey, scriptVersion: this.scriptVersion() }),
            timeout: this.REQUEST_TIMEOUT_MS,
        });

        const body = res?.success ? res.data : null;
        if (!body || body.error) {
            // Surface the SERVER's own error (426 version-gate message, etc.),
            // not just the transport line — that message is what the user
            // needs to read to know what's wrong.
            const detail = (body && body.error) || this.serverErrorDetail(res) || res?.error || 'Auth failed';
            const err = new Error(`Auth failed: ${detail}`);
            err.status = Number(res?.status) || 0;
            throw err;
        }
        if (!body.token) throw new Error('Auth response contained no token');

        const player = body.player || {};
        this.auth = {
            token: body.token,
            playerId: String(player.playerId ?? player.id ?? ''),
            playerName: player.playerName || player.name || 'You',
            factionId: String(player.factionId ?? ''),
        };
        console.log('🎯 FactionOps authenticated as', this.auth.playerName, '(faction ' + this.auth.factionId + ')');
        return this.auth;
    },

    /** FactionOps warId convention: "war_<myFactionId>" (from the auth response). */
    warId() {
        if (!this.auth || !this.auth.factionId || this.auth.factionId === '0') return null;
        return `war_${this.auth.factionId}`;
    },

    /**
 * Authenticated request to the FactionOps server.
 *
 * `text: true` requests (call/uncall) are sent with proxyFetch's
 * responseType:'text' mode: the server may answer calls with an EMPTY body,
 * which the reference client accepts (any 2xx resolves) but proxyFetch's
 * default JSON-parse would misreport as a failure. Text mode skips the parse,
 * so empty 200s succeed and non-2xx still arrive with status + body intact.
 *
 * On 401 (expired/invalid JWT) the token is refreshed once and the request
 * replayed — mirroring the reference client's postAction/getAction pattern.
 */
async serverRequest(path, { method = 'GET', body, text = false } = {}, _retried = false) {
    const Core = window.SidekickModules.Core;
    if (!this.auth) throw new Error('Not authenticated');

    const message = {
        action: 'proxyFetch',
        url: `${this.SERVER_URL}${path}`,
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.auth.token}`,
        },
        timeout: this.REQUEST_TIMEOUT_MS,
    };
    if (body !== undefined) message.body = JSON.stringify(body);
    if (text) message.responseType = 'text';

    const res = await Core.SafeMessageSender.sendToBackground(message);

    if (res?.success) {
        if (text) return null; // any 2xx is success; body not needed
        const data = res.data;
        if (data && typeof data === 'object') return data;
        throw new Error('Malformed server response');
    }

    const status = Number(res?.status) || 0;
    if (status === 401 && !_retried) {
        this.auth = null;
        await this.ensureAuth(true);
        return this.serverRequest(path, { method, body, text }, true);
    }

    const err = new Error(
        this.friendlyStatus(status, this.serverErrorDetail(res) || res?.error || `Request failed (HTTP ${status || 'network'})`)
    );
    err.status = status;
    throw err;
},

/** Best-effort extraction of the server's error message from a failed response body. */
serverErrorDetail(res) {
    if (!res?.responseBody) return null;
    try {
        const body = JSON.parse(res.responseBody);
        return body && body.error ? String(body.error) : null;
    } catch (_) {
        return null;
    }
},

friendlyStatus(status, fallback) {
    switch (status) {
        case 401: return 'Session expired — re-authenticating';
        case 409: return 'Conflict — another player already has this target';
        case 426: return 'Server rejected this client version (HTTP 426) — update Sidekick';
        case 429: return 'Rate limited — slow down';
        }
    },

    startPolling() {
        if (this.pollTimer) return;
        console.log('FactionOps: Starting poll loop');
        const tick = async () => {
            if (this.pollBusy) return; // never overlap polls
            this.pollBusy = true;
            try {
                await this.pollOnce();
            } finally {
                this.pollBusy = false;
            }
        };
        tick(); // immediate first poll (also kicks off auth)
        this.pollTimer = setInterval(tick, this.POLL_INTERVAL_MS);
    },

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
            console.log('FactionOps: Poll loop stopped');
        }
    },

    /** Leave 426 retry mode: restore the normal 5s poll loop. */
    exitAuthRetryMode() {
        if (!this.authRetryMode) return;
        this.authRetryMode = false;
        this.stopPolling();
        this.startPolling();
    },

    async pollOnce() {
        if (!this.auth) {
            try {
                await this.ensureAuth();
            } catch (err) {
                this.notePollFailure(err);
                return;
            }
            // Auth recovered — leave slow-retry mode and resume 5s polling.
            this.exitAuthRetryMode();
            const warId = this.warId();
            if (!warId) {
                // No API key (stopPolling already ran in ensureAuth) or no faction.
                console.log('FactionOps Target Caller idle — no API key or not in a faction');
                this.stopPolling();
                return;
            }
        }

        const warId = this.warId();
        if (!warId) return;

        try {
            const data = await this.serverRequest(`/api/poll?warId=${encodeURIComponent(warId)}`);
            this.pollFailedCount = 0;
            this.handlePollData(data);
        } catch (err) {
            this.notePollFailure(err);
        }
    },

    notePollFailure(err) {
        this.pollFailedCount++;
        // Dev/workflow artifact, NOT a server problem: Sidekick was reloaded
        // while this Torn tab stayed open, so this page's copy of the content
        // script no longer has a working bridge to the background service
        // worker. Nothing tornwar-related can work from this tab until it is
        // refreshed — say that once, plainly, instead of logging the raw
        // transport error every 5s tick forever.
        const msg = String(err?.message || err || '');
        if (this.extensionContextDead() || /extension context/i.test(msg)) {
            if (this.pollFailedCount === 1) {
                console.warn('🎯 FactionOps poll stopped: Sidekick was reloaded while this Torn tab was open. Refresh the tab — polling and calling reconnect automatically afterwards.');
            }
            return;
        }
        // Log the first failure, then every 10th — a blip every 5s would
        // flood the console without adding insight.
        if (this.pollFailedCount === 1 || this.pollFailedCount % 10 === 0) {
            console.warn('FactionOps poll failed (x' + this.pollFailedCount + '):', err?.message || err);
        }

        // The server's version gate (426) will reject every client it doesn't
        // know. Continuing to ask every 5s gains nothing — back off to a slow
        // retry cadence until the server accepts our scriptVersion.
        if (err?.status === 426) this.enterAuth_retryMode();
    },

    /** Slow auth retries while the server hard-rejects us (HTTP 426). */
    enterAuth_retryMode() {
        if (this.authRetryMode) return;
        this.authRetryMode = true;
        const interval = this.AUTH_RETRY_INTERVAL_MS;
        this.stopPolling();
        console.warn(`FactionOps server rejected this client (426) — retrying auth every ${interval / 1000}s until it accepts ${this.scriptVersion()}`);
        this.pollTimer = setInterval(() => {
            this.pollOnce().catch(err => {
                // Handled inside pollOnce/notePollFailure; just don't let it escape.
                console.warn('FactionOps slow auth retry failed:', err?.message || err);
            });
        }, interval);
    },

    handlePollData(data) {
        if (!data || typeof data !== 'object') return;
        // Only adopt the claims map when the payload carries it — a missing
        // `calls` field conveys nothing (same guard the FactionOps client
        // uses in applyServerData).
        if (data.calls) {
            this.calls = data.calls;
        }
        this.updateWarPanelVisuals();
    },

    // ------------------------------------------------------------------
    // Rendering (same injection points as the previous module)
    // ------------------------------------------------------------------

    startMembersObserver() {
        if (this.membersObserver) return;

        const updateUI = () => {
            const enemies = document.querySelectorAll('.enemy-faction ul.members-list li, ul.members-list li.enemy');
            enemies.forEach(li => {
                if (!li.classList.contains('clear') && !li.classList.contains('title')) {
                    this.updateMemberRow(li);
                }
            });
        };

        this.membersObserver = new MutationObserver(() => updateUI());
        this.membersObserver.observe(document.body, { childList: true, subtree: true });

        // Initial run
        setTimeout(updateUI, 500);
    },

    extractTargetId(li) {
        const profileLink = li.querySelector(`a[href^='/profiles.php']`);
        if (!profileLink) return null;
        const idMatch = (profileLink.href || profileLink.getAttribute('href') || '').match(/[IX]D=(\d+)/i);
        return idMatch ? idMatch[1] : null;
    },

    /** The badge is absolutely positioned within the row — mark the li as
     *  the positioning context (Torn's own list styles vary across skins).
     *  Idempotent: safe to call on every updateMemberRow pass. */
    addBadgeAnchor(li) {
        if (!li.classList.contains('sk-wtc-row-anchor')) {
            li.classList.add('sk-wtc-row-anchor');
        }
    },

    /** Local expiry sweep: every 15s, drop the local view of any claim older
     *  than CALL_MAX_MS from this.calls and re-render. The server still says
     *  what it says — we just stop DISPLAYING museum pieces, and our own
     *  expired claims get released on the server via unclaimTarget. Runs
     *  alongside polling so visuals go stale-proof even between polls. */
    startExpirySweep() {
        if (this.sweepTimer) return;
        this.sweepTimer = setInterval(() => this.sweepExpiredCalls(), 15000);
    },

    stopExpirySweep() {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
    },

    sweepExpiredCalls() {
        if (!this.calls || !this.isDeadFragment) return;
        const now = Date.now();
        let changed = false;
        const expirers = [];
        for (const tid of Object.keys(this.calls)) {
            const call = this.calls[tid];
            const at = this.calledAtMs(call);
            if (at && now - at > this.CALL_MAX_MS) {
                const mine = String(call.calledBy?.id ?? '') === String(this.auth?.playerId ?? '');
                delete this.calls[tid];
                changed = true;
                if (mine) expirers.push(tid); // my expired claim — release server-side too
                console.log(`🎯 FactionOps Target Caller: claim on ${tid} expired after 20 min — removed`);
            }
        }
        if (changed) {
            this.updateWarPanelVisuals();
            expirers.forEach(tid => this.unclaimTarget(tid).catch(() => {}));
        }
    },

    /** Hospital gate: calling a target IN hospital is fine — but only if
     *  they are out (or were bailed) within the next 20 min. If War Monitor
     *  shows them hospitalized with MORE than 20 min on the clock, the call
     *  is blocked and the user gets a notification banner. Unknown status
     *  (War Monitor hasn't seen them) never blocks — don't lock the war
     *  room behind a soft dependency. */
    hospitalGate(targetId) {
        const status = window.SidekickModules?.WarMonitor?.memberStatus?.get(String(targetId));
        if (!status) return { blocked: false };
        const outOfBounds = status.state !== 'Hospital' && status.state !== 'Jail';
        if (outOfBounds) return { blocked: false };
        const now = Date.now() / 1000;
        if (status.until && status.until > now) {
            const leftMs = (status.until - now) * 1000;
            if (leftMs > this.CALL_MAX_MS) {
                const mins = Math.floor(((status.until - now) / 60));
                return {
                    blocked: true,
                    reason: `${status.state} for ${mins} more min — targets hospitalized over 20 min can't be called`,
                };
            }
        }
        return { blocked: false };
    },

    /** Notification banner helper — the row tint alone was easy to miss
     *  when a claim was refused; route through Core's toast system when
     *  available (respects the user's sound/duration prefs), console as
     *  fallback so nothing is ever silent. */
    showBanner(title, message, type = 'warning') {
        const ns = window.SidekickModules?.Core?.NotificationSystem;
        if (ns?.show) {
            ns.show(title, message, type, 6000);
        }
        console.warn('🎯 FactionOps Target Caller:', title, '—', message);
    },

    /** Normalise a claim timestamp to epoch MILLISECONDS. The server's
     *  calledAt may arrive as a seconds epoch, an ISO string, or ms — the
     *  20-min expiry math must not misread a fresh claim as ancient (that
     *  is exactly what made the call button "do nothing": every new claim
     *  was treated as already expired and instantly swept away). */
    calledAtMs(call) {
        if (!call || !call.calledAt) return null;
        let t = call.calledAt;
        if (typeof t === 'string') {
            const parsed = Date.parse(t);
            t = Number.isNaN(parsed) ? Number(t) : parsed;
        } else {
            t = Number(t);
        }
        if (!Number.isFinite(t) || t <= 0) return null;
        // Heuristic: a value around 1e9 is SECONDS since epoch; 1e12+ is ms.
        if (t < 1e12) t *= 1000;
        return t;
    },

    extractNameFromRow(li) {
        const nameEl = li.querySelector('.name a') || li.querySelector('.user.name');
        if (nameEl) return nameEl.textContent.trim();

        const profileLink = li.querySelector(`a[href^='/profiles.php']`);
        if (profileLink) {
            const honorText = profileLink.querySelector('.honor-text:not(.honor-text-svg)');
            if (honorText) return honorText.textContent.trim();

            const aria = profileLink.getAttribute('aria-label');
            if (aria) return aria.replace('View profile of ', '').trim();
        }
        return null;
    },

    updateMemberRow(li) {
        const container = li.querySelector('.level') || li.querySelector('.name') || li.querySelector('.user');
        if (!container) return;

        // Server state is ID-keyed — a row without an extractable ID can't
        // participate in cooperative calling.
        const targetId = this.extractTargetId(li);
        if (!targetId) return;

        const targetName = this.extractNameFromRow(li);
        if (targetName) this.rowNameById.set(String(targetId), targetName);

        this.addBadgeAnchor(li);

        const tid = String(targetId);
        const call = this.isDeadFragment ? this.calls[tid] : null;

        // 20-min policy at render time: a claim older than CALL_MAX_MS is
        // dead — show the claim button, not the badge (the sweep removes it
        // from this.calls within 15s; this keeps re-renders honest in between).
        if (call && this.calledAtMs(call) && Date.now() - this.calledAtMs(call) > this.CALL_MAX_MS) {
            this.sweepExpiredCalls();
            return; // swept re-render paints the row fresh
        }

        // A "Copied to clipboard" flash is in progress on this row — our own
        // DOM write (or React's re-render) must not stomp it before it ends.
        if (this.flashTid === tid && Date.now() < this.flashUntil) return;

        // Copy mode: never render other players' server claims (we don't
        // poll, so this.calls is empty anyway — the guard is explicit) and
        // strip any stale badge left over from a previous session/mode.
        if (!this.isDeadFragment) {
            const staleBadge = li.querySelector('.sk-wtc-badge');
            if (staleBadge) staleBadge.remove();
        }

        if (call) {
            // Claimed — render the caller's name, exactly like FactionOps
            // does natively. Mine: clickable to release. Others: plain text.
            const mine = String(call.calledBy?.id ?? '') === String(this.auth?.playerId ?? '');
            const who = call.calledBy?.name || 'Claimed';
            const style = this.callerColor(who, !!mine);

            let badge = li.querySelector('.sk-wtc-badge');
            if (!badge) {
                // Full-row overlay. A span, not a button: single clicks must
                // fall through to the row's own links. DOUBLE-click attacks
                // the target (even though it's already called). Own claims
                // release automatically when the hit lands (handleAttackResult)
                // or when the 20-min cap expires (sweepExpiredCalls).
                badge = document.createElement('span');
                badge.className = 'sk-wtc-badge';
                badge.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.attackTarget(tid, li);
                });
                // Right-click ANYWHERE on the overlay releases — only when the
                // claim is yours (checked live via dataset, refreshed on each
                // render, instead of this.calls which may lag a poll tick).
                badge.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (badge.dataset.skMine !== '1') return;
                    const mineTid = badge.dataset.skTid;
                    if (mineTid) this.unclaimTarget(mineTid, li);
                });
                container.appendChild(badge);
            }
            // Name only — the pill styling itself conveys "called", and a
            // prefix made the badge wide enough to crowd the row's own text.
            if (badge.textContent !== who) badge.textContent = who;
            // Stable per-caller color — same person is always the same color,
            // different people resolve differently (name-hash → HSL hue).
            // Every property is re-asserted each render so the transient
            // "Copied to clipboard" flash (which overwrites them inline)
            // always self-heals on the next updateWarPanelVisuals pass.
            if (badge.style.color !== style.text) badge.style.color = style.text;
            if (badge.style.backgroundColor !== style.bg) badge.style.backgroundColor = style.bg;
            if (badge.style.borderColor !== style.border) badge.style.borderColor = style.border;
            const newTitle = mine
                ? 'Called by you — double-click to attack, right-click to release'
                : (call.isDeal ? 'Deal call by ' : 'Called by ') + who + ' — double-click to attack';
            if (badge.title !== newTitle) badge.title = newTitle;
            if (badge.style.cursor !== 'pointer') badge.style.cursor = 'pointer';
            // Live markers for the contextmenu handler — refreshed every
            // render so a released/swapped claim can never be released twice
            // or someone else's badge be mistaken for yours after a re-render.
            badge.dataset.skMine = mine ? '1' : '0';
            badge.dataset.skTid = tid;

            // Overlay spans EXACTLY level → score. The li is the positioning
            // context (sk-wtc-row-anchor), so offsetLeft/offsetRight are
            // row-relative. left = level's left edge; width = from there to
            // score's RIGHT edge — the status and attack columns to the far
            // right stay uncovered and clickable.
            const levelCell = li.querySelector('.level');
            const scoreCell = li.querySelector('.score') || li.querySelector('.points');
            if (levelCell && scoreCell) {
                const left = levelCell.offsetLeft;
                const right = scoreCell.offsetLeft + scoreCell.offsetWidth;
                if (badge.style.left !== left + 'px') badge.style.left = left + 'px';
                const width = Math.max(40, right - left);
                if (badge.style.width !== width + 'px') badge.style.width = width + 'px';
            } else if (levelCell) {
                const left = levelCell.offsetLeft;
                if (badge.style.left !== left + 'px') badge.style.left = left + 'px';
                if (badge.style.width !== '90px') badge.style.width = '90px';
            } else if (!badge.style.width) {
                badge.style.width = '110px';
            }
        } else {
            // Free target — offer the claim button. (Row-skipping for the
            // "Copied to clipboard" flash is handled at the top of
            // updateMemberRow, so a mid-flash row never reaches this branch.)
            const badge = li.querySelector('.sk-wtc-badge');
            if (badge) badge.remove();

            let btn = li.querySelector('.sk-wtc-btn:not(.sk-wtc-badge)');
            const btnTitle = this.isDeadFragment ? 'Call target' : 'Copy claim message to clipboard';
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'sk-wtc-btn';
                btn.textContent = '✔️';
                btn.title = btnTitle;
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.isDeadFragment) {
                        this.claimTarget(tid, li);
                    } else {
                        this.copyOnlyClaim(tid, li);
                    }
                });
                // Original placement: inline at the start of the row's
                // first cell (before the level/name), right where it has
                // always been.
                container.insertBefore(btn, container.firstChild);
            } else if (btn.title !== btnTitle) {
                // Mode may have resolved after the button was first rendered
                // (faction check is async) — keep the tooltip honest.
                btn.title = btnTitle;
            }
        }
    },

    /**
     * Attack a target from the war panel row. Torn moved attack pages to
     * page.php?sid=attack — loader.php answers with the "endpoint no longer
     * available" JSON — so look for the row's new-style attack link first,
     * then navigate to the current URL format directly.
     */
    attackTarget(tid, li) {
        if (!tid) return;
        const attackLink = li && li.querySelector(`a[href*='sid=attack']`);
        if (attackLink) {
            attackLink.click();
            return;
        }
        window.location.href = `https://www.torn.com/page.php?sid=attack&user2ID=${encodeURIComponent(tid)}`;
    },

    /**
     * Copy-mode claim: no authentication, no server POST, no local claim
     * state. Copies the same "Hitting <name> [id] in Nm Ns" message to the
     * clipboard and flashes the confirmation on the row. The user pastes it
     * into faction chat themselves.
     */
    copyOnlyClaim(targetId, li) {
        const tid = String(targetId);
        const targetName = this.rowNameById.get(tid) || this.extractNameFromRow(li) || `target ${tid}`;
        this.copyCallMessage(tid, targetName);
        this.flashCopied(li, tid);
        console.log('🎯 FactionOps Target Caller: claim message for ' + targetName + ' copied to clipboard (copy-paste mode — not shared with the war room)');
    },

    updateWarPanelVisuals() {
        if (!window.location.href.includes('factions.php')) return;
        const enemies = document.querySelectorAll('.enemy-faction ul.members-list li, ul.members-list li.enemy');
        enemies.forEach(li => {
            if (li.classList.contains('clear') || li.classList.contains('title')) return;
            this.updateMemberRow(li);
        });
    },

    // ------------------------------------------------------------------
    // Claim / unclaim
    // ------------------------------------------------------------------

    async claimTarget(targetId, li) {
        const tid = String(targetId);
        const targetName = this.rowNameById.get(tid) || this.extractNameFromRow(li) || `target ${tid}`;

        // Extension context died (Sidekick reloaded while this tab stayed
        // open) — no message can reach the background worker. Surface the
        // real reason on the row immediately instead of an opaque failed
        // round trip that reads like "the button does nothing".
        if (this.extensionContextDead()) {
            this.showRowError(li, new Error('Sidekick was reloaded — refresh this Torn tab to reconnect'));
            console.warn('🎯 FactionOps Target Caller: claim blocked — Sidekick was reloaded while this page was open. Refresh the Torn tab to call targets again.');
            return;
        }

        // Hospital gate: hospitalized targets CAN be called, but only when
        // they're out within 20 min. Over that: refuse with a notification
        // banner (the row tint was too easy to miss).
        const gate = this.hospitalGate(tid);
        if (gate.blocked) {
            const targetLabel = `${targetName} [${tid}]`;
            this.showBanner('Call refused', `${targetLabel} is in ${gate.reason}`, 'warning');
            this.showRowError(li, new Error(gate.reason));
            return;
        }

        // Backstop: if the faction gate resolved to copy mode while a Dead
        // Fragment click was somehow already routed here, degrade instead of
        // ever sending a non-member's claim to the server.
        if (!this.isDeadFragment) {
            this.copyOnlyClaim(tid, li);
            return;
        }

        try {
            if (!this.auth) {
                // Cold path (click before auth): authenticate now. Never let
                // this escape — a thrown promise from a click handler shows
                // the user nothing at all.
                await this.ensureAuth();
            }

            const warId = this.warId();
            if (!warId) throw new Error('No faction ID — cannot identify the war room');

            // Preflight: enforce the server's one-regular-call-per-player cap
            // locally so the user gets an instant prompt instead of a 409 round
            // trip — same UX as the original module.
            const myCallId = Object.keys(this.calls).find(t => {
                const c = this.calls[t];
                return c && c.calledBy && String(c.calledBy.id) === String(this.auth.playerId);
            });
            if (myCallId && myCallId !== tid) {
                const myCallName = this.rowNameById.get(myCallId) || `target ${myCallId}`;
                if (!confirm(`You already called ${myCallName}. Release it and call ${targetName} instead?`)) {
                    return;
                }
                await this.unclaimTarget(myCallId);
            }

            // Clipboard right away, inside the click gesture — kept from the
            // original module (and the FactionOps client copies optimistically
            // too; the clipboard is private, the server call decides the truth).
            this.copyCallMessage(tid, targetName);

            // Optimistic claim; the next poll echo confirms or reverts it.
            this.calls[tid] = {
                calledBy: { id: this.auth.playerId, name: this.auth.playerName || 'You' },
                calledAt: Date.now(), // ms — normalized by calledAtMs on read
                isDeal: false,
            };
            this.updateWarPanelVisuals();
            // Confirmation flash AFTER the optimistic render puts the badge
            // in place — and renderers skip this row until the flash clears.
            this.flashCopied(li, tid);

            await this.serverRequest('/api/call', {
                method: 'POST',
                body: { warId, targetId: tid, targetName },
            });
            this.exitAuthRetryMode();
        } catch (err) {
            // Roll back the optimistic call, refresh state from the server's
            // last word, and show the failure ON the row — silent uncaught
            // rejections here are why the button "did nothing".
            delete this.calls[tid];
            this.updateWarPanelVisuals();
            this.showRowError(li, err);
            console.warn('Call failed:', err?.message || err);
        }
    },

    async unclaimTarget(targetId, li) {
        const tid = String(targetId);
        const warId = this.warId();
        if (!this.auth || !warId || !this.calls[tid]) return;

        const prev = this.calls[tid];
        delete this.calls[tid];
        this.updateWarPanelVisuals();

        try {
            await this.serverRequest('/api/call', {
                method: 'POST',
                body: { warId, targetId: tid, action: 'uncall' },
            });
        } catch (err) {
            this.calls[tid] = prev;
            this.updateWarPanelVisuals();
            if (li) this.showRowError(li, err);
            console.warn('🎯 Uncall failed:', err?.message || err);
        }
    },

    /**
     * A successful attack just resolved on this target (relayed by the
     * MAIN-world injector on the attack page). Your hit landed, so your own
     * claim on this target is spent — auto-release it.
     *
     * Scoped to YOUR claim only: a teammate's claim (or one you haven't
     * made) is never touched. Server sync + failure rollback are handled by
     * the existing unclaimTarget path.
     */
    async handleAttackResult(detail) {
        // Copy mode never has claim state (and never authenticated), so a
        // relayed hit there is a no-op — there is nothing to release.
        if (!this.isEnabled || !this.isDeadFragment) return;

        let payload;
        try {
            payload = JSON.parse(detail);
        } catch (_) {
            return; // malformed relay — ignore
        }

        const tid = String(payload?.targetId || '');
        const result = payload?.result;
        if (!tid || !result) return;

        // The attack page is a SEPARATE page load from factions.php where
        // claims are made — polling never ran here, so this.calls is empty
        // and this.auth is unset. Authenticate on demand and pull the live
        // claim map for this war before deciding.
        let call, data;
        try {
            if (!this.warId()) {
                await this.ensureAuth();
            }
            const warId = this.warId();
            if (!warId) return; // no key or not in a faction — nothing to release

            data = await this.serverRequest(`/api/poll?warId=${encodeURIComponent(warId)}`);
            const calls = data?.calls || {};
            call = calls[tid];
        } catch (err) {
            console.warn('🎯 FactionOps Target Caller: could not check claims after attack result:', err?.message || err);
            return;
        }

        if (!call || !call.calledBy) return;

        const mine = String(call.calledBy.id ?? '') === String(this.auth?.playerId ?? '');
        if (!mine) return; // someone else's claim — leave it alone

        // Adopt the fresh claim map so unclaimTarget's guards and the next
        // factions.php render agree with the server.
        if (data && data.calls) this.calls = data.calls;

        console.log('🎯 FactionOps Target Caller: successful hit on your claimed target ' + tid + ' — auto-releasing');
        await this.unclaimTarget(tid);
    },

    /** Inline, transient error feedback on the row's button — no toasts/alerts. */
    showRowError(li, err) {
        const btn = li.querySelector('.sk-wtc-badge') || li.querySelector('.sk-wtc-btn');
        if (!btn) return;
        const raw = String(err?.message || err || 'Server error');
        // Translate the cryptic transport line into the actual instruction.
        btn.title = /extension context/i.test(raw)
            ? 'Sidekick was reloaded — refresh this Torn tab to reconnect'
            : raw;
        btn.classList.add('sk-wtc-error');
        setTimeout(() => {
            btn.classList.remove('sk-wtc-error');
            // Re-render recomputes title/text from authoritative server state.
            this.updateWarPanelVisuals();
        }, 2500);
    },

    copyCallMessage(targetId, targetName) {
        let timeString = '';
        // Soft dependency on War Monitor for the "in Nm Ns" suffix, same as
        // the original module — absent War Monitor, the message just omits it.
        const status = window.SidekickModules?.WarMonitor?.memberStatus?.get(targetId);
        if (status && (status.state === 'Hospital' || status.state === 'Jail' || status.state === 'Traveling' || status.state === 'Abroad')) {
            const now = Date.now() / 1000;
            if (status.until > now) {
                const diff = status.until - now;
                const mins = Math.floor(diff / 60);
                const secs = Math.floor(diff % 60);
                timeString = mins > 0 ? ` in ${mins}m ${secs}s` : ` in ${secs}s`;
            }
        }
        const idString = targetId ? ` [${targetId}]` : '';
        const message = `Hitting ${targetName}${idString}${timeString}`;
        navigator.clipboard.writeText(message).catch(err => {
            console.error('Clipboard copy failed:', err);
        });
    },

    /**
     * Stable colour per caller: hash the caller's NAME into an HSL hue so the
     * same person is always the same colour (across rows, re-renders and page
     * reloads) while different people resolve to visibly different colours.
     * Returns the full pill style set: bright border + dark translucent bg
     * + light text. Own calls get brighter tones so "yours" always pops.
     */
    callerColor(name, mine) {
        const key = String(name || '?').toLowerCase();
        if (!this.colorCache.has(key)) {
            let hash = 0;
            for (let i = 0; i < key.length; i++) {
                hash = key.charCodeAt(i) + ((hash << 5) - hash);
                hash |= 0; // keep it a 32-bit int
            }
            const hue = Math.abs(hash) % 360;
            this.colorCache.set(key, {
                text: '#ffffff',
                bg: `hsla(${hue}, 75%, ${mine ? 30 : 20}%, 0.85)`,
                border: `hsl(${hue}, 85%, ${mine ? 65 : 52}%)`,
            });
        }
        return this.colorCache.get(key);
    },

    /**
     * "Copied to clipboard" confirmation on the row. Observer-proof: the
     * membersObserver fires on our own DOM writes and re-renders the row,
     * which used to stomp this text back to the caller's name instantly.
     * Renderers now skip this row while flashTid/flashUntil say a flash is
     * live, and the timer itself does the restore.
     */
    flashCopied(li, tid) {
        // In copy mode the row holds the ✔️ button (no caller badge), so flash
        // on whichever element is present.
        const badge = li.querySelector('.sk-wtc-badge') || li.querySelector('.sk-wtc-btn');
        if (!badge) return;

        this.flashTid = String(tid);
        this.flashUntil = Date.now() + 1600;

        badge.textContent = 'Copied!';
        badge.style.color = '#4CAF50';
        badge.style.backgroundColor = 'rgba(76, 175, 80, 0.25)';
        badge.style.borderColor = '#4CAF50';
        badge.style.fontSize = '10px';

        setTimeout(() => {
            // Only clear if THIS row's flash is still the live one.
            if (this.flashTid === String(tid)) {
                this.flashTid = null;
                this.flashUntil = 0;
                // The flash set fontSize/color inline; the re-render restores
                // the per-caller color/border/background, but fontSize needs an
                // explicit reset.
                badge.style.fontSize = '';
            }
            this.updateWarPanelVisuals();
        }, 1600);
    }
};

if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.WarTargetCaller = WarTargetCallerModule;
console.log('🎯 FactionOps Target Caller module registered');
