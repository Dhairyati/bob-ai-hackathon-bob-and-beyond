import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Plane, BarChart3, Upload, Bell, Cpu,
  ChevronLeft, ChevronRight, Activity, Sliders, Calendar,
  ShieldCheck, ClipboardList
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Fleet Overview' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/whatif', icon: Sliders, label: 'What-If Simulator' },
  { path: '/timeline', icon: Calendar, label: 'Maintenance Timeline' },
  { path: '/readiness', icon: ShieldCheck, label: 'Mission Readiness' },
  { path: '/maintenance-plan', icon: ClipboardList, label: 'Maintenance Plan' },
  { path: '/alerts', icon: Bell, label: 'Alert Center' },
  { path: '/upload', icon: Upload, label: 'Upload & Predict' },
  { path: '/model', icon: Cpu, label: 'Model Performance' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();

  return (
    <aside
      className="sidebar"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width var(--transition-normal)',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: collapsed ? '20px 16px' : '20px 22px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minHeight: '72px',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--gradient-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Activity size={20} color="#fff" />
        </div>
        {!collapsed && (
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>
              RUL Dashboard
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              C-MAPSS Predictive
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === '/'
              ? location.pathname === '/' || location.pathname.startsWith('/engine/')
              : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: collapsed ? '11px 16px' : '11px 14px',
                borderRadius: 'var(--radius-sm)',
                color: isActive ? 'var(--accent-primary-light)' : 'var(--text-secondary)',
                background: isActive ? 'var(--accent-glow)' : 'transparent',
                border: isActive ? '1px solid rgba(99, 102, 241, 0.15)' : '1px solid transparent',
                textDecoration: 'none',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : 400,
                transition: 'all var(--transition-fast)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--bg-glass)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <item.icon size={18} style={{ flexShrink: 0 }} />
              {!collapsed && item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse btn */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '10px',
            padding: '10px 14px',
            width: '100%',
            background: 'none',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontFamily: 'Inter, sans-serif',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> Collapse</>}
        </button>
      </div>
    </aside>
  );
}
