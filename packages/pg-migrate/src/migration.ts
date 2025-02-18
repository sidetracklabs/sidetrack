/*
 A new Migration is instantiated for each migration file.

 It is responsible for storing the name of the file and knowing how to execute
 the up and down migrations defined in the file.

 */

import fs from "fs";
import { mkdirp } from "mkdirp";
import path from "path";

import { DBConnection } from "./db";
import MigrationBuilder from "./migration-builder";
import {
  Logger,
  MigrationAction,
  MigrationBuilderActions,
  MigrationDirection,
  RunnerOption,
} from "./types";
import { getMigrationTableSchema } from "./utils";

const { readdir } = fs.promises;

export interface RunMigration {
  readonly name: string;
}

export enum FilenameFormat {
  timestamp = "timestamp",
  utc = "utc",
}

export interface CreateOptionsTemplate {
  templateFileName: string;
}

export interface CreateOptionsDefault {
  ignorePattern?: string | undefined;
  language?: "js" | "sql" | "ts" | undefined;
}

export type CreateOptions = {
  filenameFormat?: FilenameFormat;
} & (CreateOptionsDefault | CreateOptionsTemplate);

const SEPARATOR = "_";

export const loadMigrationFiles = async (
  dir: string,
  ignorePattern?: string,
) => {
  const dirContent = await readdir(`${dir}/`, { withFileTypes: true });
  const files = dirContent
    .map((file) => (file.isFile() || file.isSymbolicLink() ? file.name : null))
    .filter((file): file is string => Boolean(file))
    .sort();
  const filter = new RegExp(`^(${ignorePattern})$`);
  return ignorePattern === undefined
    ? files
    : files.filter((i) => !filter.test(i));
};

const getSuffixFromFileName = (fileName: string) =>
  path.extname(fileName).substr(1);

const getLastSuffix = async (dir: string, ignorePattern?: string) => {
  try {
    const files = await loadMigrationFiles(dir, ignorePattern);
    return files.length > 0
      ? getSuffixFromFileName(files[files.length - 1] as string)
      : undefined;
  } catch (err) {
    return undefined;
  }
};

const resolveSuffix = async (
  directory: string,
  { language, ignorePattern }: CreateOptionsDefault,
) => language || (await getLastSuffix(directory, ignorePattern)) || "ts";

export class Migration implements RunMigration {
  // class method that creates a new migration file by cloning the migration template
  static async create(
    name: string,
    directory: string,
    _language?: CreateOptions | "js" | "sql" | "ts",
    _ignorePattern?: string,
    _filenameFormat?: FilenameFormat,
  ) {
    if (typeof _language === "string") {
      console.warn(
        "This usage is deprecated. Please use this method with options object argument",
      );
    }
    const options =
      typeof _language === "object"
        ? _language
        : {
            filenameFormat: _filenameFormat,
            ignorePattern: _ignorePattern,
            language: _language,
          };
    const { filenameFormat = FilenameFormat.timestamp } = options;

    // ensure the migrations directory exists
    mkdirp.sync(directory);

    const now = new Date();
    const time =
      filenameFormat === FilenameFormat.utc
        ? now.toISOString().replace(/[^\d]/g, "")
        : now.valueOf();

    const templateFileName =
      "templateFileName" in options
        ? path.resolve(process.cwd(), options.templateFileName)
        : path.resolve(
            __dirname,
            `../templates/migration-template.${await resolveSuffix(
              directory,
              options,
            )}`,
          );
    const suffix = getSuffixFromFileName(templateFileName);

    // file name looks like migrations/1391877300255_migration-title.js
    const newFile = `${directory}/${time}${SEPARATOR}${name}.${suffix}`;

    // copy the default migration template to the new file location
    await new Promise((resolve, reject) => {
      fs.createReadStream(templateFileName)
        .pipe(fs.createWriteStream(newFile))
        .on("close", () => resolve(void 0))
        .on("error", reject);
    });

    return newFile;
  }

  public readonly db: DBConnection;

  public readonly name: string;

  public up?: MigrationAction | false | undefined;

  public down?: MigrationAction | false | undefined;

  public readonly options: RunnerOption;

  public readonly logger: Logger;

  constructor(
    db: DBConnection,
    name: string,
    { up, down }: MigrationBuilderActions,
    options: RunnerOption,
    logger: Logger = console,
  ) {
    this.db = db;
    this.name = name;
    this.up = up;
    this.down = down;
    this.options = options;
    this.logger = logger;
  }

  _getMarkAsRun(action: MigrationAction) {
    const schema = getMigrationTableSchema(this.options);
    const { migrationsTable } = this.options;
    const { name } = this;
    switch (action) {
      case this.down:
        this.logger.info(`### MIGRATION ${this.name} (DOWN) ###`);
        return `DELETE FROM "${schema}"."${migrationsTable}" WHERE name='${name}';`;
      case this.up:
        this.logger.info(`### MIGRATION ${this.name} (UP) ###`);
        return `INSERT INTO "${schema}"."${migrationsTable}" (name, run_on) VALUES ('${name}', NOW());`;
      default:
        throw new Error("Unknown direction");
    }
  }

  async _apply(action: MigrationAction, pgm: MigrationBuilder) {
    if (action.length === 2) {
      await new Promise<void>((resolve) => {
        void action(pgm, resolve);
      });
    } else {
      await action(pgm);
    }

    const sqlSteps = pgm.getSqlSteps();

    sqlSteps.push(this._getMarkAsRun(action));

    if (!this.options.singleTransaction && pgm.isUsingTransaction()) {
      // if not in singleTransaction mode we need to create our own transaction
      sqlSteps.unshift("BEGIN;");
      sqlSteps.push("COMMIT;");
    } else if (this.options.singleTransaction && !pgm.isUsingTransaction()) {
      // in singleTransaction mode we are already wrapped in a global transaction
      this.logger.warn("#> WARNING: Need to break single transaction! <");
      sqlSteps.unshift("COMMIT;");
      sqlSteps.push("BEGIN;");
    } else if (!this.options.singleTransaction || !pgm.isUsingTransaction()) {
      this.logger.warn(
        "#> WARNING: This migration is not wrapped in a transaction! <",
      );
    }

    if (typeof this.logger.debug === "function") {
      this.logger.debug(`${sqlSteps.join("\n")}\n\n`);
    }

    return sqlSteps.reduce(
      (promise: Promise<unknown>, sql) =>
        promise.then((): unknown => this.options.dryRun || this.db.query(sql)),
      Promise.resolve(),
    );
  }

  _getAction(direction: MigrationDirection) {
    if (direction === "down" && this.down === undefined) {
      this.down = this.up;
    }

    const action: MigrationAction | false | undefined = this[direction];

    if (action === false) {
      throw new Error(
        `User has disabled ${direction} migration on file: ${this.name}`,
      );
    }

    if (typeof action !== "function") {
      throw new Error(
        `Unknown value for direction: ${direction}. Is the migration ${this.name} exporting a '${direction}' function?`,
      );
    }

    return action;
  }

  apply(direction: MigrationDirection) {
    const pgm = new MigrationBuilder(this.db, this.logger);
    const action = this._getAction(direction);

    if (this.down === this.up) {
      // automatically infer the down migration by running the up migration in reverse mode...
      pgm.enableReverseMode();
    }

    return this._apply(action, pgm);
  }

  markAsRun(direction: MigrationDirection) {
    return this.db.query(this._getMarkAsRun(this._getAction(direction)));
  }
}
