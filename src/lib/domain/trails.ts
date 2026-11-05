import type { ProvenanceKind } from "./types";

/**
 * Curated trail catalogue.
 *
 * Every figure here was taken from the source named next to it, and checked on the
 * `checkedAt` date. Where a source didn't state something, the field is left null
 * rather than guessed. Stage distances are only included where an official source
 * lists them. Trails, conditions and rules change: the UI always tells users to
 * confirm on the official site before they go.
 */

export interface TrailSource {
  name: string;
  url: string;
  kind: Extract<ProvenanceKind, "official" | "third_party">;
}

export interface TrailFact<T> {
  value: T | null;
  source: number | null; // index into sources
}

export interface TrailStage {
  from: string;
  to: string;
  distanceKm: number | null;
  source: number | null;
}

export interface Trail {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  region: string;
  currency: string;
  timezone: string;
  lat: number;
  lon: number;
  blurb: string;
  type: "point_to_point" | "loop" | "out_and_back";
  distanceKm: TrailFact<number>;
  days: TrailFact<string>; // e.g. "6", "3–4"
  daysTypical: number;
  highPointM: TrailFact<number>;
  grade: TrailFact<string>;
  gradingSystem: string;
  experience: "beginner" | "intermediate" | "experienced";
  terrain: string[];
  scenery: string[];
  camping: "huts" | "campsites" | "huts_and_campsites" | "mixed_accommodation";
  season: TrailFact<string>;
  start: string;
  finish: string;
  overnightStops: TrailFact<string[]>;
  stages: TrailStage[];
  permits: TrailFact<string>;
  access: TrailFact<string>;
  water: TrailFact<string>;
  hazards: { text: string; source: number | null }[];
  sources: TrailSource[];
  checkedAt: string;
  photo?: { file: string; alt: string };
}

export const TRAILS: Trail[] = [
  {
    id: "overland-track",
    name: "Overland Track",
    country: "Australia",
    countryCode: "AU",
    region: "Tasmania",
    currency: "AUD",
    timezone: "Australia/Hobart",
    lat: -41.6375,
    lon: 145.9497,
    blurb:
      "Tasmania's best-known multi-day walk, crossing Cradle Mountain–Lake St Clair National Park through alpine moorland, rainforest and glacial lakes.",
    type: "point_to_point",
    distanceKm: { value: 65, source: 0 },
    days: { value: "6", source: 0 },
    daysTypical: 6,
    highPointM: { value: null, source: null },
    grade: { value: null, source: null },
    gradingSystem: "Australian Walking Track Grading System (AS 2156.1)",
    experience: "intermediate",
    terrain: ["boardwalk", "alpine", "rocky", "mud"],
    scenery: ["mountains", "lakes", "alpine", "rainforest"],
    camping: "huts_and_campsites",
    season: {
      value: "Bookings and fees apply in the booking season (October to May). Walking outside the season is possible but conditions are harsher.",
      source: 0,
    },
    start: "Cradle Mountain (Ronny Creek)",
    finish: "Lake St Clair",
    overnightStops: {
      value: ["Waterfall Valley Hut", "Windermere Hut", "New Pelion Hut", "Kia Ora Hut", "Bert Nichols Hut", "Narcissus Hut"],
      source: 1,
    },
    stages: [],
    permits: {
      value: "Booking required in the booking season. The booking fee includes a parks pass for the walk. One-way, north to south (Cradle Mountain to Lake St Clair).",
      source: 0,
    },
    access: { value: null, source: null },
    water: { value: null, source: null },
    hazards: [{ text: "Alpine weather can change rapidly, with snow possible in any month. Carry a tent even if you plan to use huts.", source: null }],
    sources: [
      { name: "Service Tasmania — Book the Overland Track", url: "https://www.service.tas.gov.au/services/recreation-and-animals/parks-and-reserves/book-the-overland-track/", kind: "official" },
      { name: "Wikipedia — Overland Track (hut list)", url: "https://en.wikipedia.org/wiki/Overland_Track", kind: "third_party" },
      { name: "Tasmania Parks and Wildlife Service", url: "https://parks.tas.gov.au/", kind: "official" },
    ],
    checkedAt: "2026-11-05",
    photo: { file: "Cradle Mountain Behind Dove Lake.jpg", alt: "Cradle Mountain rising behind Dove Lake" },
  },
  {
    id: "milford-track",
    name: "Milford Track",
    country: "New Zealand",
    countryCode: "NZ",
    region: "Fiordland, Southland",
    currency: "NZD",
    timezone: "Pacific/Auckland",
    lat: -44.9,
    lon: 167.9,
    blurb:
      "A New Zealand Great Walk through Fiordland's Clinton and Arthur valleys and over Mackinnon Pass, ending on Milford Sound.",
    type: "point_to_point",
    distanceKm: { value: 53.5, source: 0 },
    days: { value: "4 days, 3 nights", source: 0 },
    daysTypical: 4,
    highPointM: { value: 1140, source: 1 },
    grade: { value: "Great Walk", source: 0 },
    gradingSystem: "Department of Conservation track categories (New Zealand)",
    experience: "intermediate",
    terrain: ["valley", "alpine pass", "rainforest"],
    scenery: ["mountains", "waterfalls", "rainforest", "fiords"],
    camping: "huts",
    season: { value: "Great Walks season: 1 November to 30 April. Bookings required in season.", source: 0 },
    start: "Glade Wharf (head of Lake Te Anau)",
    finish: "Sandfly Point (Milford Sound)",
    overnightStops: { value: ["Clinton Hut", "Mintaro Hut", "Dumpling Hut"], source: 0 },
    stages: [
      { from: "Glade Wharf", to: "Clinton Hut", distanceKm: 5, source: 0 },
      { from: "Clinton Hut", to: "Mintaro Hut", distanceKm: 17.5, source: 0 },
      { from: "Mintaro Hut", to: "Dumpling Hut", distanceKm: 13, source: 0 },
      { from: "Dumpling Hut", to: "Sandfly Point", distanceKm: 18, source: 0 },
    ],
    permits: { value: "Hut bookings required in the Great Walks season. Camping is not permitted. One-way only, Glade Wharf to Sandfly Point.", source: 0 },
    access: {
      value: "Bus or private transport to Te Anau Downs, then a boat to Glade Wharf. A boat from Sandfly Point to Milford Sound. No vehicle access to either end; book transport in advance.",
      source: 0,
    },
    water: { value: null, source: null },
    hazards: [
      { text: "Complex avalanche terrain with over 57 avalanche paths. DOC manages risk during the Great Walks season.", source: 0 },
      { text: "Not an all-weather track: the Clinton and Arthur valleys can become impassable in heavy rain.", source: 0 },
      { text: "No mobile phone coverage on the track.", source: 0 },
    ],
    sources: [
      { name: "Department of Conservation — Milford Track", url: "https://www.doc.govt.nz/milfordtrack", kind: "official" },
      { name: "Wikipedia — Milford Track", url: "https://en.wikipedia.org/wiki/Milford_Track", kind: "third_party" },
    ],
    checkedAt: "2026-11-05",
    photo: { file: "Mount Elliot from McKinnon Pass - Milford Track.jpg", alt: "Mount Elliot seen from Mackinnon Pass on the Milford Track" },
  },
  {
    id: "six-foot-track",
    name: "Six Foot Track",
    country: "Australia",
    countryCode: "AU",
    region: "Blue Mountains, New South Wales",
    currency: "AUD",
    timezone: "Australia/Sydney",
    lat: -33.73,
    lon: 150.25,
    blurb:
      "A historic bridle trail from Katoomba down through the Megalong Valley and across the Coxs River into the Blue Mountains' western ranges.",
    type: "point_to_point",
    distanceKm: { value: 42, source: 0 },
    days: { value: "3", source: 0 },
    daysTypical: 3,
    highPointM: { value: null, source: null },
    grade: { value: "Hard", source: 0 },
    gradingSystem: "NSW National Parks grading (based on AS 2156.1)",
    experience: "intermediate",
    terrain: ["fire trail", "steep descent", "river valley"],
    scenery: ["valleys", "rivers", "forest", "escarpments"],
    camping: "campsites",
    season: { value: null, source: null },
    start: "Katoomba (Explorers Tree area)",
    finish: "Binda Bush cabins (while Jenolan Karst Conservation Reserve is closed)",
    overnightStops: { value: null, source: null },
    stages: [],
    permits: { value: null, source: null },
    access: { value: "No public transport to or from Binda Bush cabins: arrange your own pick-up.", source: 0 },
    water: { value: "Bring drinking water. The official page does not list reliable water sources.", source: 0 },
    hazards: [
      { text: "The track can become boggy after rain. Check the weather and current alerts first.", source: 0 },
      { text: "The usual finish at Jenolan is affected by the Jenolan Karst Conservation Reserve closure.", source: 0 },
    ],
    sources: [{ name: "NSW National Parks and Wildlife Service — Six Foot Track", url: "https://www.nationalparks.nsw.gov.au/things-to-do/walking-tracks/six-foot-track", kind: "official" }],
    checkedAt: "2026-11-05",
  },
  {
    id: "west-highland-way",
    name: "West Highland Way",
    country: "United Kingdom",
    countryCode: "GB",
    region: "Scotland",
    currency: "GBP",
    timezone: "Europe/London",
    lat: 56.5,
    lon: -4.7,
    blurb:
      "Scotland's first long-distance route, from the outskirts of Glasgow along Loch Lomond, across Rannoch Moor and through Glen Coe to Fort William.",
    type: "point_to_point",
    distanceKm: { value: 154, source: 1 },
    days: { value: null, source: null },
    daysTypical: 7,
    highPointM: { value: 550, source: 1 },
    grade: { value: null, source: null },
    gradingSystem: "No single official grade (Scotland's Great Trails)",
    experience: "intermediate",
    terrain: ["paths", "old military road", "lochside", "moor"],
    scenery: ["lochs", "mountains", "moorland", "glens"],
    camping: "mixed_accommodation",
    season: { value: null, source: null },
    start: "Milngavie",
    finish: "Fort William",
    overnightStops: {
      value: ["Drymen", "Balmaha / Rowardennan", "Inverarnan", "Tyndrum", "Bridge of Orchy / Inveroran", "Kingshouse", "Kinlochleven"],
      source: 1,
    },
    stages: [{ from: "Milngavie", to: "Drymen", distanceKm: 19, source: 0 }],
    permits: {
      value: "Loch Lomond camping management byelaws apply from 1 March to 30 September: camp only at campsites or in designated permit areas.",
      source: 0,
    },
    access: { value: null, source: null },
    water: { value: null, source: null },
    hazards: [],
    sources: [
      { name: "West Highland Way — official site", url: "https://www.westhighlandway.org/", kind: "official" },
      { name: "Wikipedia — West Highland Way", url: "https://en.wikipedia.org/wiki/West_Highland_Way", kind: "third_party" },
    ],
    checkedAt: "2026-11-05",
    photo: { file: "West Highland Way 2005 Coe.jpg", alt: "The West Highland Way near Glen Coe" },
  },
  {
    id: "laugavegur",
    name: "Laugavegur",
    country: "Iceland",
    countryCode: "IS",
    region: "Southern Highlands",
    currency: "ISK",
    timezone: "Atlantic/Reykjavik",
    lat: 63.86,
    lon: -19.2,
    blurb:
      "A hut-to-hut trek from the rhyolite hills of Landmannalaugar past obsidian fields, black-sand deserts and glacier rivers to the valley of Þórsmörk.",
    type: "point_to_point",
    distanceKm: { value: 55.5, source: 0 },
    days: { value: null, source: null },
    daysTypical: 4,
    highPointM: { value: null, source: null },
    grade: { value: null, source: null },
    gradingSystem: "No single official grade",
    experience: "intermediate",
    terrain: ["volcanic", "river crossings", "snowfields", "sand"],
    scenery: ["volcanic", "glaciers", "geothermal", "highlands"],
    camping: "huts_and_campsites",
    season: { value: "Usually July and August; the trail is occasionally closed in extreme weather.", source: 0 },
    start: "Landmannalaugar",
    finish: "Þórsmörk (Langidalur)",
    overnightStops: { value: ["Hrafntinnusker", "Álftavatn", "Botnar / Emstrur"], source: 0 },
    stages: [],
    permits: { value: "Huts run by Ferðafélag Íslands (FÍ) need reservations, which open for the coming summer.", source: 0 },
    access: { value: null, source: null },
    water: { value: null, source: null },
    hazards: [
      { text: "Unbridged glacial river crossings, including the Þröngá before Þórsmörk.", source: 0 },
      { text: "Check SafeTravel.is track advisories and hut wardens' weather updates.", source: 0 },
    ],
    sources: [
      { name: "Andrew Skurka — Laugavegur quickstart guide", url: "https://andrewskurka.com/iceland-laugavegur-fimmvorduhals-quickstart-guide/", kind: "third_party" },
      { name: "Ferðafélag Íslands (hut operator)", url: "https://www.fi.is/en", kind: "official" },
      { name: "SafeTravel Iceland", url: "https://safetravel.is/", kind: "official" },
    ],
    checkedAt: "2026-11-05",
    photo: { file: "Landscape during Laugavegur hiking trail 2-CA reduced.jpg", alt: "Volcanic landscape on the Laugavegur trail" },
  },
  {
    id: "john-muir-trail",
    name: "John Muir Trail",
    country: "United States",
    countryCode: "US",
    region: "Sierra Nevada, California",
    currency: "USD",
    timezone: "America/Los_Angeles",
    lat: 37.2,
    lon: -118.7,
    blurb:
      "A long-distance trail through the High Sierra from Yosemite Valley to the summit of Mount Whitney, crossing a string of high passes.",
    type: "point_to_point",
    distanceKm: { value: 340, source: 1 },
    days: { value: "About three weeks", source: 1 },
    daysTypical: 21,
    highPointM: { value: 4421, source: 1 },
    grade: { value: null, source: null },
    gradingSystem: "No single official grade (US National Park Service / Forest Service)",
    experience: "experienced",
    terrain: ["high passes", "granite", "alpine"],
    scenery: ["mountains", "lakes", "alpine", "granite"],
    camping: "campsites",
    season: { value: null, source: null },
    start: "Happy Isles, Yosemite Valley",
    finish: "Mount Whitney (exit via Whitney Portal)",
    overnightStops: { value: null, source: null },
    stages: [],
    permits: {
      value: "One Yosemite wilderness permit covers a continuous hike. Exits over Donohue Pass are limited to 45 people per day.",
      source: 0,
    },
    access: { value: null, source: null },
    water: { value: null, source: null },
    hazards: [{ text: "Approved bear canisters are required throughout Yosemite; hanging food is prohibited.", source: 0 }],
    sources: [
      { name: "US National Park Service — Yosemite: John Muir Trail", url: "https://www.nps.gov/yose/planyourvisit/jmt.htm", kind: "official" },
      { name: "Wikipedia — John Muir Trail", url: "https://en.wikipedia.org/wiki/John_Muir_Trail", kind: "third_party" },
    ],
    checkedAt: "2026-11-05",
  },
];

export const findTrail = (id?: string | null) => TRAILS.find((t) => t.id === id);

/** Thumbnail URL from Wikimedia Commons via Special:FilePath (redirects to a resized image). */
export function commonsImage(file: string, width = 1200): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}?width=${width}`;
}
export function commonsPage(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;
}

/** Compact catalogue description for AI prompts. */
export function catalogueForPrompt(): string {
  return TRAILS.map(
    (t) =>
      `- id=${t.id}: ${t.name} (${t.region}, ${t.country}); ${t.distanceKm.value ?? "?"} km; typically ${t.daysTypical} days; ${t.experience}; scenery: ${t.scenery.join(", ")}; overnight: ${t.camping}`,
  ).join("\n");
}
