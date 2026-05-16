/* ============================================================
   Ellis Car Care — Wash Planner Chatbot
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

  // ---- Pricing & rules (kept in sync with config.js) ----
  const PRICES = {
    quickShine: 40,
    drivewayDetail: 90,
    fullReset: 200,
  };

  const ADDONS = {
    headlightRestore: { id: "headlight", name: "Headlight restoration", price: 30, included: ["fullReset"] },
    petHair:          { id: "pethair",   name: "Heavy pet hair removal", price: 20, included: [] },
    heavyStain:       { id: "stain",     name: "Heavy stain treatment",  price: 25, included: [] },
    interiorShampoo:  { id: "shampoo",   name: "Carpet/seat shampoo",    price: 35, included: [] },
    leatherCondition: { id: "leather",   name: "Leather conditioning",   price: 15, included: ["fullReset"] },
    paintCorrection:  { id: "paint",     name: "Paint restoration",      price: null, quoted: true, included: [] },
    waxSealant:       { id: "wax",       name: "Hand wax / ceramic spray", price: 25, included: ["fullReset"] },
  };

  const PACKAGE_LABEL = {
    quickShine: "Quick Shine",
    drivewayDetail: "Driveway Detail",
    fullReset: "Full Reset",
  };

  const PACKAGE_TIME = {
    quickShine: "about 45 minutes",
    drivewayDetail: "about 2 hours",
    fullReset: "about 4 hours",
  };

  // ---- State ----
  const STATE_KEY = "ellis_chat_v1";
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
      ],
    },

    skipToPrices: {
      id: "skipToPrices",
      prompt: () => [
        "All good. Here's the lineup:",
        "• Quick Shine — $40, about 45 min. Exterior only.",
        "• Driveway Detail — $90, about 2 hrs. Inside and out.",
        "• Full Reset — $200, about 4 hrs. Wax, clay bar, headlight restore, leather/fabric, plastic trim.",
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
        "• Hand wax — classic carnauba, deep glossy look, lasts 6–8 weeks.",
        "• Ceramic spray sealant — slicker finish, better water beading, lasts 3–4 months.",
        "Either is included in Full Reset, or I can add it on for $25.",
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

  // ---- Recommendation engine ----
  function recommend(a, pkgOverride) {
    // a = answers; pkgOverride = optional package id to force (used when user picks alternate)
    const scope = a.scope || "both";
    let pkg;
    if (scope === "exterior") pkg = "quickShine";
    else pkg = "drivewayDetail"; // both / interior / unsure

    // Gate signals by scope — interior-only shouldn't read exterior answers, etc.
    const exteriorInScope = scope !== "interior";
    const interiorInScope = scope !== "exterior";

    const wantsWax     = exteriorInScope && a.wax === "yes";
    const dullPaint    = exteriorInScope && a.exteriorCondition === "dull";
    const contaminants = exteriorInScope && a.exteriorCondition === "contaminants";
    const foggyHL      = exteriorInScope && a.headlights === "foggy";
    const heavyStains  = interiorInScope && a.stains === "heavy";
    const lotsPetHair  = interiorInScope && a.petHair === "lots";
    const disasterInt  = interiorInScope && a.interiorCondition === "disaster";

    // Full Reset bump rules (any one triggers, because Full Reset is the only
    // package that includes the required service):
    //   1. Disaster interior — needs deeper cleaning than Driveway Detail
    //   2. Contaminants on paint (tree sap/bird/tar) — needs clay bar
    //   3. Dull paint AND wants wax — needs prep + correction territory
    //   4. Two or more severe signals in different categories
    let goFullReset = false;
    if (disasterInt) goFullReset = true;
    if (contaminants) goFullReset = true;
    if (dullPaint && wantsWax) goFullReset = true;
    const severeCount = [dullPaint, contaminants, disasterInt, (heavyStains && lotsPetHair)].filter(Boolean).length;
    if (severeCount >= 2) goFullReset = true;

    if (goFullReset) pkg = "fullReset";

    // Honor explicit user override (e.g. they picked "Switch to Driveway Detail" on the alt screen)
    if (pkgOverride && PRICES[pkgOverride]) pkg = pkgOverride;

    // Add-ons (only when not already Full Reset — FR includes most of these)
    const addons = [];
    const reasons = [];

    if (pkg !== "fullReset") {
      if (foggyHL) {
        addons.push({ ...ADDONS.headlightRestore });
        reasons.push("Foggy headlights — added the $30 restoration pass.");
      }
      if (wantsWax) {
        addons.push({ ...ADDONS.waxSealant });
        reasons.push("You wanted wax/sealant — added the $25 hand wax.");
      }
      if (lotsPetHair) {
        addons.push({ ...ADDONS.petHair });
        reasons.push("Heavy pet hair takes extra time — added $20.");
      }
      if (heavyStains) {
        addons.push({ ...ADDONS.heavyStain });
        reasons.push("Heavy stains need spot treatment — added $25.");
      }
      if (dullPaint && !wantsWax) {
        // Soft suggestion only — paint correction is quoted by photo, not auto-added
        reasons.push("Paint looks dull — Ellis can quote paint correction by photo if you want it brought back further.");
      }
    } else {
      // Full Reset rationale
      if (disasterInt) reasons.push("Disaster-zone interior — Full Reset has the depth this needs.");
      if (contaminants) reasons.push("Tree sap or bird drops need a clay bar pass, which is included in Full Reset.");
      if (dullPaint && wantsWax) reasons.push("Dull paint plus wax means prep + sealant — Full Reset bundles both.");
      if (foggyHL) reasons.push("Full Reset includes the headlight restoration at no extra charge.");
      if (heavyStains && lotsPetHair) reasons.push("Heavy stains plus pet hair — Full Reset's deep interior handles it.");
    }

    // Size uplift — full-size and heavy-duty get +15-20% time, occasionally a small surcharge
    let sizeNote = "";
    if (a.carSize === "fullsize" && pkg === "quickShine") {
      sizeNote = " (allow about an hour for full-size)";
    } else if (a.carSize === "fullsize" && pkg === "drivewayDetail") {
      sizeNote = " (about 2.5 hours on a full-size)";
    } else if (a.carSize === "fullsize" && pkg === "fullReset") {
      sizeNote = " (about 4.5–5 hours on a full-size)";
    }

    // Total
    const base = PRICES[pkg];
    const addonTotal = addons.reduce((sum, a) => sum + (a.price || 0), 0);
    const travel = a.location === "annarbor" ? 5 : 0;
    const travelNote = a.location === "annarbor" ? " (+$5 travel)" : (a.location === "nearby" ? " (Ellis will confirm travel after you text)" : "");
    const total = base + addonTotal + travel;

    // If "interior only" the exterior wash is still done (it's bundled in Driveway Detail)
    let scopeNote = "";
    if (scope === "interior") {
      scopeNote = "Driveway Detail is the closest fit — interior is the focus, but the exterior wash is included at no extra cost.";
    }

    return {
      pkg,
      pkgLabel: PACKAGE_LABEL[pkg],
      pkgTime: PACKAGE_TIME[pkg] + sizeNote,
      base,
      addons,
      addonTotal,
      travel,
      travelNote,
      total,
      reasons,
      scopeNote,
    };
  }

  function buildRecommendationMessage(state) {
    const rec = recommend(state.answers);
    state.recommendation = rec;
    saveState(state);

    const lines = [];
    lines.push(`Based on your answers, I'd recommend **${rec.pkgLabel}** — $${rec.base}.`);
    lines.push(`Time: ${rec.pkgTime}.`);
    if (rec.scopeNote) lines.push(rec.scopeNote);

    if (rec.addons.length) {
      lines.push("");
      lines.push("Add-ons I'd include:");
      rec.addons.forEach(a => {
        lines.push(`• ${a.name} — ${a.price ? `$${a.price}` : "quoted by photo"}`);
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

    lines.push("");
    lines.push(`Estimated total: **$${rec.total}**`);
    lines.push("");
    lines.push("Sound good? Tap below to send the whole plan to Ellis as a text. He'll confirm timing.");

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

    if (a.scope !== "exterior") {
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
      if (a.wax === "yes") extParts.push("wants wax/sealant");
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
    lines.push(`Recommended: ${rec.pkgLabel} — $${rec.base}`);
    if (rec.addons.length) {
      rec.addons.forEach(ad => {
        lines.push(`+ ${ad.name}${ad.price ? ` ($${ad.price})` : ""}`);
      });
    }
    if (rec.travel > 0) lines.push(`+ Travel ($${rec.travel})`);
    lines.push(`Estimated total: $${rec.total}`);
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
      const sendBtn = makeButton("Text the plan to Ellis", "is-primary", () => {
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
    // Offer to bump to next tier up or down
    const rec = state.recommendation;
    let altPkg;
    if (rec.pkg === "quickShine") altPkg = "drivewayDetail";
    else if (rec.pkg === "drivewayDetail") altPkg = "fullReset";
    else altPkg = "drivewayDetail";

    const altBase = PRICES[altPkg];
    const altTime = PACKAGE_TIME[altPkg];
    const lines = [
      `Here's another option:`,
      `**${PACKAGE_LABEL[altPkg]}** — $${altBase}, ${altTime}.`,
      altPkg === "fullReset"
        ? "Full Reset includes clay bar, wax/sealant, headlight restore, leather/fabric, and plastic trim. The works."
        : altPkg === "drivewayDetail"
          ? "Driveway Detail adds the interior to a Quick Shine — vacuum, wipe-down, glass, vents."
          : "Quick Shine is exterior-only — fast, two-bucket wash, dry, tires, jambs.",
      "Want this one instead, or stick with the original recommendation?",
    ];
    appendBotMessage(lines);

    controls.innerHTML = "";
    const switchBtn = makeButton(`Switch to ${PACKAGE_LABEL[altPkg]}`, "is-primary", () => {
      state.answers._packageOverride = altPkg;
      // Re-run recommendation with the explicit package — re-derives correct add-ons for that tier
      state.recommendation = recommend(state.answers, altPkg);
      appendUserMessage(`Switch to ${PACKAGE_LABEL[altPkg]}`);
      // Show updated plan inline
      const r = state.recommendation;
      const summary = [`Switched to **${r.pkgLabel}** — $${r.base}.`];
      if (r.addons.length) {
        summary.push("Add-ons that still apply:");
        r.addons.forEach(a => summary.push(`• ${a.name} — ${a.price ? `$${a.price}` : "quoted"}`));
      }
      if (r.travel > 0) summary.push(`Travel: +$${r.travel}`);
      summary.push(`Estimated total: **$${r.total}**`);
      appendBotMessage(summary);
      const sendBtn = makeButton("Text the plan to Ellis", "is-primary", () => {
        const body = buildSmsBody(state);
        openSms(body);
        appendUserMessage("Sent the plan to Ellis ✓");
        renderTerminal();
      });
      controls.innerHTML = "";
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
    appendBotMessage(["You're set. If for any reason the text app didn't open, just call or text Ellis at (628) 252-0740."]);
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
    window.EllisChat = {
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
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
