/**
 * Sidekick Chrome Extension - Travel Blocker Module
 * Modular travel blocker for OC timing, bazaars, drug cooldowns, and faction wars
 */

(function () {
    'use strict';

    if (window.SIDEKICK_TRAVEL_BLOCKER_INJECTED) return;
    window.SIDEKICK_TRAVEL_BLOCKER_INJECTED = true;

    console.log("✈️ Loading Sidekick Travel Blocker Module...");

    let settings = null;
    let apiKeyPrimary = '';
    let apiKeySecondary = '';
    let enemyLocations = {};
    const appliedChanges = new Map();

    const fetchJson = async (url) => {
        // Try primary key
        let activeKey = apiKeyPrimary;
        if (!activeKey) return null;

        let apiUrl = url.includes('?') ? `${url}&key=${activeKey}` : `${url}?key=${activeKey}`;
        try {
            let resp = await fetch(apiUrl);
            let data = await resp.json();
            
            // If error is code 5 (Too many requests) or 2 (Incorrect key) and we have a secondary key, try fallback
            if (data && data.error && (data.error.code === 5 || data.error.code === 2) && apiKeySecondary) {
                console.warn("[Travel Blocker] Primary API key failed, using secondary fallback...");
                apiUrl = url.includes('?') ? `${url}&key=${apiKeySecondary}` : `${url}?key=${apiKeySecondary}`;
                resp = await fetch(apiUrl);
                data = await resp.json();
            }
            return data;
        } catch (e) {
            return null;
        }
    };

    async function loadSettings() {
        return new Promise(resolve => {
            chrome.storage.local.get(['sidekick_travel_blocker', 'sidekick_api_key', 'sidekick_secondary_api_key', 'sidekick_enemy_locations'], result => {
                settings = result?.sidekick_travel_blocker || {
                    isEnabled: true,
                    oc_watcher: true,
                    drug_cooldown: true,
                    war_watch: true
                };
                apiKeyPrimary = result?.sidekick_api_key || '';
                apiKeySecondary = result?.sidekick_secondary_api_key || '';
                enemyLocations = result?.sidekick_enemy_locations || {};
                resolve(settings);
            });
        });
    }

    function parseTravelTime(str) {
        if (!str) return null;
        let hours = 0;
        let mins = 0;
        const hMatch = str.match(/(\d+)\s*h/i);
        if (hMatch) hours = parseInt(hMatch[1]);
        const mMatch = str.match(/(\d+)\s*m/i);
        if (mMatch) mins = parseInt(mMatch[1]);
        if (hours === 0 && mins === 0) return null;
        return (hours * 3600) + (mins * 60);
    }

    // Returns seconds until drug cooldown is finished
    function getDrugCooldownSeconds() {
        const sidebarRoot = document.getElementById('sidebarroot');
        if (!sidebarRoot) return 0;
        
        // icon49 to 53 represent drug cooldown timers.
        // We'll read the text from the tooltips or assume it's active.
        // But exact seconds is hard from sidebar unless we hover. 
        // Actually, Torn API user/?selections=cooldowns provides drug cooldown EXACTLY!
        return -1; // -1 signals we need API
    }

    // Cache to prevent spamming APIs
    let cachedMyId = null;
    let cachedFactionCrimes = null;
    let cachedUserCooldowns = null;
    
    const modules = [
        {
            id: 'oc_watcher',
            label: 'OC Watcher',
            evaluate: async (ctx) => {
                // First check DOM for current status
                const sidebarRoot = document.getElementById('sidebarroot');
                if (sidebarRoot) {
                    const ocCompleted = sidebarRoot.querySelector('li[class*="icon90"]');
                    if (ocCompleted) return { reason: 'Your OC is ready to view.' };

                    const inOC = sidebarRoot.querySelector('li[class*="icon85"], li[class*="icon89"]');
                    if (!inOC) return { reason: 'You have no active Organized Crime.' };
                }

                // Then check API for timing
                if (!ctx || !ctx.flightTimeSeconds) return null; // We need flight time
                
                if (!cachedMyId) {
                    const profile = await fetchJson(`https://api.torn.com/v2/user/profile`);
                    if (profile && profile.id) cachedMyId = profile.id;
                }
                if (!cachedMyId) return null;

                if (!cachedFactionCrimes) {
                    const factionData = await fetchJson(`https://api.torn.com/v2/faction/crimes`);
                    if (factionData && factionData.crimes) cachedFactionCrimes = factionData.crimes;
                }
                if (!cachedFactionCrimes) return null;

                const now = Math.floor(Date.now() / 1000);
                const roundTripTime = (ctx.flightTimeSeconds * 2) + 300; 

                for (const [id, crime] of Object.entries(cachedFactionCrimes)) {
                    if (crime.status !== "Ready" && crime.status !== "Preparing") continue;
                    
                    const participants = crime.participants || [];
                    const isParticipant = participants.some(p => p.id === cachedMyId);

                    if (isParticipant) {
                        if (crime.status === "Ready") {
                            return { reason: `You have an Organized Crime ready now! (${crime.name})` };
                        }
                        const readyAt = crime.ready_at;
                        if (readyAt) {
                            const timeUntil = readyAt - now;
                            if (timeUntil > 0 && roundTripTime >= timeUntil) {
                                return { reason: `Round trip takes longer than your OC ready time (${crime.name})` };
                            }
                        }
                    }
                }
                return null;
            }
        },
        {
            id: 'drug_cooldown',
            label: 'Drug Cooldown',
            evaluate: async (ctx) => {
                if (!ctx || !ctx.flightTimeSeconds) return null;
                
                if (!cachedUserCooldowns) {
                    const userCooldowns = await fetchJson(`https://api.torn.com/user/?selections=cooldowns`);
                    if (userCooldowns && userCooldowns.cooldowns) {
                        cachedUserCooldowns = userCooldowns.cooldowns;
                    }
                }
                
                if (!cachedUserCooldowns) return null;
                
                const drugCd = cachedUserCooldowns.drug || 0;
                if (drugCd === 0) {
                    return { reason: 'Drug cooldown finished — take a drug!' };
                }

                const roundTripTime = (ctx.flightTimeSeconds * 2) + 300;
                if (roundTripTime >= drugCd) {
                    return { reason: 'Round trip takes longer than your drug cooldown' };
                }
                return null;
            }
        },

        {
            id: 'war_watch',
            label: 'War Watch',
            evaluate: async (ctx) => {
                if (!ctx || !ctx.country) return null;
                const locs = enemyLocations[ctx.country];
                if (!locs) return null;

                const count = (locs.going || 0) + (locs.there || 0);
                if (count > 0) {
                    return { reason: `Enemy faction has ${count} members in/traveling to ${ctx.country}!` };
                }
                return null;
            }
        }
    ];

    function recordApplied(moduleId, el, visualX) {
        const arr = appliedChanges.get(moduleId) ?? [];
        if (arr.some(x => x.el === el)) return;
        arr.push({
            el,
            visualX,
            orig: {
                disabled: el.disabled,
                text: el.textContent,
                title: el.title,
                hadClass: el.classList.contains('script-disabled-button'),
                pointerEvents: el.style.pointerEvents
            }
        });
        appliedChanges.set(moduleId, arr);
    }

    function injectWarBadges() {
        if (!settings || !settings.war_watch) return;

        const targets = Array.from(document.querySelectorAll('.travel-agency .destination'));
        for (const target of targets) {
            const nameEl = target.querySelector('.name');
            if (!nameEl) continue;
            
            const country = nameEl.textContent.trim();
            const locs = enemyLocations[country];
            if (!locs) continue;

            let badgeWrap = target.querySelector('.sk-war-badges');
            if (!badgeWrap) {
                badgeWrap = document.createElement('div');
                badgeWrap.className = 'sk-war-badges';
                badgeWrap.style.cssText = 'position:absolute;top:5px;right:5px;display:flex;gap:4px;z-index:10;';
                target.style.position = 'relative';
                target.appendChild(badgeWrap);
            }
            
            badgeWrap.innerHTML = '';
            
            if (locs.going > 0) {
                badgeWrap.innerHTML += `<div title="${locs.going} enemies traveling here" style="background:rgba(224,152,32,0.8);color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;">${locs.going}</div>`;
            }
            if (locs.there > 0) {
                badgeWrap.innerHTML += `<div title="${locs.there} enemies already here" style="background:rgba(224,85,101,0.8);color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;">${locs.there}</div>`;
            }
            if (locs.returning > 0) {
                badgeWrap.innerHTML += `<div title="${locs.returning} enemies returning from here" style="background:rgba(77,159,255,0.8);color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;">${locs.returning}</div>`;
            }
        }
    }

    function createVisualX(target) {
        let overlay = target.querySelector('.sk-block-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sk-block-overlay';
            overlay.style.cssText = `
                position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
                z-index: 5; pointer-events: none; border-radius: 5px;
            `;
            overlay.innerHTML = `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#e05565" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            target.style.position = 'relative';
            target.appendChild(overlay);
        }
        return overlay;
    }

    async function enforceRules() {
        if (!settings || !settings.isEnabled) return;
        
        injectWarBadges();

        const targets = Array.from(document.querySelectorAll('.travel-agency .destination'));
        
        for (const target of targets) {
            const nameEl = target.querySelector('.name');
            if (!nameEl) continue;
            const country = nameEl.textContent.trim();

            // Extract exact flight time from DOM
            let flightTimeSeconds = 0;
            const timeEl = target.querySelector('div[class*="time_"]');
            if (timeEl) {
                flightTimeSeconds = parseTravelTime(timeEl.textContent) || 0;
            }

            const buttons = target.querySelectorAll('a.torn-btn.btn-dark-bg, button.torn-btn.btn-dark-bg');
            if (!buttons.length) continue;

            const ctx = { country, flightTimeSeconds };
            
            const blockers = [];
            for (const mod of modules) {
                if (settings[mod.id]) { // true if switch is ON
                    let res = null;
                    try {
                        res = await mod.evaluate(ctx);
                    } catch (e) {
                        console.warn(`[Travel Blocker] Error in ${mod.id}:`, e);
                    }
                    if (res) {
                        blockers.push({ _moduleId: mod.id, module: mod.label, reason: res.reason });
                    }
                }
            }

            if (blockers.length > 0) {
                // Add Visual X overlay
                const visualX = createVisualX(target);

                for (const btn of buttons) {
                    if (btn.textContent.trim() !== 'Travel' && btn.textContent.trim() !== 'Standard' && btn.textContent.trim() !== 'Airstrip') continue;
                    
                    btn.disabled = true;
                    btn.textContent = 'BLOCKED';
                    btn.title = blockers.map(r => `[${r.module}] ${r.reason}`).join('\\n');
                    btn.classList.add('script-disabled-button');
                    btn.style.pointerEvents = 'none';
                    
                    for (const r of blockers) {
                        recordApplied(r._moduleId, btn, visualX);
                    }
                }
            }
        }
    }

    let enforcing = false;
    async function runEnforcement() {
        if (enforcing) return;
        enforcing = true;
        try {
            await enforceRules();
        } finally {
            enforcing = false;
        }
    }

    async function init() {
        await loadSettings();
        if (!settings || !settings.isEnabled) return;

        runEnforcement();

        const observer = new MutationObserver(() => {
            runEnforcement();
        });
        const travelRoot = document.getElementById('travel-root') || document.body;
        observer.observe(travelRoot, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
