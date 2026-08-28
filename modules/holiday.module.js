/**
 * Egg Helper Module - Easter Egg Hunt Helper
 * Version: 4.1.0
 */

const EGG_HUNT_PAGES = [
    // Core
    { label: "Home", url: "/" },
    { label: "Index", url: "/index.php" },
    { label: "Preferences", url: "/preferences.php" },
    { label: "Personal Stats", url: "/personalstats.php" },
    { label: "Player Report", url: "/playerreport.php" },
    { label: "Activity Log", url: "/page.php?sid=log" },
    { label: "Events", url: "/page.php?sid=events" },
    { label: "Profile", url: "/profiles.php?XID=1" },
    { label: "Awards", url: "/page.php?sid=awards" },
    { label: "Hall of Fame", url: "/page.php?sid=hof" },
    { label: "Revive", url: "/revive.php" },
    { label: "PC", url: "/pc.php" },
    { label: "Gallery", url: "/page.php?sid=gallery&XID=1" },
    // City
    { label: "City", url: "/city.php" },
    { label: "City Stats", url: "/citystats.php" },
    { label: "Users Online", url: "/usersonline.php" },
    { label: "User List", url: "/page.php?sid=UserList" },
    { label: "People", url: "/index.php?page=people" },
    { label: "Fortune Teller", url: "/index.php?page=fortune" },
    { label: "Rehab", url: "/index.php?page=rehab" },
    { label: "Hunting", url: "/index.php?page=hunting" },
    // Items / Inventory
    { label: "Items", url: "/item.php" },
    { label: "Item Mods", url: "/page.php?sid=itemsMods" },
    { label: "Ammo", url: "/page.php?sid=ammo" },
    { label: "Item Use Parcel", url: "/itemuseparcel.php" },
    { label: "Display Case", url: "/displaycase.php" },
    { label: "Display Case - Add", url: "/displaycase.php#add" },
    { label: "Display Case - Manage", url: "/displaycase.php#manage" },
    { label: "Keepsakes", url: "/page.php?sid=keepsakes" },
    { label: "Trade", url: "/trade.php" },
    { label: "Museum", url: "/museum.php" },
    // Market
    { label: "Auction Market", url: "/amarket.php" },
    { label: "Point Market", url: "/pmarket.php" },
    { label: "Item Market", url: "/page.php?sid=ItemMarket" },
    { label: "Bazaar", url: "/page.php?sid=bazaar" },
    { label: "Bazaar - User View", url: "/bazaar.php?userId=1" },
    { label: "Bazaar - Add Items", url: "/bazaar.php#/add" },
    { label: "Bazaar - Personalize", url: "/bazaar.php#/personalize" },
    { label: "Bazaar - Manage", url: "/bazaar.php#/manage" },
    // Finance
    { label: "Stocks", url: "/page.php?sid=stocks" },
    { label: "Bank", url: "/bank.php" },
    { label: "Points", url: "/points.php" },
    { label: "Points Page", url: "/page.php?sid=points" },
    { label: "Loan", url: "/loan.php" },
    { label: "Donator", url: "/donator.php" },
    { label: "Token Shop", url: "/token_shop.php" },
    { label: "Freebies", url: "/freebies.php" },
    { label: "Bring a Friend", url: "/bringafriend.php" },
    { label: "Bounties", url: "/bounties.php" },
    // Shops
    { label: "Big Al's Gun Shop", url: "/bigalgunshop.php" },
    { label: "Bits N' Bobs", url: "/shops.php?step=bitsnbobs" },
    { label: "Cyberforce", url: "/shops.php?step=cyberforce" },
    { label: "Docks", url: "/shops.php?step=docks" },
    { label: "Jewelry", url: "/shops.php?step=jewelry" },
    { label: "Nike-H", url: "/shops.php?step=nikeh" },
    { label: "Pawn Shop", url: "/shops.php?step=pawnshop" },
    { label: "Pharmacy", url: "/shops.php?step=pharmacy" },
    { label: "Post Office", url: "/shops.php?step=postoffice" },
    { label: "Print Store", url: "/shops.php?step=printstore" },
    { label: "Recycling Center", url: "/shops.php?step=recyclingcenter" },
    { label: "Supermarket", url: "/shops.php?step=super" },
    { label: "Candy Shop", url: "/shops.php?step=candy" },
    { label: "Clothes Shop", url: "/shops.php?step=clothes" },
    { label: "Bunker", url: "/page.php?sid=bunker" },
    // Property
    { label: "Properties", url: "/properties.php" },
    { label: "Property - Rental Market", url: "/properties.php?step=rentalmarket" },
    { label: "Property - Selling Market", url: "/properties.php?step=sellingmarket" },
    { label: "Estate Agents", url: "/estateagents.php" },
    // Casino
    { label: "Casino", url: "/casino.php" },
    { label: "Slots", url: "/page.php?sid=slots" },
    { label: "Slots - Stats", url: "/page.php?sid=slotsStats" },
    { label: "Slots - Last Rolls", url: "/page.php?sid=slotsLastRolls" },
    { label: "Roulette", url: "/page.php?sid=roulette" },
    { label: "Roulette - Statistics", url: "/page.php?sid=rouletteStatistics" },
    { label: "Roulette - Last Spins", url: "/page.php?sid=rouletteLastSpins" },
    { label: "High/Low", url: "/page.php?sid=highlow" },
    { label: "High/Low - Stats", url: "/page.php?sid=highlowStats" },
    { label: "High/Low - Last Games", url: "/page.php?sid=highlowLastGames" },
    { label: "Keno", url: "/page.php?sid=keno" },
    { label: "Keno - Statistics", url: "/page.php?sid=kenoStatistics" },
    { label: "Keno - Last Games", url: "/page.php?sid=kenoLastGames" },
    { label: "Craps", url: "/page.php?sid=craps" },
    { label: "Craps - Stats", url: "/page.php?sid=crapsStats" },
    { label: "Craps - Last Rolls", url: "/page.php?sid=crapsLastRolls" },
    { label: "Bookie", url: "/page.php?sid=bookie" },
    { label: "Lottery", url: "/page.php?sid=lottery" },
    { label: "Lottery - Tickets Bought", url: "/page.php?sid=lotteryTicketsBought" },
    { label: "Lottery - Previous Winners", url: "/page.php?sid=lotteryPreviousWinners" },
    { label: "Blackjack", url: "/page.php?sid=blackjack" },
    { label: "Blackjack - Statistics", url: "/page.php?sid=blackjackStatistics" },
    { label: "Blackjack - Last Games", url: "/page.php?sid=blackjackLastGames" },
    { label: "Hold'em", url: "/page.php?sid=holdem" },
    { label: "Hold'em - Stats", url: "/page.php?sid=holdemStats" },
    { label: "Russian Roulette", url: "/page.php?sid=russianRoulette" },
    { label: "Russian Roulette - Statistics", url: "/page.php?sid=russianRouletteStatistics" },
    { label: "Russian Roulette - Last Games", url: "/page.php?sid=russianRouletteLastGames" },
    { label: "Spin The Wheel", url: "/page.php?sid=spinTheWheel" },
    { label: "Spin Wheel - Last Spins", url: "/page.php?sid=spinTheWheelLastSpins" },
    // Crimes
    { label: "Dump", url: "/dump.php" },
    { label: "Crimes 1.0", url: "/crimes.php" },
    { label: "Crimes 2.0", url: "/page.php?sid=crimes" },
    { label: "Crimes 2.0 (alt)", url: "/page.php?sid=crimes2" },
    { label: "Criminal Records", url: "/page.php?sid=crimesRecord" },
    { label: "Crimes - Search for Cash", url: "/loader.php?sid=crimes#/searchforcash" },
    { label: "Crimes - Bootlegging", url: "/loader.php?sid=crimes#/bootlegging" },
    { label: "Crimes - Graffiti", url: "/loader.php?sid=crimes#/graffiti" },
    { label: "Crimes - Shoplifting", url: "/loader.php?sid=crimes#/shoplifting" },
    { label: "Crimes - Pickpocketing", url: "/loader.php?sid=crimes#/pickpocketing" },
    { label: "Crimes - Card Skimming", url: "/loader.php?sid=crimes#/cardskimming" },
    { label: "Crimes - Burglary", url: "/loader.php?sid=crimes#/burglary" },
    { label: "Crimes - Hustling", url: "/loader.php?sid=crimes#/hustling" },
    { label: "Crimes - Disposal", url: "/loader.php?sid=crimes#/disposal" },
    { label: "Crimes - Cracking", url: "/loader.php?sid=crimes#/cracking" },
    { label: "Crimes - Forgery", url: "/loader.php?sid=crimes#/forgery" },
    { label: "Crimes - Scamming", url: "/loader.php?sid=crimes#/scamming" },
    { label: "Crimes - Arson", url: "/page.php?sid=crimes#/arson" },
    // Missions / Racing
    { label: "Missions", url: "/loader.php?sid=missions" },
    { label: "Racing", url: "/loader.php?sid=racing" },
    // Factions
    { label: "Factions", url: "/factions.php" },
    { label: "Faction - Crimes", url: "/factions.php?step=your#/tab=crimes" },
    { label: "Faction - Rank", url: "/factions.php?step=your#/tab=rank" },
    { label: "Faction - Controls", url: "/factions.php?step=your#/tab=controls" },
    { label: "Faction - Info", url: "/factions.php?step=your#/tab=info" },
    { label: "Faction - Upgrades", url: "/factions.php?step=your#/tab=upgrades" },
    { label: "Faction - Armoury", url: "/factions.php?step=your#/tab=armoury" },
    { label: "Faction Warfare", url: "/page.php?sid=factionWarfare" },
    // War reports
    { label: "War - Rank Report", url: "/war.php?step=rankreport&rankID=69" },
    { label: "War - War Report", url: "/war.php?step=warreport&warID=420" },
    { label: "War - Raid Report", url: "/war.php?step=raidreport&raidID=69" },
    { label: "War - Chain Report", url: "/war.php?step=chainreport&chainID=69420" },
    // Jobs / Companies
    { label: "Jobs", url: "/jobs.php" },
    { label: "Job List", url: "/joblist.php" },
    { label: "Job Listing", url: "/joblisting.php" },
    { label: "Companies", url: "/companies.php" },
    // Education / Gym / Travel
    { label: "Education", url: "/education.php" },
    { label: "Education (v2)", url: "/page.php?sid=education" },
    { label: "Gym", url: "/gym.php" },
    { label: "Travel", url: "/page.php?sid=travel" },
    // Hospital / Jail
    { label: "Hospital", url: "/hospitalview.php" },
    { label: "Jail", url: "/jailview.php" },
    // Social / Lists
    { label: "Friends List", url: "/page.php?sid=list&type=friends" },
    { label: "Enemies List", url: "/page.php?sid=list&type=enemies" },
    { label: "Targets List", url: "/page.php?sid=list&type=targets" },
    { label: "Fans", url: "/fans.php" },
    { label: "Personals", url: "/personals.php" },
    // Messages
    { label: "Messages", url: "/messages.php" },
    { label: "Messages - Outbox", url: "/messages.php#/p=outbox" },
    { label: "Messages - Saved", url: "/messages.php#/p=saved" },
    { label: "Messages - Compose", url: "/messages.php#/p=compose" },
    { label: "Messages - Ignore List", url: "/messages.php#/p=ignorelist" },
    { label: "Message Inc", url: "/messageinc.php" },
    { label: "Message Inc 2", url: "/messageinc2.php" },
    // Forums / News
    { label: "Forums", url: "/forums.php" },
    { label: "Newspaper", url: "/newspaper.php" },
    { label: "Newspaper Class", url: "/newspaper_class.php" },
    { label: "Comics", url: "/comics.php" },
    { label: "Archives", url: "/archives.php" },
    // Info pages
    { label: "Rules", url: "/rules.php" },
    { label: "Staff", url: "/staff.php" },
    { label: "Credits", url: "/credits.php" },
    { label: "Committee", url: "/committee.php" },
    { label: "Calendar", url: "/calendar.php" },
    { label: "Competition", url: "/competition.php" },
    { label: "Church", url: "/church.php" },
    { label: "Church - Proposals", url: "/church.php?step=proposals" },
    { label: "Blacklist", url: "/blacklist.php" },
    { label: "Christmas Town", url: "/christmas_town.php" },
];

// ---------------------------------------------------------------------------
// Egg Hunt Tool
// ---------------------------------------------------------------------------

const EggHuntTool = {
    STORAGE_KEY: 'sidekick_holiday_eggHunt',
    PANEL_ID: 'sk-egg-panel',
    MINI_ID: 'sk-egg-mini',
    STYLES_ID: 'sk-egg-styles',
    OVERLAY_ID: 'sk-egg-overlay',

    state: { idx: 0, panelX: null, panelY: null, collapsed: false, eggsFound: 0, visited: [] },

    panel: null, miniBtn: null, _prevBtn: null, _nextBtn: null,
    _overlay: null, _eggObserver: null, _navBlocker: null,
    _eggQueue: [], _overlayActive: false, _longPressed: false,
    _progressFill: null, _visitedLabel: null, _eggCountLabel: null,

    async loadState() {
        try { const d = await window.SidekickModules.Core.ChromeStorage.get(this.STORAGE_KEY); if (d) Object.assign(this.state, d); } catch (e) { }
    },
    async saveState() {
        try { await window.SidekickModules.Core.ChromeStorage.set(this.STORAGE_KEY, { ...this.state }); } catch (e) { }
    },

    async init() {
        if (document.getElementById(this.PANEL_ID)) return;
        this._ensureStyles();
        await this.loadState();
        this._buildPanel();
        this._setupEggDetection();
        this._bindKeyboard();
    },

    destroy() {
        document.getElementById(this.PANEL_ID)?.remove();
        document.getElementById(this.MINI_ID)?.remove();
        document.getElementById(this.STYLES_ID)?.remove();
        this._removeEggOverlay();
        if (this._eggObserver) { this._eggObserver.disconnect(); this._eggObserver = null; }
        this._eggQueue = []; this._overlayActive = false;
        this.panel = null; this.miniBtn = null; this._prevBtn = null; this._nextBtn = null;
    },

    _ensureStyles() {
        if (document.getElementById(this.STYLES_ID)) return;
        const s = document.createElement('style');
        s.id = this.STYLES_ID;
        s.textContent = `
            #sk-egg-panel,#sk-egg-panel *{box-sizing:border-box;font-family:Arial,sans-serif}
            #sk-egg-panel{position:fixed;z-index:2147483640;width:230px;background:#1a1a1a;border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden;box-shadow:0 6px 28px rgba(0,0,0,.6);user-select:none}
            #sk-egg-header{display:flex;align-items:center;gap:6px;padding:10px 10px 10px 13px;background:#242424;border-bottom:1px solid rgba(255,255,255,.08);cursor:grab}
            #sk-egg-header:active{cursor:grabbing}
            #sk-egg-title{flex:1;font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.04em}
            .sk-egg-hbtn{width:20px;height:20px;border:none;background:rgba(255,255,255,.07);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.45);font-size:11px;flex-shrink:0;padding:0;transition:background .15s,color .15s}
            .sk-egg-hbtn:hover{background:rgba(102,187,106,.2);color:#66BB6A}
            #sk-egg-body{max-height:200px;overflow:hidden;transition:max-height .22s ease,opacity .18s ease;opacity:1}
            #sk-egg-panel.sk-collapsed #sk-egg-body{max-height:0;opacity:0}
            #sk-egg-stats{padding:12px 13px 6px}
            #sk-egg-track{height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;margin-bottom:9px}
            #sk-egg-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,#66BB6A,#43A047);transition:width .4s ease}
            .sk-egg-stat{font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px}
            .sk-egg-stat span{color:#66BB6A;font-weight:700}
            #sk-egg-controls{display:flex;gap:6px;padding:8px 10px 10px}
            .sk-egg-btn{border:none;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;transition:filter .15s,transform .1s}
            .sk-egg-btn:active{transform:scale(.93)}
            .sk-egg-prev{width:32px;height:32px;flex-shrink:0;background:rgba(255,255,255,.07);color:rgba(255,255,255,.55);font-size:13px}
            .sk-egg-prev:hover{background:rgba(255,255,255,.13);color:#fff}
            .sk-egg-next{flex:1;height:32px;background:linear-gradient(135deg,#66BB6A,#43A047);color:#fff;font-size:11px;letter-spacing:.04em;text-transform:uppercase;box-shadow:0 2px 10px rgba(66,175,80,.25)}
            .sk-egg-next:hover{filter:brightness(1.1)}
            .sk-egg-next:disabled,.sk-egg-prev:disabled{opacity:.35;cursor:not-allowed;filter:none;transform:none}
            #sk-egg-hint{font-size:10px;color:rgba(255,255,255,.25);text-align:center;padding:0 10px 8px;font-family:Arial,sans-serif}
            #sk-egg-mini{position:fixed;width:38px;height:38px;background:#1a1a1a;border:1px solid rgba(102,187,106,.45);border-radius:50%;cursor:pointer;z-index:2147483640;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 3px 12px rgba(0,0,0,.5);transition:transform .2s,box-shadow .2s;touch-action:none}
            #sk-egg-mini:hover{transform:scale(1.1);box-shadow:0 4px 16px rgba(102,187,106,.4)}
            /* Backdrop overlay — egg button stays in Torn's DOM, only backdrop is injected */
            #sk-egg-overlay{position:fixed;inset:0;z-index:2147483641;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto}
            #sk-egg-overlay-title{font-size:clamp(24px,4.5vw,40px);font-weight:900;color:#66BB6A;text-align:center;letter-spacing:.06em;text-shadow:0 0 30px rgba(102,187,106,.5);animation:sk-ov-pulse 1.4s ease-in-out infinite;margin-bottom:24px;font-family:Arial,sans-serif}
            @keyframes sk-ov-pulse{0%,100%{transform:scale(1);text-shadow:0 0 30px rgba(102,187,106,.5)}50%{transform:scale(1.04);text-shadow:0 0 55px rgba(102,187,106,.8)}}
            #sk-egg-overlay-sub{font-size:14px;color:rgba(255,255,255,.5);font-family:Arial,sans-serif;text-align:center;margin-bottom:10px}
            #sk-egg-overlay-badge{padding:3px 12px;background:rgba(102,187,106,.15);border:1px solid rgba(102,187,106,.3);border-radius:20px;font-size:12px;color:rgba(255,255,255,.6);font-family:Arial,sans-serif;margin-bottom:22px}
            #sk-egg-overlay-skip{padding:7px 18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);border-radius:6px;cursor:pointer;font-size:11px;font-family:Arial,sans-serif;transition:all .2s}
            #sk-egg-overlay-skip:hover{background:rgba(255,255,255,.12);color:rgba(255,255,255,.7)}
            /* Repositioned egg button — stays in original DOM, just visually centered */
            #easter-egg-hunt-root button.__sk-egg-btn-float{
                position:fixed!important;
                top:50%!important;left:50%!important;
                transform:translate(-50%,-50%)!important;
                width:min(60vmin,480px)!important;height:min(60vmin,480px)!important;
                z-index:2147483642!important;
                cursor:pointer!important;
                border:3px solid rgba(102,187,106,.85)!important;
                border-radius:50%!important;
                box-shadow:0 0 0 6px rgba(102,187,106,.18),0 0 50px 10px rgba(102,187,106,.45)!important;
                animation:sk-egg-pop .45s cubic-bezier(.34,1.56,.64,1) both!important;
                display:flex!important;align-items:center!important;justify-content:center!important;
                overflow:visible!important;background:transparent!important;
            }
            @keyframes sk-egg-pop{from{transform:translate(-50%,-50%) scale(.2) rotate(-10deg);opacity:0}to{transform:translate(-50%,-50%) scale(1) rotate(0);opacity:1}}
            #easter-egg-hunt-root button.__sk-egg-btn-float img,
            #easter-egg-hunt-root button.__sk-egg-btn-float>*:first-child{
                width:100%!important;height:100%!important;object-fit:contain!important;
            }
        `;
        document.head.appendChild(s);
    },

    _buildPanel() {
        const W = 230;
        this.panel = document.createElement('div');
        this.panel.id = this.PANEL_ID;
        if (this.state.collapsed) this.panel.classList.add('sk-collapsed');
        const px = Math.max(0, Math.min(this.state.panelX ?? (window.innerWidth - W - 12), window.innerWidth - W));
        const py = Math.max(0, Math.min(this.state.panelY ?? 16, window.innerHeight - 120));
        this.panel.style.left = px + 'px'; this.panel.style.top = py + 'px';

        const header = document.createElement('div'); header.id = 'sk-egg-header';
        const title = document.createElement('div'); title.id = 'sk-egg-title'; title.textContent = '🥚 Egg Hunt';

        const resetBtn = this._hbtn('↺', 'Reset all progress');
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Reset all egg hunt progress? This clears visited pages and egg count.')) {
                this.state.visited = []; this.state.idx = 0; this.state.eggsFound = 0;
                this.saveState(); this._updateUI();
            }
        });
        const collapseBtn = this._hbtn(this.state.collapsed ? '▲' : '▼', 'Collapse');
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.state.collapsed = !this.state.collapsed;
            this.panel.classList.toggle('sk-collapsed', this.state.collapsed);
            collapseBtn.textContent = this.state.collapsed ? '▲' : '▼';
            this.saveState();
        });
        const hideBtn = this._hbtn('✕', 'Minimise');
        hideBtn.addEventListener('click', (e) => { e.stopPropagation(); this._showMini(); });
        header.append(title, resetBtn, collapseBtn, hideBtn);

        const body = document.createElement('div'); body.id = 'sk-egg-body';
        const stats = document.createElement('div'); stats.id = 'sk-egg-stats';
        const track = document.createElement('div'); track.id = 'sk-egg-track';
        this._progressFill = document.createElement('div'); this._progressFill.id = 'sk-egg-fill';
        track.appendChild(this._progressFill);
        this._visitedLabel = document.createElement('div'); this._visitedLabel.className = 'sk-egg-stat';
        this._eggCountLabel = document.createElement('div'); this._eggCountLabel.className = 'sk-egg-stat';
        stats.append(track, this._visitedLabel, this._eggCountLabel);

        const controls = document.createElement('div'); controls.id = 'sk-egg-controls';

        this._prevBtn = document.createElement('button');
        this._prevBtn.className = 'sk-egg-btn sk-egg-prev';
        this._prevBtn.textContent = '◀'; this._prevBtn.title = 'Previous page';
        this._prevBtn.addEventListener('click', (e) => { e.stopPropagation(); this._navigateDelta(-1); });

        this._nextBtn = document.createElement('button');
        this._nextBtn.className = 'sk-egg-btn sk-egg-next';
        this._nextBtn.textContent = 'Next Page ▶';
        // Regular click
        this._nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._longPressed) { this._longPressed = false; return; }
            this._navigateDelta(1);
        });
        // Long-press wiring (600 ms)
        this._bindLongPress();

        const hint = document.createElement('div'); hint.id = 'sk-egg-hint';
        hint.textContent = 'Hold Next to reset progress';

        controls.append(this._prevBtn, this._nextBtn);
        body.append(stats, controls, hint);
        this.panel.append(header, body);
        document.body.appendChild(this.panel);
        this._makeDraggable(header, this.panel);
        this._updateUI();
    },

    _hbtn(txt, title) { const b = document.createElement('button'); b.className = 'sk-egg-hbtn'; b.textContent = txt; b.title = title; return b; },

    _updateUI() {
        const total = EGG_HUNT_PAGES.length;
        const visited = (this.state.visited || []).length;
        const pct = Math.min(100, visited / total * 100).toFixed(1);
        if (this._progressFill) this._progressFill.style.width = pct + '%';
        if (this._visitedLabel) this._visitedLabel.innerHTML = `Pages visited: <span>${visited} / ${total}</span>`;
        if (this._eggCountLabel) this._eggCountLabel.innerHTML = `Eggs collected: <span>${this.state.eggsFound}</span> 🥚`;
        const t = this.panel?.querySelector('#sk-egg-title');
        if (t) t.textContent = `🥚 Egg Hunt (${total})`;
    },

    _setNavDisabled(v) {
        if (this._prevBtn) this._prevBtn.disabled = v;
        if (this._nextBtn) this._nextBtn.disabled = v;
    },

    // -- Long-press on Next ---------------------------------------------------

    _bindLongPress() {
        let timer = null;
        const start = () => {
            this._longPressed = false;
            timer = setTimeout(() => { this._longPressed = true; this._handleLongPress(); }, 600);
        };
        const cancel = () => { clearTimeout(timer); timer = null; };
        this._nextBtn.addEventListener('mousedown', start);
        this._nextBtn.addEventListener('mouseup', cancel);
        this._nextBtn.addEventListener('mouseleave', cancel);
        this._nextBtn.addEventListener('touchstart', start, { passive: true });
        this._nextBtn.addEventListener('touchend', cancel);
        this._nextBtn.addEventListener('touchcancel', cancel);
    },

    _handleLongPress() {
        if (!confirm('Reset page progress?\n\nThis will clear visited pages and restart from page 1.\nYour egg count will NOT be reset.')) {
            this._longPressed = false;
            return;
        }
        this.state.visited = [];
        this.state.idx = 0;
        this.saveState();
        this._navigateTo(0);
    },

    // -- Navigation -----------------------------------------------------------

    _navigateDelta(d) {
        if (this._overlayActive) { this._flashEggWarning(); return; }
        let next = this.state.idx + d;
        let wrapped = false;
        if (next >= EGG_HUNT_PAGES.length) { next = 0; wrapped = (d > 0); }
        if (next < 0) next = EGG_HUNT_PAGES.length - 1;
        // When wrapping forward past the last page, reset visited so the counter restarts
        if (wrapped) {
            this.state.visited = [];
            this._updateUI();
        }
        this._navigateTo(next);
    },

    _navigateTo(idx) {
        this._unblockNavigation();
        this.state.idx = idx;
        if (!this.state.visited) this.state.visited = [];
        if (!this.state.visited.includes(idx)) this.state.visited.push(idx);
        this.saveState();
        window.location.href = 'https://www.torn.com' + EGG_HUNT_PAGES[idx].url;
    },

    _flashEggWarning() {
        const t = this._overlay?.querySelector('#sk-egg-overlay-title');
        if (!t) return;
        t.style.color = '#ef5350'; t.style.animationName = 'none';
        setTimeout(() => { t.style.color = ''; t.style.animationName = ''; }, 600);
    },

    // -- Mini -----------------------------------------------------------------

    _showMini() {
        if (this.panel) this.panel.style.display = 'none';
        if (!this.miniBtn) {
            this.miniBtn = document.createElement('button');
            this.miniBtn.id = this.MINI_ID; this.miniBtn.textContent = '🥚';
            this.miniBtn.title = 'Show Egg Hunt panel';
            document.body.appendChild(this.miniBtn);
            this._makeDraggable(this.miniBtn, this.miniBtn, true);
        }
        const px = Math.max(0, Math.min(this.state.pillX ?? (window.innerWidth - 50), window.innerWidth - 38));
        const py = Math.max(0, Math.min(this.state.pillY ?? (window.innerHeight - 85), window.innerHeight - 38));
        this.miniBtn.style.left = px + 'px'; this.miniBtn.style.top = py + 'px';
        this.miniBtn.style.display = 'flex';
    },

    // -- Egg Detection --------------------------------------------------------

    _setupEggDetection() {
        this._checkForEggRoot();
        this._eggObserver = new MutationObserver(() => this._checkForEggRoot());
        this._eggObserver.observe(document.documentElement, { childList: true, subtree: true });
    },

    _checkForEggRoot() {
        document.querySelectorAll('#easter-egg-hunt-root').forEach(root => {
            root.querySelectorAll('button:not([data-sk-egg-handled])').forEach(btn => {
                btn.dataset.skEggHandled = '1';
                this._eggQueue.push(btn);
            });
        });
        if (!this._overlayActive && this._eggQueue.length > 0) this._processEggQueue();
    },

    _processEggQueue() {
        if (this._eggQueue.length === 0) { this._overlayActive = false; this._setNavDisabled(false); return; }
        this._overlayActive = true; this._setNavDisabled(true);
        this._showEggOverlay(this._eggQueue.shift());
    },

    // -- Overlay --------------------------------------------------------------

    _showEggOverlay(btn) {
        this._blockNavigation();

        // Apply CSS to float the button in-place (keep it in Torn's DOM so their handlers work)
        btn.classList.add('__sk-egg-btn-float');

        // Build the backdrop overlay (no button inside it)
        const overlay = document.createElement('div'); overlay.id = this.OVERLAY_ID; this._overlay = overlay;
        const titleEl = document.createElement('div'); titleEl.id = 'sk-egg-overlay-title'; titleEl.textContent = '🥚 EGG FOUND!';
        const sub = document.createElement('div'); sub.id = 'sk-egg-overlay-sub'; sub.textContent = 'Click the egg to collect it!';
        const badge = document.createElement('div'); badge.id = 'sk-egg-overlay-badge'; badge.textContent = `${this._eggQueue.length + 1} egg${this._eggQueue.length > 0 ? 's' : ''} on this page`;
        const skip = document.createElement('button'); skip.id = 'sk-egg-overlay-skip'; skip.textContent = "Skip — I don't want this egg";
        skip.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm("Skip this egg?")) {
                btn.classList.remove('__sk-egg-btn-float');
                this._removeEggOverlay();
                this._processEggQueue();
            }
        });

        // Clicking backdrop (not the floating button) flashes warning
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this._flashEggWarning(); });

        // Listen on the button itself — Torn's native handler will also fire (good!)
        btn.addEventListener('click', () => {
            btn.classList.remove('__sk-egg-btn-float');
            this.state.eggsFound = (this.state.eggsFound || 0) + 1;
            this._updateUI(); this.saveState();
            // Force-remove backdrop & unblock nav immediately
            this._overlay?.remove(); this._overlay = null;
            this._unblockNavigation();
            this._overlayActive = false;
            this._setNavDisabled(false);
            setTimeout(() => this._processEggQueue(), 50);
        }, { once: true });

        overlay.append(titleEl, sub, badge, skip);
        document.body.appendChild(overlay);
    },

    _removeEggOverlay() {
        // Strip float class from any button that still has it
        document.querySelectorAll('#easter-egg-hunt-root button.__sk-egg-btn-float').forEach(b => b.classList.remove('__sk-egg-btn-float'));
        // Also remove any stray overlay that may exist in body
        document.getElementById(this.OVERLAY_ID)?.remove();
        this._overlay = null;
        this._overlayActive = false;
        this._setNavDisabled(false);
        this._unblockNavigation();
    },

    _blockNavigation() {
        if (this._navBlocker) return;
        this._navBlocker = (e) => { e.preventDefault(); e.returnValue = 'An Easter egg is waiting! Leave without collecting it?'; return e.returnValue; };
        window.addEventListener('beforeunload', this._navBlocker);
    },
    _unblockNavigation() {
        if (this._navBlocker) { window.removeEventListener('beforeunload', this._navBlocker); this._navBlocker = null; }
    },

    _bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); this._navigateDelta(1); }
            if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); this._navigateDelta(-1); }
        });
    },

    // -- Drag -----------------------------------------------------------------

    _makeDraggable(handle, target, isPill = false) {
        let dragging = false, moved = false, ox = 0, oy = 0, sx = 0, sy = 0;
        const start = (cx, cy) => { dragging = true; moved = false; sx = cx; sy = cy; const r = target.getBoundingClientRect(); ox = cx - r.left; oy = cy - r.top; target.style.transition = 'none'; };
        const move = (cx, cy) => {
            if (!dragging) return;
            if (Math.abs(cx - sx) > 4 || Math.abs(cy - sy) > 4) moved = true;
            if (!moved) return;
            const x = Math.max(0, Math.min(cx - ox, window.innerWidth - target.offsetWidth));
            const y = Math.max(0, Math.min(cy - oy, window.innerHeight - target.offsetHeight));
            target.style.left = x + 'px'; target.style.top = y + 'px';
            if (isPill) { this.state.pillX = x; this.state.pillY = y; } else { this.state.panelX = x; this.state.panelY = y; }
        };
        const end = () => {
            if (!dragging) return; dragging = false; this.saveState();
            if (isPill && !moved) { if (this.panel) this.panel.style.display = ''; if (this.miniBtn) this.miniBtn.style.display = 'none'; }
        };
        handle.addEventListener('mousedown', (e) => { if (e.button === 0) { e.preventDefault(); start(e.clientX, e.clientY); } });
        document.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
        document.addEventListener('mouseup', end);
        handle.addEventListener('touchstart', (e) => { const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: true });
        document.addEventListener('touchmove', (e) => { if (!dragging) return; const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
        document.addEventListener('touchend', end);
    },
};

// ---------------------------------------------------------------------------
// Egg Helper Module
// ---------------------------------------------------------------------------

const EggHelperModule = {
    name: 'EggHelper', version: '4.1.0',
    STORAGE_KEY: 'sidekick_holiday',
    eggHuntEnabled: false,

    async init() {
        await this.loadSettings();
        this._apply();
        chrome.storage.onChanged.addListener((changes, ns) => {
            if (ns === 'local' && changes[this.STORAGE_KEY]) this.loadSettings().then(() => this._apply());
        });
    },

    async loadSettings() {
        try { const d = await window.SidekickModules.Core.ChromeStorage.get(this.STORAGE_KEY); if (d) this.eggHuntEnabled = d.eggHuntEnabled || false; } catch (e) { }
    },
    async saveSettings() {
        try { await window.SidekickModules.Core.ChromeStorage.set(this.STORAGE_KEY, { eggHuntEnabled: this.eggHuntEnabled }); } catch (e) { }
    },
    _apply() { if (this.eggHuntEnabled) EggHuntTool.init(); else EggHuntTool.destroy(); },
};

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.Holiday = EggHelperModule; // key kept for settings compatibility
console.log('Egg Helper module v4.1 registered (' + EGG_HUNT_PAGES.length + ' pages)');
