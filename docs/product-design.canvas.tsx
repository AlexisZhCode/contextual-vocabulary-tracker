import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  TodoList,
  UsageBar,
  useHostTheme,
} from "cursor/canvas";

export default function ProductDesign() {
  const theme = useHostTheme();

  return (
    <Stack gap={28} style={{ padding: 24, maxWidth: 960 }}>
      <Stack gap={8}>
        <Row gap={8} align="center" wrap>
          <Pill tone="info" active>
            Design doc
          </Pill>
          <Pill tone="neutral">React Native</Pill>
          <Pill tone="neutral">ECDICT EN→ZH</Pill>
          <Pill tone="success">Plan locked · build pending</Pill>
          <Pill tone="info" active>
            Bookshelf UI locked
          </Pill>
        </Row>
        <H1>Contextual Vocabulary Tracker</H1>
        <Text tone="secondary">
          Gesture-driven vocabulary capture from live camera or screenshots.
          Circle or underline a word, get an instant English→Chinese definition,
          and file it on a Digital Bookshelf by source material — preserving
          literary context instead of dumping words into a spreadsheet.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="Phase 1" label="MVP scope" tone="info" />
        <Stat value="~4 weeks" label="Vibe-code MVP" />
        <Stat value="On-device" label="OCR + gestures" />
        <Stat value="Serverless" label="ECDICT on Lambda" />
      </Grid>

      <Callout tone="info" title="How we build">
        You drive product calls; Cursor (this agent) vibe-codes in short
        ordered slices — scaffold → capture → dictionary → bookshelf → polish.
        Nothing ships until you say go; this page is the shared source of truth.
      </Callout>

      <Divider />

      <Stack gap={12}>
        <H2>UI reference — Bookshelf (locked)</H2>
        <Callout tone="success" title="Visual direction">
          Apple Books–style light UI. Large “Bookshelf” title, collapsible
          Reading Now + Library, cover-led horizontal shelf, inset category list,
          tab bar Books · Cards · Stats. Capture is opened from + / save flow,
          not a root tab.
        </Callout>
        <Grid columns={2} gap={12}>
          <Card>
            <CardHeader>Screen structure</CardHeader>
            <CardBody>
              <Table
                headers={["Region", "Behavior"]}
                framed={false}
                rows={[
                  ["Top bar", "Edit (left) · + add source (right)"],
                  ["Title", "Large bold “Bookshelf”"],
                  [
                    "Reading Now",
                    "Horizontal covers + progress; collapsible",
                  ],
                  [
                    "Library",
                    "Inset white list: categories + counts + chevrons",
                  ],
                  ["Tab bar", "Books (active) · Cards · Stats"],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>Vocab adaptations (not raw Apple Books)</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small" tone="secondary">
                  Under each cover: word progress, not reading time — e.g. “12
                  words · 3 due” + thin progress (reviewed / saved).
                </Text>
                <Text size="small" tone="secondary">
                  Library rows map to source shelves / queues, not ebook
                  reading states only.
                </Text>
                <Text size="small" tone="secondary">
                  Cards tab = vocabulary review. Stats = capture & retention.
                </Text>
                <Text size="small" tone="tertiary">
                  Ref image: docs/references/bookshelf-ui.png
                </Text>
              </Stack>
            </CardBody>
          </Card>
        </Grid>
        <Table
          headers={["Library row", "MVP meaning", "Count shows"]}
          striped
          rows={[
            ["Library", "All sources (books / PDFs / articles)", "Source count"],
            ["To Read", "Sources added, no words saved yet", "Source count"],
            ["Reading Now", "Active sources with recent captures", "Source count"],
            ["Finished", "Sources marked done learning", "Source count"],
            ["Abandoned", "Archived / dropped sources", "Source count"],
            ["Starred", "Pinned sources", "Source count"],
          ]}
        />
        <H3>Visual tokens</H3>
        <Table
          headers={["Token", "Spec"]}
          rows={[
            ["Background", "System grouped gray (#F2F2F7-like)"],
            ["Surfaces", "Pure white inset cards, ~12–16pt corner radius"],
            ["Type", "iOS SF-style: heavy title, gray secondary under covers"],
            ["Covers", "~2:3 aspect, ~8–12pt radius; art carries color"],
            ["Accent", "From covers + black active tab; avoid purple AI defaults"],
            ["Chrome", "Edit text button, circular + , SF-style list icons"],
          ]}
        />
      </Stack>

      <Stack gap={12}>
        <H2>Product pillars</H2>
        <Grid columns={3} gap={12}>
          <Card>
            <CardHeader>Zero-friction lookup</CardHeader>
            <CardBody>
              <Text size="small" tone="secondary">
                Camera or screenshot in; circle / underline the word. No typing,
                no leaving the page, no DRM fights.
              </Text>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>Context-dependent memory</CardHeader>
            <CardBody>
              <Text size="small" tone="secondary">
                Words live under the book or article they came from — same
                sentence voice, same mental shelf.
              </Text>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>Local speed, light cloud</CardHeader>
            <CardBody>
              <Text size="small" tone="secondary">
                Gestures and OCR stay on device. Lambda only serves ECDICT,
                audio URLs, and cover art.
              </Text>
            </CardBody>
          </Card>
        </Grid>
      </Stack>

      <Stack gap={12}>
        <H2>Tech stack</H2>
        <Table
          headers={["Layer", "Choice", "Role"]}
          striped
          rows={[
            [
              "Mobile",
              "Expo (dev client) + React Native + TypeScript",
              "UI, gestures, camera, local notebook",
            ],
            [
              "Gestures",
              "RNGH + SVG overlay",
              "Circle / freehand underline → ROI",
            ],
            [
              "OCR",
              "Apple Vision (iOS) + ML Kit (Android)",
              "On-device text from crop",
            ],
            [
              "Local DB",
              "expo-sqlite",
              "Sources, entries, quotes (offline-first)",
            ],
            [
              "API",
              "API Gateway + Node.js Lambda",
              "Define / audio / cover endpoints",
            ],
            [
              "Dictionary",
              "skywind3000/ECDICT → SQLite layer",
              "EN→ZH, phonetic, POS, tags",
            ],
            [
              "Audio",
              "Free Dictionary API",
              "English pronunciation URLs",
            ],
            [
              "Covers",
              "Google Books API + gradient/screenshot fallback",
              "Bookshelf artwork",
            ],
            [
              "Observability",
              "Playwright synthetic canaries",
              "API latency + health (post-MVP OK)",
            ],
          ]}
        />
        <Text size="small" tone="tertiary">
          Dictionary source: https://github.com/skywind3000/ECDICT · Runtime:
          converted SQLite bundled in Lambda (CSV not queried live).
        </Text>
      </Stack>

      <Stack gap={12}>
        <H2>Architecture & data flow</H2>
        <Card>
          <CardHeader>Phase 1 path</CardHeader>
          <CardBody>
            <Stack gap={10}>
              <Text size="small">
                Camera frame or screenshot → gesture mask → crop ROI → on-device
                OCR → normalize word → confirm chip → API define + audio → save
                to Source on Digital Bookshelf.
              </Text>
              <Table
                headers={["Step", "Where", "Output"]}
                framed={false}
                rows={[
                  ["1. Capture", "Device", "Still image"],
                  ["2. Gesture", "Device", "Bounding region"],
                  ["3. OCR", "Device", "Candidate string(s)"],
                  ["4. Lookup", "Lambda + ECDICT", "ZH gloss, phonetic, POS"],
                  ["5. Audio", "Free Dictionary", "Optional mp3 URL"],
                  ["6. Persist", "expo-sqlite", "Entry under Source"],
                ]}
              />
            </Stack>
          </CardBody>
        </Card>
        <Grid columns={2} gap={12}>
          <Card>
            <CardHeader>ECDICT lookup rules</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small" tone="secondary">
                  Exact <Text as="span" weight="semibold">word</Text> → fuzzy{" "}
                  <Text as="span" weight="semibold">sw</Text> (strip-word) →
                  lemma via <Text as="span" weight="semibold">exchange</Text> →
                  return phonetic, translation, pos.
                </Text>
                <Text size="small" tone="tertiary">
                  MVP UI fields: word, phonetic, translation (ZH), pos. EN
                  definition optional secondary.
                </Text>
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>Local data model</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small" tone="secondary">
                  Source: id, title, author?, isbn?, coverUrl?, coverFallback,
                  status (toRead|readingNow|finished|abandoned), starred,
                  createdAt, lastCapturedAt?
                </Text>
                <Text size="small" tone="secondary">
                  Entry: id, sourceId, word, phonetic?, pos?, glossZh, audioUrl?,
                  sentence? (P2), contextualGloss? (P2), createdAt
                </Text>
              </Stack>
            </CardBody>
          </Card>
        </Grid>
      </Stack>

      <Stack gap={12}>
        <H2>Phased delivery</H2>
        <Text tone="secondary">
          Effort share across the vibe-code plan (relative, not calendar days).
        </Text>
        <UsageBar
          total={100}
          topLeftLabel="MVP effort mix"
          topRightLabel="P0 10% · Capture 30% · Dict 20% · Shelf 25% · Polish 15%"
          segments={[
            { id: "p0", value: 10, color: "blue" },
            { id: "capture", value: 30, color: "cyan" },
            { id: "dict", value: 20, color: "green" },
            { id: "shelf", value: 25, color: "orange" },
            { id: "polish", value: 15, color: "purple" },
          ]}
        />

        <H3>Phase 0 — Foundation</H3>
        <Card>
          <CardBody>
            <TodoList
              todos={[
                {
                  id: "p0-1",
                  content:
                    "Monorepo: apps/mobile (Expo), services/api (Lambda), packages/shared",
                  status: "pending",
                },
                {
                  id: "p0-2",
                  content:
                    "TypeScript, tab bar Books | Cards | Stats; Capture via + / modal; Apple Books tokens",
                  status: "pending",
                },
                {
                  id: "p0-3",
                  content: "IaC stub + API health route; ECDICT download→SQLite build script",
                  status: "pending",
                },
              ]}
            />
          </CardBody>
        </Card>

        <H3>Phase 1 — Core utility (MVP)</H3>
        <Grid columns={2} gap={12}>
          <Card>
            <CardHeader trailing={<Pill size="sm" active>Critical path</Pill>}>
              1A · Capture & gestures
            </CardHeader>
            <CardBody>
              <TodoList
                todos={[
                  {
                    id: "p1a-1",
                    content: "Screenshot import + camera freeze frame",
                    status: "pending",
                  },
                  {
                    id: "p1a-2",
                    content: "Circle / underline stroke → ROI crop",
                    status: "pending",
                  },
                  {
                    id: "p1a-3",
                    content: "On-device OCR + candidate chips + confirm",
                    status: "pending",
                  },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>1B · Dictionary routing</CardHeader>
            <CardBody>
              <TodoList
                todos={[
                  {
                    id: "p1b-1",
                    content: "GET /v1/define/:word → ECDICT SQLite (exact → sw → lemma)",
                    status: "pending",
                  },
                  {
                    id: "p1b-2",
                    content: "GET /v1/audio/:word → Free Dictionary (graceful miss)",
                    status: "pending",
                  },
                  {
                    id: "p1b-3",
                    content: "Word detail sheet: gloss, phonetic, POS, play audio",
                    status: "pending",
                  },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>1C · Digital Bookshelf UI</CardHeader>
            <CardBody>
              <TodoList
                todos={[
                  {
                    id: "p1c-1",
                    content: "Create/select Source on save; local SQLite + status fields",
                    status: "pending",
                  },
                  {
                    id: "p1c-2",
                    content:
                      "Match ref: Reading Now carousel + Library category list + Edit/+",
                    status: "pending",
                  },
                  {
                    id: "p1c-3",
                    content: "Google Books covers; gradient/screenshot fallback",
                    status: "pending",
                  },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>1D · MVP done criteria</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small" tone="secondary">
                  Gesture → correct word on clear English print in most cases.
                </Text>
                <Text size="small" tone="secondary">
                  Definition (+ optional audio) within ~1–2s after OCR.
                </Text>
                <Text size="small" tone="secondary">
                  Word appears under a bookshelf source with cover or fallback.
                </Text>
              </Stack>
            </CardBody>
          </Card>
        </Grid>

        <H3>Phase 2 — Context-aware intelligence</H3>
        <Card>
          <CardBody>
            <TodoList
              todos={[
                {
                  id: "p2-1",
                  content: "Silent sentence OCR around gesture ROI",
                  status: "pending",
                },
                {
                  id: "p2-2",
                  content: "LLM endpoint: word + sentence → intended sense + short ZH gloss",
                  status: "pending",
                },
                {
                  id: "p2-3",
                  content: "Quote of origin on entry; review cards with author voice",
                  status: "pending",
                },
                {
                  id: "p2-4",
                  content: "Optional spaced repetition (SM-2-like) on bookshelf entries",
                  status: "pending",
                },
              ]}
            />
          </CardBody>
        </Card>
      </Stack>

      <Stack gap={12}>
        <H2>Vibe-coding timeline</H2>
        <Text tone="secondary">
          Assumes focused Cursor sessions with you reviewing slices daily.
          Calendar starts when you order build. Adjust if iOS-only first.
        </Text>
        <Table
          headers={["Week", "Focus", "You do", "Agent does", "Exit gate"]}
          striped
          stickyHeader
          rowTone={["info", "info", "info", "success", "neutral"]}
          rows={[
            [
              "W1",
              "Scaffold + ECDICT API",
              "Approve repo layout, AWS account access",
              "Expo app, Lambda /define, SQLite packaging",
              "curl word → ZH gloss",
            ],
            [
              "W2",
              "Capture pipeline",
              "Try on real books/PDFs; flag OCR misses",
              "Camera, picker, gestures, OCR, confirm chips",
              "Circle word → candidate string",
            ],
            [
              "W3",
              "Bookshelf + save",
              "Name 2–3 sample sources; UX nits",
              "Local DB, save flow, covers, detail + audio",
              "Word saved under a cover",
            ],
            [
              "W4",
              "MVP harden",
              "Acceptance pass on device",
              "Edge cases, lemma fallback, canary, polish",
              "Phase 1 success criteria met",
            ],
            [
              "W5–6",
              "Phase 2 kickoff",
              "Pick LLM vendor + prompt tone",
              "Sentence capture, contextual gloss, quotes",
              "Entry shows quote of origin",
            ],
          ]}
        />
        <Callout tone="neutral" title="Working rhythm">
          One ordered slice per session (e.g. “build gesture ROI only”). You
          test on device; I fix from screenshots/logs. No parallel big-bang
          branches — mergeable vertical slices.
        </Callout>
      </Stack>

      <Stack gap={12}>
        <H2>Repo shape (when greenlit)</H2>
        <Card>
          <CardBody>
            <Stack gap={4}>
              <Text size="small" style={{ fontFamily: "monospace" }}>
                /apps/mobile — Expo React Native
              </Text>
              <Text size="small" style={{ fontFamily: "monospace" }}>
                /services/api — Lambda handlers + ECDICT packaging
              </Text>
              <Text size="small" style={{ fontFamily: "monospace" }}>
                /packages/shared — types, word normalize
              </Text>
              <Text size="small" style={{ fontFamily: "monospace" }}>
                /infra — SAM | CDK | Terraform (pick at build)
              </Text>
              <Text size="small" style={{ fontFamily: "monospace" }}>
                /canaries — Playwright API smokes
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Stack>

      <Stack gap={12}>
        <H2>Open decisions before build</H2>
        <Table
          headers={["#", "Decision", "Default if you defer"]}
          rows={[
            ["1", "iOS only / Android / both for v1", "Both via Expo; ship iOS first if needed"],
            ["2", "Accounts vs local-only MVP", "Local-only device notebook"],
            ["3", "IaC: SAM, CDK, or Terraform", "AWS SAM"],
            ["4", "Monorepo tooling", "pnpm workspaces, light (no heavy Turborepo)"],
            ["5", "Covers in day-one MVP?", "Yes — Google Books + fallback"],
          ]}
        />
      </Stack>

      <Stack gap={8}>
        <H2>Explicitly out until you order</H2>
        <Text tone="secondary">
          No app scaffolding, dependency installs, Lambda deploys, or ECDICT
          packaging until you say go. This canvas is the plan artifact only.
        </Text>
        <Row gap={8} wrap>
          <Pill tone="warning">Build paused</Pill>
          <Text size="small" tone="tertiary">
            Next message: answer opens or “use defaults — start Phase 0”.
          </Text>
        </Row>
      </Stack>

      <Text size="small" tone="quaternary" style={{ color: theme.text.quaternary }}>
        Contextual Vocabulary Tracker · product & technical design · aligned to
        ECDICT + React Native plan · Aug 2026
      </Text>
    </Stack>
  );
}
