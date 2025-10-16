import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './auth/ProtectedRoute';
import AppLayout from './layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ImportPage from './pages/ImportPage';
import StudentProfile from './pages/StudentProfile';
import CurrentDate from './pages/CurrentDate.jsx';
import CourseCatalog from './pages/CourseCatalog';
import RegistrationSchedule from './pages/RegistrationSchedule';
import DegreeProgress from './pages/DegreeProgress';
import RostersGrading from './pages/RostersGrading';
import UserManage from './pages/UserManage';

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
        </Route>
      </Route>

      {/* default: send to /app (will redirect to /login if not authed) */}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
