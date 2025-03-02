# sidetrack

## 0.1.8

### Patch Changes

- [`d27fb33`](https://github.com/sidetracklabs/sidetrack/commit/d27fb33175bad3ad6c2a8d4c41b4d27c18d121fe) Thanks [@aniravi24](https://github.com/aniravi24)! - Try making stop synchronous

- [`0e5163f`](https://github.com/sidetracklabs/sidetrack/commit/0e5163f8756759cad69c0b2a5df9b261c3d7322b) Thanks [@aniravi24](https://github.com/aniravi24)! - Fix SidetrackQueues export generic

## 0.1.7

### Patch Changes

- [`c510039`](https://github.com/sidetracklabs/sidetrack/commit/c51003920a7059b846e41188552fb9580497b04d) Thanks [@aniravi24](https://github.com/aniravi24)! - export sidetrack context type, bump deps

- Updated dependencies [[`c510039`](https://github.com/sidetracklabs/sidetrack/commit/c51003920a7059b846e41188552fb9580497b04d)]:
  - @sidetrack/pg-migrate@0.1.1

## 0.1.6

### Patch Changes

- [`25ec20f`](https://github.com/sidetracklabs/sidetrack/commit/25ec20ff18a8b4cba00465c553a20f941084212c) Thanks [@aniravi24](https://github.com/aniravi24)! - Fix alias for CLI command

## 0.1.5

### Patch Changes

- [`66c4960`](https://github.com/sidetracklabs/sidetrack/commit/66c49603fdf6401ac4638045a614fc2b01f41792) Thanks [@aniravi24](https://github.com/aniravi24)! - Add Effect DateTime support for scheduling

- [`f1500c4`](https://github.com/sidetracklabs/sidetrack/commit/f1500c4aa61c3e239180bf3296fc15c2af17952e) Thanks [@aniravi24](https://github.com/aniravi24)! - Support Effect TimeZone for cron timezone input

## 0.1.4

### Patch Changes

- [`671e771`](https://github.com/sidetracklabs/sidetrack/commit/671e771c733b80a65c96e3d4653e85bc91c6550d) Thanks [@aniravi24](https://github.com/aniravi24)! - use Effect.fn for better tracing of CLI function

## 0.1.3

### Patch Changes

- [#277](https://github.com/sidetracklabs/sidetrack/pull/277) [`87eae18`](https://github.com/sidetracklabs/sidetrack/commit/87eae18e49424d4a8fb52951bc109ca62eefabbb) Thanks [@aniravi24](https://github.com/aniravi24)! - Rename connectionString -> databaseUrl

## 0.1.2

### Patch Changes

- [#275](https://github.com/sidetracklabs/sidetrack/pull/275) [`9c7c32b`](https://github.com/sidetracklabs/sidetrack/commit/9c7c32b8a9e64b7dae063407cb313576831c3f66) Thanks [@aniravi24](https://github.com/aniravi24)! - Support running migrations from CLI

## 0.1.1

### Patch Changes

- [#270](https://github.com/sidetracklabs/sidetrack/pull/270) [`16ce2e5`](https://github.com/sidetracklabs/sidetrack/commit/16ce2e55caa2fc071151903ecab0053bd70a253f) Thanks [@aniravi24](https://github.com/aniravi24)! - Breaking changes to Effect export

  rename `makeLayer` to `layer` and `createSidetrackServiceTag` to `getSidetrackService`

## 0.1.0

### Minor Changes

- [`6dd13fa`](https://github.com/sidetracklabs/sidetrack/commit/6dd13fab5c424f41d289e4b8065eaac3918e72ef) Thanks [@aniravi24](https://github.com/aniravi24)! - Initial batch of improvements

  - Cron support with timezone
  - Support payload transformers (serialize/deserialize payloads in a custom manner, e.g. superjson)
  - Change default polling interval to 2000ms and allow it to be configured globally or per-queue
  - run functions take two args, payload and context
  - Rename `handler` to `run`
  - Handle SIGTERM by turning off polling/cron and allow existing jobs to finish gracefully

### Patch Changes

- Updated dependencies [[`6dd13fa`](https://github.com/sidetracklabs/sidetrack/commit/6dd13fab5c424f41d289e4b8065eaac3918e72ef)]:
  - @sidetrack/pg-migrate@0.1.0

## 0.0.18

### Patch Changes

- [`19ba808`](https://github.com/sidetracklabs/sidetrack/commit/19ba8080bce6e758b3e8d53423a5d15c5eb0b25d) Thanks [@aniravi24](https://github.com/aniravi24)! - Effect 3.0 support

- Updated dependencies [[`19ba808`](https://github.com/sidetracklabs/sidetrack/commit/19ba8080bce6e758b3e8d53423a5d15c5eb0b25d)]:
  - @sidetrack/pg-migrate@0.0.12

## 0.0.17

### Patch Changes

- [`65fb249`](https://github.com/sidetracklabs/sidetrack/commit/65fb249719532a2ddcb207e41ee3ce5935db45ff) Thanks [@aniravi24](https://github.com/aniravi24)! - Effect 2.4 bump

- [`65c2702`](https://github.com/sidetracklabs/sidetrack/commit/65c270210c5871291d730c3e233d9ef0af908305) Thanks [@aniravi24](https://github.com/aniravi24)! - Effect 2.4 bump

- Updated dependencies [[`65fb249`](https://github.com/sidetracklabs/sidetrack/commit/65fb249719532a2ddcb207e41ee3ce5935db45ff), [`65c2702`](https://github.com/sidetracklabs/sidetrack/commit/65c270210c5871291d730c3e233d9ef0af908305)]:
  - @sidetrack/pg-migrate@0.0.11

## 0.0.16

### Patch Changes

- [#75](https://github.com/sidetracklabs/sidetrack/pull/75) [`dfa6781`](https://github.com/sidetracklabs/sidetrack/commit/dfa6781cf35ac0bf4e91d2536d1ccc4eb67b2ac7) Thanks [@renovate](https://github.com/apps/renovate)! - Support Effect 2.0

- Updated dependencies [[`dfa6781`](https://github.com/sidetracklabs/sidetrack/commit/dfa6781cf35ac0bf4e91d2536d1ccc4eb67b2ac7)]:
  - @sidetrack/pg-migrate@0.0.10

## 0.0.15

### Patch Changes

- [`205db96`](https://github.com/sidetracklabs/sidetrack/commit/205db965de7b860a60b4148fd12dc3b14ee912a4) Thanks [@aniravi24](https://github.com/aniravi24)! - Update deps, move to Effect 2.0-next

- Updated dependencies [[`205db96`](https://github.com/sidetracklabs/sidetrack/commit/205db965de7b860a60b4148fd12dc3b14ee912a4)]:
  - @sidetrack/pg-migrate@0.0.9

## 0.0.14

### Patch Changes

- [`4266d72`](https://github.com/sidetracklabs/sidetrack/commit/4266d72142f296edcefd19be30c2ce28a8839f82) Thanks [@aniravi24](https://github.com/aniravi24)! - Try fixing ESM TS imports

- Updated dependencies [[`4266d72`](https://github.com/sidetracklabs/sidetrack/commit/4266d72142f296edcefd19be30c2ce28a8839f82)]:
  - @sidetrack/pg-migrate@0.0.8

## 0.0.13

### Patch Changes

- [`fbf2775`](https://github.com/sidetracklabs/sidetrack/commit/fbf2775ac3da0ae7d2449140cb222efdb7b90577) Thanks [@aniravi24](https://github.com/aniravi24)! - fix listJobStatuses test util

## 0.0.12

### Patch Changes

- [`4f4e726`](https://github.com/sidetracklabs/sidetrack/commit/4f4e726f31d859b8b947afd1e2c0cc28e7d42bef) Thanks [@aniravi24](https://github.com/aniravi24)! - update README

## 0.0.11

### Patch Changes

- [`3bd5a34`](https://github.com/sidetracklabs/sidetrack/commit/3bd5a348e12814fcaaff4742a78508067aae1810) Thanks [@aniravi24](https://github.com/aniravi24)! - Refactor some names and upgrade deps

- Updated dependencies [[`3bd5a34`](https://github.com/sidetracklabs/sidetrack/commit/3bd5a348e12814fcaaff4742a78508067aae1810)]:
  - @sidetrack/pg-migrate@0.0.7

## 0.0.10

### Patch Changes

- [`01d6ae5`](https://github.com/sidetracklabs/sidetrack/commit/01d6ae5c23d20e055cee9f36b9d0c60f2f13ae83) Thanks [@aniravi24](https://github.com/aniravi24)! - Create SidetrackJob type

## 0.0.9

### Patch Changes

- [`08a069a`](https://github.com/sidetracklabs/sidetrack/commit/08a069a9a7859c5631f6e0eefe43ebeaa8115ca5) Thanks [@aniravi24](https://github.com/aniravi24)! - Rename runQueue to runJobs, prevent migrations from throwing an exception

- Updated dependencies [[`08a069a`](https://github.com/sidetracklabs/sidetrack/commit/08a069a9a7859c5631f6e0eefe43ebeaa8115ca5)]:
  - @sidetrack/pg-migrate@0.0.6

## 0.0.8

### Patch Changes

- [`66c694e`](https://github.com/sidetracklabs/sidetrack/commit/66c694e012c20eda2bc94c35292606d6ed534e1a) Thanks [@aniravi24](https://github.com/aniravi24)! - Attempt to change exports again

- Updated dependencies [[`66c694e`](https://github.com/sidetracklabs/sidetrack/commit/66c694e012c20eda2bc94c35292606d6ed534e1a)]:
  - @sidetrack/pg-migrate@0.0.5

## 0.0.7

### Patch Changes

- [`afc120c`](https://github.com/sidetracklabs/sidetrack/commit/afc120caf97ba523457b659b5be1b71264f65d34) Thanks [@aniravi24](https://github.com/aniravi24)! - Support pools for custom pg client

- Updated dependencies [[`845a4f0`](https://github.com/sidetracklabs/sidetrack/commit/845a4f094b821179cc0ca2dbb9ca0018822a31fd)]:
  - @sidetrack/pg-migrate@0.0.4

## 0.0.6

### Patch Changes

- [`ade19f1`](https://github.com/sidetracklabs/sidetrack/commit/ade19f15716cfb725380a31533ff64913aeabafb) Thanks [@aniravi24](https://github.com/aniravi24)! - rename packages and separate out test utils

- Updated dependencies [[`ade19f1`](https://github.com/sidetracklabs/sidetrack/commit/ade19f15716cfb725380a31533ff64913aeabafb)]:
  - @sidetrack/pg-migrate@0.0.3

## 0.0.5

### Patch Changes

- [`d308148`](https://github.com/sidetracklabs/sidetrack/commit/d3081489dee8504dec403d952a8308652477a233) Thanks [@aniravi24](https://github.com/aniravi24)! - Adding docs and refactoring internal migrations tool

- Updated dependencies [[`d308148`](https://github.com/sidetracklabs/sidetrack/commit/d3081489dee8504dec403d952a8308652477a233)]:
  - @sidetrack/pg-migrate@0.0.2

## 0.0.4

### Patch Changes

- [`e5ff359`](https://github.com/sidetracklabs/sidetrack/commit/e5ff359a0bc945868b3f485e7098b892c2342337) Thanks [@aniravi24](https://github.com/aniravi24)! - Fixed node pg import

## 0.0.3

### Patch Changes

- [`efb6bc7`](https://github.com/sidetracklabs/sidetrack/commit/efb6bc7b399b5b0a58457871272cc820fd70c3bd) Thanks [@aniravi24](https://github.com/aniravi24)! - Fixed a couple bugs and added the prisma adapter

## 0.0.2

### Patch Changes

- [`864ec10`](https://github.com/sidetracklabs/sidetrack/commit/864ec10f750b186f7482647f30c0e9d56f50bd85) Thanks [@aniravi24](https://github.com/aniravi24)! - bundled migrations
