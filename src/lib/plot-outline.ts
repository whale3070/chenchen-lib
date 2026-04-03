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

function removeBranchAndPromoteChildrenFromTree(
  nodes: PlotOutlineNode[],
  branchId: string,
  branchKind: "volume" | "section",
): PlotOutlineNode[] | null {
  const idx = nodes.findIndex((n) => n.id === branchId);
  if (idx >= 0) {
    const v = nodes[idx];
    if (v.kind !== branchKind) return null;
    const before = nodes.slice(0, idx);
    const after = nodes.slice(idx + 1);
    return [...before, ...v.children, ...after];
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const inner = removeBranchAndPromoteChildrenFromTree(n.children, branchId, branchKind);
    if (inner) {
      const copy = nodes.slice();
      copy[i] = { ...n, children: inner };
      return copy;
    }
  }
  return null;
}

/**
 * 删除指定卷节点，将其直接子节点提升到原位置（同级），子树结构保持不变。
 * 非 volume 或找不到该 id 时返回 null。
 */
export function removeVolumeAndPromoteChildrenFlat(
  flat: PlotNode[],
  volumeId: string,
): PlotNode[] | null {
  const vol = flat.find((n) => n.id === volumeId);
  if (!vol || vol.kind !== "volume") return null;
  const roots = flatToOutlineTree(flat);
  const nextRoots = removeBranchAndPromoteChildrenFromTree(roots, volumeId, "volume");
  if (!nextRoots) return null;
  return outlineTreeToFlat(nextRoots);
}

/**
 * 删除指定节节点，将其直接子节点提升到原位置（同级），子树结构保持不变。
 * 非 section 或找不到该 id 时返回 null。
 */
export function removeSectionAndPromoteChildrenFlat(
  flat: PlotNode[],
  sectionId: string,
): PlotNode[] | null {
  const sec = flat.find((n) => n.id === sectionId);
  if (!sec || sec.kind !== "section") return null;
  const roots = flatToOutlineTree(flat);
  const nextRoots = removeBranchAndPromoteChildrenFromTree(roots, sectionId, "section");
  if (!nextRoots) return null;
  return outlineTreeToFlat(nextRoots);
}

/**
 * 新增章节时挂到哪个父节点：优先当前大纲选中（卷/节），选中章则上溯到最近的卷或节；
 * 否则用第一个卷；没有任何卷时 createVolumeIfMissing 为 true，由调用方先建卷再挂章。
 */
export function resolveParentForNewChapter(
  flat: PlotNode[],
  selectedOutlineId: string | null,
): { parentId: string | null; createVolumeIfMissing: boolean } {
  const byId = new Map(flat.map((n) => [n.id, n]));

  const climbToVolumeOrSection = (startId: string | undefined): string | null => {
    let pid: string | undefined = startId;
    const seen = new Set<string>();
    while (pid && !seen.has(pid)) {
      seen.add(pid);
      const p = byId.get(pid);
      if (!p) break;
      if (p.kind === "volume" || p.kind === "section") return p.id;
      pid = p.parentId;
    }
    return null;
  };

  if (selectedOutlineId) {
    const sel = byId.get(selectedOutlineId);
    if (sel) {
      if (sel.kind === "volume" || sel.kind === "section") {
        return { parentId: sel.id, createVolumeIfMissing: false };
      }
      if (sel.kind === "chapter") {
        const parent = climbToVolumeOrSection(sel.parentId);
        if (parent) return { parentId: parent, createVolumeIfMissing: false };
      }
    }
  }

  const firstVol = flat.find((n) => n.kind === "volume");
  if (firstVol) return { parentId: firstVol.id, createVolumeIfMissing: false };

  return { parentId: null, createVolumeIfMissing: true };
}

/** 在大纲树中追加子节点：parentId 为 null 时在根级末尾追加，否则挂到该父节点子级末尾。 */
export function appendOutlineChildFlat(
  flat: PlotNode[],
  parentId: string | null,
  newNode: PlotNode,
): PlotNode[] | null {
  const childOutline: PlotOutlineNode = {
    ...newNode,
    children: [],
  };
  const roots = flatToOutlineTree(flat);
  if (parentId == null) {
    const newRoots = [...roots, childOutline];
    return outlineTreeToFlat(newRoots);
  }
  function add(nodes: PlotOutlineNode[]): PlotOutlineNode[] | null {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.id === parentId) {
        const copy = nodes.slice();
        copy[i] = { ...n, children: [...n.children, childOutline] };
        return copy;
      }
      const inner = add(n.children);
      if (inner) {
        const copy = nodes.slice();
        copy[i] = { ...n, children: inner };
        return copy;
      }
    }
    return null;
  }
  const nextRoots = add(roots);
  if (!nextRoots) return null;
  return outlineTreeToFlat(nextRoots);
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
