"use client";

import { useCallback, useRef, useEffect, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";

const setHighlightRangeEffect = StateEffect.define<{ from: number; to: number } | null>();

const highlightRangeField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(set, tr) {
    for (const e of tr.effects) {
      if (e.is(setHighlightRangeEffect)) {
        const range = e.value;
        if (!range) return Decoration.none;
        return Decoration.set([
          Decoration.mark({ class: "cm-highlight-from-preview" }).range(range.from, range.to),
        ]);
      }
    }
    return set.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: "html" | "json";
  height?: string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  /** "dark" uses oneDark theme; "light" uses default light editor. */
  theme?: "light" | "dark";
  /** When selection changes in the editor, call with the selected text (for syncing to preview). */
  onSelectionChange?: (selectedText: string) => void;
  /** When selection changes, call with the character range { from, to } for node-based preview sync. */
  onSelectionRange?: (range: { from: number; to: number } | null) => void;
  /** Highlight this range in the editor (e.g. when user selects an element in the preview). */
  highlightRange?: { from: number; to: number } | null;
}

export function CodeEditor({
  value,
  onChange,
  language,
  height = "12rem",
  readOnly = false,
  placeholder,
  className = "",
  theme = "dark",
  onSelectionChange,
  onSelectionRange,
  highlightRange = null,
}: CodeEditorProps) {
  const viewRef = useRef<EditorView | null>(null);
  const onSelectionRangeRef = useRef(onSelectionRange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => {
    onSelectionRangeRef.current = onSelectionRange;
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionRange, onSelectionChange]);

  const selectionSyncExtension = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        const { from, to } = update.state.selection.main;
        const range = { from, to };
        onSelectionRangeRef.current?.(range);
        if (onSelectionChangeRef.current) {
          if (from === to) onSelectionChangeRef.current("");
          else onSelectionChangeRef.current(update.state.sliceDoc(from, to));
        }
      }),
    []
  );

  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      language === "html" ? html() : json(),
      highlightRangeField,
      selectionSyncExtension,
    ],
    [language, selectionSyncExtension]
  );

  const handleUpdate = useCallback(
    (update: unknown) => {
      const u = update as { state?: { selection?: { main?: { from: number; to: number } }; doc?: { sliceDoc: (f: number, t: number) => string } } };
      const main = u.state?.selection?.main;
      const from = main?.from ?? 0;
      const to = main?.to ?? 0;
      if (onSelectionRange) onSelectionRange({ from, to });
      if (onSelectionChange) {
        if (from === to) onSelectionChange("");
        else if (u.state?.doc) onSelectionChange(u.state.doc.sliceDoc(from, to));
      }
    },
    [onSelectionChange, onSelectionRange]
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (highlightRange == null) {
      view.dispatch({ effects: setHighlightRangeEffect.of(null) });
      return;
    }
    const { from, to } = highlightRange;
    view.dispatch({
      effects: [
        setHighlightRangeEffect.of({ from, to }),
        EditorView.scrollIntoView(from, { y: "center" }),
      ],
    });
  }, [highlightRange?.from, highlightRange?.to, highlightRange]);

  const isFillHeight = height === "100%";
  return (
    <div
      className={`rounded-lg border border-[var(--editor-border)] bg-[var(--panel-bg)] ${className}`}
      style={
        isFillHeight
          ? { height: "100%", minHeight: 0, overflow: "hidden" }
          : { minHeight: height, overflow: "hidden" }
      }
    >
      <CodeMirror
        value={value}
        height={isFillHeight ? "100%" : height}
        theme={theme === "dark" ? oneDark : undefined}
        extensions={extensions}
        onChange={readOnly ? undefined : onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        onUpdate={onSelectionChange || onSelectionRange ? handleUpdate : undefined}
        onCreateEditor={(view) => {
          viewRef.current = view;
        }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          bracketMatching: true,
          indentOnInput: true,
          // Ensure standard shortcuts: Ctrl+C/V/X (copy/paste/cut), Ctrl+Z/Y (undo/redo), Ctrl+A (select all)
          defaultKeymap: true,
          historyKeymap: true,
        }}
        style={{
          fontSize: "15px",
        }}
      />
    </div>
  );
}
