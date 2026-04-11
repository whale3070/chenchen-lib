/** 单个人物档案（写入 chapter{n}_{pinyin}.json 的 character 字段） */
export type ChapterCastCharacter = {
  stableId: string;
  name: string;
  /** 小写 a-z0-9，用于文件名 chapter{n}_{namePinyin}.json */
  namePinyin: string;
  age?: string;
  appearance?: string;
  personality?: string;
  location?: string;
  /** 本章登场方式 / 戏份简述 */
  presence?: string;
  notes?: string;
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
