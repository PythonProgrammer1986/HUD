import { Maximize2, Minimize2 } from 'lucide-react';
import { AppView } from '../types/adas';

interface TopBarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  windshieldMode: boolean;
  onToggleWindshieldMode: () => void;
}

export function TopBar({
  activeView,
  onSelectView,
  windshieldMode,
  onToggleWindshieldMode,
}: TopBarProps) {
  const navItems: { id: AppView; label: string }[] = [
    { id: 'cockpit', label: 'Cockpit' },
    { id: 'methodology', label: 'Methodology' },
    { id: 'triplog', label: 'Trip Log' },
  ];

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-[#0B0E17] px-3 sm:gap-8 sm:px-5">
      <button
        type="button"
        onClick={() => onSelectView('cockpit')}
        className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
      >
        DriveSight India
      </button>

      <nav className="flex items-center gap-3 sm:gap-6" aria-label="Primary navigation">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`relative py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                isActive ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan-400" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onToggleWindshieldMode}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          {windshieldMode ? (
            <>
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Exit HUD</span>
              <span className="sm:hidden">Exit</span>
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Windshield HUD</span>
              <span className="sm:hidden">HUD</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
