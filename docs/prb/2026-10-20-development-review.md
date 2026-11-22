# PRBsim development review

The October 20, 2026 review preceded the research workbench. The
[research index](INDEX.md) links findings to the later implementation, and
the [work log](WORK_LOG.md) records subsequent checks.

## Source and measurement limits

- Landsat 8/9 thermal bands are sampled at 100 m and delivered on a 30 m
  resampled grid. A hot feature smaller than the sampling scale can affect a
  mixed pixel. Detectability depends on size, contrast, sampling, and noise.
  Collection 2 surface temperature has cloud, emissivity, and missing-data
  limitations and excludes nighttime processing. [USGS instrument documentation](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-landsat-archives-landsat-8-9-operational-land-imager-and) · [USGS product limitations](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature)
- The September 2025 reporting attributes 107 mapped seams to Cory Cheguis
  and CM Thermal and Fire, LLC. The review found no primary coordinates,
  pre-fire coverage, or definition of the counting unit in the reviewed
  sources. An official-site search did not substantiate the cited February
  2026 Montana DES/county bulletin. [Original reporting](https://montanafreepress.org/2025/09/11/smoldering-in-plain-sight-how-coal-seam-mapping-is-helping-mitigate-fire-risk-across-the-state/)
- A negative survey documents the result of the stated method within its
  effective coverage and conditions. ODK location accuracy is an estimated
  68% confidence radius. A reported zero can be associated with manual
  placement or mock location. ODK distinguishes logical submissions from
  versions of those submissions. [ODK location fields](https://docs.getodk.org/form-question-types/#capturing-geospatial-data) · [ODK submission versioning](https://docs.getodk.org/central-api-submission-management/)
- The cited coupled coal-combustion study compared its model with measurements
  from a mining-influenced seam in Xinjiang. Its measurements and validation
  apply to that setting. The local heat lab uses prescribed boundaries and
  conduction. Field-confirmed combustion and causation require other evidence.
  [Coupled-process study](https://www.mdpi.com/2571-6255/9/10/440)

## Observed software baseline

A synthetic diagnostic selected August 24, 2024 and returned a September 1
progression snapshot. A second diagnostic supplied matching synthetic survey
records while the checklist still reported missing coverage. A third reproduced
a month-precision observation treated as an exact date. The index records the
later fixes under L1–L3.

At this checkpoint, 29 unit tests passed and the production build succeeded.
The diagnostic inputs were kept out of the empirical datasets.
