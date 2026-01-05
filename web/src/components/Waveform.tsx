import React, { useEffect, useRef } from 'react';

interface WaveformProps {
  samples: Float32Array;
  sampleRate: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

const Waveform: React.FC<WaveformProps> = ({ samples, sampleRate, currentTime, onSeek }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!samples || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parentWidth = canvas.parentElement?.clientWidth || 800;
    const width = parentWidth;
    const height = 120;

    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, width, height);

    // Downsample for visualization
    const samplesPerPixel = Math.ceil(samples.length / width);
    const centerY = height / 2;

    // Draw waveform
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(0, centerY);

    for (let x = 0; x < width; x++) {
      let min = 0;
      let max = 0;

      const startIdx = x * samplesPerPixel;
      for (let i = 0; i < samplesPerPixel; i++) {
        const idx = startIdx + i;
        if (idx >= samples.length) break;
        const sample = samples[idx];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      ctx.lineTo(x, centerY + min * centerY * 0.9);
    }

    for (let x = width - 1; x >= 0; x--) {
      let min = 0;
      let max = 0;

      const startIdx = x * samplesPerPixel;
      for (let i = 0; i < samplesPerPixel; i++) {
        const idx = startIdx + i;
        if (idx >= samples.length) break;
        const sample = samples[idx];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      ctx.lineTo(x, centerY + max * centerY * 0.9);
    }

    ctx.closePath();
    ctx.fill();

    // Draw progress
    const duration = samples.length / sampleRate;
    const progress = currentTime / duration;
    const progressWidth = width * progress;

    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    ctx.moveTo(0, centerY);

    for (let x = 0; x < progressWidth; x++) {
      let min = 0;
      let max = 0;

      const startIdx = x * samplesPerPixel;
      for (let i = 0; i < samplesPerPixel; i++) {
        const idx = startIdx + i;
        if (idx >= samples.length) break;
        const sample = samples[idx];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      ctx.lineTo(x, centerY + min * centerY * 0.9);
    }

    for (let x = Math.min(width - 1, Math.floor(progressWidth) - 1); x >= 0; x--) {
      let min = 0;
      let max = 0;

      const startIdx = x * samplesPerPixel;
      for (let i = 0; i < samplesPerPixel; i++) {
        const idx = startIdx + i;
        if (idx >= samples.length) break;
        const sample = samples[idx];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      ctx.lineTo(x, centerY + max * centerY * 0.9);
    }

    ctx.closePath();
    ctx.fill();

  }, [samples, sampleRate, currentTime]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const duration = samples.length / sampleRate;
    const seekTime = (x / width) * duration;
    onSeek(seekTime);
  };

  return (
    <div className="w-full overflow-hidden rounded-lg bg-slate-900/50 border border-slate-700/50 p-4">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="w-full h-32 cursor-pointer"
      />
    </div>
  );
};

export default Waveform;
