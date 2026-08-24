# ink-ink

Mark up an AI chat response with a stylus — circle the answer, tick the option —
and have those marks resolve into text that goes back to the model.

When a chat generates a multiple-choice quiz, answering it means typing `1B 2C 3B`
or copy-pasting quoted text into the composer. On a touchscreen with a pen, the
natural motion is the one you'd use on paper. This is a Chrome extension that
makes that motion work.

> **Status: scaffold.** The repository structure, toolchain, and architectural
> boundaries are in place. Feature code is not — the modules under `src/` are
> typed stubs. See [`docs/spec.md`](docs/spec.md) for the full MVP specification.

## How it works

A content script injects a transparent ink layer over a supported chat site. Pen
strokes are captured, drawn as visible ink, and resolved against the page's
rendered options by bounding-box overlap. On submit, the resolved marks are
composed into a plain-text message and inserted into the site's own composer —
**you press send.**

It rides your existing logged-in session. No API keys, no per-token cost, no
separate account.

## Privacy

Stroke data and page content never leave your browser. The extension makes no
network requests and requests exactly one permission — `storage` — used solely
to remember the trailing instruction you configure.

There are no `host_permissions`, and the content script runs only on the
explicit host allowlist in [`manifest.config.ts`](manifest.config.ts). CI fails
the build if that permission list ever grows.

## Getting started

```bash
npm install
npm run dev          # then load dist/ as an unpacked extension
```

To load it: open `chrome://extensions`, enable Developer mode, click **Load
unpacked**, and select the `dist/` directory. `npm run dev` gives you hot reload
on the content script; `npm run build` produces a production bundle.

## Scripts

| Command             | What it does                                                                  |
| ------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR on the content script                                |
| `npm run demo`      | Standalone demo page at localhost:5174 — draw with a pen, no extension needed |
| `npm run build`     | Production bundle into `dist/`                                                |
| `npm run zip`       | Build, then package `dist/` into `release/`                                   |
| `npm run typecheck` | `tsc --noEmit`                                                                |
| `npm run lint`      | ESLint, including the architectural boundary rules                            |
| `npm test`          | Vitest                                                                        |
| `npm run icons`     | Regenerate placeholder icons (stdlib Python, no deps)                         |
| `npm run validate`  | Check the `.claude/` knowledge base for stale entries                         |

## Layout

```text
src/
├── core/          Pure logic. No DOM, no chrome.*, no host assumptions.
│   ├── types.ts       Point, Stroke, Target, Mark, Resolution
│   ├── geometry.ts    bounding boxes, areas, overlap, distance
│   ├── stroke.ts      pointer samples -> strokes in document coordinates
│   ├── classify.ts    circle? tick? neither?
│   └── resolve.ts     which target did this stroke mark?
├── adapters/      Every host-site selector lives here, and nowhere else.
├── overlay/       Ink canvas, toggle, review panel. Shadow DOM.
├── state/         The running set of marks.
├── compose/       Marks -> the message that gets inserted.
├── content/       Entry point. Wires the above; fails inert.
├── background/    Service worker. Deliberately almost empty.
└── options/       Settings page.
```

### Two boundaries worth knowing

**`src/core/` imports nothing.** Not adapters, not `chrome`, not `document`.
The spec's stated future direction is lifting this core into a standalone study
app where the quiz is first-party UI; that stays a move rather than a rewrite
only if the boundary holds. ESLint enforces it — see
[`.claude/decisions/core-adapter-boundary.md`](.claude/decisions/core-adapter-boundary.md).

**Host selectors live only in `src/adapters/`.** Chat sites change their markup
without notice. When DeepSeek breaks, the repair should be one file.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). If the extension stopped recognising a
site, there's a dedicated issue template for it.

## License

MIT — see [LICENSE](LICENSE).
