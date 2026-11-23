"""Compare pre/post Landsat temperatures at matched locations near Richard Spring."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.errors import RasterioError
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_geom
from scipy.spatial import cKDTree
from shapely.geometry import shape

CATALOG = "https://planetarycomputer.microsoft.com/api/stac/v1"
SIGN = "https://planetarycomputer.microsoft.com/api/sas/v1/sign"
FIELDS = ("elevation_m", "slope_deg", "pre_ndvi", "pre_temperature_c")
CALIPERS = np.array([120, 8, 0.12, 4])
DISTANCE_LIMIT = 6000
PIXEL_M = 30
SAMPLE_STRIDE = 4
MAX_TEMPERATURE_UNCERTAINTY_K = 3
QA_EXCLUDE = sum(1 << bit for bit in (0, 1, 2, 3, 4, 5, 7))
SR_EXCLUDE = (1 << 3) | (1 << 4) | (1 << 11)  # Red, NIR and terrain occlusion


def get_json(url):
    with urlopen(url, timeout=45) as response:
        return json.load(response)


def item(collection, item_id):
    return get_json(f"{CATALOG}/collections/{collection}/items/{item_id}")


def read_band(scene, key, grid, *, resampling=Resampling.nearest):
    asset = scene["assets"][key]
    signed = get_json(f"{SIGN}?{urlencode({'href': asset['href']})}")["href"]
    try:
        with rasterio.open(signed) as source, WarpedVRT(
            source, **grid, dtype="float32", nodata=np.nan, resampling=resampling,
        ) as warped:
            data = warped.read(1, masked=True).filled(np.nan)
    except RasterioError:
        raise RuntimeError(f"Could not read {key} from {scene['id']}.") from None
    # Read scale and offset from this exact Collection 2 STAC asset.
    metadata = asset.get("raster:bands", [{}])[0]
    return data * metadata.get("scale", 1) + metadata.get("offset", 0)


def passed_bits(quality, excluded):
    finite = np.isfinite(quality)
    return finite & ((np.where(finite, quality, 0).astype(np.uint16) & excluded) == 0)


def temperature(scene, grid):
    surface = read_band(scene, "lwir11", grid)
    uncertainty = read_band(scene, "qa", grid)
    qa = read_band(scene, "qa_pixel", grid)
    usable = (
        passed_bits(qa, QA_EXCLUDE) & np.isfinite(surface) & (surface > 149)
        & (uncertainty >= 0) & (uncertainty <= MAX_TEMPERATURE_UNCERTAINTY_K)
    )
    return surface - 273.15, uncertainty, usable


def nearest_matches(interior, reference):
    """Greedy nearest qualifying match, nearest candidates first and no reference reuse."""
    scales = np.r_[CALIPERS, DISTANCE_LIMIT, DISTANCE_LIMIT]
    target, controls = interior / scales, reference / scales
    tree = cKDTree(controls)
    ranked = []
    for index, neighbors in enumerate(tree.query_ball_point(target, np.sqrt(5))):
        indices = np.asarray(neighbors, dtype=np.int64)
        delta = controls[indices] - target[index]
        feasible = (abs(delta[:, :4]) <= 1).all(axis=1) & (np.linalg.norm(delta[:, 4:], axis=1) <= 1)
        indices = indices[feasible]
        if len(indices):
            scores = np.linalg.norm(delta[feasible], axis=1)
            order = np.lexsort((indices, scores))
            ranked.append((scores[order[0]], index, indices[order]))
    used, pairs = set(), []
    for _, index, options in sorted(ranked, key=lambda use: (use[0], use[1])):
        for control in options:
            if control not in used:
                pairs.append((index, control))
                used.add(control)
                break
    return np.asarray(pairs, dtype=np.int64).reshape(-1, 2)


def mask_polygon(polygon, grid):
    dimensions = (grid["height"], grid["width"])
    if polygon.is_empty:
        return np.zeros(dimensions, dtype=bool)
    return rasterize([(polygon, 1)], out_shape=dimensions, transform=grid["transform"]).astype(bool)


def candidates(mask, grid, covariates, after, before_qa, after_qa):
    indices = np.nonzero(mask[::SAMPLE_STRIDE, ::SAMPLE_STRIDE])
    rows, cols = (index * SAMPLE_STRIDE for index in indices)
    xs, ys = rasterio.transform.xy(grid["transform"], rows, cols)
    values = np.column_stack([field[rows, cols] for field in covariates] + [xs, ys])
    return values, after[rows, cols], before_qa[rows, cols], after_qa[rows, cols]


def plot_locations(out, perimeter, interior, reference):
    figure, ax = plt.subplots(figsize=(8, 6), layout="constrained")
    polygons = (perimeter,) if perimeter.geom_type == "Polygon" else perimeter.geoms
    for polygon in polygons:
        ax.plot(*polygon.exterior.xy, color="#334155", linewidth=1)
        for hole in polygon.interiors:
            ax.plot(*hole.xy, color="#334155", linewidth=0.6)
    ax.scatter(*reference[:, 4:].T, s=4, color="#037e83", label="Matched reference locations")
    ax.scatter(*interior[:, 4:].T, s=4, color="#d55e00", label="Matched interior locations")
    ax.set(aspect="equal", xlabel="Easting (m)", ylabel="Northing (m)", title="Richard Spring Landsat comparison")
    ax.ticklabel_format(style="plain", useOffset=False)
    ax.legend()
    figure.savefig(out, dpi=150)
    plt.close(figure)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("perimeter", type=Path, help="Original WFIGS GeoJSON for one incident")
    parser.add_argument("output", type=Path)
    parser.add_argument("--before", default="LC08_L2SP_036028_20210804_02_T1")
    parser.add_argument("--after", default="LC08_L2SP_035028_20210829_02_T1")
    parser.add_argument("--elevation", default="Copernicus_DSM_COG_10_N45_00_W107_00_DEM")
    args = parser.parse_args()
    raw_perimeter = args.perimeter.read_bytes()
    document = json.loads(raw_perimeter)
    if len(document["features"]) != 1:
        parser.error("Supply a single incident perimeter feature.")
    feature = document["features"][0]
    crs = "EPSG:32613"
    perimeter = shape(transform_geom("EPSG:4326", crs, feature["geometry"]))
    if not perimeter.is_valid:
        parser.error("Supply a valid perimeter geometry.")
    area = perimeter.buffer(5000)
    left, bottom, right, top = area.bounds
    left, bottom = (math.floor(coordinate / PIXEL_M) * PIXEL_M for coordinate in (left, bottom))
    right, top = (math.ceil(coordinate / PIXEL_M) * PIXEL_M for coordinate in (right, top))
    grid = {
        "crs": crs, "transform": from_origin(left, top, PIXEL_M, PIXEL_M),
        "width": round((right - left) / PIXEL_M), "height": round((top - bottom) / PIXEL_M),
    }
    before_item, after_item = [item("landsat-c2-l2", scene) for scene in (args.before, args.after)]
    if before_item["properties"]["datetime"] >= after_item["properties"]["datetime"]:
        parser.error("The first scene must precede the second.")
    dem_item = item("cop-dem-glo-30", args.elevation)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="45", GDAL_HTTP_MAX_RETRY="1"):
        before, before_qa, usable_before = temperature(before_item, grid)
        after, after_qa, usable_after = temperature(after_item, grid)
        red, nir, radsat = [read_band(before_item, key, grid) for key in ("red", "nir08", "qa_radsat")]
        elevation = read_band(dem_item, "data", grid, resampling=Resampling.bilinear)
    north_gradient, east_gradient = np.gradient(elevation, PIXEL_M)
    slope = np.rad2deg(np.arctan(np.hypot(north_gradient, east_gradient)))
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / (nir + red)
    jointly_usable = (
        usable_before & usable_after & passed_bits(radsat, SR_EXCLUDE)
        & (red > 0) & (nir > 0) & np.isfinite(ndvi) & np.isfinite(slope)
    )
    interior_mask = mask_polygon(perimeter.buffer(-240), grid)
    reference_mask = mask_polygon(area.difference(perimeter.buffer(360)), grid)
    scope = {"interior": interior_mask, "reference": reference_mask}
    available = {
        label: {"area_cells": int(mask.sum()), "pre_valid": int((mask & usable_before).sum()),
                "post_valid": int((mask & usable_after).sum()), "joint_with_covariates": int((mask & jointly_usable).sum())}
        for label, mask in scope.items()
    }
    covariates = (elevation, slope, ndvi, before)
    interior, interior_post, int_pre_qa, int_post_qa = candidates(
        interior_mask & jointly_usable, grid, covariates, after, before_qa, after_qa,
    )
    reference, reference_post, ref_pre_qa, ref_post_qa = candidates(
        reference_mask & jointly_usable, grid, covariates, after, before_qa, after_qa,
    )
    pairs = nearest_matches(interior, reference)
    args.output.mkdir(parents=True, exist_ok=True)
    result = {
        "perimeter_sha256": hashlib.sha256(raw_perimeter).hexdigest(),
        "perimeter_properties": feature["properties"],
        "sources": {
            label: {"id": scene["id"], "datetime": scene["properties"].get("datetime"),
                    "assets": {key: scene["assets"][key]["href"] for key in keys}}
            for label, scene, keys in (
                ("before", before_item, ("lwir11", "qa", "qa_pixel", "red", "nir08", "qa_radsat")),
                ("after", after_item, ("lwir11", "qa", "qa_pixel")), ("terrain", dem_item, ("data",)),
            )
        },
        "method": {
            "crs": crs, "pixel_m": PIXEL_M, "grid_bounds": [left, bottom, right, top],
            "sample_spacing_m": PIXEL_M * SAMPLE_STRIDE, "inside_buffer_m": 240,
            "reference_ring_m": [360, 5000], "max_match_distance_m": DISTANCE_LIMIT,
            "max_st_qa_k": MAX_TEMPERATURE_UNCERTAINTY_K, "excluded_qa_pixel_bits": [0, 1, 2, 3, 4, 5, 7],
            "calipers": dict(zip(FIELDS, CALIPERS.tolist(), strict=True)),
            "matching": "Nearest standardized covariates and location, without reference reuse or outcome-based preference.",
        },
        "coverage": available,
        "interior_candidates": len(interior), "reference_candidates": len(reference), "matched_pairs": len(pairs),
        "matched_surface_temperature": None,
        "limits": "Descriptive daytime surface-temperature comparison. Geology, wind and a full independent fire history are unmeasured. The reference ring is outside this perimeter. Thermal pixels do not verify underground combustion.",
    }
    i, j = pairs.T
    left_matches, right_matches = interior[i], reference[j]
    inside_change = interior_post[i] - left_matches[:, 3]
    reference_change = reference_post[j] - right_matches[:, 3]
    difference = inside_change - reference_change
    if len(pairs):
        result["matched_surface_temperature"] = {
            "interior_mean_change_c": float(inside_change.mean()),
            "reference_mean_change_c": float(reference_change.mean()),
            "mean_difference_in_change_c": float(difference.mean()),
            "difference_quartiles_c": np.quantile(difference, [0.25, 0.5, 0.75]).tolist(),
            "mean_absolute_covariate_differences": dict(zip(FIELDS, abs(left_matches - right_matches).mean(axis=0)[:4].tolist(), strict=True)),
            "mean_pair_distance_m": float(np.linalg.norm(left_matches[:, 4:] - right_matches[:, 4:], axis=1).mean()),
        }
    with (args.output / "matched-pixels.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        labels = (*FIELDS, "easting_m", "northing_m", "post_temperature_c", "pre_st_qa_k", "post_st_qa_k")
        writer.writerow([f"{prefix}_{column}" for prefix in ("inside", "reference") for column in labels] + ["difference_in_change_c"])
        writer.writerows(np.column_stack((left_matches, interior_post[i], int_pre_qa[i], int_post_qa[i],
                                          right_matches, reference_post[j], ref_pre_qa[j], ref_post_qa[j], difference)))
    plot_locations(args.output / "matched-locations.png", perimeter, left_matches, right_matches)
    (args.output / "matched-landsat.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"coverage": available, "matched_pairs": len(pairs),
                      "matched_surface_temperature": result["matched_surface_temperature"]}, indent=2))


if __name__ == "__main__":
    main()
