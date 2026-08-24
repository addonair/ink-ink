# Pen Overlay for AI Chat — MVP Specification

**Working title:** InkMark (naming TBD — shipping as `ink-ink`, see `.claude/decisions/`)
**Type:** Chrome extension (Manifest V3), desktop, touchscreen + stylus
**Owner:** Emmanuel Addo (Addonair)
**Status:** Draft v0.1 — pre-implementation

---

## 1. Problem

When an AI chat generates a multiple-choice quiz, answering it requires typing
(`1B 2C 3B`) or copy-pasting quoted text back into the composer. On a touchscreen
device with a stylus, the natural motion — circling or ticking the answer directly,
the way you would on paper — isn't available.

The same friction applies to referencing: to ask "explain this specific sentence,"
the user must select text with a long-press drag, copy it, paste it, and re-frame
the question.

**Goal:** let the user mark up an AI chat response with a stylus, and have those
marks resolve into structured text that gets sent back to the model.

---

## 2. Approach

A content script injects a transparent ink layer over supported chat sites. The
user draws with a stylus; strokes are captured, rendered as visible ink, and
resolved against the underlying DOM to determine what was marked. On submit, the
extension composes a text message describing the marks and inserts it into the
site's existing composer.

**Why an extension and not an app:** it rides the user's existing logged-in
session. No API keys, no per-token cost, no separate account.

---

## 3. Scope

### In scope (MVP)

- Chrome/Edge desktop, Manifest V3
- Six supported host sites: DeepSeek, ChatGPT, Claude, Gemini, Copilot and
  Perplexity. Originally scoped as one (DeepSeek) architected for more; the
  architecture held, and adding a site is now one entry in
  `src/adapters/sites.ts` — see `.claude/decisions/multi-site-support.md`.
- Stylus input as primary; finger reserved for scrolling
- Three mark types: **circle** (enclose an option), **tick** (point at an
  option), and **underline** (run a line along an option). Underline was added
  after field use — see `.claude/decisions/underline-mark.md`; the original
  scope was circle and tick only.
- MCQ answering flow — the primary use case
- Text-span referencing flow — the secondary use case

### Explicitly out of scope (MVP)

- Mobile browsers (Chrome Android has no extension support)
- Firefox / Safari ports
- Freeform handwriting recognition (writing words in ink)
- Vision-model interpretation of strokes
- Persisting ink across page reloads or sessions
- Multi-user / collaborative annotation
- Any use of the model API directly

### Non-goals

- Replacing the site's own UI or composer
- Automating message sending without an explicit user action
- Scraping, storing, or transmitting conversation content anywhere off-device

---

## 4. User stories

### Primary — answering a quiz

**US-1** — As a student reviewing generated MCQs, I want to circle the option I
believe is correct so that I can answer without typing.

**US-2** — As a student, I want to see my ink stay on screen after I draw it, so
the page looks like a marked-up past paper and I can tell at a glance what I've
already answered.

**US-3** — As a student, I want to answer several questions before submitting, so
that I get graded on the whole set in one response rather than one at a time.

**US-4** — As a student, I want to undo my last mark, so that a mis-drawn circle
doesn't force me to reload.

**US-5** — As a student, I want to change an answer by marking a different option,
so that the previous mark for that question is replaced rather than both being sent.

**US-6** — As a student, I want to see what will be sent before it sends, so that I
can catch a mis-resolved mark before wasting a turn.

### Secondary — referencing a passage

**US-7** — As a reader, I want to circle a sentence in a response and type a
follow-up, so that the model knows exactly which part I mean without me quoting it.

### Supporting

**US-8** — As a user, I want to scroll the conversation normally with my finger
while the pen is active, so that long quizzes remain usable.

**US-9** — As a user, I want to turn the overlay off, so that the extension never
interferes with normal use of the site.

**US-10** — As a user, I want to know that nothing I write is sent anywhere except
into the chat box I'm already using, so that I can trust it with coursework.

---

## 5. Functional requirements

### 5.1 Activation and mode

| ID   | Requirement                                                                              |
| ---- | ---------------------------------------------------------------------------------------- |
| FR-1 | The extension SHALL inject only on an explicit allowlist of host URLs.                   |
| FR-2 | The user SHALL be able to toggle the ink layer on and off via a visible in-page control. |
| FR-3 | When the ink layer is off, the extension SHALL NOT intercept any pointer events.         |
| FR-4 | The ink layer SHALL default to off on page load.                                         |

### 5.2 Input capture

| ID   | Requirement                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-5 | The system SHALL capture strokes from `pointerdown`/`pointermove`/`pointerup` where `pointerType === 'pen'`.                                          |
| FR-6 | The system SHALL NOT capture strokes where `pointerType === 'touch'`; those events SHALL pass through to the page for scrolling.                      |
| FR-7 | Where `pointerType === 'mouse'`, the system SHALL capture strokes only when the ink layer is explicitly toggled on (fallback for non-stylus testing). |
| FR-8 | A stroke SHALL be recorded as an ordered list of points with timestamps.                                                                              |
| FR-9 | Strokes SHALL be stored in **document coordinates**, not viewport coordinates.                                                                        |

### 5.3 Rendering

| ID    | Requirement                                                                                |
| ----- | ------------------------------------------------------------------------------------------ |
| FR-10 | Strokes SHALL be rendered as visible ink over the page content.                            |
| FR-11 | Ink SHALL remain visually anchored to the content it was drawn over when the page scrolls. |
| FR-12 | Ink SHALL re-anchor correctly when the page reflows (window resize, sidebar open/close).   |
| FR-13 | A resolved mark SHALL be visually distinguished from an unresolved one.                    |
| FR-14 | Ink SHALL be cleared when its associated marks are submitted or discarded.                 |

### 5.4 Stroke resolution

| ID    | Requirement                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| FR-15 | The system SHALL parse rendered assistant messages to identify candidate targets: question blocks, option lines, and text spans. |
| FR-16 | Each candidate target SHALL have a bounding box in document coordinates.                                                         |
| FR-17 | A **circle** mark SHALL resolve to the target whose bounding box has the greatest overlap with the stroke's enclosed area.       |
| FR-18 | A **tick** or short mark SHALL resolve to the target whose bounding box is nearest to the stroke's centroid.                     |
| FR-19 | Where no target exceeds a minimum confidence threshold, the mark SHALL be flagged as unresolved rather than guessed.             |
| FR-20 | An unresolved mark SHALL be visually indicated and SHALL NOT be included in the submitted message.                               |
| FR-21 | Where a new mark resolves to an option belonging to a question that already has a mark, the earlier mark SHALL be replaced.      |

### 5.5 Composition and submission

| ID    | Requirement                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| FR-22 | The system SHALL maintain a running set of resolved marks for the current page.                                                          |
| FR-23 | The system SHALL display a review panel listing each resolved mark in plain text before submission.                                      |
| FR-24 | The user SHALL be able to remove any individual mark from the review panel.                                                              |
| FR-25 | The user SHALL be able to undo the most recent stroke.                                                                                   |
| FR-26 | On submit, the system SHALL compose a plain-text message from the resolved marks and insert it into the host site's composer.            |
| FR-27 | Submission SHALL require an explicit user action; the extension SHALL NOT auto-send.                                                     |
| FR-28 | For the referencing flow (US-7), the composed message SHALL include the marked passage as quoted context plus the user's typed question. |

### 5.6 Message format

The composed message for the MCQ flow SHALL be human-readable, e.g.:

```
My answers:
1. B
2. C
3. B

Mark these and explain any I got wrong.
```

The trailing instruction SHALL be user-editable and SHALL persist as a setting.

---

## 6. Non-functional requirements

### Performance

| ID    | Requirement                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 | Ink SHALL render with no perceptible lag during stroke drawing (target < 16ms per frame).                                         |
| NFR-2 | Scrolling with the ink layer active SHALL remain smooth; ink re-positioning SHALL NOT block the main thread.                      |
| NFR-3 | Stroke resolution SHALL complete within 100ms of stroke end.                                                                      |
| NFR-4 | Target bounding boxes SHALL be computed lazily or cached; the extension SHALL NOT re-measure the full DOM on every pointer event. |

### Privacy and security

| ID    | Requirement                                                                                                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-5 | All stroke data and page content SHALL remain in the browser; nothing SHALL be transmitted to any external server.                           |
| NFR-6 | The extension SHALL request the narrowest possible host permissions.                                                                         |
| NFR-7 | The extension SHALL NOT read, store, or exfiltrate credentials, cookies, or session tokens.                                                  |
| NFR-8 | The extension SHALL NOT automate account actions in a way that would breach the host site's terms of service; all sending is user-initiated. |

### Robustness

| ID     | Requirement                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NFR-9  | Where a host site's DOM structure changes and targets cannot be parsed, the extension SHALL degrade to inert rather than break the page.                           |
| NFR-10 | Host-site DOM selectors SHALL be isolated in a per-site adapter module, so that supporting a new site or repairing a broken one requires no changes to core logic. |
| NFR-11 | The extension's styles SHALL be scoped so as not to affect host page rendering.                                                                                    |

### Usability

| ID     | Requirement                                                                            |
| ------ | -------------------------------------------------------------------------------------- |
| NFR-12 | Mode state (ink on/off) SHALL be visible at all times without obscuring content.       |
| NFR-13 | The review panel SHALL be dismissible and SHALL NOT block reading of the conversation. |
| NFR-14 | The extension SHALL be usable without reading documentation for the primary MCQ flow.  |

### Portability

| ID     | Requirement                                                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-15 | Stroke capture, coordinate handling, and hit-testing SHALL be implemented independently of any host site, so that the same core can later be reused in a standalone application. |

---

## 7. MVP cut

**Ship this:**

1. Toggle-on ink layer, one host site
2. Pen-draws / finger-scrolls separation
3. Circle and tick marks over MCQ options
4. Bounding-box resolution with an unresolved state
5. Review panel with undo and per-mark removal
6. Compose and insert into composer; user presses send

**Deliberately deferred:**

- The referencing flow (US-7) — valuable, but the MCQ flow is the sharper wedge
- Additional host sites
- Ink persistence
- Mobile

**Definition of done:** a user can open a generated 20-question MCQ set, answer
every question with a stylus without touching the keyboard except for the send
key, and receive graded feedback.

---

## 8. Key risks and open questions

| Risk                                  | Notes                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DOM fragility**                     | Host sites change markup without notice. Mitigated by NFR-10, but breakage is a question of when, not if. Needs a plan for detecting and signalling breakage.                              |
| **Option parsing**                    | Options are rendered markdown, not structured data. `A)` vs `A.` vs `(A)` vs list items all need handling. Worth surveying real output before designing the parser.                        |
| **Scroll anchoring during streaming** | If a response is still generating, content shifts as it grows. Marks drawn during streaming may drift. Simplest fix: disable ink while a response is streaming.                            |
| **Confidence threshold tuning**       | FR-19 needs a real number. Only discoverable by testing with actual strokes.                                                                                                               |
| **Stylus reporting**                  | Not all pens report `pointerType === 'pen'`; some report as touch or mouse. Needs verification on the target hardware before committing to FR-6.                                           |
| **ToS posture**                       | Injecting UI and inserting text into a composer is ordinary extension behaviour. Automating sends or driving the site headlessly is not. The line held here is: user initiates every send. |

---

## 9. Future direction

If the MCQ flow proves out, the same core (stroke capture → document coordinates →
bounding-box resolution) transfers to a standalone study application, where the
quiz is rendered as first-party UI rather than parsed out of someone else's DOM.
That version removes every DOM-fragility risk in this document and unlocks mobile.

The extension is the cheap way to find out whether the gesture is worth building
properly.
