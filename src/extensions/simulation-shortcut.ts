import { Editor, Extension } from "@tiptap/core";

export type SimulationShortcutPayload = {
  selection: string;
  fullDocument: string;
  from: number;
  to: number;
};

/**
 * ⌘⇧A / Ctrl+Shift+A：捕获选区与全文，交给回调（由父组件写入推演 context）。
 */
export const SimulationShortcut = Extension.create<{
  onModShiftA: (editor: Editor, payload: SimulationShortcutPayload) => void;
}>({
  name: "simulationShortcut",

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-a": () => {
        const editor = this.editor;
        const { state } = editor;
        const { from, to } = state.selection;
        const doc = state.doc;
        const payload = {
          selection: doc.textBetween(from, to, "\n\n", "\n\n"),
          fullDocument: doc.textBetween(0, doc.content.size, "\n\n", "\n\n"),
          from,
          to,
        };
        this.options.onModShiftA(editor, payload);
        return true;
      },
    };
  },
});
