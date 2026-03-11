import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/common/ProtectedRoute";

const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const ChangePasswordPage = lazy(() => import("./pages/ChangePasswordPage"));
const DashboardSelectPage = lazy(() => import("./pages/DashboardSelectPage"));
const ComingSoonPage = lazy(() => import("./pages/ComingSoonPage"));
const RedirectToSmartSteps = lazy(() => import("./pages/RedirectToSmartSteps"));
const OverviewPage = lazy(() => import("./pages/aplus/OverviewPage"));
const ClientsPage = lazy(() => import("./pages/aplus/ClientsPage"));
const ClientDetailPage = lazy(() => import("./pages/aplus/ClientDetailPage"));
const ServicesPage = lazy(() => import("./pages/aplus/ServicesPage"));
const ProvidersPage = lazy(() => import("./pages/aplus/ProvidersPage"));
const AppointmentsPage = lazy(() => import("./pages/aplus/AppointmentsPage"));
const DataTrackingPage = lazy(() => import("./pages/aplus/DataTrackingPage"));
const AssessmentsPage = lazy(() => import("./pages/aplus/AssessmentsPage"));
const WaitlistPage = lazy(() => import("./pages/aplus/WaitlistPage"));
const InvoicesPage = lazy(() => import("./pages/aplus/InvoicesPage"));
const PaymentsPage = lazy(() => import("./pages/aplus/PaymentsPage"));
const IntakeFormPage = lazy(() => import("./pages/aplus/IntakeFormPage"));
const SettingsPage = lazy(() => import("./pages/aplus/SettingsPage"));
const UsersPage = lazy(() => import("./pages/aplus/UsersPage"));
const AuditLogsPage = lazy(() => import("./pages/aplus/AuditLogsPage"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-600">
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />

        <Route path="/dashboard" element={<ProtectedRoute><DashboardSelectPage /></ProtectedRoute>} />
        <Route path="/smart-steps" element={<ProtectedRoute><RedirectToSmartSteps /></ProtectedRoute>} />
        <Route path="/aba-coming-soon" element={<ProtectedRoute><Navigate to="/smart-steps" replace />} />

        <Route path="/aplus" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<OverviewPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientDetailPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="providers" element={<ProvidersPage />} />
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route path="data-tracking" element={<DataTrackingPage />} />
          <Route path="assessments" element={<AssessmentsPage />} />
          <Route path="waitlist" element={<WaitlistPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="intake" element={<IntakeFormPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
