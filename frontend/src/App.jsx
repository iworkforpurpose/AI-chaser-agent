import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import TaskBoard from './pages/TaskBoard';
import ChaserLog from './pages/ChaserLog';
import ChaserRules from './pages/ChaserRules';
import Login from './pages/Login';
import Register from './pages/Register';
import LandingPage from './pages/Landing/LandingPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh',
        background: 'var(--bg-primary)', color: 'var(--text-muted)'
      }}>
        Loading...
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return children;
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh',
        background: 'var(--bg-secondary)', color: 'var(--text-muted)'
      }}>
        Verifying session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function Sidebar({ theme, onToggleTheme }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const navItems = [
    { to: '/dashboard', icon: '▦', label: 'Dashboard' },
    { to: '/tasks', icon: '⊞', label: 'Task Board' },
    { to: '/log', icon: '◈', label: 'Activity Log' },
    { to: '/rules', icon: '⚙', label: 'Chaser Rules' },
  ];

  const avatarLetters = (user?.name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
        <span className="brand-icon">⚡</span>
        <span className="brand-name">Chaser</span>
        <span className="brand-tag">Agent</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="user-avatar">{avatarLetters}</div>
          <div className="user-info">
            <div className="user-name">{user?.name}</div>
            <div className="user-role" style={{ textTransform: 'capitalize' }}>{user?.role}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: 12 }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ flex: 2, justifyContent: 'center', color: 'var(--accent-red)' }}
            onClick={logout}
          >
            Log Out
          </button>
        </div>
      </div>
    </aside>
  );
}

function Layout({ children, theme, onToggleTheme }) {
  return (
    <div className="app-layout">
      <Sidebar theme={theme} onToggleTheme={onToggleTheme} />
      <main className="main-content">{children}</main>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Landing Page — always accessible */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/landingpage" element={<LandingPage />} />

            {/* Auth Routes */}
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

            {/* Protected Routes inside Layout */}
            <Route path="/dashboard" element={<PrivateRoute><Layout theme={theme} onToggleTheme={toggleTheme}><Dashboard /></Layout></PrivateRoute>} />
            <Route path="/tasks" element={<PrivateRoute><Layout theme={theme} onToggleTheme={toggleTheme}><TaskBoard /></Layout></PrivateRoute>} />
            <Route path="/log" element={<PrivateRoute><Layout theme={theme} onToggleTheme={toggleTheme}><ChaserLog /></Layout></PrivateRoute>} />
            <Route path="/rules" element={<PrivateRoute><Layout theme={theme} onToggleTheme={toggleTheme}><ChaserRules /></Layout></PrivateRoute>} />

            {/* Global Redirects */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                fontSize: '14px',
                boxShadow: 'none',
              },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
