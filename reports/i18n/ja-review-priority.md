# JA Offline Draft Review

- Total keys: 532
- Already localized (diff from en): 333
- Needs manual review (still en fallback): 199

## Priority Checklist

### P1 支付与会员文案 / payment-membership (0)

- (none)

### P2 删除与不可逆操作 / destructive (0)

- (none)

### P3 登录与安全 / auth-security (0)

- (none)

### P4 AI 能力说明 / ai-capability (57)

- [ ] `aiAssistant.serviceMessagePrefix`
  - en: ""
  - ja: ""
- [ ] `comments.loadFailed`
  - en: "Failed to load comments"
  - ja: "Failed to load comments"
- [ ] `comments.postFailed`
  - en: "Failed to post comment"
  - ja: "Failed to post comment"
- [ ] `settings.saveFailed`
  - en: "Save failed"
  - ja: "Save failed"
- [ ] `settings.translationModel`
  - en: "Multilingual translation model"
  - ja: "Multilingual translation model"
- [ ] `settings.translationModel.doubao-seed-1-8-251228`
  - en: "Doubao Seed 1.8 (251228)"
  - ja: "Doubao Seed 1.8 (251228)"
- [ ] `settings.translationModelHint`
  - en: "Runs workspace translation via the same OpenAI-compatible chat API as AI chat: pick Volcengine Ark (豆包) or a Claude model from CLAUDE_MODEL_ID1… (requires CLAUDE_URL + CLAUDE_API). Options are server-controlled."
  - ja: "Runs workspace translation via the same OpenAI-compatible chat API as AI chat: pick Volcengine Ark (豆包) or a Claude model from CLAUDE_MODEL_ID1… (requires CLAUDE_URL + CLAUDE_API). Options are server-controlled."
- [ ] `settings.translationProviderClaude`
  - en: "Claude (workspace endpoint)"
  - ja: "Claude (workspace endpoint)"
- [ ] `workspace.aiChatBlurb`
  - en: "Messages are sent through the server to your configured LLM. Conversation threads are saved in this browser only (same site URL = same storage). Use Export backup to save JSON before clearing data or switching machines."
  - ja: "Messages are sent through the server to your configured LLM. Conversation threads are saved in this browser only (same site URL = same storage). Use Export backup to save JSON before clearing data or switching machines."
- [ ] `workspace.aiChatCorruptBlurb`
  - en: "Your browser still has a backup in Local Storage, but this version could not parse it (upgrade or corrupted JSON). To avoid wiping that backup, automatic save is paused. Use Export backup now to download the raw Local Storage value, or copy the key from DevTools (Application → Local Storage), then use the button below to reset."
  - ja: "Your browser still has a backup in Local Storage, but this version could not parse it (upgrade or corrupted JSON). To avoid wiping that backup, automatic save is paused. Use Export backup now to download the raw Local Storage value, or copy the key from DevTools (Application → Local Storage), then use the button below to reset."
- [ ] `workspace.aiChatCorruptReason`
  - en: "Parse detail"
  - ja: "Parse detail"
- [ ] `workspace.aiChatCorruptTitle`
  - en: "Saved chats could not be read"
  - ja: "Saved chats could not be read"
- [ ] `workspace.aiChatEmptyThread`
  - en: "No messages yet. Ask anything below."
  - ja: "No messages yet. Ask anything below."
- [ ] `workspace.aiChatEnterFullscreen`
  - en: "Full screen"
  - ja: "Full screen"
- [ ] `workspace.aiChatError`
  - en: "Error"
  - ja: "Error"
- [ ] `workspace.aiChatExitFullscreen`
  - en: "Exit full screen"
  - ja: "Exit full screen"
- [ ] `workspace.aiChatExportBackup`
  - en: "Export backup (JSON)"
  - ja: "Export backup (JSON)"
- [ ] `workspace.aiChatImportBackup`
  - en: "Import backup"
  - ja: "Import backup"
- [ ] `workspace.aiChatImportError`
  - en: "Could not read this file. Choose a JSON backup exported from this chat panel (same format)."
  - ja: "Could not read this file. Choose a JSON backup exported from this chat panel (same format)."
- [ ] `workspace.aiChatModel`
  - en: "Model"
  - ja: "Model"
- [ ] `workspace.aiChatModelSwitch`
  - en: "Active model"
  - ja: "Active model"
- [ ] `workspace.aiChatNewThread`
  - en: "New chat"
  - ja: "New chat"
- [ ] `workspace.aiChatPlaceholder`
  - en: "Type a message…"
  - ja: "Type a message…"
- [ ] `workspace.aiChatRefreshConfig`
  - en: "Refresh status"
  - ja: "Refresh status"
- [ ] `workspace.aiChatRoleAssistant`
  - en: "Assistant"
  - ja: "Assistant"
- [ ] `workspace.aiChatRoleUser`
  - en: "You"
  - ja: "You"
- [ ] `workspace.aiChatSend`
  - en: "Send"
  - ja: "Send"
- [ ] `workspace.aiChatThreads`
  - en: "Chats"
  - ja: "Chats"
- [ ] `workspace.aiChatTitle`
  - en: "AI chat (Claude)"
  - ja: "AI chat (Claude)"
- [ ] `workspace.aiChatUnconfigured`
  - en: "Claude is not configured (set CLAUDE_URL and CLAUDE_API on the server)."
  - ja: "Claude is not configured (set CLAUDE_URL and CLAUDE_API on the server)."
- [ ] `workspace.aiChatWaiting`
  - en: "Waiting for reply…"
  - ja: "Waiting for reply…"
- [ ] `workspace.chapterCast.extractAllConfirm`
  - en: "The system will scan all {count} chapters in order: chapters with existing extraction are skipped; chapters without body text are skipped; remaining chapters will run AI extraction. This may take time. Continue?"
  - ja: "The system will scan all {count} chapters in order: chapters with existing extraction are skipped; chapters without body text are skipped; remaining chapters will run AI extraction. This may take time. Continue?"
- [ ] `workspace.chapterCast.extractAllDone`
  - en: "Scan complete.\nSkipped (already extracted): {skipped}\nNewly extracted: {extracted}\nSkipped (no body): {empty}"
  - ja: "Scan complete.\nSkipped (already extracted): {skipped}\nNewly extracted: {extracted}\nSkipped (no body): {empty}"
- [ ] `workspace.chapterCast.extractAllFailed`
  - en: "Batch extraction failed"
  - ja: "Batch extraction failed"
- [ ] `workspace.chapterCast.extractAllProgress`
  - en: "Chapter {current}/{total}…"
  - ja: "Chapter {current}/{total}…"
- [ ] `workspace.chapterCast.extractFailed`
  - en: "Extraction failed"
  - ja: "Extraction failed"
- [ ] `workspace.chapterCast.extractSuccess`
  - en: "Saved {count} JSON entries ({version})."
  - ja: "Saved {count} JSON entries ({version})."
- [ ] `workspace.chapterCast.structureLoadFailed`
  - en: "Failed to load outline (HTTP {status})"
  - ja: "Failed to load outline (HTTP {status})"
- [ ] `workspace.chapterCast.structureLoadFailedSimple`
  - en: "Failed to load outline"
  - ja: "Failed to load outline"
- [ ] `workspace.chapterCastPanel.extract`
  - en: "AI extract chapter cast"
  - ja: "AI extract chapter cast"
- [ ] `workspace.chapterCastPanel.extractAll`
  - en: "Extract all chapters"
  - ja: "Extract all chapters"
- [ ] `workspace.chapterCastPanel.extractAllLoading`
  - en: "Extracting whole book…"
  - ja: "Extracting whole book…"
- [ ] `workspace.chapterCastPanel.extractAllTitle`
  - en: "Scan chapters in order: skip existing extraction, skip empty body, otherwise run AI extraction."
  - ja: "Scan chapters in order: skip existing extraction, skip empty body, otherwise run AI extraction."
- [ ] `workspace.chapterCastPanel.extractLoading`
  - en: "Analyzing…"
  - ja: "Analyzing…"
- [ ] `workspace.chapterCastPanel.loadFailed`
  - en: "Failed to load"
  - ja: "Failed to load"
- [ ] `workspace.chapterCastPanel.saveFailed`
  - en: "Save failed"
  - ja: "Save failed"
- [ ] `workspace.chapterOutline.extractFailed`
  - en: "Failed to extract outline"
  - ja: "Failed to extract outline"
- [ ] `workspace.chapterOutline.extractFromSaved`
  - en: "Extract outline from saved chapter content"
  - ja: "Extract outline from saved chapter content"
- [ ] `workspace.chapterOutline.extractOneClick`
  - en: "One-click extract"
  - ja: "One-click extract"
- [ ] `workspace.chapterOutline.extracting`
  - en: "Extracting…"
  - ja: "Extracting…"
- [ ] `workspace.chapterOutline.readFileFailed`
  - en: "Failed to read file"
  - ja: "Failed to read file"
- [ ] `workspace.personaDetail.intensityPlaceholder`
  - en: "0.5"
  - ja: "0.5"
- [ ] `workspace.simulationPanel.agentIdLabel`
  - en: "interview agent_id"
  - ja: "interview agent_id"
- [ ] `workspace.simulationPanel.mirofishLabel`
  - en: "MiroFish"
  - ja: "MiroFish"
- [ ] `workspace.tabAiChat`
  - en: "AI chat (Claude)"
  - ja: "AI chat (Claude)"
- [ ] `workspace.tickets.loadFailed`
  - en: "Failed to load tickets"
  - ja: "Failed to load tickets"
- [ ] `workspace.tickets.updateFailed`
  - en: "Failed to update ticket status"
  - ja: "Failed to update ticket status"

### Other Keys (142)

- [ ] `comments.connect`
- [ ] `comments.deleting`
- [ ] `comments.empty`
- [ ] `comments.loading`
- [ ] `comments.placeholder`
- [ ] `comments.sending`
- [ ] `comments.submit`
- [ ] `comments.title`
- [ ] `comments.tooLong`
- [ ] `common.cancel`
- [ ] `landing.aboutP1`
- [ ] `landing.aboutP2`
- [ ] `landing.aboutP3`
- [ ] `landing.aboutTitle`
- [ ] `landing.connecting`
- [ ] `landing.creatorBadge`
- [ ] `landing.creatorCta`
- [ ] `landing.creatorDesc`
- [ ] `landing.creatorTitle`
- [ ] `landing.footerHint`
- [ ] `landing.heroTitle`
- [ ] `landing.navAria`
- [ ] `landing.navGuide`
- [ ] `landing.navPitch`
- [ ] `landing.progressOrder`
- [ ] `landing.progressTitle`
- [ ] `landing.readerBadge`
- [ ] `landing.readerCta`
- [ ] `landing.readerDesc`
- [ ] `landing.readerTitle`
- [ ] `landing.tagline`
- [ ] `landing.uiLanguage`
- [ ] `landing.uiLanguageAllLanguages`
- [ ] `landing.uiLanguageBusy`
- [ ] `landing.uiLanguageCurrent`
- [ ] `landing.uiLanguageEmpty`
- [ ] `landing.uiLanguageSearchPlaceholder`
- [ ] `settings.blurb`
- [ ] `settings.defaultTargetHint`
- [ ] `settings.defaultTargetLang`
- [ ] `settings.prefsSaved`
- [ ] `settings.saveTranslationPrefs`
- [ ] `settings.savingPrefs`
- [ ] `settings.title`
- [ ] `settings.translationPrefsBlurb`
- [ ] `settings.translationPrefsTitle`
- [ ] `settings.translationProviderArk`
- [ ] `workspace.backHome`
- [ ] `workspace.chapterCast.backEditor`
- [ ] `workspace.chapterCast.chapterNotFound`
- [ ] `workspace.chapterCast.chapterOption`
- [ ] `workspace.chapterCast.connectHint`
- [ ] `workspace.chapterCast.loadingStructure`
- [ ] `workspace.chapterCast.noChapterNodes`
- [ ] `workspace.chapterCast.noSavedContent`
- [ ] `workspace.chapterCast.pageBadge`
- [ ] `workspace.chapterCast.untitled`
- [ ] `workspace.chapterCastPanel.archive`
- [ ] `workspace.chapterCastPanel.archiveTitle`
- [ ] `workspace.chapterCastPanel.characters`
- [ ] `workspace.chapterCastPanel.connectHint`
- [ ] `workspace.chapterCastPanel.deleting`
- [ ] `workspace.chapterCastPanel.emptyHint`
- [ ] `workspace.chapterCastPanel.inChapterStatus`
- [ ] `workspace.chapterCastPanel.inChapterStatusHint`
- [ ] `workspace.chapterCastPanel.listAria`
- [ ] `workspace.chapterCastPanel.listHintCompact`
- [ ] `workspace.chapterCastPanel.listHintWide`
- [ ] `workspace.chapterCastPanel.loading`
- [ ] `workspace.chapterCastPanel.noUnsaved`
- [ ] `workspace.chapterCastPanel.save`
- [ ] `workspace.chapterCastPanel.saving`
- [ ] `workspace.chapterCastPanel.selectChapterCompact`
- [ ] `workspace.chapterCastPanel.selectChapterWide`
- [ ] `workspace.chapterCastPanel.status.deceased`
- [ ] `workspace.chapterCastPanel.status.injured`
- [ ] `workspace.chapterCastPanel.status.normal`
- [ ] `workspace.chapterCastPanel.tagDeceased`
- [ ] `workspace.chapterCastPanel.tagInjured`
- [ ] `workspace.chapterCastPanel.version`
- [ ] `workspace.chapterOutline.dialogDescription`
- [ ] `workspace.chapterOutline.dialogTitle`
- [ ] `workspace.chapterOutline.generatedByExcerpt`
- [ ] `workspace.chapterOutline.notEnoughContent`
- [ ] `workspace.chapterOutline.placeholder`
- [ ] `workspace.chapterOutline.saveToChapter`
- [ ] `workspace.chapterOutline.serverContentHint`
- [ ] `workspace.chapterOutline.untitledChapter`
- [ ] `workspace.chapterOutline.uploadTxt`
- [ ] `workspace.characterArc.chapterIndexPlaceholder`
- [ ] `workspace.characterArc.firstSeenIdPlaceholder`
- [ ] `workspace.connectingHint`
- [ ] `workspace.connectingTitle`
- [ ] `workspace.gateHint`
- [ ] `workspace.gateTablistAria`
- [ ] `workspace.gateTitle`
- [ ] `workspace.pdfSignBlurb`
- [ ] `workspace.pdfSignBusy`
- [ ] `workspace.pdfSignDownload`
- [ ] `workspace.pdfSignHintDrag`
- [ ] `workspace.pdfSignMergeError`
- [ ] `workspace.pdfSignPageLabel`
- [ ] `workspace.pdfSignPageMissing`
- [ ] `workspace.pdfSignPdfLoadError`
- [ ] `workspace.pdfSignPdfOnly`
- [ ] `workspace.pdfSignPickPdf`
- [ ] `workspace.pdfSignPickPng`
- [ ] `workspace.pdfSignPngOnly`
- [ ] `workspace.pdfSignRenderError`
- [ ] `workspace.pdfSignRendering`
- [ ] `workspace.pdfSignTitle`
- [ ] `workspace.shellNavAria`
- [ ] `workspace.shellSubtitle`
- [ ] `workspace.shellTitle`
- [ ] `workspace.tabAnalytics`
- [ ] `workspace.tabNovels`
- [ ] `workspace.tabPdfSign`
- [ ] `workspace.tabPublish`
- [ ] `workspace.tabSettings`
- [ ] `workspace.tabTickets`
- [ ] `workspace.tabTranslation`
- [ ] `workspace.tabVideo`
- [ ] `workspace.tickets.adminNote`
- [ ] `workspace.tickets.adminNotePlaceholder`
- [ ] `workspace.tickets.backWorkspace`
- [ ] `workspace.tickets.created`
- [ ] `workspace.tickets.empty`
- [ ] `workspace.tickets.filterMineOnly`
- [ ] `workspace.tickets.filterStatus`
- [ ] `workspace.tickets.imageAlt`
- [ ] `workspace.tickets.loading`
- [ ] `workspace.tickets.markDone`
- [ ] `workspace.tickets.markIgnored`
- [ ] `workspace.tickets.refresh`
- [ ] `workspace.tickets.refreshing`
- [ ] `workspace.tickets.statusAll`
- [ ] `workspace.tickets.statusDone`
- [ ] `workspace.tickets.statusIgnored`
- [ ] `workspace.tickets.statusOpen`
- [ ] `workspace.tickets.submitter`
- [ ] `workspace.tickets.title`
- [ ] `workspace.tickets.updated`

## Key Diff (localized vs en)

```json
[
  {
    "key": "aiAssistant.clear",
    "en": "Clear chat",
    "ja": "チャットをクリア"
  },
  {
    "key": "aiAssistant.collapseLabel",
    "en": "Minimize",
    "ja": "最小化"
  },
  {
    "key": "aiAssistant.collapseTitle",
    "en": "Minimize Sidaopu",
    "ja": "スダオプを最小化"
  },
  {
    "key": "aiAssistant.dragHint",
    "en": "· Drag header to move",
    "ja": "・ヘッダーをドラッグして移動"
  },
  {
    "key": "aiAssistant.emptyHint",
    "en": "Describe genre, tone, characters, or tropes in 中文 / English / Español. Try “more like this”, “free only”, etc.",
    "ja": "ジャンル、文体、キャラクター、好きな要素を中文 / English / Español で入力できます。「これに近い作品」「無料のみ」なども試せます。"
  },
  {
    "key": "aiAssistant.expandLabel",
    "en": "Sidaopu",
    "ja": "スダオプ"
  },
  {
    "key": "aiAssistant.expandTitle",
    "en": "Expand Sidaopu (draggable)",
    "ja": "スダオプを展開（ドラッグ可）"
  },
  {
    "key": "aiAssistant.genericErrorReply",
    "en": "Service message",
    "ja": "サービスメッセージ"
  },
  {
    "key": "aiAssistant.loading",
    "en": "Thinking…",
    "ja": "考え中…"
  },
  {
    "key": "aiAssistant.localeAckEn",
    "en": "Thanks! I’ve switched the site to **English**. —Sidaopu\n\nAsk me for library picks whenever you like (genre, mood, free vs paid, and so on).",
    "ja": "了解しました。これからは英語でサポートします。好きな作品傾向や気になるジャンルを教えてください。"
  },
  {
    "key": "aiAssistant.localeAckGeneric",
    "en": "Thanks! I’ve set the site interface for **{locale}**. —Sidaopu\n\nAsk me for library picks whenever you like (genre, mood, free vs paid, and so on).",
    "ja": "了解しました。これからこの言語でサポートします。読みたい内容をそのまま入力してください。"
  },
  {
    "key": "aiAssistant.localeAckZhCn",
    "en": "Great, I switched the site to **Simplified Chinese**. —Sidaopu\n\nTell me your preferred genre or vibe and I’ll recommend books from the library.",
    "ja": "好的，接下来我会用中文为你服务。你可以直接告诉我想看的题材、风格或关键词。"
  },
  {
    "key": "aiAssistant.networkError",
    "en": "Network error. Check your connection.",
    "ja": "ネットワークエラーです。接続状態を確認してください。"
  },
  {
    "key": "aiAssistant.networkErrorReply",
    "en": "I couldn’t reach the AI service. Please try again later.",
    "ja": "ネットワークに接続できませんでした。接続を確認してから再試行してください。"
  },
  {
    "key": "aiAssistant.placeholder",
    "en": "What would you like to read?",
    "ja": "どんな作品を読みたいですか？"
  },
  {
    "key": "aiAssistant.rateLimit",
    "en": "Too many requests. Try again shortly.",
    "ja": "リクエストが多すぎます。少し待ってから再試行してください。"
  },
  {
    "key": "aiAssistant.send",
    "en": "Send",
    "ja": "送信"
  },
  {
    "key": "aiAssistant.subtitle",
    "en": "Sidaopu only suggests works from our public library; paid books include trial/unlock notes, free books are labeled. Does not read your wallet or reading history.",
    "ja": "書籍推薦・読書ガイド・購読情報を会話で案内します。"
  },
  {
    "key": "aiAssistant.title",
    "en": "Sidaopu",
    "ja": "スダオプ"
  },
  {
    "key": "comments.delete",
    "en": "Delete",
    "ja": "削除"
  },
  {
    "key": "comments.deleteFailed",
    "en": "Failed to delete comment",
    "ja": "コメントの削除に失敗しました"
  },
  {
    "key": "comments.needWallet",
    "en": "Please connect wallet first",
    "ja": "先にウォレットを接続してください"
  },
  {
    "key": "landing.connectWallet",
    "en": "Connect wallet · MetaMask",
    "ja": "ウォレット接続 · MetaMask"
  },
  {
    "key": "landing.privacy",
    "en": "Privacy Policy",
    "ja": "プライバシーポリシー"
  },
  {
    "key": "landing.terms",
    "en": "Terms of Service",
    "ja": "利用規約"
  },
  {
    "key": "settings.billingActive",
    "en": "Your subscription is active.",
    "ja": "サブスクリプションは有効です。"
  },
  {
    "key": "settings.billingBlurb",
    "en": "Subscribe with a card after signing in. Payments are processed by Stripe Checkout; webhook events sync your VIP window to the same `.data/billing/members` record used for admin grants.",
    "ja": "サインイン後、カードで購読できます。決済は Stripe Checkout で処理され、Webhook イベントにより VIP 期間が管理付与と同じ `.data/billing/members` レコードへ同期されます。"
  },
  {
    "key": "settings.billingBusy",
    "en": "Redirecting to Stripe…",
    "ja": "Stripe にリダイレクト中…"
  },
  {
    "key": "settings.billingCancelHint",
    "en": "Checkout was closed before completion. You were not charged.",
    "ja": "決済完了前に Checkout が閉じられました。課金は行われていません。"
  },
  {
    "key": "settings.billingInactive",
    "en": "No active subscription detected for this account. Start checkout to unlock author-side AI features.",
    "ja": "このアカウントに有効なサブスクリプションは見つかりません。Checkout を開始すると作者向け AI 機能を解放できます。"
  },
  {
    "key": "settings.billingLoading",
    "en": "Checking subscription…",
    "ja": "サブスクリプションを確認中…"
  },
  {
    "key": "settings.billingPeriodEnd",
    "en": "Current period ends:",
    "ja": "現在の期間終了日:"
  },
  {
    "key": "settings.billingSignInFirst",
    "en": "Sign in (email or wallet) to manage billing.",
    "ja": "請求を管理するにはサインイン（メールまたはウォレット）が必要です。"
  },
  {
    "key": "settings.billingSubscribe",
    "en": "Subscribe with Stripe Checkout",
    "ja": "Stripe Checkout で購読する"
  },
  {
    "key": "settings.billingSuccess",
    "en": "Payment recorded. Your membership will update in a few seconds after Stripe sends the webhook.",
    "ja": "決済が記録されました。Stripe から Webhook が届いた後、数秒でメンバーシップ状態が更新されます。"
  },
  {
    "key": "settings.billingTitle",
    "en": "Author AI subscription (Stripe)",
    "ja": "作者向け AI サブスクリプション（Stripe）"
  },
  {
    "key": "wallet.connect",
    "en": "Connect wallet",
    "ja": "ウォレット接続"
  },
  {
    "key": "wallet.connectedLine",
    "en": "Connected · 0x…{tail}",
    "ja": "接続済み · 0x…{tail}"
  },
  {
    "key": "wallet.connectedShort",
    "en": "Connected",
    "ja": "接続済み"
  },
  {
    "key": "wallet.connecting",
    "en": "Connecting…",
    "ja": "接続中…"
  },
  {
    "key": "wallet.disconnect",
    "en": "Disconnect",
    "ja": "切断"
  },
  {
    "key": "wallet.disconnecting",
    "en": "Disconnecting…",
    "ja": "切断中…"
  },
  {
    "key": "wallet.emailLine",
    "en": "Email · {email}",
    "ja": "メール · {email}"
  },
  {
    "key": "wallet.emailLogout",
    "en": "Sign out",
    "ja": "サインアウト"
  },
  {
    "key": "wallet.guideAria",
    "en": "MetaMask setup guide",
    "ja": "MetaMask セットアップガイド"
  },
  {
    "key": "wallet.guideOk",
    "en": "Got it",
    "ja": "了解"
  },
  {
    "key": "wallet.guideStep1",
    "en": "Use Chrome or Firefox.",
    "ja": "Chrome または Firefox を使用してください。"
  },
  {
    "key": "wallet.guideStep2Prefix",
    "en": "Open the official download page:",
    "ja": "公式ダウンロードページを開く:"
  },
  {
    "key": "wallet.guideStep3",
    "en": "After installing the extension, restart the browser and refresh.",
    "ja": "拡張機能をインストールした後、ブラウザを再起動してページを再読み込みしてください。"
  },
  {
    "key": "wallet.guideStep4",
    "en": "Click “Connect wallet” and approve in MetaMask.",
    "ja": "「ウォレット接続」をクリックし、MetaMask で承認してください。"
  },
  {
    "key": "wallet.guideTitle",
    "en": "Connection failed: install MetaMask",
    "ja": "接続に失敗しました：MetaMask をインストールしてください"
  },
  {
    "key": "workspace.aiChatClearAllThreads",
    "en": "Delete all chats",
    "ja": "すべてのチャットを削除"
  },
  {
    "key": "workspace.aiChatClearInput",
    "en": "Clear",
    "ja": "クリア"
  },
  {
    "key": "workspace.aiChatConfirmClearAll",
    "en": "Delete all saved chats on this device? This cannot be undone.",
    "ja": "この端末に保存された全チャットを削除しますか？この操作は取り消せません。"
  },
  {
    "key": "workspace.aiChatConfirmDeleteThread",
    "en": "Delete this chat and its messages? This cannot be undone.",
    "ja": "このチャットとメッセージを削除しますか？この操作は取り消せません。"
  },
  {
    "key": "workspace.aiChatCorruptClearCta",
    "en": "Delete broken backup and resume saving",
    "ja": "破損したバックアップを削除して保存を再開"
  },
  {
    "key": "workspace.aiChatDeleteThread",
    "en": "Delete this chat",
    "ja": "このチャットを削除"
  },
  {
    "key": "workspace.authAnd",
    "en": "and",
    "ja": "および"
  },
  {
    "key": "workspace.authPrivacyLink",
    "en": "Privacy Policy",
    "ja": "プライバシーポリシー"
  },
  {
    "key": "workspace.authTermsLink",
    "en": "Terms of Service",
    "ja": "利用規約"
  },
  {
    "key": "workspace.authTermsPrefix",
    "en": "By continuing, you agree to the",
    "ja": "続行すると、次に同意したものとみなされます："
  },
  {
    "key": "workspace.chapterCast.currentChapterAria",
    "en": "Current chapter",
    "ja": "現在の章"
  },
  {
    "key": "workspace.chapterCast.extractAllChapterExtractError",
    "en": "Chapter {index} ({title}): {error}",
    "ja": "第 {index} 章（{title}）: {error}"
  },
  {
    "key": "workspace.chapterCast.extractAllChapterLoadError",
    "en": "Chapter {index}: {error}",
    "ja": "第 {index} 章: {error}"
  },
  {
    "key": "workspace.chapterCast.needWalletAndChapter",
    "en": "Please connect wallet and select a chapter first.",
    "ja": "先にウォレットを接続し、章を選択してください。"
  },
  {
    "key": "workspace.chapterCast.needWalletAndStructure",
    "en": "Please connect wallet and ensure this work has chapter nodes.",
    "ja": "先にウォレットを接続し、この作品に章ノードがあることを確認してください。"
  },
  {
    "key": "workspace.chapterCast.subscriptionRequired",
    "en": "A paid membership is required to use this AI feature.",
    "ja": "この AI 機能の利用には有料メンバーシップが必要です。"
  },
  {
    "key": "workspace.chapterCastPanel.delete",
    "en": "Delete character file",
    "ja": "人物ファイルを削除"
  },
  {
    "key": "workspace.chapterCastPanel.deleteConfirm",
    "en": "Delete character file \"{name}\"?\nThis cannot be undone.",
    "ja": "人物ファイル「{name}」を削除しますか？\nこの操作は取り消せません。"
  },
  {
    "key": "workspace.chapterCastPanel.deleteFailed",
    "en": "Delete failed",
    "ja": "削除に失敗しました"
  },
  {
    "key": "workspace.chapterCastPanel.subscriptionRequiredDelete",
    "en": "Paid membership required to delete.",
    "ja": "削除には有料メンバーシップが必要です。"
  },
  {
    "key": "workspace.chapterCastPanel.subscriptionRequiredSave",
    "en": "Paid membership required to save.",
    "ja": "保存には有料メンバーシップが必要です。"
  },
  {
    "key": "workspace.chapterOutline.needWallet",
    "en": "Please connect wallet first",
    "ja": "先にウォレットを接続してください"
  },
  {
    "key": "workspace.characterArc.ageLabel",
    "en": "Age / birth year",
    "ja": "年齢 / 生年など"
  },
  {
    "key": "workspace.characterArc.ageLabelSimple",
    "en": "Age",
    "ja": "年齢"
  },
  {
    "key": "workspace.characterArc.appearanceLabel",
    "en": "Appearance",
    "ja": "外見"
  },
  {
    "key": "workspace.characterArc.appearanceSimple",
    "en": "Appearance",
    "ja": "外見"
  },
  {
    "key": "workspace.characterArc.birthLabel",
    "en": "Birth / background",
    "ja": "出生 / 背景"
  },
  {
    "key": "workspace.characterArc.castWideView",
    "en": "Character wide view",
    "ja": "人物ワイド表示"
  },
  {
    "key": "workspace.characterArc.chapterTitle",
    "en": "Chapter {index}",
    "ja": "第 {index} 章"
  },
  {
    "key": "workspace.characterArc.combatLabel",
    "en": "Combat power",
    "ja": "戦闘力"
  },
  {
    "key": "workspace.characterArc.connectHint",
    "en": "Connect wallet to load cross-chapter profile and chapter JSON snapshots.",
    "ja": "ウォレット接続後、クロス章アーカイブと各章 JSON スナップショットを読み込めます。"
  },
  {
    "key": "workspace.characterArc.constantSectionHint",
    "en": "Stable cross-chapter facts such as name, background, and appearance; edit alongside variables and chapter JSON below.",
    "ja": "名前・背景・外見など章をまたいで安定する情報。右側の変数と下部の章 JSON と照合して編集します。"
  },
  {
    "key": "workspace.characterArc.constantSectionTitle",
    "en": "Constants",
    "ja": "定設（定数）"
  },
  {
    "key": "workspace.characterArc.constantsSubTitle",
    "en": "Constants (rarely change)",
    "ja": "定数（ほぼ不変）"
  },
  {
    "key": "workspace.characterArc.customConstantsHint",
    "en": "For example: blood type, birthplace, race... A row is saved only when field name is filled.",
    "ja": "例：血液型、出身地、種族… フィールド名がある行のみ保存されます。"
  },
  {
    "key": "workspace.characterArc.customConstantsTitle",
    "en": "Custom constant fields",
    "ja": "カスタム定数項目"
  },
  {
    "key": "workspace.characterArc.customRows.addRow",
    "en": "+ Add row",
    "ja": "+ 行を追加"
  },
  {
    "key": "workspace.characterArc.customRows.content",
    "en": "Content",
    "ja": "内容"
  },
  {
    "key": "workspace.characterArc.customRows.delete",
    "en": "Delete",
    "ja": "削除"
  },
  {
    "key": "workspace.characterArc.customRows.fieldName",
    "en": "Field name",
    "ja": "フィールド名"
  },
  {
    "key": "workspace.characterArc.customVariablesHint",
    "en": "For example: mental state, relationship web, carried items... A row is saved only when field name is filled.",
    "ja": "例：精神状態、関係網、所持アイテム… フィールド名がある行のみ保存されます。"
  },
  {
    "key": "workspace.characterArc.customVariablesTitle",
    "en": "Custom variable fields",
    "ja": "カスタム変数項目"
  },
  {
    "key": "workspace.characterArc.deathIdLabel",
    "en": "Departure/death chapter id",
    "ja": "退場 / 死亡章 id"
  },
  {
    "key": "workspace.characterArc.deathIndexLabel",
    "en": "Departure chapter index",
    "ja": "退場章番号"
  },
  {
    "key": "workspace.characterArc.deceasedHint",
    "en": "A departure chapter is set in the master profile (chapter id or chapter index), so this page is shown in muted grayscale.",
    "ja": "マスターに退場章（章 id または章番号）が設定されているため、このページは淡いグレースケールで表示されます。"
  },
  {
    "key": "workspace.characterArc.editorHome",
    "en": "Editor",
    "ja": "エディター"
  },
  {
    "key": "workspace.characterArc.fillFromFirst",
    "en": "Fill blanks from first chapter snapshot",
    "ja": "先頭章スナップショットで空欄補完"
  },
  {
    "key": "workspace.characterArc.fillFromFirstHint",
    "en": "If gender/age/appearance/personality/location is empty in master profile, use \"Fill blanks from first chapter snapshot\" to copy from the earliest timeline chapter; existing values are not overwritten.",
    "ja": "マスターの性別・年齢・外見・性格・位置に空欄がある場合、「先頭章スナップショットで空欄補完」でタイムライン最小章からコピーします。既存値は上書きしません。"
  },
  {
    "key": "workspace.characterArc.fillFromFirstTitle",
    "en": "Take the earliest chapter by index and only fill still-empty master fields (age/appearance/personality/location).",
    "ja": "章番号が最小の章から、マスターで空欄の年齢/外見/性格/位置のみ補完します"
  },
  {
    "key": "workspace.characterArc.firstSeenIdLabel",
    "en": "First appearance (chapter id)",
    "ja": "初登場（章 id）"
  },
  {
    "key": "workspace.characterArc.firstSeenIndexLabel",
    "en": "First appearance (chapter index)",
    "ja": "初登場（章番号）"
  },
  {
    "key": "workspace.characterArc.fullFields",
    "en": "Full fields for this chapter",
    "ja": "この章の全フィールド"
  },
  {
    "key": "workspace.characterArc.genderLabel",
    "en": "Gender",
    "ja": "性別"
  },
  {
    "key": "workspace.characterArc.loadFailed",
    "en": "Load failed",
    "ja": "読み込みに失敗しました"
  },
  {
    "key": "workspace.characterArc.loading",
    "en": "Loading…",
    "ja": "読み込み中…"
  },
  {
    "key": "workspace.characterArc.locationLabel",
    "en": "Location",
    "ja": "現在位置"
  },
  {
    "key": "workspace.characterArc.locationSimple",
    "en": "Location",
    "ja": "場所"
  },
  {
    "key": "workspace.characterArc.luckLabel",
    "en": "Luck",
    "ja": "運"
  },
  {
    "key": "workspace.characterArc.masterVariablesTitle",
    "en": "Master variables",
    "ja": "マスター変数"
  },
  {
    "key": "workspace.characterArc.nameLabel",
    "en": "Name",
    "ja": "名前"
  },
  {
    "key": "workspace.characterArc.noPresence",
    "en": "No presence field in this chapter.",
    "ja": "この章には presence が未入力です。"
  },
  {
    "key": "workspace.characterArc.notesLabel",
    "en": "Master notes",
    "ja": "マスター備考"
  },
  {
    "key": "workspace.characterArc.notesSimple",
    "en": "Notes",
    "ja": "備考"
  },
  {
    "key": "workspace.characterArc.openInWideView",
    "en": "Open in wide view",
    "ja": "ワイド表示で開く"
  },
  {
    "key": "workspace.characterArc.outcomeLabel",
    "en": "Ending / long-arc notes",
    "ja": "結末 / 長期説明"
  },
  {
    "key": "workspace.characterArc.pageBadge",
    "en": "Cross-chapter character archive",
    "ja": "人物クロス章アーカイブ"
  },
  {
    "key": "workspace.characterArc.personalityLabel",
    "en": "Personality",
    "ja": "性格"
  },
  {
    "key": "workspace.characterArc.personalitySimple",
    "en": "Personality",
    "ja": "性格"
  },
  {
    "key": "workspace.characterArc.plotSectionHint",
    "en": "First appearance, departure, and ending notes; independent from per-chapter extracted JSON.",
    "ja": "初登場・退場・結末の説明。各章抽出 JSON とは独立しています。"
  },
  {
    "key": "workspace.characterArc.plotSectionTitle",
    "en": "Plot line",
    "ja": "物語ライン"
  },
  {
    "key": "workspace.characterArc.presenceTitle",
    "en": "Presence / screen time",
    "ja": "在場 / 出番（presence）"
  },
  {
    "key": "workspace.characterArc.saveFailed",
    "en": "Save failed",
    "ja": "保存に失敗しました"
  },
  {
    "key": "workspace.characterArc.saveMaster",
    "en": "Save master profile",
    "ja": "マスターを保存"
  },
  {
    "key": "workspace.characterArc.saved",
    "en": "Character master profile saved",
    "ja": "人物マスタープロファイルを保存しました"
  },
  {
    "key": "workspace.characterArc.saving",
    "en": "Saving…",
    "ja": "保存中…"
  },
  {
    "key": "workspace.characterArc.skillsLabel",
    "en": "Skills",
    "ja": "技能"
  },
  {
    "key": "workspace.characterArc.slugLabel",
    "en": "Pinyin slug (file naming)",
    "ja": "ピンイン slug（ファイル名規則）"
  },
  {
    "key": "workspace.characterArc.snapshot.currentChapter",
    "en": "Chapter: ",
    "ja": "本章："
  },
  {
    "key": "workspace.characterArc.snapshot.diffTitle",
    "en": "Compared with master variables (shown only when different or chapter-only)",
    "ja": "マスター変数との比較（差分または本章固有のみ表示）"
  },
  {
    "key": "workspace.characterArc.snapshot.emptyValue",
    "en": "(empty)",
    "ja": "（空）"
  },
  {
    "key": "workspace.characterArc.snapshot.location",
    "en": "Location",
    "ja": "場所"
  },
  {
    "key": "workspace.characterArc.snapshot.masterVariable",
    "en": "Master variable: ",
    "ja": "マスター変数："
  },
  {
    "key": "workspace.characterArc.snapshot.onlyInChapter",
    "en": "{label} (exists in chapter, empty in master variable)",
    "ja": "{label}（本章にはあるが、マスター変数は未入力）"
  },
  {
    "key": "workspace.characterArc.snapshot.personality",
    "en": "Personality",
    "ja": "性格"
  },
  {
    "key": "workspace.characterArc.stableIdReadonly",
    "en": "stableId (read-only)",
    "ja": "stableId（読み取り専用）"
  },
  {
    "key": "workspace.characterArc.subscriptionRequired",
    "en": "A paid membership is required to save.",
    "ja": "保存には有料メンバーシップが必要です。"
  },
  {
    "key": "workspace.characterArc.timelineEmpty",
    "en": "No matching chapter JSON found. Please confirm stableId matches chapter character JSON.",
    "ja": "一致する章 JSON がありません。stableId が各章人物 JSON と一致しているか確認してください。"
  },
  {
    "key": "workspace.characterArc.timelineSectionTitle",
    "en": "Per-chapter snapshots (latest extracted version)",
    "ja": "各章スナップショット（最新抽出版）"
  },
  {
    "key": "workspace.characterArc.variableSectionHint",
    "en": "Personality, skills, and location can change by chapter; chapter cards compare against this baseline.",
    "ja": "性格・スキル・位置などは章ごとに変化します。各章カードはここを基準に差分表示します。"
  },
  {
    "key": "workspace.characterArc.variableSectionTitle",
    "en": "Variables (change with plot)",
    "ja": "変数（物語で変化）"
  },
  {
    "key": "workspace.connectWallet",
    "en": "Connect wallet",
    "ja": "ウォレット接続"
  },
  {
    "key": "workspace.connectWalletMetaMask",
    "en": "Connect MetaMask",
    "ja": "MetaMask を接続"
  },
  {
    "key": "workspace.emailAuthBlurb",
    "en": "No browser wallet needed — register once, then sign in on this device.",
    "ja": "ブラウザウォレットは不要です。一度登録すれば、この端末でサインインできます。"
  },
  {
    "key": "workspace.emailAuthBusy",
    "en": "Please wait…",
    "ja": "しばらくお待ちください…"
  },
  {
    "key": "workspace.emailAuthError",
    "en": "Request failed",
    "ja": "リクエストに失敗しました"
  },
  {
    "key": "workspace.emailAuthMissingAuthorId",
    "en": "Signed in but server did not return an account id. Please try again or contact support.",
    "ja": "サインインは成功しましたが、サーバーからアカウント ID が返されませんでした。再試行するかサポートへ連絡してください。"
  },
  {
    "key": "workspace.emailAuthNetworkError",
    "en": "Network error",
    "ja": "ネットワークエラー"
  },
  {
    "key": "workspace.emailLabel",
    "en": "Email",
    "ja": "メール"
  },
  {
    "key": "workspace.emailLogin",
    "en": "Sign in",
    "ja": "サインイン"
  },
  {
    "key": "workspace.emailLoginSubmit",
    "en": "Sign in",
    "ja": "サインイン"
  },
  {
    "key": "workspace.emailRegister",
    "en": "Register",
    "ja": "新規登録"
  },
  {
    "key": "workspace.emailRegisterSubmit",
    "en": "Create account",
    "ja": "アカウント作成"
  },
  {
    "key": "workspace.gateTabEmail",
    "en": "Email & password",
    "ja": "メール & パスワード"
  },
  {
    "key": "workspace.gateTabWallet",
    "en": "MetaMask",
    "ja": "MetaMask（ウォレット）"
  },
  {
    "key": "workspace.outlineSidebar.addChapter",
    "en": "+ Add chapter",
    "ja": "+ 章を追加"
  },
  {
    "key": "workspace.outlineSidebar.addChapterTitle",
    "en": "New chapter is added under selected volume/section; if chapter is selected, under that chapter's parent",
    "ja": "新章は選択中の巻/節配下に追加されます。章選択時はその章の親配下に追加されます"
  },
  {
    "key": "workspace.outlineSidebar.addSection",
    "en": "+ Add section",
    "ja": "+ 節を追加"
  },
  {
    "key": "workspace.outlineSidebar.addSectionMissingParent",
    "en": "Cannot add section: parent node not found.",
    "ja": "節を追加できません: 親ノードが見つかりません。"
  },
  {
    "key": "workspace.outlineSidebar.addSectionNoParent",
    "en": "Cannot add section: no attachable volume or section.",
    "ja": "節を追加できません: 追加可能な巻または節がありません。"
  },
  {
    "key": "workspace.outlineSidebar.addSectionTitle",
    "en": "Add under selected volume/section or selected chapter's parent; creates volume if missing",
    "ja": "選択中の巻/節または章の親配下に追加。巻がない場合は自動作成します"
  },
  {
    "key": "workspace.outlineSidebar.addVolume",
    "en": "+ Add volume",
    "ja": "+ 巻を追加"
  },
  {
    "key": "workspace.outlineSidebar.addVolumeTitle",
    "en": "Add a volume to root",
    "ja": "ルート末尾に巻を追加"
  },
  {
    "key": "workspace.outlineSidebar.chapterExists",
    "en": "{title} already exists.",
    "ja": "{title} は既に存在します。"
  },
  {
    "key": "workspace.outlineSidebar.chapterOutline",
    "en": "Chapter outline",
    "ja": "本章のあらすじ"
  },
  {
    "key": "workspace.outlineSidebar.chapterOutlineTitle",
    "en": "Edit chapter outline (extract or upload)",
    "ja": "この章のあらすじを編集（抽出/アップロード可）"
  },
  {
    "key": "workspace.outlineSidebar.chapterPublishDisabledHint",
    "en": "Set the whole work to public before per-chapter publishing.",
    "ja": "章ごとの公開前に作品全体を公開にしてください。"
  },
  {
    "key": "workspace.outlineSidebar.chapterWordCount",
    "en": "Chapter {index} · about {count} chars",
    "ja": "第 {index} 章 · 約 {count} 文字"
  },
  {
    "key": "workspace.outlineSidebar.deleteNotSaved",
    "en": "Delete failed; changes were not saved.",
    "ja": "削除に失敗しました。変更は保存されていません。"
  },
  {
    "key": "workspace.outlineSidebar.deleteOutline",
    "en": "Delete volume/chapter/section",
    "ja": "巻/章/節を削除"
  },
  {
    "key": "workspace.outlineSidebar.deleteOutlineTitle",
    "en": "Delete selected volume/section (children are promoted) or chapter (including content)",
    "ja": "選択中の巻/節を削除（子は1階層昇格）または章を削除（本文含む）"
  },
  {
    "key": "workspace.outlineSidebar.deleteSaved",
    "en": "Deleted successfully and saved to cloud.",
    "ja": "削除に成功し、クラウドへ保存しました。"
  },
  {
    "key": "workspace.outlineSidebar.deleteSectionConfirm",
    "en": "Delete section \"{label}\"? Its child nodes will be promoted one level and body content will stay.",
    "ja": "節「{label}」を削除しますか？配下ノードは1階層上へ昇格し、本文は削除されません。"
  },
  {
    "key": "workspace.outlineSidebar.deleteVolumeConfirm",
    "en": "Delete volume \"{label}\"? Its chapters/sections will be promoted one level and body content will stay.",
    "ja": "巻「{label}」を削除しますか？配下の章/節は1階層上へ昇格し、本文は削除されません。"
  },
  {
    "key": "workspace.outlineSidebar.dragSortAria",
    "en": "Drag to sort",
    "ja": "ドラッグして並べ替え"
  },
  {
    "key": "workspace.outlineSidebar.empty",
    "en": "No outline nodes yet",
    "ja": "構成ノードがありません"
  },
  {
    "key": "workspace.outlineSidebar.processing",
    "en": "Processing…",
    "ja": "処理中…"
  },
  {
    "key": "workspace.outlineSidebar.publish",
    "en": "Publish",
    "ja": "公開"
  },
  {
    "key": "workspace.outlineSidebar.publishAll",
    "en": "Publish all chapters",
    "ja": "全章を一括公開"
  },
  {
    "key": "workspace.outlineSidebar.publishAllDisabledHint",
    "en": "Please publish the work and ensure it has chapters first.",
    "ja": "先に作品を公開し、章があることを確認してください。"
  },
  {
    "key": "workspace.outlineSidebar.publishAllTitle",
    "en": "Mark all current chapters as published",
    "ja": "現在の全章を公開済みに設定します"
  },
  {
    "key": "workspace.outlineSidebar.publishChapter",
    "en": "Publish chapter",
    "ja": "この章を公開"
  },
  {
    "key": "workspace.outlineSidebar.publishStatus",
    "en": "Publish status · {status}",
    "ja": "公開状態 · {status}"
  },
  {
    "key": "workspace.outlineSidebar.published",
    "en": "Published",
    "ja": "公開済み"
  },
  {
    "key": "workspace.outlineSidebar.removeTagAria",
    "en": "Remove {tag}",
    "ja": "{tag} を削除"
  },
  {
    "key": "workspace.outlineSidebar.seekNode",
    "en": "Locate",
    "ja": "移動"
  },
  {
    "key": "workspace.outlineSidebar.seekNodeTitle",
    "en": "Scroll editor to this node's position",
    "ja": "エディターをこのノード位置までスクロール"
  },
  {
    "key": "workspace.outlineSidebar.summaryPlaceholder",
    "en": "Summary",
    "ja": "要約"
  },
  {
    "key": "workspace.outlineSidebar.tagPlaceholder",
    "en": "Tag (press Enter to add, e.g. Climax)",
    "ja": "タグ（Enterで追加。例: クライマックス）"
  },
  {
    "key": "workspace.outlineSidebar.title",
    "en": "Story outline",
    "ja": "ストーリー構成"
  },
  {
    "key": "workspace.outlineSidebar.titlePlaceholder",
    "en": "Title",
    "ja": "タイトル"
  },
  {
    "key": "workspace.outlineSidebar.unpublishChapter",
    "en": "Unpublish chapter",
    "ja": "この章の公開を取り下げ"
  },
  {
    "key": "workspace.outlineSidebar.unpublished",
    "en": "Unpublished",
    "ja": "未公開"
  },
  {
    "key": "workspace.outlineSidebar.untitledSection",
    "en": "Untitled section",
    "ja": "無題の節"
  },
  {
    "key": "workspace.outlineSidebar.untitledVolume",
    "en": "Untitled volume",
    "ja": "無題の巻"
  },
  {
    "key": "workspace.outlineSidebar.updatedDirty",
    "en": "Updated",
    "ja": "更新あり"
  },
  {
    "key": "workspace.outlineSidebar.withdraw",
    "en": "Withdraw",
    "ja": "取り下げ"
  },
  {
    "key": "workspace.outlineSidebar.withdrawDisabledTitle",
    "en": "Cannot withdraw while paid-serial mode or non-public state is active",
    "ja": "有料連載中または非公開状態ではここで取り下げできません"
  },
  {
    "key": "workspace.outlineSidebar.withdrawPublish",
    "en": "Withdraw publish",
    "ja": "公開を取り下げ"
  },
  {
    "key": "workspace.outlineSidebar.withdrawTitle",
    "en": "Withdraw public access and return to private draft",
    "ja": "公開を取り下げて自分のみ閲覧に戻します"
  },
  {
    "key": "workspace.passwordLabel",
    "en": "Password (8+ characters)",
    "ja": "パスワード（8文字以上）"
  },
  {
    "key": "workspace.personaDetail.addToward",
    "en": "+ Add stance target",
    "ja": "+ 立場対象を追加"
  },
  {
    "key": "workspace.personaDetail.attitude.ambivalent",
    "en": "Ambivalent",
    "ja": "両価的"
  },
  {
    "key": "workspace.personaDetail.attitude.neutral",
    "en": "Neutral",
    "ja": "中立"
  },
  {
    "key": "workspace.personaDetail.attitude.oppose",
    "en": "Oppose",
    "ja": "反対"
  },
  {
    "key": "workspace.personaDetail.attitude.support",
    "en": "Support",
    "ja": "支持"
  },
  {
    "key": "workspace.personaDetail.attitude.unknown",
    "en": "Unknown",
    "ja": "不明"
  },
  {
    "key": "workspace.personaDetail.basicTitle",
    "en": "Basic info",
    "ja": "基本情報"
  },
  {
    "key": "workspace.personaDetail.bioLabel",
    "en": "Character summary",
    "ja": "人物要約"
  },
  {
    "key": "workspace.personaDetail.conflictDescLabel",
    "en": "Description",
    "ja": "説明"
  },
  {
    "key": "workspace.personaDetail.conflictTitle",
    "en": "Current conflict",
    "ja": "現在の衝突"
  },
  {
    "key": "workspace.personaDetail.conflictType.environmental",
    "en": "Environmental",
    "ja": "環境"
  },
  {
    "key": "workspace.personaDetail.conflictType.internal",
    "en": "Internal",
    "ja": "内面"
  },
  {
    "key": "workspace.personaDetail.conflictType.interpersonal",
    "en": "Interpersonal",
    "ja": "対人"
  },
  {
    "key": "workspace.personaDetail.conflictType.societal",
    "en": "Societal",
    "ja": "社会"
  },
  {
    "key": "workspace.personaDetail.conflictType.systemic",
    "en": "Systemic",
    "ja": "システム"
  },
  {
    "key": "workspace.personaDetail.conflictTypeLabel",
    "en": "Type",
    "ja": "タイプ"
  },
  {
    "key": "workspace.personaDetail.delete",
    "en": "Delete",
    "ja": "削除"
  },
  {
    "key": "workspace.personaDetail.emptyPrefix",
    "en": "Select a character on the left to view and edit stance · motivation · conflict (schema:",
    "ja": "左側でキャラクターを選択すると、立場・動機・衝突を確認/編集できます（対応スキーマ:"
  },
  {
    "key": "workspace.personaDetail.emptySuffix",
    "en": ").",
    "ja": "）。"
  },
  {
    "key": "workspace.personaDetail.escalationHookLabel",
    "en": "Escalation hook",
    "ja": "激化フック"
  },
  {
    "key": "workspace.personaDetail.goalLabel",
    "en": "Goal",
    "ja": "目標"
  },
  {
    "key": "workspace.personaDetail.intensityLabel",
    "en": "Intensity 0-1",
    "ja": "強度 0-1"
  },
  {
    "key": "workspace.personaDetail.internalNeedLabel",
    "en": "Internal need",
    "ja": "内的欲求"
  },
  {
    "key": "workspace.personaDetail.misbeliefLabel",
    "en": "Misbelief",
    "ja": "誤信念"
  },
  {
    "key": "workspace.personaDetail.motivationTitle",
    "en": "Motivation",
    "ja": "動機"
  },
  {
    "key": "workspace.personaDetail.nameLabel",
    "en": "Name",
    "ja": "名前"
  },
  {
    "key": "workspace.personaDetail.opposingForceLabel",
    "en": "Opposing force",
    "ja": "対立勢力"
  },
  {
    "key": "workspace.personaDetail.opposingForceText",
    "en": "Opposing force: {force}",
    "ja": "対立勢力: {force}"
  },
  {
    "key": "workspace.personaDetail.roleLabel",
    "en": "Role label",
    "ja": "役割ラベル"
  },
  {
    "key": "workspace.personaDetail.rolePlaceholder",
    "en": "e.g. Protagonist / Historian",
    "ja": "例: 主人公 / 史官"
  },
  {
    "key": "workspace.personaDetail.stakesLabel",
    "en": "Stakes",
    "ja": "利害"
  },
  {
    "key": "workspace.personaDetail.stakesShortLabel",
    "en": "Stakes",
    "ja": "利害"
  },
  {
    "key": "workspace.personaDetail.stanceRadarLabel",
    "en": "Stance intensity sketch (relative values)",
    "ja": "立場強度の目安（相対値）"
  },
  {
    "key": "workspace.personaDetail.stanceSummaryLabel",
    "en": "Stance summary",
    "ja": "立場要約"
  },
  {
    "key": "workspace.personaDetail.stanceTitle",
    "en": "Stance",
    "ja": "立場"
  },
  {
    "key": "workspace.personaDetail.stanceTowardLabel",
    "en": "Stance targets (subject and attitude)",
    "ja": "立場対象（対象と態度）"
  },
  {
    "key": "workspace.personaDetail.targetPlaceholder",
    "en": "Target / topic",
    "ja": "対象 / 論点"
  },
  {
    "key": "workspace.personaDetail.visibility.deceptive",
    "en": "Deceptive",
    "ja": "偽装"
  },
  {
    "key": "workspace.personaDetail.visibility.hidden",
    "en": "Hidden",
    "ja": "非公開"
  },
  {
    "key": "workspace.personaDetail.visibility.public",
    "en": "Public",
    "ja": "公開"
  },
  {
    "key": "workspace.personaDetail.visibilityLabel",
    "en": "Visibility",
    "ja": "可視性"
  },
  {
    "key": "workspace.personaDetail.whyNowLabel",
    "en": "Why now",
    "ja": "なぜ今か"
  },
  {
    "key": "workspace.personaSidebar.add",
    "en": "Add character",
    "ja": "キャラクター追加"
  },
  {
    "key": "workspace.personaSidebar.addTitleConnected",
    "en": "Add a character and save to current wallet",
    "ja": "キャラクターを追加して現在のウォレットに保存"
  },
  {
    "key": "workspace.personaSidebar.addTitleDisconnected",
    "en": "Add locally first; it will sync to server after wallet connection",
    "ja": "先にローカル追加できます。ウォレット接続後に自動でサーバー同期します"
  },
  {
    "key": "workspace.personaSidebar.castHintPrefix",
    "en": "Per-chapter extracted cast files; select a character below. Data is stored in",
    "ja": "章ごとに抽出された登場人物ファイル。下の縦リストで人物を選択。保存先:"
  },
  {
    "key": "workspace.personaSidebar.castTitle",
    "en": "Character info",
    "ja": "人物情報"
  },
  {
    "key": "workspace.personaSidebar.connectWalletFirst",
    "en": "Connect wallet first",
    "ja": "先にウォレットを接続してください"
  },
  {
    "key": "workspace.personaSidebar.deleteAria",
    "en": "Delete character {name}",
    "ja": "キャラクター {name} を削除"
  },
  {
    "key": "workspace.personaSidebar.deleteTitle",
    "en": "Delete this character",
    "ja": "このキャラクターを削除"
  },
  {
    "key": "workspace.personaSidebar.empty",
    "en": "No characters yet. Click \"Add character\" to begin.",
    "ja": "キャラクターがありません。「キャラクター追加」をクリックして開始します。"
  },
  {
    "key": "workspace.personaSidebar.subtitle",
    "en": "Click a list item to open stance · motivation · conflict on the right.",
    "ja": "リスト項目をクリックすると右側で立場・動機・衝突を展開します。"
  },
  {
    "key": "workspace.personaSidebar.title",
    "en": "Character setup",
    "ja": "キャラクター設定"
  },
  {
    "key": "workspace.personaSidebar.walletHint",
    "en": "After wallet connection, add/delete actions are saved to server archive (isolated by address).",
    "ja": "ウォレット接続後、追加/削除はサーバー保管に保存されます（アドレスごとに分離）。"
  },
  {
    "key": "workspace.personaSidebar.wideView",
    "en": "Wide view",
    "ja": "ワイド表示"
  },
  {
    "key": "workspace.personaSidebar.wideViewTitle",
    "en": "Open wide-layout editor view in a new tab",
    "ja": "新しいタブでワイド編集ビューを開く"
  },
  {
    "key": "workspace.sessionLoading",
    "en": "Restoring session…",
    "ja": "セッションを復元中…"
  },
  {
    "key": "workspace.simulationPanel.adoptAndInsert",
    "en": "Adopt and insert (blockquote)",
    "ja": "採用して挿入（blockquote）"
  },
  {
    "key": "workspace.simulationPanel.agentStreamReply",
    "en": "Agent stream reply",
    "ja": "Agent ストリーム返信"
  },
  {
    "key": "workspace.simulationPanel.branchesTitle",
    "en": "Simulation branches",
    "ja": "推演分岐"
  },
  {
    "key": "workspace.simulationPanel.close",
    "en": "Close",
    "ja": "閉じる"
  },
  {
    "key": "workspace.simulationPanel.deepFlowHint",
    "en": "Deep streaming flow: generate-profiles -> (if simulation_id provided) start parallel -> poll env -> interview via SSE. After completion, quick simulation runs once to fill structured cards.",
    "ja": "深度ストリーム: generate-profiles ->（simulation_id 入力時）start parallel -> env ポーリング -> interview を SSE 配信。完了後、構造化カード補完のため高速推演を1回自動実行します。"
  },
  {
    "key": "workspace.simulationPanel.defaultPrompt",
    "en": "If Shang Chun uses the yellow file envelope as leverage, will Lin Yan retreat next turn or counterattack?",
    "ja": "尚淳が黄色い封筒を切り札に使った場合、林硯は次の手で退くか、それとも切り返すか？"
  },
  {
    "key": "workspace.simulationPanel.emptySelectionHint",
    "en": "(Empty selection, full manuscript excerpt will be used)",
    "ja": "（選択が空のため、本文全体の抜粋を使用）"
  },
  {
    "key": "workspace.simulationPanel.fallbackPrompt",
    "en": "Simulation result",
    "ja": "シミュレーション結果"
  },
  {
    "key": "workspace.simulationPanel.graphIdLabel",
    "en": "graph_id (required)",
    "ja": "graph_id（必須）"
  },
  {
    "key": "workspace.simulationPanel.graphIdPlaceholder",
    "en": "mirofish_xxx / Zep graph ID",
    "ja": "mirofish_xxx / Zep グラフ ID"
  },
  {
    "key": "workspace.simulationPanel.graphIdRequired",
    "en": "Deep simulation requires a Zep graph_id (MiroFish graph).",
    "ja": "深度シミュレーションには Zep graph_id（MiroFish グラフ）が必要です。"
  },
  {
    "key": "workspace.simulationPanel.lineDirection",
    "en": "Line direction: {direction}",
    "ja": "セリフ方向: {direction}"
  },
  {
    "key": "workspace.simulationPanel.mirofishChecking",
    "en": "Checking…",
    "ja": "確認中…"
  },
  {
    "key": "workspace.simulationPanel.mirofishReachable",
    "en": "Reachable",
    "ja": "接続可能"
  },
  {
    "key": "workspace.simulationPanel.mirofishUnreachable",
    "en": "Unreachable (quick simulation only)",
    "ja": "接続不可（高速推演のみ利用可）"
  },
  {
    "key": "workspace.simulationPanel.modeDeep",
    "en": "Deep simulation",
    "ja": "深度シミュレーション"
  },
  {
    "key": "workspace.simulationPanel.modeLight",
    "en": "Quick simulation",
    "ja": "高速推演"
  },
  {
    "key": "workspace.simulationPanel.questionLabel",
    "en": "Simulation question",
    "ja": "推演の質問"
  },
  {
    "key": "workspace.simulationPanel.rawJson",
    "en": "Raw JSON",
    "ja": "生 JSON"
  },
  {
    "key": "workspace.simulationPanel.refreshFromStream",
    "en": "Refresh character cards from stream text only",
    "ja": "上記テキストのみで右側キャラカードを更新"
  },
  {
    "key": "workspace.simulationPanel.refreshPromptFallback",
    "en": "Based on the following agent simulation text, update each character's stance / current_conflict (output updated_dramas).",
    "ja": "次の Agent シミュレーション本文をもとに、各キャラの stance / current_conflict を更新してください（updated_dramas を出力）。"
  },
  {
    "key": "workspace.simulationPanel.run",
    "en": "Run simulation",
    "ja": "推演する"
  },
  {
    "key": "workspace.simulationPanel.selectionContextTitle",
    "en": "Selection context (Cmd+Shift+A)",
    "ja": "選択コンテキスト（⌘⇧A）"
  },
  {
    "key": "workspace.simulationPanel.serviceLabel",
    "en": "Service",
    "ja": "サービス"
  },
  {
    "key": "workspace.simulationPanel.simulationIdLabel",
    "en": "simulation_id (fill if prepared: start + interview)",
    "ja": "simulation_id（prepared 済みなら入力: start + interview）"
  },
  {
    "key": "workspace.simulationPanel.simulationIdPlaceholder",
    "en": "sim_xxx (optional)",
    "ja": "sim_xxx（任意）"
  },
  {
    "key": "workspace.simulationPanel.startDeepStream",
    "en": "Start deep stream",
    "ja": "深度ストリーム開始"
  },
  {
    "key": "workspace.simulationPanel.summarizePromptSuffix",
    "en": "Please extract stance and conflict changes from the agent free text into updated_dramas (mapped to input character ids).",
    "ja": "Agent の自由テキストにある立場と衝突の変化を updated_dramas に要約してください（入力キャラ id に対応）。"
  },
  {
    "key": "workspace.simulationPanel.title",
    "en": "AI character simulation",
    "ja": "AI キャラクター推演"
  },
  {
    "key": "workspace.tabAdminMembers",
    "en": "VIP admin",
    "ja": "VIP 管理"
  },
  {
    "key": "workspace.tickets.loginPrompt",
    "en": "Sign in with email or connect wallet before viewing tickets.",
    "ja": "チケットを表示する前に、メールでサインインするかウォレットを接続してください。"
  },
  {
    "key": "workspace.tickets.markClosed",
    "en": "Mark closed",
    "ja": "クローズ済みにする"
  },
  {
    "key": "workspace.tickets.statusClosed",
    "en": "Closed",
    "ja": "クローズ"
  },
  {
    "key": "workspace.translationManage.addLanguage",
    "en": "Add language",
    "ja": "言語を追加"
  },
  {
    "key": "workspace.translationManage.backEditor",
    "en": "Back to editor",
    "ja": "エディターへ戻る"
  },
  {
    "key": "workspace.translationManage.badge",
    "en": "Translation management",
    "ja": "翻訳管理"
  },
  {
    "key": "workspace.translationManage.chapterLabel",
    "en": "Chapter",
    "ja": "章"
  },
  {
    "key": "workspace.translationManage.chapterOption",
    "en": "Chapter {index} · {title}",
    "ja": "第 {index} 章 · {title}"
  },
  {
    "key": "workspace.translationManage.chapterPlaceholder",
    "en": "Translation for this chapter (Markdown or plain text)",
    "ja": "この章の翻訳（Markdown またはプレーンテキスト）"
  },
  {
    "key": "workspace.translationManage.chapterSaved",
    "en": "Chapter translation saved",
    "ja": "章の翻訳を保存しました"
  },
  {
    "key": "workspace.translationManage.connectHint",
    "en": "Connect wallet to view and edit translations.",
    "ja": "ウォレットを接続すると翻訳の閲覧と編集ができます。"
  },
  {
    "key": "workspace.translationManage.coverage",
    "en": "Current language covers {done} / {total} chapters (non-empty translation)",
    "ja": "現在の言語の翻訳カバー率: {done} / {total} 章（空でない翻訳）"
  },
  {
    "key": "workspace.translationManage.displaySectionTitle",
    "en": "Display metadata ({lang})",
    "ja": "表示メタ情報（{lang}）"
  },
  {
    "key": "workspace.translationManage.displaySynopsisLabel",
    "en": "Display synopsis",
    "ja": "表示概要"
  },
  {
    "key": "workspace.translationManage.displaySynopsisPlaceholder",
    "en": "Optional: synopsis in this language",
    "ja": "任意: この言語の概要"
  },
  {
    "key": "workspace.translationManage.displayTitleLabel",
    "en": "Display title",
    "ja": "表示タイトル"
  },
  {
    "key": "workspace.translationManage.displayTitlePlaceholder",
    "en": "Optional: reader-facing title",
    "ja": "任意: 読者向けタイトル"
  },
  {
    "key": "workspace.translationManage.emptyLanguages",
    "en": "No translations yet. Click \"Add language\" to start editing.",
    "ja": "翻訳はまだありません。「言語を追加」をクリックして開始してください。"
  },
  {
    "key": "workspace.translationManage.existingLanguages",
    "en": "Existing languages",
    "ja": "既存の言語"
  },
  {
    "key": "workspace.translationManage.invalidLanguageCode",
    "en": "Invalid language code format. Use letters, numbers, and hyphens only (max 24 chars).",
    "ja": "言語コード形式が無効です。英数字とハイフンのみ（最大24文字）で入力してください。"
  },
  {
    "key": "workspace.translationManage.loadChapterListFailed",
    "en": "Failed to load chapter list HTTP {status}",
    "ja": "章一覧の読み込みに失敗しました HTTP {status}"
  },
  {
    "key": "workspace.translationManage.loadFailed",
    "en": "Load failed",
    "ja": "読み込みに失敗しました"
  },
  {
    "key": "workspace.translationManage.loadStoreFailed",
    "en": "Failed to load translation store HTTP {status}",
    "ja": "翻訳ストアの読み込みに失敗しました HTTP {status}"
  },
  {
    "key": "workspace.translationManage.loading",
    "en": "Loading translations and chapters…",
    "ja": "翻訳と章を読み込み中…"
  },
  {
    "key": "workspace.translationManage.metaSaved",
    "en": "Translation display title and synopsis saved",
    "ja": "翻訳の表示タイトルと概要を保存しました"
  },
  {
    "key": "workspace.translationManage.needWallet",
    "en": "Please connect wallet first.",
    "ja": "先にウォレットを接続してください。"
  },
  {
    "key": "workspace.translationManage.needWalletAndChapter",
    "en": "Please connect wallet and select a chapter first.",
    "ja": "先にウォレットを接続し、章を選択してください。"
  },
  {
    "key": "workspace.translationManage.noChapters",
    "en": "This work has no chapters yet. Create chapters in the editor first.",
    "ja": "この作品にはまだ章がありません。先にエディターで章を作成してください。"
  },
  {
    "key": "workspace.translationManage.preview",
    "en": "Reader preview",
    "ja": "読者プレビュー"
  },
  {
    "key": "workspace.translationManage.promptAddLanguage",
    "en": "New language code (e.g. en, zh-tw, ja)",
    "ja": "新しい言語コード（例: en、zh-tw、ja）"
  },
  {
    "key": "workspace.translationManage.saveChapter",
    "en": "Save chapter translation",
    "ja": "この章の翻訳を保存"
  },
  {
    "key": "workspace.translationManage.saveFailed",
    "en": "Save failed",
    "ja": "保存に失敗しました"
  },
  {
    "key": "workspace.translationManage.saveFailedWithStatus",
    "en": "Save failed HTTP {status}",
    "ja": "保存に失敗しました HTTP {status}"
  },
  {
    "key": "workspace.translationManage.saveMeta",
    "en": "Save display metadata",
    "ja": "表示メタ情報を保存"
  },
  {
    "key": "workspace.translationManage.savingChapter",
    "en": "Saving…",
    "ja": "保存中…"
  },
  {
    "key": "workspace.translationManage.savingMeta",
    "en": "Saving…",
    "ja": "保存中…"
  },
  {
    "key": "workspace.translationManage.tagsLabel",
    "en": "Tags (comma separated)",
    "ja": "タグ（カンマ区切り）"
  },
  {
    "key": "workspace.translationManage.tagsPlaceholder",
    "en": "e.g. Fantasy, Adventure",
    "ja": "例: ファンタジー, 冒険"
  },
  {
    "key": "workspace.translationManage.unsavedAddLanguageConfirm",
    "en": "There are unsaved changes. Adding and switching to a new language will discard them. Continue?",
    "ja": "未保存の変更があります。新しい言語を追加して切り替えると破棄されます。続行しますか？"
  },
  {
    "key": "workspace.translationManage.unsavedSwitchChapterConfirm",
    "en": "The current chapter translation is not saved. Switching chapters will discard edits. Continue?",
    "ja": "この章の翻訳は未保存です。章を切り替えると編集内容が失われます。続行しますか？"
  },
  {
    "key": "workspace.translationManage.unsavedSwitchLangConfirm",
    "en": "There are unsaved changes. Switching language will discard them. Continue?",
    "ja": "未保存の変更があります。言語を切り替えると破棄されます。続行しますか？"
  },
  {
    "key": "workspace.translationManage.untitled",
    "en": "Untitled",
    "ja": "無題"
  },
  {
    "key": "workspace.walletGateBlurb",
    "en": "Use the browser extension. Approve the connection request when prompted.",
    "ja": "ブラウザ拡張機能を使用してください。接続要求が表示されたら承認してください。"
  },
  {
    "key": "workspace.walletGateRefreshHint",
    "en": "If you connected before, try refreshing the page to restore the session.",
    "ja": "以前に接続したことがある場合は、ページを再読み込みするとセッションを復元できることがあります。"
  },
  {
    "key": "workspace.walletGateTitle",
    "en": "Connect with MetaMask",
    "ja": "MetaMask で接続"
  }
]
```
