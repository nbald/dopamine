class DragState {
  /** Currently dragged item */
  dragging = $state<{ type: 'terminal' | 'note' | 'iframe' | 'project'; id: number } | null>(null);
  /** Drop target project ID */
  dropTarget = $state<number | null>(null);
  /** Drop target for project reorder */
  dropProjectTarget = $state<number | null>(null);
}

export const dragState = new DragState();
