# Contextual Vocabulary Tracker — Product & Technical Design

**Status:** Plan locked · build pending · **Bookshelf UI locked**  
**Stack:** React Native (Expo) · ECDICT EN→ZH · Serverless Lambda  
**MVP target:** ~4 weeks vibe-coding with Cursor  
**UI ref:** [`docs/references/bookshelf-ui.png`](./references/bookshelf-ui.png)

---

## Overview

Gesture-driven vocabulary capture from live camera or screenshots. Circle or underline a word, get an instant English→Chinese definition, and file it on a Digital Bookshelf by source material — preserving literary context instead of dumping words into a spreadsheet.

### Product pillars

| Pillar | Intent |
| --- | --- |
| Zero-friction lookup | Camera or screenshot in; circle / underline the word. No typing, no leaving the page, no DRM fights. |
| Context-dependent memory | Words live under the book or article they came from — same sentence voice, same mental shelf. |
| Local speed, light cloud | Gestures and OCR stay on device. Lambda only serves ECDICT, audio URLs, and cover art. |

### How we build

You drive product calls; Cursor vibe-codes in short ordered slices — scaffold → capture → dictionary → bookshelf → polish. Nothing ships until you say go; this document is the shared source of truth.

---

## UI reference — Bookshelf (locked)

Apple Books–style light UI from the approved mock:

- Large **Bookshelf** title; **Edit** (left) and **+** (right)
- Collapsible **Reading Now**: horizontal cover carousel + progress under each cover
- Collapsible **Library**: inset white list with icon, label, count, chevron
- Tab bar: **Books** · **Cards** · **Stats**
- Capture is **not** a root tab — opened from **+** / save flow / modal

### Vocab adaptations (vs raw Apple Books)

| Apple Books | Our app |
| --- | --- |
| “7h 31m left” reading time | Word progress under cover, e.g. `12 words · 3 due` + thin bar (reviewed / saved) |
| Ebook library shelves | Source shelves (books / PDFs / articles) |
| — | **Cards** = vocabulary review; **Stats** = capture & retention |

### Library rows (MVP meaning)

| Row | Meaning | Count |
| --- | --- | --- |
| Library | All sources | Source count |
| To Read | Added, no words saved yet | Source count |
| Reading Now | Active sources with recent captures | Source count |
| Finished | Marked done learning | Source count |
| Abandoned | Archived / dropped | Source count |
| Starred | Pinned sources | Source count |

### Visual tokens

| Token | Spec |
| --- | --- |
| Background | System grouped gray (`#F2F2F7`-like) |
| Surfaces | Pure white inset cards, ~12–16pt radius |
| Type | iOS SF-style: heavy title, gray secondary under covers |
| Covers | ~2:3 aspect, ~8–12pt radius; cover art carries color |
| Accent | Covers + black active tab; avoid purple AI defaults |
| Chrome | Edit text, circular +, SF-style list icons |

---

## Tech stack

| Layer | Choice | Role |
| --- | --- | --- |
| Mobile | Expo (dev client) + React Native + TypeScript | UI, gestures, camera, local notebook |
| Gestures | RNGH + SVG overlay | Circle / freehand underline → ROI |
| OCR | Apple Vision (iOS) + ML Kit (Android) | On-device text from crop |
| Local DB | expo-sqlite | Sources, entries, quotes (offline-first) |
| API | API Gateway + Node.js Lambda | Define / audio / cover endpoints |
| Dictionary | [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT) → SQLite layer | EN→ZH, phonetic, POS, tags |
| Audio | Free Dictionary API | English pronunciation URLs |
| Covers | Google Books API + gradient/screenshot fallback | Bookshelf artwork |
| Observability | Playwright synthetic canaries | API latency + health (post-MVP OK) |

**Note:** ECDICT ships as CSV / `stardict.7z` in the upstream repo. Runtime uses **converted SQLite** bundled in a Lambda layer — CSV is not queried live.

---

## Architecture & data flow (Phase 1)

```
Camera frame or screenshot
  → gesture mask (circle / underline)
  → crop ROI
  → on-device OCR
  → normalize word
  → confirm chip
  → API define + audio
  → save to Source on Digital Bookshelf
```

| Step | Where | Output |
| --- | --- | --- |
| 1. Capture | Device | Still image |
| 2. Gesture | Device | Bounding region |
| 3. OCR | Device | Candidate string(s) |
| 4. Lookup | Lambda + ECDICT | ZH gloss, phonetic, POS |
| 5. Audio | Free Dictionary | Optional mp3 URL |
| 6. Persist | expo-sqlite | Entry under Source |

### ECDICT lookup rules

Exact `word` → fuzzy `sw` (strip-word) → lemma via `exchange` → return phonetic, translation, pos.

**MVP UI fields:** word, phonetic, translation (ZH), pos. EN definition optional secondary.

### Local data model

```
Source {
  id, title, author?, isbn?, coverUrl?, coverFallback,
  status: toRead | readingNow | finished | abandoned,
  starred, createdAt, lastCapturedAt?
}
Entry {
  id, sourceId, word, phonetic?, pos?, glossZh, audioUrl?,
  sentence? (P2), contextualGloss? (P2), createdAt
}
```

---

## Phased delivery

**MVP effort mix (relative):** P0 Scaffold 10% · Capture 30% · Dictionary 20% · Bookshelf 25% · Polish 15%

### Phase 0 — Foundation

- [ ] Monorepo: `apps/mobile` (Expo), `services/api` (Lambda), `packages/shared`
- [ ] TypeScript, tab bar **Books | Cards | Stats**; Capture via + / modal; Apple Books visual tokens
- [ ] IaC stub + API health route; ECDICT download → SQLite build script

### Phase 1 — Core utility (MVP)

#### 1A · Capture & gestures (critical path)

- [ ] Screenshot import + camera freeze frame
- [ ] Circle / underline stroke → ROI crop
- [ ] On-device OCR + candidate chips + confirm

#### 1B · Dictionary routing

- [ ] `GET /v1/define/:word` → ECDICT SQLite (exact → sw → lemma)
- [ ] `GET /v1/audio/:word` → Free Dictionary (graceful miss)
- [ ] Word detail sheet: gloss, phonetic, POS, play audio

#### 1C · Digital Bookshelf UI

- [ ] Create/select Source on save; local SQLite + status / starred fields
- [ ] Match ref: Reading Now carousel + Library category list + Edit / +
- [ ] Google Books covers; gradient/screenshot fallback

#### 1D · MVP done criteria

- Gesture → correct word on clear English print in most cases
- Definition (+ optional audio) within ~1–2s after OCR
- Word appears under a bookshelf source with cover or fallback; Bookshelf screen matches locked UI structure

### Phase 2 — Context-aware intelligence

- [ ] Silent sentence OCR around gesture ROI
- [ ] LLM endpoint: word + sentence → intended sense + short ZH gloss
- [ ] Quote of origin on entry; review cards with author voice
- [ ] Optional spaced repetition (SM-2-like) on bookshelf entries / Cards tab

---

## Vibe-coding timeline

Assumes focused Cursor sessions with daily review. Calendar starts when you order build.

| Week | Focus | You do | Agent does | Exit gate |
| --- | --- | --- | --- | --- |
| W1 | Scaffold + ECDICT API | Approve repo layout, AWS access | Expo app, tab shell matching UI, Lambda `/define`, SQLite packaging | `curl` word → ZH gloss; Books tab chrome matches ref |
| W2 | Capture pipeline | Try on real books/PDFs; flag OCR misses | Camera, picker, gestures, OCR, confirm chips | Circle word → candidate string |
| W3 | Bookshelf + save | Name 2–3 sample sources; UX nits | Local DB, Reading Now + Library, covers, detail + audio | Word saved; shelf matches ref |
| W4 | MVP harden | Acceptance pass on device | Edge cases, lemma fallback, canary, polish | Phase 1 success criteria met |
| W5–6 | Phase 2 kickoff | Pick LLM vendor + prompt tone | Sentence capture, contextual gloss, quotes, Cards | Entry shows quote of origin |

**Working rhythm:** One ordered slice per session. You test on device; agent fixes from screenshots/logs.

---

## Repo shape (when greenlit)

```
/apps/mobile       — Expo React Native
/services/api      — Lambda handlers + ECDICT packaging
/packages/shared   — types, word normalize
/infra             — SAM | CDK | Terraform (pick at build)
/canaries          — Playwright API smokes
/docs              — Design docs + UI references
```

---

## Open decisions before build

| # | Decision | Default if you defer |
| --- | --- | --- |
| 1 | iOS only / Android / both for v1 | Both via Expo; ship iOS first if needed |
| 2 | Accounts vs local-only MVP | Local-only device notebook |
| 3 | IaC: SAM, CDK, or Terraform | AWS SAM |
| 4 | Monorepo tooling | pnpm workspaces, light (no heavy Turborepo) |
| 5 | Covers in day-one MVP? | Yes — Google Books + fallback |
| 6 | Reading Now subtitle metric | `N words · M due` (not clock time) |

---

## Explicitly out until you order

No app scaffolding, dependency installs, Lambda deploys, or ECDICT packaging until you say go.

**Next step:** Answer the open decisions, or say “use defaults — start Phase 0”.

---

*Contextual Vocabulary Tracker · product & technical design · ECDICT + React Native · Aug 2026*
