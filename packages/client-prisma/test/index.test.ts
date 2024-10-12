/* eslint-disable @typescript-eslint/require-await */
import { SidetrackTest } from "sidetrack";
import { describe, expect, it } from "vitest";

import { usePrisma } from "../src";
import { PrismaClient } from "./prisma/generated";

// TODO configure with global setup later: https://vitest.dev/config/#globalsetup

describe("jobs", () => {
  it("insert and run works with prisma sidetrack client", async () => {
    const sidetrack = new SidetrackTest<{
      test: { id: string };
    }>({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      dbClient: usePrisma(new PrismaClient()),
      queues: {
        test: {
          handler: async (payload) => {
            return payload;
          },
        },
      },
    });

    const prismaClient = new PrismaClient();

    // insert and run job API
    const job = await prismaClient.$transaction(async (prismaTx) => {
      const job = await sidetrack.insertJob(
        "test",
        { id: "string" },
        { dbClient: usePrisma(prismaTx) },
      );
      expect(await sidetrack.getJob(job.id)).toBeUndefined();

      expect(
        (
          await sidetrack.getJob(job.id, {
            dbClient: usePrisma(prismaTx),
          })
        ).id,
      ).toBe(job.id);

      await sidetrack.runJob(job.id, {
        dbClient: usePrisma(prismaTx),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            dbClient: usePrisma(prismaTx),
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
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      dbClient: usePrisma(new PrismaClient()),
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

    const prismaClient = new PrismaClient();

    // insert and run job API
    await prismaClient.$transaction(async (prismaTx) => {
      const job = await sidetrack.insertJob(
        "test",
        { id: "string" },
        { dbClient: usePrisma(prismaTx) },
      );
      expect(await sidetrack.getJob(job.id)).toBeUndefined();

      await sidetrack.runJob(job.id, {
        dbClient: usePrisma(prismaTx),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            dbClient: usePrisma(prismaTx),
          })
        ).status,
      ).toBe("retrying");

      await sidetrack.runJob(job.id, {
        dbClient: usePrisma(prismaTx),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            dbClient: usePrisma(prismaTx),
          })
        ).status,
      ).toBe("failed");

      await sidetrack.cancelJob(job.id, {
        dbClient: usePrisma(prismaTx),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            dbClient: usePrisma(prismaTx),
          })
        ).status,
      ).toBe("cancelled");

      await sidetrack.deleteJob(job.id, {
        dbClient: usePrisma(prismaTx),
      });

      expect(
        await sidetrack.getJob(job.id, {
          dbClient: usePrisma(prismaTx),
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
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      dbClient: usePrisma(new PrismaClient()),
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

    const prismaClient = new PrismaClient();

    // insert and run job API
    await prismaClient.$transaction(async (prismaTx) => {
      await sidetrack.insertJob(
        "one",
        { id: "hello world" },
        { dbClient: usePrisma(prismaTx) },
      );

      await sidetrack.insertJob(
        "one",
        { id: "hello universe" },
        { dbClient: usePrisma(prismaTx) },
      );

      await sidetrack.insertJob(
        "two",
        { id: "hello universe" },
        { dbClient: usePrisma(prismaTx) },
      );

      expect(
        (
          await sidetrack.listJobs({
            dbClient: usePrisma(prismaTx),
            queue: ["one", "two"],
          })
        ).length,
      ).toBeGreaterThanOrEqual(3);
    });
  });
});
