import type { ExtractedFacts } from "./facts";
import type { GoogleSearchItem } from "./google-search";

export type AiSource = {
  title: string;
  url: string;
  confidence: number;
  reason: string;
};

export type AiAnalysis = {
  sources: AiSource[];
  summary: string;
};

type OpenAiResponse = {
  output_text?: string;
};

export async function analyzeWithOpenAi(
  text: string,
  facts: ExtractedFacts,
  searchResults: GoogleSearchItem[],
): Promise<AiAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const input = buildPrompt(text, facts, searchResults);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "findorigin_result",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summary: { type: "string" },
              sources: {
                type: "array",
                minItems: 0,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    reason: { type: "string" },
                  },
                  required: ["title", "url", "confidence", "reason"],
                },
              },
            },
            required: ["summary", "sources"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OpenAI API failed: ${response.status} ${body}`.trim(),
    );
  }

  const data = (await response.json()) as OpenAiResponse;
  const rawText = data.output_text ?? "";
  const parsed = safeParseJson(rawText);

  if (!parsed) {
    return {
      sources: [],
      summary: "Не удалось разобрать ответ AI.",
    };
  }

  return normalizeAnalysis(parsed);
}

function buildPrompt(
  text: string,
  facts: ExtractedFacts,
  searchResults: GoogleSearchItem[],
): string {
  const lines: string[] = [
    "Ты помощник по поиску первоисточников.",
    "Сравни смысл исходного текста с найденными результатами и выбери 1–3 наиболее вероятных источника.",
    "Не выдумывай источники. Используй только то, что есть в результатах поиска.",
    "",
    "Исходный текст:",
    text,
    "",
    "Извлеченные факты:",
    `Утверждения: ${facts.claims.join(" | ") || "нет"}`,
    `Даты: ${facts.dates.join(", ") || "нет"}`,
    `Числа: ${facts.numbers.join(", ") || "нет"}`,
    `Имена: ${facts.names.join(", ") || "нет"}`,
    `Ссылки: ${facts.links.join(", ") || "нет"}`,
    "",
    "Результаты поиска:",
    ...searchResults.map(
      (item, index) =>
        `${index + 1}. ${item.title}\n${item.link}\n${item.snippet}`,
    ),
  ];

  return lines.join("\n");
}

function safeParseJson(text: string): AiAnalysis | null {
  try {
    return JSON.parse(text) as AiAnalysis;
  } catch {
    return null;
  }
}

function normalizeAnalysis(data: AiAnalysis): AiAnalysis {
  const sources = Array.isArray(data.sources) ? data.sources : [];
  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    sources: sources
      .filter((source) => source && typeof source.url === "string")
      .map((source) => ({
        title: String(source.title ?? "").trim(),
        url: String(source.url ?? "").trim(),
        confidence: clamp(Number(source.confidence ?? 0)),
        reason: String(source.reason ?? "").trim(),
      }))
      .filter((source) => source.url.length > 0)
      .slice(0, 3),
  };
}

function clamp(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
