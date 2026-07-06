import { createContext, useContext, useState, useEffect } from "react";

export type Scope = "sales" | "operations" | "finance" | "admin" | null;

// Derive which sidebar section a route belongs to.
// Returns null for the homepage so the sidebar stays hidden there.
export function scopeFromPath(pathname: string): Scope {
  if (!pathname) return null;
  // Homepage routes — no sidebar
  if (pathname === "/" || pathname === "/home" || pathname === "/sales" || pathname === "/operations" || pathname === "/finance") {
    // /sales, /operations, /finance are scope hubs — they show the sidebar too,
    // but we keep scope = null on /sales itself so the user sees all groups there.
    // Actually: per Ismail's spec, sidebar appears only once a section is clicked.
    // The hub scope pages ARE the section landing — so set the scope there.
    if (pathname === "/sales") return "sales";
    if (pathname === "/operations") return "operations";
    if (pathname === "/finance") return "finance";
    return null;
  }
  if (pathname.startsWith("/operations/")) return "operations";
  if (pathname.startsWith("/admin/")) return "admin";
  if (
    pathname.startsWith("/payments") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/integrations")
  ) {
    return "finance";
  }
  // Everything else belongs to sales (dashboard, reservations, customers, packages, departures, departure detail)
  return "sales";
}

type SidebarContextType = {
  isExpanded: boolean;
  isMobileOpen: boolean;
  isHovered: boolean;
  activeItem: string | null;
  openSubmenu: string | null;
  activeScope: Scope;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  setIsHovered: (isHovered: boolean) => void;
  setActiveItem: (item: string | null) => void;
  toggleSubmenu: (item: string) => void;
  setActiveScope: (scope: Scope) => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [activeScope, setActiveScope] = useState<Scope>(null);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMobileOpen(false);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const toggleSidebar = () => {
    setIsExpanded((prev) => !prev);
  };

  const toggleMobileSidebar = () => {
    setIsMobileOpen((prev) => !prev);
  };

  const toggleSubmenu = (item: string) => {
    setOpenSubmenu((prev) => (prev === item ? null : item));
  };

  return (
    <SidebarContext.Provider
      value={{
        isExpanded: isMobile ? false : isExpanded,
        isMobileOpen,
        isHovered,
        activeItem,
        openSubmenu,
        activeScope,
        toggleSidebar,
        toggleMobileSidebar,
        setIsHovered,
        setActiveItem,
        toggleSubmenu,
        setActiveScope,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
};
