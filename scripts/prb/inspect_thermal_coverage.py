"""Show valid values and missing cells in one window of a thermal GeoTIFF."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.warp import transform_geom
from rasterio.windows import Window


def coverage_report(source, window, units, source_url, license_name, attribution):
    col, row, width, height = map(int, window.flatten())
    raw = source.read(1, window=window)
    values = raw.astype("float64") * source.scales[0] + source.offsets[0]
    valid = (source.read_masks(1, window=window) > 0) & np.isfinite(values)
    if not (np.any(valid) and np.any(~valid)):
        raise ValueError("Choose a window with both valid and missing cells.")

    features = []
    for geometry, cell_class in shapes(valid.astype("uint8"), transform=source.window_transform(window)):
        features.append({
            "type": "Feature",
            "geometry": transform_geom(source.crs, "EPSG:4326", geometry, precision=9),
            "properties": {"coverage": "numeric_value" if cell_class == 1 else "unknown"},
        })
    samples = []
    for flag in (True, False):
        y, x = np.argwhere(valid == flag)[0]
        samples.append({
            "column": int(col + x), "row": int(row + y),
            "coverage": "numeric_value" if flag else "unknown",
            "temperature": float(values[y, x]) if flag else None,
        })
    with open(source.name, "rb") as raw_file:
        digest = hashlib.file_digest(raw_file, "sha256").hexdigest()
    record = {
        "type": "FeatureCollection",
        "metadata": {
            "source_url": source_url,
            "source_license": license_name,
            "source_attribution": attribution,
            "source_file": Path(source.name).name,
            "source_sha256": digest,
            "raster_crs": source.crs.to_string(),
            "pixel_width_height": [source.res[0], source.res[1]],
            "nodata": "NaN" if source.nodata is not None and np.isnan(source.nodata) else source.nodata,
            "temperature_units": units,
            "rasterio_version": rasterio.__version__,
            "rule": "A valid band mask and a finite scaled value are required for numeric coverage. Every other cell is unknown.",
            "scope": "Raster availability only. Calibration, anomaly detection, and field interpretation require separate evidence.",
            "window": {"column": col, "row": row, "width": width, "height": height},
            "numeric_pixel_count": int(valid.sum()),
            "unknown_pixel_count": int((~valid).sum()),
            "samples": samples,
        },
        "features": features,
    }
    return values, valid, record


def write_figure(values, valid, units, attribution, output):
    figure, plots = plt.subplots(1, 2, figsize=(9, 4), layout="constrained")
    missing_color = "#dce3e9"
    palette = plt.get_cmap("cividis").with_extremes(bad=missing_color)
    raster = plots[0].imshow(np.ma.masked_where(~valid, values), cmap=palette, interpolation="nearest")
    figure.colorbar(raster, ax=plots[0], label=units, shrink=0.78)
    plots[0].set_title("Recorded surface temperature")
    plots[1].imshow(valid, cmap=ListedColormap([missing_color, "#24736c"]), interpolation="nearest")
    plots[1].set_title("Raster coverage")
    for axis in plots:
        axis.set_xlabel("Column in window")
        axis.set_ylabel("Row in window")
    unknown = int((~valid).sum())
    figure.suptitle(f"{unknown:,} of {valid.size:,} cells are unknown (light grey)\n{attribution}", fontsize=12)
    figure.savefig(output, dpi=160)
    plt.close(figure)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raster", type=Path)
    parser.add_argument("--window", nargs=4, type=int, required=True, metavar=("COLUMN", "ROW", "WIDTH", "HEIGHT"))
    parser.add_argument("--units", required=True, help="Temperature units as documented by the data publisher")
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--license", required=True)
    parser.add_argument("--attribution", required=True, help="Short source credit for the figure")
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args()
    col, row, width, height = args.window
    with rasterio.open(args.raster) as source:
        if (not source.crs or min(col, row) < 0 or min(width, height) <= 0
                or col + width > source.width or row + height > source.height):
            parser.error("The raster needs a CRS and the window must fit inside the raster.")
        values, valid, record = coverage_report(
            source, Window(col, row, width, height), args.units, args.source_url, args.license, args.attribution
        )
    args.out_dir.mkdir(parents=True, exist_ok=True)
    write_figure(values, valid, args.units, args.attribution, args.out_dir / "thermal-coverage.png")
    (args.out_dir / "thermal-coverage.geojson").write_text(
        json.dumps(record, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    print(json.dumps(record["metadata"], indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
