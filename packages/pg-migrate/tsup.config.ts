import { defineConfig } from "tsup";

export default defineConfig((opts) => ({
  clean: !opts.watch,
  dts: true,
  entry: ["src/index.ts"],
  external: ["pg-native"],
  format: ["cjs", "esm"],
}));
