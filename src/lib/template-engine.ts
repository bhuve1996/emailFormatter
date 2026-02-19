/**
 * Template engine: substitute variables, parse with source positions,
 * apply edits without disturbing formatting.
 * Supports {{name}} and ${expression} (e.g. FreeMarker-style dotted paths).
 *
 * WHITESPACE / EMAIL SAFETY: We never trim or normalize spaces in the template or output.
 * - Spacing between tags (e.g. newlines or spaces between </div> and <span>) is never stripped or collapsed.
 * - substituteVariables: only replaces {{key}} and ${expr} with values; all other characters (spaces, newlines, indentation) are preserved.
 * - stripFreeMarkerDirectives: only removes <#...> and </#...> tags; text and spaces outside them (including between any tags) are unchanged.
 * - applyEdits: only uses slice + insert (removals and style injection); no trim or replace on the rest of the string.
 * Outputted code has the same spaces and line breaks as the source except where the user explicitly removed content or we injected a style attribute.
 */

import { parseFragment, serialize } from "parse5";

const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;
/** Matches ${...} including dotted paths and optional ?has_content etc. */
const EXPRESSION_REGEX = /\$\{([^}]+)\}/g;

/** Dummy data: flat keys or nested objects for dotted path lookup (e.g. item.Product.Quantity). */
export type DummyData = Record<string, string | number | boolean | Record<string, unknown> | unknown>;

/** Get value by dotted path (e.g. "item.Product.Quantity" from { item: { Product: { Quantity: 2 } } }). */
function getByPath(data: Record<string, unknown>, path: string): unknown {
  const parts = path.trim().split(".");
  let current: unknown = data;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p.trim()];
  }
  return current;
}

/**
 * Substitute {{variable}} and ${expression} with values from dummy data.
 * Preserves all whitespace: only the matched placeholder is replaced; surrounding spaces/newlines
 * and spacing between tags are never touched or stripped.
 */
export function substituteVariables(
  template: string,
  dummyData: DummyData
): string {
  let out = template;
  out = out.replace(VARIABLE_REGEX, (_, key: string) => {
    const val = dummyData[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
  out = out.replace(EXPRESSION_REGEX, (_, expr: string) => {
    const path = expr.replace(/\?has_content$/, "").trim();
    const val = dummyData[path] !== undefined ? dummyData[path] : getByPath(dummyData, path);
    return val !== undefined && val !== null ? String(val) : `\${${expr}}`;
  });
  return out;
}

/** Extract variable/expression names from template ({{x}} and ${x.y.z}). */
export function getVariableNames(template: string): string[] {
  const names: string[] = [];
  let m: RegExpExecArray | null;
  VARIABLE_REGEX.lastIndex = 0;
  while ((m = VARIABLE_REGEX.exec(template)) !== null) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  EXPRESSION_REGEX.lastIndex = 0;
  while ((m = EXPRESSION_REGEX.exec(template)) !== null) {
    const path = m[1].replace(/\?has_content$/, "").trim();
    if (path && !names.includes(path)) names.push(path);
  }
  return names;
}

/** Pick a sensible sample value for a variable key (last segment of path or simple name). Any variable in the template gets a value; unknown keys use "Sample". */
function sampleValueForKey(key: string): string | number {
  const k = key.toLowerCase();
  if (k === "quantity" || k === "count") return 2;
  if (k === "totalincludingtax" || k === "amount" || k === "price" || k === "total") return "99.00";
  if (k === "reference" || k === "id" || k === "sku") return "SKU123";
  if (k === "labelreference" || k === "label" || k === "name" || k === "title") return "Sample Product";
  if (k === "orderid" || k === "order_id") return "#12345";
  if (k === "footer") return "Thank you.";
  if (k === "email" || k === "mail") return "user@example.com";
  if (k === "date" || k === "datetime") return "2025-01-15";
  if (k === "currency" || k === "code") return "GBP";
  if (k === "description" || k === "body" || k === "text") return "Sample text.";
  return "Sample";
}

/** Set a value at a dotted path in a nested object (mutates obj). */
function setByPath(obj: Record<string, unknown>, path: string, value: string | number): void {
  const parts = path.trim().split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i].trim();
    if (!(p in current) || typeof current[p] !== "object" || current[p] === null) {
      current[p] = {};
    }
    current = current[p] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1]?.trim();
  if (last) current[last] = value;
}

/** Build dummy data from template: all {{x}} and ${x.y.z} get auto-filled with sample values. */
export function generateDummyDataFromTemplate(template: string): DummyData {
  const paths = getVariableNames(template);
  const data: Record<string, unknown> = {};
  for (const path of paths) {
    const lastSegment = path.split(".").pop() ?? path;
    const value = sampleValueForKey(lastSegment);
    setByPath(data, path, value);
  }
  return data as DummyData;
}

/**
 * Strip ALL FreeMarker directive tags so output has no conditions—only layout + dummy text.
 * Only the directive tags themselves are removed; all other characters are preserved, including:
 * - Spaces and newlines between tags (e.g. between </div> and <#if>, or between any > and <).
 * - Indentation and line breaks anywhere in the template.
 */
export function stripFreeMarkerDirectives(html: string): string {
  let out = html;
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out.replace(/<#\w[\s\S]*?>/g, "");
    out = out.replace(/<\/#\w[\s\S]*?>/g, "");
  }
  return out;
}

/** Produce resolved HTML: substitute variables and remove FreeMarker directives (one iteration, conditionals expanded). */
export function toResolvedHtml(template: string, dummyData: DummyData): string {
  const withValues = substituteVariables(template, dummyData);
  return stripFreeMarkerDirectives(withValues);
}

export interface NodePosition {
  nodeId: number;
  startOffset: number;
  endOffset: number;
  /** End offset of the opening tag (before '>') for injecting style. */
  startTagEndOffset: number;
  tagName: string;
}

/**
 * Find the template node that best contains the given character range [from, to].
 * Returns the smallest node that fully contains the range (innermost element), or null.
 */
export function getNodeIdContainingRange(
  nodeList: NodePosition[],
  from: number,
  to: number
): number | null {
  const containing = nodeList.filter(
    (n) => n.startOffset <= from && n.endOffset >= to
  );
  if (containing.length === 0) return null;
  const smallest = containing.reduce((a, b) =>
    a.endOffset - a.startOffset <= b.endOffset - b.startOffset ? a : b
  );
  return smallest.nodeId;
}

export interface ParseResult {
  nodeList: NodePosition[];
  /** Root element for traversal (used to build preview with node ids). */
  fragment: ReturnType<typeof parseFragment>;
}

/** Parse HTML and return element positions in source. */
export function parseWithPositions(html: string): ParseResult | null {
  type VisitNode = { nodeName: string; sourceCodeLocation?: any; tagName?: string; childNodes?: unknown[] };
  const visit = (
    nodeList: NodePosition[],
    nodeIdRef: { current: number },
    node: VisitNode
  ): void => {
    if (node.nodeName === "#element") {
      const loc = node.sourceCodeLocation;
      if (loc) {
        const startTag = loc.startTag;
        const startTagEnd = startTag ? startTag.endOffset - 1 : loc.endOffset - 1;
        nodeList.push({
          nodeId: nodeIdRef.current,
          startOffset: loc.startOffset,
          endOffset: loc.endOffset,
          startTagEndOffset: startTagEnd,
          tagName: node.tagName?.toLowerCase() ?? "?",
        });
        nodeIdRef.current += 1;
      }
    }
    const childNodes = node.childNodes;
    if (Array.isArray(childNodes)) {
      for (const child of childNodes) visit(nodeList, nodeIdRef, child as VisitNode);
    }
  };

  try {
    const fragment = parseFragment(html, {
      sourceCodeLocationInfo: true,
    }) as ReturnType<typeof parseFragment> & {
      childNodes?: VisitNode[];
    };
    const nodeList: NodePosition[] = [];
    const nodeIdRef = { current: 0 };

    if (fragment?.childNodes) {
      for (const child of fragment.childNodes) visit(nodeList, nodeIdRef, child as VisitNode);
    }

    return { nodeList, fragment };
  } catch {
    return null;
  }
}

/** Mutate fragment in place: add data-node-id and data-tag-name to each element, then serialize. */
function serializeWithNodeIds(fragment: ReturnType<typeof parseFragment>): string {
  let id = 0;
  function walk(node: any): void {
    if (node?.nodeName === "#element") {
      if (!node.attrs) node.attrs = [];
      node.attrs.push({ name: "data-node-id", value: String(id++) });
      const tag = (node.tagName || "").toLowerCase();
      if (tag) node.attrs.push({ name: "data-tag-name", value: tag });
    }
    for (const c of node?.childNodes || []) walk(c);
  }
  walk(fragment);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return serialize(fragment as any);
}

/**
 * Build HTML for preview only (iframe). Uses parse5 serialize, which may normalize whitespace.
 * Do not use this for user-facing output—use applyEdits for "Get template" so spacing is preserved.
 */
export function buildPreviewHtml(
  template: string,
  dummyData: DummyData,
  _parseResult: ParseResult | null
): string {
  const substituted = substituteVariables(template, dummyData);
  const fragmentForPreview = parseFragment(substituted, {
    sourceCodeLocationInfo: false,
  }) as ReturnType<typeof parseFragment>;
  return serializeWithNodeIds(fragmentForPreview);
}


/** Edit operations. */
export type EditStyle = { padding?: string; margin?: string };
export interface Edits {
  removals: Set<number>;
  styles: Map<number, EditStyle>;
}

export function createEdits(): Edits {
  return { removals: new Set(), styles: new Map() };
}

/**
 * Apply edits to the original template string. Removals and style injections
 * are done with minimal string changes to preserve formatting and spacing.
 * Only uses slice + insert; never trims or normalizes. All spaces/newlines and spacing
 * between tags remain exactly as in originalTemplate except at removal or injection points.
 */
export function applyEdits(
  originalTemplate: string,
  nodeList: NodePosition[],
  edits: Edits
): string {
  if (nodeList.length === 0) return originalTemplate;

  const removals = Array.from(edits.removals)
    .map((nodeId) => {
      const pos = nodeList.find((n) => n.nodeId === nodeId);
      return pos ? { nodeId, start: pos.startOffset, end: pos.endOffset } : null;
    })
    .filter(Boolean) as { nodeId: number; start: number; end: number }[];
  removals.sort((a, b) => b.start - a.start);

  let result = originalTemplate;
  for (const r of removals) {
    result = result.slice(0, r.start) + result.slice(r.end);
  }

  /** Given offset in original string, return offset in result after removals. */
  function newOffset(oldOffset: number): number {
    let shift = 0;
    for (const r of removals) {
      if (r.end <= oldOffset) shift += r.end - r.start;
    }
    return oldOffset - shift;
  }

  const styleUpdates: { index: number; styleStr: string }[] = [];
  edits.styles.forEach((style, nodeId) => {
    if (edits.removals.has(nodeId)) return;
    const pos = nodeList.find((n) => n.nodeId === nodeId);
    if (!pos) return;
    const insertAt = newOffset(pos.startTagEndOffset);
    const parts: string[] = [];
    if (style.padding) parts.push(`padding: ${style.padding}`);
    if (style.margin) parts.push(`margin: ${style.margin}`);
    if (parts.length)
      styleUpdates.push({
        index: insertAt,
        styleStr: ` style="${parts.join("; ")}"`,
      });
  });
  styleUpdates.sort((a, b) => b.index - a.index);
  for (const { index, styleStr } of styleUpdates) {
    result = result.slice(0, index) + styleStr + result.slice(index);
  }

  return result;
}
