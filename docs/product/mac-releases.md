# Mac releases and in-app updates

Project Room checks public GitHub Releases shortly after launch and every six hours. It downloads a newer release in the background and shows **Restart to update** when ready. Restarting stops services launched from Project Room. The first signed release must be installed from the website; later signed releases can update in place. There is no migration path for older unsigned previews because they have no installed user base.

## One-time release setup

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/enroll/) if the signing team is not enrolled yet. The team Account Holder creates a **Developer ID Application** certificate for direct distribution. On the Mac where its certificate signing request was created, install the downloaded `.cer`, then export the certificate **with its private key** from Keychain Access → My Certificates as a password-protected `.p12`. A `.cer` alone cannot sign the app. Keep the `.p12` and its password private.
2. In [App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys](https://appstoreconnect.apple.com/access/integrations/api), create a **team** API key with the Developer role for notarization. Download its `.p8` once and record the Key ID and Issuer ID. An individual API key is not suitable for `notarytool`. Keep the `.p8` private.
3. In [repository Actions secrets](https://github.com/OpenProjectRoom/desktop/settings/secrets/actions), add the six names below. Encode each file separately with `base64 < /path/to/file | tr -d '\n' | pbcopy`, then paste directly into the matching GitHub secret. Do not paste values into chat, source files, project YAML, or a prompt.

   | Secret | Value |
   | --- | --- |
   | `MAC_CSC_LINK` | Base64 of the password-protected `.p12` file |
   | `MAC_CSC_KEY_PASSWORD` | Password chosen when exporting that `.p12` |
   | `APPLE_API_KEY_P8_BASE64` | Base64 of the downloaded team `.p8` file |
   | `APPLE_API_KEY_ID` | Key ID shown in App Store Connect |
   | `APPLE_API_ISSUER` | Issuer ID shown in App Store Connect |
   | `APPLE_TEAM_ID` | Signing team's 10-character Team ID from Apple Developer membership details |

   This repository uses electron-builder 26, which requires `APPLE_API_KEY` to be a **file path**. The release workflow decodes `APPLE_API_KEY_P8_BASE64` into a temporary file on the macOS runner and passes only that path to electron-builder. The file is deleted after the build.
4. Increase `package.json` version, commit it, and push a matching `v<version>` tag. The workflow builds and notarizes the app, verifies its signature, signing Team ID and stapled ticket, then publishes the DMG, ZIP, blockmap, and `latest-mac.yml` as a GitHub Release. The stable Mac download URL is `https://github.com/OpenProjectRoom/desktop/releases/latest/download/Project-Room-Desktop-arm64-mac.zip`.
5. Install that first signed release from the website onto a Mac as a fresh install. Then publish a second version and verify the bottom update banner, download, restart, installed version, and running-service shutdown on that Mac. Both versions must be signed by the same Apple Team ID.

`npm run package:mac:app` remains an unsigned local development build. It is not a substitute for the signed release or an end-to-end update test.
