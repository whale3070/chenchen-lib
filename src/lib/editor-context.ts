import type { Persona } from "@chenchen/shared/types";

/** 打开推演面板时由编辑器注入的上下文（选区 + 全文 + 角色快照） */
export type EditorDeduceContext = {
  selection: string;
  fullDocument: string;
  selectionFrom: number;
  selectionTo: number;
  personasSnapshot: Persona[];
  /** 创建作品时填写的「内容介绍 / 序」，作为 MiroFish / deduce 的全书主旨背景 */
  bookPremise?: string;
};
