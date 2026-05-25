import React from 'react';

interface ProgressBarProps {
  progress: number;
  onStop?: () => void;
  label?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, onStop, label = "Processing..." }) => {
  return (
    <div className="w-full space-y-3 animate-in fade-in zoom-in duration-300 p-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-indigo-100 shadow-lg shadow-indigo-500/10">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-widest">
            {label}
            </span>
        </div>
        <span className="text-[10px] font-mono font-bold text-indigo-400">{Math.round(progress)}%</span>
      </div>
      
      <div className="h-1.5 bg-indigo-50 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300 ease-out relative"
          style={{ width: `${progress}%` }}
        >
            <div className="absolute inset-0 bg-white/30 animate-[shimmer_2s_infinite] w-full"></div>
        </div>
      </div>

      {onStop && (
        <div className="flex justify-center">
          <button 
            onClick={onStop}
            className="group flex items-center space-x-1.5 px-3 py-1 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-600 transition-all duration-200"
          >
            <i className="fas fa-stop text-[8px] group-hover:scale-110 transition-transform"></i>
            <span className="text-[9px] font-bold uppercase tracking-wide">Cancel</span>
          </button>
        </div>
      )}
    </div>
  );
};
