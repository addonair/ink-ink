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

export interface ReviewPanelOptions {
  container: HTMLElement;
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
    const count = document.createElement('strong');
    count.textContent = 'No marks yet';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'ink-dismiss';
    dismiss.textContent = '×';
    dismiss.title = 'Hide';
    dismiss.addEventListener('click', () => options.onDismiss());
    header.append(count, dismiss);

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
    root.append(header, list, preview, actions);
    options.container.appendChild(root);

    this.#root = root;
    this.#list = list;
    this.#preview = preview;
    this.#submit = submit;
    this.#count = count;
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
