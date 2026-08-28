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
.sk-nav-label{
    display:block; max-width:100%; min-height:16px; padding:1px 0 2px;
    font-size:10px; font-weight:600; letter-spacing:0; line-height:13px;
    text-align:center; white-space:normal; word-break:break-word; overflow:visible;
}
.sk-prev-content{flex:1;display:flex;flex-direction:column;overflow:hidden;}
.sk-prev-topbar{
    display:flex;align-items:center;justify-content:space-between;
    padding:16px 24px; border-bottom:1px solid var(--border); flex-shrink:0;
}
.sk-prev-title{
    display:inline-block;min-height:32px;padding:3px 0 5px;overflow:visible;
    font-size:20px;font-weight:700;line-height:24px;
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
.sk-trade-profile-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;}
.sk-trade-profile-actions{display:flex;align-items:center;gap:8px;min-width:0;}
.sk-trade-segment{display:inline-flex;border:1px solid var(--border2);border-radius:8px;overflow:hidden;background:var(--surface2);}
.sk-trade-profile-btn{min-width:92px;padding:8px 14px;border:0;border-right:1px solid var(--border2);background:transparent;color:var(--muted);font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;}
.sk-trade-profile-btn:last-child{border-right:0;}
.sk-trade-profile-btn.active{background:var(--grad);color:#111;}
.sk-trade-compact-btn{width:auto;flex:none;padding:8px 12px;white-space:nowrap;}
.sk-trade-default-row{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.sk-trade-default-row .sk-field-label{margin:0;white-space:nowrap;}
.sk-trade-rate-input{width:118px;margin:0;}
.sk-trade-editor{display:grid;grid-template-columns:220px minmax(0,1fr);height:430px;border:1px solid var(--border2);border-radius:10px;overflow:hidden;background:rgba(0,0,0,.08);}
.sk-trade-category-pane{border-right:1px solid var(--border2);padding:12px 0;overflow-y:auto;scrollbar-width:thin;}
.sk-trade-search{margin:0 12px 10px;width:calc(100% - 24px);}
.sk-trade-category-group{padding:8px 12px 4px;font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--muted);}
.sk-trade-category-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:7px 13px;border:0;border-top:1px solid rgba(255,255,255,.045);background:transparent;color:rgba(255,255,255,.78);font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;text-align:left;}
.sk-trade-category-btn:hover{background:rgba(255,255,255,.05);color:#fff;}
.sk-trade-category-btn.active{background:rgba(95,204,106,.13);color:var(--green);}
.sk-trade-category-rate{font-weight:700;white-space:nowrap;}
.sk-trade-detail-pane{padding:18px;overflow-y:auto;scrollbar-width:thin;}
.sk-trade-detail-title{font-size:17px;font-weight:700;color:var(--green);margin-bottom:16px;}
.sk-trade-rate-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;padding-bottom:14px;border-bottom:1px solid var(--border);}
.sk-trade-rate-row .sk-input{margin-bottom:0;}
.sk-trade-rate-source{font-size:10px;color:var(--muted);margin-top:5px;}
.sk-trade-exceptions-head{display:flex;align-items:center;justify-content:space-between;margin:15px 0 8px;}
.sk-trade-exceptions-title{font-size:12px;font-weight:700;color:rgba(255,255,255,.72);}
.sk-trade-exception-columns,.sk-trade-exception-row{display:grid;grid-template-columns:minmax(0,1fr) 112px 90px 54px;gap:6px;align-items:center;}
.sk-trade-exception-columns{padding:0 2px 5px;color:var(--muted);font-size:10px;font-weight:700;}
.sk-trade-exception-row{margin-bottom:6px;}
.sk-trade-exception-row .sk-input,.sk-trade-exception-row .sk-select{margin:0;padding:7px 8px;font-size:11px;min-width:0;}
.sk-trade-item-picker{position:relative;min-width:0;}
.sk-trade-item-picker>.sk-input{width:100%;}
.sk-trade-item-results{position:absolute;z-index:80;top:calc(100% + 4px);left:0;width:min(310px,calc(100vw - 48px));max-height:218px;overflow-y:auto;padding:4px;background:#171717;border:1px solid var(--border2);border-radius:8px;box-shadow:0 12px 28px rgba(0,0,0,.7);scrollbar-width:thin;}
.sk-trade-item-results[hidden]{display:none;}
.sk-trade-item-option{display:block;width:100%;padding:7px 8px;border:0;border-radius:5px;background:transparent;color:#eee;font-family:inherit;text-align:left;cursor:pointer;}
.sk-trade-item-option:hover,.sk-trade-item-option.active{background:rgba(95,204,106,.16);color:#fff;}
.sk-trade-item-option-name{display:block;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sk-trade-item-option-type{display:block;margin-top:2px;font-size:9px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sk-trade-item-no-results{padding:8px;color:var(--muted);font-size:10px;text-align:center;}
.sk-trade-delete{padding:7px 5px;border-radius:7px;border:1px solid rgba(255,80,80,.3);background:rgba(255,80,80,.08);color:#ff8585;font-family:inherit;font-size:10px;font-weight:600;cursor:pointer;}
.sk-trade-delete:hover{background:rgba(255,80,80,.18);color:#fff;}
.sk-trade-empty{padding:18px 10px;text-align:center;color:var(--muted);font-size:11px;border:1px dashed var(--border2);border-radius:8px;margin-bottom:8px;}
.sk-trade-add{width:auto;flex:none;padding:7px 10px;}
.sk-trade-save-row{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:14px;}
.sk-trade-save-row .sk-status{display:none;flex:1;margin:0;text-align:left;}
.sk-trade-save{width:190px;flex:none;}
.sk-trade-export-preview{width:100%;height:240px;resize:vertical;background:#151515;border:1px solid var(--border2);border-radius:8px;color:rgba(255,255,255,.78);padding:12px;font:11px/1.5 Consolas,monospace;outline:none;margin-bottom:10px;}
.sk-trade-export-preview:focus{border-color:var(--green);}
.sk-trade-import-input{display:none;}
@media (max-width:850px){
    .sk-trade-profile-bar{align-items:flex-start;flex-direction:column;}
    .sk-trade-editor{grid-template-columns:190px minmax(0,1fr);}
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
      <button class="sk-nav-item" data-section="trading"><div class="sk-nav-icon"><img class="sk-nav-icon-img" data-icon="Trading.png"></div><span class="sk-nav-label">Trading</span></button>
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
          
          <div class="sk-hint" style="margin-bottom:8px;">Get your key at <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" style="color:#5fcc6a;text-decoration:none;font-weight:600;">torn.com/preferences.php#tab=api</a></div>
          
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
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Chat Popout</div><div class="sk-row-desc">Adds a button that opens Torn Chat in its own resizable window</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-chat-popout"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
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
        <button class="sk-subtab-btn" data-tab="merits">Merits</button>
      </div>
      <div class="sk-scroll">
        <div class="sk-subtab-panel active" id="skp-tab-personal">
          <div class="sk-sh">Combat &amp; Loadout</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Fast Attack</div><div class="sk-row-desc">Moves Start Fight button directly over your equipped weapon for faster attacking</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-fast-attack" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Attack Online Status</div><div class="sk-row-desc">Shows a small Online, Idle, or Offline indicator beside the target on attack pages</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-attack-online" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
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

        <!-- MERITS -->
        <div class="sk-subtab-panel" id="skp-tab-merits">
          <div class="sk-sh">Nice Helper</div>
          <div class="sk-row" style="align-items:flex-start;gap:12px;">
            <div class="sk-row-info">
              <div class="sk-row-title">Enable Nice Helper</div>
              <div style="margin-top:5px;"><button class="sk-shelf-toggle" data-shelf="skp-shelf-nice-helper" style="background:none;border:none;padding:0;color:#5fcc6a;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Details &#x25BE;</button></div>
            </div>
            <label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-merit-calc"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label>
          </div>
          <!-- Status shelf — populated automatically by nice-helper module -->
          <div class="sk-shelf" id="skp-shelf-nice-helper" style="display:none;">
            <div id="skp-nice-status"></div>
          </div>
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
          <div class="sk-row" style="align-items:flex-start;gap:12px;margin-top:4px;">
            <div class="sk-row-info">
              <div class="sk-row-title">Quick Deposit</div>
              <div class="sk-row-desc">Makes your money display clickable for fast vault deposits</div>
              <div style="margin-top:5px;"><button class="sk-shelf-toggle" data-shelf="skp-shelf-quick-deposit" style="background:none;border:none;padding:0;color:#5fcc6a;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Settings &#x25BE;</button></div>
            </div>
            <label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-quick-deposit"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label>
          </div>
          <div class="sk-shelf" id="skp-shelf-quick-deposit" style="display:none;">
            <div class="sk-sh" style="margin-top:0;font-size:10px;">Quick Deposit Settings</div>
            <label class="sk-field-label">Deposit Target</label>
            <select class="sk-select" id="skp-deposit-target">
              <option value="FACTION">Faction Vault</option>
              <option value="PROPERTY">Property Vault</option>
              <option value="COMPANY">Company Vault</option>
              <option value="GHOST">Ghost Trade</option>
            </select>
            <div class="sk-ghost-trade-row" id="skp-ghost-row" style="display:none;">
              <div class="sk-info" style="margin-top:8px;">Auto-detected when you visit a ghost trade page. Used as the deposit target when Ghost Trade is selected above.</div>
              <input type="text" class="sk-input" id="skp-deposit-ghost-id" placeholder="No ghost trade detected yet" readonly style="opacity:0.55;cursor:not-allowed;">
              <button class="sk-btn sk-btn-danger" id="skp-deposit-clear-ghost" type="button" style="width:100%;">Clear Ghost Trade ID</button>
            </div>
            <div class="sk-status" id="skp-deposit-status" style="display:none;"></div>
          </div>
          <div class="sk-sh" style="margin-top:18px;">Bunker</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Bunker Bucks</div><div class="sk-row-desc">Shows the Bunker Buck (BB) value of weapons &amp; armor on item listings</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-bunker-bucks" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
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
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Hustling</div><div class="sk-row-desc">Shows audience status, suggests next action, tracks technique progress</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-hustling" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
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
        <button class="sk-subtab-btn active" data-tab="war-utilities">War Utilities</button>
        <button class="sk-subtab-btn" data-tab="war-chain">Chain Timer</button>
      </div>
      <div class="sk-scroll">
        <div class="sk-subtab-panel active" id="skp-tab-war-utilities">
          <div class="sk-sh">War Utilities</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Enable Extended Chain View</div><div class="sk-row-desc">Show more than 10 chain attacks on faction page</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-chain-view" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Termed War Mode</div><div class="sk-row-desc">Removes Mug and Hospitalize options after an attack</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-termed-war"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">War Monitor</div><div class="sk-row-desc">Show travel status and hospital time and sort by hospital time on war page</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-war-monitor"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">War Target Caller</div><div class="sk-row-desc">Tag claimed players and add claim buttons</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-war-target-caller"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
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
      </div>
    </div>

    <!-- MISSIONS -->
    <div class="sk-sec-page" id="skp-missions">
      <div class="sk-scroll">
        <div class="sk-sh">Mission &amp; Book Tracking</div>
        <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Mission Tracker</div><div class="sk-row-desc">Tracks if there is an active mission and displays an icon</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-mission-tracker" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Book Notifier</div><div class="sk-row-desc">Displays an icon when you have unclaimed book rewards</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-book-notifier" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
      </div>
    </div>

    <!-- EVENTS -->
    <div class="sk-sec-page" id="skp-events">
      <div class="sk-subtab-bar">
        <button class="sk-subtab-btn active" data-tab="ev-calendar">Calendar</button>
        <button class="sk-subtab-btn" data-tab="ev-egg">Easter</button>
        <button class="sk-subtab-btn" data-tab="ev-halloween">Halloween</button>
        <button class="sk-subtab-btn" data-tab="ev-christmas">Christmas</button>
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
        <div class="sk-subtab-panel" id="skp-tab-ev-halloween">
          <div class="sk-sh">Halloween</div>
          <div class="sk-row" style="align-items:flex-start;gap:12px;">
            <div class="sk-row-info">
              <div class="sk-row-title">Enable Halloween Helper</div>
              <div class="sk-row-desc">Assist with keeping track of trick or treat targets</div>
              <div style="margin-top:5px;"><button class="sk-shelf-toggle" data-shelf="skp-shelf-halloween" style="background:none;border:none;padding:0;color:#5fcc6a;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Trick Or Treat List &#x25BE;</button></div>
            </div>
            <label class="sk-tog" style="flex-shrink:0;margin-top:2px;"><input type="checkbox" id="skp-tog-halloween"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label>
          </div>
          <div class="sk-shelf" id="skp-shelf-halloween" style="display:none;">
            <div class="sk-sh" style="margin-top:0;font-size:10px;">Trick Or Treat List</div>
            <div id="skp-halloween-targets-list" style="margin-bottom:10px;"></div>
            <button class="sk-btn sk-btn-primary" id="skp-btn-open-halloween" style="width:auto; margin:0 auto; display:block; padding:4px 10px; font-size:10px;">Open in a new window</button>
          </div>
        </div>
        <div class="sk-subtab-panel" id="skp-tab-ev-christmas">
          <div class="sk-sh">Christmas</div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Bigger window</div><div class="sk-row-desc">Makes the Christmas Town map bigger</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-christmas-zoom"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row" style="margin-top:8px;"><div class="sk-row-info"><div class="sk-row-title">Fast beers</div><div class="sk-row-desc">Faster beer rewards</div></div><label class="sk-tog"><input type="checkbox" id="skp-tog-christmas-beers"><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
        </div>
      </div>
    </div>


    <!-- TRADING -->
    <div class="sk-sec-page" id="skp-trading">
      <div class="sk-subtab-bar">
        <button class="sk-subtab-btn active" data-tab="trade-display">Trade Display</button>
        <button class="sk-subtab-btn" data-tab="trade-price-lists">Price Lists</button>
        <button class="sk-subtab-btn" data-tab="trade-export">Export</button>
      </div>
      <div class="sk-scroll">
        <div class="sk-subtab-panel active" id="skp-tab-trade-display">
          <div class="sk-sh">Trade Display</div>
          <div class="sk-info">These settings control what Sidekick will show inside Torn's trade window. Price-list editing is kept in its own tab.</div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Enable Trade Assistant</div><div class="sk-row-desc">Show Sidekick values and pricing controls on trade pages</div></div><label class="sk-tog"><input type="checkbox" id="skp-trade-enabled" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Show market value per item</div><div class="sk-row-desc">Display each item's unadjusted market value</div></div><label class="sk-tog"><input type="checkbox" id="skp-trade-show-market" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Show your price per item</div><div class="sk-row-desc">Display what you pay or receive using the selected price list</div></div><label class="sk-tog"><input type="checkbox" id="skp-trade-show-buy" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-row"><div class="sk-row-info"><div class="sk-row-title">Show trade calculator</div><div class="sk-row-desc">Show item totals and clearly state how much you pay or receive</div></div><label class="sk-tog"><input type="checkbox" id="skp-trade-show-totals" checked><div class="sk-tog-track"></div><div class="sk-tog-thumb"></div></label></div>
          <div class="sk-sh">Default Price List</div>
          <label class="sk-field-label" for="skp-trade-default-profile">Price list selected when opening a trade</label>
          <select class="sk-select" id="skp-trade-default-profile">
            <option value="public">Public</option>
            <option value="friendly">Friendly</option>
          </select>
          <div class="sk-hint">The price list can still be changed directly from the trade window.</div>
        </div>

        <div class="sk-subtab-panel" id="skp-tab-trade-price-lists">
          <div class="sk-trade-profile-bar">
            <div class="sk-trade-profile-actions">
              <div class="sk-trade-segment" role="group" aria-label="Price list profile">
                <button class="sk-trade-profile-btn active" type="button" data-trade-profile="public">Public</button>
                <button class="sk-trade-profile-btn" type="button" data-trade-profile="friendly">Friendly</button>
              </div>
              <button class="sk-btn sk-btn-ghost sk-trade-compact-btn" type="button" id="skp-trade-copy-profile">Copy to Friendly</button>
            </div>
            <button class="sk-btn sk-btn-ghost sk-trade-compact-btn" type="button" id="skp-trade-open-export">Export Public Price List</button>
          </div>

          <div class="sk-trade-default-row">
            <label class="sk-field-label" for="skp-trade-default-rate">Default percentage paid</label>
            <input class="sk-input sk-trade-rate-input" id="skp-trade-default-rate" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Default percentage paid">
            <span style="font-size:12px;color:var(--muted);">%</span>
          </div>

          <div class="sk-trade-editor">
            <div class="sk-trade-category-pane">
              <input class="sk-input sk-trade-search" id="skp-trade-category-search" type="search" placeholder="Find category" autocomplete="off">
              <div id="skp-trade-category-list"></div>
            </div>

            <div class="sk-trade-detail-pane">
              <div class="sk-trade-detail-title" id="skp-trade-category-title">Flowers</div>
              <div class="sk-trade-rate-row">
                <div>
                  <label class="sk-field-label" for="skp-trade-category-rate">Percentage paid for this category</label>
                  <input class="sk-input" id="skp-trade-category-rate" type="number" min="0" step="0.01" inputmode="decimal">
                  <div class="sk-trade-rate-source" id="skp-trade-rate-source">Using the profile default</div>
                </div>
                <button class="sk-btn sk-btn-ghost sk-trade-compact-btn" type="button" id="skp-trade-reset-category">Use default percentage</button>
              </div>

              <div class="sk-trade-exceptions-head">
                <div class="sk-trade-exceptions-title">Different prices for specific items</div>
                <button class="sk-btn sk-btn-ghost sk-trade-add" type="button" id="skp-trade-add-exception">Set a different item price</button>
              </div>
              <div class="sk-trade-exception-columns" aria-hidden="true"><span>Search item</span><span>Price type</span><span>Value</span><span></span></div>
              <div id="skp-trade-exceptions"></div>
            </div>
          </div>

          <div class="sk-trade-save-row">
            <div class="sk-status" id="skp-trade-save-status"></div>
            <button class="sk-btn sk-btn-primary sk-trade-save" type="button" id="skp-trade-save">Save Price List</button>
          </div>
        </div>

        <div class="sk-subtab-panel" id="skp-tab-trade-export">
          <div class="sk-sh">Export</div>
          <div class="sk-info">The readable list is intended for other players. The JSON file can be imported into Sidekick without re-entering every rate.</div>
          <label class="sk-field-label" for="skp-trade-export-profile">Price list to export or replace</label>
          <select class="sk-select" id="skp-trade-export-profile">
            <option value="public">Public</option>
            <option value="friendly">Friendly</option>
          </select>
          <label class="sk-field-label" for="skp-trade-export-preview">Readable price list preview</label>
          <textarea class="sk-trade-export-preview" id="skp-trade-export-preview" readonly></textarea>
          <div class="sk-btn-row">
            <button class="sk-btn sk-btn-primary" type="button" id="skp-trade-copy-readable">Copy Readable List</button>
            <button class="sk-btn sk-btn-ghost" type="button" id="skp-trade-download-readable">Download Text</button>
          </div>
          <div class="sk-btn-row">
            <button class="sk-btn sk-btn-ghost" type="button" id="skp-trade-copy-json">Copy Sidekick JSON</button>
            <button class="sk-btn sk-btn-ghost" type="button" id="skp-trade-download-json">Download JSON</button>
            <button class="sk-btn sk-btn-ghost" type="button" id="skp-trade-import-json">Import JSON</button>
          </div>
          <input class="sk-trade-import-input" id="skp-trade-import-file" type="file" accept="application/json,.json">
          <div class="sk-status" id="skp-trade-export-status" style="display:none;"></div>
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

            // Halloween window button
            const halloweenWindowBtn = overlay.querySelector('#skp-btn-open-halloween');
            if (halloweenWindowBtn) {
                halloweenWindowBtn.addEventListener('click', () => {
                    if (window.SidekickModules?.HalloweenHelper?.openWindow) {
                        window.SidekickModules.HalloweenHelper.openWindow();
                    } else {
                        alert('Halloween Helper module not loaded. Please enable it and reload the page.');
                    }
                });
            }

            if (window.SidekickModules?.HalloweenHelper?.refreshUI) {
                window.SidekickModules.HalloweenHelper.refreshUI();
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
            overlay.querySelector('#skp-close').addEventListener('click', async () => {
                if (typeof overlay.saveTradingSettings === 'function') {
                    try { await overlay.saveTradingSettings(); } catch (error) {
                        console.error('Failed to save Trading settings before closing:', error);
                    }
                }
                overlay.remove();
                document.body.style.overflow = '';
                if (overlay.dataset.settingsChanged === 'true') {
                    window.location.reload();
                }
            });

            // Section navigation
            const sectionTitles = {
                general: 'General Settings', features: 'Features', profile: 'Profile',
                crimes: 'Crimes', mugging: 'Mugging', war: 'War', missions: 'Missions', events: 'Events',
                trading: 'Trading'
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

            // Trading settings, profiles and price-list export
            const initializeTradingSettings = async () => {
                const storage = window.SidekickModules?.Core?.ChromeStorage;
                if (!storage) return;

                const STORAGE_KEY = 'sidekick_trading_settings';
                const categoryGroups = {
                    'Equipment': ['Armor', 'Melee', 'Primary', 'Secondary'],
                    'Useful Supplies': ['Alcohol', 'Boosters', 'Candy', 'Drugs', 'Energy Drinks', 'Enhancers', 'Medical', 'Temporary'],
                    'General Shopping': ['Artifacts', 'Cars', 'Clothing', 'Flowers', 'Jewelry', 'Materials', 'Miscellaneous', 'Plushies', 'Special', 'Supply Packs', 'Tools'],
                    'Estate Agency': ['Basic Properties', 'Fully Upgraded Properties']
                };
                const allCategories = Object.values(categoryGroups).flat();
                const clone = value => JSON.parse(JSON.stringify(value));
                const textValue = (value, fallback = '') => {
                    if (value === null || value === undefined) return fallback;
                    const result = String(value).trim();
                    return result || fallback;
                };
                const makeExceptionId = () => globalThis.crypto?.randomUUID?.() || `trade-${Date.now()}-${Math.random().toString(16).slice(2)}`;

                const normalizeException = value => {
                    const source = value && typeof value === 'object' ? value : {};
                    return {
                        id: textValue(source.id, makeExceptionId()),
                        item: textValue(source.item ?? source.itemKey ?? source.name),
                        label: textValue(source.label),
                        itemId: textValue(source.itemId),
                        uid: textValue(source.uid),
                        fingerprint: textValue(source.fingerprint),
                        rule: source.rule === 'fixed' ? 'fixed' : 'percentage',
                        value: textValue(source.value)
                    };
                };

                const normalizeProfile = value => {
                    const source = value && typeof value === 'object' ? value : {};
                    const categories = {};
                    const sourceCategories = source.categories && typeof source.categories === 'object' ? source.categories : {};

                    Object.entries(sourceCategories).forEach(([category, rawRecord]) => {
                        if (rawRecord === null || rawRecord === undefined) return;
                        if (typeof rawRecord === 'string' || typeof rawRecord === 'number') {
                            categories[category] = { rate: textValue(rawRecord), exceptions: [] };
                            return;
                        }
                        if (typeof rawRecord !== 'object') return;
                        const exceptions = Array.isArray(rawRecord.exceptions)
                            ? rawRecord.exceptions.map(normalizeException)
                            : [];
                        categories[category] = {
                            rate: textValue(rawRecord.rate),
                            exceptions
                        };
                    });

                    if (source.exceptions && typeof source.exceptions === 'object') {
                        Object.entries(source.exceptions).forEach(([category, rawExceptions]) => {
                            if (!Array.isArray(rawExceptions)) return;
                            categories[category] ||= { rate: '', exceptions: [] };
                            categories[category].exceptions.push(...rawExceptions.map(normalizeException));
                        });
                    }

                    return {
                        defaultRate: textValue(source.defaultRate, '100'),
                        categories
                    };
                };

                const normalizeSettings = value => {
                    const source = value && typeof value === 'object' ? value : {};
                    const display = source.display && typeof source.display === 'object' ? source.display : {};
                    return {
                        version: 1,
                        display: {
                            enabled: display.enabled !== false,
                            showMarketValue: display.showMarketValue !== false,
                            showBuyPrice: display.showBuyPrice !== false,
                            showTotals: display.showTotals !== false,
                            defaultProfile: display.defaultProfile === 'friendly' ? 'friendly' : 'public'
                        },
                        profiles: {
                            public: normalizeProfile(source.profiles?.public),
                            friendly: normalizeProfile(source.profiles?.friendly)
                        }
                    };
                };

                let state = normalizeSettings(await storage.get(STORAGE_KEY));
                let selectedProfile = 'public';
                let selectedCategory = 'Flowers';
                let saveTimer = null;
                let statusTimer = null;
                const TRADE_CATALOG_KEY = 'sidekick_trade_item_catalog';
                const normalizeItemName = value => textValue(value).replace(/\s+/g, ' ').toLowerCase();
                let itemCatalog = {};
                let itemCatalogByName = new Map();
                let itemCatalogSearch = [];

                const cachedCatalog = await storage.get(TRADE_CATALOG_KEY).catch(() => null);
                if (cachedCatalog?.items && typeof cachedCatalog.items === 'object') {
                    itemCatalog = cachedCatalog.items;
                } else {
                    try {
                        const fallbackItems = JSON.parse(localStorage.getItem('tornItems') || '{}');
                        Object.entries(fallbackItems).forEach(([id, item]) => {
                            if (!item?.name) return;
                            itemCatalog[id] = {
                                id: String(id),
                                name: item.name,
                                marketValue: String(item.market_value ?? item.marketValue ?? '0'),
                                type: item.type || ''
                            };
                        });
                    } catch { /* The picker will refresh from Torn below. */ }
                }

                const rebuildItemPicker = () => {
                    itemCatalogByName = new Map();
                    itemCatalogSearch = Object.values(itemCatalog)
                        .filter(item => item?.name)
                        .sort((left, right) => left.name.localeCompare(right.name));
                    itemCatalogSearch.forEach(item => {
                        itemCatalogByName.set(normalizeItemName(item.name), item);
                    });
                };
                rebuildItemPicker();

                const refreshItemPicker = async () => {
                    const hasTypedItems = Object.values(itemCatalog).some(item => textValue(item?.type));
                    const age = Date.now() - Number(cachedCatalog?.updatedAt || 0);
                    if (hasTypedItems && age < 86400000) return;
                    const apiKey = await storage.get('sidekick_api_key').catch(() => '');
                    if (!apiKey) return;
                    try {
                        const response = await fetch(`https://api.torn.com/torn/?selections=items&key=${encodeURIComponent(apiKey)}&comment=SidekickTradeAssistant`);
                        const data = await response.json();
                        if (!response.ok || data.error || !data.items) throw new Error(data.error?.error || `Torn API returned ${response.status}`);
                        const refreshed = {};
                        Object.entries(data.items).forEach(([id, item]) => {
                            if (item.tradeable === false || !item.name) return;
                            refreshed[id] = {
                                id: String(id),
                                name: item.name,
                                marketValue: String(item.market_value ?? '0'),
                                type: item.type || item.category || '',
                                image: item.image || ''
                            };
                        });
                        itemCatalog = refreshed;
                        rebuildItemPicker();
                        await storage.set(TRADE_CATALOG_KEY, { updatedAt: Date.now(), items: refreshed });
                    } catch (error) {
                        console.warn('[TradingSettings] Could not refresh the item picker; using cached items.', error);
                    }
                };
                refreshItemPicker();

                const elements = {
                    displayEnabled: overlay.querySelector('#skp-trade-enabled'),
                    displayMarket: overlay.querySelector('#skp-trade-show-market'),
                    displayBuy: overlay.querySelector('#skp-trade-show-buy'),
                    displayTotals: overlay.querySelector('#skp-trade-show-totals'),
                    defaultProfile: overlay.querySelector('#skp-trade-default-profile'),
                    profileButtons: [...overlay.querySelectorAll('[data-trade-profile]')],
                    copyProfile: overlay.querySelector('#skp-trade-copy-profile'),
                    openExport: overlay.querySelector('#skp-trade-open-export'),
                    defaultRate: overlay.querySelector('#skp-trade-default-rate'),
                    categorySearch: overlay.querySelector('#skp-trade-category-search'),
                    categoryList: overlay.querySelector('#skp-trade-category-list'),
                    categoryTitle: overlay.querySelector('#skp-trade-category-title'),
                    categoryRate: overlay.querySelector('#skp-trade-category-rate'),
                    rateSource: overlay.querySelector('#skp-trade-rate-source'),
                    resetCategory: overlay.querySelector('#skp-trade-reset-category'),
                    exceptions: overlay.querySelector('#skp-trade-exceptions'),
                    addException: overlay.querySelector('#skp-trade-add-exception'),
                    save: overlay.querySelector('#skp-trade-save'),
                    saveStatus: overlay.querySelector('#skp-trade-save-status'),
                    exportProfile: overlay.querySelector('#skp-trade-export-profile'),
                    exportPreview: overlay.querySelector('#skp-trade-export-preview'),
                    copyReadable: overlay.querySelector('#skp-trade-copy-readable'),
                    downloadReadable: overlay.querySelector('#skp-trade-download-readable'),
                    copyJson: overlay.querySelector('#skp-trade-copy-json'),
                    downloadJson: overlay.querySelector('#skp-trade-download-json'),
                    importJson: overlay.querySelector('#skp-trade-import-json'),
                    importFile: overlay.querySelector('#skp-trade-import-file'),
                    exportStatus: overlay.querySelector('#skp-trade-export-status')
                };

                const currentProfile = () => state.profiles[selectedProfile];
                const categoryRecord = (profile, category, create = false) => {
                    let record = profile.categories[category];
                    if (!record && create) {
                        record = { rate: '', exceptions: [] };
                        profile.categories[category] = record;
                    }
                    return record || null;
                };
                const effectiveRate = (profile, category) => {
                    const record = categoryRecord(profile, category);
                    return textValue(record?.rate, profile.defaultRate);
                };
                const pruneCategoryRecord = (profile, category) => {
                    const record = categoryRecord(profile, category);
                    if (!record) return;
                    if (!textValue(record.rate) && (!Array.isArray(record.exceptions) || record.exceptions.length === 0)) {
                        delete profile.categories[category];
                    }
                };

                const showStatus = (element, message, isError = false) => {
                    if (!element) return;
                    clearTimeout(statusTimer);
                    element.textContent = message;
                    element.style.display = 'block';
                    element.style.color = isError ? '#ff8585' : 'var(--green)';
                    element.style.borderColor = isError ? 'rgba(255,80,80,.3)' : 'rgba(95,204,106,.18)';
                    statusTimer = setTimeout(() => { element.style.display = 'none'; }, 2600);
                };

                const persist = async (message = '') => {
                    clearTimeout(saveTimer);
                    await storage.set(STORAGE_KEY, state);
                    if (message) showStatus(elements.saveStatus, message);
                    updateExportPreview();
                };
                const schedulePersist = () => {
                    clearTimeout(saveTimer);
                    saveTimer = setTimeout(() => {
                        persist().catch(error => console.error('Failed to save Trading settings:', error));
                    }, 250);
                };
                overlay.saveTradingSettings = () => persist();

                const renderCategoryList = () => {
                    if (!elements.categoryList) return;
                    const profile = currentProfile();
                    const query = textValue(elements.categorySearch?.value).toLowerCase();
                    elements.categoryList.replaceChildren();
                    let visibleCount = 0;

                    Object.entries(categoryGroups).forEach(([groupName, categories]) => {
                        const filtered = categories.filter(category => category.toLowerCase().includes(query));
                        if (!filtered.length) return;
                        visibleCount += filtered.length;

                        const heading = document.createElement('div');
                        heading.className = 'sk-trade-category-group';
                        heading.textContent = groupName;
                        elements.categoryList.appendChild(heading);

                        filtered.forEach(category => {
                            const button = document.createElement('button');
                            button.type = 'button';
                            button.className = 'sk-trade-category-btn' + (category === selectedCategory ? ' active' : '');

                            const name = document.createElement('span');
                            name.textContent = category;
                            const rate = document.createElement('span');
                            rate.className = 'sk-trade-category-rate';
                            rate.textContent = effectiveRate(profile, category) + '%';

                            button.append(name, rate);
                            button.addEventListener('click', () => {
                                selectedCategory = category;
                                renderCategoryList();
                                renderCategoryDetail();
                            });
                            elements.categoryList.appendChild(button);
                        });
                    });

                    if (!visibleCount) {
                        const empty = document.createElement('div');
                        empty.className = 'sk-trade-empty';
                        empty.style.margin = '10px 12px';
                        empty.textContent = 'No matching categories';
                        elements.categoryList.appendChild(empty);
                    }
                };

                const renderExceptions = () => {
                    if (!elements.exceptions) return;
                    const profile = currentProfile();
                    const record = categoryRecord(profile, selectedCategory);
                    const exceptions = Array.isArray(record?.exceptions) ? record.exceptions : [];
                    elements.exceptions.replaceChildren();

                    if (!exceptions.length) {
                        const empty = document.createElement('div');
                        empty.className = 'sk-trade-empty';
                        empty.textContent = 'No item-specific prices. This category uses its category rate.';
                        elements.exceptions.appendChild(empty);
                        return;
                    }

                    exceptions.forEach(exception => {
                        const row = document.createElement('div');
                        row.className = 'sk-trade-exception-row';

                        const itemInput = document.createElement('input');
                        itemInput.className = 'sk-input';
                        itemInput.type = 'text';
                        itemInput.placeholder = 'Search for an item';
                        itemInput.value = exception.label || exception.item;
                        itemInput.setAttribute('aria-label', 'Search for an item');
                        itemInput.setAttribute('autocomplete', 'off');

                        const itemPicker = document.createElement('div');
                        itemPicker.className = 'sk-trade-item-picker';
                        const itemResults = document.createElement('div');
                        itemResults.className = 'sk-trade-item-results';
                        itemResults.setAttribute('role', 'listbox');
                        itemResults.hidden = true;
                        let visibleMatches = [];
                        let highlightedIndex = -1;

                        const ruleSelect = document.createElement('select');
                        ruleSelect.className = 'sk-select';
                        ruleSelect.setAttribute('aria-label', 'Price rule');
                        ruleSelect.append(new Option('% of market value', 'percentage'), new Option('Fixed price per item', 'fixed'));
                        ruleSelect.value = exception.rule;

                        const valueInput = document.createElement('input');
                        valueInput.className = 'sk-input';
                        valueInput.type = 'text';
                        valueInput.inputMode = exception.rule === 'fixed' ? 'numeric' : 'decimal';
                        valueInput.placeholder = exception.rule === 'fixed' ? '$ value' : '% value';
                        valueInput.value = exception.value;
                        valueInput.setAttribute('aria-label', 'Exception value');

                        const removeButton = document.createElement('button');
                        removeButton.className = 'sk-trade-delete';
                        removeButton.type = 'button';
                        removeButton.textContent = 'Remove';

                        const updateExceptionItem = () => {
                            const match = itemCatalogByName.get(normalizeItemName(itemInput.value));
                            if (match) {
                                exception.item = match.name;
                                exception.label = match.name;
                                exception.itemId = String(match.id || '');
                                exception.uid = '';
                                exception.fingerprint = '';
                            } else {
                                exception.item = itemInput.value;
                                exception.label = '';
                                exception.itemId = '';
                                exception.uid = '';
                                exception.fingerprint = '';
                            }
                            schedulePersist();
                        };

                        const hideItemResults = () => {
                            itemResults.hidden = true;
                            itemResults.replaceChildren();
                            visibleMatches = [];
                            highlightedIndex = -1;
                            itemInput.removeAttribute('aria-activedescendant');
                        };

                        const selectItem = item => {
                            itemInput.value = item.name;
                            exception.item = item.name;
                            exception.label = item.name;
                            exception.itemId = String(item.id || '');
                            exception.uid = '';
                            exception.fingerprint = '';
                            hideItemResults();
                            schedulePersist();
                        };

                        const updateHighlightedItem = () => {
                            const buttons = [...itemResults.querySelectorAll('.sk-trade-item-option')];
                            buttons.forEach((button, index) => button.classList.toggle('active', index === highlightedIndex));
                            const active = buttons[highlightedIndex];
                            if (active) {
                                itemInput.setAttribute('aria-activedescendant', active.id);
                                active.scrollIntoView({ block: 'nearest' });
                            } else {
                                itemInput.removeAttribute('aria-activedescendant');
                            }
                        };

                        const showItemResults = () => {
                            const query = normalizeItemName(itemInput.value);
                            if (query.length < 2) {
                                hideItemResults();
                                return;
                            }

                            const categoryTerm = normalizeItemName(selectedCategory).replace(/s$/, '');
                            visibleMatches = itemCatalogSearch
                                .filter(item => normalizeItemName(item.name).includes(query))
                                .sort((left, right) => {
                                    const leftName = normalizeItemName(left.name);
                                    const rightName = normalizeItemName(right.name);
                                    const leftCategory = normalizeItemName(left.type).replace(/s$/, '') === categoryTerm ? 0 : 1;
                                    const rightCategory = normalizeItemName(right.type).replace(/s$/, '') === categoryTerm ? 0 : 1;
                                    const categoryOrder = leftCategory - rightCategory;
                                    if (categoryOrder) return categoryOrder;
                                    const startOrder = Number(!leftName.startsWith(query)) - Number(!rightName.startsWith(query));
                                    return startOrder || left.name.localeCompare(right.name);
                                })
                                .slice(0, 8);

                            itemResults.replaceChildren();
                            highlightedIndex = -1;
                            if (!visibleMatches.length) {
                                const noResults = document.createElement('div');
                                noResults.className = 'sk-trade-item-no-results';
                                noResults.textContent = 'No matching items';
                                itemResults.appendChild(noResults);
                            } else {
                                visibleMatches.forEach((item, index) => {
                                    const option = document.createElement('button');
                                    option.type = 'button';
                                    option.className = 'sk-trade-item-option';
                                    option.id = `skp-trade-item-option-${exception.id}-${index}`;
                                    option.setAttribute('role', 'option');

                                    const name = document.createElement('span');
                                    name.className = 'sk-trade-item-option-name';
                                    name.textContent = item.name;
                                    const type = document.createElement('span');
                                    type.className = 'sk-trade-item-option-type';
                                    type.textContent = item.type || 'Item';
                                    option.append(name, type);
                                    option.addEventListener('mousedown', event => event.preventDefault());
                                    option.addEventListener('click', () => selectItem(item));
                                    itemResults.appendChild(option);
                                });
                            }
                            itemResults.hidden = false;
                        };

                        itemInput.addEventListener('input', () => {
                            updateExceptionItem();
                            showItemResults();
                        });
                        itemInput.addEventListener('focus', showItemResults);
                        itemInput.addEventListener('blur', () => setTimeout(hideItemResults, 100));
                        itemInput.addEventListener('keydown', event => {
                            if (event.key === 'Escape') {
                                hideItemResults();
                                return;
                            }
                            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                if (itemResults.hidden) showItemResults();
                                if (!visibleMatches.length) return;
                                event.preventDefault();
                                const direction = event.key === 'ArrowDown' ? 1 : -1;
                                highlightedIndex = (highlightedIndex + direction + visibleMatches.length) % visibleMatches.length;
                                updateHighlightedItem();
                                return;
                            }
                            if (event.key === 'Enter' && !itemResults.hidden && visibleMatches.length) {
                                event.preventDefault();
                                selectItem(visibleMatches[highlightedIndex >= 0 ? highlightedIndex : 0]);
                            }
                        });
                        ruleSelect.addEventListener('change', () => {
                            exception.rule = ruleSelect.value === 'fixed' ? 'fixed' : 'percentage';
                            valueInput.inputMode = exception.rule === 'fixed' ? 'numeric' : 'decimal';
                            valueInput.placeholder = exception.rule === 'fixed' ? '$ value' : '% value';
                            schedulePersist();
                            updateExportPreview();
                        });
                        valueInput.addEventListener('input', () => {
                            exception.value = valueInput.value;
                            schedulePersist();
                        });
                        removeButton.addEventListener('click', () => {
                            record.exceptions = record.exceptions.filter(entry => entry.id !== exception.id);
                            pruneCategoryRecord(profile, selectedCategory);
                            renderExceptions();
                            schedulePersist();
                        });

                        itemPicker.append(itemInput, itemResults);
                        row.append(itemPicker, ruleSelect, valueInput, removeButton);
                        elements.exceptions.appendChild(row);
                    });
                };

                const renderCategoryDetail = () => {
                    const profile = currentProfile();
                    const record = categoryRecord(profile, selectedCategory);
                    const hasCustomRate = Boolean(textValue(record?.rate));
                    if (elements.categoryTitle) elements.categoryTitle.textContent = selectedCategory;
                    if (elements.categoryRate) elements.categoryRate.value = effectiveRate(profile, selectedCategory);
                    if (elements.rateSource) {
                        elements.rateSource.textContent = hasCustomRate
                            ? `Custom rate for ${selectedCategory}`
                            : `Using the ${selectedProfile === 'public' ? 'Public' : 'Friendly'} default rate`;
                    }
                    if (elements.resetCategory) elements.resetCategory.disabled = !hasCustomRate;
                    renderExceptions();
                };

                const renderProfile = () => {
                    const profile = currentProfile();
                    elements.profileButtons.forEach(button => {
                        button.classList.toggle('active', button.dataset.tradeProfile === selectedProfile);
                    });
                    if (elements.copyProfile) {
                        elements.copyProfile.textContent = selectedProfile === 'public' ? 'Copy to Friendly' : 'Copy to Public';
                    }
                    if (elements.openExport) {
                        elements.openExport.textContent = `Export ${selectedProfile === 'public' ? 'Public' : 'Friendly'} Price List`;
                    }
                    if (elements.defaultRate) elements.defaultRate.value = profile.defaultRate;
                    renderCategoryList();
                    renderCategoryDetail();
                    updateExportPreview();
                };

                const buildReadablePriceList = profileKey => {
                    const profile = state.profiles[profileKey];
                    const label = profileKey === 'public' ? 'Public' : 'Friendly';
                    const lines = [
                        'SIDEKICK TRADE PRICE LIST',
                        `Price list: ${label}`,
                        `Default percentage paid: ${profile.defaultRate}%`,
                        '',
                        'CATEGORY RATES'
                    ];

                    Object.entries(categoryGroups).forEach(([groupName, categories]) => {
                        lines.push('', groupName.toUpperCase());
                        categories.forEach(category => {
                            lines.push(`${category}: ${effectiveRate(profile, category)}%`);
                        });
                    });

                    const extraCategories = Object.keys(profile.categories).filter(category => !allCategories.includes(category));
                    if (extraCategories.length) {
                        lines.push('', 'OTHER CATEGORIES');
                        extraCategories.forEach(category => lines.push(`${category}: ${effectiveRate(profile, category)}%`));
                    }

                    const exceptionLines = [];
                    Object.entries(profile.categories).forEach(([category, record]) => {
                        (record.exceptions || []).forEach(exception => {
                            if (!textValue(exception.item) || !textValue(exception.value)) return;
                            const value = exception.rule === 'fixed'
                                ? `${exception.value}`
                                : `${exception.value}% of market value`;
                            exceptionLines.push(`${category} — ${exception.label || exception.item}: ${value}`);
                        });
                    });
                    lines.push('', 'ITEM EXCEPTIONS');
                    lines.push(...(exceptionLines.length ? exceptionLines : ['None']));
                    return lines.join('\n');
                };

                const buildJsonPackage = profileKey => ({
                    schema: 'sidekick-trade-price-list',
                    version: 1,
                    profile: profileKey,
                    exportedAt: new Date().toISOString(),
                    priceList: clone(state.profiles[profileKey])
                });

                function updateExportPreview() {
                    if (!elements.exportPreview || !elements.exportProfile) return;
                    elements.exportPreview.value = buildReadablePriceList(elements.exportProfile.value === 'friendly' ? 'friendly' : 'public');
                }

                const copyText = async text => {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(text);
                        return;
                    }
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;';
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    textarea.remove();
                };

                const downloadText = (filename, content, mimeType) => {
                    const blob = new Blob([content], { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = filename;
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                };

                elements.displayEnabled.checked = state.display.enabled;
                elements.displayMarket.checked = state.display.showMarketValue;
                elements.displayBuy.checked = state.display.showBuyPrice;
                elements.displayTotals.checked = state.display.showTotals;
                elements.defaultProfile.value = state.display.defaultProfile;

                [
                    [elements.displayEnabled, 'enabled'],
                    [elements.displayMarket, 'showMarketValue'],
                    [elements.displayBuy, 'showBuyPrice'],
                    [elements.displayTotals, 'showTotals']
                ].forEach(([input, key]) => {
                    input?.addEventListener('change', () => {
                        state.display[key] = input.checked;
                        schedulePersist();
                    });
                });
                elements.defaultProfile?.addEventListener('change', () => {
                    state.display.defaultProfile = elements.defaultProfile.value === 'friendly' ? 'friendly' : 'public';
                    schedulePersist();
                });

                elements.profileButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        selectedProfile = button.dataset.tradeProfile === 'friendly' ? 'friendly' : 'public';
                        renderProfile();
                    });
                });
                elements.copyProfile?.addEventListener('click', async () => {
                    const targetProfile = selectedProfile === 'public' ? 'friendly' : 'public';
                    const sourceLabel = selectedProfile === 'public' ? 'Public' : 'Friendly';
                    const targetLabel = targetProfile === 'public' ? 'Public' : 'Friendly';
                    if (!confirm(`Replace the ${targetLabel} price list with a copy of ${sourceLabel}?`)) return;
                    state.profiles[targetProfile] = clone(currentProfile());
                    await persist(`${sourceLabel} copied to ${targetLabel}`);
                    renderProfile();
                });
                elements.openExport?.addEventListener('click', () => {
                    if (elements.exportProfile) elements.exportProfile.value = selectedProfile;
                    overlay.querySelector('[data-tab="trade-export"]')?.click();
                    updateExportPreview();
                });
                elements.defaultRate?.addEventListener('input', () => {
                    const value = textValue(elements.defaultRate.value);
                    if (!value) return;
                    currentProfile().defaultRate = value;
                    renderCategoryList();
                    const selectedRecord = categoryRecord(currentProfile(), selectedCategory);
                    if (!textValue(selectedRecord?.rate) && elements.categoryRate) elements.categoryRate.value = value;
                    schedulePersist();
                });
                elements.defaultRate?.addEventListener('blur', () => {
                    if (!textValue(elements.defaultRate.value)) elements.defaultRate.value = currentProfile().defaultRate;
                });
                elements.categorySearch?.addEventListener('input', renderCategoryList);
                elements.categoryRate?.addEventListener('input', () => {
                    const profile = currentProfile();
                    const value = textValue(elements.categoryRate.value);
                    const record = categoryRecord(profile, selectedCategory, Boolean(value));
                    if (value) record.rate = value;
                    else if (record) record.rate = '';
                    pruneCategoryRecord(profile, selectedCategory);
                    if (elements.rateSource) {
                        elements.rateSource.textContent = value
                            ? `Custom rate for ${selectedCategory}`
                            : `Using the ${selectedProfile === 'public' ? 'Public' : 'Friendly'} default rate`;
                    }
                    if (elements.resetCategory) elements.resetCategory.disabled = !value;
                    renderCategoryList();
                    schedulePersist();
                });
                elements.categoryRate?.addEventListener('blur', () => {
                    if (!textValue(elements.categoryRate.value)) renderCategoryDetail();
                });
                elements.resetCategory?.addEventListener('click', () => {
                    const profile = currentProfile();
                    const record = categoryRecord(profile, selectedCategory);
                    if (record) record.rate = '';
                    pruneCategoryRecord(profile, selectedCategory);
                    renderCategoryList();
                    renderCategoryDetail();
                    schedulePersist();
                });
                elements.addException?.addEventListener('click', () => {
                    const profile = currentProfile();
                    const record = categoryRecord(profile, selectedCategory, true);
                    record.exceptions ||= [];
                    record.exceptions.push({
                        id: makeExceptionId(),
                        item: '',
                        rule: 'percentage',
                        value: effectiveRate(profile, selectedCategory)
                    });
                    renderExceptions();
                    elements.exceptions?.querySelector('.sk-trade-exception-row:last-child .sk-input')?.focus();
                    schedulePersist();
                });
                elements.save?.addEventListener('click', () => {
                    persist('Price list saved').catch(error => {
                        console.error('Failed to save price list:', error);
                        showStatus(elements.saveStatus, 'Failed to save price list', true);
                    });
                });

                elements.exportProfile?.addEventListener('change', updateExportPreview);
                elements.copyReadable?.addEventListener('click', async () => {
                    try {
                        await copyText(elements.exportPreview.value);
                        showStatus(elements.exportStatus, 'Readable price list copied');
                    } catch (error) {
                        console.error('Failed to copy readable price list:', error);
                        showStatus(elements.exportStatus, 'Could not copy the price list', true);
                    }
                });
                elements.downloadReadable?.addEventListener('click', () => {
                    const profileKey = elements.exportProfile.value === 'friendly' ? 'friendly' : 'public';
                    downloadText(`sidekick-${profileKey}-price-list.txt`, buildReadablePriceList(profileKey), 'text/plain;charset=utf-8');
                    showStatus(elements.exportStatus, 'Readable price list downloaded');
                });
                elements.copyJson?.addEventListener('click', async () => {
                    const profileKey = elements.exportProfile.value === 'friendly' ? 'friendly' : 'public';
                    try {
                        await copyText(JSON.stringify(buildJsonPackage(profileKey), null, 2));
                        showStatus(elements.exportStatus, 'Sidekick JSON copied');
                    } catch (error) {
                        console.error('Failed to copy Sidekick JSON:', error);
                        showStatus(elements.exportStatus, 'Could not copy Sidekick JSON', true);
                    }
                });
                elements.downloadJson?.addEventListener('click', () => {
                    const profileKey = elements.exportProfile.value === 'friendly' ? 'friendly' : 'public';
                    downloadText(
                        `sidekick-${profileKey}-price-list.json`,
                        JSON.stringify(buildJsonPackage(profileKey), null, 2),
                        'application/json;charset=utf-8'
                    );
                    showStatus(elements.exportStatus, 'Sidekick JSON downloaded');
                });
                elements.importJson?.addEventListener('click', () => elements.importFile?.click());
                elements.importFile?.addEventListener('change', async () => {
                    const file = elements.importFile.files?.[0];
                    if (!file) return;
                    const targetProfile = elements.exportProfile.value === 'friendly' ? 'friendly' : 'public';
                    const targetLabel = targetProfile === 'friendly' ? 'Friendly' : 'Public';
                    try {
                        const imported = JSON.parse(await file.text());
                        let importedProfile = null;
                        if (imported?.schema === 'sidekick-trade-price-list' && imported.priceList) {
                            importedProfile = imported.priceList;
                        } else if (imported?.profiles?.[targetProfile]) {
                            importedProfile = imported.profiles[targetProfile];
                        }
                        if (!importedProfile) throw new Error('This is not a Sidekick price-list file.');
                        if (!confirm(`Replace the ${targetLabel} price list with the imported list?`)) return;
                        state.profiles[targetProfile] = normalizeProfile(importedProfile);
                        await persist();
                        if (selectedProfile === targetProfile) renderProfile();
                        updateExportPreview();
                        showStatus(elements.exportStatus, `${targetLabel} price list imported`);
                    } catch (error) {
                        console.error('Failed to import Sidekick price list:', error);
                        showStatus(elements.exportStatus, error.message || 'Could not import the price list', true);
                    } finally {
                        elements.importFile.value = '';
                    }
                });

                renderProfile();
                updateExportPreview();
            };

            initializeTradingSettings().catch(error => {
                console.error('Failed to initialize Trading settings:', error);
            });

            // Sliders
            overlay.querySelectorAll('.skp-slider').forEach(slider => {
                const outId = slider.dataset.out;
                const suffix = slider.dataset.suffix || '';
                const out = overlay.querySelector('#' + outId);
                if (out) slider.addEventListener('input', () => { out.textContent = slider.value + suffix; });
            });

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
                // Personal
                ['#skp-tog-fast-attack', 'sidekick_attack_button_mover', null, true],
                ['#skp-tog-attack-online', 'sidekick_settings', 'attack-online-status', true],
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
                ['#skp-tog-chat-popout', 'sidekick_settings', 'chat-popout', false],
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
                ['#skp-tog-hustling', 'sidekick_settings', 'crime-hustling', false],
                // War
                ['#skp-tog-chain-timer', 'sidekick_chain_timer', null, false],
                ['#skp-tog-war-monitor', 'sidekick_war_monitor', null, false],
                ['#skp-tog-chain-view', 'sidekick_extended_chain_view', null, false],
                ['#skp-tog-termed-war', 'sidekick_settings', 'termed-war-mode', false],
                ['#skp-tog-war-target-caller', 'sidekick_war_target_caller', null, false],

                // Missions

                ['#skp-tog-mission-tracker', 'sidekick_settings', 'mission-tracker', false],
                ['#skp-tog-book-notifier', 'sidekick_settings', 'book-notifier', false],
                // Events
                ['#skp-tog-event-calendar', 'sidekick_settings', 'event-calendar', false],
                ['#skp-tog-easter', 'sidekick_egg_helper', null, false],
                ['#skp-tog-halloween', 'sidekick_halloween', null, false],
                ['#skp-tog-christmas-zoom', 'sidekick_settings', 'christmas_zoom', false],
                ['#skp-tog-christmas-beers', 'sidekick_settings', 'christmas_beers', false],
                // Medical
                ['#skp-tog-smart-medical', 'sidekick_smart_medical', null, false],
                // Mugging
                ['#skp-tog-mug-calc', 'sidekick_mug_calculator', null, false],
                // Merits
                ['#skp-tog-merit-calc', 'sidekick_merit_calculator', null, false],
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
                const apiInput = overlay.querySelector('#sidekick-api-key');
                if (apiInput && apiKey) apiInput.value = apiKey;

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
                    try {
                        await saveToggle(storKey, subKey, inp.checked);

                        if (subKey === 'bunker-bucks' && window.SidekickModules?.BunkerBucks) {
                            if (inp.checked) {
                                await window.SidekickModules.BunkerBucks.enable();
                            } else {
                                await window.SidekickModules.BunkerBucks.disable();
                            }
                        }

                    } catch (e) {
                        console.error(e);
                    }
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
            const mugMeritsEl = overlay.querySelector('#mugMeritsInput');
            const mugPlunderEl = overlay.querySelector('#plunderInput');
            const mugNoPlunderEl = overlay.querySelector('#noPlunderCheckbox');
            const mugThreshEl = overlay.querySelector('#thresholdInput');

            // Load stored values into the inputs
            (async () => {
                if (!CS()) return;
                const merits = await CS().get('mugMerits');
                const plunder = await CS().get('mugPlunder');
                const noPlunder = await CS().get('mugNoPlunder');
                const thresh = await CS().get('mugThreshold');
                if (mugMeritsEl && merits != null && merits > 0) mugMeritsEl.value = merits;
                if (mugPlunderEl && plunder != null && plunder > 0) mugPlunderEl.value = plunder;
                if (mugNoPlunderEl && noPlunder != null) mugNoPlunderEl.checked = noPlunder === true;
                if (mugThreshEl && thresh != null && thresh > 0) mugThreshEl.value = thresh;
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
                    const meritsVal = parseInt(mugMeritsEl?.value ?? '', 10);
                    const threshVal = parseInt(mugThreshEl?.value ?? '', 10);
                    const noPlunder = mugNoPlunderEl?.checked ?? false;
                    const plunderVal = noPlunder ? 0 : parseFloat(mugPlunderEl?.value ?? 0);
                    await CS().set('mugMerits', isNaN(meritsVal) ? 0 : Math.min(Math.max(meritsVal, 0), 10));
                    await CS().set('mugPlunder', isNaN(plunderVal) ? 0 : plunderVal);
                    await CS().set('mugNoPlunder', noPlunder);
                    await CS().set('mugThreshold', isNaN(threshVal) ? 0 : threshVal);
                    // Invalidate the mug data cache so the next popup reflects new settings
                    if (window.SidekickModules?.MugCalculator?.clearCache) {
                        window.SidekickModules.MugCalculator.clearCache();
                    }
                }, 400);
            };

            if (mugMeritsEl) mugMeritsEl.addEventListener('input', saveMugSettings);
            if (mugPlunderEl) mugPlunderEl.addEventListener('input', saveMugSettings);
            if (mugThreshEl) mugThreshEl.addEventListener('input', saveMugSettings);
            if (mugNoPlunderEl) {
                mugNoPlunderEl.addEventListener('change', () => {
                    if (mugPlunderEl) {
                        mugPlunderEl.disabled = mugNoPlunderEl.checked;
                        mugPlunderEl.style.opacity = mugNoPlunderEl.checked ? '0.4' : '1';
                    }
                    saveMugSettings();
                });
            }

            // Attach specific tab listeners to the new preview overlay
            this.attachGeneralTabListeners(overlay);
            this.attachModulesTabListeners(overlay);
            this.attachXanaxTabListeners(overlay);
            // These are legacy-tab listener sets. Only attach them when their
            // old controls are actually present in the current settings UI.
            if (overlay.querySelector('#sidekick-chain-threshold')) this.attachChainTimerTabListeners(overlay);
            if (overlay.querySelector('.toggle-switch[data-module="notification-sound"]')) this.attachNotificationsTabListeners(overlay);
            if (overlay.querySelector('#bloodbag-count')) this.attachBloodBagTabListeners(overlay);
            if (overlay.querySelector('#skp-deposit-target')) this.attachQuickDepositTabListeners(overlay);
            if (overlay.querySelector('#crime-notifier-interval')) this.attachCrimeNotifierTabListeners(overlay);
            this.attachCrimesTabListeners(overlay);
            this.attachMugWarningTabListeners(overlay);
            this.attachMissionTrackerTabListeners(overlay);
            this.attachHideCrimeTabListeners(overlay);
            this.attachEggHelperTabListeners(overlay);
            this.attachWarTargetCallerTabListeners(overlay);

        },
        // General Tab listeners
        attachGeneralTabListeners(panel) {
            const apiInput = panel.querySelector('#sidekick-api-key');
            const testBtn = panel.querySelector('#sidekick-test-api');
            const statusDiv = panel.querySelector('#sidekick-api-status');

            let apiKeySaveTimeout;
            if (apiInput) {
                apiInput.addEventListener('input', () => {
                    clearTimeout(apiKeySaveTimeout);
                    apiKeySaveTimeout = setTimeout(async () => {
                        const value = apiInput.value.trim();
                        try {
                            if (value) {
                                await window.SidekickModules.Core.ChromeStorage.set('sidekick_api_key', value);
                                this.showAutoSaveStatus(statusDiv, 'API key saved ✓');
                            } else {
                                await window.SidekickModules.Core.ChromeStorage.remove('sidekick_api_key');
                                this.showAutoSaveStatus(statusDiv, 'API key removed ✓');
                            }
                        } catch (error) {
                            console.error('Failed to save API key:', error);
                        }
                    }, 500);
                });
            }

            testBtn?.addEventListener('click', async () => {
                const key = apiInput?.value.trim();

                if (!key) {
                    if (window.SidekickModules.Core.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show('API Test', 'Please enter an API key first', 'error', 3000);
                    }
                    return;
                }

                if (window.SidekickModules.Core.NotificationSystem) {
                    window.SidekickModules.Core.NotificationSystem.show('API Test', 'Testing API connection...', 'info', 2000);
                }

                try {
                    const response = await fetch(
                        `https://api.torn.com/user/?selections=basic&key=${encodeURIComponent(key)}`
                    );
                    const data = await response.json();
                    const isError = Boolean(data.error);
                    const finalMsg = isError
                        ? `API Error: ${data.error.error}`
                        : `API Working (${data.name})`;

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
            if (showKeyBtn && apiInput) {
                showKeyBtn.addEventListener('click', () => {
                    apiInput.type = apiInput.type === 'password' ? 'text' : 'password';
                    showKeyBtn.textContent = apiInput.type === 'password' ? 'Show Key' : 'Hide Key';
                });
            }

            const clearApiBtn = panel.querySelector('#skp-clear-api-key');
            if (clearApiBtn && apiInput) {
                clearApiBtn.addEventListener('click', async () => {
                    apiInput.value = '';
                    try {
                        await window.SidekickModules.Core.ChromeStorage.remove('sidekick_api_key');
                        this.showAutoSaveStatus(statusDiv, 'API key removed ✓');
                    } catch (error) {
                        console.error('Failed to remove API key:', error);
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
                    console.log("📤 Export button clicked");
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

                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);

                        setTimeout(() => {
                            URL.revokeObjectURL(url);
                        }, 1000);

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
            const floatingDisplayCheckbox = panel.querySelector('#sidekick-chain-floating-display');

            // Guard: bail early if any required control is missing
            if (
                !chainThresholdSlider ||
                !chainThresholdDisplay ||
                !chainAlertsCheckbox ||
                !chainPopupCheckbox ||
                !chainFlashCheckbox
            ) {
                return;
            }

            // Auto-save helper
            const autoSaveChainSettings = async () => {
                const isEnabled = chainTimerToggle ? chainTimerToggle.dataset.active === 'true' : false;

                const settings = {
                    isEnabled: isEnabled,
                    alertThresholdSeconds: parseFloat(chainThresholdSlider.value) * 60,
                    alertsEnabled: chainAlertsCheckbox.checked,
                    popupEnabled: chainPopupCheckbox.checked,
                    screenFlashEnabled: chainFlashCheckbox.checked,
                    floatingDisplayEnabled: floatingDisplayCheckbox ? floatingDisplayCheckbox.checked : true
                };

                try {
                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_chain_timer', settings);
                    this.showAutoSaveStatus(chainStatusDiv, 'Settings saved ✓');

                    if (window.SidekickModules.Core.NotificationSystem) {
                        window.SidekickModules.Core.NotificationSystem.show(
                            'Chain Timer',
                            'Settings saved automatically',
                            'success',
                            2000
                        );
                    }

                    // Immediately apply to running module
                    if (window.SidekickModules?.ChainTimer) {
                        window.SidekickModules.ChainTimer.isEnabled = isEnabled;
                        window.SidekickModules.ChainTimer.alertThresholdSeconds = settings.alertThresholdSeconds;
                        window.SidekickModules.ChainTimer.alertsEnabled = settings.alertsEnabled;
                        window.SidekickModules.ChainTimer.popupEnabled = settings.popupEnabled;
                        window.SidekickModules.ChainTimer.screenFlashEnabled = settings.screenFlashEnabled;
                        window.SidekickModules.ChainTimer.floatingDisplayEnabled = settings.floatingDisplayEnabled;

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

            // Slider: update display on input, persist on change
            chainThresholdSlider.addEventListener('input', () => {
                chainThresholdDisplay.textContent = `${chainThresholdSlider.value} min`;
            });
            chainThresholdSlider.addEventListener('change', autoSaveChainSettings);

            // Checkboxes
            chainAlertsCheckbox.addEventListener('change', autoSaveChainSettings);
            chainPopupCheckbox.addEventListener('change', autoSaveChainSettings);
            chainFlashCheckbox.addEventListener('change', autoSaveChainSettings);
            if (floatingDisplayCheckbox) {
                floatingDisplayCheckbox.addEventListener('change', autoSaveChainSettings);
            }
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

        showStatus(element, message, type = 'info') {
            if (!element) return;

            element.textContent = message;

            switch (type) {
                case 'success':
                    element.style.background = 'rgba(76,175,80,0.3)';
                    break;

                case 'error':
                    element.style.background = 'rgba(244,67,54,0.3)';
                    break;

                case 'warning':
                    element.style.background = 'rgba(255,152,0,0.3)';
                    break;

                default:
                    element.style.background = 'rgba(255,255,255,0.1)';
            }

            element.style.color = '#fff';
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
            const targetSelect = panel.querySelector('#skp-deposit-target');
            const ghostIdInput = panel.querySelector('#skp-deposit-ghost-id');
            const clearGhostBtn = panel.querySelector('#skp-deposit-clear-ghost');
            const ghostRow = panel.querySelector('#skp-ghost-row');
            const statusDiv = panel.querySelector('#skp-deposit-status');

            if (!targetSelect) {
                return;
            }

            const normalizeTarget = value => {
                const normalized = String(value || '')
                    .trim()
                    .toUpperCase()
                    .replace(/[\s_-]+VAULT$/, '')
                    .replace(/[\s_-]+TRADE$/, '');

                return ['FACTION', 'PROPERTY', 'COMPANY', 'GHOST'].includes(normalized)
                    ? normalized
                    : 'FACTION';
            };

            const updateGhostRow = () => {
                if (ghostRow) {
                    ghostRow.style.display = targetSelect.value === 'GHOST' ? 'block' : 'none';
                }
            };

            // Load current settings
            try {
                const targetStored = await window.SidekickModules.Core.ChromeStorage.get('quickDeposit_target');
                const ghostStored = await window.SidekickModules.Core.ChromeStorage.get('quickDeposit_ghostID');

                const target = normalizeTarget(targetStored);
                targetSelect.value = target;
                updateGhostRow();

                // Migrate values written by the old settings dropdown, such as
                // "Faction Vault", to the canonical values used by the module.
                if (targetStored !== target) {
                    await window.SidekickModules.Core.ChromeStorage.set('quickDeposit_target', target);
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
                    const target = normalizeTarget(targetSelect.value);
                    targetSelect.value = target;
                    updateGhostRow();
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

        attachEggHelperTabListeners(panel) {
            const toggle = panel.querySelector('#holiday-egghunt-toggle');
            const resetBtn = panel.querySelector('#holiday-egghunt-reset');
            const statusDiv = panel.querySelector('#sidekick-holiday-status');

            if (toggle) {
                const track = toggle.querySelector('.toggle-track');
                const thumb = toggle.querySelector('.toggle-thumb');

                toggle.addEventListener('click', async () => {
                    if (!window.SidekickModules.EggHelper) return;
                    window.SidekickModules.EggHelper.eggHuntEnabled = !window.SidekickModules.EggHelper.eggHuntEnabled;
                    const on = window.SidekickModules.EggHelper.eggHuntEnabled;
                    track.style.backgroundColor = on ? 'rgba(76,175,80,0.8)' : 'rgba(255,255,255,0.2)';
                    thumb.style.transform = on ? 'translateX(26px)' : 'translateX(0)';
                    await window.SidekickModules.EggHelper.saveSettings();
                    this.showAutoSaveStatus(statusDiv, on ? 'Egg Hunt enabled \u2713' : 'Egg Hunt disabled \u2713');
                    setTimeout(() => window.location.reload(), 700);
                });
            }

            if (resetBtn) {
                resetBtn.addEventListener('click', async () => {
                    if (!confirm('Reset all Easter Egg Hunt progress (visited pages and egg count)?')) return;
                    try {
                        await window.SidekickModules.Core.ChromeStorage.set('sidekick_egg_helper_eggHunt', {});
                        this.showAutoSaveStatus(statusDiv, 'Hunt progress reset ✓');
                    } catch (e) {
                        console.error('Failed to reset egg hunt:', e);
                    }
                });

                resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'rgba(239,83,80,0.28)'; });
                resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'rgba(239,83,80,0.15)'; });
            }

            this.loadEggHelperSettings(panel);
        },

        async loadEggHelperSettings(panel) {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_egg_helper');
                const on = data?.eggHuntEnabled || false;
                const track = panel.querySelector('#holiday-egghunt-toggle .toggle-track');
                const thumb = panel.querySelector('#holiday-egghunt-toggle .toggle-thumb');
                if (track) track.style.backgroundColor = on ? 'rgba(76,175,80,0.8)' : 'rgba(255,255,255,0.2)';
                if (thumb) thumb.style.transform = on ? 'translateX(26px)' : 'translateX(0)';
            } catch (e) {
                console.error('Failed to load Egg Helper settings:', e);
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
