import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import AppLayout from './layout/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ImportPage from './pages/ImportPage.jsx';
import StudentProfile from './pages/StudentProfile.jsx';
import CurrentDate from './pages/CurrentDate.jsx';
import CourseCatalog from './pages/CourseCatalog.jsx';
import RegistrationSchedule from './pages/RegistrationSchedule.jsx';
import DegreeProgress from './pages/DegreeProgress.jsx';
import RostersGrading from './pages/RostersGrading.jsx';
import UserManage from './pages/UserManage.jsx';
import DeclareMajorMinor from './pages/DeclareMajor.jsx';
import Plan from './pages/Plan.jsx';
import ClassManage from './pages/ClassManage.jsx';
import WaiversHolds from './pages/WaiversHolds.jsx';
import AuditLog from './pages/AuditLog.jsx';


export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="catalog" element={<CourseCatalog />} />
          <Route path="schedule" element={<RegistrationSchedule />} />
          <Route path="degree" element={<DegreeProgress />} />
          <Route path="rosters" element={<RostersGrading />} />
          <Route path="userManage" element={<UserManage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="studentProfile" element={<StudentProfile />} />
          <Route path="currentDate" element={<CurrentDate />} />
          <Route path="declare" element={<DeclareMajorMinor />} />
          <Route path="plan" element={<Plan />} />
          <Route path="classManage" element={<ClassManage />} />
          <Route path="waiversHolds" element={<WaiversHolds />} />
          <Route path="auditLog" element={<AuditLog />} />
        </Route>
      </Route>

      {/* default: send to /app (will redirect to /login if not authed) */}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
