/**
 * Sidekick Chrome Extension - Special Gym Ratios Module
 * Monitors battle stat ratios and warns if they risk losing access to special gyms.
 * Ported from RGiskard's "Special Gym Ratios" userscript (v2.3.3).
 */

const SpecialGymRatiosModule = (() => {
    const STORAGE_KEY = 'special-gym-ratios';
    const POLL_INTERVAL = 300;
    const UPDATE_INTERVAL = 600;

    let isEnabled = false;
    let watchdogId = null;
    let updateTimerId = null;
    let lastUrl = '';
    let statSafeDistance = 1000000;

    // ── Gym build definitions ──────────────────────────────────────────────────

    const BUILDS = {
        none:                { value: 'none',              text: 'No specialty gyms' },
        balboas:             { value: 'balboas',           text: 'Defense and dexterity specialist',
                               stat1: 'defense', stat2: 'dexterity', secondarystat1: 'strength', secondarystat2: 'speed' },
        frontline:           { value: 'frontline',         text: 'Strength and speed specialist',
                               stat1: 'strength', stat2: 'speed', secondarystat1: 'defense', secondarystat2: 'dexterity' },
        gym3000:             { value: 'gym3000',           text: "Strength specialist (Hank's Ratio)",
                               stat: 'strength',   combogym: 'balboas' },
        isoyamas:            { value: 'isoyamas',          text: "Defense specialist (Hank's Ratio)",
                               stat: 'defense',    combogym: 'frontline' },
        totalrebound:        { value: 'totalrebound',      text: "Speed specialist (Hank's Ratio)",
                               stat: 'speed',      combogym: 'balboas' },
        elites:              { value: 'elites',            text: "Dexterity specialist (Hank's Ratio)",
                               stat: 'dexterity',  combogym: 'frontline' },
        frontlinegym3000:    { value: 'frontlinegym3000',  text: "Strength combo specialist (Baldr's Ratio)",
                               stat: 'strength',   combogym: 'frontline' },
        balboasisoyamas:     { value: 'balboasisoyamas',   text: "Defense combo specialist (Baldr's Ratio)",
                               stat: 'defense',    combogym: 'balboas' },
        frontlinetotalrebound: { value: 'frontlinetotalrebound', text: "Speed combo specialist (Baldr's Ratio)",
                               stat: 'speed',      combogym: 'frontline' },
        balboaselites:       { value: 'balboaselites',     text: "Dexterity combo specialist (Baldr's Ratio)",
                               stat: 'dexterity',  combogym: 'balboas' },
    };

    function getBuild(value) {
        return Object.values(BUILDS).find(b => b.value === value) || BUILDS.none;
    }

    function getComboGym(build) {
        if (!build.combogym) return null;
        return BUILDS[build.combogym] || null;
    }

    function abbrev(stat) {
        return { strength: 'str', defense: 'def', speed: 'spd', dexterity: 'dex' }[stat] || stat;
    }

    function cap(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // ── Stat reading ───────────────────────────────────────────────────────────

    function getStats() {
        const stats = {};
        document.querySelectorAll('h3').forEach(h3 => {
            const name = h3.textContent.trim().toLowerCase();
            if (!['strength', 'defense', 'speed', 'dexterity'].includes(name)) return;
            const span = h3.parentElement?.querySelector('span') || h3.nextElementSibling;
            if (!span) return;
            const val = Number(span.textContent.replace(/[$,\s]/g, '').trim());
            if (!isNaN(val) && val > 0) stats[name] = val;
        });
        return stats;
    }

    // ── Number formatting ──────────────────────────────────────────────────────

    function fmt(n, dec = 1) {
        const tiers = ['', 'k', 'm', 'b', 't'];
        let i = 0, v = Math.abs(n);
        while (v >= 1000 && i < tiers.length - 1) { v /= 1000; i++; }
        return v.toLocaleString('EN', { maximumFractionDigits: dec }) + tiers[i];
    }

    // ── UI injection ───────────────────────────────────────────────────────────

    function injectUI() {
        if (document.getElementById('sk-gym-ratios-panel')) return;

        const root = document.getElementById('gymroot') || document.querySelector('[class*="gymroot"]');
        if (!root) return;

        const savedBuild = localStorage.getItem('sk_gym_build') || 'none';
        const savedDist  = parseInt(localStorage.getItem('sk_gym_safe_dist') || '1000000', 10);
        statSafeDistance = isNaN(savedDist) ? 1000000 : savedDist;

        const panel = document.createElement('div');
        panel.id = 'sk-gym-ratios-panel';
        panel.style.cssText = 'margin-top:10px;';

        const optionsHTML = Object.values(BUILDS)
            .map(b => `<option value="${b.value}"${b.value === savedBuild ? ' selected' : ''}>${b.text}</option>`)
            .join('');

        panel.innerHTML = `
            <div class="title-black top-round" aria-level="5" style="padding:8px 12px;font-weight:bold;">
                Special Gym Ratios
            </div>
                <div class="bottom-round gym-box cont-gray" style="padding:12px;">
                <p class="sub-title" style="margin:0 0 8px;">Select desired specialist build:</p>
                <select id="sk-gym-build-select" style="width:100%;padding:6px;background:#1a1a2e;
                    border:1px solid rgba(255,255,255,0.3);color:#fff;border-radius:4px;margin-bottom:4px;">
                    ${optionsHTML}
                </select>
            </div>
        `;

        root.appendChild(panel);

        document.getElementById('sk-gym-build-select').addEventListener('change', function () {
            localStorage.setItem('sk_gym_build', this.value);
            updateRatios();
        });


    }

    // ── Ratio calculation + DOM update ─────────────────────────────────────────

    function updateRatios() {
        const stats = getStats();
        if (Object.keys(stats).length < 4) return;

        const buildValue = localStorage.getItem('sk_gym_build') || 'none';
        const build = getBuild(buildValue);

        // Clear existing injected status text from all stat containers
        document.querySelectorAll('[class^="gymContent__"],[class*=" gymContent__"]')
            .forEach(section => {
                section.querySelectorAll('li').forEach(li => {
                    li.querySelectorAll('.sk-gym-status').forEach(el => el.remove());
                });
            });

        if (build.value === 'none') return;

        const isComboOnly   = ['balboas', 'frontline'].includes(build.value);
        const isSingleHank  = ['gym3000', 'isoyamas', 'totalrebound', 'elites'].includes(build.value);
        const isComboBaldr  = ['frontlinegym3000', 'balboasisoyamas', 'frontlinetotalrebound', 'balboaselites'].includes(build.value);

        const comboGym = getComboGym(build);

        // Primary combo gym stats
        const comboPrimarySum    = comboGym ? (stats[comboGym.stat1] || 0) + (stats[comboGym.stat2] || 0) : 0;
        const comboSecondarySum  = comboGym ? (stats[comboGym.secondarystat1] || 0) + (stats[comboGym.secondarystat2] || 0) : 0;
        const minPrimaryComboSum = comboSecondarySum * 1.25;
        const maxSecondaryComboSum = comboPrimarySum / 1.25;

        const distanceFromComboMin  = minPrimaryComboSum - comboPrimarySum;
        const distanceToComboMax    = maxSecondaryComboSum - comboSecondarySum;

        // For Hank/Baldr: single stat must be > 1.25× second-highest of the others
        let highestSecondaryStat = 0;
        if (build.stat) {
            Object.entries(stats).forEach(([s, v]) => {
                if (s !== build.stat && v > highestSecondaryStat) highestSecondaryStat = v;
            });
        }
        const minPrimaryStat    = highestSecondaryStat * 1.25;
        const maxSecondaryStat  = build.stat ? (stats[build.stat] || 0) / 1.25 : 0;

        // Build status messages per stat
        const messages = {};
        ['strength', 'defense', 'speed', 'dexterity'].forEach(stat => {
            if (!stats[stat]) return;

            let msg, cls;

            if (isComboOnly) {
                // stat1/stat2 = primary pair; secondarystat1/secondarystat2 = must stay low
                if (stat === comboGym.stat1 || stat === comboGym.stat2) {
                    const label = `${cap(abbrev(comboGym.stat1))} + ${abbrev(comboGym.stat2)}`;
                    if (distanceFromComboMin > 0) {
                        [msg, cls] = [`${label} is ${fmt(distanceFromComboMin)} too low!`, 'danger'];
                    } else if (-distanceFromComboMin < statSafeDistance) {
                        [msg, cls] = [`${label} is ${fmt(-distanceFromComboMin)} above limit (close!)`, 'warn'];
                    } else {
                        [msg, cls] = [`${label} is ${fmt(-distanceFromComboMin)} above limit`, 'good'];
                    }
                } else {
                    const label = `${cap(abbrev(comboGym.secondarystat1))} + ${abbrev(comboGym.secondarystat2)}`;
                    if (distanceToComboMax < 0) {
                        [msg, cls] = [`${label} is ${fmt(-distanceToComboMax)} too high!`, 'danger'];
                    } else if (distanceToComboMax < statSafeDistance) {
                        [msg, cls] = [`${label} is ${fmt(distanceToComboMax)} below limit (close!)`, 'warn'];
                    } else {
                        [msg, cls] = [`${label} is ${fmt(distanceToComboMax)} below limit`, 'good'];
                    }
                }
            } else {
                // Hank or Baldr single-stat ratio
                const distSpecMin = minPrimaryStat - (stats[stat] || 0);
                const distSpecMax = maxSecondaryStat - (stats[stat] || 0);

                let distToMax = 0;
                let label = cap(stat);

                if (stat === build.stat) {
                    if (distSpecMin > 0) {
                        [msg, cls] = [`${label} is ${fmt(distSpecMin)} too low!`, 'danger'];
                        messages[stat] = { msg, cls };
                        return;
                    }
                    if (isSingleHank) {
                        distToMax = distanceToComboMax;
                        if (distToMax < 0) {
                            label = `${cap(abbrev(comboGym.secondarystat1))} + ${abbrev(comboGym.secondarystat2)}`;
                        }
                    } else {
                        distToMax = distSpecMin; // Baldr: specialist IS the combo stat
                    }
                } else if (comboGym && (stat === comboGym.stat1 || stat === comboGym.stat2)) {
                    distToMax = distSpecMax;
                } else {
                    distToMax = Math.min(distSpecMax, distanceToComboMax);
                    if (distanceToComboMax < distSpecMax && distToMax < 0) {
                        label = `${cap(abbrev(comboGym.secondarystat1))} + ${abbrev(comboGym.secondarystat2)}`;
                    }
                }

                if (distToMax < 0) {
                    if (stat === build.stat && isComboBaldr) {
                        [msg, cls] = [`${label} is ${fmt(-distToMax)} above limit`, 'good'];
                    } else {
                        [msg, cls] = [`${label} is ${fmt(-distToMax)} too high!`, 'danger'];
                    }
                } else if (distToMax < statSafeDistance) {
                    [msg, cls] = [`${label} is ${fmt(distToMax)} below limit (close!)`, 'warn'];
                } else {
                    [msg, cls] = [`${label} is ${fmt(distToMax)} below limit`, 'good'];
                }
            }

            messages[stat] = { msg, cls };
        });

        // Inject status into each stat's li
        document.querySelectorAll('[class^="gymContent__"],[class*=" gymContent__"]').forEach(section => {
            section.querySelectorAll('li').forEach(li => {
                const titleEl = li.querySelector('[class^="title__"],[class*=" title__"]');
                const descEl  = li.querySelector('[class^="description__"],[class*=" description__"]');
                if (!titleEl || !descEl) return;

                let statKey = li.getAttribute('data-sk-stat');
                if (!statKey) {
                    statKey = titleEl.textContent.trim().toLowerCase();
                    li.setAttribute('data-sk-stat', statKey);
                }

                const info = messages[statKey];
                if (!info) return;

                const colors = { good: '#4caf50', warn: '#ff9800', danger: '#f44336' };
                const span = document.createElement('span');
                span.className = 'sk-gym-status';
                span.style.cssText = `display:block;font-size:12px;font-weight:${info.cls === 'good' ? 'normal' : 'bold'};color:${colors[info.cls]};margin-top:4px;`;
                span.textContent = info.msg;
                descEl.appendChild(span);
            });
        });

    }

    // ── Navigation watchdog ────────────────────────────────────────────────────

    function isGymPage(url) {
        return url.includes('gym.php');
    }

    function startWatchdog() {
        if (watchdogId) return;
        watchdogId = setInterval(() => {
            const url = window.location.href;
            if (url === lastUrl) return;
            lastUrl = url;

            if (isGymPage(url)) {
                // Tear down any previous UI and start fresh
                const old = document.getElementById('sk-gym-ratios-panel');
                if (old) old.remove();
                stopUpdater();
                scheduleInject();
            } else {
                stopUpdater();
            }
        }, POLL_INTERVAL);
    }

    function stopUpdater() {
        if (updateTimerId) { clearInterval(updateTimerId); updateTimerId = null; }
    }

    function scheduleInject(retries = 0) {
        const root = document.getElementById('gymroot') || document.querySelector('[class*="gymroot"]');
        if (!root) {
            if (retries < 40) setTimeout(() => scheduleInject(retries + 1), 250);
            return;
        }
        injectUI();
        stopUpdater();
        updateRatios();
        updateTimerId = setInterval(updateRatios, UPDATE_INTERVAL);
    }

    // ── Settings persistence ───────────────────────────────────────────────────

    async function loadSettings() {
        return new Promise(resolve => {
            chrome.storage.local.get(['sidekick_settings'], result => {
                const unified = result.sidekick_settings || {};
                const val = unified[STORAGE_KEY];
                isEnabled = (val && typeof val.isEnabled === 'boolean') ? val.isEnabled : false;
                resolve();
            });
        });
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    return {
        name: 'SpecialGymRatios',

        async init() {
            await loadSettings();

            if (!isEnabled) {
                console.log('🏋️ Special Gym Ratios: disabled');
                return;
            }

            console.log('🏋️ Special Gym Ratios: enabled');

            // Immediate check for current page
            if (isGymPage(window.location.href)) {
                scheduleInject();
            }
            lastUrl = window.location.href;

            startWatchdog();

            // React to settings changes from the popup
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.sidekick_settings) {
                    const newSettings = changes.sidekick_settings.newValue || {};
                    const val = newSettings[STORAGE_KEY];
                    isEnabled = val?.isEnabled === true;

                    if (!isEnabled) {
                        stopUpdater();
                        const panel = document.getElementById('sk-gym-ratios-panel');
                        if (panel) panel.remove();
                        // leave watchdog running so re-enabling works without reload
                    } else if (isGymPage(window.location.href)) {
                        scheduleInject();
                    }
                }
            });
        }
    };
})();

if (typeof window.SidekickModules === 'undefined') window.SidekickModules = {};
window.SidekickModules.SpecialGymRatios = SpecialGymRatiosModule;

console.log('🏋️ Special Gym Ratios module registered');
