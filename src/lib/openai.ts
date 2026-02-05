import type { ExtractedFacts } from "./facts";

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

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
};

type ResponsesApiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

export async function analyzeWithOpenAi(
  text: string,
  facts: ExtractedFacts,
): Promise<AiAnalysis> {
  const apiKey =
    process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY or OPENROUTER_API_KEY is not set",
    );
  }

  const baseUrl =
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const endpoint = `${normalizedBaseUrl}/chat/completions`;
  const model =
    process.env.OPENAI_MODEL ??
    (normalizedBaseUrl.includes("openrouter.ai")
      ? "openai/gpt-4o-mini"
      : "gpt-4o-mini");

  const input = buildPrompt(text, facts);
  const body: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content:
          "Отвечай строго JSON-объектом с полями summary (строка) и sources (массив до 3 объектов). " +
          "Каждый объект источника: title, url, confidence (0..1), reason. " +
          "Никакого текста вне JSON.",
      },
      { role: "user", content: input },
    ],
    temperature: 0.2,
  };

  if (normalizedBaseUrl.includes("api.openai.com")) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OpenAI API failed: ${response.status} ${body}`.trim(),
    );
  }

  const data = (await response.json()) as
    | ChatCompletionResponse
    | ResponsesApiResponse;
  const rawText = extractResponseText(data);
  const parsed = safeParseJson(rawText);

  if (!parsed) {
    return {
      sources: [],
      summary: "Не удалось разобрать ответ AI.",
    };
  }

  return normalizeAnalysis(parsed, facts.links);
}

function buildPrompt(text: string, facts: ExtractedFacts): string {
  const lines: string[] = [
    "Ты помощник по поиску первоисточников.",
    "Сравни смысл исходного текста и предложи краткий вывод.",
    "Не выдумывай источники. Используй только ссылки, которые есть в исходном тексте.",
    "Если ссылок нет, верни пустой список sources. Title оставляй пустым.",
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
  ];

  return lines.join("\n");
}

function extractResponseText(
  data: ChatCompletionResponse | ResponsesApiResponse,
): string {
  if ("output_text" in data && typeof data.output_text === "string") {
    return data.output_text;
  }

  if ("output" in data && Array.isArray(data.output)) {
    const chunks = data.output.flatMap(
      (item) =>
        item.content?.map((content) => content.text ?? "") ?? [],
    );
    const combined = chunks.join("").trim();
    if (combined) {
      return combined;
    }
  }

  const content =
    "choices" in data
      ? data.choices?.[0]?.message?.content ?? ""
      : "";
  return typeof content === "string" ? content : "";
}

function safeParseJson(text: string): AiAnalysis | null {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as AiAnalysis;
  } catch {
    return parseJsonFromText(text);
  }
}

function parseJsonFromText(text: string): AiAnalysis | null {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return null;
  }
  const snippet = text.slice(first, last + 1);
  try {
    return JSON.parse(snippet) as AiAnalysis;
  } catch {
    return null;
  }
}

function normalizeAnalysis(
  data: AiAnalysis,
  allowedUrls: string[],
): AiAnalysis {
  const allowed = new Set(allowedUrls.map((url) => url.trim()));
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
      .filter(
        (source) => source.url.length > 0 && allowed.has(source.url),
      )
      .slice(0, 3),
  };
}

function clamp(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
