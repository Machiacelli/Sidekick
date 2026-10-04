# Sidekick Module Catalogue — Crimes

Modules that enhance Torn's crime system. All of these run on the crimes page unless noted, and most are off by default.

---

🚨 **Crime Notifier (Shoplifting & Search For Cash alerts)**

Where to find it: Settings → Crimes → **Shoplifting** → Enable Shoplifting Alert, and **Search for Cash** → Enable SFC Alert (both also toggleable from the toolbar popup) · Off by default · Runs on all Torn pages (background polling)

Watch the whole city while you do something else. Crime Notifier checks Torn's API every 30 seconds (configurable) and alerts you when:

- **Shoplifting security drops** — you pick which shops and which security countermeasures (cameras, guards, checkpoints) to watch; when all selected measures in a shop go down at once, you get an in-page notification, browser notification, extension-icon badge, and a flashing browser tab title.
- **Search for Cash crosses a threshold** — you set a percentage threshold; when any location's odds cross it, you get the same alert stack.

Pick the exact shops/locations and countermeasures you want from the settings shelf so you're only alerted for crimes you actually do.

---

🛑 **Pickpocketing Helper**

Where to find it: Settings → Crimes → Pickpocketing (also toggleable from the toolbar popup) · Off by default · Runs on the crimes page (pickpocketing section)

Color-codes every mark on the pickpocketing page by danger level — green for safe targets like drunk men and elderly people, up through orange and red to purple for the police officer. Each name gets a border tint and a difficulty label, and the labels adapt to your pickpocketing skill level (a target that's "Risky" at skill 10 becomes "Safe" as your skill grows, at skill thresholds 10/35/65/80).

---

🏠 **Burglary Helper**

Where to find it: Settings → Crimes → Burglary (also toggleable from the toolbar popup) · Off by default · Runs on the crimes page (burglary section)

Shows the confidence percentage permanently as text next to the burglary graphic, so you can compare locations and time slots without hovering. Area buttons are color-coded by their score for the current hour, the best area for the current hour glows green, and hovering any area shows its optimal 3-hour window.

---

🗑️ **Disposal Helper**

Where to find it: Settings → Crimes → Disposal (also toggleable from the toolbar popup) · Off by default · Runs on the crimes page (disposal section)

Color-codes disposal method buttons by outcome risk for each item type — green for the safe method, red for failure risks. Weapon? Sink it green. Documents? Burn them (sinking or dissolving documents is a red-bordered mistake). The color coding applies automatically to each item's five method buttons so you never misclick a bad disposal method.

---

🔍 **Search for Cash Helper**

Where to find it: Settings → Crimes → Search for Cash (also toggleable from the toolbar popup) · Off by default · Runs on the crimes page (search-for-cash section)

Highlights the best location to search. It reads each location's current odds, subtracts penalties, adds bonuses (e.g. cemetery is penalized during weekday working hours when groundskeepers are around, junkyards earn a weekend bonus), and draws a pulsing green outline plus a "Suggested" badge around the tile it recommends, so you pick the best location instead of the habitually-best one.

---

💻 **Cracking Helper**

Where to find it: Settings → Crimes → Cracking (also toggleable from the toolbar popup) · Off by default · Runs on the crimes page (cracking section)

A dictionary-assist for bank cracking. It shows which passwords remain plausible guesses for your current progress, filtering an internal million-password dictionary down to the ones that still fit the letters you've revealed — sorted by location and length so your next guesses are the most likely to hit.

---

🎭 **Scamming Helper**

Where to find it: Settings → Crimes → Scamming (also toggleable from the toolbar popup) · Off by default · Runs on the crimes page (scamming section)

Solves the mark's blind spots for you. It reads the current scamming board (mark, suspicion level, target level) and highlights the safest cells to play next, computing the probability of reaching the target level without detection based on the real displacement mechanics — strong/soft pull distances per concern level, merit-adjusted. Plays it safe by default; can be configured for grift-merit play.

---

🎪 **Hustling Helper**

Where to find it: Settings → Crimes → Hustling (toggleable from the toolbar popup) · Off by default · Runs on the crimes page (hustling section)

A live advisor panel for the Hustling street crime. It reads the visible audience (attention and suspicion gauges, hearts, bettors) and recommends the next action — gather, demo a game, hype, intentionally lose or win — with the reasoning shown in plain language ("The favorite-game audience is near maximum suspicion; finish with wins"). Tracks your shill/pickpocket collect timers, warns when an audience is getting bored or suspicious, tracks technique progress toward maxing each game, and has modes: Efficient, Technique, Money, Spam CS, and Snake Oil.

---

🦹 **Crime Outcome Customization**

Where to find it: Settings → Crimes → **Enable Crime Outcome Customization** (also toggleable from the toolbar popup) · Off by default · Runs on the crimes page

Choose how Torn's crime-result panel appears: **Hidden** removes the whole outcome panel, **Minimal** keeps the result but strips the flavor-text story, and **Toast** hides the panel and instead shows a small popup card in the corner with the result and reward. Optionally also hides the "X times in a row" chain text. Good for fast crime grinding where the story panel just slows you down.
