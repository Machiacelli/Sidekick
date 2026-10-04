# Sidekick Module Catalogue — Economy & Market

---

🛒 **Item Market Max Quantity**

Where to find it: Settings → Economy → Item Market Max Quantity (toggleable from the toolbar popup) · On by default · Runs on the item market

Click the money icon (...) in any buy-quantity field and it fills in the exact maximum quantity you can afford at that seller's price, based on the cash you have on hand. No more mental math or buying in weird increments when you meant to spend it all.

---

💲 **Price Filler**

Where to find it: Settings → Economy → Item Market Filler (toggleable from the toolbar popup) · Off by default · Runs on bazaar and item market pages

Auto-fills prices when listing items for sale. You pick a pricing source — Torn's market value, the current Item Market listings, or live bazaar prices (via weav3r.dev) — plus a margin offset (absolute $ or %) and which listing slot to base on (1 = cheapest). Then on the bazaar add/manage pages and item market, click a row's **Fill** button to instantly fill in the calculated price and quantity, with the price colored green or red vs market value. An ℹ button shows the live listings it used.
---

🏪 **Bazaar Filler**

Where to find it: Settings → Economy → Bazaar Filler (toggleable from the toolbar popup) · Off by default · Runs on your bazaar page

The bazaar management counterpart to Price Filler: adds checkboxes and fill buttons to the bazaar add/manage pages so you can price whole batches of bazaar stock in one pass using the same pricing rules, margins, and price-source settings.

---

🏦 **Quick Deposit**

Where to find it: Settings → Economy → Quick Deposit (toggleable from the toolbar popup) · Off by default · Runs on all Torn pages (sidebar)

Adds a **[DEPOSIT]** button inside the money display in Torn's sidebar. One click vaults everything you're carrying — to your faction vault, a property vault, a company vault, or a "ghost trade" — depending on which target you choose in Settings → Economy → Quick Deposit.

---

💰 **Bunker Bucks**

Where to find it: Settings → Economy → Bunker Bucks (toggleable from the toolbar popup) · Off by default · Runs on the item market

Shows the Bunker Buck value of weapons and armor right on market listings. Uses an accurate hard-coded table (Yellow/Orange/Red star ÷ by weapon class: pistol vs melee vs shotgun vs armor vs heavies) so you can compare bunker value against market sale price at a glance.

---

📊 **OC Weights**

Where to find it: Settings → Utility → OC Weights (toggleable from the toolbar popup) · On by default · Runs on the faction OC page

Shows each organized-crime slot's weight percentage (the chance each role has of being succesfull in the crime) directly under the role slots, so your faction can spread members.

---

📈 **Stock Advisor — see the Sidebar page.** (Sidebar module, listed there.)

---

💰 **Debt Tracker & Debt Receipt Sharing — Debt Tracker is a Sidebar module (listed there). Receipt Sharing details:**

Where to find it: no separate toggle — a Debt Tracker enhancement, works wherever Debt Tracker works

Adds shareable debt/loan receipts: each Debt Tracker entry gets a link ("Add to your Sidekick Debt Tracker") that the other player can click to import the same debt into their own tracker with the same terms and ID — no typos, no "I thought it was 5M" arguments. Receipts are verified against your player identity via the API (when an API key and the receiving side's Debt Tracker are present).
