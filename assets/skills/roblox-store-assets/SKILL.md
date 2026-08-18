---
name: roblox-store-assets
description: >-
  Find, recommend, and insert real assets from the Roblox Creator Store into a
  Roblox experience. Use when the game needs a 3D model, mesh, decal, texture,
  audio, sound, animation, VFX/particle effect, vehicle, weapon, gameplay
  mechanic template, or replacement for placeholder parts.
license: MIT
metadata:
  source: https://agentskills.io
---

# Roblox Creator Store Assets

Help pick real assets from the Roblox Creator Store (https://create.roblox.com/store)
and insert them into this Rojo project so the game uses production assets
instead of placeholder parts. Works for both Roblox-TS and Luau/Wally projects —
insertion code is the same engine API.

## How the store is organized

- Everything lives at https://create.roblox.com/store. Main categories:
  **Models** (rigged characters, weapons, vehicles, buildings, props),
  **Meshes** (raw geometry, lower than a model), **Decals** (flat images used as
  textures/applied to parts), **Audio** (SFX/music), **Video** (VideoFrames),
  **Fonts** (UI text), **Plugins** (Studio tooling, not in-game assets).
- Every asset has a stable URL: `https://create.roblox.com/store/asset/<id>/<name>`.
  The numeric `<id>` is what code needs; it is the only reliable identifier.

## Searching (honest limits)

There is **no public unauthenticated store-search API**. The search JSON
endpoints (`catalog.roblox.com/...`, `apis.roblox.com/...`) return 400/404 to
plain fetches, and the store page is a JavaScript app that renders empty without
a browser login. So do **not** rely on fetching a URL to "find" assets.

- **Recommended flow**: give the user a ready-to-paste store search URL and ask
  them to pick assets, or ask them to drop store asset links from a search they
  did in a browser:
  - Browse URL to hand off: `https://create.roblox.com/store/search?q=<query>&category=<Models|Meshes|Decals|Audio|Video|Fonts>`
  - Add `&cost=0` to filter to free items (paid assets need a purchase first).
- **If you have web-search tools**, search `site:create.roblox.com/store <query>`
  and surface real result links — but verify the link actually points at an
  asset page before recommending an ID.
- **Never invent, guess, or "estimate" an asset ID, name, or price.** A wrong ID
  inserts the wrong model or fails `LoadAsset`. Only use an ID you saw on a real
  asset URL (from the user or a verified fetch).

## Recommending

Map the game need to a category and keywords, and check quality markers:

| Need | Category | Keywords | Check |
|------|----------|----------|-------|
| Buildings / props / terrain features | Models or Meshes | low poly, optimized, PBR | part/triangle count, streaming |
| Characters / enemies | Models | rigged, humanoid, R15, animation-ready | rig type matches your game |
| Weapons / tools | Models | rigged, grip positions | default character cameras |
| Vehicles | Models | drivable, seat, wheels | network/ replication cost |
| Particles / hits / ambient | Models (VFX packs) | particle, VFX, effects | emitter count |
| Backgrounds / 2D art | Decals | transparent PNG, texture | resolution, license |
| SFX / music / ambience | Audio | loop, sound effect, music | loop length, loudness |
| Gameplay mechanic templates | Models | game template, mechanics | matches your flavor/API |

- Prefer **free (cost 0)** reusable assets for base content; surface paid items
  only as optional upgrades and note they require purchase.
- Prefer low part-count / optimized assets for instance streaming and mobile
  performance; recommend testing on low-end hardware.
- Check the listing description for part count, rig type, allowed-use terms, and
  known issues before recommending.

## Inserting into a Rojo project

Insert assets at runtime on the server with `InsertService:LoadAsset`. This
keeps the asset out of git (Rojo stays pure source) and lets you cache/clone the
model. Do this once, then clone the cached model.

```lua
local InsertService = game:GetService("InsertService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local assetId = 00000000000 -- REAL ID from a verified asset URL, never guessed

local success, model = pcall(function()
	return InsertService:LoadAsset(assetId)
end)
assert(success and model, "failed to load asset " .. assetId)

model.Name = "SwordProp"
model.Parent = ReplicatedStorage -- shared cache; clone from here when needed

-- World placement: clone and drop into Workspace at a location
local instance = model:Clone()
instance.Parent = workspace
instance:PivotTo(CFrame.new(0, 4, 0))
```

Roblox-TS equivalent (same engine behavior):

```ts
import { InsertService, ReplicatedStorage, Workspace } from "@rbxts/services";
import { Promise } from "@rbxts/promise";

const assetId = 00000000000; // REAL ID — never guessed

Promise.try(() => InsertService.LoadAsset(assetId))
	.then((instance) => {
		const model = instance as Model;
		model.Name = "SwordProp";
		model.Parent = ReplicatedStorage;

		const copy = model.Clone();
		copy.Parent = Workspace;
		copy.PivotTo(new CFrame(new Vector3(0, 4, 0)));
	});
```

Rules:

- `LoadAsset` is a server-only, yielding call — wrap it in `pcall` (Luau) or
  `Promise.try` (Roblox-TS) and assert before touching the result.
- Cache the loaded model in `ReplicatedStorage` and clone it for each use;
  never `LoadAsset` in a loop.
- Give copies a useful `Name` and set `PivotTo`/`PrimaryPart` for placement.
- Paid assets require the creating account to have purchased them; a load will
  fail otherwise — confirm purchase status before recommending.

## Licensing and shipping

- Free store assets are generally usable inside your experiences; respect each
  listing's terms and the creator's wishes — do not re-upload or resell them as
  your own Marketplace listings.
- Never hardcode or log the user's asset purchase status — recommend, then let
  the user confirm licensing for their use case.