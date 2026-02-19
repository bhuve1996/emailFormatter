"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  getVariableNames,
  parseWithPositions,
  buildPreviewHtml,
  applyEdits,
  createEdits,
  toResolvedHtml,
  generateDummyDataFromTemplate,
  getNodeIdContainingRange,
  type DummyData,
  type Edits,
  type NodePosition,
} from "@/lib/template-engine";
import { PreviewPane } from "@/components/PreviewPane";

const CodeEditor = dynamic(() => import("@/components/CodeEditor").then((m) => ({ default: m.CodeEditor })), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[24rem] rounded-lg border border-[var(--editor-border)] bg-[var(--panel-bg)] flex items-center justify-center text-[var(--text-muted)] text-sm">
      Loading editor…
    </div>
  ),
});

const DEFAULT_TEMPLATE = `   <br><br>     <div style="font-weight:bold">YOUR RESERVATION</div><br>     <#list Model.Order.CurrentOrder.OrderLines.OrderLine as item>         <table>             <tr>                 <td style="direction:ltr;font-size:0px;padding:0 20px 25px;text-align:center;vertical-align:top;">                     <div class="mj-column-per-100 outlook-group-fix"                         style="font-size:0;line-height:0;text-align:left;display:inline-block;width:100%;direction:ltr;">                         <div class="mj-column-per-25 outlook-group-fix"                             style="font-size:13px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:25%;">                             <table border="0" cellpadding="0" cellspacing="0" role="presentation"                                 style="vertical-align:top;" width="100%">                                 <tbody>                                     <tr>                                         <td align="center" style="font-size:0px;padding:0;word-break:break-word;">                                             <table border="0" cellpadding="0" cellspacing="0" role="presentation"                                                 style="border-collapse:collapse;border-spacing:0px;">                                                 <tbody>                                                     <tr>                                                         <td style="width:120px;">                                                             <#if item.Product.Reference?has_content> <img height="auto"                                                                     style="border:0;display:block;outline:none;text-decoration:none;height:auto;width:100%;font-size:13px;"                                                                     width="120"                                                                     src="/us/en/home.email-image.\${item.Product.Reference}.png">                                                             </#if>                                                         </td>                                                     </tr>                                                 </tbody>                                             </table>                                         </td>                                     </tr>                                 </tbody>                             </table>                         </div>                         <div class="mj-column-per-50 outlook-group-fix"                             style="font-size:13px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:50%;">                             <table border="0" cellpadding="0" cellspacing="0" role="presentation"                                 style="vertical-align:top;" width="100%">                                 <tbody>                                     <tr>                                         <td align="left" style="font-size:0px;padding:0 0 10px 0;word-break:break-word;">                                             <div style="font-size:16px;line-height:25px;text-align:left">                                                 <#if item.Product.LabelReference?has_content> \${item.Product.LabelReference}                                                 </#if>                                             </div>                                         </td>                                     </tr>                                     <tr>                                         <td align="left" style="font-size:0px;padding:0;word-break:break-word;">                                             <div                                                 style="font-family:MaisonNeueBook, Arial, sans-serif;font-size:13px;line-height:25px;text-align:left;color:#7D7D7D;">                                                 Quantity : <#if item.Product.Quantity?has_content> \${item.Product.Quantity}                                                 </#if>                                             </div>                                         </td>                                     </tr>                                 </tbody>                             </table>                         </div>                         <div class="mj-column-per-25 outlook-group-fix"                             style="font-size:13px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:25%;">                             <table border="0" cellpadding="0" cellspacing="0" role="presentation"                                 style="vertical-align:top;" width="100%">                                 <tbody>                                     <tr>                                         <td align="right" style="font-size:0px;padding:0 0 10px 0;word-break:break-word;">                                             <div                                                 style="font-family:MaisonNeueBook, Arial, sans-serif;font-size:16px;line-height:25px;text-align:right;color:#7D7D7D;">                                                 <#if item.TotalIncludingTax?has_content> GBP \${item.TotalIncludingTax}                                                 </#if> (incl. tax)<br>                                             </div>                                         </td>                                     </tr>                                 </tbody>                             </table>                         </div>                     </div>                 </td>             </tr>         </table>     </#list>           <div class="mj-column-per-100 mj-outlook-group-fix"         style="font-size:0;line-height:0;text-align:left;display:flex;width:100%;direction:ltr;">         <div class="mj-column-per-50 mj-outlook-group-fix"             style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:50%;padding-left: 30px;">             <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">                 <tr>                     <td align="left" style="font-size:0px;padding:0;word-break:break-word;">                         <div                             style="font-family:MaisonNeueBook, Arial, sans-serif;font-size:14px;line-height:25px;text-align:left;color:#7D7D7D;">                             Subtotal (incl. any applicable taxes)</div>                     </td>                 </tr>             </table>         </div>         <div class="mj-column-per-50 mj-outlook-group-fix"             style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:calc(25% - 60px);width:50%">             <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">                 <tr>                     <td align="right" style="font-size:0px;padding:0;word-break:break-word;">                         <div                             style="font-family:MaisonNeueBook, Arial, sans-serif;font-size:14px;line-height:25px;text-align:left;color:#7D7D7D;    display: inline-flex;padding-right: 37px;">                             <#if Model.Order.CurrentOrder.TotalIncludingTax?has_content> GBP                                \${Model.Order.CurrentOrder.TotalIncludingTax} </#if><br>                         </div>                     </td>                 </tr>             </table>         </div>         </table>     </div>     <div style="background:#F5F5F5;background-color:#F5F5F5;margin:0px auto;max-width:640px;">         <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"             style="background:#F5F5F5;background-color:#F5F5F5;width:100%;">             <tbody>                 <tr>                     <td style="direction:ltr;font-size:0px;padding:0 0px 0px 0px;text-align:center;background:#fff;">                         <div class="mj-column-per-100 mj-outlook-group-fix"                             style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">                             <table border="0" cellpadding="0" cellspacing="0" role="presentation"                                 style="vertical-align:top;" width="100%">                                 <tr>                                     <td style="font-size:0px;padding:0;word-break:break-word;">                                         <p style="border-top:solid 1px #E6E6E6;font-size:1;margin:0px auto;width:100%;">                                         </p>                                     </td>                                 </tr>                             </table>                         </div>                     </td>                 </tr>             </tbody>         </table>     </div>               




<div class="mj-column-per-100 mj-outlook-group-fix"                             style="font-size:0;line-height:0;text-align:left;display:inline-block;width:100%;direction:ltr;">                             <div class="mj-column-per-50 mj-outlook-group-fix"                                 style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:50%;">                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation"                                     style="vertical-align:top;" width="100%">                                     <tr>                                         <td align="left" style="font-size:0px;padding:0;word-break:break-word;">                                             <div                                                 style="font-family:MaisonNeueBook, Arial, sans-serif;font-size:14px;line-height:25px;text-align:left;color:#222222;padding-left: 20px;">                                                 Total (incl. any applicable taxes)</div>                                         </td>                                     </tr>                                 </table>                             </div>                             <div class="mj-column-per-50 mj-outlook-group-fix"                                 style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:50%;">                                 <table border="0" cellpadding="0" cellspacing="0" role="presentation"                                     style="vertical-align:top;" width="100%">                                     <tr>                                         <td align="right" style="font-size:0px;padding:0;word-break:break-word;">                                             <div                                                 style="font-family:MaisonNeueBook, Arial, sans-serif;font-size:14px;line-height:25px;text-align:right;color:#222222;padding-right:20px;">                                                 <#if Model.Order.CurrentOrder.TotalIncludingTax?has_content> GBP                                                   \${Model.Order.CurrentOrder.TotalIncludingTax} </#if>                                             </div>                                         </td>                                     </tr>                                 </table>                             </div>                         </div>                     </td>                 </tr>             </tbody>         </table>     </div>`;

export default function Home() {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [edits, setEdits] = useState<Edits>(createEdits);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [paddingValue, setPaddingValue] = useState("");
  const [highlightFromCode, setHighlightFromCode] = useState<string | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);

  const parseResult = useMemo(
    () => parseWithPositions(template),
    [template]
  );
  const nodeList = useMemo(
    () => parseResult?.nodeList ?? [],
    [parseResult]
  );

  const dummyData = useMemo(
    () => generateDummyDataFromTemplate(template),
    [template]
  );

  const modifiedTemplate = useMemo(
    () => applyEdits(template, nodeList, edits),
    [template, nodeList, edits]
  );
  const parseResultModified = useMemo(
    () => parseWithPositions(modifiedTemplate),
    [modifiedTemplate]
  );
  // Preview = resolved (no <#list>/<#if>) so you never see conditions
  const resolvedHtml = useMemo(
    () => toResolvedHtml(modifiedTemplate, dummyData),
    [modifiedTemplate, dummyData]
  );
  const previewHtml = useMemo(
    () => buildPreviewHtml(resolvedHtml, {}, parseWithPositions(resolvedHtml)),
    [resolvedHtml]
  );

  const remainingNodeIds = useMemo(() => {
    return nodeList
      .filter((n) => !edits.removals.has(n.nodeId))
      .sort((a, b) => a.startOffset - b.startOffset)
      .map((n) => n.nodeId);
  }, [nodeList, edits.removals]);

  const indexToNodeId = useCallback(
    (index: number) => remainingNodeIds[index] ?? -1,
    [remainingNodeIds]
  );

  const nodeIdToPreviewIndex = useMemo(() => {
    const m = new Map<number, number>();
    remainingNodeIds.forEach((id, i) => m.set(id, i));
    return m;
  }, [remainingNodeIds]);

  const highlightPreviewIndex = useMemo(() => {
    if (selectionRange == null) return null;
    const nodeId = getNodeIdContainingRange(nodeList, selectionRange.from, selectionRange.to);
    if (nodeId == null) return null;
    return nodeIdToPreviewIndex.get(nodeId) ?? null;
  }, [selectionRange, nodeList, nodeIdToPreviewIndex]);

  const selectedNode = useMemo(
    () =>
      selectedNodeId !== null
        ? nodeList.find((n) => n.nodeId === selectedNodeId)
        : null,
    [selectedNodeId, nodeList]
  );

  const handleApplyPadding = useCallback(() => {
    if (selectedNodeId === null || !paddingValue.trim()) return;
    setEdits((prev) => {
      const next = createEdits();
      next.removals = new Set(prev.removals);
      next.styles = new Map(prev.styles);
      const existing = next.styles.get(selectedNodeId) ?? {};
      next.styles.set(selectedNodeId, { ...existing, padding: paddingValue.trim() });
      return next;
    });
    setPaddingValue("");
  }, [selectedNodeId, paddingValue]);

  const handleRemove = useCallback(() => {
    if (selectedNodeId === null) return;
    setEdits((prev) => {
      const next = createEdits();
      next.removals = new Set(prev.removals);
      next.removals.add(selectedNodeId);
      next.styles = new Map(prev.styles);
      next.styles.delete(selectedNodeId);
      return next;
    });
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  const handleGetTemplate = useCallback(() => {
    const result = applyEdits(template, nodeList, edits);
    setOutput(result);
    // Output mirrors current template (with Inspector removals/padding applied); no trim/normalize.
  }, [template, nodeList, edits]);

  const variableNames = useMemo(() => getVariableNames(template), [template]);

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-[1600px] mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          Template Visualizer & Editor
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          Paste template with {"{{variables}}"} or ${"${path}"}. Preview and resolved output use auto-generated sample data—no config needed.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Code + Dummy data */}
        <div className="space-y-4 min-h-0 flex flex-col">
          <div className="flex flex-col flex-1 min-h-0 h-[calc(100vh-7rem)]">
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1 shrink-0">
              Template code
            </label>
            <div className="flex-1 min-h-0 overflow-auto flex flex-col">
              <CodeEditor
                value={template}
                onChange={setTemplate}
                language="html"
                height="100%"
                placeholder="HTML with {{variable}} or ${'${expr}'} placeholders..."
                onSelectionChange={setHighlightFromCode}
                onSelectionRange={setSelectionRange}
                className="flex-1 min-h-0 h-full"
              highlightRange={
                selectedNode
                  ? { from: selectedNode.startOffset, to: selectedNode.endOffset }
                  : null
              }
              />
            </div>
            {variableNames.length > 0 && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                All variables auto-filled with sample data: {variableNames.slice(0, 10).join(", ")}
                {variableNames.length > 10 ? ` (+${variableNames.length - 10} more)` : ""}
              </p>
            )}
          </div>
        </div>

        {/* Right: Preview + Inspector + Output */}
        <div className="space-y-4 flex flex-col min-h-0">
          <div className="flex flex-col flex-1 min-h-[36rem]">
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
              Preview (click any element to highlight it in the code; select code on the left to show where it is — two-way sync)
            </label>
            <PreviewPane
              html={previewHtml}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              indexToNodeId={indexToNodeId}
              highlightPreviewIndex={highlightPreviewIndex}
              highlightFromCode={highlightFromCode}
            />
          </div>

          {/* Inspector */}
          <div className="rounded-lg border border-[var(--editor-border)] bg-[var(--panel-bg)] p-3">
            <h3 className="text-sm font-medium text-[var(--text)] mb-2">
              Inspector
            </h3>
            {selectedNode ? (
              <div className="space-y-2 text-sm">
                <p className="text-[var(--text-muted)]">
                  Tag: <code className="text-[var(--accent)]">&lt;{selectedNode.tagName}&gt;</code> (node #{selectedNode.nodeId})
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    value={paddingValue}
                    onChange={(e) => setPaddingValue(e.target.value)}
                    placeholder="Padding (e.g. 16px)"
                    className="rounded border border-[var(--editor-border)] bg-[var(--editor-bg)] text-[var(--text)] px-2 py-1 text-sm w-32"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPadding}
                    className="rounded bg-[var(--accent)] text-white px-3 py-1 text-sm hover:bg-[var(--accent-hover)]"
                  >
                    Apply padding
                  </button>
                  <button
                    type="button"
                    onClick={handleRemove}
                    className="rounded border border-red-500/60 text-red-400 px-3 py-1 text-sm hover:bg-red-500/10"
                  >
                    Remove element
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-sm">
                Click an element in the preview to select it.
              </p>
            )}
          </div>

          {/* Output */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
              Output
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                onClick={handleGetTemplate}
                className="rounded bg-[var(--accent)] text-white px-3 py-1.5 text-sm hover:bg-[var(--accent-hover)]"
              >
                Get template
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-1">
              Mirrors your current template (including any text you add or delete). Inspector “Remove” and “Apply padding” are applied. Spaces preserved.
            </p>
            {output !== null ? (
              <div className="relative">
                <CodeEditor
                  value={output}
                  onChange={() => {}}
                  language="html"
                  height="16rem"
                  readOnly
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(output)}
                  className="absolute top-2 right-2 z-10 rounded bg-[var(--panel-bg)] border border-[var(--editor-border)] text-[var(--text)] px-2 py-1 text-xs hover:bg-[var(--editor-border)]"
                >
                  Copy
                </button>
              </div>
            ) : (
              <div className="w-full h-24 rounded-lg border border-dashed border-[var(--editor-border)] flex items-center justify-center text-[var(--text-muted)] text-sm">
                Click “Get template” above.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
