<script lang="ts">
  import { layoutState } from '../../lib/state/layout.svelte.js';

  let { branchId, direction }: { branchId: string; direction: 'h' | 'v' } = $props();
  let dividerEl: HTMLDivElement;

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    const parent = dividerEl.parentElement!;
    const rect = parent.getBoundingClientRect();

    const onMove = (ev: MouseEvent) => {
      let ratio: number;
      if (direction === 'h') {
        ratio = (ev.clientX - rect.left) / rect.width;
      } else {
        ratio = (ev.clientY - rect.top) / rect.height;
      }
      layoutState.resize(branchId, ratio);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = direction === 'h' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }
</script>

<div
  class="divider"
  class:divider-h={direction === 'h'}
  class:divider-v={direction === 'v'}
  bind:this={dividerEl}
  onmousedown={onMouseDown}
  role="separator"
></div>

<style>
  .divider {
    flex-shrink: 0;
    background: var(--border-subtle);
    position: relative;
    z-index: 2;
  }
  .divider-h {
    width: 1px;
    cursor: col-resize;
  }
  .divider-h::after {
    content: '';
    position: absolute;
    top: 0; bottom: 0;
    left: -3px; right: -3px;
  }
  .divider-v {
    height: 1px;
    cursor: row-resize;
  }
  .divider-v::after {
    content: '';
    position: absolute;
    left: 0; right: 0;
    top: -3px; bottom: -3px;
  }
  .divider:hover {
    background: var(--accent);
    opacity: 0.5;
  }
</style>
