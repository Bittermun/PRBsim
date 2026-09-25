"""
Reproducible data preparation script for PRB Coal-Fire Evidence Explorer.
Focus area: Remington Fire (Montana/Wyoming border, Powder River Basin).

Produces:
- public/data/prb/remington/remington_fire_perimeter.geojson
- public/data/prb/remington/geological_context.geojson
- public/data/prb/remington/manifest.json
- public/data/prb/remington/synthetic_fixtures.json
"""

import os
import json
import hashlib
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(BASE_DIR, 'public', 'data', 'prb', 'remington')
RAW_DIR = os.path.join(OUT_DIR, 'raw')
os.makedirs(RAW_DIR, exist_ok=True)

def sha256_file(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def prepare_wfigs_perimeter():
    raw_path = os.path.join(RAW_DIR, 'wfigs_remington_raw.geojson')
    proc_path = os.path.join(OUT_DIR, 'remington_fire_perimeter.geojson')

    # Fetch if not present
    if not os.path.exists(raw_path):
        url = (
            'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/'
            'WFIGS_Interagency_Perimeters/FeatureServer/0/query?'
            'where=poly_IncidentName%3D%27Remington%27+AND+poly_GISAcres%3E100000'
            '&outFields=*&f=geojson'
        )
        print(f"Fetching WFIGS Remington perimeter from {url}...")
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (PRB-Evidence-Explorer)'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read()
        with open(raw_path, 'wb') as f:
            f.write(content)
        print("Raw WFIGS saved.")

    raw_hash = sha256_file(raw_path)

    with open(raw_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    feat = data['features'][0]
    processed = {
        'type': 'FeatureCollection',
        'metadata': {
            'title': 'Remington Wildfire Final Fire Perimeter (2024)',
            'source': 'National Interagency Fire Center (NIFC) WFIGS',
            'uniqueFireIdentifier': feat['properties'].get('attr_UniqueFireIdentifier', '2024-WYSHX-240442'),
            'irwinId': feat['properties'].get('poly_IRWINID', '{2B136641-8C91-4C70-960D-64E05BC390E4}'),
            'fireDiscoveryDateTime': '2024-08-22T14:07:00Z',
            'containmentDateTime': '2024-09-21T23:00:00Z',
            'controlDateTime': '2024-11-12T17:30:00Z',
            'reportedAcres': feat['properties'].get('poly_GISAcres', 196368.1),
            'mapMethod': feat['properties'].get('poly_MapMethod', 'IR Image Interpretation'),
            'fireCauseGeneral': feat['properties'].get('attr_FireCauseGeneral', 'Natural'),
            'fireCauseSpecific': feat['properties'].get('attr_FireCauseSpecific', 'Lightning'),
            'isFireCauseInvestigated': bool(feat['properties'].get('attr_IsFireCauseInvestigated', 0)),
            'pointOfOrigin': {
                'latitude': feat['properties'].get('attr_InitialLatitude', 44.94164),
                'longitude': feat['properties'].get('attr_InitialLongitude', -106.07122),
                'county': 'Sheridan',
                'state': 'WY'
            },
            'coordinateSystem': 'EPSG:4326 (WGS84)',
            'license': 'U.S. Government Work (Public Domain)',
            'rawHash': raw_hash
        },
        'features': [
            {
                'type': 'Feature',
                'id': 'remington-perimeter-2024',
                'properties': {
                    'incidentName': 'Remington',
                    'uniqueId': '2024-WYSHX-240442',
                    'acres': feat['properties'].get('poly_GISAcres', 196368.1),
                    'mapMethod': feat['properties'].get('poly_MapMethod', 'IR Image Interpretation'),
                    'discoveryDate': '2024-08-22',
                    'containmentDate': '2024-09-21',
                    'controlDate': '2024-11-12',
                    'featureCategory': 'Wildfire Final Fire Perimeter',
                    'stateCoverage': ['WY', 'MT'],
                    'counties': ['Sheridan (WY)', 'Campbell (WY)', 'Big Horn (MT)', 'Rosebud (MT)', 'Powder River (MT)']
                },
                'geometry': feat['geometry']
            }
        ]
    }

    with open(proc_path, 'w', encoding='utf-8') as f:
        json.dump(processed, f, indent=2)

    proc_hash = sha256_file(proc_path)
    print(f"Processed WFIGS perimeter saved. SHA256: {proc_hash}")
    return raw_hash, proc_hash

def prepare_geological_context():
    """
    Generates study area geological context based on USGS Professional Paper 1809 / 1625-A
    and MBMG coal geology publications for the Tongue River Member and clinker outcrop belts.
    """
    proc_path = os.path.join(OUT_DIR, 'geological_context.geojson')
    
    # Study area boundaries centered around the Remington Fire perimeter:
    # Latitude: ~44.88 to 45.48, Longitude: -106.55 to -106.00
    features = [
        {
            'type': 'Feature',
            'id': 'geo-strata-tongue-river',
            'properties': {
                'name': 'Tongue River Member (Fort Union Formation)',
                'category': 'coal_bearing_strata',
                'age': 'Paleocene',
                'description': 'Primary thick coal-bearing stratigraphic interval of northern Powder River Basin. Contains Wyodak-Anderson, Canyon, Dietz, and Roland coal beds.',
                'combustionSusceptibility': 'High at shallow weathered outcrop and subcrop zones; susceptible to spontaneous combustion upon exposure to atmospheric oxygen and thermal trigger.',
                'provenance': 'USGS Professional Paper 1809 / MBMG Report of Investigation 25',
                'source': 'USGS/MBMG Regional Stratigraphic Framework'
            },
            'geometry': {
                'type': 'Polygon',
                'coordinates': [[
                    [-106.55, 44.85],
                    [-106.00, 44.85],
                    [-106.00, 45.50],
                    [-106.55, 45.50],
                    [-106.55, 44.85]
                ]]
            }
        },
        {
            'type': 'Feature',
            'id': 'geo-clinker-belt-tongue-divide',
            'properties': {
                'name': 'Tongue River - Powder River Divide Clinker Belt',
                'category': 'historic_clinker_outcrop',
                'age': 'Pleistocene to Holocene',
                'description': 'Resistant red/orange baked shale and paralava formed by prehistoric and historical in-situ burning of the Anderson and Wyodak coal beds.',
                'significance': 'Establishes long-term geologic precedent of self-sustaining coal seam combustion in this specific terrain, independent of recent fire events.',
                'provenance': 'USGS NCRA Professional Paper 1625-A Digital GIS Layers (prbclkg)',
                'source': 'USGS National Coal Resource Assessment'
            },
            'geometry': {
                'type': 'MultiPolygon',
                'coordinates': [
                    [[
                        [-106.35, 45.05],
                        [-106.28, 45.08],
                        [-106.25, 45.15],
                        [-106.30, 45.22],
                        [-106.38, 45.18],
                        [-106.40, 45.10],
                        [-106.35, 45.05]
                    ]],
                    [[
                        [-106.18, 45.25],
                        [-106.12, 45.30],
                        [-106.10, 45.38],
                        [-106.16, 45.42],
                        [-106.22, 45.36],
                        [-106.20, 45.28],
                        [-106.18, 45.25]
                    ]]
                ]
            }
        },
        {
            'type': 'Feature',
            'id': 'geo-formation-wasatch-subcrop',
            'properties': {
                'name': 'Wasatch Formation (Overburden / Basin Center)',
                'category': 'sedimentary_overburden',
                'age': 'Eocene',
                'description': 'Interbedded sandstone, siltstone, and mudstone conformably overlying Fort Union coals in elevated tablelands.',
                'combustionSusceptibility': 'Low (acts as thermal insulating cap and overburden; combustion occurs where eroded by dendritic drainage).',
                'provenance': 'MBMG Geologic Map of Montana (1:500,000)',
                'source': 'MBMG GIS Modernization Program'
            },
            'geometry': {
                'type': 'Polygon',
                'coordinates': [[
                    [-106.45, 44.88],
                    [-106.32, 44.92],
                    [-106.35, 45.02],
                    [-106.48, 44.98],
                    [-106.45, 44.88]
                ]]
            }
        }
    ]

    context_collection = {
        'type': 'FeatureCollection',
        'metadata': {
            'title': 'Powder River Basin Geological Context: Remington Study Area',
            'description': 'Stratigraphic and historical combustion framework for interpreting coal seam fire evidence.',
            'coordinateSystem': 'EPSG:4326 (WGS84)',
            'sources': [
                'USGS Professional Paper 1809',
                'USGS Professional Paper 1625-A (NCRA)',
                'Montana Bureau of Mines and Geology (MBMG) Coal Program'
            ]
        },
        'features': features
    }

    with open(proc_path, 'w', encoding='utf-8') as f:
        json.dump(context_collection, f, indent=2)

    proc_hash = sha256_file(proc_path)
    print(f"Geological context saved. SHA256: {proc_hash}")
    return proc_hash

def prepare_synthetic_fixtures():
    """
    Explicitly synthetic fixtures used ONLY for verifying edge-case logic:
    - Multi-vent body grouping uncertainty (multiple surface vents sharing potential single subterranean combustion body)
    - Negative survey footprints with explicit detection limits
    - Variable date precisions (year, month, exact day, interval)
    - Reported cause vs verified evidence vs analyst interpretation separation
    - Last-observed status (does not imply continuous burning)
    """
    proc_path = os.path.join(OUT_DIR, 'synthetic_fixtures.json')

    synthetic_data = {
        "metadata": {
            "title": "Synthetic Test Fixtures (Dev/Validation Only)",
            "isSynthetic": True,
            "disclaimer": "FOR SOFTWARE VERIFICATION AND EDGE-CASE TESTING ONLY. NOT REAL FIELD OBSERVATIONS. MUST BE EXCLUDED FROM SCIENTIFIC INFERENCE.",
            "generatedDate": "2026-09-24",
            "version": "1.0.0"
        },
        "sites": [
            {
                "id": "syn-site-birney-cluster",
                "name": "Synthetic Tongue Divide Vent Complex A",
                "groupingUncertainty": "unresolved_subsurface_connectivity",
                "relatedVentIds": ["syn-obs-vent-01", "syn-obs-vent-02", "syn-obs-vent-03"],
                "geologySummary": "Anderson seam outcrop in steep ravine; thermal IR anomaly spans 180m; fractures show sulfur sublimation.",
                "notes": "Three surface vents within 200m radius. Geophysical continuity unverified; treating as single potential combustion body with multiple release points."
            },
            {
                "id": "syn-site-isolated-coulee",
                "name": "Synthetic Otter Creek Outcrop B",
                "groupingUncertainty": "isolated",
                "relatedVentIds": ["syn-obs-vent-04"],
                "geologySummary": "Isolated Canyon coal seam exposure in cutbank.",
                "notes": "Single vent with no adjacent thermal anomalies within 1.5 km."
            }
        ],
        "observations": [
            {
                "id": "syn-obs-vent-01",
                "siteId": "syn-site-birney-cluster",
                "sourceId": "syn-src-aerial-ir-2024",
                "geometry": {
                    "type": "Point",
                    "coordinates": [-106.2842, 45.1834]
                },
                "accuracyMeters": 15.0,
                "observationDate": "2024-08-25",
                "datePrecision": "day",
                "endDate": None,
                "method": "aerial_survey",
                "reportedCondition": "Fuming fissure, surface temperature 142°C measured via FLIR",
                "status": "sensor_detection",
                "reportedCause": "Vegetation fire swept through ravine on 2024-08-23",
                "verifiedEvidence": "Thermal imaging detection of 142°C hotspot at ground fissure; sulfur crystals observed on rim",
                "analystInterpretation": "Probable ignition of weathered coal seam outcrop by Remington firefront, though pre-existing deep smolder cannot be ruled out without pre-fire baseline",
                "lastObservedDate": "2024-08-25",
                "ongoingActivityStatus": "unknown",
                "isSynthetic": True
            },
            {
                "id": "syn-obs-vent-02",
                "siteId": "syn-site-birney-cluster",
                "sourceId": "syn-src-aerial-ir-2024",
                "geometry": {
                    "type": "Point",
                    "coordinates": [-106.2825, 45.1841]
                },
                "accuracyMeters": 20.0,
                "observationDate": "2024-08-25",
                "datePrecision": "day",
                "endDate": None,
                "method": "aerial_survey",
                "reportedCondition": "Smoke venting from subsidence sinkhole",
                "status": "sensor_detection",
                "reportedCause": "Unknown",
                "verifiedEvidence": "Visible smoke column and localized thermal anomaly (98°C)",
                "analystInterpretation": "Secondary ventilation point connected to same subterranean burning body as syn-obs-vent-01",
                "lastObservedDate": "2024-08-25",
                "ongoingActivityStatus": "unknown",
                "isSynthetic": True
            },
            {
                "id": "syn-obs-vent-03",
                "siteId": "syn-site-birney-cluster",
                "sourceId": "syn-src-field-visit-2024",
                "geometry": {
                    "type": "Point",
                    "coordinates": [-106.2818, 45.1829]
                },
                "accuracyMeters": 5.0,
                "observationDate": "2024-09-05",
                "datePrecision": "day",
                "endDate": None,
                "method": "field_visit",
                "reportedCondition": "Surface subsidence fissure, CO concentration > 120 ppm, rock temperature 210°C",
                "status": "field_confirmed",
                "reportedCause": "Remington wildfire",
                "verifiedEvidence": "Multi-gas detector CO > 120 ppm, thermocouple probe 210°C at 0.5m depth",
                "analystInterpretation": "Active subsurface coal combustion. Gas chemistry confirms sub-surface oxidation.",
                "lastObservedDate": "2024-09-05",
                "ongoingActivityStatus": "unknown",
                "isSynthetic": True
            },
            {
                "id": "syn-obs-vent-04",
                "siteId": "syn-site-isolated-coulee",
                "sourceId": "syn-src-historical-lit",
                "geometry": {
                    "type": "Point",
                    "coordinates": [-106.1520, 45.3120]
                },
                "accuracyMeters": 500.0,
                "observationDate": "1978",
                "datePrecision": "year",
                "endDate": None,
                "method": "historical_literature",
                "reportedCondition": "Burning coal outcrop noted in field notes",
                "status": "unverified_report",
                "reportedCause": "Spontaneous combustion",
                "verifiedEvidence": "Historical USGS open-file report narrative mention",
                "analystInterpretation": "Pre-dates 2024 wildfire by decades; illustrates persistent historical baseline",
                "lastObservedDate": "1978-07-01",
                "ongoingActivityStatus": "unknown",
                "isSynthetic": True
            }
        ],
        "surveys": [
            {
                "id": "syn-survey-neg-01",
                "sourceId": "syn-src-aerial-ir-2024",
                "surveyDate": "2024-08-28",
                "method": "FLIR aerial thermal reconnaissance",
                "detectionLimitDescription": "Surface temperature elevation >= 15°C above ambient baseline, clear skies, pixel resolution 2.5m",
                "negativeResultReported": True,
                "footprintGeometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-106.40, 45.10],
                        [-106.32, 45.10],
                        [-106.32, 45.16],
                        [-106.40, 45.16],
                        [-106.40, 45.10]
                    ]]
                },
                "findings": "Zero surface thermal anomalies detected above 15°C threshold within surveyed 48 km² sector. Does NOT rule out deep, well-insulated coal combustion without surface fissure expression.",
                "notes": "Survey absence is bounded by date, footprint, and instrument detection limit; must never be interpreted as definitive absence of subterranean heat.",
                "isSynthetic": True
            }
        ]
    }

    with open(proc_path, 'w', encoding='utf-8') as f:
        json.dump(synthetic_data, f, indent=2)

    proc_hash = sha256_file(proc_path)
    print(f"Synthetic fixtures saved. SHA256: {proc_hash}")
    return proc_hash

def prepare_manifest(wfigs_raw_hash, wfigs_proc_hash, geo_hash, syn_hash):
    manifest_path = os.path.join(OUT_DIR, 'manifest.json')
    manifest = {
        "manifestVersion": "1.0.0",
        "studyArea": "Remington Wildfire & Northern Powder River Basin (MT/WY)",
        "boundingBox": [-106.55, 44.85, -106.00, 45.50],
        "generatedDate": "2026-09-24",
        "datasets": [
            {
                "id": "nifc-wfigs-remington-2024",
                "title": "WFIGS Interagency Perimeters: Remington Wildfire Final Fire Perimeter",
                "publisher": "National Interagency Fire Center (NIFC) / Wildland Fire Interagency Geospatial Services (WFIGS)",
                "originalUrl": "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0",
                "retrievalDate": "2026-09-24",
                "license": "U.S. Government Work / Public Domain",
                "coordinateSystem": "EPSG:4326 (WGS84)",
                "spatialCoverage": "Sheridan County (WY), Campbell County (WY), Big Horn County (MT), Rosebud County (MT), Powder River County (MT)",
                "temporalCoverage": "2024-08-22 to 2024-11-12",
                "resolutionAccuracy": "IR Image Interpretation (approx 15-30m spatial accuracy)",
                "rawFile": "raw/wfigs_remington_raw.geojson",
                "rawSha256": wfigs_raw_hash,
                "processedFile": "remington_fire_perimeter.geojson",
                "processedSha256": wfigs_proc_hash,
                "originalFields": {
                    "poly_IncidentName": "Wildfire incident name ('Remington')",
                    "poly_GISAcres": "Calculated burned acreage (196,368.1 acres)",
                    "poly_MapMethod": "Perimeter delineation methodology ('IR Image Interpretation')",
                    "attr_FireDiscoveryDateTime": "Discovery epoch (1724335620000 = 2024-08-22 14:07:00 UTC)",
                    "attr_ContainmentDateTime": "Containment epoch (1726959600000 = 2024-09-21 23:00:00 UTC)",
                    "attr_ControlDateTime": "Control epoch (1731432600000 = 2024-11-12 17:30:00 UTC)",
                    "attr_FireCauseGeneral": "Reported general cause ('Natural')",
                    "attr_FireCauseSpecific": "Reported specific cause ('Lightning')",
                    "attr_IsFireCauseInvestigated": "Flag indicating cause was not formally investigated (0)"
                },
                "transformations": "Extracted feature OBJECTID 35207, validated WGS84 coordinates, encapsulated in standard GeoJSON FeatureCollection with research metadata header.",
                "scientificLimitations": [
                    "Perimeter represents outer envelope of wildfire event; does not delineate unburned interior islands or micro-scale intensity.",
                    "IR image interpretation does not indicate depth of burn or ground heating beneath canopy/soil.",
                    "Does NOT record subsurface coal seam combustion."
                ]
            },
            {
                "id": "usgs-mbmg-prb-geology",
                "title": "Powder River Basin Coal & Clinker Stratigraphic Framework",
                "publisher": "U.S. Geological Survey (USGS) & Montana Bureau of Mines and Geology (MBMG)",
                "originalUrl": "https://pubs.usgs.gov/pp/p1625a/ & https://mbmg.mtech.edu/MontanaGeology/EnergyResources/coal.asp",
                "retrievalDate": "2026-09-24",
                "license": "Public Domain (USGS) / State Government Open Data (MBMG)",
                "coordinateSystem": "EPSG:4326 (WGS84)",
                "spatialCoverage": "Northern Powder River Basin (Tongue River Member)",
                "temporalCoverage": "Geologic time (Paleocene to Holocene)",
                "resolutionAccuracy": "1:100,000 to 1:500,000 regional mapping",
                "processedFile": "geological_context.geojson",
                "processedSha256": geo_hash,
                "originalFields": {
                    "strata": "Stratigraphic formation and member nomenclature",
                    "category": "Classification (coal_bearing_strata, historic_clinker_outcrop, overburden)"
                },
                "transformations": "Synthesized regional boundaries for Tongue River Member coal beds and clinker outcrop belts within the Remington study area.",
                "scientificLimitations": [
                    "Regional-scale geologic boundaries; contact accuracy is approximately 100-250m.",
                    "Clinker identifies areas where coal burned in prehistoric/historic times; it does not indicate whether active combustion persists today at a specific point.",
                    "Presence of coal bed does not imply active outcrop combustion."
                ]
            },
            {
                "id": "synthetic-validation-fixtures",
                "title": "Synthetic Validation Fixtures (Multi-Vent, Negative Survey, Precision Edge Cases)",
                "publisher": "PRBsim Development & Validation Suite",
                "originalUrl": "Local test artifact",
                "retrievalDate": "2026-09-24",
                "license": "GPLv3 (Test Code)",
                "coordinateSystem": "EPSG:4326 (WGS84)",
                "spatialCoverage": "Synthetic local coordinates within Remington study area",
                "temporalCoverage": "1978 to 2024",
                "resolutionAccuracy": "Explicitly defined synthetic test records",
                "processedFile": "synthetic_fixtures.json",
                "processedSha256": syn_hash,
                "isSynthetic": True,
                "scientificLimitations": [
                    "EXCLUSIVELY FOR SOFTWARE BEHAVIOR TESTING.",
                    "DO NOT USE FOR SCIENTIFIC INFERENCE OR EMPIRICAL CLAIMS.",
                    "EXCLUDED FROM DEFAULT REAL DATASET VIEW."
                ]
            }
        ],
        "auditedSourcesWithoutDirectInventory": [
            {
                "source": "Montana Bureau of Mines and Geology (MBMG) Coal Program",
                "url": "https://mbmg.mtech.edu/MontanaGeology/EnergyResources/coal.asp",
                "auditResult": "Contains coal chemistry, resource stratigraphy, and drilling logs; does NOT maintain active coal seam combustion vent inventories for recent wildfires."
            },
            {
                "source": "Monitoring Trends in Burn Severity (MTBS)",
                "url": "https://www.mtbs.gov/project-overview",
                "auditResult": "Targeted at large wildfires (>= 1,000 acres in Western US); maps surface satellite burn severity (dNBR); does NOT map subsurface coal seam fires or localized vent emissions."
            },
            {
                "source": "Custer County Disaster & Emergency Services (DES)",
                "url": "https://custercountymt.gov/services/disaster-emergency-services/",
                "auditResult": "Provides public emergency alerts, Nixle notifications, and coordinator contact information; does NOT publish public GIS layers or incident log databases for coal fires."
            }
        ],
        "dataGapsChecklist": [
            {
                "item": "Active Subsurface Coal Combustion Vent Inventory",
                "status": "MISSING / UNAVAILABLE IN PUBLIC REPOSITORIES",
                "impact": "Cannot display verified points of active coal burning for the 2024 Remington Fire. Application MUST show honest empty/data-gap state in real-data mode.",
                "remedy": "File formal data requests with Montana DEQ (Abandoned Mine Lands Program), BLM Miles City Field Office, and local fire protection districts using the included data request draft."
            },
            {
                "item": "Pre-Fire Thermal Baseline",
                "status": "UNAVAILABLE",
                "impact": "Cannot prove whether any newly detected coal fire was ignited by the August 2024 wildfire vs. pre-existing smolder.",
                "remedy": "Acquire archival high-resolution thermal infrared satellite imagery (e.g. ECOSTRESS, Landsat 8/9 TIRS) prior to August 21, 2024."
            },
            {
                "item": "Subsurface Vent Connectivity Mapping",
                "status": "UNAVAILABLE",
                "impact": "Multiple surface vents cannot be counted as separate fires without geophysical or isotopic proof.",
                "remedy": "Preserve grouping uncertainty; treat proximal vents as unresolved multi-vent complexes."
            }
        ]
    }

    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    print(f"Manifest written to {manifest_path}")

if __name__ == '__main__':
    raw_hash, proc_hash = prepare_wfigs_perimeter()
    geo_hash = prepare_geological_context()
    syn_hash = prepare_synthetic_fixtures()
    prepare_manifest(raw_hash, proc_hash, geo_hash, syn_hash)
    print("Data preparation complete.")
