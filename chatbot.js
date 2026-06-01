/* ============================================================
   Elion Car Care — Wash Planner Chatbot
   ------------------------------------------------------------
   A guided, deterministic chat assistant that asks a few
   questions about the car, recommends the right package +
   add-ons, and hands off to SMS with a pre-filled message.

   Why deterministic (not an LLM)?
     - 100% reliable, no hallucinations, no API costs
     - No backend required (matches the static-site model)
     - Privacy-preserving (no data leaves the browser)
     - Easy to QA exhaustively

   The conversation is a directed graph. Each node is a
   "step" with prompt text, quick replies, optional free-text
   input, and a "next" function that decides the next step
   based on the user's answer.
   ============================================================ */

(function () {
  "use strict";

  const PHONE_HREF = "+16282520740";

  // ---- Pricing & rules (Elion Car Care, v9 tier model) ----
  // Basic = wash, Essential = wash + spray wax, Premium = full
  // correction + ceramic (quoted from $200). Add-ons are picked in the
  // Cal.com booking; interior is $5 less on Essential than Basic.
  const PRICES = {
    basic:     40,    // wheel rinse, contact wash, dry
    essential: 60,    // basic + spray wax
    premium:  200,    // full decon, clay, polish, ceramic — QUOTE, this is the floor
  };

  // Per-package interior price ($5 less on Essential to nudge the upgrade).
  // null = quoted (Premium).
  const INTERIOR_PRICE = { basic: 40, essential: 35, premium: null };

  const ADDONS = {
    interior:  { id: "interior", name: "Interior (vacuum + wipe + glass + vents)", price: 40, included: [] },
    headlight: { id: "headlight", name: "Headlight restoration",                  price: 30, included: [] },
    diablo:    { id: "diablo",   name: "Diablo wheel scrub",                      price: 10, included: ["premium"] },
    claybar:   { id: "claybar",  name: "Clay bar",                                price: 20, included: ["premium"] },
  };

  const PACKAGE_LABEL = {
    basic:     "Basic",
    essential: "Essential",
    premium:   "Premium",
  };

  const PACKAGE_TIME = {
    basic:     "about 45 minutes",
    essential: "about 1 hour",
    premium:   "about 4 hours",
  };

  const PACKAGE_DESC = {
    basic:     "hand wash",
    essential: "wash + spray wax",
    premium:   "full decon, clay bar, polish, and ceramic coat",
  };

  // Premium is a quote, not a flat price.
  const QUOTE_TIERS = { premium: true };

  // ---- First-time discount tracking ----
  const FIRSTTIME_KEY = "elion_firsttime_used";
  function isFirstTimeBrowser() {
    try { return !localStorage.getItem(FIRSTTIME_KEY); }
    catch { return true; }
  }
  function markFirstTimeUsed() {
    try { localStorage.setItem(FIRSTTIME_KEY, new Date().toISOString()); }
    catch {}
  }

  // ---- State ----
  // Bumped to v2 so existing sessions don't try to read the old
  // quickShine/drivewayDetail/fullReset state shape.
  const STATE_KEY = "elion_chat_v2";
  function loadState() {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      return defaultState();
    }
  }
  function saveState(state) {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }
  function clearState() {
    try { sessionStorage.removeItem(STATE_KEY); } catch (e) {}
  }
  function defaultState() {
    return {
      history: [],          // array of { role, text } for transcript
      currentStep: "intro",
      answers: {},          // collected answers keyed by step id
      complete: false,
    };
  }

  // ---- AI mode config ----
  const AI_ENDPOINT = "/api/chat";
  const AI_MAX_TURNS = 8;

  // ---- Conversation graph ----
  // Each step: { id, prompt(state) -> string|string[], options: [{label, value, next?}], input?: {placeholder, key, next}, skip?: state -> bool }
  const STEPS = {
    intro: {
      id: "intro",
      prompt: () => [
        "Hey! I'm Ellis's wash-planning assistant.",
        "Easiest way: snap a photo of your car or just tell me about it in plain English. I'll match you to the right wash.",
      ],
      options: [
        { label: "Snap or describe — smart mode", value: "ai", next: () => "ai" },
        { label: "Quick form instead", value: "guided", next: () => "carType" },
        { label: "Just show me prices", value: "skip", next: () => "skipToPrices" },
      ],
    },

    ai: {
      id: "ai",
      isAiMode: true,
      prompt: () => [
        "Cool. Drop a photo of your car (front + side is great) or just type — make, condition, what you want. I'll figure out the rest.",
        "Heads up: photos are sent to an AI to read the car (paint, headlights, etc.) and aren't stored. Ellis only sees the summary you send him by text.",
      ],
    },

    skipToPrices: {
      id: "skipToPrices",
      prompt: () => [
        "All good. Here's the lineup:",
        "• Basic — $40, about 45 min. Wheel rinse, contact wash, hand dry.",
        "• Essential — $60, about 1 hr. Basic + spray wax.",
        "• Premium — from $200, about 4 hrs. Full decon, clay bar, polish, ceramic coat. Quoted on your car.",
        "• Add-ons: Diablo wheel scrub $10 · Clay bar $20 · Interior $40 ($35 on Essential) · Headlights $30.",
        "• First-time customer: 25% off your first order.",
        "Burns Park is free travel. Greater Ann Arbor (48104/48103/48105) adds $5.",
      ],
      options: [
        { label: "Help me pick", value: "back", next: () => "carType" },
        { label: "Text Ellis now", value: "textnow", next: () => "doneTextNow" },
      ],
    },

    carType: {
      id: "carType",
      prompt: () => "What kind of car are we talking about?",
      options: [
        { label: "Sedan", value: "sedan" },
        { label: "SUV / Crossover", value: "suv" },
        { label: "Truck", value: "truck" },
        { label: "Minivan", value: "minivan" },
        { label: "Coupe / Sports", value: "coupe" },
        { label: "EV (Tesla, Rivian, etc.)", value: "ev" },
        { label: "Other", value: "other" },
      ],
      next: () => "carModel",
      saveTo: "carType",
    },

    carModel: {
      id: "carModel",
      prompt: () => "Year, make, and model? (Helps me plan — totally fine to skip.)",
      input: { placeholder: "e.g. 2019 Honda Pilot", key: "carModel" },
      options: [
        { label: "Skip", value: "skip", next: () => "carSize" },
      ],
      next: () => "carSize",
    },

    carSize: {
      id: "carSize",
      prompt: (s) => {
        const t = s.answers.carType;
        if (t === "truck")     return "What size truck?";
        if (t === "suv")       return "What size SUV?";
        if (t === "minivan")   return "Minivans are usually full-size — is that right?";
        return "About how big is it?";
      },
      options: (s) => {
        const t = s.answers.carType;
        if (t === "truck") {
          return [
            { label: "Mid-size (Ranger, Tacoma, Colorado)", value: "compact" },
            { label: "Full-size (F-150, Silverado, RAM 1500)", value: "midsize" },
            { label: "Heavy-duty (F-250+, 2500+, Suburban-class)", value: "fullsize" },
          ];
        }
        if (t === "suv") {
          return [
            { label: "Small (CR-V, RAV4, Forester)", value: "compact" },
            { label: "Mid-size (Pilot, Highlander, Explorer)", value: "midsize" },
            { label: "Large (Tahoe, Suburban, Expedition)", value: "fullsize" },
          ];
        }
        if (t === "minivan") {
          return [
            { label: "Yes, full-size minivan", value: "fullsize" },
            { label: "Actually it's smaller", value: "midsize" },
          ];
        }
        return [
          { label: "Compact (Civic, Mini, Golf, Tesla 3)", value: "compact" },
          { label: "Mid-size (Camry, Accord, Tesla Y)", value: "midsize" },
          { label: "Full-size (Charger, Maxima, S-Class)", value: "fullsize" },
        ];
      },
      next: () => "scope",
      saveTo: "carSize",
    },

    scope: {
      id: "scope",
      prompt: () => "What does the car need?",
      options: [
        { label: "Just the outside", value: "exterior" },
        { label: "Just the inside", value: "interior" },
        { label: "Both inside and out", value: "both" },
        { label: "Not sure — recommend something", value: "unsure" },
      ],
      next: (val) => {
        if (val === "exterior") return "exteriorCondition";
        return "interiorCondition"; // interior, both, unsure all start with interior
      },
      saveTo: "scope",
    },

    interiorCondition: {
      id: "interiorCondition",
      prompt: () => "How's the inside looking right now?",
      options: [
        { label: "Pretty clean — just a refresh", value: "clean" },
        { label: "Normal daily-driver dirty", value: "normal" },
        { label: "Rough — kids, dog, winter", value: "rough" },
        { label: "Disaster zone — pull out all the stops", value: "disaster" },
      ],
      next: () => "petHair",
      saveTo: "interiorCondition",
      skip: (s) => s.answers.scope === "exterior",
    },

    petHair: {
      id: "petHair",
      prompt: () => "Any pet hair in the car?",
      options: [
        { label: "None", value: "none" },
        { label: "A little", value: "some" },
        { label: "Lots — the dog rides back there", value: "lots" },
      ],
      next: () => "stains",
      saveTo: "petHair",
      skip: (s) => s.answers.scope === "exterior",
    },

    stains: {
      id: "stains",
      prompt: () => "Any stains on the seats or carpet?",
      options: [
        { label: "None I can see", value: "none" },
        { label: "Light — recent spills", value: "light" },
        { label: "Heavy — old or set-in", value: "heavy" },
      ],
      next: () => "seats",
      saveTo: "stains",
      skip: (s) => s.answers.scope === "exterior",
    },

    seats: {
      id: "seats",
      prompt: () => "What are the seats?",
      options: [
        { label: "Cloth", value: "cloth" },
        { label: "Leather", value: "leather" },
        { label: "Mix (front leather, back cloth, etc.)", value: "mix" },
        { label: "Not sure", value: "unknown" },
      ],
      next: (val, s) => {
        if (s.answers.scope === "interior") return "timing";
        return "exteriorCondition";
      },
      saveTo: "seats",
      skip: (s) => s.answers.scope === "exterior",
    },

    exteriorCondition: {
      id: "exteriorCondition",
      prompt: () => "How's the paint looking?",
      options: [
        { label: "Looks great — just want it washed", value: "clean" },
        { label: "Some swirls or water spots", value: "swirls" },
        { label: "Dull, scratched, needs love", value: "dull" },
        { label: "Tree sap / bird droppings / road tar", value: "contaminants" },
      ],
      next: () => "wax",
      saveTo: "exteriorCondition",
      skip: (s) => s.answers.scope === "interior",
    },

    wax: {
      id: "wax",
      prompt: () => "Want wax or ceramic spray for protection?",
      options: [
        { label: "Yes — make it shine", value: "yes" },
        { label: "No thanks", value: "no" },
        { label: "What's the difference?", value: "explain" },
      ],
      next: (val) => val === "explain" ? "waxExplain" : "headlights",
      saveTo: "wax",
      skip: (s) => s.answers.scope === "interior",
    },

    waxExplain: {
      id: "waxExplain",
      prompt: () => [
        "Quick rundown:",
        "• Spray wax — slicker finish, more gloss, a few weeks of protection. Included in Essential.",
        "• Ceramic coat — the durable, months-long protection. That's the Premium package.",
      ],
      options: [
        { label: "Add wax/sealant — yes", value: "yes", next: () => "headlights" },
        { label: "Not this time", value: "no", next: () => "headlights" },
      ],
      saveTo: "wax",
    },

    headlights: {
      id: "headlights",
      prompt: () => "Headlights — yellow, foggy, or glazed-looking?",
      options: [
        { label: "Crystal clear", value: "clear" },
        { label: "Slightly hazy", value: "hazy" },
        { label: "Yellow/foggy — needs restoration", value: "foggy" },
        { label: "Not sure", value: "unknown" },
      ],
      next: () => "timing",
      saveTo: "headlights",
      skip: (s) => s.answers.scope === "interior",
    },

    timing: {
      id: "timing",
      prompt: () => "When are you hoping to get this done?",
      options: [
        { label: "This week", value: "thisweek" },
        { label: "This weekend", value: "weekend" },
        { label: "Next week", value: "nextweek" },
        { label: "Flexible — whenever Ellis can", value: "flexible" },
      ],
      next: () => "location",
      saveTo: "timing",
    },

    location: {
      id: "location",
      prompt: () => "Where's the car? (Burns Park is free, Greater Ann Arbor adds $5.)",
      options: [
        { label: "Burns Park", value: "burns" },
        { label: "Ann Arbor (48104 / 48103 / 48105)", value: "annarbor" },
        { label: "Somewhere else nearby", value: "nearby" },
      ],
      next: () => "notes",
      saveTo: "location",
    },

    notes: {
      id: "notes",
      prompt: () => "Anything else Ellis should know? (Optional.)",
      input: { placeholder: "e.g. coffee spill on driver seat, hatch needs special care…", key: "notes" },
      options: [
        { label: "Nope, that's it — show me the plan", value: "skip", next: () => "recommend" },
      ],
      next: () => "recommend",
    },

    recommend: {
      id: "recommend",
      prompt: (s) => buildRecommendationMessage(s),
      // options injected dynamically by render
      isRecommendation: true,
    },

    doneTextNow: {
      id: "doneTextNow",
      prompt: () => "Opening a text to Ellis…",
      isTerminal: true,
      onEnter: () => openSms("Hi Ellis, can you help me plan a wash? I came in through the site."),
    },
  };

  // ---- Recommendation engine (Elion v8) ----
  // Tier choice is PAINT-driven. Interior is an independent add-on.
  // a = answers; pkgOverride = optional package id to force (alt screen).
  function recommend(a, pkgOverride) {
    const scope = a.scope || "both";
    const wantsInterior = scope === "interior" || scope === "both" || scope === "unsure" || !!a._addInterior;

    // Paint signals (gated by whether exterior is in scope at all)
    const exteriorInScope = scope !== "interior";
    const wantsSeal    = exteriorInScope && a.wax === "yes";           // "wax" field == wants protection
    const dullPaint    = exteriorInScope && a.exteriorCondition === "dull";
    const swirls       = exteriorInScope && a.exteriorCondition === "swirls";
    const contaminants = exteriorInScope && a.exteriorCondition === "contaminants";
    const foggyHL      = exteriorInScope && a.headlights === "foggy";

    // Interior signals (only meaningful if interior is in scope)
    const heavyStains  = wantsInterior && a.stains === "heavy";
    const lotsPetHair  = wantsInterior && a.petHair === "lots";
    const disasterInt  = wantsInterior && a.interiorCondition === "disaster";

    // ---- Tier selection (paint-focused) ----
    // basic     → just wash (default when nothing exterior-y is going on)
    // essential → wash + spray wax (default when user wants gloss/protection
    //             OR has minor swirls/water spots a fresh wax helps hide)
    // premium   → full decon + machine polish + ceramic coat (required for
    //             dull paint or bonded contaminants; correction territory)
    let pkg = "basic";
    if (dullPaint || contaminants) {
      pkg = "premium";  // needs the cut + polish (and clay)
    } else if (wantsSeal || swirls) {
      pkg = "essential";  // seal protects, minor swirls hide under it
    }

    // Honor explicit user override (alt-screen "Switch to X" button)
    if (pkgOverride && PRICES[pkgOverride]) pkg = pkgOverride;

    // ---- Add-ons ----
    const addons = [];
    const reasons = [];
    const isQuote = !!QUOTE_TIERS[pkg];

    // Interior — price varies by package ($5 less on Essential). On Premium
    // it's quoted, not flat-priced.
    if (wantsInterior) {
      const intPrice = INTERIOR_PRICE[pkg];
      if (intPrice == null) {
        addons.push({ id: "interior", name: "Interior (quoted)", price: 0, quoted: true });
      } else {
        addons.push({ id: "interior", name: ADDONS.interior.name, price: intPrice });
      }
      if (scope === "interior") reasons.push("Interior is the focus.");
      if (pkg === "essential") reasons.push("Interior is $5 less on Essential than Basic.");
    }

    // Headlight restoration — independent of tier
    if (foggyHL) {
      addons.push({ ...ADDONS.headlight });
      reasons.push("Foggy headlights — added the $30 restoration pass.");
    }

    // Clay bar — when paint has bonded contaminants and the tier doesn't
    // already include it (Premium clays everything).
    if (contaminants && pkg !== "premium") {
      addons.push({ ...ADDONS.claybar });
      reasons.push("Bonded contaminants in the paint — a clay bar (+$20) pulls them out before sealing.");
    }

    // Deep interior signals — no flat upcharge; Ellis quotes these.
    if (wantsInterior && (lotsPetHair || heavyStains || disasterInt)) {
      reasons.push("Heavy pet hair, stains, or a rough interior means a deep interior, which Ellis quotes on top.");
    }

    // ---- Size note (timing only, no upcharge) ----
    let sizeNote = "";
    if (a.carSize === "fullsize") {
      if (pkg === "basic") sizeNote = " (allow about an hour for full-size)";
      else if (pkg === "essential") sizeNote = " (about 1.5 hours on a full-size)";
      else if (pkg === "premium") sizeNote = " (about 4.5–5 hours on a full-size)";
    }

    // ---- Pricing ----
    const base = PRICES[pkg];
    const addonTotal = addons.reduce((sum, ad) => sum + (ad.price || 0), 0);
    const travel = a.location === "annarbor" ? 5 : 0;
    const travelNote = a.location === "annarbor"
      ? " (+$5 travel)"
      : (a.location === "nearby" ? " (Ellis will confirm travel after you book)" : "");

    // No bundle discount in the v9 model — the interior incentive is baked
    // into the lower Essential interior price. Kept as 0 so downstream
    // display guards (which check > 0) simply never fire.
    const bundleApplied = false;
    const bundleDiscount = 0;

    // First-time customer discount — % off the subtotal. Tracked in
    // localStorage; once a customer confirms an order, they don't see this
    // again. Configurable via CONFIG.firstTimeDiscount; default 25%.
    const firstTimeRate = (window.CONFIG && Number(window.CONFIG.firstTimeDiscount)) || 0;
    const isFirstTime = firstTimeRate > 0 && isFirstTimeBrowser();
    const preFirstTimeTotal = base + addonTotal + travel - bundleDiscount;
    const firstTimeDiscount = isFirstTime ? Math.round(preFirstTimeTotal * firstTimeRate) : 0;
    const total = preFirstTimeTotal - firstTimeDiscount;

    // ---- Interior-add upsell (only when exterior-only and not already added) ----
    let bundleOffer = null;
    if (!wantsInterior) {
      const intCost = INTERIOR_PRICE[pkg]; // null on Premium (quoted)
      bundleOffer = {
        addonId: "interior",
        addonName: ADDONS.interior.name,
        addonCost: intCost,
        effectiveCost: intCost,
        savings: 0,
        quoted: intCost == null,
      };
    }

    let scopeNote = "";
    if (scope === "interior") {
      scopeNote = "Interior-focused job — exterior gets a courtesy wipe-down but no full wash unless you add a tier.";
    }

    return {
      pkg,
      pkgLabel: PACKAGE_LABEL[pkg],
      pkgDesc: PACKAGE_DESC[pkg],
      pkgTime: PACKAGE_TIME[pkg] + sizeNote,
      base,
      isQuote,
      addons,
      addonTotal,
      travel,
      travelNote,
      bundleApplied,
      bundleDiscount,
      bundleOffer,
      isFirstTime,
      firstTimeDiscount,
      firstTimeRatePct: Math.round(firstTimeRate * 100),
      preFirstTimeTotal,
      total,
      reasons,
      scopeNote,
      wantsInterior,
    };
  }

  function buildRecommendationMessage(state) {
    const rec = recommend(state.answers);
    state.recommendation = rec;
    saveState(state);

    const lines = [];
    const baseLabel = rec.isQuote ? `from $${rec.base} (quoted)` : `$${rec.base}`;
    lines.push(`Based on your answers, I'd recommend **${rec.pkgLabel}** (${rec.pkgDesc}) — ${baseLabel}.`);
    lines.push(`Time: ${rec.pkgTime}.`);
    if (rec.scopeNote) lines.push(rec.scopeNote);

    if (rec.addons.length) {
      lines.push("");
      lines.push("Add-ons I'd include:");
      rec.addons.forEach(a => {
        lines.push(`• ${a.name} — ${a.quoted ? "quoted" : (a.price ? `$${a.price}` : "quoted")}`);
      });
    }

    if (rec.travel > 0) {
      lines.push("");
      lines.push(`Travel: +$${rec.travel} for Greater Ann Arbor.`);
    } else if (rec.travelNote) {
      lines.push("");
      lines.push(rec.travelNote.trim());
    }

    if (rec.reasons.length) {
      lines.push("");
      lines.push("Why:");
      rec.reasons.forEach(r => lines.push(`• ${r}`));
    }

    if (rec.bundleApplied && rec.bundleDiscount > 0) {
      lines.push("");
      lines.push(`Bundle discount: **−$${rec.bundleDiscount}** (interior + tier together)`);
    }

    if (rec.isFirstTime && rec.firstTimeDiscount > 0) {
      lines.push("");
      lines.push(`First-time customer: **${rec.firstTimeRatePct}% off** (−$${rec.firstTimeDiscount}) — applied once per browser.`);
    }

    lines.push("");
    if (rec.isQuote) {
      lines.push(`Estimated total: **from $${rec.total}** — Premium is quoted on your car, so Ellis confirms the final number.`);
    } else {
      lines.push(`Estimated total: **$${rec.total}**`);
    }
    lines.push("");

    if (rec.bundleOffer) {
      // Exterior-only path — pitch the interior add-on
      const off = rec.bundleOffer;
      if (off.quoted) {
        lines.push("Want the inside too? Interior on Premium is quoted with the rest of the job. Tap the button below to add it.");
      } else {
        lines.push(`Want the inside too? Add interior for **+$${off.effectiveCost}**. Tap the button below.`);
      }
      lines.push("");
    }

    lines.push("Sound good? Book your time on the calendar, or tap below to text the plan to Ellis.");

    return lines;
  }

  // ---- SMS composer ----
  function buildSmsBody(state) {
    const a = state.answers;
    const rec = state.recommendation || recommend(a);

    const carDescParts = [];
    if (a.carModel) carDescParts.push(a.carModel);
    if (a.carType && !a.carModel) carDescParts.push(prettyCarType(a.carType));
    if (a.carSize) carDescParts.push(`(${prettySize(a.carSize, a.carType)})`);
    const carDesc = carDescParts.join(" ") || "—";

    const lines = [];
    lines.push("Hi Ellis! I planned a wash on your site.");
    lines.push("");
    lines.push(`Car: ${carDesc}`);
    lines.push(`What I need: ${prettyScope(a.scope)}`);

    if (rec.wantsInterior) {
      const intParts = [];
      if (a.interiorCondition) intParts.push(prettyInteriorCondition(a.interiorCondition));
      if (a.petHair && a.petHair !== "none") intParts.push(`${prettyPetHair(a.petHair)} pet hair`);
      if (a.stains && a.stains !== "none") intParts.push(`${prettyStains(a.stains)} stains`);
      if (a.seats) intParts.push(`${prettySeats(a.seats)} seats`);
      if (intParts.length) lines.push(`Interior: ${intParts.join(", ")}`);
    }

    if (a.scope !== "interior") {
      const extParts = [];
      if (a.exteriorCondition) extParts.push(prettyExteriorCondition(a.exteriorCondition));
      if (a.wax === "yes") extParts.push("wants wax/protection");
      if (a.headlights && a.headlights !== "clear") extParts.push(`headlights: ${prettyHeadlights(a.headlights)}`);
      if (extParts.length) lines.push(`Exterior: ${extParts.join(", ")}`);
    }

    lines.push(`Timing: ${prettyTiming(a.timing)}`);
    lines.push(`Location: ${prettyLocation(a.location)}`);

    if (a.notes) {
      lines.push("");
      lines.push(`Notes: ${a.notes}`);
    }

    lines.push("");
    lines.push(`Recommended: ${rec.pkgLabel} (${rec.pkgDesc}) — ${rec.isQuote ? `from $${rec.base} (quoted)` : `$${rec.base}`}`);
    if (rec.addons.length) {
      rec.addons.forEach(ad => {
        lines.push(`+ ${ad.name}${ad.quoted ? " (quoted)" : (ad.price ? ` ($${ad.price})` : "")}`);
      });
    }
    if (rec.travel > 0) lines.push(`+ Travel ($${rec.travel})`);
    if (rec.isFirstTime && rec.firstTimeDiscount > 0) {
      lines.push(`- First-time customer ${rec.firstTimeRatePct}% off (-$${rec.firstTimeDiscount})`);
    }
    lines.push(`Estimated total: ${rec.isQuote ? `from $${rec.total}` : `$${rec.total}`}`);
    lines.push("");
    lines.push("Address: I'll share over text. Thanks!");

    return lines.join("\n");
  }

  function prettyCarType(t) {
    return ({
      sedan: "Sedan", suv: "SUV", truck: "Truck", minivan: "Minivan",
      coupe: "Coupe", ev: "EV", other: "Vehicle",
    })[t] || "Vehicle";
  }
  function prettySize(s, t) {
    if (s === "compact") return "compact";
    if (s === "midsize") return "mid-size";
    if (s === "fullsize") return t === "truck" ? "heavy-duty" : "full-size";
    return s;
  }
  function prettyScope(s) {
    return ({ exterior: "Exterior only", interior: "Interior focus", both: "Inside and out", unsure: "Both — open to Ellis's call" })[s] || "—";
  }
  function prettyInteriorCondition(c) {
    return ({ clean: "pretty clean", normal: "normal daily-driver", rough: "rough", disaster: "disaster zone" })[c] || c;
  }
  function prettyPetHair(p) {
    return ({ none: "no", some: "some", lots: "lots of" })[p] || p;
  }
  function prettyStains(s) {
    return ({ none: "no", light: "light", heavy: "heavy" })[s] || s;
  }
  function prettySeats(s) {
    return ({ cloth: "cloth", leather: "leather", mix: "mixed", unknown: "unsure on" })[s] || s;
  }
  function prettyExteriorCondition(c) {
    return ({ clean: "paint looks good", swirls: "some swirls/water spots", dull: "dull/scratched", contaminants: "tree sap or bird drops" })[c] || c;
  }
  function prettyHeadlights(h) {
    return ({ clear: "clear", hazy: "slightly hazy", foggy: "yellow/foggy", unknown: "not sure" })[h] || h;
  }
  function prettyTiming(t) {
    return ({ thisweek: "This week", weekend: "This weekend", nextweek: "Next week", flexible: "Flexible" })[t] || t || "—";
  }
  function prettyLocation(l) {
    return ({ burns: "Burns Park", annarbor: "Greater Ann Arbor (48104/03/05)", nearby: "Nearby — please confirm travel" })[l] || l || "—";
  }

  function openSms(prefill) {
    // SMS deep link with body (works on iOS + Android; falls back gracefully on desktop)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const sep = isIOS ? "&" : "?";
    const url = `sms:${PHONE_HREF}${sep}body=${encodeURIComponent(prefill)}`;
    // Use anchor click for iOS reliability
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.setAttribute("aria-hidden", "true");
    a.style.position = "fixed";
    a.style.left = "-9999px";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 300);
  }

  // Cal.com booking URL for a recommended package. Mirrors config.js.
  function calUrlForPkg(pkg) {
    const cfg = window.CONFIG || {};
    const base = cfg.calBaseUrl || "https://cal.com/elion";
    const slug = (cfg.calEventBySlug && cfg.calEventBySlug[pkg]) || pkg || "essential";
    return `${base}/${slug}`;
  }

  // ---- Rendering ----
  let root, panel, log, controls, fab, openedOnce = false, isOpen = false, state;

  function buildShell() {
    // FAB
    fab = document.createElement("button");
    fab.className = "chat-fab";
    fab.type = "button";
    fab.setAttribute("aria-label", "Chat to plan your wash");
    fab.setAttribute("aria-expanded", "false");
    fab.setAttribute("aria-controls", "chat-panel");
    fab.innerHTML = `
      <span class="chat-fab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
      </span>
      <span class="chat-fab-label">Plan your wash</span>
    `;
    fab.addEventListener("click", openChat);

    // Panel
    panel = document.createElement("aside");
    panel.id = "chat-panel";
    panel.className = "chat-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "chat-title");
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `
      <header class="chat-head">
        <div class="chat-head-id">
          <span class="chat-avatar" aria-hidden="true">E</span>
          <div>
            <p id="chat-title" class="chat-title">Wash Planner</p>
            <p class="chat-sub">Built by Ellis · Burns Park</p>
          </div>
        </div>
        <div class="chat-head-actions">
          <button class="chat-restart" type="button" aria-label="Start over">Restart</button>
          <button class="chat-close" type="button" aria-label="Close chat">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>
      <div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-atomic="false"></div>
      <div class="chat-controls" id="chat-controls"></div>
    `;
    log = panel.querySelector("#chat-log");
    controls = panel.querySelector("#chat-controls");

    panel.querySelector(".chat-close").addEventListener("click", closeChat);
    panel.querySelector(".chat-restart").addEventListener("click", restartChat);

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    // Keyboard support
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) closeChat();
    });
  }

  function openChat() {
    isOpen = true;
    panel.setAttribute("aria-hidden", "false");
    panel.classList.add("is-open");
    fab.setAttribute("aria-expanded", "true");
    fab.classList.add("is-hidden");
    document.body.classList.add("chat-open");

    if (!openedOnce) {
      openedOnce = true;
      // If a renderStep already populated the log (e.g. restart was called pre-open), don't double-render
      if (log.querySelectorAll(".msg").length === 0) {
        renderStep(state.currentStep || "intro");
      }
    }
    // Move focus into the chat for accessibility
    setTimeout(() => {
      const firstBtn = controls.querySelector("button");
      if (firstBtn) firstBtn.focus();
    }, 50);
  }

  function closeChat() {
    isOpen = false;
    // Move focus out of the panel BEFORE marking it hidden (a11y: never aria-hidden a focused element)
    fab.classList.remove("is-hidden");
    fab.focus();
    panel.setAttribute("aria-hidden", "true");
    panel.classList.remove("is-open");
    fab.setAttribute("aria-expanded", "false");
    document.body.classList.remove("chat-open");
  }

  function restartChat() {
    clearState();
    state = defaultState();
    aiHistory = [];
    aiPendingImage = null;
    aiTurnCount = 0;
    aiPending = false;
    log.innerHTML = "";
    controls.innerHTML = "";
    renderStep("intro");
  }

  function renderStep(stepId) {
    let step = STEPS[stepId];
    while (step && step.skip && step.skip(state)) {
      // Skip this step, advance via its "next"
      const next = typeof step.next === "function" ? step.next(null, state) : step.next;
      stepId = next || stepId;
      step = STEPS[stepId];
    }
    if (!step) return;
    state.currentStep = stepId;
    saveState(state);

    if (step.onEnter) step.onEnter(state);

    const promptVal = typeof step.prompt === "function" ? step.prompt(state) : step.prompt;
    const lines = Array.isArray(promptVal) ? promptVal : [promptVal];

    // Render bot bubble (or multiple)
    appendBotMessage(lines);

    // Build controls
    controls.innerHTML = "";

    if (step.isRecommendation) {
      const rec = state.recommendation;

      // Interior-add button — shown when the recommendation doesn't yet include interior
      if (rec && rec.bundleOffer) {
        const offer = rec.bundleOffer;
        const labelSavings = offer.savings > 0 ? `, save $${offer.savings}` : "";
        const bundleBtn = makeButton(
          `Add interior (+$${offer.effectiveCost}${labelSavings})`,
          "is-primary",
          () => {
            state.answers._addInterior = true;
            // Flip scope so the engine knows interior is in play
            if (!state.answers.scope || state.answers.scope === "exterior") {
              state.answers.scope = "both";
            }
            // Safe defaults so engine doesn't over-trigger
            if (!state.answers.interiorCondition) state.answers.interiorCondition = "normal";
            if (!state.answers.petHair) state.answers.petHair = "none";
            if (!state.answers.stains) state.answers.stains = "none";
            saveState(state);
            appendUserMessage("Add interior detail");
            renderStep("recommend");
          }
        );
        controls.appendChild(bundleBtn);
      }

      const bookBtn = makeButton(`Book ${rec.pkgLabel} on the calendar`, "is-primary", () => {
        const url = calUrlForPkg(rec.pkg);
        window.open(url, "_blank", "noopener");
        appendUserMessage(`Opened the calendar for ${rec.pkgLabel} ✓`);
        renderTerminal();
      });
      const sendBtn = makeButton("Or text the plan to Ellis", "is-ghost", () => {
        const body = buildSmsBody(state);
        openSms(body);
        appendUserMessage("Sent the plan to Ellis ✓");
        renderTerminal();
      });
      const altBtn = makeButton("See another option", "is-ghost", () => {
        appendUserMessage("Show another option");
        renderAlternative();
      });
      const restartBtn = makeButton("Start over", "is-ghost is-small", () => restartChat());
      controls.appendChild(bookBtn);
      controls.appendChild(sendBtn);
      controls.appendChild(altBtn);
      controls.appendChild(restartBtn);
      return;
    }

    if (step.isTerminal) {
      const closeBtn = makeButton("Close", "is-primary", () => closeChat());
      const restartBtn = makeButton("Start over", "is-ghost", () => restartChat());
      controls.appendChild(closeBtn);
      controls.appendChild(restartBtn);
      return;
    }

    if (step.isAiMode) {
      renderAiControls();
      return;
    }

    // Quick replies
    const options = typeof step.options === "function" ? step.options(state) : (step.options || []);
    options.forEach(opt => {
      const btn = makeButton(opt.label, "", () => {
        // Save answer
        if (step.saveTo) state.answers[step.saveTo] = opt.value;
        appendUserMessage(opt.label);
        saveState(state);

        // Decide next
        let nextId;
        if (opt.next) nextId = opt.next(opt.value, state);
        else if (step.next) nextId = typeof step.next === "function" ? step.next(opt.value, state) : step.next;

        if (nextId) renderStep(nextId);
      });
      controls.appendChild(btn);
    });

    // Free-text input
    if (step.input) {
      const wrap = document.createElement("form");
      wrap.className = "chat-input-form";
      wrap.addEventListener("submit", (e) => {
        e.preventDefault();
        const val = (input.value || "").trim();
        if (!val && !step.allowEmpty) return;
        state.answers[step.input.key] = val;
        appendUserMessage(val || "(skipped)");
        saveState(state);
        const nextId = typeof step.next === "function" ? step.next(val, state) : step.next;
        if (nextId) renderStep(nextId);
      });
      const input = document.createElement("input");
      input.type = "text";
      input.className = "chat-input";
      input.placeholder = step.input.placeholder || "Type here…";
      input.setAttribute("aria-label", step.input.placeholder || "Your answer");
      input.maxLength = 240;
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.className = "chat-input-send";
      submit.setAttribute("aria-label", "Send");
      submit.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      `;
      wrap.appendChild(input);
      wrap.appendChild(submit);
      controls.appendChild(wrap);
    }
  }

  function renderAlternative() {
    // Walk the tier ladder (basic → essential → premium, or premium → essential → basic)
    const rec = state.recommendation;
    let altPkg;
    if (rec.pkg === "basic") altPkg = "essential";
    else if (rec.pkg === "essential") altPkg = "premium";
    else altPkg = "essential";

    const altBase = PRICES[altPkg];
    const altTime = PACKAGE_TIME[altPkg];
    const altDesc = PACKAGE_DESC[altPkg];
    const altPriceLabel = QUOTE_TIERS[altPkg] ? `from $${altBase} (quoted)` : `$${altBase}`;
    const lines = [
      `Here's another option:`,
      `**${PACKAGE_LABEL[altPkg]}** (${altDesc}) — ${altPriceLabel}, ${altTime}.`,
      altPkg === "premium"
        ? "Premium is the full job: Diablo wheels, clay bar, machine polish, and a ceramic coat. The right call for dull or swirled paint. Quoted on your car."
        : altPkg === "essential"
          ? "Essential is the Basic wash finished with spray wax — more gloss and a few weeks of protection."
          : "Basic is a thorough hand wash, wheels to dry. Quick and clean.",
      "Want this one instead, or stick with the original?",
    ];
    appendBotMessage(lines);

    controls.innerHTML = "";
    const switchBtn = makeButton(`Switch to ${PACKAGE_LABEL[altPkg]}`, "is-primary", () => {
      state.answers._packageOverride = altPkg;
      // Re-run recommendation with the explicit package — re-derives correct add-ons for that tier
      state.recommendation = recommend(state.answers, altPkg);
      appendUserMessage(`Switch to ${PACKAGE_LABEL[altPkg]}`);
      const r = state.recommendation;
      const baseLabel = r.isQuote ? `from $${r.base} (quoted)` : `$${r.base}`;
      const summary = [`Switched to **${r.pkgLabel}** — ${baseLabel}.`];
      if (r.addons.length) {
        summary.push("Add-ons that still apply:");
        r.addons.forEach(a => summary.push(`• ${a.name} — ${a.quoted ? "quoted" : (a.price ? `$${a.price}` : "quoted")}`));
      }
      if (r.travel > 0) summary.push(`Travel: +$${r.travel}`);
      if (r.isFirstTime && r.firstTimeDiscount > 0) summary.push(`First-time ${r.firstTimeRatePct}% off: −$${r.firstTimeDiscount}`);
      summary.push(r.isQuote ? `Estimated total: **from $${r.total}** (Ellis quotes Premium)` : `Estimated total: **$${r.total}**`);
      appendBotMessage(summary);
      const bookBtn = makeButton(`Book ${r.pkgLabel} on the calendar`, "is-primary", () => {
        window.open(calUrlForPkg(r.pkg), "_blank", "noopener");
        appendUserMessage(`Opened the calendar for ${r.pkgLabel} ✓`);
        renderTerminal();
      });
      const sendBtn = makeButton("Or text the plan to Ellis", "is-ghost", () => {
        const body = buildSmsBody(state);
        openSms(body);
        appendUserMessage("Sent the plan to Ellis ✓");
        renderTerminal();
      });
      controls.innerHTML = "";
      controls.appendChild(bookBtn);
      controls.appendChild(sendBtn);
      controls.appendChild(makeButton("Start over", "is-ghost", () => restartChat()));
    });
    const keepBtn = makeButton("Keep original", "is-ghost", () => {
      appendUserMessage("Keep original");
      renderStep("recommend");
    });
    controls.appendChild(switchBtn);
    controls.appendChild(keepBtn);
  }

  function renderTerminal() {
    controls.innerHTML = "";
    appendBotMessage(["You're set. If for any reason the text app didn't open, just call or text Ellis at (628) 252-0740. He marks orders done in his app, and you'll get a confirmation."]);
    // Mark the first-time discount used — they've completed a booking
    markFirstTimeUsed();
    controls.appendChild(makeButton("Close", "is-primary", () => closeChat()));
    controls.appendChild(makeButton("Plan another car", "is-ghost", () => restartChat()));
  }

  // ============================================================
  //  AI mode — Claude Haiku 4.5 (vision) via /api/chat
  // ============================================================
  let aiHistory = [];          // [{ role:"user"|"assistant", content: string }]
  let aiPendingImage = null;   // { mediaType, data, dataUrl, filename }
  let aiTurnCount = 0;
  let aiPending = false;

  function renderAiControls(quickReplies) {
    controls.innerHTML = "";

    // Quick reply buttons from server (or none)
    (quickReplies || []).forEach(label => {
      const b = makeButton(label, "", () => sendAiMessage(label));
      controls.appendChild(b);
    });

    // Always render: free-text input + photo button
    const form = document.createElement("form");
    form.className = "chat-input-form ai-form";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = (input.value || "").trim();
      if (!val && !aiPendingImage) return;
      input.value = "";
      sendAiMessage(val);
    });

    // Photo button (acts as label for hidden file input)
    const photoBtn = document.createElement("label");
    photoBtn.className = "chat-photo-btn";
    photoBtn.setAttribute("aria-label", "Add a photo of your car");
    photoBtn.title = "Add a photo";
    photoBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
    `;
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp,image/heic,image/heif";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      await attachPhoto(file);
      fileInput.value = "";
    });
    photoBtn.appendChild(fileInput);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "chat-input";
    input.placeholder = aiPendingImage ? "Add a note about the photo (optional)…" : "Tell me about your car, or add a photo…";
    input.setAttribute("aria-label", "Your message");
    input.maxLength = 600;
    input.disabled = aiPending;

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "chat-input-send";
    submit.setAttribute("aria-label", "Send");
    submit.disabled = aiPending;
    submit.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    `;

    form.appendChild(photoBtn);
    form.appendChild(input);
    form.appendChild(submit);
    controls.appendChild(form);

    // Show pending photo thumbnail above the input
    if (aiPendingImage) {
      const chip = document.createElement("div");
      chip.className = "chat-photo-chip";
      chip.innerHTML = `
        <img src="${aiPendingImage.dataUrl}" alt="Attached photo of your car" />
        <span class="chat-photo-chip-name">${escapeHtml(aiPendingImage.filename || "photo")}</span>
        <button type="button" class="chat-photo-chip-remove" aria-label="Remove photo">×</button>
      `;
      chip.querySelector(".chat-photo-chip-remove").addEventListener("click", () => {
        aiPendingImage = null;
        renderAiControls(quickReplies);
      });
      controls.insertBefore(chip, form);
    }

    // Bottom-line escape: switch to guided form
    const escape = document.createElement("button");
    escape.type = "button";
    escape.className = "chat-mode-switch";
    escape.textContent = "Switch to quick form";
    escape.addEventListener("click", () => {
      appendUserMessage("Switch to quick form");
      renderStep("carType");
    });
    controls.appendChild(escape);

    // Focus the input for fast typing
    setTimeout(() => { if (!aiPending) input.focus(); }, 30);
  }

  async function attachPhoto(file) {
    if (file.size > 12 * 1024 * 1024) {
      appendBotMessage(["That photo is huge. Anything under 12MB works — try shrinking it or use a smaller one."]);
      return;
    }
    try {
      const processed = await compressImage(file);
      aiPendingImage = processed;
      appendBotMessage(["Got the photo. Add a note if you want, or just hit send."]);
      renderAiControls();
    } catch (e) {
      appendBotMessage(["Couldn't read that photo. Try another, or just type a description."]);
    }
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        // Cap longest side at 1200px, JPEG quality 0.82, target ~400-700KB
        const MAX = 1200;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) { reject(new Error("encode")); return; }
        resolve({
          mediaType: m[1],
          data: m[2],
          dataUrl,
          filename: file.name,
          byteSize: m[2].length,
        });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }

  async function sendAiMessage(userText) {
    if (aiPending) return;
    if (aiTurnCount >= AI_MAX_TURNS) {
      appendBotMessage(["I've got plenty to work with. Let me pull the recommendation together."]);
      finalizeAi();
      return;
    }

    const displayText = userText || (aiPendingImage ? "(photo attached)" : "");
    if (displayText) appendUserMessage(displayText);

    aiHistory.push({ role: "user", content: userText || "(photo attached)" });

    const imagePayload = aiPendingImage;
    const photoForUI = aiPendingImage;
    aiPendingImage = null;
    aiTurnCount += 1;
    aiPending = true;

    const typing = appendTyping();
    renderAiControls();

    try {
      const payload = {
        messages: aiHistory.slice(-20),
        image: imagePayload ? { mediaType: imagePayload.mediaType, data: imagePayload.data } : null,
      };
      const resp = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      typing.remove();
      // Handle known soft failures with friendly messages before throwing
      if (resp.status === 403) {
        const errData = await resp.json().catch(() => ({}));
        aiPending = false;
        appendBotMessage([
          errData.message || "AI planning isn't available in your region. Quick form works for everyone — let's use that.",
        ]);
        setTimeout(() => renderStep("carType"), 500);
        return;
      }
      if (resp.status === 429) {
        const errData = await resp.json().catch(() => ({}));
        aiPending = false;
        const waitMin = Math.max(1, Math.ceil((errData.retry_after_seconds || 60) / 60));
        appendBotMessage([
          `Whoa, lots of activity. Take ${waitMin} min, then we can pick this back up. Or use the quick form — it works right now.`,
        ]);
        setTimeout(() => renderStep("carType"), 800);
        return;
      }
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      // Merge extracted fields into deterministic state
      if (data.extracted && typeof data.extracted === "object") {
        Object.entries(data.extracted).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") state.answers[k] = v;
        });
      }

      const lines = [];
      if (data.observed_from_photo && photoForUI) lines.push(`From the photo: ${data.observed_from_photo}`);
      if (data.reply) lines.push(data.reply);
      // Only append next_question if it's NOT already contained in the reply (model often inlines the question).
      if (data.next_question && !data.ready_to_recommend) {
        const replyNorm = (data.reply || "").toLowerCase().replace(/\s+/g, " ").trim();
        const qNorm = data.next_question.toLowerCase().replace(/\s+/g, " ").trim();
        if (!replyNorm.includes(qNorm)) lines.push(data.next_question);
      }
      if (lines.length === 0) lines.push("OK.");
      appendBotMessage(lines);

      aiHistory.push({ role: "assistant", content: data.reply || "" });
      saveState(state);

      if (data.ready_to_recommend) {
        finalizeAi();
      } else {
        aiPending = false;
        renderAiControls(data.quick_replies);
      }
    } catch (err) {
      typing.remove();
      aiPending = false;
      // Graceful fallback to guided form
      appendBotMessage([
        "Hmm, my AI brain isn't responding right now. Let's switch to the quick form — same outcome, just a few tap questions.",
      ]);
      setTimeout(() => renderStep("carType"), 500);
    }
  }

  function finalizeAi() {
    aiPending = false;
    // Backfill any missing required fields with safe defaults so recommend() always works
    if (!state.answers.scope) state.answers.scope = "both";
    if (!state.answers.location) state.answers.location = "burns";
    if (!state.answers.timing) state.answers.timing = "flexible";
    saveState(state);
    renderStep("recommend");
  }

  function appendTyping() {
    const bubble = document.createElement("div");
    bubble.className = "msg msg-bot msg-typing";
    bubble.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
    bubble.setAttribute("aria-label", "Assistant is typing");
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function appendBotMessage(lines) {
    const arr = Array.isArray(lines) ? lines : [lines];
    arr.forEach((line, i) => {
      const bubble = document.createElement("div");
      bubble.className = "msg msg-bot";
      bubble.innerHTML = renderMarkdownLite(line);
      log.appendChild(bubble);
      state.history.push({ role: "bot", text: line });
    });
    saveState(state);
    log.scrollTop = log.scrollHeight;
  }

  function appendUserMessage(text) {
    const bubble = document.createElement("div");
    bubble.className = "msg msg-user";
    bubble.textContent = text;
    log.appendChild(bubble);
    state.history.push({ role: "user", text });
    saveState(state);
    log.scrollTop = log.scrollHeight;
  }

  function renderMarkdownLite(text) {
    // Allow **bold** and escape HTML
    const escaped = String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function makeButton(label, modifier, onClick) {
    const b = document.createElement("button");
    b.className = "chat-btn " + (modifier || "");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  // ---- Public hook for "Chat to plan" buttons in the page ----
  function bindOpeners() {
    document.querySelectorAll("[data-open-chat]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        openChat();
      });
    });
  }

  // ---- Boot ----
  function init() {
    state = loadState();
    buildShell();
    bindOpeners();

    // Paste-photo support: anywhere on the page while chat is open
    document.addEventListener("paste", (e) => {
      if (!isOpen) return;
      if (state.currentStep !== "ai") return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            attachPhoto(file);
            return;
          }
        }
      }
    });

    // Drag-and-drop photos onto the chat panel
    panel.addEventListener("dragover", (e) => {
      if (state.currentStep !== "ai") return;
      e.preventDefault();
      panel.classList.add("chat-dropping");
    });
    panel.addEventListener("dragleave", () => panel.classList.remove("chat-dropping"));
    panel.addEventListener("drop", (e) => {
      panel.classList.remove("chat-dropping");
      if (state.currentStep !== "ai") return;
      e.preventDefault();
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) attachPhoto(file);
    });

    // Expose for QA hooks
    const api = {
      open: openChat,
      close: closeChat,
      restart: restartChat,
      _state: () => state,
      _recommend: recommend,
      _buildSms: buildSmsBody,
      _steps: STEPS,
      _sendAi: sendAiMessage,
      _aiHistory: () => aiHistory,
      _setPendingImage: (img) => { aiPendingImage = img; },
      _isFirstTime: isFirstTimeBrowser,
      _clearFirstTime: () => { try { localStorage.removeItem(FIRSTTIME_KEY); } catch {} },
    };
    window.ElionChat = api;
    // Back-compat alias so old QA / test scripts still work
    window.EllisChat = api;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
