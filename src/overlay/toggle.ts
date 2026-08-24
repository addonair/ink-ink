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
    button.addEventListener('click', () => {
      if (this.#degraded) return;
      this.setEnabled(!this.#enabled);
      this.#onChange(this.#enabled);
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

  /** Reflect adapter breakage in the UI (NFR-9, spec section 8). */
  setDegraded(degraded: boolean, reason?: string): void {
    this.#degraded = degraded;
    this.#button.disabled = degraded;
    this.#button.title = degraded
      ? (reason ?? 'ink-ink could not read this page')
      : 'Toggle pen marking';
    this.#paint();
  }

  destroy(): void {
    this.#button.remove();
  }

  #paint(): void {
    const label = this.#degraded ? 'Pen unavailable' : this.#enabled ? 'Pen on' : 'Pen off';

    this.#button.dataset['state'] = this.#degraded ? 'degraded' : this.#enabled ? 'on' : 'off';
    this.#button.setAttribute('aria-pressed', String(this.#enabled));
    this.#button.textContent = label;
  }
}
