/*
 The migration builder is used to actually create a migration from instructions

 A new instance of MigrationBuilder is instantiated and passed to the up or down block
 of each migration when it is being run.

 It makes the methods available via the pgm variable and stores up the sql commands.
 This is what makes it possible to do this without making everything async
 and it makes inference of down migrations possible.
 */

import * as other from "./operations/other";
import { DB, Logger, MigrationBuilder, MigrationOptions } from "./types";
import { createSchemalize } from "./utils";

export default class MigrationBuilderImpl implements MigrationBuilder {
  public readonly sql: (...args: Parameters<other.Sql>) => void;

  public readonly db: DB;

  private _steps: string[];

  private _REVERSE_MODE: boolean;

  private _useTransaction: boolean;

  constructor(db: DB, logger: Logger) {
    this._steps = [];
    this._REVERSE_MODE = false;
    // by default, all migrations are wrapped in a transaction
    this._useTransaction = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type OperationFn = (...args: any[]) => string[] | string;
    type Operation = OperationFn & { reverse?: OperationFn };

    // this function wraps each operation within a function that either
    // calls the operation or its reverse, and appends the result (array of sql statements)
    // to the  steps array
    const wrap =
      <T extends Operation>(operation: T) =>
      (...args: Parameters<T>) => {
        if (this._REVERSE_MODE) {
          if (typeof operation.reverse !== "function") {
            const name = `pgm.${operation.name}()`;
            throw new Error(
              `Impossible to automatically infer down migration for "${name}"`,
            );
          }
          this._steps = this._steps.concat(operation.reverse(...args));
        } else {
          this._steps = this._steps.concat(operation(...args));
        }
      };

    const options: MigrationOptions = {
      literal: createSchemalize(),
      logger,
      schemalize: createSchemalize(),
    };

    // defines the methods that are accessible via pgm in each migrations
    // there are some convenience aliases to make usage easier

    this.sql = wrap(other.sql(options));

    // expose DB so we can access database within transaction
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const wrapDB =
      <T extends any[], R>(operation: (...args: T) => R) =>
      (...args: T) => {
        if (this._REVERSE_MODE) {
          throw new Error("Impossible to automatically infer down migration");
        }
        return operation(...args);
      };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    this.db = {
      query: wrapDB(db.query),
      select: wrapDB(db.select),
    };
  }

  enableReverseMode(): this {
    this._REVERSE_MODE = true;
    return this;
  }

  noTransaction(): this {
    this._useTransaction = false;
    return this;
  }

  isUsingTransaction(): boolean {
    return this._useTransaction;
  }

  getSql(): string {
    return `${this.getSqlSteps().join("\n")}\n`;
  }

  getSqlSteps(): string[] {
    // in reverse mode, we flip the order of the statements
    return this._REVERSE_MODE ? this._steps.slice().reverse() : this._steps;
  }
}
