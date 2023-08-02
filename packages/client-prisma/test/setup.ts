import { runMigrations } from "sidetrack";
import { beforeAll } from "vitest";

beforeAll(async () => {
  await runMigrations(process.env["DATABASE_URL"]!);
  console.log("Migrations ran");
});
