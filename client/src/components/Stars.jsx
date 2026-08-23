let uid = 0;

function Star({ fill }) {
  const id = 'sg' + ++uid;
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      {fill > 0 && fill < 1 && (
        <defs>
          <linearGradient id={id}>
            <stop offset={`${fill * 100}%`} stopColor="var(--star, #f59e0b)" />
            <stop offset={`${fill * 100}%`} stopColor="#e2e8f0" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2.5l2.9 5.9 6.6 1-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.4l6.6-1L12 2.5Z"
        fill={fill >= 1 ? 'var(--star, #f59e0b)' : fill <= 0 ? '#cbd5e1' : `url(#${id})`}
      />
    </svg>
  );
}

export default function Stars({ value = 0 }) {
  return (
    <span
      className="stars"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        verticalAlign: 'middle',
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} fill={Math.max(0, Math.min(1, value - i))} />
      ))}
    </span>
  );
}
