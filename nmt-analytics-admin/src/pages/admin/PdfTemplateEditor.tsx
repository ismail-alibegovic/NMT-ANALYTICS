import { useState, useEffect, useCallback } from "react";
import PageMeta from "../../components/common/PageMeta";
import api from "../../lib/apiClient";
import { useT } from "../../lib/i18n/context";
import { useToast } from "../../context/ToastContext";

type TemplateType = "invoice" | "voucher" | "contract" | "receipt";

interface Block {
  id: string;
  type:
    | "header"
    | "customerInfo"
    | "items"
    | "totals"
    | "paymentInfo"
    | "terms"
    | "signature"
    | "footer";
  enabled: boolean;
  label: string;
  content?: string;
  style?: {
    fontSize?: number;
    bold?: boolean;
    align?: "left" | "center" | "right";
  };
}

interface TemplateConfig {
  blocks: Block[];
}

const DEFAULT_BLOCKS: Record<TemplateType, Block[]> = {
  invoice: [
    { id: "header", type: "header", enabled: true, label: "Header (Logo + Agency Name)" },
    { id: "customerInfo", type: "customerInfo", enabled: true, label: "Customer Information" },
    { id: "items", type: "items", enabled: true, label: "Invoice Items Table" },
    { id: "totals", type: "totals", enabled: true, label: "Totals Summary" },
    { id: "paymentInfo", type: "paymentInfo", enabled: true, label: "Payment Information" },
    { id: "terms", type: "terms", enabled: false, label: "Terms & Conditions" },
    { id: "footer", type: "footer", enabled: true, label: "Footer", content: "Hvala na povjerenju!" },
  ],
  voucher: [
    { id: "header", type: "header", enabled: true, label: "Header (Logo + Agency Name)" },
    { id: "customerInfo", type: "customerInfo", enabled: true, label: "Passenger Information" },
    { id: "items", type: "items", enabled: true, label: "Trip Details" },
    { id: "totals", type: "totals", enabled: true, label: "Price Summary" },
    { id: "terms", type: "terms", enabled: false, label: "Travel Terms" },
    { id: "footer", type: "footer", enabled: true, label: "Footer", content: "Sretno putovanje!" },
  ],
  contract: [
    { id: "header", type: "header", enabled: true, label: "Header (Logo + Agency Name)" },
    { id: "customerInfo", type: "customerInfo", enabled: true, label: "Contracting Parties" },
    { id: "items", type: "items", enabled: true, label: "Service Description" },
    { id: "totals", type: "totals", enabled: true, label: "Price & Payment Terms" },
    { id: "terms", type: "terms", enabled: true, label: "Terms & Conditions" },
    { id: "signature", type: "signature", enabled: true, label: "Signature Area" },
    { id: "footer", type: "footer", enabled: true, label: "Footer" },
  ],
  receipt: [
    { id: "header", type: "header", enabled: true, label: "Header (Logo + Agency Name)" },
    { id: "customerInfo", type: "customerInfo", enabled: true, label: "Payer Information" },
    { id: "items", type: "items", enabled: true, label: "Payment Details" },
    { id: "totals", type: "totals", enabled: true, label: "Amount Summary" },
    { id: "footer", type: "footer", enabled: true, label: "Footer", content: "Hvala na uplati!" },
  ],
};

const TABS: { key: TemplateType; labelKey: string }[] = [
  { key: "invoice", labelKey: "invoice" },
  { key: "voucher", labelKey: "voucher" },
  { key: "contract", labelKey: "contract" },
  { key: "receipt", labelKey: "receipt" },
];

export default function PdfTemplateEditor() {
  const { t } = useT();
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<TemplateType>("invoice");
  const [configs, setConfigs] = useState<Record<TemplateType, TemplateConfig>>({
    invoice: { blocks: DEFAULT_BLOCKS.invoice },
    voucher: { blocks: DEFAULT_BLOCKS.voucher },
    contract: { blocks: DEFAULT_BLOCKS.contract },
    receipt: { blocks: DEFAULT_BLOCKS.receipt },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Set<TemplateType>>(new Set());

  const fetchConfigs = useCallback(async () => {
    try {
      const { data } = await api.get("/onboarding/templates");
      if (data?.pdf_template_config) {
        const parsed = typeof data.pdf_template_config === "string"
          ? JSON.parse(data.pdf_template_config)
          : data.pdf_template_config;
        setConfigs({
          invoice: { blocks: parsed.invoice?.blocks || DEFAULT_BLOCKS.invoice },
          voucher: { blocks: parsed.voucher?.blocks || DEFAULT_BLOCKS.voucher },
          contract: { blocks: parsed.contract?.blocks || DEFAULT_BLOCKS.contract },
          receipt: { blocks: parsed.receipt?.blocks || DEFAULT_BLOCKS.receipt },
        });
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

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const blocks = [...configs[activeTab].blocks];
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
    setConfigs((prev) => ({ ...prev, [activeTab]: { blocks } }));
    setDirty((prev) => new Set(prev).add(activeTab));
  };

  const toggleBlock = (id: string) => {
    const blocks = configs[activeTab].blocks.map((b) =>
      b.id === id ? { ...b, enabled: !b.enabled } : b
    );
    setConfigs((prev) => ({ ...prev, [activeTab]: { blocks } }));
    setDirty((prev) => new Set(prev).add(activeTab));
  };

  const updateBlockContent = (id: string, content: string) => {
    const blocks = configs[activeTab].blocks.map((b) =>
      b.id === id ? { ...b, content } : b
    );
    setConfigs((prev) => ({ ...prev, [activeTab]: { blocks } }));
    setDirty((prev) => new Set(prev).add(activeTab));
  };

  const updateBlockStyle = (id: string, key: string, value: string | number | boolean) => {
    const blocks = configs[activeTab].blocks.map((b) =>
      b.id === id ? { ...b, style: { ...b.style, [key]: value } } : b
    );
    setConfigs((prev) => ({ ...prev, [activeTab]: { blocks } }));
    setDirty((prev) => new Set(prev).add(activeTab));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const allConfigs: Record<string, TemplateConfig> = {};
      (Object.keys(configs) as TemplateType[]).forEach((key) => {
        allConfigs[key] = configs[key];
      });
      await api.put("/onboarding/templates", {
        pdf_template_config: allConfigs,
      });
      success(t.settings.templateSaved);
      setDirty(new Set());
    } catch (err: any) {
      error(err?.message || t?.settings?.templateError || "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfigs((prev) => ({
      ...prev,
      [activeTab]: { blocks: DEFAULT_BLOCKS[activeTab] },
    }));
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
          {activeBlocks.map((block, idx) => (
            <div
              key={block.id}
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
                    onClick={() => toggleBlock(block.id)}
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

                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {block.label}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">#{idx + 1}</span>
                  </div>
                </div>
              </div>

              {/* Content + style editors (only for blocks that support content) */}
              {block.enabled && (block.type === "footer" || block.type === "terms" || block.type === "signature") && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      {t.settings.blockContent}
                    </label>
                    <textarea
                      value={block.content || ""}
                      onChange={(e) => updateBlockContent(block.id, e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder="Enter custom text..."
                    />
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        {t.settings.blockStyle} — Font Size
                      </label>
                      <input
                        type="number"
                        min={6}
                        max={24}
                        value={block.style?.fontSize ?? 10}
                        onChange={(e) => updateBlockStyle(block.id, "fontSize", parseInt(e.target.value) || 10)}
                        className="w-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-white outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                        <input
                          type="checkbox"
                          checked={block.style?.bold ?? false}
                          onChange={(e) => updateBlockStyle(block.id, "bold", e.target.checked)}
                          className="rounded"
                        />
                        Bold
                      </label>
                      <select
                        value={block.style?.align ?? "left"}
                        onChange={(e) => updateBlockStyle(block.id, "align", e.target.value)}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white outline-none"
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
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
              {dirty.size} unsaved change(s)
            </span>
          )}
        </div>
      </div>
    </>
  );
}
