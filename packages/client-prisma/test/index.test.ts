/* eslint-disable @typescript-eslint/require-await */
import { SidetrackTest } from "@sidetrack/sidetrack";
import { describe, expect, it } from "vitest";

import { makePrismaSidetrackClient } from "../src";
import { PrismaClient } from "./prisma/generated";

// TODO configure with global setup later: https://vitest.dev/config/#globalsetup

describe("jobs", () => {
  it("insert and run works with prisma sidetrack client", async () => {
    const sidetrack = new SidetrackTest<{
      test: { id: string };
    }>({
      databaseClient: makePrismaSidetrackClient(new PrismaClient()),
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        test: {
          handler: async (payload) => {
            return payload;
          },
        },
      },
    });

    const transactionClient = new PrismaClient();

    // insert and run job API
    const job = await transactionClient.$transaction(async (prisma) => {
      const job = await sidetrack.insertJob(
        "test",
        { id: "string" },
        { databaseClient: makePrismaSidetrackClient(prisma) },
      );
      expect(await sidetrack.getJob(job.id)).toBeUndefined();

      expect(
        (
          await sidetrack.getJob(job.id, {
            databaseClient: makePrismaSidetrackClient(prisma),
          })
        ).id,
      ).toBe(job.id);

      await sidetrack.runJob(job.id, {
        databaseClient: makePrismaSidetrackClient(prisma),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            databaseClient: makePrismaSidetrackClient(prisma),
          })
        ).status,
      ).toBe("completed");

      return job;
    });

    expect(await sidetrack.getJob(job.id)).toBeTruthy();
  });

  it("retry, cancel, delete works with prisma sidetrack client", async () => {
    const sidetrack = new SidetrackTest<{
      test: { id: string };
    }>({
      databaseClient: makePrismaSidetrackClient(new PrismaClient()),
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        test: {
          handler: async (_payload) => {
            throw new Error("failure");
          },
          options: {
            maxAttempts: 2,
          },
        },
      },
    });

    const transactionClient = new PrismaClient();

    // insert and run job API
    await transactionClient.$transaction(async (prisma) => {
      const job = await sidetrack.insertJob(
        "test",
        { id: "string" },
        { databaseClient: makePrismaSidetrackClient(prisma) },
      );
      expect(await sidetrack.getJob(job.id)).toBeUndefined();

      await sidetrack.runJob(job.id, {
        databaseClient: makePrismaSidetrackClient(prisma),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            databaseClient: makePrismaSidetrackClient(prisma),
          })
        ).status,
      ).toBe("retrying");

      await sidetrack.runJob(job.id, {
        databaseClient: makePrismaSidetrackClient(prisma),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            databaseClient: makePrismaSidetrackClient(prisma),
          })
        ).status,
      ).toBe("failed");

      await sidetrack.cancelJob(job.id, {
        databaseClient: makePrismaSidetrackClient(prisma),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            databaseClient: makePrismaSidetrackClient(prisma),
          })
        ).status,
      ).toBe("cancelled");

      await sidetrack.deleteJob(job.id, {
        databaseClient: makePrismaSidetrackClient(prisma),
      });

      expect(
        await sidetrack.getJob(job.id, {
          databaseClient: makePrismaSidetrackClient(prisma),
        }),
      ).toBe(undefined);

      return job;
    });
  });

  it("list job works", async () => {
    const sidetrack = new SidetrackTest<{
      one: { id: string };
      two: { id: string };
    }>({
      databaseClient: makePrismaSidetrackClient(new PrismaClient()),
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        one: {
          handler: async (payload) => {
            return payload;
          },
        },
        two: {
          handler: async (payload) => {
            return payload;
          },
        },
      },
    });

    const transactionClient = new PrismaClient();

    // insert and run job API
    await transactionClient.$transaction(async (prisma) => {
      await sidetrack.insertJob(
        "one",
        { id: "hello world" },
        { databaseClient: makePrismaSidetrackClient(prisma) },
      );

      await sidetrack.insertJob(
        "one",
        { id: "hello universe" },
        { databaseClient: makePrismaSidetrackClient(prisma) },
      );

      await sidetrack.insertJob(
        "two",
        { id: "hello universe" },
        { databaseClient: makePrismaSidetrackClient(prisma) },
      );

      expect(
        (
          await sidetrack.listJobs({
            databaseClient: makePrismaSidetrackClient(prisma),
            queue: ["one", "two"],
          })
        ).length,
      ).toBeGreaterThanOrEqual(3);
    });
  });
});
