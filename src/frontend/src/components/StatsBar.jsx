import { Plane, Shield, AlertTriangle, AlertOctagon, CircleOff } from 'lucide-react';

export default function StatsBar({ summary }) {
  if (!summary) return null;

  const stats = [
    { label: 'Total Engines', value: summary.total, icon: Plane, cls: 'accent' },
    { label: 'Healthy', value: summary.healthy, icon: Shield, cls: 'healthy' },
    { label: 'Warning', value: summary.warning, icon: AlertTriangle, cls: 'warning' },
    { label: 'Critical', value: summary.critical, icon: AlertOctagon, cls: 'critical' },
    { label: 'Grounded', value: summary.grounded, icon: CircleOff, cls: 'critical' },
  ];

  return (
    <div className="stats-bar">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`stat-card fade-in fade-in-delay-${i + 1}`}
          id={`stat-${s.cls}`}
        >
          <div className={`stat-icon ${s.cls}`}>
            <s.icon size={20} />
          </div>
          <div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
