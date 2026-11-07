# Contributing to Project Room

Thanks for helping make agent-built software easier to understand and operate.

## Start here

Read [the repository contract](PROJECT_ROOM.md), [architecture notes](docs/product/architecture.md), and [the working example](examples/hello-workspace/.projectroom/project.yaml). For behavior changes, check the product vision and roadmap in `.projectroom/project.yaml`. Spec Kit artifacts stay in their standard `.specify/` and `specs/` folders.

```sh
npm ci
npm test
npm run validate:config
npm run build:demo
```

The public download currently targets macOS. `npm start` launches the app from source; `npm run package:mac:app` creates an Apple Silicon app bundle on a Mac. Windows x64 source checks run in CI, and `npm run package:win:app` creates an unpacked local Windows build. See the [Windows validation and release checklist](docs/product/windows-releases.md) before offering a Windows download. The example workspace needs only Node.js 20+ and has its own `npm test` script.

Open a focused issue before a large change. In pull requests, explain what changed, how you checked it, and whether the shared YAML or product documentation changed. Never include secrets, private workspaces, or unreviewed `.productview/` logs.

## Current boundaries

Real local services and tests run only after a manual click. GitHub/Linear sync, production telemetry, and Railway export are planned. The Blackbox Agent B workspace in the packaged demo is sample data; use **Try working example** for a real local workflow.
