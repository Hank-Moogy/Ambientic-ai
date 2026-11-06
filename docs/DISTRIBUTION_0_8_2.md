# Ambientic 0.8.2 private Mac distribution

Release date: 2026-11-06. Architecture: Apple Silicon arm64. Release commit: `f80c9861df78886dd9f38a7c970158627ceeda4b`. Built from a clean integration tree. PR #9 carries the integration; main is not merged.

Archive: `Ambientic-0.8.2-f80c9861-mac-arm64-signed.zip` (104,682,986 bytes).

SHA-256:

```text
42d62c53940a7ad0e06e48faf6cb9a4bcaa2c7f16a3d2c0ebea5764027e448c7
```

Developer ID Application: Samori Osei, team `K78PT544J5`. Hardened runtime and secure Apple timestamp are enabled. Strict deep signature verification passes for the packaged app, installed app, and app extracted from the final ZIP. The final archive is delivered privately through the user's Google Drive; its metadata shows `shared: false` and owner-only permission. No private app data, provider stores, credentials, signing keys, specialist registrations, or sessions are included.

**Not notarized.** Gatekeeper assessment returns `rejected`, `source=Unnotarized Developer ID`. `stapler validate` confirms no ticket. This archive must not be described as Gatekeeper-approved or a completed notarized release. The previous October 28 signing chat also stopped at missing notarization credentials.

## Install on the receiving Mac

1. Download the ZIP while signed into the Google account that owns it. No signing identity, Node runtime, or development dependencies are needed on the receiving Mac; Electron is bundled.
2. Verify the archive in Terminal (adjust its path if necessary):

   ```sh
   shasum -a 256 "$HOME/Downloads/Ambientic-0.8.2-f80c9861-mac-arm64-signed.zip"
   ```

3. Quit any running Ambientic. If replacing an existing app, move that bundle to a local rollback folder first. Preserve the local `~/Library/Application Support/Ambientic` folder; back it up while the app is quit if it already contains data.
4. Expand the ZIP in Finder and move `Ambientic.app` into `/Applications`. Do not overlay-copy into an older bundle or run from inside the ZIP/download preview.
5. The preferred first-launch path is to finish notarization first. For this currently unnotarized, self-built app, macOS may block launch. The owner can deliberately use the per-app **System Settings → Privacy & Security → Open Anyway** flow after attempting to open it, as described in [Apple's guidance](https://support.apple.com/en-us/102445). Do not globally disable Gatekeeper or remove quarantine recursively.
6. Launch `/Applications/Ambientic.app`; Settings should show version 0.8.2 and commit `f80c9861`. The bundle's exact identity is also readable at `/Applications/Ambientic.app/Contents/Resources/build-info.json`.
7. Confirm local health:

   ```sh
   curl -fsS http://127.0.0.1:47600/health
   codesign --verify --deep --strict /Applications/Ambientic.app
   ```

Sign into providers using each Mac's own existing provider login. Re-register specialists locally only after their setup and live acceptance. This release does not enable workers or automatic schedules. Physical APC40 MKII and receiving-Mac macOS 27.0 (26A428) acceptance remain to be performed there; this build was validated on arm64 macOS 26.3.1, and its declared minimum macOS is 11.0.

## Roll back without losing local data

Quit Ambientic, move the 0.8.2 app out of `/Applications`, restore the prior complete app bundle, and relaunch. Leave Application Support and provider credential stores in place. This release leaves retired Career OS/Workflow Studio files untouched; rolling back the application can make those features accessible again. Do not replace current databases with an older snapshot as a routine app rollback, because that would discard work since the snapshot.

On the signing Mac, the previous app archive and a consistent private context/settings snapshot are preserved locally under `~/Ambientic-local-backups/2026-11-06-pr9/`. That directory is excluded from the download. On a receiving Mac with no prior installation, rollback means quitting/removing only the new app; keep any newly created local data for a later corrected build.

## Complete notarization on the signing Mac

Signing and notarization use different credentials. The Developer ID certificate/private key signs code locally. `notarytool` additionally needs Apple service authentication. Configure it locally, without putting passwords in chat or scripts:

```sh
xcrun notarytool store-credentials ambientic --team-id K78PT544J5
```

Enter the developer Apple ID and an app-specific password at the prompts. An existing App Store Connect API-key profile is an alternative. [Apple's credential setup](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool) explains both options.

Once the profile is available, submit this exact signed ZIP, wait for Apple's Accepted result, staple the ticket to the corresponding app, validate the staple and Gatekeeper assessment, then regenerate the ZIP from that stapled app. A ZIP itself cannot carry a stapled ticket. Verify the re-extracted app, calculate the new checksum, and upload the notarized replacement as a new private artifact. Do not reuse the checksum above for a rebuilt/stapled archive.
