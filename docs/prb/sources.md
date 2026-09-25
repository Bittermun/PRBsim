# Public Sources & Feasibility Audit

## Evaluated Sources for the Remington Study Area (PRB)

### 1. National Interagency Fire Center (NIFC) WFIGS
- **Dataset**: WFIGS Interagency Perimeters (Remington Wildfire Final Perimeter 2024)
- **Feature Identifier**: `OBJECTID: 35207`, `UniqueFireIdentifier: 2024-WYSHX-240442`, `IRWIN ID: {2B136641-8C91-4C70-960D-64E05BC390E4}`
- **Spatial Coverage**: Sheridan County (WY), Campbell County (WY), Big Horn County (MT), Rosebud County (MT), Powder River County (MT)
- **Burn Area**: 196,368.1 GIS Acres
- **Mapping Method**: Infrared (IR) Image Interpretation
- **Timeline**: Discovery: 2024-08-22 14:07:00 UTC | Containment: 2024-09-21 23:00:00 UTC | Control: 2024-11-12 17:30:00 UTC
- **License / Terms**: U.S. Government Work / Public Domain
- **Availability**: Authoritative public REST service operational; downloaded and cached locally with SHA256 verification.

### 2. USGS & MBMG Coal Geology & Clinker Records
- **Publications**: USGS Professional Paper 1809 (*Coal resource assessment of the Powder River Basin*), USGS Professional Paper 1625-A (NCRA Digital GIS Layers `prbclkg`), MBMG Report of Investigation 25 (*Coal resources of north-central Montana*)
- **Significance**: Documents the Tongue River Member of the Fort Union Formation as the primary coal-bearing strata (Wyodak-Anderson, Canyon, Dietz beds) and maps clinker belts resulting from natural prehistoric/historic coal seam fires.
- **License / Terms**: USGS Public Domain / MBMG Montana State Open Data
- **Availability**: High-level stratigraphy and clinker zones available; used to provide regional geological context.

### 3. Monitoring Trends in Burn Severity (MTBS)
- **URL**: https://www.mtbs.gov/project-overview
- **Audit Findings**: MTBS maps large fires (>1,000 acres in the Western US) using Landsat/Sentinel normalized burn ratio (dNBR). MTBS does not record subsurface smoldering, ground gas vents, or localized coal seam combustion.

### 4. Montana Bureau of Mines and Geology (MBMG) Coal Program
- **URL**: https://mbmg.mtech.edu/MontanaGeology/EnergyResources/coal.asp
- **Audit Findings**: MBMG maintains extensive coal stratigraphic drilling data, coal quality/chemistry, and an Abandoned and Inactive Mines (AIM) dashboard. However, MBMG does not publish real-time or incident-level inventories of active post-wildfire coal seam combustion vents.

### 5. Custer County Disaster and Emergency Services (DES)
- **URL**: https://custercountymt.gov/services/disaster-emergency-services/
- **Audit Findings**: Custer County DES manages local emergency response coordination and Nixle civilian alerts. It does not publish public geospatial datasets or incident log databases for coal seam fires.
