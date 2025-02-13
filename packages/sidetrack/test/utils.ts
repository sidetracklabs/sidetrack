import pg from "pg";

export function createTestPool() {
  return new pg.Pool({
    connectionString: process.env["DATABASE_URL"],
  });
}

export async function runInTransaction<T>(
  pool: pg.Pool,
  callback: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
