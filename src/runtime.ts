import * as Context from "@effect/data/Context";
import * as Effect from "@effect/io/Effect";
import * as Exit from "@effect/io/Exit";
import * as Layer from "@effect/io/Layer";
import * as Scope from "@effect/io/Scope";

export const makeAppRuntime = <R, E, A>(layer: Layer.Layer<R, E, A>) =>
  Effect.gen(function* ($) {
    const scope = yield* $(Scope.make());
    const ctx: Context.Context<A> = yield* $(
      Layer.buildWithScope(scope)(layer),
    );
    const runtime = yield* $(
      Effect.runtime<A>().pipe(Effect.provideContext(ctx)),
    );

    return {
      close: Scope.close(scope, Exit.unit),
      runtime,
    };
  });
