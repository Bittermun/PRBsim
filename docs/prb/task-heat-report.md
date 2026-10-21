# Heat lab implementation record

Date: 2026-10-20 (project local date). References: A3 / B1 / B3 / L6.

## Question and supported result

Can the project offer a small, reproducible demonstration of heat moving downward while keeping combustion and site-specific claims out of its results? The implemented slice solves one-dimensional conduction in a finite column with uniform, constant diffusivity. It compares temperatures at two depths. It is a checked numerical demonstration, not a validated Remington ground model, coal-combustion model, or ignition detector.

## Files and integration contract

- `src/prb/data/heat.ts`: `HeatParameters`, `HeatRun`, `DEFAULT_HEAT_PARAMETERS`, `validateHeatParameters`, `simulateHeat`, `HeatRunSession`, `HeatCancelledError`.
- `src/prb/data/heat.worker.ts`: module worker for local calculations.
- `src/prb/ui/HeatLab.ts`: `new HeatLab(container: HTMLElement | string, options?: HeatLabOptions)`, public `cancel()` and `destroy()`. Options accept partial initial parameters, worker factory, and timeout. No automatic run or network request.
- `tests/prb/heat.test.js` and `tests/prb/heat-ui.test.js`: 17 covering numerical, asynchronous-state, and result-rendering tests.

The panel has accessible name **Illustrative heat conduction lab** and class `.heat-lab`. Main controls are **Run heat comparison**, **Cancel heat run**, **Download heat run JSON**, and **Reset illustrative example**. Attributes `data-heat-status`, `data-heat-download`, and `data-heat-results` identify key states. Form labels state units; both chart traces share one temperature axis and differ by solid/dashed style. Numeric summary, sampled-temperature, and final-profile tables provide textual results. Changing inputs cancels any in-flight calculation and invalidates the old result/download.

## Method and bounds

The equation is `dT/dt = alpha * d²T/dz²`. The method is forward Euler in time and centered second differences in depth, with uniform grid spacing. Every step obeys `alpha * dt / dz² <= 0.2`, below the explicit stability ceiling of 0.5. Steps end exactly at sampled times and the surface pulse switch. The initial interior and fixed deep boundary are at ambient temperature. The prescribed surface is at the pulse temperature for `0 <= t < pulse duration`, then immediately returns to ambient. The switch is right-continuous; an output exactly at the pulse end shows the restored surface temperature.

Depth readings interpolate linearly between nodes. Peaks use every calculated step; chart/table samples include the pulse endpoint and 97 regular timestamps (one additional timestamp when the pulse falls between regular samples). The final profile contains all grid nodes. JSON retains the exact calculated run, full precision, inputs, timestamp, method version `conduction-1d-explicit-v1`, scope, assumptions, and warnings. Worker results are frozen again after structured cloning. Run kind is `illustrative_heat_transport`, kept separate from empirical observation exports.

Limits are 21–401 grid points, at most 720 hours, depth 0.001–1000 m, diffusivity 1e-12–0.01 m²/s, and an estimated maximum of 50 million node updates. Temperatures are constrained to −273.15–2000 °C for finite demonstration inputs; this range does not imply that constant properties are valid across it. Impossible depths, nonfinite values, negative durations, and excessive combinations are rejected before worker allocation. The solver also supports cooperative cancellation; UI cancellation/replacement terminates the worker immediately and ignores stale identities. The default timeout is 30 seconds. Worker error, unreadable-message, malformed-result, and cancellation states release resources and do not save partial results.

## Independent numerical checks and outcomes

Tests were written before the new production files. The initial run produced ten explicit absent-model assertion failures; the first UI run produced two absent-panel assertion failures.

The independent semi-infinite constant-surface solution is

`T(z,t) = Ti + (Ts - Ti) * erfc(z / (2 * sqrt(alpha * t)))`.

At `z = 0.25 m`, `alpha = 1e-6 m²/s`, `t = 62500 s`, `Ti = 0 °C`, and `Ts = 400 °C`, the argument is 0.5. The known value `erfc(0.5) = 0.4795001221869535` gives **191.8000488747814 °C**. The 3 m model boundary is remote for this check. Absolute errors were:

| Grid points | Calculated value (°C) | Absolute error (°C) |
| --- | --- | --- |
| 31 | 193.8375695943759 | 2.037520719594511 |
| 61 | 192.09505190420177 | 0.2950030294203714 |
| 121 | 191.88808223502747 | 0.08803336024607233 |

A rectangular surface pulse is independently checked by superposition: subtract a second analytical step after pulse end. Python standard-library `math.erfc` independently evaluated the default depth-A result at 24 hours as **23.566397161794455 °C**. The solver returned **23.557896300903717 °C**, an error of about −0.00850 °C. This checks numerical implementation for this mathematical problem; it does not test whether the prescribed pulse matches an actual wildfire.

Default illustrative inputs: diffusivity 1e-6 m²/s; initial 15 °C; surface 500 °C for 2 hours; total 24 hours; depths 0.25 m and 1 m; model depth 3 m; 121 nodes. The result used 768 steps, grid spacing 0.025 m, maximum timestep 125 seconds. Default depth-A maximum was about 65.31 °C at 4.104 hours; final A/B values about 23.56/17.02 °C. These are demonstration outputs, not measured ground temperatures.

Other passing checks cover initial/deep/surface conditions, pulse discontinuity, temperature bounds, zero-pulse and equal-temperature limits, cooling, deep-boundary proximity warnings, invalid/excessive inputs, cancellation, stale-result suppression, worker errors, malformed results, shared chart axes, accessible tables, and escaped metadata.

### What needed correction

- A manually entered pulse reference was initially mistyped; independent `math.erfc` evaluation corrected it before the solver was written.
- The first implementation used the stable ratio 0.45. Its fine-grid step-reference error was 0.2058 °C, above the selected 0.15 °C tolerance. Reducing the maximum ratio to 0.2 improved the error to 0.0880 °C while retaining mesh convergence.
- A newly added malformed-worker-result check exposed a permanently pending promise. The regression timed out after one second; the session now rejects malformed results and releases the worker. The covering suite then passed.
- Integration review identified chart colors with poor contrast on the shared light background. Darker solid/dashed strokes now use theme-overridable CSS variables.
- Independent review found that fixed three-decimal labels collapsed very small valid depths, grid spacing, and times to zero. A regression reproduced this with a 1 mm domain, 0.1/0.2 mm comparison depths, and a 1e-8 hour run. Adaptive significant-digit formatting now retains their distinct nonzero units, with scientific notation when appropriate.
- The controller's actual screenshot review showed that using the imposed 500°C surface temperature for the depth chart's axis flattened the calculated depth curves. A red/green rendering check drove one shared, padded axis around calculated depth temperatures, with intermediate ticks and an explicit separate statement of the imposed surface boundary. The default axis is 10–70°C. Both depths still use identical axes, and the numerical model and saved values are unchanged.
- A late independent off-grid check found that interpolation from the newly hot surface made positive depths within the first cell appear hot at time zero (403°C at 0.005 m instead of the prescribed 15°C). Failing tests reproduced the initial-sample and negligible-pulse peak errors. Positive-depth initial readings/peaks now use the known ambient condition; depth zero alone uses the surface boundary. Later grid calculations/interpolation are unchanged. An explicit first-cell resolution warning appears in results and JSON, and the sampling metadata documents the initial-condition convention. This correction demonstrates why a default benchmark alone is insufficient to check every displayed sampling boundary.

Latest covering command: `node --experimental-strip-types --test tests/prb/heat.test.js tests/prb/heat-ui.test.js` — **17 passed, 0 failed**. The task's earlier TypeScript/build attempts were blocked by concurrent MapLibre upgrade/default-export and integration NodeList typing errors outside these files; no heat typing error was reported. Those are historical module checkpoints; the final complete build and real-browser worker/run/download results belong in the integration report and shared work log.

## Remaining scientific questions and next useful check

The model omits layered geology, variable properties, moisture and phase changes, oxygen, fluid transport, radiation, heat release, coal reactions, cracks, and lateral pathways. A shallow fixed deep boundary can distort results; a warning prompts comparison with a deeper model. Finer-grid results may still differ, especially near a discontinuity or shallow surface; expose grid sensitivity before interpreting temperatures.

Next scientific step is an independently specified case with measured material properties and boundary conditions, followed by sensitivity/domain checks. Adding combustion requires additional conservation equations, reaction/oxygen physics, independent benchmarks, and field validation. Neither agreement with the heat-equation reference nor a chosen displayed temperature establishes ignition or causal direction between surface and underground fires.
