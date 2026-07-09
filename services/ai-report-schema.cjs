const REPORT_PRICE_CENTS = 1900;
const REPORT_CURRENCY = "USD";

const AI_REPORT_SCHEMA_VERSION = "2026-07-shadow-chart-v1";

// Future integration point: replace this mock generator with OpenAI structured JSON generation.
// The website should keep rendering this same shape so AI output never becomes raw page text.
const AI_REPORT_JSON_SCHEMA = {
  meta: {
    productName: "Shadow Chart",
    reportType: "natal",
    language: "en",
    tone: "dark_astrology",
    confidenceLevel: "medium",
    missingDataWarnings: [],
    generatedAt: "ISO_DATE_STRING",
  },
  identity: {
    displayName: "string",
    title: "string",
    subtitle: "string",
    archetypeName: "string",
    oneSentenceSummary: "string",
  },
  viralScript: {
    hook: "string",
    voiceover: "string",
    caption: "string",
    onScreenText: [],
    hashtags: [],
  },
  previewReport: {
    headline: "string",
    sections: [],
  },
  fullReport: {
    sections: [],
  },
  humanDesign: {
    summary: {},
    raveChartVisualData: {
      centers: [],
      channels: [],
      gates: [],
    },
    raveChartStyle: {},
  },
  imageGeneration: {
    mainPrompt: "string",
    negativePrompt: "string",
    aspectRatio: "9:16",
    styleKeywords: [],
  },
  uiCards: [],
  email: {
    subject: "string",
    previewText: "string",
    headline: "string",
    body: "string",
    ctaText: "string",
  },
  upsell: {
    headline: "string",
    subheadline: "string",
    includedItems: [],
    ctaText: "Unlock Full Report",
  },
};

const OPENAI_REPORT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "meta",
    "identity",
    "viralScript",
    "previewReport",
    "fullReport",
    "humanDesign",
    "imageGeneration",
    "uiCards",
    "email",
    "upsell",
  ],
  properties: {
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["productName", "reportType", "language", "tone", "confidenceLevel", "missingDataWarnings", "generatedAt", "schemaVersion"],
      properties: {
        productName: { type: "string" },
        reportType: { type: "string" },
        language: { type: "string" },
        tone: { type: "string" },
        confidenceLevel: { type: "string", enum: ["high", "medium", "low"] },
        missingDataWarnings: { type: "array", items: { type: "string" } },
        generatedAt: { type: "string" },
        schemaVersion: { type: "string" },
      },
    },
    identity: {
      type: "object",
      additionalProperties: false,
      required: ["displayName", "title", "subtitle", "archetypeName", "oneSentenceSummary"],
      properties: {
        displayName: { type: "string" },
        title: { type: "string" },
        subtitle: { type: "string" },
        archetypeName: { type: "string" },
        oneSentenceSummary: { type: "string" },
      },
    },
    viralScript: {
      type: "object",
      additionalProperties: false,
      required: ["hook", "voiceover", "caption", "onScreenText", "hashtags"],
      properties: {
        hook: { type: "string" },
        voiceover: { type: "string" },
        caption: { type: "string" },
        onScreenText: { type: "array", items: { type: "string" } },
        hashtags: { type: "array", items: { type: "string" } },
      },
    },
    previewReport: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "sections"],
      properties: {
        headline: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "title", "summary", "body", "locked"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              summary: { type: "string" },
              body: { type: "string" },
              locked: { type: "boolean" },
            },
          },
        },
      },
    },
    fullReport: {
      type: "object",
      additionalProperties: false,
      required: ["sections"],
      properties: {
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "title", "body"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
            },
          },
        },
      },
    },
    humanDesign: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "raveChartVisualData", "raveChartStyle"],
      properties: {
        summary: {
          type: "object",
          additionalProperties: false,
          required: ["type", "strategy", "authority", "profile", "definition", "interpretation"],
          properties: {
            type: { type: "string" },
            strategy: { type: "string" },
            authority: { type: "string" },
            profile: { type: "string" },
            definition: { type: "string" },
            interpretation: { type: "string" },
          },
        },
        raveChartVisualData: {
          type: "object",
          additionalProperties: false,
          required: ["centers", "channels", "gates"],
          properties: {
            centers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "label", "defined", "color", "glow", "position"],
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  defined: { type: "boolean" },
                  color: { type: "string" },
                  glow: { type: "boolean" },
                  position: {
                    type: "object",
                    additionalProperties: false,
                    required: ["x", "y"],
                    properties: { x: { type: "number" }, y: { type: "number" } },
                  },
                },
              },
            },
            channels: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "fromCenter", "toCenter", "active", "color", "glow"],
                properties: {
                  id: { type: "string" },
                  fromCenter: { type: "string" },
                  toCenter: { type: "string" },
                  active: { type: "boolean" },
                  color: { type: "string" },
                  glow: { type: "boolean" },
                },
              },
            },
            gates: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "center", "active", "label"],
                properties: {
                  id: { type: "string" },
                  center: { type: "string" },
                  active: { type: "boolean" },
                  label: { type: "string" },
                },
              },
            },
          },
        },
        raveChartStyle: {
          type: "object",
          additionalProperties: false,
          required: ["background", "lineStyle", "definedCenterStyle", "undefinedCenterStyle", "accentColors", "typography", "mood"],
          properties: {
            background: { type: "string" },
            lineStyle: { type: "string" },
            definedCenterStyle: { type: "string" },
            undefinedCenterStyle: { type: "string" },
            accentColors: { type: "array", items: { type: "string" } },
            typography: { type: "string" },
            mood: { type: "string" },
          },
        },
      },
    },
    imageGeneration: {
      type: "object",
      additionalProperties: false,
      required: ["mainPrompt", "negativePrompt", "aspectRatio", "styleKeywords"],
      properties: {
        mainPrompt: { type: "string" },
        negativePrompt: { type: "string" },
        aspectRatio: { type: "string" },
        styleKeywords: { type: "array", items: { type: "string" } },
      },
    },
    uiCards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "eyebrow", "body", "icon", "locked"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          eyebrow: { type: "string" },
          body: { type: "string" },
          icon: { type: "string" },
          locked: { type: "boolean" },
        },
      },
    },
    email: {
      type: "object",
      additionalProperties: false,
      required: ["subject", "previewText", "headline", "body", "ctaText"],
      properties: {
        subject: { type: "string" },
        previewText: { type: "string" },
        headline: { type: "string" },
        body: { type: "string" },
        ctaText: { type: "string" },
      },
    },
    upsell: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "subheadline", "includedItems", "ctaText"],
      properties: {
        headline: { type: "string" },
        subheadline: { type: "string" },
        includedItems: { type: "array", items: { type: "string" } },
        ctaText: { type: "string" },
      },
    },
  },
};

const CENTER_LAYOUT = [
  { id: "head", label: "Head", x: 50, y: 6 },
  { id: "ajna", label: "Ajna", x: 50, y: 18 },
  { id: "throat", label: "Throat", x: 50, y: 32 },
  { id: "g_center", label: "G Center", x: 50, y: 48 },
  { id: "heart", label: "Heart", x: 68, y: 48 },
  { id: "spleen", label: "Spleen", x: 32, y: 62 },
  { id: "solar_plexus", label: "Solar Plexus", x: 68, y: 62 },
  { id: "sacral", label: "Sacral", x: 50, y: 68 },
  { id: "root", label: "Root", x: 50, y: 86 },
];

const CENTER_COLORS = {
  head: "#D8B46A",
  ajna: "#6C4BD8",
  throat: "#C7C4D8",
  g_center: "#D8B46A",
  heart: "#8A2E5D",
  spleen: "#284A7A",
  solar_plexus: "#8A2E5D",
  sacral: "#D8B46A",
  root: "#3A2F2F",
};

function safe(value, fallback = "Unknown") {
  return value || fallback;
}

function createSection(id, title, body, locked = false) {
  return {
    id,
    title,
    summary: body.slice(0, 150),
    body,
    locked,
  };
}

function getCoreChart(reading) {
  const chart = reading.chart || {};
  const planets = chart.planets || {};
  return {
    sun: planets.sun || {},
    moon: planets.moon || {},
    venus: planets.venus || {},
    mars: planets.mars || {},
    saturn: planets.saturn || {},
    ascendant: chart.ascendant || {},
    humanDesign: chart.humanDesign || {},
    aspects: chart.aspects || [],
  };
}

function buildReportInput({ user, reading }) {
  const core = getCoreChart(reading);

  return {
    reportType: "natal",
    user: {
      name: reading.firstName || user.name || "Stargazer",
      birthDate: reading.birthDate,
      birthTime: reading.birthTime,
      birthPlace: reading.birthPlace,
      birthTimeKnown: Boolean(reading.birthTime),
    },
    partner: null,
    calculatedData: {
      astrology: {
        sunSign: safe(core.sun.sign),
        moonSign: safe(core.moon.sign),
        risingSign: safe(core.ascendant.sign),
        venusSign: safe(core.venus.sign),
        marsSign: safe(core.mars.sign),
        houses: Object.values(reading.chart?.planets || {}).map((planet) => ({
          planet: planet.label,
          sign: planet.sign,
          degree: planet.degree,
          house: planet.house,
        })),
        aspects: core.aspects,
      },
      humanDesign: {
        // Future integration point: replace these approximations with a deterministic Human Design calculation API.
        type: "Unknown",
        strategy: "Pending bodygraph calculation",
        authority: "Pending bodygraph calculation",
        profile: "Pending profile calculation",
        definition: "Pending definition calculation",
        definedCenters: ["head", "throat", "spleen", "sacral", "root"],
        undefinedCenters: ["ajna", "g_center", "heart", "solar_plexus"],
        definedChannels: [
          { id: "head-ajna", fromCenter: "head", toCenter: "ajna" },
          { id: "throat-g", fromCenter: "throat", toCenter: "g_center" },
          { id: "spleen-sacral", fromCenter: "spleen", toCenter: "sacral" },
          { id: "sacral-root", fromCenter: "sacral", toCenter: "root" },
        ],
        activeGates: [
          core.humanDesign.personalitySun,
          core.humanDesign.personalityEarth,
          core.humanDesign.designSun,
          core.humanDesign.designEarth,
        ].filter(Boolean),
      },
    },
    contentSettings: {
      language: "en",
      tone: "dark_astrology",
      audience: "tiktok_instagram",
      depth: "full",
      format: "json",
    },
  };
}

function buildRaveChartVisualData(input) {
  const definedCenters = new Set(input.calculatedData.humanDesign.definedCenters || []);
  const activeGates = input.calculatedData.humanDesign.activeGates || [];

  return {
    centers: CENTER_LAYOUT.map((center) => {
      const defined = definedCenters.has(center.id);
      return {
        id: center.id,
        label: center.label,
        defined,
        color: defined ? CENTER_COLORS[center.id] : "#1C1A22",
        glow: defined,
        position: { x: center.x, y: center.y },
      };
    }),
    channels: (input.calculatedData.humanDesign.definedChannels || []).map((channel) => ({
      ...channel,
      active: true,
      color: "#D8B46A",
      glow: true,
    })),
    gates: activeGates.map((gate, index) => ({
      id: String(gate.gate || `gate-${index + 1}`),
      center: CENTER_LAYOUT[index % CENTER_LAYOUT.length].id,
      active: true,
      label: gate.line ? `${gate.gate}.${gate.line}` : String(gate.gate || index + 1),
    })),
  };
}

function createMockAiReport({ user, reading }) {
  const input = buildReportInput({ user, reading });
  const astrology = input.calculatedData.astrology;
  const displayName = input.user.name || "Stargazer";
  const strongestAspect = astrology.aspects[0];
  const aspectLine = strongestAspect
    ? `${strongestAspect.from} ${strongestAspect.type} ${strongestAspect.to}`
    : "your strongest visible placements";

  return {
    meta: {
      productName: "Shadow Chart",
      reportType: "natal",
      language: "en",
      tone: "dark_astrology",
      confidenceLevel: input.user.birthTimeKnown ? "medium" : "low",
      missingDataWarnings: input.user.birthTimeKnown ? [] : ["Birth time is unknown, so houses and rising sign are uncertain."],
      generatedAt: new Date().toISOString(),
      schemaVersion: AI_REPORT_SCHEMA_VERSION,
    },
    identity: {
      displayName,
      title: `${displayName}'s Shadow Chart`,
      subtitle: `${astrology.sunSign} Sun, ${astrology.moonSign} Moon, ${astrology.risingSign} Rising`,
      archetypeName: `The ${astrology.sunSign} Shadow Alchemist`,
      oneSentenceSummary: `Your chart blends ${astrology.sunSign} life-force with ${astrology.moonSign} emotional patterning and a ${astrology.risingSign} outer signal.`,
    },
    viralScript: {
      hook: `If you have ${astrology.sunSign} Sun and ${astrology.moonSign} Moon, your shadow is not random.`,
      voiceover: `Your chart is not here to make you predictable. It shows where your nervous system repeats old protection patterns until you become conscious enough to choose differently.`,
      caption: `A dark astrology reading for ${displayName}: ${astrology.sunSign} Sun, ${astrology.moonSign} Moon, ${astrology.risingSign} Rising.`,
      onScreenText: ["Your shadow pattern is visible in the chart", `${astrology.sunSign} Sun`, `${astrology.moonSign} Moon`, "Unlock the full report"],
      hashtags: ["#astrology", "#birthchart", "#shadowwork", "#humandesign", "#darkastrology"],
    },
    previewReport: {
      headline: "Your first layer is already visible.",
      sections: [
        createSection("core_pattern", "Core Pattern", `Your Sun in ${astrology.sunSign} describes the central fire of the chart: the identity pattern trying to become conscious.`),
        createSection("shadow_trait", "Shadow Trait", `The emotional shadow is carried by the Moon in ${astrology.moonSign}, especially when old safety strategies take over.`),
        createSection("relationship_pattern", "Relationship Pattern", `Venus in ${astrology.venusSign} and Mars in ${astrology.marsSign} describe attraction, desire, defense, and the mirror you meet in intimacy.`),
        createSection("full_emotional_map", "Full Emotional Map", "The complete emotional map unlocks the deeper house and aspect pattern behind your triggers.", true),
      ],
    },
    fullReport: {
      sections: [
        { id: "birth_chart_overview", title: "Birth Chart Overview", body: `This report uses the calculated chart data for ${displayName}: ${astrology.sunSign} Sun, ${astrology.moonSign} Moon, and ${astrology.risingSign} Rising.` },
        { id: "sun_moon_rising", title: "Sun, Moon & Rising", body: `The Sun describes the path of becoming, the Moon reveals the emotional survival pattern, and the Rising sign shows the atmosphere people meet first.` },
        { id: "venus_love_style", title: "Venus & Love Style", body: `Venus in ${astrology.venusSign} shows how connection becomes magnetic, safe, or complicated.` },
        { id: "mars_desire_conflict", title: "Mars, Desire & Conflict", body: `Mars in ${astrology.marsSign} reveals the way desire becomes action, anger, pursuit, or protection.` },
        { id: "shadow_traits", title: "Shadow Traits", body: `The shadow pattern is not a flaw. It is a survival intelligence that needs a better job.` },
        { id: "emotional_triggers", title: "Emotional Triggers", body: `The Moon and the strongest aspects point to the places where the body reacts before the mind catches up.` },
        { id: "relationship_patterns", title: "Relationship Patterns", body: `Your relationship mirror is shaped by Venus, Mars, and ${aspectLine}.` },
        { id: "growth_path", title: "Growth Path", body: `The growth path is to stop treating the old protection strategy as identity and start using it as information.` },
      ],
    },
    humanDesign: {
      summary: {
        type: input.calculatedData.humanDesign.type,
        strategy: input.calculatedData.humanDesign.strategy,
        authority: input.calculatedData.humanDesign.authority,
        profile: input.calculatedData.humanDesign.profile,
        definition: input.calculatedData.humanDesign.definition,
        interpretation: "This first layer renders the bodygraph visually from structured JSON. Type, authority, profile, centers, and channels are ready for a deterministic Human Design engine.",
      },
      raveChartVisualData: buildRaveChartVisualData(input),
      raveChartStyle: {
        background: "black cosmic background with purple nebula and subtle particles",
        lineStyle: "thin silver sacred geometry lines",
        definedCenterStyle: "soft glowing glassmorphism shapes",
        undefinedCenterStyle: "dark translucent shapes with faint border",
        accentColors: ["#D8B46A", "#6C4BD8", "#284A7A", "#C7C4D8"],
        typography: "elegant serif titles with clean sans-serif labels",
        mood: "premium dark astrology, futuristic occult, cinematic",
      },
    },
    imageGeneration: {
      mainPrompt: `Premium dark astrology portrait aura for ${displayName}, ${astrology.sunSign} Sun, ${astrology.moonSign} Moon, ${astrology.risingSign} rising, black cosmic background, gold occult geometry, cinematic luxury editorial style.`,
      negativePrompt: "cartoon, low quality, blurry, cheap horoscope style, extra text, distorted face",
      aspectRatio: "9:16",
      styleKeywords: ["dark astrology", "luxury occult", "cinematic", "gold geometry", "shadow work"],
    },
    uiCards: [
      { id: "sun", title: `${astrology.sunSign} Sun`, eyebrow: "Core", body: "Your identity pattern and central vitality.", icon: "sun", locked: false },
      { id: "moon", title: `${astrology.moonSign} Moon`, eyebrow: "Emotion", body: "Your private needs and emotional memory.", icon: "moon", locked: false },
      { id: "rising", title: `${astrology.risingSign} Rising`, eyebrow: "Signal", body: "The atmosphere people meet first.", icon: "sparkles", locked: false },
    ],
    email: {
      subject: "Your Shadow Chart full report is ready",
      previewText: "Your full dark astrology report has been generated.",
      headline: `${displayName}, your full report is ready`,
      body: "Open your private report page to read the full interpretation and download the PDF when PDF generation is connected.",
      ctaText: "Open Full Report",
    },
    upsell: {
      headline: "Unlock the complete Shadow Chart",
      subheadline: "A deeper psychological astrology report generated from your calculated chart data.",
      includedItems: ["Full natal report", "Human Design visual layer", "Rave chart renderer", "PDF-ready structure", "Email-ready summary"],
      ctaText: "Unlock Full Report",
    },
  };
}

module.exports = {
  AI_REPORT_JSON_SCHEMA,
  AI_REPORT_SCHEMA_VERSION,
  OPENAI_REPORT_JSON_SCHEMA,
  REPORT_CURRENCY,
  REPORT_PRICE_CENTS,
  buildReportInput,
  createMockAiReport,
};
