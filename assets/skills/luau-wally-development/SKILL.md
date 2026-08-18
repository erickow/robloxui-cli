---
name: luau-wally-development
description: >-
  Develop Roblox experiences in this Luau/Wally project. Use when writing or
  reviewing Luau source, adding UI, wiring remotes, handling player data,
  optimizing performance, or working with the Roblox engine, Rojo, Instance
  Streaming, Data Stores, or the server-authority model.
license: MIT
metadata:
  source: https://agentskills.io
---

# Luau/Wally Development

Package full-depth expertise for building scalable, optimized Roblox games in
this **Luau/Wally** project. Read `references/skills.md` for the complete
code-first reference before writing or reviewing `*.luau` source.

## References

- `references/skills.md` — full Luau/Wally reference: typing, remotes, Data
  Stores, task scheduling, performance, security, UI, gotchas, and the docs
  index.

## Working model

- Edit source on disk, then run `npm run dev` — Rojo syncs the Luau tree into
  Studio (Wally dependencies are vendored into `Packages`). Source is the source
  of truth; never hand-edit `game.rbxl`. Flavor is Luau/Wally (`wally.toml`).
- Client mounts under `src/client` (`*.client.luau`); authoritative server logic
  under `src/server` (`*.server.luau`); shared code under `src/shared`.
- Reuse code with ModuleScripts; require by relative path. Prefer Wally packages
  where possible — `robloxui` and `Rui` ship `Package.lock`-pinned deps.
- Add UI via `npx robloxui add <slug>`. Theme ships vendored as
  `Packages/RuiTheme` — require it from `game.ReplicatedStorage.Packages`.
- Prefer adapting Roblox's official samples
  (https://create.roblox.com/docs/samples) over writing common logic from
  scratch.

## Key rules

1. **Server authority**: clients are untrusted. Validate anything changing
   shared state, scores, or purchases on the server.
2. **Types**: annotate Luau types — it catches errors at analysis time and is
   required for Native Code Generation.
3. **Frame economy**: cache references, use events over polling, `task.*` over
   `wait()`, pool expensive instances.
4. **Persistence**: Data Stores for durable player data (save on
   `PlayerRemoving`/shutdown, `pcall` + retry); Memory Stores for live state.
5. **Remotes**: centralize, validate the payload server-side, never trust client
   args, throttle.