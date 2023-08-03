import type {
  ClientBase,
  ClientConfig,
  QueryArrayConfig,
  QueryArrayResult,
  QueryConfig,
  QueryResult,
} from "pg";

import { Name } from "./operations/generalTypes";
import * as other from "./operations/othersTypes";

export type { ClientConfig, ConnectionConfig } from "pg";

// see ClientBase in @types/pg
export interface DB {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  query(
    queryConfig: QueryArrayConfig,
    values?: any[],
  ): Promise<QueryArrayResult>;
  query(queryConfig: QueryConfig): Promise<QueryResult>;
  query(
    queryTextOrConfig: QueryConfig | string,
    values?: any[],
  ): Promise<QueryResult>;

  select(
    queryConfig: QueryArrayConfig | QueryConfig | string,
    values?: any[],
  ): Promise<any[]>;
  select(queryConfig: QueryConfig): Promise<any[]>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export interface MigrationBuilder {
  db: DB;
  noTransaction: () => void;
  sql: (...args: Parameters<other.Sql>) => void;
}

export type MigrationAction = (
  pgm: MigrationBuilder,
  run?: () => void,
) => Promise<void> | void;
export type Literal = (v: Name) => string;
export type LogFn = (msg: string) => void;
export interface Logger {
  debug?: LogFn | undefined;
  error: LogFn;
  info: LogFn;
  warn: LogFn;
}

export interface MigrationBuilderActions {
  down?: MigrationAction | false | undefined;
  up?: MigrationAction | false | undefined;
  // shorthands?: tables.ColumnDefinitions
}

export interface MigrationOptions {
  literal: Literal;
  logger: Logger;
  // typeShorthands?: tables.ColumnDefinitions
  schemalize: Literal;
}

export type MigrationDirection = "down" | "up";

export interface RunnerOptionConfig {
  /**
   * Check order of migrations before running them.
   */
  checkOrder?: boolean;
  /**
   * Number of migration to run.
   */
  count?: number;
  /**
   * Creates the configured migration schema if it doesn't exist.
   */
  createMigrationsSchema?: boolean;
  /**
   * Creates the configured schema if it doesn't exist.
   */
  createSchema?: boolean;
  /**
   * The directory containing your migration files.
   */
  dir: string;
  /**
   * Direction of migration-run.
   */
  direction: MigrationDirection;
  dryRun?: boolean;
  /**
   * Mark migrations as run without actually performing them (use with caution!).
   */
  fake?: boolean;
  /**
   * Run only migration with this name.
   */
  file?: string;
  /**
   * Regex pattern for file names to ignore (ignores files starting with `.` by default).
   */
  ignorePattern?: string;
  /**
   * Redirect log messages to this function, rather than `console`.
   */
  log?: LogFn;
  /**
   * Redirect messages to this logger object, rather than `console`.
   */
  logger?: Logger;
  /**
   * The schema on which migration will be run.
   *
   * @default 'public'
   */
  migrations: {
    down: (pgm: MigrationBuilder) => Promise<void>;
    name: string;
    up: (pgm: MigrationBuilder) => Promise<void>;
  }[];
  /**
   * The schema storing table which migrations have been run.
   *
   * (defaults to same value as `schema`)
   */
  migrationsSchema?: string;
  /**
   * The table storing which migrations have been run.
   */
  migrationsTable: string;
  /**
   * Disables locking mechanism and checks.
   */
  noLock?: boolean;
  schema?: string[] | string;
  /**
   * Combines all pending migrations into a single transaction so that if any migration fails, all will be rolled back.
   *
   * @default true
   */
  singleTransaction?: boolean;
  /**
   * Treats `count` as timestamp.
   */
  timestamp?: boolean;
  /**
   * Print all debug messages like DB queries run (if you switch it on, it will disable `logger.debug` method).
   */
  verbose?: boolean;
}

export interface RunnerOptionUrl {
  /**
   * Connection string or client config which is passed to [new pg.Client](https://node-postgres.com/api/client#constructor)
   */
  databaseUrl: ClientConfig | string;
}

export interface RunnerOptionClient {
  /**
   * Instance of [new pg.Client](https://node-postgres.com/api/client).
   *
   * Instance should be connected to DB and after finishing migration, user is responsible to close connection.
   */
  dbClient: ClientBase;
}

export type RunnerOption = RunnerOptionConfig &
  (RunnerOptionClient | RunnerOptionUrl);
