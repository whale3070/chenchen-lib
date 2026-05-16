export type LandingProgressLocale = "zh-CN" | "en" | "ja" | "ko";

export type LandingProgressEntry = {
  /**
   * Stable ID for each day entry, e.g. "2026-05-13".
   * Keep it unique and sortable by date desc.
   */
  id: string;
  dateLabel: Record<LandingProgressLocale, string>;
  title: Record<LandingProgressLocale, string>;
  items: Record<LandingProgressLocale, string[]>;
};

/**
 * Maintenance guide:
 * 1) Append new day entries at the top (newest first).
 * 2) Fill zh-CN/en/ja/ko for dateLabel/title/items.
 * 3) If ja/ko copy review is pending, temporary English copy is acceptable.
 */
export const LANDING_PROGRESS_DATA: LandingProgressEntry[] = [
  {
    id: "2026-05-14",
    dateLabel: {
      "zh-CN": "2026年5月14日（第四十八天）",
      en: "May 14, 2026 (day 48)",
      ja: "2026年5月14日（48日目）",
      ko: "2026년 5월 14일 (48일차)",
    },
    title: {
      "zh-CN": "开发进度",
      en: "Progress",
      ja: "開発進捗",
      ko: "개발 진행 상황",
    },
    items: {
      "zh-CN": [
        "在官网上增加了隐私政策和用户服务协议。",
        "中/英/日/韩，100%字段落盘，不走实时 AI。",
        "将“开发进度”扩展为可维护的数据文件格式（独立 JSON/TS），后续新增日期无需改组件逻辑。",
      ],
      en: [
        "Added Privacy Policy and Terms of Service pages to the official website.",
        "Shipped 100% disk-persisted fields for Chinese/English/Japanese/Korean with no real-time AI translation.",
        "Expanded development progress into a maintainable standalone data format (JSON/TS), so adding a new day no longer requires component logic changes.",
      ],
      ja: [
        "公式サイトにプライバシーポリシーと利用規約ページを追加しました。",
        "中国語/英語/日本語/韓国語の全項目を 100% 落盤化し、リアルタイム AI 翻訳を使用しない構成にしました。",
        "「開発進捗」を保守しやすい独立データ形式（JSON/TS）へ拡張し、今後は日付追加時にコンポーネントロジックを変更する必要がなくなりました。",
      ],
      ko: [
        "공식 사이트에 개인정보처리방침과 이용약관 페이지를 추가했습니다.",
        "중/영/일/한 전 필드를 100% 디스크 저장 방식으로 전환하고 실시간 AI 번역 경로를 제거했습니다.",
        "개발 진행 섹션을 유지보수 가능한 독립 데이터 포맷(JSON/TS)으로 확장해, 이후 날짜 추가 시 컴포넌트 로직 수정이 필요 없도록 했습니다.",
      ],
    },
  },
  {
    id: "2026-05-13",
    dateLabel: {
      "zh-CN": "2026年5月13日（第四十七天）",
      en: "May 13, 2026 (day 47)",
      ja: "2026年5月13日（47日目）",
      ko: "2026년 5월 13일 (47일차)",
    },
    title: {
      "zh-CN": "开发进度",
      en: "Progress",
      ja: "開発進捗",
      ko: "개발 진행 상황",
    },
    items: {
      "zh-CN": [
        "把“排版策略”从发布弹窗移出，放到 AI 写作区域单独设置。",
        "修复 AI 排版常见报错（worker 读取 .env.production 路径不对）并加更稳的回退逻辑。",
        "【bug修复】AI 聊天导入 JSON 文件时，不再覆盖之前所有对话。",
      ],
      en: [
        "Moved layout strategy from the publish modal into the AI Writing area.",
        "Fixed common AI reflow errors and improved .env.production fallback path resolution.",
        "Bug fix: importing AI chat JSON no longer overwrites previous conversations.",
      ],
      ja: [
        "排版戦略を公開モーダルから分離し、AIライティング領域で個別設定できるようにしました。",
        "AI排版で頻発していたエラー（worker が .env.production を正しく読めない問題）を修正し、より堅牢なフォールバックを追加しました。",
        "【バグ修正】AIチャットで JSON をインポートした際、既存会話を上書きしないよう修正しました。",
      ],
      ko: [
        "배치 전략을 게시 모달에서 분리해 AI 글쓰기 영역에서 개별 설정할 수 있도록 변경했습니다.",
        "AI 재배치에서 자주 발생하던 오류(worker의 .env.production 경로 읽기 문제)를 수정하고 더 안정적인 폴백 로직을 추가했습니다.",
        "【버그 수정】AI 채팅에서 JSON 가져오기 시 기존 대화가 덮어쓰이지 않도록 수정했습니다.",
      ],
    },
  },
  {
    id: "2026-05-10",
    dateLabel: {
      "zh-CN": "2026年5月10日（第四十四天）",
      en: "May 10, 2026 (day 44)",
      ja: "2026年5月10日（44日目）",
      ko: "2026년 5월 10일 (44일차)",
    },
    title: {
      "zh-CN": "开发进度",
      en: "Progress",
      ja: "開発進捗",
      ko: "개발 진행 상황",
    },
    items: {
      "zh-CN": [
        "选中喜欢句子：已实现（正文选区触发）。",
        "弹框写感想：已实现（钱包连接校验 + 字数限制）。",
        "一键看所有人划线/只看原文：已实现（Tab 切换）。",
        "【bug修复】视频管理“关联目标章节”仅显示占位问题已修复。",
        "【bug修复】新建小说弹窗白底白字可读性问题已修复。",
        "【bug修复】划线后点击写感想弹框立即消失问题已修复。",
      ],
      en: [
        "Favorite sentence selection implemented via in-body text selection trigger.",
        "Write-thought popup implemented with wallet check and length limit.",
        "One-click switch between all highlights and original text implemented via tabs.",
        "Bug fix: chapter association list in video management now loads actual chapters.",
        "Bug fix: white text on white background in create-novel modal resolved.",
        "Bug fix: annotation popup no longer disappears immediately after selection.",
      ],
      ja: [
        "お気に入り文の選択機能を実装（本文選択でトリガー）。",
        "感想ポップアップを実装（ウォレット接続確認 + 文字数制限）。",
        "全員のハイライト表示/原文のみ表示のワンタップ切替を Tab で実装。",
        "【バグ修正】動画管理の「対象章関連付け」がプレースホルダーのみ表示される問題を修正。",
        "【バグ修正】新規小説モーダルの白背景+白文字による可読性問題を修正。",
        "【バグ修正】ハイライト後に感想ポップアップが即時消える問題を修正。",
      ],
      ko: [
        "좋아하는 문장 선택 기능 구현(본문 선택 영역 트리거).",
        "감상 작성 팝업 구현(지갑 연결 검증 + 글자 수 제한).",
        "전체 하이라이트 보기/원문만 보기 원클릭 전환을 탭으로 구현.",
        "【버그 수정】영상 관리의 \"대상 챕터 연결\" 드롭다운이 placeholder만 보이던 문제를 수정.",
        "【버그 수정】새 소설 생성 모달의 흰 배경+흰 글자 가독성 문제를 수정.",
        "【버그 수정】하이라이트 후 감상 팝업이 즉시 사라지는 문제를 수정.",
      ],
    },
  },
];
