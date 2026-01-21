import { extractFacts } from "@/lib/facts";
import { resolveInputText, extractMessageText } from "@/lib/input";
import { findCandidateSources } from "@/lib/sources";
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
  const candidates = findCandidateSources(facts);

  const reply = buildReply(resolved, facts, candidates.sources);
  await safeSend(chatId, reply);

  return new Response("ok", { status: 200 });
}

type BuildReplyInput = {
  text: string;
  originalText: string;
  usedTelegramFetch: boolean;
  telegramLink?: { url: string };
};

type BuildReplyFacts = ReturnType<typeof extractFacts>;

function buildReply(
  input: BuildReplyInput,
  facts: BuildReplyFacts,
  sources: string[],
): string {
  const lines: string[] = [
    "Предварительный разбор (без AI-анализа).",
    input.usedTelegramFetch
      ? "Текст извлечен из Telegram-поста."
      : input.telegramLink
        ? "Не удалось извлечь текст поста, использую текст сообщения."
        : "Текст взят из сообщения.",
    "",
  ];

  if (facts.claims.length > 0) {
    lines.push("Ключевые утверждения:");
    lines.push(...facts.claims.map((claim, index) => `${index + 1}. ${claim}`));
  } else {
    lines.push("Ключевые утверждения: не найдены.");
  }

  lines.push("");
  lines.push(`Даты: ${formatList(facts.dates)}`);
  lines.push(`Числа: ${formatList(facts.numbers)}`);
  lines.push(`Имена: ${formatList(facts.names)}`);
  lines.push(`Ссылки: ${formatList(facts.links)}`);
  lines.push("");

  if (sources.length > 0) {
    lines.push("Возможные источники:");
    lines.push(...sources.slice(0, 3).map((link) => `- ${link}`));
  } else {
    lines.push("Возможные источники: пока нет ссылок для источников.");
  }

  return truncateMessage(lines.join("\n"));
}

function formatList(items: string[]): string {
  if (items.length === 0) {
    return "нет";
  }

  return items.slice(0, 5).join(", ");
}

function truncateMessage(text: string): string {
  const limit = 4000;
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 1)}…`;
}

async function safeSend(chatId: number, text: string): Promise<void> {
  try {
    await sendTelegramMessage({ chatId, text });
  } catch (error) {
    console.error("Failed to send Telegram message", error);
  }
}
