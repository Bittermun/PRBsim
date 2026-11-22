# PRBsim

PRBsim is a map and evidence workbench for wildfire perimeters, geological
context, and local observations. Use Node.js 24 or later.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite.

**Research tools** includes [local evidence import](docs/prb/local-evidence-format.md),
Landsat scene metadata search, and a one-dimensional conduction lab. Local
imports are unreviewed. Landsat search returns metadata, and the lab illustrates
conduction under prescribed conditions. The [source records](docs/prb/sources.md)
describe the bundled evidence and its limits.

[Research index](docs/prb/INDEX.md) · [Verification log](docs/prb/WORK_LOG.md)

Checks:

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser checks use an isolated development server on port 5175. The separately tagged live catalog test runs only when `PRB_LIVE_CATALOG=1`; the live cartography check uses `PRB_LIVE_MAP=1`. Ordinary catalog and map rendering checks use deterministic fixtures. CI also runs Chromium workflows and retains failure traces.
