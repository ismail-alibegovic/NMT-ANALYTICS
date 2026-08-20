import { useNavigate } from "react-router";
import { Modal } from "../ui/modal";
import { ArrowRightIcon, BoxIconLine, CalenderIcon, DocsIcon, TableIcon } from "../../icons";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";

type QuickCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type CreateOption = {
  id: string;
  title: string;
  description: string;
  href?: string;
  capability: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

export default function QuickCreateModal({ isOpen, onClose }: QuickCreateModalProps) {
  const navigate = useNavigate();
  const { userContext } = useApp();
  const { t } = useT();
  const copy = t.quickCreate;
  const configured = userContext?.agencyProfileConfigured ?? false;
  const capabilities = new Set(userContext?.capabilities || []);

  const options: CreateOption[] = [
    {
      id: "booking",
      title: copy.booking,
      description: copy.bookingDescription,
      href: "/reservations?new=1",
      capability: "customer_sales",
      icon: TableIcon,
    },
    {
      id: "departure",
      title: copy.departure,
      description: copy.departureDescription,
      href: "/departures?new=1",
      capability: "scheduled_departures",
      icon: CalenderIcon,
    },
    {
      id: "inquiry",
      title: copy.inquiry,
      description: copy.inquiryDescription,
      href: "/inquiries?new=1",
      capability: "customer_sales",
      icon: DocsIcon,
    },
    {
      id: "tailor-made",
      title: copy.tailorMade,
      description: copy.tailorMadeDescription,
      href: "/itineraries?new=1",
      capability: "tailor_made_itineraries",
      icon: BoxIconLine,
    },
  ];

  const isAllowed = (option: CreateOption) => !configured || capabilities.has(option.capability);

  const selectOption = (option: CreateOption) => {
    if (!option.href || !isAllowed(option)) return;
    onClose();
    navigate(option.href);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="mx-4 max-w-xl overflow-hidden rounded-xl" title={copy.title}>
      <div className="px-6 pb-6 pt-4">
        <p className="mb-4 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">{copy.subtitle}</p>
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          {options.map((option) => {
            const Icon = option.icon;
            const allowed = isAllowed(option);
            const active = Boolean(option.href && allowed);
            const status = !allowed ? copy.notEnabled : copy.planned;

            return (
              <button
                key={option.id}
                type="button"
                disabled={!active}
                onClick={() => selectOption(option)}
                className="group flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3.5 text-left last:border-b-0 enabled:hover:bg-gray-50 enabled:active:bg-gray-100 disabled:cursor-not-allowed dark:border-gray-800 dark:enabled:hover:bg-white/[0.03] dark:enabled:active:bg-white/[0.05]"
              >
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${active ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400" : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"}`}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${active ? "text-gray-800 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>{option.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">{option.description}</span>
                </span>
                {active ? (
                  <ArrowRightIcon className="size-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
                ) : (
                  <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">{status}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
