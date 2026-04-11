/** 本章内人物剧情状态，供大开本列表/表单底色；不参与跨章死亡推断 */
export type InChapterCastStatus = "normal" | "injured" | "deceased_this_chapter";

/** 单个人物档案（写入 chapter{n}_{pinyin}.json 的 character 字段） */
export type ChapterCastCharacter = {
  stableId: string;
  name: string;
  /** 小写 a-z0-9，用于文件名 chapter{n}_{namePinyin}.json */
  namePinyin: string;
  /** 可选；若各章 JSON 含此项，可种子化跨章主档 gender */
  gender?: string;
  age?: string;
  appearance?: string;
  personality?: string;
  location?: string;
  /** 本章登场方式 / 戏份简述 */
  presence?: string;
  notes?: string;
  /** 缺省视为 normal */
  inChapterStatus?: InChapterCastStatus;
};

export type ChapterCastFilePayload = {
  schemaVersion: 1;
  novelId: string;
  chapterId: string;
  chapterIndex: number;
  extractVersion: string;
  extractedAt: string;
  character: ChapterCastCharacter;
};
