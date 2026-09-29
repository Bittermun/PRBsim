---
name: rapid-feature
description: Rapidly implement and verify a small feature (≤30 min estimate) in PRBsim using the Ordo Velocitatis workflow.
---

# Ordo Velocitatis — Rapid Feature Workflow

For features estimated at ≤30 minutes. No planning artifacts needed. Speed is the virtue.

## Steps

1. **Invenio (30s)**: Grep for the integration point. Where does the new feature attach?
2. **Baseline Build Check**: Run `npm run build` to confirm the project builds cleanly BEFORE making changes.
3. **Distinguo (1 min)**: Read the integration file's outline. What patterns exist? Match them exactly.
4. **Executio**: Write the feature code. Prefer:
   - Adding to an existing file over creating a new one
   - Using existing CSS variables from `src/prb/style.css` (`--bg-primary`, `--bg-elevated`, `--border-subtle`, `--accent-primary`, `--status-*`)
   - Matching existing DOM patterns from `index.html` / `prb.html`
   - One Vanilla TypeScript class per UI component (if new UI is needed, add to `src/prb/ui/`)
5. **Probatio Formalis**: Run `npm run build` and `npm test` to confirm the feature compiles and tests pass.
6. **Probatio Materialis**: Ask the user to verify in browser (or verify via headless browser tools). Describe what they should see and where.
7. **Scribere**: If `DEVLOG.md` or task tracking in `ai/memory-bank/tasks/` is used, mark the feature as DONE.
8. **Final Sanity Check**: Run `npm run build` one final time to confirm nothing was broken.

## Rules
- Do NOT create heavy planning specs for features under 30 minutes
- If `npm run build` fails, fix the compiler/type error before proceeding to the next step
