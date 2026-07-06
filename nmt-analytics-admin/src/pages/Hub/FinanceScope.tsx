import {
  DollarLineIcon,
  FileIcon,
  PieChartIcon,
  PlugInIcon,
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

export default function FinanceScope() {
  const t = useT().t;
  const { userContext } = useApp();
  const role = userContext?.role;

  const all: Section[] = [
    {
      href: "/payments",
      icon: DollarLineIcon,
      title: t.nav.payments,
      description: t.payments.description,
      minRole: "manager",
    },
    {
      href: "/reservations",
      icon: FileIcon,
      title: t.nav.fakturisanje,
      description: t.dashboard.title,
      minRole: "manager",
    },
    {
      href: "/reports",
      icon: PieChartIcon,
      title: t.nav.reports,
      description: t.reports.description,
      minRole: "manager",
    },
    {
      href: "/integrations",
      icon: PlugInIcon,
      title: t.nav.integrations,
      description: t.integrations.description,
      minRole: "manager",
    },
  ];

  const sections = all.filter((s) => !s.minRole || hasAccess(s.minRole, role));

  return (
    <>
      <ScopeHeader
        title={t.hub.finTitle}
        description={t.hub.finDesc}
        accent="amber"
        icon={DollarLineIcon}
      />
      <SectionGrid sections={sections} />
    </>
  );
}
