/**
 * Remixed from https://github.com/salsita/node-pg-migrate
 */
import { Migration, RunMigration } from "./migration";
import { Name } from "./operations/generalTypes";
import { Sql } from "./operations/othersTypes";
import runner from "./runner";
import { MigrationBuilder, RunnerOption } from "./types";

export { Migration, MigrationBuilder, Name, RunMigration, RunnerOption, Sql };

export default runner;
