/**
 * A synthetic MCQ page, for exercising the pipeline without a real host site.
 *
 * Covers all four option formats spec section 8 flags as needing handling:
 * `A)`, `A.`, `(A)`, and plain list items.
 *
 * jsdom does not lay out, so `getBoundingClientRect` returns zeros there. This
 * module therefore assigns explicit geometry via data attributes rather than
 * pretending a layout happened — the fixture adapter reads those. Being honest
 * about that is what keeps the test meaningful: it exercises resolution logic,
 * and makes no claim about real-browser measurement.
 */

export interface FixtureLayout {
  /** Height of one option line in px. */
  lineHeight: number;
  /** Vertical gap between option lines. */
  lineGap: number;
  /** Left edge and width of every option box. */
  x: number;
  width: number;
  /** y of the first option line. */
  startY: number;
  /** Extra vertical space between questions. */
  questionGap: number;
}

export const DEFAULT_LAYOUT: FixtureLayout = {
  lineHeight: 20,
  lineGap: 10,
  x: 100,
  width: 200,
  startY: 100,
  questionGap: 40,
};

interface QuestionSpec {
  prompt: string;
  /** Rendered exactly as given, so option-format parsing is under test. */
  options: string[];
}

export const QUESTIONS: QuestionSpec[] = [
  {
    prompt: '1. What is the capital of France?',
    options: ['A) Berlin', 'B) Paris', 'C) Madrid'],
  },
  {
    prompt: '2. Which planet is closest to the Sun?',
    options: ['A. Venus', 'B. Mercury', 'C. Mars'],
  },
  {
    prompt: '3. What is 7 x 8?',
    options: ['(A) 54', '(B) 56', '(C) 64'],
  },
];

/**
 * Build the fixture DOM inside `doc`, assigning explicit geometry.
 *
 * Returns the assistant message root.
 */
export function buildMcqPage(
  doc: Document,
  layout: FixtureLayout = DEFAULT_LAYOUT,
  container?: HTMLElement,
): HTMLElement {
  const message = doc.createElement('div');
  message.setAttribute('data-role', 'assistant');

  let y = layout.startY;

  QUESTIONS.forEach((q, qIndex) => {
    const block = doc.createElement('div');
    block.setAttribute('data-question', String(qIndex + 1));

    const prompt = doc.createElement('p');
    prompt.textContent = q.prompt;
    block.appendChild(prompt);

    const list = doc.createElement('ul');
    for (const optionText of q.options) {
      const li = doc.createElement('li');
      li.textContent = optionText;
      li.setAttribute('data-rect', [layout.x, y, layout.width, layout.lineHeight].join(','));
      list.appendChild(li);
      y += layout.lineHeight + layout.lineGap;
    }

    block.appendChild(list);
    message.appendChild(block);
    y += layout.questionGap;
  });

  (container ?? doc.body).appendChild(message);

  const composer = doc.createElement('textarea');
  composer.setAttribute('data-role', 'composer');
  (container ?? doc.body).appendChild(composer);

  return message;
}

/** Document-coordinate box of the option at (question, index), both 0-based. */
export function optionBounds(
  question: number,
  index: number,
  layout: FixtureLayout = DEFAULT_LAYOUT,
): { x: number; y: number; width: number; height: number } {
  let y = layout.startY;

  for (let q = 0; q < question; q++) {
    y += QUESTIONS[q]!.options.length * (layout.lineHeight + layout.lineGap) + layout.questionGap;
  }
  y += index * (layout.lineHeight + layout.lineGap);

  return { x: layout.x, y, width: layout.width, height: layout.lineHeight };
}
