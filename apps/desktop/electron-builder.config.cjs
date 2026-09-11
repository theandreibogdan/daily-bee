// electron-builder configuration (replaces electron-builder.yml so signing and the update feed can
// come from the environment). Every variable is optional; without them the build is unsigned and
// has no update feed, exactly like before.
//
//   DAILYBEE_UPDATE_URL     Base URL of the update feed (a static folder holding latest.yml and the
//                           installers, e.g. https://cloud-test.example.com/updates). Written into
//                           app-update.yml so electron-updater knows where to look.
//   DAILYBEE_PUBLISHER      The certificate's subject name (CN), e.g. "DailyBee Ltd". Lets
//                           electron-updater verify that a downloaded installer is signed by us
//                           (written under win.signtoolOptions, or into the Azure options).
//   CSC_LINK / CSC_KEY_PASSWORD
//                           A code-signing certificate as a .pfx path or base64, and its password
//                           (electron-builder's own variables, used for Windows and macOS).
//   AZURE_SIGN_ENDPOINT, AZURE_SIGN_ACCOUNT, AZURE_SIGN_PROFILE
//                           Azure Trusted Signing instead of a .pfx (needs AZURE_TENANT_ID,
//                           AZURE_CLIENT_ID, AZURE_CLIENT_SECRET too). Microsoft-trusted, so
//                           Windows 11 Smart App Control accepts the build.
//   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
//                           macOS notarization (electron-builder's own variables).
//   DAILYBEE_WIN_TARGET     "zip" to build the zip instead of the NSIS installer (local testing on a
//                           machine with Smart App Control, which blocks the unsigned installer stub).
const feed = (process.env.DAILYBEE_UPDATE_URL || '').trim().replace(/\/$/, '');
const publisher = (process.env.DAILYBEE_PUBLISHER || '').trim();
const azure = process.env.AZURE_SIGN_ENDPOINT && process.env.AZURE_SIGN_ACCOUNT && process.env.AZURE_SIGN_PROFILE
  ? { endpoint: process.env.AZURE_SIGN_ENDPOINT, codeSigningAccountName: process.env.AZURE_SIGN_ACCOUNT, certificateProfileName: process.env.AZURE_SIGN_PROFILE, ...(publisher ? { publisherName: [publisher] } : {}) }
  : undefined;
const winTarget = (process.env.DAILYBEE_WIN_TARGET || 'nsis').split(',').map((t) => t.trim()).filter(Boolean);

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'dev.dailybee.desktop',
  productName: 'DailyBee',
  directories: { output: 'release', buildResources: 'build' },
  files: ['out/**', 'resources/**', 'package.json'],
  asarUnpack: ['**/sql.js/dist/sql-wasm.wasm'],
  // electron-updater reads this from app-update.yml inside the app; nothing is uploaded unless --publish is passed.
  publish: feed ? [{ provider: 'generic', url: feed, channel: 'latest' }] : null,
  mac: {
    category: 'public.app-category.productivity',
    target: ['dmg', 'zip'],
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: !!process.env.APPLE_ID,
    extendInfo: {
      NSAppleEventsUsageDescription: "DailyBee reads the active tab's address from your browser to categorise your time. Page URLs stay on this device.",
      NSScreenCaptureUsageDescription: 'DailyBee reads window titles of the app in front to name what you are working on.',
    },
  },
  win: {
    // The NSIS installer is what electron-updater updates on Windows. DAILYBEE_WIN_TARGET=zip for a plain zip.
    target: winTarget,
    artifactName: '${productName}-${version}-win.${ext}',
    // electron-updater checks a downloaded installer against this name (electron-builder 26 keeps it under signtoolOptions).
    verifyUpdateCodeSignature: !!publisher,
    ...(publisher && !azure ? { signtoolOptions: { publisherName: [publisher] } } : {}),
    ...(azure ? { azureSignOptions: azure } : {}),
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    deleteAppDataOnUninstall: false,
    artifactName: '${productName}-Setup-${version}.${ext}',
    shortcutName: 'DailyBee',
  },
  linux: { target: ['AppImage', 'deb'], category: 'Office' },
};
