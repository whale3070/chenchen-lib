"use client";

import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { FileDown, FileUp, Rocket } from "lucide-react";
import Link from "next/link";

import { OutlineSidebar } from "@/components/outline-sidebar";
import { PublishNovelModal } from "@/components/publish-novel-modal";
import { PersonaDetailCard } from "@/components/persona-detail";
import { PersonaSidebar } from "@/components/persona-sidebar";
import { SimulationPanel } from "@/components/simulation-panel";
import { WalletConnect } from "@/components/wallet-connect";
import { SelectionLock } from "@/extensions/selection-lock";
import { SimulationShortcut } from "@/extensions/simulation-shortcut";
import type { EditorDeduceContext } from "@/lib/editor-context";
import { DEMO_OUTLINE_FLAT } from "@/lib/demo-outline";
import {
  derivePublishDisplayStatus,
  getPrimaryVolumeForPublish,
  publishStatusLabelZh,
  type NovelPublishRecord,
} from "@/lib/novel-publish";
import { DEMO_PERSONAS } from "@/lib/demo-personas";
import { plainTextToTipTapHtml } from "@/lib/manuscript-txt";
import { createEmptyPersona } from "@/lib/persona-factory";
import {
  applySelectionToEditor,
  applyViewportScroll,
  computeWritingSnippet,
  formatAuthorLabel,
  hasWritingPayload,
  pickNewerWritingContext,
  readWritingContextFromStorage,
  shouldShowWakeupBar,
  writeWritingContextToStorage,
  type WritingContextPayload,
} from "@/lib/writing-context";
import { useAuthStore } from "@/store/auth-store";
import type { Persona, PlotNode } from "@chenchen/shared/types";

export type NovelEditorWorkspaceProps = {
  /** 与 save-draft / 大纲 / 角色存档绑定的作品 ID */
  novelId: string;
};

function decodeTxtAuto(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  // BOM 优先：UTF-8 / UTF-16LE / UTF-16BE
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    // 浏览器通常不直接提供 utf-16be，手动调换字节后按 utf-16le 解码
    const be = bytes.subarray(2);
    const swapped = new Uint8Array(be.length - (be.length % 2));
    for (let i = 0; i + 1 < be.length; i += 2) {
      swapped[i] = be[i + 1];
      swapped[i + 1] = be[i];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }

  // 先严格按 UTF-8 解；失败后回退到 GB18030（覆盖 GBK/GB2312）
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}

function createDefaultChapterOneNodes(): PlotNode[] {
  return [
    {
      id: `ch-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`,
      kind: "chapter",
      title: "第一章",
      summary: "",
    },
  ];
}

export function NovelEditorWorkspace({ novelId }: NovelEditorWorkspaceProps) {
  const [novelTitleForHeader, setNovelTitleForHeader] = useState<string | null>(
    null,
  );
  const [bookPremise, setBookPremise] = useState("");
  const bookPremiseRef = useRef("");
  useEffect(() => {
    bookPremiseRef.current = bookPremise;
  }, [bookPremise]);

  const [outlineNodes, setOutlineNodes] = useState<PlotNode[]>(() =>
    DEMO_OUTLINE_FLAT.map((n) => ({ ...n })),
  );

  const [personas, setPersonas] = useState<Persona[]>(DEMO_PERSONAS);
  const [selectedId, setSelectedId] = useState<string | null>(
    DEMO_PERSONAS[0]?.id ?? null,
  );
  const [simOpen, setSimOpen] = useState(false);
  const [deduceContext, setDeduceContext] =
    useState<EditorDeduceContext | null>(null);

  /** 发布模块：服务端持久化的发布配置 */
  const [publishRecord, setPublishRecord] = useState<NovelPublishRecord | null>(
    null,
  );
  const [publishModalOpen, setPublishModalOpen] = useState(false);

  const personasRef = useRef(personas);
  useEffect(() => {
    personasRef.current = personas;
  }, [personas]);

  const openPanelWithEditorContext = useCallback((editorInstance: Editor) => {
    try {
      if (editorInstance.isDestroyed || !editorInstance.state) {
        setDeduceContext(null);
        setSimOpen(true);
        return;
      }
      const { from, to } = editorInstance.state.selection;
      const doc = editorInstance.state.doc;
      editorInstance.commands.setSelectionLock({ from, to });
      const premise = bookPremiseRef.current.trim();
      setDeduceContext({
        selection: doc.textBetween(from, to, "\n\n", "\n\n"),
        fullDocument: doc.textBetween(0, doc.content.size, "\n\n", "\n\n"),
        selectionFrom: from,
        selectionTo: to,
        personasSnapshot: [...personasRef.current],
        ...(premise ? { bookPremise: premise } : {}),
      });
    } catch {
      setDeduceContext(null);
      if (!editorInstance.isDestroyed) {
        editorInstance.commands.clearSelectionLock();
      }
    }
    setSimOpen(true);
  }, []);

  const openPanelRef = useRef(openPanelWithEditorContext);
  useEffect(() => {
    openPanelRef.current = openPanelWithEditorContext;
  }, [openPanelWithEditorContext]);

  const authorId = useAuthStore((s) => s.authorId);
  const authorIdRef = useRef<string | null>(null);
  useEffect(() => {
    authorIdRef.current = authorId;
  }, [authorId]);

  const novelIdRef = useRef(novelId);
  useEffect(() => {
    novelIdRef.current = novelId;
  }, [novelId]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftLoadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    draftLoadedKeyRef.current = null;
  }, [novelId]);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const importTxtInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!authorId) draftLoadedKeyRef.current = null;
  }, [authorId]);

  useEffect(() => {
    setNovelTitleForHeader(null);
    setBookPremise("");
  }, [novelId]);

  useEffect(() => {
    if (!authorId || !novelId) return;
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/novels/lookup?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          {
            headers: { "x-wallet-address": authorId },
            signal: ac.signal,
          },
        );
        if (!r.ok || ac.signal.aborted) return;
        const data = (await r.json()) as {
          novel?: { title?: string; description?: string };
        };
        if (ac.signal.aborted) return;
        if (data.novel?.title) setNovelTitleForHeader(data.novel.title);
        if (typeof data.novel?.description === "string") {
          setBookPremise(data.novel.description);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  /** 发布模块：加载当前作品的发布配置 */
  useEffect(() => {
    if (!authorId || !novelId) {
      setPublishRecord(null);
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/novel-publish?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          {
            headers: { "x-wallet-address": authorId },
            signal: ac.signal,
          },
        );
        if (!r.ok || ac.signal.aborted) return;
        const data = (await r.json()) as {
          record: NovelPublishRecord | null;
        };
        if (ac.signal.aborted) return;
        setPublishRecord(data.record ?? null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  const primaryVolumeForPublish = useMemo(
    () => getPrimaryVolumeForPublish(outlineNodes),
    [outlineNodes],
  );

  const publishModalInitialTitle =
    primaryVolumeForPublish?.title ?? novelTitleForHeader ?? "";
  const publishModalInitialSynopsis =
    primaryVolumeForPublish?.summary ?? bookPremise ?? "";
  const publishModalInitialTags = primaryVolumeForPublish?.tags ?? [];

  const displayPublishStatus = derivePublishDisplayStatus(publishRecord);
  const publishStatusLabelText = publishStatusLabelZh(displayPublishStatus);

  const canWithdrawPublish =
    publishRecord?.visibility === "public" &&
    publishRecord?.paymentMode === "free";

  const handleWithdrawPublish = useCallback(async () => {
    if (!authorId) return;
    if (
      !window.confirm("确定撤回公开？作品将恢复为仅自己可见（草稿）。")
    ) {
      return;
    }
    try {
      const r = await fetch("/api/v1/novel-publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          action: "withdraw",
          authorId,
          novelId,
        }),
      });
      const data = (await r.json()) as {
        record?: NovelPublishRecord;
        error?: string;
      };
      if (!r.ok) throw new Error(data.error ?? "撤回失败");
      setPublishRecord(data.record ?? null);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "撤回失败");
    }
  }, [authorId, novelId]);

  const handlePublishConfirm = useCallback(
    async (payload: {
      title: string;
      synopsis: string;
      tags: string[];
      visibility: "private" | "public";
      paymentMode: "free" | "paid";
      currency: "HKD" | "USD" | "CNY";
      priceAmount: string;
      updateCommitment: "none" | number;
      refundRuleAck: boolean;
    }) => {
      if (!authorId) throw new Error("请先连接钱包");
      const r = await fetch("/api/v1/novel-publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId,
          novelId,
          ...payload,
        }),
      });
      const data = (await r.json()) as {
        record?: NovelPublishRecord;
        error?: string;
      };
      if (!r.ok) throw new Error(data.error ?? "发布失败");
      setPublishRecord(data.record ?? null);
    },
    [authorId, novelId],
  );

  /** 瞬时写入 localStorage，并防抖后同步服务端（与 onUpdate 2000ms 一致）。 */
  const flushWritingContext = useCallback((editor: Editor) => {
    const aid = authorIdRef.current;
    if (!aid || editor.isDestroyed) return;

    const now = Date.now();
    const selectionJson = editor.state.selection.toJSON() as NonNullable<
      WritingContextPayload["selectionJson"]
    >;
    const { from, to } = editor.state.selection;
    const scrollTop = editorScrollRef.current?.scrollTop ?? 0;
    const writingSnippet = computeWritingSnippet(editor);
    const iso = new Date().toISOString();

    const payload: WritingContextPayload = {
      html: editor.getHTML(),
      json: editor.getJSON(),
      selection: { from, to },
      selectionJson,
      lastActionTimestamp: now,
      viewportScroll: scrollTop,
      writingSnippet,
      updatedAt: iso,
    };

    const docId = novelIdRef.current;
    writeWritingContextToStorage(aid, docId, payload);

    void fetch("/api/v1/save-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authorId: aid,
        docId,
        html: payload.html,
        json: payload.json,
        selection: payload.selection,
        selectionJson: payload.selectionJson,
        lastActionTimestamp: payload.lastActionTimestamp,
        viewportScroll: payload.viewportScroll,
        writingSnippet: payload.writingSnippet,
      }),
    }).catch(() => {
      /* 静默失败，避免打断写作 */
    });
  }, []);

  const applyRestoredContext = useCallback(
    (editor: Editor, payload: WritingContextPayload) => {
      if (editor.isDestroyed) return;
      const hasJson =
        payload.json !== null &&
        typeof payload.json === "object" &&
        Object.keys(payload.json as object).length > 0;
      const hasHtml =
        typeof payload.html === "string" && payload.html.trim().length > 0;
      if (hasJson) {
        editor.commands.setContent(payload.json as object, {
          emitUpdate: false,
        });
      } else if (hasHtml) {
        editor.commands.setContent(payload.html!, { emitUpdate: false });
      }
      applySelectionToEditor(editor, payload);
      applyViewportScroll(editorScrollRef.current, payload.viewportScroll);
    },
    [],
  );

  const persistPersonas = useCallback(async (list: Persona[]) => {
    const aid = authorIdRef.current;
    if (!aid) return;
    try {
      await fetch("/api/v1/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorId: aid,
          novelId: novelIdRef.current,
          personas: list,
        }),
      });
    } catch {
      /* 静默失败 */
    }
  }, []);

  const personaEditSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (personaEditSaveTimerRef.current) {
        clearTimeout(personaEditSaveTimerRef.current);
      }
    };
  }, []);

  const handlePersonaDetailChange = useCallback(
    (updated: Persona) => {
      setPersonas((prev) => {
        const next = prev.map((p) => (p.id === updated.id ? updated : p));
        if (personaEditSaveTimerRef.current) {
          clearTimeout(personaEditSaveTimerRef.current);
        }
        personaEditSaveTimerRef.current = setTimeout(() => {
          personaEditSaveTimerRef.current = null;
          void persistPersonas(next);
        }, 500);
        return next;
      });
    },
    [persistPersonas],
  );

  /** 从服务端按钱包加载角色；无存档时使用演示数据（内存中），首次增删会写入 .data。 */
  useEffect(() => {
    if (!authorId) {
      setPersonas(JSON.parse(JSON.stringify(DEMO_PERSONAS)) as Persona[]);
      setSelectedId(DEMO_PERSONAS[0]?.id ?? null);
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/personas?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          { signal: ac.signal },
        );
        if (!r.ok || ac.signal.aborted) return;
        const data = (await r.json()) as {
          personas: Persona[] | null;
          updatedAt: string | null;
        };
        if (ac.signal.aborted) return;
        if (data.personas && data.personas.length > 0) {
          setPersonas(data.personas);
          setSelectedId(data.personas[0].id);
        } else {
          const demo = JSON.parse(JSON.stringify(DEMO_PERSONAS)) as Persona[];
          setPersonas(demo);
          setSelectedId(demo[0]?.id ?? null);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  const handleAddPersona = useCallback(() => {
    const created = createEmptyPersona();
    setPersonas((prev) => {
      const next = [...prev, created];
      void persistPersonas(next);
      return next;
    });
    setSelectedId(created.id);
  }, [persistPersonas]);

  const handleDeletePersona = useCallback(
    (pid: string) => {
      if (!authorId) return;
      setPersonas((prev) => {
        const next = prev.filter((p) => p.id !== pid);
        void persistPersonas(next);
        queueMicrotask(() => {
          setSelectedId((cur) =>
            cur !== pid ? cur : (next[0]?.id ?? null),
          );
        });
        return next;
      });
    },
    [authorId, persistPersonas],
  );

  const handlePersonasUpdateFromAi = useCallback(
    (next: Persona[]) => {
      setPersonas(next);
      if (authorIdRef.current) void persistPersonas(next);
    },
    [persistPersonas],
  );

  const postOutlineStructure = useCallback(async (nodes: PlotNode[]) => {
    const aid = authorIdRef.current;
    if (!aid) return;
    try {
      await fetch("/api/v1/update-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorId: aid,
          docId: novelIdRef.current,
          nodes,
        }),
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!authorId) {
      setOutlineNodes(DEMO_OUTLINE_FLAT.map((n) => ({ ...n })));
      return;
    }
    const ac = new AbortController();
    const docId = novelId;
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/update-structure?authorId=${encodeURIComponent(authorId)}&docId=${encodeURIComponent(docId)}`,
          { signal: ac.signal },
        );
        if (!r.ok || ac.signal.aborted) return;
        const data = (await r.json()) as {
          nodes: PlotNode[] | null;
          updatedAt: string | null;
        };
        if (ac.signal.aborted) return;
        if (data.nodes && data.nodes.length > 0) {
          setOutlineNodes(data.nodes);
        } else {
          const chapterOne = createDefaultChapterOneNodes();
          setOutlineNodes(chapterOne);
          try {
            await fetch("/api/v1/update-structure", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                authorId,
                docId: novelId,
                nodes: chapterOne,
              }),
            });
          } catch {
            /* 与 postOutlineStructure 一致：静默 */
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  const [docTick, setDocTick] = useState(0);
  const [wakeup, setWakeup] = useState<{
    authorLabel: string;
    snippet: string;
    selectionJson: WritingContextPayload["selectionJson"];
    fallbackFrom: number;
    fallbackTo: number;
    scrollTop: number;
  } | null>(null);

  const editorInstance = useEditor({
    extensions: [
      StarterKit,
      SelectionLock,
      SimulationShortcut.configure({
        onModShiftA: (ed) => {
          openPanelRef.current(ed);
        },
      }),
    ],
    content: "<p></p>",
    editorProps: {
      attributes: {
        class:
          "max-w-none min-h-[320px] px-4 py-3 text-base leading-relaxed text-neutral-900 focus:outline-none dark:text-neutral-100 [&_p]:mb-3",
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setDocTick((t) => t + 1);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        flushWritingContext(editor);
      }, 2000);
    },
  });

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!editorInstance || editorInstance.isDestroyed || !authorId) return;

    const docId = novelId;
    const loadKey = `${authorId}:${docId}`;
    if (draftLoadedKeyRef.current === loadKey) return;

    const ac = new AbortController();

    void (async () => {
      try {
        const local = readWritingContextFromStorage(authorId, docId);
        if (
          local &&
          hasWritingPayload(local) &&
          !editorInstance.isDestroyed &&
          !ac.signal.aborted
        ) {
          applyRestoredContext(editorInstance, local);
          setDocTick((t) => t + 1);
        }

        const r = await fetch(
          `/api/v1/save-draft?authorId=${encodeURIComponent(authorId)}&docId=${encodeURIComponent(docId)}`,
          { signal: ac.signal },
        );
        if (!r.ok || ac.signal.aborted || editorInstance.isDestroyed) return;

        const remoteRaw = (await r.json()) as Record<string, unknown>;
        if (ac.signal.aborted || editorInstance.isDestroyed) return;

        const merged = pickNewerWritingContext(local, remoteRaw);
        if (!merged || !hasWritingPayload(merged)) {
          draftLoadedKeyRef.current = loadKey;
          setWakeup(null);
          return;
        }

        const localTs = local?.lastActionTimestamp ?? -1;
        if (merged.lastActionTimestamp > localTs) {
          applyRestoredContext(editorInstance, merged);
          setDocTick((t) => t + 1);
        }

        draftLoadedKeyRef.current = loadKey;

        if (shouldShowWakeupBar(merged.lastActionTimestamp)) {
          setWakeup({
            authorLabel: formatAuthorLabel(authorId),
            snippet: merged.writingSnippet?.trim() || "……",
            selectionJson: merged.selectionJson,
            fallbackFrom: merged.selection?.from ?? 0,
            fallbackTo: merged.selection?.to ?? merged.selection?.from ?? 0,
            scrollTop: merged.viewportScroll ?? 0,
          });
        } else {
          setWakeup(null);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    })();

    return () => ac.abort();
  }, [editorInstance, authorId, novelId, applyRestoredContext]);

  const handleWakeupEnter = useCallback(() => {
    if (!editorInstance || editorInstance.isDestroyed || !wakeup) return;
    editorInstance.commands.focus();
    applySelectionToEditor(editorInstance, {
      selectionJson: wakeup.selectionJson,
      selection: { from: wakeup.fallbackFrom, to: wakeup.fallbackTo },
    });
    editorScrollRef.current?.scrollTo({
      top: Math.max(0, wakeup.scrollTop),
      behavior: "smooth",
    });
    setWakeup(null);
  }, [editorInstance, wakeup]);

  const handleOutlineSeek = useCallback(
    (range: { from: number; to: number }) => {
      const ed = editorInstance;
      if (!ed || ed.isDestroyed) return;
      const max = ed.state.doc.content.size;
      const from = Math.max(1, Math.min(range.from, max));
      ed.chain().focus().setTextSelection({ from, to: from }).scrollIntoView().run();
    },
    [editorInstance],
  );

  const selected = personas.find((p) => p.id === selectedId) ?? null;

  const manuscriptPlain = useMemo(() => {
    if (!editorInstance) return "";
    return editorInstance.getText({ blockSeparator: "\n\n" });
    // docTick：onUpdate / 恢复快照后递增，驱动此处与文档同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorInstance, docTick]);

  /** 发布模块：正文篇幅 + 大纲标题达标后才可首次发布 */
  const publishContentReady = useMemo(() => {
    const t = manuscriptPlain.replace(/\s/g, "");
    const minChars = 80;
    const hasOutline =
      outlineNodes.length > 0 &&
      outlineNodes.some((n) => (n.title?.trim()?.length ?? 0) > 0);
    return t.length >= minChars && hasOutline;
  }, [manuscriptPlain, outlineNodes]);

  const hasPublishSave = Boolean(publishRecord?.publishedAt);
  const canOpenPublish =
    Boolean(authorId) && (publishContentReady || hasPublishSave);

  const handleSimClose = useCallback(() => {
    editorInstance?.commands.clearSelectionLock();
    setDeduceContext(null);
    setSimOpen(false);
  }, [editorInstance]);

  const handleExportTxt = useCallback(() => {
    if (!authorId || !editorInstance || editorInstance.isDestroyed) return;
    const text = editorInstance.getText({ blockSeparator: "\n\n" });
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const nid = novelId.replace(/[^\w.-]+/g, "_").slice(0, 48);
    a.download = `chenchen-${nid}-${authorId.slice(0, 10)}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [authorId, editorInstance, novelId]);

  const openImportTxtPicker = useCallback(() => {
    if (!authorId) return;
    importTxtInputRef.current?.click();
  }, [authorId]);

  const handleImportTxtSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!authorId || !file || !editorInstance || editorInstance.isDestroyed) {
        return;
      }
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".txt")) {
        window.alert("仅支持导入 .txt 文本文件。");
        return;
      }
      if (
        !window.confirm(
          "导入将以该 .txt 内容替换当前稿面（可先导出备份）。是否继续？",
        )
      ) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (!(result instanceof ArrayBuffer)) {
          window.alert("读取文件失败：无效的文件内容。");
          return;
        }
        const text = decodeTxtAuto(new Uint8Array(result));
        if (!editorInstance || editorInstance.isDestroyed) return;
        const html = plainTextToTipTapHtml(text);
        editorInstance.commands.setContent(html, { emitUpdate: true });
        setDocTick((t) => t + 1);
        flushWritingContext(editorInstance);
      };
      reader.onerror = () => {
        window.alert("读取文件失败，请重试。");
      };
      reader.readAsArrayBuffer(file);
    },
    [authorId, editorInstance, flushWritingContext],
  );

  useEffect(() => {
    if (!editorInstance || editorInstance.isDestroyed) return;
    if (!simOpen) {
      editorInstance.commands.clearSelectionLock();
      return;
    }
    if (deduceContext) {
      editorInstance.commands.setSelectionLock({
        from: deduceContext.selectionFrom,
        to: deduceContext.selectionTo,
      });
    } else {
      editorInstance.commands.clearSelectionLock();
    }
  }, [simOpen, deduceContext, editorInstance]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto">
      <PersonaSidebar
        personas={personas}
        selectedId={selectedId}
        onSelect={setSelectedId}
        walletConnected={Boolean(authorId)}
        onAdd={handleAddPersona}
        onDelete={handleDeletePersona}
      />
      <OutlineSidebar
        nodes={outlineNodes}
        onNodesChange={setOutlineNodes}
        onUpdateStructure={postOutlineStructure}
        onNodeSeek={handleOutlineSeek}
        publishStatusLabel={authorId ? publishStatusLabelText : null}
        onWithdrawPublish={
          canWithdrawPublish ? handleWithdrawPublish : undefined
        }
        withdrawPublishDisabled={!authorId}
      />
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-[var(--background)] px-4 py-2 dark:border-neutral-800">
          <div>
            <div className="mb-0.5 flex flex-wrap items-center gap-2">
              <Link
                href="/workspace"
                className="text-[11px] font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                ← 工作台
              </Link>
            </div>
            <h1 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              {novelTitleForHeader ?? "稿面"}
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 dark:border-neutral-600 dark:bg-neutral-900">
                ⌘
              </kbd>
              <span className="mx-0.5">+</span>
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 dark:border-neutral-600 dark:bg-neutral-900">
                ⇧
              </kbd>
              <span className="mx-0.5">+</span>
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 dark:border-neutral-600 dark:bg-neutral-900">
                A
              </kbd>
              <span className="ml-1">
                捕获选区并打开推演（Windows：Ctrl+Shift+A，需在编辑器内聚焦）
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WalletConnect />
            <input
              ref={importTxtInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              aria-hidden
              onChange={handleImportTxtSelected}
            />
            <button
              type="button"
              disabled={!authorId}
              onClick={openImportTxtPicker}
              title={
                authorId
                  ? "导入 .txt 替换当前稿面（自动识别 UTF-8 / GB18030 / UTF-16）"
                  : "请先连接钱包后再导入文稿"
              }
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
              导入小说
            </button>
            <button
              type="button"
              disabled={!authorId}
              onClick={handleExportTxt}
              title={
                authorId
                  ? "导出当前稿面为 .txt（段落间空行）"
                  : "请先连接钱包后再导出文稿"
              }
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <FileDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
              导出小说
            </button>
            {/** 发布模块 — 主操作按钮（已保存配置后文案为「已发布」） */}
            <button
              type="button"
              disabled={!authorId || !canOpenPublish}
              onClick={() => setPublishModalOpen(true)}
              title={
                !authorId
                  ? "请先连接钱包"
                  : !canOpenPublish
                    ? "请完成小说内容后再发布（正文约 80 字以上且大纲含有效标题）"
                    : hasPublishSave
                      ? "查看或修改发布设置"
                      : "打开发布配置"
              }
              className={[
                "inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-transform disabled:cursor-not-allowed disabled:opacity-45",
                hasPublishSave
                  ? "bg-neutral-500 text-white hover:bg-neutral-600 dark:bg-neutral-600 dark:hover:bg-neutral-500"
                  : "bg-[#2196f3] text-white hover:scale-[1.04] hover:bg-[#1976d2] active:scale-[0.98]",
              ].join(" ")}
            >
              <Rocket className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {hasPublishSave ? "已发布" : "发布小说"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (editorInstance && !editorInstance.isDestroyed) {
                  openPanelWithEditorContext(editorInstance);
                } else {
                  editorInstance?.commands.clearSelectionLock();
                  setDeduceContext(null);
                  setSimOpen(true);
                }
              }}
              className="pointer-events-auto relative z-40 cursor-pointer rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              AI 推演
            </button>
          </div>
        </header>
        {wakeup ? (
          <div
            role="region"
            aria-label="续写提示"
            className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200/80 bg-amber-50/90 px-4 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-50"
          >
            <p className="min-w-0 leading-relaxed">
              欢迎回来，{wakeup.authorLabel}
              。上次你写到了 {wakeup.snippet}
            </p>
            <button
              type="button"
              onClick={handleWakeupEnter}
              className="shrink-0 rounded-md border border-amber-700/30 bg-white/90 px-3 py-1 text-xs font-medium text-amber-950 shadow-sm transition-colors hover:bg-white dark:border-amber-600/40 dark:bg-amber-900/80 dark:text-amber-50 dark:hover:bg-amber-900"
            >
              一键入戏
            </button>
          </div>
        ) : null}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_280px]">
          <div
            ref={editorScrollRef}
            className="relative z-0 min-h-0 overflow-y-auto border-b border-neutral-200 dark:border-neutral-800 lg:border-b-0 lg:border-r"
          >
            {editorInstance && <EditorContent editor={editorInstance} />}
          </div>
          <div className="overflow-y-auto p-4">
            <PersonaDetailCard
              persona={selected}
              onPersonaChange={handlePersonaDetailChange}
            />
          </div>
        </div>
      </main>
      <PublishNovelModal
        open={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        initialTitle={publishModalInitialTitle}
        initialSynopsis={publishModalInitialSynopsis}
        initialTags={publishModalInitialTags}
        savedRecord={publishRecord}
        onConfirm={handlePublishConfirm}
      />
      <SimulationPanel
        open={simOpen}
        onClose={handleSimClose}
        manuscript={manuscriptPlain}
        personas={personas}
        context={deduceContext}
        onPersonasUpdate={handlePersonasUpdateFromAi}
        editor={editorInstance}
      />
    </div>
  );
}
