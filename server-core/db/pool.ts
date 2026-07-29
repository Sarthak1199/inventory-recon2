import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

export const pool = new pg.Pool({
  connectionString,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});
