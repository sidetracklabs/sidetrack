import * as Layer from "effect/Layer";

export function makeAppRuntime<R, E, A>(layer: Layer.Layer<R, E, A>) {
  return Layer.toRuntime(layer);
}
