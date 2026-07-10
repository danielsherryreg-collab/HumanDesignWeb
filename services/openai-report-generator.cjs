const {
  AI_REPORT_SCHEMA_VERSION,
  OPENAI_REPORT_JSON_SCHEMA,
  createMockAiReport,
} = require("./ai-report-schema.cjs");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `
You are an experienced astrologer with a background in psychology and a calm, human, non-fatalistic writing style.

Generate structured JSON only. Do not return markdown. Do not return explanations outside JSON.

The product style is dark astrology, psychological, premium, emotionally intelligent, clear, and accessible to a regular user.

Avoid generic horoscope cliches, vague spiritual filler, exaggerated certainty, fake calculations, medical/legal/financial advice, deterministic claims, and invented astrology or Human Design data.

Use only calculatedData for technical astrology facts. Do not invent placements, houses, aspects, or birth details.

Every insight should feel specific, emotionally resonant, and premium. Write in English.

Primary task:
Create a psychological portrait based on the user's natal chart. The user wants to better understand their character, behavior patterns, and inner reactions.

Main focus:
- Sun: sign, house, relevant aspects, personality core, motivation, life-force, natural direction.
- Moon: sign, house, relevant aspects, emotional reactions, needs, comfort zone, instinctive safety patterns.
- Ascendant: sign and degree, first impression, social mask, behavioral style, body language, social adaptation.
- Synthesis: how Sun, Moon, and Ascendant interact psychologically, including strengths, contradictions, and recurring patterns.

Writing rules:
- Use simple, clear language.
- Avoid fatalism and predictions.
- Avoid medical, legal, or financial advice.
- Do not write "you are doomed to", "this will happen", or deterministic claims.
- Frame difficult traits as understandable patterns that can be worked with.
- Human Design is not ready for the user-facing report yet. Keep the required humanDesign JSON object structurally valid, but do not create a Human Design report section and do not emphasize pending Human Design fields.

Depth requirements:
- fullReport.sections must contain 10-12 sections.
- Each fullReport section body must be substantial: 900-1400 characters when possible.
- The first four sections must be exactly: "Personality Core (Sun)", "Emotional World (Moon)", "Social Mask (Ascendant)", and "Synthesis".
- After that, include sections for mind and voice, Venus and love style, Mars and conflict, emotional triggers, relationship patterns, recommendations/practices, and growth path.
- Write like a paid premium report, not a short horoscope preview.
- Do not invent planetary positions, houses, aspects, Human Design type, authority, profile, centers, or channels. Use unknown wording when data is not available.
`.trim();

function extractOutputText(responseJson) {
  if (typeof responseJson.output_text === "string") return responseJson.output_text;

  for (const item of responseJson.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
      if (content.type === "text" && typeof content.text === "string") return content.text;
    }
  }

  return "";
}

function ensureReportShape(report) {
  if (!report || typeof report !== "object") throw new Error("OpenAI returned an empty report.");
  if (!report.meta || !report.identity || !report.fullReport || !report.humanDesign) {
    throw new Error("OpenAI report is missing required top-level sections.");
  }
  if (!Array.isArray(report.fullReport.sections) || !report.fullReport.sections.length) {
    throw new Error("OpenAI report has no full report sections.");
  }
  if (!report.humanDesign.raveChartVisualData || !Array.isArray(report.humanDesign.raveChartVisualData.centers)) {
    throw new Error("OpenAI report has no rave chart visual data.");
  }

  report.meta.schemaVersion = report.meta.schemaVersion || AI_REPORT_SCHEMA_VERSION;
  return report;
}

async function generateOpenAiReport({ promptInput, fallbackReport }) {
  if (process.env.DISABLE_OPENAI_REPORT === "true") {
    return {
      report: fallbackReport,
      provider: "mock_disabled_openai",
      errorMessage: "",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      report: fallbackReport,
      provider: "mock",
      errorMessage: "",
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate a Shadow Chart full report as strict structured product JSON.",
            reportSchemaVersion: AI_REPORT_SCHEMA_VERSION,
            input: promptInput,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "shadow_chart_full_report",
          strict: true,
          schema: OPENAI_REPORT_JSON_SCHEMA,
        },
      },
    }),
  });

  const responseJson = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = responseJson.error?.message || responseJson.message || "OpenAI report generation failed.";
    throw new Error(message);
  }

  const outputText = extractOutputText(responseJson);
  if (!outputText) throw new Error("OpenAI response did not include output text.");

  return {
    report: ensureReportShape(JSON.parse(outputText)),
    provider: "openai",
    errorMessage: "",
  };
}

async function generateStructuredReport({ user, reading, promptInput }) {
  const fallbackReport = createMockAiReport({ user, reading });

  try {
    return await generateOpenAiReport({ promptInput, fallbackReport });
  } catch (error) {
    if (process.env.OPENAI_STRICT === "true") throw error;

    return {
      report: fallbackReport,
      provider: "mock_after_openai_error",
      errorMessage: error.message,
    };
  }
}

module.exports = {
  generateStructuredReport,
};
