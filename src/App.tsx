import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/AuthContext';
import { ThemeProvider } from './hooks/ThemeContext';
import { ToastProvider } from './components/ui/Toast';

import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { AuthCallback } from './pages/AuthCallback';
import { BusinessOnboarding } from './pages/BusinessOnboarding';
import { BusinessList } from './pages/BusinessList';
import { BooksList } from './pages/BooksList';
import { LedgersList } from './pages/LedgersList';
import { LedgerDetail } from './pages/LedgerDetail';
import { TeamManagement } from './pages/TeamManagement';
import { AuditLog } from './pages/AuditLog';
import { AcceptInvite } from './pages/AcceptInvite';

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/invite" element={<AcceptInvite />} />

            <Route path="/" element={<ProtectedRoute><BusinessOnboarding /></ProtectedRoute>} />
            <Route path="/businesses" element={<ProtectedRoute><BusinessList /></ProtectedRoute>} />
            <Route path="/business/:businessId/books" element={<ProtectedRoute><BooksList /></ProtectedRoute>} />
            <Route path="/business/:businessId/books/:bookId/ledgers" element={<ProtectedRoute><LedgersList /></ProtectedRoute>} />
            <Route path="/business/:businessId/books/:bookId/ledgers/:ledgerId" element={<ProtectedRoute><LedgerDetail /></ProtectedRoute>} />
            <Route
              path="/business/:businessId/team"
              element={
                <ProtectedRoute>
                  <TeamManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/business/:businessId/audit"
              element={
                <ProtectedRoute>
                  <AuditLog />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
