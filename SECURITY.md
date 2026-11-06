# Security

Project Room reads `.projectroom/project.yaml` when you open a repository. Review that file before you start a service, test, CLI tool, or MCP server: those actions execute commands from the selected project with your local user permissions. Opening a project does not start its declared commands.

Keep secret values in the repository's ignored `.env` or your operating system's environment, never in YAML or prompts. The app can show a value on request and passes declared values to processes you start. Local activity and command output are stored in `.productview/`; Project Room adds ignore rules for `events.jsonl` and `logs/` so they are not committed accidentally. Existing tracked history remains tracked until you remove it from Git. Review any evidence you choose to share, because a process can transform a secret before printing it.

Product Chat uses your installed Codex CLI or Claude Code and may send your prompt and repository context to that provider. Its edit mode permits the agent to change project files. API and MCP connections contact the configured endpoint only after an explicit action; check the endpoint and authentication scope first.

For a security issue, please open a private GitHub security advisory for this repository instead of a public issue. For ordinary bugs, use the issue templates.
