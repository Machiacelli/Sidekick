/**
 * Sidekick Smart Medical Button
 * Adapted from BBSmalls [3908857] Torn Smart FAK Button v4.43
 * Sidekick port: uses ChromeStorage, universal API key, morphine always included
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'sidekick_smart_medical';

    const PERSONAL_URL = 'https://www.torn.com/item.php';
    const FACTION_URL  = 'https://www.torn.com/factions.php?step=your&type=1#/tab=armoury';

    // Item definitions — morphine always included
    let ITEMS = {
        'Small First Aid Kit': { id: 68, removes: 1200, cd: 600,  baseRemoves: 1200, color: '#c0392b', icon: '🩹' },
        'First Aid Kit':       { id: 67, removes: 2400, cd: 900,  baseRemoves: 2400, color: '#1a6fc4', icon: '🩹' },
        'Morphine':            { id: 66, removes: 4200, cd: 1200, baseRemoves: 4200, color: '#e87722', icon: '💉' },
        'Blood Bag':           { id: null, removes: 7200, cd: 1800, baseRemoves: 7200, color: '#9333ea', icon: '🩸' }
    };

    const BLOOD_BAG_IDS = { 'A+':732,'A-':733,'B+':734,'B-':735,'AB+':736,'AB-':737,'O+':738,'O-':739 };

    let cachedTimer       = 0;
    let isDragging        = false;
    let totalMedicalBonus = 0;
    let isEnabled         = false;
    let settings          = { itemSource: 'Personal Items', bloodType: 'Disabled' };
    let perkFetchInterval = null;
    let pollInterval      = null;
    let cdInterval        = null;

    // ─── Storage ──────────────────────────────────────────────────────────────
    const CS = () => window.SidekickModules?.Core?.ChromeStorage;

    async function loadSettings() {
        if (!CS()) return;
        const saved = await CS().get(STORAGE_KEY) || {};
        isEnabled = saved.isEnabled === true;
        settings.itemSource = saved.itemSource || 'Personal Items';
        settings.bloodType  = saved.bloodType  || 'Disabled';
    }

    async function saveSettings(patch) {
        if (!CS()) return;
        const current = await CS().get(STORAGE_KEY) || {};
        await CS().set(STORAGE_KEY, { ...current, ...patch });
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    const getApiKey = async () => CS() ? (await CS().get('sidekick_api_key') || '') : '';
    const bloodEnabled = () => settings.bloodType !== 'Disabled';

    const formatTime = sec => {
        if (sec <= 0) return 'Out';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s.toString().padStart(2,'0')}s`;
        return `${s}s`;
    };

    const formatCDTime = sec => {
        if (sec <= 0) return null;
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m > 0 ? `${m}m ${s.toString().padStart(2,'0')}s` : `${s}s`;
    };

    function inHospital() { return !!document.querySelector('a[aria-label^="Hospital:"]'); }

    // ─── Medical cooldown ────────────────────────────────────────────────────
    function getMedicalCooldownInfo() {
        try {
            const key = Object.keys(sessionStorage).find(k => /sidebarData\d+/.test(k));
            const data = key ? JSON.parse(sessionStorage.getItem(key)) : null;
            const med = data?.statusIcons?.icons?.medical_cooldown;
            if (!med) return null;
            const remaining = Math.max(0, Math.round(med.timerExpiresAt - Date.now() / 1000));
            return { remaining, isActive: remaining > 0 };
        } catch { return null; }
    }

    // ─── API: Perks ───────────────────────────────────────────────────────────
    async function fetchPerks() {
        const key = await getApiKey();
        if (!key || key.length !== 16) return;
        try {
            const res  = await fetch(`https://api.torn.com/user/?selections=education,perks&key=${encodeURIComponent(key)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.error) return;
            let bonus = 0;
            [...(data.education_perks || []), ...(data.faction_perks || [])].forEach(p => {
                if (typeof p === 'string' && p.includes('medical item effectiveness')) {
                    const m = p.match(/(\d+)%/);
                    if (m) bonus += parseInt(m[1], 10);
                }
            });
            totalMedicalBonus = Math.min(bonus, 50);
            const mult = 1 + totalMedicalBonus / 100;
            Object.keys(ITEMS).forEach(n => { ITEMS[n].removes = Math.round(ITEMS[n].baseRemoves * mult); });
            updateDisplay();
        } catch {}
    }

    // ─── Item selection ───────────────────────────────────────────────────────
    function selectBestItem(timer) {
        if (timer <= 0) return null;
        const available = [
            { name: 'Small First Aid Kit', ...ITEMS['Small First Aid Kit'] },
            { name: 'First Aid Kit',       ...ITEMS['First Aid Kit'] },
            { name: 'Morphine',            ...ITEMS['Morphine'] },
        ];
        if (bloodEnabled()) available.push({
            name: 'Blood Bag',
            id:   BLOOD_BAG_IDS[settings.bloodType],
            ...ITEMS['Blood Bag']
        });
        available.sort((a, b) => a.removes - b.removes);
        for (const item of available) if (item.removes >= timer) return item;
        return available.reduce((best, item) =>
            (item.removes / item.cd) > (best.removes / best.cd) ? item : best
        );
    }

    // ─── Display ──────────────────────────────────────────────────────────────
    function updateDisplay() {
        const el = document.getElementById('sk-med-floater');
        if (!el) return;

        const timerEl  = el.querySelector('#sk-med-timer');
        const ringEl   = el.querySelector('#sk-med-ring');
        const labelEl  = el.querySelector('#sk-med-label');
        const cdEl     = el.querySelector('#sk-med-cd');
        const glowEl   = el.querySelector('#sk-med-glow');

        const hosp = inHospital();
        const item = hosp && cachedTimer > 0 ? selectBestItem(cachedTimer) : null;

        // Timer text
        if (timerEl) timerEl.textContent = (hosp && cachedTimer > 0) ? formatTime(cachedTimer) : (hosp ? '...' : '—');

        // Item label
        if (labelEl) {
            if (item) {
                const shortNames = {
                    'Small First Aid Kit': 'Small FAK',
                    'First Aid Kit': 'FAK',
                    'Morphine': 'Morphine',
                    'Blood Bag': `BB ${settings.bloodType}`
                };
                labelEl.textContent = shortNames[item.name] || item.name;
            } else {
                labelEl.textContent = hosp ? '...' : '';
            }
        }

        // Ring color gradient based on best item
        const itemColor = item?.color || (hosp ? '#5fcc6a' : '#444');
        if (ringEl) {
            ringEl.style.stroke = itemColor;
        }
        if (glowEl) {
            glowEl.style.filter = `drop-shadow(0 0 8px ${itemColor}60)`;
        }

        // Medical CD badge
        const med = getMedicalCooldownInfo();
        if (cdEl) {
            const cdTime = med?.isActive ? formatCDTime(med.remaining) : null;
            cdEl.style.display = cdTime ? 'flex' : 'none';
            cdEl.textContent = cdTime || '';
        }
    }

    // ─── Position / dragging ─────────────────────────────────────────────────
    const POS_KEY = 'sk-med-pos';
    const savePos = (x, y) => {
        try { localStorage.setItem(POS_KEY, JSON.stringify({ xPct: x/window.innerWidth, yPct: y/window.innerHeight })); } catch {}
    };
    const loadPos = () => {
        try {
            const p = JSON.parse(localStorage.getItem(POS_KEY));
            return p ? { x: Math.round(p.xPct*window.innerWidth), y: Math.round(p.yPct*window.innerHeight) } : null;
        } catch { return null; }
    };
    const clamp = (x, y, w, h) => ({
        x: Math.min(Math.max(8, x), window.innerWidth  - w - 8),
        y: Math.min(Math.max(8, y), window.innerHeight - h - 8)
    });

    function enableDragging(el, handle) {
        let drag=false, startX, startY, initX, initY;
        const start = e => {
            drag=true; isDragging=false;
            const ev = e.touches ? e.touches[0] : e;
            startX=ev.clientX; startY=ev.clientY; initX=el.offsetLeft; initY=el.offsetTop;
            e.preventDefault();
        };
        const move = e => {
            if (!drag) return;
            const ev = e.touches ? e.touches[0] : e;
            const dx=ev.clientX-startX, dy=ev.clientY-startY;
            if (Math.abs(dx)>5 || Math.abs(dy)>5) isDragging=true;
            const r=el.getBoundingClientRect();
            const c=clamp(initX+dx, initY+dy, r.width, r.height);
            el.style.left=c.x+'px'; el.style.top=c.y+'px'; el.style.right='auto';
        };
        const end = () => {
            if (!drag) return; drag=false;
            const r=el.getBoundingClientRect();
            const c=clamp(r.left, r.top, r.width, r.height);
            el.style.left=c.x+'px'; el.style.top=c.y+'px';
            savePos(c.x, c.y);
            setTimeout(() => isDragging=false, 50);
        };
        handle.addEventListener('mousedown', start);
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', end);
        handle.addEventListener('touchstart', start, { passive: false });
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('touchend', end);
    }

    // ─── Hospital polling ─────────────────────────────────────────────────────
    async function fetchHospitalTime() {
        try {
            const res  = await fetch('/page.php?sid=UserApiData', { credentials:'include', headers:{'X-Requested-With':'XMLHttpRequest'} });
            const data = await res.json();
            const until = Number(data?.hospitalstamp) || 0;
            const now   = Math.floor(Date.now()/1000);
            return until > now ? Math.max(0, until-now) : 0;
        } catch { return inHospital() ? cachedTimer||60 : 0; }
    }

    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            if (!isEnabled) return;
            const hosp = inHospital();
            const t = hosp ? await fetchHospitalTime() : 0;
            if (t !== cachedTimer) { cachedTimer = t; updateDisplay(); }
        }, 2000);

        // CD updates every second
        if (cdInterval) clearInterval(cdInterval);
        cdInterval = setInterval(() => updateDisplay(), 1000);
    }

    // ─── Item use ─────────────────────────────────────────────────────────────
    async function useItem(item) {
        if (!item?.id) return false;
        try {
            const body = new URLSearchParams({ step:'useItem', itemID: item.id.toString() });
            if (settings.itemSource === 'Faction Armory') body.set('fac', '1');
            const res = await fetch('https://www.torn.com/item.php', {
                method:'POST', body, credentials:'include',
                headers:{'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest'}
            });
            return res.ok;
        } catch { return false; }
    }

    function isOnPersonalPage(){ return window.location.href.toLowerCase().includes('item.php'); }
    function isOnFactionPage() {
        const u = window.location.href.toLowerCase();
        return u.includes('factions.php') && u.includes('tab=armoury');
    }
    function isOnCorrectPage() {
        return (settings.itemSource === 'Personal Items' && isOnPersonalPage()) ||
               (settings.itemSource === 'Faction Armory' && isOnFactionPage());
    }

    async function onButtonClick() {
        if (isDragging || cachedTimer <= 0 || !inHospital()) return;
        const item = selectBestItem(cachedTimer);
        if (!item) return;

        const el = document.getElementById('sk-med-floater');
        if (el) {
            el.style.transform = 'scale(0.9)';
            setTimeout(() => { el.style.transform = ''; }, 150);
        }

        if (isOnCorrectPage()) {
            const ok = await useItem(item);
            if (ok) {
                cachedTimer = Math.max(0, cachedTimer - (item.removes || 1200));
                updateDisplay();
                setTimeout(async () => {
                    cachedTimer = await fetchHospitalTime();
                    updateDisplay();
                }, 1500);
            }
        } else {
            window.location.href = settings.itemSource === 'Faction Armory' ? FACTION_URL : PERSONAL_URL;
        }
    }

    // ─── Styles ───────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('sk-med-styles')) return;
        const style = document.createElement('style');
        style.id = 'sk-med-styles';
        style.textContent = `
            #sk-med-floater {
                position: fixed;
                z-index: 999998;
                width: 72px;
                user-select: none;
                transition: transform .12s ease;
                right: 16px;
                top: 130px;
            }
            #sk-med-body {
                position: relative;
                width: 72px;
                height: 72px;
                cursor: pointer;
                transition: transform .15s ease;
            }
            #sk-med-svg {
                position: absolute;
                top: 0; left: 0;
                width: 72px; height: 72px;
                filter: drop-shadow(0 2px 8px rgba(0,0,0,0.6));
            }
            #sk-med-bg-circle {
                fill: #1a2332;
                stroke: rgba(95,204,106,0.15);
                stroke-width: 1.5;
            }
            #sk-med-ring {
                fill: none;
                stroke: #5fcc6a;
                stroke-width: 3;
                stroke-linecap: round;
                transition: stroke .3s ease;
                transform-origin: 36px 36px;
                transform: rotate(-90deg);
            }
            #sk-med-cross rect {
                fill: rgba(255,255,255,0.35);
            }
            #sk-med-inner {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                pointer-events: none;
                gap: 1px;
            }
            #sk-med-timer {
                font-size: 11px;
                font-weight: 800;
                color: #e8f5e9;
                font-family: 'Inter', 'Roboto', monospace;
                text-shadow: 0 1px 6px rgba(0,0,0,0.9);
                letter-spacing: -0.5px;
                line-height: 1;
            }
            #sk-med-label {
                font-size: 8px;
                color: rgba(95,204,106,0.7);
                font-family: 'Inter', 'Roboto', sans-serif;
                text-align: center;
                line-height: 1.1;
                max-width: 60px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #sk-med-cd {
                position: absolute;
                bottom: -20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(139, 0, 0, 0.85);
                border: 1px solid rgba(255,80,80,0.25);
                border-radius: 8px;
                padding: 2px 6px;
                font-size: 9px;
                font-weight: 700;
                color: #ffaaaa;
                font-family: 'Inter', 'Roboto', sans-serif;
                white-space: nowrap;
                display: none;
                backdrop-filter: blur(4px);
            }
            #sk-med-floater:hover #sk-med-body {
                transform: scale(1.07);
            }
            #sk-med-floater:active #sk-med-body {
                transform: scale(0.95);
            }
        `;
        document.head.appendChild(style);
    }

    // ─── UI injection ─────────────────────────────────────────────────────────
    function injectUI() {
        if (document.getElementById('sk-med-floater')) return;

        const floater = document.createElement('div');
        floater.id = 'sk-med-floater';

        // SVG ring with cross icon
        floater.innerHTML = `
            <div id="sk-med-body" title="Click to use best medical item · Drag to move">
                <svg id="sk-med-svg" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
                    <g id="sk-med-glow">
                        <circle id="sk-med-bg-circle" cx="36" cy="36" r="33"/>
                        <!-- Dashed ring track -->
                        <circle cx="36" cy="36" r="30"
                            fill="none"
                            stroke="rgba(255,255,255,0.05)"
                            stroke-width="3"
                            stroke-dasharray="3 4"/>
                        <!-- Active ring -->
                        <circle id="sk-med-ring"
                            cx="36" cy="36" r="30"
                            stroke-dasharray="188.5"
                            stroke-dashoffset="0"/>
                        <!-- Medical cross icon -->
                        <g id="sk-med-cross">
                            <!-- Horizontal bar -->
                            <rect x="24" y="31" width="24" height="10" rx="2.5" />
                            <!-- Vertical bar -->
                            <rect x="31" y="24" width="10" height="24" rx="2.5" />
                        </g>
                    </g>
                </svg>
                <div id="sk-med-inner">
                    <div id="sk-med-timer">—</div>
                    <div id="sk-med-label">Ready</div>
                </div>
            </div>
            <div id="sk-med-cd"></div>
        `;

        document.body.appendChild(floater);

        // Position
        const pos = loadPos();
        if (pos) {
            const c = clamp(pos.x, pos.y, 72, 72);
            floater.style.left = c.x + 'px';
            floater.style.top  = c.y + 'px';
            floater.style.right = 'auto';
        }

        const body = floater.querySelector('#sk-med-body');
        body.addEventListener('click', onButtonClick);
        body.addEventListener('touchend', e => { if (!isDragging) { e.preventDefault(); onButtonClick(); } }, { passive: false });

        enableDragging(floater, body);
        window.addEventListener('resize', () => {
            const r = floater.getBoundingClientRect();
            const c = clamp(r.left, r.top, r.width, r.height);
            floater.style.left = c.x + 'px'; floater.style.top = c.y + 'px';
        });
    }

    function removeUI() {
        document.getElementById('sk-med-floater')?.remove();
        document.getElementById('sk-med-styles')?.remove();
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        if (cdInterval)   { clearInterval(cdInterval);   cdInterval   = null; }
        if (perkFetchInterval) { clearInterval(perkFetchInterval); perkFetchInterval = null; }
    }

    // ─── Module API ───────────────────────────────────────────────────────────
    const SmartMedicalButton = {
        name: 'SmartMedicalButton',

        async initialize() {
            if (!window.SidekickModules?.Core?.ChromeStorage) return;
            await loadSettings();
            if (!isEnabled) return;
            injectStyles();
            injectUI();
            cachedTimer = inHospital() ? await fetchHospitalTime() : 0;
            updateDisplay();
            startPolling();
            setTimeout(() => fetchPerks(), 2000);
            perkFetchInterval = setInterval(() => fetchPerks(), 15 * 60 * 1000);
            console.log('[Sidekick] Smart Medical Button initialized');
        },

        async enable() {
            isEnabled = true;
            await saveSettings({ isEnabled: true });
            injectStyles();
            injectUI();
            cachedTimer = inHospital() ? await fetchHospitalTime() : 0;
            updateDisplay();
            startPolling();
            if (!perkFetchInterval) {
                setTimeout(() => fetchPerks(), 500);
                perkFetchInterval = setInterval(() => fetchPerks(), 15*60*1000);
            }
        },

        async disable() {
            isEnabled = false;
            await saveSettings({ isEnabled: false });
            removeUI();
        },

        async updateSetting(key, value) {
            settings[key] = value;
            await saveSettings({ [key]: value });
            updateDisplay();
        },

        destroy() { removeUI(); }
    };

    if (!window.SidekickModules) window.SidekickModules = {};
    window.SidekickModules.SmartMedicalButton = SmartMedicalButton;

    const tryInit = () => {
        if (window.SidekickModules?.Core?.ChromeStorage) {
            SmartMedicalButton.initialize();
        } else {
            setTimeout(tryInit, 200);
        }
    };
    tryInit();

})();
