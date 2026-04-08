"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  clampReaderAiPanelPos,
  defaultReaderAiPanelPos,
  READER_AI_FLOAT_MARGIN,
  READER_AI_PANEL_H_MAX,
  READER_AI_PANEL_W,
} from "@/lib/reader-ai-floating-layout";
import { READER_AI_LANG_ONBOARDING_DONE_KEY } from "@/lib/reader-ai-lang-onboarding";

export type FloatingReaderAiShellRenderProps = {
  onHeaderPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  headerDragging: boolean;
  requestCollapse: () => void;
};

type FloatingReaderAiShellProps = {
  positionStorageKey: string;
  collapsedStorageKey: string;
  expandButtonTitle: string;
  expandButtonLabel: string;
  /** Until language onboarding is done, ignore stored “minimized” so the first question is visible after wallet connect. */
  autoExpandUntilLangOnboardingDone?: boolean;
  children: (ctx: FloatingReaderAiShellRenderProps) => ReactNode;
};

export function FloatingReaderAiShell({
  positionStorageKey,
  collapsedStorageKey,
  expandButtonTitle,
  expandButtonLabel,
  autoExpandUntilLangOnboardingDone = false,
  children,
}: FloatingReaderAiShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [headerDragging, setHeaderDragging] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 72 });
  const [floatReady, setFloatReady] = useState(false);
  const [viewportTick, setViewportTick] = useState(0);
  const posRef = useRef(pos);
  posRef.current = pos;

  const panelHeight = useMemo(() => {
    if (typeof window === "undefined") {
      return Math.min(READER_AI_PANEL_H_MAX, 560);
    }
    return Math.min(
      READER_AI_PANEL_H_MAX,
      Math.max(280, window.innerHeight - READER_AI_FLOAT_MARGIN * 2 - 48),
    );
  }, [viewportTick]);

  useEffect(() => {
    const onResize = () => setViewportTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    try {
      if (
        autoExpandUntilLangOnboardingDone &&
        window.localStorage.getItem(READER_AI_LANG_ONBOARDING_DONE_KEY) !== "1"
      ) {
        setCollapsed(false);
        return;
      }
      const c = window.localStorage.getItem(collapsedStorageKey);
      if (c === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, [collapsedStorageKey, autoExpandUntilLangOnboardingDone]);

  useEffect(() => {
    try {
      window.localStorage.setItem(collapsedStorageKey, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed, collapsedStorageKey]);

  useLayoutEffect(() => {
    const h = Math.min(
      READER_AI_PANEL_H_MAX,
      Math.max(280, window.innerHeight - READER_AI_FLOAT_MARGIN * 2 - 48),
    );
    try {
      const raw = window.localStorage.getItem(positionStorageKey);
      if (!raw) {
        setPos(defaultReaderAiPanelPos(READER_AI_PANEL_W, h));
      } else {
        const p = JSON.parse(raw) as unknown;
        if (
          !p ||
          typeof p !== "object" ||
          typeof (p as { x?: unknown }).x !== "number" ||
          typeof (p as { y?: unknown }).y !== "number"
        ) {
          setPos(defaultReaderAiPanelPos(READER_AI_PANEL_W, h));
        } else {
          const { x, y } = p as { x: number; y: number };
          setPos(clampReaderAiPanelPos(x, y, READER_AI_PANEL_W, h));
        }
      }
    } catch {
      setPos(defaultReaderAiPanelPos(READER_AI_PANEL_W, h));
    }
    setFloatReady(true);
  }, [positionStorageKey]);

  useEffect(() => {
    setPos((prev) =>
      clampReaderAiPanelPos(prev.x, prev.y, READER_AI_PANEL_W, panelHeight),
    );
  }, [panelHeight]);

  useEffect(() => {
    if (!floatReady || collapsed) return;
    try {
      window.localStorage.setItem(positionStorageKey, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, [pos, collapsed, floatReady, positionStorageKey]);

  const onHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const orig = posRef.current;
      setHeaderDragging(true);

      const onMove = (ev: PointerEvent) => {
        const nx = orig.x + ev.clientX - startX;
        const ny = orig.y + ev.clientY - startY;
        const clamped = clampReaderAiPanelPos(
          nx,
          ny,
          READER_AI_PANEL_W,
          panelHeight,
        );
        posRef.current = clamped;
        setPos(clamped);
      };
      let ended = false;
      const onUp = () => {
        if (ended) return;
        ended = true;
        window.removeEventListener("pointermove", onMove);
        setHeaderDragging(false);
        try {
          window.localStorage.setItem(
            positionStorageKey,
            JSON.stringify(posRef.current),
          );
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
      window.addEventListener("pointercancel", onUp, { once: true });
    },
    [panelHeight, positionStorageKey],
  );

  const requestCollapse = useCallback(() => setCollapsed(true), []);

  return (
    <>
      {!collapsed ? (
        <div
          className="fixed z-[45] flex flex-col overflow-hidden rounded-xl border border-[#1b2b43] bg-[#050810] shadow-[0_12px_48px_rgba(0,0,0,0.55)]"
          style={{
            left: pos.x,
            top: pos.y,
            width: READER_AI_PANEL_W,
            height: panelHeight,
          }}
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            {children({
              onHeaderPointerDown,
              headerDragging,
              requestCollapse,
            })}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="fixed right-0 top-1/2 z-[45] flex -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-l-lg border border-r-0 border-[#1b2b43] bg-[#0a121c]/95 px-2 py-4 text-[11px] font-medium text-cyan-300 shadow-lg backdrop-blur-sm hover:bg-[#0d1524]"
          title={expandButtonTitle}
        >
          <span className="[writing-mode:vertical-rl]">{expandButtonLabel}</span>
        </button>
      )}
    </>
  );
}
