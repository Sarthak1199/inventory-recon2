import { pool } from "../../db/pool.js";
import { exactMatch, findBestMatch } from "../lib/fuzzyMatch.js";

export interface ItemRow {
  id: string;
  name: string;
  unit: string;
  category: string | null;
}

export type MatchType = "exact" | "fuzzy" | "manual" | "none";

export interface MatchResult {
  item: ItemRow | null;
  matchType: MatchType;
  score: number | null;
}

export async function getAccountItems(accountId: string): Promise<ItemRow[]> {
  const res = await pool.query(
    `SELECT id, name, unit, category FROM items WHERE account_id = $1 ORDER BY name`,
    [accountId]
  );
  return res.rows;
}

/** Exact match first, then fuzzy fallback. Caller should surface `none` results for manual mapping. */
export function matchItemName(name: string, items: ItemRow[]): MatchResult {
  const exact = exactMatch(name, items, (i) => i.name);
  if (exact) return { item: exact, matchType: "exact", score: 1 };

  const fuzzy = findBestMatch(name, items, (i) => i.name, 0.72);
  if (fuzzy) return { item: fuzzy.item, matchType: "fuzzy", score: fuzzy.score };

  return { item: null, matchType: "none", score: null };
}
