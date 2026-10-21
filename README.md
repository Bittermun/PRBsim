# PRBsim

[Development concepts, strategies, and lessons index](docs/prb/INDEX.md)

[Project working memory and learning log](docs/prb/WORK_LOG.md)

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite.

Use **Research tools** in the header to preview and import local evidence packages, search Landsat scene metadata, or compare illustrative heat conduction at two depths. Imports remain local unreviewed reports; the downloadable training package is synthetic and stays hidden until synthetic fixtures are enabled. [Import format and limits](docs/prb/local-evidence-format.md).

Scene discovery finds available satellite records; it does not process temperature pixels or detect coal fires. The heat lab checks stage-one conduction calculations and does not simulate combustion or predict site behavior. No verified underground-fire inventory has been added to the bundled evidence.

Checks:

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser checks use an isolated development server on port 5175. The separately tagged live catalog test runs only when `PRB_LIVE_CATALOG=1`; the live cartography check uses `PRB_LIVE_MAP=1`. Ordinary catalog and map rendering checks use deterministic fixtures. CI also runs Chromium workflows and retains failure traces.
