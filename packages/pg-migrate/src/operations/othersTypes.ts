import { Name, Value } from "./generalTypes";

export type Sql = (
  sqlStr: string,
  args?: { [key: string]: Name | Value },
) => string[] | string;
