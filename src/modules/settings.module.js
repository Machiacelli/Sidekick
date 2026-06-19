/**
 * Sidekick Chrome Extension - Settings Module V2
 * Comprehensive settings panel with all module toggles and configurations
 * Version: 2.0.0
 * Author: Machiacelli
 */

(function () {
    'use strict';

    console.log("⚙️ Loading Sidekick Settings Module V2...");

    // Wait for Core module to be available
    function waitForCore() {
        return new Promise((resolve) => {
            const checkCore = () => {
                if (window.SidekickModules?.Core?.ChromeStorage) {
                    console.log("⚙️ Core module with ChromeStorage ready for Settings");
                    resolve();
                } else {
                    setTimeout(checkCore, 100);
                }
            };
            checkCore();
        });
    }

    // Settings Module Implementation
    const SettingsModule = {
        isInitialized: false,
        settingsPanel: null,
        currentTab: 'general',

        // Initialize the settings module
        async init() {
            if (this.isInitialized) return;

            console.log("⚙️ Initializing Settings Module...");

            try {
                await waitForCore();
                this.isInitialized = true;
                console.log("✅ Settings Module initialized successfully");
            } catch (error) {
                console.error("❌ Settings Module initialization failed:", error);
            }
        },

        // Create comprehensive settings panel UI
        createSettingsPanel() {
            // Migrated: opens the new settings UI directly
            this.createPreviewPanel();
        },

        attachCrimesTabListeners(panel) {
            // Placeholder for future crime module tab event listeners if required
        },

        // Create and inject the new settings UI as an in-page overlay
        createPreviewPanel() {
            // Remove any existing preview
            const existing = document.querySelector('.sidekick-preview-panel');
            if (existing) { existing.remove(); return; }

            const overlay = document.createElement('div');
            overlay.className = 'sidekick-preview-panel';
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 9999999;
                background: transparent;
                display: flex; align-items: center; justify-content: center;
                font-family: 'Segoe UI', Arial, sans-serif;
            `;

            overlay.innerHTML = `
<style>
.sk-prev *, .sk-prev *::before, .sk-prev *::after { box-sizing: border-box; margin: 0; padding: 0; }
.sk-prev {
    --bg:#141414; --surface:#1e1e1e; --surface2:#252525; --surface3:#2e2e2e;
    --border:rgba(255,255,255,0.08); --border2:rgba(255,255,255,0.14);
    --green:#5fcc6a; --orange:#ffad5a; --text:#f0f0f0; --muted:rgba(255,255,255,0.45);
    --grad:linear-gradient(135deg,#5fcc6a,#ffad5a); --radius:10px;
    width:920px; height:780px; display:flex;
    background:var(--surface); border:1px solid var(--border2); border-radius:16px;
    overflow:hidden; box-shadow:0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04);
    color:var(--text);
}
.sk-prev-sidebar {
    width:200px; background:var(--bg); border-right:1px solid var(--border);
    display:flex; flex-direction:column; flex-shrink:0;
}
.sk-prev-sidebar-head {
    padding:0; border-bottom:1px solid var(--border); flex-shrink:0; overflow:hidden;
}
.sk-prev-logo {
    font-size:16px; font-weight:700;
    background:var(--grad); -webkit-background-clip:text;
    -webkit-text-fill-color:transparent; background-clip:text;
}
.sk-prev-ver { font-size:10px; color:var(--muted); margin-top:2px; }
.sk-prev-nav {
    flex:1; padding:8px 6px; overflow-y:auto; scrollbar-width:none;
}
.sk-prev-nav::-webkit-scrollbar{display:none;}
.sk-nav-item {
    display:flex; flex-direction:column; align-items:center; gap:6px;
    padding:12px 6px; border-radius:var(--radius); cursor:pointer;
    transition:background .18s,color .18s; border:none; background:transparent;
    color:var(--muted); width:100%; margin-bottom:2px; position:relative;
}
.sk-nav-item:hover{background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.8);}
.sk-nav-item.active{background:rgba(95,204,106,0.1);color:#fff;}
.sk-nav-item.active::before{
    content:''; position:absolute; left:0; top:50%; transform:translateY(-50%);
    height:55%; width:3px; background:var(--grad); border-radius:0 3px 3px 0;
}
.sk-nav-icon {
    width:36px; height:36px; border-radius:8px; border:1.5px solid var(--border2);
    display:flex; align-items:center; justify-content:center;
    font-size:20px; background:var(--surface2); transition:all .2s;
}
.sk-nav-item.active .sk-nav-icon,
.sk-nav-item:hover .sk-nav-icon {
    border-color:rgba(95,204,106,0.45);
    box-shadow:0 0 14px rgba(95,204,106,0.2),0 0 28px rgba(255,173,90,0.1);
}
.sk-nav-label{font-size:10px;font-weight:600;letter-spacing:0;text-align:center;white-space:normal;word-break:break-word;line-height:1.2;max-width:100%;}
.sk-prev-content{flex:1;display:flex;flex-direction:column;overflow:hidden;}
.sk-prev-topbar{
    display:flex;align-items:center;justify-content:space-between;
    padding:16px 24px; border-bottom:1px solid var(--border); flex-shrink:0;
}
.sk-prev-title{
    font-size:20px;font-weight:700;
    background:var(--grad);-webkit-background-clip:text;
    -webkit-text-fill-color:transparent;background-clip:text;
    letter-spacing:-0.3px;
}
.sk-prev-close{
    width:28px;height:28px;background:var(--surface3);border:1px solid var(--border2);
    border-radius:50%;color:var(--muted);font-size:16px;cursor:pointer;
    display:flex;align-items:center;justify-content:center;transition:all .15s;line-height:1;
}
.sk-prev-close:hover{background:rgba(255,80,80,.15);color:#ff6b6b;border-color:rgba(255,80,80,.3);}
.sk-subtab-bar{
    display:flex;gap:2px;padding:10px 24px 0;
    border-bottom:1px solid var(--border);flex-shrink:0;
}
.sk-subtab-btn{
    padding:7px 14px;font-size:12px;font-weight:600;background:transparent;
    border:none;border-bottom:2px solid transparent;color:var(--muted);
    cursor:pointer;transition:all .15s;border-radius:6px 6px 0 0;margin-bottom:-1px;
    white-space:nowrap;
}
.sk-subtab-btn:hover{color:rgba(255,255,255,.75);background:rgba(255,255,255,.04);}
.sk-subtab-btn.active{color:#fff;border-bottom-color:var(--green);}
.sk-scroll{flex:1;overflow-y:auto;padding:20px 24px;scrollbar-width:none;}
.sk-scroll::-webkit-scrollbar{display:none;}
.sk-subtab-panel{display:none;}
.sk-subtab-panel.active{display:block;}
.sk-sec-page{display:none;flex:1;flex-direction:column;overflow:hidden;}
.sk-sec-page.active{display:flex;}
.sk-sh{
    font-size:11px;font-weight:700;letter-spacing:0.8px;color:rgba(255,255,255,0.6);
    text-transform:uppercase;margin:0 0 10px;padding-bottom:8px;
    border-bottom:1px solid rgba(255,255,255,0.12);
}
.sk-sh:not(:first-child){margin-top:20px;}
.sk-row{
    display:flex;align-items:center;justify-content:space-between;
    padding:12px 14px;background:var(--surface2);border:1px solid var(--border);
    border-radius:var(--radius);margin-bottom:5px;gap:14px;
    transition:border-color .15s,background .15s;
}
.sk-row:hover{border-color:var(--border2);background:var(--surface3);}
.sk-row-info{flex:1;min-width:0;}
.sk-row-title{font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px;}
.sk-row-desc{font-size:11px;color:var(--muted);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sk-tog{position:relative;width:40px;height:21px;flex-shrink:0;cursor:pointer;}
.sk-tog input{opacity:0;width:0;height:0;position:absolute;}
.sk-tog-track{position:absolute;inset:0;background:rgba(255,255,255,.15);border-radius:21px;transition:background .25s;}
.sk-tog input:checked~.sk-tog-track{background:linear-gradient(135deg,var(--green),var(--orange));}
.sk-tog-thumb{position:absolute;top:2.5px;left:2.5px;width:16px;height:16px;background:white;border-radius:50%;transition:transform .25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,.3);}
.sk-tog input:checked~.sk-tog-thumb{transform:translateX(19px);}
.sk-field-label{font-size:12px;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:6px;display:block;}
.sk-input{
    width:100%;background:var(--surface3);border:1px solid var(--border2);
    border-radius:8px;color:var(--text);padding:9px 12px;font-size:13px;
    font-family:inherit;outline:none;transition:border-color .15s;
    margin-bottom:10px;
}
.sk-input:focus{border-color:var(--green);}
.sk-input::placeholder{color:var(--muted);}
.sk-select{
    width:100%;background:var(--surface3);border:1px solid var(--border2);
    border-radius:8px;color:var(--text);padding:9px 12px;font-size:13px;
    font-family:inherit;outline:none;appearance:none;cursor:pointer;margin-bottom:10px;
}
.sk-select option{background:#1e1e1e;}
.sk-hint{font-size:11px;color:var(--muted);margin-top:-6px;margin-bottom:10px;line-height:1.4;}
.sk-btn-row{display:flex;gap:8px;margin-bottom:10px;}
.sk-btn{padding:9px 16px;border-radius:8px;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;font-family:inherit;flex:1;}
.sk-btn-primary{background:var(--grad);color:#111;}
.sk-btn-ghost{background:var(--surface3);border:1px solid var(--border2);color:var(--muted);}
.sk-btn-ghost:hover{color:var(--text);}
.sk-btn-danger{background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.25);color:#ff6b6b;}
.sk-info{padding:10px 12px;background:rgba(33,150,243,.08);border-left:3px solid #2196F3;border-radius:0 8px 8px 0;font-size:11px;color:rgba(255,255,255,.65);line-height:1.5;margin-bottom:12px;}
.sk-ph{padding:36px 16px;text-align:center;background:var(--surface2);border:1px dashed var(--border2);border-radius:12px;margin-bottom:10px;}
.sk-ph-icon{font-size:34px;margin-bottom:8px;display:block;}
.sk-ph-title{font-size:13px;font-weight:600;color:rgba(255,255,255,.45);margin-bottom:3px;}
.sk-ph-desc{font-size:11px;color:var(--muted);}
.sk-slider-row{display:flex;align-items:center;gap:12px;margin-bottom:10px;}
.sk-slider-row input[type=range]{flex:1;accent-color:var(--green);cursor:pointer;}
.sk-slider-val{font-size:13px;font-weight:700;color:var(--green);min-width:34px;text-align:right;}
.sk-shelf{
    background:var(--surface2);border:1px solid var(--border2);border-radius:10px;
    padding:14px 16px;margin:6px 0 10px;animation:skShelfIn .18s ease;
}
@keyframes skShelfIn{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:translateY(0);}}
.sk-status{padding:9px 12px;border-radius:8px;background:rgba(95,204,106,.08);border:1px solid rgba(95,204,106,.18);font-size:12px;color:var(--green);text-align:center;margin-top:4px;}.sk-shop-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 8px;
}
.sk-custom-cb-wrap {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    margin: 0;
}
.sk-custom-cb-wrap span {
    font-size: 11px;
    color: rgba(255,255,255,0.7);
}
.sk-custom-cb-input {
    appearance: none;
    -webkit-appearance: none;
    background-color: rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    margin: 0;
}
.sk-custom-cb-input:checked {
    background-color: var(--green);
    border-color: var(--green);
}
.sk-custom-cb-input:checked::after {
    content: '';
    width: 4px;
    height: 8px;
    border: solid #111;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
    margin-bottom: 2px;
}
</style>

<div class="sk-prev">
  <!-- SIDEBAR -->
  <div class="sk-prev-sidebar">
    <div class="sk-prev-sidebar-head">
      <img id="skp-logo-img" style="width:100%;height:auto;display:block;object-fit:cover;">

    </div>
    <nav class="sk-prev-nav">
      <button class="sk-nav-item active" data-section="general"><div class="sk-nav-icon"><img class="sk-nav-icon-img" data-icon="General.png"></div><span class="sk-nav-label">General</span></button>
      <button class="sk-nav-item" data-section="features"><div class="sk-nav-icon"><img class="sk-nav-icon-img" data-icon="Features.png"></div><span class="sk-nav-label">Features</span></button>
      <button class="sk-nav-item" data-section="profile"><div class="sk-nav-icon"><img class="sk-nav-icon-img" data-icon="Profile.png"></div><span class="sk-nav-label">Profile</span></button>
      <button class="sk-nav-item" data-section="crimes"><div class="sk-nav-icon"><img class="sk-nav-icon-img" data-icon="Crimes.png"></div><span class="sk-nav-label">Crimes</span></button>
      <button class="sk-nav-item" data-section="mugging"><div class="sk-nav-icon"><img class="sk-nav-icon-img" data-icon="MugCalc.png"></div><span class="sk-nav-label">Mugging</span></button>
      <button class="sk-nav-item" data-section="war"><div class="sk-nav-icon"><img class="sk-nav-icon-img" data-icon="War.png"></div><span class="sk-nav-label">War</span></button>
      <button class="sk-nav-item" data-section="missions"><div class="sk-nav-icon"><img class="sk-nav-icon-img" data-icon="Missions.png"></div><span class="sk-nav-label">Missions</span></button>
      <button class="sk-nav-item" data-section="events"><div class="sk-nav-icon"><img class="sk-nav-icon-img" data-icon="Events.png"></div><span class="sk-nav-label">Events</span></button>
    </nav>
  </div>

  <!-- CONTENT -->
  <div class="sk-prev-content">
    <div class="sk-prev-topbar">
      <span class="sk-prev-title" id="skp-title">General Settings</span>
      <button class="sk-prev-close" id="skp-close">&times;</button>
    </div>

    <!-- GENERAL -->
    <div class="sk-sec-page active" id="skp-general">
      <div class="sk-subtab-bar">
        <button class="sk-subtab-btn active" data-tab="api">API Key</button>
        <button class="sk-subtab-btn" data-tab="backup">Backup &amp; Export</button>
        <button class="sk-subtab-btn" data-tab="notifications">Notifications</button>
      </div>
      <div class="sk-scroll">
        <div class="sk-subtab-panel active" id="skp-tab-api">
          <div class="sk-sh">Torn API Key</div>
          <label class="sk-field-label">API Key</label>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            <div id="skp-clear-api-key" style="cursor:pointer;color:#000;background:#ccc;width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:bold;font-size:12px;" title="Clear API Key">✕</div>
            <input type="password" class="sk-input" id="sidekick-api-key" placeholder="Enter your Torn API key..." style="flex:1;">
          </div>
          
          <div id="skp-secondary-api-container" style="display:none; margin-bottom:10px;">
            <label class="sk-field-label">Secondary API Key <span style="font-size:10px;color:#aaa;font-weight:normal;">(For rate limit load balancing)</span></label>
            <div style="display:flex;align-items:center;gap:6px;">
              <div id="skp-clear-sec-api-key" style="cursor:pointer;color:#000;background:#ccc;width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:bold;font-size:12px;" title="Clear Secondary API Key">✕</div>
              <input type="password" class="sk-input" id="sidekick-secondary-api-key" placeholder="Enter secondary API key..." style="flex:1;">
            </div>
          </div>

          <div class="sk-hint" style="margin-bottom:8px;">Get your key at <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" style="color:#5fcc6a;text-decoration:none;font-weight:600;">torn.com/preferences.php#tab=api</a>
            <div style="margin-top:4px;">
              <a href="#" id="skp-add-secondary-api-btn" style="color:#5fcc6a;text-decoration:none;font-size:11px;font-weight:600;">+ Add Secondary API Key</a>
            </div>
          </div>
          
          <div class="sk-btn-row">
            <button class="sk-btn sk-btn-primary" id="sidekick-test-api">Test Connection</button>
            <button class="sk-btn sk-btn-ghost" id="sidekick-show-key">Show Key</button>
          </div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-backup">
          <div class="sk-sh">Data Export &amp; Import</div>
          <div class="sk-btn-row"><button class="sk-btn sk-btn-primary" id="sidekick-export-data">Export Data</button><button class="sk-btn sk-btn-ghost" id="sidekick-import-data">Import Data</button></div>
          <div class="sk-hint" style="text-align:center;margin-top:-4px;">Exports a .json backup file to your Downloads folder</div>
          <input type="file" id="sidekick-import-file" accept=".json" style="display:none">
          <div class="sk-status" id="sidekick-backup-status" style="margin-top:10px;text-align:center;">Ready to export or import data</div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-notifications">
          <div class="sk-sh">In-Page Notifications</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Notification Sounds</div><div class="sk-row-desc">Play a sound when in-page notifications appear</div></div><label class="sk-tog"><input type="checkbox" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Auto-dismiss</div><div class="sk-row-desc">Automatically hide notifications after a timeout</div></div><label class="sk-tog"><input type="checkbox" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-sh" style="margin-top:14px;">Notification Duration</div>
          <div class="sk-slider-row"><input type="range" min="2" max="10" value="5" class="skp-slider" data-out="skp-notif-val" data-suffix="s"><span class="sk-slider-val" id="skp-notif-val">5s</span></div>
          <div class="sk-hint">How long notifications stay visible before auto-dismissing</div>
          <div class="sk-sh" style="margin-top:14px;">System Notifications</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Browser Desktop Notifications</div><div class="sk-row-desc">Allow Sidekick to send system-level notifications</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-browser-notif" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
      </div>
    </div>

    <!-- FEATURES -->
    <div class="sk-sec-page" id="skp-features">
      <div class="sk-subtab-bar">
        <button class="sk-subtab-btn active" data-tab="feat-utility">Utility</button>
        <button class="sk-subtab-btn" data-tab="feat-reminders">Reminders</button>
        <button class="sk-subtab-btn" data-tab="feat-medical">Medical</button>
      </div>
      <div class="sk-scroll">
        <div class="sk-subtab-panel active" id="skp-tab-feat-utility">
          <div class="sk-sh">Utility</div>

          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Time on Tab</div><div class="sk-row-desc">Display remaining travel time, hospital time, raceway time, and time left for chain on tab title.</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-time-on-tab" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Legible Player Names</div><div class="sk-row-desc">Improves readability of player names by formatting them with better spacing and styling</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-legible-names" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Random Target</div><div class="sk-row-desc">Adds a floater that opens a random level 1 profile</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-random-target" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Refill Blocker</div><div class="sk-row-desc">Prevents accidental nerve and energy refills by showing a confirmation before using refill items</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-refill-blocker" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Xanax Viewer</div><div class="sk-row-desc">View individual Xanax usage</div></div><label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-xanax-viewer" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Auction Weapon Bonus</div><div class="sk-row-desc">Displays weapon bonuses & stats next to weapon name in auction house</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-auction-bonus" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-feat-reminders">
          <div class="sk-sh">Alerts</div>
          
          <!-- Travel Blocker -->
          <div class="sk-row" style="align-items:flex-start;gap:12px;margin-top:4px;">
            <div class="sk-row-info">
              <div class="sk-row-title">Travel Blocker</div>
              <div class="sk-row-desc">Modular travel blocker for OC timing, bazaars, and drug cooldowns</div>
              <div style="margin-top:5px;"><button class="sk-shelf-toggle" data-shelf="skp-shelf-travelblocker" style="background:none;border:none;padding:0;color:#5fcc6a;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Settings &#x25BE;</button></div>
            </div>
            <label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-travel-blocker" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label>
          </div>
          <div class="sk-shelf" id="skp-shelf-travelblocker" style="display:none;">
            <div class="sk-sh" style="margin-top:0;font-size:10px;margin-bottom:10px;">Module Toggles</div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                <div class="sk-row" style="padding:4px;border:1px solid rgba(255,255,255,0.05);border-radius:4px;"><div class="sk-row-info"><div class="sk-row-title" style="font-size:11px;">OC Timing</div></div><label class="sk-tog"><input type="checkbox" id="skp-travelblocker-oc-watcher" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
                <div class="sk-row" style="padding:4px;border:1px solid rgba(255,255,255,0.05);border-radius:4px;"><div class="sk-row-info"><div class="sk-row-title" style="font-size:11px;">Drug Cooldown</div></div><label class="sk-tog"><input type="checkbox" id="skp-travelblocker-drug-cooldown" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
                <div class="sk-row" style="padding:4px;border:1px solid rgba(255,255,255,0.05);border-radius:4px;"><div class="sk-row-info"><div class="sk-row-title" style="font-size:11px;">War Watch</div></div><label class="sk-tog"><input type="checkbox" id="skp-travelblocker-war-watch" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
            </div>
          </div>

          <!-- Rehab Warning -->
          <div class="sk-row" style="align-items:flex-start;gap:12px;margin-top:4px;">
            <div class="sk-row-info">
              <div class="sk-row-title">Rehab Warning</div>
              <div class="sk-row-desc">Alerts you when your addiction nears threshold or company penalty</div>
              <div style="margin-top:5px;"><button class="sk-shelf-toggle" data-shelf="skp-shelf-rehabwarning" style="background:none;border:none;padding:0;color:#5fcc6a;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Settings &#x25BE;</button></div>
            </div>
            <label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-rehab-warning" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label>
          </div>
          <div class="sk-shelf" id="skp-shelf-rehabwarning" style="display:none; margin-bottom:10px;">
            <label class="sk-field-label" style="margin-top:10px;">Addiction Limit (%)</label>
            <select class="sk-select" id="skp-rehab-edu-threshold">
              <option value="1">1%</option>
              <option value="2">2%</option>
              <option value="3">3%</option>
              <option value="4" selected>4%</option>
              <option value="5">5%</option>
              <option value="6">6%</option>
              <option value="7">7%</option>
              <option value="8">8%</option>
              <option value="9">9%</option>
              <option value="10">10%</option>
            </select>

            <div class="sk-row" style="margin-top:10px;">
              <div class="sk-row-info"><div class="sk-row-title">Company Penalty Alert</div><div class="sk-row-desc">Alert when company addiction penalty is reached</div></div>
              <label class="sk-tog"><input type="checkbox" id="skp-rehab-company-enable"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label>
            </div>

            <div id="skp-rehab-company-wrap" style="display:none;">
              <label class="sk-field-label" style="margin-top:10px;">Company Addiction Limit</label>
              <input type="number" class="sk-input" id="skp-rehab-company-penalty" min="1" max="100" value="5" style="width:100%;margin-top:4px;">
            </div>
          </div>

          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Racing Alert</div><div class="sk-row-desc">Flashes the extension icon when you are not currently in a race</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-racing-alert" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>

          <div class="sk-row" style="align-items:flex-start;gap:12px;margin-top:4px;">
            <div class="sk-row-info">
              <div class="sk-row-title">Blood Bag Reminder</div>
              <div class="sk-row-desc">Shows a blood bag icon in the status bar</div>
              <div style="margin-top:5px;"><button class="sk-shelf-toggle" data-shelf="skp-shelf-bloodbag" style="background:none;border:none;padding:0;color:#5fcc6a;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Settings &#x25BE;</button></div>
            </div>
            <label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-blood-bag" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label>
          </div>
          <div class="sk-shelf" id="skp-shelf-bloodbag" style="display:none; margin-bottom:10px;">
            <label class="sk-field-label" style="margin-top:10px;">Bags to Fill</label>
            <select class="sk-select" id="skp-bb-bags">
              <option value="1">1 bag (life &gt; 30%)</option>
              <option value="2" selected>2 bags (life &gt; 60%)</option>
              <option value="3">3 bags (life &gt; 90%)</option>
            </select>
            <label class="sk-field-label" style="margin-top:8px;">Click Destination</label>
            <select class="sk-select" id="skp-bb-dest">
              <option value="items" selected>Items page (medical)</option>
              <option value="armory">Faction Armory (medical)</option>
            </select>
            <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Open in New Tab</div><div class="sk-row-desc">Opens the destination page in a new browser tab when clicking the blood bag icon</div></div><label class="sk-tog"><input type="checkbox" id="skp-bb-newtab"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          </div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-feat-medical">
          <div class="sk-sh">Smart Medical Button</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable Smart Medical Button</div><div class="sk-row-desc">Show the smart medical floater on all Torn pages</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-smart-medical"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <label class="sk-field-label" style="margin-top:12px;">Item Source</label>
          <select class="sk-select" id="skp-med-item-source">
            <option value="Personal Items" selected>Personal Items</option>
            <option value="Faction Armory">Faction Armory</option>
          </select>
          <div class="sk-hint">Where to use items from when clicking the button</div>
          <label class="sk-field-label" style="margin-top:12px;">Blood Bag Type</label>
          <select class="sk-select" id="skp-med-blood-type">
            <option value="Disabled" selected>Disabled</option>
            <option value="A+">A+</option>
            <option value="A-">A-</option>
            <option value="B+">B+</option>
            <option value="B-">B-</option>
            <option value="AB+">AB+</option>
            <option value="AB-">AB-</option>
            <option value="O+">O+</option>
            <option value="O-">O-</option>
          </select>
          <div class="sk-hint">Select your blood type to enable blood bag usage. Disabled = no blood bags used.</div>
        </div>
      </div>
    </div>

    <!-- PROFILE -->
    <div class="sk-sec-page" id="skp-profile">
      <div class="sk-subtab-bar">
        <button class="sk-subtab-btn active" data-tab="personal">Personal</button>
        <button class="sk-subtab-btn" data-tab="gym">Gym</button>
        <button class="sk-subtab-btn" data-tab="money">Economy</button>
      </div>
      <div class="sk-scroll">
        <div class="sk-subtab-panel active" id="skp-tab-personal">
          <div class="sk-sh">Combat &amp; Loadout</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Fast Attack</div><div class="sk-row-desc">Moves Start Fight button directly over your equipped weapon for faster attacking</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-fast-attack" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Loadout Switcher</div><div class="sk-row-desc">Adds quick loadout change buttons on the Items page</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-loadout" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-sh" style="margin-top:18px;">Inventory</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Locked Items Manager</div><div class="sk-row-desc">Lock inventory items to prevent accidental trading or selling</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-locked-items"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row" style="align-items:flex-start;gap:12px;"><div class="sk-row-info"><div class="sk-row-title">Weapon XP Tracker</div><div class="sk-row-desc">Tracks weapon experience progress and shows XP gain rates</div><div style="margin-top:5px;"><button class="sk-shelf-toggle" data-shelf="skp-shelf-wxp" style="background:none;border:none;padding:0;color:#5fcc6a;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">View Stats &#x25BE;</button></div></div><label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-wxp"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-shelf" id="skp-shelf-wxp" style="display:none;">
            <div class="sk-info" style="margin-bottom:8px;">Opens a full weapon stats window showing XP % per weapon, finishing hits progress, and a list of weapons you have not yet trained.</div>
            <button id="skp-wxp-overview-btn" class="sk-btn sk-btn-primary" style="width:100%;">View Weapon XP Stats</button>
          </div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-gym">
          <div class="sk-sh">Gym Modules</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Special Gym Ratios</div><div class="sk-row-desc">Warns when your stat ratios risk losing access to specialist gyms</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-gym-ratios" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Auto Gym</div><div class="sk-row-desc">Automatically switches to the best available gym before training</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-auto-gym"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Block Training</div><div class="sk-row-desc">Prevents accidental gym training clicks</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-block-training"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-money">
          <div class="sk-sh">Market &amp; Pricing</div>
          <div class="sk-row" style="align-items:flex-start;gap:12px;">
            <div class="sk-row-info">
              <div class="sk-row-title">Item Market Filler</div>
              <div class="sk-row-desc">Auto-fills prices on Item Market listings using live market data</div>
              <div style="margin-top:5px;"><button class="sk-shelf-toggle" data-shelf="skp-shelf-market" style="background:none;border:none;padding:0;color:#5fcc6a;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Settings &#x25BE;</button></div>
            </div>
            <label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-market-filler"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label>
          </div>
          <div class="sk-shelf" id="skp-shelf-market" style="display:none;">
            <div class="sk-sh" style="margin-top:0;font-size:10px;">Item Market Filler Settings</div>
            <label class="sk-field-label">Price Offset Formula</label>
            <input type="text" class="sk-input" placeholder="e.g. -1 or -1% or -1[1]" value="-1">
            <div class="sk-hint">-1 = cheapest minus $1 &nbsp;|&nbsp; -1% = 1% below &nbsp;|&nbsp; -1[1] = 2nd cheapest minus $1</div>
            <label class="sk-field-label" style="margin-top:8px;">Slot (cheapest = 1)</label>
            <input type="number" class="sk-input" min="1" max="10" value="1" placeholder="1">
          </div>
          <div class="sk-row" style="align-items:flex-start;gap:12px;margin-top:4px;">
            <div class="sk-row-info">
              <div class="sk-row-title">Bazaar Filler</div>
              <div class="sk-row-desc">Auto-fills your bazaar prices using Weav3r market API data</div>
              <div style="margin-top:5px;"><button class="sk-shelf-toggle" data-shelf="skp-shelf-bazaar" style="background:none;border:none;padding:0;color:#5fcc6a;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Settings &#x25BE;</button></div>
            </div>
            <label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-bazaar-filler" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label>
          </div>
          <div class="sk-shelf" id="skp-shelf-bazaar" style="display:none;">
            <div class="sk-sh" style="margin-top:0;font-size:10px;">Bazaar Filler Settings</div>
            <label class="sk-field-label">Price Offset Formula</label>
            <input type="text" class="sk-input" placeholder="e.g. -1 or -1% or -1[1]" value="-1">
            <div class="sk-hint">-1 = cheapest minus $1 &nbsp;|&nbsp; -1% = 1% below &nbsp;|&nbsp; -1[1] = 2nd cheapest minus $1</div>
            <label class="sk-field-label" style="margin-top:8px;">Slot (cheapest = 1)</label>
            <input type="number" class="sk-input" min="1" max="10" value="1" placeholder="1">
          </div>
          <div class="sk-row" style="margin-top:4px;"><div class="sk-row-info"><div class="sk-row-title">Item Market Max Quantity</div><div class="sk-row-desc">Adds a button to fill max quantity when buying from Item Market</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-market-max-qty"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-sh" style="margin-top:18px;">Quick Deposit</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Quick Deposit</div><div class="sk-row-desc">Makes your money display clickable for fast vault deposits</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-quick-deposit"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <label class="sk-field-label" style="margin-top:10px;">Deposit Target</label>
          <select class="sk-select" id="skp-deposit-target"><option>Faction Vault</option><option>Property Vault</option><option>Company Vault</option><option value="ghost">Ghost Trade</option></select>
          <div class="sk-ghost-trade-row" id="skp-ghost-row" style="display:none;">
            <div class="sk-info" style="margin-top:8px;">Auto-detected when you visit a ghost trade page. Used as the deposit target when Ghost Trade is selected above.</div>
            <input type="text" class="sk-input" placeholder="No ghost trade detected yet" readonly style="opacity:0.55;cursor:not-allowed;">
            <button class="sk-btn sk-btn-danger" style="width:100%;">Clear Ghost Trade ID</button>
          </div>
          <div class="sk-sh" style="margin-top:18px;">Bunker</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Bunker Bucks</div><div class="sk-row-desc">Displays live value of your bunker investments on the Torn City page</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-bunker-bucks" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
      </div>
    </div>

    <!-- CRIMES -->
    <div class="sk-sec-page" id="skp-crimes">
      <div class="sk-subtab-bar">
        <button class="sk-subtab-btn active" data-tab="helpers">Helpers</button>
        <button class="sk-subtab-btn" data-tab="outcome">Outcome</button>
      </div>
      <div class="sk-scroll">
        <div class="sk-subtab-panel active" id="skp-tab-helpers">
          <!-- Search for Cash -->
          <div class="sk-row" style="align-items:flex-start;gap:12px;">
            <div class="sk-row-info">
              <div class="sk-row-title">Search for Cash</div>
              <div class="sk-row-desc">Highlights the best SFC location by scoring and alerts when your threshold is met</div>
              <div style="margin-top:5px;"><button class="sk-shelf-toggle" data-shelf="skp-shelf-sfc" style="background:none;border:none;padding:0;color:#5fcc6a;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Settings &#x25BE;</button></div>
            </div>
            <label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-sfc" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label>
          </div>
          <div class="sk-shelf" id="skp-shelf-sfc" style="display:none;">
            <div class="sk-sh" style="margin-top:0;font-size:10px;">SFC Alert Settings</div>
            <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Enable SFC Alert</div><div class="sk-row-desc">Notify when SFC score reaches threshold</div></div><label class="sk-tog"><input type="checkbox" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
            <label class="sk-field-label" style="margin-top:8px;">Check Interval (seconds)</label>
            <input type="number" class="sk-input" min="10" max="300" value="30">
            <div class="sk-hint">Minimum 10s -- recommended 30s</div>
            <label class="sk-field-label" style="margin-top:10px;">SFC Score Threshold per location</label>
            <div class="sk-subtab-bar sk-shelf-tabs" style="margin:6px 0 0;font-size:11px;">
              <button class="sk-subtab-btn active" data-tab="sfcloc-trash">Trash</button>
              <button class="sk-subtab-btn" data-tab="sfcloc-subway">Subway</button>
              <button class="sk-subtab-btn" data-tab="sfcloc-junkyard">Junkyard</button>
              <button class="sk-subtab-btn" data-tab="sfcloc-beach">Beach</button>
              <button class="sk-subtab-btn" data-tab="sfcloc-cemetery">Cemetery</button>
              <button class="sk-subtab-btn" data-tab="sfcloc-fountain">Fountain</button>
            </div>
            <div class="sk-subtab-panel active" id="skp-tab-sfcloc-trash" style="padding-top:8px;">
              <div class="sk-slider-row"><input type="range" min="50" max="100" value="80" class="skp-slider" data-out="skp-sfc-trash-val" data-suffix="%"><span class="sk-slider-val" id="skp-sfc-trash-val">80%</span></div>
              <div class="sk-hint">Alert when Trash score meets or exceeds this value</div>
            </div>
            <div class="sk-subtab-panel" id="skp-tab-sfcloc-subway" style="padding-top:8px;">
              <div class="sk-slider-row"><input type="range" min="50" max="100" value="80" class="skp-slider" data-out="skp-sfc-subway-val" data-suffix="%"><span class="sk-slider-val" id="skp-sfc-subway-val">80%</span></div>
              <div class="sk-hint">Alert when Subway score meets or exceeds this value</div>
            </div>
            <div class="sk-subtab-panel" id="skp-tab-sfcloc-junkyard" style="padding-top:8px;">
              <div class="sk-slider-row"><input type="range" min="50" max="100" value="80" class="skp-slider" data-out="skp-sfc-junkyard-val" data-suffix="%"><span class="sk-slider-val" id="skp-sfc-junkyard-val">80%</span></div>
              <div class="sk-hint">Alert when Junkyard score meets or exceeds this value</div>
            </div>
            <div class="sk-subtab-panel" id="skp-tab-sfcloc-beach" style="padding-top:8px;">
              <div class="sk-slider-row"><input type="range" min="50" max="100" value="80" class="skp-slider" data-out="skp-sfc-beach-val" data-suffix="%"><span class="sk-slider-val" id="skp-sfc-beach-val">80%</span></div>
              <div class="sk-hint">Alert when Beach score meets or exceeds this value</div>
            </div>
            <div class="sk-subtab-panel" id="skp-tab-sfcloc-cemetery" style="padding-top:8px;">
              <div class="sk-slider-row"><input type="range" min="50" max="100" value="80" class="skp-slider" data-out="skp-sfc-cemetery-val" data-suffix="%"><span class="sk-slider-val" id="skp-sfc-cemetery-val">80%</span></div>
              <div class="sk-hint">Alert when Cemetery score meets or exceeds this value</div>
            </div>
            <div class="sk-subtab-panel" id="skp-tab-sfcloc-fountain" style="padding-top:8px;">
              <div class="sk-slider-row"><input type="range" min="50" max="100" value="80" class="skp-slider" data-out="skp-sfc-fountain-val" data-suffix="%"><span class="sk-slider-val" id="skp-sfc-fountain-val">80%</span></div>
              <div class="sk-hint">Alert when Fountain score meets or exceeds this value</div>
            </div>
          </div>

          <!-- Shoplifting -->
          <div class="sk-row" style="align-items:flex-start;gap:12px;margin-top:4px;">
            <div class="sk-row-info">
              <div class="sk-row-title">Shoplifting</div>
              <div class="sk-row-desc">Monitors shoplifting security and alerts when it drops to a safe level</div>
              <div style="margin-top:5px;"><button class="sk-shelf-toggle" data-shelf="skp-shelf-shoplift" style="background:none;border:none;padding:0;color:#5fcc6a;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Settings &#x25BE;</button></div>
            </div>
            <label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-shoplifting" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label>
          </div>
          <div class="sk-shelf" id="skp-shelf-shoplift" style="display:none;">
            <div class="sk-sh" style="margin-top:0;font-size:10px;">Shoplifting Alert Settings</div>
            <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Enable Shoplifting Alert</div><div class="sk-row-desc">Notify when security drops low enough</div></div><label class="sk-tog"><input type="checkbox" id="skp-shoplift-notify" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
            <label class="sk-field-label" style="margin-top:8px;">Check Interval (minutes)</label>
            <input type="number" class="sk-input" id="skp-shoplift-interval" min="1" max="60" value="1" step="1">
            <div class="sk-hint">Minimum 1 min &mdash; recommended 1</div>
            <label class="sk-field-label" style="margin-top:10px;">Alert when disabled per shop</label>
            <div style="display:flex;gap:6px;margin:6px 0 4px;">
              <button id="skp-shoplift-sel-all" style="padding:3px 10px;font-size:10px;background:#5fcc6a;border:none;border-radius:4px;color:#111;font-weight:700;cursor:pointer;">Select All</button>
              <button id="skp-shoplift-desel-all" style="padding:3px 10px;font-size:10px;background:rgba(255,255,255,0.12);border:none;border-radius:4px;color:rgba(255,255,255,0.7);font-weight:600;cursor:pointer;">Deselect All</button>
            </div>
            <div class="sk-shop-grid">
              <div style="background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:8px 10px;">
                <div style="font-size:11px;font-weight:700;color:#5fcc6a;margin-bottom:6px;">Sally's Sweet Shop</div>
                <label class="sk-custom-cb-wrap">
                  <span>Cameras</span>
                  <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="sallys_sweet_shop" data-type="cameras" id="skp-shop-sally-cam" checked>
                </label>
              </div>
              <div style="background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:8px 10px;">
                <div style="font-size:11px;font-weight:700;color:#5fcc6a;margin-bottom:6px;">Bits 'n' Bobs</div>
                <label class="sk-custom-cb-wrap">
                  <span>Cameras</span>
                  <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="Bits_n_bobs" data-type="cameras" id="skp-shop-bits-cam" checked>
                </label>
              </div>
              <div style="background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:8px 10px;">
                <div style="font-size:11px;font-weight:700;color:#5fcc6a;margin-bottom:6px;">TC Clothing</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <label class="sk-custom-cb-wrap">
                    <span>Cameras</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="tc_clothing" data-type="cameras" id="skp-shop-tc-cam" checked>
                  </label>
                  <label class="sk-custom-cb-wrap">
                    <span>Checkpoint</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="tc_clothing" data-type="checkpoint" id="skp-shop-tc-chk" checked>
                  </label>
                </div>
              </div>
              <div style="background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:8px 10px;">
                <div style="font-size:11px;font-weight:700;color:#5fcc6a;margin-bottom:6px;">Super Store</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <label class="sk-custom-cb-wrap">
                    <span>Cameras</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="super_store" data-type="cameras" id="skp-shop-super-cam" checked>
                  </label>
                  <label class="sk-custom-cb-wrap">
                    <span>Checkpoint</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="super_store" data-type="checkpoint" id="skp-shop-super-chk" checked>
                  </label>
                </div>
              </div>
              <div style="background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:8px 10px;">
                <div style="font-size:11px;font-weight:700;color:#5fcc6a;margin-bottom:6px;">Pharmacy</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <label class="sk-custom-cb-wrap">
                    <span>Cameras</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="pharmacy" data-type="cameras" id="skp-shop-pharm-cam" checked>
                  </label>
                  <label class="sk-custom-cb-wrap">
                    <span>Checkpoint</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="pharmacy" data-type="checkpoint" id="skp-shop-pharm-chk" checked>
                  </label>
                </div>
              </div>
              <div style="background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:8px 10px;">
                <div style="font-size:11px;font-weight:700;color:#5fcc6a;margin-bottom:6px;">Cyber Force</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <label class="sk-custom-cb-wrap">
                    <span>Cameras</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="cyber_force" data-type="cameras" id="skp-shop-cyber-cam" checked>
                  </label>
                  <label class="sk-custom-cb-wrap">
                    <span>Guard</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="cyber_force" data-type="guard" id="skp-shop-cyber-guard" checked>
                  </label>
                </div>
              </div>
              <div style="background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:8px 10px;">
                <div style="font-size:11px;font-weight:700;color:#5fcc6a;margin-bottom:6px;">Jewelry Store</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <label class="sk-custom-cb-wrap">
                    <span>Cameras</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="jewelry_store" data-type="cameras" id="skp-shop-jewel-cam" checked>
                  </label>
                  <label class="sk-custom-cb-wrap">
                    <span>Guard</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="jewelry_store" data-type="guard" id="skp-shop-jewel-guard" checked>
                  </label>
                </div>
              </div>
              <div style="background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:8px 10px;">
                <div style="font-size:11px;font-weight:700;color:#5fcc6a;margin-bottom:6px;">Big Al's Gun Shop</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <label class="sk-custom-cb-wrap">
                    <span>Cameras</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="big_als" data-type="cameras" id="skp-shop-als-cam" checked>
                  </label>
                  <label class="sk-custom-cb-wrap">
                    <span>Guards</span>
                    <input type="checkbox" class="sk-shop-cb sk-custom-cb-input" data-shop="big_als" data-type="guards" id="skp-shop-als-guard" checked>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="sk-row" style="margin-top:4px;"><div class="sk-row-info"><div class="sk-row-title">Pickpocketing</div><div class="sk-row-desc">Color codes crimes based on difficulty and your current skill level</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-pickpocketing" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row" style="margin-top:4px;"><div class="sk-row-info"><div class="sk-row-title">Burglary</div><div class="sk-row-desc">Shows confidence percentage next to the burglary graphic</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-burglary" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Disposal</div><div class="sk-row-desc">Highlights best options and shows maximum nerve cost for Disposal</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-disposal" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Cracking</div><div class="sk-row-desc">Shows word suggestions while solving the Cracking crime</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-cracking" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Scamming</div><div class="sk-row-desc">Provides hints and assistance for the Scamming crime</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-scamming" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-outcome">
          <div class="sk-sh">Crime Outcome Display</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable Crime Outcome Customization</div><div class="sk-row-desc">Modify how the crime result panel is displayed</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-outcome-enable"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <label class="sk-field-label" style="margin-top:12px;">Display Mode</label>
          <select class="sk-select" id="skp-outcome-mode">
            <option value="0">Disabled — show outcome normally</option>
            <option value="1">Hidden — remove the outcome panel entirely</option>
            <option value="2">Minimal — hide story text, keep rewards</option>
          </select>
        </div>
      </div>
    </div>

    <!-- MUGGING -->
    <div class="sk-sec-page" id="skp-mugging">
      <div class="sk-subtab-bar">
        <button class="sk-subtab-btn active" data-tab="mugcalc">Calculator</button>
        <button class="sk-subtab-btn" data-tab="mugwarn">Warning</button>
      </div>
      <div class="sk-scroll">
        <div class="sk-subtab-panel active" id="skp-tab-mugcalc">
          <div class="sk-sh">Mug Calculator</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Enable Mug Calculator</div><div class="sk-row-desc">Shows mug value info on Market &amp; Bazaar</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-mug-calc"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <label class="sk-field-label" style="margin-top:10px;">Mug Merits (0-10)</label>
          <input type="number" id="mugMeritsInput" class="sk-input" min="0" max="10" placeholder="0">
          <label class="sk-field-label">Plunder % (20-49%)</label>
          <input type="number" id="plunderInput" class="sk-input" min="20" max="49" step="0.01" placeholder="e.g. 35.5">
          <div style="display:inline-flex;align-items:center;gap:6px;margin-top:6px;"><input type="checkbox" id="noPlunderCheckbox" style="width:13px;height:13px;accent-color:#5fcc6a;cursor:pointer;flex-shrink:0;"><label for="noPlunderCheckbox" style="font-size:11px;color:rgba(255,255,255,0.65);cursor:pointer;white-space:nowrap;">No Plunder Weapon <span style="color:rgba(255,255,255,0.35);font-size:10px;">— disables plunder bonus</span></label></div>
          <label class="sk-field-label" style="margin-top:10px;">Minimum Threshold ($)</label>
          <input type="number" id="thresholdInput" class="sk-input" min="0" placeholder="Only alert above this value">
          <div id="sidekick-mugcalc-status" style="margin-top:10px;padding:6px 10px;border-radius:4px;background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.5);font-size:11px;text-align:center;">Settings loaded</div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-mugwarn">
          <div class="sk-sh">Mug Warning</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable Mug Warning</div><div class="sk-row-desc">Show warning modal when viewing a recently mugged player</div></div><label class="sk-tog"><input type="checkbox" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <label class="sk-field-label" style="margin-top:10px;">Warning Window (hours)</label>
          <input type="number" class="sk-input" min="1" max="72" value="24" placeholder="24">
          <div class="sk-hint">Alert if you mugged the target within this many hours</div>
        </div>
      </div>
    </div>

    <!-- WAR -->
    <div class="sk-sec-page" id="skp-war">
      <div class="sk-subtab-bar">
        <button class="sk-subtab-btn active" data-tab="war-chainview">War Utilities</button>
        <button class="sk-subtab-btn" data-tab="war-chain">Chain Timer</button>
        <button class="sk-subtab-btn" data-tab="war-monitor">War Monitor</button>
        <button class="sk-subtab-btn" data-tab="war-target-caller">Target Caller</button>
      </div>
      <div class="sk-scroll">
        <div class="sk-subtab-panel active" id="skp-tab-war-chainview">
          <div class="sk-sh">Tools</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable Extended Chain View</div><div class="sk-row-desc">Show more than 10 chain attacks on faction page</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-chain-view" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Termed War Mode</div><div class="sk-row-desc">Removes Mug and Hospitalize options after an attack</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-termed-war"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-war-chain">
          <div class="sk-sh">Chain Timer</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable Chain Timer</div><div class="sk-row-desc">Show floating chain countdown timer on all Torn pages</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-chain-timer" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-sh" style="margin-top:16px;">Alert Settings</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Enable Alerts</div><div class="sk-row-desc">Trigger alerts when chain timer reaches the threshold</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-ct-alerts" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Browser Popup Alert</div><div class="sk-row-desc">Show a browser dialog popup when the chain is about to expire</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-ct-popup" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Screen Flash</div><div class="sk-row-desc">Flash the screen red when the chain timer hits the alert threshold</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-ct-flash" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <label class="sk-field-label" style="margin-top:10px;">Alert Threshold (minutes)</label>
          <div class="sk-slider-row"><input type="range" min="1" max="4" value="4" id="skp-ct-threshold" class="skp-slider" data-out="skp-chain-thresh-val" data-suffix=" min"><span class="sk-slider-val" id="skp-chain-thresh-val">4 min</span></div>
          <div class="sk-hint">Alert when chain has this many minutes remaining</div>
          <div class="sk-sh" style="margin-top:16px;">Display</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Floating Display</div><div class="sk-row-desc">Show floating timer widget on the page (draggable and resizable)</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-ct-floating" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-war-monitor">
          <div class="sk-sh">War Monitor</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable War Monitor</div><div class="sk-row-desc">Show travel status and hospital time and sort by hospital time on war page</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-war-monitor"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-war-target-caller">
          <div class="sk-sh">War Target Caller</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable War Target Caller</div><div class="sk-row-desc">Tag claimed players and add claim buttons</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-war-target-caller"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>

        </div>
      </div>
    </div>

    <!-- MISSIONS -->
    <div class="sk-sec-page" id="skp-missions">
      <div class="sk-subtab-bar">
        <button class="sk-subtab-btn active" data-tab="miss-tracker">Tracker</button>
        <button class="sk-subtab-btn" data-tab="book-notifier">Book Notifier</button>
      </div>
      <div class="sk-scroll">
        <div class="sk-subtab-panel active" id="skp-tab-miss-tracker">
          <div class="sk-sh">Mission Tracker</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable Mission Tracker</div><div class="sk-row-desc">Tracks if there is an active mission and displays an icon</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-mission-tracker" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>

        <div class="sk-subtab-panel" id="skp-tab-book-notifier">
          <div class="sk-sh">Book Notifier</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable Book Notifier</div><div class="sk-row-desc">Displays an icon when you have unclaimed book rewards</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-book-notifier" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
      </div>
    </div>

    <!-- EVENTS -->
    <div class="sk-sec-page" id="skp-events">
      <div class="sk-subtab-bar">
        <button class="sk-subtab-btn active" data-tab="ev-calendar">Calendar</button>
        <button class="sk-subtab-btn" data-tab="ev-egg">Easter</button>
      </div>
      <div class="sk-scroll">
        <div class="sk-subtab-panel active" id="skp-tab-ev-calendar">
          <div class="sk-sh">Event Calendar</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable Event Calendar</div><div class="sk-row-desc">Show upcoming events in a calendar widget</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-event-calendar" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-ev-egg">
          <div class="sk-sh">Easter</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable Egg Helper</div><div class="sk-row-desc">Assists with seasonal easter egg hunt events by tracking found eggs and showing hints</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-easter" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
      </div>
    </div>

</div><!-- /sk-prev -->
</div><!-- /sk-prev -->
`;

            document.body.appendChild(overlay);

            // Set logo via chrome.runtime.getURL (avoids white background from external hosts)
            const logoImg = overlay.querySelector('#skp-logo-img');
            if (logoImg) logoImg.src = chrome.runtime.getURL('assets/icons/sidekick-logo.png');

            // Weapon XP overview button
            const wxpOverviewBtn = overlay.querySelector('#skp-wxp-overview-btn');
            if (wxpOverviewBtn) {
                wxpOverviewBtn.addEventListener('click', () => {
                    if (window.SidekickModules?.WeaponExpTracker?.openWeaponsOverview) {
                        window.SidekickModules.WeaponExpTracker.openWeaponsOverview();
                    } else {
                        alert('Weapon XP Tracker module not loaded. Please enable it and reload the page.');
                    }
                });
            }


            // Load sidebar nav icons
            overlay.querySelectorAll('.sk-nav-icon-img').forEach(img => {
                const icon = img.getAttribute('data-icon');
                if (icon) img.src = chrome.runtime.getURL('assets/icons/' + icon);
                img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
            });

            // Track if settings changed for reload
            overlay.addEventListener('change', () => { overlay.dataset.settingsChanged = 'true'; });
            overlay.addEventListener('input', () => { overlay.dataset.settingsChanged = 'true'; });

            // Close on backdrop click disabled as requested

            // Close button
            overlay.querySelector('#skp-close').addEventListener('click', () => {
                overlay.remove();
                document.body.style.overflow = '';
                if (overlay.dataset.settingsChanged === 'true') {
                    window.location.reload();
                }
            });

            // Section navigation
            const sectionTitles = {
                general: 'General Settings', features: 'Features', profile: 'Profile',
                crimes: 'Crimes', mugging: 'Mugging', war: 'War', missions: 'Missions', events: 'Events'
            };
            overlay.querySelectorAll('.sk-nav-item').forEach(item => {
                item.addEventListener('click', () => {
                    overlay.querySelectorAll('.sk-nav-item').forEach(n => n.classList.remove('active'));
                    item.classList.add('active');
                    overlay.querySelectorAll('.sk-sec-page').forEach(p => p.classList.remove('active'));
                    const page = overlay.querySelector('#skp-' + item.dataset.section);
                    if (page) page.classList.add('active');
                    overlay.querySelector('#skp-title').textContent = sectionTitles[item.dataset.section] || '';
                });
            });

            // Sub-tab navigation (section-level and shelf-level)
            overlay.querySelectorAll('.sk-subtab-bar').forEach(bar => {
                const isShelfTab = bar.classList.contains('sk-shelf-tabs');
                bar.querySelectorAll('.sk-subtab-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        if (isShelfTab) {
                            const shelf = bar.closest('.sk-shelf');
                            bar.querySelectorAll('.sk-subtab-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            if (shelf) {
                                shelf.querySelectorAll('.sk-subtab-panel').forEach(p => p.classList.remove('active'));
                                const panel = shelf.querySelector('#skp-tab-' + btn.dataset.tab);
                                if (panel) panel.classList.add('active');
                            }
                        } else {
                            const section = bar.closest('.sk-sec-page');
                            bar.querySelectorAll('.sk-subtab-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            section.querySelectorAll(':scope > .sk-scroll > .sk-subtab-panel').forEach(p => p.classList.remove('active'));
                            const panel2 = section.querySelector('#skp-tab-' + btn.dataset.tab);
                            if (panel2) panel2.classList.add('active');
                        }
                    });
                });
            });

            // Sliders
            overlay.querySelectorAll('.skp-slider').forEach(slider => {
                const outId = slider.dataset.out;
                const suffix = slider.dataset.suffix || '';
                const out = overlay.querySelector('#' + outId);
                if (out) slider.addEventListener('input', () => { out.textContent = slider.value + suffix; });
            });

            // Ghost Trade row: show/hide based on deposit target selection
            const depositSel = overlay.querySelector('#skp-deposit-target');
            const ghostRow = overlay.querySelector('#skp-ghost-row');
            if (depositSel && ghostRow) {
                depositSel.addEventListener('change', () => {
                    ghostRow.style.display = depositSel.value === 'ghost' ? 'block' : 'none';
                });
            }

            // Shelf toggle buttons (settings expand/collapse)
            overlay.querySelectorAll('.sk-shelf-toggle').forEach(btn => {
                btn.addEventListener('click', () => {
                    const shelf = overlay.querySelector('#' + btn.dataset.shelf);
                    if (!shelf) return;
                    const open = shelf.style.display !== 'none';
                    shelf.style.display = open ? 'none' : 'block';
                    btn.innerHTML = open ? 'Settings ▾' : 'Settings ▴';
                });
            });

            // Drag-scroll for shelf tab bars
            overlay.querySelectorAll('.sk-shelf-tabs').forEach(bar => {
                let isDown = false, startX = 0, scrollLeft = 0;
                bar.addEventListener('mousedown', e => { isDown = true; startX = e.pageX - bar.offsetLeft; scrollLeft = bar.scrollLeft; bar.style.cursor = 'grabbing'; e.preventDefault(); });
                document.addEventListener('mouseup', () => { isDown = false; bar.style.cursor = 'grab'; });
                bar.addEventListener('mousemove', e => { if (!isDown) return; e.preventDefault(); bar.scrollLeft = scrollLeft - (e.pageX - bar.offsetLeft - startX); });
            });

            // ─── k/m shorthand for mug calculator threshold ────────────────
            const mugThreshInput = overlay.querySelector('.sk-input[placeholder="Only alert above this value"]');
            if (mugThreshInput) {
                mugThreshInput.addEventListener('blur', () => {
                    const raw = mugThreshInput.value.trim().toLowerCase();
                    if (/^\d+(\.\d+)?k$/.test(raw)) mugThreshInput.value = Math.round(parseFloat(raw) * 1000);
                    else if (/^\d+(\.\d+)?m$/.test(raw)) mugThreshInput.value = Math.round(parseFloat(raw) * 1000000);
                });
            }

            // ─── Unified settings save/load for all toggle switches ────────
            const CS = () => window.SidekickModules?.Core?.ChromeStorage;

            // Toggle save/load map: [inputSelector, storageKey, subKey|null, defaultEnabled]
            // subKey=null means the top-level object has {isEnabled: bool}
            // subKey='X' means object at sidekick_settings['X'].isEnabled
            const TOGGLE_MAP = [
                // API
                ['#sidekick-api-key', 'sidekick_api_key', null, ''],
                ['#sidekick-secondary-api-key', 'sidekick_secondary_api_key', null, ''],
                // Personal
                ['#skp-tog-fast-attack', 'sidekick_attack_button_mover', null, true],
                ['#skp-tog-loadout', 'sidekick_settings', 'loadout-switcher', false],
                ['#skp-tog-locked-items', 'sidekick_settings', 'locked-items', false],
                ['#skp-tog-wxp', 'sidekick_weapon_xp_tracker', null, false],
                // Gym
                ['#skp-tog-gym-ratios', 'sidekick_settings', 'special-gym-ratios', true],
                ['#skp-tog-auto-gym', 'sidekick_settings', 'auto-gym-switch', false],

                // Economy
                ['#skp-tog-market-max-qty', 'sidekick_market_max_qty', null, true],
                ['#skp-tog-market-filler', 'sidekick_settings', 'price-filler', false],
                ['#skp-tog-bazaar-filler', 'sidekick_settings', 'bazaar-filler', false],
                ['#skp-tog-quick-deposit', 'sidekick_settings', 'quick-deposit', false],
                ['#skp-tog-bunker-bucks', 'sidekick_settings', 'bunker-bucks', false],
                // Utility
                ['#skp-tog-time-on-tab', 'sidekick_time_on_tab', null, false],
                ['#skp-tog-random-target', 'sidekick_random_target', null, false],
                ['#skp-tog-legible-names', 'sidekick_settings', 'legible-names', false],
                ['#skp-tog-xanax-viewer', 'sidekick_xanax_viewer', null, false],
                ['#skp-tog-refill-blocker', 'sidekick_refill_blocker', null, false],
                ['#skp-tog-auction-bonus', 'sidekick_settings', 'auction-weapon-bonus', false],

                // Reminders
                ['#skp-tog-travel-blocker', 'sidekick_travel_blocker', null, true],
                ['#skp-travelblocker-oc-watcher', 'sidekick_travel_blocker', 'oc_watcher', true],
                ['#skp-travelblocker-drug-cooldown', 'sidekick_travel_blocker', 'drug_cooldown', true],
                ['#skp-travelblocker-war-watch', 'sidekick_travel_blocker', 'war_watch', true],
                ['#skp-tog-racing-alert', 'sidekick_racing_alert', null, false],
                ['#skp-tog-rehab-warning', 'sidekick_rehab_warning', null, false],
                ['#skp-tog-blood-bag', 'sidekick_settings', 'blood-bag-reminder', false],
                // Crimes
                ['#skp-tog-sfc', 'sidekick_settings', 'crime-sfc', false],
                ['#skp-tog-shoplifting', 'sidekick_settings', 'crime-notifier', false],
                ['#skp-tog-pickpocketing', 'sidekick_settings', 'crime-pickpocketing', false],
                ['#skp-tog-burglary', 'sidekick_settings', 'crime-burglary', false],
                ['#skp-tog-disposal', 'sidekick_settings', 'crime-disposal', false],
                ['#skp-tog-cracking', 'sidekick_settings', 'crime-cracking', false],
                ['#skp-tog-scamming', 'sidekick_settings', 'crime-scamming', false],
                // War
                ['#skp-tog-chain-timer', 'sidekick_chain_timer', null, false],
                ['#skp-tog-war-monitor', 'sidekick_war_monitor', null, false],
                ['#skp-tog-chain-view', 'sidekick_extended_chain_view', null, false],
                ['#skp-tog-termed-war', 'sidekick_settings', 'termed-war-mode', false],
                ['#skp-tog-war-target-caller', 'sidekick_war_target_caller', null, false],

                // Missions

                ['#skp-tog-mission-tracker', 'sidekick_settings', 'mission-tracker', false],
                // Events
                ['#skp-tog-event-calendar', 'sidekick_settings', 'event-calendar', false],
                ['#skp-tog-easter', 'sidekick_holiday', null, false],
                // Medical
                ['#skp-tog-smart-medical', 'sidekick_smart_medical', null, false],
                // Mugging
                ['#skp-tog-mug-calc', 'sidekick_mug_calculator', null, false],
            ];

            // Helper: read isEnabled from storage
            async function loadToggle(storageKey, subKey) {
                if (!CS()) return false;
                const data = await CS().get(storageKey) || {};
                if (subKey) {
                    return (data[subKey] && data[subKey].isEnabled === true);
                }
                return data.isEnabled === true;
            }

            // Helper: write isEnabled to storage
            async function saveToggle(storageKey, subKey, enabled) {
                if (!CS()) return;
                if (subKey) {
                    const data = await CS().get(storageKey) || {};
                    if (!data[subKey]) data[subKey] = {};
                    data[subKey].isEnabled = enabled;
                    await CS().set(storageKey, data);
                } else {
                    const data = await CS().get(storageKey) || {};
                    data.isEnabled = enabled;
                    await CS().set(storageKey, data);
                }
            }



            // Load all toggles from storage
            (async () => {
                // Load API keys into inputs
                const apiKey = CS() ? await CS().get('sidekick_api_key') : null;
                const secApiKey = CS() ? await CS().get('sidekick_secondary_api_key') : null;
                const apiInput = overlay.querySelector('#sidekick-api-key');
                const secApiInput = overlay.querySelector('#sidekick-secondary-api-key');
                if (apiInput && apiKey) apiInput.value = apiKey;
                if (secApiInput && secApiKey) {
                    secApiInput.value = secApiKey;
                    const secApiBtn = overlay.querySelector('#skp-add-secondary-api-btn');
                    const secApiCont = overlay.querySelector('#skp-secondary-api-container');
                    if (secApiBtn) secApiBtn.style.display = 'none';
                    if (secApiCont) secApiCont.style.display = 'block';
                }

                // Load all module toggles
                for (const [sel, storKey, subKey] of TOGGLE_MAP) {
                    const inp = overlay.querySelector(sel);
                    if (!inp) continue;
                    try {
                        const enabled = await loadToggle(storKey, subKey);
                        inp.checked = enabled;
                    } catch (e) { /* storage not ready */ }
                }
            })();

            // Wire change events for all toggles
            for (const [sel, storKey, subKey] of TOGGLE_MAP) {
                const inp = overlay.querySelector(sel);
                if (!inp) continue;
                inp.addEventListener('change', async () => {
                    try { await saveToggle(storKey, subKey, inp.checked); } catch (e) { }
                });
            }

            // ─── Medical settings: load and wire dropdowns ─────────────────
            const medItemSrc = overlay.querySelector('#skp-med-item-source');
            const medBloodType = overlay.querySelector('#skp-med-blood-type');
            if (medItemSrc || medBloodType) {
                (async () => {
                    const medData = CS() ? (await CS().get('sidekick_smart_medical') || {}) : {};
                    if (medItemSrc && medData.itemSource) medItemSrc.value = medData.itemSource;
                    if (medBloodType && medData.bloodType) medBloodType.value = medData.bloodType;
                })();
                if (medItemSrc) {
                    medItemSrc.addEventListener('change', async () => {
                        if (!CS()) return;
                        const d = await CS().get('sidekick_smart_medical') || {};
                        d.itemSource = medItemSrc.value;
                        await CS().set('sidekick_smart_medical', d);
                        if (window.SidekickModules?.SmartMedicalButton?.updateSetting)
                            window.SidekickModules.SmartMedicalButton.updateSetting('itemSource', medItemSrc.value);
                    });
                }
                if (medBloodType) {
                    medBloodType.addEventListener('change', async () => {
                        if (!CS()) return;
                        const d = await CS().get('sidekick_smart_medical') || {};
                        d.bloodType = medBloodType.value;
                        await CS().set('sidekick_smart_medical', d);
                        if (window.SidekickModules?.SmartMedicalButton?.updateSetting)
                            window.SidekickModules.SmartMedicalButton.updateSetting('bloodType', medBloodType.value);
                    });
                }
            }

            // ─── Chain Timer sub-settings save/load ────────────────────────
            const CT_KEY = 'sidekick_chain_timer';
            const ctSubMap = [
                ['#skp-tog-ct-alerts', 'alertsEnabled'],
                ['#skp-tog-ct-popup', 'popupEnabled'],
                ['#skp-tog-ct-flash', 'screenFlashEnabled'],
                ['#skp-tog-ct-floating', 'floatingDisplayEnabled'],
            ];
            // Load chain timer sub-settings
            (async () => {
                if (!CS()) return;
                const ctData = await CS().get(CT_KEY) || {};
                ctSubMap.forEach(([sel, key]) => {
                    const el = overlay.querySelector(sel);
                    if (!el) return;
                    // Default true unless explicitly false
                    el.checked = ctData[key] !== false;
                });
                // Load threshold
                const ctThresh = overlay.querySelector('#skp-ct-threshold');
                const ctThreshVal = overlay.querySelector('#skp-chain-thresh-val');
                if (ctThresh && ctData.alertThresholdSeconds) {
                    const mins = Math.round(ctData.alertThresholdSeconds / 60);
                    ctThresh.value = Math.min(4, Math.max(1, mins));
                    if (ctThreshVal) ctThreshVal.textContent = ctThresh.value + ' min';
                }
            })();
            // Wire chain timer sub-toggles
            ctSubMap.forEach(([sel, key]) => {
                const el = overlay.querySelector(sel);
                if (!el) return;
                el.addEventListener('change', async () => {
                    if (!CS()) return;
                    const d = await CS().get(CT_KEY) || {};
                    d[key] = el.checked;
                    await CS().set(CT_KEY, d);
                    // Live-update running module
                    if (window.SidekickModules?.ChainTimer) {
                        window.SidekickModules.ChainTimer[key] = el.checked;
                        window.SidekickModules.ChainTimer.saveSettings?.();
                    }
                });
            });
            // Wire threshold slider
            const ctThresh = overlay.querySelector('#skp-ct-threshold');
            if (ctThresh) {
                ctThresh.addEventListener('change', async () => {
                    if (!CS()) return;
                    const secs = parseInt(ctThresh.value, 10) * 60;
                    const d = await CS().get(CT_KEY) || {};
                    d.alertThresholdSeconds = secs;
                    await CS().set(CT_KEY, d);
                    if (window.SidekickModules?.ChainTimer) {
                        window.SidekickModules.ChainTimer.alertThresholdSeconds = secs;
                        window.SidekickModules.ChainTimer.saveSettings?.();
                    }
                });
            }

            // === Block Training: also write isBlocked field ===
            const btInp = overlay.querySelector('#skp-tog-block-training');
            if (btInp) {
                btInp.addEventListener('change', async () => {
                    if (!CS()) return;
                    const d = await CS().get('sidekick_blocktraining') || {};
                    d.isEnabled = btInp.checked;
                    d.isBlocked = btInp.checked;
                    await CS().set('sidekick_blocktraining', d);
                    if (window.SidekickModules?.BlockTraining) {
                        window.SidekickModules.BlockTraining.isBlocked = btInp.checked;
                        if (btInp.checked) window.SidekickModules.BlockTraining.startBlocking?.();
                        else window.SidekickModules.BlockTraining.stopBlocking?.();
                    }
                });
                (async () => {
                    if (!CS()) return;
                    const d = await CS().get('sidekick_blocktraining') || {};
                    btInp.checked = d.isBlocked === true || d.isEnabled === true;
                })();
            }

            // === Blood Bag Reminder: special fields ===
            const bbBags = overlay.querySelector('#skp-bb-bags');
            const bbDest = overlay.querySelector('#skp-bb-dest');
            const bbNewTab = overlay.querySelector('#skp-bb-newtab');

            const saveBloodBagSettings = async () => {
                if (!CS()) return;
                const d = await CS().get('sidekick_settings') || {};
                const bbSet = d['blood-bag-reminder'] || {};
                bbSet.bagsToFill = parseInt(bbBags.value, 10);
                bbSet.destination = bbDest.value;
                bbSet.openInNewTab = bbNewTab.checked;
                d['blood-bag-reminder'] = bbSet;
                await CS().set('sidekick_settings', d);
                if (window.SidekickModules?.BloodBagReminder) {
                    window.SidekickModules.BloodBagReminder.updateSettings(bbSet);
                }
            };

            if (bbBags) bbBags.addEventListener('change', saveBloodBagSettings);
            if (bbDest) bbDest.addEventListener('change', saveBloodBagSettings);
            if (bbNewTab) bbNewTab.addEventListener('change', saveBloodBagSettings);

            (async () => {
                if (!CS()) return;
                const d = await CS().get('sidekick_settings');
                if (d && d['blood-bag-reminder']) {
                    const bbSet = d['blood-bag-reminder'];
                    if (bbBags && bbSet.bagsToFill !== undefined) bbBags.value = bbSet.bagsToFill;
                    if (bbDest && bbSet.destination !== undefined) bbDest.value = bbSet.destination;
                    if (bbNewTab && bbSet.openInNewTab !== undefined) bbNewTab.checked = bbSet.openInNewTab;
                }
            })();

            // === Rehab Warning: special fields ===
            const rwEduThreshold = overlay.querySelector('#skp-rehab-edu-threshold');
            const rwCompanyEnable = overlay.querySelector('#skp-rehab-company-enable');
            const rwCompanyPenalty = overlay.querySelector('#skp-rehab-company-penalty');
            const rwCompanyWrap = overlay.querySelector('#skp-rehab-company-wrap');

            const saveRehabSettings = async () => {
                if (!CS()) return;
                const d = await CS().get('sidekick_rehab_warning') || {};
                d.eduThreshold = parseInt(rwEduThreshold.value, 10);
                d.companyEnable = rwCompanyEnable.checked;
                d.companyPenalty = parseInt(rwCompanyPenalty.value, 10);
                await CS().set('sidekick_rehab_warning', d);
                if (window.SidekickModules?.RehabWarning) {
                    window.SidekickModules.RehabWarning.updateSettings(d);
                }
                
                if (rwCompanyWrap) {
                    rwCompanyWrap.style.display = rwCompanyEnable.checked ? 'block' : 'none';
                }
            };

            if (rwEduThreshold) rwEduThreshold.addEventListener('change', saveRehabSettings);
            if (rwCompanyEnable) rwCompanyEnable.addEventListener('change', saveRehabSettings);
            if (rwCompanyPenalty) rwCompanyPenalty.addEventListener('change', saveRehabSettings);

            (async () => {
                if (!CS()) return;
                const d = await CS().get('sidekick_rehab_warning');
                if (d) {
                    if (rwEduThreshold && d.eduThreshold !== undefined) rwEduThreshold.value = d.eduThreshold;
                    if (rwCompanyEnable && d.companyEnable !== undefined) rwCompanyEnable.checked = d.companyEnable;
                    if (rwCompanyPenalty && d.companyPenalty !== undefined) rwCompanyPenalty.value = d.companyPenalty;
                    
                    if (rwCompanyWrap) {
                        rwCompanyWrap.style.display = rwCompanyEnable.checked ? 'block' : 'none';
                    }
                }
            })();

            // === Crime Outcome: load mode + wire selector ===
            const outcomeMode = overlay.querySelector('#skp-outcome-mode');
            const outcomeEnable = overlay.querySelector('#skp-tog-outcome-enable');
            if (outcomeMode) {
                (async () => {
                    if (!CS()) return;
                    const sett = await CS().get('sidekick_settings') || {};
                    const s = sett['hide-crime-outcome'] || {};
                    if (s.mode != null) outcomeMode.value = String(s.mode);
                    if (outcomeEnable) outcomeEnable.checked = s.isEnabled === true || (s.mode && s.mode > 0);
                })();
                const saveOutcome = async () => {
                    if (!CS()) return;
                    const sett = await CS().get('sidekick_settings') || {};
                    if (!sett['hide-crime-outcome']) sett['hide-crime-outcome'] = {};
                    const mode = parseInt(outcomeMode.value, 10);
                    sett['hide-crime-outcome'].mode = mode;
                    sett['hide-crime-outcome'].isEnabled = mode > 0;
                    if (outcomeEnable) outcomeEnable.checked = mode > 0;
                    await CS().set('sidekick_settings', sett);
                    if (window.SidekickModules?.HideCrimeOutcome) {
                        window.SidekickModules.HideCrimeOutcome.mode = mode;
                        window.SidekickModules.HideCrimeOutcome.isEnabled = mode > 0;
                        window.SidekickModules.HideCrimeOutcome.apply?.();
                    }
                };
                outcomeMode.addEventListener('change', saveOutcome);
                if (outcomeEnable) {
                    outcomeEnable.addEventListener('change', () => {
                        if (outcomeEnable.checked) {
                            outcomeMode.value = "1"; // Default to hidden when enabled
                        } else {
                            outcomeMode.value = "0"; // Disabled
                        }
                        saveOutcome();
                    });
                }
            }

            // === Shoplifting alert sub-settings ===
            const SL_KEY = 'crime-notifier';
            const slNotify = overlay.querySelector('#skp-shoplift-notify');
            const slInterval = overlay.querySelector('#skp-shoplift-interval');
            const slSelAll = overlay.querySelector('#skp-shoplift-sel-all');
            const slDeselAll = overlay.querySelector('#skp-shoplift-desel-all');
            const slCBs = [...overlay.querySelectorAll('.sk-shop-cb')];
            const saveShoplift = async () => {
                if (!CS()) return;
                const sett = await CS().get('sidekick_settings') || {};
                if (!sett[SL_KEY]) sett[SL_KEY] = {};
                sett[SL_KEY].notifySecurityDown = slNotify ? slNotify.checked : true;
                const mins = parseFloat(slInterval?.value || 1);
                sett[SL_KEY].checkInterval = Math.max(10000, Math.round(mins * 60 * 1000));
                const selected = slCBs.filter(cb => cb.checked).map(cb => cb.dataset.shop + '_' + cb.dataset.type);
                sett[SL_KEY].selectedShopSecurity = selected;
                await CS().set('sidekick_settings', sett);
                if (window.SidekickModules?.CrimeNotifier) {
                    Object.assign(window.SidekickModules.CrimeNotifier, {
                        notifySecurityDown: sett[SL_KEY].notifySecurityDown,
                        checkInterval: sett[SL_KEY].checkInterval,
                        selectedShopSecurity: selected
                    });
                }
            };
            (async () => {
                if (!CS()) return;
                const sett = await CS().get('sidekick_settings') || {};
                const s = sett[SL_KEY] || {};
                if (slNotify) slNotify.checked = s.notifySecurityDown !== false;
                if (slInterval && s.checkInterval) slInterval.value = Math.max(1, Math.round(s.checkInterval / 60000));
                const selected = s.selectedShopSecurity;
                if (selected) slCBs.forEach(cb => { cb.checked = selected.includes(cb.dataset.shop + '_' + cb.dataset.type); });
            })();
            if (slNotify) slNotify.addEventListener('change', saveShoplift);
            if (slInterval) slInterval.addEventListener('change', saveShoplift);
            slCBs.forEach(cb => cb.addEventListener('change', saveShoplift));
            if (slSelAll) slSelAll.addEventListener('click', () => { slCBs.forEach(cb => cb.checked = true); saveShoplift(); });
            if (slDeselAll) slDeselAll.addEventListener('click', () => { slCBs.forEach(cb => cb.checked = false); saveShoplift(); });

            // === Mug Calculator: save/load merits, plunder, noPlunder, threshold ===
            const mugMeritsEl   = overlay.querySelector('#mugMeritsInput');
            const mugPlunderEl  = overlay.querySelector('#plunderInput');
            const mugNoPlunderEl = overlay.querySelector('#noPlunderCheckbox');
            const mugThreshEl   = overlay.querySelector('#thresholdInput');

            // Load stored values into the inputs
            (async () => {
                if (!CS()) return;
                const merits    = await CS().get('mugMerits');
                const plunder   = await CS().get('mugPlunder');
                const noPlunder = await CS().get('mugNoPlunder');
                const thresh    = await CS().get('mugThreshold');
                if (mugMeritsEl   && merits    != null && merits    > 0) mugMeritsEl.value   = merits;
                if (mugPlunderEl  && plunder   != null && plunder   > 0) mugPlunderEl.value  = plunder;
                if (mugNoPlunderEl && noPlunder != null)                  mugNoPlunderEl.checked = noPlunder === true;
                if (mugThreshEl   && thresh    != null && thresh    > 0) mugThreshEl.value   = thresh;
                // Reflect noPlunder state on plunder input
                if (mugPlunderEl && mugNoPlunderEl) {
                    mugPlunderEl.disabled = mugNoPlunderEl.checked;
                    mugPlunderEl.style.opacity = mugNoPlunderEl.checked ? '0.4' : '1';
                }
            })();

            // Debounced save helper
            let mugSaveTimer;
            const saveMugSettings = () => {
                clearTimeout(mugSaveTimer);
                mugSaveTimer = setTimeout(async () => {
                    if (!CS()) return;
                    const meritsVal  = parseInt(mugMeritsEl?.value  ?? '', 10);
                    const threshVal  = parseInt(mugThreshEl?.value  ?? '', 10);
                    const noPlunder  = mugNoPlunderEl?.checked ?? false;
                    const plunderVal = noPlunder ? 0 : parseFloat(mugPlunderEl?.value ?? 0);
                    await CS().set('mugMerits',    isNaN(meritsVal)  ? 0 : Math.min(Math.max(meritsVal, 0), 10));
                    await CS().set('mugPlunder',   isNaN(plunderVal) ? 0 : plunderVal);
                    await CS().set('mugNoPlunder', noPlunder);
                    await CS().set('mugThreshold', isNaN(threshVal)  ? 0 : threshVal);
                    // Invalidate the mug data cache so the next popup reflects new settings
                    if (window.SidekickModules?.MugCalculator?.clearCache) {
                        window.SidekickModules.MugCalculator.clearCache();
                    }
                }, 400);
            };

            if (mugMeritsEl)    mugMeritsEl.addEventListener('input',  saveMugSettings);
            if (mugPlunderEl)   mugPlunderEl.addEventListener('input',  saveMugSettings);
            if (mugThreshEl)    mugThreshEl.addEventListener('input',  saveMugSettings);
            if (mugNoPlunderEl) {
                mugNoPlunderEl.addEventListener('change', () => {
                    if (mugPlunderEl) {
                        mugPlunderEl.disabled     = mugNoPlunderEl.checked;
                        mugPlunderEl.style.opacity = mugNoPlunderEl.checked ? '0.4' : '1';
                    }
                    saveMugSettings();
                });
            }

            // Attach specific tab listeners to the new preview overlay
            this.attachGeneralTabListeners(overlay);
            this.attachModulesTabListeners(overlay);
            this.attachXanaxTabListeners(overlay);
            this.attachChainTimerTabListeners(overlay);
            this.attachNotificationsTabListeners(overlay);

            this.attachBloodBagTabListeners(overlay);
            this.attachQuickDepositTabListeners(overlay);
            this.attachCrimeNotifierTabListeners(overlay);
            this.attachCrimesTabListeners(overlay);
            this.attachMugWarningTabListeners(overlay);
            this.attachMissionTrackerTabListeners(overlay);
            this.attachHideCrimeTabListeners(overlay);
            this.attachHolidayTabListeners(overlay);
            this.attachWarTargetCallerTabListeners(overlay);

        },
        // General Tab listeners
        attachGeneralTabListeners(panel) {
            const apiInput = panel.querySelector('#sidekick-api-key');
            const secApiInput = panel.querySelector('#sidekick-secondary-api-key');
            const testBtn = panel.querySelector('#sidekick-test-api');
            const statusDiv = panel.querySelector('#sidekick-api-status');

            // Auto-save API keys with debouncing
            const setupAutoSave = (inputEl, storageKey) => {
                let apiKeySaveTimeout;
                if (inputEl) {
                    inputEl.addEventListener('input', () => {
                        clearTimeout(apiKeySaveTimeout);
                        apiKeySaveTimeout = setTimeout(async () => {
                            const val = inputEl.value.trim();
                            if (!val) return;
                            try {
                                await window.SidekickModules.Core.ChromeStorage.set(storageKey, val);
                                this.showAutoSaveStatus(statusDiv, 'API key saved ✓');
                            } catch (error) {
                                console.error('Failed to save API key:', error);
                            }
                        }, 500);
                    });
                }
            };
            
            setupAutoSave(apiInput, 'sidekick_api_key');
            setupAutoSave(secApiInput, 'sidekick_secondary_api_key');

            testBtn.addEventListener('click', async () => {
                const key1 = apiInput?.value.trim();
                const key2 = secApiInput?.value.trim();
                
                if (!key1 && !key2) {
                    if (window.SidekickModules.Core.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show('API Test', 'Please enter an API key first', 'error', 3000);
                    }
                    return;
                }

                if (window.SidekickModules.Core.NotificationSystem) {
                    window.SidekickModules.Core.NotificationSystem.show('API Test', 'Testing API connection...', 'info', 2000);
                }

                try {
                    let results = [];
                    if (key1) {
                        const r = await fetch(`https://api.torn.com/user/?selections=basic&key=${key1}`);
                        const d = await r.json();
                        results.push(d.error ? `Primary Error: ${d.error.error}` : `Primary Working (${d.name})`);
                    }
                    if (key2) {
                        const r = await fetch(`https://api.torn.com/user/?selections=basic&key=${key2}`);
                        const d = await r.json();
                        results.push(d.error ? `Secondary Error: ${d.error.error}` : `Secondary Working (${d.name})`);
                    }
                    
                    const isError = results.some(msg => msg.includes('Error'));
                    const finalMsg = results.join(' | ');

                    if (window.SidekickModules.Core.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show('API Test', finalMsg, isError ? 'error' : 'success', 5000);
                    }
                } catch (error) {
                    if (window.SidekickModules.Core.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show('API Test', 'API test failed - check your connection', 'error', 3000);
                    }
                }
            });

            const showKeyBtn = panel.querySelector('#sidekick-show-key');
            if (showKeyBtn) {
                showKeyBtn.addEventListener('click', () => {
                    const toggleInput = (el) => {
                        if (!el) return;
                        el.type = el.type === 'password' ? 'text' : 'password';
                    };
                    toggleInput(apiInput);
                    toggleInput(secApiInput);
                    showKeyBtn.textContent = apiInput.type === 'password' ? 'Show Key' : 'Hide Key';
                });
            }

            const secApiBtn = document.getElementById('skp-add-secondary-api-btn');
            const secApiCont = document.getElementById('skp-secondary-api-container');
            if (secApiBtn && secApiCont) {
                secApiBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    secApiBtn.style.display = 'none';
                    secApiCont.style.display = 'block';
                });
                
                // If there's already a value in it, spawn it immediately
                if (document.getElementById('sidekick-secondary-api-key')?.value) {
                    secApiBtn.style.display = 'none';
                    secApiCont.style.display = 'block';
                }
            }

            const clearApiBtn = document.getElementById('skp-clear-api-key');
            if (clearApiBtn && apiInput) {
                clearApiBtn.addEventListener('click', () => {
                    apiInput.value = '';
                    apiInput.dispatchEvent(new Event('input')); // trigger save
                });
            }

            const clearSecApiBtn = document.getElementById('skp-clear-sec-api-key');
            if (clearSecApiBtn && secApiInput) {
                clearSecApiBtn.addEventListener('click', () => {
                    secApiInput.value = '';
                    secApiInput.dispatchEvent(new Event('input')); // trigger save
                });
            }

            // Calendar Refresh Button
            const refreshCalendarBtn = panel.querySelector('#sidekick-refresh-calendar');
            const calendarStatusDiv = panel.querySelector('#sidekick-calendar-status');
            const calendarLastYearSpan = panel.querySelector('#calendar-last-year');

            if (refreshCalendarBtn && window.SidekickModules?.EventTicker) {
                // Load last scraped year
                (async () => {
                    try {
                        const storage = await window.SidekickModules.Core.ChromeStorage.get('calendar_last_scraped_year');
                        const lastYear = storage?.calendar_last_scraped_year;
                        if (lastYear && calendarLastYearSpan) {
                            calendarLastYearSpan.textContent = lastYear;
                        }
                    } catch (error) {
                        console.error('Failed to load last scraped year:', error);
                    }
                })();

                refreshCalendarBtn.addEventListener('click', async () => {
                    refreshCalendarBtn.disabled = true;
                    refreshCalendarBtn.textContent = '🔄 Refreshing...';

                    try {
                        console.log('📅 Manual calendar refresh triggered from settings');
                        const scrapeResult = await window.SidekickModules.EventTicker.scrapeCalendarPage(true); // Force refresh

                        if (scrapeResult?.requiresCalendarPage) {
                            this.showStatus(calendarStatusDiv, 'Open Torn calendar page once to refresh events', 'info');

                            if (window.SidekickModules.Core.NotificationSystem) {
                                window.SidekickModules.Core.NotificationSystem.show(
                                    'Calendar Refresh Needed',
                                    'Open calendar.php to allow browser-context scraping',
                                    'info',
                                    4500
                                );
                            }
                        } else {
                            // Update last year display
                            const currentYear = new Date().getFullYear();
                            if (calendarLastYearSpan) {
                                calendarLastYearSpan.textContent = currentYear;
                            }

                            this.showStatus(calendarStatusDiv, 'Calendar refreshed successfully!', 'success');

                            if (window.SidekickModules.Core.NotificationSystem) {
                                window.SidekickModules.Core.NotificationSystem.show(
                                    'Calendar Updated',
                                    'Event calendar has been refreshed',
                                    'success',
                                    3000
                                );
                            }
                        }
                    } catch (error) {
                        console.error('❌ Calendar refresh failed:', error);
                        this.showStatus(calendarStatusDiv, 'Failed to refresh calendar', 'error');
                    } finally {
                        refreshCalendarBtn.disabled = false;
                        refreshCalendarBtn.textContent = '🔄 Refresh Event Calendar';
                    }
                });
            }

            // Export/Import functionality
            const exportBtn = panel.querySelector('#sidekick-export-data');
            const importBtn = panel.querySelector('#sidekick-import-data');
            const importFile = panel.querySelector('#sidekick-import-file');
            const backupStatus = panel.querySelector('#sidekick-backup-status');

            if (exportBtn) {
                exportBtn.addEventListener('click', async () => {
                    try {
                        exportBtn.disabled = true;
                        exportBtn.textContent = '📤 Exporting...';
                        this.showStatus(backupStatus, 'Collecting data...', 'info');

                        // Get all data from Chrome storage
                        const allData = await new Promise((resolve) => {
                            chrome.storage.local.get(null, (items) => {
                                resolve(items);
                            });
                        });

                        // Create backup object with metadata
                        const backup = {
                            version: '1.0',
                            timestamp: new Date().toISOString(),
                            extensionVersion: chrome.runtime.getManifest().version,
                            data: allData
                        };

                        // Create downloadable file
                        const dataStr = JSON.stringify(backup, null, 2);
                        const dataBlob = new Blob([dataStr], { type: 'application/json' });
                        const url = URL.createObjectURL(dataBlob);

                        // Trigger download
                        const date = new Date().toISOString().split('T')[0];
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `sidekick-backup-${date}.json`;
                        link.click();

                        URL.revokeObjectURL(url);

                        this.showStatus(backupStatus, `Exported ${Object.keys(allData).length} items successfully!`, 'success');

                        if (window.SidekickModules.Core.NotificationSystem) {
                            window.SidekickModules.Core.NotificationSystem.show(
                                'Backup Created',
                                `Downloaded sidekick-backup-${date}.json`,
                                'success',
                                3000
                            );
                        }
                    } catch (error) {
                        console.error('Export failed:', error);
                        this.showStatus(backupStatus, 'Export failed: ' + error.message, 'error');

                        if (window.SidekickModules.Core.NotificationSystem) {
                            window.SidekickModules.Core.NotificationSystem.show(
                                'Export Failed',
                                error.message,
                                'error',
                                5000
                            );
                        }
                    } finally {
                        exportBtn.disabled = false;
                        exportBtn.textContent = '📤 Export Data';
                    }
                });
            }

            if (importBtn && importFile) {
                importBtn.addEventListener('click', () => {
                    importFile.click();
                });

                importFile.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    try {
                        importBtn.disabled = true;
                        importBtn.textContent = '📥 Importing...';
                        this.showStatus(backupStatus, 'Reading backup file...', 'info');

                        // Read file
                        const text = await file.text();

                        // Parse JSON with detailed error handling
                        let backup;
                        try {
                            backup = JSON.parse(text);
                            console.log('📦 Backup file parsed successfully');
                            console.log('📦 Backup structure:', {
                                hasVersion: !!backup.version,
                                hasTimestamp: !!backup.timestamp,
                                hasExtensionVersion: !!backup.extensionVersion,
                                hasData: !!backup.data,
                                dataType: typeof backup.data,
                                dataKeys: backup.data ? Object.keys(backup.data).length : 0
                            });
                        } catch (parseError) {
                            console.error('❌ JSON parse error:', parseError);
                            throw new Error('File is not valid JSON. Please ensure you selected a valid Sidekick backup file.');
                        }

                        // Detailed validation with specific error messages
                        if (!backup) {
                            throw new Error('Backup file is empty or corrupted.');
                        }

                        if (!backup.version) {
                            console.error('❌ Missing version field. Backup structure:', Object.keys(backup));
                            throw new Error('Invalid backup: Missing version field. This may not be a Sidekick backup file.');
                        }

                        if (!backup.data) {
                            console.error('❌ Missing data field. Backup structure:', Object.keys(backup));
                            throw new Error('Invalid backup: Missing data field. The backup file appears to be corrupted.');
                        }

                        if (typeof backup.data !== 'object' || backup.data === null) {
                            console.error('❌ Invalid data field type:', typeof backup.data);
                            throw new Error('Invalid backup: Data field is not an object. The backup file is corrupted.');
                        }

                        const itemCount = Object.keys(backup.data).length;

                        if (itemCount === 0) {
                            console.warn('⚠️ Backup contains no data items');
                            if (!confirm('This backup file contains no data. Continue anyway?')) {
                                this.showStatus(backupStatus, 'Import cancelled', 'warning');
                                importBtn.textContent = '📥 Import Data';
                                importBtn.disabled = false;
                                importFile.value = '';
                                return;
                            }
                        }

                        // Show confirmation with backup details
                        const backupDate = backup.timestamp ? new Date(backup.timestamp).toLocaleString() : 'Unknown date';
                        const backupVersion = backup.extensionVersion || 'Unknown version';

                        console.log(`📦 Backup validated: ${itemCount} items from ${backupDate}`);

                        if (!confirm(
                            `Import backup from ${backupDate}?\n\n` +
                            `This will restore ${itemCount} items and may overwrite current data.\n\n` +
                            `Backup Version: ${backupVersion}\n` +
                            `Current Version: ${chrome.runtime.getManifest().version}`
                        )) {
                            this.showStatus(backupStatus, 'Import cancelled', 'warning');
                            importBtn.textContent = '📥 Import Data';
                            importBtn.disabled = false;
                            importFile.value = '';
                            return;
                        }

                        this.showStatus(backupStatus, 'Importing data...', 'info');
                        console.log('📥 Starting import of', itemCount, 'items...');

                        // Import data to Chrome storage
                        await new Promise((resolve, reject) => {
                            chrome.storage.local.set(backup.data, () => {
                                if (chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                } else {
                                    resolve();
                                }
                            });
                        });

                        console.log('✅ Import successful!');
                        this.showStatus(backupStatus, 'Data imported! Reloading page...', 'success');

                        if (window.SidekickModules.Core.NotificationSystem) {
                            window.SidekickModules.Core.NotificationSystem.show(
                                'Backup Restored',
                                'Data imported successfully. Reloading...',
                                'success',
                                2000
                            );
                        }

                        // Reload page after 2 seconds
                        setTimeout(() => {
                            window.location.reload();
                        }, 2000);

                    } catch (error) {
                        console.error('❌ Import failed:', error);
                        console.error('Error details:', {
                            name: error.name,
                            message: error.message,
                            stack: error.stack
                        });

                        this.showStatus(backupStatus, 'Import failed: ' + error.message, 'error');

                        if (window.SidekickModules.Core.NotificationSystem) {
                            window.SidekickModules.Core.NotificationSystem.show(
                                'Import Failed',
                                error.message,
                                'error',
                                5000
                            );
                        }
                    } finally {
                        importBtn.disabled = false;
                        importBtn.textContent = '📥 Import Data';
                        importFile.value = ''; // Reset file input
                    }
                });
            }
        },

        // Modules Tab listeners
        attachModulesTabListeners(panel) {
            const statusDiv = panel.querySelector('#sidekick-module-status');
            const toggleSwitches = panel.querySelectorAll('.toggle-switch[data-module]');

            // Setup toggle interactions with AUTO-SAVE (EXCLUDE notif-sound which has its own handler!)
            toggleSwitches.forEach(toggle => {
                // Skip notif-sound toggle - it has specialized handling in attachNotificationsTabListeners
                if (toggle.dataset.module === 'notif-sound') return;

                toggle.addEventListener('click', async () => {
                    const track = toggle.querySelector('.toggle-track');
                    const thumb = toggle.querySelector('.toggle-thumb');
                    const isActive = toggle.dataset.active === 'true';

                    toggle.dataset.active = (!isActive).toString(); // Convert to STRING!
                    this.updateToggleVisual(track, thumb, !isActive);

                    // AUTO-SAVE immediately after toggle
                    await this.saveModuleToggles(toggleSwitches, statusDiv);
                });
            });

            // Load initial toggle states from storage (with slight delay to ensure DOM is ready)
            setTimeout(() => {
                chrome.storage.local.get(['sidekick_settings'], (result) => {
                    const settings = result.sidekick_settings || {};
                    console.log('⚙️ Loading initial toggle states:', settings);

                    toggleSwitches.forEach(toggle => {
                        const moduleId = toggle.dataset.module;
                        const moduleSettings = settings[moduleId];
                        const isEnabled = moduleSettings ? moduleSettings.isEnabled === true : false;

                        // Set data attribute and update visual
                        toggle.dataset.active = isEnabled.toString();
                        const track = toggle.querySelector('.toggle-track');
                        const thumb = toggle.querySelector('.toggle-thumb');

                        if (track && thumb) {
                            this.updateToggleVisual(track, thumb, isEnabled);
                            console.log(`🔄 Loaded ${moduleId}: ${isEnabled ? 'ON' : 'OFF'}, colors applied`);
                        } else {
                            console.warn(`⚠️ Could not find track/thumb for ${moduleId}`);
                        }
                    });
                });
            }, 100);

            // Listen for storage changes from popup
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName === 'local' && changes.sidekick_settings) {
                    const newSettings = changes.sidekick_settings.newValue || {};
                    console.log('🔄 Settings changed, updating toggles:', newSettings);

                    toggleSwitches.forEach(toggle => {
                        const moduleId = toggle.dataset.module;
                        const moduleSettings = newSettings[moduleId];
                        const isEnabled = moduleSettings ? moduleSettings.isEnabled === true : false;

                        // Update data attribute and visual if changed
                        if (toggle.dataset.active !== isEnabled.toString()) {
                            toggle.dataset.active = isEnabled.toString();
                            const track = toggle.querySelector('.toggle-track');
                            const thumb = toggle.querySelector('.toggle-thumb');
                            this.updateToggleVisual(track, thumb, isEnabled);
                            console.log(`✅ Synced ${moduleId}: ${isEnabled ? 'ON' : 'OFF'}`);
                        }
                    });
                }
            });

            // Weapon overview link
            const weaponOverviewLink = panel.querySelector('#weapon-overview-link');
            if (weaponOverviewLink) {
                weaponOverviewLink.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.SidekickModules?.WeaponExpTracker?.openWeaponsOverview) {
                        try {
                            await window.SidekickModules.WeaponExpTracker.openWeaponsOverview();
                        } catch (error) {
                            console.error('[Sidekick] Error opening weapons overview:', error);
                            alert('Error opening weapons overview: ' + error.message);
                        }
                    } else {
                        console.error('[Sidekick] WeaponExpTracker module not available');
                        alert('Weapon XP Tracker module not available. Please enable it in settings and reload the page.');
                    }
                });
            }
        },

        // Helper method to save module toggles with auto-save feedback
        async saveModuleToggles(toggleSwitches, statusDiv) {
            // Get current settings from storage to preserve other modules
            chrome.storage.local.get(['sidekick_settings'], (result) => {
                const settings = result.sidekick_settings || {};

                // Update settings with current toggle states
                toggleSwitches.forEach(toggle => {
                    const moduleId = toggle.dataset.module;
                    const isEnabled = toggle.dataset.active === 'true';

                    // Update or create module settings
                    if (!settings[moduleId]) {
                        settings[moduleId] = {};
                    }
                    settings[moduleId].isEnabled = isEnabled;
                });

                // Save unified settings object
                chrome.storage.local.set({ sidekick_settings: settings }, () => {
                    // ALSO save to legacy format for backwards compatibility
                    // IMPORTANT: read existing value first to preserve fields like position
                    toggleSwitches.forEach(toggle => {
                        const moduleId = toggle.dataset.module;
                        const isEnabled = toggle.dataset.active === 'true';
                        const legacyKey = `sidekick_${moduleId.replace(/-/g, '_')}`;
                        chrome.storage.local.get([legacyKey], (existing) => {
                            const merged = Object.assign({}, existing[legacyKey] || {}, { isEnabled });
                            chrome.storage.local.set({ [legacyKey]: merged });
                        });
                    });

                    this.showAutoSaveStatus(statusDiv, 'Settings saved ✓');

                    if (window.SidekickModules.Core.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show(
                            'Modules Updated',
                            'Reloading page to apply changes...',
                            'info',
                            2000
                        );
                    }

                    console.log('✅ Saved settings (unified + legacy):', settings);

                    // Reload page to apply changes
                    setTimeout(() => {
                        window.location.reload();
                    }, 500);
                });
            });
        },


        // Xanax Viewer Tab listeners
        attachXanaxTabListeners(panel) {
            const xanaxAutoLimitSlider = panel.querySelector('#sidekick-xanax-autolimit');
            const xanaxAutoLimitDisplay = panel.querySelector('#sidekick-xanax-autolimit-display');
            const xanaxRelativeCheckbox = panel.querySelector('#sidekick-xanax-relative');
            const clearCacheBtn = panel.querySelector('#sidekick-clear-xanax-cache');
            const xanaxStatusDiv = panel.querySelector('#sidekick-xanax-status');

            // Auto-save helper function
            const autoSaveXanaxSettings = async () => {
                const settings = {
                    autoLimit: parseInt(xanaxAutoLimitSlider.value),
                    showRelative: xanaxRelativeCheckbox.checked,
                    isEnabled: true
                };

                try {
                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_xanax_viewer', settings);
                    this.showAutoSaveStatus(xanaxStatusDiv, 'Settings saved ✓');

                    // Toast notification
                    if (window.SidekickModules.Core.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show(
                            'Xanax Viewer',
                            'Settings saved automatically',
                            'success',
                            2000
                        );
                    }
                } catch (error) {
                    console.error('Failed to save Xanax Viewer settings:', error);
                    this.showStatus(xanaxStatusDiv, 'Failed to save settings', 'error');
                }
            };

            // Auto-save on slider change
            if (xanaxAutoLimitSlider) {
                xanaxAutoLimitSlider.addEventListener('input', () => {
                    if (xanaxAutoLimitDisplay) xanaxAutoLimitDisplay.textContent = xanaxAutoLimitSlider.value;
                });
                xanaxAutoLimitSlider.addEventListener('change', autoSaveXanaxSettings);
            }

            // Auto-save on checkbox change
            if (xanaxRelativeCheckbox) {
                xanaxRelativeCheckbox.addEventListener('change', autoSaveXanaxSettings);
            }

            if (clearCacheBtn) {
                clearCacheBtn.addEventListener('click', async () => {
                try {
                    await window.SidekickModules.Core.ChromeStorage.set('xanaxviewer_cache', {});
                    this.showStatus(xanaxStatusDiv, 'Cache cleared successfully!', 'success');

                    if (window.SidekickModules.Core.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show(
                            'Cache Cleared',
                            'Xanax Viewer cache has been cleared',
                            'info',
                            3000
                        );
                    }
                } catch (error) {
                    console.error('Failed to clear Xanax Viewer cache:', error);
                    this.showStatus(xanaxStatusDiv, 'Failed to clear cache', 'error');
                }
            });
            }
        },

        // Chain Timer Tab listeners
        attachChainTimerTabListeners(panel) {
            const chainTimerToggle = panel.querySelector('.toggle-switch[data-module="chain-timer"]');
            const chainThresholdSlider = panel.querySelector('#sidekick-chain-threshold');
            const chainThresholdDisplay = panel.querySelector('#sidekick-chain-threshold-display');
            const chainAlertsCheckbox = panel.querySelector('#sidekick-chain-alerts');
            const chainPopupCheckbox = panel.querySelector('#sidekick-chain-popup');
            const chainFlashCheckbox = panel.querySelector('#sidekick-chain-flash');
            const chainStatusDiv = panel.querySelector('#sidekick-chain-status');

            // Auto-save helper function
            const autoSaveChainSettings = async () => {
                const isEnabled = chainTimerToggle ? chainTimerToggle.dataset.active === 'true' : false;

                const settings = {
                    isEnabled: isEnabled,
                    alertThresholdSeconds: parseFloat(chainThresholdSlider.value) * 60,
                    alertsEnabled: chainAlertsCheckbox.checked,
                    popupEnabled: chainPopupCheckbox.checked,
                    screenFlashEnabled: chainFlashCheckbox.checked,
                    floatingDisplayEnabled: panel.querySelector('#sidekick-chain-floating-display').checked
                };

                try {
                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_chain_timer', settings);
                    this.showAutoSaveStatus(chainStatusDiv, 'Settings saved ✓');

                    // Toast notification
                    if (window.SidekickModules.Core.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show(
                            'Chain Timer',
                            'Settings saved automatically',
                            'success',
                            2000
                        );
                    }

                    // Immediately apply the settings to the chain timer module
                    if (window.SidekickModules?.ChainTimer) {
                        window.SidekickModules.ChainTimer.isEnabled = isEnabled;
                        window.SidekickModules.ChainTimer.alertThresholdSeconds = settings.alertThresholdSeconds;
                        window.SidekickModules.ChainTimer.alertsEnabled = settings.alertsEnabled;
                        window.SidekickModules.ChainTimer.popupEnabled = settings.popupEnabled;
                        window.SidekickModules.ChainTimer.screenFlashEnabled = settings.screenFlashEnabled;
                        window.SidekickModules.ChainTimer.floatingDisplayEnabled = settings.floatingDisplayEnabled;

                        // Start or stop monitoring based on enabled state
                        if (isEnabled) {
                            console.log('✅ Chain Timer enabled via settings');
                            window.SidekickModules.ChainTimer.startMonitoring();
                        } else {
                            console.log('⏸️ Chain Timer disabled via settings');
                            window.SidekickModules.ChainTimer.stopMonitoring();
                        }
                    }
                } catch (error) {
                    console.error('Failed to save Chain Timer settings:', error);
                    this.showStatus(chainStatusDiv, 'Failed to save settings', 'error');
                }
            };

            // Auto-save on slider change
            chainThresholdSlider.addEventListener('input', () => {
                chainThresholdDisplay.textContent = `${chainThresholdSlider.value} min`;
            });
            chainThresholdSlider.addEventListener('change', autoSaveChainSettings);

            // Auto-save on checkbox changes
            chainAlertsCheckbox.addEventListener('change', autoSaveChainSettings);
            chainPopupCheckbox.addEventListener('change', autoSaveChainSettings);
            chainFlashCheckbox.addEventListener('change', autoSaveChainSettings);
            panel.querySelector('#sidekick-chain-floating-display')?.addEventListener('change', autoSaveChainSettings);
        },

        // Notifications Tab listeners
        async attachNotificationsTabListeners(panel) {
            const notifSoundToggle = panel.querySelector('.toggle-switch[data-module="notif-sound"]');
            const notifAutoDismissCheckbox = panel.querySelector('#sidekick-notif-auto-dismiss');
            const notifDurationSlider = panel.querySelector('#sidekick-notif-duration');
            const notifDurationDisplay = panel.querySelector('#sidekick-notif-duration-display');
            const notifStatusDiv = panel.querySelector('#sidekick-notif-status');

            // CRITICAL: Load settings FIRST to initialize dataset.active BEFORE attaching click handler!
            // Using 'sidekick_notification_prefs' to avoid collision with notification history array
            const notifSettings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_notification_prefs') || {};

            const notifWindowsCheckbox = panel.querySelector('#sidekick-notif-windows');

            // Auto-save helper function
            const autoSaveNotifSettings = async () => {
                const settings = {
                    soundEnabled: notifSoundToggle?.dataset.active === 'true',
                    autoDismiss: notifAutoDismissCheckbox.checked,
                    windowsNotifications: notifWindowsCheckbox?.checked || false,
                    duration: parseInt(notifDurationSlider.value) * 1000
                };

                try {
                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_notification_prefs', settings);
                    this.showAutoSaveStatus(notifStatusDiv, 'Settings saved ✓');

                    // Toast notification
                    if (window.SidekickModules.Core.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show(
                            'Notifications',
                            'Settings saved automatically',
                            'success',
                            2000
                        );
                    }
                } catch (error) {
                    console.error('Failed to save Notification settings:', error);
                    this.showStatus(notifStatusDiv, 'Failed to save settings', 'error');
                }
            };

            // Setup notification sound toggle interaction
            if (notifSoundToggle) {
                // Initialize state from loaded settings
                const initialState = notifSettings.soundEnabled || false;
                notifSoundToggle.dataset.active = initialState ? 'true' : 'false';
                const track = notifSoundToggle.querySelector('.toggle-track');
                const thumb = notifSoundToggle.querySelector('.toggle-thumb');
                this.updateToggleVisual(track, thumb, initialState);

                console.log('🔊 Toggle initialized with state:', notifSoundToggle.dataset.active);

                // NOW attach click handler with properly initialized state and auto-save
                notifSoundToggle.addEventListener('click', async () => {
                    console.log('🔊 Toggle clicked!');
                    const isActive = notifSoundToggle.dataset.active === 'true';
                    console.log('🔊 Current state:', isActive, '→ New state:', !isActive);

                    // CRITICAL: dataset values are STRINGS, not booleans!
                    notifSoundToggle.dataset.active = !isActive ? 'true' : 'false';
                    this.updateToggleVisual(track, thumb, !isActive);

                    // Auto-save after toggle
                    await autoSaveNotifSettings();
                });
            } else {
                console.error('🔊 Notification sound toggle not found!');
            }

            // Load other notification settings
            if (notifAutoDismissCheckbox) {
                notifAutoDismissCheckbox.checked = notifSettings.autoDismiss !== false;
            }
            if (notifWindowsCheckbox) {
                notifWindowsCheckbox.checked = notifSettings.windowsNotifications || false;
                notifWindowsCheckbox.addEventListener('change', autoSaveNotifSettings);
            }
            if (notifDurationSlider) {
                const duration = (notifSettings.duration || 5000) / 1000;
                notifDurationSlider.value = duration;
                notifDurationDisplay.textContent = `${duration}s`;
            }

            // Auto-save on slider change
            if (notifDurationSlider) {
                notifDurationSlider.addEventListener('input', () => {
                    notifDurationDisplay.textContent = `${notifDurationSlider.value}s`;
                });
                notifDurationSlider.addEventListener('change', autoSaveNotifSettings);
            }

            // Auto-save on checkbox change
            if (notifAutoDismissCheckbox) {
                notifAutoDismissCheckbox.addEventListener('change', autoSaveNotifSettings);
            }
        },

        // Mug Calculator Tab listeners
        // Show auto-save status with brief visual feedback
        showAutoSaveStatus(element, message) {
            element.textContent = message;
            element.style.background = 'rgba(76, 175, 80, 0.3)';
            element.style.color = '#fff';

            setTimeout(() => {
                element.style.background = 'rgba(255,255,255,0.1)';
                element.style.color = '#ccc';
                element.textContent = 'Settings loaded';
            }, 2000);
        },

        // Get API key for other modules
        async getApiKey() {
            return await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
        },

        // Check if user is admin and show admin button
        async checkAndShowAdminButton(adminBtn) {
            if (!adminBtn) return;

            try {
                const apiKey = await this.getApiKey();
                if (!apiKey) return;

                // Fetch user ID from API
                const response = await fetch(`https://api.torn.com/user/?selections=basic&key=${apiKey}`);
                if (!response.ok) return;

                const data = await response.json();
                if (data.error) return;

                // Check if user is Machiacelli (ID: 2906949)
                if (data.player_id === 2906949) {
                    adminBtn.style.display = 'block';
                    console.log('👑 Admin access granted');
                }
            } catch (error) {
                console.debug('Admin check failed:', error);
            }
        },

        // Attach Blood Bag Reminder tab listeners
        async attachBloodBagTabListeners(panel) {
            const bagsInput = panel.querySelector('#bloodbag-count');
            const destinationSelect = panel.querySelector('#bloodbag-destination');
            const newTabCheckbox = panel.querySelector('#bloodbag-newtab');
            const statusDiv = panel.querySelector('#sidekick-bloodbag-status');

            if (!bagsInput || !destinationSelect || !newTabCheckbox) {
                console.warn('Blood Bag settings elements not found');
                return;
            }

            // Load current settings
            try {
                const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
                const bloodBagSettings = settings['blood-bag-reminder'] || {};

                bagsInput.value = bloodBagSettings.bagsToFill || 5;
                destinationSelect.value = bloodBagSettings.destination || 'items';
                newTabCheckbox.checked = bloodBagSettings.openInNewTab !== undefined ? bloodBagSettings.openInNewTab : false;
            } catch (error) {
                console.error('Failed to load Blood Bag settings:', error);
            }

            // Auto-save on change
            const saveSettings = async () => {
                try {
                    const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
                    settings['blood-bag-reminder'] = settings['blood-bag-reminder'] || {};
                    settings['blood-bag-reminder'].bagsToFill = parseInt(bagsInput.value);
                    settings['blood-bag-reminder'].destination = destinationSelect.value;
                    settings['blood-bag-reminder'].openInNewTab = newTabCheckbox.checked;

                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', settings);

                    // Update module if it's loaded
                    if (window.SidekickModules.BloodBagReminder) {
                        await window.SidekickModules.BloodBagReminder.updateSettings({
                            bagsToFill: parseInt(bagsInput.value),
                            destination: destinationSelect.value,
                            openInNewTab: newTabCheckbox.checked
                        });
                    }

                    this.showAutoSaveStatus(statusDiv, 'Settings saved ✓');
                } catch (error) {
                    console.error('Failed to save Blood Bag settings:', error);
                    this.showStatus(statusDiv, 'Failed to save settings', 'error');
                }
            };

            bagsInput.addEventListener('change', saveSettings);
            destinationSelect.addEventListener('change', saveSettings);
            newTabCheckbox.addEventListener('change', saveSettings);
        },

        // Attach Quick Deposit tab listeners
        async attachQuickDepositTabListeners(panel) {
            const targetSelect = panel.querySelector('#quickdeposit-target');
            const ghostIdInput = panel.querySelector('#quickdeposit-ghostid');
            const clearGhostBtn = panel.querySelector('#quickdeposit-clear-ghost');
            const statusDiv = panel.querySelector('#sidekick-quickdeposit-status');

            if (!targetSelect) {
                console.warn('Quick Deposit settings elements not found');
                return;
            }

            // Load current settings
            try {
                const targetStored = await window.SidekickModules.Core.ChromeStorage.get('quickDeposit_target');
                const ghostStored = await window.SidekickModules.Core.ChromeStorage.get('quickDeposit_ghostID');

                // Set dropdown value
                if (targetStored) {
                    targetSelect.value = targetStored;
                    console.log('🏦 Loaded target:', targetStored);
                }

                // Set ghost ID display
                if (ghostStored && ghostIdInput) {
                    ghostIdInput.value = `Ghost Trade: ${ghostStored}`;
                }
            } catch (error) {
                console.error('Failed to load Quick Deposit settings:', error);
            }

            // Save target selection
            if (targetSelect) {
                targetSelect.addEventListener('change', async () => {
                    const target = targetSelect.value;
                    try {
                        await window.SidekickModules.Core.ChromeStorage.set('quickDeposit_target', target);

                        // Update module if loaded
                        if (window.SidekickModules?.QuickDeposit) {
                            await window.SidekickModules.QuickDeposit.updateSettings({ target });
                        }

                        this.showAutoSaveStatus(statusDiv, 'Target saved ✓');

                        // Toast notification
                        if (window.SidekickModules.Core.NotificationSystem) {
                            window.SidekickModules.Core.NotificationSystem.show(
                                'Quick Deposit',
                                `Deposit target: ${target}`,
                                'success',
                                2000
                            );
                        }
                    } catch (error) {
                        console.error('Failed to save Quick Deposit target:', error);
                        this.showStatus(statusDiv, 'Failed to save settings', 'error');
                    }
                });
            }

            // Clear ghost ID button
            if (clearGhostBtn) {
                clearGhostBtn.addEventListener('click', async () => {
                    try {
                        await window.SidekickModules.Core.ChromeStorage.remove('quickDeposit_ghostID');

                        // Update module if loaded
                        if (window.SidekickModules?.QuickDeposit) {
                            await window.SidekickModules.QuickDeposit.clearGhostID();
                        }

                        // Clear display
                        if (ghostIdInput) {
                            ghostIdInput.value = 'No ghost ID set';
                        }

                        this.showAutoSaveStatus(statusDiv, 'Ghost ID cleared ✓');

                        // Toast notification
                        if (window.SidekickModules.Core.NotificationSystem) {
                            window.SidekickModules.Core.NotificationSystem.show(
                                'Quick Deposit',
                                'Ghost ID cleared',
                                'success',
                                2000
                            );
                        }
                    } catch (error) {
                        console.error('Failed to clear ghost ID:', error);
                        this.showStatus(statusDiv, 'Failed to clear ghost ID', 'error');
                    }
                });
            }
        },

        // Attach Crime Notifier tab listeners
        async attachCrimeNotifierTabListeners(panel) {
            const intervalInput = panel.querySelector('#crime-notifier-interval');
            const securityCheckbox = panel.querySelector('#crime-notifier-security');
            const searchCashCheckbox = panel.querySelector('#crime-notifier-searchcash');
            const thresholdSlider = panel.querySelector('#crime-notifier-threshold');
            const thresholdDisplay = panel.querySelector('#crime-notifier-threshold-display');
            const statusDiv = panel.querySelector('#sidekick-crime-notifier-status');

            if (!intervalInput) {
                console.warn('Crime Notifier settings elements not found');
                return;
            }

            // Auto-save helper function
            const autoSaveCrimeSettings = async () => {
                try {
                    const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
                    data['crime-notifier'] = {
                        isEnabled: data['crime-notifier']?.isEnabled || false,
                        checkInterval: parseInt(intervalInput.value) * 1000,  // Convert to ms
                        notifySecurityDown: securityCheckbox.checked,
                        notifySearchCash: searchCashCheckbox.checked,
                        searchCashThreshold: parseInt(thresholdSlider.value)
                    };
                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', data);

                    // Update module if loaded
                    if (window.SidekickModules?.CrimeNotifier) {
                        await window.SidekickModules.CrimeNotifier.loadSettings();
                    }

                    this.showAutoSaveStatus(statusDiv, 'Settings saved ✓');
                } catch (error) {
                    console.error('Failed to save Crime Notifier settings:', error);
                    this.showStatus(statusDiv, 'Failed to save settings', 'error');
                }
            };

            // Load current settings
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                if (data && data['crime-notifier']) {
                    const settings = data['crime-notifier'];
                    intervalInput.value = (settings.checkInterval || 30000) / 1000;  // Convert from ms
                    securityCheckbox.checked = settings.notifySecurityDown !== false;
                    searchCashCheckbox.checked = settings.notifySearchCash !== false;
                    thresholdSlider.value = settings.searchCashThreshold || 80;
                    thresholdDisplay.textContent = `${thresholdSlider.value}%`;
                }
            } catch (error) {
                console.error('Failed to load Crime Notifier settings:', error);
            }

            // Update threshold display on change
            if (thresholdSlider && thresholdDisplay) {
                thresholdSlider.addEventListener('input', () => {
                    thresholdDisplay.textContent = `${thresholdSlider.value}%`;
                });
                thresholdSlider.addEventListener('change', autoSaveCrimeSettings);
            }

            // Attach listeners
            if (intervalInput) {
                intervalInput.addEventListener('change', autoSaveCrimeSettings);
            }
            if (securityCheckbox) {
                securityCheckbox.addEventListener('change', autoSaveCrimeSettings);
            }
            if (searchCashCheckbox) {
                searchCashCheckbox.addEventListener('change', autoSaveCrimeSettings);
            }
        },

        // Attach Crime Notifier tab listeners
        async attachCrimeNotifierTabListeners(panel) {
            const intervalInput = panel.querySelector('#crime-notifier-interval');
            const securityCheckbox = panel.querySelector('#crime-notifier-security');
            const searchCashCheckbox = panel.querySelector('#crime-notifier-searchcash');
            const thresholdSlider = panel.querySelector('#crime-notifier-threshold');
            const thresholdDisplay = panel.querySelector('#crime-notifier-threshold-display');
            const statusDiv = panel.querySelector('#sidekick-crime-notifier-status');

            // Search location controls
            const searchAllBtn = panel.querySelector('#crime-search-all');
            const searchNoneBtn = panel.querySelector('#crime-search-none');

            if (!intervalInput) {
                console.warn('Crime Notifier settings elements not found');
                return;
            }

            // Auto-save helper function
            const autoSaveCrimeSettings = async () => {
                try {
                    const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};

                    // Preserve existing shop security and search location selections
                    const existingShopSecurity = data['crime-notifier']?.selectedShopSecurity || [];
                    const existingSearchLocations = data['crime-notifier']?.selectedSearchLocations || [];

                    data['crime-notifier'] = {
                        isEnabled: data['crime-notifier']?.isEnabled || false,
                        checkInterval: parseInt(intervalInput.value) * 1000,  // Convert to ms
                        notifySecurityDown: securityCheckbox.checked,
                        notifySearchCash: searchCashCheckbox.checked,
                        searchCashThreshold: parseInt(thresholdSlider.value),
                        selectedShopSecurity: existingShopSecurity,
                        selectedSearchLocations: existingSearchLocations
                    };
                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', data);

                    // Update module if loaded
                    if (window.SidekickModules?.CrimeNotifier) {
                        await window.SidekickModules.CrimeNotifier.loadSettings();
                    }

                    this.showAutoSaveStatus(statusDiv, 'Settings saved ✓');
                } catch (error) {
                    console.error('Failed to save Crime Notifier settings:', error);
                    this.showStatus(statusDiv, 'Failed to save settings', 'error');
                }
            };

            // Load current settings
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                if (data && data['crime-notifier']) {
                    const settings = data['crime-notifier'];
                    intervalInput.value = (settings.checkInterval || 30000) / 1000;  // Convert from ms
                    securityCheckbox.checked = settings.notifySecurityDown !== false;
                    searchCashCheckbox.checked = settings.notifySearchCash !== false;
                    thresholdSlider.value = settings.searchCashThreshold || 80;
                    thresholdDisplay.textContent = `${thresholdSlider.value}%`;

                    // Set shop checkboxes
                    if (settings.selectedShops) {
                        shopCheckboxes.forEach(cb => {
                            cb.checked = settings.selectedShops.includes(cb.value);
                        });
                    }

                    // Set security type checkboxes
                    if (settings.selectedSecurityTypes) {
                        securityCheckboxes.forEach(cb => {
                            cb.checked = settings.selectedSecurityTypes.includes(cb.value);
                        });
                    }
                }
            } catch (error) {
                console.error('Failed to load Crime Notifier settings:', error);
            }

            // Load shop security data and search locations from API
            await this.loadShopSecurityData(panel, statusDiv);
            await this.loadSearchLocations(panel, statusDiv);

            // Update threshold display on change
            if (thresholdSlider && thresholdDisplay) {
                thresholdSlider.addEventListener('input', () => {
                    thresholdDisplay.textContent = `${thresholdSlider.value}%`;
                });
                thresholdSlider.addEventListener('change', autoSaveCrimeSettings);
            }

            // Attach listeners for basic settings
            if (intervalInput) {
                intervalInput.addEventListener('change', autoSaveCrimeSettings);
            }
            if (securityCheckbox) {
                securityCheckbox.addEventListener('change', autoSaveCrimeSettings);
            }
            if (searchCashCheckbox) {
                searchCashCheckbox.addEventListener('change', autoSaveCrimeSettings);
            }

            // Search location Select All/None buttons
            if (searchAllBtn) {
                searchAllBtn.addEventListener('click', () => {
                    const searchCbs = panel.querySelectorAll('.crime-search-checkbox');
                    searchCbs.forEach(cb => cb.checked = true);
                    autoSaveCrimeSettings();
                });
            }
            if (searchNoneBtn) {
                searchNoneBtn.addEventListener('click', () => {
                    const searchCbs = panel.querySelectorAll('.crime-search-checkbox');
                    searchCbs.forEach(cb => cb.checked = false);
                    autoSaveCrimeSettings();
                });
            }

            // Shop-security All/None buttons
            const shopsSecurityAllBtn = panel.querySelector('#crime-shops-security-all');
            const shopsSecurityNoneBtn = panel.querySelector('#crime-shops-security-none');

            if (shopsSecurityAllBtn) {
                shopsSecurityAllBtn.addEventListener('click', () => {
                    const cbs = panel.querySelectorAll('.crime-shop-security-checkbox');
                    cbs.forEach(cb => cb.checked = true);
                    const event = new Event('change');
                    cbs[0]?.dispatchEvent(event);
                });
            }
            if (shopsSecurityNoneBtn) {
                shopsSecurityNoneBtn.addEventListener('click', () => {
                    const cbs = panel.querySelectorAll('.crime-shop-security-checkbox');
                    cbs.forEach(cb => cb.checked = false);
                    const event = new Event('change');
                    cbs[0]?.dispatchEvent(event);
                });
            }
        },

        // Load shop security data dynamically from API
        async loadShopSecurityData(panel, statusDiv) {
            try {
                const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                if (!apiKey) {
                    console.warn('No API key - cannot load shop security data');
                    return;
                }

                const response = await fetch(`https://api.torn.com/torn/?selections=shoplifting&key=${apiKey}`);
                const data = await response.json();

                if (data.error) {
                    console.error('API error loading shop security:', data.error);
                    return;
                }

                const container = panel.querySelector('#crime-shop-security-list');
                if (!container) return;

                // Load saved selections
                const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                const selectedShopSecurity = settings?.['crime-notifier']?.selectedShopSecurity || [];

                // SHOPS order
                const shopKeys = ['sallys_sweet_shop', 'Bits_n_bobs', 'tc_clothing', 'super_store', 'pharmacy', 'cyber_force', 'jewelry_store', 'big_als'];
                const shopNames = {
                    'sallys_sweet_shop': "Sally's Sweet Shop",
                    'Bits_n_bobs': "Bits 'n' Bobs",
                    'tc_clothing': "TC Clothing",
                    'super_store': "Super Store",
                    'pharmacy': "Pharmacy",
                    'cyber_force': "Cyber Force",
                    'jewelry_store': "Jewelry Store",
                    'big_als': "Big Al's Gun Shop"
                };

                // Build HTML for each shop
                let html = '';
                shopKeys.forEach(shopKey => {
                    const shopData = data.shoplifting[shopKey];
                    if (!shopData) return;

                    const shopName = shopNames[shopKey];

                    // Build shop section
                    html += `
                        <div style="border: 1px solid rgba(255,255,255,0.1); border-radius: 5px; padding: 8px;">
                            <div style="color: #fff; font-weight: bold; margin-bottom: 6px; font-size: 13px;">${shopName}</div>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">
                    `;

                    // Add checkbox for each security measure
                    shopData.forEach(security => {
                        const comboKey = `${shopKey}_${security.title}`;
                        const checked = selectedShopSecurity.length === 0 || selectedShopSecurity.includes(comboKey) ? 'checked' : '';
                        html += `
                            <label style="display: flex; align-items: center; gap: 4px; color: #ccc; cursor: pointer; font-size: 12px;">
                                <input type="checkbox" class="crime-shop-security-checkbox" value="${comboKey}" ${checked} style="accent-color: #FF6B6B;">
                                <span>${security.title}</span>
                            </label>
                        `;
                    });

                    html += `
                            </div>
                        </div>
                    `;
                });

                container.innerHTML = html;

                // Attach listeners to shop security checkboxes
                const shopSecurityCheckboxes = panel.querySelectorAll('.crime-shop-security-checkbox');
                shopSecurityCheckboxes.forEach(cb => {
                    cb.addEventListener('change', async () => {
                        try {
                            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
                            const cbs = panel.querySelectorAll('.crime-shop-security-checkbox');
                            const selected = Array.from(cbs).filter(c => c.checked).map(c => c.value);

                            if (!data['crime-notifier']) {
                                data['crime-notifier'] = {};
                            }
                            data['crime-notifier'].selectedShopSecurity = selected;
                            await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', data);

                            if (window.SidekickModules?.CrimeNotifier) {
                                await window.SidekickModules.CrimeNotifier.loadSettings();
                            }

                            this.showAutoSaveStatus(statusDiv, 'Settings saved ✓');
                        } catch (error) {
                            console.error('Failed to save shop security selection:', error);
                        }
                    });
                });

            } catch (error) {
                console.error('Failed to load shop security data:', error);
            }
        },

        // Load search locations dynamically from API
        async loadSearchLocations(panel, statusDiv) {
            try {
                const apiKey = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                if (!apiKey) {
                    console.warn('No API key - cannot load search locations');
                    return;
                }

                const response = await fetch(`https://api.torn.com/torn/?selections=searchforcash&key=${apiKey}`);
                const data = await response.json();

                if (data.error) {
                    console.error('API error loading search locations:', data.error);
                    return;
                }

                const container = panel.querySelector('#crime-search-checkboxes');
                if (!container) return;

                // Build checkboxes from API data
                let html = '';
                const sortedLocations = Object.entries(data.searchforcash).sort((a, b) =>
                    a[1].title.localeCompare(b[1].title)
                );

                // Load saved selections
                const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                const selectedLocations = settings?.['crime-notifier']?.selectedSearchLocations || [];

                sortedLocations.forEach(([key, info]) => {
                    const checked = selectedLocations.length === 0 || selectedLocations.includes(key) ? 'checked' : '';
                    html += `
                        <label style="display:  flex; align-items: center; gap: 6px; color: #ccc; cursor: pointer; font-size: 13px;">
                            <input type="checkbox" class="crime-search-checkbox" value="${key}" ${checked} style="accent-color: #4CAF50;">
                            <span>${info.title}</span>
                        </label>
                    `;
                });

                container.innerHTML = html;

                // Attach listeners to search checkboxes
                const searchCheckboxes = panel.querySelectorAll('.crime-search-checkbox');
                searchCheckboxes.forEach(cb => {
                    cb.addEventListener('change', async () => {
                        try {
                            const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
                            const searchCbs = panel.querySelectorAll('.crime-search-checkbox');
                            const selected = Array.from(searchCbs).filter(c => c.checked).map(c => c.value);

                            if (data['crime-notifier']) {
                                data['crime-notifier'].selectedSearchLocations = selected;
                                await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', data);

                                if (window.SidekickModules?.CrimeNotifier) {
                                    await window.SidekickModules.CrimeNotifier.loadSettings();
                                }

                                this.showAutoSaveStatus(statusDiv, 'Settings saved ✓');
                            }
                        } catch (error) {
                            console.error('Failed to save search location:', error);
                        }
                    });
                });

            } catch (error) {
                console.error('Failed to load search locations:', error);
            }
        },

        // Attach Mug Warning Tab Listeners
        attachMugWarningTabListeners(panel) {
            const hoursInput = panel.querySelector('#mug-warning-hours');
            const modalBgInput = panel.querySelector('#mug-warning-modal-bg');
            const modalTextInput = panel.querySelector('#mug-warning-modal-text');
            const buttonColorInput = panel.querySelector('#mug-warning-button-color');
            const manageBtn = panel.querySelector('#manage-mug-targets');

            if (!hoursInput || !modalBgInput || !modalTextInput || !buttonColorInput) return;

            // Load current settings
            this.loadMugWarningSettings(panel);

            // Auto-save on hours change
            hoursInput.addEventListener('change', async () => {
                try {
                    const data = await window.SidekickModules.Core.ChromeStorage.get('mug-warning') || {};
                    data.hoursThreshold = parseInt(hoursInput.value) || 24;
                    await window.SidekickModules.Core.ChromeStorage.set('mug-warning', data);
                    if (window.SidekickModules?.MugWarning) {
                        await window.SidekickModules.MugWarning.loadSettings();
                    }
                } catch (error) {
                    console.error('Failed to save hours threshold:', error);
                }
            });

            // Auto-save on color changes
            [modalBgInput, modalTextInput, buttonColorInput].forEach(input => {
                input.addEventListener('change', async () => {
                    try {
                        const data = await window.SidekickModules.Core.ChromeStorage.get('mug-warning') || {};
                        data.modalBgColor = modalBgInput.value;
                        data.modalTextColor = modalTextInput.value;
                        data.buttonTextColor = buttonColorInput.value;
                        await window.SidekickModules.Core.ChromeStorage.set('mug-warning', data);
                        if (window.SidekickModules?.MugWarning) {
                            await window.SidekickModules.MugWarning.loadSettings();
                        }
                    } catch (error) {
                        console.error('Failed to save colors:', error);
                    }
                });
            });

            // Manage targets button
            if (manageBtn) {
                manageBtn.addEventListener('click', async () => {
                    try {
                        const targets = await window.SidekickModules.Core.ChromeStorage.get('mug_targets') || {};
                        const ids = Object.keys(targets);
                        const message = ids.length > 0
                            ? `Current mug targets (${ids.length}):\n${ids.join(', ')}\n\nEnter IDs to add (comma-separated) or leave blank to clear all:`
                            : 'No mug targets set.\n\nEnter player IDs to add as mug targets (comma-separated):';

                        const input = prompt(message, '');
                        if (input === null) return; // Cancelled

                        if (input.trim() === '') {
                            // Clear all
                            await window.SidekickModules.Core.ChromeStorage.set('mug_targets', {});
                            alert('All mug targets cleared!');
                        } else {
                            // Add new targets
                            const newIds = input.split(',').map(id => id.trim()).filter(id => id);
                            const newTargets = {};
                            newIds.forEach(id => newTargets[id] = true);
                            await window.SidekickModules.Core.ChromeStorage.set('mug_targets', newTargets);
                            alert(`${newIds.length} mug target(s) saved!`);
                        }
                    } catch (error) {
                        console.error('Failed to manage targets:', error);
                        alert('Error managing targets: ' + error.message);
                    }
                });
            }
        },

        // Load Mug Warning Settings
        async loadMugWarningSettings(panel) {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get('mug-warning') || {};
                const hoursInput = panel.querySelector('#mug-warning-hours');
                const modalBgInput = panel.querySelector('#mug-warning-modal-bg');
                const modalTextInput = panel.querySelector('#mug-warning-modal-text');
                const buttonColorInput = panel.querySelector('#mug-warning-button-color');

                if (hoursInput) hoursInput.value = data.hoursThreshold || 24;
                if (modalBgInput) modalBgInput.value = data.modalBgColor || '#ff4d4d';
                if (modalTextInput) modalTextInput.value = data.modalTextColor || '#ffffff';
                if (buttonColorInput) buttonColorInput.value = data.buttonTextColor || '#ffffff';
            } catch (error) {
                console.error('Failed to load mug warning settings:', error);
            }
        },

        attachMissionTrackerTabListeners(panel) {
            const intervalSlider = panel.querySelector('#mission-tracker-interval');
            const intervalDisplay = panel.querySelector('#mission-tracker-interval-display');
            const newTabCheck = panel.querySelector('#mission-tracker-newtab');
            const statusDiv = panel.querySelector('#sidekick-missiontracker-status');

            if (intervalSlider && intervalDisplay) {
                intervalSlider.addEventListener('input', async () => {
                    const mins = parseInt(intervalSlider.value, 10);
                    const label = mins >= 60 ? (mins % 60 === 0 ? (mins / 60) + 'h' : Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm') : mins + ' min';
                    intervalDisplay.textContent = label;
                    if (window.SidekickModules.MissionTracker) {
                        window.SidekickModules.MissionTracker.checkIntervalMinutes = mins;
                        await window.SidekickModules.MissionTracker.saveSettings();
                        if (window.SidekickModules.MissionTracker.isEnabled) {
                            window.SidekickModules.MissionTracker.startPolling();
                        }
                        this.showAutoSaveStatus(statusDiv, 'Interval saved ✓');
                    }
                });
            }

            if (newTabCheck) {
                newTabCheck.addEventListener('change', async () => {
                    if (window.SidekickModules.MissionTracker) {
                        window.SidekickModules.MissionTracker.openInNewTab = newTabCheck.checked;
                        await window.SidekickModules.MissionTracker.saveSettings();
                        this.showAutoSaveStatus(statusDiv, 'Saved ✓');
                    }
                });
            }

            // Load current values
            this.loadMissionTrackerSettings(panel);
        },

        async loadMissionTrackerSettings(panel) {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                const s = data?.['mission-tracker'] || {};
                const intervalSlider = panel.querySelector('#mission-tracker-interval');
                const intervalDisplay = panel.querySelector('#mission-tracker-interval-display');
                const newTabCheck = panel.querySelector('#mission-tracker-newtab');
                const mins = s.checkIntervalMinutes || 30;
                if (intervalSlider) intervalSlider.value = mins;
                const label = mins >= 60 ? (mins % 60 === 0 ? (mins / 60) + 'h' : Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm') : mins + ' min';
                if (intervalDisplay) intervalDisplay.textContent = label;
                if (newTabCheck) newTabCheck.checked = s.openInNewTab || false;
            } catch (e) {
                console.error('Failed to load Mission Tracker settings:', e);
            }
        },

        attachHideCrimeTabListeners(panel) {
            const statusDiv = panel.querySelector('#sidekick-hidecrime-status');

            // Mode card selection
            const modeCards = panel.querySelectorAll('.hco-mode-card');
            const selectMode = async (modeId) => {
                modeCards.forEach(c => {
                    const active = parseInt(c.dataset.mode, 10) === modeId;
                    c.style.borderColor = active ? '#ef5350' : 'rgba(255,255,255,0.1)';
                    c.style.background = active ? 'rgba(239,83,80,0.12)' : 'rgba(255,255,255,0.05)';
                });
                if (window.SidekickModules.HideCrimeOutcome) {
                    window.SidekickModules.HideCrimeOutcome.mode = modeId;
                    await window.SidekickModules.HideCrimeOutcome.saveSettings();
                    window.SidekickModules.HideCrimeOutcome.apply();
                    this.showAutoSaveStatus(statusDiv, 'Mode saved ✓');
                }
            };

            modeCards.forEach(card => {
                card.addEventListener('click', () => selectMode(parseInt(card.dataset.mode, 10)));
                card.addEventListener('mouseenter', () => {
                    const isActive = card.style.borderColor.includes('83,80');
                    if (!isActive) card.style.background = 'rgba(255,255,255,0.09)';
                });
                card.addEventListener('mouseleave', () => {
                    const isActive = card.style.borderColor.includes('83,80');
                    if (!isActive) card.style.background = 'rgba(255,255,255,0.05)';
                });
            });

            const toggle = panel.querySelector('#hide-crime-outcome-toggle');
            const track = toggle?.querySelector('.hco-toggle-track');
            const thumb = toggle?.querySelector('.hco-toggle-thumb');

            if (toggle) {
                toggle.addEventListener('click', async () => {
                    if (!window.SidekickModules.HideCrimeOutcome) return;
                    window.SidekickModules.HideCrimeOutcome.isEnabled = !window.SidekickModules.HideCrimeOutcome.isEnabled;
                    const on = window.SidekickModules.HideCrimeOutcome.isEnabled;
                    if (track) track.style.background = on ? 'rgba(76,175,80,0.85)' : 'rgba(255,255,255,0.2)';
                    if (thumb) thumb.style.transform = on ? 'translateX(26px)' : 'translateX(0)';
                    await window.SidekickModules.HideCrimeOutcome.saveSettings();
                    window.SidekickModules.HideCrimeOutcome.apply();
                    this.showAutoSaveStatus(statusDiv, on ? 'Enabled ✓' : 'Disabled ✓');
                });
            }

            this.loadHideCrimeSettings(panel);
        },

        async loadHideCrimeSettings(panel) {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                const s = data?.['hide-crime-outcome'] || {};
                const mode = s.mode != null ? s.mode : 0;

                const modeCards = panel.querySelectorAll('.hco-mode-card');
                modeCards.forEach(c => {
                    const active = parseInt(c.dataset.mode, 10) === mode;
                    c.style.borderColor = active ? '#ef5350' : 'rgba(255,255,255,0.1)';
                    c.style.background = active ? 'rgba(239,83,80,0.12)' : 'rgba(255,255,255,0.05)';
                });

                // Reflect enabled state in custom toggle
                const toggleTrack = panel.querySelector('#hide-crime-outcome-toggle .hco-toggle-track');
                const toggleThumb = panel.querySelector('#hide-crime-outcome-toggle .hco-toggle-thumb');
                if (toggleTrack) toggleTrack.style.background = s.isEnabled ? 'rgba(76,175,80,0.85)' : 'rgba(255,255,255,0.2)';
                if (toggleThumb) toggleThumb.style.transform = s.isEnabled ? 'translateX(26px)' : 'translateX(0)';
            } catch (e) {
                console.error('Failed to load Hide Crime Outcome settings:', e);
            }
        },

        attachHolidayTabListeners(panel) {
            const toggle = panel.querySelector('#holiday-egghunt-toggle');
            const resetBtn = panel.querySelector('#holiday-egghunt-reset');
            const statusDiv = panel.querySelector('#sidekick-holiday-status');

            if (toggle) {
                const track = toggle.querySelector('.toggle-track');
                const thumb = toggle.querySelector('.toggle-thumb');

                toggle.addEventListener('click', async () => {
                    if (!window.SidekickModules.Holiday) return;
                    window.SidekickModules.Holiday.eggHuntEnabled = !window.SidekickModules.Holiday.eggHuntEnabled;
                    const on = window.SidekickModules.Holiday.eggHuntEnabled;
                    track.style.backgroundColor = on ? 'rgba(76,175,80,0.8)' : 'rgba(255,255,255,0.2)';
                    thumb.style.transform = on ? 'translateX(26px)' : 'translateX(0)';
                    await window.SidekickModules.Holiday.saveSettings();
                    this.showAutoSaveStatus(statusDiv, on ? 'Egg Hunt enabled \u2713' : 'Egg Hunt disabled \u2713');
                    setTimeout(() => window.location.reload(), 700);
                });
            }

            if (resetBtn) {
                resetBtn.addEventListener('click', async () => {
                    if (!confirm('Reset all Easter Egg Hunt progress (visited pages and egg count)?')) return;
                    try {
                        await window.SidekickModules.Core.ChromeStorage.set('sidekick_holiday_eggHunt', {});
                        this.showAutoSaveStatus(statusDiv, 'Hunt progress reset ✓');
                    } catch (e) {
                        console.error('Failed to reset egg hunt:', e);
                    }
                });

                resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'rgba(239,83,80,0.28)'; });
                resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'rgba(239,83,80,0.15)'; });
            }

            this.loadHolidaySettings(panel);
        },

        async loadHolidaySettings(panel) {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_holiday');
                const on = data?.eggHuntEnabled || false;
                const track = panel.querySelector('#holiday-egghunt-toggle .toggle-track');
                const thumb = panel.querySelector('#holiday-egghunt-toggle .toggle-thumb');
                if (track) track.style.backgroundColor = on ? 'rgba(76,175,80,0.8)' : 'rgba(255,255,255,0.2)';
                if (thumb) thumb.style.transform = on ? 'translateX(26px)' : 'translateX(0)';
            } catch (e) {
                console.error('Failed to load Holiday settings:', e);
            }
        },

        attachWarTargetCallerTabListeners(panel) {
            // Handled dynamically by general toggles
        }
    };

    // Export Settings module to global namespace
    window.SidekickModules = window.SidekickModules || {};
    window.SidekickModules.Settings = SettingsModule;
    console.log("✅ Settings Module V2 loaded and ready");

})();
