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
    tagline: "Hand-detailed by a kid from Burns Park.",
    sub: "Wash, detail, wax, and paint restoration. In your driveway. By a real local kid.",
    description: "Local car detailing in Burns Park, Ann Arbor. Hand wash, full detail, wax, and paint restoration by a 14-year-old neighborhood kid.",
  },

  contact: {
    // Ellis's number (or a parent's phone for booking, your call)
    phone: "(734) 555-0123",
    phoneHref: "+17345550123",
    // Parent backup phone, shown for trust
    parentName: "Chris",
    parentPhone: "(734) 555-0124",
    parentPhoneHref: "+17345550124",
    email: "ellis@elliscarcare.com",
    venmo: "@Ellis-CarCare",
  },

  serviceArea: {
    primary: "Burns Park, Ann Arbor",
    primaryFree: true,
    extended: "Other Ann Arbor zip codes (48104, 48103)",
    extendedFee: "$5",
    // GeoCircle for JSON-LD, ~2km radius around Burns Park centroid
    lat: 42.2628,
    lng: -83.7281,
    radiusMeters: 2500,
  },

  // Manually edit this when Ellis's calendar changes.
  // Use a simple human string. If empty, the line is hidden.
  nextAvailable: "Next opening: Saturday afternoon",

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
        "Dashboard + console wipe-down",
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

  // Add-ons (priced separately).
  addons: [
    {
      id: "paint-restoration",
      name: "Paint Restoration",
      price: null, // null means "text for quote"
      description: "Light compound and polish for swirls, light scratches, and oxidation. Pricing depends on the car. Send a photo.",
    },
  ],

  // Season pass.
  seasonPass: {
    name: "Burns Park Season Pass",
    price: 120,
    description: "Four Quick Shines, use anytime June through August. Saves you $40.",
  },

  // What Ellis brings vs needs from you.
  bringingChecklist: [
    "All soap, microfiber towels, wax, and polish",
    "Cordless vacuum",
    "Buckets and a hose nozzle",
  ],
  customerProvides: [
    "An outdoor water spigot",
    "An outdoor electrical outlet (or garage)",
    "A parking spot in your driveway, ideally in shade",
  ],

  faq: [
    {
      q: "What if it rains?",
      a: "We reschedule, no questions asked. Ellis will text you the night before if rain looks likely, and we lock in a new time.",
    },
    {
      q: "How do I pay?",
      a: "Cash or Venmo (@Ellis-CarCare). Pay after the job, when you're happy with how it looks.",
    },
    {
      q: "Do you need my keys?",
      a: "Only if it's a Driveway Detail or Full Reset (interior work). Leave them on the front seat or hand them off when Ellis arrives.",
    },
    {
      q: "What if I'm not home?",
      a: "Totally fine. Just leave the car unlocked if interior work is involved, and Venmo when you see the photos.",
    },
    {
      q: "How do I know it'll be done well?",
      a: "Ellis sends before-and-after photos every time. If anything is off, he comes back, no charge.",
    },
  ],

  // Leave empty to use mailto fallback. To go live with a hosted form,
  // sign up at formspree.io (free), create a form, and paste the ID here.
  // Format: "xrgjzpqv" (the part after /f/).
  formspreeId: "",

  // Manual referral copy (the share link is generated at runtime).
  referral: {
    headline: "Tell a Burns Park neighbor",
    body: "Send a neighbor to Ellis Car Care. When they book their first detail, you both get $10 off your next wash.",
    shareText: "Hey, you should book Ellis Car Care for your car. He's a Burns Park kid who details cars in your driveway. Cheap, hand-done, and his work is great:",
    shareUrl: "https://elliscarcare.com",
  },
};

window.CONFIG = CONFIG;
