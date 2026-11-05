/**
 * Official sources to check for alerts, closures, fire danger and weather, by country
 * (and region where it matters). Rovefern links to these rather than claiming to have
 * live coverage everywhere. Emergency numbers are the national ones.
 */
export interface Authority {
  name: string;
  url: string;
  covers: string;
}

export interface CountryInfo {
  emergency: string;
  weather: Authority;
  parks: Authority[];
  fire?: Authority;
  notes?: string;
}

const AU_REGIONS: Record<string, Authority[]> = {
  tasmania: [{ name: "Tasmania Parks and Wildlife Service — alerts", url: "https://parks.tas.gov.au/", covers: "Park alerts, closures and bookings in Tasmania" }],
  "new south wales": [{ name: "NSW National Parks — alerts", url: "https://www.nationalparks.nsw.gov.au/alerts/alerts-list", covers: "Closures and alerts in NSW parks" }],
  nsw: [{ name: "NSW National Parks — alerts", url: "https://www.nationalparks.nsw.gov.au/alerts/alerts-list", covers: "Closures and alerts in NSW parks" }],
  "blue mountains": [{ name: "NSW National Parks — alerts", url: "https://www.nationalparks.nsw.gov.au/alerts/alerts-list", covers: "Closures and alerts in NSW parks" }],
  victoria: [{ name: "Parks Victoria — alerts", url: "https://www.parks.vic.gov.au/", covers: "Park alerts in Victoria" }],
  queensland: [{ name: "Queensland Parks — alerts", url: "https://parks.qld.gov.au/park-alerts", covers: "Park alerts in Queensland" }],
};

export const COUNTRY_INFO: Record<string, CountryInfo> = {
  Australia: {
    emergency: "000 (112 from mobiles)",
    weather: { name: "Bureau of Meteorology", url: "http://www.bom.gov.au/", covers: "Forecasts and warnings" },
    parks: [],
    fire: { name: "Australian fire danger ratings (state fire services)", url: "https://www.afac.com.au/initiative/afdrs", covers: "Fire danger ratings and total fire bans" },
    notes: "Personal locator beacons can be hired free in some parks, such as the Blue Mountains.",
  },
  "New Zealand": {
    emergency: "111",
    weather: { name: "MetService — mountain forecasts", url: "https://www.metservice.com/mountain", covers: "National park and mountain forecasts" },
    parks: [{ name: "Department of Conservation — track alerts", url: "https://www.doc.govt.nz/parks-and-recreation/know-before-you-go/alerts/", covers: "Track closures and alerts" }],
    fire: { name: "Fire and Emergency NZ — Check it's alright", url: "https://www.checkitsalright.nz/", covers: "Fire seasons and restrictions" },
  },
  "United Kingdom": {
    emergency: "999 or 112 (ask for Police, then Mountain Rescue)",
    weather: { name: "Met Office — mountain forecasts", url: "https://www.metoffice.gov.uk/weather/specialist-forecasts/mountain", covers: "Mountain area forecasts" },
    parks: [{ name: "Mountain Weather Information Service", url: "https://www.mwis.org.uk/", covers: "Upland forecasts for UK mountain areas" }],
  },
  Iceland: {
    emergency: "112",
    weather: { name: "Icelandic Met Office (Veðurstofa Íslands)", url: "https://en.vedur.is/", covers: "Forecasts and warnings" },
    parks: [{ name: "SafeTravel Iceland", url: "https://safetravel.is/", covers: "Road and trail conditions, alerts, travel plans" }],
    notes: "You can leave a travel plan with SafeTravel.",
  },
  "United States": {
    emergency: "911",
    weather: { name: "National Weather Service", url: "https://www.weather.gov/", covers: "Forecasts and warnings" },
    parks: [{ name: "National Park Service — alerts by park", url: "https://www.nps.gov/planyourvisit/alerts.htm", covers: "Park alerts and closures" }],
    fire: { name: "InciWeb — wildfire incidents", url: "https://inciweb.wildfire.gov/", covers: "Active wildfire incidents" },
  },
  Canada: {
    emergency: "911",
    weather: { name: "Environment and Climate Change Canada", url: "https://weather.gc.ca/", covers: "Forecasts and warnings" },
    parks: [{ name: "Parks Canada — alerts", url: "https://parks.canada.ca/", covers: "Park alerts and closures" }],
  },
};

export function authoritiesFor(country?: string, region?: string, destination?: string): CountryInfo & { regional: Authority[] } {
  const info = (country && COUNTRY_INFO[country]) || null;
  const hay = `${region ?? ""} ${destination ?? ""}`.toLowerCase();
  const regional = country === "Australia" ? Object.entries(AU_REGIONS).filter(([k]) => hay.includes(k)).flatMap(([, v]) => v) : [];
  const unique = regional.filter((a, i) => regional.findIndex((b) => b.url === a.url) === i);
  return {
    emergency: info?.emergency ?? "Look up the local emergency number before you go (112 works on mobiles in many countries).",
    weather: info?.weather ?? { name: "The national weather service for this country", url: "https://public.wmo.int/en/about-us/members", covers: "Find it through the World Meteorological Organization's member list" },
    parks: info?.parks ?? [],
    fire: info?.fire,
    notes: info?.notes,
    regional: unique,
  };
}
