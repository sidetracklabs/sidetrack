/* eslint-disable @typescript-eslint/require-await */
import { Sidetrack } from "@sidetrack/sidetrack";
import { describe, expect, it } from "vitest";

import { makePrismaAdapter } from "../src";
import { PrismaClient } from "./prisma/generated";

// TODO configure with global setup later: https://vitest.dev/config/#globalsetup

describe("jobs", () => {
  it("insert and run works with prisma adapter", async () => {
    const sidetrack = new Sidetrack<{
      test: { id: string };
    }>({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queryAdapter: makePrismaAdapter(new PrismaClient()),
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
      const job = await sidetrack.insert(
        "test",
        { id: "string" },
        { queryAdapter: makePrismaAdapter(prisma) },
      );
      expect(await sidetrack.getJob(job.id)).toBeUndefined();

      expect(
        (
          await sidetrack.getJob(job.id, {
            queryAdapter: makePrismaAdapter(prisma),
          })
        ).id,
      ).toBe(job.id);

      await sidetrack.runJob(job.id, {
        queryAdapter: makePrismaAdapter(prisma),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            queryAdapter: makePrismaAdapter(prisma),
          })
        ).status,
      ).toBe("completed");

      return job;
    });

    expect(await sidetrack.getJob(job.id)).toBeTruthy();
  });

  it("retry, cancel, delete works with prisma adapter", async () => {
    const sidetrack = new Sidetrack<{
      test: { id: string };
    }>({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queryAdapter: makePrismaAdapter(new PrismaClient()),
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
      const job = await sidetrack.insert(
        "test",
        { id: "string" },
        { queryAdapter: makePrismaAdapter(prisma) },
      );
      expect(await sidetrack.getJob(job.id)).toBeUndefined();

      await sidetrack.runJob(job.id, {
        queryAdapter: makePrismaAdapter(prisma),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            queryAdapter: makePrismaAdapter(prisma),
          })
        ).status,
      ).toBe("retrying");

      await sidetrack.runJob(job.id, {
        queryAdapter: makePrismaAdapter(prisma),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            queryAdapter: makePrismaAdapter(prisma),
          })
        ).status,
      ).toBe("failed");

      await sidetrack.cancelJob(job.id, {
        queryAdapter: makePrismaAdapter(prisma),
      });

      expect(
        (
          await sidetrack.getJob(job.id, {
            queryAdapter: makePrismaAdapter(prisma),
          })
        ).status,
      ).toBe("cancelled");

      await sidetrack.deleteJob(job.id, {
        queryAdapter: makePrismaAdapter(prisma),
      });

      expect(
        await sidetrack.getJob(job.id, {
          queryAdapter: makePrismaAdapter(prisma),
        }),
      ).toBe(undefined);

      return job;
    });
  });

  it("list job works", async () => {
    const sidetrack = new Sidetrack<{
      one: { id: string };
      two: { id: string };
    }>({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queryAdapter: makePrismaAdapter(new PrismaClient()),

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
      await sidetrack.insert(
        "one",
        { id: "hello world" },
        { queryAdapter: makePrismaAdapter(prisma) },
      );

      await sidetrack.insert(
        "one",
        { id: "hello universe" },
        { queryAdapter: makePrismaAdapter(prisma) },
      );

      await sidetrack.insert(
        "two",
        { id: "hello universe" },
        { queryAdapter: makePrismaAdapter(prisma) },
      );

      expect(
        (
          await sidetrack.listJobs({
            queryAdapter: makePrismaAdapter(prisma),
            queue: ["one", "two"],
          })
        ).length,
      ).toBeGreaterThanOrEqual(3);
    });
  });
});
