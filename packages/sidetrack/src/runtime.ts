import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Runtime from "effect/Runtime";
import * as Scope from "effect/Scope";

export function makeAppRuntime<R, E, A>(
  layer: Layer.Layer<R, E, A>,
): Effect.Effect<
  R,
  E,
  {
    close: Effect.Effect<never, never, void>;
    runtime: Runtime.Runtime<A>;
  }
> {
  return Effect.gen(function* ($) {
    const scope = yield* $(Scope.make());
    const ctx: Context.Context<A> = yield* $(
      Layer.buildWithScope(scope)(layer),
    );
    const runtime = yield* $(Effect.runtime<A>().pipe(Effect.provide(ctx)));

    return {
      close: Scope.close(scope, Exit.unit),
      runtime,
    };
  });
}
