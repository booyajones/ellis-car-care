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
    sub: "Wash, ceramic seal, cut and polish. Done by hand on your block.",
    description: "Hand auto detailing in Ann Arbor, Michigan. Two-bucket wash, ceramic sealant, paint correction, and headlight restoration, done in your driveway by Elion, a local detailer based in Burns Park.",
  },

  contact: {
    phone: "(628) 252-0740",
    phoneHref: "+16282520740",
    email: "info@elioncarcare.com",
    venmo: "@Elion-CarCare",
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

  bundles: [
    {
      id: "basic",
      name: "Basic",
      price: 40,
      time: "about 45 minutes",
      summary: "Hand wash, done right.",
      includes: [
        "Two-bucket exterior hand wash, grit guards in both",
        "Hand dry with fresh microfiber, no water spots",
        "Tire dressing and wheel wells wiped",
        "Door jambs and gas door cleaned",
      ],
      popular: false,
    },
    {
      id: "essential",
      name: "Essential",
      price: 90,
      time: "about 1.5 hours",
      summary: "Wash + ceramic seal. Paint stays protected for months.",
      includes: [
        "Everything in Basic",
        "Iron decontamination prep on the paint",
        "Ceramic spray sealant — beads water, lasts 3-4 months",
        "Plastic trim refreshed",
      ],
      popular: true,
    },
    {
      id: "premium",
      name: "Premium",
      price: 200,
      time: "about 4 hours",
      summary: "Wash + ceramic seal + cut and polish. Brings paint back.",
      includes: [
        "Everything in Essential",
        "Clay bar pass to remove embedded contaminants",
        "Single-stage cut and polish for swirls, light scratches, oxidation",
        "Interior deep clean: vacuum, wipe-down, glass, vents",
        "Leather conditioner or fabric protectant on seats",
      ],
      popular: false,
    },
  ],

  addons: [
    {
      id: "headlight-restoration",
      name: "Headlight Restoration",
      price: 30,
      description: "Sand + polish + UV pass to bring yellowed or foggy headlights back to clear. Adds about 30 minutes.",
    },
  ],

  // First-time customer discount. Applied automatically the first time a
  // browser confirms an order (tracked in localStorage). Set to 0 to disable.
  firstTimeDiscount: 0.25,

  // Process notes (used in the "Process" section).
  process: {
    iBring: [
      "Two-bucket wash kit, grit guards in both",
      "Foam cannon and pH-balanced soap",
      "Microfiber sorted by job, color-coded",
      "Cordless vacuum, brushes, and detailing swabs",
      "Wax, polish, sealant, and clay bar",
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
      a: "Cash, Venmo (@Elion-CarCare), or Zelle. Pay after the job, when you're happy with how the car looks.",
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
      a: "Two-bucket wash with pH-balanced soap and a foam cannon, microfiber sorted by job, hand-applied wax or ceramic spray sealant, clay bar for paint decon. I'll talk you through anything specific to your car.",
    },
    {
      q: "How do I know it'll be done well?",
      a: "Before-and-after photos every job. If anything isn't right, I come back and fix it, no charge.",
    },
    {
      q: "What if you scratch my car?",
      a: "I work by hand, two-bucket method, fresh microfiber. If something happens, I make it right out of pocket. I'll never machine polish a panel without talking to you first.",
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
    shareText: "Heads up, you should book Elion Car Care for your car. He details by hand in your driveway. Local, careful, the work is good:",
    // Empty string means "use the current page URL". Set this to a real domain
    // (e.g. "https://elioncarcare.com") once the custom domain is live.
    shareUrl: "",
  },
};

window.CONFIG = CONFIG;
