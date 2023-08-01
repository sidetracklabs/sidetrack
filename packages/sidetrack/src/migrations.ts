import pg_migrate from "node-pg-migrate";

export const runMigrations = async (connectionString: string) =>
  pg_migrate({
    databaseUrl: connectionString,
    dir: "migrations",
    direction: "up",
    migrationsTable: "sidetrack_migrations",
  });
