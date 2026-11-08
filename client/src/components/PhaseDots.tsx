export interface PhaseDotsProps {
  total: number;
  completed: number;
}

/** One dot per focus session in the current set; filled = completed. */
export function PhaseDots({ total, completed }: PhaseDotsProps) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={`h-1.5 w-1.5 rounded-full ${index < completed ? 'bg-mauve' : 'bg-surface1'}`}
        />
      ))}
    </div>
  );
}
