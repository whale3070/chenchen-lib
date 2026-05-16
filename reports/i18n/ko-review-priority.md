# KO Offline Draft Review

- Total keys: 532
- Already localized (diff from en): 332
- Needs manual review (still en fallback): 200

## Priority Checklist

### P1 支付与会员文案 / payment-membership (0)

- (none)

### P2 删除与不可逆操作 / destructive (0)

- (none)

### P3 登录与安全 / auth-security (0)

- (none)

### P4 AI 能力说明 / ai-capability (58)

- [ ] `aiAssistant.serviceMessagePrefix`
  - en: ""
  - ko: ""
- [ ] `comments.loadFailed`
  - en: "Failed to load comments"
  - ko: "Failed to load comments"
- [ ] `comments.postFailed`
  - en: "Failed to post comment"
  - ko: "Failed to post comment"
- [ ] `settings.saveFailed`
  - en: "Save failed"
  - ko: "Save failed"
- [ ] `settings.translationModel`
  - en: "Multilingual translation model"
  - ko: "Multilingual translation model"
- [ ] `settings.translationModel.doubao-seed-1-8-251228`
  - en: "Doubao Seed 1.8 (251228)"
  - ko: "Doubao Seed 1.8 (251228)"
- [ ] `settings.translationModelHint`
  - en: "Runs workspace translation via the same OpenAI-compatible chat API as AI chat: pick Volcengine Ark (豆包) or a Claude model from CLAUDE_MODEL_ID1… (requires CLAUDE_URL + CLAUDE_API). Options are server-controlled."
  - ko: "Runs workspace translation via the same OpenAI-compatible chat API as AI chat: pick Volcengine Ark (豆包) or a Claude model from CLAUDE_MODEL_ID1… (requires CLAUDE_URL + CLAUDE_API). Options are server-controlled."
- [ ] `settings.translationProviderClaude`
  - en: "Claude (workspace endpoint)"
  - ko: "Claude (workspace endpoint)"
- [ ] `workspace.aiChatBlurb`
  - en: "Messages are sent through the server to your configured LLM. Conversation threads are saved in this browser only (same site URL = same storage). Use Export backup to save JSON before clearing data or switching machines."
  - ko: "Messages are sent through the server to your configured LLM. Conversation threads are saved in this browser only (same site URL = same storage). Use Export backup to save JSON before clearing data or switching machines."
- [ ] `workspace.aiChatCorruptBlurb`
  - en: "Your browser still has a backup in Local Storage, but this version could not parse it (upgrade or corrupted JSON). To avoid wiping that backup, automatic save is paused. Use Export backup now to download the raw Local Storage value, or copy the key from DevTools (Application → Local Storage), then use the button below to reset."
  - ko: "Your browser still has a backup in Local Storage, but this version could not parse it (upgrade or corrupted JSON). To avoid wiping that backup, automatic save is paused. Use Export backup now to download the raw Local Storage value, or copy the key from DevTools (Application → Local Storage), then use the button below to reset."
- [ ] `workspace.aiChatCorruptReason`
  - en: "Parse detail"
  - ko: "Parse detail"
- [ ] `workspace.aiChatCorruptTitle`
  - en: "Saved chats could not be read"
  - ko: "Saved chats could not be read"
- [ ] `workspace.aiChatEmptyThread`
  - en: "No messages yet. Ask anything below."
  - ko: "No messages yet. Ask anything below."
- [ ] `workspace.aiChatEnterFullscreen`
  - en: "Full screen"
  - ko: "Full screen"
- [ ] `workspace.aiChatError`
  - en: "Error"
  - ko: "Error"
- [ ] `workspace.aiChatExitFullscreen`
  - en: "Exit full screen"
  - ko: "Exit full screen"
- [ ] `workspace.aiChatExportBackup`
  - en: "Export backup (JSON)"
  - ko: "Export backup (JSON)"
- [ ] `workspace.aiChatImportBackup`
  - en: "Import backup"
  - ko: "Import backup"
- [ ] `workspace.aiChatImportError`
  - en: "Could not read this file. Choose a JSON backup exported from this chat panel (same format)."
  - ko: "Could not read this file. Choose a JSON backup exported from this chat panel (same format)."
- [ ] `workspace.aiChatModel`
  - en: "Model"
  - ko: "Model"
- [ ] `workspace.aiChatModelSwitch`
  - en: "Active model"
  - ko: "Active model"
- [ ] `workspace.aiChatNewThread`
  - en: "New chat"
  - ko: "New chat"
- [ ] `workspace.aiChatPlaceholder`
  - en: "Type a message…"
  - ko: "Type a message…"
- [ ] `workspace.aiChatRefreshConfig`
  - en: "Refresh status"
  - ko: "Refresh status"
- [ ] `workspace.aiChatRoleAssistant`
  - en: "Assistant"
  - ko: "Assistant"
- [ ] `workspace.aiChatRoleUser`
  - en: "You"
  - ko: "You"
- [ ] `workspace.aiChatSend`
  - en: "Send"
  - ko: "Send"
- [ ] `workspace.aiChatThreads`
  - en: "Chats"
  - ko: "Chats"
- [ ] `workspace.aiChatTitle`
  - en: "AI chat (Claude)"
  - ko: "AI chat (Claude)"
- [ ] `workspace.aiChatUnconfigured`
  - en: "Claude is not configured (set CLAUDE_URL and CLAUDE_API on the server)."
  - ko: "Claude is not configured (set CLAUDE_URL and CLAUDE_API on the server)."
- [ ] `workspace.aiChatWaiting`
  - en: "Waiting for reply…"
  - ko: "Waiting for reply…"
- [ ] `workspace.chapterCast.extractAllConfirm`
  - en: "The system will scan all {count} chapters in order: chapters with existing extraction are skipped; chapters without body text are skipped; remaining chapters will run AI extraction. This may take time. Continue?"
  - ko: "The system will scan all {count} chapters in order: chapters with existing extraction are skipped; chapters without body text are skipped; remaining chapters will run AI extraction. This may take time. Continue?"
- [ ] `workspace.chapterCast.extractAllDone`
  - en: "Scan complete.\nSkipped (already extracted): {skipped}\nNewly extracted: {extracted}\nSkipped (no body): {empty}"
  - ko: "Scan complete.\nSkipped (already extracted): {skipped}\nNewly extracted: {extracted}\nSkipped (no body): {empty}"
- [ ] `workspace.chapterCast.extractAllFailed`
  - en: "Batch extraction failed"
  - ko: "Batch extraction failed"
- [ ] `workspace.chapterCast.extractAllProgress`
  - en: "Chapter {current}/{total}…"
  - ko: "Chapter {current}/{total}…"
- [ ] `workspace.chapterCast.extractFailed`
  - en: "Extraction failed"
  - ko: "Extraction failed"
- [ ] `workspace.chapterCast.extractSuccess`
  - en: "Saved {count} JSON entries ({version})."
  - ko: "Saved {count} JSON entries ({version})."
- [ ] `workspace.chapterCast.structureLoadFailed`
  - en: "Failed to load outline (HTTP {status})"
  - ko: "Failed to load outline (HTTP {status})"
- [ ] `workspace.chapterCast.structureLoadFailedSimple`
  - en: "Failed to load outline"
  - ko: "Failed to load outline"
- [ ] `workspace.chapterCastPanel.extract`
  - en: "AI extract chapter cast"
  - ko: "AI extract chapter cast"
- [ ] `workspace.chapterCastPanel.extractAll`
  - en: "Extract all chapters"
  - ko: "Extract all chapters"
- [ ] `workspace.chapterCastPanel.extractAllLoading`
  - en: "Extracting whole book…"
  - ko: "Extracting whole book…"
- [ ] `workspace.chapterCastPanel.extractAllTitle`
  - en: "Scan chapters in order: skip existing extraction, skip empty body, otherwise run AI extraction."
  - ko: "Scan chapters in order: skip existing extraction, skip empty body, otherwise run AI extraction."
- [ ] `workspace.chapterCastPanel.extractLoading`
  - en: "Analyzing…"
  - ko: "Analyzing…"
- [ ] `workspace.chapterCastPanel.loadFailed`
  - en: "Failed to load"
  - ko: "Failed to load"
- [ ] `workspace.chapterCastPanel.saveFailed`
  - en: "Save failed"
  - ko: "Save failed"
- [ ] `workspace.chapterOutline.extractFailed`
  - en: "Failed to extract outline"
  - ko: "Failed to extract outline"
- [ ] `workspace.chapterOutline.extractFromSaved`
  - en: "Extract outline from saved chapter content"
  - ko: "Extract outline from saved chapter content"
- [ ] `workspace.chapterOutline.extractOneClick`
  - en: "One-click extract"
  - ko: "One-click extract"
- [ ] `workspace.chapterOutline.extracting`
  - en: "Extracting…"
  - ko: "Extracting…"
- [ ] `workspace.chapterOutline.readFileFailed`
  - en: "Failed to read file"
  - ko: "Failed to read file"
- [ ] `workspace.personaDetail.emptySuffix`
  - en: ")."
  - ko: ")."
- [ ] `workspace.personaDetail.intensityPlaceholder`
  - en: "0.5"
  - ko: "0.5"
- [ ] `workspace.simulationPanel.agentIdLabel`
  - en: "interview agent_id"
  - ko: "interview agent_id"
- [ ] `workspace.simulationPanel.mirofishLabel`
  - en: "MiroFish"
  - ko: "MiroFish"
- [ ] `workspace.tabAiChat`
  - en: "AI chat (Claude)"
  - ko: "AI chat (Claude)"
- [ ] `workspace.tickets.loadFailed`
  - en: "Failed to load tickets"
  - ko: "Failed to load tickets"
- [ ] `workspace.tickets.updateFailed`
  - en: "Failed to update ticket status"
  - ko: "Failed to update ticket status"

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
    "ko": "채팅 지우기"
  },
  {
    "key": "aiAssistant.collapseLabel",
    "en": "Minimize",
    "ko": "최소화"
  },
  {
    "key": "aiAssistant.collapseTitle",
    "en": "Minimize Sidaopu",
    "ko": "스다오푸 최소화"
  },
  {
    "key": "aiAssistant.dragHint",
    "en": "· Drag header to move",
    "ko": "· 헤더를 드래그해 이동"
  },
  {
    "key": "aiAssistant.emptyHint",
    "en": "Describe genre, tone, characters, or tropes in 中文 / English / Español. Try “more like this”, “free only”, etc.",
    "ko": "장르, 톤, 캐릭터, 취향 키워드를 中文 / English / Español로 입력해도 됩니다. \"이런 느낌 더\", \"무료만\" 같은 요청도 가능합니다."
  },
  {
    "key": "aiAssistant.expandLabel",
    "en": "Sidaopu",
    "ko": "스다오푸"
  },
  {
    "key": "aiAssistant.expandTitle",
    "en": "Expand Sidaopu (draggable)",
    "ko": "스다오푸 펼치기(드래그 가능)"
  },
  {
    "key": "aiAssistant.genericErrorReply",
    "en": "Service message",
    "ko": "서비스 메시지"
  },
  {
    "key": "aiAssistant.loading",
    "en": "Thinking…",
    "ko": "생각 중…"
  },
  {
    "key": "aiAssistant.localeAckEn",
    "en": "Thanks! I’ve switched the site to **English**. —Sidaopu\n\nAsk me for library picks whenever you like (genre, mood, free vs paid, and so on).",
    "ko": "알겠습니다. 이제부터 영어로 도와드릴게요. 선호 장르나 분위기를 알려주세요."
  },
  {
    "key": "aiAssistant.localeAckGeneric",
    "en": "Thanks! I’ve set the site interface for **{locale}**. —Sidaopu\n\nAsk me for library picks whenever you like (genre, mood, free vs paid, and so on).",
    "ko": "알겠습니다. 이제부터 이 언어로 안내할게요. 읽고 싶은 내용을 그대로 입력해 주세요."
  },
  {
    "key": "aiAssistant.localeAckZhCn",
    "en": "Great, I switched the site to **Simplified Chinese**. —Sidaopu\n\nTell me your preferred genre or vibe and I’ll recommend books from the library.",
    "ko": "好的，接下来我会用中文为你服务。你可以直接告诉我想看的题材、风格或关键词。"
  },
  {
    "key": "aiAssistant.networkError",
    "en": "Network error. Check your connection.",
    "ko": "네트워크 오류입니다. 연결 상태를 확인하세요."
  },
  {
    "key": "aiAssistant.networkErrorReply",
    "en": "I couldn’t reach the AI service. Please try again later.",
    "ko": "네트워크에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요."
  },
  {
    "key": "aiAssistant.placeholder",
    "en": "What would you like to read?",
    "ko": "어떤 작품을 읽고 싶나요?"
  },
  {
    "key": "aiAssistant.rateLimit",
    "en": "Too many requests. Try again shortly.",
    "ko": "요청이 너무 많습니다. 잠시 후 다시 시도하세요."
  },
  {
    "key": "aiAssistant.send",
    "en": "Send",
    "ko": "보내기"
  },
  {
    "key": "aiAssistant.subtitle",
    "en": "Sidaopu only suggests works from our public library; paid books include trial/unlock notes, free books are labeled. Does not read your wallet or reading history.",
    "ko": "대화형으로 도서 추천, 읽기 가이드, 구독 정보를 안내합니다."
  },
  {
    "key": "aiAssistant.title",
    "en": "Sidaopu",
    "ko": "스다오푸"
  },
  {
    "key": "comments.delete",
    "en": "Delete",
    "ko": "삭제"
  },
  {
    "key": "comments.deleteFailed",
    "en": "Failed to delete comment",
    "ko": "댓글 삭제에 실패했습니다"
  },
  {
    "key": "comments.needWallet",
    "en": "Please connect wallet first",
    "ko": "먼저 지갑을 연결하세요"
  },
  {
    "key": "landing.connectWallet",
    "en": "Connect wallet · MetaMask",
    "ko": "지갑 연결 · MetaMask"
  },
  {
    "key": "landing.privacy",
    "en": "Privacy Policy",
    "ko": "개인정보처리방침"
  },
  {
    "key": "landing.terms",
    "en": "Terms of Service",
    "ko": "이용약관"
  },
  {
    "key": "settings.billingActive",
    "en": "Your subscription is active.",
    "ko": "구독이 활성 상태입니다."
  },
  {
    "key": "settings.billingBlurb",
    "en": "Subscribe with a card after signing in. Payments are processed by Stripe Checkout; webhook events sync your VIP window to the same `.data/billing/members` record used for admin grants.",
    "ko": "로그인 후 카드로 구독할 수 있습니다. 결제는 Stripe Checkout에서 처리되며, webhook 이벤트가 VIP 기간을 관리자 지급과 동일한 `.data/billing/members` 레코드에 동기화합니다."
  },
  {
    "key": "settings.billingBusy",
    "en": "Redirecting to Stripe…",
    "ko": "Stripe로 이동 중…"
  },
  {
    "key": "settings.billingCancelHint",
    "en": "Checkout was closed before completion. You were not charged.",
    "ko": "결제 완료 전에 Checkout이 닫혔습니다. 요금은 청구되지 않았습니다."
  },
  {
    "key": "settings.billingInactive",
    "en": "No active subscription detected for this account. Start checkout to unlock author-side AI features.",
    "ko": "이 계정에 활성 구독이 없습니다. Checkout을 시작하면 작가용 AI 기능을 사용할 수 있습니다."
  },
  {
    "key": "settings.billingLoading",
    "en": "Checking subscription…",
    "ko": "구독 상태 확인 중…"
  },
  {
    "key": "settings.billingPeriodEnd",
    "en": "Current period ends:",
    "ko": "현재 이용 기간 종료:"
  },
  {
    "key": "settings.billingSignInFirst",
    "en": "Sign in (email or wallet) to manage billing.",
    "ko": "결제를 관리하려면 로그인(이메일 또는 지갑)하세요."
  },
  {
    "key": "settings.billingSubscribe",
    "en": "Subscribe with Stripe Checkout",
    "ko": "Stripe Checkout으로 구독"
  },
  {
    "key": "settings.billingSuccess",
    "en": "Payment recorded. Your membership will update in a few seconds after Stripe sends the webhook.",
    "ko": "결제가 기록되었습니다. Stripe webhook 수신 후 몇 초 내에 멤버십 상태가 갱신됩니다."
  },
  {
    "key": "settings.billingTitle",
    "en": "Author AI subscription (Stripe)",
    "ko": "작가용 AI 구독(Stripe)"
  },
  {
    "key": "wallet.connect",
    "en": "Connect wallet",
    "ko": "지갑 연결"
  },
  {
    "key": "wallet.connectedLine",
    "en": "Connected · 0x…{tail}",
    "ko": "연결됨 · 0x…{tail}"
  },
  {
    "key": "wallet.connectedShort",
    "en": "Connected",
    "ko": "연결됨"
  },
  {
    "key": "wallet.connecting",
    "en": "Connecting…",
    "ko": "연결 중…"
  },
  {
    "key": "wallet.disconnect",
    "en": "Disconnect",
    "ko": "연결 해제"
  },
  {
    "key": "wallet.disconnecting",
    "en": "Disconnecting…",
    "ko": "연결 해제 중…"
  },
  {
    "key": "wallet.emailLine",
    "en": "Email · {email}",
    "ko": "이메일 · {email}"
  },
  {
    "key": "wallet.emailLogout",
    "en": "Sign out",
    "ko": "로그아웃"
  },
  {
    "key": "wallet.guideAria",
    "en": "MetaMask setup guide",
    "ko": "MetaMask 설정 가이드"
  },
  {
    "key": "wallet.guideOk",
    "en": "Got it",
    "ko": "확인"
  },
  {
    "key": "wallet.guideStep1",
    "en": "Use Chrome or Firefox.",
    "ko": "Chrome 또는 Firefox를 사용하세요."
  },
  {
    "key": "wallet.guideStep2Prefix",
    "en": "Open the official download page:",
    "ko": "공식 다운로드 페이지 열기:"
  },
  {
    "key": "wallet.guideStep3",
    "en": "After installing the extension, restart the browser and refresh.",
    "ko": "확장 프로그램 설치 후 브라우저를 재시작하고 페이지를 새로고침하세요."
  },
  {
    "key": "wallet.guideStep4",
    "en": "Click “Connect wallet” and approve in MetaMask.",
    "ko": "\"지갑 연결\"을 클릭하고 MetaMask 팝업에서 승인하세요."
  },
  {
    "key": "wallet.guideTitle",
    "en": "Connection failed: install MetaMask",
    "ko": "연결 실패: MetaMask를 설치하세요"
  },
  {
    "key": "workspace.aiChatClearAllThreads",
    "en": "Delete all chats",
    "ko": "모든 채팅 삭제"
  },
  {
    "key": "workspace.aiChatClearInput",
    "en": "Clear",
    "ko": "지우기"
  },
  {
    "key": "workspace.aiChatConfirmClearAll",
    "en": "Delete all saved chats on this device? This cannot be undone.",
    "ko": "이 기기에 저장된 모든 채팅을 삭제할까요? 이 작업은 되돌릴 수 없습니다."
  },
  {
    "key": "workspace.aiChatConfirmDeleteThread",
    "en": "Delete this chat and its messages? This cannot be undone.",
    "ko": "이 채팅과 메시지를 삭제할까요? 이 작업은 되돌릴 수 없습니다."
  },
  {
    "key": "workspace.aiChatCorruptClearCta",
    "en": "Delete broken backup and resume saving",
    "ko": "손상된 백업을 삭제하고 저장 재개"
  },
  {
    "key": "workspace.aiChatDeleteThread",
    "en": "Delete this chat",
    "ko": "이 채팅 삭제"
  },
  {
    "key": "workspace.authAnd",
    "en": "and",
    "ko": "및"
  },
  {
    "key": "workspace.authPrivacyLink",
    "en": "Privacy Policy",
    "ko": "개인정보처리방침"
  },
  {
    "key": "workspace.authTermsLink",
    "en": "Terms of Service",
    "ko": "이용약관"
  },
  {
    "key": "workspace.authTermsPrefix",
    "en": "By continuing, you agree to the",
    "ko": "계속하면 다음에 동의하는 것으로 간주됩니다:"
  },
  {
    "key": "workspace.chapterCast.currentChapterAria",
    "en": "Current chapter",
    "ko": "현재 챕터"
  },
  {
    "key": "workspace.chapterCast.extractAllChapterExtractError",
    "en": "Chapter {index} ({title}): {error}",
    "ko": "{index}장({title}): {error}"
  },
  {
    "key": "workspace.chapterCast.extractAllChapterLoadError",
    "en": "Chapter {index}: {error}",
    "ko": "{index}장: {error}"
  },
  {
    "key": "workspace.chapterCast.needWalletAndChapter",
    "en": "Please connect wallet and select a chapter first.",
    "ko": "먼저 지갑을 연결하고 챕터를 선택하세요."
  },
  {
    "key": "workspace.chapterCast.needWalletAndStructure",
    "en": "Please connect wallet and ensure this work has chapter nodes.",
    "ko": "먼저 지갑을 연결하고 이 작품에 챕터 노드가 있는지 확인하세요."
  },
  {
    "key": "workspace.chapterCast.subscriptionRequired",
    "en": "A paid membership is required to use this AI feature.",
    "ko": "이 AI 기능을 사용하려면 유료 멤버십이 필요합니다."
  },
  {
    "key": "workspace.chapterCastPanel.delete",
    "en": "Delete character file",
    "ko": "인물 파일 삭제"
  },
  {
    "key": "workspace.chapterCastPanel.deleteConfirm",
    "en": "Delete character file \"{name}\"?\nThis cannot be undone.",
    "ko": "인물 파일 \"{name}\"을(를) 삭제할까요?\n이 작업은 되돌릴 수 없습니다."
  },
  {
    "key": "workspace.chapterCastPanel.deleteFailed",
    "en": "Delete failed",
    "ko": "삭제에 실패했습니다"
  },
  {
    "key": "workspace.chapterCastPanel.subscriptionRequiredDelete",
    "en": "Paid membership required to delete.",
    "ko": "삭제하려면 유료 멤버십이 필요합니다."
  },
  {
    "key": "workspace.chapterCastPanel.subscriptionRequiredSave",
    "en": "Paid membership required to save.",
    "ko": "저장하려면 유료 멤버십이 필요합니다."
  },
  {
    "key": "workspace.chapterOutline.needWallet",
    "en": "Please connect wallet first",
    "ko": "먼저 지갑을 연결하세요"
  },
  {
    "key": "workspace.characterArc.ageLabel",
    "en": "Age / birth year",
    "ko": "나이 / 출생연도 등"
  },
  {
    "key": "workspace.characterArc.ageLabelSimple",
    "en": "Age",
    "ko": "나이"
  },
  {
    "key": "workspace.characterArc.appearanceLabel",
    "en": "Appearance",
    "ko": "외형"
  },
  {
    "key": "workspace.characterArc.appearanceSimple",
    "en": "Appearance",
    "ko": "외형"
  },
  {
    "key": "workspace.characterArc.birthLabel",
    "en": "Birth / background",
    "ko": "출생 / 배경"
  },
  {
    "key": "workspace.characterArc.castWideView",
    "en": "Character wide view",
    "ko": "인물 와이드 보기"
  },
  {
    "key": "workspace.characterArc.chapterTitle",
    "en": "Chapter {index}",
    "ko": "{index}장"
  },
  {
    "key": "workspace.characterArc.combatLabel",
    "en": "Combat power",
    "ko": "전투력"
  },
  {
    "key": "workspace.characterArc.connectHint",
    "en": "Connect wallet to load cross-chapter profile and chapter JSON snapshots.",
    "ko": "지갑을 연결하면 챕터 간 아카이브와 각 챕터 JSON 스냅샷을 불러올 수 있습니다."
  },
  {
    "key": "workspace.characterArc.constantSectionHint",
    "en": "Stable cross-chapter facts such as name, background, and appearance; edit alongside variables and chapter JSON below.",
    "ko": "이름, 배경, 외형처럼 챕터를 넘어 안정적인 정보입니다. 오른쪽 변수 및 아래 챕터 JSON과 대조해 편집합니다."
  },
  {
    "key": "workspace.characterArc.constantSectionTitle",
    "en": "Constants",
    "ko": "정설(상수)"
  },
  {
    "key": "workspace.characterArc.constantsSubTitle",
    "en": "Constants (rarely change)",
    "ko": "상수(거의 변하지 않음)"
  },
  {
    "key": "workspace.characterArc.customConstantsHint",
    "en": "For example: blood type, birthplace, race... A row is saved only when field name is filled.",
    "ko": "예: 혈액형, 출신지, 종족… 필드명이 있어야 해당 행이 저장됩니다."
  },
  {
    "key": "workspace.characterArc.customConstantsTitle",
    "en": "Custom constant fields",
    "ko": "사용자 정의 상수 항목"
  },
  {
    "key": "workspace.characterArc.customRows.addRow",
    "en": "+ Add row",
    "ko": "+ 행 추가"
  },
  {
    "key": "workspace.characterArc.customRows.content",
    "en": "Content",
    "ko": "내용"
  },
  {
    "key": "workspace.characterArc.customRows.delete",
    "en": "Delete",
    "ko": "삭제"
  },
  {
    "key": "workspace.characterArc.customRows.fieldName",
    "en": "Field name",
    "ko": "필드명"
  },
  {
    "key": "workspace.characterArc.customVariablesHint",
    "en": "For example: mental state, relationship web, carried items... A row is saved only when field name is filled.",
    "ko": "예: 정신 상태, 관계망, 소지 아이템… 필드명이 있어야 해당 행이 저장됩니다."
  },
  {
    "key": "workspace.characterArc.customVariablesTitle",
    "en": "Custom variable fields",
    "ko": "사용자 정의 변수 항목"
  },
  {
    "key": "workspace.characterArc.deathIdLabel",
    "en": "Departure/death chapter id",
    "ko": "퇴장 / 사망 챕터 id"
  },
  {
    "key": "workspace.characterArc.deathIndexLabel",
    "en": "Departure chapter index",
    "ko": "퇴장 챕터 번호"
  },
  {
    "key": "workspace.characterArc.deceasedHint",
    "en": "A departure chapter is set in the master profile (chapter id or chapter index), so this page is shown in muted grayscale.",
    "ko": "마스터 프로필에 퇴장 챕터(챕터 id 또는 번호)가 설정되어 있어, 이 페이지는 옅은 회색 톤으로 표시됩니다."
  },
  {
    "key": "workspace.characterArc.editorHome",
    "en": "Editor",
    "ko": "에디터"
  },
  {
    "key": "workspace.characterArc.fillFromFirst",
    "en": "Fill blanks from first chapter snapshot",
    "ko": "첫 챕터 스냅샷으로 빈칸 채우기"
  },
  {
    "key": "workspace.characterArc.fillFromFirstHint",
    "en": "If gender/age/appearance/personality/location is empty in master profile, use \"Fill blanks from first chapter snapshot\" to copy from the earliest timeline chapter; existing values are not overwritten.",
    "ko": "마스터의 성별/나이/외형/성격/위치가 비어 있으면 \"첫 챕터 스냅샷으로 빈칸 채우기\"로 타임라인 최소 챕터 값을 복사할 수 있으며, 기존 값은 덮어쓰지 않습니다."
  },
  {
    "key": "workspace.characterArc.fillFromFirstTitle",
    "en": "Take the earliest chapter by index and only fill still-empty master fields (age/appearance/personality/location).",
    "ko": "챕터 번호가 가장 작은 챕터에서 마스터의 빈 항목(나이/외형/성격/위치)만 채웁니다"
  },
  {
    "key": "workspace.characterArc.firstSeenIdLabel",
    "en": "First appearance (chapter id)",
    "ko": "첫 등장(챕터 id)"
  },
  {
    "key": "workspace.characterArc.firstSeenIndexLabel",
    "en": "First appearance (chapter index)",
    "ko": "첫 등장(챕터 번호)"
  },
  {
    "key": "workspace.characterArc.fullFields",
    "en": "Full fields for this chapter",
    "ko": "이 챕터 전체 필드"
  },
  {
    "key": "workspace.characterArc.genderLabel",
    "en": "Gender",
    "ko": "성별"
  },
  {
    "key": "workspace.characterArc.loadFailed",
    "en": "Load failed",
    "ko": "불러오기 실패"
  },
  {
    "key": "workspace.characterArc.loading",
    "en": "Loading…",
    "ko": "불러오는 중…"
  },
  {
    "key": "workspace.characterArc.locationLabel",
    "en": "Location",
    "ko": "위치"
  },
  {
    "key": "workspace.characterArc.locationSimple",
    "en": "Location",
    "ko": "장소"
  },
  {
    "key": "workspace.characterArc.luckLabel",
    "en": "Luck",
    "ko": "행운"
  },
  {
    "key": "workspace.characterArc.masterVariablesTitle",
    "en": "Master variables",
    "ko": "마스터 변수"
  },
  {
    "key": "workspace.characterArc.nameLabel",
    "en": "Name",
    "ko": "이름"
  },
  {
    "key": "workspace.characterArc.noPresence",
    "en": "No presence field in this chapter.",
    "ko": "이 챕터에는 presence가 입력되지 않았습니다."
  },
  {
    "key": "workspace.characterArc.notesLabel",
    "en": "Master notes",
    "ko": "마스터 메모"
  },
  {
    "key": "workspace.characterArc.notesSimple",
    "en": "Notes",
    "ko": "메모"
  },
  {
    "key": "workspace.characterArc.openInWideView",
    "en": "Open in wide view",
    "ko": "와이드 보기에서 열기"
  },
  {
    "key": "workspace.characterArc.outcomeLabel",
    "en": "Ending / long-arc notes",
    "ko": "결말 / 장기 설명"
  },
  {
    "key": "workspace.characterArc.pageBadge",
    "en": "Cross-chapter character archive",
    "ko": "인물 챕터 간 아카이브"
  },
  {
    "key": "workspace.characterArc.personalityLabel",
    "en": "Personality",
    "ko": "성격"
  },
  {
    "key": "workspace.characterArc.personalitySimple",
    "en": "Personality",
    "ko": "성격"
  },
  {
    "key": "workspace.characterArc.plotSectionHint",
    "en": "First appearance, departure, and ending notes; independent from per-chapter extracted JSON.",
    "ko": "첫 등장, 퇴장, 결말 설명입니다. 각 챕터 추출 JSON과는 독립적입니다."
  },
  {
    "key": "workspace.characterArc.plotSectionTitle",
    "en": "Plot line",
    "ko": "플롯 라인"
  },
  {
    "key": "workspace.characterArc.presenceTitle",
    "en": "Presence / screen time",
    "ko": "등장 / 비중(presence)"
  },
  {
    "key": "workspace.characterArc.saveFailed",
    "en": "Save failed",
    "ko": "저장 실패"
  },
  {
    "key": "workspace.characterArc.saveMaster",
    "en": "Save master profile",
    "ko": "마스터 저장"
  },
  {
    "key": "workspace.characterArc.saved",
    "en": "Character master profile saved",
    "ko": "인물 마스터 프로필이 저장되었습니다"
  },
  {
    "key": "workspace.characterArc.saving",
    "en": "Saving…",
    "ko": "저장 중…"
  },
  {
    "key": "workspace.characterArc.skillsLabel",
    "en": "Skills",
    "ko": "스킬"
  },
  {
    "key": "workspace.characterArc.slugLabel",
    "en": "Pinyin slug (file naming)",
    "ko": "병음 slug(파일명 규칙용)"
  },
  {
    "key": "workspace.characterArc.snapshot.currentChapter",
    "en": "Chapter: ",
    "ko": "현재 챕터:"
  },
  {
    "key": "workspace.characterArc.snapshot.diffTitle",
    "en": "Compared with master variables (shown only when different or chapter-only)",
    "ko": "마스터 변수 비교(차이 또는 챕터 단독 항목만 표시)"
  },
  {
    "key": "workspace.characterArc.snapshot.emptyValue",
    "en": "(empty)",
    "ko": "(비어 있음)"
  },
  {
    "key": "workspace.characterArc.snapshot.location",
    "en": "Location",
    "ko": "장소"
  },
  {
    "key": "workspace.characterArc.snapshot.masterVariable",
    "en": "Master variable: ",
    "ko": "마스터 변수:"
  },
  {
    "key": "workspace.characterArc.snapshot.onlyInChapter",
    "en": "{label} (exists in chapter, empty in master variable)",
    "ko": "{label}(현재 챕터에는 있으나 마스터 변수는 비어 있음)"
  },
  {
    "key": "workspace.characterArc.snapshot.personality",
    "en": "Personality",
    "ko": "성격"
  },
  {
    "key": "workspace.characterArc.stableIdReadonly",
    "en": "stableId (read-only)",
    "ko": "stableId(읽기 전용)"
  },
  {
    "key": "workspace.characterArc.subscriptionRequired",
    "en": "A paid membership is required to save.",
    "ko": "저장하려면 유료 멤버십이 필요합니다."
  },
  {
    "key": "workspace.characterArc.timelineEmpty",
    "en": "No matching chapter JSON found. Please confirm stableId matches chapter character JSON.",
    "ko": "일치하는 챕터 JSON이 없습니다. stableId가 각 챕터 인물 JSON과 일치하는지 확인하세요."
  },
  {
    "key": "workspace.characterArc.timelineSectionTitle",
    "en": "Per-chapter snapshots (latest extracted version)",
    "ko": "각 챕터 스냅샷(최신 추출 버전)"
  },
  {
    "key": "workspace.characterArc.variableSectionHint",
    "en": "Personality, skills, and location can change by chapter; chapter cards compare against this baseline.",
    "ko": "성격, 스킬, 위치 등은 챕터마다 변할 수 있으며 각 챕터 카드가 이 값과 비교해 차이를 표시합니다."
  },
  {
    "key": "workspace.characterArc.variableSectionTitle",
    "en": "Variables (change with plot)",
    "ko": "변수(스토리에 따라 변화)"
  },
  {
    "key": "workspace.connectWallet",
    "en": "Connect wallet",
    "ko": "지갑 연결"
  },
  {
    "key": "workspace.connectWalletMetaMask",
    "en": "Connect MetaMask",
    "ko": "MetaMask 연결"
  },
  {
    "key": "workspace.emailAuthBlurb",
    "en": "No browser wallet needed — register once, then sign in on this device.",
    "ko": "브라우저 지갑 없이도 됩니다. 한 번 가입하면 이 기기에서 로그인할 수 있습니다."
  },
  {
    "key": "workspace.emailAuthBusy",
    "en": "Please wait…",
    "ko": "잠시만 기다려 주세요…"
  },
  {
    "key": "workspace.emailAuthError",
    "en": "Request failed",
    "ko": "요청 실패"
  },
  {
    "key": "workspace.emailAuthMissingAuthorId",
    "en": "Signed in but server did not return an account id. Please try again or contact support.",
    "ko": "로그인은 완료됐지만 서버에서 계정 ID를 반환하지 않았습니다. 다시 시도하거나 지원팀에 문의하세요."
  },
  {
    "key": "workspace.emailAuthNetworkError",
    "en": "Network error",
    "ko": "네트워크 오류"
  },
  {
    "key": "workspace.emailLabel",
    "en": "Email",
    "ko": "이메일"
  },
  {
    "key": "workspace.emailLogin",
    "en": "Sign in",
    "ko": "로그인"
  },
  {
    "key": "workspace.emailLoginSubmit",
    "en": "Sign in",
    "ko": "로그인"
  },
  {
    "key": "workspace.emailRegister",
    "en": "Register",
    "ko": "회원가입"
  },
  {
    "key": "workspace.emailRegisterSubmit",
    "en": "Create account",
    "ko": "계정 만들기"
  },
  {
    "key": "workspace.gateTabEmail",
    "en": "Email & password",
    "ko": "이메일 & 비밀번호"
  },
  {
    "key": "workspace.gateTabWallet",
    "en": "MetaMask",
    "ko": "MetaMask(지갑)"
  },
  {
    "key": "workspace.outlineSidebar.addChapter",
    "en": "+ Add chapter",
    "ko": "+ 챕터 추가"
  },
  {
    "key": "workspace.outlineSidebar.addChapterTitle",
    "en": "New chapter is added under selected volume/section; if chapter is selected, under that chapter's parent",
    "ko": "새 챕터는 선택한 권/절 아래에 추가됩니다. 챕터 선택 시 해당 챕터의 부모 아래에 추가됩니다"
  },
  {
    "key": "workspace.outlineSidebar.addSection",
    "en": "+ Add section",
    "ko": "+ 절 추가"
  },
  {
    "key": "workspace.outlineSidebar.addSectionMissingParent",
    "en": "Cannot add section: parent node not found.",
    "ko": "절을 추가할 수 없습니다: 부모 노드를 찾지 못했습니다."
  },
  {
    "key": "workspace.outlineSidebar.addSectionNoParent",
    "en": "Cannot add section: no attachable volume or section.",
    "ko": "절을 추가할 수 없습니다: 연결 가능한 권 또는 절이 없습니다."
  },
  {
    "key": "workspace.outlineSidebar.addSectionTitle",
    "en": "Add under selected volume/section or selected chapter's parent; creates volume if missing",
    "ko": "선택한 권/절 또는 챕터 부모 아래에 추가합니다. 권이 없으면 자동 생성합니다"
  },
  {
    "key": "workspace.outlineSidebar.addVolume",
    "en": "+ Add volume",
    "ko": "+ 권 추가"
  },
  {
    "key": "workspace.outlineSidebar.addVolumeTitle",
    "en": "Add a volume to root",
    "ko": "루트 끝에 권 추가"
  },
  {
    "key": "workspace.outlineSidebar.chapterExists",
    "en": "{title} already exists.",
    "ko": "{title} 이(가) 이미 존재합니다."
  },
  {
    "key": "workspace.outlineSidebar.chapterOutline",
    "en": "Chapter outline",
    "ko": "이 챕터 개요"
  },
  {
    "key": "workspace.outlineSidebar.chapterOutlineTitle",
    "en": "Edit chapter outline (extract or upload)",
    "ko": "이 챕터 개요 편집 (추출 또는 업로드 가능)"
  },
  {
    "key": "workspace.outlineSidebar.chapterPublishDisabledHint",
    "en": "Set the whole work to public before per-chapter publishing.",
    "ko": "챕터별 게시 전에 작품 전체를 공개로 설정하세요."
  },
  {
    "key": "workspace.outlineSidebar.chapterWordCount",
    "en": "Chapter {index} · about {count} chars",
    "ko": "{index}장 · 약 {count}자"
  },
  {
    "key": "workspace.outlineSidebar.deleteNotSaved",
    "en": "Delete failed; changes were not saved.",
    "ko": "삭제 실패, 변경사항이 저장되지 않았습니다."
  },
  {
    "key": "workspace.outlineSidebar.deleteOutline",
    "en": "Delete volume/chapter/section",
    "ko": "권/챕터/절 삭제"
  },
  {
    "key": "workspace.outlineSidebar.deleteOutlineTitle",
    "en": "Delete selected volume/section (children are promoted) or chapter (including content)",
    "ko": "선택한 권/절 삭제(하위 노드 승격) 또는 챕터 삭제(본문 포함)"
  },
  {
    "key": "workspace.outlineSidebar.deleteSaved",
    "en": "Deleted successfully and saved to cloud.",
    "ko": "삭제가 완료되었고 클라우드에 저장되었습니다."
  },
  {
    "key": "workspace.outlineSidebar.deleteSectionConfirm",
    "en": "Delete section \"{label}\"? Its child nodes will be promoted one level and body content will stay.",
    "ko": "절 \"{label}\"을 삭제할까요? 하위 노드는 한 단계 위로 승격되고 본문은 삭제되지 않습니다."
  },
  {
    "key": "workspace.outlineSidebar.deleteVolumeConfirm",
    "en": "Delete volume \"{label}\"? Its chapters/sections will be promoted one level and body content will stay.",
    "ko": "권 \"{label}\"을 삭제할까요? 하위 챕터/절은 한 단계 위로 승격되고 본문은 삭제되지 않습니다."
  },
  {
    "key": "workspace.outlineSidebar.dragSortAria",
    "en": "Drag to sort",
    "ko": "드래그하여 정렬"
  },
  {
    "key": "workspace.outlineSidebar.empty",
    "en": "No outline nodes yet",
    "ko": "개요 노드가 없습니다"
  },
  {
    "key": "workspace.outlineSidebar.processing",
    "en": "Processing…",
    "ko": "처리 중…"
  },
  {
    "key": "workspace.outlineSidebar.publish",
    "en": "Publish",
    "ko": "게시"
  },
  {
    "key": "workspace.outlineSidebar.publishAll",
    "en": "Publish all chapters",
    "ko": "전체 챕터 일괄 게시"
  },
  {
    "key": "workspace.outlineSidebar.publishAllDisabledHint",
    "en": "Please publish the work and ensure it has chapters first.",
    "ko": "먼저 작품을 공개하고 챕터가 있는지 확인하세요."
  },
  {
    "key": "workspace.outlineSidebar.publishAllTitle",
    "en": "Mark all current chapters as published",
    "ko": "현재 모든 챕터를 게시됨으로 표시"
  },
  {
    "key": "workspace.outlineSidebar.publishChapter",
    "en": "Publish chapter",
    "ko": "이 챕터 게시"
  },
  {
    "key": "workspace.outlineSidebar.publishStatus",
    "en": "Publish status · {status}",
    "ko": "게시 상태 · {status}"
  },
  {
    "key": "workspace.outlineSidebar.published",
    "en": "Published",
    "ko": "게시됨"
  },
  {
    "key": "workspace.outlineSidebar.removeTagAria",
    "en": "Remove {tag}",
    "ko": "{tag} 제거"
  },
  {
    "key": "workspace.outlineSidebar.seekNode",
    "en": "Locate",
    "ko": "이동"
  },
  {
    "key": "workspace.outlineSidebar.seekNodeTitle",
    "en": "Scroll editor to this node's position",
    "ko": "에디터를 이 노드 위치로 스크롤"
  },
  {
    "key": "workspace.outlineSidebar.summaryPlaceholder",
    "en": "Summary",
    "ko": "요약"
  },
  {
    "key": "workspace.outlineSidebar.tagPlaceholder",
    "en": "Tag (press Enter to add, e.g. Climax)",
    "ko": "태그 (Enter로 추가, 예: 클라이맥스)"
  },
  {
    "key": "workspace.outlineSidebar.title",
    "en": "Story outline",
    "ko": "스토리 개요"
  },
  {
    "key": "workspace.outlineSidebar.titlePlaceholder",
    "en": "Title",
    "ko": "제목"
  },
  {
    "key": "workspace.outlineSidebar.unpublishChapter",
    "en": "Unpublish chapter",
    "ko": "이 챕터 게시 철회"
  },
  {
    "key": "workspace.outlineSidebar.unpublished",
    "en": "Unpublished",
    "ko": "미게시"
  },
  {
    "key": "workspace.outlineSidebar.untitledSection",
    "en": "Untitled section",
    "ko": "제목 없는 절"
  },
  {
    "key": "workspace.outlineSidebar.untitledVolume",
    "en": "Untitled volume",
    "ko": "제목 없는 권"
  },
  {
    "key": "workspace.outlineSidebar.updatedDirty",
    "en": "Updated",
    "ko": "업데이트됨"
  },
  {
    "key": "workspace.outlineSidebar.withdraw",
    "en": "Withdraw",
    "ko": "철회"
  },
  {
    "key": "workspace.outlineSidebar.withdrawDisabledTitle",
    "en": "Cannot withdraw while paid-serial mode or non-public state is active",
    "ko": "유료 연재 중이거나 비공개 상태에서는 여기서 철회할 수 없습니다"
  },
  {
    "key": "workspace.outlineSidebar.withdrawPublish",
    "en": "Withdraw publish",
    "ko": "게시 철회"
  },
  {
    "key": "workspace.outlineSidebar.withdrawTitle",
    "en": "Withdraw public access and return to private draft",
    "ko": "공개를 철회하고 나만 보기로 전환"
  },
  {
    "key": "workspace.passwordLabel",
    "en": "Password (8+ characters)",
    "ko": "비밀번호(8자 이상)"
  },
  {
    "key": "workspace.personaDetail.addToward",
    "en": "+ Add stance target",
    "ko": "+ 입장 대상 추가"
  },
  {
    "key": "workspace.personaDetail.attitude.ambivalent",
    "en": "Ambivalent",
    "ko": "양가"
  },
  {
    "key": "workspace.personaDetail.attitude.neutral",
    "en": "Neutral",
    "ko": "중립"
  },
  {
    "key": "workspace.personaDetail.attitude.oppose",
    "en": "Oppose",
    "ko": "반대"
  },
  {
    "key": "workspace.personaDetail.attitude.support",
    "en": "Support",
    "ko": "지지"
  },
  {
    "key": "workspace.personaDetail.attitude.unknown",
    "en": "Unknown",
    "ko": "알 수 없음"
  },
  {
    "key": "workspace.personaDetail.basicTitle",
    "en": "Basic info",
    "ko": "기본 정보"
  },
  {
    "key": "workspace.personaDetail.bioLabel",
    "en": "Character summary",
    "ko": "캐릭터 요약"
  },
  {
    "key": "workspace.personaDetail.conflictDescLabel",
    "en": "Description",
    "ko": "설명"
  },
  {
    "key": "workspace.personaDetail.conflictTitle",
    "en": "Current conflict",
    "ko": "현재 갈등"
  },
  {
    "key": "workspace.personaDetail.conflictType.environmental",
    "en": "Environmental",
    "ko": "환경"
  },
  {
    "key": "workspace.personaDetail.conflictType.internal",
    "en": "Internal",
    "ko": "내적"
  },
  {
    "key": "workspace.personaDetail.conflictType.interpersonal",
    "en": "Interpersonal",
    "ko": "대인"
  },
  {
    "key": "workspace.personaDetail.conflictType.societal",
    "en": "Societal",
    "ko": "사회"
  },
  {
    "key": "workspace.personaDetail.conflictType.systemic",
    "en": "Systemic",
    "ko": "체계"
  },
  {
    "key": "workspace.personaDetail.conflictTypeLabel",
    "en": "Type",
    "ko": "유형"
  },
  {
    "key": "workspace.personaDetail.delete",
    "en": "Delete",
    "ko": "삭제"
  },
  {
    "key": "workspace.personaDetail.emptyPrefix",
    "en": "Select a character on the left to view and edit stance · motivation · conflict (schema:",
    "ko": "왼쪽에서 캐릭터를 선택하면 입장 · 동기 · 갈등을 확인하고 편집할 수 있습니다(스키마:"
  },
  {
    "key": "workspace.personaDetail.escalationHookLabel",
    "en": "Escalation hook",
    "ko": "격화 훅"
  },
  {
    "key": "workspace.personaDetail.goalLabel",
    "en": "Goal",
    "ko": "목표"
  },
  {
    "key": "workspace.personaDetail.intensityLabel",
    "en": "Intensity 0-1",
    "ko": "강도 0-1"
  },
  {
    "key": "workspace.personaDetail.internalNeedLabel",
    "en": "Internal need",
    "ko": "내적 욕구"
  },
  {
    "key": "workspace.personaDetail.misbeliefLabel",
    "en": "Misbelief",
    "ko": "오신념"
  },
  {
    "key": "workspace.personaDetail.motivationTitle",
    "en": "Motivation",
    "ko": "동기"
  },
  {
    "key": "workspace.personaDetail.nameLabel",
    "en": "Name",
    "ko": "이름"
  },
  {
    "key": "workspace.personaDetail.opposingForceLabel",
    "en": "Opposing force",
    "ko": "대립 세력"
  },
  {
    "key": "workspace.personaDetail.opposingForceText",
    "en": "Opposing force: {force}",
    "ko": "대립 세력: {force}"
  },
  {
    "key": "workspace.personaDetail.roleLabel",
    "en": "Role label",
    "ko": "역할 라벨"
  },
  {
    "key": "workspace.personaDetail.rolePlaceholder",
    "en": "e.g. Protagonist / Historian",
    "ko": "예: 주인공 / 사관"
  },
  {
    "key": "workspace.personaDetail.stakesLabel",
    "en": "Stakes",
    "ko": "이익/손실"
  },
  {
    "key": "workspace.personaDetail.stakesShortLabel",
    "en": "Stakes",
    "ko": "이익/손실"
  },
  {
    "key": "workspace.personaDetail.stanceRadarLabel",
    "en": "Stance intensity sketch (relative values)",
    "ko": "입장 강도 표시(상대값)"
  },
  {
    "key": "workspace.personaDetail.stanceSummaryLabel",
    "en": "Stance summary",
    "ko": "입장 요약"
  },
  {
    "key": "workspace.personaDetail.stanceTitle",
    "en": "Stance",
    "ko": "입장"
  },
  {
    "key": "workspace.personaDetail.stanceTowardLabel",
    "en": "Stance targets (subject and attitude)",
    "ko": "입장 대상(대상과 태도)"
  },
  {
    "key": "workspace.personaDetail.targetPlaceholder",
    "en": "Target / topic",
    "ko": "대상 / 주제"
  },
  {
    "key": "workspace.personaDetail.visibility.deceptive",
    "en": "Deceptive",
    "ko": "기만"
  },
  {
    "key": "workspace.personaDetail.visibility.hidden",
    "en": "Hidden",
    "ko": "숨김"
  },
  {
    "key": "workspace.personaDetail.visibility.public",
    "en": "Public",
    "ko": "공개"
  },
  {
    "key": "workspace.personaDetail.visibilityLabel",
    "en": "Visibility",
    "ko": "가시성"
  },
  {
    "key": "workspace.personaDetail.whyNowLabel",
    "en": "Why now",
    "ko": "왜 지금인가"
  },
  {
    "key": "workspace.personaSidebar.add",
    "en": "Add character",
    "ko": "캐릭터 추가"
  },
  {
    "key": "workspace.personaSidebar.addTitleConnected",
    "en": "Add a character and save to current wallet",
    "ko": "캐릭터를 추가하고 현재 지갑에 저장"
  },
  {
    "key": "workspace.personaSidebar.addTitleDisconnected",
    "en": "Add locally first; it will sync to server after wallet connection",
    "ko": "먼저 로컬에 추가할 수 있으며, 지갑 연결 후 서버에 자동 동기화됩니다"
  },
  {
    "key": "workspace.personaSidebar.castHintPrefix",
    "en": "Per-chapter extracted cast files; select a character below. Data is stored in",
    "ko": "챕터별 추출 인물 파일입니다. 아래 세로 목록에서 인물을 선택하세요. 데이터 저장 위치:"
  },
  {
    "key": "workspace.personaSidebar.castTitle",
    "en": "Character info",
    "ko": "인물 정보"
  },
  {
    "key": "workspace.personaSidebar.connectWalletFirst",
    "en": "Connect wallet first",
    "ko": "먼저 지갑을 연결하세요"
  },
  {
    "key": "workspace.personaSidebar.deleteAria",
    "en": "Delete character {name}",
    "ko": "캐릭터 {name} 삭제"
  },
  {
    "key": "workspace.personaSidebar.deleteTitle",
    "en": "Delete this character",
    "ko": "이 캐릭터 삭제"
  },
  {
    "key": "workspace.personaSidebar.empty",
    "en": "No characters yet. Click \"Add character\" to begin.",
    "ko": "캐릭터가 없습니다. \"캐릭터 추가\"를 눌러 시작하세요."
  },
  {
    "key": "workspace.personaSidebar.subtitle",
    "en": "Click a list item to open stance · motivation · conflict on the right.",
    "ko": "목록 항목을 클릭하면 오른쪽에서 입장 · 동기 · 갈등을 펼칩니다."
  },
  {
    "key": "workspace.personaSidebar.title",
    "en": "Character setup",
    "ko": "캐릭터 설정"
  },
  {
    "key": "workspace.personaSidebar.walletHint",
    "en": "After wallet connection, add/delete actions are saved to server archive (isolated by address).",
    "ko": "지갑 연결 후 추가/삭제 작업은 서버 보관소에 저장됩니다(주소별 분리)."
  },
  {
    "key": "workspace.personaSidebar.wideView",
    "en": "Wide view",
    "ko": "와이드 보기"
  },
  {
    "key": "workspace.personaSidebar.wideViewTitle",
    "en": "Open wide-layout editor view in a new tab",
    "ko": "새 탭에서 와이드 편집 뷰 열기"
  },
  {
    "key": "workspace.sessionLoading",
    "en": "Restoring session…",
    "ko": "세션 복원 중…"
  },
  {
    "key": "workspace.simulationPanel.adoptAndInsert",
    "en": "Adopt and insert (blockquote)",
    "ko": "채택 후 삽입(blockquote)"
  },
  {
    "key": "workspace.simulationPanel.agentStreamReply",
    "en": "Agent stream reply",
    "ko": "Agent 스트리밍 응답"
  },
  {
    "key": "workspace.simulationPanel.branchesTitle",
    "en": "Simulation branches",
    "ko": "시뮬레이션 분기"
  },
  {
    "key": "workspace.simulationPanel.close",
    "en": "Close",
    "ko": "닫기"
  },
  {
    "key": "workspace.simulationPanel.deepFlowHint",
    "en": "Deep streaming flow: generate-profiles -> (if simulation_id provided) start parallel -> poll env -> interview via SSE. After completion, quick simulation runs once to fill structured cards.",
    "ko": "심층 스트리밍: generate-profiles -> (simulation_id 입력 시) start parallel -> env 폴링 -> interview를 SSE로 전송. 완료 후 구조화 카드 보강을 위해 빠른 시뮬레이션을 1회 자동 실행합니다."
  },
  {
    "key": "workspace.simulationPanel.defaultPrompt",
    "en": "If Shang Chun uses the yellow file envelope as leverage, will Lin Yan retreat next turn or counterattack?",
    "ko": "상춘이 노란 봉투를 협상 카드로 꺼내면, 린옌은 다음 수에서 물러날까 아니면 역공할까?"
  },
  {
    "key": "workspace.simulationPanel.emptySelectionHint",
    "en": "(Empty selection, full manuscript excerpt will be used)",
    "ko": "(선택 영역이 비어 있어 전체 원고 발췌를 사용합니다)"
  },
  {
    "key": "workspace.simulationPanel.fallbackPrompt",
    "en": "Simulation result",
    "ko": "시뮬레이션 결과"
  },
  {
    "key": "workspace.simulationPanel.graphIdLabel",
    "en": "graph_id (required)",
    "ko": "graph_id(필수)"
  },
  {
    "key": "workspace.simulationPanel.graphIdPlaceholder",
    "en": "mirofish_xxx / Zep graph ID",
    "ko": "mirofish_xxx / Zep 그래프 ID"
  },
  {
    "key": "workspace.simulationPanel.graphIdRequired",
    "en": "Deep simulation requires a Zep graph_id (MiroFish graph).",
    "ko": "심층 시뮬레이션에는 Zep graph_id(MiroFish 그래프)가 필요합니다."
  },
  {
    "key": "workspace.simulationPanel.lineDirection",
    "en": "Line direction: {direction}",
    "ko": "대사 방향: {direction}"
  },
  {
    "key": "workspace.simulationPanel.mirofishChecking",
    "en": "Checking…",
    "ko": "확인 중…"
  },
  {
    "key": "workspace.simulationPanel.mirofishReachable",
    "en": "Reachable",
    "ko": "접속 가능"
  },
  {
    "key": "workspace.simulationPanel.mirofishUnreachable",
    "en": "Unreachable (quick simulation only)",
    "ko": "접속 불가(빠른 시뮬레이션만 사용 가능)"
  },
  {
    "key": "workspace.simulationPanel.modeDeep",
    "en": "Deep simulation",
    "ko": "심층 시뮬레이션"
  },
  {
    "key": "workspace.simulationPanel.modeLight",
    "en": "Quick simulation",
    "ko": "빠른 시뮬레이션"
  },
  {
    "key": "workspace.simulationPanel.questionLabel",
    "en": "Simulation question",
    "ko": "시뮬레이션 질문"
  },
  {
    "key": "workspace.simulationPanel.rawJson",
    "en": "Raw JSON",
    "ko": "원본 JSON"
  },
  {
    "key": "workspace.simulationPanel.refreshFromStream",
    "en": "Refresh character cards from stream text only",
    "ko": "위 텍스트만 기준으로 오른쪽 캐릭터 카드를 갱신"
  },
  {
    "key": "workspace.simulationPanel.refreshPromptFallback",
    "en": "Based on the following agent simulation text, update each character's stance / current_conflict (output updated_dramas).",
    "ko": "아래 Agent 시뮬레이션 텍스트를 기반으로 각 캐릭터의 stance / current_conflict를 업데이트하세요(updated_dramas 출력)."
  },
  {
    "key": "workspace.simulationPanel.run",
    "en": "Run simulation",
    "ko": "시뮬레이션"
  },
  {
    "key": "workspace.simulationPanel.selectionContextTitle",
    "en": "Selection context (Cmd+Shift+A)",
    "ko": "선택 영역 컨텍스트(⌘⇧A)"
  },
  {
    "key": "workspace.simulationPanel.serviceLabel",
    "en": "Service",
    "ko": "서비스"
  },
  {
    "key": "workspace.simulationPanel.simulationIdLabel",
    "en": "simulation_id (fill if prepared: start + interview)",
    "ko": "simulation_id(prepared 상태라면 입력: start + interview)"
  },
  {
    "key": "workspace.simulationPanel.simulationIdPlaceholder",
    "en": "sim_xxx (optional)",
    "ko": "sim_xxx(선택)"
  },
  {
    "key": "workspace.simulationPanel.startDeepStream",
    "en": "Start deep stream",
    "ko": "심층 스트리밍 시작"
  },
  {
    "key": "workspace.simulationPanel.summarizePromptSuffix",
    "en": "Please extract stance and conflict changes from the agent free text into updated_dramas (mapped to input character ids).",
    "ko": "Agent 자유 텍스트의 입장/갈등 변화를 updated_dramas로 정리해 주세요(입력 캐릭터 id와 매핑)."
  },
  {
    "key": "workspace.simulationPanel.title",
    "en": "AI character simulation",
    "ko": "AI 캐릭터 시뮬레이션"
  },
  {
    "key": "workspace.tabAdminMembers",
    "en": "VIP admin",
    "ko": "VIP 관리"
  },
  {
    "key": "workspace.tickets.loginPrompt",
    "en": "Sign in with email or connect wallet before viewing tickets.",
    "ko": "티켓을 보기 전에 이메일 로그인 또는 지갑 연결을 진행하세요."
  },
  {
    "key": "workspace.tickets.markClosed",
    "en": "Mark closed",
    "ko": "닫힘으로 표시"
  },
  {
    "key": "workspace.tickets.statusClosed",
    "en": "Closed",
    "ko": "닫힘"
  },
  {
    "key": "workspace.translationManage.addLanguage",
    "en": "Add language",
    "ko": "언어 추가"
  },
  {
    "key": "workspace.translationManage.backEditor",
    "en": "Back to editor",
    "ko": "에디터로 돌아가기"
  },
  {
    "key": "workspace.translationManage.badge",
    "en": "Translation management",
    "ko": "번역 관리"
  },
  {
    "key": "workspace.translationManage.chapterLabel",
    "en": "Chapter",
    "ko": "챕터"
  },
  {
    "key": "workspace.translationManage.chapterOption",
    "en": "Chapter {index} · {title}",
    "ko": "{index}장 · {title}"
  },
  {
    "key": "workspace.translationManage.chapterPlaceholder",
    "en": "Translation for this chapter (Markdown or plain text)",
    "ko": "이 챕터의 번역 (Markdown 또는 일반 텍스트)"
  },
  {
    "key": "workspace.translationManage.chapterSaved",
    "en": "Chapter translation saved",
    "ko": "챕터 번역이 저장되었습니다"
  },
  {
    "key": "workspace.translationManage.connectHint",
    "en": "Connect wallet to view and edit translations.",
    "ko": "지갑을 연결하면 번역을 조회하고 편집할 수 있습니다."
  },
  {
    "key": "workspace.translationManage.coverage",
    "en": "Current language covers {done} / {total} chapters (non-empty translation)",
    "ko": "현재 언어 번역 커버리지: {done} / {total} 챕터 (비어 있지 않은 번역)"
  },
  {
    "key": "workspace.translationManage.displaySectionTitle",
    "en": "Display metadata ({lang})",
    "ko": "표시 메타정보 ({lang})"
  },
  {
    "key": "workspace.translationManage.displaySynopsisLabel",
    "en": "Display synopsis",
    "ko": "표시 소개"
  },
  {
    "key": "workspace.translationManage.displaySynopsisPlaceholder",
    "en": "Optional: synopsis in this language",
    "ko": "선택 사항: 해당 언어 소개"
  },
  {
    "key": "workspace.translationManage.displayTitleLabel",
    "en": "Display title",
    "ko": "표시 제목"
  },
  {
    "key": "workspace.translationManage.displayTitlePlaceholder",
    "en": "Optional: reader-facing title",
    "ko": "선택 사항: 독자용 제목"
  },
  {
    "key": "workspace.translationManage.emptyLanguages",
    "en": "No translations yet. Click \"Add language\" to start editing.",
    "ko": "아직 번역이 없습니다. \"언어 추가\"를 눌러 편집을 시작하세요."
  },
  {
    "key": "workspace.translationManage.existingLanguages",
    "en": "Existing languages",
    "ko": "기존 언어"
  },
  {
    "key": "workspace.translationManage.invalidLanguageCode",
    "en": "Invalid language code format. Use letters, numbers, and hyphens only (max 24 chars).",
    "ko": "잘못된 언어 코드 형식입니다. 영문, 숫자, 하이픈만 사용하고 최대 24자까지 입력하세요."
  },
  {
    "key": "workspace.translationManage.loadChapterListFailed",
    "en": "Failed to load chapter list HTTP {status}",
    "ko": "챕터 목록 로드 실패 HTTP {status}"
  },
  {
    "key": "workspace.translationManage.loadFailed",
    "en": "Load failed",
    "ko": "로드 실패"
  },
  {
    "key": "workspace.translationManage.loadStoreFailed",
    "en": "Failed to load translation store HTTP {status}",
    "ko": "번역 저장소 로드 실패 HTTP {status}"
  },
  {
    "key": "workspace.translationManage.loading",
    "en": "Loading translations and chapters…",
    "ko": "번역과 챕터를 불러오는 중…"
  },
  {
    "key": "workspace.translationManage.metaSaved",
    "en": "Translation display title and synopsis saved",
    "ko": "번역 표시 제목과 소개가 저장되었습니다"
  },
  {
    "key": "workspace.translationManage.needWallet",
    "en": "Please connect wallet first.",
    "ko": "먼저 지갑을 연결하세요."
  },
  {
    "key": "workspace.translationManage.needWalletAndChapter",
    "en": "Please connect wallet and select a chapter first.",
    "ko": "먼저 지갑을 연결하고 챕터를 선택하세요."
  },
  {
    "key": "workspace.translationManage.noChapters",
    "en": "This work has no chapters yet. Create chapters in the editor first.",
    "ko": "이 작품에는 아직 챕터가 없습니다. 먼저 에디터에서 챕터를 만들어 주세요."
  },
  {
    "key": "workspace.translationManage.preview",
    "en": "Reader preview",
    "ko": "리더 미리보기"
  },
  {
    "key": "workspace.translationManage.promptAddLanguage",
    "en": "New language code (e.g. en, zh-tw, ja)",
    "ko": "새 언어 코드 (예: en, zh-tw, ja)"
  },
  {
    "key": "workspace.translationManage.saveChapter",
    "en": "Save chapter translation",
    "ko": "이 챕터 번역 저장"
  },
  {
    "key": "workspace.translationManage.saveFailed",
    "en": "Save failed",
    "ko": "저장 실패"
  },
  {
    "key": "workspace.translationManage.saveFailedWithStatus",
    "en": "Save failed HTTP {status}",
    "ko": "저장 실패 HTTP {status}"
  },
  {
    "key": "workspace.translationManage.saveMeta",
    "en": "Save display metadata",
    "ko": "표시 메타정보 저장"
  },
  {
    "key": "workspace.translationManage.savingChapter",
    "en": "Saving…",
    "ko": "저장 중…"
  },
  {
    "key": "workspace.translationManage.savingMeta",
    "en": "Saving…",
    "ko": "저장 중…"
  },
  {
    "key": "workspace.translationManage.tagsLabel",
    "en": "Tags (comma separated)",
    "ko": "태그 (쉼표로 구분)"
  },
  {
    "key": "workspace.translationManage.tagsPlaceholder",
    "en": "e.g. Fantasy, Adventure",
    "ko": "예: 판타지, 모험"
  },
  {
    "key": "workspace.translationManage.unsavedAddLanguageConfirm",
    "en": "There are unsaved changes. Adding and switching to a new language will discard them. Continue?",
    "ko": "저장되지 않은 변경사항이 있습니다. 새 언어를 추가하고 전환하면 변경사항이 삭제됩니다. 계속할까요?"
  },
  {
    "key": "workspace.translationManage.unsavedSwitchChapterConfirm",
    "en": "The current chapter translation is not saved. Switching chapters will discard edits. Continue?",
    "ko": "현재 챕터 번역이 저장되지 않았습니다. 챕터를 전환하면 편집 내용이 삭제됩니다. 계속할까요?"
  },
  {
    "key": "workspace.translationManage.unsavedSwitchLangConfirm",
    "en": "There are unsaved changes. Switching language will discard them. Continue?",
    "ko": "저장되지 않은 변경사항이 있습니다. 언어를 전환하면 변경사항이 삭제됩니다. 계속할까요?"
  },
  {
    "key": "workspace.translationManage.untitled",
    "en": "Untitled",
    "ko": "제목 없음"
  },
  {
    "key": "workspace.walletGateBlurb",
    "en": "Use the browser extension. Approve the connection request when prompted.",
    "ko": "브라우저 확장 프로그램을 사용하세요. 연결 요청이 뜨면 승인해 주세요."
  },
  {
    "key": "workspace.walletGateRefreshHint",
    "en": "If you connected before, try refreshing the page to restore the session.",
    "ko": "이전에 연결한 적이 있다면 페이지를 새로고침해 세션을 복원해 보세요."
  },
  {
    "key": "workspace.walletGateTitle",
    "en": "Connect with MetaMask",
    "ko": "MetaMask로 연결"
  }
]
```
