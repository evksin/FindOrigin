type TelegramLinkInfo = {
  url: string;
  channel: string;
  messageId: string;
};

export type ResolvedInput = {
  text: string;
  originalText: string;
  telegramLink?: TelegramLinkInfo;
  usedTelegramFetch: boolean;
};

const TELEGRAM_LINK_REGEX =
  /https?:\/\/t\.me\/([a-zA-Z0-9_]+)\/(\d+)/;

export function extractMessageText(update: unknown): string | null {
  const anyUpdate = update as {
    message?: { text?: string; caption?: string };
    edited_message?: { text?: string; caption?: string };
  };

  return (
    anyUpdate.message?.text ??
    anyUpdate.message?.caption ??
    anyUpdate.edited_message?.text ??
    anyUpdate.edited_message?.caption ??
    null
  );
}

export function parseTelegramLink(text: string): TelegramLinkInfo | null {
  const match = text.match(TELEGRAM_LINK_REGEX);
  if (!match) {
    return null;
  }

  const [, channel, messageId] = match;
  return {
    url: match[0],
    channel,
    messageId,
  };
}

export async function resolveInputText(text: string): Promise<ResolvedInput> {
  const originalText = text.trim();
  const telegramLink = parseTelegramLink(originalText);
  if (!telegramLink) {
    return {
      text: originalText,
      originalText,
      usedTelegramFetch: false,
    };
  }

  const telegramText = await fetchTelegramPostText(telegramLink).catch(
    () => null,
  );

  if (telegramText) {
    return {
      text: telegramText,
      originalText,
      telegramLink,
      usedTelegramFetch: true,
    };
  }

  return {
    text: originalText,
    originalText,
    telegramLink,
    usedTelegramFetch: false,
  };
}

async function fetchTelegramPostText(
  telegramLink: TelegramLinkInfo,
): Promise<string | null> {
  const { channel, messageId } = telegramLink;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(
      `https://t.me/${channel}/${messageId}?embed=1`,
      { signal: controller.signal },
    );

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const match = html.match(
      /<div class="tgme_widget_message_text[^"]*">([\s\S]*?)<\/div>/,
    );
    if (!match) {
      return null;
    }

    const raw = match[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p>/gi, "\n")
      .replace(/<[^>]+>/g, "");

    return normalizeText(decodeHtmlEntities(raw));
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}
