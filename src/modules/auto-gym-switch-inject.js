// Auto Gym Switch - Page World Fetch Interceptor
// Runs in MAIN world at document_start so it can override window.fetch
// before Torn's own scripts load. Enabled flag is read from localStorage
// (set by the isolated-world content script auto-gym-switch.module.js).
// Key fix: gym switching uses a proper POST to changeGym (not a DOM click),
// which prevents Torn navigating to the gym profile page.
// Forked from Auto gym switch by Stephen Lynx
(function () {
    'use strict';

    const LS_KEY = 'sidekick_auto_gym_enabled';

    // ── Gym data ──────────────────────────────────────────────────────────────
    const gymInfo = {
        1: { str: 2, spe: 2, def: 2, dex: 2 },
        2: { str: 2.4, spe: 2.4, def: 2.7, dex: 2.4 },
        3: { str: 2.7, spe: 3.2, def: 3.0, dex: 2.7 },
        4: { str: 3.2, spe: 3.2, def: 3.2, dex: 0 },
        5: { str: 3.4, spe: 3.6, def: 3.4, dex: 3.2 },
        6: { str: 3.4, spe: 3.6, def: 3.6, dex: 3.8 },
        7: { str: 3.7, spe: 0, def: 3.7, dex: 3.7 },
        8: { str: 4, spe: 4, def: 4, dex: 4 },
        9: { str: 4.8, spe: 4.4, def: 4, dex: 4.2 },
        10: { str: 4.4, spe: 4.6, def: 4.8, dex: 4.4 },
        11: { str: 5, spe: 4.6, def: 5.2, dex: 4.6 },
        12: { str: 5, spe: 5.2, def: 5, dex: 5 },
        13: { str: 5, spe: 5.4, def: 4.8, dex: 5.2 },
        14: { str: 5.5, spe: 5.7, def: 5.5, dex: 5.2 },
        15: { str: 0, spe: 5.5, def: 5.5, dex: 5.7 },
        16: { str: 6, spe: 6, def: 6, dex: 6 },
        17: { str: 6, spe: 6.2, def: 6.4, dex: 6.2 },
        18: { str: 6.5, spe: 6.4, def: 6.2, dex: 6.2 },
        19: { str: 6.4, spe: 6.5, def: 6.4, dex: 6.8 },
        20: { str: 6.4, spe: 6.4, def: 6.8, dex: 7 },
        21: { str: 7, spe: 6.4, def: 6.4, dex: 6.5 },
        22: { str: 6.8, spe: 6.5, def: 7, dex: 6.5 },
        23: { str: 6.8, spe: 7, def: 7, dex: 6.8 },
        24: { str: 7.3, spe: 7.3, def: 7.3, dex: 7.3 },
        25: { str: 0, spe: 0, def: 7.5, dex: 7.5 },
        26: { str: 7.5, spe: 7.5, def: 0, dex: 0 },
        27: { str: 8, spe: 0, def: 0, dex: 0 },
        28: { str: 0, spe: 0, def: 8, dex: 0 },
        29: { str: 0, spe: 8, def: 0, dex: 0 },
        30: { str: 0, spe: 0, def: 0, dex: 8 },
        31: { str: 9, spe: 9, def: 9, dex: 9 },
        32: { str: 10, spe: 10, def: 10, dex: 10 },
        33: { str: 3.4, spe: 3.4, def: 4.6, dex: 0 }
    };

    // ── State ─────────────────────────────────────────────────────────────────
    let currentGym = null; // Number id of the currently active gym
    let picks = { str: [], def: [], spe: [], dex: [] };
    let booted = false;
    const originalFetch = window.fetch;

    // ── Helpers ───────────────────────────────────────────────────────────────
    function isEnabled() {
        return localStorage.getItem(LS_KEY) === 'true';
    }

    function processGymData(gyms) {
        const classList = ['specialist', 'heavyweight', 'middleweight', 'lightweight', 'jail'];
        picks = { str: [], def: [], spe: [], dex: [] };

        for (const gymClass of classList) {
            if (!gyms[gymClass]) continue;
            for (const gym of gyms[gymClass]) {
                const gymId = Number(gym.id); // Normalise to Number
                if (gym.status === 'active') currentGym = gymId;
                if (gym.status === 'available' || gym.status === 'active') {
                    for (const stat of ['str', 'def', 'spe', 'dex']) {
                        const gain = gymInfo[gymId]?.[stat];
                        if (gain) picks[stat].push({ id: gymId, gain });
                    }
                }
            }
        }
        for (const stat in picks) {
            picks[stat].sort((a, b) => b.gain !== a.gain ? b.gain - a.gain : b.id - a.id);
        }
        console.log('💪 [AutoGym] Gym data loaded. currentGym:', currentGym, 'picks:', picks);
    }

    function getBestGym(stat) {
        for (const gym of (picks[stat] || [])) {
            if (gym.id >= 27 && gym.id <= 31) {
                const el = document.querySelector(`[class*='gym-${gym.id}']`);
                if (!el) continue;
                const isLocked = Array.from(el.parentElement?.classList || []).some(c => c.includes('locked'));
                if (!isLocked) return gym.id;
            } else {
                return gym.id;
            }
        }
        return null;
    }

    // Uses native DOM clicking to switch gym, letting Torn's React handle the API call
    async function changeGymViaDOM(gymId) {
        // Look for the specific gym icon (e.g. gym-25___abcd)
        const icon = document.querySelector(`[class*="gym-${gymId}_"], [class*="gym-${gymId} "]`);
        if (!icon) return false;
        
        const btn = icon.closest('button, [class*="gymButton"]');
        if (!btn) return false;
        
        console.log(`💪 [AutoGym] Clicking native gym button for Gym ${gymId}`);
        btn.click();
        
        // Wait up to 3 seconds for the fetch interceptor to register the change
        for (let i = 0; i < 30; i++) {
            if (currentGym === gymId) return true;
            await new Promise(r => setTimeout(r, 100));
        }
        return false;
    }

    // Fallback API POST to changeGym
    async function swapGyms(gymId) {
        let changeResult;
        
        // Attempt 1: JSON payload with step in URL (Torn's modern standard)
        try {
            const resp = await originalFetch('/gym.php?step=changeGym', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: 'changeGym', gymID: gymId })
            });
            changeResult = await resp.json();
        } catch(e) {}

        // Attempt 2: Form payload with step in body
        if (!changeResult || !changeResult.success) {
            const params = new URLSearchParams({ step: 'changeGym', gymID: gymId });
            try {
                const resp = await originalFetch('/gym.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params
                });
                changeResult = await resp.json();
            } catch (e) {
                console.error('💪 [AutoGym] changeGym fallback request failed:', e);
            }
        }

        if (changeResult && changeResult.success) {
            currentGym = gymId;
            try { updateGymUI(gymId); } catch (e) { /* ignore */ }
        }

        return new Response(JSON.stringify({
            success: changeResult ? changeResult.success : false,
            message: (changeResult && changeResult.message) || `Switched to gym ${gymId}. Click Train again.`
        }));
    }

    function updateGymUI(gymId) {
        const info = gymInfo[gymId];
        if (!info) return;

        // Swap active button class
        const activeButton = document.querySelector('[class*="active"][class^="gymButton"]');
        if (activeButton) {
            const activeClass = Array.from(activeButton.classList).find(c => c.includes('active'));
            if (activeClass) {
                activeButton.classList.remove(activeClass);
                document.querySelector(`[class*='gym-${gymId}']`)?.parentElement?.classList.add(activeClass);
            }
        }

        // Swap gym logo
        const logos = document.querySelectorAll('[class^="logo"]');
        for (const el of logos) {
            if (el.tagName === 'IMG') {
                const parts = el.src.split('/');
                parts[parts.length - 1] = gymId + '.png';
                el.src = parts.join('/');
                break;
            }
        }
    }

    // ── Fetch override ────────────────────────────────────────────────────────
    window.fetch = async function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

        // Determine the request type by checking both URL and body
        let isGetInitial = url.includes('getInitialGymInfo');
        let isChange = url.includes('changeGym') || url.includes('purchaseMembership');
        let isTrain = url.includes('step=train');
        let bodyText = '';

        if (url.includes('gym.php')) {
            if (args[1]?.body) {
                const b = args[1].body;
                if (b instanceof FormData || b instanceof URLSearchParams) {
                    bodyText = Array.from(b.entries()).map(([k,v]) => `${k}=${v}`).join('&');
                } else {
                    bodyText = String(b);
                }
                if (bodyText.includes('changeGym') || bodyText.includes('purchaseMembership')) isChange = true;
                if (bodyText.includes('train')) isTrain = true;
            }
        }

        // 1. Capture gym info on page load
        if (isGetInitial) {
            const result = await originalFetch(...args);
            try {
                const data = await result.clone().json();
                if (!booted && data.gyms) {
                    booted = true;
                    processGymData(data.gyms);
                }
            } catch (e) { /* ignore */ }
            return result;
        }

        // 2. Track manual gym changes so currentGym stays accurate
        if (isChange) {
            const result = await originalFetch(...args);
            try {
                const data = await result.clone().json();
                if (data.success) {
                    let gymID = null;
                    if (args[1]?.body instanceof URLSearchParams || args[1]?.body instanceof FormData) {
                        gymID = args[1].body.get('gymID');
                    } else if (typeof args[1]?.body === 'string') {
                        try {
                            gymID = JSON.parse(args[1].body).gymID;
                        } catch(e) {
                            gymID = new URLSearchParams(args[1].body).get('gymID');
                        }
                    }
                    if (gymID) currentGym = Number(gymID);
                }
            } catch (e) { /* ignore */ }
            return result;
        }

        // 3. Intercept training — switch gym first if needed
        if (isTrain && isEnabled()) {
            try {
                let stat = '';
                const searchStr = (url + '&' + bodyText).toLowerCase();
                
                if (searchStr.includes('strength') || searchStr.includes('stat=str')) stat = 'str';
                else if (searchStr.includes('defense') || searchStr.includes('stat=def')) stat = 'def';
                else if (searchStr.includes('speed') || searchStr.includes('stat=spe')) stat = 'spe';
                else if (searchStr.includes('dexterity') || searchStr.includes('stat=dex')) stat = 'dex';
                const bestGym = getBestGym(stat);

                if (bestGym !== null && bestGym !== currentGym) {
                    console.log(`💪 [AutoGym] Fetch Train intercepted — stat:${stat} best:${bestGym} current:${currentGym}`);
                    console.log(`💪 [AutoGym] Switching ${currentGym} → ${bestGym} for ${stat}`);
                    const fakeResp = await swapGyms(bestGym);
                    if (fakeResp !== null) return fakeResp;
                }
            } catch (err) {
                console.error('💪 [AutoGym] Train intercept error:', err);
            }
        }

        return originalFetch(...args);
    };

    // ── DOM Interception (Fallback for XHR/React) ─────────────────────────────
    let isProgrammaticAction = false;

    // Intercepts clicks on the "Train" button BEFORE Torn's scripts process it.
    document.addEventListener('click', async (e) => {
        if (!isEnabled() || isProgrammaticAction) return;
        
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const btnText = btn.textContent.trim().toLowerCase();
        if (btnText === 'train' || btnText.includes('train')) {
            const container = btn.closest('[class*="stat___"], [class*="gym-property"], li, .stat-wrapper, [class*="statItem___"]');
            if (!container) return;
            
            const containerText = container.textContent.toLowerCase();
            let stat = '';
            
            if (containerText.includes('strength')) stat = 'str';
            else if (containerText.includes('defense')) stat = 'def';
            else if (containerText.includes('speed')) stat = 'spe';
            else if (containerText.includes('dexterity')) stat = 'dex';
            
            if (stat) {
                const bestGym = getBestGym(stat);
                if (bestGym !== null && bestGym !== currentGym) {
                    console.log(`💪 [AutoGym] DOM Click intercepted — stat:${stat} best:${bestGym} current:${currentGym}`);
                    
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    const originalText = btn.textContent;
                    btn.textContent = 'Switching...';
                    btn.disabled = true;
                    
                    isProgrammaticAction = true;
                    const domSuccess = await changeGymViaDOM(bestGym);
                    if (!domSuccess) await swapGyms(bestGym);
                    
                    btn.textContent = originalText;
                    btn.disabled = false;
                    
                    // We DO NOT simulate the second click to comply with Torn's 1-click-1-action rule.
                    // The user must click train again.
                    setTimeout(() => { isProgrammaticAction = false; }, 100);
                    
                    return false;
                }
            }
        }
    }, true);

    // Intercepts hitting "Enter" in the energy input field
    document.addEventListener('keydown', async (e) => {
        if (!isEnabled() || isProgrammaticAction) return;
        if (e.key !== 'Enter') return;
        
        const input = e.target.closest('input[type="text"], input[type="number"]');
        if (!input) return;
        
        const container = input.closest('[class*="stat___"], [class*="gym-property"], li, .stat-wrapper, [class*="statItem___"]');
        if (!container) return;
        
        const containerText = container.textContent.toLowerCase();
        let stat = '';
        
        if (containerText.includes('strength')) stat = 'str';
        else if (containerText.includes('defense')) stat = 'def';
        else if (containerText.includes('speed')) stat = 'spe';
        else if (containerText.includes('dexterity')) stat = 'dex';
        
        if (stat) {
            const bestGym = getBestGym(stat);
            if (bestGym !== null && bestGym !== currentGym) {
                console.log(`💪 [AutoGym] DOM Enter intercepted — stat:${stat} best:${bestGym} current:${currentGym}`);
                
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                isProgrammaticAction = true;
                const domSuccess = await changeGymViaDOM(bestGym);
                if (!domSuccess) await swapGyms(bestGym);
                
                // We DO NOT simulate the second enter to comply with Torn's 1-click-1-action rule.
                setTimeout(() => { isProgrammaticAction = false; }, 100);
                
                return false;
            }
        }
    }, true);

    console.log('💪 [AutoGym] Fetch interceptor ready (enabled:', isEnabled(), ')');
})();
