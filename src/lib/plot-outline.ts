import { arrayMove } from "@dnd-kit/sortable";
import type { PlotNode, PlotNodeKind } from "@chenchen/shared/types";

export type PlotOutlineNode = PlotNode & { children: PlotOutlineNode[] };

/** 将扁平列表（隐含同级顺序）还原为树。 */
export function flatToOutlineTree(flat: PlotNode[]): PlotOutlineNode[] {
  const byId = new Map<string, PlotOutlineNode>();
  flat.forEach((n) => {
    byId.set(n.id, { ...n, children: [] });
  });
  const roots: PlotOutlineNode[] = [];
  const orderIndex = new Map(flat.map((n, i) => [n.id, i]));
  flat.forEach((n) => {
    const node = byId.get(n.id)!;
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (nodes: PlotOutlineNode[]) => {
    nodes.sort((a, b) => (orderIndex.get(a.id)! - orderIndex.get(b.id)!));
    nodes.forEach((c) => sortRec(c.children));
  };
  sortRec(roots);
  return roots;
}

export function outlineTreeToFlat(roots: PlotOutlineNode[]): PlotNode[] {
  const out: PlotNode[] = [];
  const walk = (n: PlotOutlineNode, parentId: string | undefined) => {
    const { children, ...rest } = n;
    out.push({ ...rest, parentId });
    children.forEach((ch) => walk(ch, n.id));
  };
  roots.forEach((r) => walk(r, undefined));
  return out;
}

function parentOfInTree(
  roots: PlotOutlineNode[],
  id: string,
): string | null | undefined {
  for (const r of roots) {
    if (r.id === id) return null;
  }
  for (const r of roots) {
    const p = parentInSubtree(r, id);
    if (p !== undefined) return p;
  }
  return undefined;
}

function parentInSubtree(
  node: PlotOutlineNode,
  id: string,
): string | null | undefined {
  for (const c of node.children) {
    if (c.id === id) return node.id;
    const inner = parentInSubtree(c, id);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

function reorderAtParent(
  roots: PlotOutlineNode[],
  parentKey: string | null,
  activeId: string,
  overId: string,
): PlotOutlineNode[] | null {
  if (parentKey === null) {
    const oldIdx = roots.findIndex((n) => n.id === activeId);
    const newIdx = roots.findIndex((n) => n.id === overId);
    if (oldIdx < 0 || newIdx < 0) return null;
    return arrayMove(roots, oldIdx, newIdx);
  }

  function walk(nodes: PlotOutlineNode[]): PlotOutlineNode[] | null {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.id === parentKey) {
        const oldIdx = n.children.findIndex((c) => c.id === activeId);
        const newIdx = n.children.findIndex((c) => c.id === overId);
        if (oldIdx < 0 || newIdx < 0) return null;
        const copy = nodes.slice();
        copy[i] = { ...n, children: arrayMove(n.children, oldIdx, newIdx) };
        return copy;
      }
      const inner = walk(n.children);
      if (inner) {
        const copy = nodes.slice();
        copy[i] = { ...n, children: inner };
        return copy;
      }
    }
    return null;
  }

  return walk(roots);
}

/** 同一父节点下交换顺序，返回新扁平列表；不可重排时返回 null。 */
export function reorderOutlineFlat(
  flat: PlotNode[],
  activeId: string,
  overId: string,
): PlotNode[] | null {
  if (activeId === overId) return flat;
  const roots = flatToOutlineTree(flat);
  const pA = parentOfInTree(roots, activeId);
  const pB = parentOfInTree(roots, overId);
  if (pA === undefined || pB === undefined) return null;
  if (pA !== pB) return null;
  const nextRoots = reorderAtParent(roots, pA, activeId, overId);
  if (!nextRoots) return null;
  return outlineTreeToFlat(nextRoots);
}

const KIND_LABEL: Partial<Record<PlotNodeKind, string>> = {
  volume: "卷",
  chapter: "章",
  section: "节",
  act: "幕",
  arc: "弧",
  sequence: "序列",
  scene: "场",
  beat: "节拍",
};

export function plotKindLabel(kind: PlotNodeKind): string {
  return KIND_LABEL[kind] ?? kind;
}
