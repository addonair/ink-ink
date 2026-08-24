/**
 * Which element actually scrolls the conversation.
 *
 * Most chat sites do not scroll the window. The sidebar, header and composer
 * stay put while only the message area moves, which means `window.scrollY` is
 * permanently 0 and any coordinate built from it is really a *viewport*
 * coordinate. Ink placed at such a coordinate does not follow the text, and a
 * target box measured before a scroll stops describing where its option is.
 *
 * Everything downstream works in **content coordinates**: viewport position
 * plus every scroll offset between the element and the page. Those are stable
 * across scrolling, which is what both anchoring (FR-11) and resolution
 * (FR-17/18) need.
 */

export interface ScrollOffset {
  x: number;
  y: number;
}

const SCROLLABLE = /auto|scroll|overlay/;

/** Whether this element is a scroll container with content to scroll. */
function scrolls(el: Element): boolean {
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style === undefined) return false;

  const canScrollY = SCROLLABLE.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
  const canScrollX = SCROLLABLE.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
  return canScrollY || canScrollX;
}

/**
 * The nearest scrolling ancestor of `from`, or null when the window scrolls.
 *
 * Null is the correct answer for an ordinary page, not a failure: the ink layer
 * already moves with window scroll because it sits in the document.
 */
export function findScrollRoot(from: Element | null): HTMLElement | null {
  let node: Element | null = from;

  while (node !== null && node !== document.body && node !== document.documentElement) {
    if (scrolls(node)) return node as HTMLElement;
    node = node.parentElement;
  }
  return null;
}

/**
 * Total scroll offset to add to a viewport position to get a content position.
 *
 * Includes the window's own scroll, so a page that scrolls both ways is handled
 * without a second code path.
 */
export function scrollOffsetOf(root: HTMLElement | null): ScrollOffset {
  return {
    x: window.scrollX + (root?.scrollLeft ?? 0),
    y: window.scrollY + (root?.scrollTop ?? 0),
  };
}

/** Human-readable description, for the console diagnosis. */
export function describeScrollRoot(root: HTMLElement | null): string {
  if (root === null) return 'window (page scrolls normally)';
  return `<${root.tagName.toLowerCase()} class="${root.className}"> (inner container)`;
}
