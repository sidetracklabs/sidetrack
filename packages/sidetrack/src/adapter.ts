import { ClientBase } from "pg";

/**
 * Query adapter for sidetrack. This allows you to use whatever database library you want as long as you conform to this interface.
 */
export interface SidetrackQueryAdapter {
  execute: <ResultRow>(
    query: string,
    params?: unknown[],
  ) => Promise<{ rows: ResultRow[] }>;
}

/**
 *
 * @param pgClient client/pool from the node-postgres (pg) library.
 * @returns Query adapter for sidetrack.
 */
export const makePgAdapter = (pgClient: ClientBase): SidetrackQueryAdapter => ({
  execute: async <ResultRow>(query: string, params?: unknown[]) => {
    const result = await pgClient.query(query, params);
    return {
      rows: result.rows as ResultRow[],
    };
  },
});
