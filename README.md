# Contextual Vocabulary Tracker

Gesture-driven vocabulary capture with an Apple Books–style Digital Bookshelf.
React Native (Expo) for **iOS + Android**. ECDICT-backed EN→ZH lookups.

## Quick start

From the **repo root**:

```bash
npm start
```

Or in Cursor: **Run and Debug** → **Start Vocab App (Expo)**.

Then in the Expo terminal press:
- `i` — iOS Simulator
- `a` — Android emulator
- scan QR — Expo Go on your phone

Entry is Expo Router (`expo-router/entry` in `apps/mobile/package.json`) — no separate root `index` file.

First-time install:

```bash
cd apps/mobile && npm install --legacy-peer-deps
cd ../services/api && npm install && npm run build:db
```

Optional: point the app at the local dictionary API:

```bash
# apps/mobile/.env
EXPO_PUBLIC_API_URL=http://localhost:8787
```

On a physical device, use your machine LAN IP instead of `localhost`.

## Dictionary API (ECDICT)

Full ECDICT (~770k words) is supported.

```bash
cd services/api
npm install
# First time only — downloads/builds if ecdict.csv is present:
npm run build:db
npm run dev         # http://localhost:8787
```

Android emulator reaches this API at `http://10.0.2.2:8787` automatically.
iOS simulator uses `http://localhost:8787`.
On a physical phone, set `EXPO_PUBLIC_API_URL` to your Mac’s LAN IP.

If the API is offline, the app falls back to Wiktionary + MyMemory translation.

## MVP features

- **Books tab** — Reading Now carousel + Library shelves (locked UI)
- **Cards / Stats** — due reviews + capture totals
- **Add source** — Open Library cover lookup
- **Look up** — screenshot/camera, circle/underline gesture, ECDICT-style define + Free Dictionary audio
- **Local SQLite** — sources + vocabulary entries offline-first

## Project layout

```
apps/mobile       Expo React Native app
services/api      Express + ECDICT SQLite
docs/             Product design + UI reference
```
