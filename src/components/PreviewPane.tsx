"use client";

import { useRef, useEffect, useState } from "react";

/** Find an element in the preview that matches the selected code (id, class, style, tag + text, or plain text). */
function findElementFromCode(body: HTMLElement, code: string): Element | null {
  const trimmed = code.trim();
  if (!trimmed.length) return null;

  // 1) Prefer id (unique)
  const idMatch = trimmed.match(/id\s*=\s*["']([^"']+)["']/i);
  if (idMatch) {
    const id = idMatch[1].replace(/\s+/g, "");
    if (id) {
      try {
        const el = body.querySelector(`#${CSS.escape(id)}`);
        if (el) return el;
      } catch {
        /* invalid id */
      }
    }
  }

  const classMatch = trimmed.match(/class\s*=\s*["']([^"']+)["']/i);
  const classes = classMatch
    ? classMatch[1].split(/\s+/).map((c) => c.trim()).filter((c) => c.length > 1)
    : [];
  const tagMatch = trimmed.match(/<(\w+)[\s>]/i);
  const tag = tagMatch ? tagMatch[1].toLowerCase() : null;
  const styleMatch = trimmed.match(/style\s*=\s*["']([^"']*)["']/i);
  const styleStr = styleMatch ? styleMatch[1].trim() : null;
  // Distinctive style snippet (first prop:value or a short substring) for matching when no id/class
  const styleSnippet = styleStr
    ? (styleStr.match(/[a-z-]+\s*:\s*[^;]+/i)?.[0]?.trim() ?? styleStr.slice(0, 40))
    : null;

  // 2) Class(es): try most specific first (tag + all classes), then tag + first class, then each class alone
  if (classes.length > 0 && tag) {
    try {
      const combined = `${tag}.${classes.map((c) => CSS.escape(c)).join(".")}`;
      const el = body.querySelector(combined);
      if (el) return el;
    } catch {
      /* invalid */
    }
    try {
      const el = body.querySelector(`${tag}.${CSS.escape(classes[0])}`);
      if (el) return el;
    } catch {
      /* invalid */
    }
  }
  if (classes.length > 0) {
    for (const c of classes) {
      try {
        const el = body.querySelector(`.${CSS.escape(c)}`);
        if (el) return el;
      } catch {
        /* invalid class */
      }
    }
  }

  // 3) If selection looks like an img tag, preview replaced imgs with placeholders
  if (/\b<img\b/i.test(trimmed)) {
    const placeholder = body.querySelector("[data-image-placeholder]");
    if (placeholder) return placeholder;
  }

  // 4) Tag + style (no id/class): e.g. <td style="width:120px;"> or <div style="font-weight:bold">
  const normStyle = (x: string) => x.replace(/\s*:\s*/g, ":").replace(/\s+/g, " ").toLowerCase();
  if (tag && styleSnippet) {
    const needle = normStyle(styleSnippet);
    const all = Array.from(body.querySelectorAll(tag));
    for (const el of all) {
      const s = normStyle(el.getAttribute("style") ?? "");
      if (s.includes(needle)) return el;
    }
  }
  // 4b) Style only (no tag in selection): match any element whose style contains the snippet
  if (styleSnippet && !tag) {
    const needle = normStyle(styleSnippet);
    const candidates = Array.from(body.querySelectorAll("[data-node-id]")).filter((el) => {
      const s = normStyle(el.getAttribute("style") ?? "");
      return s.includes(needle);
    });
    if (candidates.length > 0) {
      return candidates.reduce((a, b) =>
        (a.textContent ?? "").length <= (b.textContent ?? "").length ? a : b
      );
    }
  }

  // 5) Tag + containing text: e.g. <div style="...">YOUR RESERVATION</div> or selection that includes both tag and text
  const textContentMatch = trimmed.replace(/\s+/g, " ").replace(/<[^>]+>/g, " ").trim();
  const distinctiveText = textContentMatch.length >= 2 && textContentMatch.length <= 200 ? textContentMatch : null;
  if (tag && distinctiveText) {
    const normalized = distinctiveText.toLowerCase();
    const candidates = Array.from(body.querySelectorAll(tag)).filter((el) => {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").toLowerCase();
      return text.includes(normalized);
    });
    if (candidates.length > 0) {
      return candidates.reduce((a, b) =>
        (a.textContent ?? "").length <= (b.textContent ?? "").length ? a : b
      );
    }
  }

  // 6) Tag only (with optional class we already tried): first matching tag
  if (tag) {
    const first = body.querySelector(tag);
    if (first) return first;
  }

  // 7) Plain text only (no tags): find smallest element whose text content contains this string
  if (!/<|>/.test(trimmed) && trimmed.length < 300) {
    const normalized = trimmed.replace(/\s+/g, " ").toLowerCase();
    const candidates = Array.from(body.querySelectorAll("[data-node-id]")).filter((el) => {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").toLowerCase();
      return text.includes(normalized);
    });
    if (candidates.length > 0) {
      return candidates.reduce((a, b) =>
        (a.textContent ?? "").length <= (b.textContent ?? "").length ? a : b
      );
    }
  }

  // 8) Mixed selection with text: strip tags and try plain-text match
  if (trimmed.length >= 2 && trimmed.length <= 300) {
    const stripped = trimmed.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length >= 2) {
      const normalized = stripped.toLowerCase();
      const candidates = Array.from(body.querySelectorAll("[data-node-id]")).filter((el) => {
        const text = (el.textContent ?? "").replace(/\s+/g, " ").toLowerCase();
        return text.includes(normalized);
      });
      if (candidates.length > 0) {
        return candidates.reduce((a, b) =>
          (a.textContent ?? "").length <= (b.textContent ?? "").length ? a : b
        );
      }
    }
  }

  return null;
}

/** Inline SVG for image placeholder icon (picture outline). */
const IMAGE_PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';

/** Replace all img elements in the document with a same-size placeholder showing an icon. */
function replaceImagesWithPlaceholder(doc: Document): void {
  const imgs = doc.querySelectorAll("img");
  imgs.forEach((img) => {
    const w = img.getAttribute("width") ?? (img as HTMLElement).style.width ?? "";
    const h = img.getAttribute("height") ?? (img as HTMLElement).style.height ?? "";
    const display = (img as HTMLElement).style.display || "block";
    const align = img.getAttribute("align");
    const wrapper = doc.createElement("span");
    wrapper.setAttribute("data-image-placeholder", "1");
    const nodeId = img.getAttribute("data-node-id");
    if (nodeId != null && nodeId !== "") wrapper.setAttribute("data-node-id", nodeId);
    wrapper.setAttribute("data-tag-name", "img");
    wrapper.style.display = "inline-flex";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.verticalAlign = align === "middle" ? "middle" : align === "bottom" ? "bottom" : "top";
    if (w) wrapper.style.width = w === "auto" ? "auto" : /^\d+$/.test(String(w)) ? `${w}px` : String(w);
    if (h) wrapper.style.height = h === "auto" ? "auto" : /^\d+$/.test(String(h)) ? `${h}px` : String(h);
    wrapper.style.minWidth = "24px";
    wrapper.style.minHeight = "24px";
    wrapper.style.backgroundColor = "#f1f5f9";
    wrapper.style.boxSizing = "border-box";
    wrapper.style.overflow = "hidden";
    wrapper.innerHTML = `<span style="display:block;width:min(48px,100%);height:min(48px,100%);flex-shrink:0;">${IMAGE_PLACEHOLDER_SVG}</span>`;
    if (img.parentNode) img.parentNode.replaceChild(wrapper, img);
  });
}

interface PreviewPaneProps {
  html: string;
  selectedNodeId: number | null;
  onSelectNode: (nodeId: number) => void;
  /** Map preview index (data-node-id) to actual nodeId (for remaining nodes after removals). */
  indexToNodeId: (index: number) => number;
  /** Node-based: highlight the preview element at this index (from selection range → node). Preferred over highlightFromCode. */
  highlightPreviewIndex?: number | null;
  /** Fallback: when user selects text in the template editor, highlight by matching id/class/style/text. */
  highlightFromCode?: string | null;
}

export function PreviewPane({
  html,
  selectedNodeId,
  onSelectNode,
  indexToNodeId,
  highlightPreviewIndex,
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
    doc.documentElement.style.overflowY = "auto";
    body.style.minHeight = "100%";
    body.style.overflowY = "auto";

    // Replace images with a same-size placeholder icon (preserves layout; avoids broken external URLs)
    replaceImagesWithPlaceholder(doc);

    let styleEl = doc.querySelector("style[data-preview-styles]");
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.setAttribute("data-preview-styles", "1");
      styleEl.textContent = `
        [data-node-id], [data-image-placeholder] { cursor: pointer; position: relative; }
        [data-node-id]:hover, [data-image-placeholder]:hover { outline: 2px solid #6366f1; outline-offset: 2px; }
        [data-node-id].selected, [data-image-placeholder].selected { outline: 2px solid #6366f1; outline-offset: 2px; background: rgba(99,102,241,0.1); }
        .highlight-from-code { outline: 2px solid #eab308 !important; outline-offset: 2px; background: rgba(234,179,8,0.15) !important; }
        [data-node-id]::after, [data-image-placeholder]::after {
          content: attr(data-tag-name);
          position: absolute; top: 2px; left: 2px;
          font: 10px/1.2 system-ui, sans-serif;
          background: rgba(99,102,241,0.9); color: #fff;
          padding: 1px 4px; border-radius: 3px;
          pointer-events: none; opacity: 0;
          z-index: 1;
        }
        [data-node-id]:hover::after, [data-node-id].selected::after, [data-node-id].highlight-from-code::after,
        [data-image-placeholder]:hover::after, [data-image-placeholder].selected::after, [data-image-placeholder].highlight-from-code::after {
          opacity: 1;
        }
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
        const target = e.target as HTMLElement;
        const el = target.closest?.("[data-node-id]") ?? target.closest?.("[data-image-placeholder]");
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        const idStr = el.getAttribute("data-node-id");
        if (idStr == null || idStr === "") return;
        const id = parseInt(idStr, 10);
        if (!Number.isNaN(id) && id >= 0) onSelectNodeRef.current(indexToNodeIdRef.current(id));
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

  // Highlight in preview: node-based (from selection range) takes precedence; else fallback to code match (id/class/style/text)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    const body = iframe.contentDocument.body;
    body.querySelectorAll(".highlight-from-code").forEach((el) => el.classList.remove("highlight-from-code"));
    body.querySelectorAll("[data-image-placeholder].highlight-from-code").forEach((el) => el.classList.remove("highlight-from-code"));

    if (highlightPreviewIndex != null && highlightPreviewIndex >= 0) {
      const el = body.querySelector(`[data-node-id="${highlightPreviewIndex}"]`) ?? body.querySelector(`[data-image-placeholder][data-node-id="${highlightPreviewIndex}"]`);
      if (el) {
        (el as HTMLElement).classList.add("highlight-from-code");
        (el as HTMLElement).scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } else if (highlightFromCode?.trim()) {
      const el = findElementFromCode(body, highlightFromCode);
      if (el) {
        (el as HTMLElement).classList.add("highlight-from-code");
        (el as HTMLElement).scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [html, highlightPreviewIndex, highlightFromCode]);

  return (
    <div className="h-full min-h-[520px] rounded-lg border border-[var(--editor-border)] bg-[var(--panel-bg)] overflow-auto flex-1 flex flex-col min-h-0">
      <iframe
        ref={iframeRef}
        title="Preview"
        className="w-full flex-1 min-h-[520px] border-0 preview-frame"
        sandbox="allow-same-origin"
        src="about:blank"
      />
    </div>
  );
}
