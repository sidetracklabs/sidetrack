import { ClientBase, Pool } from "pg";

/**
 * Database client for sidetrack. This allows you to use whatever database library you want as long as you conform to this interface.
 */
export interface SidetrackDatabaseClient {
  execute: <ResultRow>(
    query: string,
    params?: unknown[],
  ) => Promise<{ rows: ResultRow[] }>;
}

/**
 *
 * @param pgClient client/pool from the node-postgres (pg) library.
 * @returns Database client for sidetrack.
 */
export const usePg = (
  pgClient: ClientBase | Pool,
): SidetrackDatabaseClient => ({
  execute: async <ResultRow>(query: string, params?: unknown[]) => {
    const result = await pgClient.query(query, params);
    return {
      rows: result.rows as ResultRow[],
    };
  },
});
