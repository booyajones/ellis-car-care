/* ----------------------------------------------------------
   Ellis Car Care, site config

   Edit ANY of the values below to update the site.
   No coding needed. Save the file and refresh the page.

   What lives here:
     - Contact info (phone, email, Venmo)
     - Service area + travel fee
     - Bundle pricing
     - Add-ons
     - Season pass
     - Next available slot
     - Formspree form ID (leave empty to use mailto fallback)
   ---------------------------------------------------------- */

const CONFIG = {
  business: {
    name: "Ellis Car Care",
    tagline: "Hand-detailed, in your driveway. Ann Arbor.",
    sub: "Wash, full detail, hand wax, paint restoration. Done in your driveway, by hand, by Ellis.",
    description: "Hand auto detailing in Ann Arbor, Michigan. Wash, full detail, wax, and paint restoration, done by hand in your driveway by Ellis, a local detailer based in Burns Park.",
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
    // GeoCircle for JSON-LD, ~3km around Burns Park centroid
    lat: 42.2628,
    lng: -83.7281,
    radiusMeters: 4000,
  },

  // Manually edit when the calendar changes. Empty string hides the pill.
  nextAvailable: "Booking this week",

  // The 3 bundles, in display order.
  bundles: [
    {
      id: "quick-shine",
      name: "Quick Shine",
      price: 40,
      time: "about 45 minutes",
      includes: [
        "Exterior hand wash",
        "Hand dry, no water spots",
        "Tire shine",
        "Wheel wells wiped",
      ],
      popular: false,
    },
    {
      id: "driveway-detail",
      name: "Driveway Detail",
      price: 90,
      time: "about 2 hours",
      includes: [
        "Everything in Quick Shine",
        "Interior vacuum (seats, floor, trunk)",
        "Dashboard and console wipe-down",
        "All windows, inside and out",
        "Door jambs",
      ],
      popular: true,
    },
    {
      id: "full-reset",
      name: "Full Reset",
      price: 150,
      time: "about 3 hours",
      includes: [
        "Everything in Driveway Detail",
        "Hand wax, applied and buffed",
        "Paint protection that lasts months",
        "Headlight wipe-down",
      ],
      popular: false,
    },
  ],

  addons: [
    {
      id: "paint-restoration",
      name: "Paint Restoration",
      price: null,
      description: "Light compound and polish for swirls, light scratches, and oxidation. Pricing depends on the car. Send a photo for a quote.",
    },
  ],

  seasonPass: {
    name: "Season Pass",
    price: 120,
    description: "Four Quick Shines for $120. Use them anytime through the season. Saves $40.",
  },

  bringingChecklist: [
    "Soap, microfiber towels, wax, and polish",
    "Cordless vacuum",
    "Buckets and a hose nozzle",
  ],
  customerProvides: [
    "An outdoor water spigot",
    "An outdoor outlet, or a garage",
    "A driveway spot, ideally in shade",
  ],

  faq: [
    {
      q: "What if it rains?",
      a: "Reschedule, no charge. I'll text the night before if it's looking likely and we'll lock a new time.",
    },
    {
      q: "How do I pay?",
      a: "Cash, Venmo (@Ellis-CarCare), or Zelle. Pay after the job, when you're happy with how the car looks.",
    },
    {
      q: "Do you need my keys?",
      a: "Only for interior work (Driveway Detail or Full Reset). Leave them on the front seat or hand them off on arrival.",
    },
    {
      q: "What if I'm not home?",
      a: "Fine. Leave the car unlocked if interior work is involved. I'll text photos when it's done and you can pay then.",
    },
    {
      q: "How do I know it'll be done well?",
      a: "Before-and-after photos every job. If anything isn't right, I come back and fix it. No charge.",
    },
    {
      q: "What if you scratch my car?",
      a: "I'm careful, I use clean towels for every job, and I work by hand. If something happens, I make it right out of pocket.",
    },
  ],

  // Leave empty to use mailto fallback. Set to a Formspree form ID to enable hosted form submissions.
  formspreeId: "",

  referral: {
    headline: "Tell a neighbor",
    body: "Send a neighbor to Ellis Car Care. When they book, you both get $10 off your next wash.",
    shareText: "Heads up, you should book Ellis Car Care for your car. He details by hand in your driveway. Local, careful, his work is good:",
    shareUrl: "https://elliscarcare.com",
  },
};

window.CONFIG = CONFIG;
