export function requireElement<TElement extends Element>(scope: ParentNode, selector: string): TElement {
  const element = scope.querySelector<TElement>(selector);
  if (!element) {
    throw new Error(`Cursor Office element was not found: ${selector}`);
  }

  return element;
}

export function escapeHtml(value: string): string {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

export function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
