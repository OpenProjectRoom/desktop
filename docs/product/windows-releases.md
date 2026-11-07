# Windows x64 and ARM64 preview

An [unsigned Windows 11 preview installer](https://github.com/OpenProjectRoom/desktop/releases/tag/v0.9.78-windows-preview.1) is available for x64 and ARM64. The Windows 11 ARM64 Parallels smoke test covered installation, launch, demo Overview, Project Map, Services, Test Explorer, Settings, and project selection. Real project commands, API/MCP/data integrations, uninstall, and installed-to-installed updates still need a final Windows pass. The preview is separate from the signed, notarized Mac stable release and is not included in automatic release publication.

## Build and test on Windows

1. On Windows 10/11 x64 or ARM64, install Node.js 22 and Git. Clone this repository and run `npm ci`, `npm test`, and `npm run validate:config` in PowerShell. Benedikt's Parallels Windows 11 VM is ARM64; use the combined test installer to exercise its native payload.
2. Run `npm start`. Open the bundled working example, then an ordinary local project folder. Check the title bar, navigation, file reader, theme, and Project Chat. Dictation is currently macOS-only and is hidden on Windows.
3. In a disposable Node project, configure a service with `command: [npm, run, dev]`, a test with `command: [npm, test]`, and a local MCP server. Verify start, logs, stop, child-process exit, test output, MCP tool calls, and five-second CPU/RAM samples. Check Data Explorer, API Explorer, `.env` handling and OAuth separately. Shell scripts such as `./blackbox` are not Windows commands; the project must provide a Windows-compatible command.
4. Run `npm run package:win:app` for a local x64 unpacked build, or download the [unsigned preview installer](https://github.com/OpenProjectRoom/desktop/releases/tag/v0.9.78-windows-preview.1). The NSIS installer contains x64 and ARM64 payloads and selects the matching one. It has no publisher signature, so SmartScreen may warn. The signed stable installer uses `npm run package:win` and requires Windows signing credentials. Test a fresh install and uninstall on the same Windows computer before a stable release.

## One-time release setup

1. Obtain a Windows Authenticode code-signing certificate or compatible signing service. The Apple Developer ID certificate cannot sign Windows binaries. Store an exportable certificate as a password-protected PFX only when the selected signing method permits it.
2. Set repository Actions secrets `WIN_CSC_LINK` (PFX file or base64 certificate accepted by electron-builder) and `WIN_CSC_KEY_PASSWORD`. Keep both out of the repository. The Windows release job passes them as `CSC_LINK` and `CSC_KEY_PASSWORD` and rejects a missing signature.
3. After the final Windows validation and signing setup succeed, set Actions variable `WINDOWS_SIGNING_READY=true`. Until then, normal version tags release only the Mac app; the unsigned Windows preview uses an explicit prerelease tag. The signed Windows job will add `Project-Room-Desktop-windows.exe`, its blockmap, and `latest.yml` to the **same stable tag** as Mac.
4. Install one signed Windows release, publish a second version, and verify that the in-app update banner downloads it and that **Restart to update** installs it. Verify the installer signer and `latest.yml` match the release. Then switch the website and README Windows buttons from the explicit preview tag to the latest stable Windows asset.

Every pull request also runs the source checks, builds an unsigned unpacked app and NSIS installer on `windows-latest`, and keeps the installer as a short-lived CI artifact. This verifies packaging, but it does not replace the manual install and updater test.
