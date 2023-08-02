import { runMigrations } from "@sidetrack/sidetrack";
import { beforeAll } from "vitest";

beforeAll(async () => {
  await runMigrations(process.env["DATABASE_URL"]!);
  console.log("Migrations ran");
});
