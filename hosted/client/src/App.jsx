import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import VerifyEmailPage from './pages/VerifyEmailPage.jsx';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="fullscreen-center">
        <div className="glow-orb" />
        <p>Loading your studio...</p>
      </div>
    );
  }

  if (!user && !import.meta.env.VITE_HOSTED_SITES) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={import.meta.env.VITE_HOSTED_SITES ? <Navigate to="/login" replace /> : <RegisterPage />} />
      <Route path="/forgot-password" element={import.meta.env.VITE_HOSTED_SITES ? <Navigate to="/login" replace /> : <ForgotPasswordPage />} />
      <Route path="/reset-password" element={import.meta.env.VITE_HOSTED_SITES ? <Navigate to="/login" replace /> : <ResetPasswordPage />} />
      <Route path="/verify-email" element={import.meta.env.VITE_HOSTED_SITES ? <Navigate to="/app" replace /> : <VerifyEmailPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
