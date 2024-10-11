import pg_migrate from "@sidetrack/pg-migrate";

import one from "../migrations/1";

import two from "../migrations/2";

export const runMigrations = async (connectionString: string) =>
  pg_migrate({
    databaseUrl: connectionString,
    dir: "migrations",
    direction: "up",
    migrations: [one, two],
    migrationsTable: "sidetrack_migrations",
  }).then(() => {});
