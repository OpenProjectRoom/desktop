# CLI Explorer

An entry point already linked to a registered YAML tool appears only once, under the registered tool. Catalog counts reflect distinct tools rather than both discovery and registration.

CLI Explorer follows the same browse and inspect layout as MCP Explorer. The main catalog lists registered `commandTool` components from `.projectroom/project.yaml`. **Find more CLIs** expands available, unregistered entry points found by reading the open repository: `package.json` `bin` entries, Python project scripts, Cargo binaries, Go `cmd/*/main.go` and `examples/*/main.go` programs, and executable CLI files. Candidates whose declared `dist/` or `build/` target is absent stay out of this interactive catalog until built. This scan does not run candidates. It is intentionally bounded and may miss custom build systems; ordinary package scripts and tests are not automatically treated as product CLIs. Select a registered tool or expand discovery to inspect a candidate on the right.

Select a discovered entry to see its source file and exact command. **Read help** explicitly starts the command with `--help`, `-h`, or `help` and shows the real output, including a parsed synopsis, paired short and long flags, common subcommand lists and positional arguments where recognizable. Parsed commands and options become suggestions in Explore. The full original output stays visible because CLI help has no universal machine-readable format. A program can have side effects even while printing help; Project Room never requests it automatically. Discovery does not prove that the CLI is safe or fully documented.

The **Explore** tab is an interactive local tester. It shows the exact invocation, lets you add one argument per line, and runs only when you click **Test command**. Documented commands and options, or options parsed from actual help, are clickable suggestions for the argument field. The result shows output, exit code and timeouts. A trial has a 10-second limit and 64 KB output limit; arguments and output are not written to `.projectroom/project.yaml`. Activity records the trial and exit status, without its arguments or output. The **Manual** tab shows the repository-authored manpage for a registered tool; **Help** shows executable help for a discovered one. **Process output** shows the configured long-running process log, and **Definition** or **Source** explains where the entry came from. A newly linked discovery candidate is help-only until its `runtime.command` is edited.

**Add to project YAML** creates a `commandTool` whose initial Run command only requests help, records `cli.source`, and enables the optional CLI Explorer view. This makes the candidate visible to teammates without claiming that Project Room knows its operational subcommands. Edit its `runtime.command`, `cli.usage`, `cli.commands`, `cli.options`, and examples after inspecting the tool. **Add CLI tool** also registers a real CLI manually when discovery misses it. Enter its executable and arguments one per line, working directory, task/server mode, summary and usage. Project Room saves each tool as a separate validated `commandTool` and makes CLI Explorer visible in navigation. The optional help argument is used only when you explicitly ask to read help. **Remove** deletes the selected YAML entry and its map, Spec Kit and roadmap references; it does not delete executable files or saved logs. Stop a running tool before removing it.

For a configured tool, `runtime.command` is the exact argument array behind Start or Run. `cli.mode` is `server` for a long-running process or `task` for a command that exits. `cli.protocol` describes how a server communicates (`http`, `stdio`, or `other`).

When the source audit finds a separate, terminating build step, add its exact argument array as `runtime.buildCommand`. CLI Explorer then shows **Rebuild** beside Run or Start. It runs only on click while the tool is stopped, streams output to Process output and records the result in Activity. A successful build updates the displayed local build time for this app session. Do not use an install, migration, watch, packaging or deployment command as a build step.

The manual maps `cli.summary` to NAME, optional `cli.description` to DESCRIPTION, `cli.usage` to SYNOPSIS, and the optional `commands`, `options`, `examples` and `environment` arrays to the matching sections. These are repository-authored descriptions, not detected flags. An optional `cli.helpCommand` enables **Read actual --help** in the desktop app. Its raw output appears separately, with exit status, so it can be compared with the written manual. A linked discovery candidate starts with the selected help command; manually authored definitions may use another explicit help command. The web preview does not simulate help or process output.

In a local workspace, Start and Stop control the configured server. Run executes a one-shot task. Output streams into the view and is saved under `.productview/logs/`; Activity records starts, stops and help requests. Enter only environment variable **names** in the configuration, never credentials.

Example component for an existing CLI server:

```yaml
components:
  - id: my-cli
    kind: commandTool
    name: My CLI Server
    position: { x: 60, y: 480 }
    runtime:
      command: [node, tools/server.cjs, serve]
      cwd: .
      startup: manual
    cli:
      mode: server
      protocol: stdio
      summary: Serves project tools over standard input and output.
      description: Starts a local tool process that responds to requests on standard input.
      usage: node tools/server.cjs <command> [options]
      helpCommand: [node, tools/server.cjs, --help]
      commands:
        - { name: serve, description: Start the server. }
      options:
        - { flag: "--help", description: Show the command reference. }
      examples:
        - { label: Start locally, command: [node, tools/server.cjs, serve] }
      environment: [MY_SERVICE_TOKEN]
```

The YAML above is a template, not an installed example tool. Register it only after `tools/server.cjs` exists and its `--help` confirms the documented commands and options. Set `protocol: http` and an optional `runtime.url` for a local HTTP server. For a one-off command, set `mode: task`; its process exits after Run.
