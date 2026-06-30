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
const Customers = lazy(() => import("./pages/admin/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const Packages = lazy(() => import("./pages/admin/Packages"));
const Reservations = lazy(() => import("./pages/Reservations"));
const Departures = lazy(() => import("./pages/admin/Departures"));
const UnifiedPayments = lazy(() => import("./pages/admin/UnifiedPayments"));
const Reports = lazy(() => import("./pages/Reports"));
const Integrations = lazy(() => import("./pages/admin/Integrations"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const Documents = lazy(() => import("./pages/admin/Documents"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/OtherPage/NotFound"));

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

        <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
          <Route path="/" element={<SuspenseWrapper><Home /></SuspenseWrapper>} />
          <Route path="/dashboard" element={<SuspenseWrapper><Home /></SuspenseWrapper>} />
          <Route path="/customers" element={<SuspenseWrapper><Customers /></SuspenseWrapper>} />
          <Route path="/customers/:id" element={<SuspenseWrapper><CustomerDetail /></SuspenseWrapper>} />
          <Route path="/packages" element={<SuspenseWrapper><Packages /></SuspenseWrapper>} />
          <Route path="/reservations" element={<SuspenseWrapper><Reservations /></SuspenseWrapper>} />
          <Route path="/departures" element={<SuspenseWrapper><Departures /></SuspenseWrapper>} />
          <Route path="/payments" element={<SuspenseWrapper><UnifiedPayments /></SuspenseWrapper>} />
          <Route path="/reports" element={<SuspenseWrapper><Reports /></SuspenseWrapper>} />
          <Route path="/integrations" element={<SuspenseWrapper><Integrations /></SuspenseWrapper>} />
          <Route path="/settings" element={<SuspenseWrapper><Settings /></SuspenseWrapper>} />
          <Route path="/admin/audit-logs" element={<SuspenseWrapper><AuditLogs /></SuspenseWrapper>} />
          <Route path="/admin/documents" element={<SuspenseWrapper><Documents /></SuspenseWrapper>} />
          <Route path="/profile" element={<SuspenseWrapper><Profile /></SuspenseWrapper>} />
        </Route>

        <Route path="*" element={<SuspenseWrapper><NotFound /></SuspenseWrapper>} />
      </Routes>
    </Router>
  );
}
