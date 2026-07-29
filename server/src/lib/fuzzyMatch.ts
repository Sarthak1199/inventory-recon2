function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

/** Similarity in [0,1], 1 = identical (after normalization). */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

export interface FuzzyCandidate<T> {
  item: T;
  score: number;
}

/**
 * Finds the best match for `query` among `candidates` (mapped to a name via `getName`).
 * Returns null if nothing clears `threshold`.
 */
export function findBestMatch<T>(
  query: string,
  candidates: T[],
  getName: (t: T) => string,
  threshold = 0.72
): FuzzyCandidate<T> | null {
  let best: FuzzyCandidate<T> | null = null;
  for (const c of candidates) {
    const score = similarity(query, getName(c));
    if (!best || score > best.score) best = { item: c, score };
  }
  if (best && best.score >= threshold) return best;
  return null;
}

export function exactMatch<T>(query: string, candidates: T[], getName: (t: T) => string): T | null {
  const nq = normalize(query);
  return candidates.find((c) => normalize(getName(c)) === nq) ?? null;
}
