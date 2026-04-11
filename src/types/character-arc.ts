import type { ChapterCastCharacter } from "@/types/chapter-cast";

/** 作者自定义「字段名 → 内容」一行 */
export type CharacterArcCustomRow = {
  key: string;
  value: string;
};

/** 跨章人物主档（.data/character-arcs/…） */
export type CharacterArcMaster = {
  schemaVersion: 1;
  novelId: string;
  /** 与各章 JSON 中 character.stableId 对齐 */
  stableId: string;
  name: string;
  namePinyin: string;
  firstSeenChapterId: string | null;
  firstSeenChapterIndex: number | null;
  deathChapterId: string | null;
  deathChapterIndex: number | null;
  /** 结局 / 长线剧透 */
  outcome: string;
  notes: string;
  updatedAt: string;

  /** 左侧「常量」：较少随剧情改动 */
  gender?: string;
  /** 年龄 / 生年等定设 */
  ageConst?: string;
  birthBackground?: string;
  /** 长相（定设） */
  appearanceConst?: string;

  /** 右侧「变量」：随剧情变化 */
  personalityVar?: string;
  skills?: string;
  luck?: string;
  combatPower?: string;
  locationVar?: string;

  /** 作者自增常量项 */
  customConstants?: CharacterArcCustomRow[];
  /** 作者自增变量项 */
  customVariables?: CharacterArcCustomRow[];
};

/** 某一章最新抽取版本中，该人物的一条快照 */
export type CharacterCastTimelineRow = {
  chapterId: string;
  chapterIndex: number;
  version: string;
  fileName: string;
  extractedAt: string;
  character: ChapterCastCharacter;
};
