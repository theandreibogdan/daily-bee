# Releasing DailyBee: builds that update themselves and run on other machines

Two things stand between a build on your machine and an app on someone else's: **signing**, so
Windows and macOS run it, and an **update feed**, so it updates itself afterwards. This is the
whole flow. Nothing here needs a service you do not control; the update feed is a static folder.

## 1. How updates work

- The packaged app carries `app-update.yml` with the feed address (`DAILYBEE_UPDATE_URL` at package
  time). Half a minute after launch and twice a day it fetches `latest.yml` from there, compares
  the version with its own, downloads the installer in the background, and installs it on the next
  quit or when the user presses **Restart to update** (Settings › Updates, the tray, the bell).
- A feed is a folder on any web server: `latest.yml`, `DailyBee-Setup-<version>.exe` and its
  `.blockmap` (Windows), `latest-mac.yml` with the `.zip`/`.dmg` (macOS), `latest-linux.yml` with
  the `AppImage`. electron-builder writes all of them into `apps/desktop/release/`.
- Release notes: `latest.yml` may carry `releaseNotes`; the app shows them once after updating.
  The CI release job also puts them in the GitHub release.
- Only the Windows **NSIS installer** updates itself. The zip is for testing on a machine that
  cannot run unsigned installers (Smart App Control); it never updates.

## 2. Signing, and why it is not optional

Windows 11 with **Smart App Control** on (the default on consumer installs since 2024) refuses to
run anything that is not signed with a certificate Microsoft trusts; SmartScreen warns on the rest.
electron-updater also verifies, when `DAILYBEE_PUBLISHER` is set, that a downloaded installer is
signed by that publisher before running it. So a signed build is the gate for anyone but yourself.

| Option | Cost, effort | Smart App Control | Notes |
| --- | --- | --- | --- |
| **Azure Trusted Signing** | about $10/month, an Azure account and an identity check | accepted | Recommended. Set `AZURE_SIGN_ENDPOINT`, `AZURE_SIGN_ACCOUNT`, `AZURE_SIGN_PROFILE` and the `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` of a service principal; electron-builder signs through it. |
| **OV / EV certificate** from a CA (DigiCert, Sectigo, SSL.com …) | $200–500/year, a hardware token for EV | accepted (EV builds reputation faster) | Export to `.pfx` or use the CA's cloud signing; `CSC_LINK` (path or base64 of the .pfx) and `CSC_KEY_PASSWORD`. |
| **Self-signed certificate** | free | **blocked** | Only for testers who install your certificate into *Trusted Root* and *Trusted Publishers* and have Smart App Control off. Handy for exercising the update flow end to end. |
| **macOS**: Apple Developer ID + notarization | $99/year | n/a | `CSC_LINK`/`CSC_KEY_PASSWORD` with the Developer ID Application certificate, plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` for notarization. Unsigned macOS builds are refused by Gatekeeper outright. |

`DAILYBEE_PUBLISHER` must be the certificate's subject name exactly (for example `DailyBee Ltd`).

A self-signed certificate for a test round, in PowerShell as administrator:

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=DailyBee Test" -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(2)
$pw = ConvertTo-SecureString "test-password" -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath dailybee-test.pfx -Password $pw
# on every tester machine (as administrator):
Import-PfxCertificate -FilePath dailybee-test.pfx -CertStoreLocation Cert:\LocalMachine\Root -Password $pw
Import-PfxCertificate -FilePath dailybee-test.pfx -CertStoreLocation Cert:\LocalMachine\TrustedPublisher -Password $pw
```

Then `CSC_LINK=<path to dailybee-test.pfx>`, `CSC_KEY_PASSWORD=test-password`, `DAILYBEE_PUBLISHER="DailyBee Test"`.

## 3. Cutting a release

1. Bump the version in `apps/desktop/package.json` (and `apps/api/package.json` + `apps/api/src/version.ts` if the API changed). Commit.
2. Write the notes you want users to see; they go into `latest.yml` as `releaseNotes` (see step 4) and into the GitHub release.
3. Build and package, **with the feed address and the signing variables in the environment**:

   ```powershell
   # Windows PowerShell, from the repository root
   $env:DAILYBEE_UPDATE_URL = 'https://cloud-test.example.com/updates'
   $env:DAILYBEE_PUBLISHER  = 'DailyBee Ltd'
   $env:CSC_LINK = 'C:\certs\dailybee.pfx'; $env:CSC_KEY_PASSWORD = '…'
   corepack pnpm package
   ```

   Or push a tag and let `.github/workflows/release.yml` do it on GitHub's runners (Windows, macOS and Linux), with the same names as repository variables and secrets. That is also the way around Smart App Control on your own machine, which refuses to run the unsigned NSIS stub during the build.

4. Put the files on the feed. With the cloud stack (`deploy/cloud`), copy `apps/desktop/release/latest.yml`, `DailyBee-Setup-<version>.exe` and `DailyBee-Setup-<version>.exe.blockmap` into `deploy/cloud/updates/` on the host (`scp`, or the file manager of your hosting). Any other static host works the same way. To attach notes, add to `latest.yml`:

   ```yaml
   releaseNotes: |
     - Tray: Resume, Start recent, Stop now
     - Reports: the Week tab
   ```

5. Check the feed from a browser: `https://cloud-test.example.com/updates/latest.yml` must show the new version. Installed apps pick it up within twelve hours; Settings › Updates › **Check for updates** does it now.

## 4. Verifying the update path before real users

- Install the previous version from its installer on a test machine (or a VM). Run it, open Settings › Updates, press *Check for updates*: it reports the new version, downloads, offers *Restart to update*; after the restart the *What's new* dialog shows the notes.
- A development build can be pointed at a test feed with `DAILYBEE_UPDATE_URL=http://127.0.0.1:8790`, which switches the updater on (it downloads and reports ready, but there is no installer to run).
- Rollback: put the previous `latest.yml` and installer back on the feed. Apps do not downgrade on their own; users reinstall from the installer.

## 5. Where things live

| What | Where |
| --- | --- |
| Packaging and signing configuration | `apps/desktop/electron-builder.config.cjs` |
| The self-updater | `apps/desktop/src/main/services/updates.ts`, Settings › Updates |
| Feed folder on the cloud host | `deploy/cloud/updates/` (served by the `updates` service) |
| CI | `.github/workflows/release.yml` |
| Release notes shown after an update | `userData/app-state.json` while pending |
