const REPORT_PRICE_CENTS = 1999;
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
          longitude: planet.longitude,
          house: planet.house,
          humanDesignGate: planet.hd ? `${planet.hd.gate}.${planet.hd.line}` : "Unknown",
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

function paragraph(parts) {
  return parts.filter(Boolean).join(" ");
}

function placementByName(astrology, name) {
  return (astrology.houses || []).find((placement) => placement.planet === name) || {};
}

function signFormula(sign, theme) {
  return `${sign} carries ${theme}. In a shadow reading, this is never treated as a flat personality label; it is read as a pressure pattern, a desire pattern, and a survival intelligence that can become either a gift or a loop.`;
}

function createMockAiReport({ user, reading }) {
  const input = buildReportInput({ user, reading });
  const astrology = input.calculatedData.astrology;
  const displayName = input.user.name || "Stargazer";
  const strongestAspect = astrology.aspects[0];
  const aspectLine = strongestAspect
    ? `${strongestAspect.from} ${strongestAspect.type} ${strongestAspect.to}`
    : "your strongest visible placements";
  const sunPlacement = placementByName(astrology, "Sun");
  const moonPlacement = placementByName(astrology, "Moon");
  const mercuryPlacement = placementByName(astrology, "Mercury");
  const venusPlacement = placementByName(astrology, "Venus");
  const marsPlacement = placementByName(astrology, "Mars");
  const saturnPlacement = placementByName(astrology, "Saturn");

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
        {
          id: "personality_core_sun",
          title: "Personality Core (Sun)",
          body: paragraph([
            `Your Sun in ${astrology.sunSign}${sunPlacement.house ? ` in house ${sunPlacement.house}` : ""} describes the core current of your personality: motivation, life-force, and the way you try to become more fully yourself.`,
            `This is not a fixed label. It is a pattern of attention and energy. When the Sun is expressed clearly, you feel more direct, coherent, and internally organized. When it is under pressure, you may try to prove yourself, over-control the situation, or hide the part of you that wants to be recognized.`,
            `The useful question is simple: what makes you feel alive without forcing you to perform? That is usually where the Sun becomes healthier.`,
          ]),
        },
        {
          id: "emotional_world_moon",
          title: "Emotional World (Moon)",
          body: paragraph([
            `Your Moon in ${astrology.moonSign}${moonPlacement.house ? ` in house ${moonPlacement.house}` : ""} describes the emotional weather underneath the identity. This is where your nervous system looks for safety before your mind has explained anything.`,
            `The Moon shows reactions, needs, comfort, memory, and the style of self-protection that appears when you are tired, attached, or uncertain. Difficult Moon patterns are not weaknesses; they are signals that your emotional body is asking for care, structure, or honesty.`,
            `The more you understand this placement, the easier it becomes to separate a real present-moment need from an old emotional reflex.`,
          ]),
        },
        {
          id: "social_mask_ascendant",
          title: "Social Mask (Ascendant)",
          body: paragraph([
            `Your ${astrology.risingSign} Ascendant describes the first impression you give, the behavioral style people meet first, and the way you enter unfamiliar situations.`,
            `This can become a mask when you are under pressure: a role you use to stay safe or readable. But it can also become a healthy interface between your private inner world and the outside world.`,
            `The Ascendant is not fake. It is the doorway. The work is to let that doorway express the real person behind it instead of using it only as protection.`,
          ]),
        },
        {
          id: "synthesis",
          title: "Synthesis",
          body: paragraph([
            `The central pattern comes from the interaction between ${astrology.sunSign} Sun, ${astrology.moonSign} Moon, and ${astrology.risingSign} Rising.`,
            `The Sun shows what wants to grow, the Moon shows what needs to feel safe, and the Ascendant shows how you move through the world while both of those inner forces are active.`,
            `When these parts cooperate, you can act with more clarity and less self-defense. When they conflict, you may feel split between what you want, what you need, and what you show. The goal is not to erase the contradiction, but to understand it well enough to choose consciously.`,
          ]),
        },
        {
          id: "mind_voice",
          title: "Mind, Voice & Perception",
          body: paragraph([
            `Mercury in ${mercuryPlacement.sign || "Unknown"} shows how your mind organizes the world and how you protect yourself through language, silence, analysis, humor, or precision.`,
            `In the shadow, Mercury can become a defense: over-explaining, withholding, intellectualizing, or trying to control the emotional field through the right words.`,
            `The medicine is to let your voice become accurate rather than armored. A clean Mercury does not need to win every interpretation; it names what is true enough to move forward.`,
          ]),
        },
        {
          id: "venus_love_style",
          title: "Venus & Love Style",
          body: paragraph([
            `Venus in ${astrology.venusSign}${venusPlacement.house ? ` in house ${venusPlacement.house}` : ""} shows how you bond, what feels beautiful, and what kind of attention makes your body soften.`,
            signFormula(astrology.venusSign, "a specific love language and value system"),
            `In the shadow, Venus can confuse attraction with safety or confuse being desired with being truly met. The deeper work is learning which connections regulate you and which connections only activate the old hunger.`,
          ]),
        },
        {
          id: "mars_desire_conflict",
          title: "Mars, Desire & Conflict",
          body: paragraph([
            `Mars in ${astrology.marsSign}${marsPlacement.house ? ` in house ${marsPlacement.house}` : ""} describes your raw movement: desire, anger, pursuit, defense, and the way you act when pressure rises.`,
            `This placement is not only about conflict. It is also about permission. When Mars is integrated, you stop waiting for perfect certainty before taking clean action.`,
            `The shadow expression is either overdrive or collapse: pushing too hard, reacting too fast, or disconnecting from desire because wanting something feels dangerous.`,
          ]),
        },
        {
          id: "shadow_traits",
          title: "Shadow Traits",
          body: paragraph([
            `The recurring shadow pattern in this chart is created by the tension between ${astrology.sunSign} identity, ${astrology.moonSign} emotional memory, and the outer signal of ${astrology.risingSign}.`,
            `When this pattern is unconscious, you may perform competence while privately carrying emotional weather that has not been witnessed. You may also become loyal to pressure because pressure feels familiar.`,
            `The gift is that the same pattern can become depth, self-command, and unusual emotional intelligence. The shadow does not need to be destroyed; it needs a more honest role.`,
          ]),
        },
        {
          id: "emotional_triggers",
          title: "Emotional Triggers",
          body: paragraph([
            `The Moon and strongest aspects point to the places where the body reacts before the mind catches up. In this chart, the trigger field is shaped by ${astrology.moonSign} emotional memory and ${aspectLine}.`,
            `A trigger is not proof that something is wrong with you. It is a signal that an old protection strategy has taken the wheel. The question is not "why am I like this?" but "what is this reaction trying to prevent me from feeling?"`,
            `When the emotional field is regulated, you can respond with precision instead of reenacting the old defense.`,
          ]),
        },
        {
          id: "relationship_patterns",
          title: "Relationship Patterns",
          body: paragraph([
            `Your relationship mirror is shaped by Venus, Mars, the Moon, and ${aspectLine}. Venus shows what attracts and soothes you. Mars shows what excites, frustrates, and mobilizes you.`,
            `The shadow relationship pattern is often a negotiation between wanting depth and wanting control over the conditions of vulnerability. The chart asks for connection that does not require self-abandonment.`,
            `The cleanest partnership path is not intensity for its own sake, but honesty with enough structure to let intimacy become safe over time.`,
          ]),
        },
        {
          id: "career_direction",
          title: "Career Energy & Public Direction",
          body: paragraph([
            `Saturn in ${saturnPlacement.sign || "Unknown"}${saturnPlacement.house ? ` in house ${saturnPlacement.house}` : ""} describes the long-term maturation path: the place where discipline slowly becomes authority.`,
            `Career energy in this report is not read as a job title. It is read as the way your system builds trust with its own capacity. The chart points toward work that lets pressure become mastery rather than quiet self-punishment.`,
            `The shadow is over-identifying with endurance. The gift is becoming someone whose presence, craft, and decisions carry weight because they were built honestly.`,
          ]),
        },
        {
          id: "energy_in_plus_minus",
          title: "Energy in Light & Shadow",
          body: paragraph([
            `In the plus expression, this chart becomes focused, emotionally perceptive, loyal to truth, and capable of turning pressure into structure. You can read atmospheres, sense hidden dynamics, and commit deeply when something has meaning.`,
            `In the minus expression, the same energy becomes guarded, over-responsible, suspicious of softness, or too willing to carry weight alone. The shadow version tries to stay safe by staying in control.`,
            `The work is to let strength include receptivity. The chart becomes more powerful when you stop treating tenderness as a liability.`,
          ]),
        },
        {
          id: "recommendations",
          title: "Recommendations & Practices",
          body: paragraph([
            `Practice one daily check-in: "What am I protecting right now?" Write the answer without making it elegant. This builds a bridge between reaction and awareness.`,
            `Use the body before analysis: walking, breath, stretching, water, and direct sensory grounding will help the Moon settle faster than trying to think your way into safety.`,
            `Choose one relationship or work situation where you usually over-control. Make one clean request instead. The chart strengthens when desire becomes language.`,
          ]),
        },
        {
          id: "growth_path",
          title: "Growth Path",
          body: paragraph([
            `The growth path is to stop treating the old protection strategy as identity and start using it as information.`,
            `Your chart does not ask you to become softer by becoming less powerful. It asks you to become more honest about where power is actually coming from: fear, pressure, devotion, truth, or love.`,
            `The more conscious this becomes, the less your life has to be organized around invisible defense. That is where the shadow begins to turn into direction.`,
          ]),
        },
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
