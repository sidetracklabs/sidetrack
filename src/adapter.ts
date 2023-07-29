import { ClientBase } from "pg";

export interface QueryAdapter {
  execute: <ResultRow>(
    query: string,
    params?: any[],
  ) => Promise<{ rows: ResultRow[] }>;
}
export const makePgAdapter = (pgClient: ClientBase): QueryAdapter => ({
  execute: async (query, params) => {
    const result = await pgClient.query(query, params);
    return {
      rows: result.rows,
    };
  },
});
