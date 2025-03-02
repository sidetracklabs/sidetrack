# @sidetrack/client-prisma

## 0.1.10

### Patch Changes

- [`152b864`](https://github.com/sidetracklabs/sidetrack/commit/152b864d9ea72425f9879c07ff7676ac2d8c4483) Thanks [@aniravi24](https://github.com/aniravi24)! - don't minify the library

## 0.1.9

## 0.1.8

## 0.1.7

### Patch Changes

- [`c510039`](https://github.com/sidetracklabs/sidetrack/commit/c51003920a7059b846e41188552fb9580497b04d) Thanks [@aniravi24](https://github.com/aniravi24)! - export sidetrack context type, bump deps

## 0.1.6

## 0.1.5

## 0.1.4

## 0.1.3

## 0.1.2

## 0.1.1

## 0.1.0

### Minor Changes

- [`6dd13fa`](https://github.com/sidetracklabs/sidetrack/commit/6dd13fab5c424f41d289e4b8065eaac3918e72ef) Thanks [@aniravi24](https://github.com/aniravi24)! - Initial batch of improvements

  - Cron support with timezone
  - Support payload transformers (serialize/deserialize payloads in a custom manner, e.g. superjson)
  - Change default polling interval to 2000ms and allow it to be configured globally or per-queue
  - run functions take two args, payload and context
  - Rename `handler` to `run`
  - Handle SIGTERM by turning off polling/cron and allow existing jobs to finish gracefully

## 0.0.18

### Patch Changes

- [`19ba808`](https://github.com/sidetracklabs/sidetrack/commit/19ba8080bce6e758b3e8d53423a5d15c5eb0b25d) Thanks [@aniravi24](https://github.com/aniravi24)! - Effect 3.0 support

## 0.0.17

### Patch Changes

- [`65fb249`](https://github.com/sidetracklabs/sidetrack/commit/65fb249719532a2ddcb207e41ee3ce5935db45ff) Thanks [@aniravi24](https://github.com/aniravi24)! - Effect 2.4 bump

- [`65c2702`](https://github.com/sidetracklabs/sidetrack/commit/65c270210c5871291d730c3e233d9ef0af908305) Thanks [@aniravi24](https://github.com/aniravi24)! - Effect 2.4 bump

## 0.0.16

### Patch Changes

- [#75](https://github.com/sidetracklabs/sidetrack/pull/75) [`dfa6781`](https://github.com/sidetracklabs/sidetrack/commit/dfa6781cf35ac0bf4e91d2536d1ccc4eb67b2ac7) Thanks [@renovate](https://github.com/apps/renovate)! - Support Effect 2.0

## 0.0.15

### Patch Changes

- [`205db96`](https://github.com/sidetracklabs/sidetrack/commit/205db965de7b860a60b4148fd12dc3b14ee912a4) Thanks [@aniravi24](https://github.com/aniravi24)! - Update deps, move to Effect 2.0-next

## 0.0.14

### Patch Changes

- [`4266d72`](https://github.com/sidetracklabs/sidetrack/commit/4266d72142f296edcefd19be30c2ce28a8839f82) Thanks [@aniravi24](https://github.com/aniravi24)! - Try fixing ESM TS imports

## 0.0.13

## 0.0.12

## 0.0.11

### Patch Changes

- [`3bd5a34`](https://github.com/sidetracklabs/sidetrack/commit/3bd5a348e12814fcaaff4742a78508067aae1810) Thanks [@aniravi24](https://github.com/aniravi24)! - Refactor some names and upgrade deps

## 0.0.10

## 0.0.9

## 0.0.8

### Patch Changes

- [`66c694e`](https://github.com/sidetracklabs/sidetrack/commit/66c694e012c20eda2bc94c35292606d6ed534e1a) Thanks [@aniravi24](https://github.com/aniravi24)! - Attempt to change exports again

## 0.0.7

## 0.0.6

### Patch Changes

- [`ade19f1`](https://github.com/sidetracklabs/sidetrack/commit/ade19f15716cfb725380a31533ff64913aeabafb) Thanks [@aniravi24](https://github.com/aniravi24)! - rename packages and separate out test utils

## 0.0.5

### Patch Changes

- [`d308148`](https://github.com/sidetracklabs/sidetrack/commit/d3081489dee8504dec403d952a8308652477a233) Thanks [@aniravi24](https://github.com/aniravi24)! - Adding docs and refactoring internal migrations tool

## 0.0.4

## 0.0.3

### Patch Changes

- [`efb6bc7`](https://github.com/sidetracklabs/sidetrack/commit/efb6bc7b399b5b0a58457871272cc820fd70c3bd) Thanks [@aniravi24](https://github.com/aniravi24)! - Fixed a couple bugs and added the prisma adapter
