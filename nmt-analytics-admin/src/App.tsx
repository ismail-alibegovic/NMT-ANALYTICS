import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router";
import PageSkeleton from "./components/common/PageSkeleton";
import ErrorBoundary from "./components/common/ErrorBoundary";
import AuthGuard from "./components/auth/AuthGuard";
import { ModuleGuard } from "./components/auth/ModuleGuard";
import AppLayout from "./layout/AppLayout";
import PortalGuard from "./components/auth/PortalGuard";
import "./index.css";

const SignIn = lazy(() => import("./pages/AuthPages/SignIn"));
const SignUp = lazy(() => import("./pages/AuthPages/SignUp"));
const ResetPassword = lazy(() => import("./pages/AuthPages/ResetPassword"));
const Home = lazy(() => import("./pages/Dashboard/Home"));
const HomeHub = lazy(() => import("./pages/Hub/HomeHub"));
const SalesScope = lazy(() => import("./pages/Hub/SalesScope"));
const OperationsScope = lazy(() => import("./pages/Hub/OperationsScope"));
const FinanceScope = lazy(() => import("./pages/Hub/FinanceScope"));
const Customers = lazy(() => import("./pages/admin/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const Packages = lazy(() => import("./pages/admin/Packages"));
const Reservations = lazy(() => import("./pages/Reservations"));
const Departures = lazy(() => import("./pages/admin/Departures"));
const DepartureDetail = lazy(() => import("./pages/DepartureDetail"));
const UnifiedPayments = lazy(() => import("./pages/admin/UnifiedPayments"));
const Reports = lazy(() => import("./pages/Reports"));
const Integrations = lazy(() => import("./pages/admin/Integrations"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const Documents = lazy(() => import("./pages/admin/Documents"));
const PdfTemplateEditor = lazy(() => import("./pages/admin/PdfTemplateEditor"));
// Phase A — TuristAgent adoption
const CalendarPage = lazy(() => import("./pages/operations/Calendar"));
const ContractsPage = lazy(() => import("./pages/operations/Contracts"));
const ReceiptsPage = lazy(() => import("./pages/operations/Receipts"));
// Phase B — TuristAgent adoption
const SubAgentsPage = lazy(() => import("./pages/operations/SubAgents"));
const CommissionRulesPage = lazy(() => import("./pages/operations/CommissionRules"));
const ExcursionsPage = lazy(() => import("./pages/operations/Excursions"));
const HotelsPage = lazy(() => import("./pages/operations/Hotels"));
const AvailabilityPage = lazy(() => import("./pages/operations/Availability"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/OtherPage/NotFound"));
const PublicSignWaiver = lazy(() => import("./pages/PublicSignWaiver"));
const PublicSubAgentPortal = lazy(() => import("./pages/PublicSubAgentPortal"));
// Sprint 3 — Customer self-service portal
const PortalLayout = lazy(() => import("./layout/PortalLayout"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const PortalPackages = lazy(() => import("./pages/portal/PortalPackages"));
const PortalDepartures = lazy(() => import("./pages/portal/PortalDepartures"));
const PortalReservations = lazy(() => import("./pages/portal/PortalReservations"));
const PortalCustomers = lazy(() => import("./pages/portal/PortalCustomers"));
const PortalSettings = lazy(() => import("./pages/portal/PortalSettings"));

const NotFoundClientOnly = () => <NotFound />;

const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageSkeleton />}>
    <ErrorBoundary>{children}</ErrorBoundary>
  </Suspense>
);

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/auth/signin" element={<SuspenseWrapper><SignIn /></SuspenseWrapper>} />
        <Route path="/auth/signup" element={<SuspenseWrapper><SignUp /></SuspenseWrapper>} />
        <Route path="/auth/reset-password" element={<SuspenseWrapper><ResetPassword /></SuspenseWrapper>} />
        {/* Legacy / bare aliases — keep old links and pasted URLs working */}
        <Route path="/signin" element={<Navigate to="/auth/signin" replace />} />
        <Route path="/signup" element={<Navigate to="/auth/signup" replace />} />
        <Route path="/reset-password" element={<SuspenseWrapper><ResetPassword /></SuspenseWrapper>} />
        <Route path="/waiver/:token" element={<SuspenseWrapper><PublicSignWaiver /></SuspenseWrapper>} />
        <Route path="/portal/subagent/:token" element={<SuspenseWrapper><PublicSubAgentPortal /></SuspenseWrapper>} />

        {/* Sprint 3 — Customer self-service portal (own layout, no admin sidebar) */}
        <Route element={<AuthGuard><PortalGuard><PortalLayout /></PortalGuard></AuthGuard>}>
          <Route path="/portal" element={<SuspenseWrapper><PortalDashboard /></SuspenseWrapper>} />
          <Route path="/portal/packages" element={<SuspenseWrapper><PortalPackages /></SuspenseWrapper>} />
          <Route path="/portal/departures" element={<SuspenseWrapper><PortalDepartures /></SuspenseWrapper>} />
          <Route path="/portal/reservations" element={<SuspenseWrapper><PortalReservations /></SuspenseWrapper>} />
          <Route path="/portal/customers" element={<SuspenseWrapper><PortalCustomers /></SuspenseWrapper>} />
          <Route path="/portal/settings" element={<SuspenseWrapper><PortalSettings /></SuspenseWrapper>} />
        </Route>

        <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
          <Route path="/" element={<SuspenseWrapper><HomeHub /></SuspenseWrapper>} />
          <Route path="/home" element={<SuspenseWrapper><HomeHub /></SuspenseWrapper>} />
          <Route path="/sales" element={<SuspenseWrapper><SalesScope /></SuspenseWrapper>} />
          <Route path="/operations" element={<SuspenseWrapper><OperationsScope /></SuspenseWrapper>} />
          <Route path="/finance" element={<SuspenseWrapper><FinanceScope /></SuspenseWrapper>} />
          <Route path="/dashboard" element={<SuspenseWrapper><Home /></SuspenseWrapper>} />
          <Route path="/customers" element={<SuspenseWrapper><Customers /></SuspenseWrapper>} />
          <Route path="/customers/:id" element={<SuspenseWrapper><CustomerDetail /></SuspenseWrapper>} />
          <Route path="/packages" element={<SuspenseWrapper><Packages /></SuspenseWrapper>} />
          <Route path="/reservations" element={<SuspenseWrapper><Reservations /></SuspenseWrapper>} />
          <Route path="/departures" element={<SuspenseWrapper><Departures /></SuspenseWrapper>} />
          <Route path="/departures/:id" element={<SuspenseWrapper><DepartureDetail /></SuspenseWrapper>} />
          <Route path="/payments" element={<SuspenseWrapper><ModuleGuard moduleKey="payments"><UnifiedPayments /></ModuleGuard></SuspenseWrapper>} />
          <Route path="/reports" element={<SuspenseWrapper><ModuleGuard moduleKey="analytics" fallback={<NotFoundClientOnly />}><Reports /></ModuleGuard></SuspenseWrapper>} />
          <Route path="/integrations" element={<SuspenseWrapper><ModuleGuard moduleKey="integrations" fallback={<NotFoundClientOnly />}><Integrations /></ModuleGuard></SuspenseWrapper>} />
          <Route path="/settings" element={<SuspenseWrapper><Settings /></SuspenseWrapper>} />
          <Route path="/settings/pdf-templates" element={<SuspenseWrapper><PdfTemplateEditor /></SuspenseWrapper>} />
          <Route path="/admin/audit-logs" element={<SuspenseWrapper><AuditLogs /></SuspenseWrapper>} />
          <Route path="/admin/documents" element={<SuspenseWrapper><ModuleGuard moduleKey="documents" fallback={<NotFoundClientOnly />}><Documents /></ModuleGuard></SuspenseWrapper>} />
          {/* Phase A — Operations */}
          <Route path="/operations/calendar" element={<SuspenseWrapper><CalendarPage /></SuspenseWrapper>} />
          <Route path="/operations/contracts" element={<SuspenseWrapper><ContractsPage /></SuspenseWrapper>} />
          <Route path="/operations/receipts" element={<SuspenseWrapper><ReceiptsPage /></SuspenseWrapper>} />
          {/* Phase B — Operations */}
          <Route path="/operations/subagents" element={<SuspenseWrapper><SubAgentsPage /></SuspenseWrapper>} />
          <Route path="/operations/commission-rules" element={<SuspenseWrapper><CommissionRulesPage /></SuspenseWrapper>} />
          <Route path="/operations/excursions" element={<SuspenseWrapper><ModuleGuard moduleKey="travel_core" fallback={<NotFoundClientOnly />}><ExcursionsPage /></ModuleGuard></SuspenseWrapper>} />
          <Route path="/operations/hotels" element={<SuspenseWrapper><ModuleGuard moduleKey="travel_core" fallback={<NotFoundClientOnly />}><HotelsPage /></ModuleGuard></SuspenseWrapper>} />
          <Route path="/operations/availability" element={<SuspenseWrapper><ModuleGuard moduleKey="travel_core" fallback={<NotFoundClientOnly />}><AvailabilityPage /></ModuleGuard></SuspenseWrapper>} />
          <Route path="/profile" element={<SuspenseWrapper><Profile /></SuspenseWrapper>} />
        </Route>

        <Route path="*" element={<SuspenseWrapper><NotFound /></SuspenseWrapper>} />
      </Routes>
    </Router>
  );
}
