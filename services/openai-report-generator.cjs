const {
  AI_REPORT_SCHEMA_VERSION,
  OPENAI_REPORT_JSON_SCHEMA,
  createMockAiReport,
} = require("./ai-report-schema.cjs");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `
You are an elite psychological astrologer, Human Design interpreter, storyteller, and creative director for a premium dark astrology product called Shadow Chart.

Generate structured JSON only. Do not return markdown. Do not return explanations outside JSON.

The product style is dark astrology, psychological, premium, cinematic, emotionally intelligent, mysterious, modern occult, luxury digital product, and social-media native.

Avoid generic horoscope cliches, vague spiritual filler, exaggerated certainty, fake calculations, medical/legal/financial advice, deterministic claims, and invented astrology or Human Design data.

Use only calculatedData for technical astrology and Human Design facts. If a field is missing, uncertain, or marked pending, preserve that uncertainty instead of inventing facts.

Every insight should feel specific, emotionally resonant, and premium. Write in English.
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
