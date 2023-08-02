import { ClientBase } from "pg";

export interface SidetrackQueryAdapter {
  execute: <ResultRow>(
    query: string,
    params?: unknown[],
  ) => Promise<{ rows: ResultRow[] }>;
}
export const makePgAdapter = (pgClient: ClientBase): SidetrackQueryAdapter => ({
  execute: async <ResultRow>(query: string, params?: unknown[]) => {
    const result = await pgClient.query(query, params);
    return {
      rows: result.rows as ResultRow[],
    };
  },
});
