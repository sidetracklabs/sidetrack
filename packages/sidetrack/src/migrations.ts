import pg_migrate from "@sidetrack/pg-migrate";

import one from "../migrations/1";

export const runMigrations = async (connectionString: string) =>
  pg_migrate({
    databaseUrl: connectionString,
    dir: "migrations",
    direction: "up",
    migrations: [one],
    migrationsTable: "sidetrack_migrations",
  }).then(() => {});
