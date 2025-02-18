/* eslint-disable @typescript-eslint/require-await */
import { SidetrackTest } from "sidetrack";
import { describe, expect, it } from "vitest";

import { usePrisma } from "../src";
import { PrismaClient } from "./prisma/generated";

// TODO configure with global setup later: https://vitest.dev/config/#globalsetup

describe("jobs", () => {
  it("insert and run works with prisma sidetrack client", async () => {
    const sidetrack = new SidetrackTest<{
      prismaBasicTest: { description: string; testId: string };
    }>({
      databaseOptions: {
        databaseUrl: process.env["DATABASE_URL"]!,
      },
      dbClient: usePrisma(new PrismaClient()),
      queues: {
        prismaBasicTest: {
          run: async (payload) => {
            console.log(
              `Running prisma basic test job: ${payload.description}`,
            );
            return payload;
          },
        },
      },
    });

    const prismaClient = new PrismaClient();

    try {
      await prismaClient.$transaction(
        async (prismaTx) => {
          const job = await sidetrack.insertJob(
            "prismaBasicTest",
            {
              description: "Basic Prisma insert and run test",
              testId: "prisma-basic-test-001",
            },
            { dbClient: usePrisma(prismaTx) },
          );

          expect(await sidetrack.getJob(job.id)).toBeUndefined();
          expect(
            (await sidetrack.getJob(job.id, { dbClient: usePrisma(prismaTx) }))
              .id,
          ).toBe(job.id);

          await sidetrack.runJob(job.id, { dbClient: usePrisma(prismaTx) });
          expect(
            (await sidetrack.getJob(job.id, { dbClient: usePrisma(prismaTx) }))
              .status,
          ).toBe("completed");

          throw new Error("Rollback transaction");
        },
        { isolationLevel: "Serializable" },
      );
    } catch (e) {
      if (e instanceof Error && e.message !== "Rollback transaction") {
        throw e;
      }
    } finally {
      await prismaClient.$disconnect();
    }
  });

  it("retry, cancel, delete works with prisma sidetrack client", async () => {
    const sidetrack = new SidetrackTest<{
      prismaRetryTest: {
        description: string;
        shouldFail: boolean;
        testId: string;
      };
    }>({
      databaseOptions: {
        databaseUrl: process.env["DATABASE_URL"]!,
      },
      dbClient: usePrisma(new PrismaClient()),
      queues: {
        prismaRetryTest: {
          maxAttempts: 2,
          run: async (payload) => {
            console.log(`Running prisma retry test: ${payload.description}`);
            if (payload.shouldFail) {
              throw new Error("Intentional failure for retry test");
            }
            return payload;
          },
        },
      },
    });

    const prismaClient = new PrismaClient();

    try {
      await prismaClient.$transaction(
        async (prismaTx) => {
          const job = await sidetrack.insertJob(
            "prismaRetryTest",
            {
              description: "Testing Prisma retry/cancel/delete flow",
              shouldFail: true,
              testId: "prisma-retry-test-001",
            },
            { dbClient: usePrisma(prismaTx) },
          );

          // Verify job lifecycle
          expect(await sidetrack.getJob(job.id)).toBeUndefined();

          await sidetrack.runJob(job.id, { dbClient: usePrisma(prismaTx) });
          expect(
            (await sidetrack.getJob(job.id, { dbClient: usePrisma(prismaTx) }))
              .status,
          ).toBe("retrying");

          await sidetrack.runJob(job.id, { dbClient: usePrisma(prismaTx) });
          expect(
            (await sidetrack.getJob(job.id, { dbClient: usePrisma(prismaTx) }))
              .status,
          ).toBe("failed");

          await sidetrack.cancelJob(job.id, { dbClient: usePrisma(prismaTx) });
          expect(
            (await sidetrack.getJob(job.id, { dbClient: usePrisma(prismaTx) }))
              .status,
          ).toBe("cancelled");

          await sidetrack.deleteJob(job.id, { dbClient: usePrisma(prismaTx) });
          expect(
            await sidetrack.getJob(job.id, { dbClient: usePrisma(prismaTx) }),
          ).toBe(undefined);

          throw new Error("Rollback transaction");
        },
        { isolationLevel: "Serializable" },
      );
    } catch (e) {
      if (e instanceof Error && e.message !== "Rollback transaction") {
        throw e;
      }
    } finally {
      await prismaClient.$disconnect();
    }
  });

  it("list job works", async () => {
    const sidetrack = new SidetrackTest<{
      prismaBatchOne: { description: string; testId: string };
      prismaBatchTwo: { description: string; testId: string };
    }>({
      databaseOptions: {
        databaseUrl: process.env["DATABASE_URL"]!,
      },
      dbClient: usePrisma(new PrismaClient()),
      queues: {
        prismaBatchOne: {
          run: async (payload) => {
            console.log(`Running prisma batch one: ${payload.description}`);
            return payload;
          },
        },
        prismaBatchTwo: {
          run: async (payload) => {
            console.log(`Running prisma batch two: ${payload.description}`);
            return payload;
          },
        },
      },
    });

    const prismaClient = new PrismaClient();

    try {
      await prismaClient.$transaction(
        async (prismaTx) => {
          await sidetrack.insertJob(
            "prismaBatchOne",
            {
              description: "First job in batch one",
              testId: "prisma-batch-test-001",
            },
            { dbClient: usePrisma(prismaTx) },
          );

          await sidetrack.insertJob(
            "prismaBatchOne",
            {
              description: "Second job in batch one",
              testId: "prisma-batch-test-002",
            },
            { dbClient: usePrisma(prismaTx) },
          );

          await sidetrack.insertJob(
            "prismaBatchTwo",
            {
              description: "First job in batch two",
              testId: "prisma-batch-test-003",
            },
            { dbClient: usePrisma(prismaTx) },
          );

          expect(
            (
              await sidetrack.listJobs({
                dbClient: usePrisma(prismaTx),
                queue: ["prismaBatchOne", "prismaBatchTwo"],
              })
            ).length,
          ).toBeGreaterThanOrEqual(3);

          throw new Error("Rollback transaction");
        },
        { isolationLevel: "Serializable" },
      );
    } catch (e) {
      if (e instanceof Error && e.message !== "Rollback transaction") {
        throw e;
      }
    } finally {
      await prismaClient.$disconnect();
    }
  });
});
