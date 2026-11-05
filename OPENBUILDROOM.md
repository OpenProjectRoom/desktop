# OpenBuildRoom · repository contract (prototype 0.9.49)

OpenBuildRoom is an installable desktop workspace for a software repository. It reads `productview.yaml` from the selected project folder and renders a connected map of specifications, services, tests, data sources, storage, issue sources and external systems. The YAML belongs in the project repository so other developers see the same product model.

The **Overview** page summarizes service state, recorded test runs, issue sources, performance availability and specifications. In the interactive demo it shows clearly labeled sample results. In a local workspace it uses recorded data and marks integrations that are not connected. The **Project Map** remains a separate architecture view. Set `workspace.startPage: overview` to open the summary first, or `workspace.startPage: map` to open the map. Other page names in the schema are also valid start pages.

The interface uses neutral light surfaces, compact spacing, lighter text weights and a restrained slate-blue accent. Green is reserved for successful or running states, amber for warnings, and red for errors. The same palette applies to Overview, product pages, Project Map, Command-line Tools, and the floating chat panel.

The workspace name in the project picker identifies the open project. The navigation has no persistent OpenBuildRoom logo or wordmark; the desktop title bar keeps a clear area for macOS window controls.

The sidebar button in the title bar, directly beside the macOS window controls, expands the compact left navigation into a readable sidebar with page names and workspace details. Clicking it again collapses the sidebar into a 56 px icon rail with compact rows, group dividers, a restrained active marker, and title tooltips. This display preference is saved locally in the browser or desktop app; it does not change the repository configuration.

The desktop workbench has one title bar above a flexible workspace. There is no second row of navigation tabs: the left sidebar selects pages, and the title-bar **Open** menu gives quick access to workspace, product, Run & Verify, and Activity views. A single file explorer appears beside the navigation only on **Files**; folders start collapsed and open individually. Closing it leaves the file reader visible; Command-B opens Files or toggles the explorer. The optional bottom event panel is available from Open or Command-J. It shows recorded workspace events; process output remains on the relevant service or command page. The native macOS window controls remain at the top of the Electron window. The title-bar **Chat** button shows or hides the right panel, which stays in the chosen state across pages and app restarts. The panel's close button hides it too; selecting a map component opens its details in the panel. Opening a file shows its read-only content in the center. These layout choices are local display state, not repository configuration.

The sidebar starts with a **Workspace** group containing **Overview**, **Project Map**, **Files** and **Onboarding** in that order. The map offers Map and List views of the configured components plus a read-only **Source** view of the exact `productview.yaml` text. The desktop app reads the selected repository file again when Source opens; the web demo reads its packaged YAML snapshot. The map toolbar also offers **Add component**. The YAML describes the product workspace and its components; application source files remain in **Files**. **Product** has Backlog, Requirements and Documentation by default; **Run & Verify** has Services, MCP Explorer, API Explorer, Tests, Data Sources and Environment; **Activity** is its own page. **Vision**, **Roadmap**, **North Star** and **CLI Explorer** are hidden from the sidebar and title-bar Open menu by default. **Settings → Preferences → Additional views** switches them on or off in the repository's `workspace.additionalViews` list, so teammates and coding agents see the same navigation after opening the project. The content remains in the repository when a view is hidden. The file explorer opens source files in the central reader. The footer opens **Settings**, with Preferences, Project & Connections, and Agent Access.

```yaml
workspace:
  startPage: overview
  additionalViews: [vision, roadmap] # Also: north-star, commands. Omit or use [] to hide all four.
```

An agent should add a view when it finds meaningful existing content for that page or creates it with the product owner's direction. `vision` uses `product.vision`, `roadmap` uses `product.roadmap`, `north-star` uses `product.northStar`, and `commands` can discover local CLI candidates and display linked `commandTool` components. If an optional page is chosen as `workspace.startPage`, include it in `additionalViews` too. Editing this list changes navigation, not the underlying specs, documents, services or agent access.

## Workspace onboarding and Files

**Onboarding** is the fourth item under Workspace. Its eleven-step checklist starts with opening a local project, copying a project-specific prompt for Codex or Claude Code, and validating \`productview.yaml\`. It then links to Project Map, Services, Tests, Data Sources, Environment, Requirements, Documentation, MCP Explorer, CLI Explorer and API Explorer for human review. Progress is a local preference keyed to the workspace folder; it is not written to the repository and does not imply that a test ran or a database was opened. The prompt exports the bundled OpenBuildRoom guide and schema to the app's local data folder and asks the agent to inspect existing Spec Kit files instead of duplicating them. **Refresh analysis** revalidates the YAML and reloads a valid configuration. Verify each data source by opening its local viewer; configured metadata alone does not prove a connection works.

**Files** uses one explorer beside the reader. Directories start collapsed and expand on click. Closing the explorer leaves the selected file open without showing a second folder tree. Use **Show explorer**, the Files navigation item, or Command-B to bring it back. **Refresh files** reloads the repository tree and selected file without switching layouts.

## API Explorer

**Run & Verify → API Explorer** discovers OpenAPI 3.x YAML and JSON files named `openapi.*` or `swagger.*` in the local project without contacting a server. A registered source in `workspace.apiSources` has a stable ID, display name, clean `baseUrl`, optional relative `spec`, and optional Bearer token variable name `authEnv`. **Add API** and **Add to project YAML** write validated entries to `productview.yaml`; **Remove** deletes only that YAML entry. There is no limit to one API per project. An OpenAPI file supplies an endpoint catalog; an API without a spec still supports manually entered paths.

The request composer supports GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS; editable relative path, JSON headers and optional body; and a response view with HTTP status, time, content type and bounded body preview. **Send** is the only action that makes a request. The desktop main process restricts it to the selected registered origin, disables redirects, times out after 15 seconds and limits response previews. Bearer values come from the encrypted local Environment store and are never sent to the renderer as configuration. Do not put tokens or query values in `baseUrl` or secrets in prompts. Activity records request metadata (API ID, method, path, status and duration), not headers, query string or body. This is a focused local API workbench, not a Postman collection importer or OAuth client.

```yaml
workspace:
  apiSources:
    - id: orders-api
      name: Orders API
      baseUrl: http://127.0.0.1:4000
      spec: specs/001-orders/contracts/openapi.yaml
      authEnv: ORDERS_API_TOKEN
```

Use the existing Spec Kit `contracts/` file when available; do not create a parallel API specification tree. `authEnv` is optional and contains only a variable name. Open the included Hello Workspace, start its Notes service, then visit API Explorer to try its two real endpoints.

## MCP Explorer

**Run & Verify → MCP Explorer** finds the built-in read-only OpenBuildRoom server plus project servers declared in `workspace.mcpServers`, `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json` or `mcp.json`. Discovery only reads these files. **Add MCP server** registers another stdio, HTTP or SSE server in `productview.yaml`; use **Add to project YAML** on a discovered project server to link its safe connection metadata. Each YAML server is an independent entry, with no fixed count limit. A discovered source linked in YAML remains visible with a Linked label. **Remove** deletes only a YAML entry and closes that server's connection; original MCP config files and executables stay in place. Multiple servers can remain connected at the same time. **Connect** starts a local stdio command or contacts a Streamable HTTP or legacy SSE endpoint, then reads advertised tools, resources, resource templates and prompts. Select an item to see its description and schema. **Run tool**, **Read resource** and **Get prompt** are explicit actions with visible arguments and results. **Disconnect** closes only the selected session. The built-in server gives every configured workspace an example to inspect.

Use repository YAML for shared endpoints. Linking a discovered server records its source ID in `linkedFrom` and copies its command or clean endpoint URL. Environment **names** are copied, never the values from project MCP files. Set values in the local **Environment** page. Linking rejects URLs with credentials or query strings and unsupported custom headers; define a clean endpoint and Bearer variable manually when needed. The explorer supports static Bearer tokens via `authEnv`; it does not implement OAuth login. It records connection and action metadata in `.productview/events.jsonl`, without tool arguments, resource content or results.

```yaml
workspace:
  mcpServers:
    - id: docs-mcp
      name: Documentation MCP
      transport: stdio
      command: node
      args: [tools/docs-mcp/server.js]
      cwd: .
      environment: [DOCS_API_TOKEN]
    - id: remote-mcp
      name: Remote MCP
      transport: http
      url: https://example.com/mcp
      authEnv: REMOTE_MCP_TOKEN
```

## Settings and issue-source locations

**AI & Chat** connects the installed Codex CLI or Claude Code to Product Chat. The provider and permission mode are personal settings in Electron's application data folder, not in `productview.yaml`. **Ask & inspect** is the default; **Allow project edits** grants the selected CLI its normal project editing capability. OpenBuildRoom launches the CLI in the open repository and adds its read-only MCP server for the selected workspace while retaining the CLI's existing user tools. The same MCP tools available to external agents provide the YAML, vision and roadmap, components, Spec Kit artifacts, safe project files, and activity. The desktop chat reports agent errors instead of generating a mock answer. The browser demo still uses sample configuration answers. Sent messages go to the selected CLI's configured model provider; OpenBuildRoom does not add locally stored environment values to prompts or MCP responses.

The Product Chat microphone starts macOS on-device speech recognition for the current system language. OpenBuildRoom requests microphone and speech permission when first used, inserts partial transcription into the composer, and stops when pressed again. Audio is not stored by OpenBuildRoom and the recognition request requires on-device processing. If macOS lacks on-device recognition for the language, the button reports that limitation. The user reviews the text before sending it to the agent.

The profile button at the top right opens **Personal settings**. Appearance can follow the system or be set to Light or Dark. English is the only interface language in this prototype. Appearance and sidebar width are local preferences; they are never written to `productview.yaml`.

**Project & Connections** is available in Settings and from the profile menu. It shows the shared project repository and issue sources. In the desktop app, adding or editing an issue source updates its `issues` component in `productview.yaml` and records an event. Additional views in Preferences also update `productview.yaml`; appearance and sidebar width remain local preferences. The web demo only previews changes for its current session. A GitHub source stores `integration.provider: github` and `integration.repository: owner/repository`; a Linear source stores `integration.provider: linear` and `integration.teamId`. Both may store an optional HTTPS `integration.url` for display. The project repository URL belongs in `project.repository`. Agents can read these fields from the YAML or the local read-only MCP server.

These fields describe *where* a source is; they do not grant API access. The current desktop prototype has no OAuth flow, token store, or live issue adapter. A future connection flow should keep credentials outside the repository in a local secure store, show the authorized account and scope, test the connection, and fetch issues without implying that a configured source is already connected. Do not put API keys or OAuth tokens in YAML, Markdown, `.productview/` logs, or MCP output.

## Local environment values

**Run & Verify → Environment** lists variable names declared in `workspace.environment`, `runtime.environment`, `tests.environment`, `cli.environment`, and database `data.connectionEnv`. The shared YAML contains only names and optional descriptions:

```yaml
workspace:
  environment:
    - name: API_TOKEN
      description: Credential for the local API integration
components:
  - id: api
    kind: service
    name: API
    position: { x: 30, y: 100 }
    runtime:
      command: [npm, run, api]
      cwd: .
      startup: manual
      environment: [API_TOKEN]
connections: []
```

The desktop app stores values in an encrypted, per-workspace file under its macOS application data folder, outside the repository. It requires Electron secure storage; there is no plaintext fallback. The page shows whether a variable is stored, inherited from the app's launch environment, or missing. **Set value** and **Change** save a local override; **Show current** reveals a stored value only on explicit click. **Remove** deletes the local override. `workspace.environment` names are available to all local commands; component environment names are passed to that component, and database `connectionEnv` is passed to directly connected components. This applies to services, tests, command tools and CLI help processes launched by OpenBuildRoom. The web demo never accepts a value. Product Chat, the agent guide, `productview.yaml` and the OpenBuildRoom MCP server receive no stored values. The MCP file reader rejects `.env*` and `.productview/` paths. Known exact values are masked in OpenBuildRoom command output and logs, including values split across output chunks. A process can transform or encode a secret before printing it, so review logs before sharing them; a coding agent with broad filesystem access outside OpenBuildRoom is a separate trust boundary.

## Product pages: vision, roadmap and documentation

The optional `product` block in `productview.yaml` points to a Markdown vision, declares a `docsRoot` folder, lists roadmap items, and registers Markdown documentation pages. **Vision**, **North Star**, **Roadmap** and **Documentation** are separate pages. In a local workspace, it can edit the vision and registered documents, create documentation pages, and add or update roadmap entries. North Star defines one outcome metric and records dated values manually. Its historical plot appears below the current value, followed by all recorded entries. The chart and history use observations from `product.northStar`; no automatic measurement source is connected. The web demo simulates changes for the current session only. Existing workspaces without a `product` block can use **Set up Product Hub** to create a vision and getting-started page inside the repository.

Roadmap entries have stable IDs, titles, summaries, statuses (`draft`, `planned`, `in-progress`, `done`) and optional `relatedComponents` IDs. `draft` and `planned` describe intended work, not finished features. The roadmap lives in `productview.yaml`; the vision and documentation live in ordinary repository Markdown files. Editors should review and commit these files with the code. `workspace.startPage` accepts `vision`, `north-star`, `roadmap` or `docs`; legacy `product` opens Vision.

The Documentation page uses the same folder tree and reader layout as Requirements. It scans every Markdown file recursively below `product.docsRoot`, including files that are not listed in `product.documentation`. The YAML entries add stable IDs, titles and summaries for selected documents; all documentation files must stay below `docsRoot`. Select a file to preview it, use **Edit Markdown** to change a `.md` file, or **New document** to add one. When the folder is missing or empty, the page explains the state and offers **Create first document**; creating it also creates the folder. The local MCP `get_product_context` exposes discovered Markdown files from this folder and local backlog issues.

The optional `product.northStar` has a metric `name`, a clear counting `description`, `unit`, `cadence` (`daily`, `weekly`, or `monthly`), optional numeric `target`, and dated numeric `measurements` with optional notes. The dedicated North Star page shows the latest value, a historical plot and the full list of entries. Measurements are entered or corrected manually in the desktop app and saved in the repository YAML. A target is a goal, not a measurement; the chart stays empty until an observed value is recorded. Vision uses the same Markdown editing pattern as Documentation: **Edit Markdown** is inside the document header, with Cancel and Save in the editor. macOS Dictation remains available through the system keyboard shortcut while the editor is focused; OpenBuildRoom does not record or transcribe audio itself.

## Local backlog

**Backlog** works without GitHub or Linear. Its default repository folder is `backlog/`; optional `product.backlogRoot` selects another folder. OpenBuildRoom creates the folder when the first issue is saved. Each issue is one Markdown file with YAML frontmatter: stable `id`, `title`, `status`, `priority`, `type`, dates, and an optional `spec` link. The Markdown body holds the problem, outcome and acceptance criteria. The page has Inbox, Planned, In progress and Done lanes and can create or edit issues. Changing status updates frontmatter without moving the file. Review and commit the issue files with the project.

A typical issue file is `backlog/pv-001-improve-onboarding.md`:

```markdown
---
id: PV-001
title: Improve onboarding
status: inbox
priority: medium
type: feature
created: 2026-11-04
updated: 2026-11-04
spec: specs/onboarding/spec.md
---

Explain the user problem and acceptance criteria here.
```

Link an issue to `specs/<feature>/spec.md` when it becomes a Spec Kit feature. External issue source components are optional metadata; live GitHub or Linear synchronization is not implemented. The web demo keeps backlog edits in the current session.

## Spec Kit and other specifications

Spec Kit is one way to keep requirements and implementation plans in Markdown. Set `views.specifications.roots` to one or more repository subfolders, such as `[specs]`. The **Requirements** page scans those folders recursively, shows the complete file tree, supports path search, and previews text files. Markdown has a reading view and an exact source view. Refresh after adding files outside OpenBuildRoom. Binary files appear in the tree without a text preview. In the desktop app the files are read from the selected repository; the web demo uses a packaged snapshot. Existing `specification` components remain valid for references but are hidden from the runtime Project Map. OpenBuildRoom is the operational view of the repository; it does not replace the specification workflow.

For a Spec Kit layout, Requirements also detects `.specify/memory/constitution.md`, the active directory recorded in `.specify/feature.json`, and each `<root>/<feature>/spec.md`. Feature cards show available plan/research/data-model/quickstart/tasks artifacts, FR and SC IDs, clarification markers, checklist counts, and `T001`-style task checkbox progress. These are observations of files, not a claim that a feature is deployed. A flat `specs/` folder remains a normal file browser and is not mislabeled as Spec Kit.

Connect a feature to actual OpenBuildRoom components with `views.specifications.links`, without adding a map card for every feature. The same read-only feature model is available to agents through the `get_spec_kit` MCP tool:

```yaml
views:
  specifications:
    roots: [specs]
    links:
      - spec: specs/001-auth/spec.md
        requirements: [FR-001, FR-002]
        components: [api]
        tests: [api-tests]
```

Component and test IDs must exist in `components`; test IDs must be `testSuite` items. The desktop view compares linked test suites with recorded OpenBuildRoom runs, identifies never-run, failed and older-than-spec results, and shows whether linked services are running in this OpenBuildRoom session. It also reports linked requirement IDs missing from `spec.md` and missing relative executables. A recorded passing test is evidence about that test command, not automatic proof that every linked requirement passes. Stopped manual services are observed state, not necessarily defects. Start commands, credentials, live health and external test evidence still need separate configuration or adapters.

## Components and configuration

| `kind` | Main fields | Current app behavior |
| --- | --- | --- |
| `service` | `runtime.command`, `cwd`, `startup: manual`, optional `port`, `url`, `health` | Map card, inspector, manual Start/Stop, output log |
| `testSuite` | `tests.command`, `cwd`, optional `categories`, `cases` | Expandable suite with manual suite and individual runs, exit result and output log |
| `commandTool` | `runtime.command`, `cwd`; `cli.mode`, `protocol`, `usage`, optional `source`, `helpCommand`, commands, options, examples, environment | CLI Explorer reference, manual Start/Stop or Run, on-demand help, live and saved output |
| `specification` | `path` | Legacy linkable document, visible in Requirements rather than the runtime map |
| `database` | `data.engine`, `connectionEnv` for PostgreSQL/MySQL/MariaDB or `path` for SQLite | Manual read-only structure inspection and limited row preview |
| `storage` | `data.path` | Local file tree and small text/JSON preview |
| `issues` | `integration.provider`, `repository` for GitHub or `teamId` for Linear, optional HTTPS `url` | Source card and editable project location; live GitHub/Linear sync is planned |
| `external` | `url` | External dependency card |

Each component needs a stable unique `id`, a display `name`, and `position: {x, y}`. `position.x` is a percentage from 0 to 100, and `position.y` is a nonnegative pixel value. The runtime map shows services, databases, storage and persistent CLI servers; it omits specs, tests, issues, external links and one-off CLI tasks. Only `connections` between visible runtime resources appear there, with labels such as `calls`, `stores` and `reads-writes`. Hidden entries remain in YAML and their own views. The current model does not discover or control Docker Compose containers as first-class runtime nodes; a Compose service must not be conflated with a local source runner. The JSON schema is `schemas/productview.schema.json`; validate with `npm run validate:config` in this source checkout.

### Data source mini viewer

**Run & Verify → Data Sources** uses the `database`, `storage`, and `external` components in `productview.yaml`. It recognizes engine names containing PostgreSQL, MySQL, MariaDB or SQLite. PostgreSQL and MySQL/MariaDB use the named local Environment value as a connection URL; SQLite uses a relative `data.path` to an existing database file. A `storage` component uses a relative folder or file path. **Add data source** opens a repository-backed dialog when automatic detection missed a source. **Remove** deletes only its YAML entry, map connections and related Spec Kit or roadmap references; it does not delete project data or files. Credentials remain in local Environment storage and are never written to YAML.

Onboarding also scans for local SQLite files, conventional storage folders and PostgreSQL/MySQL/MariaDB images in Compose files. It shows these as **candidates**, not verified or automatically registered components. The coding agent should check the actual project before adding them to YAML.

Click **Inspect source** to connect or list files. Choose a table or file to load its preview; merely opening the page does not connect or read rows. Database queries are generated by OpenBuildRoom, use read-only connections/transactions, and return at most 100 tables, 40 columns and 20 rows. Text files show at most 64 KB, and only paths within the declared storage source can be opened. This is for inspection, not editing or arbitrary SQL. An unavailable database or missing local variable is shown as an error instead of a fabricated preview. Other engines remain metadata-only until an adapter is added.

```yaml
- id: app-db
  kind: database
  name: App database
  position: { x: 36, y: 280 }
  data: { engine: PostgreSQL, connectionEnv: DATABASE_URL }
- id: local-cache
  kind: database
  name: Local cache
  position: { x: 68, y: 280 }
  data: { engine: SQLite, path: data/cache.sqlite }
```

### Individual tests

Open **Tests** and expand a suite to inspect its entries. OpenBuildRoom recognizes test files from a simple npm, pnpm, Yarn or Bun script whose final command is `node ... --test tests/*.test.*`; earlier `&&` commands remain setup steps when running one file. It does not execute the script merely to list files. For `cargo test` suites, click **Discover Rust tests**; this runs Cargo with `--list`, which may compile test binaries but does not run tests. A Rust entry runs with an exact name filter. Both full-suite and individual runs require a manual click, record their actual exit code and offer saved output. A file entry can still contain several tests; running it executes that file.

For other runners, declare individual commands under `tests.cases` instead of showing guessed test names:

```yaml
tests:
  command: [pytest, tests]
  cwd: .
  cases:
    - id: smoke
      name: Smoke checks
      command: [pytest, tests/test_smoke.py]
```

Each case ID must be unique within its suite. Case commands run in the suite working directory with the suite's local environment declarations. Results and command output are written to `.productview/`; review logs before committing them.

**Add component** on the Project Map supports runtime services, databases and storage, with an optional dependency to another visible resource. In the desktop app, this writes a validated `productview.yaml` entry and a `component.created` history event; in the web demo it only changes the current session. Adding a service does not run it. Test suites belong on Tests, specifications on Requirements, issue sources in Project settings, and CLI tasks or servers in CLI Explorer.

Commands are arrays of arguments such as `[npm, run, dev]`. The app runs them without a shell and only after a user clicks Start or Run. Command working directories must stay inside the project. Do not store credentials in YAML; use environment variable names such as `DATABASE_URL`.

## Build identity for executable components

Services, linked CLI tools and explicitly configured local MCP servers can show a verified build time, source commit and optional version. For a service or CLI tool, add `build: {file: dist/build-info.json}` to its component in `productview.yaml`; an MCP entry under `workspace.mcpServers` accepts the same field. The path is relative to the repository root. For a service or CLI tool without `build.file`, OpenBuildRoom checks `build-info.json` and `dist/build-info.json` under its `runtime.cwd`. Use an explicit path if multiple artifacts share that directory.

The build pipeline should write a small JSON file **after a successful build**, for example `{"builtAt":"2026-11-05T11:34:56Z","revision":"aabbccddeeff0011","version":"1.2.3"}`. `builtAt` needs an ISO timestamp with timezone; `revision` is the commit used to produce the artifact. A project may omit `version`. The UI labels current Git HEAD as **source**, artifact revision as **build**, and the actual process time as **Started**. It never converts a file modification or commit time into a build time. Development commands without build metadata show **Build time unavailable** and, once launched, their start time. Build identity is captured at launch, so rebuilding later cannot silently change the label of a running process. Start events also save the snapshot in `.productview/events.jsonl`. MCP Explorer separately shows the protocol-reported server version and connection time.

## CLI Explorer

**CLI Explorer**, available in Run & Verify, now follows MCP Explorer's browse and test layout: a catalog of configured and discovered tools on the left and an interactive inspector on the right. It scans the open repository for likely CLI entry points without running them: package bins, Python project scripts, Cargo binaries, Go commands and executable CLI files. This bounded scan is a list of candidates, not a claim that all commands or parameters are known. **Explore** shows the exact invocation, accepts additional arguments one per line, and runs a bounded local trial only when **Test command** is clicked. Suggestions come from YAML or actual help; the result shows output and exit status. **Read help** explicitly runs `--help`, `-h` or `help` and displays the real output with a parsed synopsis and options where possible. Some programs can have side effects even while printing help. **Add to project YAML** links a discovered candidate as a help-only `commandTool`. **Add CLI tool** registers one missed by discovery using an exact executable and argument list, mode, summary and synopsis. Both paths enable the optional navigation view. **Remove** deletes a configured tool's YAML entry and connected references while leaving its executable and saved logs in place. The app supports multiple tools without a fixed map slot limit. Linked tools retain the manpage, manual Start/Stop or Run controls, and current or saved output. The web preview does not run commands. See `docs/product/command-tools.md` for the configuration contract.

## Workspaces

Use the project avatar or the Workspaces button to open an existing folder with `productview.yaml`, search a selected parent folder for workspaces, or create a new workspace in a chosen folder. Auto-detection checks `package.json` scripts and a few common specification paths. The blank option creates a minimal product specification. The workspace registry is local to OpenBuildRoom; each project's YAML remains in its own repository.

For an existing folder without a valid YAML, **Open existing workspace** now opens a read-only agent setup dialog. **Set up with Codex or Claude Code** opens the same dialog for any chosen folder. It lists candidate specification/documentation folders, Compose files, package scripts and CLI entry points, exports the bundled agent guide and JSON schema to the app's local data folder, and copies a project-specific prompt for the user's coding agent. OpenBuildRoom does not invoke or authenticate an LLM. While the dialog is open, it checks for `productview.yaml` every three seconds, shows validation errors or the components and connections, and only opens the map after the user clicks **Open project map**. The initial scan and dialog do not write into the chosen repository; the coding agent writes the YAML when the user gives it the copied task. The old auto-detect and blank-template actions remain available.

## Project history

The desktop app writes `.productview/events.jsonl` and `.productview/logs/` inside the selected project folder. Events include workspace opens, observed file changes, process starts and exits, test runs, chat prompts and replies with provider and mode, MCP agent connections, and MCP tool calls. Logs contain output from project commands. These files can be committed with the project so teammates can inspect past work. Review them for sensitive data before committing; project output and chat text may contain secrets. OpenBuildRoom does not make Git commits automatically.

## Agent Access and MCP

The exportable agent skill is `agent/openbuildroom/SKILL.md`. **Settings → Agent Access** displays the exact skill text, product context, JSON schema, current project YAML, and a launch configuration for the local read-only MCP server. The server exposes `get_product_view`, `get_product_context`, `list_components`, `read_project_file`, and `get_product_history`. `get_product_context` returns the vision, roadmap, and Markdown documentation discovered below `product.docsRoot`. It records connections, disconnects and tool calls in the project's history. Agents use their normal repository tools to edit code and YAML; the MCP server itself does not run commands or write project code.

The server uses a local stdio connection and the MCP 2025-11-25 handshake. If a newer client probes a newer protocol first, it can fall back to this supported revision. The MCP command shown in Agent Access uses the installed Electron binary in Node mode and points to the current workspace. The prototype does not provide network-hosted MCP access.

## Desktop build

The first-run **Try working example** action copies `examples/hello-workspace` to `~/Documents/OpenBuildRoom Examples/hello-workspace` and opens it. The copied project is independent of the installed app and remains editable. It includes a real Node.js service, two route tests, local JSON storage and standard Spec Kit artifacts. Node.js 20+ is required to run its service and tests. The existing Blackbox Agent B packaged demo remains clearly labeled as a simulation.

Run `npm ci` and `npm start` for development. On Apple Silicon macOS, `npm run package:mac:app` builds the desktop app in `outputs/openbuildroom-desktop` relative to this workspace. `npm run package:mac` also makes a DMG when disk-image creation is available. The preview is unsigned and not notarized. The existing `productview.yaml` filename and MCP tool names remain stable while the public app name changes to OpenBuildRoom Desktop.

Live GitHub/Linear synchronization, true telemetry, database editing and arbitrary SQL are not implemented. The web prototype is a visual simulation. The desktop app can open local workspaces, start configured processes, run tests, inspect supported data sources, record history and chat through a locally installed coding agent.
