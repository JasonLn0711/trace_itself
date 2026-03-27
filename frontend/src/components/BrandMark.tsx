import { useId } from 'react';

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  const id = useId().replace(/:/g, '');
  const bgId = `${id}-bg`;
  const waveId = `${id}-wave`;
  const sparkId = `${id}-spark`;

  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={bgId} x1="10" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14202d" />
          <stop offset="1" stopColor="#0A0F15" />
        </linearGradient>
        <linearGradient id={waveId} x1="12" y1="34" x2="54" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#58D0BE" />
          <stop offset="1" stopColor="#A5F1E8" />
        </linearGradient>
        <linearGradient id={sparkId} x1="38" y1="12" x2="49" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4C56F" />
          <stop offset="1" stopColor="#FFF0C8" />
        </linearGradient>
      </defs>

      <rect x="4" y="4" width="56" height="56" rx="18" fill={`url(#${bgId})`} />
      <rect x="4.5" y="4.5" width="55" height="55" rx="17.5" stroke="white" strokeOpacity="0.08" />

      <path
        d="M14 38H22L27.5 24L33 42L38 31L50 31"
        stroke={`url(#${waveId})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="38" r="3.5" fill="#58D0BE" />
      <circle cx="50" cy="31" r="3.5" fill="#A5F1E8" />

      <path
        d="M43.5 14.5L45 18.5L49 20L45 21.5L43.5 25.5L42 21.5L38 20L42 18.5L43.5 14.5Z"
        fill={`url(#${sparkId})`}
      />
    </svg>
  );
}
