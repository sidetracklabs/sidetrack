import pg_migrate from "node-pg-migrate";

export const runMigrations = async (connectionString: string) =>
  pg_migrate({
    databaseUrl: connectionString,
    migrationsTable: "sidetrack_migrations",
    dir: "migrations",
    direction: "up",
  });
