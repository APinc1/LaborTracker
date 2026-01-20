import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

let globalSql: ReturnType<typeof postgres> | null = null;
let globalDb: ReturnType<typeof drizzlePostgres> | null = null;

function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  
  if (globalSql && globalDb) {
    return globalDb;
  }
  
  globalSql = postgres(process.env.DATABASE_URL, {
    prepare: false,
    max: 15,
    idle_timeout: 20,
    connect_timeout: 30,
    ssl: { rejectUnauthorized: false },
    transform: {
      undefined: null
    }
  });
  
  globalDb = drizzlePostgres(globalSql, { schema });
  
  return globalDb;
}

export const db = initializeDatabase();
