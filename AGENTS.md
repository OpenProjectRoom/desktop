# Project Room instructions for coding agents

Read `PROJECT_ROOM.md` and `.projectroom/project.yaml` before changing the product's architecture or development workflow. Keep the Project Room map in sync with code: add or update a component when introducing a service, command tool, database, test suite, specification, storage system, or issue source. Add connections that explain dependencies. Keep IDs stable across renames. Validate with `npm run validate:config`.

Before proposing or implementing product behavior, read `product.vision`, `product.roadmap`, and the relevant `product.documentation` files in `.projectroom/project.yaml`. Treat `draft` and `planned` roadmap entries as intent, not implemented behavior. Update the roadmap status and documentation when delivery changes the product, and preserve stable roadmap and document IDs.

Never put credentials in `.projectroom/project.yaml`. Use environment variable names such as `DATABASE_URL`. Do not claim simulated statuses or integrations are live. Do not auto-start newly added commands. If a component has no implementation yet, represent it as planned in the specification rather than as a running service.
