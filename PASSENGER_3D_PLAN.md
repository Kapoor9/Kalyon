# Passenger tab, 3D rebuild — handoff

Branch: `passenger-3d` (the live site on `main` is untouched until this is approved).

## Goal
Rebuild the Passenger tab (`docs/js/passenger.js`, `docs/css/passenger.css`) as one continuous real-time
three.js world that the camera flies through as you scroll, at the level of Lusion / Active Theory.
No purchased models: train and coach are modelled in code. Must not lag: quality governor, one renderer.

## Hard rules (do not break)
- Every number comes from Kalyon's forecasts with the Station-board rules already in `docs/js/passenger.js`
  (`journey()`: ETA = forecast median, "be on the platform by" = low end of range, arrived = actual time,
  no forecast before the first running report). Re-run the 144-state match test before publishing.
- Synthetic data, replay, not live tracking: keep the honesty labels.
- Keep the existing data logic in passenger.js (journey, tips, alerts with chime/vibration/voice, pick-up,
  optimiser planned line, time scrubber). Replace only the presentation.
- Run `python tools/stamp.py` before every publish (cache-busting; fixes Safari).

## Status: all 14 chapters built (on this branch)
- `docs/js/pv/world.js`: renderer, half-float scene target with MSAA, dual-filter bloom, final pass
  (ACES, chromatic fringe, grain, vignette, flash, red tint, glitch), quality tiers and frame-time governor.
- `docs/js/pv/train.js`: WAP-7 locomotive, LHB coaches (shared interior-mapped glazing), coach interior,
  track, catenary, platform. Fixed light rig in the stage (no per-lamp point lights).
- `docs/js/pv/fx.js`: environment, sky and Shivalik hills, surface-sampled particle cloud, world dissolve,
  volumetric beam and glare, timetable tunnel, interior mapping, vestibule, station and route boards.
- `docs/js/pv/sets.js`: video window with rain on glass, LED dot-matrix board, holographic pass card,
  corridor map with route, comet and road signs, Saathi sculpture, rain and fog, forecast river, signal,
  depth photo, pick-up dial, sticker burst.
- `docs/js/pv/chapters.js`: the stage. Scroll → chapter clock T; camera splines and data-driven paths;
  cuts through white-outs and dips to black between sets; idle shader pre-compilation.
- `docs/js/passenger.js`: data logic unchanged; pass, road, tips, range, LED and pick-up now come from shared
  model functions used by both the HTML and the 3D world. `pscene.js` (photo scenes) removed.
- `tests/passenger_match.mjs`: 144-state match against the Station board (run before publishing).

## Sections → chapters
hero 1 · tunnel 2 · board 3 · live 4 · led 5 · pass 6 · corridor 7–8 · road 9 · saathi 10 · weather 11 ·
river 12 · alerts 13 · pickup + arrive 14.

## Ideas not done
- Real GPU profiling on a low-end phone (only software-rendered here); tune TIERS if needed.
- A lighter interior-mapping shader for the lowest tier.
