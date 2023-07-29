import { beforeAll } from "vitest";
import { runMigrations } from "../src/migrations";

beforeAll(async () => {
  await runMigrations(process.env.DATABASE_URL!);
  console.log("Migrations ran");
});
