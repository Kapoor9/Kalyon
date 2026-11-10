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

## Done so far (on this branch)
- `docs/js/pv/world.js`: renderer, half-float scene target with MSAA, dual-filter bloom, final pass
  (ACES, chromatic fringe, grain, vignette, flash, red tint, glitch), quality tiers and frame-time governor,
  easing helpers.
- `docs/js/pv/train.js`: WAP-7 locomotive (headlights in `userData.headF`), LHB coach (`userData.door`,
  `userData.windowMat`), coach interior (seats, light strips with point lights in `userData.lights`,
  `userData.heroWindow`, `userData.boardAnchor` for the LED board), track (instanced sleepers),
  catenary, platform (lamps in `userData.lamps`).

## Still to build: the 14 chapters (scroll-driven camera)
1. Particles (~40k, sampled from the train's surfaces) condense into the train; headlight beam ignites.
2. Camera pushes into the headlight; white-out; light tunnel of streaming timetable numbers.
3. Coach doors slide open; camera glides down the aisle.
4. Window seat: the night-berth video (`docs/img/pass/onboard-night.mp4`) on the window, rain-on-glass, sway.
5. LED dot-matrix destination board flips to the Kalyon ETA and range.
6. Boarding pass as a 3D card with holographic foil; flips; stub tears off.
7. Out through the window, rise to an aerial 3D corridor (stations from `data/network.json` lat/lon).
8. Time scrubber: drag time, 3D train races along the track, sky dusk→night, station lights on.
9. Fly low past floating bilingual station signs with ETAs; passed dim, next glows.
10. Saathi: particle sculpture morphing (sphere, clock, wave, fog, rain, crowd) with tip cards.
11. Weather in 3D from the replay day (fog volume the headlight cuts; rain particles).
12. Forecast "river": the 80% range as a glowing band with timetable, display and Kalyon markers.
13. Alerts: cards slam in with glitch + camera shake + red pulse (use `post.glitch`, `post.red`).
14. Arrival: destination photo as a depth mesh (`docs/img/pass/city-*.jpg` + `-depth.jpg`), pick-up dial,
    sticker burst outro.

Suggested files: `docs/js/pv/chapters.js` (camera keyframes and per-chapter state),
`docs/js/pv/fx.js` (particles, tunnel, LED board, pass card, sculpture, river), then rewire passenger.js.
Checkpoint for the user after chapters 1–3 with screenshots.
