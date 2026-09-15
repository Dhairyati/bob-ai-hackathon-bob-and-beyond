import { useEffect, useRef, useState } from 'react';

export default function RULGauge({ rul, size = 90 }) {
  const [animatedRul, setAnimatedRul] = useState(0);
  const animRef = useRef(null);

  const maxRul = 125;
  const pct = Math.min(rul / maxRul, 1);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct);

  const color =
    rul > 60 ? 'var(--color-healthy)' :
    rul > 30 ? 'var(--color-warning)' :
    'var(--color-critical)';

  const glowColor =
    rul > 60 ? 'var(--color-healthy-glow)' :
    rul > 30 ? 'var(--color-warning-glow)' :
    'var(--color-critical-glow)';

  useEffect(() => {
    let start = 0;
    const duration = 800;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedRul(Math.round(rul * eased));
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [rul]);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth="5"
        />
        {/* Value ring */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: `drop-shadow(0 0 6px ${glowColor})`,
          }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 800,
            fontSize: size * 0.24,
            color: color,
            lineHeight: 1,
          }}
        >
          {animatedRul}
        </span>
        <span
          style={{
            fontSize: size * 0.1,
            color: 'var(--text-muted)',
            fontWeight: 500,
          }}
        >
          cycles
        </span>
      </div>
    </div>
  );
}
