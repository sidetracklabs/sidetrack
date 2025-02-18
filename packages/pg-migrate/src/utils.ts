import { Name, Value } from "./operations/generalTypes";
import { Literal, RunnerOption } from "./types";

export const createSchemalize = () => {
  return (v: Name) => {
    if (typeof v === "object") {
      const { schema, name } = v;
      return (schema ? `${schema}.` : "") + name;
    }
    return v;
  };
};

// credits to https://stackoverflow.com/a/12504061/4790644
export class StringIdGenerator {
  private ids: number[] = [0];

  constructor(private readonly chars = "abcdefghijklmnopqrstuvwxyz") {}

  next() {
    const idsChars = this.ids.map((id) => this.chars[id]);
    this.increment();
    return idsChars.join("");
  }

  private increment() {
    for (let i = this.ids.length - 1; i >= 0; i -= 1) {
      this.ids[i] = (this.ids[i] ?? 0) + 1;
      if ((this.ids[i] as number) < this.chars.length) {
        return;
      }
      this.ids[i] = 0;
    }
    this.ids.unshift(0);
  }
}

export const escapeValue = (val: Value): number | string => {
  if (val === null) {
    return "NULL";
  }
  if (typeof val === "boolean") {
    return val.toString();
  }
  if (typeof val === "string") {
    let dollars: string;
    const ids = new StringIdGenerator();
    let index: string;
    do {
      index = ids.next();
      dollars = `$pg${index}$`;
    } while (val.indexOf(dollars) >= 0);
    return `${dollars}${val}${dollars}`;
  }
  if (typeof val === "number") {
    return val;
  }
  if (Array.isArray(val)) {
    const arrayStr = val.map(escapeValue).join(",").replace(/ARRAY/g, "");
    return `ARRAY[${arrayStr}]`;
  }
  return "";
};

export const createTransformer =
  (literal: Literal) => (s: string, d?: { [key: string]: Name | Value }) =>
    Object.keys(d || {}).reduce((str: string, p) => {
      const v = d?.[p];
      return str.replace(
        new RegExp(`{${p}}`, "g"),

        v === undefined
          ? ""
          : typeof v === "string" ||
              (typeof v === "object" && v !== null && "name" in v)
            ? literal(v)
            : String(escapeValue(v)),
      );
    }, s);

export const getSchemas = (schema?: string[] | string): string[] => {
  const schemas = (Array.isArray(schema) ? schema : [schema]).filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  return schemas.length > 0 ? schemas : ["public"];
};

export const getMigrationTableSchema = (options: RunnerOption): string =>
  options.migrationsSchema !== undefined
    ? options.migrationsSchema
    : (getSchemas(options.schema)[0] as string);
