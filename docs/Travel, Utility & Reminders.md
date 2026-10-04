# Sidekick Module Catalogue — Travel, Utility & Reminders

---

🚧 **Travel Blocker**

Where to find it: Settings → Reminders → Travel Blocker (also toggleable from the toolbar popup) · **On by default** · Runs on the travel agency page

Blocks flights that would cost you more than they're worth. Three independent rules, each toggleable:

- **OC watch** — blocks travel when the round trip would outlast an OC you're signed up for (with a configurable safety buffer)
- **Drug cooldown watch** — blocks when a drug cooldown would lapse mid-trip
- **War watch** — counts how many enemies are in each destination (using data from War Monitor) and badges the country; outside an active war it can block travel there too

During an active war all blocking pauses (you have to be able to fly to the fight) but the enemy-count badges stay visible. Blocked destinations show why with a plain-language reason.

---

✈️ **Flight Tracker**

Where to find it: no settings toggle — activates automatically · Runs on profile pages (tracking window persists everywhere)

Adds a **Track** button on player profiles. When the target is flying, Sidekick opens a small window with their flight status and a live countdown to landing, computed from static travel-time data for all destinations (adjusted for airstrip/business-class travel). The window survives page navigation and refreshes until you stop tracking, so you can watch a target's flight from anywhere.

---

⏰ **Time on Tab**

Where to find it: Settings → Utility → Time on Tab (toggleable from the toolbar popup) · Off by default · Runs on all Torn pages (browser tab title)

Puts your most relevant countdown in the browser tab title: hospital time on your profile, travel time while flying, race time at the raceway, chain timer during a war. Alternates with a short page label so you can tell tabs apart, and it's synchronized across all your Torn tabs, so the countdown is identical whichever tab you look at.

---

🔗 **Link Group — see the Sidebar page.** (Sidebar module, listed there.)

---

⚠️ **Refill Blocker**

Where to find it: Settings → Utility → Refill Blocker (toggleable from the toolbar popup) · Off by default · Runs on the points page

Adds a confirmation checkbox before you use an energy or nerve refill, showing your current bar levels — so you can't waste a refill on a bar that's already half full. It reads your bars through the API to display exactly what you're about to refill.

---

🏎️ **Racing Alert**

Where to find it: Settings → Reminders → Racing Alert (toggleable from the toolbar popup) · Off by default · Runs on all Torn pages (status area)

If you're in a racing series and overdue for a race, a red racing icon appears (and pulses) in your sidebar status area, linking straight to the raceway — you don't lose your seriesNEXT / streak because you forgot a race.

---

## Reminders

---

🎯 **Mission Tracker**

Where to find it: Settings → Missions → Mission Tracker (toggleable from the toolbar popup) · Off by default · Runs on all Torn pages (status area)

Watches for active missions and shows an icon in the sidebar status area when one's available, with how urgent it is, so idle mission slots don't sit wasted. Icon links to the missions page.

---

📚 **Book Notifier**

Where to find it: Settings → Missions → Book Notifier (toggleable from the toolbar popup) · Off by default · Runs on all Torn pages (status area)

Checks via the Torn API whether you have any completed-mission book rewards sitting unclaimed, and shows an icon until you've collected them.

---

🎪 **Event Notifier**

Where to find it: Settings → Events → Enable Event Notifications (toggleable from the toolbar popup) · Off by default · Runs on all Torn pages

Sticky corner banner + optional browser notification when a Torn event is about to start — you set how many hours of lead time. Shows the event name and what it gives, with a click to acknowledge so you aren't re-alerted for the same occurrence (acknowledgement resets each year).

---

💬 **Chat Alert**

Where to find it: Settings → Utility → Chat Alert (toggleable from the toolbar popup) · Off by default · Runs on all Torn pages (browser tab)

Badges the browser tab with your unread chat count: a red counter drawn onto the favicon and the unread number in the tab title. Keep Torn muted in another tab and still know when someone's trying to reach you.

---

↗️ **Chat Popout**

Where to find it: Settings → Utility → Chat Popout (toggleable from the toolbar popup) · Off by default · Opens a separate browser window

Adds a pop-out button to Torn's chat so one conversation (or the whole chat panel) can live in its own resizable browser window while you play. Sizing and position are remembered.

---

🔀 **Random Target**

Where to find it: Settings → Features/Utility → Random Target (toggleable from the toolbar popup) · Off by default · Floating button on all pages

A small floating 🎯 button: single-click to arm it, double-click to attack a randomly-picked player — optionally vetted via the API first (status "Okay", under your Xanax/refill/stat-enhancer limits — configured in the module settings) so you don't waste a hit on someone with a fully-drained bar. Button position is draggable and saved.

---

## Events

---

🥚 **Easter Egg Helper**

Where to find it: Settings → Events → Enable Egg Helper (toggleable from the toolbar popup) · Off by default · Runs on all Torn pages during the Easter event

During the Torn Easter Egg Hunt, collects the "egg found" events from your log, shows your collected-egg count and remaining-egg countdown, and a checklist of all the page locations eggs spawn on so you can systematically sweep the city.

---

🎃 **Halloween Helper**

Where to find it: Settings → Events → Enable Halloween Helper (toggleable from the toolbar popup) · Off by default · Runs on all Torn pages during the Halloween event

Keeps your Halloween hit list: add target player IDs to a tracked list, and for each target it pulls when you last attacked them so you don't break the once-per-target rule. The target list is shared across tabs.

---

🎄 **Christmas Helper (Zoom & Beers)**

Where to find it: Settings → Events → **Bigger window** and **Fast beers** (toggleable from the toolbar popup) · Off by default · Runs on the Christmas Town page during the event

Two quality-of-life toggles for Christmas Town: **Bigger window** enlarges the圣诞 Town map so it's actually clickable, and **Fast beers** speeds up the beer-reward animation so the daily beer event is less of a wait.

---

## Tools

---

🐛 **Bug Reporter**

Where to find it: press **Ctrl+Shift+B** anywhere on Torn

Opens a small modal to send a bug report straight from the game into the Sidekick developers' Notion board — no Discord detour. Works on every Torn page.
