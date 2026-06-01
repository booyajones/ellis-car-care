/* ----------------------------------------------------------
   Elion Car Care, site config

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
    name: "Elion Car Care",
    tagline: "Hand-detailed, in your driveway. Ann Arbor.",
    sub: "Hand wash, spray wax, ceramic coat. Done by hand on your block.",
    description: "Hand auto detailing in Ann Arbor, Michigan. Two-bucket wash, spray wax, ceramic coat, and headlight restoration, done in your driveway by Ellis, a local detailer based in Burns Park.",
  },

  contact: {
    phone: "(628) 252-0740",
    phoneHref: "+16282520740",
    email: "info@elioncarcare.com",
    // SINGLE SOURCE OF TRUTH for Venmo handle. Change here, the whole
    // client side updates: home FAQ, book.html confirmation modal,
    // copy-handle button, Venmo deep-link URL builder.
    // SERVER SIDE: also update VENMO_HANDLE constant at top of
    // api/_email.js (the email templates run in Node, no window.CONFIG).
    venmo: "@Ellis-Wyatt-2",
    venmoSlug: "Ellis-Wyatt-2", // URL form, without the @
  },

  serviceArea: {
    primary: "Burns Park, Ann Arbor",
    primaryFree: true,
    extended: "Greater Ann Arbor (48104, 48103, 48105)",
    extendedFee: "$5",
    lat: 42.2628,
    lng: -83.7281,
    radiusMeters: 4000,
  },

  // Manually edit when the calendar changes. Empty string hides the line.
  nextAvailable: "Booking this week",

  // Cal.com booking URLs per tier. Ellis manages availability in his Cal.com
  // dashboard at app.cal.com. Each tier event type is configured with the
  // matching duration (Basic 45m, Essential 90m, Premium 240m) and In-Person
  // (Attendee Address) location so the customer's address becomes the job site.
  calBaseUrl: "https://cal.com/elion",
  calEventBySlug: {
    basic: "basic",
    essential: "essential",
    premium: "premium",
  },
  // Human-readable duration per tier, surfaced on the "Pick a time" CTA in the
  // confirmation modal. Keep keys aligned with bundle ids + calEventBySlug.
  calDurationLabel: {
    basic: "45 min",
    essential: "1 hr",
    premium: "from 4 hr",
  },

  // ----------------------------------------------------------
  // PACKAGES
  // Base price is the exterior wash. Add-ons (below) are selected
  // inside the Cal.com booking and priced on top. Premium is a quote
  // (set quote: true) — the price field is the starting number.
  // ----------------------------------------------------------
  bundles: [
    {
      id: "basic",
      name: "Basic",
      price: 40,
      time: "about 45 minutes",
      summary: "A real hand wash. Every bit of dirt and grime off, car looks fresh.",
      includes: [
        "Wheel and tire pressure rinse",
        "Pre-wash foam to lift grit",
        "Mr. Pink two-bucket contact wash",
        "Full body rinse",
        "Hand dry, no water spots",
      ],
      popular: false,
    },
    {
      id: "essential",
      name: "Essential",
      price: 60,
      time: "about 1 hour",
      summary: "Everything in Basic, sealed with a wax protectant and tire shine.",
      includes: [
        "Everything in Basic",
        "Wax protectant for gloss and a few weeks of protection",
        "Tire shine",
      ],
      popular: true,
    },
    {
      id: "premium",
      name: "Premium",
      price: 200,
      quote: true,
      priceLabel: "from $200",
      time: "about 4 hours",
      summary: "Clay bar, machine polish, and ceramic protection. Quoted on your car.",
      includes: [
        "Everything in Essential",
        "Clay bar decontamination",
        "Single-stage machine polish",
        "Ceramic protection on the paint, in place of wax",
        "Ceramic protection on the wheels, included",
        "Diablo wheel cleaner and tire shine, included",
      ],
      popular: false,
    },
  ],

  // ----------------------------------------------------------
  // ADD-ONS
  // tiers:       which packages can add this (shown as a checkbox in booking)
  // includedIn:  packages where it's already part of the job (shown as "included")
  // price:       flat add-on price
  // priceByTier: per-package price (Interior is $40 Basic, $35 on the higher
  //              tiers; Trim is $30 Essential, $25 Premium for exterior)
  // quotedTiers: packages where this add-on is quoted, not flat-priced
  // requires:    add-on id this depends on (steam clean needs interior)
  // boxed:       render in its own highlighted box (Deep clean, always quoted)
  // These mirror the Cal.com booking questions on each event type.
  // ----------------------------------------------------------
  addons: [
    {
      id: "interior",
      name: "Interior",
      priceByTier: { basic: 40, essential: 35, premium: 35 },
      tiers: ["basic", "essential", "premium"],
      description: "Vacuum, full wipe-down, glass, door jambs, and vents. A standard interior clean. Set-in stains, heavy pet hair, or a neglected cabin go to a Deep clean (quoted), see below.",
    },
    {
      id: "steam",
      name: "Steam clean",
      price: 20,
      tiers: ["basic", "essential", "premium"],
      requires: "interior",
      description: "A steam upgrade to the interior detail. Lifts set-in grime and sanitizes vents, seams, and the spots a wipe-down misses. Pairs with Interior.",
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
      id: "diablo",
      name: "Diablo wheel cleaner",
      price: 10,
      tiers: ["basic", "essential"],
      includedIn: ["premium"],
      description: "Diablo is a wheel-cleaning compound, not a brush. It breaks down brake dust and grime baked onto the wheels, past what a rinse can lift.",
    },
    {
      id: "claybar",
      name: "Clay bar",
      price: 20,
      tiers: ["essential"],
      includedIn: ["premium"],
      description: "Clay bar decontamination pulls embedded grit and fallout the wash can't reach, so the paint feels glass-smooth. The right prep before wax or ceramic.",
    },
    {
      id: "trim",
      name: "Trim and plastic shine",
      priceByTier: { essential: 30, premium: 25 },
      tiers: ["essential", "premium"],
      description: "Chemical Guys VRP on faded plastic, vinyl, and rubber trim, brought back to a clean satin finish. This price covers exterior trim. Inside and out is $50.",
    },
    {
      id: "ceramicwheels",
      name: "Ceramic on wheels",
      price: 20,
      tiers: ["essential"],
      includedIn: ["premium"],
      description: "A ceramic sealant on the wheels so brake dust and road grime wipe right off, with weeks of protection. Included on Premium.",
    },
    {
      id: "headlight",
      name: "Headlight restoration",
      price: 30,
      tiers: ["basic", "essential", "premium"],
      description: "Sand, polish, and a UV seal to bring foggy, yellowed headlights back to clear.",
    },
  ],

  // First-time customer discount. Decided server-side: api/cal-webhook.js
  // flags the first booking per email (HMAC identity, can't be farmed by
  // clearing cookies) and surfaces it in Ellis's notification email. Ellis
  // takes it off the Venmo/cash total after the job. This value is the
  // display figure shown in site copy. Set to 0 to disable.
  firstTimeDiscount: 0.25,

  // Process notes (used in the "Process" section).
  process: {
    iBring: [
      "Two-bucket wash kit, grit guards in both",
      "Foam cannon and Mr. Pink pH-balanced soap",
      "Microfiber sorted by job, color-coded",
      "Cordless vacuum, brushes, and detailing swabs",
      "Diablo wheel cleaner, clay bar, wax, polish, and ceramic",
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
      a: "Mr. Pink pH-balanced soap with a two-bucket method and a foam cannon, microfiber sorted by job, Diablo cleaner for the wheels, clay bar for paint decon, and Chemical Guys VRP for trim. Essential gets a wax protectant; Premium gets a machine polish and a ceramic coat. I'll talk you through anything specific to your car.",
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
      a: "Yes. I detail your car in your own driveway. Burns Park is free travel and gets the fastest scheduling. Greater Ann Arbor (48104, 48103, 48105) adds $5.",
    },
    {
      q: "How much does car detailing cost in Ann Arbor?",
      a: "A real hand wash is $40. A wash plus wax and tire shine is $60. A full ceramic detail is from $200, quoted on your car. Add an interior for $40 on Basic, or $35 with Essential or Premium. No minimums and no surprise fees.",
    },
  ],

  formspreeId: "",

  // Dollar amount off when a customer bundles interior + exterior in one visit
  // (i.e. accepts the "Add interior" upsell on the chat recommendation screen,
  // or originally chose "Both inside and out"). Set to 0 to disable the offer.
  bundleDiscount: 10,

  referral: {
    headline: "Tell a neighbor.",
    body: "Send a neighbor to Elion Car Care. When they book, you both get $10 off your next wash.",
    shareText: "Heads up, you should book Elion Car Care for your car. Ellis details by hand in your driveway. Local, careful, the work is good:",
    // Now that elioncarcare.com is live, point shares directly at it.
    shareUrl: "https://elioncarcare.com",
  },
};

window.CONFIG = CONFIG;
