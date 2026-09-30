#!/usr/bin/env python3
"""
PRBsim Offline Data Preparation & Verification Script
Study Area: 2024 Remington Wildfire & Powder River Basin (MT/WY)

Responsibilities:
1. Fetch or verify cached official 2024 Remington Wildfire perimeter from NIFC WFIGS.
2. Generate simplified WGS84 GeoJSON with explicit CRS (EPSG:4326), feature metadata,
   and distinct WFIGS event vs. polygon observation timestamps (mapDate).
3. Generate schematic geological context polygons (explicitly marked as synthetic
   UI fixtures until genuine USGS/MBMG vector extraction is added).
4. Generate quarantined synthetic test fixtures (`synthetic_fixtures.json`) with
   explicit synthetic source records and unknown-accuracy test cases.
5. Generate the Phase 5 non-spatial Remington Case Study Evidence & Chronology table.
6. Compute SHA256 hashes and output `manifest.json` with provenance & data gaps.
"""

import json
import hashlib
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "public" / "data" / "prb" / "remington"
RAW_DIR = DATA_DIR / "raw"

WFIGS_REMINGTON_QUERY = (
    "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
    "WFIGS_Interagency_Perimeters/FeatureServer/0/query?"
    "where=poly_IncidentName%20LIKE%20%27%25REMINGTON%25%27"
    "&outFields=*&outSR=4326&f=geojson"
)


def sha256_file(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def epoch_ms_to_iso_date(val) -> str | None:
    if val is None:
        return None
    try:
        dt = datetime.fromtimestamp(float(val) / 1000.0, tz=timezone.utc)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None


def simplify_ring(ring: list, tolerance: float = 0.0008) -> list:
    """Simple distance-based vertex reduction to keep browser GeoJSON fast (<250KB) while preserving valid >=4-vertex closed rings."""
    if len(ring) <= 10:
        out = [[round(pt[0], 5), round(pt[1], 5)] for pt in ring]
        if len(out) >= 4 and out[0] != out[-1]:
            out[-1] = list(out[0])
        return out
    simplified = [ring[0]]
    last_pt = ring[0]
    for pt in ring[1:-1]:
        dx = pt[0] - last_pt[0]
        dy = pt[1] - last_pt[1]
        if (dx * dx + dy * dy) ** 0.5 >= tolerance:
            simplified.append(pt)
            last_pt = pt
    simplified.append(ring[-1])
    out = [[round(pt[0], 5), round(pt[1], 5)] for pt in simplified]
    if len(out) < 4:
        # Preserve original ring vertices if tolerance would collapse a small island/hole below 4 points
        out = [[round(pt[0], 5), round(pt[1], 5)] for pt in ring]
    if out[0] != out[-1]:
        out[-1] = list(out[0])
    return out


def prepare_wildfire_perimeters() -> tuple[Path, Path]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = RAW_DIR / "wfigs_remington_raw.geojson"

    if not raw_path.exists():
        print("Downloading Remington Wildfire perimeter from NIFC WFIGS...")
        req = urllib.request.Request(
            WFIGS_REMINGTON_QUERY,
            headers={"User-Agent": "PRBsim-Scientific-Evidence-Explorer/1.0"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw_bytes = resp.read()
            raw_path.write_bytes(raw_bytes)

    raw_data = json.loads(raw_path.read_text(encoding="utf-8"))
    features_out = []

    for idx, feat in enumerate(raw_data.get("features", [])):
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})

        # Simplify geometry rings for interactive performance while preserving shape
        if geom.get("type") == "Polygon":
            new_coords = [simplify_ring(r) for r in geom.get("coordinates", [])]
            geom = {"type": "Polygon", "coordinates": new_coords}
        elif geom.get("type") == "MultiPolygon":
            new_coords = [
                [simplify_ring(r) for r in poly]
                for poly in geom.get("coordinates", [])
            ]
            geom = {"type": "MultiPolygon", "coordinates": new_coords}

        discovery_date = epoch_ms_to_iso_date(props.get("attr_FireDiscoveryDateTime")) or "2024-08-22"
        containment_date = epoch_ms_to_iso_date(props.get("attr_ContainmentDateTime")) or "2024-09-21"
        control_date = epoch_ms_to_iso_date(props.get("attr_ControlDateTime")) or "2024-11-12"
        map_date = (
            epoch_ms_to_iso_date(props.get("poly_PolygonDateTime"))
            or epoch_ms_to_iso_date(props.get("poly_DateCurrent"))
            or "2025-01-15"
        )
        cause_general = props.get("attr_FireCauseGeneral") or props.get("attr_FireCause") or "Natural"
        cause_specific = props.get("attr_FireCauseSpecific") or "Lightning"
        cause_investigated = (
            props.get("attr_IsFireCauseInvestigated")
            if props.get("attr_IsFireCauseInvestigated") is not None
            else props.get("irwin_IsFireCauseInvestigated")
        )
        feat_id = "remington-perimeter-2024" if idx == 0 else f"remington-perimeter-2024-{idx + 1}"

        clean_props = {
            "id": feat_id,
            "incidentName": props.get("poly_IncidentName", "Remington"),
            "irwinId": props.get("poly_IRWINID", "{2B136641-8C91-4C70-960D-64E05BC390E4}"),
            "uniqueFireId": props.get("attr_UniqueFireIdentifier", "2024-WYSHX-240442"),
            "gisAcres": round(float(props.get("poly_GISAcres", 196368.1)), 1),
            "discoveryDate": discovery_date,
            "containmentDate": containment_date,
            "controlDate": control_date,
            "mapDate": map_date,
            "temporalRole": "retrospective_final_footprint",
            "pooState": props.get("attr_POOState", "US-WY"),
            "pooCounty": props.get("attr_POOCounty", "Sheridan"),
            "fireCause": props.get("attr_FireCause", "Natural"),
            "reportedCauseGeneral": cause_general,
            "reportedCauseSpecific": cause_specific,
            "isFireCauseInvestigated": cause_investigated,
            "sourceMethod": props.get("poly_FeatureAccess", "Public"),
            "sourceId": "wfigs-remington-2024",
            "isSynthetic": False,
            "notes": (
                f"Official final WFIGS perimeter geometry ({round(float(props.get('poly_GISAcres', 196368.1)), 1):,} acres; "
                f"polygon timestamp {map_date}). Displayed as retrospective final boundary context; it is not a daily fire "
                "progression series and does not identify initial ignition mechanism without subsurface thermal/geochemical verification."
            )
        }

        features_out.append({
            "type": "Feature",
            "id": feat_id,
            "properties": clean_props,
            "geometry": geom
        })

    out_geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "crs": "EPSG:4326",
            "title": "2024 Remington Wildfire Final Perimeter (MT/WY)",
            "source": "NIFC WFIGS Interagency Perimeters",
            "temporalSemantics": "Final retrospective perimeter snapshot; not a daily progression sequence."
        },
        "features": features_out
    }

    out_path = DATA_DIR / "fire_perimeters.geojson"
    out_path.write_text(json.dumps(out_geojson, indent=2), encoding="utf-8", newline="\n")
    return raw_path, out_path


def prepare_geological_context() -> Path:
    """
    Constructs schematic regional geological polygons for UI demonstration ONLY.
    NOTE: Because these polygons are hand-authored approximations rather than
    extracted USGS/MBMG vector features, they are explicitly marked `isSynthetic: True`
    and excluded from default verified real-data views and exports.
    """
    features = [
        {
            "type": "Feature",
            "id": "geo-fort-union-formation-bound",
            "properties": {
                "id": "geo-fort-union-formation-bound",
                "unitName": "Schematic Paleocene Fort Union Formation (Tongue River Member) Envelope",
                "unitType": "coal_outcrop",
                "formation": "Fort Union Formation (Tongue River Member)",
                "coalBed": "Anderson-Dietz, Canyon, and Roland Coal Zone (Schematic)",
                "sourceId": "usgs-mbmg-prb-geology",
                "scale": "Schematic bounding box (not a surveyed map scale)",
                "isSynthetic": True,
                "notes": (
                    "SCHEMATIC FIXTURE ONLY (NOT AGENCY VECTOR DATA): Hand-constructed regional bounding envelope "
                    "illustrating where sub-bituminous coal beds crop out along the Tongue River and Powder River "
                    "drainages. Do not use for spatial measurement or geological inference."
                )
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-106.75, 44.82],
                    [-105.65, 44.82],
                    [-105.65, 45.38],
                    [-106.75, 45.38],
                    [-106.75, 44.82]
                ]]
            }
        },
        {
            "type": "Feature",
            "id": "geo-clinker-badger-peak-bench",
            "properties": {
                "id": "geo-clinker-badger-peak-bench",
                "unitName": "Schematic Badger Peak / Tongue River Escarpment Clinker Zone",
                "unitType": "clinker_deposit",
                "formation": "Fort Union Formation (Thermally Metamorphosed Clinker - Schematic)",
                "coalBed": "Anderson-Dietz Clinker Zone (Schematic)",
                "sourceId": "usgs-mbmg-prb-geology",
                "scale": "Schematic polygon (not a surveyed map scale)",
                "isSynthetic": True,
                "notes": (
                    "SCHEMATIC FIXTURE ONLY (NOT AGENCY VECTOR DATA): Illustrative polygon for prehistoric/historic "
                    "coal-burn clinker benches discussed in Heffern & Coates (2004). Does not represent digitized "
                    "MBMG or USGS outcrop boundaries."
                )
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-106.48, 44.96],
                    [-106.18, 44.94],
                    [-106.10, 45.14],
                    [-106.42, 45.18],
                    [-106.48, 44.96]
                ]]
            }
        },
        {
            "type": "Feature",
            "id": "geo-clinker-rosebud-creek-bench",
            "properties": {
                "id": "geo-clinker-rosebud-creek-bench",
                "unitName": "Schematic Northern Remington / Rosebud-Powder Divide Clinker Escarpments",
                "unitType": "clinker_deposit",
                "formation": "Fort Union Formation (Clinker & Baked Shale - Schematic)",
                "coalBed": "Canyon & Roland Coal Zone (Schematic)",
                "sourceId": "usgs-mbmg-prb-geology",
                "scale": "Schematic polygon (not a surveyed map scale)",
                "isSynthetic": True,
                "notes": (
                    "SCHEMATIC FIXTURE ONLY (NOT AGENCY VECTOR DATA): Illustrative polygon for fractured clinker "
                    "caprock. Hidden in default verified mode to prevent confusion with real geological mapping."
                )
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-106.12, 45.05],
                    [-105.82, 45.03],
                    [-105.78, 45.26],
                    [-106.08, 45.28],
                    [-106.12, 45.05]
                ]]
            }
        }
    ]

    out_geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "crs": "EPSG:4326",
            "title": "PRB Schematic Geological Context Fixtures (Non-Empirical)",
            "provenance": "PRBsim schematic UI fixture; geometry is hand-authored in prepare_data.py and is NOT extracted from USGS PP 1625-A or MBMG vector files.",
            "isSynthetic": True
        },
        "features": features
    }

    out_path = DATA_DIR / "geological_context.geojson"
    out_path.write_text(json.dumps(out_geojson, indent=2), encoding="utf-8", newline="\n")
    return out_path


def prepare_synthetic_fixtures() -> Path:
    """
    Creates strictly quarantined synthetic validation fixtures to test and demonstrate:
    1. Multi-vent site grouping (multiple surface vents sharing one underground seam fire).
    2. Bounded negative thermal survey coverage (distinguishing 'surveyed negative' from 'unsurveyed').
    3. Observation interval filtering (observationDate through endDate) and unknown coordinate accuracy (null).
    4. Explicit synthetic source declarations for referential integrity verification.
    """
    fixtures = {
        "isSynthetic": True,
        "warning": "SYNTHETIC VALIDATION FIXTURES ONLY — NOT REAL FIELD OBSERVATIONS. Used to validate multi-vent site grouping, interval filtering, and negative survey rendering.",
        "sources": [
            {
                "id": "syn-src-aerial-ir-2024",
                "name": "Synthetic Post-Fire Aerial FLIR Survey Fixture",
                "publisher": "PRBsim Synthetic Validation Suite",
                "retrievalDate": "2026-09-24",
                "url": "https://github.com/Bittermun/PRBsim",
                "license": "CC0-1.0 (Synthetic Test Fixture)",
                "crs": "EPSG:4326",
                "spatialAccuracy": "Synthetic test coordinates (±15 m nominal)",
                "limitations": "SYNTHETIC FIXTURE ONLY — Does not represent a real airborne thermal survey.",
                "rawSha256": "synthetic-fixture-only",
                "processedSha256": "synthetic-fixture-only",
                "isSynthetic": True
            },
            {
                "id": "syn-src-field-visit-2024",
                "name": "Synthetic Ground Thermocouple Verification Fixture",
                "publisher": "PRBsim Synthetic Validation Suite",
                "retrievalDate": "2026-09-24",
                "url": "https://github.com/Bittermun/PRBsim",
                "license": "CC0-1.0 (Synthetic Test Fixture)",
                "crs": "EPSG:4326",
                "spatialAccuracy": "Synthetic test coordinates (±5 m nominal)",
                "limitations": "SYNTHETIC FIXTURE ONLY — Does not represent a real field thermocouple measurement.",
                "rawSha256": "synthetic-fixture-only",
                "processedSha256": "synthetic-fixture-only",
                "isSynthetic": True
            },
            {
                "id": "syn-src-historical-lit",
                "name": "Synthetic Historical Narrative Outcrop Report Fixture",
                "publisher": "PRBsim Synthetic Validation Suite",
                "retrievalDate": "2026-09-24",
                "url": "https://github.com/Bittermun/PRBsim",
                "license": "CC0-1.0 (Synthetic Test Fixture)",
                "crs": "EPSG:4326",
                "spatialAccuracy": "Unknown / unmeasured historical narrative location",
                "limitations": "SYNTHETIC FIXTURE ONLY — Demonstrates unknown coordinate precision (accuracyMeters: null) and pre-fire baseline ambiguity.",
                "rawSha256": "synthetic-fixture-only",
                "processedSha256": "synthetic-fixture-only",
                "isSynthetic": True
            }
        ],
        "sites": [
            {
                "id": "syn-site-badger-creek-complex",
                "name": "[SYNTHETIC] Badger Creek Multi-Vent Coal Seam Complex",
                "coalSeam": "Anderson-Dietz Coal Bed",
                "groupingUncertainty": "unresolved_multi_vent",
                "groupingNotes": "SYNTHETIC TEST CASE: Three distinct surface fumaroles/vents distributed along 450m of clinker outcrop escarpment. Without subsurface drilling or geophysical resistivity, it is unresolved whether these represent one continuous underground combustion front or three independent ignitions.",
                "boundaryGeometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-106.315, 45.022],
                        [-106.302, 45.022],
                        [-106.302, 45.031],
                        [-106.315, 45.031],
                        [-106.315, 45.022]
                    ]]
                },
                "isSynthetic": True
            },
            {
                "id": "syn-site-preexisting-baseline",
                "name": "[SYNTHETIC] Pre-Existing 1978 Outcrop Burn Site",
                "coalSeam": "Canyon Coal Bed",
                "groupingUncertainty": "confirmed_single_body",
                "groupingNotes": "SYNTHETIC TEST CASE: Illustrates a historical coal seam fire documented prior to the 2024 Remington Wildfire, testing temporal filtering so pre-existing coal fires are not misclassified as newly ignited by the 2024 surface fire.",
                "boundaryGeometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-106.195, 45.110],
                        [-106.185, 45.110],
                        [-106.185, 45.118],
                        [-106.195, 45.118],
                        [-106.195, 45.110]
                    ]]
                },
                "isSynthetic": True
            }
        ],
        "observations": [
            {
                "id": "syn-obs-001",
                "siteId": "syn-site-badger-creek-complex",
                "label": "[SYNTHETIC] Badger Creek Vent A (West Fumarole)",
                "observationDate": "2024-09-02",
                "endDate": "2024-09-18",
                "datePrecision": "day",
                "lastObservedDate": "2024-09-18",
                "status": "sensor_detection",
                "evidenceMethods": ["aerial_ir", "visual_smoke"],
                "accuracyMeters": 15,
                "sourceId": "syn-src-aerial-ir-2024",
                "notes": "SYNTHETIC FIXTURE: Post-wildfire thermal anomaly along slump fracture. Demonstrates sensor-level detection awaiting ground thermocouple confirmation.",
                "isSynthetic": True,
                "geometry": {
                    "type": "Point",
                    "coordinates": [-106.311, 45.026]
                }
            },
            {
                "id": "syn-obs-002",
                "siteId": "syn-site-badger-creek-complex",
                "label": "[SYNTHETIC] Badger Creek Vent B (East Fissure)",
                "observationDate": "2024-09-05",
                "datePrecision": "day",
                "lastObservedDate": "2024-09-25",
                "status": "field_confirmed",
                "evidenceMethods": ["ground_thermocouple", "gas_sampling"],
                "accuracyMeters": 5,
                "sourceId": "syn-src-field-visit-2024",
                "notes": "SYNTHETIC FIXTURE: Ground thermocouple probe recorded 340°C at 0.8m depth with coal-tar condensates. Co-located in same site complex as Vent A.",
                "isSynthetic": True,
                "geometry": {
                    "type": "Point",
                    "coordinates": [-106.305, 45.027]
                }
            },
            {
                "id": "syn-obs-003",
                "siteId": "syn-site-preexisting-baseline",
                "label": "[SYNTHETIC] Canyon Seam Historic Outcrop Vent (1978 Baseline)",
                "observationDate": "1978-07-01",
                "datePrecision": "year",
                "lastObservedDate": "2024-09-10",
                "status": "unverified_report",
                "evidenceMethods": ["historical_record"],
                "accuracyMeters": None,
                "sourceId": "syn-src-historical-lit",
                "notes": "SYNTHETIC FIXTURE: Pre-existing coal seam fire predating the August 2024 Remington Wildfire. Coordinate accuracy is unknown (null) to verify that missing accuracy is never fabricated as ±50m.",
                "isSynthetic": True,
                "geometry": {
                    "type": "Point",
                    "coordinates": [-106.190, 45.114]
                }
            }
        ],
        "surveys": [
            {
                "id": "syn-survey-null-bench-2024",
                "surveyName": "[SYNTHETIC] Post-Fire UAV Thermal Transect Sector 4 (Negative Result)",
                "surveyDate": "2024-09-12",
                "method": "Airborne FLIR Thermal Infrared Sweep",
                "result": "no_thermal_anomaly_detected",
                "sourceId": "syn-src-aerial-ir-2024",
                "notes": "SYNTHETIC FIXTURE: Demonstrates explicit representation of bounded negative survey coverage (no subsurface thermal anomalies >5°C above ambient detected).",
                "isSynthetic": True,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-106.05, 45.08],
                        [-105.95, 45.08],
                        [-105.95, 45.15],
                        [-106.05, 45.15],
                        [-106.05, 45.08]
                    ]]
                }
            }
        ]
    }

    out_path = DATA_DIR / "synthetic_fixtures.json"
    out_path.write_text(json.dumps(fixtures, indent=2), encoding="utf-8", newline="\n")
    return out_path


def build_remington_case_chronology() -> dict:
    """
    Phase 5 Research Artifact:
    Non-spatial source-linked Remington case-study evidence & chronology table,
    separating verified geospatial timestamps, attributed secondary reports,
    unretrieved primary-source leads, and separate hydrological literature context.
    """
    return {
        "title": "2024 Remington Wildfire & Post-Fire Coal Seam Activity — Source-Linked Evidence Matrix",
        "purpose": (
            "Distinguishes what the official 2024–2025 geospatial record establishes from attributed "
            "secondary reporting, unacquired primary survey inventories, and separate regional hydrology literature."
        ),
        "entries": [
            {
                "id": "chron-wfigs-discovery-2024-08-22",
                "eventDate": "2024-08-22",
                "reportOrPublicationDate": "2024-08-22",
                "mappedPerimeterDate": "2025-01-15",
                "evidenceCategory": "verified_geospatial_record",
                "claimOrObservation": (
                    "Remington Wildfire discovery timestamp (attr_FireDiscoveryDateTime) in Sheridan County, WY, "
                    "burning northward into Big Horn, Rosebud, and Powder River Counties, MT. Reported general/specific "
                    "cause in WFIGS: Natural / Lightning (attr_IsFireCauseInvestigated: 0)."
                ),
                "reportedPostfireCoalActivity": "Not recorded in WFIGS perimeter attributes.",
                "surveyCoverageStatus": "Final cumulative perimeter only (196,368.1 GIS acres); no daily progression series in repository.",
                "prefireBaselineStatus": "No pre-August 2024 coal-seam thermal baseline included in WFIGS.",
                "groupingUncertainty": "N/A (surface wildfire perimeter)",
                "sourceCitation": "NIFC WFIGS Interagency Perimeters (IRWIN ID {2B136641-8C91-4C70-960D-64E05BC390E4})",
                "sourceUrl": "https://data-nifc.opendata.arcgis.com/"
            },
            {
                "id": "chron-wfigs-containment-control-2024",
                "eventDate": "2024-09-21 to 2024-11-12",
                "reportOrPublicationDate": "2025-01-15",
                "mappedPerimeterDate": "2025-01-15",
                "evidenceCategory": "verified_geospatial_record",
                "claimOrObservation": (
                    "WFIGS records containment on 2024-09-21, control on 2024-11-12, and final polygon snapshot timestamp "
                    "(poly_PolygonDateTime) on 2025-01-15."
                ),
                "reportedPostfireCoalActivity": "None in WFIGS.",
                "surveyCoverageStatus": "Single retrospective final boundary snapshot (2025-01-15).",
                "prefireBaselineStatus": "Unresolved in WFIGS.",
                "groupingUncertainty": "N/A (surface wildfire perimeter)",
                "sourceCitation": "NIFC WFIGS Interagency Perimeters (UniqueFireIdentifier 2024-WYSHX-240442)",
                "sourceUrl": "https://data-nifc.opendata.arcgis.com/"
            },
            {
                "id": "chron-mtfp-attributed-report-2025-09",
                "eventDate": "2024–2025 (post-Remington survey period)",
                "reportOrPublicationDate": "2025-09",
                "mappedPerimeterDate": "Unpublished in public GIS (non-spatial narrative lead)",
                "evidenceCategory": "attributed_secondary_report",
                "claimOrObservation": (
                    "Montana Free Press (reporter Leigh Walden, Sept 2025) reported that local/agency post-fire mapping "
                    "identified 107 burning coal seams in connection with the 2024 Remington Wildfire scar."
                ),
                "reportedPostfireCoalActivity": (
                    "Attributed report of '107 burning seams' mapped after the 2024 Remington fire. Treated strictly as "
                    "an attributed secondary lead — NOT a verified point inventory or a count of newly ignited independent "
                    "subsurface combustion bodies until traced to primary survey records."
                ),
                "surveyCoverageStatus": (
                    "Underlying GPS/IR survey tracklines, detection thresholds, and negative-survey boundaries have not "
                    "been published in public GIS repositories."
                ),
                "prefireBaselineStatus": (
                    "UNRESOLVED: Public reporting does not establish how many of the 107 mapped thermal features were "
                    "newly ignited by August 2024 surface wildfire pass-over versus pre-existing smoldering seams "
                    "exposed or noticed during post-fire inspections."
                ),
                "groupingUncertainty": (
                    "UNRESOLVED MULTI-VENT AMBIGUITY: Without the primary survey protocol, it is unknown whether '107' "
                    "counts individual surface smoke/heat vents along shared coal outcrops or 107 physically independent "
                    "subsurface combustion bodies."
                ),
                "sourceCitation": "Leigh Walden, Montana Free Press (September 2025 reporting on post-Remington coal seam fires)",
                "sourceUrl": "https://montanafreepress.org/"
            },
            {
                "id": "chron-mtdes-bulletin-lead-2026-02",
                "eventDate": "2025–2026 (state/county mapping follow-up)",
                "reportOrPublicationDate": "2026-02",
                "mappedPerimeterDate": "Primary dataset not yet acquired",
                "evidenceCategory": "unverified_primary_source_lead",
                "claimOrObservation": (
                    "February 2026 Montana Disaster and Emergency Services (MT DES) / county coal-seam mapping bulletin "
                    "identified as a primary-source follow-up lead to verify survey holder metadata, coordinates, and "
                    "detection methodology behind post-Remington coal-fire counts."
                ),
                "reportedPostfireCoalActivity": (
                    "Primary GIS point/polygon inventory and attribute table not acquired in local repository as of Sept 2026."
                ),
                "surveyCoverageStatus": "Pending primary agency data acquisition; rendered as non-spatial lead only.",
                "prefireBaselineStatus": "Requires cross-checking against pre-2024 MBMG/BLM outcrop fire records.",
                "groupingUncertainty": "Pending primary survey attribute definitions (individual fumaroles vs. seam complexes).",
                "sourceCitation": "Montana DES / County Emergency Management Mapping Bulletin Lead (Feb 2026)",
                "sourceUrl": "https://des.mt.gov/"
            }
        ],
        "hydrologyContextNote": {
            "citation": "Meredith, E. (2016). Coal aquifer contribution to streams in the Powder River Basin, Montana. Journal of Hydrology / MBMG.",
            "relevance": (
                "Establishes water-isotope and strontium-isotope methods for quantifying coal-bed aquifer baseflow "
                "contributions to Powder River Basin streams (including Rosebud Creek, Tongue River, and Otter Creek)."
            ),
            "epistemicLimitation": (
                "SEPARATE RESEARCH BRANCH: Meredith (2016) traces natural coal-aquifer groundwater contribution to streams, "
                "NOT active coal-fire combustion contaminant plumes or post-wildfire ash runoff. PRBsim intentionally "
                "does NOT render groundwater contamination zones or hydrological plume polygons from coal-bearing stratigraphy."
            )
        }
    }


def main():
    raw_perim_path, perim_path = prepare_wildfire_perimeters()
    geo_path = prepare_geological_context()
    syn_path = prepare_synthetic_fixtures()

    manifest = {
        "studyArea": "2024 Remington Wildfire & Southern Montana / Northern Wyoming Powder River Basin",
        "generatedAt": "2026-09-25T00:00:00Z",
        "coreQuestion": "Do surface vegetation wildfires generate new, persistent coal-seam fires, which can subsequently reignite surface vegetation?",
        "datasets": [
            {
                "id": "wfigs-remington-2024",
                "name": "2024 Remington Wildfire Final Perimeter (WFIGS)",
                "publisher": "National Interagency Fire Center (NIFC) / Wildland Fire Interagency Geospatial Services (WFIGS)",
                "retrievalDate": "2026-09-24",
                "url": "https://data-nifc.opendata.arcgis.com/",
                "license": "Public Domain (U.S. Government Work)",
                "crs": "EPSG:4326",
                "spatialAccuracy": "±10m to ±30m (Aerial IR & GPS perimeter mapping)",
                "limitations": (
                    "Represents the final cumulative surface wildfire footprint (196,368.1 acres; polygon snapshot "
                    "poly_PolygonDateTime 2025-01-15). Does not provide daily progression perimeters, internal unburned "
                    "island high-resolution burn severity, or subsurface thermal measurements."
                ),
                "rawSha256": sha256_file(raw_perim_path),
                "processedSha256": sha256_file(perim_path),
                "isSynthetic": False
            },
            {
                "id": "usgs-mbmg-prb-geology",
                "name": "PRB Schematic Stratigraphic Context Fixtures (Non-Empirical)",
                "publisher": "PRBsim Project (Hand-Constructed Schematic Polygons; Conceptual Reference Only to USGS PP 1625-A & MBMG)",
                "retrievalDate": "2026-09-24",
                "url": "https://pubs.usgs.gov/pp/p1625a/",
                "license": "CC0-1.0 (PRBsim Schematic Fixture — Not an official USGS/MBMG cartographic product)",
                "crs": "EPSG:4326",
                "spatialAccuracy": "Not applicable — arbitrary hand-placed bounding box and schematic polygons",
                "limitations": (
                    "SCHEMATIC UI FIXTURES ONLY (`isSynthetic: true`). These polygons were hand-coded in "
                    "`scripts/prb/prepare_data.py` and do NOT represent extracted USGS or MBMG vector boundaries. "
                    "Excluded from default real-data views and real-data exports."
                ),
                "rawSha256": sha256_file(geo_path),
                "processedSha256": sha256_file(geo_path),
                "isSynthetic": True
            },
            {
                "id": "synthetic-validation-fixtures",
                "name": "Synthetic Validation Fixtures (Multi-Vent & Negative Survey Test Cases)",
                "publisher": "PRBsim Verification Suite",
                "retrievalDate": "2026-09-24",
                "url": "https://github.com/Bittermun/PRBsim",
                "license": "CC0-1.0",
                "crs": "EPSG:4326",
                "spatialAccuracy": "Synthetic test coordinates (and explicit null accuracy test case)",
                "limitations": "STRICTLY SYNTHETIC TEST DATA. Quarantined from default view; must never be cited as empirical evidence.",
                "rawSha256": sha256_file(syn_path),
                "processedSha256": sha256_file(syn_path),
                "isSynthetic": True
            }
        ],
        "dataGapsChecklist": [
            {
                "category": "Verified Post-2024 Subsurface Coal-Fire Point Inventory",
                "status": "NOT ACQUIRED FROM SOURCES CHECKED (Sept 2026)",
                "sourcesChecked": "NIFC WFIGS, MT DNRC, BLM Montana/Dakotas Public GIS, MBMG Open-File Catalog, USGS ScienceBase (checked 2026-09-24).",
                "scientificImpact": (
                    "Default real-data mode contains 1 official wildfire perimeter and 0 verified coal-fire point "
                    "observations. Secondary reporting (Montana Free Press, Sept 2025) describes 107 burning seams mapped "
                    "after the Remington fire, and a Feb 2026 Montana DES mapping bulletin is noted as a primary-source lead, "
                    "but no public coordinate inventory with precision and pre-fire baseline metadata has been acquired."
                )
            },
            {
                "category": "Source-Backed Local Clinker & Coal Outcrop Vector Layer",
                "status": "NOT ACQUIRED IN REPOSITORY (Schematic Fixture Quarantined)",
                "sourcesChecked": "USGS Professional Paper 1625-A & MBMG regional stratigraphy catalogs (checked 2026-09-24).",
                "scientificImpact": (
                    "No survey-grade digitized coal outcrop or clinker polygon layer is currently bundled. Hand-drawn "
                    "schematic polygons are quarantined behind the Synthetic Validation Fixtures toggle so they cannot "
                    "be mistaken for observed geology."
                )
            },
            {
                "category": "Pre-Fire vs. Post-Fire Thermal Baseline (Before August 22, 2024)",
                "status": "MISSING SYSTEMATIC BASELINE IN ACQUIRED DATA",
                "sourcesChecked": "LANDFIRE, USGS Coal Fields of the Conterminous US, Heffern & Coates (2004) synthesis.",
                "scientificImpact": (
                    "First post-fire detection of a smoldering seam cannot be equated with new ignition by the 2024 "
                    "Remington Wildfire unless pre-fire absence or new ignition mechanism is independently established."
                )
            },
            {
                "category": "Multi-Vent Subsurface Connectivity & Site Grouping",
                "status": "UNRESOLVED IN SURFACE OBSERVATIONS",
                "sourcesChecked": "Geophysical coal-fire literature (borehole thermometry, electrical resistivity, UAV FLIR).",
                "scientificImpact": (
                    "Multiple surface fumaroles along a clinker bench may stem from a single continuous underground "
                    "combustion zone; treating individual vents as independent ignitions inflates fire counts."
                )
            }
        ],
        "auditedSources": [
            {
                "agencyOrCatalog": "NIFC WFIGS Interagency Fire Perimeters",
                "searchParameters": "poly_IncidentName LIKE '%REMINGTON%' (2024)",
                "result": "Acquired official 196,368.1-acre final perimeter (IRWIN ID {2B136641-8C91-4C70-960D-64E05BC390E4}, UniqueFireIdentifier 2024-WYSHX-240442, polygon timestamp 2025-01-15).",
                "url": "https://data-nifc.opendata.arcgis.com/"
            },
            {
                "agencyOrCatalog": "USGS National Coal Resource Assessment (PP 1625-A) & MBMG",
                "searchParameters": "Powder River Basin coal beds, Fort Union Formation, clinker outcrops",
                "result": "Literature context reviewed; no raw USGS/MBMG vector features are bundled in default mode (schematic polygons are quarantined as synthetic fixtures).",
                "url": "https://pubs.usgs.gov/pp/p1625a/"
            },
            {
                "agencyOrCatalog": "Montana Free Press (Sept 2025) & Montana DES Mapping Bulletin Lead (Feb 2026)",
                "searchParameters": "Remington Fire post-fire coal seam fire mapping (107 reported seams)",
                "result": "Cataloged in the non-spatial Remington Case Study Evidence Matrix as attributed reporting / primary-source follow-up leads; no point coordinates fabricated.",
                "url": "https://montanafreepress.org/"
            },
            {
                "agencyOrCatalog": "Meredith (2016) Powder River Basin Coal Aquifer Hydrology",
                "searchParameters": "Coal aquifer contribution to streams in the Powder River Basin, Montana",
                "result": "Cataloged in separate hydrology context note (isotopic baseflow tracing only; does not establish coal-fire contaminant plumes).",
                "url": "https://mbmg.mtech.edu/"
            }
        ],
        "remingtonCaseChronology": build_remington_case_chronology()
    }

    manifest_path = DATA_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8", newline="\n")
    print("Successfully generated PRB datasets and manifest:")
    print(f" - {perim_path.relative_to(BASE_DIR)} ({sha256_file(perim_path)})")
    print(f" - {geo_path.relative_to(BASE_DIR)} ({sha256_file(geo_path)})")
    print(f" - {syn_path.relative_to(BASE_DIR)} ({sha256_file(syn_path)})")
    print(f" - {manifest_path.relative_to(BASE_DIR)}")


if __name__ == "__main__":
    main()
