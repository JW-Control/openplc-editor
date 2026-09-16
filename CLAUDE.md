# CLAUDE.md

This file provides guidance to Claude Code when working with the OpenPLC Editor codebase.

## Project Overview

OpenPLC Editor is an **Electron + React** desktop IDE for programming PLCs using IEC 61131-3 languages (Structured Text, Ladder Diagram, Function Block Diagram, Instruction List) plus Python and C++ extensions.

## Build & Development Commands

**Package manager:** `npm` (not pnpm)

```bash
npm install              # Install deps + download binaries + build DLL cache
npm run dev              # Full dev mode (main + renderer + Electron, port 1313)
npm run build            # Production build (main + renderer)
npm run build:main       # Electron main process only
npm run build:renderer   # React renderer only
npm run build:dll        # Webpack DLL cache for faster dev rebuilds
npm run package          # Build + create distributable (electron-builder)

npm run lint             # ESLint check
npm run lint:fix         # Auto-fix lint issues
npm run format           # Prettier formatting

npm run test             # Jest with coverage (enforced thresholds)
npm run test:watch       # Jest watch mode (no coverage)
npm run test:e2e         # Playwright E2E tests

npm run validate:arch    # Architecture layer dependency validation
```

## Architecture

### Layer Overview

```
src/
├── main/                  # Electron main process (Node.js)
├── frontend/              # React UI layer (renderer process)
│   ├── components/        # Atomic Design: _atoms, _molecules, _organisms, _features, _templates
│   ├── store/             # Zustand store (19 slices)
│   ├── hooks/             # Custom React hooks
│   ├── services/          # Business logic and side effects
│   ├── utils/             # Domain utilities (PLC, graphical, debug, formatters)
│   ├── data/              # Static data (function libraries, block definitions)
│   ├── locales/           # i18next translations
│   └── assets/            # Images, icons
├── backend/
│   ├── editor/            # Main process modules (compiler, hardware, modbus, websocket, services)
│   └── shared/            # Platform-agnostic utilities (XML generation, project parsing, simulator)
├── middleware/             # Ports & Adapters layer
│   ├── shared/
│   │   ├── ports/         # Port interfaces (platform-agnostic contracts)
│   │   └── providers/     # PlatformContext (React Context for dependency injection)
│   └── adapters/
│       └── editor/        # Electron-specific port implementations (IPC bridge)
├── types/                 # Shared IPC type contracts
└── __architecture__/      # Layer dependency validation script
```

### Ports & Adapters Pattern

The codebase uses **dependency inversion** via port interfaces. Frontend code never imports backend or Electron APIs directly. All platform-specific behavior flows through ports.

**Port interfaces** (`src/middleware/shared/ports/`):

| Port | Responsibility |
|------|---------------|
| `CompilerPort` | PLC compilation pipeline |
| `RuntimePort` | Remote PLC runtime control (login, start/stop, status) |
| `DebuggerPort` | Debug protocol (read/write variables, MD5 verification) |
| `SimulatorPort` | Built-in AVR simulator |
| `ProjectPort` | Project CRUD operations |
| `DevicePort` | Board discovery, serial ports |
| `OrchestratorPort` | Device fleet management (web-only) |
| `SystemPort` | Platform services (store, logging, external links) |
| `WindowPort` | Native window management |
| `AcceleratorPort` | Keyboard shortcuts |
| `ThemePort` | Theme detection and switching |
| `VersionControlPort` | Git operations |
| `AIPort` | AI assistant (optional) |

**Consuming ports** in components:
```typescript
import { useCompiler, useRuntime, useCapabilities } from '@root/middleware/shared/providers'

function MyComponent() {
  const compiler = useCompiler()
  const capabilities = useCapabilities()

  if (capabilities.hasLocalSerialPorts) { /* ... */ }
  await compiler.compileProgram(args, onProgress)
}
```

**Wiring** happens at the app root (`src/App.tsx`):
```typescript
import { editorPorts } from './middleware/editor-platform'
<PlatformProvider ports={editorPorts}>...</PlatformProvider>
```

**Editor adapters** (`src/middleware/adapters/editor/`) implement ports by calling `window.bridge.*` (Electron IPC). The web repo has its own adapters using HTTP/WebRTC instead.

### Architecture Layer Rules

Enforced by `npm run validate:arch`. Source dependencies point inward only:

```
assets      -> utils, data
utils       -> utils, ports, data, assets
data        -> ports, utils, data, assets
types       -> store, utils
ports       -> utils, ports
provider    -> ports, utils
adapters    -> ports, provider, utils, backend-shared, backend-web, store, assets
backend-shared -> ports, utils, types
store       -> ports, provider, store, utils, assets
services    -> ports, provider, store, services, utils, assets
hooks       -> ports, provider, store, hooks, services, utils, assets
components  -> ports, provider, store, hooks, services, components, data, utils, assets
```

### IPC Communication

Main and renderer processes communicate through typed IPC bridges:

- **Main bridge:** `src/main/modules/ipc/main.ts` — `MainProcessBridge` registers 50+ `ipcMain.handle()` handlers
- **Renderer bridge:** `src/main/modules/ipc/renderer.ts` — async wrappers calling `ipcRenderer.invoke()`
- **Preload:** `src/main/modules/preload/preload.ts` — exposes `window.bridge` via `contextBridge`

### State Management (Zustand)

Single store composed of 19 slices (`src/frontend/store/`), accessed via auto-generated selector hooks:

```typescript
import { useOpenPLCStore } from '@root/frontend/store'

const pous = useOpenPLCStore((s) => s.project.data.pous)
const createPou = useOpenPLCStore((s) => s.projectActions.createPou)
```

**Slice pattern** — each slice has three files:

- `types.ts` — state shape + action signatures
- `slice.ts` — implementation using Immer's `produce()` for immutable updates
- `index.ts` — re-exports

**Key slices:**

| Slice | Purpose |
|-------|---------|
| `project` | PLC project structure (POUs, data types, servers, devices) |
| `device` | Board config, pin mappings, runtime connection |
| `editor` | Editor models (discriminated union: textual, graphical, device, etc.) |
| `tabs` | Open file tabs |
| `workspace` | UI viewport state, debug values |
| `ladder` | Ladder diagram rungs per POU |
| `fbd` | FBD flow graphs per POU |
| `console` | Log output |
| `library` | System + user function block libraries |
| `file` | File save states (dirty tracking) |
| `ai`, `clipboard`, `history`, `modal`, `search`, `shared`, `version-control`, `webrtc` | Supporting features |

**Conventions:**
- Actions are grouped under a `*Actions` namespace (e.g., `projectActions`, `deviceActions`)
- Complex actions return `{ ok: boolean; message?: string }` response objects
- State is never mutated directly — always use `produce()` from Immer
- Direct state access outside React: `openPLCStoreBase.getState()`

### Component Organization (Atomic Design)

```
src/frontend/components/
├── _atoms/          # Primitive UI elements (buttons, inputs, select, checkbox, table)
├── _molecules/      # Composed patterns (menu-bar, modal, variables-table, tabs)
├── _organisms/      # Complex sections (explorer, panel, console, debugger, navigation)
├── _features/       # Context-specific feature bundles
│   ├── [app]/       # App-level (loading overlay, toast)
│   ├── [start]/     # Start screen (menu, new-project modal)
│   └── [workspace]/ # Workspace features
│       └── editor/  # Monaco, graphical (LD/FBD/SFC), device, server editors
├── _templates/      # Layout wrappers (app-layout, workspace-layout)
└── ui/              # Radix UI primitive wrappers
```

### Navigation

There is **no URL-based router**. Navigation is tab-driven via the Zustand `tabs` + `editor` slices:

1. `App.tsx` renders `StartScreen` (no project) or `WorkspaceScreen` (project loaded)
2. Opening a POU/resource creates a tab entry in the store
3. Clicking a tab sets the active `EditorModel` (discriminated union determines which editor renders)

### Graphical Editors

- **Ladder Diagram (LD):** DnD Kit-based, rung structure with contacts/coils/blocks
- **Function Block Diagram (FBD):** @xyflow/react flow graph with custom node types (block, variable, connector, comment)
- **SFC:** @xyflow/react graph (sequential function charts)

Flow state is stored per-POU in dedicated slices (`ladder`, `fbd`). Flows must be relinked to current variables after variable table changes.

### Compilation Pipeline

Orchestrated by `CompilerModule` (`src/backend/editor/compiler/compiler-module.ts`):

```
PLCProjectData -> Preprocess POUs -> XML Generation -> xml2st -> iec2c -> C code
                                                                           |
                                                    defines.h (pins, Modbus, MD5)
                                                                           |
                                                    Arduino CLI / openplc-compiler -> firmware
```

Platform-specific binaries in `/resources/bin/[platform]/[arch]/`. Board configs in `/resources/sources/boards/hals.json`.

### Debugging

- **Protocol:** Custom Modbus PDU (function codes 0x41-0x45) for variable read/write
- **Transports:** Modbus TCP, Modbus RTU, WebSocket, or virtual serial (simulator)
- **Simulator:** AVR8JS emulator (`src/backend/shared/simulator/`) emulates ATmega2560
- **Flow:** Compile with debug symbols (.dbg file + MD5) -> connect debugger -> poll variables

## Testing

- **Framework:** Jest + jsdom
- **Test files:** `*.test.ts(x)`, `*.spec.ts(x)`, or `__tests__/` directories
- **E2E:** Playwright (`/e2e`), Chromium only
- **Coverage thresholds** (100% functions/lines/statements required):
  - `src/frontend/store/slices/`
  - `src/frontend/utils/`
  - `src/backend/shared/`
  - `src/middleware/adapters/editor/`
- **Mocks:** `configs/mocks/` for file stubs; `identity-obj-proxy` for CSS modules

When adding new code to covered directories, you must add corresponding tests to maintain 100% coverage.

## Code Style

- TypeScript strict mode, avoid `any` types
- ESLint flat config (`eslint.config.mjs`) with TypeScript strict type checking
- Prettier: 120 char width, no semicolons, single quotes, trailing commas
- Import sorting enforced via `simple-import-sort` plugin
- Pre-commit hooks via Husky run lint-staged on `./src/**/*`
- Path alias: `@root/*` -> `./src/*`

## Key Technologies

- **Electron 35** / **React 18** / **TypeScript** (target ES2022)
- **Webpack** (not Vite) with separate main/renderer/preload configs
- **Zustand 5** + **Immer** for state management
- **Monaco Editor** for code editing (ST, IL, Python, C++)
- **@xyflow/react 12** for FBD/SFC graphical editors
- **@dnd-kit** for drag-and-drop (tabs, ladder rungs)
- **Tailwind CSS 3** + **Radix UI** for styling
- **Zod** for schema validation
- **i18next** for internationalization
- **avr8js** for Arduino simulation
- **Axios** for HTTP requests
- **Socket.io** for real-time communication
- **Winston** for structured logging (main process)
- **serialport** for serial communication

## Important Patterns

### When bumping the app version:
`APP_VERSION` in `src/frontend/data/constants/app-version.ts` is the **single
source of truth** for the human-facing version, shared **byte-for-byte** between
openplc-editor and openplc-web (enforced by the mirror gate / `compare-surfaces.py`).
The About modal renders it directly; the web build writes it into `version.json`.

**Bump `APP_VERSION` — never `package.json` alone.** Make the identical one-line
edit in BOTH repos, and set `package.json.version` to the same value in both so
they can't drift. Roles: `APP_VERSION` is what the user sees in the About dialog;
`package.json.version` is what electron-builder stamps on the desktop binary and
what the release tag `vX.Y.Z` must match. Bumping only `package.json` leaves the
About dialog stuck on the old version — **this mistake shipped 4.2.7 and 4.2.8
with About still showing 4.2.6.** If the two ever disagree, `APP_VERSION` is
authoritative; fix it to match.

Release order: bump `APP_VERSION` + `package.json` (both repos, same value) → PR
to `development` → merge → promote `development`→`main` on both → tag `vX.Y.Z` on
the editor's `main` to trigger the "Build and Release" workflow. Web auto-deploys
on its `main` push. (Ideally `package.json.version` should be derived from
`APP_VERSION` in the release workflow so a single bump can never drift.)

### When adding a new port:
1. Define the interface in `src/middleware/shared/ports/`
2. Add it to `PlatformPorts` in `src/middleware/shared/providers/types.ts`
3. Add a convenience hook in `src/middleware/shared/providers/platform-context.tsx`
4. Implement the editor adapter in `src/middleware/adapters/editor/`
5. Wire it in `src/middleware/editor-platform.ts`

### When adding a new store slice:
1. Create `types.ts`, `slice.ts`, `index.ts` in `src/frontend/store/slices/<name>/`
2. Add the slice type to `RootState` union in `src/frontend/store/index.ts`
3. Spread the slice creator in `createOpenPLCStore()`
4. Add tests to maintain 100% coverage

### When adding a new POU language or type:
1. Update project parser (`src/backend/shared/utils/parse-project-files.ts`)
2. Update serializer for save flow
3. Add editor component if graphical
4. Register in library system and project actions

### When modifying graphical editors:
1. Flow state is stored separately from POU body during editing
2. Sync flows back to POU on save
3. Relink variables after variable table changes
4. Node IDs must be unique per flow

### IEC address allocation + alias registry

Located in `src/backend/shared/utils/iec-address/` (byte-identical on
openplc-web). Pure functions, no IPC, no electron coupling.

- **Address pool** (`address-pool.ts`): producer-only, target-scoped
  view of every claimed IEC address. Producers = pin mapping, VPP
  module slots, Modbus TCP remote IO points, EtherCAT channel
  mappings. Capability scoping comes from `target-capabilities` —
  switching targets activates / deactivates entire producers.
  - Reservation pass: pin-mapping (Arduino-style fixed addresses).
  - Allocation pass: every other producer in deterministic order.
  - `nextFreeAddress(pool, prefix, isBit, startFrom?, alsoUsed?)`
    replaces the old `generateIecAddress` helper. Pass `alsoUsed` for
    in-flight allocations within a batch.
- **Alias registry** (`alias-registry.ts`): derived index on top of
  the pool. `byAlias` map plus `duplicateAliases` (first-wins). Pure
  function — rebuild on demand, cost is O(producers).
- **Compile-time resolution** (`registry/resolve.ts`): a variable's
  `location` holds EITHER an alias name OR a literal `%addr`
  (single-field model). `buildAliasIndex(registry)` builds the
  `alias → address` map; `resolveLocation(field, index)` resolves a
  variable's `location` for the compiler:
  - literal `%…` → used verbatim (manual locations honoured exactly);
  - alias that still exists → its current address;
  - alias that is gone → `''` (variable becomes unlocated).
  The compiler/runtime never see aliases: the editor resolves them in
  a pre-compile snapshot via the
  `projectActions.getCompileReadyProjectData()` store action. When a
  producer alias is renamed, `projectActions.renameAlias(old, new)`
  cascades onto every bound variable's `location`.

The variable cell renders `location` verbatim — the alias name when
alias-bound, the `%addr` when a manual literal — and shows an amber
warning glyph + tooltip when an alias-bound location no longer resolves
(orphaned) or when a manual `%addr` collides with an alias another
project variable is bound to (duplicate-location risk). Aliases are
intended to be unique system-wide; every IO-mapping / pin /
remote-device editor calls the registry's
`validateAliasEdit(registry, name, ignoring)` gate before persisting a
new alias.

## Environment

- **Node.js:** >= 20.x < 24
- **Dev server port:** 1313
- **Supported platforms:** macOS, Windows, Linux (x64 & ARM64)
- **Binaries:** Auto-downloaded via `scripts/download-binaries.ts` during `npm install`

## Recent Work & Developer Handover (September 2026)

### 1. Feature: Function Block Logical Variables in Ladder Autocomplete

#### Objective
Enable users to reference and drill down into Function Block (FB) instances (e.g., `TON0`, `TOF0`, `CTU0`) from the Ladder diagram variable selector (contacts, coils, block pins), and access their boolean attributes (`.IN`, `.Q`, `.CU`, etc.).

#### Changes
- **Autocomplete UI (`src/frontend/components/_atoms/graphical-editor/ladder/autocomplete/index.tsx` & `autocomplete/index.tsx`):**
  - Added separation between basic boolean variables and FB instance variables.
  - Rendered a visible dividing line (horizontal gray bar) between variable categories.
  - Centered text alignment for dropdown items.
  - Drill-down navigation: selecting an instance (e.g. `TON0`) expands/reveals its child boolean ports (`.IN`, `.Q`, etc.).
- **Ladder elements (`ladder/coil.tsx`, `ladder/contact.tsx`, `ladder/variable.tsx`):**
  - Integrated the updated autocomplete dropdown with FB instance support and drill-down handling.

---

### 2. Bugfix & Performance: `Maximum update depth exceeded` & UI Freezing

#### Root Cause Analysis
1. **Radix UI compose-refs infinite loop:**
   - `@radix-ui/react-tooltip` and `@radix-ui/react-popover` components used `<TooltipTrigger asChild>` or `<Popover.Trigger asChild>` with dynamic DOM nodes.
   - Every time Zustand store state changed (from background polling such as `useRuntimePolling` every 2s, or debug polling), components re-rendered.
   - Radix's `SlotClone` (`@radix-ui/react-slot`) and `useComposedRefs` create new callback refs on each render.
   - Internal hooks like `PopperAnchor`'s `useEffect` (which runs without a dependency array) called `context.onAnchorChange(ref.current)` (`setAnchor`), triggering `dispatchSetState` → `scheduleUpdateOnFiber` → `checkForNestedUpdates` → React 50-limit depth error.
2. **Synchronous literal validation vs. LSP worker lag:**
   - Typing numeric literals (`10`, `20`, etc.) or duration literals (`T#2s`) into inputs like CTU `PV` or timer `PT` was querying the async LSP worker (`resolveScopeExpressionType`) on every blur/keystroke, creating UI freezes and delays.
3. **Spurious blur on mount:**
   - `highlighted-textarea` had an effect invoking `.blur()` upon mounting, generating unnecessary blur/re-render cycles.

#### Files Modified & Changes Made

| File | Changes Made | Rationale |
|------|-------------|-----------|
| `src/frontend/components/_atoms/graphical-editor/autocomplete/index.tsx` | Replaced `@radix-ui/react-popover` (`Popover.Root`, `Popover.Trigger asChild`, `Popover.Content`) with a custom `createPortal`-based dropdown positioned via `getBoundingClientRect()`. | Eliminated `setAnchor` loop triggered on every canvas and store re-render. Preserved arrow navigation, Enter/Tab selection, drill-down into FB members, and click-outside dismissal. |
| `src/frontend/components/_molecules/workspace-activity-bar/tooltip-button.tsx` | Replaced Radix `Tooltip` (`TooltipProvider`, `Tooltip`, `TooltipTrigger asChild`) with a lightweight `createPortal` CSS tooltip with 200ms hover delay. | Prevented activity bar buttons from re-rendering in a loop when connected to store updates. |
| `src/frontend/components/_atoms/location-warning-glyph/index.tsx` | Removed Radix `TooltipProvider`/`Tooltip`/`TooltipTrigger asChild` and replaced with standard HTML `title` attribute. | Avoided ref loops in variable table cells which re-render with every variable edit. |
| `src/frontend/components/_features/[workspace]/build-options/index.tsx` | Removed nested Radix `TooltipTrigger` wrapped inside `Popover.Trigger` on `BuildOptionsPopover`; replaced tooltip with standard HTML `title` attribute. | Eliminated nested Popper × Tooltip ref collision. |
| `src/frontend/components/_atoms/graphical-editor/ladder/block.tsx` | Removed Radix `Tooltip` wrapper around block nodes. | Eliminated compose-refs loop when block nodes re-render on canvas interaction. |
| `src/frontend/components/_atoms/graphical-editor/fbd/block.tsx` | Removed Radix `Tooltip` wrapper around FBD block nodes. | Consistent with Ladder block fix. |
| `src/frontend/components/_atoms/graphical-editor/fbd/variable.tsx` | Removed Radix `Tooltip` wrappers; used HTML `title` attributes for validation errors. | Prevented ref collisions in FBD variable nodes. |
| `src/frontend/components/_atoms/highlighted-textarea/index.tsx` | Removed spurious `useEffect` calling `ref.current.blur()` on mount. | Prevented false blur events during node mounting. |
| `src/frontend/components/_atoms/graphical-editor/ladder/variable.tsx` | Added synchronous `getLiteralType(value)` fast-path and `validateVariableType(literalType, expectedType).isValid` check before calling async LSP worker. Removed unused `Popover` import. | Prevented UI lag/freeze when editing numeric or timer literals (`10`, `20`, `T#2s`). |

---

### 3. Handover Notes for Next Developer (Pending Issues)

> [!WARNING]
> **Issue Persisting:** The user reports that `Maximum update depth exceeded` can still occur when editing block values (CTU `PV`, `TON`/`TOF` time) and clicking outside after the editor has been open or idle for several minutes (around 3+ minutes).

#### Next Steps to Investigate
1. **Identify the exact active component in the loop:**
   - Look at the latest bundle line numbers in `renderer.dev.js` stack trace.
   - Inspect lines in `renderer.dev.js` around the offending `setRef` (check whether it's `@radix-ui/react-select`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, or `@xyflow/react` node refs).
2. **Examine Textarea / Input Blur & Store Commit Handlers:**
   - In `src/frontend/components/_atoms/graphical-editor/ladder/variable.tsx`, check `handleSubmitVariableValueOnTextareaBlur`:
     - Does `updateNodeData` or `updateVariable` trigger a state change that re-focuses or re-blurs the textarea?
     - Check if `selectedNodes` or `activeSelection` in Zustand triggers an infinite cycle between the node selection and textarea focus.
3. **Check Context Menu Popovers:**
   - `ladder/contact.tsx`, `ladder/coil.tsx`, and `fbd/variable.tsx` still import `@radix-ui/react-popover` for context menus (`Popover.Root open={isContextMenuOpen}`).
   - `build-options/index.tsx` still uses `@radix-ui/react-popover` for the build menu.
   - If needed, migrate these to portal-based context menus similar to `src/frontend/components/_molecules/variables-panel/index.tsx` (`ContextMenu`).
4. **Inspect Background Polling Subscriptions:**
   - `src/frontend/hooks/use-runtime-polling.ts` (polls every 2000ms).
   - `src/frontend/hooks/useDebugPolling.ts` (multiple `setInterval` calls).
   - Verify that components subscribing to the store use granular selectors (or `useShallow`) so periodic status polls don't re-render entire canvas subtrees.
