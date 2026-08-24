/**
 * The pre-submission review panel (FR-23, FR-24, FR-25, US-6).
 *
 * Its whole purpose is US-6: catch a mis-resolved mark before spending a turn
 * on it. So it shows the *resolved text*, not just "Q1 answered" — a wrong
 * resolution is only visible if you can read what will be sent.
 *
 * NFR-13: dismissible, and never blocking the conversation.
 */

import type { Mark, QuestionId, StrokeId } from '@core/types';

/**
 * One question found on the page, with whatever the user did about it.
 *
 * The panel lists questions rather than marks so a question can be flagged for
 * explanation without being answered — which is the common case, since not
 * understanding a question is a good reason to leave it blank.
 */
export interface QuestionRow {
  questionId: QuestionId;
  ordinal: number;
  /** The chosen option's label, or null when unanswered. */
  answer: string | null;
  /** The stroke to erase when clearing this answer, if there is one. */
  strokeId: StrokeId | null;
  flagged: boolean;
}

/** Where the panel sits, in viewport pixels from the top-left. */
export interface PanelPosition {
  x: number;
  y: number;
}

export interface ReviewPanelOptions {
  container: HTMLElement;
  /** Called when the user finishes dragging, so the position can be kept. */
  onMoved?(position: PanelPosition): void;
  onRemoveMark(strokeId: StrokeId): void;
  onToggleFlag(questionId: QuestionId): void;
  onUndo(): void;
  /** FR-27: this hands text to the composer. It never sends. */
  onSubmit(): void;
  onDismiss(): void;
}

const REASON_TEXT: Record<string, string> = {
  'no-targets': 'nothing recognisable underneath',
  'below-threshold': 'not clearly over an option',
  ambiguous: 'between two options',
  'unclassified-stroke': 'not read as a circle, tick or underline',
};

export class ReviewPanel {
  readonly #root: HTMLElement;
  readonly #body: HTMLElement;
  /** null means the default corner from the stylesheet. */
  #position: PanelPosition | null = null;
  #dragFrom: { x: number; y: number } | null = null;
  readonly #onWindowResize = (): void => this.#applyPosition();
  readonly #collapseButton: HTMLButtonElement;
  #collapsed = false;
  readonly #list: HTMLElement;
  readonly #preview: HTMLElement;
  readonly #submit: HTMLButtonElement;
  readonly #count: HTMLElement;
  readonly #options: ReviewPanelOptions;

  constructor(options: ReviewPanelOptions) {
    this.#options = options;

    const root = document.createElement('section');
    root.className = 'ink-review-panel';
    root.hidden = true;
    root.setAttribute('aria-label', 'Marked answers');

    const header = document.createElement('header');

    /**
     * Collapse to just the header.
     *
     * Distinct from dismiss: dismissing hides the panel entirely, and the next
     * mark brings it straight back. Collapsing keeps the summary line in view
     * while getting the list out of the way, which is what a long question list
     * actually needs.
     */
    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'ink-collapse';
    collapse.addEventListener('click', () => this.#setCollapsed(!this.#collapsed));

    const count = document.createElement('strong');
    count.textContent = 'No marks yet';

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'ink-dismiss';
    dismiss.textContent = '×';
    dismiss.title = 'Hide until the next mark';
    dismiss.addEventListener('click', () => options.onDismiss());

    header.append(collapse, count, dismiss);

    /**
     * Drag by the header.
     *
     * Buttons inside it are excluded, or collapsing and dismissing would start
     * a drag instead of firing. Pen events reach here because the session
     * refuses to claim anything inside the overlay's own shadow root.
     */
    header.addEventListener('pointerdown', (event) => {
      if ((event.target as Element | null)?.closest('button') !== null) return;

      const rect = root.getBoundingClientRect();
      this.#dragFrom = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      try {
        header.setPointerCapture(event.pointerId);
      } catch {
        /* capture is an enhancement; dragging still works without it */
      }
      event.preventDefault();
    });

    header.addEventListener('pointermove', (event) => {
      if (this.#dragFrom === null) return;
      this.#position = {
        x: event.clientX - this.#dragFrom.x,
        y: event.clientY - this.#dragFrom.y,
      };
      this.#applyPosition();
    });

    const endDrag = (): void => {
      if (this.#dragFrom === null) return;
      this.#dragFrom = null;
      if (this.#position !== null) options.onMoved?.(this.#position);
    };
    header.addEventListener('pointerup', endDrag);
    header.addEventListener('pointercancel', endDrag);

    // Double-click the header to put it back where it started.
    header.addEventListener('dblclick', (event) => {
      if ((event.target as Element | null)?.closest('button') !== null) return;
      this.setPosition(null);
      options.onMoved?.({ x: -1, y: -1 });
    });

    // A panel dragged to the edge must not end up unreachable when the window
    // shrinks.
    window.addEventListener('resize', this.#onWindowResize, { passive: true });

    const list = document.createElement('ul');
    list.className = 'ink-mark-list';

    const preview = document.createElement('pre');
    preview.className = 'ink-preview';

    const actions = document.createElement('div');
    actions.className = 'ink-actions';

    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = 'Undo last';
    undo.addEventListener('click', () => options.onUndo());

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'ink-submit';
    submit.textContent = 'Put in composer';
    // FR-27: this is as far as the extension goes. The user presses send.
    submit.title = 'Inserts the text into the chat box. You press send.';
    submit.addEventListener('click', () => options.onSubmit());

    actions.append(undo, submit);

    // Everything except the header collapses, so the summary stays readable.
    const body = document.createElement('div');
    body.className = 'ink-body';
    body.append(list, preview, actions);

    root.append(header, body);
    options.container.appendChild(root);

    this.#root = root;
    this.#body = body;
    this.#collapseButton = collapse;
    this.#list = list;
    this.#preview = preview;
    this.#submit = submit;
    this.#count = count;

    this.#setCollapsed(false);
  }

  /**
   * Show or hide everything below the header.
   *
   * Deliberately NOT reset by `update()`. Re-expanding the panel on every
   * stroke would make collapsing useless precisely while drawing, which is when
   * it is wanted.
   */
  #setCollapsed(collapsed: boolean): void {
    this.#collapsed = collapsed;
    this.#body.hidden = collapsed;
    this.#root.dataset['collapsed'] = String(collapsed);
    this.#collapseButton.textContent = collapsed ? '▸' : '▾';
    this.#collapseButton.setAttribute('aria-expanded', String(!collapsed));
    this.#collapseButton.title = collapsed ? 'Show the answers' : 'Collapse to the summary';
    this.#applyPosition();
  }

  /** Whether the panel is collapsed to its header. */
  get collapsed(): boolean {
    return this.#collapsed;
  }

  /**
   * Move the panel, or pass null to return it to the stylesheet's corner.
   *
   * Negative coordinates are treated as "no stored position", so a caller
   * restoring a saved value does not have to special-case the absence of one.
   */
  setPosition(position: PanelPosition | null): void {
    this.#position = position !== null && position.x >= 0 && position.y >= 0 ? position : null;
    this.#applyPosition();
  }

  /** Where the panel currently sits, or null when it is at its default. */
  get position(): PanelPosition | null {
    return this.#position;
  }

  /**
   * Place the panel, keeping all of it on screen.
   *
   * Clamped on every apply rather than only while dragging, because collapsing
   * changes the height and resizing changes the viewport — either could
   * otherwise strand the header off the edge where it cannot be grabbed back.
   */
  #applyPosition(): void {
    const style = this.#root.style;

    if (this.#position === null) {
      style.left = '';
      style.top = '';
      style.right = '';
      style.bottom = '';
      return;
    }

    const rect = this.#root.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width);
    const maxY = Math.max(0, window.innerHeight - rect.height);

    style.left = `${Math.min(Math.max(0, this.#position.x), maxX)}px`;
    style.top = `${Math.min(Math.max(0, this.#position.y), maxY)}px`;
    style.right = 'auto';
    style.bottom = 'auto';
  }

  /**
   * Re-render from the questions on the page and any ink that resolved to
   * nothing (FR-23).
   *
   * Questions are listed whether or not they were answered, so an unanswered
   * one can still be flagged. Unresolved marks keep their own rows because
   * FR-13 and FR-20 require ink that landed on nothing to be visible and
   * excluded from the message.
   */
  update(questions: readonly QuestionRow[], unresolved: readonly Mark[]): void {
    this.#list.replaceChildren();

    const answered = questions.filter((q) => q.answer !== null).length;
    const flagged = questions.filter((q) => q.flagged).length;

    this.#count.textContent =
      questions.length === 0
        ? 'No questions found'
        : `${answered} of ${questions.length} answered` +
          (flagged > 0 ? `, ${flagged} to explain` : '');

    for (const question of [...questions].sort((a, b) => a.ordinal - b.ordinal)) {
      this.#list.appendChild(this.#questionRow(question));
    }
    for (const mark of unresolved) {
      this.#list.appendChild(this.#unresolvedRow(mark));
    }

    // Flags alone are worth sending: "I could not answer these, explain them".
    this.#submit.disabled = answered === 0 && flagged === 0;
    if (questions.length > 0 || unresolved.length > 0) this.show();
  }

  /** Show the exact text that will be inserted, so US-6 is actually served. */
  setPreview(text: string): void {
    this.#preview.textContent = text;
    this.#preview.hidden = text === '';
  }

  /**
   * Say where the text actually went.
   *
   * "Copied" is not a failure and must not read like one: the answers are safe,
   * they just need pasting. Saying nothing would leave someone staring at an
   * empty chat box wondering whether twenty marks were lost.
   */
  reportSubmission(outcome: 'inserted' | 'copied' | 'failed'): void {
    if (outcome === 'inserted') return;

    this.show();
    this.#preview.hidden = false;
    this.#preview.textContent =
      outcome === 'copied'
        ? 'Copied to your clipboard — paste it into the chat box, then send.'
        : 'Could not reach the chat box, and copying failed. Your marks are still here.';
  }

  show(): void {
    this.#root.hidden = false;
  }

  hide(): void {
    this.#root.hidden = true;
  }

  destroy(): void {
    window.removeEventListener('resize', this.#onWindowResize);
    this.#root.remove();
  }

  #questionRow(question: QuestionRow): HTMLLIElement {
    const li = document.createElement('li');
    li.dataset['state'] = question.answer === null ? 'unanswered' : 'resolved';
    if (question.flagged) li.dataset['flagged'] = 'true';

    const text = document.createElement('span');
    text.textContent =
      question.answer === null
        ? `${question.ordinal}. not answered`
        : `${question.ordinal}. ${question.answer}`;

    const flag = document.createElement('button');
    flag.type = 'button';
    flag.className = 'ink-flag';
    flag.textContent = '?';
    flag.setAttribute('aria-pressed', String(question.flagged));
    flag.title = question.flagged
      ? 'Remove the request to explain this question'
      : 'Ask for this question to be explained';
    flag.addEventListener('click', () => this.#options.onToggleFlag(question.questionId));

    li.append(text, flag);

    // Only an answered question has ink to clear (FR-24).
    if (question.strokeId !== null) {
      const strokeId = question.strokeId;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ink-remove';
      remove.textContent = '×';
      remove.title = 'Remove this answer';
      remove.addEventListener('click', () => this.#options.onRemoveMark(strokeId));
      li.append(remove);
    }

    return li;
  }

  /** Ink that resolved to nothing (FR-13, FR-20). */
  #unresolvedRow(mark: Mark): HTMLLIElement {
    const li = document.createElement('li');
    li.dataset['state'] = 'unresolved';

    const text = document.createElement('span');
    const why =
      mark.resolution.status === 'unresolved'
        ? (REASON_TEXT[mark.resolution.reason] ?? mark.resolution.reason)
        : '';
    text.textContent = `Unresolved — ${why}`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ink-remove';
    remove.textContent = '×';
    remove.title = 'Remove this mark';
    remove.addEventListener('click', () => this.#options.onRemoveMark(mark.stroke.id));

    li.append(text, remove);
    return li;
  }
}
