import {
  CalenderIcon,
  FileIcon,
  DollarLineIcon,
  UserCircleIcon,
  ShootingStarIcon,
  GridIcon,
  TimeIcon,
  PaperPlaneIcon,
} from "../../icons";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import { hasAccess, UserRole } from "../../types/roles";
import { ScopeHeader, SectionGrid } from "./SalesScope";

type Section = {
  href: string;
  icon: React.ComponentType<any>;
  title: string;
  description: string;
  minRole?: UserRole;
};

export default function OperationsScope() {
  const t = useT().t;
  const { userContext } = useApp();
  const role = userContext?.role;

  const all: Section[] = [
    {
      href: "/departures",
      icon: TimeIcon,
      title: t.nav.departures,
      description: t.departures.description,
      minRole: "agent",
    },
    {
      href: "/operations/calendar",
      icon: CalenderIcon,
      title: t.nav.calendar,
      description: t.operations.calendar.description,
      minRole: "viewer",
    },
    {
      href: "/operations/availability",
      icon: GridIcon,
      title: t.nav.availability,
      description: t.operations.availability.description,
      minRole: "viewer",
    },
    {
      href: "/suppliers",
      icon: UserCircleIcon,
      title: t.nav.suppliers,
      description: t.suppliers.description,
      minRole: "viewer",
    },
    {
      href: "/operations/contracts",
      icon: FileIcon,
      title: t.nav.contracts,
      description: t.operations.contracts.description,
      minRole: "viewer",
    },
    {
      href: "/operations/receipts",
      icon: DollarLineIcon,
      title: t.nav.receipts,
      description: t.operations.receipts.description,
      minRole: "manager",
    },
    {
      href: "/operations/subagents",
      icon: UserCircleIcon,
      title: t.nav.subAgents,
      description: t.operations.subagents.description,
      minRole: "manager",
    },
    {
      href: "/operations/commission-rules",
      icon: GridIcon,
      title: t.nav.commissionRules,
      description: t.operations.commissionRules.description,
      minRole: "director",
    },
    {
      href: "/operations/excursions",
      icon: ShootingStarIcon,
      title: t.nav.excursions,
      description: t.operations.excursions.description,
      minRole: "manager",
    },
    {
      href: "/operations/hotels",
      icon: GridIcon,
      title: t.nav.hotels,
      description: t.operations.hotels.description,
      minRole: "manager",
    },
    {
      href: "/operations/flights",
      icon: PaperPlaneIcon,
      title: t.nav.flights,
      description: t.operations.flights.description,
      minRole: "manager",
    },
  ];

  const sections = all.filter((s) => !s.minRole || hasAccess(s.minRole, role));

  return (
    <>
      <ScopeHeader
        title={t.hub.opsTitle}
        description={t.hub.opsDesc}
        accent="emerald"
        icon={CalenderIcon}
      />
      <SectionGrid sections={sections} />
    </>
  );
}
