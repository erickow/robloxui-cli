# Luau/Wally Experience Skills

Reusable, code-first practices for this Luau/Wally project. Grounded in the
Roblox Creator Documentation (https://create.roblox.com/docs) and the third-party
samples at https://create.roblox.com/docs/samples. Source of truth is this file
and the Rojo config — edit source, then Rojo syncs into Studio (`npm run dev`).
Never hand-edit `game.rbxl`.

## Project layout and tooling

- Source on disk; Rojo syncs into Studio. Wally deps live in `Packages` (via
  `Package.lock`), vendored by `wally install`. Commit source, never `Packages`
  reflinks or the generated place file.
- **File suffixes decide context**:
  - `*.server.luau` → `ServerScriptService`
  - `*.client.luau` → `StarterPlayerScripts`
  - `*.luau` under `src/shared` → `ReplicatedStorage` (both sides)
- Put reusable logic in ModuleScripts; require by relative path. Prefer Wally
  packages over hand-rolled utilities when a well-maintained one exists.
- Add UI from the marketplace: `npx robloxui add <slug>` into
  `src/client/ui/components`.
- Naming: PascalCase for types/classes, camelCase for instances/variables,
  SCREAMING_SNAKE for constants. Suffix services with what they are
  (`PlayerDataService`, `GameUI`).

## Luau typing

Luau is gradually typed — annotate function params, returns, and table shapes so
mistakes surface at analysis time instead of runtime.

```lua
type Point = { x: number, y: number }

local function distance(a: Point, b: Point): number
	return ((b.x - a.x) ^ 2 + (b.y - a.y) ^ 2) ^ 0.5
end

return { distance = distance }
```

Keep `luau-linter` active in Studio and treat warnings as errors in CI. Type
annotations are the prerequisite for Native Code Generation speedups on hot
paths.

## Scripting model

- `Script` runs server-side; `LocalScript` runs client-side. They cannot access
  each other's workspace instances. Keep authoritative state and all economy
  logic on the server.
- **Server-authority model**: clients are untrusted. Anything changing shared
  state, scores, or purchases must be re-validated on the server, never taken at
  face value.
- Cross the client-server boundary only with `RemoteEvent`/`RemoteFunction`.
  Same-side signaling uses `BindableEvent`/`BindableFunction`.

### Secure remotes pattern

Centralize remotes so handlers are registered and validated in one place instead
of scattered `.OnServerEvent` connects:

```lua
local RemoteHolder = {}
local remotes = {}

function RemoteHolder.get(name: string)
	local r = remotes[name]
	if r then return r end
	local event = Instance.new("RemoteEvent")
	event.Name = name
	event.Parent = game:GetService("ReplicatedStorage"):WaitForChild("Remotes")
	remotes[name] = event
	return event
end

return RemoteHolder
```

Server-side, connect once, validate every argument, and rate-limit:

```lua
MoneyService.PromiseSalary:Connect(function(player, args)
	local amount = tonumber(args and args.amount)
	if not amount or amount <= 0 or amount > 100 then return end
	player:SetAttribute("lastMoneyRequest", os.clock())
end)
```

Never trust a client argument to pick which player to modify, and never accept
magnitudes the game does not allow. Throttle repeated remotes.

## Streaming and performance

Large worlds should stream so the engine loads content by region instead of
instantiating everything. See https://create.roblox.com/docs/workspace/streaming.

- Enable **Instance Streaming**; keep spawn and critical assets in the
  pre-loaded area.
- Set `Workspace.FallenPartsDestroyHeight` and clean up falling/dead parts so
  the world does not accumulate unbounded geometry.
- Profile with **MicroProfiler**, **Scene Analysis**, and the **Performance
  Dashboard**; test on low-end hardware. Wins: fewer parts, reuse materials,
  stream content, cap particle/sound emitters.

## Frame economy

- Cache instance references and signal connections at boot, not inside an event
  or loop. Avoid re-running `:GetDescendants()` every frame.
- Prefer events (`Changed`, `Touched`, per-interval `Heartbeat`) over polling.
- Spread work across frames with `task.spawn`/`task.defer`; never block on `wait()`.

### Object pooling

Reuse expensive instances (bullets, particles, floating damage text) instead of
construct/destroy churn:

```lua
local pool = {}
local function spawn()
	local part = table.remove(pool)
	if not part then part = Instance.new("Part") end
	return part
end
local function release(part)
	part:ClearAllChildren()
	part.Parent = nil
	table.insert(pool, part)
end
```

Disconnect signals you own in `Destroy` paths so listeners do not pile up.

## Persistence and services

- **Data Stores** are the only durable per-player persistence
  (https://create.roblox.com/docs/cloud-services/data-stores).
  - Key structure: `(store, "Money_V1", tostring(userId))` so a schema change
    increments V instead of silently reading old data.
  - Save at a bounded cadence and on `PlayerRemoving`/server shutdown, not every
    mutation.
  - Handle rate limits with `pcall` + `task` retry and batch writes with an
    in-memory staging buffer.
  - `pcall` the whole save path; a thrown data-store error on save loses player
    progress otherwise.

```lua
local async_save = (function()
	local Queue = {}
	local Running = false

	local function write(player)
		Running = true
		task.spawn(function()
			local success, err = pcall(function()
				store:SetAsync("Money_" .. player.UserId, player:GetAttribute("money"))
			end)
			Running = false
		end)
	end

	return function(player)
		Queue[player.UserId] = true
		if Running then return end
		write(player)
	end
end)()
```

- **Memory Store** is for high-frequency state between servers (queues, sorted
  maps, transient leaderboards). Do not hammer DataStores for live data.
- Keep credentials in **Secrets Stores**, never in source or client scripts.
- Validate every purchase server-side through the engine's purchase APIs.

## Concurrency and parallel code

- Prefer `task.wait` / `task.spawn` / `task.defer` over `wait()`/`spawn()`;
  `task` targets the engine scheduler and avoids thread skew.
- **Parallel Luau** (https://create.roblox.com/docs/scripting/multithreading)
  runs CPU-heavy, DataModel-free functions on multiple threads. Functions run in
  parallel must not read or write Roblox instances; pass plain values and return
  results. Guard shared mutable state explicitly.
- Keep DataModel-touching work on the main thread; offload pure math or
  serialization to parallel tasks.

## UI

- Build responsive UIs with `Scale`/`Offset` UDims, `LayoutOrder`,
  `UISizeConstraint`, and layout containers so UI survives resolution and device
  changes. See https://create.roblox.com/docs/ui.
- Apply shared styling via UI stylesheets / Style Editor overrides instead of
  pasting the same properties across many instances
  (https://create.roblox.com/docs/ui/styling).
- Use the **Input Action System** for cross-platform controls, then cover
  gamepad/mobile/console with the adaptive-design guidelines
  (https://create.roblox.com/docs/production/publishing/adaptive-design).
- Text: use **TextChatService** unless you need full custom UI; always run
  user-supplied text through filtering before display.

## Gotchas and traps

- Mistaking `ServerScriptService` (runs on server) for a client context, and
  vice versa — trust the file suffix and `game` context.
- Trusting client-side `GetAttribute`/memory as the source of truth — it is not;
  authoritative values live server-side.
- Nested `task.wait` in loops causing thread skew — prefer `task.spawn` or a
  single scheduler.
- Forgetting to `pcall` DataStore and HTTP calls — `task`-based retry plus
  `pcall` is the difference between lost progress and a happenstance success.
- Registering the same `.OnServerEvent` handler multiple times (duplicate remote
  connections double-process every call).
- Leaving pool/dispatch signals connected after an instance is destroyed —
  disconnect on teardown.

## Recommended docs index

Route straight to the authoritative page for the subsystem you are working on:

- **Reference samples**: https://create.roblox.com/docs/samples is the first
  place to look — Roblox ships copy-and-adapt sample scripts for common tasks.
  Player data: **Player Data**, **Data Store Retries**, **Retry Async**.
  Purchases: **Purchase Handling**, **Donation Leaderboard**. Lifecycle:
  **Player Lifecycle Events**, **Safe Player Added**, **Character Loaded
  Wrapper**. Input: **Action Manager**, **Sprint with Button**. Economy:
  **Leaderboard Module**, **Leader Election**, **Cloud Config**. Helpers:
  **ThreadQueue**, **Custom Event**, **Create Instance Tree**, **Geofencing**.
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
  https://create.roblox.com/docs/scripting/events/deferred · Parallel Luau
  https://create.roblox.com/docs/scripting/multithreading · scheduler
  https://create.roblox.com/docs/scripting/scheduler
- Luau language: https://create.roblox.com/docs/luau · type checking
  https://create.roblox.com/docs/luau/type-checking · metatables
  https://create.roblox.com/docs/luau/metatables · native code gen
  https://create.roblox.com/docs/luau/native-code-gen
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