/**
 * Options page: persists the user-editable trailing instruction (FR-26, 5.6).
 *
 * The only thing that touches chrome.storage, and the only reason the
 * extension requests any permission at all.
 *
 * SCAFFOLD: wiring sketched, load/save not implemented.
 */

import { DEFAULT_TRAILING_INSTRUCTION } from '@compose/message';

export const STORAGE_KEY = 'trailingInstruction';

export async function loadTrailingInstruction(): Promise<string> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const value: unknown = stored[STORAGE_KEY];
  return typeof value === 'string' ? value : DEFAULT_TRAILING_INSTRUCTION;
}

export async function saveTrailingInstruction(value: string): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: value });
}

function init(): void {
  const field = document.querySelector<HTMLTextAreaElement>('#trailing-instruction');
  const status = document.querySelector<HTMLParagraphElement>('#status');
  if (field === null) return;

  void loadTrailingInstruction().then((value) => {
    field.value = value;
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  field.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void saveTrailingInstruction(field.value).then(() => {
        if (status !== null) status.textContent = 'Saved.';
      });
    }, 400);
  });
}

document.addEventListener('DOMContentLoaded', init);
