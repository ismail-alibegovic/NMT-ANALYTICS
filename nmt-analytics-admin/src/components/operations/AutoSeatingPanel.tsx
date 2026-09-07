import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "../../lib/i18n/context";
import { useToast } from "../../context/ToastContext";
import {
  generateSeatingProposal,
  applySeatingProposal,
  type SeatingProposalOutput,
  type SeatingProposalPassenger,
  type SeatingProposalSplitGroupWarning,
  type SeatingProposalUnresolved,
} from "../../api/departures";

interface AutoSeatingPanelProps {
  departureId: string;
  transportType: "bus" | "flight" | "none";
  hasVehicle: boolean;
  onApplySuccess: () => void;
}

export default function AutoSeatingPanel({
  departureId,
  transportType,
  hasVehicle,
  onApplySuccess,
}: AutoSeatingPanelProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const bs = (t.departure?.autoSeating ?? {}) as Record<string, string>;

  const [proposal, setProposal] = useState<SeatingProposalOutput | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = transportType === "bus" && hasVehicle && !generating;
  const canApply = Boolean(proposal) && !applying;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateSeatingProposal(departureId);
      setProposal(result);
    } catch (e: any) {
      const msg = e?.message || bs.applyFailed || "Failed to generate proposal";
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }, [departureId, canGenerate, bs, toast]);

  const handleApply = useCallback(async () => {
    if (!proposal || !canApply) return;
    setApplying(true);
    setError(null);
    try {
      await applySeatingProposal(departureId, {
        stateFingerprint: proposal.stateFingerprint,
        proposedAssignments: proposal.proposedAssignments.map((p: SeatingProposalPassenger) => ({
          passengerId: p.passengerId,
          seatId: p.seatId,
        })),
      });
      setProposal(null);
      toast.success(bs.applySuccess || "Seating proposal applied");
      onApplySuccess();
    } catch (e: any) {
      const code = e?.code;
      const msg =
        code === "STALE_PROPOSAL"
          ? bs.staleProposal || "Seating changed. Generate a new proposal."
          : e?.message || bs.applyFailed || "Failed to apply proposal";
      if (code === "STALE_PROPOSAL") {
        setProposal(null);
      }
      setError(msg);
      toast.error(msg);
    } finally {
      setApplying(false);
    }
  }, [departureId, proposal, canApply, bs, toast, onApplySuccess]);

  const handleDiscard = useCallback(() => {
    setProposal(null);
    setError(null);
  }, []);

  const summary = useMemo(() => {
    if (!proposal) return null;
    return {
      preserved: proposal.preservedAssignments.length,
      proposed: proposal.proposedAssignments.length,
      unresolved: proposal.unresolved.length,
      splitCount: proposal.splitGroupWarnings.length,
    };
  }, [proposal]);

  if (transportType !== "bus") {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {bs.busOnlyNotice || "Automatic seating is only available for BUS departures."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {bs.title || "Automatic Seating"}
        </h3>
        {proposal && (
          <button
            onClick={handleDiscard}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        )}
      </div>

      {!proposal ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {bs.noProposal || "No proposal generated yet"}
          </p>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating
              ? bs.generating || "Generating..."
              : bs.generate || "Generate Proposal"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-2">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {summary?.preserved}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {bs.preservedCount || "Preserved"}
              </div>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-2">
              <div className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                {summary?.proposed}
              </div>
              <div className="text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                {bs.proposedCount || "Proposed"}
              </div>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2">
              <div className="text-lg font-semibold text-amber-700 dark:text-amber-300">
                {summary?.unresolved}
              </div>
              <div className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                {bs.unresolvedCount || "Unresolved"}
              </div>
            </div>
          </div>

          {/* Split group warnings — prominent */}
          {proposal.splitGroupWarnings.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                {bs.splitGroupWarning || "Split group"}
              </p>
              {proposal.splitGroupWarnings.map((w: SeatingProposalSplitGroupWarning) => (
                <div key={w.groupId} className="text-xs text-red-600 dark:text-red-400">
                  <span className="font-medium">{w.groupName}</span>
                  <span className="mx-1">·</span>
                  <span>{w.seatingPreference}</span>
                  <span className="mx-1">→</span>
                  <span>seats {w.proposedSeatNumbers.join(", ")}</span>
                </div>
              ))}
            </div>
          )}

          {/* Normal warnings */}
          {proposal.warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {bs.warnings || "Warnings"}
              </p>
              {proposal.warnings.map((w: string, i: number) => (
                <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* Proposed assignments */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {bs.proposed || "Proposed"}
            </p>
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {proposal.proposedAssignments.map((p) => (
                <div
                  key={p.passengerId}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded bg-blue-50/50 dark:bg-blue-900/20"
                >
                  <span className="text-gray-700 dark:text-gray-300 truncate">
                    {p.seatLabel || `Seat ${p.seatNumber}`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Unresolved */}
          {proposal.unresolved.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {bs.unresolved || "Unresolved"}
              </p>
              <div className="max-h-24 overflow-y-auto space-y-0.5">
                {proposal.unresolved.map((u: SeatingProposalUnresolved) => (
                  <div
                    key={u.passengerId}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded bg-amber-50/50 dark:bg-amber-900/20"
                  >
                    <span className="text-gray-700 dark:text-gray-300 truncate">
                      {u.fullName}
                    </span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-2">
                      {u.reason || bs.unresolvedReason || "No available seat"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Apply */}
          <button
            onClick={handleApply}
            disabled={!canApply}
            className="w-full px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {applying
              ? bs.applying || "Applying..."
              : bs.apply || "Apply Proposal"}
          </button>
        </div>
      )}

      {error && !proposal && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
