---
name: openbuildroom
description: Use when building a software project with OpenBuildRoom Desktop so its map, executable components, tests, and history remain inspectable.
---

# OpenBuildRoom agent contract

The desktop app's Settings → AI & Chat can connect an installed Codex CLI or Claude Code. That personal selection and its inspect/edit mode are kept outside the repository. A local chat session receives this workspace's read-only OpenBuildRoom MCP server in addition to the coding agent's own tools. Do not put provider credentials or local environment values in `productview.yaml` or chat prompts.

OpenBuildRoom is a local desktop workspace for a software repository. It renders the repository's `productview.yaml` as a runtime Project Map and separate product pages. Read that file, `OPENBUILDROOM.md` (if present), the product vision, roadmap and relevant documentation before changing architecture or behavior. Set `views.specifications.roots` to folders containing Spec Kit or other specifications. The Requirements page discovers their files recursively. Keep specification documents there; a legacy `specification` component remains valid for links but does not appear on the runtime map.

## What the app understands

`productview.yaml` uses `schemaVersion: 1`. A `project` has a stable lowercase-hyphen `id` and a human name. Each item in `components` has a unique `id`, a `kind`, a display `name`, and `position: {x, y}`. Connections use existing component IDs in `from` and `to` and a meaningful `label`.

The Project Map shows only runtime resources: `service`, `database`, `storage`, and `commandTool` entries with `cli.mode: server`. One-off CLI tasks, specifications, test suites, issue sources and external links remain available in their respective pages but are not map nodes. Only dependencies between visible runtime resources are drawn. A service's Stopped status covers processes launched by OpenBuildRoom; it does not establish whether a Docker Compose container is running. The current schema has no first-class Compose container definition or Docker lifecycle control. Do not represent a Compose container with an unrelated source-development command or claim it is monitored.

| Kind | Main fields | Rendered behavior |
| --- | --- | --- |
| `service` | `runtime.command` argument array, `runtime.cwd`, `runtime.startup: manual`, optional `port`, `url`, `health` | Card, inspector, manual Start/Stop, process log |
| `testSuite` | `tests.command`, `tests.cwd`, optional `categories`, `cases` | Expandable suite; manual full or individual Run, recorded exit result and log |
| `commandTool` | `runtime.command` and `cwd`; `cli.mode` (`server` or `task`), `cli.protocol` (`stdio`, `http` or `other`), required `summary`, `usage`, optional `source`, `description`, `helpCommand`, `commands`, `options`, `examples`, `environment` | CLI Explorer, available in Run & Verify, renders a manpage, manual controls, on-demand real help and current/saved output |
| `specification` | `path` to a project file | Legacy linkable document; visible in Requirements, not the runtime map |
| `database` | `data.engine`; `data.connectionEnv` for PostgreSQL/MySQL/MariaDB or `data.path` for SQLite | On-demand, read-only table/column inspection and 20-row preview |
| `storage` | `data.path` | On-demand local file tree and text/JSON preview |
| `issues` | `integration.provider`; `repository: owner/repository` for GitHub or `teamId` for Linear; optional HTTPS `url` | Issue source card and editable location in Project connections; live GitHub/Linear sync is not implemented yet |
| `external` | `url` | External dependency card |

On the Tests page, a simple Node `--test` script can expose its real test files; OpenBuildRoom preserves preceding `&&` setup commands for a single-file run. `cargo test` names are discovered only after the user clicks **Discover Rust tests**, because Cargo may compile test binaries. For another runner, add `tests.cases: [{id, name, command}]` with real argument arrays for independently runnable entries. Do not invent cases or claim a file-level run checks only one assertion. OpenBuildRoom saves individual run results and logs in `.productview/`.

For a PostgreSQL or MySQL/MariaDB database, declare only the environment **name** in `data.connectionEnv`; each developer stores the connection URL locally under Environment. For SQLite, declare `data.path` to an existing file inside the repository. A `storage` component declares a relative folder or file in `data.path`. Data Sources only inspects these sources after the user clicks and returns limited, read-only previews. Do not place connection strings or sampled records in YAML, specs, prompts or agent responses.

The optional `workspace` block controls the start page, freeform layout, chat context, shared optional navigation, and environment variable names. Set `workspace.startPage` to `overview` for the summary dashboard or `map` for the connected architecture map. Vision, Roadmap, North Star and CLI Explorer are hidden by default. To show them in the sidebar and Open menu, list their exact page IDs in `workspace.additionalViews`, for example `additionalViews: [vision, roadmap]`. The other IDs are `north-star` and `commands`; `[]` or an omitted field hides all four. The desktop Settings → Preferences → Additional views switches update this same YAML field. If `startPage` names one of these pages, include it in `additionalViews`. Enable product views when corresponding real content exists or is created with the product owner's direction: `product.vision`, `product.roadmap`, or `product.northStar`. CLI Explorer may be enabled to discover real command candidates before a `commandTool` is linked; linking one automatically enables it. Never invent contents merely to fill a page. The optional `views` block describes `specifications.roots`, file roots, metric sources, and the timeline. Specification roots are repository subfolders, for example `views.specifications.roots: [specs]`; every file below them appears in the Requirements tree. The current app only runs commands after a user clicks Start or Run. Do not describe configured databases, issue integrations, or metrics as live merely because they appear on the map.

Declare required environment variable **names** in `workspace.environment` (`[{name, description}]`), `runtime.environment` for services or command tools, `tests.environment`, `cli.environment`, or `data.connectionEnv`. OpenBuildRoom combines these names on **Run & Verify → Environment**. The user enters values there; the app stores them encrypted outside the repository and injects them into local commands started from the desktop app. `workspace.environment` applies to all launched components; a component list applies only to that component, and a database `connectionEnv` applies to directly connected components. Never put environment values, example secrets, `.env` contents, or credentials in YAML, prompts, MCP responses, Markdown, or commits. The OpenBuildRoom MCP server does not expose the local value store. If a name already appears in a component field, do not duplicate it in `workspace.environment` unless it is intentionally shared across all commands. Do not claim a variable is set because its name appears in YAML.

If the repository uses GitHub Spec Kit, keep its `.specify/` and `specs/<feature>/` artifacts as the source of truth. OpenBuildRoom discovers the constitution, active feature state, `spec.md`, plan, tasks, checklists, FR/SC IDs and task checkbox progress. It does not infer release status from a branch or from artifact presence. To connect a feature to running code and test evidence, use `views.specifications.links`:

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

Use only IDs that exist in `components`; `tests` must refer to `testSuite` components. Link an FR ID only when the named test suite actually exercises it. OpenBuildRoom shows the most recent recorded run and whether the spec changed since then; it does not establish full coverage automatically. For a non-Spec-Kit repository, keep the existing spec files and omit feature links until the mapping is verified. Product Backlog issues are product-level requests; `tasks.md` lists implementation work within a Spec Kit feature.

The optional `product` block defines `vision` (a Markdown file path), `docsRoot` (the documentation folder), `roadmap` and `documentation`. Each roadmap entry has a stable `id`, `title`, `status` (`draft`, `planned`, `in-progress`, `done`), optional `summary`, and optional `relatedComponents` using component IDs. Documentation scans all Markdown files recursively under `docsRoot`, using the same folder browser layout as Requirements. Keep every product documentation file in this folder. A `documentation` entry can add a stable `id`, `title`, `path` under `docsRoot`, and optional `summary`; the folder browser also sees files without an entry. Set `workspace.startPage` to `vision`, `north-star`, `roadmap` or `docs`; legacy `product` opens Vision. Treat draft and planned entries as product intent; do not claim they are already implemented.

The Backlog page reads Markdown issues from `product.backlogRoot`, or `backlog/` by default. One issue lives in one `.md` file. YAML frontmatter needs a stable `PV-001` style `id`, `title`, `status` (`inbox`, `planned`, `in-progress`, `done`), `priority` (`low`, `medium`, `high`), and `type` (`feature`, `bug`, `task`, `idea`). `created`, `updated`, and `spec` are optional; the Markdown body contains details and acceptance criteria. Keep filenames and IDs stable when status changes. Link `spec` to `specs/<feature>/spec.md` when the issue becomes a specified feature. The local backlog works without external issue services.

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

`product.northStar` optionally defines one outcome metric on its own North Star page: `name`, `description`, `unit`, `cadence` (`daily`, `weekly`, or `monthly`), optional numeric `target`, and `measurements` with ISO dates, numeric values, and optional notes. OpenBuildRoom charts these manually entered observations below the current value and exposes them in `get_product_context`. Keep dates unique and do not treat a target or an empty chart as an observed result. These fields are saved in `productview.yaml` so the definition and measurement history can be reviewed and committed.

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

1. If `productview.yaml` exists, inspect it, read `product.vision`, the roadmap, local backlog issues, and relevant Markdown files under `product.docsRoot`. Preserve stable IDs in any `product.documentation` entries. For first setup without YAML, inspect the repository's actual specs, docs, runtime and tests before creating a small truthful configuration. Do not create duplicate spec or documentation trees.
2. Add or update components when code introduces a service, command tool, test suite, data store, or issue source. Put specs in Requirements and connect them through `views.specifications.links`. Add map connections for actual runtime dependencies, such as API → database; avoid `defines` and `checks` edges in new maps. Use `position.x` from 0 to 100 and a nonnegative `position.y`; the map grows vertically. The desktop app's Data Sources and CLI Explorer pages can add missing components through validated dialogs. Removing one there also removes its map connections and references from Spec Kit links and roadmap items, but never deletes data files or executables.
3. Keep command arguments as an array, for example `[npm, run, dev]`, and set `startup: manual`. The working directory must be inside the repository.
   Add a `commandTool` only when the project exposes a real CLI. CLI Explorer discovers likely local entry points from package bins, Python scripts, Cargo and Go binaries, and executable files without running them. These are candidates, not proof of a complete manual. The user may explicitly read help and link one into YAML as a help-only task; `cli.source` records its repository file. Put an actual operational command in `runtime.command` only after checking its behavior. Document the real synopsis, commands, options, examples and variable names in `cli`; OpenBuildRoom renders these fields as a manpage-style manual. If the executable supports help, set `cli.helpCommand` to an explicit argument array such as `[node, scripts/tool.cjs, --help]`. OpenBuildRoom runs it only on a user's click and displays its output separately from the authored manual. Set `cli.mode: task` for a one-off command or `server` for a persistent process. See `docs/product/command-tools.md` for the configuration template.
4. Keep secrets out of YAML. Put only environment variable **names**, such as `DATABASE_URL`, in `connectionEnv`, `workspace.environment`, or a component environment list. Tell the user to set missing values in the desktop Environment page; never request their values through the agent chat.
   For issue sources, record the public repository or team identifier in YAML. Never put API keys, OAuth tokens, or private credentials in `integration` fields. Configured means described, not connected.
5. Validate with `npm run validate:config` in an OpenBuildRoom Desktop source checkout, or against `schemas/productview.schema.json` if that schema is copied into the project.
6. Update roadmap status and documentation when delivered behavior changes. Commit `productview.yaml`, the vision, documentation and relevant specs with the project. OpenBuildRoom records events in `.productview/events.jsonl` and command output in `.productview/logs/`; review those files for private data before committing.

## MCP access

**MCP Explorer** in Run & Verify discovers project MCP servers from `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `mcp.json` and `workspace.mcpServers` without launching them. During onboarding, inspect these files. The user can add several independent YAML registrations or link a discovered project server through the explorer. A linked entry uses `linkedFrom: .mcp.json:server-name` (or another discovered source ID) to record provenance; do not add another YAML copy of the same discovered source. An entry needs stable `id` and `name` plus `command` with optional `args`/`cwd` for `transport: stdio`, or `url` for `transport: http` or `sse`. Use `environment: [NAME]` for local command variables and `authEnv: NAME` for a remote Bearer token. Names appear in Environment; values stay in encrypted local app storage. Do not put tokens in URLs, arguments, YAML or prompts. The user connects explicitly; multiple servers can remain connected while the user inspects their tools, resources, templates and prompts. Removing a YAML registration does not delete its source config or executable. OAuth login is not yet supported.

The local read-only MCP server exposes `get_product_view`, `get_product_context`, `get_spec_kit`, `list_components`, `read_project_file`, and `get_product_history`. `get_spec_kit` returns detected feature artifacts, link mappings, and recorded OpenBuildRoom test evidence; this separate MCP process cannot observe the desktop app's current process state. `get_product_context` includes the vision text, North Star definition and manual measurements, roadmap entries, local backlog issues and Markdown documentation discovered under `product.docsRoot`. The desktop app's **Settings → Agent Access** tab shows the exact launch configuration for the current workspace. Each MCP connection and tool call appears in Activity. Use ordinary repository editing tools to change files; the MCP endpoint does not write project code or run commands.

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
