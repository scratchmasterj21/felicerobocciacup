import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ViewerPage } from "@/pages/ViewerPage";
import { PracticeViewerPage } from "@/pages/PracticeViewerPage";
import { TeamViewerPage } from "@/pages/TeamViewerPage";
import { AdminDashboard } from "@/pages/AdminDashboard";
import { FairPlayTeacherPage } from "@/pages/FairPlayTeacherPage";
import { AdminLoginPage } from "@/pages/AdminLoginPage";
import { RequireAuth } from "@/components/RequireAuth";
import { ADMIN_APP_ROUTES } from "@/lib/auth/admin";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ViewerPage />} />
        <Route path="interschool" element={<ViewerPage />} />
        <Route path="practice" element={<PracticeViewerPage />} />
        <Route path="t/:tournamentId/team/:teamId" element={<TeamViewerPage />} />
        <Route path="fair-play" element={<FairPlayTeacherPage />} />
        <Route path={ADMIN_APP_ROUTES.login} element={<AdminLoginPage />} />
        <Route
          path={ADMIN_APP_ROUTES.root}
          element={
            <RequireAuth>
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
