/**
 * The pre-submission review panel (FR-23, FR-24, FR-25, US-6).
 *
 * Its whole purpose is US-6: catch a mis-resolved mark before spending a turn
 * on it. So it shows the *resolved text*, not just "Q1 answered" — a wrong
 * resolution is only visible if you can read what will be sent.
 *
 * NFR-13: dismissible, and never blocking the conversation.
 */

import type { Mark, StrokeId } from '@core/types';

export interface ReviewPanelOptions {
  container: HTMLElement;
  onRemoveMark(strokeId: StrokeId): void;
  onUndo(): void;
  /** FR-27: this hands text to the composer. It never sends. */
  onSubmit(): void;
  onDismiss(): void;
}

const REASON_TEXT: Record<string, string> = {
  'no-targets': 'nothing recognisable underneath',
  'below-threshold': 'not clearly over an option',
  ambiguous: 'between two options',
  'unclassified-stroke': 'not read as a circle or tick',
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

  /** Re-render from the current mark set (FR-23). */
  update(marks: readonly Mark[]): void {
    this.#list.replaceChildren();

    const resolved = marks.filter((m) => m.resolution.status === 'resolved');
    this.#count.textContent =
      marks.length === 0
        ? 'No marks yet'
        : `${resolved.length} answer${resolved.length === 1 ? '' : 's'} of ${marks.length} mark${
            marks.length === 1 ? '' : 's'
          }`;

    for (const mark of marks) {
      this.#list.appendChild(this.#row(mark));
    }

    this.#submit.disabled = resolved.length === 0;
    if (marks.length > 0) this.show();
  }

  /** Show the exact text that will be inserted, so US-6 is actually served. */
  setPreview(text: string): void {
    this.#preview.textContent = text;
    this.#preview.hidden = text === '';
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

  #row(mark: Mark): HTMLLIElement {
    const li = document.createElement('li');
    const resolved = mark.resolution.status === 'resolved';
    li.dataset['state'] = resolved ? 'resolved' : 'unresolved';

    const text = document.createElement('span');
    if (mark.resolution.status === 'resolved') {
      const t = mark.resolution.target;
      const number = t.ordinal === undefined ? '' : `${t.ordinal}. `;
      text.textContent = `${number}${t.label ?? t.text}`;
    } else {
      const why = REASON_TEXT[mark.resolution.reason] ?? mark.resolution.reason;
      // FR-20: say why it will not be sent, rather than showing it as an answer.
      text.textContent = `Unresolved — ${why}`;
    }

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
