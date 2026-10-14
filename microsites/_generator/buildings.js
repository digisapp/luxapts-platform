// Per-building facts for the generated microsites.
// Sources: Florida YIMBY, REBusinessOnline, Multi-Housing News, PROFILEmiami,
// official leasing sites, and Staycio's own scraped rent snapshots.
// `mode`: waitlist = not yet leasing · availability = operating building.
//
// `delivers` is the earliest credible delivery date, ISO. It is what decides
// which CTA a waitlist page actually renders — build.js derives the tier from
// it rather than trusting `mode`, so a page cannot keep selling a waitlist for
// a building that has already opened. That is not hypothetical: namdartowers
// carried 47% Google traffic and converted at ~1% while doing exactly that.
// Leave it null only for buildings with no announced date.
// When the per-building FACTS below were last checked against public sources.
// The footer disclaimer on every generated page renders this date, so it is a
// public claim about our own diligence — bump it ONLY after actually
// re-verifying unit counts, delivery dates, developers and addresses. It must
// never be wired to the build date: regenerating a page verifies nothing.
const FACTS_VERIFIED = "2026-09-16";

const BUILDINGS = [
  {
    domain: "2600biscaynemiami.com", name: "2600 Biscayne", short: "2600", accent: "BISCAYNE",
    captions: ["Pool Deck","Kitchens","Bedrooms"], credit: "Photography and renderings courtesy of Oak Row Equities, Bozzuto and Neo Edgewater; aerial photography via Florida YIMBY",
    // Leases under the name Neo Edgewater. Preleasing launched September 2026
    // with first residents in October, so this entry ran "get pricing before
    // the leasing office opens" right up to the month the office opened and
    // published rents — the namdartowers.com failure, one month from repeating.
    // It is now an availability page. The name stays "2600 Biscayne" because
    // that is what this domain is searched as; the copy leads with the brand.
    // neoedgewatermiami.com covers the same building from the brand side.
    mode: "availability", palette: { ink:"#0d1f2d", a:"#2fb8c6", deep:"#17707c", pale:"#dff5f8" },
    hood: "Edgewater", address: "2600 Biscayne Blvd", zip: "33137", units: 399, stories: 41,
    developer: "Oak Row Equities", eta: "Leasing now", etaShort: "Now", year: 2026,
    verified: "2026-09-21",
    prices: { checked: "2026-10-13", source: "the leasing office's online availability", basis: "total monthly price including required fees" },
    // Overridden because neoedgewatermiami.com is the same building; these
    // target the address search, that page the brand search.
    title: "2600 Biscayne Miami — Now Leasing as Neo Edgewater | Rents",
    ogTitle: "2600 Biscayne — Edgewater, Miami",
    desc: "2600 Biscayne Blvd, Edgewater: 399 rental apartments by Oak Row Equities, now leasing as Neo Edgewater. Check current availability, rents and specials.",
    chip: "Open · Now Leasing as Neo Edgewater",
    h1: ["The tower at", "2600 Biscayne", "is leasing.", "It's called Neo."],
    sub: "Oak Row Equities' 41-story Arquitectonica tower opened preleasing in September 2026 as Neo Edgewater — 399 rentals over roughly 205,000 sq ft of Class A office and retail, with the first residents moving in from October.",
    ticker: ["399 residences","41 stories","205k sq ft office & retail","Equinox in the building","First residents October 2026"],
    stats: [["$2,817+","Studios From"],["399","Residences"],["41","Stories"],["205k","Sq Ft Office & Retail"]],
    kicker: "2600 Biscayne Boulevard",
    h2: "Live above the office you'd otherwise commute to",
    body: [
      "2600 Biscayne rises on Biscayne Boulevard at NE 26th Terrace, in the stretch of Edgewater that turned from parking lots into towers in under a decade. Margaret Pace Park and the bay are a short walk east; Wynwood and Midtown sit just west.",
      "Designed by Arquitectonica, the tower stacks 399 rental residences of roughly 500 to 1,700 square feet over about 205,000 square feet of Class A office and retail — a genuine live-work building rather than a marketing phrase. It leases as Neo Edgewater, with Bozzuto running the leasing office."
    ],
    cards: [
      ["Rental, not resale","Most new Edgewater towers are condos. This one is purpose-built rental run by a single operator, so you sign with a management company instead of chasing individual owners."],
      ["Office downstairs","About 205,000 sq ft of Class A office and retail in the same building — the shortest commute in Miami for anyone whose employer takes space here."],
      ["Opening specials","On October 13, 2026, the leasing office advertised one month free on 14–18 month leases. Lease-up specials usually shrink as the building fills."]
    ],
    faq: [
      ["Is 2600 Biscayne leasing now?","Yes. Preleasing launched in September 2026 under the name Neo Edgewater, and the first residents move in from October 2026."],
      ["What is the difference between 2600 Biscayne and Neo Edgewater?","None — same building. 2600 Biscayne Boulevard is the address; Neo Edgewater is the name it leases under."],
      ["How much is rent at 2600 Biscayne?","When we checked on October 13, 2026, the leasing office listed studios from about $2,817 a month, one-bedrooms from about $3,742, two-bedrooms from about $5,852 and three-bedrooms from about $8,302, including required monthly fees. Lease-up pricing changes with each release, so send your bedroom count and we'll check today's."],
      ["Where exactly is it?","2600 Biscayne Boulevard, also addressed at 246 NE 26th Terrace, in Miami's Edgewater neighborhood."],
      ["Who is the developer?","Oak Row Equities, with architecture by Arquitectonica and residential leasing by Bozzuto."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    ctaH2: "Find your apartment at 2600 Biscayne.",
    ctaP: "399 apartments releasing in waves, with opening specials that shrink as the building fills. Tell us your bedroom count, budget and move-in date and we'll come back with what's open and what it costs today."
  },
  {
    domain: "jemmiamiapartments.com", name: "JEM Miami Worldcenter", short: "JEM", accent: "MIAMI",
    // Owner's wording (2026-10-05).
    title: "JEM Miami Worldcenter — Luxury Rental Apartments",
    captions: ["Residences","Rooftop Pool","Under Construction"], credit: "Renderings courtesy of Naftali Group; construction photography via Florida YIMBY",
    mode: "waitlist", palette: { ink:"#1a1329", a:"#c9a84c", deep:"#8a6f22", pale:"#f7f0dc" },
    hood: "Miami Worldcenter", address: "1016 NE 2nd Ave", zip: "33132", units: 530, stories: 67,
    developer: "Naftali Group", eta: "Q4 2027", etaShort: "Q4 '27", delivers: "2027-10-01",
    chip: "Under Construction · Rentals Delivering Q4 2027",
    h1: ["Rent at JEM,", "the 67-story tower", "in Miami", "Worldcenter."],
    sub: "Floors 10 to 42 of Naftali Group's JEM are 530 rental apartments, a few blocks from Brightline, the Kaseya Center and Bayside. Rentals are scheduled for Q4 2027, and rents haven't been published yet.",
    ticker: ["67 stories","530 rental residences","Floors 10–42","Miami Worldcenter","Delivering Q4 2027"],
    stats: [["530","Rental Homes"],["67","Stories"],["Q4 '27","Completion"],["10–42","Rental Floors"]],
    kicker: "1016 NE 2nd Avenue",
    h2: "Rentals in the middle of Miami Worldcenter",
    body: [
      "JEM rises more than 700 feet over Miami Worldcenter, the district that reshaped the north end of Downtown. Brightline at MiamiCentral, the Kaseya Center and Bayside are all within a few blocks.",
      "The tower is split in two: 259 condominiums for sale on the upper floors, and 530 rental apartments on floors 10 through 42. So far Naftali's marketing has covered only the condos, which is why rental pricing isn't public yet."
    ],
    cards: [
      ["One landlord, not 530 owners","The rental floors are run by one management company, so you're not renting a condo from an individual owner who can sell or move back in."],
      ["Worldcenter at your door","Restaurants, shops and the Brightline station are inside the district, a short walk from the lobby."],
      ["See rents before they're advertised","JEM's rental pricing hasn't been published anywhere. Leave your details and you'll get it as soon as it is."]
    ],
    faq: [
      ["When do JEM rentals start leasing?","Construction is tracking to Q4 2027. Rental leasing usually starts as a building nears completion, and you'll be notified as soon as pricing is released."],
      ["Is this the condo tower?","Both. Floors 43 and above are JEM Private Residences condominiums for sale. Floors 10–42 are the 530 rental apartments this page covers."],
      ["How much will rent be?","Not yet published. Naftali's marketing to date has covered the condos only."],
      ["Who is the developer?","Naftali Group, a New York developer, building at 1016 NE 2nd Avenue within Miami Worldcenter."]
    ],
    moveIn: ["2027","2028","Flexible"],
    ctaH2: "Get JEM rental pricing first.",
    ctaP: "530 rental homes with no public pricing yet. We'll email you floor plans and rents as soon as Naftali releases them."
  },
  {
    domain: "kenectmiamiapartments.com", name: "Kenect Miami", short: "KENECT", accent: "MIAMI",
    captions: ["The Tower","Miami Worldcenter","Downtown Skyline"], credit: "Renderings courtesy of Akara Partners via Florida YIMBY",
    mode: "waitlist", palette: { ink:"#131a2b", a:"#ff6b4a", deep:"#c14127", pale:"#ffe9e3" },
    hood: "Miami Worldcenter", address: "Miami Worldcenter", zip: "33132", units: 450, stories: 39,
    developer: "Akara Partners", eta: "Under construction", etaShort: "TBA", delivers: null,
    chip: "Under Construction · Miami Worldcenter",
    h1: ["Kenect Miami:", "450 apartments", "with coworking", "downstairs."],
    sub: "Akara Partners' 39-story Kenect tower at Miami Worldcenter pairs compact apartments, with furnished options, with 20,000 sq ft of coworking in the same building. It's under construction and leasing dates haven't been announced.",
    ticker: ["39 stories","450 residences","20,000 sq ft coworking","Furnished options","Miami Worldcenter"],
    stats: [["450","Residences"],["39","Stories"],["20k","Sq Ft Coworking"],["10k","Sq Ft Retail"]],
    kicker: "Miami Worldcenter",
    h2: "Your apartment, office and gym in one building",
    body: [
      "Kenect is Akara Partners' live-work brand: compact, well-designed private apartments with optional furnishing, hospitality-style service and resident events. It already runs buildings in Chicago, Nashville and Phoenix.",
      "The Miami tower rises 39 stories inside Miami Worldcenter, with 450 residences, 20,000 square feet of coworking and 10,000 square feet of shops and restaurants. Perkins&Will designed it so your office, gym and apartment share an elevator bank."
    ],
    cards: [
      ["Compact by design","Smaller, efficient floor plans are the Kenect model. In its other cities that has meant lower rents than a conventional new one-bedroom nearby."],
      ["Coworking included","20,000 sq ft of real workspace in the building, not a lounge with a printer in the corner."],
      ["Move in with a suitcase","Furnished options mean you don't have to buy or ship a sofa to start your lease."]
    ],
    faq: [
      ["When does Kenect Miami start leasing?","The tower is under construction at Miami Worldcenter. Leasing dates haven't been announced, and you'll be told as soon as they are."],
      ["What is co-living, exactly?","At Kenect it means compact, well-designed private apartments with optional furnishing, shared amenity space and hospitality-style service. You get your own apartment, not a shared bedroom."],
      ["How much will rent be?","Miami pricing has not been released. Kenect's other markets start well under conventional new-construction rents for comparable locations."],
      ["Who is the developer?","Akara Partners, with architecture by Perkins&Will."]
    ],
    moveIn: ["As soon as possible","2027","Flexible"],
    ctaH2: "Get Kenect Miami pricing first.",
    ctaP: "450 residences with coworking downstairs, in the middle of Miami Worldcenter. We'll send rents and floor plans as soon as they're published."
  },
  {
    domain: "3333biscaynemiami.com", name: "3333 Biscayne", short: "3333", accent: "BISCAYNE",
    captions: ["The New Design","Three-Tower Master Plan","Edgewater Skyline"], credit: "Renderings courtesy of Beitel Group via Florida YIMBY and Floridian Development",
    mode: "waitlist", palette: { ink:"#10222b", a:"#4cc3a5", deep:"#1f7a66", pale:"#ddf6ef" },
    hood: "Edgewater", address: "3333 Biscayne Blvd", zip: "33137", units: 667, stories: 45,
    developer: "Beitel Group", eta: "2028", etaShort: "2028", delivers: "2028-01-01",
    chip: "In Permitting · First of Three Towers",
    h1: ["3333 Biscayne:", "667 new", "Edgewater", "apartments."],
    sub: "The first tower at 3333 Biscayne Boulevard is a 45-story rental building with 667 apartments in upper Edgewater, minutes from Midtown, Wynwood and the Design District. Beitel Group expects to deliver it in 2028.",
    ticker: ["45 stories","667 residences","Three-tower masterplan","Full city block","Delivering 2028"],
    stats: [["667","Residences"],["45","Stories"],["3","Tower Masterplan"],["2028","Target Delivery"]],
    kicker: "3333 Biscayne Boulevard",
    h2: "New apartments on a whole Edgewater block",
    body: [
      "Beitel Group is rebuilding the entire city block at 3333 Biscayne Boulevard as three towers. The first is a 45-story building with 667 apartments, garage parking and roughly 7,400 square feet of shops at street level.",
      "Site work and demolition are underway on approved permits, with the construction crane scheduled from December 2026 through July 2028. John Moriarty & Associates is the general contractor."
    ],
    cards: [
      ["667 apartments to choose from","The first tower alone has 667 homes, so there should be plenty of floors and layouts to pick from when leasing opens."],
      ["Upper Edgewater","North of the Arts & Entertainment District and minutes from Midtown, Wynwood and the Design District."],
      ["Hear about pricing early","Nothing is advertised yet. Leave your details and you'll get pricing as soon as pre-leasing opens."]
    ],
    faq: [
      ["When will 3333 Biscayne be finished?","The crane schedule runs December 2026 through July 2028, so delivery is expected in 2028. Pre-leasing typically opens several months ahead of completion."],
      ["Is this rental or condo?","The first tower is planned as residential rental. Beitel and Aimco have partnered on the site since 2022."],
      ["What about towers two and three?","The full block is master-planned for three towers. Only the first has filed a master construction permit so far."],
      ["Where exactly is it?","3333 Biscayne Boulevard, occupying the full block in Miami's Edgewater neighborhood."]
    ],
    moveIn: ["2028","2029","Flexible"],
    ctaH2: "Get 3333 Biscayne pricing first.",
    ctaP: "667 apartments in the first of three towers on one Edgewater block. We'll email you as soon as pre-leasing and pricing open."
  },
  {
    domain: "biscayne18.com", name: "Biscayne 18", short: "BISCAYNE", accent: "18",
    captions: ["The Towers","Lobby","Ground-Floor Retail"], credit: "Renderings courtesy of Melo Group / G3AEC via Florida YIMBY",
    mode: "waitlist", palette: { ink:"#0f1b2d", a:"#c9a84c", deep:"#8a6f22", pale:"#f6f0de" },
    hood: "Edgewater", address: "331 NE 18th St", zip: "33132", units: 1178, stories: 46,
    developer: "Melo Group", eta: "2029–2030", etaShort: "2029+", delivers: "2029-01-01",
    chip: "Permits Filed · Nearing Groundbreaking",
    h1: ["Biscayne 18:", "1,178 new", "apartments in", "Edgewater."],
    sub: "Melo Group's twin 46-story towers at 331 NE 18th Street will add 1,178 rental homes two blocks from Margaret Pace Park and the bay. Permits are filed and delivery is expected around 2029–2030. Leave your details to get pricing when Melo releases it.",
    ticker: ["Twin 46-story towers","1,178 rental residences","589 per tower","Two blocks from the bay","Permits filed 2026"],
    stats: [["1,178","Rental Homes"],["46","Stories Each"],["2","Towers"],["2 blocks","To the Bay"]],
    kicker: "331 NE 18th Street",
    h2: "Two towers, two blocks from the bay",
    body: [
      "Biscayne 18 fills a 1.57-acre block bounded by Biscayne Boulevard, NE 18th Street, NE 4th Avenue and NE 19th Street. Two 46-story towers rise 465 feet above an eight-level parking podium, wrapped in apartments so the garage stays out of sight.",
      "The plan has 1,178 rental apartments, 589 in each tower, with roughly 24,930 square feet of shops at street level and 1,472 parking spaces. G3AEC is the architect. Margaret Pace Park and the bay are two blocks east."
    ],
    cards: [
      ["From the developer of Downtown 5th","Melo Group also built Downtown 1st, Downtown 5th, Art Plaza, Square Station and Melody Towers, and runs its own rental buildings."],
      ["Shops and parking on site","About 24,930 sq ft of street-level retail and 1,472 parking spaces are part of the plan."],
      ["Pricing as soon as it exists","No rents have been published, and won't be for some time. Leave your details and you'll get them when Melo releases them."]
    ],
    faq: [
      ["When will Biscayne 18 be ready?","Construction permits were filed in 2026 and the project is nearing groundbreaking. Twin 46-story towers typically take about three years to build, which puts delivery around 2029–2030."],
      ["Is it rental or condo?","Rental. Melo Group builds and holds rental towers, and the filings describe 1,178 rental units."],
      ["How much will rent be?","Melo hasn't published rents and won't for some time. Leave your details and you'll get them as soon as it does."],
      ["Where exactly is it?","331 NE 18th Street, on the block bounded by Biscayne Boulevard, NE 18th Street, NE 4th Avenue and NE 19th Street in Edgewater."],
      ["Why sign up this early?","Melo releases pricing with little notice, and its lease-ups tend to move quickly. Signing up means you hear as soon as pricing is out."]
    ],
    moveIn: ["2029","2030","Flexible"],
    ctaH2: "Get Biscayne 18 pricing first.",
    ctaP: "1,178 apartments in two towers on one Edgewater block. We'll email you when Melo releases the first real pricing."
  },
  {
    domain: "urban22edgewater.com", name: "Urban 22", short: "URBAN", accent: "22",
    captions: ["Pool Deck","Residences","Balcony Views"], credit: "Photography courtesy of Melo Group / Urban 22",
    // Opened in 2023. Until 2026-09-21 this entry ran "topped off · leasing
    // soon" against an invented 2026-11-01 delivery date — a waitlist for a
    // building that had been leasing for three years on apartments.com,
    // Zillow and its own site (urban22miami.com, 305.377.2200). It was written
    // from 2021–22 construction coverage and never re-checked against a
    // listing site. The stale-waitlist guard could not catch it because the
    // date it was guarding was fiction. Now an availability page.
    mode: "availability", palette: { ink:"#151d2e", a:"#6c8cff", deep:"#3b52b8", pale:"#e6ebff" },
    hood: "Edgewater", address: "2222 NE 2nd Ave", zip: "33137", units: 441, stories: 15,
    developer: "Melo Group", eta: "Leasing now", etaShort: "Now", year: 2023,
    verified: "2026-09-21",
    prices: { checked: "2026-10-13", source: "Zillow and Redfin", basis: "base rent, before required fees" },
    chip: "Open · Leasing Now",
    h1: ["Urban 22:", "Edgewater apartments", "with a balcony", "in every home."],
    sub: "One- to three-bedroom apartments of roughly 640 to 1,370 sq ft at 2222 NE 2nd Avenue, a few blocks from Margaret Pace Park, with a pool, a 2,100 sq ft gym and a market café downstairs.",
    ticker: ["Opened 2023","441 residences","1, 2 & 3 bedrooms","640–1,370 sq ft","Pool, gym & market café","Leasing now"],
    stats: [["$2,275+","1 Beds From"],["$2,950+","2 Beds From"],["$3,700+","3 Beds From"],["441","Residences"]],
    kicker: "2222 NE 2nd Avenue",
    h2: "Room to spread out in Edgewater",
    body: [
      "Urban 22 is two 15-story buildings with 441 rental apartments: 4 studios, 243 one-bedrooms, 152 two-bedrooms and 42 three-bedrooms, from roughly 640 to 1,370 square feet. Every apartment has its own glass-railed balcony.",
      "Downstairs there's a pool and jacuzzi deck, a 2,100 sq ft fitness center, a lounge with a market café, about 7,000 sq ft of shops and 529 parking spaces. Margaret Pace Park and the bay are a few blocks east, with Midtown and Wynwood just to the west."
    ],
    cards: [
      ["Bigger two- and three-bedrooms","At up to 1,370 sq ft, the larger layouts give you more room than most new Miami buildings, where studios under 500 sq ft are common."],
      ["Pool, gym and café downstairs","A pool and jacuzzi deck, a 2,100 sq ft fitness center and a lounge with a market café, without leaving the building."],
      ["Edgewater rents","One-bedrooms were listed from about $2,275 a month on October 13, 2026. Tell us your budget and we'll tell you what fits."]
    ],
    faq: [
      ["Is Urban 22 leasing now?","Yes. It opened in 2023 and apartments come open regularly. Tell us your bedroom count and move-in date and we'll check what's available."],
      ["How much is rent at Urban 22?","When we checked Zillow and Redfin on October 13, 2026, one-bedrooms were listed from about $2,275 a month, one-bedrooms with a den from about $2,450, two-bedrooms from about $2,950 and three-bedrooms from about $3,700, before required fees. Prices change daily with size and floor, so send your budget and we'll tell you what fits today."],
      ["How big are the apartments?","Roughly 640 to 1,370 square feet: 4 studios, 243 one-bedrooms, 152 two-bedrooms and 42 three-bedrooms."],
      ["What amenities are there?","A pool and jacuzzi deck, a 2,100 sq ft fitness center, a lounge with a market café, ground-floor shops and on-site parking."],
      ["Where is Urban 22?","2222 NE 2nd Avenue in Miami's Edgewater neighborhood, between Midtown and Margaret Pace Park."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Next 90 days","Flexible"],
    ctaH2: "Find your apartment at Urban 22.",
    ctaP: "Tell us your bedroom count, budget and move-in date. We'll come back with what's open at Urban 22 and what it costs today."
  },
  {
    domain: "downtown5miami.com", name: "Downtown 5th", short: "DOWNTOWN", accent: "5TH",
    captions: ["Resident Lounge","Kitchens","Fitness Center"], credit: "Photography courtesy of Melo Group / Downtown 5th",
    mode: "availability", palette: { ink:"#0c1c26", a:"#00b3a4", deep:"#00776d", pale:"#d9f5f2" },
    hood: "Downtown Miami", address: "55 NE 5th St", zip: "33132", units: 1042, stories: 52,
    developer: "Melo Group", eta: "Leasing now", etaShort: "Now",
    prices: { checked: "2026-10-13", source: "Zillow", basis: "base rent, before required fees" },
    chip: "Open · Leasing Now",
    h1: ["Downtown 5th:", "1,042 apartments", "in the heart of", "Downtown Miami."],
    sub: "Melo Group's twin 52-story towers at 25 and 55 NE 5th Street, with the Metromover at the door. One- to three-bedroom homes from about 615 sq ft. Tell us what you need and we'll check what's open.",
    ticker: ["Twin 52-story towers","1,042 residences","615–1,900 sq ft","Metromover at the door","Leasing now"],
    stats: [["$2,050+","1 Beds From"],["$2,975+","2 Beds From"],["1,042","Residences"],["52","Stories ×2"]],
    kicker: "25 & 55 NE 5th Street",
    h2: "The biggest rental address in the CBD",
    body: [
      "Downtown 5th is two 52-story towers holding 1,042 apartments and roughly 12,500 square feet of ground-floor retail, directly beside the Metromover's College North station. One-, two- and three-bedroom homes run from about 615 to 1,900 square feet.",
      "It sits in the heart of Downtown's central business district, walking distance to Brickell, Bayside, the Kaseya Center and the Brightline station at MiamiCentral. On October 13, 2026, Zillow listed one-bedrooms from about $2,050 a month, two-bedrooms from about $2,975 and three-bedrooms from about $3,600."
    ],
    cards: [
      ["Plenty to choose from","With 1,042 apartments across two towers, something is almost always coming open."],
      ["Transit at the door","The Metromover College North station is at the building; Brightline at MiamiCentral is a short walk."],
      ["Walk to work and the game","Brickell, Bayside and the Kaseya Center are all within walking distance, so a lot of days don't need the car."]
    ],
    faq: [
      ["Is Downtown 5th leasing now?","Yes. It's an open building and apartments come open regularly. Tell us your bedroom count and move-in date and we'll check what's available."],
      ["How much is rent at Downtown 5th?","When we checked Zillow on October 13, 2026, one-bedrooms were listed from about $2,050 a month, two-bedrooms from about $2,975 and three-bedrooms from about $3,600, before required fees. Prices change daily, so send your budget and we'll tell you what fits today."],
      ["How big are the apartments?","One-, two- and three-bedroom layouts from roughly 615 to 1,900 square feet."],
      ["Where exactly is it?","25 and 55 NE 5th Street, in Downtown Miami's central business district."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Next 90 days","Flexible"],
    unitTypes: ["1 Bedroom","2 Bedroom","3 Bedroom","Not sure yet"],
    ctaH2: "Find your apartment at Downtown 5th.",
    ctaP: "Tell us your bedroom count, budget and move-in date and we'll come back with what's open at Downtown 5th and what it costs today."
  },
  {
    domain: "panoramatowerbrickell.com", name: "Panorama Tower", short: "PANORAMA", accent: "TOWER",
    captions: ["Pool Deck","Balcony Views","Brickell Bay Drive"], credit: "Photography courtesy of Panorama Tower / Florida East Coast Realty",
    mode: "availability", palette: { ink:"#0b1626", a:"#7ab8ff", deep:"#2a6fb5", pale:"#e2f0ff" },
    hood: "Brickell", address: "1100 Brickell Bay Dr", zip: "33131", units: 821, stories: 85,
    developer: "Florida East Coast Realty", eta: "Leasing now", etaShort: "Now",
    prices: { checked: "2026-10-13", source: "Redfin" },
    chip: "Open · Leasing Now",
    h1: ["Panorama Tower:", "821 apartments,", "a view from", "every one."],
    sub: "One- to three-bedroom rentals of roughly 1,125 to 2,191 sq ft at 1100 Brickell Bay Drive, with floor-to-ceiling glass in every home and more than 100,000 sq ft of amenities. Tell us what you're looking for and we'll check what's open.",
    ticker: ["85 stories","821 residences","100,000+ sq ft amenities","1,125–2,191 sq ft","Brickell Bay Drive"],
    stats: [["$4,625+","1 Beds From"],["821","Residences"],["85","Stories"],["100k+","Sq Ft Amenities"]],
    kicker: "1100 Brickell Bay Drive",
    h2: "Miami's tallest rental address",
    body: [
      "Panorama Tower rises 85 stories above Biscayne Bay — the tallest multifamily building on the eastern seaboard south of New York. Its 821 rental residences run roughly 1,125 to 2,191 square feet, with floor-to-ceiling glass and expansive private terraces in every home.",
      "More than 100,000 square feet of amenities include multiple pools, a full fitness and wellness floor, resident programming, pet-friendly spaces and on-site restaurants and lounges. Brickell City Centre, Mary Brickell Village and the financial district are all walkable."
    ],
    cards: [
      ["Apartments at condo scale","At 1,125–2,191 sq ft, Panorama's floor plans are larger than nearly anything else renting new in Brickell."],
      ["Views from every unit","Floor-to-ceiling glass on all sides means bay, ocean or skyline from every residence — not a premium tier."],
      ["Amenity floor, not a room","Over 100,000 sq ft, including multiple pools and a dedicated wellness level."]
    ],
    faq: [
      ["Is Panorama Tower leasing now?","Yes. It's an open rental building with 821 apartments, and homes come open regularly. Send your bedroom count and move-in date and we'll check what's available."],
      ["How much is rent at Panorama Tower?","When we checked Redfin on October 13, 2026, one-bedrooms were listed from about $4,625 a month, two-bedrooms from about $5,110 and three-bedrooms from about $10,365. Prices change daily with floor and view, so send your budget and we'll check today's."],
      ["How big are the apartments?","Roughly 1,125 to 2,191 square feet — one, two and three bedrooms."],
      ["Where exactly is it?","1100 Brickell Bay Drive, on the bay side of Brickell."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Next 90 days","Flexible"],
    ctaH2: "Find your apartment at Panorama Tower.",
    ctaP: "821 apartments across 85 floors. Tell us your bedroom count, budget and move-in date and we'll come back with what's open and what it costs today."
  },
  {
    domain: "maizonbrickell.com", name: "Maizon Brickell", short: "MAIZON", accent: "BRICKELL",
    captions: ["Resident Lounge","Kitchens","Balcony Views"], credit: "Photography courtesy of Maizon Brickell / ZRS Management",
    mode: "availability", palette: { ink:"#1c1620", a:"#d4885f", deep:"#a35a32", pale:"#fbeee6" },
    hood: "Brickell", address: "221 SW 12th St", zip: "33130", units: 0, stories: 19,
    developer: "", eta: "Leasing now", etaShort: "Now", year: 2019,
    prices: { checked: "2026-10-13", source: "the leasing office's online floor plans", basis: "total monthly price including required fees" },
    chip: "Open · Leasing Now",
    h1: ["Maizon Brickell:", "boutique living", "on Brickell's", "quieter side."],
    sub: "A 19-story rental built in 2019 at 221 SW 12th Street, walkable to Mary Brickell Village, Brickell City Centre and the Metromover. Junior one-bedrooms to three-bedroom penthouses. Tell us what you need and we'll check what's open.",
    ticker: ["Built 2019","19 stories","Junior 1 to 3-bedroom penthouses","Walk to Brickell City Centre","Leasing now"],
    stats: [["$2,829+","1 Beds From"],["19","Stories"],["2019","Built"],["531–1,952","Sq Ft"]],
    kicker: "221 SW 12th Street",
    h2: "Brickell, without the megatower",
    body: [
      "Maizon Brickell is a 19-story rental building completed in 2019 on SW 12th Street, in the quieter western pocket of Brickell, a few minutes' walk from Mary Brickell Village, Brickell City Centre and the Metromover.",
      "Homes run from 531 sq ft junior one-bedrooms to 1,952 sq ft three-bedroom penthouses. When we checked on October 13, 2026, the leasing office listed one-bedrooms from about $2,829 a month and two-bedrooms from about $3,767, including required fees."
    ],
    cards: [
      ["Junior 1s to penthouses","Layouts from 531 sq ft junior one-bedrooms and 664 sq ft one-bedrooms up to 1,952 sq ft three-bedroom penthouses."],
      ["Boutique, not a megatower","19 floors means fewer neighbors, shorter elevator waits and a quieter building."],
      ["Walk to everything","Mary Brickell Village, Brickell City Centre, the Metromover and the Miami River are all within a short walk."]
    ],
    faq: [
      ["Is Maizon Brickell leasing now?","Yes. It's an open rental building and homes come open regularly. Send your bedroom count and move-in date and we'll check what's available."],
      ["How much is rent at Maizon Brickell?","When we checked on October 13, 2026, the leasing office listed one-bedrooms from about $2,829 a month and two-bedrooms from about $3,767, including required monthly fees. Prices change daily, so send your budget and we'll check today's."],
      ["Are there move-in specials?","On October 13, 2026, ApartmentList showed one month free on select junior one-bedroom and one-bedroom homes, with restrictions. Specials change often; ask and we'll check what's on today."],
      ["When was it built?","2019 — 19 stories at 221 SW 12th Street."],
      ["Where exactly is it?","221 SW 12th Street, in the western part of Brickell."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    ctaH2: "Find your apartment at Maizon Brickell.",
    ctaP: "Tell us your bedroom count, budget and move-in date and we'll come back with what's open at Maizon and what it costs today."
  },
  {
    domain: "muzemet.com", name: "Muze at Met", short: "MUZE", accent: "AT MET",
    captions: ["Kitchens","Residences","The View"], credit: "Photography courtesy of Muze at Met / ZRS Management",
    mode: "availability", palette: { ink:"#171425", a:"#a98bff", deep:"#6a4bc4", pale:"#efe9ff" },
    hood: "Downtown Miami", address: "340 SE 3rd St", zip: "33131", units: 391, stories: 0,
    developer: "", eta: "Leasing now", etaShort: "Now",
    prices: { checked: "2026-10-13", source: "the leasing office's online floor plans", basis: "total monthly price including required fees" },
    chip: "Open · Leasing Now",
    h1: ["Muze at Met:", "391 apartments", "above a cinema", "and restaurants."],
    sub: "Muze at Met sits inside Metropolitan Miami, a downtown complex with an 18-screen Silverspot cinema, restaurants and shops beneath the apartments. Studios to three-bedrooms, between Downtown and Brickell.",
    ticker: ["391 residences","Studios to 3 bedrooms","18-screen Silverspot cinema","Four restaurants","Leasing now"],
    stats: [["$2,735+","Studios From"],["391","Residences"],["519–1,410","Sq Ft"],["18","Cinema Screens"]],
    kicker: "340 SE 3rd Street",
    h2: "A building with a neighborhood built into it",
    body: [
      "Muze is the 391-residence rental tower within Metropolitan Miami, a 714,000-square-foot mixed-use complex in the southern end of Downtown. An 18-screen Silverspot cinema, four restaurants and a retail plaza sit directly beneath the apartments.",
      "The location bridges Downtown and Brickell — Brickell City Centre is a short walk south, Bayfront Park and the Kaseya Center a few blocks north, with Metromover stations either direction."
    ],
    cards: [
      ["Dinner and a movie downstairs","An 18-screen cinema, four restaurants and shops are inside the complex, right below the apartments."],
      ["Between Downtown and Brickell","Walkable to both, which almost nothing else manages without a long bridge crossing."],
      ["Studios to three-bedrooms","Layouts from 519 sq ft studios and 681 sq ft one-bedrooms up to 1,410 sq ft three-bedrooms."]
    ],
    faq: [
      ["Is Muze at Met leasing now?","Yes. It's an open rental building and homes come open regularly. Send your bedroom count and move-in date and we'll check what's available."],
      ["How much is rent at Muze at Met?","When we checked on October 13, 2026, studios were listed from about $2,735 a month, one-bedrooms from about $2,834, two-bedrooms from about $3,934 and three-bedrooms from about $5,279, including required monthly fees. Prices change daily, so send your budget and we'll check today's."],
      ["Are there move-in specials?","On October 13, 2026, ApartmentList and Zumper showed up to two months free. Specials change often; ask and we'll check what's on today."],
      ["What is Metropolitan Miami?","A 714,000 sq ft mixed-use complex containing Muze, an 18-screen Silverspot cinema, four restaurants and retail."],
      ["Where exactly is it?","340 SE 3rd Street, in the southern end of Downtown Miami near the Brickell line."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    ctaH2: "Find your apartment at Muze at Met.",
    ctaP: "Tell us your bedroom count, budget and move-in date and we'll come back with what's open at Muze and what it costs today."
  },
  {
    domain: "remitheriver.com", name: "Remi on the River", short: "REMI", accent: "ON THE RIVER",
    captions: ["Resident Lounge","Bedrooms","Downtown, Minutes Away"], credit: "Photography courtesy of Greystar / Remi on the River",
    mode: "availability", palette: { ink:"#0e1f22", a:"#58c6a8", deep:"#22806a", pale:"#ddf6ef" },
    hood: "Miami River District", address: "999 NW 7th St", zip: "33136", units: 342, stories: 0,
    developer: "Greystar", eta: "Leasing now", etaShort: "Now",
    prices: { checked: "2026-10-13", source: "the leasing office's online floor plans", basis: "total monthly price including required fees" },
    chip: "Open · Leasing Now",
    h1: ["Remi on the River:", "342 apartments", "minutes from", "Downtown."],
    sub: "Greystar's Remi on the River sits in Miami's River District, minutes from Downtown, the Health District and Little Havana, with studios to three-bedrooms. Tell us what you need and we'll check what's open.",
    ticker: ["342 residences","Studios to 3 bedrooms","Greystar-managed","Miami River District","Leasing now"],
    stats: [["$2,224+","Studios From"],["$2,608+","1 Beds From"],["342","Residences"],["Greystar","Management"]],
    kicker: "999 NW 7th Street",
    h2: "Close to Downtown, on the quieter side of the river",
    body: [
      "Remi on the River has 342 rental apartments in the Miami River District, the stretch just west of Downtown, minutes from the central business district, the Health District and Little Havana.",
      "It's managed by Greystar, the largest apartment operator in the country. When we checked on October 13, 2026, the leasing office listed studios from about $2,224 a month and one-bedrooms from about $2,608, including required fees."
    ],
    cards: [
      ["Studios to three-bedrooms","Layouts from 465 sq ft studios and 659 sq ft one-bedrooms up to 1,334 sq ft three-bedrooms."],
      ["Professional management","Greystar operates more apartments than any other company in the US; leasing and maintenance run to a national standard."],
      ["The river side","Quieter streets, quick access to I-95 and the Dolphin, and the Health District a few minutes north."]
    ],
    faq: [
      ["Is Remi on the River leasing now?","Yes. It's an open rental building with 342 apartments, and homes come open regularly. Send your bedroom count and move-in date and we'll check."],
      ["How much is rent at Remi on the River?","When we checked on October 13, 2026, the leasing office listed studios from about $2,224 a month, one-bedrooms from about $2,608, two-bedrooms from about $3,188 and three-bedrooms from about $4,549, including required monthly fees. Prices change daily, so send your budget and we'll check today's."],
      ["Who manages it?","Greystar, the largest apartment manager in the United States."],
      ["Where exactly is it?","999 NW 7th Street, in Miami's River District just west of Downtown."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    ctaH2: "Find your apartment at Remi.",
    ctaP: "Tell us your bedroom count, budget and move-in date and we'll come back with what's open at Remi and what it costs today."
  },
  {
    domain: "artplazaapartments.com", name: "Art Plaza", short: "ART", accent: "PLAZA",
    captions: ["Pool Deck","Resident Lounge","The View"], credit: "Photography courtesy of Melo Group / Art Plaza",
    mode: "availability", palette: { ink:"#1b1522", a:"#ff7ab8", deep:"#c43e81", pale:"#ffe8f3" },
    hood: "Arts & Entertainment District", address: "58 NE 14th St", zip: "33132", units: 667, stories: 36,
    developer: "Melo Group", eta: "Leasing now", etaShort: "Now", year: 2019,
    chip: "Open · Leasing Now",
    h1: ["Art Plaza:", "667 apartments", "steps from the", "Arsht Center."],
    sub: "Melo Group's Art Plaza opened in 2019 on NE 14th Street in the Arts & Entertainment District, walking distance to the Adrienne Arsht Center, Museum Park and the bay. Tell us what you're looking for and we'll check what's open.",
    ticker: ["667 residences","Opened 2019","Arts & Entertainment District","Walk to Arsht Center","Leasing now"],
    stats: [["667","Residences"],["2019","Opened"],["A&E","District"],["Melo","Developer"]],
    kicker: "NE 14th Street",
    h2: "Between the Arsht Center and the bay",
    body: [
      "Art Plaza has 667 rental apartments in the Arts & Entertainment District. It opened in 2019 as one of Melo Group's largest downtown buildings, on NE 14th Street between Biscayne Boulevard and the Metromover.",
      "The Adrienne Arsht Center for the Performing Arts is a few minutes on foot, with Museum Park, the Frost Science Museum and PAMM just south along the bay. Edgewater, Wynwood and the Design District are all a short ride north."
    ],
    cards: [
      ["Plenty to choose from","With 667 apartments, something usually comes open across the bedroom counts."],
      ["Culture on foot","The Arsht Center, PAMM and Frost Science are all within walking distance, so a show or a museum doesn't need a car."],
      ["On the Metromover line","The free Metromover is a short walk away and connects you to Downtown and Brickell."]
    ],
    faq: [
      ["Is Art Plaza leasing now?","Yes. It's an open building with 667 apartments, and homes come open regularly. Tell us your bedroom count and move-in date and we'll check."],
      ["How much is rent at Art Plaza?","Prices change week to week with size, floor and lease term. Send your budget and we'll tell you what fits today."],
      ["When did it open?","June 2019, developed by Melo Group."],
      ["Where exactly is it?","NE 14th Street in Miami's Arts & Entertainment District, just north of Downtown."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    unitTypes: ["1 Bedroom","2 Bedroom","Not sure yet"],
    ctaH2: "Find your apartment at Art Plaza.",
    ctaP: "667 apartments in the Arts & Entertainment District. Tell us your bedroom count, budget and move-in date and we'll come back with what's open and what it costs today."
  },
  {
    domain: "miamiworldtowerapartments.com", name: "Miami World Tower", short: "MIAMI WORLD", accent: "TOWER",
    captions: ["Pool Deck","Dining with a View","Balcony Views"], credit: "Photography courtesy of Miami World Tower",
    mode: "availability", palette: { ink:"#101a2c", a:"#f2b544", deep:"#b07d12", pale:"#fdf2d9" },
    hood: "Miami Worldcenter", address: "710 NE 1st Ave", zip: "33132", units: 560, stories: 0,
    developer: "Lalezarian Properties", eta: "Leasing now", etaShort: "Now",
    prices: { checked: "2026-10-13", source: "the leasing office's online floor plans", basis: "total monthly price including required fees" },
    chip: "Open · Leasing Now",
    h1: ["Miami World Tower:", "560 apartments", "in Miami", "Worldcenter."],
    sub: "Lalezarian Properties' rental tower at 710 NE 1st Avenue, with Brightline, the Kaseya Center and Worldcenter's shops and restaurants all within a few blocks.",
    ticker: ["560 residences","Miami Worldcenter","Walk to Brightline","Kaseya Center nearby","Leasing now"],
    stats: [["$2,750+","Studios From"],["$3,330+","1 Beds From"],["560","Residences"],["Now","Leasing"]],
    kicker: "710 NE 1st Avenue",
    h2: "Inside the district, not near it",
    body: [
      "Miami World Tower has 560 rental apartments and roughly 3,100 square feet of street-level retail inside Miami Worldcenter, the 27-acre district that reshaped the northern end of Downtown Miami.",
      "Brightline at MiamiCentral runs to Fort Lauderdale, Boca, West Palm Beach and Orlando from a few blocks away. The Kaseya Center, Bayside and the Arts & Entertainment District are all within walking distance."
    ],
    cards: [
      ["Brightline on foot","MiamiCentral is a short walk — Fort Lauderdale in 30 minutes, Orlando without driving."],
      ["Worldcenter retail","The district's restaurants and shops are part of the neighborhood, not a drive away."],
      ["Up to 1.5 months free","On October 13, 2026, the leasing office was advertising up to one and a half months free. Specials change often, so ask what's on today."]
    ],
    faq: [
      ["Is Miami World Tower leasing now?","Yes. It's an open rental building. Send your bedroom count and move-in date and we'll check what's available."],
      ["How much is rent at Miami World Tower?","When we checked on October 13, 2026, the leasing office listed studios from about $2,750 a month, one-bedrooms from about $3,330 and two-bedrooms from about $5,450, including required monthly fees, with up to 1.5 months free advertised. Prices change daily, so send your budget and we'll tell you what fits today."],
      ["Who is the developer?","Lalezarian Properties, at 710 NE 1st Avenue within Miami Worldcenter."],
      ["What is Miami Worldcenter?","A 27-acre, $6 billion mixed-use district in Downtown Miami with residential towers, retail, restaurants and hotels."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    unitTypes: ["Studio","1 Bedroom","2 Bedroom","Not sure yet"],
    ctaH2: "Find your apartment at Miami World Tower.",
    ctaP: "560 apartments inside Miami Worldcenter. Tell us your bedroom count, budget and move-in date and we'll come back with what's open and what it costs today."
  },
  // --- Wave 3, added 2026-09-21 -------------------------------------------
  // Two buildings, four domains. mohawkwynwood.com / mohawkmiami.com are both
  // Mohawk at Wynwood, and neoedgewatermiami.com is the same building as
  // 2600biscaynemiami.com. Each pair is written as two genuinely different
  // pages aimed at different searches, never a copy under a second name:
  // near-duplicate pages get filtered by Google and the cost is the one that
  // was ranking. If a pair ever needs consolidating, 301 the weaker domain at
  // the stronger one rather than letting both drift into the same page.
  {
    domain: "mohawkwynwood.com", name: "Mohawk at Wynwood", short: "MOHAWK", accent: "AT WYNWOOD",
    captions: ["Street Elevation","The Paseo","The Site Today"], credit: "Renderings courtesy of Rilea Group",
    // The neighborhood search: "mohawk wynwood apartments". Exact-match domain
    // for the building name, and Rilea has published no leasing site — the same
    // pairing that made downtown6miami.com the portfolio's only real earner.
    mode: "waitlist", palette: { ink:"#1d1410", a:"#e0774a", deep:"#a84f27", pale:"#fde9de" },
    hood: "Wynwood", address: "56 NE 29th St", zip: "33137", units: 300, stories: 0,
    developer: "Rilea Group", eta: "2028", etaShort: "'28", delivers: "2028-01-01",
    verified: "2026-09-21",
    chip: "Under Construction · Delivering 2028",
    h1: ["Mohawk at Wynwood:", "300 loft-style", "rentals on the", "edge of Wynwood."],
    sub: "300 brick-and-steel rentals by Rilea Group at 56 NE 29th Street, where Wynwood meets Edgewater, with shops and restaurants at street level. Completion is set for 2028.",
    ticker: ["300 residences","Studios to three bedrooms","Lanai homes with private yards","30,000 sq ft retail","Delivering 2028"],
    stats: [["300","Residences"],["2028","Completion"],["30k","Sq Ft Retail"],["1.5","Acre Site"]],
    kicker: "56 NE 29th Street",
    h2: "The Wynwood building that looks like Wynwood",
    body: [
      "Mohawk sits on a 1.5-acre site on NE 29th Street, at the seam where the Wynwood Arts District runs into Edgewater — walkable to the murals along NW 2nd Avenue in one direction, to Midtown's shops and the bay in the other.",
      "Deforma Studio and RADYCA designed it in Chicago brick, exposed steel detailing and floor-to-ceiling glazing rather than the white stucco-and-glass template most of the corridor is built from. The 300 residences run studio to three-bedroom, including lanai homes with private outdoor space at the base of the building."
    ],
    cards: [
      ["Lanai homes","Ground-floor homes with their own private outdoor yards: rare in a Miami rental building, and usually the first to go."],
      ["One landlord, not a condo owner","All 300 homes are rentals run by one management company. Much of what's advertised in Wynwood today is an individual owner's condo on a one-year lease."],
      ["Shops that open with it","About a third of the 30,000 sq ft of street-level retail was already spoken for during construction, so the shops and restaurants should arrive with the building, not years later."]
    ],
    faq: [
      ["When does Mohawk at Wynwood start leasing?","Construction is financed and underway, with completion set for 2028. Leasing usually opens as a building nears completion, and you'll get an email the day pricing is published."],
      ["How much will rent be?","Nothing has been published. Rilea hasn't released rents, floor plans or a leasing site for Mohawk yet. Leave your details and you'll get them first."],
      ["What is a lanai unit?","A ground-connected residence with its own private outdoor space — a small yard rather than a balcony. Mohawk includes a set of them at the base of the building."],
      ["Where exactly is it?","A 1.5-acre site at 56 NE 29th Street, on the northern edge of the Wynwood Arts District at the Edgewater line."],
      ["Who is the developer?","Rilea Group, a Miami developer led by Alan and Diego Ojeda, with architecture by Deforma Studio and RADYCA and construction by Coastal Construction."]
    ],
    moveIn: ["2028","2029","Flexible"],
    ctaH2: "Get Mohawk at Wynwood pricing first.",
    ctaP: "300 apartments with no published pricing and no leasing office to call yet. We'll email you floor plans and rents the day Rilea releases them."
  },
  {
    domain: "mohawkmiami.com", name: "Mohawk at Wynwood", short: "MOHAWK", accent: "MIAMI",
    captions: ["The Paseo","NE 29th Street","Skyline Aerial"], credit: "Renderings courtesy of Rilea Group",
    // Overridden because mohawkwynwood.com covers the same building: left to
    // derive, both pages would ship the identical title and description.
    title: "Mohawk Miami — Wynwood Rental Apartments",
    ogTitle: "Mohawk Miami — Wynwood Rentals & Amenities",
    desc: "Mohawk at Wynwood: 300 rentals at 56 NE 29th St by Rilea Group, with a hammam spa, padel court and rooftop dog park. Get pricing and floor plans first.",
    // Same building as mohawkwynwood.com, deliberately a different page: this
    // one is written for the amenity-and-comparison search ("mohawk miami
    // apartments"), that one for the neighborhood search. Different palette,
    // different image pool, different copy top to bottom.
    mode: "waitlist", palette: { ink:"#131b1a", a:"#5cc2a4", deep:"#2a7d66", pale:"#dcf5ec" },
    hood: "Wynwood", address: "56 NE 29th St", zip: "33137", units: 300, stories: 0,
    developer: "Rilea Group", eta: "2028", etaShort: "'28", delivers: "2028-01-01",
    verified: "2026-09-21",
    chip: "Under Construction · Rentals Delivering 2028",
    h1: ["Mohawk Miami:", "a hammam, padel", "and a rooftop", "dog park at home."],
    sub: "Mohawk is Rilea Group's 300-apartment rental on NE 29th Street in Wynwood, with an amenity deck that reads like a members' club. Rents haven't been published yet. Leave your details and you'll get them first.",
    ticker: ["Turkish hammam spa","Cold plunge & infrared sauna","Padel court","Rooftop pools & lounges","Rooftop dog park","Co-working"],
    stats: [["300","Residences"],["Studio–3BR","Unit Mix"],["Padel","Court On Site"],["2028","Completion"]],
    kicker: "Amenities at Mohawk",
    h2: "Amenities you'd usually pay a club for",
    body: [
      "Most Miami rental buildings stop at a pool, a gym and a lounge. Mohawk's list is longer: rooftop pools and lounges, a padel court, a Turkish hammam spa with cold plunges and infrared saunas, co-working space, children's play areas and a rooftop dog park.",
      "Rilea Group is building it on 1.5 acres at 56 NE 29th Street, on the line between Wynwood and Edgewater, for completion in 2028. Homes run from studios to three bedrooms, including lanai homes with their own outdoor space."
    ],
    cards: [
      ["A spa, not a sauna closet","A Turkish hammam with cold plunges and infrared saunas is a hotel amenity. Almost no Miami rental building has one."],
      ["Padel, downstairs","Court time in Miami books up fast. Here the court is in your building."],
      ["Built for living, not touring","Children's play areas and a rooftop dog park sit alongside the spa: amenities for people who plan to stay."]
    ],
    faq: [
      ["What amenities will Mohawk at Wynwood have?","Rooftop pools and lounges, a padel court, a Turkish hammam spa with cold plunges and infrared saunas, co-working space, children's play areas and a rooftop dog park, plus 30,000 square feet of ground-floor retail."],
      ["When can I rent at Mohawk?","Construction is underway with completion set for 2028. Leasing normally opens as a building nears completion, and you'll get an email the day pricing is released."],
      ["How much will it cost?","No rents have been published. With this amenity list, expect pricing near the top of the Wynwood rental market. Leave your details and you'll get the actual numbers first."],
      ["How many apartments are there?","300 residences, studio through three-bedroom, including lanai homes with private outdoor space."],
      ["Who is building it?","Rilea Group, with architecture by Deforma Studio and RADYCA and construction by Coastal Construction, at 56 NE 29th Street in Miami."]
    ],
    moveIn: ["2028","2029","Flexible"],
    ctaH2: "Get Mohawk pricing first.",
    ctaP: "A hammam, a padel court and 300 apartments with no published price yet. We'll email you the day Rilea releases rents."
  },
  {
    domain: "2900terrace.com", name: "2900 Terrace", short: "2900", accent: "TERRACE",
    captions: ["Rooftop Pool","Street Level","Over the Bay"], credit: "Renderings courtesy of Oak Row Equities and LNDMRK Development via Florida YIMBY",
    // Exact-match domain for the building name, and the developers have
    // published no leasing site — 2900terrace.com and 2900terracemiami.com were
    // both parked when this was written. Strongest of the wave 3 domains.
    mode: "waitlist", palette: { ink:"#111c26", a:"#7fa8d8", deep:"#3b6699", pale:"#e3eefb" },
    hood: "Edgewater", address: "401 NE 29th St", zip: "33137", units: 324, stories: 32,
    developer: "Oak Row Equities and LNDMRK Development", eta: "Q4 2027", etaShort: "Q4 '27", delivers: "2027-10-01",
    verified: "2026-09-21",
    chip: "Topped Out · Delivering Q4 2027",
    h1: ["2900 Terrace:", "324 Edgewater", "apartments with", "home offices."],
    sub: "A 32-story Arquitectonica tower at 401 NE 29th Street, now topped out. One- to three-bedroom rentals averaging about 1,069 sq ft, with 10-foot ceilings, wraparound terraces and a dedicated home office. Completion is expected in Q4 2027.",
    ticker: ["324 residences","32 stories","Topped out","10-ft ceilings","Wraparound terraces","Delivering Q4 2027"],
    stats: [["324","Residences"],["32","Stories"],["1,069","Avg Sq Ft"],["Q4 '27","Completion"]],
    kicker: "401 NE 29th Street",
    h2: "Room to live and work, in Edgewater",
    body: [
      "2900 Terrace occupies about 1.5 acres on NE 29th Street, one of the last sizeable undeveloped parcels left in Edgewater. The Shops at Midtown Miami sit a few blocks north, the Design District about a mile up, and Margaret Pace Park and the bay a short walk east.",
      "Arquitectonica designed the 32-story, 362-foot tower around unusually large floor plans: 324 one- to three-bedroom residences averaging roughly 1,069 square feet, with 10-foot ceilings, floor-to-ceiling glazing, wraparound balconies and dedicated home offices. Coastal Construction topped it out ahead of a fourth-quarter 2027 completion."
    ],
    cards: [
      ["No studios, no micro-units","Every home has at least one bedroom, and the average is over 1,000 square feet, larger than most new rentals in the neighborhood."],
      ["Terraces that wrap","Wraparound balconies and 10-foot ceilings, where most new Miami balconies are barely big enough for two chairs."],
      ["Home office, built in","A dedicated workspace inside the floor plan instead of a desk in the bedroom, plus content studios and co-working downstairs."]
    ],
    faq: [
      ["When does 2900 Terrace start leasing?","The tower has topped out and is tracking to completion in the fourth quarter of 2027. Pricing is normally released a few months ahead of that, and you'll be emailed as soon as it is."],
      ["How much will rent be?","Nothing has been published. With homes averaging over 1,000 square feet, expect pricing above Edgewater's smaller new apartments. Leave your details and you'll get the actual numbers first."],
      ["How big are the apartments?","324 residences averaging roughly 1,069 square feet, in one-, two- and three-bedroom layouts with 10-foot ceilings and wraparound terraces."],
      ["Where exactly is it?","401 NE 29th Street, on a 1.5-acre site in Miami's Edgewater neighborhood, a few blocks south of Midtown."],
      ["Who is the developer?","Oak Row Equities and LNDMRK Development, with architecture by Arquitectonica and construction by Coastal Construction."]
    ],
    moveIn: ["Late 2027","2028","Flexible"],
    ctaH2: "Get 2900 Terrace pricing first.",
    ctaP: "324 large apartments in Edgewater with no published rent and no leasing office to call yet. We'll email you floor plans and pricing as soon as they're released."
  },
  {
    domain: "neoedgewatermiami.com", name: "Neo Edgewater", short: "NEO", accent: "EDGEWATER",
    captions: ["Pool Deck","Residences","Lobby"], credit: "Photography and renderings courtesy of Oak Row Equities, Bozzuto and Neo Edgewater; aerial photography via Florida YIMBY",
    // Same building as 2600biscaynemiami.com: 2600 Biscayne Blvd leases under
    // the name Neo Edgewater. This page is the brand-and-pricing search, the
    // 2600 page the address-and-office search. Note the official leasing site
    // neoedgewater.com is live and real, so this is the weakest domain of the
    // wave — an availability page competing with an operator, not a vacuum.
    mode: "availability", palette: { ink:"#0f1724", a:"#8ea2ff", deep:"#41539e", pale:"#e6eaff" },
    hood: "Edgewater", address: "2600 Biscayne Blvd", zip: "33137", units: 399, stories: 41,
    developer: "Oak Row Equities", eta: "Leasing now", etaShort: "Now", year: 2026,
    verified: "2026-09-21",
    prices: { checked: "2026-10-13", source: "the leasing office's online availability", basis: "total monthly price including required fees" },
    title: "Neo Edgewater Apartments Miami — Rents, Specials & Availability",
    ogTitle: "Neo Edgewater — Now Leasing, Edgewater Miami",
    desc: "Neo Edgewater at 2600 Biscayne Blvd: 399 apartments from about $2,817, an Equinox in the building and one month free on 14–18 month leases.",
    chip: "Open · Leasing Now",
    h1: ["Neo Edgewater:", "a brand-new", "41-story rental,", "leasing now."],
    sub: "Neo Edgewater is leasing at 2600 Biscayne Boulevard: studios to three-bedrooms of roughly 500 to 1,700 sq ft, an Equinox in the building and pool decks on the 14th and 42nd floors.",
    ticker: ["399 residences","41 stories","500–1,700 sq ft","Equinox fitness club","Pool decks on 14 and 42","One month free on 14–18 month leases"],
    stats: [["$2,817+","Studios From"],["$3,742+","1 Beds From"],["1 month","Free on 14–18 mo"],["41","Stories"]],
    kicker: "2600 Biscayne Boulevard",
    h2: "Move in while the opening specials last",
    body: [
      "Neo Edgewater is the residential half of Oak Row Equities' 41-story Arquitectonica tower on Biscayne Boulevard, with Bozzuto running leasing and the first residents moving in from October 2026. Studios, one-, two- and three-bedroom residences run roughly 500 to 1,700 square feet, with interiors by Vida Design.",
      "The amenity floors are stacked rather than clustered: a wrap-around pool deck on the 14th floor, a rooftop deck on the 42nd, a multi-level Equinox fitness club, co-working space and weekend access to a padel court. On October 13, 2026, studios were listed from about $2,817 a month, one-bedrooms from about $3,742 and two-bedrooms from about $5,852, including required fees."
    ],
    cards: [
      ["One month free","On October 13, 2026, the leasing office advertised one month free on 14–18 month leases, with restrictions. Lease-up specials usually shrink as the building fills."],
      ["Equinox downstairs","A multi-level Equinox inside the building. Anywhere else in Edgewater that is a separate membership and a walk."],
      ["Two pool decks","A wrap-around deck on the 14th floor and a roof deck on the 42nd — the difference between an afternoon in the sun and the view over the bay."]
    ],
    faq: [
      ["Is Neo Edgewater leasing right now?","Yes. Leasing opened in September 2026 and residents began moving in from October. On October 13, 2026, more than 130 apartments were listed as available."],
      ["How much is rent at Neo Edgewater?","When we checked on October 13, 2026, studios were listed from about $2,817 a month, one-bedrooms from about $3,742, two-bedrooms from about $5,852 and three-bedrooms from about $8,302, including required monthly fees. Lease-up prices move with each release, so send your bedroom count and we'll check today's."],
      ["Are there move-in specials?","On October 13, 2026, one month free on 14–18 month leases was advertised, with restrictions. Specials on a new building change as it fills, so ask and we'll check what's on today."],
      ["Where is Neo Edgewater?","2600 Biscayne Boulevard, in Miami's Edgewater neighborhood — a short walk from Margaret Pace Park and the bay, with Midtown and Wynwood just west."],
      ["Who built it?","Oak Row Equities, with architecture by Arquitectonica, interiors by Vida Design and residential leasing by Bozzuto."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    ctaH2: "Find your apartment at Neo Edgewater.",
    ctaP: "399 apartments releasing in waves, with concessions that change as floors fill. Tell us the bedroom count, budget and timing and we'll come back with what's available now."
  },
  {
    domain: "hamiltonhousemiami.com", name: "Hamilton House", short: "HAMILTON", accent: "HOUSE",
    captions: ["Topped Out Over the Bay","On Biscayne Bay","The Podium"], credit: "Renderings courtesy of Aimco; construction photography by Oscar Nunez via Florida YIMBY",
    // Added 2026-10-10. No building website exists anywhere (the only
    // "official" link in trackers is aimco.com), so this page is the vacuum
    // downtown6miami.com was. Aimco's SEC filings call the project "34th
    // Street"; Hamilton House is the name every press source uses. Aimco is in
    // liquidation (stockholders approved Feb 2026), so the tower may change
    // hands and be renamed before lease-up — re-check the name before Q2 2027.
    // TRD's July 2026 restaurant story calls it a condo; Aimco's Q2 2026 10-Q
    // calls it a multifamily development with "stabilized occupancy" in 4Q
    // 2028, i.e. a rental. Trust the filing.
    mode: "waitlist", palette: { ink:"#0e1a24", a:"#c8a978", deep:"#8a6d3f", pale:"#f6efe3" },
    hood: "Edgewater", address: "640 NE 34th St", zip: "33137", units: 114, stories: 38,
    developer: "Aimco", eta: "Q3 2027", etaShort: "Q3 '27", delivers: "2027-07-01",
    verified: "2026-10-10",
    chip: "Topped Out · Delivering Q3 2027",
    h1: ["Hamilton House:", "114 bayfront", "rentals, 2,500", "sq ft on average."],
    sub: "Aimco has topped out a 38-story tower at 640 NE 34th Street, directly on Biscayne Bay. Just 114 residences, averaging more than 2,500 sq ft with 9- to 10-foot ceilings and oversized terraces: condo-sized homes, for lease.",
    ticker: ["114 residences","38 stories","Directly on Biscayne Bay","2,500+ sq ft average","9–10 ft ceilings","Delivering Q3 2027"],
    stats: [["114","Residences"],["38","Stories"],["2,500+","Avg Sq Ft"],["Q3 '27","Completion"]],
    kicker: "640 NE 34th Street",
    h2: "Condo-sized homes, on a lease",
    body: [
      "Hamilton House rises on the Biscayne Bay waterfront at the north end of Edgewater, across NE 34th Street from The Hamilton. Midtown and the Design District are a few minutes west; on the other side, the view is open water.",
      "Aimco cut an earlier 60-story plan down to 38 stories and made the homes larger instead: 114 residences averaging more than 2,500 square feet, with 9- to 10-foot ceilings, oversized private terraces and unobstructed bay views. Stantec designed the tower and Americaribe-Grycon topped it out in March 2026, ahead of first move-ins in the third quarter of 2027."
    ],
    cards: [
      ["2,500 square feet, average","The kind of space Miami renters usually have to buy a condo to get. Most new rental towers build far smaller homes; this one went the other way."],
      ["Directly on the bay","A waterfront site on Biscayne Bay, with oversized private terraces so the view comes with outdoor space to use it."],
      ["A waterfront restaurant downstairs","The family behind Daniel's, A Florida Steakhouse, has leased about 11,500 sq ft on the ground floor for a Rockwell Group-designed steak and seafood restaurant with an outdoor bar on the water."]
    ],
    faq: [
      ["When does Hamilton House start leasing?","Aimco schedules first move-ins for the third quarter of 2027. Pricing is normally released a few months ahead of that, and you'll be emailed as soon as it is."],
      ["How much will rent be?","Nothing has been published. With residences averaging more than 2,500 square feet on the bay, expect pricing well above Edgewater's typical new rentals. Leave your details and you'll get the actual numbers first."],
      ["Is it a rental or a condo?","A rental. Aimco is building Hamilton House as a multifamily rental tower: the homes are leased, not sold. In its filings Aimco refers to the project as 34th Street."],
      ["Is this The Hamilton?","No. The Hamilton is the existing 276-unit rental building at 555 NE 34th Street, across the street. Hamilton House is the new 38-story tower at 640 NE 34th Street."],
      ["Who is the developer?","Aimco, with architecture by Stantec and construction by Americaribe-Grycon."]
    ],
    // Aimco has published no bedroom mix; at 2,500+ sq ft average a studio is not plausible.
    unitTypes: ["1 Bedroom","2 Bedroom","3 Bedroom","Not sure yet"],
    moveIn: ["Q3 2027","Late 2027","Flexible"],
    ctaH2: "Get Hamilton House pricing first.",
    ctaP: "114 bayfront residences averaging over 2,500 sq ft, with no published rent and no leasing office yet. We'll email you floor plans and pricing as soon as they're released."
  },
  {
    domain: "centraltowermiami.com", name: "Central Tower", short: "CENTRAL", accent: "TOWER",
    captions: ["Pool Deck","Fitness Center","From the Balconies"], credit: "Renderings and photography courtesy of Melo Group / Central Tower Rentals",
    splitAlt: "Central Tower at dusk, 46 NE 6th Street, Miami Worldcenter",
    // Added 2026-10-10. SAME BUILDING as downtown6miami.com (hand-built, and
    // hands-off while it produces leads — never edit it from here). Melo now
    // leases the tower as Central Tower (centraltowerrentals.com; Melo's
    // portfolio page lists it "Coming Feb 2027"), so searchers arrive under
    // either name. Two domains on one building is the duplicate-content trap:
    // this entry sets its own title/desc/ogTitle, leads with the published
    // floor plans and amenities rather than D6's construction/Brightline angle,
    // and uses only Melo's newer leasing imagery — not one image is shared with
    // downtown6miami.com. Note D6's page still says Q4 2026; this one follows
    // Melo's current date.
    mode: "waitlist", palette: { ink:"#17151f", a:"#f2a65a", deep:"#b8682a", pale:"#fdf0e3" },
    hood: "Miami Worldcenter", address: "46 NE 6th St", zip: "33132", units: 824, stories: 58,
    developer: "Melo Group", eta: "Feb 2027", etaShort: "Feb '27", delivers: "2027-02-01",
    verified: "2026-10-10",
    // Listing sites (Apartments.com, ForRent, Zillow) started showing per-plan
    // base rents by 2026-10-13, with Apartments.com giving move-in from Nov 1,
    // 2026. Melo's own sites still show no rents and "Coming Feb 2027", and no
    // online application is open, so `delivers` stays on Melo's date.
    prices: { checked: "2026-10-13", source: "Apartments.com and Zillow", basis: "base rent, before required fees" },
    title: "Central Tower Miami — Worldcenter Rental Apartments",
    desc: "Central Tower, 46 NE 6th St: Melo Group's 824 rentals in Miami Worldcenter. 1–3 bedrooms from 732 sq ft, with balconies. Get pricing and floor plans first.",
    ogTitle: "Central Tower — Melo Group Rentals at Miami Worldcenter",
    chip: "Floor Plans Out · Delivering Feb 2027",
    h1: ["Central Tower:", "new apartments", "in Miami", "Worldcenter."],
    sub: "Central Tower is Melo Group's 824-residence rental tower at 46 NE 6th Street, the building first announced as Downtown 6. The floor plans are out: one- to three-bedroom homes from 732 to 1,171 sq ft, every one with a balcony and a full-size washer and dryer.",
    ticker: ["824 residences","58 floors","A balcony on every home","Full-size washer & dryer","2,100+ sq ft fitness center","Delivering Feb 2027"],
    stats: [["$2,400+","1 Beds From"],["732+","Sq Ft"],["824","Residences"],["Feb '27","Completion"]],
    kicker: "46 NE 6th Street",
    h2: "The floor plans are out",
    body: [
      "Melo Group has published the layouts: one-bedrooms at 732 sq ft, one-bedroom-plus-dens at 792, two-bedroom, two-bath homes from 878 to 951, and three-bedrooms at 1,171. Every residence gets a balcony, granite counters, Samsung stainless appliances, a double-door refrigerator, wood-look laminate floors, porcelain-tiled baths and a full-size washer and dryer.",
      "The tower stands on NE 6th Street across from 600 Miami Worldcenter, with the Metromover at the door, Bayside and Miami Dade College a block away, and I-95 and I-395 within reach. Brickell is a few blocks south; South Beach and Miami International Airport are each about ten minutes out."
    ],
    cards: [
      ["Pool and jacuzzi","A large resort-style pool and a jacuzzi on site, so a Saturday in the sun doesn't start with a drive."],
      ["A real gym, downstairs","More than 2,100 sq ft of fitness space, plus a social room, kids' room, business center and a café-market in the building."],
      ["Parking, or the Mover","Private parking on site for the car, and the Metromover at the door for the days you'd rather leave it."]
    ],
    faq: [
      ["Is Central Tower the same building as Downtown 6?","Yes. Downtown 6 was the project's announced name; Melo Group now markets the tower as Central Tower. Same building, same address: 46 NE 6th Street."],
      ["When does Central Tower open?","Melo Group lists completion for February 2027, though some listing sites now show move-in from November 1, 2026. Applications at Melo towers typically open around completion, and you'll hear as soon as they do."],
      ["What floor plans are there?","One-bedrooms (732 sq ft), one-bedroom-plus-den (792 sq ft), two-bedroom, two-bath homes (878 to 951 sq ft) and three-bedroom, two-bath homes (1,171 sq ft). Melo's published plans don't include studios."],
      ["How much will rent be at Central Tower?","When we checked on October 13, 2026, Apartments.com and Zillow listed base rents from about $2,400 for a one-bedroom, $2,750 for a one-bedroom plus den, $2,990 for a two-bedroom and $3,800 for a three-bedroom, before fees. Melo hasn't posted prices on its own site yet, so leave your details and we'll confirm today's numbers and any opening specials."],
      ["What amenities does it have?","A large swimming pool and jacuzzi, a fitness center of more than 2,100 sq ft, a café-market, social room, kids' room, business center and private parking on site."]
    ],
    unitTypes: ["1 Bedroom","1 Bedroom + Den","2 Bedroom","3 Bedroom","Not sure yet"],
    moveIn: ["Early 2027","Mid 2027","Flexible"],
    soon: {
      h2: "Central Tower rents are starting to show.",
      p: "Listing sites now show one-bedrooms from about $2,400, while Melo still lists completion for February 2027. Get confirmed pricing, any opening specials and first pick of floor plans as soon as applications open."
    },
    ctaH2: "Get Central Tower pricing first.",
    ctaP: "824 homes with floor plans out and the first rents appearing on listing sites. Leave your details and we'll send confirmed pricing as soon as Melo opens applications."
  }
];

module.exports = BUILDINGS;
module.exports.FACTS_VERIFIED = FACTS_VERIFIED;
