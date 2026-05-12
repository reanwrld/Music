# AudioMobile iOS Wrapper

This folder contains a native iOS wrapper for the FastAPI music app. The iPhone app opens the web app inside `WKWebView`, so the Python backend still needs to be reachable.

## Option 2: AltStore / Sideloadly

Use this when you want the app on your iPhone without the App Store or TestFlight.

What you need:

- A Mac or Windows computer for AltStore or Sideloadly.
- A free Apple ID.
- A GitHub, GitLab, or Bitbucket repo connected to Codemagic.
- The `.ipa` file from Codemagic.
- Your backend server reachable by the iPhone.

Free Apple ID limits:

- Apps usually expire after 7 days and need refreshing.
- AltStore needs AltServer running on your computer, or your phone connected by USB, when refreshing.
- Apple limits free sideloading to a small number of active apps.

## Build The IPA

This repo includes `../codemagic.yaml` with a workflow named:

```text
AudioMobile Sideload IPA
```

In Codemagic:

1. Push this project to a Git repo.
2. Import the repo into Codemagic.
3. Click `Start new build`.
4. Choose `AudioMobile Sideload IPA`.
5. Start the build.
6. When it finishes, download this artifact:

```text
AudioMobile-sideload.ipa
```

This IPA is packaged for AltStore or Sideloadly. It is not uploaded to App Store Connect.

## Install With Sideloadly

This is usually the simplest path.

1. Install Sideloadly on your Mac or Windows computer.
2. Connect your iPhone with USB and tap `Trust This Computer`.
3. Open Sideloadly.
4. Drag `AudioMobile-sideload.ipa` into Sideloadly.
5. Select your iPhone.
6. Enter your Apple ID.
7. Click `Start`.
8. On your iPhone, open `Settings` -> `General` -> `VPN & Device Management` and trust your Apple ID developer profile if iOS asks.
9. If iOS asks for Developer Mode, enable it in `Settings` -> `Privacy & Security` -> `Developer Mode`, then restart the phone.

After that, open the `Music` app from your Home Screen.

## Install With AltStore

1. Install AltServer on your Mac or Windows computer.
2. Use AltServer to install AltStore on your iPhone.
3. Keep AltServer running.
4. Put `AudioMobile-sideload.ipa` somewhere your iPhone can access, like iCloud Drive or Files.
5. On your iPhone, open the IPA in Files and share it to AltStore.
6. AltStore signs and installs the app.
7. Refresh the app in AltStore before it expires.

## Run The Backend Locally

Right now the iPhone app points to this URL in `AudioMobile/AppConfig.swift`:

```text
http://192.168.4.51:8001
```

That works only when your Mac is running the server and your iPhone is on the same Wi-Fi.

From the repo root:

```bash
source venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8001
```

If your Mac IP changes, update `AudioMobile/AppConfig.swift`, rebuild the IPA, and reinstall it.

For an app that works anywhere, deploy the FastAPI backend online with HTTPS, then replace the URL before building.

## TestFlight Backup Path

The same `../codemagic.yaml` still includes `AudioMobile TestFlight` in case you later want Apple's TestFlight install flow. That path requires App Store Connect setup and Apple Developer signing.

## Local Xcode Path

If you later install a compatible Xcode, open:

```text
ios/AudioMobile.xcodeproj
```

Then select your iPhone as the run target and press Run.
