# Sidekick Module Catalogue — Items & Inventory

---

📦 **Inventory Sorter**

Where to find it: no settings toggle — activates automatically on the items page · Requires your Torn API key (shows a warning otherwise)

Adds **SORT** and **WORTH** buttons next to the items page title. SORT cycles the current item category between highest-value-first, lowest-value-first, and Torn's default order. WORTH sums the total market value of every item in the category and displays it. Uses live market values from the Torn API. (Sort needs all items in the category loaded first — Sidekick auto-scrolls to load them for you.)

---

👕 **Loadout Switcher**

Where to find it: Settings → Personal → Loadout Switcher (toggleable from the toolbar popup) · Off by default · Runs on the items page

Adds one-click loadout-change buttons next to the loadouts title on the items page — click "Primary", "Secondary", or whatever you've named your loadouts (up to three by default, configurable via the ⚙ button) to switch instantly, with a color flash showing success (green) or failure (red).

---

🔒 **Locked Items Manager**

Where to find it: Settings → Personal → Locked Items (toggleable from the toolbar popup) · Off by default · Runs on the items page (and market pages)

Lock specific inventory items so you can't trade or sell them by accident — Sidekick blocks the confirmation. Manage locks from its own panel; locked items are visually marked. Your lock list is saved separately from the toggle (97+ items can be locked), and can be imported/exported via Settings → Export Data.

---

🗡️ **Weapon XP Tracker**

Where to find it: Settings → Personal → Weapon XP Tracker (toggleable from the toolbar popup) · Off by default · Runs on the items page · Requires your Torn API key

Shows each weapon's experience progress as a live percentage under its name on the items page, with the XP still needed to reach the next level. Excludes non-weapon items (grenades, sprays, booster drugs) that don't gain XP. An "Overview" button opens a full summary window of all your weapons' XP.

---

🔗 **Player ID Linker**

Where to find it: no settings toggle — always on · Runs on all Torn pages

Turns bare player references like `[1234567]`, `#1234567`, or "player id: 1234567" into clickable profile links wherever they appear — chat, forums, mail, notes. The ID shown on the profile you're currently viewing stays as plain text so you can copy it; everywhere else, every ID becomes a link.

---

🔤 **Legible Player Names**

Where to find it: Settings → Utility → Legible Player Names (toggleable from the toolbar popup) · Off by default · Runs on all Torn pages

Replaces Torn's tiny sprite-based honor-rank names (the near-unreadable calligraphic rank titles under player names) with real, readable text in a clean font — rank color preserved via outlines (red for admins, green for officers, orange for moderators, purple for helpers, blue for special ranks).

---

⚔️ **Auction Weapon Bonus**

Where to find it: Settings → Utility → Auction Weapon Bonus (toggleable from the toolbar popup) · Off by default · Runs on the auction house (plus item market, bazaar, and inventory icon markers)

Special weapons carry bonuses — Plunder, Vorpal, Explosive Rounds — but Torn only shows them as tiny icons. In the auction house this module writes the bonuses out as pills under the weapon's name ("Plunder 21%"), color-tinted to the item's glow, hoverable for the full description. On the item market and bazaar it enlarges the bonus icons (~3×, with hover highlight) so you can spot them while scrolling. In your inventory your own bonus weapons get a red square outline marker.
