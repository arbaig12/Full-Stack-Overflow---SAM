import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './auth/ProtectedRoute';
import AppLayout from './layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ImportPage from './pages/ImportPage';
import StudentProfile from './pages/StudentProfile';
import CurrentDate from './pages/CurrentDate.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          {/* Add more child routes here later:
              <Route path="catalog" element={<Catalog />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="degree" element={<Degree />} />
              <Route path="rosters" element={<Rosters />} />
              <Route path="admin" element={<Admin />} />
          */}
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
