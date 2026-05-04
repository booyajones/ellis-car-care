/* ----------------------------------------------------------
   Ellis Car Care, site config

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
    name: "Ellis Car Care",
    tagline: "Hand-detailed, in your driveway. Ann Arbor.",
    sub: "Wash, full detail, hand wax, paint restoration. Done by hand on your block, by Ellis.",
    description: "Hand auto detailing in Ann Arbor, Michigan. Two-bucket wash, full detail, hand wax, and paint restoration, done in your driveway by Ellis, a local detailer based in Burns Park.",
  },

  contact: {
    phone: "(628) 252-0740",
    phoneHref: "+16282520740",
    email: "info@elliscarcare.com",
    venmo: "@Ellis-CarCare",
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
      id: "quick-shine",
      name: "Quick Shine",
      price: 40,
      time: "about 45 minutes",
      summary: "Exterior only.",
      includes: [
        "Two-bucket exterior hand wash, grit guards in both",
        "Hand dry with fresh microfiber, no water spots",
        "Tire dressing and wheel wells wiped",
        "Door jambs and gas door cleaned",
      ],
      popular: false,
    },
    {
      id: "driveway-detail",
      name: "Driveway Detail",
      price: 90,
      time: "about 2 hours",
      summary: "Inside and out.",
      includes: [
        "Everything in Quick Shine",
        "Interior vacuum: seats, floor, trunk, mats out",
        "Dashboard, console, and door panel wipe-down",
        "All glass cleaned, inside and out",
        "Air vents and crevices detailed",
      ],
      popular: true,
    },
    {
      id: "full-reset",
      name: "Full Reset",
      price: 200,
      time: "about 4 hours",
      summary: "The works. Brings paint and interior back to life.",
      includes: [
        "Everything in Driveway Detail",
        "Iron decontamination and clay bar pass",
        "Hand wax or ceramic spray sealant, your choice",
        "Headlight clean and UV pass",
        "Leather conditioner or fabric protectant on seats",
        "Plastic trim restored",
      ],
      popular: false,
    },
  ],

  addons: [
    {
      id: "paint-restoration",
      name: "Paint Restoration",
      price: null,
      description: "Single-stage compound and polish for swirls, light scratches, and oxidation. Quoted by car. Send a photo and I'll come back with a number.",
    },
  ],

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
      a: "Cash, Venmo (@Ellis-CarCare), or Zelle. Pay after the job, when you're happy with how the car looks.",
    },
    {
      q: "Do you need my keys?",
      a: "Only for interior work (Driveway Detail or Full Reset). Leave them on the front seat or hand them off when I arrive.",
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

  referral: {
    headline: "Tell a neighbor.",
    body: "Send a neighbor to Ellis Car Care. When they book, you both get $10 off your next wash.",
    shareText: "Heads up, you should book Ellis Car Care for your car. He details by hand in your driveway. Local, careful, the work is good:",
    // Empty string means "use the current page URL". Set this to a real domain
    // (e.g. "https://elliscarcare.com") once the custom domain is live.
    shareUrl: "",
  },
};

window.CONFIG = CONFIG;
