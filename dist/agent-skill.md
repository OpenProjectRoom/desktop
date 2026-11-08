---
name: project-room
description: Use when building a software project with Project Room so its map, executable components, tests, and history remain inspectable.
---

# Project Room agent contract

The desktop app's Settings → AI & Chat can connect an installed Codex CLI or Claude Code. That personal selection and its inspect/edit mode are kept outside the repository. A local chat session receives this workspace's read-only Project Room MCP server in addition to the coding agent's own tools. Do not put provider credentials or local environment values in `.projectroom/project.yaml` or chat prompts.

Project Room is a local desktop workspace for a software repository. Its Git-tracked configuration is `.projectroom/project.yaml` under the repository root. The dot folder keeps it out of the ordinary Finder view; it is still visible to Git and coding agents. Read the configuration, `PROJECT_ROOM.md` (if present), the product vision, roadmap and relevant documentation before changing architecture or behavior. Set `views.specifications.roots` to folders containing Spec Kit or other specifications. Backlog shows Spec Kit features, bugs and idea assessments beside local work; Files can browse the original source tree. A `specification` component remains valid for links but does not appear on the runtime map.

## First setup: two entry paths

- **New project:** Ask the product owner who the app is for, what problem it solves, and what the first useful release must do. Set up Git and the official GitHub Spec Kit workflow. Keep the constitution, feature specs, plans and tasks in Spec Kit's standard files. Create `.projectroom/project.yaml` alongside the evolving app only when there is real repository evidence for its entries.
- **Existing repository:** Work in the folder the user opened in their coding agent. Start with a read-only inspection of its code, scripts, docs, specifications, tests, runtime configuration, data sources, API and tool definitions. Determine whether GitHub Spec Kit is actually present. Before changing files, briefly summarize what you found, what Project Room could show, and what is uncertain. Ask at most three questions about decisions you cannot safely infer, then wait for the user's answer before creating or updating `.projectroom/project.yaml`. If no question is needed, still wait for the user's go-ahead after the summary. Preserve existing files and structure. If Spec Kit is absent, do not install or scaffold it, create empty specs, or invent requirement links; it can be adopted later as a separate decision. After the user replies, create or improve `.projectroom/project.yaml` from verified findings only. Do not create a parallel specification tree or fabricate missing capabilities to fill a page.

### Source audit for an existing repository

Treat Project Room's file inventory as clues, not a complete capability scan. First locate the repository's real entry points and follow their call paths. For every row below, inspect source and configuration, then make a second pass through likely wrappers and tests before reporting **not found**. A missing manifest or client config is never proof that a capability is absent.

Choose and name one concrete launch profile before proposing URLs or commands (for example source development, a published binary, or Docker Compose). Ports, data paths and available subprocesses can differ between profiles. Do not combine a Docker port with a source-run command, or treat an external service in a client configuration as a service owned by this repository.

| Capability to check | Source evidence to follow | Project Room destination |
| --- | --- | --- |
| Product and files | README, agent instructions, Spec Kit constitution/features/tasks, vision, roadmap, docs, backlog and source roots | Files, Backlog, Vision, Roadmap, Documentation |
| Services and topology | Package scripts, executable wrappers, Compose, process entry points, ports, health checks, runtime prerequisites, dependencies, real start/status/stop behavior | Overview, Project Map, Services, Environment |
| HTTP APIs | Route registration and handlers, generated or checked-in OpenAPI, actual listen address and auth middleware | API Explorer; link an existing OpenAPI file when available |
| MCP servers | Server SDK initialization, tool/resource/prompt registration, `stdio` CLI branches, Streamable HTTP routes or legacy SSE endpoints, credential scope | MCP Explorer; distinguish server from client, SDK dependency or documentation mention |
| CLI tools | Package bins, Python entry points, Cargo/Go commands, shell wrappers, subcommands, flags, help and one-shot versus persistent behavior | CLI Explorer and, for persistent tools, Project Map |
| Tests | Runner configuration, suite commands, test files, named cases and setup steps | Test Explorer and verified Spec Kit links |
| Data and local settings | Database clients, migrations, schemas, storage paths, connection variable names and safe read access | Data Explorer and Environment |
| Runtime evidence | Build metadata, service output, metrics collectors and existing test results | Build identity, Services, Overview and Activity; do not infer live evidence from source |

In particular, a local MCP server can be exposed only through a command such as `./project mcp` without `.mcp.json` or `workspace.mcpServers`. Trace that command through any shell or Python wrapper to the server process; record its transport, working directory, environment variable **names**, and whether it needs a separate read-only or revocable key. Never substitute an owner or admin key. For HTTP APIs without OpenAPI, identify real routes and authentication but do not invent a schema. For every verified finding, cite the file and function/branch that proves it. Use **verified in source**, **candidate/uncertain**, **not found after source audit**, or **unsupported by Project Room**; none of those means the runtime was tested. Do not read secret values or execute discovered commands during this audit.

Look for MCP launch instructions generated by application routes or setup screens and for code that installs entries into external client configuration. These are source evidence even when no MCP configuration file is checked in. Distinguish the actual server from a local bridge or proxy to an HTTP server; do not register both as independent capabilities merely because both speak MCP. For every detached or mixed launcher, trace what its stop signal actually terminates and inspect the status command's exit codes. A status command that prints "stopped" but exits 0 cannot be used directly as Project Room's detached `statusCommand`. A foreground observer around a detached stack is not a truthful Start/Stop integration if Stop leaves the stack running. Passing schema validation does not establish these runtime semantics.

Classify every MCP hit as **project server**, **bridge to that server**, **external client dependency**, or **unconfirmed**. Follow route/controller registration, authentication middleware and transport selection in source before recording a URL or launch command. A repository can contain both external MCP client entries and its own server. For HTTP APIs, record REST and GraphQL separately; Project Room's API Explorer consumes a project-local OpenAPI 3.x file or loads an OpenAPI document from a verified path on the configured API after a user click. It does not turn a GraphQL schema into an operation list. If the app generates OpenAPI only at a running endpoint, record that path as `specPath` rather than pretending it is a checked-in file. For data sources, distinguish an embedded database file, a local container, and a remote dependency; require a verified accessible path or safe connection mechanism before configuring Data Explorer.

The first-phase report must cover every capability row, even when nothing was found. For each finding provide **evidence → proposed Project Room entry → what still needs a manual check**. Include a short reconciliation of existing `.projectroom/project.yaml` entries against the source: missing capabilities, stale entries and duplicate registrations. In phase two, configure only verified entries and explain intentional omissions. Ask the user before resolving a product or credential choice that source evidence cannot decide.

For each service or command tool, follow its actual start command through shell scripts, package scripts, host CLIs and Compose files. If that launch path requires a working Docker Engine, add `runtime.requires: [docker]` even when `runtime.command` only names a wrapper such as `./blackbox up`. Cite the source that invokes Docker in the first-phase report. A Compose file elsewhere in the repository is not by itself proof that this particular command uses Docker. If the launch chain is unclear, flag it for review rather than guessing. An omitted `requires` list means no prerequisite was verified; it does not prove the command is Docker-free. Project Room checks declared prerequisites on each manual Start and never starts Docker or the service automatically.

For either path, keep secrets out of YAML and prompts, make service startup manual, and validate the YAML against the [Project Room schema](https://github.com/OpenProjectRoom/desktop/blob/main/schemas/projectroom.schema.json) plus the repository paths it references. Discovery and configuration do not prove that a service, database, API or tool runs. Do not start services, invoke MCP tools, send API requests or commit automatically just to configure Project Room unless the user separately asks for it. If the user asked you to build the app, run relevant implementation tests and report their results separately from Project Room's configured inventory.

End with a short, actionable handoff: **(1)** If Project Room is not installed, give the [free Mac download](https://github.com/OpenProjectRoom/desktop/releases/latest/download/Project-Room-Desktop-arm64-mac.zip) and say to unzip it, move Project Room.app to Applications, and launch it. **(2)** Name the exact local repository folder to open in Project Room; if it is already open, say to refresh analysis. **(3)** Summarize what was configured, its evidence, and anything missing or uncertain. **(4)** Tell the user to inspect Onboarding and Project Map, then manually verify the first configured service, test, and data source. Opening a folder does not start these commands or connect data sources automatically.

## What the app understands

`.projectroom/project.yaml` uses `schemaVersion: 1`. A `project` has a stable lowercase-hyphen `id` and a human name. Each item in `components` has a unique `id`, a `kind`, a display `name`, and `position: {x, y}`. Connections use existing component IDs in `from` and `to` and a meaningful `label`.

The Project Map shows only runtime resources: `service`, `database`, `storage`, and `commandTool` entries with `cli.mode: server`. One-off CLI tasks, specifications, test suites, issue sources and external links remain available in their respective pages but are not map nodes. Only dependencies between visible runtime resources are drawn. A foreground service's Stopped status covers processes launched by Project Room; it does not establish whether a Docker Compose container is running. For a detached stack, use `runtime.lifecycle: detached` only when the repository provides verified start, status and stop commands. The status command must return exit 0 when running, exit 1 when stopped, and exit 2 or higher on error. Project Room runs status after explicit Start, Stop or Check status, then polls a confirmed running service while the app is open. It does not run project status commands automatically when opening a folder. Do not represent a Compose stack with an observer whose Stop leaves the stack running.

| Kind | Main fields | Rendered behavior |
| --- | --- | --- |
| `service` | `runtime.command` argument array, `runtime.cwd`, `runtime.startup: manual`, optional `requires: [docker]`, `port`, `url`, `health`; detached services also need `lifecycle: detached`, `statusCommand`, `stopCommand` | Card, inspector, manual Start/Stop, prerequisite check, process log or checked detached state |
| `testSuite` | `tests.command`, `tests.cwd`, optional `categories`, `cases` | Expandable suite; manual full or individual Run, recorded exit result and log |
| `commandTool` | `runtime.command` and `cwd`, optional `requires: [docker]`; `cli.mode` (`server` or `task`), `cli.protocol` (`stdio`, `http` or `other`), required `summary`, `usage`, optional `source`, `description`, `helpCommand`, `commands`, `options`, `examples`, `environment` | CLI Explorer, available in Run & Verify, checks prerequisites before manual Start or Run, renders a manpage, manual controls, on-demand real help and current/saved output |
| `specification` | `path` to a project file | Legacy linkable document; linkable from Backlog, not the runtime map |
| `database` | `data.engine`; `data.connectionEnv` for PostgreSQL/MySQL/MariaDB or `data.path` for SQLite | On-demand, read-only table/column inspection and 20-row preview |
| `storage` | `data.path` | On-demand local file tree and text/JSON preview |
| `issues` | `integration.provider`; `repository: owner/repository` for GitHub or `teamId` for Linear; optional HTTPS `url` | Issue source card and editable location in Project connections; live GitHub/Linear sync is not implemented yet |
| `external` | `url` | External dependency card |

## Build identity

For a service or CLI tool that produces an artifact, add `build.file` pointing to a JSON file inside the repository, for example `build: {file: dist/build-info.json}`. A local MCP server in `workspace.mcpServers` may use the same field. The file has `builtAt` (ISO timestamp with timezone), `revision` (the Git commit used for this build), and optionally `version`. Write it **after a successful build**, from the build pipeline, not when the app starts. Do not edit the timestamp or version manually on each release. A dedicated build file per artifact avoids assigning one component's build to another. If `build.file` is absent, Project Room also checks `build-info.json` and `dist/build-info.json` inside each service or CLI tool's `runtime.cwd`; use this convention only when that directory contains one artifact.

Project Room shows the build time only when such a file supplies it. The current checkout's Git HEAD is labeled **source**, never **build**. The process start time is labeled **Started** and stored separately. A build identity is captured when Start is clicked, so rebuilding files later does not change the identity shown for an already launched process. MCP's protocol version is labeled **server version**, not an artifact build date. Development commands without an artifact show “Build time unavailable” plus the observed start time. Never infer a build from file modification time or commit time.

On the Test Explorer page, a simple Node `--test` script can expose its real test files; Project Room preserves preceding `&&` setup commands for a single-file run. `cargo test` names are discovered only after the user clicks **Discover Rust tests**, because Cargo may compile test binaries. For another runner, add `tests.cases: [{id, name, command}]` with real argument arrays for independently runnable entries. Do not invent cases or claim a file-level run checks only one assertion. Project Room saves individual run results and logs in `.productview/`.

For a PostgreSQL or MySQL/MariaDB database, declare only the environment **name** in `data.connectionEnv`; each developer keeps the connection URL in the ignored project `.env`, editable under Environment. For SQLite, declare `data.path` to an existing file inside the repository. A `storage` component declares a relative folder or file in `data.path`. Data Explorer only inspects these sources after the user clicks and returns limited, read-only previews. Do not place connection strings or sampled records in YAML, specs, prompts or agent responses.

The optional `workspace` block controls the start page, freeform layout, chat context, shared optional navigation, and environment variable names. Set `workspace.startPage` to `overview` for the summary dashboard or `map` for the connected architecture map. Vision, Roadmap, North Star and CLI Explorer are hidden by default. To show them in the sidebar and Open menu, list their exact page IDs in `workspace.additionalViews`, for example `additionalViews: [vision, roadmap]`. The other IDs are `north-star` and `commands`; `[]` or an omitted field hides all four. The desktop Settings → Preferences → Additional views switches update this same YAML field. If `startPage` names one of these pages, include it in `additionalViews`. Enable product views when corresponding real content exists or is created with the product owner's direction: `product.vision`, `product.roadmap`, or `product.northStar`. CLI Explorer may be enabled to discover real command candidates before a `commandTool` is linked; linking one automatically enables it. Never invent contents merely to fill a page. The optional `views` block describes `specifications.roots`, file roots, metric sources, and the timeline. Specification roots are repository subfolders, for example `views.specifications.roots: [specs]`; feature files below them are available through Backlog and the repository file browser. The current app only runs commands after a user clicks Start or Run. Do not describe configured databases, issue integrations, or metrics as live merely because they appear on the map.

Declare required environment variable **names** in `workspace.environment` (`[{name, description}]`), `runtime.environment` for services or command tools, `tests.environment`, `cli.environment`, or `data.connectionEnv`. Project Room combines these names on **Run & Verify → Environment**. The user enters values there; the app reads and edits the ignored project `.env` and injects them into local commands started from the desktop app. `workspace.environment` applies to all launched components; a component list applies only to that component, and a database `connectionEnv` applies to directly connected components. Never put environment values, example secrets, `.env` contents, or credentials in YAML, prompts, MCP responses, Markdown, or commits. The Project Room MCP server does not expose the local value store. If a name already appears in a component field, do not duplicate it in `workspace.environment` unless it is intentionally shared across all commands. Do not claim a variable is set because its name appears in YAML.

If the repository uses GitHub Spec Kit, keep its `.specify/` and `specs/<feature>/` artifacts as the source of truth. Project Room discovers the constitution, active feature state, `spec.md`, plan, tasks, checklists, FR/SC IDs and task checkbox progress. It does not infer release status from a branch or from artifact presence. To connect a feature to running code and test evidence, use `views.specifications.links`:

```yaml
views:
  specifications:
    roots: [specs]
    links:
      - spec: specs/001-auth/spec.md
        requirements: [FR-001]
        components: [api]
        tests: [api-tests]
```

Use only IDs that exist in `components`; `tests` must refer to `testSuite` components. Link an FR ID only when the named test suite actually exercises it. Project Room shows the most recent recorded run and whether the spec changed since then; it does not establish full coverage automatically. For a non-Spec-Kit repository, keep the existing spec files and omit feature links until the mapping is verified. Product Backlog issues are product-level requests; `tasks.md` lists implementation work within a Spec Kit feature.

The optional `product` block defines `vision` (a Markdown file path), `docsRoot` (the documentation folder), `roadmap` and `documentation`. Each roadmap entry has a stable `id`, `title`, `status` (`draft`, `planned`, `in-progress`, `done`), optional `summary`, and optional `relatedComponents` using component IDs. Documentation scans all Markdown files recursively under `docsRoot`, in its own folder browser. Keep every product documentation file in this folder. A `documentation` entry can add a stable `id`, `title`, `path` under `docsRoot`, and optional `summary`; the folder browser also sees files without an entry. Set `workspace.startPage` to `vision`, `north-star`, `roadmap` or `docs`; legacy `product` opens Vision. Treat draft and planned entries as product intent; do not claim they are already implemented.

The Backlog page reads Markdown issues from `product.backlogRoot`, or `backlog/` by default. One issue lives in one `.md` file. YAML frontmatter needs a stable `PV-001` style `id`, `title`, `status` (`inbox`, `planned`, `in-progress`, `done`), `priority` (`low`, `medium`, `high`), and `type` (`feature`, `bug`, `task`, `idea`). `created`, `updated`, and `spec` are optional; the Markdown body contains details and acceptance criteria. Keep filenames and IDs stable when status changes. Link `spec` to `specs/<feature>/spec.md`, `.specify/bugs/<slug>/assessment.md` or `.specify/assessments/<slug>/intake.md` when the local item and Spec Kit artifact describe the same work. Do not copy the artifact into the backlog. The local backlog works without external issue services.

For example, `backlog/pv-001-improve-onboarding.md` can contain:

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

Describe the problem and acceptance criteria here.
```

`product.northStar` optionally defines one outcome metric on its own North Star page: `name`, `description`, `unit`, `cadence` (`daily`, `weekly`, or `monthly`), optional numeric `target`, and `measurements` with ISO dates, numeric values, and optional notes. Project Room charts these manually entered observations below the current value and exposes them in `get_product_context`. Keep dates unique and do not treat a target or an empty chart as an observed result. These fields are saved in `.projectroom/project.yaml` so the definition and measurement history can be reviewed and committed.

```yaml
product:
  northStar:
    name: Weekly active teams
    description: Teams completing a meaningful product workflow in the last seven days.
    unit: teams
    cadence: weekly
    target: 100
    measurements:
      - { date: '2026-11-04', value: 12, note: Manually counted baseline }
```

The example is a fragment of the optional `product` block; a complete product block also needs `vision`, `docsRoot`, `roadmap`, and `documentation`.

## Agent workflow

1. If `.projectroom/project.yaml` exists, inspect it, read `product.vision`, the roadmap, local backlog issues, and relevant Markdown files under `product.docsRoot`. Preserve stable IDs in any `product.documentation` entries. For first setup without YAML, inspect the repository's actual specs, docs, runtime and tests before creating a small truthful configuration. Do not create duplicate spec or documentation trees.
2. Add or update components when code introduces a service, command tool, test suite, data store, or issue source. Keep Spec Kit files in their original folders and connect features through `views.specifications.links`. Add map connections for actual runtime dependencies, such as API → database; avoid `defines` and `checks` edges in new maps. Use `position.x` from 0 to 100 and a nonnegative `position.y`; the map grows vertically. The desktop app's Data Explorer and CLI Explorer pages can add missing components through validated dialogs. Removing one there also removes its map connections and references from Spec Kit links and roadmap items, but never deletes data files or executables.
3. Keep command arguments as an array, for example `[npm, run, dev]`, and set `startup: manual`. The working directory must be inside the repository.
   Add a `commandTool` only when the project exposes a real CLI. CLI Explorer discovers likely local entry points from package bins, Python scripts, Cargo and Go binaries, and executable files without running them. These are candidates, not proof of a complete manual. The user may explicitly read help and link one into YAML as a help-only task; `cli.source` records its repository file. Put an actual operational command in `runtime.command` only after checking its behavior. Document the real synopsis, commands, options, examples and variable names in `cli`; Project Room renders these fields as a manpage-style manual. If the executable supports help, set `cli.helpCommand` to an explicit argument array such as `[node, scripts/tool.cjs, --help]`. Project Room runs it only on a user's click and displays its output separately from the authored manual. Set `cli.mode: task` for a one-off command or `server` for a persistent process. See `docs/product/command-tools.md` for the configuration template.
4. Keep secrets out of YAML. Put only environment variable **names**, such as `DATABASE_URL`, in `connectionEnv`, `workspace.environment`, or a component environment list. Tell the user to set missing values in the desktop Environment page; never request their values through the agent chat.
   For issue sources, record the public repository or team identifier in YAML. Never put API keys, OAuth tokens, or private credentials in `integration` fields. Configured means described, not connected.
5. Validate with `npm run validate:config` in a Project Room source checkout, or against `schemas/projectroom.schema.json` if that schema is copied into the project.
6. Update roadmap status and documentation when delivered behavior changes. Commit `.projectroom/project.yaml`, the vision, documentation and relevant specs with the project. Project Room records events in `.productview/events.jsonl` and command output in `.productview/logs/`; review those files for private data before committing.

## HTTP API Explorer

Register verified HTTP APIs under `workspace.apiSources` when the project exposes them. Each item needs a stable `id`, `name`, and clean `baseUrl` (HTTPS or local HTTP). An optional `spec` points to an existing project-relative OpenAPI 3.x document, ideally under a Spec Kit feature's `contracts/` directory. For an API that serves OpenAPI dynamically, use `specPath` such as `/open-api/core` on the same API origin **instead of** `spec`; the desktop app loads it only when the user clicks **Load OpenAPI**, without redirects or authentication headers. Use a project-local file if that endpoint requires credentials. The explorer discovers matching local OpenAPI files without sending requests and shows their operations. A user can also enter an endpoint path manually when no spec exists. Authentication can be none, a Bearer variable (`authEnv` or `auth.type: bearer`), a header/query API key, or public-client OAuth with authorization code and PKCE; values stay in local Environment or secure OS storage, outside YAML and prompts. The user explicitly clicks **Send** to make a request. Do not claim that discovery proves the API is running, and do not send requests during onboarding. The explorer shows status, timing and response body. It does not send multipart uploads, use cookies, Basic auth, mTLS or client-secret OAuth, and it is not a full Postman collection importer.

```yaml
workspace:
  apiSources:
    - id: orders-api
      name: Orders API
      baseUrl: http://127.0.0.1:4000
      spec: specs/001-orders/contracts/openapi.yaml
      authEnv: ORDERS_API_TOKEN
```

## MCP access

**MCP Explorer** in Run & Verify discovers project MCP servers from `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `mcp.json` and `workspace.mcpServers` without launching them. This automatic file inventory does not inspect source code. During onboarding, also perform the source audit above and register a verified server in `workspace.mcpServers` when it exists only in code or behind a CLI subcommand. The user can add several independent YAML registrations or link a server found in a client config through the explorer. A linked entry uses `linkedFrom: .mcp.json:server-name` (or another discovered source ID) to record provenance; do not add another YAML copy of the same discovered source. An entry needs stable `id` and `name` plus `command` with optional `args`/`cwd` for `transport: stdio`, or `url` for `transport: http` or `sse`. Use `environment: [NAME]` for local command variables and `authEnv: NAME` for a remote Bearer token. Names appear in Environment; values stay in the ignored project `.env`. Do not put tokens in URLs, arguments, YAML or prompts. The user connects explicitly; multiple servers can remain connected while the user inspects their tools, resources, templates and prompts. Removing a YAML registration does not delete its source config or executable. Remote MCP OAuth sign-in is available when the server supports the app callback and public-client flow; keep tokens in secure local storage, never in YAML.

The local read-only MCP server exposes `get_product_view`, `get_product_context`, `get_spec_kit`, `list_components`, `read_project_file`, and `get_product_history`. `get_spec_kit` returns detected feature artifacts, link mappings, and recorded Project Room test evidence; this separate MCP process cannot observe the desktop app's current process state. `get_product_context` includes the vision text, North Star definition and manual measurements, roadmap entries, local backlog issues and Markdown documentation discovered under `product.docsRoot`. The desktop app's **Settings → Agent Access** tab shows the exact launch configuration for the current workspace. Each MCP connection and tool call appears in Activity. Use ordinary repository editing tools to change files; the MCP endpoint does not write project code or run commands.

## Minimal configuration

```yaml
schemaVersion: 1
project: { id: my-product, name: My Product }
components:
  - id: spec
    kind: specification
    name: Product Spec
    position: { x: 8, y: 80 }
    path: README.md
connections: []
```
