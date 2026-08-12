import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/common/ProtectedRoute";
import { RequirePermission } from "./components/common/PermissionRoute";
import { ClientsListProvider } from "./context/ClientsListContext";

const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const ChangePasswordPage = lazy(() => import("./pages/ChangePasswordPage"));
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage"));
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
const RemindersPage = lazy(() => import("./pages/aplus/RemindersPage"));
const UsersPage = lazy(() => import("./pages/aplus/UsersPage"));
const AuditLogsPage = lazy(() => import("./pages/aplus/AuditLogsPage"));
const PermissionsPage = lazy(() => import("./pages/aplus/PermissionsPage"));
const LegalEulaPage     = lazy(() => import("./pages/legal/LegalEulaPage"));
const LegalPrivacyPage  = lazy(() => import("./pages/legal/LegalPrivacyPage"));

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
        {/* Public legal pages — no authentication required */}
        <Route path="/legal/eula"    element={<LegalEulaPage />} />
        <Route path="/legal/privacy" element={<LegalPrivacyPage />} />

        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />

        <Route path="/dashboard" element={<ProtectedRoute><DashboardSelectPage /></ProtectedRoute>} />
        <Route path="/smart-steps" element={<ProtectedRoute><RedirectToSmartSteps /></ProtectedRoute>} />
        <Route path="/aba-coming-soon" element={<ProtectedRoute><Navigate to="/smart-steps" replace /></ProtectedRoute>} />

        <Route path="/aplus" element={<ProtectedRoute><ClientsListProvider><AppLayout /></ClientsListProvider></ProtectedRoute>}>
          <Route index element={<RequirePermission permission="aplus.dashboard.view"><OverviewPage /></RequirePermission>} />
          <Route path="clients" element={<RequirePermission permission="aplus.clients.view"><ClientsPage /></RequirePermission>} />
          <Route path="clients/:id" element={<RequirePermission permission="aplus.clients.view"><ClientDetailPage /></RequirePermission>} />
          <Route path="clients/:id/:tab" element={<RequirePermission permission="aplus.clients.view"><ClientDetailPage /></RequirePermission>} />
          <Route path="services" element={<RequirePermission permission="aplus.services.view"><ServicesPage /></RequirePermission>} />
          <Route path="providers" element={<RequirePermission permission="aplus.providers.view"><ProvidersPage /></RequirePermission>} />
          <Route path="appointments" element={<RequirePermission permission="aplus.appointments.view"><AppointmentsPage /></RequirePermission>} />
          <Route path="reminders" element={<RequirePermission permission="aplus.communications.view"><RemindersPage /></RequirePermission>} />
          <Route path="data-tracking" element={<RequirePermission permission="aplus.data_tracking.view"><DataTrackingPage /></RequirePermission>} />
          <Route path="assessments" element={<RequirePermission permission="aplus.assessments.view"><AssessmentsPage /></RequirePermission>} />
          <Route path="waitlist" element={<RequirePermission permission="aplus.waitlist.view"><WaitlistPage /></RequirePermission>} />
          <Route path="invoices" element={<RequirePermission permission="aplus.billing.view_invoices"><InvoicesPage /></RequirePermission>} />
          <Route path="payments" element={<RequirePermission permission="aplus.billing.view_payment_history"><PaymentsPage /></RequirePermission>} />
          <Route path="intake" element={<RequirePermission permission="aplus.intake.view"><IntakeFormPage /></RequirePermission>} />
          <Route path="settings" element={<RequirePermission permission="aplus.settings.view"><SettingsPage /></RequirePermission>} />
          <Route path="settings/permissions" element={<RequirePermission permission="aplus.settings.manage_permissions"><PermissionsPage /></RequirePermission>} />
          <Route path="users" element={<RequirePermission permission="aplus.users.view"><UsersPage /></RequirePermission>} />
          <Route path="audit-logs" element={<RequirePermission permission="aplus.audit_logs.view"><AuditLogsPage /></RequirePermission>} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
