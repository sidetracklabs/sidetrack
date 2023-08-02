import { beforeAll } from "vitest";

import pg_migrate from "../src/index";

beforeAll(async () => {
  await pg_migrate({
    databaseUrl: process.env["DATABASE_URL"]!,
    dir: "migrations",
    direction: "up",
    migrations: [
      {
        // eslint-disable-next-line @typescript-eslint/require-await
        down: async (pgm) => {
          pgm.sql("test");
        },
        name: "1",
        // eslint-disable-next-line @typescript-eslint/require-await
        up: async (pgm) => {
          pgm.sql("TODO");
        },
      },
    ],
    migrationsTable: "sidetrack_migrations",
  });

  console.log("Migrations ran");
});
