export type ReaderAiChatRole = "user" | "assistant";

export interface ReaderAiMessage {
  id: string;
  role: ReaderAiChatRole;
  content: string;
  createdAt: number;
}

/** 服务端构建的目录项（不含钱包与阅读行为） */
export interface ReaderAiCatalogItem {
  articleId: string;
  title: string;
  synopsisSnippet: string;
  tags: string[];
  totalChapters: number;
  language: string;
  trialChapters: number;
  paymentMode: "free" | "paid";
}

export interface ReaderAiRecommendResponse {
  reply: string;
  pickedArticleIds: string[];
  error?: string;
}
