import type { SidetrackDatabaseClient } from "sidetrack";
import { validate as validateUuid } from "uuid";

const replaceTextWithUUID = (
  sql: string,
  parameters: readonly unknown[],
): string => {
  let query = sql;
  // This is a bit of a hack, but it's the fastest way to do this
  // We're replacing the $1, $2, $3, etc with $1::uuid, $2::uuid, $3::uuid, etc if it's a UUID, because Prisma sends strings as text
  // It doesn't look like there's a way that Prisma gives us to convert a string to a UUID, cause that's done by the Rust binary
  parameters.forEach((param, index) => {
    if (typeof param === "string" && validateUuid(param)) {
      query = query.replace(`$${index + 1}`, `$${index + 1}::uuid`);
    }
  });

  return query;
};

// Prisma exports this as a generated type, which we don't generate in this project
// so we're creating an interface that only uses the function we need
interface PrismaClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

/**
 *
 * @param prisma A prisma client instance
 * @returns Database client for sidetrack.
 */
export const makePrismaSidetrackClient: (
  prisma: PrismaClient,
) => SidetrackDatabaseClient = (prisma: PrismaClient) => ({
  execute: async <ResultRow>(text: string, values?: unknown[]) => {
    const rows = await prisma.$queryRawUnsafe<ResultRow>(
      replaceTextWithUUID(text, values as readonly unknown[]),
      ...(values ?? []),
    );

    return { rows };
  },
});
