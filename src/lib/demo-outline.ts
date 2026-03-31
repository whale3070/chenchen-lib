import type { PlotNode } from "@chenchen/shared/types";

/** 演示用卷/章/节大纲；range 需与稿面 ProseMirror 位置粗略对应以便跳转。 */
export const DEMO_OUTLINE_FLAT: PlotNode[] = [
  {
    id: "plot-outline-v1",
    kind: "volume",
    title: "第一卷 · 匿名信",
    summary: "台谏与枢密院角力下的夜里对谈。",
    tags: ["政治", "伏笔"],
    range: { from: 1, to: 2 },
  },
  {
    id: "plot-outline-c1",
    kind: "chapter",
    title: "第一章 梆子二更",
    summary: "",
    tags: ["氛围"],
    parentId: "plot-outline-v1",
    range: { from: 1, to: 120 },
  },
  {
    id: "plot-outline-s1",
    kind: "section",
    title: "第一节 烛下对坐",
    summary: "林砚排稿、尚淳袖中硬封。",
    tags: ["高潮前奏", "对峙"],
    parentId: "plot-outline-c1",
    range: { from: 1, to: 80 },
  },
];
