/**
 * The in-page ink on/off control (FR-2, FR-4, NFR-12).
 *
 * SCAFFOLD.
 *
 * NFR-12 wants the mode visible at all times without obscuring content, and
 * NFR-13 wants nothing blocking the conversation — so this is a small fixed
 * affordance, and it must be keyboard-reachable and labelled for screen
 * readers even though its primary input is a stylus.
 */

export interface ToggleOptions {
  container: HTMLElement;
  /** FR-4: the layer starts off on every page load. */
  initialEnabled?: boolean;
  onChange(enabled: boolean): void;
}

export class InkToggle {
  constructor(_options: ToggleOptions) {
    throw new Error('Not implemented: InkToggle');
  }

  setEnabled(_enabled: boolean): void {
    throw new Error('Not implemented: InkToggle.setEnabled');
  }

  /** Reflect adapter breakage in the UI (NFR-9, spec section 8). */
  setDegraded(_degraded: boolean, _reason?: string): void {
    throw new Error('Not implemented: InkToggle.setDegraded');
  }

  destroy(): void {
    throw new Error('Not implemented: InkToggle.destroy');
  }
}
