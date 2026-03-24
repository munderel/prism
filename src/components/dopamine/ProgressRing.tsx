'use client';

import { m } from 'framer-motion';

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({ progress, size = 48, strokeWidth = 4 }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  // HSL interpolation: red(0) → yellow(60) → green(120)
  const hue = Math.round((progress / 100) * 120);
  const color = `hsl(${hue}, 70%, 50%)`;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgb(31, 41, 55)"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <m.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      {/* Percentage text */}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={size * 0.22}
        fontWeight="bold"
        transform={`rotate(90, ${size / 2}, ${size / 2})`}
      >
        {Math.round(progress)}%
      </text>
    </svg>
  );
}
