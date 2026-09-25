---
description: Rapidly implement and verify a small feature (≤30 min estimate) using the Ordo Velocitatis
---

# Ordo Velocitatis — Rapid Feature Workflow

For features estimated at ≤30 minutes. No planning artifacts needed. Speed is the virtue.

## Steps

1. **Invenio (30s)**: Grep for the integration point. Where does the new feature attach?
// turbo
2. Run `npm run build` to confirm the project builds cleanly BEFORE making changes.

3. **Distinguo (1 min)**: Read the integration file's outline. What patterns exist? Match them exactly.

4. **Executio**: Write the feature code. Prefer:
   - Adding to an existing file over creating a new one
   - Using existing CSS variables (`--accent-color`, `--panel-bg`, `--glow-shadow`)
   - Matching existing DOM patterns from `index.html`
   - One class per UI component (if new UI is needed, add to `src/ui/`)

5. **Probatio Formalis**: Verify type safety.
// turbo
6. Run `npm run build` to confirm the feature compiles.

7. **Probatio Materialis**: Ask the user to verify in browser. Describe what they should see and where.

8. **Scribere**: Mark the feature as DONE in `DEVLOG.md`. Update the Status column.
// turbo
9. Run `npm run build` one final time to confirm nothing was broken by the DEVLOG edit (sanity check).

## Rules
- Do NOT create `implementation_plan.md` for features under 30 minutes
- Do NOT ask for plan approval — just build it
- DO mark DEVLOG immediately after user verification
- If `npm run build` fails, fix the error before proceeding to the next step
