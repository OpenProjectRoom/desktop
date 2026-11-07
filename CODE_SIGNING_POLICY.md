# Code signing policy

Project Room is applying for free Windows code signing through SignPath Foundation. **The current Windows preview is unsigned.** This policy describes the intended signed release process; it does not imply that SignPath has approved or signed any current download.

Free code signing provided by SignPath.io, certificate by SignPath Foundation.

## Responsibility

- **Authors:** [OpenProjectRoom repository collaborators with write access](https://github.com/OpenProjectRoom/desktop/graphs/contributors) maintain the source and release workflow. Benedikt Sauter ([sauterbe](https://github.com/sauterbe)) is the project maintainer.
- **Reviewers:** [OpenProjectRoom organization owners](https://github.com/orgs/OpenProjectRoom/people?query=role%3Aowner) review outside contributions before merging them.
- **Approvers:** [OpenProjectRoom organization owners](https://github.com/orgs/OpenProjectRoom/people?query=role%3Aowner) manually approve each SignPath signing request after checking the release source and build.

The Windows installer is built from this public repository by GitHub Actions. The workflow must submit that build artifact to SignPath and publish only the returned, signature-verified installer. The signing policy must restrict the artifact to the Project Room product name and release version. The [release procedure](docs/product/windows-releases.md) records the checks. Maintainers with GitHub and SignPath access must use multi-factor authentication.

## Privacy and security

See the [Project Room privacy notice](https://openprojectroom.com/privacy.html). Project Room reads the project folder locally. It contacts configured APIs, MCP servers, data sources, OAuth providers, or a coding-agent provider when the user invokes those features. Packaged builds also check GitHub Releases for updates after launch and periodically. Project Room has no developer-operated telemetry service. The repository's [security guidance](SECURITY.md) explains local command execution and secret handling.

Windows users can remove Project Room through **Settings → Apps → Installed apps**. The uninstall does not delete their own project repositories.
