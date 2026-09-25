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

    enable() {
        this.isEnabled = true;
        this.injectStyles();

        if (window.location.href.includes('factions.php')) {
            this.startMembersObserver();
            this.startPolling();
        }
    },

    disable() {
        this.isEnabled = false;
        this.stopPolling();

        if (this.membersObserver) {
            this.membersObserver.disconnect();
            this.membersObserver = null;
        }

        this.calls = {};
        this.rowNameById.clear();

        // Remove visuals
        document.querySelectorAll('.sk-wtc-badge, .sk-wtc-btn').forEach(el => el.remove());
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
                font-size: 12px;
                margin-right: 3px;
                vertical-align: middle;
                line-height: 1;
            }
            .sk-wtc-error {
                /* !important — per-caller colours are set inline on the badge,
                   and inline styles would otherwise hide the error tint. */
                color: #ff4d4d !important;
            }
        `;
        document.head.appendChild(style);
    },

    // ------------------------------------------------------------------
    // Server plumbing (all via background `proxyFetch`)
    // ------------------------------------------------------------------

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

        const tid = String(targetId);
        const call = this.calls[tid];

        // A "Copied to clipboard" flash is in progress on this row — our own
        // DOM write (or React's re-render) must not stomp it before it ends.
        if (this.flashTid === tid && Date.now() < this.flashUntil) return;

        if (call) {
            // Claimed — render the caller's name, exactly like FactionOps
            // does natively. Mine: clickable to release. Others: plain text.
            const mine = String(call.calledBy?.id ?? '') === String(this.auth?.playerId ?? '');
            const who = call.calledBy?.name || 'Claimed';
            const whoColor = this.callerColor(who, !!mine);

            let badge = li.querySelector('.sk-wtc-badge');
            if (!badge) {
                badge = document.createElement('button');
                badge.className = 'sk-wtc-btn sk-wtc-badge';
                if (mine) {
                    badge.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.unclaimTarget(tid, li);
                    });
                }
                container.insertBefore(badge, container.firstChild);
            }
            if (badge.textContent !== who) badge.textContent = who;
            // Stable per-caller color — same person is always the same color,
            // different people resolve differently (name-hash → HSL hue).
            if (badge.style.color !== whoColor) badge.style.color = whoColor;
            const newTitle = mine
                ? 'Called by you — click to release'
                : (call.isDeal ? 'Deal call by ' : 'Called by ') + who;
            if (badge.title !== newTitle) badge.title = newTitle;
            const newCursor = mine ? 'pointer' : 'default';
            if (badge.style.cursor !== newCursor) badge.style.cursor = newCursor;
        } else {
            // Free target — offer the claim button. (Row-skipping for the
            // "Copied to clipboard" flash is handled at the top of
            // updateMemberRow, so a mid-flash row never reaches this branch.)
            const badge = li.querySelector('.sk-wtc-badge');
            if (badge) badge.remove();

            let btn = li.querySelector('.sk-wtc-btn:not(.sk-wtc-badge)');
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'sk-wtc-btn';
                btn.textContent = '✔️';
                btn.title = 'Call target';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.claimTarget(tid, li);
                });
                container.insertBefore(btn, container.firstChild);
            }
        }
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
                calledAt: Date.now(),
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

    /** Inline, transient error feedback on the row's button — no toasts/alerts. */
    showRowError(li, err) {
        const btn = li.querySelector('.sk-wtc-badge') || li.querySelector('.sk-wtc-btn');
        if (!btn) return;
        btn.title = err?.message || 'Server error';
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
     * Own calls get a higher lightness so "yours" always reads as the bright one.
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
            this.colorCache.set(key, `hsl(${hue}, 85%, ${mine ? 65 : 55}%)`);
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
        const badge = li.querySelector('.sk-wtc-badge');
        if (!badge) return;

        this.flashTid = String(tid);
        this.flashUntil = Date.now() + 1600;

        badge.textContent = 'Copied to clipboard';
        badge.style.color = '#4CAF50';
        badge.style.fontSize = '10px';

        setTimeout(() => {
            // Only clear if THIS row's flash is still the live one.
            if (this.flashTid === String(tid)) {
                this.flashTid = null;
                this.flashUntil = 0;
                // The flash set fontSize/color inline; the re-render restores
                // the per-caller color, but fontSize needs an explicit reset.
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
