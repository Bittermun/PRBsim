"""Compare the public WFIGS Richard Spring footprint to the Rosebud County boundary."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import pyproj
import shapely
from shapely.geometry import shape

WFIGS = (
    "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
    "WFIGS_Interagency_Perimeters/FeatureServer/0/query"
)
TIGER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query"
SQ_METRES_PER_ACRE = 4046.8564224
COUNTY_PLAN_ACRES = 128_403


def read_feature(base, where, fields, path):
    url = base + "?" + urlencode(
        {"f": "geojson", "outSR": 4326, "where": where, "outFields": fields, "returnGeometry": "true"}
    )
    if path is not None and path.exists():
        raw = path.read_bytes()
    else:
        with urlopen(url, timeout=30) as response:
            raw = response.read()
    document = json.loads(raw)
    features = document.get("features", [])
    if len(features) != 1:
        raise ValueError(f"Expected one feature for {where}, received {len(features)}.")
    feature = features[0]
    geom = shape(feature["geometry"])
    if geom.geom_type not in {"Polygon", "MultiPolygon"} or not geom.is_valid or geom.is_empty:
        raise ValueError(f"Expected one valid polygonal feature for {where}.")
    if path is not None and not path.exists():
        with path.open("xb") as output:
            output.write(raw)
    return geom, {
        "query": url,
        "response_sha256": hashlib.sha256(raw).hexdigest(),
        "properties": feature["properties"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, help="Keep and replay exact GeoJSON responses in this folder")
    args = parser.parse_args()
    root = args.source_dir
    if root is not None:
        root.mkdir(parents=True, exist_ok=True)
    fire, fire_input = read_feature(
        WFIGS, "attr_UniqueFireIdentifier = '2021-MTLG29-000428'",
        "attr_IncidentName,attr_UniqueFireIdentifier,attr_IrwinID,attr_FireCause,attr_FireCauseGeneral,"
        "attr_FireCauseSpecific,attr_IsFireCauseInvestigated,poly_GISAcres,poly_PolygonDateTime",
        root / "wfigs_richard_spring.geojson" if root is not None else None,
    )
    county, county_input = read_feature(
        TIGER, "GEOID = '30087'", "GEOID,NAME",
        root / "census_rosebud_county.geojson" if root is not None else None,
    )
    if fire_input["properties"]["attr_UniqueFireIdentifier"] != "2021-MTLG29-000428":
        raise ValueError("The fire input does not match the selected incident.")
    if county_input["properties"]["GEOID"] != "30087":
        raise ValueError("The boundary input does not match Rosebud County.")
    project = pyproj.Transformer.from_crs(4326, 5070, always_xy=True).transform
    mapped_fire = shapely.transform(fire, project, interleaved=False)
    mapped_county = shapely.transform(county, project, interleaved=False)
    within = mapped_fire.intersection(mapped_county).area / SQ_METRES_PER_ACRE
    outside = mapped_fire.difference(mapped_county).area / SQ_METRES_PER_ACRE
    print(json.dumps({
        "incident": fire_input,
        "county": county_input,
        "calculation_crs": "EPSG:5070",
        "runtime": {"pyproj": pyproj.__version__, "shapely": shapely.__version__},
        "fire_area_acres": mapped_fire.area / SQ_METRES_PER_ACRE,
        "fire_area_in_rosebud_county_acres": within,
        "fire_area_outside_rosebud_county_acres": outside,
        "nrcs_reported_county_aggregate_acres": COUNTY_PLAN_ACRES,
        "nrcs_reported_county_aggregate_incident_count": 17,
        "numerical_gap_acres": within - COUNTY_PLAN_ACRES,
        "scope": "The NRCS aggregate's incident membership and acreage definitions remain unresolved.",
    }, indent=2))


if __name__ == "__main__":
    main()
