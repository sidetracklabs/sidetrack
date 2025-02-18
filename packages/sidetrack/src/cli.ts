#!/usr/bin/env node

import { Command, Options } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import * as Config from "effect/Config";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { runMigrations } from "./migrations";

class MissingEnvError extends Data.TaggedError("MissingEnvError")<{
  cause: unknown;
  message: string;
}> {}

const databaseUrlFlag = Options.text("database-url")
  .pipe(Options.optional)
  .pipe(Options.withAlias("c"))
  .pipe(
    Options.withDescription(
      "The database url to the database. If one is not provided, we will look for a DATABASE_URL environment variable.",
    ),
  );

const runCommand = Command.make(
  "run",
  { databaseUrlFlag },
  ({ databaseUrlFlag }) =>
    Effect.fn("sidetrack.cli.migrations.run")(function* () {
      const databaseUrlConfig = Option.match(databaseUrlFlag, {
        onNone: () => Config.string("DATABASE_URL"),
        onSome: (value) => Config.succeed(value),
      });
      const databaseUrl = yield* databaseUrlConfig.pipe(
        Effect.mapError(
          (error) =>
            new MissingEnvError({
              cause: error,
              message:
                "If a database url is not provided, the DATABASE_URL environment variable must be set.",
            }),
        ),
      );

      return yield* Effect.promise(() => runMigrations(databaseUrl));
    })(),
);

const migrationsCommand = Command.make("migrations").pipe(
  Command.withSubcommands([runCommand]),
);

const command = Command.make("sidetrack").pipe(
  Command.withSubcommands([migrationsCommand]),
);

const cli = Command.run(command, {
  name: "Sidetrack CLI",
  version: "IGNORE_VERSION_OUTPUT_HERE_CHECK_YOUR_PACKAGE_JSON",
});

Effect.suspend(() => cli(process.argv)).pipe(
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain,
);
