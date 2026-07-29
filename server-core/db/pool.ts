import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const rawConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

/**
 * Newer pg versions treat sslmode=require in the connection string as full
 * certificate verification, which overrides any `ssl` option passed to Pool().
 * Strip it so our own explicit ssl config below is what actually applies.
 */
function stripSslMode(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return url.replace(/([?&])sslmode=[^&]*&?/i, "$1").replace(/[?&]$/, "");
  }
}

const connectionString = stripSslMode(rawConnectionString);
const needsSsl = process.env.NODE_ENV === "production" || /sslmode=require/i.test(rawConnectionString ?? "");

export const pool = new pg.Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});
