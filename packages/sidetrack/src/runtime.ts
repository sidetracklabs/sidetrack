import * as Layer from "effect/Layer";

export function makeAppRuntime<A, E, R>(layer: Layer.Layer<A, E, R>) {
  return Layer.toRuntime(layer);
}
