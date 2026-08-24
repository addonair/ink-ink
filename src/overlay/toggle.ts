/**
 * The in-page ink on/off control (FR-2, FR-4, NFR-12).
 *
 * NFR-12 wants the mode visible at all times without obscuring content, so this
 * is a small fixed affordance. It is a real `<button>` — keyboard reachable and
 * announced — even though its primary input is a stylus.
 */

export interface ToggleOptions {
  container: HTMLElement;
  /** FR-4: the layer starts off on every page load. */
  initialEnabled?: boolean;
  onChange(enabled: boolean): void;
}

export class InkToggle {
  readonly #button: HTMLButtonElement;
  readonly #onChange: (enabled: boolean) => void;
  #enabled: boolean;
  #degraded = false;

  constructor(options: ToggleOptions) {
    this.#enabled = options.initialEnabled ?? false; // FR-4
    this.#onChange = options.onChange;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ink-toggle';
    /**
     * Always report the request; the session decides whether it can be honoured.
     *
     * The button used to disable itself when degraded, which latched the whole
     * feature off: a response with no options is perfectly normal, but once it
     * happened the pen could never be turned on again without a reload. Health
     * is re-checked on each attempt instead.
     */
    button.addEventListener('click', () => {
      this.#onChange(!this.#enabled);
    });

    options.container.appendChild(button);
    this.#button = button;
    this.#paint();
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    this.#paint();
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  /**
   * Reflect that nothing markable was found (NFR-9, spec section 8).
   *
   * Deliberately does not disable the button — see the click handler.
   */
  setDegraded(degraded: boolean, reason?: string): void {
    this.#degraded = degraded;
    this.#button.title = degraded
      ? (reason ?? 'No question options found in this response — try again after one is shown')
      : 'Toggle pen marking';
    this.#paint();
  }

  destroy(): void {
    this.#button.remove();
  }

  #paint(): void {
    // Name the actual situation. "Pen unavailable" read as a broken extension
    // when the real meaning is that this response has nothing to mark.
    const label = this.#degraded ? 'No options found' : this.#enabled ? 'Pen on' : 'Pen off';

    this.#button.dataset['state'] = this.#degraded ? 'degraded' : this.#enabled ? 'on' : 'off';
    this.#button.setAttribute('aria-pressed', String(this.#enabled));
    this.#button.textContent = label;
  }
}
