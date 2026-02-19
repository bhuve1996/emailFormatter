"use client";

import { useRef, useEffect, useState } from "react";

/** Extract a CSS selector from selected code (class="..." or id="...") to find element in preview. */
function selectorFromCode(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed.length) return null;
  const idMatch = trimmed.match(/id\s*=\s*["']([^"']+)["']/i);
  if (idMatch) return `#${idMatch[1].replace(/\s+/g, "")}`;
  const classMatch = trimmed.match(/class\s*=\s*["']([^"']+)["']/i);
  if (classMatch) {
    const firstClass = classMatch[1].split(/\s+/)[0]?.trim();
    if (firstClass && firstClass.length > 1) return `.${firstClass}`;
  }
  return null;
}

interface PreviewPaneProps {
  html: string;
  selectedNodeId: number | null;
  onSelectNode: (nodeId: number) => void;
  /** Map preview index (data-node-id) to actual nodeId (for remaining nodes after removals). */
  indexToNodeId: (index: number) => number;
  /** When user selects text in the template editor, highlight the matching element in preview. */
  highlightFromCode?: string | null;
}

export function PreviewPane({
  html,
  selectedNodeId,
  onSelectNode,
  indexToNodeId,
  highlightFromCode,
}: PreviewPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const onSelectNodeRef = useRef(onSelectNode);
  const indexToNodeIdRef = useRef(indexToNodeId);
  onSelectNodeRef.current = onSelectNode;
  indexToNodeIdRef.current = indexToNodeId;

  // Inject HTML when iframe document is ready (survives innerHTML updates; click is delegated on body)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;

    const doc = iframe.contentDocument;
    const body = doc.body;

    body.innerHTML = html;
    body.style.margin = "0";
    body.style.padding = "8px";
    body.style.fontFamily = "system-ui, sans-serif";
    doc.documentElement.style.height = "100%";
    body.style.minHeight = "100%";

    let styleEl = doc.querySelector("style[data-preview-styles]");
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.setAttribute("data-preview-styles", "1");
      styleEl.textContent = `
        [data-node-id] { cursor: pointer; }
        [data-node-id]:hover { outline: 2px solid #6366f1; outline-offset: 2px; }
        [data-node-id].selected { outline: 2px solid #6366f1; outline-offset: 2px; background: rgba(99,102,241,0.1); }
        .highlight-from-code { outline: 2px solid #eab308 !important; outline-offset: 2px; background: rgba(234,179,8,0.15) !important; }
      `;
      doc.head.appendChild(styleEl);
    }
  }, [html, iframeReady]);

  // Single delegated click listener on iframe body (attach once when iframe is ready)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let clickCleanup: (() => void) | undefined;

    const attachClick = () => {
      const body = iframe.contentDocument?.body;
      if (!body) return;
      const handleClick = (e: MouseEvent) => {
        const el = (e.target as HTMLElement).closest?.("[data-node-id]");
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        const id = parseInt(el.getAttribute("data-node-id") ?? "-1", 10);
        if (id >= 0) onSelectNodeRef.current(indexToNodeIdRef.current(id));
      };
      body.addEventListener("click", handleClick, true);
      clickCleanup = () => body.removeEventListener("click", handleClick, true);
    };

    const onLoad = () => {
      setIframeReady(true);
      attachClick();
    };
    if (iframe.contentDocument?.body) {
      onLoad();
      return () => clickCleanup?.();
    }
    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      clickCleanup?.();
    };
  }, []);

  // Highlight selected in iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    iframe.contentDocument.body.querySelectorAll("[data-node-id].selected").forEach((el) => {
      el.classList.remove("selected");
    });
    if (selectedNodeId !== null) {
      const all = iframe.contentDocument.body.querySelectorAll("[data-node-id]");
      all.forEach((el) => {
        const idx = parseInt((el as HTMLElement).getAttribute("data-node-id") ?? "-1", 10);
        if (idx >= 0 && indexToNodeId(idx) === selectedNodeId) el.classList.add("selected");
      });
    }
  }, [selectedNodeId, indexToNodeId, html]);

  // Highlight in preview the element that matches the selected code (class/id)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    iframe.contentDocument.body.querySelectorAll(".highlight-from-code").forEach((el) => el.classList.remove("highlight-from-code"));
    if (highlightFromCode?.trim()) {
      const selector = selectorFromCode(highlightFromCode);
      if (selector) {
        try {
          const el = iframe.contentDocument.body.querySelector(selector);
          if (el) {
            el.classList.add("highlight-from-code");
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        } catch {
          // invalid selector, ignore
        }
      }
    }
  }, [html, highlightFromCode]);

  return (
    <div className="h-full min-h-[240px] rounded-lg border border-[var(--editor-border)] bg-white overflow-hidden">
      <iframe
        ref={iframeRef}
        title="Preview"
        className="w-full h-full min-h-[240px] border-0 preview-frame"
        sandbox="allow-same-origin"
        src="about:blank"
      />
    </div>
  );
}
