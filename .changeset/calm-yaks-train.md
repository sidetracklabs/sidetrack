---
"@sidetrack/client-prisma": minor
"@sidetrack/pg-migrate": minor
"sidetrack": minor
---

Initial batch of improvements

- Cron support with timezone
- Support payload transformers (serialize/deserialize payloads in a custom manner, e.g. superjson)
- Change default polling interval to 2000ms and allow it to be configured globally or per-queue
- run functions take two args, payload and context
- Rename `handler` to `run`
- Handle SIGTERM by turning off polling/cron and allow existing jobs to finish gracefully
