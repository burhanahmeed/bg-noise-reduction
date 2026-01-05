import React from 'react';

interface ControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  currentTime: number;
  duration: number;
  volume: number;
  onVolumeChange: (vol: number) => void;
}

const formatTime = (time: number) => {
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const Controls: React.FC<ControlsProps> = ({
  isPlaying,
  onPlayPause,
  currentTime,
  duration,
  volume,
  onVolumeChange,
}) => {
  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-6 w-full p-4 glass rounded-xl">
      <div className="flex items-center gap-4">
        <button
          onClick={onPlayPause}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20"
        >
          {isPlaying ? (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="text-sm font-mono text-slate-300">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      <div className="flex items-center gap-6 w-full md:w-auto">
        <div className="flex items-center gap-3 group">
          <svg className="w-5 h-5 text-slate-400 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-24 accent-indigo-500 bg-slate-700 rounded-lg appearance-none cursor-pointer h-1.5"
          />
        </div>
      </div>
    </div>
  );
};

export default Controls;
