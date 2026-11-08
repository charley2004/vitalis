# Vitalis on iPhone — without the App Store

This is the "sideload" route: GitHub builds an **unsigned** `.ipa` for you, and
AltStore on your iPhone re-signs it with your **free Apple ID** and installs it.
Nothing is submitted to Apple, no App Store review, no $99/year membership.

The trade-off is the 7-day signature: a free Apple ID's development certificate
expires after **7 days**, and the app must be re-signed. AltStore refreshes it
automatically when it can reach AltServer on your PC over Wi-Fi; otherwise you
tap "Refresh All" once a week. Your data survives refreshes and reinstalls as
long as the app is not deleted.

```
GitHub Actions (macOS runner)          Your Windows PC              Your iPhone
─────────────────────────────          ───────────────             ───────────
npm ci → expo prebuild →               AltServer  ◄── Wi-Fi ──►     AltStore
xcodebuild (unsigned) →                                              │
vitalis-unsigned.ipa  ──────────────►  Files / iCloud  ──────────►   re-signs with
                                                                     free Apple ID,
                                                                     installs Vitalis
```

---

## What is already set up in this repo

| File | Purpose |
| --- | --- |
| `.github/workflows/ios-sideload.yml` | Builds the unsigned IPA on a GitHub-hosted macOS runner. Manual trigger only. |
| `app.json` | Added the missing `ios.bundleIdentifier` (`com.charley2004.vitalis`) and `ios.buildNumber`, plus a `scheme`. |
| `plugins/withLocalOnlyNotifications.js` | Removes the `aps-environment` entitlement that `expo-notifications` always adds. A free Apple ID cannot sign push notifications, and leaving the entitlement in causes "invalid entitlements" on install. Local reminders/alarms are unaffected. |
| `app.config.js` | Turns EAS Update off for sideload builds only (`VITALIS_SIDELOAD=1`), so the app doesn't wait on an update server it can't use. |
| `metro.config.js` | Stopped stubbing `expo-notifications` for non-EAS builds. Previously **every** local/CI native build silently lost all reminders. |

Why not Expo Go? It can't run this app: `expo-speech-recognition`,
`react-native-view-shot`, and some other native modules are not part of Expo Go.
A real `.ipa` is required.

---

## 0. What you need

- This Windows PC, an iPhone on **iOS 16 or newer**, a USB cable, and Wi-Fi that
  both devices share.
- Your **Apple ID** (free is fine; 2FA enabled is fine — AltStore asks for the code).
- Your GitHub repo (`charley2004/vitalis`, already public, so Actions minutes
  are free).
- About an hour the first time; ~5 minutes for later updates (plus the build).

---

## 1. Build the IPA (once per code change)

1. Push the repo so the workflow exists on `main`:

   ```powershell
   git add .
   git commit -m "Add iOS sideload build"
   git push
   ```

2. Open **Actions → iOS sideload build → Run workflow** (branch `main`):
   <https://github.com/charley2004/vitalis/actions/workflows/ios-sideload.yml>

3. Wait ~15–25 minutes. When it finishes you get the IPA two ways:
   - **Release (easiest on the phone):**
     <https://github.com/charley2004/vitalis/releases/download/ios-latest/vitalis-unsigned.ipa>
   - **Artifact:** the run page → `vitalis-unsigned-ipa` (a zip containing the `.ipa`).

If the run fails, the failing step's log says why. The usual suspects are an
Xcode/Expo mismatch or a CocoaPods hiccup; re-running is free.

---

## 2. Put AltServer on the PC

1. Install **iTunes** and **iCloud for Windows** from Apple's own site:
   - <https://www.apple.com/itunes/download/win64>
   - <https://support.apple.com/en-us/106176>

   ⚠️ The Microsoft Store versions do **not** work with AltServer.

2. Download **AltServer for Windows** from <https://altstore.io>, unzip it, and
   run `AltServer.exe`. It lives in the system tray.
   Allow it through Windows Firewall on **private** networks when prompted.

3. Connect the iPhone by USB, unlock it, and tap **Trust This Computer**.

4. In iTunes: **Device → Summary → Options → Sync with this iPhone over Wi-Fi**.

---

## 3. Install AltStore on the iPhone (once)

1. On the iPhone: **Settings → Privacy & Security → Developer Mode → On**, then
   restart and confirm. (Required from iOS 16 onward for AltStore-signed apps.)

2. AltServer tray icon → your iPhone → **Install AltStore** → sign in with your
   Apple ID (and the 2FA code if asked).

3. iPhone: **Settings → General → VPN & Device Management** → tap your Apple ID →
   **Trust**.

4. Open **AltStore**. If it asks for Local Network access, allow it.

> Free Apple ID limits: **3 apps** at a time (AltStore itself counts as one),
> **10 App IDs per week**, and **7-day** signatures.

---

## 4. Install Vitalis

1. On the iPhone, open the IPA link in **Safari** and let it download:

   <https://github.com/charley2004/vitalis/releases/download/ios-latest/vitalis-unsigned.ipa>

   It lands in **Files → Downloads**. (Or copy it from the PC via iCloud Drive,
   Google Drive, or a local HTTP server — anything that gets the file into the
   Files app.)

2. AltStore → **My Apps** → **+** → choose `vitalis-unsigned.ipa`.

3. Wait about a minute. If iOS says "Untrusted Developer", go to
   **Settings → General → VPN & Device Management** and trust your Apple ID.

4. Open Vitalis. Allow **notifications**, **microphone**, **speech recognition**,
   and later **Face ID** when it asks. The onboarding screen runs first.

---

## 5. Keep it alive (the 7-day clock)

The signature is valid for 7 days. AltStore refreshes it in the background when:

- AltServer is running on this PC (enable **Start AltServer at login** in its
  tray menu),
- the PC is awake and on the **same Wi-Fi** as the iPhone,
- iTunes "Sync over Wi-Fi" is enabled for the device,
- iOS **Background App Refresh** is on for AltStore, and AltStore's own
  **Background Refresh** setting is on.

At least once a week, or whenever the app refuses to open:

1. Put the iPhone on the same Wi-Fi as the PC.
2. Open **AltStore → My Apps → Refresh All** (or pull down).
3. The app opens again. **Data is preserved** — refreshing is not a reinstall.

If AltStore itself has expired, reinstall AltStore through AltServer
(**Install AltStore** again); do **not** delete Vitalis.

---

## 6. Updating Vitalis

1. Make your code changes and `git push`.
2. Run the **iOS sideload build** workflow.
3. Download the new IPA (same link) and install it from AltStore's **+** over the
   existing app.

Same bundle ID, so the new build replaces the old one and keeps your data.
`ios.buildNumber` is fixed at `1`; AltStore does not care, but bump it if you
ever also use EAS/TestFlight.

---

## 7. Other free tools (optional)

| Tool | Refresh | Notes |
| --- | --- | --- |
| **AltStore Classic** (this guide) | Auto over Wi-Fi, needs the PC | Most documented; AltServer does the installing. |
| **SideStore** | On-device, no PC after setup | Needs a one-time pairing file made on the PC (`idevice_pair`/`iloader`) and its local VPN. More setup, better long-term. |
| **Sideloadly** | Manual, every 7 days | Simplest single install: USB, drag the IPA in, enter Apple ID. No background refresh. |
| **TrollStore** | Permanent | Only on specific older iOS versions; **not** for iOS 18+. |

---

## iOS limitations worth knowing

1. **Notifications are local only.** No remote push. That's fine for this app —
   every reminder is scheduled on-device — but nothing can be pushed to the
   phone from a server.
2. **The mute switch silences notification sounds.** "Routine alarms" are
   notifications, not Clock-app alarms, so on silent mode you get the banner
   without sound. Real alarm behaviour needs the Critical Alerts entitlement,
   which Apple grants only to approved apps (and needs the paid program).
3. **iOS caps pending notifications per app (64 soonest-fire win).** With many
   routines plus hydration plus a busy Planner, the least-imminent ones can be
   dropped until the app reschedules. Opening the app rebuilds the schedule.
4. **Reinstall/refresh can clear pending notifications** until the next app open
   (the app reschedules on launch).
5. **Deleting the app deletes its data** (AsyncStorage). Use Settings → Account &
   Sync to keep a Supabase copy if you care about that.
6. **Face ID / PIN** is stored in the iOS Keychain and is tied to your signing
   identity; re-signing with the same Apple ID keeps it.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `0xe8008016`, "invalid entitlements", app installs but won't launch | The push entitlement slipped in. Confirm the Actions step "Check the build is free-account signable" passed and that `plugins/withLocalOnlyNotifications.js` is last in `app.json`'s `plugins`. |
| "AltStore could not connect to AltServer" | Same Wi-Fi, AltServer running, firewall allows it, iTunes Wi-Fi sync enabled, iPhone unlocked. Try USB once. |
| "Not enough available App IDs" | Free accounts get 10 App IDs/week; delete unused apps or wait. |
| "Unable to install — certificate limit reached" | Free accounts have a small certificate cap; AltStore may ask to revoke an old one. |
| App icon is greyed out / "Unable to Verify App" | Signature expired or profile untrusted: refresh in AltStore; re-trust under VPN & Device Management. |
| Build fails at `npm ci` | The lockfile is out of sync with `package.json`; run `npm install` locally and commit the updated lockfile. |
| Build fails in `xcodebuild` | Read the log; re-run once. If it persists, the Expo SDK/Xcode pairing is the likely cause. |

---

## Why this is free and legal

Apple allows any Apple ID to install apps signed with a **personal development
certificate** on up to 3 of your own devices, for 7 days at a time. AltStore
automates exactly that. You are not redistributing apps or bypassing a paid
license — you are building your own app and signing it for yourself.

The only way to remove the 7-day refresh entirely is a **paid Apple Developer
Program membership** ($99/year, ad-hoc distribution or TestFlight internal
testing). The build workflow here is compatible with both; the only change for
that route is `eas build --platform ios --profile preview` after registering
your device with `eas device:create`.
