const axios = require("axios");
const { find } = require("geo-tz");
const Astronomy = require("astronomy-engine");

const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

const PLANETS = [
  { key: "sun", label: "Sun", body: Astronomy.Body.Sun },
  { key: "moon", label: "Moon", body: Astronomy.Body.Moon },
  { key: "mercury", label: "Mercury", body: Astronomy.Body.Mercury },
  { key: "venus", label: "Venus", body: Astronomy.Body.Venus },
  { key: "mars", label: "Mars", body: Astronomy.Body.Mars },
  { key: "jupiter", label: "Jupiter", body: Astronomy.Body.Jupiter },
  { key: "saturn", label: "Saturn", body: Astronomy.Body.Saturn },
  { key: "uranus", label: "Uranus", body: Astronomy.Body.Uranus },
  { key: "neptune", label: "Neptune", body: Astronomy.Body.Neptune },
  { key: "pluto", label: "Pluto", body: Astronomy.Body.Pluto },
];

const ASPECTS = [
  { type: "conjunction", angle: 0, orb: 8 },
  { type: "sextile", angle: 60, orb: 5 },
  { type: "square", angle: 90, orb: 6 },
  { type: "trine", angle: 120, orb: 6 },
  { type: "opposition", angle: 180, orb: 8 },
];

const HD_GATE_SEQUENCE = [
  25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12,
  15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6,
  46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11,
  10, 58, 38, 54, 61, 60, 41, 19, 13, 49, 30, 55, 37, 63, 22, 36,
];

const SIGN_KEYWORDS = {
  Aries: "instinct, initiation, direct action",
  Taurus: "stability, embodiment, value, resources",
  Gemini: "language, curiosity, adaptation",
  Cancer: "protection, memory, emotional belonging",
  Leo: "visibility, creative fire, self-expression",
  Virgo: "precision, craft, service, refinement",
  Libra: "mirroring, partnership, proportion",
  Scorpio: "depth, shadow, desire, transformation",
  Sagittarius: "meaning, expansion, belief, movement",
  Capricorn: "structure, discipline, long-term ambition",
  Aquarius: "difference, systems, future-facing intelligence",
  Pisces: "sensitivity, surrender, imagination",
};

const HOUSE_TOPICS = {
  1: "identity and first impressions",
  2: "money, values, and self-worth",
  3: "voice, learning, and daily perception",
  4: "home, roots, and private emotional ground",
  5: "creativity, romance, and pleasure",
  6: "work rhythm, health, and craft",
  7: "partnership and projection",
  8: "intimacy, fear, power, and shared resources",
  9: "meaning, travel, study, and belief",
  10: "career, visibility, and public direction",
  11: "community, networks, and future goals",
  12: "the unconscious, solitude, and hidden patterns",
};

function normalize(value) {
  return ((value % 360) + 360) % 360;
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function getSign(longitude) {
  return SIGNS[Math.floor(normalize(longitude) / 30)];
}

function degreeInSign(longitude) {
  return round(normalize(longitude) % 30);
}

function getHouse(longitude, ascendant) {
  return Math.floor(normalize(longitude - ascendant) / 30) + 1;
}

function getGate(longitude) {
  const gateSize = 360 / 64;
  const lineSize = gateSize / 6;
  const normalized = normalize(longitude);
  const gateIndex = Math.floor(normalized / gateSize);
  const line = Math.floor((normalized - gateIndex * gateSize) / lineSize) + 1;

  return {
    gate: HD_GATE_SEQUENCE[gateIndex],
    line,
    longitude: round(normalized),
  };
}

function formatTimeParts(timeZone, date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffsetMs(timeZone, utcMs) {
  const parts = formatTimeParts(timeZone, new Date(utcMs));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcMs;
}

function zonedTimeToUtc(date, time, timeZone) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMs = localAsUtc - getTimeZoneOffsetMs(timeZone, localAsUtc);
  utcMs = localAsUtc - getTimeZoneOffsetMs(timeZone, utcMs);
  return new Date(utcMs);
}

async function geocodePlace(place) {
  const response = await axios.get("https://nominatim.openstreetmap.org/search", {
    params: {
      q: place,
      format: "jsonv2",
      limit: 1,
      addressdetails: 1,
    },
    headers: {
      "User-Agent": "ShadowChart/1.0 hello@shadowchart.space",
    },
    timeout: 12000,
  });

  const [result] = response.data || [];
  if (!result) throw new Error("Place not found. Try city and country, for example: Paris, France.");

  return {
    displayName: result.display_name,
    lat: Number(result.lat),
    lon: Number(result.lon),
  };
}

function calculateAscendant(date, lat, lon) {
  const siderealHours = Astronomy.SiderealTime(date);
  const localSiderealDegrees = normalize(siderealHours * 15 + lon);
  const ramc = (localSiderealDegrees * Math.PI) / 180;
  const latitude = (lat * Math.PI) / 180;
  const obliquity = (23.439291 * Math.PI) / 180;
  const y = -Math.cos(ramc);
  const x = Math.sin(obliquity) * Math.tan(latitude) + Math.cos(obliquity) * Math.sin(ramc);
  return normalize((Math.atan2(y, x) * 180) / Math.PI);
}

function calculatePlanets(utcDate, ascendantLongitude) {
  const planets = {};

  for (const planet of PLANETS) {
    const vector = Astronomy.GeoVector(planet.body, utcDate, true);
    const ecliptic = Astronomy.Ecliptic(vector);
    const longitude = normalize(ecliptic.elon);
    const sign = getSign(longitude);

    planets[planet.key] = {
      label: planet.label,
      longitude: round(longitude),
      latitude: round(ecliptic.elat),
      sign,
      degree: degreeInSign(longitude),
      house: getHouse(longitude, ascendantLongitude),
      hd: getGate(longitude),
    };
  }

  return planets;
}

function calculateAspects(planets) {
  const entries = Object.values(planets);
  const result = [];

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const delta = Math.abs(entries[i].longitude - entries[j].longitude);
      const distance = Math.min(delta, 360 - delta);
      const aspect = ASPECTS.find((item) => Math.abs(distance - item.angle) <= item.orb);

      if (aspect) {
        result.push({
          from: entries[i].label,
          to: entries[j].label,
          type: aspect.type,
          orb: round(Math.abs(distance - aspect.angle)),
        });
      }
    }
  }

  return result.sort((a, b) => a.orb - b.orb);
}

function buildCards(chart, firstName) {
  const name = firstName ? `${firstName}, ` : "";
  const sun = chart.planets.sun;
  const moon = chart.planets.moon;
  const mars = chart.planets.mars;
  const venus = chart.planets.venus;
  const saturn = chart.planets.saturn;
  const strongestAspect = chart.aspects[0];

  return [
    {
      title: "Core Pattern",
      text: `${name}your Sun is at ${sun.degree} deg ${sun.sign} in house ${sun.house}. This points to ${SIGN_KEYWORDS[sun.sign]} moving through ${HOUSE_TOPICS[sun.house]}. In Human Design terms, your Personality Sun activates Gate ${sun.hd.gate}.${sun.hd.line}.`,
    },
    {
      title: "Emotional Nature",
      text: `Your Moon is at ${moon.degree} deg ${moon.sign} in house ${moon.house}, coloring your needs with ${SIGN_KEYWORDS[moon.sign]}. This is the part of the chart that describes what your nervous system keeps returning to when life gets quiet.`,
    },
    {
      title: "Hidden Drive",
      text: `Mars in ${mars.sign} and house ${mars.house} shows how you pursue desire, defend your energy, and move under pressure. The shadow expression can become reactive; the clean expression is focused action.`,
    },
    {
      title: "Relationship Mirror",
      text: `Venus in ${venus.sign} reveals how you seek connection, attraction, and ease. Your chart asks for relationships that respect ${SIGN_KEYWORDS[venus.sign]} without turning that need into a performance.`,
    },
    {
      title: "Karmic Pressure",
      text: `Saturn in ${saturn.sign} and house ${saturn.house} marks a long-term lesson around ${HOUSE_TOPICS[saturn.house]}. The full report can unpack this as a growth pattern rather than a limitation.`,
    },
    {
      title: "Strongest Aspect",
      text: strongestAspect
        ? `${strongestAspect.from} ${strongestAspect.type} ${strongestAspect.to} with a ${strongestAspect.orb} deg orb is the tightest major aspect found in this mini reading. It describes an inner dialogue that repeats until it becomes conscious.`
        : "No tight major aspect appeared within the basic orb set, which makes sign, house, and Human Design gate emphasis especially important in this mini reading.",
    },
  ];
}

async function calculateReading({ birthDate, birthTime, birthPlace, firstName }) {
  if (!birthDate || !birthTime || !birthPlace) {
    throw new Error("Birth date, birth time, and birth place are required.");
  }

  const geo = await geocodePlace(birthPlace);
  const [timeZone] = find(geo.lat, geo.lon);
  if (!timeZone) throw new Error("Timezone not found for this location.");

  const utcDate = zonedTimeToUtc(birthDate, birthTime, timeZone);
  const ascendantLongitude = calculateAscendant(utcDate, geo.lat, geo.lon);
  const planets = calculatePlanets(utcDate, ascendantLongitude);
  const designDate = new Date(utcDate.getTime() - 88 * 24 * 60 * 60 * 1000);
  const designAsc = calculateAscendant(designDate, geo.lat, geo.lon);
  const designPlanets = calculatePlanets(designDate, designAsc);
  const aspects = calculateAspects(planets);

  const chart = {
    engine: "astronomy-engine",
    accuracyNote:
      "Planetary longitudes use astronomy-engine. Ascendant and Human Design gates are calculated for product-level interpretation; final professional reports should be validated against Swiss Ephemeris.",
    birth: {
      date: birthDate,
      time: birthTime,
      place: birthPlace,
      resolvedPlace: geo.displayName,
      latitude: round(geo.lat, 5),
      longitude: round(geo.lon, 5),
      timezone: timeZone,
      utc: utcDate.toISOString(),
    },
    ascendant: {
      longitude: round(ascendantLongitude),
      sign: getSign(ascendantLongitude),
      degree: degreeInSign(ascendantLongitude),
    },
    planets,
    design: {
      utc: designDate.toISOString(),
      sun: designPlanets.sun.hd,
      earth: getGate(normalize(designPlanets.sun.longitude + 180)),
    },
    humanDesign: {
      personalitySun: planets.sun.hd,
      personalityEarth: getGate(normalize(planets.sun.longitude + 180)),
      designSun: designPlanets.sun.hd,
      designEarth: getGate(normalize(designPlanets.sun.longitude + 180)),
      note: "This first Human Design layer maps planetary longitudes to gates/lines. Type, authority, centers, and profile need the next channel/center layer.",
    },
    aspects,
  };

  return {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    firstName: firstName || "",
    birthDate,
    birthTime,
    birthPlace,
    cards: buildCards(chart, firstName),
    chart,
  };
}

module.exports = {
  calculateReading,
};
