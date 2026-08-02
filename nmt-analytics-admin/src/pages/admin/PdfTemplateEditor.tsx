import { useState, useEffect, useCallback, useRef } from "react";
import PageMeta from "../../components/common/PageMeta";
import api from "../../lib/apiClient";
import { useT } from "../../lib/i18n/context";
import { useToast } from "../../context/ToastContext";
import {
  buildDefaultTemplateConfig,
  mergeWithDefaults,
  BLOCK_LABELS,
  type DocType,
  type TemplateConfig,
  type DocTemplateConfig,
  type BlockKey,
} from "../../lib/pdfTemplateConfig";

const TABS: { key: DocType; labelKey: string }[] = [
  { key: "invoice", labelKey: "invoiceType" },
  { key: "voucher", labelKey: "voucherType" },
  { key: "contract", labelKey: "contractType" },
  { key: "receipt", labelKey: "receiptType" },
];

// Block keys that allow custom text content (matches backend renderer gating).
const CONTENT_BLOCKS: BlockKey[] = ["footer", "terms", "signature"];

// Style editor gating must mirror what the backend renderer actually reads.
const STYLE_BLOCKS: BlockKey[] = ["footer", "terms", "signature"];

export default function PdfTemplateEditor() {
  const { t } = useT();
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<DocType>("invoice");
  const [configs, setConfigs] = useState<TemplateConfig>(() => buildDefaultTemplateConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Set<DocType>>(new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const activeDraftRef = useRef<number>(0);

  const fetchConfigs = useCallback(async () => {
    try {
      const { data } = await api.get("/onboarding/templates");
      if (data?.pdf_template_config) {
        const parsed = typeof data.pdf_template_config === "string"
          ? JSON.parse(data.pdf_template_config)
          : data.pdf_template_config;
        // mergeWithDefaults fills any missing blocks and drops unknown keys,
        // so this UI cannot store a shape the backend will reject.
        setConfigs(mergeWithDefaults(parsed));
      }
    } catch {
      // defaults are fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const mutateActive = (updater: (cfg: DocTemplateConfig) => DocTemplateConfig) => {
    setConfigs((prev) => ({ ...prev, [activeTab]: updater(prev[activeTab]) }));
    setDirty((prev) => new Set(prev).add(activeTab));
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    mutateActive((cfg) => {
      const blocks = [...cfg.blocks];
      const target = idx + dir;
      if (target < 0 || target >= blocks.length) return cfg;
      [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
      return { ...cfg, blocks };
    });
  };

  const toggleBlock = (key: BlockKey) => {
    mutateActive((cfg) => ({
      ...cfg,
      blocks: cfg.blocks.map((b) => (b.key === key ? { ...b, enabled: !b.enabled } : b)),
    }));
  };

  const updateBlockLabel = (key: BlockKey, label: string) => {
    mutateActive((cfg) => ({
      ...cfg,
      blocks: cfg.blocks.map((b) => (b.key === key ? { ...b, label } : b)),
    }));
  };

  const updateBlockContent = (key: BlockKey, customText: string) => {
    mutateActive((cfg) => ({
      ...cfg,
      blocks: cfg.blocks.map((b) => (b.key === key ? { ...b, customText } : b)),
    }));
  };

  const updateBlockStyle = (key: BlockKey, field: "fontSize" | "bold" | "align", value: number | boolean | "left" | "center" | "right") => {
    mutateActive((cfg) => ({
      ...cfg,
      blocks: cfg.blocks.map((b) =>
        b.key === key ? { ...b, style: { ...b.style, [field]: value } } : b
      ),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/onboarding/templates", {
        pdf_template_config: configs,
      });
      success(t.settings.templateSaved);
      setDirty(new Set());
    } catch (err: any) {
      error(err?.message || t?.settings?.templateError || "Error");
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    const myRun = ++activeDraftRef.current;
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const res = await api.post(`/onboarding/templates/preview/${activeTab}`, configs[activeTab], {
        responseType: "blob",
        headers: { Accept: "application/pdf" },
      });
      if (myRun !== activeDraftRef.current) return; // stale response
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      setPreviewUrl(url);
    } catch (err: any) {
      error(err?.message || "Preview failed");
    } finally {
      if (myRun === activeDraftRef.current) setPreviewLoading(false);
    }
  };

  // Clean up blob URL on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleReset = () => {
    const defaults = buildDefaultTemplateConfig();
    setConfigs((prev) => ({ ...prev, [activeTab]: defaults[activeTab] }));
    setDirty((prev) => new Set(prev).add(activeTab));
    success(t.settings.templateReset || "Template reset");
  };

  const activeBlocks = configs[activeTab].blocks;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      <PageMeta title={t.settings.pdfTemplates} description={t.settings.pdfTemplatesDesc} />
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t.settings.pdfTemplates}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t.settings.pdfTemplatesDesc}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-800">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {t.settings[tab.labelKey as keyof typeof t.settings] as string}
              {dirty.has(tab.key) && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          ))}
        </div>

        {/* Block list */}
        <div className="space-y-3">
          {activeBlocks.map((block, idx) => {
            const isContentBlock = CONTENT_BLOCKS.includes(block.key);
            const isStyleBlock = STYLE_BLOCKS.includes(block.key);
            return (
              <div
                key={block.key}
                className={`rounded-xl border p-4 transition-colors ${
                  block.enabled
                    ? "border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.02]"
                    : "border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.01] opacity-60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Drag handle visual */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveBlock(idx, -1)}
                        disabled={idx === 0}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 text-xs leading-none"
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveBlock(idx, 1)}
                        disabled={idx === activeBlocks.length - 1}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 text-xs leading-none"
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Toggle */}
                    <button
                      onClick={() => toggleBlock(block.key)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        block.enabled ? "bg-primary" : "bg-gray-300 dark:bg-gray-700"
                      }`}
                      aria-label="Toggle block"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          block.enabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {t.settings.blockTypes?.[block.key] || block.label || BLOCK_LABELS[block.key]}
                      </span>
                      <span className="text-xs text-gray-400">#{idx + 1}</span>
                    </div>
                  </div>
                </div>

                {/* Inline label override (collapsed by default to avoid clutter) */}
                {block.enabled && (
                  <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Label
                    </label>
                    <input
                      value={block.label}
                      onChange={(e) => updateBlockLabel(block.key, e.target.value)}
                      className="w-full max-w-md rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder={BLOCK_LABELS[block.key]}
                    />
                  </div>
                )}

                {/* Content + style editors only for blocks that the backend actually reads customText/style from */}
                {block.enabled && isContentBlock && (
                  <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      {t.settings.blockContent}
                    </label>
                    <textarea
                      value={block.customText || ""}
                      onChange={(e) => updateBlockContent(block.key, e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder="Enter custom text..."
                    />
                  </div>
                )}

                {block.enabled && isStyleBlock && (
                  <div className="mt-3 flex flex-wrap items-end gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        {t.settings.blockStyle} — Font Size
                      </label>
                      <input
                        type="number"
                        min={6}
                        max={24}
                        value={block.style?.fontSize ?? 10}
                        onChange={(e) => updateBlockStyle(block.key, "fontSize", parseInt(e.target.value) || 10)}
                        className="w-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-white outline-none"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={block.style?.bold ?? false}
                        onChange={(e) => updateBlockStyle(block.key, "bold", e.target.checked)}
                        className="rounded"
                      />
                      Bold
                    </label>
                    <select
                      value={block.style?.align ?? "left"}
                      onChange={(e) => updateBlockStyle(block.key, "align", e.target.value as "left" | "center" | "right")}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white outline-none"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live preview */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={handlePreview}
              disabled={previewLoading}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {previewLoading ? "…" : t.settings.previewTemplate || "Preview PDF"}
            </button>
            {previewOpen && previewUrl && (
              <button
                onClick={() => setPreviewOpen(false)}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Hide
              </button>
            )}
          </div>
          {previewOpen && (
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900">
              {previewLoading && !previewUrl ? (
                <div className="flex items-center justify-center h-64 text-sm text-gray-500 dark:text-gray-400">
                  Generating preview…
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  title="PDF preview"
                  className="w-full"
                  style={{ height: "70vh" }}
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-sm text-gray-500 dark:text-gray-400">
                  Click “Preview PDF”.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving || dirty.size === 0}
            className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {saving ? t.common.saving : t.settings.saveTemplate}
          </button>
          <button
            onClick={handleReset}
            className="px-5 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-sm font-medium"
          >
            {t.settings.resetTemplate}
          </button>
          {dirty.size > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t.settings.unsavedChanges || `${dirty.size} unsaved change(s)`}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
