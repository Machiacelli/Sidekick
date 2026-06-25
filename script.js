<USER_REQUEST>
remove it. 
then move the item market filler button outside of the native torn element, just like the bazaar filler does. currently its just slightly warps the torn ui so its better to leave it ouside for now, just to the right of where it is now. 

Then lets create another module, Rehab warning. This module should check for the addiction icon or if possible use the api to get the information when addiction kicks in. 
In the reminders tab of the settings, it should have its own switch with a drop down setting just like the travel blocker in the same tab. The settings should let the user decide what percentage of addiction the warning should kick in at, 1-10%. 
The game has a limit on how much addiction a player can gain before kicking them out of their education, the warning should take this into account and in the notification warning that the user has to press to remove should include how many more xanax might be safe before a kick. 
The setting should include the option if the user wants to alert on company addiction aswell, this can range all the way up to 30 minus-points. The user could change the option to what ever the treshold is for that directors terms. 
The notification alert should also include Rehab cost estimation based on your lifetime rehab count â€” auto-updated from the API. 
I have this script that does alot more but we can use this script to get some understanding of how we will build or own code for our own module. 

// ==UserScript==
// @name         Torn Addiction Watch + Rehab Advisor
// @namespace    https://torn.com/
// @version      1.7.8
// @description  Configurable addiction monitoring for Torn.
// @author       themcgarvie (WolfOfJedah [3317459])
// @license      MIT
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// ==/UserScript==
 
(() => {
<truncated 45215 bytes>
 parent);
        watchSidebarParent(panel, parent);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
 
  function watchSidebarParent(panel, parent) {
    if (sidebarObserver) sidebarObserver.disconnect();
    sidebarObserver = new MutationObserver(() => {
      if (!document.getElementById("woj-taw-panel")) doInject(panel, parent);
    });
    sidebarObserver.observe(parent, { childList: true });
  }
 
  // ============================================================
  // Settings
  // ============================================================
 
  function createSettingsDialog() {
    const overlay = document.createElement("div");
    overlay.id = "woj-taw-settings-overlay";
    overlay.innerHTML = `
      <div id="woj-taw-settings">
        <div class="settings-header">
          <div class="settings-title">Addiction Watch Settings</div>
          <button class="woj-btn woj-btn-close-settings">âœ•</button>
        </div>
        <div class="settings-body"></div>
        <div class="settings-footer">
          <button class="settings-btn secondary" id="woj-taw-cancel">Cancel</button>
          <button class="settings-btn primary" id="woj-taw-save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector(".woj-btn-close-settings").addEventListener("click", () => overlay.classList.remove("active"));
    overlay.querySelector("#woj-taw-cancel").addEventListener("click",          () => overlay.classList.remove("active"));
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.classList.remove("active"); });
    overlay.querySelector("#woj-taw-save").addEventListener("click", () => { saveSettingsFromForm(); overlay.classList.remove("active"); });
    return overlay;
  }
 
  function openSettings() 
<truncated 42885 bytes>

NOTE: The output was truncated because it was too long. Use a more targeted query or a smaller range to get the information you need.
