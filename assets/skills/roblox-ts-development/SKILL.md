---
name: roblox-ts-development
description: >-
  Develop Roblox experiences in this Roblox-TS project. Use when writing or
  reviewing TypeScript source, adding React UI, wiring remotes, handling player
  data, optimizing performance, or working with the Roblox engine, Rojo, Rbxts,
  Instance Streaming, Data Stores, or the server-authority model.
license: MIT
metadata:
  source: https://agentskills.io
---

# Roblox-TS Development

Package full-depth expertise for building scalable, optimized Roblox games in
this **Roblox-TS** project. Read `references/skills.md` for the complete
code-first reference before writing or reviewing `*.ts` / `*.tsx` source.

## References

- `references/skills.md` — full Roblox-TS reference: React, typing, remotes,
  Data Stores, task scheduling, performance, security, UI, gotchas, and the
  docs index.

## Working model

- Edit source on disk, then run `npm run dev` — `rbxtsc` compiles TS to Luau
  and Rojo syncs into Studio. Source is the source of truth; never hand-edit
  `game.rbxl`. Flavor is Roblox-TS (`rojo.json` present).
- Code runs server/client by **file suffix**: `*.server.ts` → server,
  `*.client.tsx` → client UI, `*.server.util.ts` for shared server code.
- Use `@rbxts/services` for engine services, `@rbxts/react` /
  `@rbxts/react-roblox` for component UI, and `@rbxts/promise` for async.
- Add UI via `npx robloxui add <slug>`. Theme ships bundled — import via
  `import { theme } from "robloxui/theme"`.
- Prefer adapting Roblox's official samples
  (https://create.roblox.com/docs/samples) over writing common logic from
  scratch.

## Key rules

1. **Server authority**: clients are untrusted. Validate anything changing
   shared state, scores, or purchases on the server.
2. **Strict typing**: keep `strict` in tsconfig so type errors surface at build
   time, before they reach the engine.
3. **Frame economy**: cache references, use events over polling, `task.*` (or
   `Promise`) over `wait()`, pool expensive instances.
4. **Persistence**: Data Stores for durable player data (save on
   `PlayerRemoving`/shutdown, `Promise` + retry); Memory Stores for live state.
5. **Remotes**: centralize, validate the payload server-side, never trust client
   args, throttle.