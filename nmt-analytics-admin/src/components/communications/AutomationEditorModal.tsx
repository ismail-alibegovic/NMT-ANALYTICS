import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Label from "../form/Label";
import Select from "../form/Select";
import Switch from "../form/switch/Switch";
import Input from "../form/input/InputField";
import { useT } from "../../lib/i18n/context";
import { useToast } from "../../context/ToastContext";
import {
  createAutomationRule,
  updateAutomationRule,
  type AutomationChannel,
  type AutomationRule,
  type AutomationRulePayload,
  type TimingUnit,
  type TriggerType,
} from "../../api/automationRules";
import { getMessageTemplates, type MessageTemplate } from "../../api/messageTemplates";

interface AutomationEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  rule: AutomationRule | null;
}

type Option = { value: string; label: string };

const TRIGGER_OPTIONS: TriggerType[] = ["before_departure", "after_reservation", "before_payment_due"];

export default function AutomationEditorModal({
  isOpen,
  onClose,
  onSaved,
  rule,
}: AutomationEditorModalProps) {
  const { t } = useT();
  const a = t.communication.automation;
  const { success } = useToast();

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("before_departure");
  const [timingValue, setTimingValue] = useState<number>(1);
  const [timingUnit, setTimingUnit] = useState<TimingUnit>("days");
  const [channel, setChannel] = useState<AutomationChannel>("email");
  const [templateId, setTemplateId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const isEditing = rule !== null;

  useEffect(() => {
    if (!isOpen) return;
    if (rule) {
      setName(rule.name);
      setTriggerType(rule.trigger_type);
      setTimingValue(rule.timing.value);
      setTimingUnit(rule.timing.unit);
      setChannel(rule.channel);
      setTemplateId(rule.template_id ?? "");
      setIsActive(rule.is_active);
    } else {
      setName("");
      setTriggerType("before_departure");
      setTimingValue(1);
      setTimingUnit("days");
      setChannel("email");
      setTemplateId("");
      setIsActive(true);
    }
    setError(null);
  }, [isOpen, rule]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setTemplatesLoading(true);
    getMessageTemplates()
      .then((rows) => {
        if (!active) return;
        setTemplates(rows.filter((row) => row.is_active && row.channel === channel));
      })
      .catch(() => {
        if (!active) return;
        setTemplates([]);
      })
      .finally(() => {
        if (active) setTemplatesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, channel]);

  const compatibleTemplates = useMemo(
    () => templates.filter((row) => row.channel === channel),
    [templates, channel],
  );

  const templateOptions: Option[] = useMemo(
    () => [
      { value: "", label: a.templateNone },
      ...compatibleTemplates.map((row) => ({ value: row.id, label: row.name })),
    ],
    [compatibleTemplates, a.templateNone],
  );

  const channelOptions: Option[] = useMemo(
    () => [
      { value: "email", label: a.channelEmail },
      { value: "sms", label: a.channelSms },
    ],
    [a.channelEmail, a.channelSms],
  );

  const triggerOptions: Option[] = useMemo(
    () => TRIGGER_OPTIONS.map((trigger) => ({ value: trigger, label: a.triggers[trigger] })),
    [a.triggers],
  );

  const timingUnitOptions: Option[] = useMemo(
    () => [
      { value: "hours", label: a.hours },
      { value: "days", label: a.days },
    ],
    [a.hours, a.days],
  );

  const summary = useMemo(() => {
    const triggerLabel = a.triggers[triggerType].toLowerCase();
    const selectedTemplate = compatibleTemplates.find((row) => row.id === templateId);
    const templateLabel = selectedTemplate ? selectedTemplate.name : a.templateNone;
    const offset = `${timingValue} ${timingUnit === "days" ? a.days.toLowerCase() : a.hours.toLowerCase()}`;
    if (triggerType === "after_reservation") {
      return a.summaryAfterReservation
        .replace("{template}", templateLabel)
        .replace("{channel}", channel === "email" ? a.channelEmail : a.channelSms)
        .replace("{trigger}", triggerLabel);
    }
    return a.summaryTimed
      .replace("{template}", templateLabel)
      .replace("{channel}", channel === "email" ? a.channelEmail : a.channelSms)
      .replace("{offset}", offset)
      .replace("{trigger}", triggerLabel);
  }, [triggerType, timingValue, timingUnit, channel, templateId, compatibleTemplates, a]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError(a.errors.nameRequired);
      return;
    }
    if (timingValue <= 0 || !Number.isFinite(timingValue)) {
      setError(a.errors.invalidTiming);
      return;
    }
    setSaving(true);
    setError(null);
    const payload: AutomationRulePayload = {
      name: name.trim(),
      is_active: isActive,
      channel,
      template_id: templateId || null,
      trigger_type: triggerType,
      timing: { value: timingValue, unit: timingUnit },
    };
    try {
      if (isEditing && rule) {
        await updateAutomationRule(rule.id, payload);
        success(a.saved);
      } else {
        await createAutomationRule(payload);
        success(a.created);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      const message = err?.message || a.saveError;
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton className="max-w-2xl">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <div>
          <h2 className="text-lg font-semibold text-gray-950 dark:text-white">
            {isEditing ? a.editTitle : a.newTitle}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{a.subtitle}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="automation-name">{a.name}</Label>
          <Input
            id="automation-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={a.namePlaceholder}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{a.trigger}</Label>
            <Select options={triggerOptions} value={triggerType} onChange={(v) => setTriggerType(v as TriggerType)} />
          </div>
          <div className="space-y-1.5">
            <Label>{a.channel}</Label>
            <Select options={channelOptions} value={channel} onChange={(v) => setChannel(v as AutomationChannel)} />
          </div>
        </div>

        {triggerType !== "after_reservation" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{a.offsetValue}</Label>
              <Input
                type="number"
                min="1"
                value={timingValue}
                onChange={(e) => setTimingValue(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{a.offsetUnit}</Label>
              <Select options={timingUnitOptions} value={timingUnit} onChange={(v) => setTimingUnit(v as TimingUnit)} />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{a.template}</Label>
          <Select
            options={templateOptions}
            value={templateId}
            onChange={setTemplateId}
            placeholder={templatesLoading ? a.loadingTemplates : a.templatePlaceholder}
          />
          {!templatesLoading && compatibleTemplates.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">{a.noCompatibleTemplates}</p>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
          {summary}
        </div>

        <div className="flex items-center justify-between">
          <Switch label={a.active} defaultChecked={isActive} onChange={setIsActive} />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <Button type="button" variant="outline" onClick={onClose}>
            {a.cancel}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? a.saving : isEditing ? a.save : a.create}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
