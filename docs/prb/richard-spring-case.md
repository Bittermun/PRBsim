# Richard Spring fire evidence comparison

The mapped Richard Spring perimeter covers about **171,130 acres within Rosebud County**. The NRCS plan reports **128,403 acres across 17 coal-seam-attributed wildland fires** for the county in 2021. The two figures describe different records. The incident list behind the NRCS total is needed to determine whether it includes Richard Spring and how its acreage was counted.

| Record | Reported scope and value |
| --- | --- |
| WFIGS perimeter | Incident `2021-MTLG29-000428`, 171,130.1 GIS acres, cause fields `Natural / Other`. This record's investigation and polygon timestamp fields are empty. [Federal perimeter layer](https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0) |
| Northern Cheyenne watershed plan | Maps incident `MT-LG29-000428` at 171,130 acres using the August 18, 2021 perimeter. This corroborates which footprint and area were reported. [Watershed plan](https://www.epa.gov/system/files/documents/2024-09/northern-cheyenne-wbp_jan-2024.pdf) |
| Montana hazard mitigation plan | Reports August 8 discovery and attributes the ignition to coal seams, citing incident reporting. Treat it as a state attribution with the underlying investigation still unlocated. [State plan](https://des.mt.gov/Mitigation/FINAL_2023_MT_MHMP_20231003.pdf) |
| USDA NRCS Powder River County long-range plan | Reports 17 fires and 128,403 acres in neighboring Rosebud County. The passage gives a total without listing the 17 incident IDs or defining the acreage basis. [NRCS plan, pp. 38–39](https://www.nrcs.usda.gov/sites/default/files/2023-12/Montana-Powder-River-County-Long-Range-Plan-2023.pdf#page=38) |

## County boundary check

Queried WFIGS by the unique incident ID and Census TIGERweb by county GEOID `30087`. Projected the two WGS84 shapes to the contiguous US Albers equal-area CRS (EPSG:5070), intersected the polygons, and converted square metres to acres. The result on November 22, 2026 was **171,130.09 acres inside**, **0.00 outside**, and a numerical gap of **42,727.09 acres** against the NRCS aggregate. Clipping the federal geometry to this county boundary leaves the gap intact. It leaves open the incident membership, attribution process, and area definitions used in the aggregate. [Census TIGERweb counties](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1)

The generic federal cause category can accommodate a more specific account. Preserve both attributions and their sources until an incident investigation or code crosswalk establishes what each records. This example concerns surface-fire perimeter and reported origin. It supplies no measurement of underground fire extent or treatment response.

## Reproduce the calculation

From the repository root with Python, `shapely==2.2.0`, and `pyproj==3.8.0` installed:

```powershell
python scripts/prb/compare_richard_spring.py --source-dir "$env:TEMP/prbsim-richard-spring"
```

The command saves the two public GeoJSON responses on first use and reuses them on subsequent runs. It prints the query URLs, response SHA-256 values, source fields, and recomputed area. The WFIGS and TIGERweb response hashes for this run were `a64b72996653cc1800b7a4e6b5a77b3935b492fb3384ed3130cadee44cbe962f` and `4fa4c26b05ac7d5c062cd326826c6fc7af64ba3cbf46d98703ee5a798e3bd10e`, respectively. Live services can revise their records.

The most informative additional record is the 2021 incident list behind the NRCS summary, with incident IDs, origin classifications, and the acreage field used. It would show whether this perimeter belongs in the comparison.

## Matched Landsat surface temperature

The archived Powder River Basin preprint (D106, Appendix C) proposes comparing exposed seams within recent perimeters with matched unburned outcrops. Its evidence companion (A79) tracks claims to sources. The calculation here tests surface-temperature comparability near one incident using available Landsat and terrain data. Field evidence would be needed to establish which locations are seams and which reference locations stayed unburned.

The comparison uses August 4 and August 29, 2021 Landsat 8 Collection 2 Level 2 scenes. A September 5 window screened earlier was entirely cloud or dilated cloud. The matching run excluded fill, dilated cloud, cirrus, cloud, shadow, snow, and water. It required usable ST_B10 temperature and ST_QA no higher than 3 K on both dates, plus usable pre-event red and near-infrared bands and elevation. The surface-temperature package can have missing pixels where emissivity information is absent. [USGS quality bands](https://www.usgs.gov/landsat-missions/landsat-collection-2-quality-assessment-bands) · [USGS surface temperature](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature) · [USGS missing-data explanation](https://www.usgs.gov/faqs/why-does-my-landsat-collection-2-surface-temperature-product-have-missing-data)

The script projects data to UTM zone 13N and samples the 30 m product grid every 120 m. Interior locations are at least 240 m inside the perimeter. Reference locations are 360 m to 5 km outside it. Each pair is at most 6 km apart, with differences of at most 120 m elevation, 8° slope, 0.12 pre-event NDVI, and 4°C pre-event surface temperature. A reference location is used once. The script chooses pairs from their locations and pre-event covariates. [August 4 catalog item](https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2/items/LC08_L2SP_036028_20210804_02_T1) · [August 29 catalog item](https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2/items/LC08_L2SP_035028_20210829_02_T1) · [Copernicus DEM catalog tile](https://planetarycomputer.microsoft.com/api/stac/v1/collections/cop-dem-glo-30/items/Copernicus_DSM_COG_10_N45_00_W107_00_DEM)

| | Interior | Reference ring |
| --- | ---: | ---: |
| 30 m grid cells in study area | 722,814 | 782,114 |
| Cells with temperature on both dates and matching covariates | 582,903 | 549,285 |
| Available locations on the 120 m lattice | 36,419 | 34,348 |
| Locations retained in unique pairs | 14,838 | 14,838 |
| Mean temperature change in retained pairs | −13.13°C | −15.43°C |

The mean paired difference in change was **+2.29°C**. The first, second, and third quartiles of paired differences were +0.66°C, +2.31°C, and +3.94°C. Both groups cooled between the two daylight acquisitions. The selected locations represent about 41% of eligible interior samples and concentrate near the perimeter because eligible reference locations must be nearby. Adjacent pixels share spatial structure. The result describes surface temperature in the matched area on these two dates.

From the PRBsim repository with Python, Rasterio, Shapely, NumPy, SciPy, and Matplotlib installed, run the county boundary check above to download the WFIGS file. Then run the matching script.

```powershell
$case = "$env:TEMP/prbsim-richard-spring"
python scripts/prb/match_landsat_reference.py "$case/wfigs_richard_spring.geojson" "$case/Matched Landsat"
```

`matched-landsat.json` records the inputs, coverage, sampling rules, and aggregate result. `matched-pixels.csv` provides the pair-level inputs and differences. `matched-locations.png` maps the locations.
