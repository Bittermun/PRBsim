# Research Methods & Data Model Architecture

## Powder River Basin Coal-Fire Evidence Explorer (Remington Study Area)

### 1. Purpose & Guiding Research Question
This application is an auditable case-study explorer investigating interactions between surface vegetation wildfires (specifically the 2024 Remington Fire) and subterranean coal seam combustion in the Powder River Basin (Montana/Wyoming).

The central hypothesis under investigation is:
> *Do surface vegetation fires generate new persistent coal-seam fires, which can subsequently reignite surface vegetation?*

### 2. Core Scientific Constraints & Invariants

1. **New Detection $\neq$ New Ignition**:
   A thermal hotspot or venting fissure identified after a wildfire cannot be asserted to have been caused by that wildfire without a documented pre-fire negative baseline. In-situ coal smoldering can persist undetected underground for decades.
2. **Multi-Vent Grouping Uncertainty**:
   Multiple surface fissures venting combustion products may originate from a single continuous subterranean combustion body. Surface vent counts must not be naively equated to discrete fire counts.
3. **Spatial Overlap $\neq$ Causation or Hydraulic Connectivity**:
   Co-location of a wildfire perimeter with a coal outcrop does not establish ignition direction, subsurface fracture propagation, or groundwater contamination pathways.
4. **Survey Absence $\neq$ Evidence of Absence**:
   A negative observation must have a defined spatial footprint, observation timestamp, method, and instrument detection limit. Unsurveyed regions must be rendered as *unknown/unsurveyed*, never as *fire-free*.
5. **Separation of Evidence Categories**:
   - **Reported Cause**: Unverified narrative attribution from initial dispatch, property owners, or media.
   - **Verified Evidence**: Calibrated physical sensor measurements, gas chromatography (CO, $CO_2$, $SO_2$), thermocouple probes, and ground-truth sample receipts.
   - **Analyst Interpretation**: Working scientific hypotheses or models with documented assumptions.
6. **No Synthetic Data in Empirical Claims**:
   Synthetic fixtures exist strictly for verifying interface mechanics (handling multi-vent clustering, negative survey footprints, and variable date precision) and are strictly quarantined behind an explicit developer toggle.

### 3. Data Entities

- **`FirePerimeter`**: Official spatial polygon, agency provenance, discovery/containment timestamps, mapping methodology, and calculated acreage.
- **`GeologicalUnit`**: Stratigraphic members (e.g., Tongue River Member) and historical clinker outcrop belts that establish combustion susceptibility and long-term geological precedent.
- **`Site`**: A physical location that may encompass one or more surface vents sharing uncertain subsurface connectivity (`isolated`, `cluster_member`, `unresolved_subsurface_connectivity`).
- **`Observation`**: Immutable point or polygon record with date, date precision (`day`, `month`, `year`), method, reported condition, verification status, and separate fields for reported cause, verified physical evidence, and interpretation.
- **`Survey`**: Negative or positive reconnaissance campaign with explicit polygon footprint, sensor detection limit, date, and findings.
- **`DatasetManifest`**: Auditable catalog containing title, publisher, original URL, retrieval date, SHA256 cryptographic hash, spatial/temporal coverage, and field-level lineage.
