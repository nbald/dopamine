export type ContentType = 'terminal' | 'note' | 'iframe' | 'empty';

export interface LeafNode {
  type: 'leaf';
  id: string;
  contentType: ContentType;
  contentId: number | null;
}

export interface BranchNode {
  type: 'branch';
  id: string;
  direction: 'h' | 'v'; // h = left|right, v = top|bottom
  ratio: number; // 0-1, first child gets this fraction
  children: [SplitNode, SplitNode];
}

export type SplitNode = LeafNode | BranchNode;

let nextId = 1;
export function genId(): string {
  return 'n' + (nextId++);
}

export function createLeaf(contentType: ContentType = 'empty', contentId: number | null = null): LeafNode {
  return { type: 'leaf', id: genId(), contentType, contentId };
}

/** Split a leaf into two. Returns a new tree with the leaf replaced by a branch. */
export function splitLeaf(tree: SplitNode, leafId: string, direction: 'h' | 'v'): SplitNode {
  return mapNode(tree, leafId, (leaf) => ({
    type: 'branch',
    id: genId(),
    direction,
    ratio: 0.5,
    children: [leaf, createLeaf()],
  }));
}

/** Remove a leaf and promote its sibling. */
export function removeLeaf(tree: SplitNode, leafId: string): SplitNode | null {
  if (tree.type === 'leaf') {
    return tree.id === leafId ? null : tree;
  }

  const [left, right] = tree.children;

  // If one of the direct children is the target leaf, return the other
  if (left.type === 'leaf' && left.id === leafId) return right;
  if (right.type === 'leaf' && right.id === leafId) return left;

  // Recurse
  const newLeft = removeLeaf(left, leafId);
  const newRight = removeLeaf(right, leafId);

  if (newLeft === null) return newRight;
  if (newRight === null) return newLeft;

  return { ...tree, children: [newLeft, newRight] };
}

/** Assign content to a leaf. */
export function assignContent(tree: SplitNode, leafId: string, contentType: ContentType, contentId: number | null): SplitNode {
  return mapNode(tree, leafId, (leaf) => ({ ...leaf, contentType, contentId }));
}

/** Update the ratio of a branch. */
export function setRatio(tree: SplitNode, branchId: string, ratio: number): SplitNode {
  if (tree.type === 'leaf') return tree;
  if (tree.id === branchId) {
    return { ...tree, ratio: Math.max(0.1, Math.min(0.9, ratio)) };
  }
  return {
    ...tree,
    children: [
      setRatio(tree.children[0], branchId, ratio),
      setRatio(tree.children[1], branchId, ratio),
    ],
  };
}

/** Find a leaf by id. */
export function findLeaf(tree: SplitNode, leafId: string): LeafNode | null {
  if (tree.type === 'leaf') return tree.id === leafId ? tree : null;
  return findLeaf(tree.children[0], leafId) || findLeaf(tree.children[1], leafId);
}

/** Get all leaves. */
export function flattenLeaves(tree: SplitNode): LeafNode[] {
  if (tree.type === 'leaf') return [tree];
  return [...flattenLeaves(tree.children[0]), ...flattenLeaves(tree.children[1])];
}

/** Find the next leaf in a direction for keyboard navigation. */
export function findAdjacentLeaf(tree: SplitNode, leafId: string, dir: 'left' | 'right' | 'up' | 'down'): LeafNode | null {
  const leaves = flattenLeaves(tree);
  const idx = leaves.findIndex(l => l.id === leafId);
  if (idx === -1) return null;
  // Simple: left/up = previous, right/down = next
  if (dir === 'left' || dir === 'up') {
    return idx > 0 ? leaves[idx - 1] : null;
  }
  return idx < leaves.length - 1 ? leaves[idx + 1] : null;
}

export function serialize(tree: SplitNode): string {
  return JSON.stringify(tree);
}

export function deserialize(json: string): SplitNode {
  const parsed = JSON.parse(json);
  // Re-seed id counter to avoid collisions
  reindexIds(parsed);
  return parsed;
}

function reindexIds(node: SplitNode): void {
  node.id = genId();
  if (node.type === 'branch') {
    reindexIds(node.children[0]);
    reindexIds(node.children[1]);
  }
}

/** Swap the content of two leaves. */
export function swapLeaves(tree: SplitNode, leafId1: string, leafId2: string): SplitNode {
  const leaf1 = findLeaf(tree, leafId1);
  const leaf2 = findLeaf(tree, leafId2);
  if (!leaf1 || !leaf2) return tree;
  const { contentType: ct1, contentId: ci1 } = leaf1;
  const { contentType: ct2, contentId: ci2 } = leaf2;
  let result = assignContent(tree, leafId1, ct2, ci2);
  result = assignContent(result, leafId2, ct1, ci1);
  return result;
}

/** Replace a leaf with the result of a mapper function. */
function mapNode(tree: SplitNode, leafId: string, mapper: (leaf: LeafNode) => SplitNode): SplitNode {
  if (tree.type === 'leaf') {
    return tree.id === leafId ? mapper(tree) : tree;
  }
  return {
    ...tree,
    children: [
      mapNode(tree.children[0], leafId, mapper),
      mapNode(tree.children[1], leafId, mapper),
    ],
  };
}
