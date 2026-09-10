# Update feed

Drop a release's `latest.yml`, `DailyBee-Setup-<version>.exe` and `DailyBee-Setup-<version>.exe.blockmap`
(and `latest-mac.yml` + the macOS zip/dmg, `latest-linux.yml` + the AppImage) into this folder.
The `updates` service in `../docker-compose.yml` serves it; installed apps built with
`DAILYBEE_UPDATE_URL` pointing here update themselves. See `RELEASING.md` in the repository root.
