import {
  CalenderIcon,
  FileIcon,
  DollarLineIcon,
  UserCircleIcon,
  ShootingStarIcon,
  GridIcon,
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
      href: "/operations/calendar",
      icon: CalenderIcon,
      title: t.nav.calendar,
      description: t.operations.calendar.description,
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
