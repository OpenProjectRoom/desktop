# OpenBuildRoom Desktop

**Your control room for the software your agent builds.** See the plan. Run the app. Check the tests. Know what is happening as your product grows.

OpenBuildRoom is a free, open-source macOS desktop app for local software projects. It puts the product vision, [GitHub Spec Kit](https://github.com/github/spec-kit) work, services, tests, data, CLI and MCP tools, and recorded activity beside the code. A product owner can keep the direction visible while developers and coding agents work in the same repository.

![OpenBuildRoom showing the running Hello Workspace service and a passed test run](assets/screenshots/overview.png)

The screenshot shows the **real included example** after starting its service and running its tests. Performance measurements and live GitHub/Linear issue sync are not implemented yet; the app labels those gaps.

## Try it in five minutes

1. Download the [latest Apple Silicon Mac release](https://github.com/OpenBuildRoom/desktop/releases/latest), unzip it, and move **OpenBuildRoom Desktop.app** to Applications. This preview is unsigned and unnotarized, so macOS may require an explicit open in **System Settings → Privacy & Security**.
2. Have [Node.js 20+](https://nodejs.org/) installed for the working example's service and tests. The desktop app itself does not require Node.js.
3. Open the app and click **Try working example**. It copies a small project to `~/Documents/OpenBuildRoom Examples/hello-workspace` and opens it without starting anything.
4. Start **Notes web service** in Services and open its local URL. Run **Node endpoint tests** in Tests. Inspect `notes.json` in Data Sources, then open the linked feature in Requirements.

The example is [here in the repository](examples/hello-workspace). It has a real Node service, local JSON storage, tests, a constitution, and standard Spec Kit `specs/001-notes/` artifacts. No account, database server, secret, or cloud deployment is needed.

| Product intent | Running software | Evidence |
| --- | --- | --- |
| Vision, roadmap, documentation, Spec Kit requirements and tasks | Project Map, manual service controls, CLI and MCP explorers, data viewers | Test results, process output, activity history, local environment variable status |

<details><summary>See the real example views</summary>

![The example service and JSON storage linked on the Project Map](assets/screenshots/project-map.png)
![Spec Kit requirements linked to the running service and recorded tests](assets/screenshots/spec-kit.png)
![Read-only preview of the example's JSON storage](assets/screenshots/data-sources.png)

</details>

## Use it with your own repository

Open a project folder in the desktop app. If `productview.yaml` does not exist yet, the onboarding flow inspects local project files and prepares a prompt for your installed Codex CLI or Claude Code. The agent reads the [repository contract](OPENBUILDROOM.md), [agent skill](agent/openbuildroom/SKILL.md), and [YAML schema](schemas/productview.schema.json), then records **verified** commands and components in `productview.yaml` at the repository root.

Keep product specifications in Spec Kit's normal `.specify/` and `specs/` files. OpenBuildRoom reads them and adds optional traceability links in YAML; it does not create a second specification tree. Services, tests, data sources, and MCP servers run or connect only after a manual action. Local environment **values** stay outside the repository; YAML stores their names.

The packaged Blackbox Agent B workspace is an **interactive simulation**. Choose **Try working example** or open your own configured repository for real local actions. See the [getting started guide](docs/product/getting-started.md) and [architecture notes](docs/product/architecture.md) for the current behavior and boundaries.

## Develop from source

```sh
npm ci
npm test
npm run validate:config
npm start
```

On Apple Silicon macOS, `npm run package:mac:app` builds an app bundle. The first public releases are unsigned while Apple Developer signing and notarization are being set up. Windows and Linux packages have not been tested.

We welcome focused [bug reports and feature requests](https://github.com/OpenBuildRoom/desktop/issues), discussions about missing workflows, and pull requests. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. For sensitive reports, see [SECURITY.md](SECURITY.md).

MIT licensed. See [LICENSE](LICENSE).
