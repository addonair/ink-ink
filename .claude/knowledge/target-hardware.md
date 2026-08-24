# Target hardware

Verified facts about the device this project is actually developed and tested
on. Recorded because `docs/spec.md` was written assuming different hardware,
and two of its requirements depend on the difference.

## Device

**XENX X1 graphics tablet** on Windows 11 — an indirect pen tablet, not a
touchscreen. The pen is used on a separate surface while looking at the
monitor.

The spec repeatedly assumes a touchscreen ("On a touchscreen device with a
stylus… circling or ticking the answer directly, the way you would on paper",
section 1). That premise does not hold here.

## Verified by the pointer probe, 2026-08-23

Run via `tools/pointer-probe.html`, report copied from the page.

| Signal           | pen                | mouse                  |
| ---------------- | ------------------ | ---------------------- |
| events observed  | 271                | 190                    |
| `pressure` range | 0 – 0 (1 distinct) | 0.5 – 0.5 (1 distinct) |
| reports tilt     | no                 | no                     |
| max coalesced    | 3                  | 2                      |

`maxTouchPoints: 0`, `anyPointerFine: true`, `devicePixelRatio: 1.25`.

### What this settles

- **`pointerType === 'pen'` works.** This closes the top risk in spec section 8
  and confirms FR-5 as written. Pen and mouse are cleanly distinguishable, and
  were observed simultaneously as separate pointer types.
- **Coalesced events are delivered** (up to 3 per frame for the pen), so
  intermediate samples are available for smooth ink (NFR-1).
- **There is no touch input at all** (`maxTouchPoints: 0`). FR-6 and US-8
  reserve finger-touch for scrolling; on this device there is no finger input
  to reserve, and no scroll gesture to preserve. Those requirements are not at
  risk of failing here — they have nothing to act on.

### Prerequisite: Windows Ink

The pen initially reported as `mouse`, with no tilt, one coalesced sample, and
pressure pinned to a constant. That is mouse emulation, not a hardware limit.
**Enabling Windows Ink in the tablet's own driver control panel** switched it to
`pen`.

Any future tester seeing `mouse` for a pen should check this before concluding
the hardware cannot report pen input. The probe detects the signature and says
so.

## Open

- **Pen pressure reads a constant 0** across 271 drawing events. Under the
  Pointer Events spec a pen with no pressure support should report `0.5` while
  in contact, so a flat `0` is unexpected. Prime suspect: the probe was run in
  VS Code's Electron (`Code/1.134.0 … Electron/42.8.1` in the user agent), not
  standalone Chrome. Re-test in a real browser window to settle it.

  **Not MVP-blocking.** No functional requirement uses pressure: FR-8 asks only
  for ordered points with timestamps, and resolution (FR-17/18/19) is pure
  geometry. `Point.pressure` is optional precisely for this case.

  It does mean **pressure must never be used as a pen-down proxy** — a
  `pressure > 0` contact test would never fire on this device.

- Tilt is not reported for the pen either. Also unused by any requirement.
