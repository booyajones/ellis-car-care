/* ----------------------------------------------------------
   Wyatt Auto Detailing, site config

   Edit any of the values below to update the site.
   No coding needed. Save the file and refresh the page.

   What lives here:
     - Contact info (phone, email, Venmo)
     - Service area + travel fee
     - Bundle pricing
     - Add-ons
     - Process notes (what I bring vs what you provide)
     - FAQ
     - Next available slot
     - Formspree form ID (leave empty to use mailto fallback)
   ---------------------------------------------------------- */

const CONFIG = {
  business: {
    name: "Wyatt Auto Detailing",
    tagline: "Hand-detailed, in your driveway. Bay View & Petoskey, MI.",
    sub: "Hand wash, spray wax, ceramic coat. Done by hand on your block.",
    description: "Mobile hand auto detailing in the Bay View and Petoskey, Michigan area. Two-bucket wash, interior detailing, spray wax, ceramic coat, and headlight restoration, done in your driveway by Ellis.",
  },

  contact: {
    phone: "(628) 252-0740",
    phoneHref: "+16282520740",
    email: "wyattauto44@gmail.com",
    // SINGLE SOURCE OF TRUTH for Venmo handle. Change here, the whole
    // client side updates: home FAQ, book.html confirmation modal,
    // copy-handle button, Venmo deep-link URL builder.
    // SERVER SIDE: also update VENMO_HANDLE constant at top of
    // api/_email.js (the email templates run in Node, no window.CONFIG).
    venmo: "@Ellis-Wyatt-2",
    venmoSlug: "Ellis-Wyatt-2", // URL form, without the @
  },

  serviceArea: {
    primary: "Bay View, Petoskey",
    primaryFree: true,
    extended: "Greater Petoskey area",
    extendedFee: "",
    lat: 45.3733,
    lng: -84.9550,
    radiusMeters: 4000,
  },

  // Manually edit when the calendar changes. Empty string hides the line.
  nextAvailable: "Booking this week",

  // Cal.com booking URLs per tier. Ellis manages availability in his Cal.com
  // dashboard at app.cal.com. Each tier event type is configured with the
  // matching duration and In-Person (Attendee Address) location so the
  // customer's address becomes the job site.
  calBaseUrl: "https://cal.com/elion",
  calEventBySlug: {
    basic: "basic",
    essential: "essential",
    premium: "premium",
  },
  // Human-readable duration per tier, surfaced on the "Pick a time" CTA in the
  // confirmation modal. Keep keys aligned with bundle ids + calEventBySlug.
  calDurationLabel: {
    basic: "45–60 min",
    essential: "1–1.5 hr",
    premium: "from 4 hr",
  },

  // ----------------------------------------------------------
  // PACKAGES
  // Prices are ranges (small car / large car). Essential always
  // carries a "wash" marker — the visible label is handled in
  // the render layer. Premium is quoted.
  // ----------------------------------------------------------
  bundles: [
    {
      id: "basic",
      name: "Basic",
      priceMin: 38,
      priceMax: 50,
      priceLabel: "$38–50",
      priceSub: "small car $38 / large car $50, quoted on site",
      time: "about 45 minutes",
      summary: "A real hand wash plus an interior vacuum. Every bit of dirt and grime off, car cleaned inside and out.",
      includes: [
        "Wheel and tire pressure rinse",
        "Pre-wash foam to lift grit",
        "Mr. Pink two-bucket contact wash",
        "Full body rinse",
        "Hand dry, no water spots",
        "Interior vacuum",
      ],
      popular: false,
    },
    {
      id: "essential",
      name: "Essential",
      priceMin: 85,
      priceMax: 110,
      priceLabel: "$85–110",
      priceSub: "small car $85 / large car $110",
      // washLabel: true triggers rendering a "wash" marker/checkbox in tier lists
      washLabel: true,
      time: "about 1–1.5 hours",
      summary: "A full wash and wax plus a thorough interior detail. This is the most complete everyday service.",
      includes: [
        "Everything in Basic",
        "Wax protectant for gloss and a few weeks of protection",
        "Tire shine",
        "Interior: boar's hair brushing on all panels and interior parts",
        "Mats and upholstery drill-scrubbed",
      ],
      popular: true,
    },
    {
      id: "premium",
      name: "Premium",
      priceMin: 150,
      priceMax: 200,
      priceLabel: "$150–200",
      quote: true,
      time: "about 4 hours",
      summary: "Clay bar, machine polish, and ceramic protection on the paint and wheels. Interior gets the Essential-level treatment plus Chemical Guys VRP protectant on all vinyl, rubber, and plastic surfaces.",
      includes: [
        "Everything in Essential",
        "Clay bar decontamination",
        "Single-stage machine polish",
        "Ceramic protection on the paint, in place of wax",
        "Ceramic protection on the wheels",
        "Diablo wheel cleaner, included",
        "Chemical Guys VRP vinyl/rubber/plastic shine and protectant, included",
      ],
      popular: false,
    },
  ],

  // ----------------------------------------------------------
  // ADD-ONS
  // tiers:       which packages can add this (shown as a checkbox in booking)
  // includedIn:  packages where it's already part of the job (shown as "included")
  // price:       flat add-on price
  // priceByTier: per-package price
  // quotedTiers: packages where this add-on is quoted, not flat-priced
  // requires:    add-on id this depends on (steam clean needs interior)
  // boxed:       render in its own highlighted box (Deep clean, always quoted)
  // NOTE: Diablo wheel cleaner is no longer an add-on. It is an included
  //       FEATURE on all packages — listed in the Premium includes above and
  //       called out in the process section. It does not appear here.
  // These mirror the Cal.com booking questions on each event type.
  // ----------------------------------------------------------
  addons: [
    {
      id: "steam",
      name: "Steam clean",
      price: 20,
      tiers: ["basic", "essential", "premium"],
      description: "Steam upgrades the interior detail. Lifts set-in grime and sanitizes vents, seams, and the spots a wipe-down misses.",
    },
    {
      id: "deepclean",
      name: "Deep clean",
      tiers: ["basic", "essential", "premium"],
      quotedTiers: ["basic", "essential", "premium"],
      boxed: true,
      description: "For an interior that needs more than a standard clean: set-in stains, spills, heavy pet hair, or a long-neglected cabin. Ellis quotes it once he sees the car.",
    },
    {
      id: "claybar",
      name: "Clay bar",
      price: 20,
      tiers: ["essential"],
      includedIn: ["premium"],
      description: "Clay bar decontamination pulls embedded grit and fallout the wash cannot reach, so the paint feels glass-smooth. The right prep before wax or ceramic.",
    },
    {
      id: "trim",
      name: "Trim and plastic shine",
      priceByTier: { essential: 30, premium: 25 },
      tiers: ["essential", "premium"],
      description: "Chemical Guys VRP on faded plastic, vinyl, and rubber trim, brought back to a clean satin finish. This price covers exterior trim. Inside and out is $50 on Essential, $45 on Premium.",
    },
    {
      id: "ceramicwheels",
      name: "Ceramic wheel coat",
      price: 25,
      tiers: ["essential"],
      includedIn: ["premium"],
      description: "A ceramic wheel coating so brake dust and road grime wipe right off, with weeks of protection. Included on Premium.",
    },
    {
      id: "headlight",
      name: "Headlight restoration",
      price: 35,
      tiers: ["basic", "essential", "premium"],
      description: "Sand, polish, and a UV seal to bring foggy, yellowed headlights back to clear.",
    },
  ],

  // First-time customer discount. Decided server-side: api/cal-webhook.js
  // flags the first booking per email (HMAC identity, can't be farmed by
  // clearing cookies) and surfaces it in Ellis's notification email. Ellis
  // takes it off the Venmo/cash total after the job. This value is the
  // display figure shown in site copy. Set to 0 to disable.
  firstTimeDiscount: 0.15,

  // Process notes (used in the "Process" section).
  process: {
    iBring: [
      "Two-bucket wash kit, grit guards in both",
      "Foam cannon and Mr. Pink pH-balanced soap",
      "Microfiber sorted by job, color-coded",
      "Cordless vacuum, brushes, and detailing swabs",
      "Diablo wheel cleaner, included on every wash",
      "Clay bar, wax, polish, and ceramic",
      "Chemical Guys VRP for trim and plastics",
    ],
    youProvide: [
      "An outdoor water spigot",
      "An outdoor outlet, or a garage",
      "A driveway spot, ideally in shade",
    ],
  },

  faq: [
    {
      q: "What if it rains?",
      a: "Reschedule, no charge. I text the night before if it looks likely and we lock a new time.",
    },
    {
      q: "How do I pay?",
      a: "Venmo ({{VENMO}}) or cash. Pay after the job, when you're happy with how the car looks.",
    },
    {
      q: "Do you need my keys?",
      a: "Only if I'm doing interior work. Leave them on the front seat or hand them off when I arrive.",
    },
    {
      q: "What if I'm not home?",
      a: "Fine. Leave the car unlocked if there's interior work. I text photos when it's done and you can pay then.",
    },
    {
      q: "What products do you use?",
      a: "Mr. Pink pH-balanced soap with a two-bucket method and a foam cannon, microfiber sorted by job, Diablo cleaner for the wheels (included on every wash), clay bar for paint decon, and Chemical Guys VRP for trim. Essential gets a wax protectant; Premium gets a machine polish and a ceramic coat. I'll talk you through anything specific to your car.",
    },
    {
      q: "How do I know it'll be done well?",
      a: "Before-and-after photos every job. If anything isn't right, I come back and fix it, no charge.",
    },
    {
      q: "What if you scratch my car?",
      a: "I work by hand, two-bucket method, fresh microfiber. If something happens, I make it right out of pocket. I'll never machine polish a panel without talking to you first.",
    },
    {
      q: "Do you come to me?",
      a: "Yes. I detail your car in your own driveway. Bay View is free travel and gets the fastest scheduling. Greater Petoskey area is covered too. Anywhere further out, text me.",
    },
    {
      q: "How much does car detailing cost?",
      a: "Basic is $38–50 (small car $38, large car $50), a full hand wash plus interior vacuum. Essential is $85–110, which adds a wax finish and a thorough interior detail with boar's hair brushing and drill-scrubbed mats. Premium is $150–200, the full paint correction and ceramic treatment. No minimums and no surprise fees.",
    },
    {
      q: "What does detailing include vs a regular wash?",
      a: "A detail goes deeper than a wash. The paint gets decontaminated, corrected, and protected. The interior gets properly cleaned, not just wiped down. See our <a href='/detailing'>What is a detail?</a> page for the full breakdown.",
    },
  ],

  formspreeId: "",

  // Dollar amount off when a customer bundles interior + exterior in one visit.
  // Set to 0 to disable the offer.
  bundleDiscount: 10,

  referral: {
    headline: "Tell a neighbor.",
    body: "Send a neighbor to Wyatt Auto Detailing. When they book, you both get $10 off your next wash.",
    shareText: "Heads up, you should book Wyatt Auto Detailing for your car. Ellis details by hand in your driveway. Local, careful, the work is good:",
    shareUrl: "https://elioncarcare.com",
  },
};

window.CONFIG = CONFIG;
