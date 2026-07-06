import { useEffect } from "react";
import { SidebarProvider, useSidebar, scopeFromPath } from "../context/SidebarContext";
import { Outlet, useLocation } from "react-router";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen, activeScope, setActiveScope } = useSidebar();
  const location = useLocation();

  // Keep sidebar scope in sync with the current route.
  useEffect(() => {
    setActiveScope(scopeFromPath(location.pathname));
    // When entering a no-sidebar route, make sure the mobile drawer is closed
    // (so it doesn't pop open on navigation).
  }, [location.pathname, setActiveScope]);

  const showSidebar = activeScope !== null;

  return (
    <div className="min-h-screen xl:flex">
      {showSidebar && (
        <div>
          <AppSidebar />
          <Backdrop />
        </div>
      )}
      <div
        className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${
          showSidebar
            ? `${isExpanded || isHovered ? "lg:ml-[290px]" : "lg:ml-[90px]"} ${isMobileOpen ? "ml-0" : ""}`
            : "lg:ml-0"
        }`}
      >
        <AppHeader />
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6 w-full min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
