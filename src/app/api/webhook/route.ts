import { extractFacts } from "@/lib/facts";
import { resolveInputText, extractMessageText } from "@/lib/input";
import { analyzeWithOpenAi } from "@/lib/openai";
import { sendTelegramMessage } from "@/lib/telegram";

type TelegramUpdate = {
  message?: { chat?: { id?: number } };
  edited_message?: { chat?: { id?: number } };
};

export async function POST(request: Request): Promise<Response> {
  let update: TelegramUpdate;

  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("ok", { status: 200 });
  }

  const chatId =
    update.message?.chat?.id ?? update.edited_message?.chat?.id;
  if (!chatId) {
    return new Response("ok", { status: 200 });
  }

  const inputText = extractMessageText(update);
  if (!inputText) {
    await safeSend(chatId, "Пришлите текст или ссылку на пост.");
    return new Response("ok", { status: 200 });
  }

  const resolved = await resolveInputText(inputText);
  const facts = extractFacts(resolved.text);

  try {
    const analysis = await analyzeWithOpenAi(resolved.text, facts);
    const reply = buildReply(resolved, analysis);
    await safeSend(chatId, reply);
  } catch (error) {
    console.error("Pipeline failed", error);
    await safeSend(
      chatId,
      "Не удалось завершить анализ. Проверьте настройки OpenAI.",
    );
  }

  return new Response("ok", { status: 200 });
}

type BuildReplyInput = {
  usedTelegramFetch: boolean;
  telegramLink?: { url: string };
};

type BuildReplyAnalysis = Awaited<ReturnType<typeof analyzeWithOpenAi>>;

function buildReply(
  input: BuildReplyInput,
  analysis: BuildReplyAnalysis,
): string {
  const lines: string[] = [
    input.usedTelegramFetch
      ? "Текст извлечен из Telegram-поста."
      : input.telegramLink
        ? "Не удалось извлечь текст поста, использую текст сообщения."
        : "Текст взят из сообщения.",
    "",
  ];

  if (analysis.summary) {
    lines.push("Краткий вывод:");
    lines.push(analysis.summary.trim());
    lines.push("");
  }

  if (analysis.sources.length > 0) {
    lines.push("Возможные источники:");
    for (const source of analysis.sources) {
      lines.push(
        `- ${source.url} (${formatConfidence(source.confidence)})`,
      );
    }
  } else {
    lines.push("Возможные источники: не найдены.");
  }

  return truncateMessage(lines.join("\n"));
}

function truncateMessage(text: string): string {
  const limit = 4000;
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 1)}…`;
}

function formatConfidence(value: number): string {
  const percent = Math.round(value * 100);
  return `${percent}%`;
}

async function safeSend(chatId: number, text: string): Promise<void> {
  try {
    await sendTelegramMessage({ chatId, text });
  } catch (error) {
    console.error("Failed to send Telegram message", error);
  }
}
