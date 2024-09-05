import Db, { DBConnection } from "./db";
import { Migration, RunMigration } from "./migration";
import {
  Logger,
  MigrationDirection,
  RunnerOption,
  RunnerOptionClient,
  RunnerOptionUrl,
} from "./types";
import { createSchemalize, getMigrationTableSchema, getSchemas } from "./utils";

// Random identifier shared by all instances of sidetrack
const PG_MIGRATE_LOCK_ID = 3456789012345678;

const idColumn = "id";
const nameColumn = "name";
const runOnColumn = "run_on";

const loadMigrations = (
  db: DBConnection,
  options: RunnerOption,
  logger: Logger,
) => {
  try {
    // const files = await loadMigrationFiles(options.dir, options.ignorePattern)
    const { migrations } = options;

    return (
      migrations
        .map((migration) => {
          return new Migration(
            db,
            migration.name,
            { down: migration.down, up: migration.up },
            options,
            logger,
          );
        })
        // TODO we might need to change this if we don't use numbers
        .sort((m1, m2) => {
          return Number(m1.name) - Number(m2.name);
        })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    throw new Error(`Can't get migration files: ${err.stack}`);
  }
};

const lock = async (db: DBConnection): Promise<boolean> => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const [result] = await db.select(
    `select pg_try_advisory_lock(${PG_MIGRATE_LOCK_ID}) as "lockObtained"`,
  );
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return result.lockObtained as boolean;
  // if (!result.lockObtained) {
  // throw new Error("Another migration is already running");
  // }
};

const unlock = async (db: DBConnection): Promise<boolean> => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const [result] = await db.select(
    `select pg_advisory_unlock(${PG_MIGRATE_LOCK_ID}) as "lockReleased"`,
  );
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return result.lockReleased as boolean;

  // if (!result.lockReleased) {
  // throw new Error("Failed to release migration lock");
  // }
};

const ensureMigrationsTable = async (
  db: DBConnection,
  options: RunnerOption,
): Promise<void> => {
  try {
    const schema = getMigrationTableSchema(options);
    const { migrationsTable } = options;
    const fullTableName = createSchemalize()({
      name: migrationsTable,
      schema,
    });

    const migrationTables = await db.select(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = '${schema}' AND table_name = '${migrationsTable}'`,
    );

    if (migrationTables && migrationTables.length === 1) {
      const primaryKeyConstraints = await db.select(
        `SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = '${schema}' AND table_name = '${migrationsTable}' AND constraint_type = 'PRIMARY KEY'`,
      );
      if (!primaryKeyConstraints || primaryKeyConstraints.length !== 1) {
        await db.query(
          `ALTER TABLE ${fullTableName} ADD PRIMARY KEY (${idColumn})`,
        );
      }
    } else {
      await db.query(
        `CREATE TABLE ${fullTableName} ( ${idColumn} SERIAL PRIMARY KEY, ${nameColumn} varchar(255) NOT NULL, ${runOnColumn} timestamp NOT NULL)`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    throw new Error(`Unable to ensure migrations table: ${err.stack}`);
  }
};

const getRunMigrations = async (db: DBConnection, options: RunnerOption) => {
  const schema = getMigrationTableSchema(options);
  const { migrationsTable } = options;
  const fullTableName = createSchemalize()({
    name: migrationsTable,
    schema,
  });
  return db.column(
    nameColumn,
    `SELECT ${nameColumn} FROM ${fullTableName} ORDER BY ${runOnColumn}, ${idColumn}`,
  );
};

const getMigrationsToRun = (
  options: RunnerOption,
  runNames: string[],
  migrations: Migration[],
): Migration[] => {
  if (options.direction === "down") {
    const downMigrations: Array<Migration | string> = runNames
      .filter(
        (migrationName) => !options.file || options.file === migrationName,
      )
      .map(
        (migrationName) =>
          migrations.find(({ name }) => name === migrationName) ||
          migrationName,
      );
    const { count = 1 } = options;
    const toRun = (
      options.timestamp
        ? downMigrations.filter(
            (migration) =>
              typeof migration === "object" && Number(migration.name) >= count,
          )
        : downMigrations.slice(-Math.abs(count))
    ).reverse();
    const deletedMigrations = toRun.filter(
      (migration): migration is string => typeof migration === "string",
    );
    if (deletedMigrations.length) {
      const deletedMigrationsStr = deletedMigrations.join(", ");
      throw new Error(
        `Definitions of migrations ${deletedMigrationsStr} have been deleted.`,
      );
    }
    return toRun as Migration[];
  }
  const upMigrations = migrations.filter(
    ({ name }) =>
      runNames.indexOf(name) < 0 && (!options.file || options.file === name),
  );
  const { count = Infinity } = options;
  return options.timestamp
    ? upMigrations.filter(({ name }) => Number(name) <= count)
    : upMigrations.slice(0, Math.abs(count));
};

const checkOrder = (runNames: string[], migrations: Migration[]) => {
  const len = Math.min(runNames.length, migrations.length);
  for (let i = 0; i < len; i += 1) {
    const runName = runNames[i];
    const migrationName = migrations[i].name;
    if (runName !== migrationName) {
      throw new Error(
        `Not run migration ${migrationName} is preceding already run migration ${runName}`,
      );
    }
  }
};

const runMigrations = (
  toRun: Migration[],
  method: "apply" | "markAsRun",
  direction: MigrationDirection,
) =>
  toRun.reduce(
    (promise: Promise<unknown>, migration) =>
      promise.then(() => migration[method](direction)),
    Promise.resolve(),
  );

const getLogger = ({ log, logger, verbose }: RunnerOption): Logger => {
  let loggerObject: Logger = console;
  if (typeof logger === "object") {
    loggerObject = logger;
  } else if (typeof log === "function") {
    loggerObject = { debug: log, error: log, info: log, warn: log };
  }
  return verbose
    ? loggerObject
    : {
        debug: undefined,
        error: loggerObject.error.bind(loggerObject),
        info: loggerObject.info.bind(loggerObject),
        warn: loggerObject.warn.bind(loggerObject),
      };
};

export default async (
  options: RunnerOption,
): Promise<RunMigration[] | "MIGRATION_ALREADY_RUNNING"> => {
  const logger = getLogger(options);
  const db = Db(
    (options as RunnerOptionClient).dbClient ||
      (options as RunnerOptionUrl).databaseUrl,
    logger,
  );
  try {
    await db.createConnection();

    if (!options.noLock) {
      const locked = await lock(db);
      if (!locked) {
        logger.warn("Another migration is already running.. going to exit");
        return "MIGRATION_ALREADY_RUNNING";
      }
    }

    if (options.schema) {
      const schemas = getSchemas(options.schema);
      if (options.createSchema) {
        await Promise.all(
          schemas.map((schema) =>
            db.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`),
          ),
        );
      }
      await db.query(
        `SET search_path TO ${schemas.map((s) => `"${s}"`).join(", ")}`,
      );
    }
    if (options.migrationsSchema && options.createMigrationsSchema) {
      await db.query(
        `CREATE SCHEMA IF NOT EXISTS "${options.migrationsSchema}"`,
      );
    }

    await ensureMigrationsTable(db, options);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [migrations, runNames]: [Migration[], string[]] = await Promise.all([
      loadMigrations(db, options, logger),
      getRunMigrations(db, options),
    ]);

    if (options.checkOrder) {
      checkOrder(runNames, migrations);
    }

    const toRun: Migration[] = getMigrationsToRun(
      options,
      runNames,
      migrations,
    );

    if (!toRun.length) {
      logger.info("No migrations to run!");
      return [];
    }

    // TODO: add some fancy colors to logging
    logger.info("> Migrating files:");
    toRun.forEach((m) => {
      logger.info(`> - ${m.name}`);
    });

    if (options.fake) {
      await runMigrations(toRun, "markAsRun", options.direction);
    } else if (options.singleTransaction) {
      await db.query("BEGIN");
      try {
        await runMigrations(toRun, "apply", options.direction);
        await db.query("COMMIT");
      } catch (err) {
        logger.warn("> Rolling back attempted migration ...");
        await db.query("ROLLBACK");
        throw err;
      }
    } else {
      await runMigrations(toRun, "apply", options.direction);
    }

    return toRun.map((m) => ({
      name: m.name,
    }));
  } finally {
    if (db.connected()) {
      if (!options.noLock) {
        const unlocked = await unlock(db);
        if (!unlocked) {
          logger.warn("Failed to release migration lock");
        }
      }
      await db.close();
    }
  }
};
