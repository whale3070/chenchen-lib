import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** ProseMirror 失焦后原生选区高亮会消失；用 decoration 锁住打开推演面板时的 from/to */
export const selectionLockPluginKey = new PluginKey<DecorationSet>(
  "chenchenSelectionLock",
);

type LockMeta =
  | { type: "set"; from: number; to: number }
  | { type: "clear" };

function decorationsForRange(
  doc: Parameters<typeof DecorationSet.create>[0],
  from: number,
  to: number,
): DecorationSet {
  const max = doc.content.size;
  const f = Math.max(0, Math.min(from, max));
  const t = Math.max(0, Math.min(to, max));
  const a = Math.min(f, t);
  const b = Math.max(f, t);

  try {
    if (a === b) {
      return DecorationSet.create(doc, [
        Decoration.widget(
          a,
          () => {
            const el = document.createElement("span");
            el.className = "selection-lock-caret";
            el.setAttribute("aria-hidden", "true");
            return el;
          },
          { side: 0, key: "chenchen-lock-caret" },
        ),
      ]);
    }
    return DecorationSet.create(doc, [
      Decoration.inline(a, b, {
        class: "selection-lock-highlight",
        "data-selection-lock": "true",
      }),
    ]);
  } catch {
    return DecorationSet.empty;
  }
}

export const SelectionLock = Extension.create({
  name: "selectionLock",

  addProseMirrorPlugins() {
    const key = selectionLockPluginKey;
    return [
      new Plugin({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, oldSet) {
            const meta = tr.getMeta(key) as LockMeta | undefined;
            if (meta?.type === "clear") {
              return DecorationSet.empty;
            }
            if (meta?.type === "set") {
              return decorationsForRange(tr.doc, meta.from, meta.to);
            }
            if (tr.docChanged) {
              return oldSet.map(tr.mapping, tr.doc);
            }
            return oldSet;
          },
        },
        props: {
          decorations(state) {
            return key.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },

  addCommands() {
    const key = selectionLockPluginKey;
    return {
      setSelectionLock:
        (range: { from: number; to: number }) =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(
              state.tr.setMeta(key, {
                type: "set",
                from: range.from,
                to: range.to,
              }),
            );
          }
          return true;
        },
      clearSelectionLock:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(state.tr.setMeta(key, { type: "clear" }));
          }
          return true;
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    setSelectionLock: {
      setSelectionLock: (range: {
        from: number;
        to: number;
      }) => ReturnType;
    };
    clearSelectionLock: {
      clearSelectionLock: () => ReturnType;
    };
  }
}
