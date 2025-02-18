import { migrate } from "@sidetrack/pg-migrate";

import one from "../migrations/1";
import two from "../migrations/2";

export const runMigrations = async (databaseUrl: string) =>
  migrate({
    databaseUrl: databaseUrl,
    dir: "migrations",
    direction: "up",
    migrations: [one, two],
    migrationsTable: "sidetrack_migrations",
  }).then(() => {});
