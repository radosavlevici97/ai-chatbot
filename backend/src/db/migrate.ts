import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index.js";
import { log } from "../middleware/logger.js";

export function runMigrations() {
  try {
    migrate(db, { migrationsFolder: "./drizzle/migrations" });
    log.info("Database migrations applied successfully");
  } catch (err) {
    log.error({ err }, "Failed to run database migrations");
    process.exit(1);
  }
}
