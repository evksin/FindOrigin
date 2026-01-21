import type { ExtractedFacts } from "./facts";

export type CandidateSources = {
  sources: string[];
};

export function findCandidateSources(facts: ExtractedFacts): CandidateSources {
  const sources = facts.links
    .filter((link) => link.startsWith("http://") || link.startsWith("https://"))
    .map((link) => link.replace(/[),.]+$/, ""))
    .filter((link) => link.length > 0);

  return {
    sources: unique(sources),
  };
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}
