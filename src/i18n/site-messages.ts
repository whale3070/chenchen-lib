import {
  DEFAULT_SITE_LOCALE,
  normalizeUiLocale,
} from "@/lib/site-locale";

/** Flat message map per locale. Keys are dotted paths. Only `en` and `zh-CN` are hand-written; others use MT cache. */
export const siteMessages: Record<"en" | "zh-CN", Record<string, string>> = {
  en: {
    "landing.navAria": "Intro & guides",
    "landing.navPitch": "About Chenchen-Lib",
    "landing.navGuide": "Reader guide",
    "landing.heroTitle": "Choose your role · enter the matrix",
    "landing.tagline":
      "AI-powered creation, multilingual reach | Chenchen-Lib — give every word voice, warmth, and a global echo.",
    "landing.creatorBadge": "Creator",
    "landing.creatorTitle": "I'm an author",
    "landing.creatorDesc": "AI drafting · characters & outline · narrative simulation",
    "landing.creatorCta": "Open workspace",
    "landing.readerBadge": "Reader",
    "landing.readerTitle": "I'm a reader",
    "landing.readerDesc": "Library & reading (in development)",
    "landing.readerCta": "Go to library",
    "landing.progressTitle": "Development progress",
    "landing.progressOrder": "Newest first",
    "landing.footerHint": "Connect a wallet to create and sync",
    "landing.connecting": "Connecting…",
    "landing.connectWallet": "Connect wallet · MetaMask",

    "workspace.sessionLoading": "Restoring session…",
    "workspace.connectingTitle": "Connecting wallet…",
    "workspace.connectingHint": "Approve the request in your extension or popup.",
    "workspace.gateTitle": "Sign in to open the workspace.",
    "workspace.gateHint":
      "Choose a sign-in method below. If you signed in before, refresh may restore your session without extra prompts.",
    "workspace.gateTablistAria": "Workspace sign-in method",
    "workspace.gateTabEmail": "Email & password",
    "workspace.gateTabWallet": "MetaMask",
    "workspace.walletGateTitle": "Connect with MetaMask",
    "workspace.walletGateBlurb":
      "Use the browser extension. Approve the connection request when prompted.",
    "workspace.connectWalletMetaMask": "Connect MetaMask",
    "workspace.walletGateRefreshHint":
      "If you connected before, try refreshing the page to restore the session.",
    "workspace.emailAuthBlurb":
      "No browser wallet needed — register once, then sign in on this device.",
    "workspace.emailLogin": "Sign in",
    "workspace.emailRegister": "Register",
    "workspace.emailLabel": "Email",
    "workspace.passwordLabel": "Password (8+ characters)",
    "workspace.emailAuthBusy": "Please wait…",
    "workspace.emailLoginSubmit": "Sign in",
    "workspace.emailRegisterSubmit": "Create account",
    "workspace.emailAuthError": "Request failed",
    "workspace.emailAuthNetworkError": "Network error",
    "workspace.emailAuthMissingAuthorId":
      "Signed in but server did not return an account id. Please try again or contact support.",
    "workspace.connectWallet": "Connect wallet",
    "workspace.backHome": "Back to home",
    "workspace.tabNovels": "My novels",
    "workspace.tabPublish": "Publishing",
    "workspace.tabVideo": "Video → MP3",
    "workspace.tabTranslation": "Translation",
    "workspace.tabAnalytics": "Active wallets",
    "workspace.tabTickets": "Tickets",
    "workspace.tabAdminMembers": "VIP admin",
    "workspace.tabSettings": "Account",

    "settings.title": "Account settings",
    "settings.blurb":
      "You are identified by your wallet address. Connect or disconnect here, and save translation preferences. Interface language is chosen when **Sidaopu** asks your native language (home page); the site then shows hand-written English/Chinese or machine-translated UI for other languages.",
    "settings.translationPrefsTitle": "Translation language preferences",
    "settings.translationPrefsBlurb":
      "Pick target languages and a default. The translation module reads this configuration.",
    "settings.defaultTargetLang": "Default translation target",
    "settings.defaultTargetHint": "Defaults come from account settings; you can override anytime.",
    "settings.saveTranslationPrefs": "Save translation preferences",
    "settings.savingPrefs": "Saving…",
    "settings.prefsSaved": "Translation preferences saved",
    "settings.saveFailed": "Save failed",

    "wallet.connect": "Connect wallet",
    "wallet.connecting": "Connecting…",
    "wallet.guideTitle": "Connection failed: install MetaMask",
    "wallet.guideStep1": "Use Chrome or Firefox.",
    "wallet.guideStep2Prefix": "Open the official download page:",
    "wallet.guideStep3": "After installing the extension, restart the browser and refresh.",
    "wallet.guideStep4": "Click “Connect wallet” and approve in MetaMask.",
    "wallet.guideOk": "Got it",
    "wallet.disconnect": "Disconnect",
    "wallet.disconnecting": "Disconnecting…",
    "wallet.connectedShort": "Connected",
    "wallet.connectedLine": "Connected · 0x…{tail}",
    "wallet.emailLine": "Email · {email}",
    "wallet.emailLogout": "Sign out",
    "wallet.guideAria": "MetaMask setup guide",

    "aiAssistant.title": "Sidaopu",
    "aiAssistant.dragHint": "· Drag header to move",
    "aiAssistant.collapseLabel": "Minimize",
    "aiAssistant.collapseTitle": "Minimize Sidaopu",
    "aiAssistant.clear": "Clear chat",
    "aiAssistant.subtitle":
      "Sidaopu only suggests works from our public library; paid books include trial/unlock notes, free books are labeled. Does not read your wallet or reading history.",
    "aiAssistant.emptyHint":
      "Describe genre, tone, characters, or tropes in 中文 / English / Español. Try “more like this”, “free only”, etc.",
    "aiAssistant.placeholder": "What would you like to read?",
    "aiAssistant.send": "Send",
    "aiAssistant.loading": "Thinking…",
    "aiAssistant.rateLimit": "Too many requests. Try again shortly.",
    "aiAssistant.networkError": "Network error. Check your connection.",
    "aiAssistant.networkErrorReply":
      "I couldn’t reach the AI service. Please try again later.",
    "aiAssistant.genericErrorReply": "Service message",
    "aiAssistant.expandTitle": "Expand Sidaopu (draggable)",
    "aiAssistant.expandLabel": "Sidaopu",
  },
  "zh-CN": {
    "landing.navAria": "项目介绍与使用指南",
    "landing.navPitch": "郴郴文库介绍",
    "landing.navGuide": "使用方法指南",
    "landing.heroTitle": "选择你的身份 · 进入矩阵",
    "landing.tagline":
      "AI赋能创作，多语连接世界 | Chenchen-Lib，让每一段文字都有声音、有温度、有全球回响",
    "landing.creatorBadge": "Creator",
    "landing.creatorTitle": "我是作者",
    "landing.creatorDesc": "AI 稿面 · 角色与大纲 · 叙事推演",
    "landing.creatorCta": "进入工作台",
    "landing.readerBadge": "Reader",
    "landing.readerTitle": "我是读者",
    "landing.readerDesc": "书库与阅读体验（开发中）",
    "landing.readerCta": "前往书库",
    "landing.progressTitle": "网站开发进度",
    "landing.progressOrder": "按时间由近到远",
    "landing.footerHint": "连接钱包以继续创作与同步",
    "landing.connecting": "连接中…",
    "landing.connectWallet": "连接钱包以继续 · MetaMask",

    "workspace.sessionLoading": "正在恢复会话…",
    "workspace.connectingTitle": "正在连接钱包…",
    "workspace.connectingHint": "请在扩展或弹窗中完成授权",
    "workspace.gateTitle": "使用工作台请先登录",
    "workspace.gateHint":
      "请选择一种方式登录。若本机曾登录过，刷新页面可能自动恢复会话。",
    "workspace.gateTablistAria": "工作台登录方式",
    "workspace.gateTabEmail": "邮箱密码",
    "workspace.gateTabWallet": "MetaMask 钱包",
    "workspace.walletGateTitle": "使用 MetaMask 连接",
    "workspace.walletGateBlurb":
      "需安装浏览器扩展，点击连接后在弹窗中确认授权。",
    "workspace.connectWalletMetaMask": "连接 MetaMask",
    "workspace.walletGateRefreshHint":
      "若曾连接过钱包，可先尝试刷新页面以恢复会话。",
    "workspace.emailAuthBlurb": "无需安装钱包扩展：注册后使用邮箱密码即可创作。",
    "workspace.emailLogin": "登录",
    "workspace.emailRegister": "注册",
    "workspace.emailLabel": "邮箱",
    "workspace.passwordLabel": "密码（至少 8 位）",
    "workspace.emailAuthBusy": "请稍候…",
    "workspace.emailLoginSubmit": "登录",
    "workspace.emailRegisterSubmit": "注册并登录",
    "workspace.emailAuthError": "请求失败",
    "workspace.emailAuthNetworkError": "网络异常",
    "workspace.emailAuthMissingAuthorId":
      "登录响应异常（未返回账户标识），请重试或联系管理员。",
    "workspace.connectWallet": "连接钱包",
    "workspace.backHome": "返回首页",
    "workspace.tabNovels": "我的小说",
    "workspace.tabPublish": "发布管理",
    "workspace.tabVideo": "视频管理",
    "workspace.tabTranslation": "多语言翻译",
    "workspace.tabAnalytics": "活跃钱包看板",
    "workspace.tabTickets": "工单管理",
    "workspace.tabAdminMembers": "会员管理",
    "workspace.tabSettings": "账户设置",

    "settings.title": "账户设置",
    "settings.blurb":
      "当前通过钱包地址标识作者身份。你可在此连接或断开钱包，并保存多语言翻译偏好。界面语言由首页 **斯道普** 询问你的母语后设置；除中英外，其它语言将使用机器翻译界面文案。",
    "settings.translationPrefsTitle": "翻译语言偏好",
    "settings.translationPrefsBlurb":
      "勾选常用目标语言，并设置默认翻译语言。多语言翻译模块会自动读取这里的配置。",
    "settings.defaultTargetLang": "默认翻译语言",
    "settings.defaultTargetHint": "默认语言来自账户设置，可随时切换。",
    "settings.saveTranslationPrefs": "保存翻译偏好",
    "settings.savingPrefs": "保存中…",
    "settings.prefsSaved": "翻译语言偏好已保存",
    "settings.saveFailed": "保存失败",

    "wallet.connect": "连接钱包",
    "wallet.connecting": "连接中…",
    "wallet.guideTitle": "连接失败：请先安装 MetaMask",
    "wallet.guideStep1": "请使用 Chrome 或 Firefox 浏览器访问本站。",
    "wallet.guideStep2Prefix": "打开 MetaMask 官方下载页：",
    "wallet.guideStep3": "安装浏览器扩展后，重启浏览器并刷新页面。",
    "wallet.guideStep4": "点击“连接钱包”，在 MetaMask 弹窗中确认连接。",
    "wallet.guideOk": "我知道了",
    "wallet.disconnect": "断开连接",
    "wallet.disconnecting": "断开中…",
    "wallet.connectedShort": "已连接",
    "wallet.connectedLine": "已连接 · 0x…{tail}",
    "wallet.emailLine": "邮箱 · {email}",
    "wallet.emailLogout": "退出邮箱登录",
    "wallet.guideAria": "MetaMask 安装指南",

    "aiAssistant.title": "斯道普",
    "aiAssistant.dragHint": "· 拖标题栏移动",
    "aiAssistant.collapseLabel": "缩小",
    "aiAssistant.collapseTitle": "缩小斯道普",
    "aiAssistant.clear": "清空对话",
    "aiAssistant.subtitle":
      "斯道普仅推荐本站书库已公开作品；付费书会说明试读与解锁，免费书会标明免费阅读。不读取钱包与阅读记录。",
    "aiAssistant.emptyHint":
      "用中文 / English / Español 描述题材、风格、人设或爽点。可说「换一批」「找类似的」「只要免费书 / 只要付费书」等。",
    "aiAssistant.placeholder": "描述你想读的小说…",
    "aiAssistant.send": "发送",
    "aiAssistant.loading": "正在生成…",
    "aiAssistant.rateLimit": "请求过于频繁",
    "aiAssistant.networkError": "网络异常，请检查连接后重试。",
    "aiAssistant.networkErrorReply": "网络异常，我暂时无法连接服务。请稍后再试。",
    "aiAssistant.genericErrorReply": "服务提示",
    "aiAssistant.expandTitle": "展开斯道普（可拖到屏幕任意位置）",
    "aiAssistant.expandLabel": "斯道普",
  },
};

export function getEnglishSiteMessages(): Record<string, string> {
  return siteMessages.en;
}

export function translateKey(
  locale: string,
  key: string,
  mt?: Record<string, string> | null,
): string {
  const n = normalizeUiLocale(locale) ?? DEFAULT_SITE_LOCALE;
  if (n === "zh-CN") {
    return siteMessages["zh-CN"][key] ?? siteMessages.en[key] ?? key;
  }
  if (n === "en") {
    return siteMessages.en[key] ?? key;
  }
  const fromMt = mt?.[key];
  if (typeof fromMt === "string" && fromMt.trim()) return fromMt;
  return siteMessages.en[key] ?? key;
}
