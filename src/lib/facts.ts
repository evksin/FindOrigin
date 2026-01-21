export type ExtractedFacts = {
  claims: string[];
  dates: string[];
  numbers: string[];
  names: string[];
  links: string[];
};

const URL_REGEX =
  /https?:\/\/[^\s<>()]+/gi;

const DATE_REGEXES = [
  /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\b/gi,
];

const NUMBER_REGEX = /\b\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d+)?\b/g;
const NAME_REGEX = /\b[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2}\b/g;

export function extractFacts(text: string): ExtractedFacts {
  const claims = extractClaims(text);
  const dates = unique(flattenMatches(text, DATE_REGEXES));
  const numbers = unique(matchAll(text, NUMBER_REGEX));
  const names = unique(matchAll(text, NAME_REGEX));
  const links = unique(matchAll(text, URL_REGEX));

  return {
    claims,
    dates,
    numbers,
    names,
    links,
  };
}

function extractClaims(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.slice(0, 5);
}

function matchAll(text: string, regex: RegExp): string[] {
  const matches = text.match(regex);
  return matches ? matches.map((item) => item.trim()) : [];
}

function flattenMatches(text: string, regexes: RegExp[]): string[] {
  return regexes.flatMap((regex) => matchAll(text, regex));
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}
