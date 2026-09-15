import React from 'react';

interface ScoreRingProps {
  score: number; // 0 to 100
  size?: number; // diameter in px
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  showGrade?: boolean;
  className?: string;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 96,
  strokeWidth = 7,
  label = 'AI SCORE',
  sublabel,
  showGrade = true,
  className = '',
}) => {
  const safeScore = Math.min(100, Math.max(0, Math.round(score || 0)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (safeScore / 100) * circumference;

  const getColor = (val: number) => {
    if (val >= 80) return { stroke: '#22C55E', text: 'text-emerald-400', grade: 'A+', zone: 'BUY ZONE' };
    if (val >= 70) return { stroke: '#38BDF8', text: 'text-sky-400', grade: 'A', zone: 'ACCUMULATE' };
    if (val >= 60) return { stroke: '#818CF8', text: 'text-indigo-400', grade: 'B+', zone: 'OUTPERFORM' };
    if (val >= 50) return { stroke: '#EAB308', text: 'text-amber-400', grade: 'B', zone: 'HOLD' };
    if (val >= 40) return { stroke: '#F97316', text: 'text-orange-400', grade: 'C', zone: 'CAUTION' };
    return { stroke: '#EF4444', text: 'text-rose-400', grade: 'D', zone: 'AVOID' };
  };

  const { stroke, text, grade, zone } = getColor(safeScore);

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1E293B"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={`text-xl font-bold font-mono tracking-tight ${text}`}>
            {safeScore}
          </span>
          {showGrade && (
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {grade}
            </span>
          )}
        </div>
      </div>

      {label && (
        <div className="mt-2 text-center">
          <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{label}</p>
          {sublabel ? (
            <p className={`text-xs font-semibold ${text}`}>{sublabel}</p>
          ) : (
            <p className={`text-[11px] font-semibold ${text}`}>{zone}</p>
          )}
        </div>
      )}
    </div>
  );
};
