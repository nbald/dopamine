/**
 * Svelte action: double-click to inline-edit a text element.
 * Usage: <span use:inlineEdit={{ value: name, onSave: (v) => rename(v) }}>
 */
export function inlineEdit(node: HTMLElement, params: { value: string; onSave: (value: string) => void }) {
  let current = params;

  function handleDblClick(e: Event) {
    e.stopPropagation();
    const original = current.value;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = original;
    input.style.cssText = `
      background: var(--bg-active);
      border: 1px solid var(--border-focus);
      border-radius: 3px;
      color: var(--text-primary);
      font: inherit;
      padding: 0 4px;
      width: 100%;
      outline: none;
      box-sizing: border-box;
    `;

    const savedDisplay = node.style.display;
    node.style.display = 'none';
    node.parentNode!.insertBefore(input, node.nextSibling);
    input.focus();
    input.select();

    function finish(save: boolean) {
      const val = input.value.trim();
      input.remove();
      node.style.display = savedDisplay;
      if (save && val && val !== original) {
        current.onSave(val);
      }
    }

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { input.value = original; input.blur(); }
    });
  }

  node.addEventListener('dblclick', handleDblClick);

  return {
    update(newParams: { value: string; onSave: (value: string) => void }) {
      current = newParams;
    },
    destroy() {
      node.removeEventListener('dblclick', handleDblClick);
    },
  };
}
