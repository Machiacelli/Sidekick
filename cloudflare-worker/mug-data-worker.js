/**
 * Sidekick Mug Data — Cloudflare Worker
 *
 * POST /mug-data  { api_key, player_id, mug_merits, plunder_percent }
 *
 * KV Binding required in wrangler.toml:
 *   [[kv_namespaces]]
 *   binding = "RATE_LIMIT"
 *   id = "YOUR_KV_NAMESPACE_ID"
 *
 * Mug formula (Torn mechanics):
 *   base range: 5% – 10% of cash on hand
 *   each mug merit adds +1% to both ends (0–10 merits)
 *   plunder adds a flat % on top of both ends
 *   Clothing Store 7★: 25% reduction (×0.25) on both ends
 *
 * The formula gives a range rather than a fixed %, reflecting Torn's RNG.
 */

const CLOTHING_STORE_TYPE_ID = 5;      // Torn company_type for Clothing Store
const CLOTHING_STORE_MIN_STARS = 7;

const STATE_COLORS = {
  okay: "#22c55e",
  hospital: "#ef4444",
  jail: "#f59e0b",
  traveling: "#3b82f6",
  abroad: "#3b82f6",
  federal: "#dc2626",
};

function stateColor(state) {
  return STATE_COLORS[(state || "").toLowerCase()] || "#71717a";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export default {
  async fetch(request, env) {
    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      // ── Rate limiting (per IP, 5-second window) ─────────────────────────
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const rateKey = `rate:${ip}`;

      if (env.RATE_LIMIT) {
        const existing = await env.RATE_LIMIT.get(rateKey);
        if (existing) {
          return jsonResponse({ error: "Rate limit exceeded. Try again in a moment." }, 429);
        }
        await env.RATE_LIMIT.put(rateKey, "1", { expirationTtl: 5 });
      }

      // ── Parse body ───────────────────────────────────────────────────────
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const {
        api_key,
        player_id,
        mug_merits = 0,
        plunder_percent = 0,
        listing_total = 0,   // price × quantity from the market row (money_onhand is private)
      } = body;

      if (!api_key || !player_id) {
        return jsonResponse({ error: "Missing api_key or player_id" }, 400);
      }

      const merits = Math.min(Math.max(parseInt(mug_merits, 10) || 0, 0), 10);
      const plunder = parseFloat(plunder_percent) || 0;

      // ── Fetch profile + company in PARALLEL ─────────────────────────────
      // We can only determine the company ID after we have the profile,
      // so profile is fetched first, then company in a second step.
      // (Two sequential fetches, but both happen server-side = 1 round trip
      //  from the extension's perspective.)
      const profileUrl =
        `https://api.torn.com/user/${player_id}?selections=profile&key=${api_key}`;

      const profileResponse = await fetch(profileUrl, {
        headers: { "User-Agent": "Sidekick-MugWorker/2.0" },
      });

      if (!profileResponse.ok) {
        return jsonResponse({ error: `Torn API HTTP ${profileResponse.status}` }, 502);
      }

      const profileData = await profileResponse.json();

      if (profileData.error) {
        // Surface Torn API errors (e.g. invalid key, access denied)
        return jsonResponse(
          { error: `Torn API error ${profileData.error.code}: ${profileData.error.error}` },
          400,
        );
      }

      // Torn API v1 profile is at root level
      const profile = profileData;

      // ── Cash basis — use listing_total passed from the extension ————————————
      // money_onhand is a private field: the Torn API does not expose another
      // player's wallet balance to third-party callers. The listing total
      // (item price × quantity) is the practical cash basis — it's what the
      // seller is transacting and is directly relevant to effective item cost.
      const cashOnHand = Number(listing_total) || 0;

      // ── Extract player display data ──────────────────────────────────────
      const state = profile.status?.state || "Unknown";
      const statusUntil = profile.status?.until || 0;
      const statusDesc = profile.status?.description || state;
      const level = profile.level || 0;
      const lifeCur = profile.life?.current || 0;
      const lifeMax = profile.life?.maximum || 0;
      const revivable = profile.revivable || false;
      const lastAction = profile.last_action?.timestamp || 0;
      const factionName = profile.faction?.faction_name || null;
      const factionTag = profile.faction?.faction_tag || null;

      // ── Company lookup (optional, for clothing protection) ───────────────
      const companyId = profile.job?.company_id || null;
      let clothingProtection = false;
      let clothingNote = null;

      if (companyId) {
        try {
          const companyUrl =
            `https://api.torn.com/company/${companyId}?key=${api_key}`;

          const companyResponse = await fetch(companyUrl, {
            headers: { "User-Agent": "Sidekick-MugWorker/2.0" },
          });

          if (companyResponse.ok) {
            const companyData = await companyResponse.json();
            const company = companyData.company || companyData;

            if (!companyData.error) {
              // company_type is a number in Torn API v1 (5 = Clothing Store)
              const isClothing =
                company.company_type === CLOTHING_STORE_TYPE_ID ||
                String(company.company_type || "").toLowerCase().includes("clothing");

              const stars = Number(company.rating || company.stars || 0);

              if (isClothing && stars >= CLOTHING_STORE_MIN_STARS) {
                clothingProtection = true;
                clothingNote = `⚠️ Clothing Store ${stars}★ — 75% mug protection active`;
              }
            }
          }
        } catch {
          // Non-critical: ignore company lookup failures
        }
      }

      // ── Mug range calculation ────────────────────────────────────────────
      //
      // Actual Torn mechanics:
      //   Base steal: 5% of cash on hand, RNG up to 10% (lower values favoured)
      //   Masterful Looting (merits): multiplies the BASE by up to 50%
      //     → each merit = +5% to the multiplier (10 merits = ×1.5)
      //     → range becomes: (5%×mult) – (10%×mult)
      //     → 0 merits:  5% – 10%
      //     → 10 merits: 7.5% – 15%
      //   Plunder (weapon bonus): adds a flat 20–49% on top (additive)
      //     → 10 merits + 20% plunder: 27.5% – 35%
      //   Clothing Store 7★: 75% reduction on stolen amount (×0.25)
      //
      const meritMultiplier = 1 + (merits * 0.05);  // 0 merits=×1.0, 10 merits=×1.5
      const plunderBonus = plunder / 100;         // additive, not multiplicative

      let mugMinPct = (0.05 * meritMultiplier) + plunderBonus;
      let mugMaxPct = (0.10 * meritMultiplier) + plunderBonus;

      if (clothingProtection) {
        mugMinPct *= 0.25;  // 75% reduction
        mugMaxPct *= 0.25;
      }

      const mugMinValue = Math.floor(cashOnHand * mugMinPct);
      const mugMaxValue = Math.floor(cashOnHand * mugMaxPct);

      // ── Build response ───────────────────────────────────────────────────
      return jsonResponse({
        success: true,

        // Player display
        level,
        state,
        status_description: statusDesc,
        status_until: statusUntil,
        life_current: lifeCur,
        life_max: lifeMax,
        revivable,
        last_action_timestamp: lastAction,
        faction_name: factionName,
        faction_tag: factionTag,

        // Money
        cash_on_hand: cashOnHand,

        // Clothing
        clothing_protection: clothingProtection,
        clothing_note: clothingNote,

        // Mug range
        mug_min_pct: Number((mugMinPct * 100).toFixed(2)),
        mug_max_pct: Number((mugMaxPct * 100).toFixed(2)),
        mug_min_value: mugMinValue,
        mug_max_value: mugMaxValue,

        // Visual
        background_color: stateColor(state),
      });

    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};
