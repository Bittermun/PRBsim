# PRBsim UI Component & Styling Rules (`src/prb/ui/`)

When creating or modifying UI components in `src/prb/ui/` or styles in `src/prb/style.css`, follow these exact conventions:

1. **Vanilla TypeScript Pattern (No React / No Tailwind)**:
   - Stateful UI components in `src/prb/ui/` (`EvidencePanel`, `MapLegend`, `TimelineControl`) are standalone Vanilla TypeScript classes that accept a `containerId: string` (or `HTMLElement`), bind DOM listeners cleanly, and expose typed callback setters (e.g., `setOnLayerToggle`), while `ExportDialog.ts` exposes pure, Node-testable export/report builders (`buildExportGeoJson`, `buildExportCsv`, `buildStaticBriefHtml`) alongside browser download/print helpers.
   - Do not introduce React, JSX, Tailwind, or external UI frameworks.

2. **Restrained Scientific Design System (`src/prb/style.css`)**:
   - Maintain a quiet, cartographic, publication-grade scientific interface with WCAG AA contrast in both light (`:root`) and dark (`[data-theme="dark"]`) themes.
   - Always use the existing CSS custom properties defined in `src/prb/style.css`:
     - **Surfaces & Borders**: `--bg-primary`, `--bg-secondary`, `--bg-elevated`, `--bg-hover`, `--border-subtle`, `--border-strong`
     - **Typography**: `--text-primary`, `--text-secondary`, `--text-muted`, `--font-sans`, `--font-mono`
     - **Cartographic & Layer Accents**: `--accent-primary`, `--accent-hover`, `--accent-perim` (`--accent-perim-bg`), `--accent-clinker` (`--accent-clinker-bg`), `--accent-coal` (`--accent-coal-bg`), `--accent-survey` (`--accent-survey-bg`)
     - **Verification Status Badges**: `--status-confirmed`, `--status-sensor`, `--status-unverified`, `--status-extinguished`, `--status-reignited`
     - **Elevation & Radii**: `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--radius-sm`, `--radius-md`, `--radius-lg`

3. **Epistemic Transparency in UI**:
   - Clearly distinguish verified empirical records from unverified or synthetic validation fixtures using the `--status-*` badge tokens.
   - Never hide data gaps; display explicit Data Gap notices when subsurface combustion vent inventories are unavailable.
