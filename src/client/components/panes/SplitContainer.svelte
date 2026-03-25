<script lang="ts">
  import type { SplitNode } from '../../lib/utils/split-tree.js';
  import { layoutState } from '../../lib/state/layout.svelte.js';
  import SplitDivider from './SplitDivider.svelte';
  import Pane from './Pane.svelte';

  let { node }: { node: SplitNode } = $props();
</script>

{#if node.type === 'leaf'}
  <Pane leaf={node} />
{:else}
  <div class="split" class:split-h={node.direction === 'h'} class:split-v={node.direction === 'v'}>
    <div class="split-child" style="flex: {node.ratio}">
      <svelte:self node={node.children[0]} />
    </div>
    <SplitDivider branchId={node.id} direction={node.direction} />
    <div class="split-child" style="flex: {1 - node.ratio}">
      <svelte:self node={node.children[1]} />
    </div>
  </div>
{/if}

<style>
  .split {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  .split-h { flex-direction: row; }
  .split-v { flex-direction: column; }
  .split-child {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
