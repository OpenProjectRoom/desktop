# Windows x64 preparation

The Windows app is prepared in source but is **not a public download yet**. The first Windows run, installer, and installed-to-installed update must be checked on an actual Windows machine before enabling automatic publication.

## Build and test on Windows

1. On Windows 10/11 x64, install Node.js 22 and Git. Clone this repository and run `npm ci`, `npm test`, and `npm run validate:config` in PowerShell.
2. Run `npm start`. Open the bundled working example, then an ordinary local project folder. Check the title bar, navigation, file reader, theme, and Project Chat. Dictation is currently macOS-only and is hidden on Windows.
3. In a disposable Node project, configure a service with `command: [npm, run, dev]`, a test with `command: [npm, test]`, and a local MCP server. Verify start, logs, stop, child-process exit, test output, MCP tool calls, and five-second CPU/RAM samples. Check Data Explorer, API Explorer, `.env` handling and OAuth separately. Shell scripts such as `./blackbox` are not Windows commands; the project must provide a Windows-compatible command.
4. Run `npm run package:win:app` for a local unpacked build. The signed public installer uses `npm run package:win` and requires Windows signing credentials. Test a fresh install and uninstall on the same Windows computer before release.

## One-time release setup

1. Obtain a Windows Authenticode code-signing certificate or compatible signing service. The Apple Developer ID certificate cannot sign Windows binaries. Store an exportable certificate as a password-protected PFX only when the selected signing method permits it.
2. Set repository Actions secrets `WIN_CSC_LINK` (PFX file or base64 certificate accepted by electron-builder) and `WIN_CSC_KEY_PASSWORD`. Keep both out of the repository. The Windows release job passes them as `CSC_LINK` and `CSC_KEY_PASSWORD` and rejects a missing signature.
3. After the Windows validation below succeeds, set Actions variable `WINDOWS_SIGNING_READY=true`. Until then, version tags release only the Mac app. The Windows job runs after the Mac release job and adds `Project-Room-Desktop-x64-windows.exe`, its blockmap, and `latest.yml` to the **same tag**. It does not create a competing release.
4. Install one signed Windows release, publish a second version, and verify that the in-app update banner downloads it and that **Restart to update** installs it. Verify the installer signer and `latest.yml` match the release. Only then add a Windows download button to the website and README.

Every pull request also runs the source checks and builds an unsigned unpacked app on `windows-latest`. This verifies packaging, but it does not replace the manual install and updater test.
