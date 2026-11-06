# Mac releases and in-app updates

Project Room checks public GitHub Releases shortly after launch and every six hours. It downloads a newer release in the background and shows **Restart to update** when ready. Restarting stops services launched from Project Room. The first signed release must be installed from the website; later signed releases can update in place. There is no migration path for older unsigned previews because they have no installed user base.

## One-time release setup

1. Enroll in the Apple Developer Program and create a **Developer ID Application** certificate for direct distribution. Export it as a password-protected `.p12` file.
2. Create an App Store Connect API key for notarization. Keep the `.p8` key private.
3. Add these GitHub Actions secrets to `OpenProjectRoom/desktop`: `MAC_CSC_LINK` (base64 `.p12`), `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY` (base64 `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, and `APPLE_TEAM_ID`. Never put the values in the repository, YAML, or a prompt.
4. Increase `package.json` version, commit it, and push a matching `v<version>` tag. The workflow builds and notarizes the app, verifies its signature and ticket, then publishes the DMG, ZIP, blockmap, and `latest-mac.yml` as a GitHub Release. The stable Mac download URL is `https://github.com/OpenProjectRoom/desktop/releases/latest/download/Project-Room-Desktop-arm64-mac.zip`.
5. Install that first signed release, then publish a second version and verify the bottom update banner, download, restart, and running-service shutdown on a Mac.

`npm run package:mac:app` remains an unsigned local development build. It is not a substitute for the signed release or an end-to-end update test.
