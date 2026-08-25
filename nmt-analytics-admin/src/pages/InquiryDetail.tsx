import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useT } from "../lib/i18n/context";
import { getInquiry, deleteInquiry, type Inquiry } from "../api/inquiries";
import PageToolbar from "../components/ui/PageToolbar";
import EmptyState from "../components/ui/EmptyState";
import { Badge } from "../components/ui";
import { getStagesWithStyles } from "../utils/business";

function Button({ children, variant = "default", size = "sm", onClick, disabled, className = "" }: any) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes: any = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  const variants: any = {
    default: "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750",
    primary: "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100",
    destructive: "bg-red-600 text-white hover:bg-red-700",
    ghost: "hover:bg-gray-100 dark:hover:bg-gray-800",
    outline: "border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

function formatDate(d: string) {
  try { return new Date(d).toLocaleDateString("bs-BA", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return d; }
}

export default function InquiryDetail() {
  const { t } = useT();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => { if (id) loadInquiry(id); }, [id]);

  async function loadInquiry(inquiryId: string) {
    setLoading(true); setError(null);
    try {
      const data = await getInquiry(inquiryId);
      setInquiry(data);
    } catch (e: any) {
      setError(e?.response?.status === 404 ? t("inquiries.notFound") || "Inquiry not found" : t("common.error") || "Error loading inquiry");
    } finally { setLoading(false); }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteInquiry(id);
      navigate("/sales/inquiries", { replace: true });
    } catch (e: any) {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  if (loading) return <div className="p-8 flex items-center justify-center"><div className="animate-spin size-6 border-2 border-gray-300 border-t-brand-500 rounded-full" /></div>;
  if (error || !inquiry) return <EmptyState icon="search" title={t("inquiries.notFound") || "Not found"} description={error || ""} />;

  const stageStyles = getStagesWithStyles();
  const stageStyle = stageStyles[inquiry.stage] || { color: "default" };

  return (
    <div className="flex flex-col h-full">
      <PageToolbar
        title={inquiry.contactName}
        backTo="/sales/inquiries"
        actions={
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => navigate(`/sales/itineraries?inquiryId=${inquiry.id}`)}>
              {t("inquiries.createItinerary") || "Create Itinerary"}
            </Button>
            <Button variant="outline" onClick={() => setShowDelete(true)} disabled={deleting}>
              {t("common.delete") || "Delete"}
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-4 md:col-span-2">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">{t("inquiries.contactInfo") || "Contact"}</h3>
              <div className="space-y-1.5 text-sm">
                <p><span className="text-gray-500">{t("inquiries.phone") || "Phone"}:</span> {inquiry.phone || "—"}</p>
                <p><span className="text-gray-500">{t("inquiries.email") || "Email"}:</span> {inquiry.email || "—"}</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">{t("inquiries.tripDetails") || "Trip Details"}</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">{t("inquiries.tripType") || "Type"}:</span> {t(`inquiries.tripTypes.${inquiry.tripType}`) || inquiry.tripType}</div>
                <div><span className="text-gray-500">{t("inquiries.destination") || "Destination"}:</span> {inquiry.destination || "—"}</div>
                <div><span className="text-gray-500">{t("inquiries.travelers") || "Travelers"}:</span> {inquiry.travelers}</div>
                <div><span className="text-gray-500">{t("inquiries.budget") || "Budget"}:</span> {inquiry.budget != null ? `${inquiry.budget} ${inquiry.currency}` : "—"}</div>
                <div><span className="text-gray-500">{t("inquiries.travelStart") || "Start"}:</span> {inquiry.travelStart ? formatDate(inquiry.travelStart) : "—"}</div>
                <div><span className="text-gray-500">{t("inquiries.travelEnd") || "End"}:</span> {inquiry.travelEnd ? formatDate(inquiry.travelEnd) : "—"}</div>
              </div>
            </div>

            {inquiry.notes && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{t("inquiries.notes") || "Notes"}</h3>
                <p className="text-sm whitespace-pre-wrap">{inquiry.notes}</p>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">{t("inquiries.relatedItineraries") || "Related Itineraries"}</h3>
              {inquiry.itineraries && inquiry.itineraries.length > 0 ? (
                <div className="space-y-2">
                  {inquiry.itineraries.map((it: any) => (
                    <button
                      key={it.id}
                      onClick={() => navigate(`/sales/itineraries/${it.id}`)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <span className="text-sm font-medium">{it.title}</span>
                      <span className="text-xs text-gray-400 ml-2">{it.status}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">{t("inquiries.noItineraries") || "No itineraries yet"}</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">{t("inquiries.status") || "Status"}</h3>
              <div className="space-y-2 text-sm">
                <div><span className="text-gray-500">{t("inquiries.stage") || "Stage"}:</span> <Badge variant={stageStyle.color as any}>{t(`inquiries.stages.${inquiry.stage}`) || inquiry.stage}</Badge></div>
                <div><span className="text-gray-500">{t("inquiries.source") || "Source"}:</span> {t(`inquiries.sources.${inquiry.source}`) || inquiry.source}</div>
                {inquiry.assignedTo && <div><span className="text-gray-500">{t("inquiries.assignedTo") || "Assigned"}:</span> {inquiry.assignedTo}</div>}
                {inquiry.nextActionAt && <div><span className="text-gray-500">{t("inquiries.nextAction") || "Next action"}:</span> {formatDate(inquiry.nextActionAt)}</div>}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{t("inquiries.metadata") || "Metadata"}</h3>
              <div className="space-y-1 text-xs text-gray-400">
                <p>{t("common.created") || "Created"}: {formatDate(inquiry.createdAt)}</p>
                <p>{t("common.updated") || "Updated"}: {formatDate(inquiry.updatedAt)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDelete(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">{t("inquiries.deleteConfirmTitle") || "Delete Inquiry?"}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {t("inquiries.deleteConfirmDescription") || "This will delete the inquiry. Any linked itineraries will remain and become standalone."}
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowDelete(false)} disabled={deleting}>
                {t("common.cancel") || "Cancel"}
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? t("common.deleting") || "Deleting..." : t("common.delete") || "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
