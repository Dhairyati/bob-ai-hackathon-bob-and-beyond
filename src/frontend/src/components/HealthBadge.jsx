export default function HealthBadge({ status }) {
  const cls = status.toLowerCase();
  const dot = (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: `var(--color-${cls})`,
        display: 'inline-block',
      }}
    />
  );
  return (
    <span className={`health-badge ${cls}`} id={`health-badge-${cls}`}>
      {dot}
      {status}
    </span>
  );
}
