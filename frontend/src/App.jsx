import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import TaskBoard from './pages/TaskBoard';
import ChaserLog from './pages/ChaserLog';
import ChaserRules from './pages/ChaserRules';
// Notifications feature not yet implemented
// import { notifApi } from './api';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

function Sidebar({ theme, onToggleTheme }) {
  const location = useLocation();
  // TODO: Implement notifications feature
  // const { data: notifs } = useQuery({
  //   queryKey: ['notifications'],
  //   queryFn: () => notifApi.list('arjun@acme.com'),
  //   refetchInterval: 30000,
  // });
  // const unreadCount = notifs?.data?.filter(n => !n.read).length || 0;

  const navItems = [
    { to: '/', icon: '▦', label: 'Dashboard' },
    { to: '/tasks', icon: '⊞', label: 'Task Board' },
    { to: '/log', icon: '◈', label: 'Activity Log' },
    { to: '/rules', icon: '⚙', label: 'Chaser Rules' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-icon">⚡</span>
        <span className="brand-name">Chaser</span>
        <span className="brand-tag">Agent</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {/* Notification badge disabled until backend endpoint exists */}
            {/* {item.label === 'Activity Log' && unreadCount > 0 && (
              <span className="nav-badge">{unreadCount}</span>
            )} */}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="user-avatar">AJ</div>
          <div className="user-info">
            <div className="user-name">Arjun Sharma</div>
            <div className="user-role">Manager</div>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
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
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout theme={theme} onToggleTheme={toggleTheme}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<TaskBoard />} />
            <Route path="/log" element={<ChaserLog />} />
            <Route path="/rules" element={<ChaserRules />} />
          </Routes>
        </Layout>
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
    </QueryClientProvider>
  );
}
