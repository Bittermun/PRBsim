# Thermal coverage from a public drone survey

The September 28, 2021 Kanderfirn OpenDroneMap validation raster has **7,149 numeric temperature cells and 5,139 unknown cells** in the selected 128 × 96 window. A bounding rectangle would treat all 12,288 cells as covered. The figure uses grey for missing cells and a separate temperature scale for the recorded samples. [Jérôme Messmer and Alexander R. Groos, Zenodo v1.0.0, CC BY 4.0](https://doi.org/10.5281/zenodo.7692542)

The source archive member is `surface_temperature/kanderfirn_ts_val_e0.97_2021-09-28_odm.tif`, SHA-256 `e71ef84f7c6b135897088592e90072db03e8a47ec7d81786ce564e685a1f6b18`. This is the ice/snow validation product documented in degrees Celsius at emissivity 0.97. It has CRS EPSG:32632, approximately 0.13008 m square grid cells, identity scale and offset, and a band mask based on a floating-point NoData value. The later Zenodo release has a different product set. [Dataset contents and versions](https://zenodo.org/records/7692542)

## Replay

With Python, Rasterio, NumPy and Matplotlib installed, extract the one TIFF from the v1 archive or use the copy in the local results. From the repository root:

```powershell
python scripts/prb/inspect_thermal_coverage.py PATH_TO_TIFF --window 768 224 128 96 --units "Degrees Celsius" --source-url https://doi.org/10.5281/zenodo.7692542 --license CC-BY-4.0 --attribution "Messmer and Groos | Zenodo 7692542 | CC BY 4.0" --out-dir thermal-check
```

The script writes the side-by-side figure and a GeoJSON coverage layer. The mask requires a finite temperature value and a valid band pixel. The GeoJSON preserves covered and unknown areas and the window, units, and source digest. I re-rasterized the exported polygons back onto the source grid and matched all 12,288 classifications. Direct source samples at column 768, row 224 and column 779, row 224 returned −2.13 °C and masked, respectively.

The example measures availability in one published product. An anomaly review would need its own detection rule, calibration and conditions. PRBsim's survey importer requires a reported detection result, so the coverage-only output is a separate file for review in a GIS. Its unknown polygons retain that status.
