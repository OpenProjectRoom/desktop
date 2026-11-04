# OpenBuildRoom Desktop

OpenBuildRoom Desktop is an open-source macOS workspace for software built with a coding agent. Open a local repository to see product direction, existing GitHub Spec Kit files, services, tests, data sources, command-line tools, MCP servers, and activity in one place.

The app reads `productview.yaml` from the repository you open. That existing filename remains supported during the rename to OpenBuildRoom. The file declares verified local components and links and belongs in the project repository. Spec Kit keeps its own standard `.specify/` and `specs/` files; the desktop app reads them rather than creating a second specification tree.

## Install the preview

Download the latest Apple Silicon `.zip` from [Releases](https://github.com/OpenBuildRoom/desktop/releases). Unzip it, move **OpenBuildRoom Desktop.app** into Applications, and open it. This first public build is an unsigned, unnotarized developer preview. macOS may ask you to explicitly open it in **System Settings → Privacy & Security**.

To run from source on macOS with Node.js and npm:

```sh
npm ci
npm start
```

## Use it with a coding agent

1. Read the [OpenBuildRoom guide](OPENBUILDROOM.md), the [agent skill](agent/openbuildroom/SKILL.md), and the [YAML schema](schemas/productview.schema.json).
2. Ask your agent to inspect the actual repository before drafting `productview.yaml`. Register only commands, services, tests, data sources, and connections it can verify. Keep secrets outside YAML and Git.
3. Open the repository folder in OpenBuildRoom. Review the map and run a service or test explicitly to check the setup.

The included `productview.yaml` and packaged demo use **Blackbox Agent B** as sample project data. They do not automatically connect to that project's services or database.

## Develop

```sh
npm test
npm run validate:config
npm run package:mac:app
```

The packaging command builds an Apple Silicon `.app` in the configured output directory. `npm run package:mac` also makes a DMG on Macs where disk-image creation is available. OpenBuildRoom currently targets macOS; Windows and Linux packages have not been tested. See [architecture notes](docs/product/architecture.md) and the [getting started guide](docs/product/getting-started.md) for details.

## License

MIT. See [LICENSE](LICENSE).
