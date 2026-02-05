export type GoogleSearchItem = {
  title: string;
  link: string;
  snippet: string;
};

type GoogleSearchResponse = {
  items?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
};

export async function searchGoogle(
  query: string,
  options?: { timeoutMs?: number },
): Promise<GoogleSearchItem[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;

  if (!apiKey || !cx) {
    throw new Error("GOOGLE_API_KEY or GOOGLE_CX is not set");
  }

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: "5",
    hl: "ru",
    gl: "ru",
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? 8000,
  );

  try {
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
      { signal: controller.signal },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Google Search API failed: ${response.status} ${body}`.trim(),
      );
    }

    const data = (await response.json()) as GoogleSearchResponse;
    return (data.items ?? [])
      .map((item) => ({
        title: item.title ?? "",
        link: item.link ?? "",
        snippet: item.snippet ?? "",
      }))
      .filter((item) => item.link.length > 0);
  } finally {
    clearTimeout(timeoutId);
  }
}
