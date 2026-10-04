# Sidekick Module Catalogue — Attack & War

Modules that live on Torn's attack pages and faction war pages.

---

⚔️ **Fast Attack**

Where to find it: Settings → Personal → Fast Attack (also toggleable from the toolbar popup) · On by default · Runs on the attack page

Moves the Start Fight button on top of your equipped primary weapon so you can start fights with one click, right where your cursor already is. The overlay disappears once the fight starts. Works on every attack page — player hits, NPCs, ranked wars. Turning it off puts the button back with no refresh needed. Finds the button by its text, not Torn's scrambled class names, so it keeps working through Torn updates.

---

⚔️ **Attack Online Status**

Where to find it: Settings → Personal → Attack Online Status (also toggleable from the toolbar popup) · On by default · Runs on the attack page · Requires your Torn API key

Adds a small colored dot next to your target's name: green means they're online right now, yellow means idle, grey means offline — the safest window for an attack. Status comes from Torn's own last_action data, re-checked every minute while the page is open, and cached so page refreshes don't spam the API.

---

⚔️ **Attack Options (Termed War Mode)**

Where to find it: no settings of its own — activates automatically when Termed War Mode is enabled (Settings → War → Termed War Mode) · Runs on the attack page

While Termed War Mode is on, this module hides the Mug and Hospitalize buttons from the end-of-fight screen, so the only outcomes you can click are Leave and Arrest. In a termed war the only correct choice is Leave — one rushed click on the wrong button breaks your faction's war pact. Detective agencies can use it the same way as an "arrest mode": turn on Termed War Mode while doing arrest missions and the two dangerous buttons vanish, leaving Arrest and Leave.

---

🔗 **Attack List — see the Sidebar page.** (Sidebar module, listed there.)

---

⏱️ **Chain Timer**

Where to find it: Settings → War → Chain Timer (also toggleable from the toolbar popup) · Off by default · Runs on all Torn pages

Floating, draggable countdown of your faction's chain timer so you never drop a chain by accident. Colors shift green → orange → red as time runs low, and when the timer drops below your threshold, it alerts you three ways: a browser popup, a red screen flash, and a browser notification. The floater appears instantly on page loads via a saved fast-path, before settings finish loading.

---

⛓️ **Extended Chain View**

Where to find it: Settings → War → Extended Chain View (also toggleable from the toolbar popup) · Off by default · Runs on the faction war page

Torn only shows the last ~10 hits of a chain. Extended Chain View keeps a second list below it and copies each attack into it as it scrolls off the top, so you can review the full chain history while the war page is open. Timestamps tick up live ("4m ago").

---

⚔️ **War Monitor**

Where to find it: Settings → War → War Monitor (also toggleable from the toolbar popup) · Off by default · Runs on the faction war page

Torn's war page shows each enemy as a vague status icon. War Monitor replaces that with live data for the whole enemy faction, refreshed every 5 seconds:

| Row color | Meaning |
|---|---|
| 🟩 Green | In hospital/jail — out in under 5 minutes. Your next hittable target. |
| 🟧 Orange | In hospital/jail — out in 5–10 minutes. Worth lining up. |
| 🟥 Red | Out of the country — can't be hit right now. |
| (no color) | Okay and in Torn — free to attack immediately. |

Hospital/jail rows show a live HH:MM:SS countdown, travelers show direction and destination (► Japan / ◄ Coming home / In Japan), and the list continuously re-sorts itself so soonest-out targets rise to the top. While the war page is open it also tallies every enemy's location and hands a per-country summary to the Travel Blocker — enable both for the full effect.

---

🎯 **FactionOps Target Caller**

Thanks to RussianRob & Dead Fragment exclusive!
Where to find it: Settings → War → FactionOps Target Caller (also toggleable from the toolbar popup) · Off by default · Runs on the faction war page

A "called it" system for wars: click ✔️ on an enemy row to claim that target so your faction mates don't waste hits on it, with claims shared live (5-second sync) between Sidekick users and FactionOps userscript users via the FactionOps server. Claims show the caller's name in a stable per-player color; double-click the badge to jump to the attack, right-click your own claim to release it. Claims auto-expire after 20 minutes and auto-release when your own hit lands. Players outside the supported faction get copy mode — clicking ✔️ copies a "Hitting <name> [id]" message to the clipboard instead of syncing with a server.

---

⚠️ **Mug Warning**

Where to find it: Settings → Mugging → Warning (also toggleable from the toolbar popup) · Off by default · Runs on profile and attack pages

If you mugged a player recently (configurable window, default 24 hours), a red modal warns you before you can mug them again.

---

🥊 **Mug Calculator**

Where to find it: Settings → Mugging → Calculator (also toggleable from the toolbar popup) · Off by default · Runs on the Item Market and Points Market

Adds an ⓘ icon next to sellers on market listings. Click it to see the target's mug range — the minimum and maximum cash you'd steal, computed from the real mug formula applied to the listing they're selling. The popup also shows their level, status countdown, life, faction, and revivability. Icons only appear on listings above your configured minimum value.
