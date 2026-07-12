import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router";
import PageSkeleton from "./components/common/PageSkeleton";
import ErrorBoundary from "./components/common/ErrorBoundary";
import AuthGuard from "./components/auth/AuthGuard";
import AppLayout from "./layout/AppLayout";
import "./index.css";

const SignIn = lazy(() => import("./pages/AuthPages/SignIn"));
const SignUp = lazy(() => import("./pages/AuthPages/SignUp"));
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
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/OtherPage/NotFound"));
const PublicSignWaiver = lazy(() => import("./pages/PublicSignWaiver"));
const PublicSubAgentPortal = lazy(() => import("./pages/PublicSubAgentPortal"));

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
        <Route path="/waiver/:token" element={<SuspenseWrapper><PublicSignWaiver /></SuspenseWrapper>} />
        <Route path="/portal/subagent/:token" element={<SuspenseWrapper><PublicSubAgentPortal /></SuspenseWrapper>} />

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
          <Route path="/payments" element={<SuspenseWrapper><UnifiedPayments /></SuspenseWrapper>} />
          <Route path="/reports" element={<SuspenseWrapper><Reports /></SuspenseWrapper>} />
          <Route path="/integrations" element={<SuspenseWrapper><Integrations /></SuspenseWrapper>} />
          <Route path="/settings" element={<SuspenseWrapper><Settings /></SuspenseWrapper>} />
          <Route path="/settings/pdf-templates" element={<SuspenseWrapper><PdfTemplateEditor /></SuspenseWrapper>} />
          <Route path="/admin/audit-logs" element={<SuspenseWrapper><AuditLogs /></SuspenseWrapper>} />
          <Route path="/admin/documents" element={<SuspenseWrapper><Documents /></SuspenseWrapper>} />
          {/* Phase A — Operations */}
          <Route path="/operations/calendar" element={<SuspenseWrapper><CalendarPage /></SuspenseWrapper>} />
          <Route path="/operations/contracts" element={<SuspenseWrapper><ContractsPage /></SuspenseWrapper>} />
          <Route path="/operations/receipts" element={<SuspenseWrapper><ReceiptsPage /></SuspenseWrapper>} />
          {/* Phase B — Operations */}
          <Route path="/operations/subagents" element={<SuspenseWrapper><SubAgentsPage /></SuspenseWrapper>} />
          <Route path="/operations/commission-rules" element={<SuspenseWrapper><CommissionRulesPage /></SuspenseWrapper>} />
          <Route path="/operations/excursions" element={<SuspenseWrapper><ExcursionsPage /></SuspenseWrapper>} />
          <Route path="/operations/hotels" element={<SuspenseWrapper><HotelsPage /></SuspenseWrapper>} />
          <Route path="/profile" element={<SuspenseWrapper><Profile /></SuspenseWrapper>} />
        </Route>

        <Route path="*" element={<SuspenseWrapper><NotFound /></SuspenseWrapper>} />
      </Routes>
    </Router>
  );
}
