# Vocab API

Express API for book resolve, chapter prep, screenshot extract, and dictionary lookup.

## ECDICT

Definitions come from a local SQLite build of [ECDICT](https://github.com/skywind3000/ECDICT).

```bash
# Place ecdict.csv under data/, then:
npm run build:db

# Smaller DB for Render / CI:
ECDICT_TRIM=1 npm run build:db
```

`*.sqlite` and `ecdict.csv` are gitignored. After a successful build, `GET /health` reports `"ecdict": true`.

## Render

- **Root Directory:** `services/api`
- **Build Command:** `bash scripts/render-build.sh`
- **Start Command:** `npm start`
- **Env:** `GEMINI_API_KEY`

The render script downloads ECDICT CSV from GitHub (~66MB), imports a trimmed SQLite (~11MB / ~45k learner words), deletes the CSV, then `npm start` serves the API. After deploy, `GET /health` should show `"ecdict": true`.

## Local

```bash
npm ci
npm run build:db   # starter DB if no CSV
npm run dev
```
