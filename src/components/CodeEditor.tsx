"use client";

import { useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: "html" | "json";
  height?: string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  /** When selection changes in the editor, call with the selected text (for syncing to preview). */
  onSelectionChange?: (selectedText: string) => void;
}

export function CodeEditor({
  value,
  onChange,
  language,
  height = "12rem",
  readOnly = false,
  placeholder,
  className = "",
  onSelectionChange,
}: CodeEditorProps) {
  const extensions = [
    EditorView.lineWrapping,
    language === "html" ? html() : json(),
  ];

  const handleUpdate = useCallback(
    (update: unknown) => {
      if (!onSelectionChange) return;
      const u = update as { selectionSet?: boolean; state: { selection: { main: { from: number; to: number } }; doc: { sliceDoc: (f: number, t: number) => string } } };
      if (!u.selectionSet) return;
      const { from, to } = u.state.selection.main;
      if (from === to) {
        onSelectionChange("");
        return;
      }
      const text = u.state.doc.sliceDoc(from, to);
      onSelectionChange(text);
    },
    [onSelectionChange]
  );

  return (
    <div
      className={`rounded-lg overflow-hidden border border-[var(--editor-border)] bg-[var(--panel-bg)] ${className}`}
      style={{ minHeight: height }}
    >
      <CodeMirror
        value={value}
        height={height}
        theme={oneDark}
        extensions={extensions}
        onChange={readOnly ? undefined : onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        onUpdate={onSelectionChange ? handleUpdate : undefined}
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
          fontSize: "13px",
        }}
      />
    </div>
  );
}
