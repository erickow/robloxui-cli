# Roblox-TS Experience Skills

Reusable, code-first practices for this Roblox-TS project. Roblox-TS is
TypeScript compiled to Luau — everything runs as Roblox engine Luau, but you
write typed TS with `@rbxts/*` packages. Grounded in the Roblox Creator
Documentation (https://create.roblox.com/docs) and the third-party samples at
https://create.roblox.com/docs/samples. Source of truth is this file and the
Rojo config — edit source, then Rojo syncs into Studio (`npm run dev`). Never
hand-edit `game.rbxl`.

## Project layout and tooling

- Source on disk; `rbxtsc` compiles to `out/`, Rojo syncs to Studio. Commit
  source, never `out/` or the generated place file.
- **File suffixes decide context**:
  - `*.server.ts` / `*.server.tsx` → `ServerScriptService`
  - `*.client.ts` / `*.client.tsx` → `StarterPlayerScripts`
  - `*.server.util.ts` → shared between server files (not networked)
  - `*.ts` / `*.tsx` without a suffix → `ReplicatedStorage` (shared,
    accessible on both sides)
- Put reusable logic in modules and `import` them. Never use `_G`; import by
  relative path. One meaningful export per module.
- Install UI from the marketplace: `npx robloxui add <slug>` into
  `src/client/ui/components`.
- Naming: PascalCase for types/components, camelCase for instances/variables,
  SCREAMING_SNAKE for constants. Suffix services with what they are
  (`PlayerDataService`, `GameUI`).

## TypeScript and React

Annotate interfaces; use `@rbxts/services` for engine access and `@rbxts/react`
for UI. `strict` mode is non-negotiable.

```ts
import { Workspace } from "@rbxts/services";

export interface Point {
	x: number;
	y: number;
}

export function distance(a: Point, b: Point): number {
	return math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}
```

- Keep the bundled tsconfig `strict` so type errors surface at compile time
  instead of as runtime Lua errors.
- Use `Path.dict`-safe imports and avoid `any` at trust boundaries — an `any`
  payload from a remote is an unvalidated client input.

### React UI

Mount a component tree into `PlayerGui` once in a client entry (`*.client.tsx`):

```tsx
import React from "@rbxts/react";
import { createRoot } from "@rbxts/react-roblox";
import { Players } from "@rbxts/services";
import { App } from "./ui/App";

const player = Players.LocalPlayer!;
const root = createRoot(player.WaitForChild("PlayerGui") as PlayerGui);
root.render(<App />);
```

- Components re-render on props/state change; drive visual updates through React
  state, not `:TweenService()` calls scattered around.
- Read the theme through `import { theme } from "robloxui/theme"` and pass it as
  props or via context, instead of hard-coding colors per component.

## Scripting model

- `*.server.ts` runs server-side; `*.client.tsx` runs client-side. Keep
  authoritative state and all economy logic on the server.
- **Server-authority model**: clients are untrusted. Anything changing shared
  state, scores, or purchases must be re-validated on the server.
- Cross the client-server boundary only with `RemoteEvent`/`RemoteFunction`.
  Same-side signaling uses `BindableEvent`/`BindableFunction`.

### Secure remotes (Roblox-TS)

Centralize remotes, connect each once, validate the payload:

```ts
import { ReplicatedStorage, RemoteEvent } from "@rbxts/services";

const Remotes = ReplicatedStorage.WaitForChild("Remotes") as Folder;

function getRemote(name: string): RemoteEvent {
	return Remotes.WaitForChild(name) as RemoteEvent;
}

interface SalaryRequest {
	amount: number;
}

// Server, connected once at boot:
getRemote("PromiseSalary").OnServerEvent.Connect((player, args) => {
	const amount = tonumber((args as SalaryRequest).amount);
	if (amount === undefined || amount <= 0 || amount > 100) return;
	player.SetAttribute("lastMoneyRequest", os.clock());
});
```

Validate payload shape and bounds server-side, never trust a client argument to
pick which player to modify, and throttle repeated calls.

## Streaming and performance

Large worlds should stream so the engine loads content by region instead of
instantiating everything. See https://create.roblox.com/docs/workspace/streaming.

- Enable **Instance Streaming**; keep spawn and critical assets in the
  pre-loaded area.
- Set `Workspace.FallenPartsDestroyHeight` and clean up falling/dead parts so
  the world does not accumulate unbounded geometry.
- Profile with **MicroProfiler**, **Scene Analysis**, and the **Performance
  Dashboard**; test on low-end hardware. Wins: fewer parts, embed materials,
  stream content, cap particle/sound emitters.

## Frame economy

- Cache instance references and signal connections at boot, not inside an event
  or loop. Avoid re-running `:GetDescendants()` every frame.
- Prefer events (`Changed`, `Touched`, per-interval `Heartbeat`) over polling.
- Spread work across frames with `task.spawn`/`task.defer`; never block on a raw
  `wait()`.

### Object pooling

Reuse expensive instances instead of construct/destroy churn:

```ts
const pool: Part[] = [];

function spawn(): Part {
	const part = pool.pop() ?? new Instance("Part");
	return part;
}

function release(part: Part) {
	part.ClearAllChildren();
	part.Parent = undefined;
	pool.push(part);
}
```

Disconnect signals you own on teardown so listeners do not pile up.

## Persistence and services

- **Data Stores** are the only durable per-player persistence
  (https://create.roblox.com/docs/cloud-services/data-stores).
  - Key structure: `(store, "Money_V1", tostring(userId))` so a schema change
    increments V instead of silently reading old data.
  - Save on a bounded cadence and on `PlayerRemoving`/server shutdown, not every
    mutation.
  - Handle rate limits with retry/backoff and batch writes with an in-memory
    staging buffer.
  - Roblox-TS has no `pcall` sugar — wrap every store access in a `Promise` /
    `try` so an error on save cannot lose player progress.

```ts
import { DataStoreService, Players } from "@rbxts/services";

const store = DataStoreService.GetDataStore("PlayerData");
let running = false;

function write(player: Player) {
	running = true;
	Promise.try(() =>
		store.SetAsync(`Money_${player.UserId}`, player.GetAttribute("money"))
	).finally(() => {
		running = false;
	});
}

Players.PlayerRemoving.Connect(write);
```

- **Memory Store** is for high-frequency state between servers (queues, sorted
  maps, transient leaderboards). Do not hammer DataStores for live data.
- Keep credentials in **Secrets Stores**, never in source or client scripts.
- Validate every purchase server-side through the engine's purchase APIs.

## Concurrency and async

- Prefer `task.wait()` / `task.spawn()` / `task.defer()` globally, or
  `Promise.delay()` / `Promise.spawn()` / `Promise.all()` for sequenceable
  async. Avoid raw `wait()` and `ytask`.
- Use `Promise` chains for load/render sequences that must order reliably —
  `Promise.all` for parallelizable fetches, `.then` for dependent steps.
- Roblox-TS maps Parallel Luau by marking functions pure over plain data; keep
  DataModel-touching work on the main thread and offload pure math/serialization
  to parallel generation. Guard shared mutable state explicitly.

## UI

- Build responsive UIs with `Scale`/`Offset` UDims, `LayoutOrder`,
  `UISizeConstraint`, and layout containers so UI survives resolution and
  device changes. See https://create.roblox.com/docs/ui.
- Apply shared styling via UI stylesheets / Style Editor overrides instead of
  pasting the same properties across many instances
  (https://create.roblox.com/docs/ui/styling).
- Use the **Input Action System** for cross-platform controls, then cover
  gamepad/mobile/console with the adaptive-design guidelines
  (https://create.roblox.com/docs/production/publishing/adaptive-design).
- Text: use **TextChatService** unless you need full custom UI; always run
  user-supplied text through filtering before display.

## Gotchas and traps

- Reading `ServerScriptService` code as if it runs client-side (and vice versa)
  — trust the file suffix and `game` context.
- Trusting client-side `GetAttribute`/memory as the source of truth — it is not;
  authoritative values live server-side.
- Doing unbounded re-render work in `useEffect` without cleanup — disconnect
  signals and connections in the effect's cleanup.
- Forgetting to `Promise`-wrap DataStore/HTTP — a retry is the difference
  between lost progress and a happenstance success.
- Registering the same `.OnServerEvent` handler in multiple modules (duplicate
  connections double-process every call).
- Leaving signal connections alive after a component unmounts — clean up on
  teardown.

## Recommended docs index

Route straight to the authoritative page for the subsystem you are working on:

- **Reference samples**: https://create.roblox.com/docs/samples is the first
  place to look — Roblox ships copy-and-adapt sample scripts for common tasks.
  Player data: **Player Data**, **Data Store Retries**, **Retry Async**.
  Purchases: **Purchase Handling**, **Donation Leaderboard**. Lifecycle:
  **Player Lifecycle Events**, **Safe Player Added**, **Character Loaded
  Wrapper**. Input: **Action Manager**, **Sprint with Button**. Economy:
  **Leaderboard Module**, **Leader Election**, **Cloud Config**. Helpers:
  **ThreadQueue**, **Create Instance Tree**, **Geofencing**.
- User interface: https://create.roblox.com/docs/ui · stylesheets
  https://create.roblox.com/docs/ui/styling · on-screen containers
  https://create.roblox.com/docs/ui/on-screen-containers · text & buttons
  https://create.roblox.com/docs/ui/labels · layout
  https://create.roblox.com/docs/ui/list-flex-layouts
- Players & characters: https://create.roblox.com/docs/players · Character
  Controller Library https://create.roblox.com/docs/characters/character-controller-library
- Input: https://create.roblox.com/docs/input · Input Action System
  https://create.roblox.com/docs/input/input-action-system · Adaptive design
  https://create.roblox.com/docs/production/publishing/adaptive-design
- Scripting: https://create.roblox.com/docs/scripting · script locations
  https://create.roblox.com/docs/scripting/locations · module scripts
  https://create.roblox.com/docs/scripting/module · remote events
  https://create.roblox.com/docs/scripting/events/remote · deferred events
  https://create.roblox.com/docs/scripting/events/deferred · scheduler
  https://create.roblox.com/docs/scripting/scheduler
- Security: https://create.roblox.com/docs/scripting/security · server-authority
  https://create.roblox.com/docs/projects/server-authority · securing the
  boundary https://create.roblox.com/docs/scripting/security/client-server-boundary
- Performance: https://create.roblox.com/docs/performance-optimization · design
  https://create.roblox.com/docs/performance-optimization/design · MicroProfiler
  https://create.roblox.com/docs/performance-optimization/microprofiler
- 3D world: https://create.roblox.com/docs/workspace · physics
  https://create.roblox.com/docs/physics · instance streaming
  https://create.roblox.com/docs/workspace/streaming · CFrames & raycasting
  https://create.roblox.com/docs/workspace/cframes
- Persistence & services: https://create.roblox.com/docs/cloud-services · Data
  stores https://create.roblox.com/docs/cloud-services/data-stores · Data store
  best practices
  https://create.roblox.com/docs/cloud-services/data-stores/best-practices ·
  Memory stores https://create.roblox.com/docs/cloud-services/memory-stores ·
  Secrets https://create.roblox.com/docs/cloud-services/secrets · HTTP
  https://create.roblox.com/docs/cloud-services/http-service