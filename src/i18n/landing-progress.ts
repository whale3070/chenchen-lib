export type ProgressStage = {
  dateLabel: string;
  title: string;
  items: string[];
};

const ZH: ProgressStage[] = [
  {
    dateLabel: "2026 年 4 月 28 日（第三十一天）",
    title: "开发进度",
    items: [
      "【bug 修复】读者页：读到第 3 章时刷新会回到第 1 章的问题已修复。",
      "新增共享的章节登场人物抽取辅助函数；在「大开本」阅读页与主编台大纲侧栏加入「一键全书」批量抽取。",
      "账户设置中支持切换翻译等所用模型。",
      "【bug 修复】多语言翻译：选中第 3 章却实际翻译第 2 章内容的问题已修复（按章节翻译时不再错误回退到草稿/全书正文）。",
    ],
  },
  {
    dateLabel: "2026 年 4 月 27 日（第三十天）",
    title: "开发进度",
    items: [
      "站点由 HTTP 切换为 HTTPS。",
      "作者工作台新增「PDF 签名」功能：选择 PDF 与 PNG 签名图；在预览上拖动、缩放签名框，再下载合成后的 PDF。文件仅在浏览器本地处理，不上传服务器。",
      "首页与路演等品牌文案：将「郴郴文库」更名为「巴别塔」；英文站点名为 babel towel（域名 babeltowel.com）。",
    ],
  },
  {
    dateLabel: "2026 年 4 月 26 日（第二十九天）",
    title: "开发进度",
    items: [
      "将「活跃钱包看板」调整为「活跃用户统计」：此前仅有钱包登录，现已支持邮箱 + 钱包登录，看板按作者身份去重统计两类账号合计的活跃用户数（含 DAU/WAU/MAU、趋势与行为分布等文案与接口字段同步）。",
      "工作台 AI 聊天：支持在本机浏览器记住多轮历史对话；可新建对话、删除当前对话或清空全部对话记录。",
    ],
  },
  {
    dateLabel: "2026 年 4 月 25 日（第二十八天）",
    title: "开发进度",
    items: [
      "工作台新增 AI 聊天能力，经服务端转发至已配置的 OpenAI 兼容接口；默认模型为 claude-opus-4-6（可通过环境变量 CLAUDE_MODEL 覆盖）。",
    ],
  },
  {
    dateLabel: "2026 年 4 月 22 日（第二十五天）",
    title: "开发进度",
    items: [
      "视频管理新增支持 WAV 格式（与其它非 MP3 一样转码为 MP3 后入库）。",
      "修复大文件 / 部分环境下上传失败的问题（multipart 解析与超时等）。",
      "视频管理上传拆为两步：先快速上传并落盘，再在后台静默转码；完成后在前台弹窗提示，列表中可看到「转码中」状态。",
    ],
  },
  {
    dateLabel: "2026 年 4 月 17 日（第二十天）",
    title: "开发进度",
    items: [
      "邮箱/密码登录的功能。",
      "管理员后台能够手动增加/减少 VIP 会员的功能。",
      "用户未指定界面语言、未连接钱包时，按访问 IP 所在地区默认显示语言（如内地简体，港/台繁体）。",
    ],
  },
  {
    dateLabel: "2026 年 4 月 17 日（第十九天）",
    title: "开发进度",
    items: [
      "作者工作台「多语言翻译」：新增多语已译稿一览，支持按章节切换语种预览已落盘译文，并链到书库对应语言页；新增 chapter-preview 等接口。",
      "发布配置在「AI 自动排版（保留图片）」下支持作者填写补充说明（prompt），写入发布 JSON 并由 AI 排版 worker 拼入 DeepSeek 提示词（与不改剧情、保留图片占位等硬规则冲突时以硬规则为准，约 2000 字上限）。",
      "首页开发进度已同步：http://whale3070.com:3000/",
    ],
  },
  {
    dateLabel: "2026 年 4 月 14 日（第十六天）",
    title: "开发进度",
    items: [
      "实现删除已提取 MP3：添加服务端 API（从索引移除并删除音频文件），并在「打开链接」「关联到章节」右侧加入删除按钮。",
      "实现语音转文字的功能。",
      "工作台入口（视频管理）：https://whale3070.com:3000/workspace",
    ],
  },
  {
    dateLabel: "2026 年 4 月 13 日（第十五天）",
    title: "开发进度",
    items: [
      "视频管理：作者工作台支持上传 MP4、服务端提取 MP3，并可将提取结果关联到某本书的指定章节；读者在书库该章「朗读」Tab 可播放作者提供的 MP3。",
      "修复「作者上传朗读音频」在读者端无法拖动进度条、快进失效的问题：音频托管接口补充 Accept-Ranges 与 HTTP Range（206 分段响应）。",
      "创业圆桌会议：搜集到多方反馈。Yuki：宣传上是否有对标可参考；目标客群是谁、是否应优先让创作者深度试用；把亮点讲成直白好懂、略「土」但有效的自然语言。",
      "Yuki（续）：内地用户若首页第一眼全是英文容易直接离开，建议在首页做中英切换；若浏览器提示「不安全」也会劝退许多伙伴，需重视 HTTPS/证书与首访信任。",
      "Yuki（续，晚间分享）：对极端主义式创作与敏感内容、平台能否删除与技术监管边界；技术表达偏专业、门外汉听不懂，招募运营/推广时需补强「产品话」与 Web3 新手可读性；读者模式除章末评论外，可探索段落划线评论、生僻字/历史典故（甚至短科普片）等，参考微信读书等成熟形态（注意合规）。",
      "Yuki（续）：产品是否以手机 App 为主阵地、全球读者与是否花钱引入经典作品（如阿德勒心理学类）；自由讨论还涉及防盗——可否给纯新手作者做防盗科普、是否提供面向有一定收入创作者的付费防盗服务等。",
    ],
  },
  {
    dateLabel: "2026 年 4 月 10 日（第十二天）",
    title: "开发进度",
    items: [
      "付费会员 / 免费用户区分：凡从作者工作台、编辑器链路触发、最终会打到模型或 Python AI 服务的，一律视为「作者端 AI」，只对当前订阅有效的付费会员开放；未付费作者仍可用规则切章，仅 AI 切章要会员。",
      "Aura 小说评估模块引擎已做好，尚未接入巴别塔前后端。榜单示例：http://198.55.109.102:3000/ranking?round_id=novel2026_kuake",
      "本网站前端源码目录：`/root/chenchen-lib/apps/web`（Next.js / App Router）。",
    ],
  },
  {
    dateLabel: "2026 年 4 月 9 日（第十一天）",
    title: "开发进度",
    items: [
      "新增评论功能，连接钱包后可以对章节进行评论",
      "修改前端页面。当服务器已有缓存 MP3 时，前端会优先进入“播放已有 MP3”体验，而不是默认“朗读并生成 MP3”。",
      "每个章节加上字数统计功能",
      "读者端 Markdown 渲染里代码块/引用块的样式，给这类长内容加自动换行（保留可读性）",
    ],
  },
  {
    dateLabel: "2026 年 4 月 8 日（第十天）",
    title: "开发进度",
    items: [
      "解决 bug「大纲同步超时，请检查网络后重试。」：做“后端清洗 + 前端不再传正文”",
      "解决 bug「点击新增章，就会新增卷，以及新增章。」：改为“点击新增章，只新增章。”",
      "新增阿拉伯语朗读功能",
    ],
  },
  {
    dateLabel: "2026 年 4 月 5 日（第七天）",
    title: "开发进度",
    items: [
      "优化txt批量导入功能",
      "修改网页前端，增加导航页- 项目介绍与路演。",
      "更新网页首页。",
    ],
  },
  {
    dateLabel: "2026 年 4 月 4 日（第六天）",
    title: "开发进度",
    items: ["有声书上传", "有声书编辑标题/详情", "有声书读者播放"],
  },
  {
    dateLabel: "2026 年 4 月 3 日（第五天）",
    title: "开发进度",
    items: [
      "工单系统-新建页面",
      "AI 生成后人工微调",
      "发布后过长内容撑破页面",
      "英文（或其他翻译语言）阅读时会保留原文图片位置，不再整章丢图",
      "英文语言下仍有中文残留",
      "删不掉卷、节",
      "假设我有六万本小说，那么这个构架带得动吗？",
      "迁移方案",
      "服务一万个作者（每人 100 个读者）与六万本免费书籍的架构承载评估",
      "给工单系统加图片",
    ],
  },
  {
    dateLabel: "2026 年 4 月 2 日（第四天）",
    title: "开发进度",
    items: [
      "只保留一个标题来源",
      "删除默认 AI 角色设定",
      "按照渲染后的格式直接发布",
      "剧情大纲管理",
      "自动先落盘当前章节内容",
      "章节内容错乱修复",
      "章节重复修复",
      "加载中 bug 修复",
      "AI 排版 bug 修复",
      "发布策略分层",
      "文案修改 + AI 赋能自动打标签、写简介",
      "社交媒体作品分享",
      "一键生成抖音视频（前端）",
      "多语言翻译功能",
      "中英夹杂的翻译 bug 修复",
      "翻译的内容分区",
    ],
  },
  {
    dateLabel: "2026 年 4 月 1 日（第三天）",
    title: "功能开发",
    items: [
      "图库功能",
      "章节目录功能",
      "DeepSeek 自动阅读 + 排版 + 切章导入",
      "作品真实标题 bug 修复",
      "一键发布所有章节",
      "章节目录隐藏功能",
      "用户点击变色功能",
      "刷新后记住已读颜色",
      "添加一个 Markdown 编辑器",
      "发布章节只读功能",
      "读者端排版",
      "读者作者展示不同步 bug 修复",
      "读者社交媒体小说分享",
      "读者阅读版本",
      "AI 排版功能",
      "定位 bug 修复",
    ],
  },
  {
    dateLabel: "2026 年 3 月 31 日（第二天）",
    title: "功能开发",
    items: [
      "连接失败帮助弹窗",
      "修改网页前端排版",
      "下一章 tab",
      "财务管理",
      "删除收款码",
      "小说分享功能",
      "读者阅读权限",
      "影响阅读的 bug 修复",
    ],
  },
  {
    dateLabel: "2026 年 3 月 30 日（第一天）",
    title: "已实现的功能",
    items: [
      "前端框架搭建",
      "后端 miroFish 搭建",
      "钱包连接自动识别身份",
      "角色管理",
      "断点记忆恢复",
      "卡片式大纲组件",
      "身份分区",
      "作者管理后台",
      "发布功能",
    ],
  },
];

const EN: ProgressStage[] = [
  {
    dateLabel: "April 28, 2026 (day 31)",
    title: "Progress",
    items: [
      "Bug fix: reader page no longer jumps back to chapter 1 after a refresh while reading chapter 3.",
      "Shared helpers to extract character appearances per chapter; “one-click whole book” batch extraction added on the large-format reader page and the author outline sidebar.",
      "Account settings: choose/switch the model used for translation and related tasks.",
      "Bug fix: multilingual translation could translate chapter 2 when chapter 3 was selected—fixed by removing incorrect fallbacks to draft / full-book text when translating a single chapter.",
    ],
  },
  {
    dateLabel: "April 27, 2026 (day 30)",
    title: "Progress",
    items: [
      "Switched the site from HTTP to HTTPS.",
      "Workspace PDF signature: choose a PDF and a PNG signature; drag and resize the box on the preview, then download a merged PDF. Processing stays entirely in the browser—nothing is uploaded to the server.",
      "Landing and pitch-deck branding: renamed the Chinese name from 郴郴文库 to 巴别塔; English site label updated to babel towel (domain babeltowel.com).",
    ],
  },
  {
    dateLabel: "April 26, 2026 (day 29)",
    title: "Progress",
    items: [
      'Renamed the workspace “active wallets” dashboard to “active users”: counts now dedupe by author identity across email/password and MetaMask sign-in (DAU/WAU/MAU, trend chart, and event breakdown copy + API fields updated accordingly).',
      "Workspace AI chat: conversations persist locally in the browser across visits; you can start a new thread, delete the current thread, or clear all saved threads.",
    ],
  },
  {
    dateLabel: "April 25, 2026 (day 28)",
    title: "Progress",
    items: [
      "Added workspace AI chat via server-side OpenAI-compatible chat/completions; default model is claude-opus-4-6 (overridable with CLAUDE_MODEL).",
    ],
  },
  {
    dateLabel: "April 22, 2026 (day 25)",
    title: "Progress",
    items: [
      "Workspace video tools: WAV uploads are now supported (same as other non-MP3 sources—transcoded to MP3 for storage).",
      "Fixed upload failures for large files / certain environments (multipart parsing, timeouts, etc.).",
      "Upload flow split: quick upload + persist first, then background transcoding with a browser alert when finished; list shows a “transcoding” state while processing.",
    ],
  },
  {
    dateLabel: "April 17, 2026 (day 20)",
    title: "Progress",
    items: [
      "Email + password sign-in.",
      "Admin tools (ADMIN_ADDRESS): manually grant, extend, or revoke paid (VIP) membership from the workspace.",
      "When the user has not chosen a UI language and is not connected with a wallet, default the UI language from IP geolocation (e.g. simplified Chinese for mainland China, traditional Chinese for Hong Kong / Taiwan).",
    ],
  },
  {
    dateLabel: "April 17, 2026 (day 19)",
    title: "Progress",
    items: [
      "Author workspace → Multilingual translation: overview of saved per-language drafts by chapter, language switcher for read-only previews, and links to the library in each language; added chapter-preview API.",
      "Publish settings → “AI auto layout (keep images)”: optional author instructions (prompt) saved on the publish record and passed into the background reflow worker / DeepSeek prompt (core safety rules win on conflict; length capped around 2000 chars).",
      "Landing timeline updated: http://whale3070.com:3000/",
    ],
  },
  {
    dateLabel: "April 14, 2026 (day 16)",
    title: "Progress",
    items: [
      "Delete extracted MP3: added a server API (remove from index and delete the audio file) and a delete button next to “Open link” and “Attach to chapter”.",
      "Speech-to-text is now supported.",
      "Workspace (video tools): https://whale3070.com:3000/workspace",
    ],
  },
  {
    dateLabel: "April 13, 2026 (day 15)",
    title: "Progress",
    items: [
      "Workspace video tools: upload MP4, server extracts MP3, authors can attach audio to a book chapter; readers hear it on the chapter “Listen” tab.",
      "Fixed author-hosted narration MP3 seeking/scrubbing in the reader: audio-host now supports Accept-Ranges and HTTP 206 byte-range responses.",
      "Startup roundtable feedback (summary): positioning vs benchmarks; clarify target users and creator-first onboarding; communicate highlights in plain, punchy language.",
      "Same session: mainland users may bounce if the landing page is English-only—consider a zh/en toggle on the home page; “Not secure” browser warnings also hurt trust—prioritize HTTPS and certificates.",
      "More notes: moderation / sensitive content expectations; make technical messaging accessible when hiring growth/ops; explore richer reader interactions beyond end-of-chapter comments (e.g. inline highlights, term/allusion explainers, short clips) with compliance in mind.",
      "Product shape questions: mobile app plans; licensing classic works for a global audience; piracy education for hobby authors and possible paid anti-theft services for higher-earning creators.",
    ],
  },
  {
    dateLabel: "April 10, 2026 (day 12)",
    title: "Progress",
    items: [
      "Paid vs free: all author-workspace / editor flows that ultimately call an LLM or the Python AI service are gated to authors with an active subscription; unpaid authors keep rule-based chapter splitting, while AI chapter split requires membership.",
      "Aura novel-evaluation engine is ready but not yet integrated with Babel Tower front/back. Sample ranking: http://198.55.109.102:3000/ranking?round_id=novel2026_kuake",
      "Web app source lives under `apps/web` in the repo (example deploy path: `/root/chenchen-lib/apps/web`).",
    ],
  },
  {
    dateLabel: "April 9, 2026 (day 11)",
    title: "Progress",
    items: [
      "Added chapter comments: users can comment after connecting wallet",
      'Updated frontend audio UX: when server MP3 cache exists, default to "Play Cached MP3" instead of \"Generate MP3\"',
      "Added per-chapter word count display",
      "Reader markdown: long code/quoted blocks now auto-wrap while preserving readability",
    ],
  },
  {
    dateLabel: "April 8, 2026 (day 10)",
    title: "Progress",
    items: [
      'Fixed bug "Outline sync timed out, please check your network and retry." with backend sanitization + frontend no longer sending chapter body in this flow',
      'Fixed bug "Clicking add chapter also creates a volume." so add chapter now creates chapter only',
      "Added Arabic TTS support",
    ],
  },
  {
    dateLabel: "April 5, 2026 (day 7)",
    title: "Progress",
    items: [
      "Improved bulk .txt import",
      "Frontend: added intro / pitch navigation page",
      "Homepage refresh",
    ],
  },
  {
    dateLabel: "April 4, 2026 (day 6)",
    title: "Progress",
    items: [
      "Audiobook uploads",
      "Edit audiobook title & details",
      "Reader audiobook playback",
    ],
  },
  {
    dateLabel: "April 3, 2026 (day 5)",
    title: "Progress",
    items: [
      "Tickets: new page",
      "Human polish after AI generation",
      "Long published content no longer breaks layout",
      "Translated reading keeps image positions (no whole-chapter image loss)",
      "Reduced Chinese leftovers in English mode",
      "Volume / section delete fixes",
      "Scalability note: architecture for ~60k novels",
      "Migration plan",
      "Capacity estimate: 10k authors & free catalog",
      "Ticket images support",
    ],
  },
  {
    dateLabel: "April 2, 2026 (day 4)",
    title: "Progress",
    items: [
      "Single source of truth for titles",
      "Removed default AI character sheet",
      "Publish using rendered format",
      "Plot outline management",
      "Auto-save current chapter to disk",
      "Chapter content ordering fixes",
      "Duplicate chapter fixes",
      "Loading-state bug fixes",
      "AI layout bug fixes",
      "Layered publish strategy",
      "Copy + AI tagging & synopsis",
      "Social sharing for works",
      "One-click Douyin-style video (frontend)",
      "Multilingual translation",
      "Mixed zh/en translation bug fixes",
      "Partitioned translated content",
    ],
  },
  {
    dateLabel: "April 1, 2026 (day 3)",
    title: "Features",
    items: [
      "Image library",
      "Chapter TOC",
      "DeepSeek-assisted read, layout & chapter split import",
      "True title display bug fix",
      "Publish all chapters in one action",
      "Hide chapter TOC",
      "Visited link styling",
      "Remember read state after refresh",
      "Markdown editor",
      "Read-only published chapters",
      "Reader typography",
      "Author/reader view sync fixes",
      "Reader social sharing",
      "Reader reading mode",
      "AI layout tooling",
      "Navigation / anchor bug fixes",
    ],
  },
  {
    dateLabel: "March 31, 2026 (day 2)",
    title: "Features",
    items: [
      "Connection failure help modal",
      "Frontend layout tweaks",
      "Next-chapter tab",
      "Billing / finance",
      "Removed static payment QR",
      "Novel sharing",
      "Reader access controls",
      "Reading experience bug fixes",
    ],
  },
  {
    dateLabel: "March 30, 2026 (day 1)",
    title: "Shipped",
    items: [
      "Frontend scaffold",
      "miroFish backend",
      "Wallet connect & role detection",
      "Character management",
      "Resume from checkpoint",
      "Card-style outline",
      "Creator / reader split",
      "Author dashboard",
      "Publishing",
    ],
  },
];

/** Non-Chinese locales use the English timeline until dedicated copy exists. */
export function getLandingProgressTimeline(locale: string): ProgressStage[] {
  const k = locale.trim().toLowerCase();
  if (k === "zh-cn" || k === "zh-tw" || k === "zh-hk" || k === "zh-mo") {
    return ZH;
  }
  return EN;
}
