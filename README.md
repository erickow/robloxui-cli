# RobloxUI CLI

Scaffold a Roblox project and connect it to Roblox Studio in minutes. `robloxui init` creates a Roblox-TS or Luau/Wally project pre-wired with Rojo, a mise-pinned toolchain, a minimal player spawn, and the Roblox Studio MCP server for AI tools. Marketplace components ([robloxui.pencicta.com](https://robloxui.pencipta.com)) can be added later with `robloxui add`.

## Quick start

```bash
npx robloxui init
```

Answer the prompts (project name, flavor, theme), then:

```bash
cd my-game
npm run dev          # compiles and syncs into Studio
```

**In Roblox Studio:** open `game.rbxl` in the project folder → Rojo plugin → **Connect** → press **Play**.

That's it — a playable place with a spawn and an empty client mount, ready for UI.

## `robloxui init`

Scaffold an empty Roblox-TS or Luau/Wally project with a minimal player spawn, pre-wired for RobloxUI components, toolchain, and Studio connection.

```bash
robloxui init --name my-game --flavor roblox-ts --yes
robloxui init --name . --flavor luau-wally --yes   # scaffold in cwd
robloxui init --name my-game --flavor roblox-ts --yes --theme  # include the theme
```

| Option | Description |
|--------|-------------|
| `-y, --yes` | Non-interactive (requires `--name` + `--flavor`) |
| `--name <dir>` | Project folder name, or `.` for current dir |
| `--flavor <f>` | `roblox-ts` or `luau-wally` |
| `--skip-install` | Skip dependency install / theme setup |
| `--no-bootstrap` | Do not install missing mise automatically |
| `--theme` | Include the RobloxUI theme in the scaffold |
| `--no-theme` | Scaffold without the theme |

Creates: Rojo config, `mise.toml` toolchain pins, the standard DataModel services (Lighting, ServerStorage, SoundService, StarterGui, StarterPack, StarterCharacterScripts), a minimal player spawn, empty client mount, `src/shared` + `src/server` folders, and a `game.rbxl` place file. The RobloxUI theme is opt-in: pass `--theme` (or answer the prompt) to also wire the canonical `robloxui/theme` tokens. Init bootstraps mise with the official installer when needed.

Existing projects are inspected without replacing custom Rojo mappings. Non-interactive mode refuses ambiguous flavor or target input.

## Connect to Roblox Studio

### One-time setup

1. Run `npx robloxui init` — mise and pinned tools are bootstrapped automatically
2. Install the **Rojo Studio plugin** (Roblox Studio → Plugins → search "Rojo")

### Roblox-TS workflow

Run one command in your project:

```bash
npm run dev          # compiles and syncs into Studio
```

| File | Role |
|------|------|
| `rojo.json` | Maps `out/client` → `StarterPlayerScripts`, npm packages → `ReplicatedStorage` |
| `src/client/` | Your TypeScript source |
| `out/client/` | Compiled Luau (created by `npm run watch`) |

**In Studio:** open `game.rbxl` → Rojo plugin → **Connect** → press **Play**.

### Luau / Wally workflow

```bash
npm run dev                                # installs/syncs the Wally project into Studio
```

| File | Role |
|------|------|
| `default.project.json` | Rojo project file for Wally layouts |
| `wally.toml` | Project metadata for Wally (theme ships bundled, no dependency) |
| `Packages/RuiTheme/` | Vendored theme (created by init / `robloxui add`) |
| `src/client/init.client.luau` | Client bootstrap |

For your own (non-RobloxUI) Wally packages, add them to `wally.toml` and run
`wally install` — the RobloxUI theme itself ships bundled and needs no dependency.

### Studio MCP (AI tools)

Init can wire the Roblox Studio MCP server into your AI tool (`opencode.json`,
`.mcp.json`, `.cursor/mcp.json`, or `.vscode/mcp.json`). Enable it once in Studio:
**Assistant → ⋯ → Manage MCP Servers → Enable Studio as MCP server** — then your
agent can read the game tree, edit scripts, insert models, and run playtests.

### Prerequisites

- Node.js ≥ 20.12 (required by the CLI test/build toolchain)
- [mise](https://mise.jdx.dev/) is bootstrapped with the official installer when it is not on PATH
- [Rojo CLI](https://rojo.space/docs/installation/) + Rojo Studio plugin
- [Wally](https://github.com/UpliftGames/wally) — Luau projects only

When bootstrap is disabled, run `mise install` in the project to install the pinned tools.

---

# Everything else

The sections below cover the marketplace workflow — installing components,
authentication, browsing the catalog, and troubleshooting. Skip them until you
need more than the scaffold.

## Authentication

Run `robloxui login` once. Two flows:

```
robloxui login                     # browser device flow (recommended)
robloxui login --token <key>       # manual API key (CI / headless)
```

The browser flow prints a short code — open the URL, approve, done. Your token is saved to `~/.config/robloxui/config.json` (Linux/macOS) or `%APPDATA%\robloxui\config.json` (Windows).

CI / headless machines: generate a key at [Dashboard → Developer](/dashboard/developer), then paste it.

```
robloxui whoami      # check who you're logged in as
robloxui logout      # remove saved token
```

**Limits** — Free users get 2 downloads/day. Pro subscribers get unlimited everything. See https://robloxui.pencipta.com/pricing.

## `robloxui add <slug...>`

Install one or more components.

```
robloxui add primary-button
robloxui add button card dialog --yes   # non-interactive (CI)
robloxui add button --theme             # also install the theme package
```

| Option | Description |
|--------|-------------|
| `-y, --yes` | Accept all defaults |
| `--force` | Overwrite existing files |
| `--path <dir>` | Override install directory |
| `--theme` | Also install the RobloxUI theme package |
| `--no-theme` | Skip the theme package |

The CLI will:

1. **Preflight** slug, authentication, target, flavor, package manager, and tools before network or writes
2. **Detect** your project type (`rojo.json` → Roblox-TS, `wally.toml` → Luau)
3. **Prompt** for install path (default: `src/client/ui/components/`) and whether to install the theme
4. **Fetch** the component source + metadata from the API
5. **Stage and validate** all files; conflicts stop by default (`--force` is explicit)
6. **Write** source and, when requested, install the theme transactionally

## `robloxui list` / `robloxui search`

```
robloxui list                        # browse all components
robloxui search dialog               # search by name/description
robloxui list --framework tsx        # filter by framework
robloxui list --category buttons --limit 20
```

| Option | Description |
|--------|-------------|
| `--framework <f>` | `tsx`, `luau`, or `both` |
| `--category <name>` | Filter by category |
| `--limit <n>` | Max results (default 30, max 100) |

## `robloxui info <slug>`

```
robloxui info primary-button
```

Prints: framework, category, dependencies, theme tokens, usage example, and the exact `robloxui add` command.

## Project detection

| Detected | Theme install method (only with `--theme` or prompt) |
|----------|---------------------|
| `rojo.json` | `npm install robloxui` (ships the `robloxui/theme` subpath) |
| `wally.toml` | Vendors bundled `RuiTheme` into `Packages/` |
| Neither | Manual project type selection |

The theme is never installed automatically: non-interactive runs skip it, interactive runs ask. Components run standalone because they embed their own design tokens.

## Troubleshooting

Every CLI failure prints a recovery hint (retry + manual command + preserved paths). Common fixes:

| Problem | Fix |
|---------|-----|
| `login` fails with "invalid_token" | Token expired or revoked. Run `robloxui login` again |
| `add` says "daily limit reached" | Free tier: 2/day. Upgrade to Pro: https://robloxui.pencipta.com/pricing |
| `add` says "Pro component" | Requires a Pro subscription. Run `robloxui info <slug>` to check |
| Pro component returns no source | Sign in first (`robloxui login`) — Pro access is tied to your account |
| Rojo won't connect | Ensure `npm run dev` is running in the project root |
| Nothing in Play mode (Roblox-TS) | Keep `npm run dev` running so `out/client/` is compiled and synced |
| `RuiTheme` not found (Luau) | You opted into the theme but it is missing: re-run `npx robloxui add <slug> --theme` (or `npm install robloxui` for Roblox-TS) |
| Want the canonical theme later | `npm install robloxui` (Roblox-TS) or re-run add with `--theme` (Luau vendors `Packages/RuiTheme/`) |
| UI doesn't appear | Press **Play**, not Edit — scripts run under `StarterPlayerScripts` |

## Links

- [RobloxUI marketplace](https://robloxui.pencipta.com)
- [Pricing](https://robloxui.pencipta.com/pricing)
- [Docs](https://robloxui.pencipta.com/docs)
- [npm package](https://www.npmjs.com/package/robloxui)
