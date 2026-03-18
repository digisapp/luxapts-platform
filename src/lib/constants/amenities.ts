// Centralized amenity configuration — single source of truth for the entire app.
// Used by: search API (keyword matching), search page (filter UI), parse-query (NLP fallback).

export interface AmenityOption {
  name: string;
  icon: string;
  category: string;
}

/**
 * Keyword mapping: amenity display name → keywords to match in DB amenity names.
 * Keys are title-cased for display; values are lowercase for matching.
 */
export const AMENITY_KEYWORDS: Record<string, string[]> = {
  // Pools & Water Features
  "Pool": ["pool", "swimming", "lap pool", "infinity pool"],
  "Hot Tub": ["hot tub", "jacuzzi", "whirlpool", "spa tub"],
  "Cold Plunge": ["cold plunge", "plunge pool", "ice bath"],
  "Sauna": ["sauna", "infrared sauna"],
  "Steam Room": ["steam room", "steam"],
  "Spa": ["spa", "sauna", "steam", "hot tub", "jacuzzi", "plunge", "wellness"],

  // Fitness & Sports
  "Gym": ["gym", "fitness", "workout", "exercise", "weight room", "cardio"],
  "Yoga": ["yoga", "pilates", "meditation"],
  "Basketball": ["basketball", "sport court", "half court"],
  "Tennis": ["tennis", "pickleball", "racquet"],
  "Golf": ["golf simulator", "golf"],
  "Running Track": ["running track", "jogging", "track"],
  "Boxing": ["boxing", "mma", "martial arts"],
  "Spin": ["spin", "cycling", "peloton"],
  "Rock Climbing": ["climbing wall", "rock climbing", "bouldering"],

  // Outdoor & Recreation
  "Rooftop": ["rooftop", "roof deck", "sky deck", "sky lounge", "terrace"],
  "Pool Deck": ["pool deck", "sundeck", "sun deck"],
  "Cabana": ["cabana", "poolside"],
  "BBQ": ["bbq", "grill", "barbecue", "outdoor kitchen"],
  "Garden": ["garden", "courtyard", "green space"],
  "Fire Pit": ["fire pit", "firepit", "outdoor fireplace"],

  // Pet Amenities
  "Pet Spa": ["pet spa", "dog grooming", "pet grooming", "dog wash", "pet wash", "grooming station"],
  "Dog Park": ["dog run", "dog park", "bark park", "pet park"],

  // Social & Entertainment
  "Lounge": ["lounge", "club room", "resident lounge", "sky lounge"],
  "Game Room": ["game room", "billiard", "pool table", "gaming"],
  "Movie Theater": ["movie", "theater", "screening", "cinema"],
  "Library": ["library", "reading room", "book"],
  "Coworking": ["coworking", "co-working", "work space", "business center", "conference room"],
  "Podcast": ["podcast", "recording studio", "music room"],
  "Wine Room": ["wine room", "wine cellar", "wine lounge", "wine storage", "wine locker"],
  "Private Dining": ["private dining", "chef", "demonstration kitchen", "catering"],
  "Karaoke": ["karaoke"],

  // Services & Security
  "Concierge": ["concierge", "24-hour", "24 hour", "front desk"],
  "Doorman": ["doorman", "door attendant", "attended lobby"],
  "Valet": ["valet", "valet parking"],
  "Package Room": ["package room", "package locker", "amazon locker", "cold storage"],
  "Dry Cleaning": ["dry cleaning", "laundry service"],

  // Parking & Transportation
  "Parking": ["parking", "garage", "covered parking"],
  "EV Charging": ["ev charging", "electric vehicle", "tesla", "charging station"],
  "Bike Storage": ["bike storage", "bicycle", "bike room", "bike repair"],

  // Children & Family
  "Playroom": ["playroom", "children", "kids room", "play area", "tot lot"],
  "Daycare": ["daycare", "childcare"],

  // In-Unit Features
  "Washer Dryer": ["washer", "dryer", "laundry", "w/d", "in-unit laundry"],
  "Balcony": ["balcony", "patio", "terrace", "private outdoor", "juliet balcony"],
  "Floor To Ceiling Windows": ["floor-to-ceiling", "floor to ceiling", "large windows", "panoramic"],
  "High Ceilings": ["high ceiling", "tall ceiling", "10 foot", "11 foot", "12 foot", "loft"],
  "Walk-in Closet": ["walk-in closet", "walk in closet", "custom closet", "california closet"],
  "Hardwood Floors": ["hardwood", "wood floor", "oak floor"],
  "Stainless Steel": ["stainless steel", "stainless appliances", "chef kitchen", "gourmet kitchen"],
  "Granite": ["granite", "marble", "quartz", "stone countertop"],
  "Smart Home": ["smart home", "smart lock", "nest", "smart thermostat", "keyless"],
  "Central Air": ["central air", "central ac", "hvac", "climate control"],
  "Fireplace": ["fireplace", "gas fireplace"],
  "Den": ["den", "office", "home office", "study"],
  "Soaking Tub": ["soaking tub", "spa tub", "freestanding tub", "jacuzzi tub"],
  "Double Vanity": ["double vanity", "dual sink", "his and hers"],

  // Views & Location
  "City View": ["city view", "skyline view", "manhattan view"],
  "Water View": ["water view", "ocean view", "bay view", "river view", "waterfront"],
  "Park View": ["park view", "central park", "garden view"],
};

/** UI-facing amenity list with icons and categories for the search page filter panel. */
export const AMENITY_OPTIONS: AmenityOption[] = [
  // Most Popular
  { name: "Pool", icon: "waves", category: "popular" },
  { name: "Gym", icon: "dumbbell", category: "popular" },
  { name: "Washer Dryer", icon: "shirt", category: "popular" },
  { name: "Doorman", icon: "shield", category: "popular" },
  { name: "Rooftop", icon: "sun", category: "popular" },
  { name: "Concierge", icon: "user", category: "popular" },

  // In-Unit Features
  { name: "Balcony", icon: "door-open", category: "in-unit" },
  { name: "Walk-in Closet", icon: "box", category: "in-unit" },
  { name: "Hardwood Floors", icon: "grid", category: "in-unit" },
  { name: "High Ceilings", icon: "maximize", category: "in-unit" },
  { name: "Stainless Steel", icon: "utensils", category: "in-unit" },
  { name: "Smart Home", icon: "smartphone", category: "in-unit" },
  { name: "Fireplace", icon: "flame", category: "in-unit" },
  { name: "Den", icon: "briefcase", category: "in-unit" },
  { name: "Floor To Ceiling Windows", icon: "maximize", category: "in-unit" },
  { name: "Granite", icon: "square", category: "in-unit" },
  { name: "Central Air", icon: "wind", category: "in-unit" },
  { name: "Soaking Tub", icon: "droplet", category: "in-unit" },
  { name: "Double Vanity", icon: "square", category: "in-unit" },

  // Wellness & Fitness
  { name: "Hot Tub", icon: "droplet", category: "wellness" },
  { name: "Cold Plunge", icon: "snowflake", category: "wellness" },
  { name: "Sauna", icon: "thermometer", category: "wellness" },
  { name: "Steam Room", icon: "cloud", category: "wellness" },
  { name: "Spa", icon: "sparkles", category: "wellness" },
  { name: "Yoga", icon: "flower", category: "wellness" },

  // Sports & Recreation
  { name: "Basketball", icon: "circle", category: "sports" },
  { name: "Tennis", icon: "target", category: "sports" },
  { name: "Golf", icon: "flag", category: "sports" },
  { name: "Spin", icon: "bike", category: "sports" },
  { name: "Running Track", icon: "footprints", category: "sports" },
  { name: "Boxing", icon: "target", category: "sports" },
  { name: "Rock Climbing", icon: "mountain", category: "sports" },

  // Pet
  { name: "Pet Spa", icon: "paw-print", category: "pet" },
  { name: "Dog Park", icon: "paw-print", category: "pet" },

  // Social & Entertainment
  { name: "Coworking", icon: "briefcase", category: "social" },
  { name: "Game Room", icon: "gamepad", category: "social" },
  { name: "Movie Theater", icon: "film", category: "social" },
  { name: "Lounge", icon: "sofa", category: "social" },
  { name: "Library", icon: "book", category: "social" },
  { name: "Wine Room", icon: "wine", category: "social" },
  { name: "Private Dining", icon: "utensils", category: "social" },
  { name: "Podcast", icon: "mic", category: "social" },
  { name: "Karaoke", icon: "mic", category: "social" },

  // Outdoor
  { name: "BBQ", icon: "flame", category: "outdoor" },
  { name: "Garden", icon: "tree", category: "outdoor" },
  { name: "Cabana", icon: "umbrella", category: "outdoor" },
  { name: "Fire Pit", icon: "flame", category: "outdoor" },
  { name: "Pool Deck", icon: "sun", category: "outdoor" },

  // Services
  { name: "Valet", icon: "car", category: "services" },
  { name: "Package Room", icon: "package", category: "services" },
  { name: "Dry Cleaning", icon: "shirt", category: "services" },

  // Parking & Transportation
  { name: "Parking", icon: "car", category: "parking" },
  { name: "EV Charging", icon: "zap", category: "parking" },
  { name: "Bike Storage", icon: "bike", category: "parking" },

  // Family
  { name: "Playroom", icon: "smile", category: "family" },
  { name: "Daycare", icon: "baby", category: "family" },

  // Views
  { name: "City View", icon: "building", category: "views" },
  { name: "Water View", icon: "waves", category: "views" },
  { name: "Park View", icon: "tree", category: "views" },
];
