import { useCallback, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { hasAccess, UserRole } from "../types/roles";
import { useT } from "../lib/i18n/context";

import {
  CalenderIcon,
  ChevronDownIcon,
  DollarLineIcon,
  GridIcon,
  HorizontaLDots,
  PieChartIcon,
  ShootingStarIcon,
  TimeIcon,
  UserCircleIcon,
  PlugInIcon,
  LockIcon,
  FileIcon,
} from "../icons";
import { useSidebar } from "../context/SidebarContext";
import { useApp } from "../context/AppContext";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  module?: string;
  minRole?: UserRole;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, activeScope } = useSidebar();
  const { userContext } = useApp();
  const location = useLocation();
  const role = userContext?.role;
  const { t } = useT();

  // No sidebar when no scope at all (shouldn't happen with "all" fallback, but safe).
  if (activeScope === null) return null;

  const canSeeItem = (nav: NavItem) => {
    if (nav.minRole && !hasAccess(nav.minRole, role)) return false;
    if (!nav.module) return true;
    if (userContext?.modules?.includes(nav.module)) return true;
    if (import.meta.env.DEV && (!userContext?.modules || userContext.modules.length === 0)) return true;
    return false;
  };

  // ── Group definitions ──────────────────────────────────────────────
  // Each group is a labeled section in the sidebar. We show ALL groups
  // simultaneously so the user never has to go back to the hub just to
  // switch context.

  const salesItems: NavItem[] = [
    { icon: <GridIcon />, name: t.nav.dashboard, path: "/dashboard", minRole: "viewer" },
    { icon: <UserCircleIcon />, name: t.nav.customers, path: "/customers", module: "customers", minRole: "viewer" },
    { icon: <ShootingStarIcon />, name: t.nav.packages, path: "/packages", module: "packages", minRole: "agent" },
    { icon: <CalenderIcon />, name: t.nav.reservations, path: "/reservations", module: "reservations", minRole: "viewer" },
    { icon: <TimeIcon />, name: t.nav.departures, path: "/departures", module: "departures", minRole: "agent" },
  ];

  const operationsItems: NavItem[] = [
    { icon: <CalenderIcon />, name: t.nav.calendar, path: "/operations/calendar", minRole: "viewer" },
    { icon: <FileIcon />, name: t.nav.contracts, path: "/operations/contracts", minRole: "viewer" },
    { icon: <DollarLineIcon />, name: t.nav.receipts, path: "/operations/receipts", minRole: "manager" },
    { icon: <UserCircleIcon />, name: t.nav.subAgents, path: "/operations/subagents", minRole: "manager" },
    { icon: <GridIcon />, name: t.nav.commissionRules, path: "/operations/commission-rules", minRole: "director" },
    { icon: <ShootingStarIcon />, name: t.nav.excursions, path: "/operations/excursions", minRole: "manager" },
    { icon: <GridIcon />, name: t.nav.hotels, path: "/operations/hotels", minRole: "manager" },
  ];

  const financeItems: NavItem[] = [
    { icon: <DollarLineIcon />, name: t.nav.payments, path: "/payments", module: "payments", minRole: "manager" },
    { icon: <PieChartIcon />, name: t.nav.reports, path: "/reports", module: "analytics", minRole: "manager" },
    { icon: <PlugInIcon />, name: t.nav.integrations, path: "/integrations", module: "integrations", minRole: "manager" },
  ];

  const adminItems: NavItem[] = [
    { icon: <LockIcon />, name: t.nav.auditLogs, path: "/admin/audit-logs", minRole: "director" },
    { icon: <FileIcon />, name: t.nav.documents, path: "/admin/documents", minRole: "manager" },
  ];

  const groups: NavGroup[] = [
    { label: t.nav.prodaja, items: salesItems },
    { label: t.nav.operations, items: operationsItems },
    { label: t.nav.finansije, items: financeItems },
    { label: t.nav.system, items: adminItems },
  ];

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter(canSeeItem) }))
    .filter((g) => g.items.length > 0);

  // ── Submenu state (kept for future nested items) ────────────────────
  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "section";
    index: number;
  } | null>(null);
  const [subMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname]
  );

  const handleSubmenuToggle = (index: number) => {
    setOpenSubmenu((prev) =>
      prev && prev.index === index ? null : { type: "section", index }
    );
  };

  const renderMenuItems = (items: NavItem[]) => (
    <ul className="flex flex-col gap-1">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index)}
              className={`menu-item group ${openSubmenu?.index === index ? "menu-item-active" : "menu-item-inactive"} cursor-pointer ${!isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"}`}
            >
              <span className={`menu-item-icon-size ${openSubmenu?.index === index ? "menu-item-icon-active" : "menu-item-icon-inactive"}`}>
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${openSubmenu?.index === index ? "rotate-180 text-brand-500" : ""}`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                to={nav.path}
                className={`menu-item group ${isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"}`}
              >
                <span className={`menu-item-icon-size ${isActive(nav.path) ? "menu-item-icon-active" : "menu-item-icon-inactive"}`}>
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => { subMenuRefs.current[`section-${index}`] = el; }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height: openSubmenu?.index === index ? `${subMenuHeight[`section-${index}`]}px` : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      to={subItem.path}
                      className={`menu-dropdown-item ${isActive(subItem.path) ? "menu-dropdown-item-active" : "menu-dropdown-item-inactive"}`}
                    >
                      {subItem.name}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span className={`ml-auto ${isActive(subItem.path) ? "menu-dropdown-badge-active" : "menu-dropdown-badge-inactive"} menu-dropdown-badge`}>
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span className={`ml-auto ${isActive(subItem.path) ? "menu-dropdown-badge-active" : "menu-dropdown-badge-inactive"} menu-dropdown-badge`}>
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${isExpanded || isMobileOpen ? "w-[290px]" : isHovered ? "w-[290px]" : "w-[90px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo */}
      <div className={`py-8 flex flex-col gap-2 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start px-2"}`}>
        <Link to="/" className="flex items-center gap-3">
          <img
            src="/images/brand/travline-icon.svg"
            alt="Travline"
            className="h-8 w-8 rounded-lg object-contain shrink-0"
          />
          {(isExpanded || isHovered || isMobileOpen) && (
            <span className="text-xl font-bold text-gray-900 dark:text-white truncate">
              Travline
            </span>
          )}
        </Link>
      </div>

      {/* All nav groups */}
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6 flex flex-col gap-6">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <h2
                className={`mb-2 text-xs uppercase flex leading-[20px] text-gray-400 font-semibold tracking-wider ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
              >
                {isExpanded || isHovered || isMobileOpen ? group.label : <HorizontaLDots className="size-6" />}
              </h2>
              {renderMenuItems(group.items)}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
