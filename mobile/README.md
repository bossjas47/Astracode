# AstraCode mobile (Capacitor shell)

The app is a thin native shell that loads the live site (`server.url` in `capacitor.config.json`), so web deploys update the app without a store release.

## You do (needs your machine and store accounts)
1. `cd mobile && npm install`
2. `npm run add:android` and/or `npm run add:ios` (iOS needs a Mac with Xcode).
3. Copy `../astracode/public/icon-512.png` into the native projects as the app icon (use `@capacitor/assets` if you want all sizes).
4. `npm run sync`, then `npm run android` / `npm run ios` to open Android Studio / Xcode, test on a device, build a signed release.
5. Submit: Google Play Console ($25 once) and Apple Developer Program ($99/year).

## Notes
- Apple may reject a shell that only wraps a website (guideline 4.2). Add native value first: push notifications, share target, or biometric lock.
- Change `appId` if you use another bundle id before the first store upload; it cannot change afterwards.
- Keep Turnstile/CSP in mind: the site's CSP must allow the app's WebView origin if you later load local files.
