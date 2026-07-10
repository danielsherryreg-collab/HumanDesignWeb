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

const SIGN_SHADOWS = {
  Aries: "impatience, defensiveness, and the urge to prove yourself before you feel safe",
  Taurus: "attachment to comfort, fear of disruption, and confusing stability with staying still",
  Gemini: "mental noise, scattered attention, and using cleverness to avoid emotional truth",
  Cancer: "protective withdrawal, old emotional memory, and carrying needs you have not named",
  Leo: "performance, pride, and the ache of wanting to be witnessed without having to earn love",
  Virgo: "self-criticism, over-analysis, and the habit of turning care into pressure",
  Libra: "people-pleasing, indecision, and losing your center while trying to keep harmony",
  Scorpio: "control, suspicion, intensity, and the fear of being truly exposed",
  Sagittarius: "restlessness, blunt escape, and turning belief into a way to outrun vulnerability",
  Capricorn: "emotional restraint, over-responsibility, and measuring worth through endurance",
  Aquarius: "detachment, exile, and hiding tenderness behind independence or intelligence",
  Pisces: "porous boundaries, idealization, and disappearing into what others need from you",
};

const SIGN_MEDICINE = {
  Aries: "choose clean action without treating every delay as a threat",
  Taurus: "let your body teach you the difference between peace and stagnation",
  Gemini: "speak the simple truth before your mind makes it more elegant than honest",
  Cancer: "protect your softness without building a life around old pain",
  Leo: "create from devotion rather than from the hunger to be chosen",
  Virgo: "turn discernment into craft, not punishment",
  Libra: "practice harmony that includes your own desire",
  Scorpio: "let intimacy be a place of revelation, not surveillance",
  Sagittarius: "anchor your freedom in meaning instead of escape",
  Capricorn: "build with ambition while allowing support to reach you",
  Aquarius: "bring your difference closer to people instead of using it as distance",
  Pisces: "keep your compassion, but give it edges",
};

const PLANET_ROLES = {
  Sun: "identity, vitality, and the central storyline of becoming",
  Moon: "emotional memory, needs, and instinctive self-protection",
  Mercury: "language, perception, and the way your mind organizes reality",
  Venus: "attraction, pleasure, bonding, and what makes connection feel safe",
  Mars: "desire, anger, drive, and the way you move under pressure",
  Jupiter: "growth, faith, opportunity, and the pattern that expands your life",
  Saturn: "discipline, fear, maturity, and the lesson that becomes authority",
  Uranus: "liberation, disruption, originality, and the place you refuse to be contained",
  Neptune: "dreams, longing, surrender, and the fog that asks for spiritual clarity",
  Pluto: "power, compulsion, transformation, and the material you cannot keep unconscious",
};

const ASPECT_MEANINGS = {
  conjunction: "two inner forces fused together, making this theme hard to ignore",
  sextile: "a quiet opportunity that becomes stronger when you consciously use it",
  square: "friction that pushes growth through discomfort, tension, and choice",
  trine: "a natural talent or ease that can become powerful when you stop taking it for granted",
  opposition: "a polarity that plays out through relationships, projection, and integration",
};

const GATE_THEMES = {
  1: "creative self-expression",
  2: "receptive direction",
  3: "ordering chaos into a new beginning",
  4: "mental answers and doubt",
  5: "natural rhythm and patience",
  6: "emotional boundaries and intimacy",
  7: "guidance and leadership",
  8: "contribution through individual style",
  9: "focus and detailed attention",
  10: "self-love and correct behavior",
  11: "ideas, memory, and inner imagery",
  12: "selective expression",
  13: "listening, secrets, and memory",
  14: "resources and direction through work",
  15: "extremes, magnetism, and broad love",
  16: "skills, enthusiasm, and mastery",
  17: "opinions and pattern recognition",
  18: "correction, refinement, and judgment",
  19: "sensitivity, needs, and belonging",
  20: "presence in the now",
  21: "control, will, and material order",
  22: "grace, openness, and emotional mood",
  23: "simplification and explanation",
  24: "returning thoughts and rationalization",
  25: "innocence, spirit, and the open heart",
  26: "persuasion, memory, and integrity",
  27: "nourishment and responsibility",
  28: "struggle, risk, and purpose",
  29: "commitment and saying yes",
  30: "desire, intensity, and emotional fate",
  31: "influence and democratic leadership",
  32: "continuity, instinct, and fear of failure",
  33: "privacy, retreat, and storytelling",
  34: "raw power and self-generated movement",
  35: "experience, change, and emotional hunger",
  36: "crisis, feeling, and initiation",
  37: "family, agreements, and emotional loyalty",
  38: "the fight for meaning",
  39: "provocation and emotional awakening",
  40: "willpower, solitude, and agreements",
  41: "fantasy, desire, and new cycles",
  42: "growth, completion, and maturation",
  43: "breakthrough and inner knowing",
  44: "pattern memory and instinctive recognition",
  45: "gathering, ownership, and material influence",
  46: "embodiment and love of the body",
  47: "realization after pressure",
  48: "depth and fear of inadequacy",
  49: "principles, rejection, and revolution",
  50: "values, responsibility, and protection",
  51: "shock, courage, and initiation",
  52: "stillness and concentration",
  53: "beginnings and pressure to start",
  54: "ambition and transformation through drive",
  55: "spirit, mood, and emotional abundance",
  56: "stimulation, stories, and meaning",
  57: "intuition and survival clarity",
  58: "joy, vitality, and improvement",
  59: "intimacy, fertility, and breaking barriers",
  60: "limitation and mutation",
  61: "inner truth and mystery",
  62: "details, naming, and precision",
  63: "doubt, suspicion, and future logic",
  64: "confusion before clarity",
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

function formatPlacement(planet) {
  return `${planet.label} ${planet.degree} deg ${planet.sign}, house ${planet.house}`;
}

function gateTheme(gate) {
  return GATE_THEMES[gate] || "a specific life theme";
}

function describeAspect(aspect) {
  if (!aspect) return "";
  return `${aspect.from} ${aspect.type} ${aspect.to} (${aspect.orb} deg orb): ${ASPECT_MEANINGS[aspect.type]}.`;
}

function findAspect(aspects, from, to) {
  return aspects.find(
    (aspect) =>
      (aspect.from === from && aspect.to === to) ||
      (aspect.from === to && aspect.to === from),
  );
}

function buildFocusList(planets) {
  return [planets.sun, planets.moon, planets.mercury, planets.venus, planets.mars]
    .map((planet) => `${planet.label}: Gate ${planet.hd.gate}.${planet.hd.line} (${gateTheme(planet.hd.gate)})`)
    .join("; ");
}

function buildCards(chart, firstName) {
  const name = firstName ? `${firstName}, ` : "";
  const sun = chart.planets.sun;
  const moon = chart.planets.moon;
  const mercury = chart.planets.mercury;
  const mars = chart.planets.mars;
  const venus = chart.planets.venus;
  const saturn = chart.planets.saturn;
  const pluto = chart.planets.pluto;
  const asc = chart.ascendant;
  const strongestAspect = chart.aspects[0];
  const relationshipAspect = findAspect(chart.aspects, "Venus", "Mars") || findAspect(chart.aspects, "Moon", "Venus");
  const pressureAspect = findAspect(chart.aspects, "Sun", "Saturn") || findAspect(chart.aspects, "Moon", "Saturn") || strongestAspect;
  const sunGateTheme = gateTheme(sun.hd.gate);
  const moonGateTheme = gateTheme(moon.hd.gate);
  const designSun = chart.humanDesign.designSun;

  return [
    {
      title: "Chart Signature",
      text: `${name}your mini-reading begins with the Big Three: Sun in ${sun.sign}, Moon in ${moon.sign}, and ${asc.sign} rising. This creates a field where ${SIGN_KEYWORDS[sun.sign]} is filtered through ${SIGN_KEYWORDS[moon.sign]} and presented to the world through ${SIGN_KEYWORDS[asc.sign]}. The visible self may look like ${asc.sign}, but the life-force underneath is trying to become more ${sun.sign}.`,
    },
    {
      title: "Core Pattern",
      text: `${formatPlacement(sun)} places your identity inside ${HOUSE_TOPICS[sun.house]}. The gift is ${SIGN_MEDICINE[sun.sign]}; the shadow is ${SIGN_SHADOWS[sun.sign]}. In Human Design, your Personality Sun activates Gate ${sun.hd.gate}.${sun.hd.line}, a theme of ${sunGateTheme}. This is the frequency people often feel from you before you explain yourself.`,
    },
    {
      title: "Emotional Pattern",
      text: `${formatPlacement(moon)} shows what your nervous system returns to when life gets quiet. Your emotional body seeks ${SIGN_KEYWORDS[moon.sign]}, especially around ${HOUSE_TOPICS[moon.house]}. The shadow can become ${SIGN_SHADOWS[moon.sign]}; the medicine is to ${SIGN_MEDICINE[moon.sign]}. Moon Gate ${moon.hd.gate}.${moon.hd.line} adds ${moonGateTheme} to your emotional field.`,
    },
    {
      title: "Mind and Voice",
      text: `${formatPlacement(mercury)} describes how you name reality, read signals, and protect yourself through thought. Your words carry ${SIGN_KEYWORDS[mercury.sign]}, but the shadow can become ${SIGN_SHADOWS[mercury.sign]}. When this placement is clean, your voice helps turn private perception into something useful, precise, and difficult to ignore.`,
    },
    {
      title: "Desire and Relationship Mirror",
      text: `${formatPlacement(venus)} describes attraction, pleasure, and the conditions that make connection feel safe. ${formatPlacement(mars)} shows pursuit, anger, and desire. Together they ask for relationships that respect both ${SIGN_KEYWORDS[venus.sign]} and ${SIGN_KEYWORDS[mars.sign]}. ${relationshipAspect ? describeAspect(relationshipAspect) : "No tight Venus-Mars or Moon-Venus aspect was found, so the sign and house placements carry more weight in this layer."}`,
    },
    {
      title: "Pressure Point",
      text: strongestAspect
        ? `${describeAspect(strongestAspect)} This is one of the first tensions to watch because it repeats until it becomes conscious. It can show up as a recurring emotional script, a familiar relationship dynamic, or a place where your body reacts before your mind has finished understanding.`
        : "No tight major aspect appeared within the basic orb set. That makes the Big Three, houses, and Human Design gates especially important in this mini-reading.",
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
