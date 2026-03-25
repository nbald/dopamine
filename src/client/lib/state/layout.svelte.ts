import {
  type SplitNode, type ContentType, type LeafNode,
  createLeaf, splitLeaf, removeLeaf, assignContent, setRatio,
  findLeaf, flattenLeaves, findAdjacentLeaf, serialize, deserialize,
} from '../utils/split-tree.js';
import { api } from '../api.js';

class LayoutState {
  /** All workspace trees, keyed by workspace ID */
  trees = $state<Map<number, SplitNode>>(new Map());
  activeWorkspaceId = $state<number | null>(null);
  focusedLeafId = $state<string | null>(null);
  maximizedLeafId = $state<string | null>(null);
  private savedTree: SplitNode | null = null;

  /** The active tree (derived). */
  get tree(): SplitNode | null {
    if (this.activeWorkspaceId === null) return null;
    return this.trees.get(this.activeWorkspaceId) ?? null;
  }

  private setTree(node: SplitNode) {
    if (this.activeWorkspaceId !== null) {
      this.trees.set(this.activeWorkspaceId, node);
      // Force reactivity by reassigning the map
      this.trees = new Map(this.trees);
    }
  }

  /** Initialize with a workspace and content. */
  initWorkspace(workspaceId: number, contentType: ContentType, contentId: number | null) {
    const leaf = createLeaf(contentType, contentId);
    this.trees.set(workspaceId, leaf);
    this.trees = new Map(this.trees);
    this.activeWorkspaceId = workspaceId;
    this.focusedLeafId = leaf.id;
  }

  /** Load a workspace tree from serialized JSON. */
  loadWorkspace(workspaceId: number, json: string) {
    try {
      const tree = (json && json !== '{}') ? deserialize(json) : createLeaf();
      this.trees.set(workspaceId, tree);
      this.trees = new Map(this.trees);
    } catch {
      this.trees.set(workspaceId, createLeaf());
      this.trees = new Map(this.trees);
    }
  }

  /** Switch to a workspace. */
  switchWorkspace(workspaceId: number) {
    this.activeWorkspaceId = workspaceId;
    this.maximizedLeafId = null;
    this.savedTree = null;
    const tree = this.trees.get(workspaceId);
    if (tree) {
      const leaves = flattenLeaves(tree);
      this.focusedLeafId = leaves.length > 0 ? leaves[0].id : null;
    }
  }

  setFocus(leafId: string) {
    this.focusedLeafId = leafId;
  }

  split(direction: 'h' | 'v') {
    const tree = this.tree;
    if (!tree || !this.focusedLeafId) return;
    this.setTree(splitLeaf(tree, this.focusedLeafId, direction));
  }

  close(leafId: string) {
    const tree = this.tree;
    if (!tree) return;
    const result = removeLeaf(tree, leafId);
    if (result) {
      this.setTree(result);
      if (this.focusedLeafId === leafId) {
        const leaves = flattenLeaves(result);
        this.focusedLeafId = leaves.length > 0 ? leaves[0].id : null;
      }
    } else {
      // Last pane — replace with empty
      const empty = createLeaf();
      this.setTree(empty);
      this.focusedLeafId = empty.id;
    }
  }

  assign(contentType: ContentType, contentId: number) {
    const tree = this.tree;
    if (!tree) return;

    const targetId = this.focusedLeafId;
    if (!targetId) {
      const leaves = flattenLeaves(tree);
      const empty = leaves.find(l => l.contentType === 'empty');
      const target = empty || leaves[0];
      if (target) {
        this.setTree(assignContent(tree, target.id, contentType, contentId));
        this.focusedLeafId = target.id;
      }
      return;
    }
    this.setTree(assignContent(tree, targetId, contentType, contentId));
  }

  resize(branchId: string, ratio: number) {
    const tree = this.tree;
    if (!tree) return;
    this.setTree(setRatio(tree, branchId, ratio));
  }

  toggleMaximize(leafId: string) {
    const tree = this.tree;
    if (!tree) return;

    if (this.maximizedLeafId) {
      if (this.savedTree) this.setTree(this.savedTree);
      this.savedTree = null;
      this.maximizedLeafId = null;
    } else {
      const leaf = findLeaf(tree, leafId);
      if (leaf) {
        this.savedTree = tree;
        this.setTree({ ...leaf });
        this.maximizedLeafId = leafId;
        this.focusedLeafId = leaf.id;
      }
    }
  }

  navigate(dir: 'left' | 'right' | 'up' | 'down') {
    const tree = this.tree;
    if (!tree || !this.focusedLeafId) return;
    const next = findAdjacentLeaf(tree, this.focusedLeafId, dir);
    if (next) this.focusedLeafId = next.id;
  }

  getFocusedLeaf(): LeafNode | null {
    const tree = this.tree;
    if (!tree || !this.focusedLeafId) return null;
    return findLeaf(tree, this.focusedLeafId);
  }

  serializeLayout(workspaceId?: number): string {
    const id = workspaceId ?? this.activeWorkspaceId;
    if (id === null) return '{}';
    const tree = this.trees.get(id);
    return tree ? serialize(tree) : '{}';
  }

  async saveToWorkspace(workspaceId: number) {
    const layout = this.serializeLayout(workspaceId);
    await api.put(`/workspaces/${workspaceId}`, { layout }).catch(() => {});
  }

  removeWorkspace(workspaceId: number) {
    this.trees.delete(workspaceId);
    this.trees = new Map(this.trees);
  }
}

export const layoutState = new LayoutState();
