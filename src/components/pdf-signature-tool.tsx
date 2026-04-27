"use client";

import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import { Download, FileImage, FileText } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useSiteLocale } from "@/providers/site-locale-provider";

type Rect = { left: number; top: number; width: number; height: number };
type Corner = "nw" | "ne" | "sw" | "se";

const MIN_BOX = 32;
const HANDLE = 10;
const DPR_MAX = 2;

function clampRect(box: Rect, viewW: number, viewH: number): Rect {
  let { left, top, width, height } = box;
  width = Math.max(MIN_BOX, width);
  height = Math.max(MIN_BOX, height);
  left = Math.min(Math.max(0, left), Math.max(0, viewW - width));
  top = Math.min(Math.max(0, top), Math.max(0, viewH - height));
  if (left + width > viewW) width = viewW - left;
  if (top + height > viewH) height = viewH - top;
  width = Math.max(MIN_BOX, width);
  height = Math.max(MIN_BOX, height);
  return { left, top, width, height };
}

function defaultSignatureBox(
  viewW: number,
  viewH: number,
  imgW: number,
  imgH: number,
): Rect {
  const margin = 14;
  const targetW = Math.min(viewW * 0.26, 220);
  const ratio = imgH / imgW;
  let w = targetW;
  let h = w * ratio;
  const maxH = viewH * 0.38;
  if (h > maxH) {
    h = maxH;
    w = h / ratio;
  }
  w = Math.min(w, viewW - margin * 2);
  h = Math.min(h, viewH - margin * 2);
  return clampRect(
    {
      left: Math.max(margin, viewW - w - margin),
      top: Math.max(margin, viewH - h - margin),
      width: w,
      height: h,
    },
    viewW,
    viewH,
  );
}

function signedDownloadName(originalName: string): string {
  const base = originalName.replace(/\.pdf$/i, "") || "document";
  return `${base}-signed.pdf`;
}

export function PdfSignatureTool() {
  const { t } = useSiteLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pdfTaskRef = useRef<ReturnType<typeof pdfjs.getDocument> | null>(null);
  const pdfProxyRef = useRef<pdfjs.PDFDocumentProxy | null>(null);

  const [workerReady, setWorkerReady] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  /** 0-based page index */
  const [pageIndex, setPageIndex] = useState(0);
  const [rendering, setRendering] = useState(false);

  const [sigBytes, setSigBytes] = useState<Uint8Array | null>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [sigNatural, setSigNatural] = useState<{ w: number; h: number } | null>(
    null,
  );

  const [viewSize, setViewSize] = useState<{ w: number; h: number } | null>(null);
  const [sigBox, setSigBox] = useState<Rect | null>(null);
  const lastPageForBoxRef = useRef<number | null>(null);
  const lastNaturalKeyRef = useRef<string>("");
  const lastRenderedVpRef = useRef<{
    w: number;
    h: number;
    page: number;
  } | null>(null);

  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const interactionRef = useRef<
    | {
        kind: "move";
        startX: number;
        startY: number;
        startBox: Rect;
      }
    | {
        kind: "resize";
        corner: Corner;
        startX: number;
        startY: number;
        startBox: Rect;
      }
    | null
  >(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ver = pdfjs.version;
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${ver}/build/pdf.worker.min.mjs`;
    setWorkerReady(true);
  }, []);

  const revokeSigUrl = useCallback(() => {
    setSigUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(() => {
    return () => revokeSigUrl();
  }, [revokeSigUrl]);

  const closePdf = useCallback(() => {
    pdfTaskRef.current?.destroy?.();
    pdfTaskRef.current = null;
    void pdfProxyRef.current?.destroy();
    pdfProxyRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      closePdf();
    };
  }, [closePdf]);

  const loadPdf = useCallback(
    async (file: File) => {
      if (!workerReady) return;
      setPdfError(null);
      closePdf();
      setPageCount(0);
      setPageIndex(0);
      setViewSize(null);
      setSigBox(null);
      lastPageForBoxRef.current = null;
      lastRenderedVpRef.current = null;

      try {
        const buf = await file.arrayBuffer();
        const u8 = new Uint8Array(buf);
        const task = pdfjs.getDocument({ data: u8.slice() });
        pdfTaskRef.current = task;
        const proxy = await task.promise;
        pdfProxyRef.current = proxy;
        pdfTaskRef.current = null;
        setPageCount(proxy.numPages);
        setPdfFile(file);
      } catch (e) {
        closePdf();
        setPdfFile(null);
        setPdfError(
          e instanceof Error ? e.message : t("workspace.pdfSignPdfLoadError"),
        );
      }
    },
    [closePdf, workerReady, t],
  );

  const onPdfInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      if (!f.name.toLowerCase().endsWith(".pdf")) {
        setPdfError(t("workspace.pdfSignPdfOnly"));
        return;
      }
      void loadPdf(f);
    },
    [loadPdf, t],
  );

  const onSigInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      const lower = f.name.toLowerCase();
      const okPng = f.type === "image/png" || lower.endsWith(".png");
      if (!okPng) {
        setMergeError(t("workspace.pdfSignPngOnly"));
        return;
      }
      setMergeError(null);
      revokeSigUrl();
      lastNaturalKeyRef.current = "";
      setSigBox(null);
      const bytes = new Uint8Array(await f.arrayBuffer());
      setSigBytes(bytes);
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      setSigUrl(url);
      setSigNatural(null);
    },
    [revokeSigUrl, t],
  );

  const renderPdfPage = useCallback(async () => {
    const proxy = pdfProxyRef.current;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!proxy || !canvas || !wrap) return;

    setRendering(true);
    try {
      const page = await proxy.getPage(pageIndex + 1);
      const baseVp = page.getViewport({ scale: 1 });
      const pageW = baseVp.width;

      const maxCssW = Math.min(720, wrap.clientWidth || 720);
      const scale = maxCssW / pageW;
      const vp = page.getViewport({ scale });

      const prevR = lastRenderedVpRef.current;
      if (
        prevR &&
        prevR.page === pageIndex &&
        Math.abs(prevR.w - vp.width) < 0.5 &&
        Math.abs(prevR.h - vp.height) < 0.5
      ) {
        setRendering(false);
        return;
      }
      lastRenderedVpRef.current = {
        w: vp.width,
        h: vp.height,
        page: pageIndex,
      };

      const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, vp.width, vp.height);

      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      setViewSize({ w: vp.width, h: vp.height });
    } catch (e) {
      setPdfError(
        e instanceof Error ? e.message : t("workspace.pdfSignRenderError"),
      );
    } finally {
      setRendering(false);
    }
  }, [pageIndex, t]);

  useLayoutEffect(() => {
    if (!pdfFile || !workerReady || pageCount === 0) return;
    void renderPdfPage();
  }, [pdfFile, pageCount, pageIndex, workerReady, renderPdfPage]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      void renderPdfPage();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [renderPdfPage]);

  useLayoutEffect(() => {
    if (!viewSize || !sigNatural) return;
    const nk = `${sigNatural.w}x${sigNatural.h}`;
    const pageFlip =
      lastPageForBoxRef.current !== null &&
      lastPageForBoxRef.current !== pageIndex;
    const natFlip =
      lastNaturalKeyRef.current !== "" && lastNaturalKeyRef.current !== nk;

    setSigBox((prev) => {
      if (pageFlip || natFlip || !prev) {
        return defaultSignatureBox(
          viewSize.w,
          viewSize.h,
          sigNatural.w,
          sigNatural.h,
        );
      }
      return clampRect(prev, viewSize.w, viewSize.h);
    });

    lastPageForBoxRef.current = pageIndex;
    lastNaturalKeyRef.current = nk;
  }, [viewSize, sigNatural, pageIndex]);

  const onSigImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setSigNatural({ w: img.naturalWidth, h: img.naturalHeight });
    },
    [],
  );

  const endPointer = useCallback(() => {
    interactionRef.current = null;
  }, []);

  const onPointerMove = useCallback(
    (ev: PointerEvent) => {
      const inter = interactionRef.current;
      const vs = viewSize;
      if (!inter || !vs) return;

      const dx = ev.clientX - inter.startX;
      const dy = ev.clientY - inter.startY;
      const b0 = inter.startBox;
      let next: Rect = { ...b0 };

      if (inter.kind === "move") {
        next = {
          ...b0,
          left: b0.left + dx,
          top: b0.top + dy,
        };
      } else if (inter.kind === "resize") {
        const c = inter.corner;
        if (c === "se") {
          next = {
            ...b0,
            width: b0.width + dx,
            height: b0.height + dy,
          };
        } else if (c === "sw") {
          next = {
            left: b0.left + dx,
            top: b0.top,
            width: b0.width - dx,
            height: b0.height + dy,
          };
        } else if (c === "ne") {
          next = {
            left: b0.left,
            top: b0.top + dy,
            width: b0.width + dx,
            height: b0.height - dy,
          };
        } else if (c === "nw") {
          next = {
            left: b0.left + dx,
            top: b0.top + dy,
            width: b0.width - dx,
            height: b0.height - dy,
          };
        }
      }

      setSigBox(clampRect(next, vs.w, vs.h));
    },
    [viewSize],
  );

  useEffect(() => {
    const up = () => endPointer();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [endPointer]);

  useEffect(() => {
    const move = (ev: PointerEvent) => onPointerMove(ev);
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [onPointerMove]);

  const beginMove = useCallback(
    (ev: React.PointerEvent) => {
      if (!sigBox) return;
      ev.preventDefault();
      interactionRef.current = {
        kind: "move",
        startX: ev.clientX,
        startY: ev.clientY,
        startBox: { ...sigBox },
      };
    },
    [sigBox],
  );

  const beginResize = useCallback(
    (corner: Corner, ev: React.PointerEvent) => {
      if (!sigBox) return;
      ev.preventDefault();
      ev.stopPropagation();
      interactionRef.current = {
        kind: "resize",
        corner,
        startX: ev.clientX,
        startY: ev.clientY,
        startBox: { ...sigBox },
      };
    },
    [sigBox],
  );

  const handleDownload = useCallback(async () => {
    if (!pdfFile || !sigBytes || !viewSize || !sigBox) return;
    setMergeError(null);
    setMergeBusy(true);
    try {
      const raw = new Uint8Array(await pdfFile.arrayBuffer());
      const doc = await PDFDocument.load(raw);
      const pages = doc.getPages();
      const page = pages[pageIndex];
      if (!page) throw new Error(t("workspace.pdfSignPageMissing"));

      const { width: pageWPt, height: pageHPt } = page.getSize();
      const scale = pageWPt / viewSize.w;
      const xPt = sigBox.left * scale;
      const wPt = sigBox.width * scale;
      const hPt = sigBox.height * scale;
      const yPt = pageHPt - (sigBox.top + sigBox.height) * scale;

      const png = await doc.embedPng(sigBytes);
      page.drawImage(png, { x: xPt, y: yPt, width: wPt, height: hPt });

      const out = await doc.save();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = signedDownloadName(pdfFile.name);
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
    } catch (e) {
      setMergeError(
        e instanceof Error ? e.message : t("workspace.pdfSignMergeError"),
      );
    } finally {
      setMergeBusy(false);
    }
  }, [pdfFile, sigBytes, viewSize, sigBox, pageIndex, t]);

  const canMerge =
    Boolean(pdfFile && sigBytes && viewSize && sigBox && pageCount > 0);

  return (
    <div className="space-y-6">
      {sigUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- decode PNG dimensions before overlay mounts
        <img
          src={sigUrl}
          alt=""
          className="pointer-events-none h-0 w-0 overflow-hidden opacity-0"
          aria-hidden
          onLoad={onSigImgLoad}
        />
      ) : null}
      <div>
        <h2 className="text-lg font-semibold">{t("workspace.pdfSignTitle")}</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {t("workspace.pdfSignBlurb")}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800">
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
          {t("workspace.pdfSignPickPdf")}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={onPdfInput}
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800">
          <FileImage className="h-4 w-4 shrink-0" aria-hidden />
          {t("workspace.pdfSignPickPng")}
          <input
            type="file"
            accept="image/png,.png"
            className="hidden"
            onChange={onSigInput}
          />
        </label>
      </div>

      {pdfError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{pdfError}</p>
      ) : null}
      {mergeError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{mergeError}</p>
      ) : null}

      {pageCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-neutral-700 dark:text-neutral-300">
            {t("workspace.pdfSignPageLabel")}
            <select
              className="ml-2 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-900"
              value={pageIndex}
              onChange={(e) => setPageIndex(Number(e.target.value))}
            >
              {Array.from({ length: pageCount }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1} / {pageCount}
                </option>
              ))}
            </select>
          </label>
          {rendering ? (
            <span className="text-xs text-neutral-500">
              {t("workspace.pdfSignRendering")}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        ref={wrapRef}
        className="relative inline-block max-w-full overflow-auto rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-950"
      >
        <canvas ref={canvasRef} className="block max-w-full" />
        {sigUrl && viewSize && sigBox ? (
          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: viewSize.w, height: viewSize.h }}
          >
            <div
              className="pointer-events-auto absolute border-2 border-cyan-600 bg-cyan-500/15 shadow-md dark:border-cyan-400"
              style={{
                left: sigBox.left,
                top: sigBox.top,
                width: sigBox.width,
                height: sigBox.height,
              }}
              onPointerDown={beginMove}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sigUrl}
                alt=""
                className="h-full w-full cursor-move select-none object-fill"
                draggable={false}
              />
              {(
                [
                  ["nw", -HANDLE / 2, -HANDLE / 2, "nw-resize"],
                  ["ne", sigBox.width - HANDLE / 2, -HANDLE / 2, "ne-resize"],
                  ["sw", -HANDLE / 2, sigBox.height - HANDLE / 2, "sw-resize"],
                  [
                    "se",
                    sigBox.width - HANDLE / 2,
                    sigBox.height - HANDLE / 2,
                    "se-resize",
                  ],
                ] as const
              ).map(([corner, x, y, cur]) => (
                <button
                  key={corner}
                  type="button"
                  aria-label={corner}
                  className="absolute z-10 touch-none rounded-sm border border-cyan-700 bg-white dark:border-cyan-300 dark:bg-neutral-900"
                  style={{
                    left: x,
                    top: y,
                    width: HANDLE,
                    height: HANDLE,
                    cursor: cur,
                  }}
                  onPointerDown={(ev) => beginResize(corner, ev)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {sigUrl && viewSize && sigBox ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {t("workspace.pdfSignHintDrag")}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          disabled={!canMerge || mergeBusy}
          onClick={() => void handleDownload()}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-700 dark:hover:bg-cyan-600"
        >
          <Download className="h-4 w-4" aria-hidden />
          {mergeBusy ? t("workspace.pdfSignBusy") : t("workspace.pdfSignDownload")}
        </button>
      </div>
    </div>
  );
}
