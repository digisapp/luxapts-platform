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
    // Overridden because neoedgewatermiami.com is the same building; these
    // target the address search, that page the brand search.
    title: "2600 Biscayne Miami — Now Leasing as Neo Edgewater | Rents & Availability",
    ogTitle: "2600 Biscayne — Edgewater, Miami",
    desc: "2600 Biscayne Blvd, Edgewater, Miami: 399 rental apartments over roughly 205,000 sq ft of Class A office, by Oak Row Equities. Now leasing as Neo Edgewater — check current availability and rents.",
    chip: "Open · Now Leasing as Neo Edgewater",
    h1: ["The tower at", "2600 Biscayne", "is leasing.", "It's called Neo."],
    sub: "Oak Row Equities' 41-story Arquitectonica tower opened preleasing in September 2026 as Neo Edgewater — 399 rentals over roughly 205,000 sq ft of Class A office and retail, with the first residents moving in from October.",
    ticker: ["399 residences","41 stories","205k sq ft office & retail","Equinox in the building","First residents October 2026"],
    stats: [["399","Residences"],["41","Stories"],["$2,727+","Studios From"],["205k","Sq Ft Office"]],
    kicker: "2600 Biscayne Boulevard",
    h2: "Live above the office you'd otherwise commute to",
    body: [
      "2600 Biscayne rises on Biscayne Boulevard at NE 26th Terrace, in the stretch of Edgewater that turned from parking lots into towers in under a decade. Margaret Pace Park and the bay are a short walk east; Wynwood and Midtown sit just west.",
      "Designed by Arquitectonica, the tower stacks 399 rental residences of roughly 500 to 1,700 square feet over about 205,000 square feet of Class A office and retail — a genuine live-work building rather than a marketing phrase. It leases as Neo Edgewater, with Bozzuto running the leasing office."
    ],
    cards: [
      ["Rental, not resale","Most new Edgewater towers are condos. This one is purpose-built rental run by a single operator, so you sign with a management company instead of chasing individual owners."],
      ["Office downstairs","About 205,000 sq ft of Class A office and retail in the same building — the shortest commute in Miami for anyone whose employer takes space here."],
      ["Lease-up pricing","Opening rents and concessions are live right now, and both move as floors release. That is the entire argument for asking early rather than in February."]
    ],
    faq: [
      ["Is 2600 Biscayne leasing now?","Yes. Preleasing launched in September 2026 under the name Neo Edgewater, and the first residents move in from October 2026."],
      ["What is the difference between 2600 Biscayne and Neo Edgewater?","None — same building. 2600 Biscayne Boulevard is the address; Neo Edgewater is the name it leases under."],
      ["How much is rent?","Published starting rents run about $2,727 for studios, $3,742 for one-bedrooms and $5,792 for two bedrooms and up. Lease-up pricing changes with each release — send your bedroom count and we will check what it is today."],
      ["Where exactly is it?","2600 Biscayne Boulevard, also addressed at 246 NE 26th Terrace, in Miami's Edgewater neighborhood."],
      ["Who is the developer?","Oak Row Equities, with architecture by Arquitectonica and residential leasing by Bozzuto."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    ctaH2: "Check what's actually open.",
    ctaP: "399 apartments releasing in waves, with opening concessions that shrink as the building fills. Tell us your bedroom count, budget and timing and we'll come back with what's open and what it costs today."
  },
  {
    domain: "jemmiamiapartments.com", name: "JEM Miami Worldcenter", short: "JEM", accent: "MIAMI",
    mode: "waitlist", palette: { ink:"#1a1329", a:"#c9a84c", deep:"#8a6f22", pale:"#f7f0dc" },
    hood: "Miami Worldcenter", address: "1016 NE 2nd Ave", zip: "33132", units: 530, stories: 67,
    developer: "Naftali Group", eta: "Q4 2027", etaShort: "Q4 '27", delivers: "2027-10-01",
    chip: "Under Construction · Rentals Delivering Q4 2027",
    h1: ["530 rental homes", "inside Miami", "Worldcenter's", "tallest tower."],
    sub: "Naftali Group's 67-story JEM rises over the $6B Worldcenter district. Floors 10 through 42 are rentals — and nobody is marketing them yet.",
    ticker: ["67 stories","530 rental residences","Floors 10–42","Miami Worldcenter","Delivering Q4 2027"],
    stats: [["530","Rental Homes"],["67","Stories"],["Q4 '27","Completion"],["10–42","Rental Floors"]],
    kicker: "1016 NE 2nd Avenue",
    h2: "The rental half of Miami's next landmark",
    body: [
      "JEM rises more than 700 feet over Miami Worldcenter, the 27-acre, $6 billion district that reshaped the north end of Downtown. Brightline at MiamiCentral, the Kaseya Center and Bayside are all within a few blocks.",
      "The tower splits in two: 259 condominiums occupy the upper floors, while floors 10 through 42 hold 530 purpose-built rental apartments. Developer marketing so far has focused almost entirely on the condos — which is why rental pricing is so hard to find."
    ],
    cards: [
      ["Rentals, not resale","Floors 10–42 are institutional rental stock leased by one operator — not individually owned condos sublet at owner discretion."],
      ["Worldcenter at the door","Retail, restaurants and the Brightline concourse are inside the district, not a drive away."],
      ["Ahead of the announcement","Rental pricing for JEM has not been published anywhere. The waitlist is how you see it first."]
    ],
    faq: [
      ["When do JEM rentals start leasing?","Construction is tracking to Q4 2027. Rental lease-up typically begins as the building tops out and finishes — waitlist members are notified when pricing is released."],
      ["Is this the condo tower?","Both. Floors 43 and above are JEM Private Residences condominiums for sale. Floors 10–42 are the 530 rental apartments this page covers."],
      ["How much will rent be?","Not yet published. Naftali's marketing to date has covered the condos only."],
      ["Who is the developer?","Naftali Group, a New York developer, building at 1016 NE 2nd Avenue within Miami Worldcenter."]
    ],
    moveIn: ["2027","2028","Flexible"],
    ctaH2: "See rental pricing first.",
    ctaP: "530 rental homes with no public pricing anywhere. Floor plans and rents — emailed the moment Naftali releases them."
  },
  {
    domain: "kenectmiamiapartments.com", name: "Kenect Miami", short: "KENECT", accent: "MIAMI",
    mode: "waitlist", palette: { ink:"#131a2b", a:"#ff6b4a", deep:"#c14127", pale:"#ffe9e3" },
    hood: "Miami Worldcenter", address: "Miami Worldcenter", zip: "33132", units: 450, stories: 39,
    developer: "Akara Partners", eta: "Under construction", etaShort: "TBA", delivers: null,
    chip: "Under Construction · Miami Worldcenter",
    h1: ["450 homes built", "for people who", "work where they", "live."],
    sub: "Akara Partners' 39-story Kenect tower brings 20,000 sq ft of coworking, furnished residences and micro-unit pricing to Miami Worldcenter.",
    ticker: ["39 stories","450 residences","20,000 sq ft coworking","Furnished options","Miami Worldcenter"],
    stats: [["450","Residences"],["39","Stories"],["20k","Sq Ft Coworking"],["10k","Sq Ft Retail"]],
    kicker: "Miami Worldcenter",
    h2: "Co-living, but built by an institution",
    body: [
      "Kenect is Akara Partners' national live-work brand — compact, efficiently designed residences with signature furnishings, hospitality-style service and social programming, already running in Chicago, Nashville and Phoenix.",
      "The Miami tower rises 39 stories inside Miami Worldcenter with 450 residences, 20,000 square feet of coworking and 10,000 square feet of retail. Perkins&Will designed it around the idea that your office, gym and apartment share an elevator bank."
    ],
    cards: [
      ["Efficient by design","Compact floor plans priced well below conventional new-construction one-bedrooms in the same district."],
      ["Coworking included","20,000 sq ft of dedicated workspace in the building — not a converted lounge with a printer."],
      ["Furnished options","Kenect's signature furniture packages mean you can move in with a suitcase."]
    ],
    faq: [
      ["When does Kenect Miami start leasing?","The tower is under construction at Miami Worldcenter. Lease-up dates have not been announced publicly — waitlist members are notified first."],
      ["What is co-living, exactly?","At Kenect it means compact, well-designed private apartments with optional furnishing, shared amenity space and hospitality-style service. You get your own apartment, not a shared bedroom."],
      ["How much will rent be?","Miami pricing has not been released. Kenect's other markets start well under conventional new-construction rents for comparable locations."],
      ["Who is the developer?","Akara Partners, with architecture by Perkins&Will."]
    ],
    moveIn: ["As soon as possible","2027","Flexible"],
    ctaH2: "First look at Kenect pricing.",
    ctaP: "450 residences with coworking downstairs, in the middle of Miami Worldcenter. Rents and floor plans — the moment they're published."
  },
  {
    domain: "3333biscaynemiami.com", name: "3333 Biscayne", short: "3333", accent: "BISCAYNE",
    mode: "waitlist", palette: { ink:"#10222b", a:"#4cc3a5", deep:"#1f7a66", pale:"#ddf6ef" },
    hood: "Edgewater", address: "3333 Biscayne Blvd", zip: "33137", units: 667, stories: 45,
    developer: "Beitel Group", eta: "2028", etaShort: "2028", delivers: "2028-01-01",
    chip: "In Permitting · First of Three Towers",
    h1: ["667 apartments.", "An entire", "Edgewater", "city block."],
    sub: "Beitel Group's three-tower redevelopment of 3333 Biscayne begins with a 45-story, 667-unit building — the largest rental project in the Edgewater pipeline.",
    ticker: ["45 stories","667 residences","Three-tower masterplan","Full city block","Delivering 2028"],
    stats: [["667","Residences"],["45","Stories"],["3","Tower Masterplan"],["2028","Target Delivery"]],
    kicker: "3333 Biscayne Boulevard",
    h2: "A whole block of Biscayne, rebuilt",
    body: [
      "Beitel Group is redeveloping the entire city block at 3333 Biscayne Boulevard into three towers. The first is a 45-story building with 667 residences, structured parking and roughly 7,400 square feet of ground-floor retail.",
      "Site preparation and demolition are already underway under approved permits, with the construction crane scheduled from December 2026 through July 2028. John Moriarty & Associates is the general contractor."
    ],
    cards: [
      ["The biggest in the pipeline","667 units in tower one alone — more than any other Edgewater rental project currently moving toward construction."],
      ["Upper Edgewater","North of the Arts & Entertainment District, minutes from Midtown, Wynwood and the Design District."],
      ["Early is the point","Permits are filed and demolition has started. Getting on the list now means hearing about pricing years before it is advertised."]
    ],
    faq: [
      ["When will 3333 Biscayne be finished?","The crane schedule runs December 2026 through July 2028, so delivery is expected in 2028. Pre-leasing typically opens several months ahead of completion."],
      ["Is this rental or condo?","The first tower is planned as residential rental. Beitel and Aimco have partnered on the site since 2022."],
      ["What about towers two and three?","The full block is master-planned for three towers. Only the first has filed a master construction permit so far."],
      ["Where exactly is it?","3333 Biscayne Boulevard, occupying the full block in Miami's Edgewater neighborhood."]
    ],
    moveIn: ["2028","2029","Flexible"],
    ctaH2: "Be first on the biggest one.",
    ctaP: "667 residences, three towers, one Edgewater block. We'll email you the moment pre-leasing and pricing open."
  },
  {
    domain: "biscayne18.com", name: "Biscayne 18", short: "BISCAYNE", accent: "18",
    mode: "waitlist", palette: { ink:"#0f1b2d", a:"#c9a84c", deep:"#8a6f22", pale:"#f6f0de" },
    hood: "Edgewater", address: "331 NE 18th St", zip: "33132", units: 1178, stories: 46,
    developer: "Melo Group", eta: "2029–2030", etaShort: "2029+", delivers: "2029-01-01",
    chip: "Permits Filed · Nearing Groundbreaking",
    h1: ["1,178 apartments.", "Twin 46-story", "towers. One", "Edgewater block."],
    sub: "Melo Group's largest project yet — two 46-story towers at 331 NE 18th Street, bringing 1,178 rental homes to Edgewater. Permits are filed. Pricing is years away. The list starts now.",
    ticker: ["Twin 46-story towers","1,178 rental residences","589 per tower","$321M construction","Permits filed 2026"],
    stats: [["1,178","Rental Homes"],["46","Stories Each"],["2","Towers"],["$321M","Construction Cost"]],
    kicker: "331 NE 18th Street",
    h2: "Melo's biggest bet on Edgewater",
    body: [
      "Biscayne 18 occupies a 1.57-acre block bounded by Biscayne Boulevard, NE 18th Street, NE 4th Avenue and NE 19th Street — land Melo Group assembled in 2019. Two 46-story towers rise 465 feet above an eight-level parking podium, wrapped in residential units to hide the garage.",
      "The plan totals 1,178 rental apartments, 589 in each tower, alongside roughly 24,930 square feet of ground-floor retail and 1,472 parking spaces. Designed by G3AEC, with construction estimated at $321 million. Margaret Pace Park and the bay are two blocks east."
    ],
    cards: [
      ["The Melo playbook","The same developer behind Downtown 1st, Downtown 5th, Downtown 6, Art Plaza, Square Station and Melody Towers — known for pricing below flashier competition and leasing up fast."],
      ["Bigger than Downtown 5th","At 1,178 units, Biscayne 18 would exceed Melo's 1,042-unit Downtown 5th as their largest single development."],
      ["Years ahead of the crowd","Permits were filed in 2026 and the project is nearing groundbreaking. Nobody is publishing rents yet — that is exactly why this list exists."]
    ],
    faq: [
      ["When will Biscayne 18 be ready?","Construction permits were filed in 2026 and the project is nearing groundbreaking. A twin 46-story build typically runs about three years, putting delivery around 2029–2030."],
      ["Is it rental or condo?","Rental. Melo Group builds and holds rental towers, and the filings describe 1,178 rental units."],
      ["How much will rent be?","Far too early. For reference, Melo's completed Downtown 5th currently runs roughly $1,700–4,000 per month."],
      ["Where exactly is it?","331 NE 18th Street, on the block bounded by Biscayne Boulevard, NE 18th Street, NE 4th Avenue and NE 19th Street in Edgewater."],
      ["Why sign up this early?","Melo lease-ups move quickly and pricing is released with little notice. Waitlist members hear before any listing site does."]
    ],
    moveIn: ["2029","2030","Flexible"],
    ctaH2: "Years early. That's the advantage.",
    ctaP: "1,178 apartments, two towers, one Edgewater block. We'll email you when Melo releases the first real pricing — long before it reaches the listing sites."
  },
  {
    domain: "urban22edgewater.com", name: "Urban 22", short: "URBAN", accent: "22",
    mode: "waitlist", palette: { ink:"#151d2e", a:"#6c8cff", deep:"#3b52b8", pale:"#e6ebff" },
    hood: "Edgewater", address: "2222 NE 2nd Ave", zip: "33137", units: 441, stories: 24,
    developer: "Melo Group", eta: "Topped off", etaShort: "Soon", delivers: "2026-11-01",
    chip: "Topped Off · Leasing Soon",
    h1: ["441 apartments,", "725 to 1,100", "square feet,", "all balconied."],
    sub: "Melo Group's Urban 22 at 2222 NE 2nd Avenue has topped off. Every residence gets a private balcony with glass railings — and pricing is about to land.",
    ticker: ["Topped off","441 luxury rentals","725–1,100 sq ft","Private balcony in every home","Edgewater"],
    stats: [["441","Residences"],["725+","Sq Ft"],["100%","With Balconies"],["529","Parking Spaces"]],
    kicker: "2222 NE 2nd Avenue",
    h2: "Bigger floor plans than the tower next door",
    body: [
      "Urban 22 holds 441 rental apartments across roughly 708,000 square feet: 4 studios, 243 one-bedrooms, 152 two-bedrooms and 42 three-bedrooms, ranging from 725 to 1,100 square feet. Every unit has a private balcony with glass railings.",
      "The building sits on NE 2nd Avenue in Edgewater, a few blocks from Margaret Pace Park and the bay, with Midtown and Wynwood immediately west. It includes about 7,168 square feet of retail, 5,692 square feet of office and 529 parking spaces."
    ],
    cards: [
      ["Space you can't find new","At 725–1,100 sq ft, Urban 22's one- and two-bedrooms run larger than most new Miami construction, where studios under 500 sq ft are the norm."],
      ["Balcony in every home","Not a select-units amenity — all 441 residences have private outdoor space."],
      ["Melo pricing","The developer behind Downtown 5th and Art Plaza has a long record of leasing below comparable new construction."]
    ],
    faq: [
      ["When does Urban 22 start leasing?","The tower has topped off and is finishing out. Melo lease-ups typically open around completion, and pricing tends to be released with little advance notice."],
      ["How big are the apartments?","From 725 to 1,100 square feet — 4 studios, 243 one-bedrooms, 152 two-bedrooms and 42 three-bedrooms."],
      ["How much will rent be?","Not yet published. Melo's completed Downtown 5th currently runs roughly $1,700–4,000 depending on size."],
      ["Where exactly is it?","2222 NE 2nd Avenue in Miami's Edgewater neighborhood."]
    ],
    moveIn: ["As soon as possible","Next 3 months","Next 6 months","Flexible"],
    ctaH2: "Pricing drops soon.",
    ctaP: "441 balconied apartments in Edgewater, finishing now. Be on the list when Melo releases rents.",
    soon: {
      h2: "Melo sets opening rents within weeks.",
      p: "441 balconied apartments, finishing now. Opening pricing and move-in specials are set before a building ever reaches the listing sites — this list gets them at that point, with the floor and line still yours to pick. One email when it happens."
    }
  },
  {
    domain: "downtown5miami.com", name: "Downtown 5th", short: "DOWNTOWN", accent: "5TH",
    mode: "availability", palette: { ink:"#0c1c26", a:"#00b3a4", deep:"#00776d", pale:"#d9f5f2" },
    hood: "Downtown Miami", address: "55 NE 5th St", zip: "33132", units: 1042, stories: 52,
    developer: "Melo Group", eta: "Leasing now", etaShort: "Now",
    chip: "Open · Leasing Now",
    h1: ["1,042 apartments", "in the middle of", "Downtown Miami."],
    sub: "Melo Group's twin 52-story towers at 25 and 55 NE 5th Street — the largest multifamily project ever built in Downtown Miami's CBD. Tell us what you need and we'll find what's actually open.",
    ticker: ["Twin 52-story towers","1,042 residences","615–1,900 sq ft","Metromover at the door","Leasing now"],
    stats: [["1,042","Residences"],["52","Stories ×2"],["615+","Sq Ft"],["$1,700+","Starting Rent"]],
    kicker: "25 & 55 NE 5th Street",
    h2: "The biggest rental address in the CBD",
    body: [
      "Downtown 5th is two 52-story towers holding 1,042 apartments and roughly 12,500 square feet of ground-floor retail, directly beside the Metromover's College North station. One-, two- and three-bedroom homes run from about 615 to 1,900 square feet.",
      "It sits in the heart of Downtown's central business district — walking distance to Brickell, Bayside, the Kaseya Center and the Brightline concourse at MiamiCentral. Rents have historically run from roughly $1,700 to $4,000 depending on size and floor."
    ],
    cards: [
      ["Scale means availability","With 1,042 apartments across two towers, something is almost always opening up — the trick is knowing before it's listed."],
      ["Transit at the door","The Metromover College North station is at the building; Brightline at MiamiCentral is a short walk."],
      ["Melo pricing","Melo has consistently leased below flashier downtown competition — one reason the towers filled quickly on opening."]
    ],
    faq: [
      ["Is Downtown 5th currently available?","Yes — it's an operating building and units turn over regularly. Tell us your bedroom count and timing and we'll check what's actually open."],
      ["How much is rent?","Historically about $1,700 to $4,000 per month depending on size, floor and term. Current pricing moves weekly."],
      ["How big are the apartments?","One-, two- and three-bedroom layouts from roughly 615 to 1,900 square feet."],
      ["Where exactly is it?","25 and 55 NE 5th Street, in Downtown Miami's central business district."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Next 90 days","Flexible"],
    ctaH2: "Tell us what you need.",
    ctaP: "1,042 apartments means real turnover. Send your bedroom count and move-in window and we'll come back with what's genuinely available."
  },
  {
    domain: "panoramatowerbrickell.com", name: "Panorama Tower", short: "PANORAMA", accent: "TOWER",
    mode: "availability", palette: { ink:"#0b1626", a:"#7ab8ff", deep:"#2a6fb5", pale:"#e2f0ff" },
    hood: "Brickell", address: "1100 Brickell Bay Dr", zip: "33131", units: 821, stories: 85,
    developer: "Florida East Coast Realty", eta: "Leasing now", etaShort: "Now",
    chip: "Open · Leasing Now",
    h1: ["821 apartments,", "85 stories,", "every one with", "a view."],
    sub: "The tallest multifamily building on the eastern seaboard south of New York. 1100 Brickell Bay Drive, with 100,000+ sq ft of amenities and floor-to-ceiling glass in every residence.",
    ticker: ["85 stories","821 residences","100,000+ sq ft amenities","1,125–2,191 sq ft","Brickell Bay Drive"],
    stats: [["821","Residences"],["85","Stories"],["100k+","Sq Ft Amenities"],["1,125+","Sq Ft"],],
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
      ["Is Panorama Tower currently available?","Yes — it's an operating rental building with regular turnover across 821 residences. Send your bedroom count and timing and we'll check what's open."],
      ["How much is rent?","Pricing generally starts around $3,800 and climbs with floor and exposure. Larger and higher units run considerably more."],
      ["How big are the apartments?","Roughly 1,125 to 2,191 square feet — one, two and three bedrooms."],
      ["Where exactly is it?","1100 Brickell Bay Drive, on the bay side of Brickell."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Next 90 days","Flexible"],
    ctaH2: "Find what's open up there.",
    ctaP: "821 residences across 85 floors. Tell us your bedroom count, budget and timing and we'll tell you what's genuinely available."
  },
  {
    domain: "maizonbrickell.com", name: "Maizon Brickell", short: "MAIZON", accent: "BRICKELL",
    mode: "availability", palette: { ink:"#1c1620", a:"#d4885f", deep:"#a35a32", pale:"#fbeee6" },
    hood: "Brickell", address: "221 SW 12th St", zip: "33130", units: 0, stories: 19,
    developer: "", eta: "Leasing now", etaShort: "Now", year: 2019,
    chip: "Open · Leasing Now",
    h1: ["Brickell living", "without the", "tower tax."],
    sub: "A 19-story boutique rental at 221 SW 12th Street, built in 2019 — walkable to Mary Brickell Village and Brickell City Centre, priced well under the glass giants around it.",
    ticker: ["Built 2019","19 stories","Boutique scale","Walk to Brickell City Centre","Leasing now"],
    stats: [["19","Stories"],["2019","Built"],["$2,150+","Recent Low"],["Brickell","Neighborhood"]],
    kicker: "221 SW 12th Street",
    h2: "The Brickell building people miss",
    body: [
      "Maizon Brickell is a 19-story rental building completed in 2019 on SW 12th Street, in the quieter western pocket of Brickell — a few minutes' walk from Mary Brickell Village, Brickell City Centre and the Metromover.",
      "Recent listings across the building have ranged roughly $2,150 to $6,200 depending on layout and floor, which puts its smaller homes meaningfully below the 2023-and-newer towers a few blocks east."
    ],
    cards: [
      ["Below the new-build premium","Recent pricing has started near $2,150 — hard to match in Brickell for a building finished in 2019."],
      ["Boutique, not a megatower","19 floors means fewer neighbors, shorter elevator waits and a quieter building."],
      ["Walk to everything","Mary Brickell Village, Brickell City Centre, the Metromover and the Miami River are all within a short walk."]
    ],
    faq: [
      ["Is Maizon Brickell currently available?","Yes — it's an operating rental building with regular turnover. Send your bedroom count and timing and we'll check current openings."],
      ["How much is rent?","Recent listings have ranged roughly $2,150 to $6,200 depending on size, floor and term. Pricing moves weekly."],
      ["When was it built?","2019 — 19 stories at 221 SW 12th Street."],
      ["Where exactly is it?","221 SW 12th Street, in the western part of Brickell."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    ctaH2: "Check what's open.",
    ctaP: "Tell us your bedroom count, budget and move-in window and we'll come back with what's actually available at Maizon."
  },
  {
    domain: "muzemet.com", name: "Muze at Met", short: "MUZE", accent: "AT MET",
    mode: "availability", palette: { ink:"#171425", a:"#a98bff", deep:"#6a4bc4", pale:"#efe9ff" },
    hood: "Downtown Miami", address: "340 SE 3rd St", zip: "33131", units: 391, stories: 0,
    developer: "", eta: "Leasing now", etaShort: "Now",
    chip: "Open · Leasing Now",
    h1: ["391 apartments", "above a cinema,", "four restaurants", "and a plaza."],
    sub: "Muze at Met sits inside Metropolitan Miami — a 714,000 sq ft downtown complex with an 18-screen Silverspot cinema, restaurants and retail beneath the residences.",
    ticker: ["391 residences","Metropolitan Miami","18-screen Silverspot cinema","Four restaurants","Leasing now"],
    stats: [["391","Residences"],["714k","Sq Ft Complex"],["18","Cinema Screens"],["$2,500+","Recent Low"]],
    kicker: "340 SE 3rd Street",
    h2: "A building with a neighborhood built into it",
    body: [
      "Muze is the 391-residence rental tower within Metropolitan Miami, a 714,000-square-foot mixed-use complex in the southern end of Downtown. An 18-screen Silverspot cinema, four restaurants and a retail plaza sit directly beneath the apartments.",
      "The location bridges Downtown and Brickell — Brickell City Centre is a short walk south, Bayfront Park and the Kaseya Center a few blocks north, with Metromover stations either direction."
    ],
    cards: [
      ["Downstairs is the point","Cinema, restaurants and retail inside the complex — the amenity is the neighborhood, not a rooftop deck."],
      ["Between Downtown and Brickell","Walkable to both, which almost nothing else manages without a long bridge crossing."],
      ["Real turnover","At 391 residences, units open regularly — usually before they hit the listing sites."]
    ],
    faq: [
      ["Is Muze at Met currently available?","Yes — it's an operating rental building with frequent turnover. Send your bedroom count and timing and we'll check what's open."],
      ["How much is rent?","Recent listings have ranged roughly $2,500 to $4,250 depending on size, floor and term."],
      ["What is Metropolitan Miami?","A 714,000 sq ft mixed-use complex containing Muze, an 18-screen Silverspot cinema, four restaurants and retail."],
      ["Where exactly is it?","340 SE 3rd Street, in the southern end of Downtown Miami near the Brickell line."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    ctaH2: "See what's open at Muze.",
    ctaP: "391 residences means steady turnover. Tell us what you're after and we'll come back with real availability."
  },
  {
    domain: "remitheriver.com", name: "Remi on the River", short: "REMI", accent: "ON THE RIVER",
    mode: "availability", palette: { ink:"#0e1f22", a:"#58c6a8", deep:"#22806a", pale:"#ddf6ef" },
    hood: "Miami River District", address: "999 NW 7th St", zip: "33136", units: 342, stories: 0,
    developer: "Greystar", eta: "Leasing now", etaShort: "Now",
    chip: "Open · Leasing Now",
    h1: ["342 apartments", "on the quiet", "side of the", "river."],
    sub: "Greystar's Remi on the River sits in Miami's River District — minutes from Downtown and the Health District, at rents the waterfront towers can't touch.",
    ticker: ["342 residences","Greystar-managed","Miami River District","Minutes to Downtown","Leasing now"],
    stats: [["342","Residences"],["$2,470+","Recent Low"],["Greystar","Management"],["River","District"]],
    kicker: "999 NW 7th Street",
    h2: "The River District's best-kept rate",
    body: [
      "Remi on the River holds 342 rental residences in the Miami River District, the stretch west of Downtown that has quietly become one of the city's better value pockets — minutes from the central business district, the Health District and Little Havana.",
      "Managed by Greystar, the largest apartment operator in the country. Recent listings have ranged roughly $2,470 to $3,910, which for new-construction quality this close to Downtown is unusual."
    ],
    cards: [
      ["Downtown adjacent, not downtown priced","Recent pricing has started near $2,470 — well under comparable buildings a mile east."],
      ["Professional management","Greystar operates more apartments than any other company in the US; leasing and maintenance run to a national standard."],
      ["The river side","Quieter streets, quick access to I-95 and the Dolphin, and the Health District a few minutes north."]
    ],
    faq: [
      ["Is Remi on the River currently available?","Yes — it's an operating rental building with regular turnover across 342 residences. Send your bedroom count and timing and we'll check."],
      ["How much is rent?","Recent listings have ranged roughly $2,470 to $3,910 depending on layout, floor and lease term."],
      ["Who manages it?","Greystar, the largest apartment manager in the United States."],
      ["Where exactly is it?","999 NW 7th Street, in Miami's River District just west of Downtown."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    ctaH2: "Check current openings.",
    ctaP: "Tell us your bedroom count, budget and timing and we'll come back with what's genuinely available at Remi."
  },
  {
    domain: "artplazaapartments.com", name: "Art Plaza", short: "ART", accent: "PLAZA",
    mode: "availability", palette: { ink:"#1b1522", a:"#ff7ab8", deep:"#c43e81", pale:"#ffe8f3" },
    hood: "Arts & Entertainment District", address: "58 NE 14th St", zip: "33132", units: 667, stories: 36,
    developer: "Melo Group", eta: "Leasing now", etaShort: "Now", year: 2019,
    chip: "Open · Leasing Now",
    h1: ["667 apartments", "in the Arts &", "Entertainment", "District."],
    sub: "Melo Group's Art Plaza opened in 2019 with 667 residences on NE 14th Street — walking distance to the Adrienne Arsht Center, Museum Park and the bay.",
    ticker: ["667 residences","Opened 2019","Arts & Entertainment District","Walk to Arsht Center","Leasing now"],
    stats: [["667","Residences"],["2019","Opened"],["A&E","District"],["Melo","Developer"]],
    kicker: "NE 14th Street",
    h2: "Between the Arsht Center and the bay",
    body: [
      "Art Plaza brought 667 rental residences to the Arts & Entertainment District when it opened in 2019 — one of Melo Group's largest downtown buildings, on NE 14th Street between Biscayne Boulevard and the Metromover.",
      "The Adrienne Arsht Center for the Performing Arts is a few minutes on foot, with Museum Park, the Frost Science Museum and PAMM just south along the bay. Edgewater, Wynwood and the Design District are all a short ride north."
    ],
    cards: [
      ["Scale means options","667 residences turn over steadily — there is usually something opening across the bedroom counts."],
      ["Culture on foot","The Arsht Center, PAMM and Frost Science are all walkable, which is rare for a rental at this price."],
      ["Melo pricing","Melo's downtown buildings have consistently leased below comparable new construction nearby."]
    ],
    faq: [
      ["Is Art Plaza currently available?","Yes — it's an operating building with 667 residences and regular turnover. Tell us what you need and we'll check."],
      ["How much is rent?","Pricing moves weekly. Melo's downtown buildings generally run below comparable new construction — send your budget and we'll tell you what fits."],
      ["When did it open?","June 2019, developed by Melo Group."],
      ["Where exactly is it?","NE 14th Street in Miami's Arts & Entertainment District, just north of Downtown."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    ctaH2: "See what's open.",
    ctaP: "667 residences in the A&E District. Tell us your bedroom count and timing and we'll come back with real availability."
  },
  {
    domain: "miamiworldtowerapartments.com", name: "Miami World Tower", short: "MIAMI WORLD", accent: "TOWER",
    mode: "availability", palette: { ink:"#101a2c", a:"#f2b544", deep:"#b07d12", pale:"#fdf2d9" },
    hood: "Miami Worldcenter", address: "710 NE 1st Ave", zip: "33132", units: 560, stories: 0,
    developer: "Lalezarian Properties", eta: "Leasing now", etaShort: "Now",
    chip: "Open · Leasing Now",
    h1: ["560 apartments", "inside the $6B", "Worldcenter", "district."],
    sub: "Lalezarian Properties' Miami World Tower at 710 NE 1st Avenue — 560 residences with Brightline, the Kaseya Center and Worldcenter's retail all within a few blocks.",
    ticker: ["560 residences","Miami Worldcenter","Walk to Brightline","Kaseya Center nearby","Leasing now"],
    stats: [["560","Residences"],["$6B","Worldcenter District"],["27","District Acres"],["Now","Leasing"]],
    kicker: "710 NE 1st Avenue",
    h2: "Inside the district, not near it",
    body: [
      "Miami World Tower holds 560 rental residences and roughly 3,100 square feet of retail inside Miami Worldcenter — the 27-acre, $6 billion redevelopment that reshaped the northern end of Downtown Miami.",
      "Brightline at MiamiCentral runs to Fort Lauderdale, Boca, West Palm Beach and Orlando from a few blocks away. The Kaseya Center, Bayside and the Arts & Entertainment District are all within walking distance."
    ],
    cards: [
      ["Brightline on foot","MiamiCentral is a short walk — Fort Lauderdale in 30 minutes, Orlando without driving."],
      ["Worldcenter retail","The district's restaurants and shops are part of the neighborhood, not a drive away."],
      ["560 residences","Enough scale that something is usually opening across bedroom counts."]
    ],
    faq: [
      ["Is Miami World Tower currently available?","Yes — it's an operating rental building. Send your bedroom count and timing and we'll check what's open."],
      ["How much is rent?","Pricing moves weekly across the 560 residences. Send your budget and we'll tell you what fits."],
      ["Who is the developer?","Lalezarian Properties, at 710 NE 1st Avenue within Miami Worldcenter."],
      ["What is Miami Worldcenter?","A 27-acre, $6 billion mixed-use district in Downtown Miami with residential towers, retail, restaurants and hotels."]
    ],
    moveIn: ["As soon as possible","Next 30 days","Next 60 days","Flexible"],
    ctaH2: "Check availability.",
    ctaP: "560 residences inside Miami Worldcenter. Tell us what you need and we'll come back with what's actually open."
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
    // The neighborhood search: "mohawk wynwood apartments". Exact-match domain
    // for the building name, and Rilea has published no leasing site — the same
    // pairing that made downtown6miami.com the portfolio's only real earner.
    mode: "waitlist", palette: { ink:"#1d1410", a:"#e0774a", deep:"#a84f27", pale:"#fde9de" },
    hood: "Wynwood", address: "56 NE 29th St", zip: "33137", units: 300, stories: 0,
    developer: "Rilea Group", eta: "2028", etaShort: "'28", delivers: "2028-01-01",
    verified: "2026-09-21",
    chip: "Under Construction · Delivering 2028",
    h1: ["300 loft-style", "apartments on the", "north edge of", "Wynwood."],
    sub: "Rilea Group's Mohawk at Wynwood brings Chicago brick, industrial steel and 30,000 sq ft of retail to NE 29th Street. Nothing is leasing yet, and nobody has published a rent.",
    ticker: ["300 residences","Studios to three bedrooms","Lanai homes with private yards","30,000 sq ft retail","Delivering 2028"],
    stats: [["300","Residences"],["2028","Completion"],["30k","Sq Ft Retail"],["1.5","Acre Site"]],
    kicker: "56 NE 29th Street",
    h2: "The Wynwood building that looks like Wynwood",
    body: [
      "Mohawk sits on a 1.5-acre site on NE 29th Street, at the seam where the Wynwood Arts District runs into Edgewater — walkable to the murals along NW 2nd Avenue in one direction, to Midtown's shops and the bay in the other.",
      "Deforma Studio and RADYCA designed it in Chicago brick, exposed steel detailing and floor-to-ceiling glazing rather than the white stucco-and-glass template most of the corridor is built from. The 300 residences run studio to three-bedroom, including lanai homes with private outdoor space at the base of the building."
    ],
    cards: [
      ["Lanai homes","Ground-connected residences with private outdoor yards — rare in a Miami rental building, and usually the first thing claimed."],
      ["Wynwood without the sublet","300 institutionally managed rentals under one operator. Most of what is advertised in Wynwood today is an individual condo owner's unit on a one-year gamble."],
      ["Retail that opens with it","Rilea is selling the 30,000 sq ft of ground-floor retail rather than leasing it, and about a third was spoken for during construction — so the street level should arrive with the building, not years after."]
    ],
    faq: [
      ["When does Mohawk at Wynwood start leasing?","Construction is financed and underway, with completion set for 2028. Lease-up usually opens as a building tops out — waitlist members are emailed the day pricing is published."],
      ["How much will rent be?","Nothing has been published. Rilea has released no rents, floor plans or leasing site for Mohawk, which is exactly why this list exists."],
      ["What is a lanai unit?","A ground-connected residence with its own private outdoor space — a small yard rather than a balcony. Mohawk includes a set of them at the base of the building."],
      ["Where exactly is it?","A 1.5-acre site at 56 NE 29th Street, on the northern edge of the Wynwood Arts District at the Edgewater line."],
      ["Who is the developer?","Rilea Group, a Miami developer led by Alan and Diego Ojeda, with architecture by Deforma Studio and RADYCA and construction by Coastal Construction."]
    ],
    moveIn: ["2028","2029","Flexible"],
    ctaH2: "Be on the list before the rents exist.",
    ctaP: "300 apartments with no published pricing anywhere and no leasing office to call. Floor plans and rents — emailed the day Rilea releases them."
  },
  {
    domain: "mohawkmiami.com", name: "Mohawk at Wynwood", short: "MOHAWK", accent: "MIAMI",
    // Overridden because mohawkwynwood.com covers the same building: left to
    // derive, both pages would ship the identical title and description.
    title: "Mohawk Miami Apartments — Amenities, Rents & the 2028 Waitlist",
    ogTitle: "Mohawk Miami — Amenities & 2028 Rents",
    desc: "Mohawk at Wynwood, Miami: 300 rental apartments at 56 NE 29th St by Rilea Group, with a Turkish hammam spa, padel court and rooftop dog park. Delivering 2028 — join the waitlist for rents and floor plans.",
    // Same building as mohawkwynwood.com, deliberately a different page: this
    // one is written for the amenity-and-comparison search ("mohawk miami
    // apartments"), that one for the neighborhood search. Different palette,
    // different image pool, different copy top to bottom.
    mode: "waitlist", palette: { ink:"#131b1a", a:"#5cc2a4", deep:"#2a7d66", pale:"#dcf5ec" },
    hood: "Wynwood", address: "56 NE 29th St", zip: "33137", units: 300, stories: 0,
    developer: "Rilea Group", eta: "2028", etaShort: "'28", delivers: "2028-01-01",
    verified: "2026-09-21",
    chip: "Under Construction · Rentals Delivering 2028",
    h1: ["A hammam, a padel", "court and a rooftop", "dog park. Also,", "an apartment."],
    sub: "Mohawk is Rilea Group's 300-unit rental on NE 29th Street, and its amenity deck reads like a members' club. Rents have not been published — this is the list that gets them first.",
    ticker: ["Turkish hammam spa","Cold plunge & infrared sauna","Padel court","Rooftop pools & lounges","Rooftop dog park","Co-working"],
    stats: [["300","Residences"],["2028","Completion"],["$149M","Construction Loan"],["Studio–3BR","Unit Mix"]],
    kicker: "Amenities at Mohawk",
    h2: "The amenity deck is the pitch",
    body: [
      "Miami rental towers compete on amenity decks, and most settle on the same three: a pool, a gym, a lounge. Mohawk's program is unusual enough to be worth naming in full — rooftop pools and lounges, a padel court, a Turkish hammam spa with cold plunges and infrared saunas, co-working space, children's play areas and a rooftop dog park.",
      "That program is also the clearest signal of the rent tier the building is aiming at, and it is the one piece of information available before pricing is. Rilea Group is building it on 1.5 acres at 56 NE 29th Street with $149 million of construction financing behind it, for delivery in 2028."
    ],
    cards: [
      ["A spa, not a sauna closet","A Turkish hammam with cold plunges and infrared saunas is a hotel amenity. Almost nothing in the Miami rental market carries one."],
      ["Padel, on site","Court time in Miami is booked out and priced accordingly. One in the building is a standing reservation."],
      ["Built to be lived in","Children's play areas and a rooftop dog park in the same program as the spa — an amenity deck aimed at people staying, not touring."]
    ],
    faq: [
      ["What amenities will Mohawk at Wynwood have?","Rooftop pools and lounges, a padel court, a Turkish hammam spa with cold plunges and infrared saunas, co-working space, children's play areas and a rooftop dog park, plus 30,000 square feet of ground-floor retail."],
      ["When can I rent at Mohawk?","Construction is underway with completion set for 2028. Leasing normally opens as a building tops out; this list is emailed the day pricing is released."],
      ["How much will it cost?","No rents have been published. The amenity program points at the top of the Wynwood rental market, but the actual numbers go to this list first."],
      ["How many apartments are there?","300 residences, studio through three-bedroom, including lanai homes with private outdoor space."],
      ["Who is building it?","Rilea Group, with architecture by Deforma Studio and RADYCA and construction by Coastal Construction, at 56 NE 29th Street in Miami."]
    ],
    moveIn: ["2028","2029","Flexible"],
    ctaH2: "First look at Mohawk's rents.",
    ctaP: "A hammam, a padel court and 300 apartments with no published price. One email the day Rilea puts a number on it."
  },
  {
    domain: "2900terrace.com", name: "2900 Terrace", short: "2900", accent: "TERRACE",
    // Exact-match domain for the building name, and the developers have
    // published no leasing site — 2900terrace.com and 2900terracemiami.com were
    // both parked when this was written. Strongest of the wave 3 domains.
    mode: "waitlist", palette: { ink:"#111c26", a:"#7fa8d8", deep:"#3b6699", pale:"#e3eefb" },
    hood: "Edgewater", address: "401 NE 29th St", zip: "33137", units: 324, stories: 32,
    developer: "Oak Row Equities and LNDMRK Development", eta: "Q4 2027", etaShort: "Q4 '27", delivers: "2027-10-01",
    verified: "2026-09-21",
    chip: "Topped Out · Delivering Q4 2027",
    h1: ["324 apartments", "with wraparound", "terraces and", "home offices."],
    sub: "Oak Row Equities and LNDMRK Development have topped out a 32-story Arquitectonica tower at 401 NE 29th Street. One-, two- and three-bedroom rentals averaging over 1,000 sq ft — no studios, no micro-units.",
    ticker: ["324 residences","32 stories","Topped out","10-ft ceilings","Wraparound terraces","Delivering Q4 2027"],
    stats: [["324","Residences"],["32","Stories"],["1,069","Avg Sq Ft"],["Q4 '27","Completion"]],
    kicker: "401 NE 29th Street",
    h2: "Built bigger than the rest of Edgewater",
    body: [
      "2900 Terrace occupies about 1.5 acres on NE 29th Street, one of the last sizeable undeveloped parcels left in Edgewater. The Shops at Midtown Miami sit a few blocks north, the Design District about a mile up, and Margaret Pace Park and the bay a short walk east.",
      "Arquitectonica designed the 32-story, 362-foot tower around unusually large floor plans: 324 one- to three-bedroom residences averaging roughly 1,069 square feet, with 10-foot ceilings, floor-to-ceiling glazing, wraparound balconies and dedicated home offices. Coastal Construction topped it out ahead of a fourth-quarter 2027 completion."
    ],
    cards: [
      ["No studios","The unit mix starts at one bedroom and averages over 1,000 square feet — the opposite of the compact-unit trend running through the rest of the neighborhood."],
      ["Terraces that wrap","Wraparound balconies and 10-foot ceilings on a 362-foot tower, in a market where a new-construction balcony is usually a ledge."],
      ["Home office, built in","Dedicated work space inside the floor plan rather than a corner of the bedroom, plus content-creation studios and co-working in the podium."]
    ],
    faq: [
      ["When does 2900 Terrace start leasing?","The tower has topped out and is tracking to completion in the fourth quarter of 2027. Lease-up pricing is normally released a few months ahead of that — waitlist members are emailed first."],
      ["How much will rent be?","Nothing has been published. With an average residence over 1,000 square feet, expect pricing above Edgewater's compact new-construction stock — but the actual numbers go to this list first."],
      ["How big are the apartments?","324 residences averaging roughly 1,069 square feet, in one-, two- and three-bedroom layouts with 10-foot ceilings and wraparound terraces."],
      ["Where exactly is it?","401 NE 29th Street, on a 1.5-acre site in Miami's Edgewater neighborhood, a few blocks south of Midtown."],
      ["Who is the developer?","Oak Row Equities and LNDMRK Development, with architecture by Arquitectonica and construction by Coastal Construction."]
    ],
    moveIn: ["Late 2027","2028","Flexible"],
    ctaH2: "Get 2900 Terrace pricing first.",
    ctaP: "324 large apartments in Edgewater with no published rent and no leasing office to call. Floor plans and pricing — emailed the moment they're released."
  },
  {
    domain: "neoedgewatermiami.com", name: "Neo Edgewater", short: "NEO", accent: "EDGEWATER",
    // Same building as 2600biscaynemiami.com: 2600 Biscayne Blvd leases under
    // the name Neo Edgewater. This page is the brand-and-pricing search, the
    // 2600 page the address-and-office search. Note the official leasing site
    // neoedgewater.com is live and real, so this is the weakest domain of the
    // wave — an availability page competing with an operator, not a vacuum.
    mode: "availability", palette: { ink:"#0f1724", a:"#8ea2ff", deep:"#41539e", pale:"#e6eaff" },
    hood: "Edgewater", address: "2600 Biscayne Blvd", zip: "33137", units: 399, stories: 41,
    developer: "Oak Row Equities", eta: "Preleasing now", etaShort: "Now", year: 2026,
    verified: "2026-09-21",
    title: "Neo Edgewater Apartments — 2600 Biscayne, Miami | Rents, Specials & Availability",
    ogTitle: "Neo Edgewater — Now Preleasing, Edgewater Miami",
    desc: "Neo Edgewater at 2600 Biscayne Blvd, Miami: 399 apartments now preleasing from about $2,727, with a multi-level Equinox and first residents in October 2026. Check what's available and what it costs.",
    chip: "Preleasing · First Residents October 2026",
    h1: ["Miami's newest", "41-story rental", "just opened its", "leasing office."],
    sub: "Neo Edgewater started preleasing in September 2026 at 2600 Biscayne Boulevard — 399 residences of roughly 500 to 1,700 sq ft, an Equinox in the building, and the first move-ins in October.",
    ticker: ["399 residences","41 stories","500–1,700 sq ft","Equinox fitness club","Pool decks on 14 and 42","First residents October 2026"],
    stats: [["$2,727+","Studios From"],["$3,742+","1 Beds From"],["399","Residences"],["41","Stories"]],
    kicker: "2600 Biscayne Boulevard",
    h2: "A lease-up is the cheapest a new building ever is",
    body: [
      "Neo Edgewater is the residential half of Oak Row Equities' 41-story Arquitectonica tower on Biscayne Boulevard, with Bozzuto running leasing and the first residents moving in from October 2026. Studios, one-, two- and three-bedroom residences run roughly 500 to 1,700 square feet, with interiors by Vida Design.",
      "The amenity floors are stacked rather than clustered: a wrap-around pool deck on the 14th floor, a rooftop deck on the 42nd, a multi-level Equinox fitness club, co-working space and weekend access to a padel court. Published starting rents are about $2,727 for a studio, $3,742 for a one-bedroom and $5,792 for two bedrooms and up."
    ],
    cards: [
      ["Lease-up pricing","Opening concessions exist to fill 399 apartments quickly, and they shrink as the building fills. A month free on 14–18 month terms was advertised during preleasing."],
      ["Equinox downstairs","A multi-level Equinox inside the building. Anywhere else in Edgewater that is a separate membership and a walk."],
      ["Two pool decks","A wrap-around deck on the 14th floor and a roof deck on the 42nd — the difference between an afternoon in the sun and the view over the bay."]
    ],
    faq: [
      ["Is Neo Edgewater leasing right now?","Yes. Preleasing launched in September 2026 and the first residents move in from October 2026, so inventory releases in waves rather than all at once."],
      ["How much is rent at Neo Edgewater?","Published starting rents are around $2,727 for studios, $3,742 for one-bedrooms and $5,792 for two bedrooms and up. Lease-up numbers move with each release — send your bedroom count and we'll check today's."],
      ["Are there move-in specials?","A month free on 14–18 month leases was advertised during preleasing, with restrictions. Concessions on a lease-up change as the building fills, which is the reason to ask early rather than late."],
      ["Where is Neo Edgewater?","2600 Biscayne Boulevard, in Miami's Edgewater neighborhood — a short walk from Margaret Pace Park and the bay, with Midtown and Wynwood just west."],
      ["Who built it?","Oak Row Equities, with architecture by Arquitectonica, interiors by Vida Design and residential leasing by Bozzuto."]
    ],
    moveIn: ["As soon as possible","October 2026","Next 60 days","Flexible"],
    ctaH2: "See what's open, and what it actually costs.",
    ctaP: "399 apartments releasing in waves, with concessions that change as floors fill. Tell us the bedroom count, budget and timing and we'll come back with what's available now."
  }
];

module.exports = BUILDINGS;
module.exports.FACTS_VERIFIED = FACTS_VERIFIED;
