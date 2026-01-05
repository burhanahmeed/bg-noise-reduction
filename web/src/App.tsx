import { useState, useRef, useEffect } from 'react';
import './App.css';
import { useNoiseReduction } from './hooks/useNoiseReduction';
import Waveform from './components/Waveform';
import Controls from './components/Controls';
import { decodeAudio, decodeAudioFromBuffer, samplesToWav, downloadBlob, getAudioDuration } from './utils/audio';

interface AudioMetadata {
  name: string;
  size: number;
  duration: number;
  type: string;
}

function App() {
  const { isReady, isProcessing, initModule, processAudio, applyPreset } = useNoiseReduction();
  const [file, setFile] = useState<File | null>(null);
  const [originalSamples, setOriginalSamples] = useState<Float32Array | null>(null);
  const [processedSamples, setProcessedSamples] = useState<Float32Array | null>(null);
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [metadata, setMetadata] = useState<AudioMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<'light' | 'medium' | 'heavy' | 'extreme' | null>(null);

  const config = useRef({
    noise_frames: 10,
    spectral_floor: 0.1,
    over_subtraction: 2.0,
    makeup_gain: 1.5,
  });

  // Original audio state
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  // Processed audio state
  const audioContextRef2 = useRef<AudioContext | null>(null);
  const sourceRef2 = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef2 = useRef<GainNode | null>(null);
  const startTimeRef2 = useRef<number>(0);
  const pausedAtRef2 = useRef<number>(0);
  const timerRef2 = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlaying2, setIsPlaying2] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentTime2, setCurrentTime2] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [volume2, setVolume2] = useState(0.8);

  useEffect(() => {
    initModule();
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef2.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      if (audioContextRef.current) audioContextRef.current.close();
      if (audioContextRef2.current) audioContextRef2.current.close();
    };
  }, [initModule]);

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile) return;

    setError(null);
    setFile(selectedFile);
    setProcessedSamples(null);
    setOriginalSamples(null);
    setSelectedPreset(null);
    stopAudio();
    stopAudio2();

    try {
      const buffer = await selectedFile.arrayBuffer();

      setMetadata({
        name: selectedFile.name,
        size: selectedFile.size,
        duration: 0,
        type: selectedFile.type || 'audio/wav'
      });
      setCurrentTime(0);
      setCurrentTime2(0);
      pausedAtRef.current = 0;
      pausedAtRef2.current = 0;

      setIsLoading(true);
      decodeAudioInBackground(buffer);
    } catch (err) {
      setError('Failed to read audio file.');
      console.error(err);
      setIsLoading(false);
    }
  };

  const decodeAudioInBackground = async (buffer: ArrayBuffer) => {
    if (!audioContextRef.current) return;

    try {
      const { samples, sampleRate: sr } = await decodeAudioFromBuffer(buffer, audioContextRef.current);

      setSampleRate(sr);
      setOriginalSamples(samples);
      setMetadata(prev => prev ? { ...prev, duration: samples.length / sr } : null);
    } catch (err) {
      setError('Failed to decode audio file.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Original audio playback
  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      if (audioContextRef.current && originalSamples) {
        const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
        const current = pausedAtRef.current + elapsed;
        const duration = originalSamples.length / sampleRate;
        if (current >= duration) {
          stopAudio();
          return;
        }
        setCurrentTime(current);
      }
    }, 50);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const playAudio = async (offset: number) => {
    if (!originalSamples || !audioContextRef.current) return;

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    if (audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioContextRef.current.resume();
    }

    try {
      if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch (e) {}
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, originalSamples.length, sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < originalSamples.length; i++) {
        channelData[i] = originalSamples[i];
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = 1.0;

      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = volume;
      gainNodeRef.current = gainNode;

      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      source.start(0, offset);
      sourceRef.current = source;
      startTimeRef.current = audioContextRef.current.currentTime;
      pausedAtRef.current = offset;

      setIsPlaying(true);
      startTimer();

      source.onended = () => {
        setIsPlaying(false);
        stopTimer();
      };
    } catch (err) {
      console.error('Error playing audio:', err);
      setError('Failed to play audio: ' + (err as Error).message);
    }
  };

  const pauseAudio = () => {
    if (sourceRef.current && audioContextRef.current) {
      sourceRef.current.stop();
      pausedAtRef.current += audioContextRef.current.currentTime - startTimeRef.current;
    }
    setIsPlaying(false);
    stopTimer();
  };

  const stopAudio = () => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (e) {}
    }
    setIsPlaying(false);
    setCurrentTime(0);
    pausedAtRef.current = 0;
    stopTimer();
  };

  // Processed audio playback
  const startTimer2 = () => {
    if (timerRef2.current) clearInterval(timerRef2.current);
    timerRef2.current = window.setInterval(() => {
      if (audioContextRef2.current && processedSamples) {
        const elapsed = audioContextRef2.current.currentTime - startTimeRef2.current;
        const current = pausedAtRef2.current + elapsed;
        const duration = processedSamples.length / sampleRate;
        if (current >= duration) {
          stopAudio2();
          return;
        }
        setCurrentTime2(current);
      }
    }, 50);
  };

  const stopTimer2 = () => {
    if (timerRef2.current) {
      clearInterval(timerRef2.current);
      timerRef2.current = null;
    }
  };

  const playAudio2 = async (offset: number) => {
    if (!processedSamples || !audioContextRef2.current) return;

    if (audioContextRef2.current.state === 'suspended') {
      await audioContextRef2.current.resume();
    }

    if (audioContextRef2.current.state === 'closed') {
      audioContextRef2.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioContextRef2.current.resume();
    }

    try {
      if (sourceRef2.current) {
        try { sourceRef2.current.stop(); } catch (e) {}
      }

      const audioBuffer = audioContextRef2.current.createBuffer(1, processedSamples.length, sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < processedSamples.length; i++) {
        channelData[i] = processedSamples[i];
      }

      const source = audioContextRef2.current.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = 1.0;

      const gainNode = audioContextRef2.current.createGain();
      gainNode.gain.value = volume2;
      gainNodeRef2.current = gainNode;

      source.connect(gainNode);
      gainNode.connect(audioContextRef2.current.destination);

      source.start(0, offset);
      sourceRef2.current = source;
      startTimeRef2.current = audioContextRef2.current.currentTime;
      pausedAtRef2.current = offset;

      setIsPlaying2(true);
      startTimer2();

      source.onended = () => {
        setIsPlaying2(false);
        stopTimer2();
      };
    } catch (err) {
      console.error('Error playing audio:', err);
      setError('Failed to play audio: ' + (err as Error).message);
    }
  };

  const pauseAudio2 = () => {
    if (sourceRef2.current && audioContextRef2.current) {
      sourceRef2.current.stop();
      pausedAtRef2.current += audioContextRef2.current.currentTime - startTimeRef2.current;
    }
    setIsPlaying2(false);
    stopTimer2();
  };

  const stopAudio2 = () => {
    if (sourceRef2.current) {
      try { sourceRef2.current.stop(); } catch (e) {}
    }
    setIsPlaying2(false);
    setCurrentTime2(0);
    pausedAtRef2.current = 0;
    stopTimer2();
  };

  const handlePlayPause = async () => {
    if (isPlaying) {
      pauseAudio();
    } else {
      await playAudio(pausedAtRef.current);
    }
  };

  const handlePlayPause2 = async () => {
    if (isPlaying2) {
      pauseAudio2();
    } else {
      await playAudio2(pausedAtRef2.current);
    }
  };

  const handleSeek = async (time: number) => {
    const wasPlaying = isPlaying;
    if (wasPlaying) pauseAudio();
    pausedAtRef.current = time;
    setCurrentTime(time);
    if (wasPlaying) await playAudio(time);
  };

  const handleSeek2 = async (time: number) => {
    const wasPlaying = isPlaying2;
    if (wasPlaying) pauseAudio2();
    pausedAtRef2.current = time;
    setCurrentTime2(time);
    if (wasPlaying) await playAudio2(time);
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = vol;
    }
  };

  const handleVolumeChange2 = (vol: number) => {
    setVolume2(vol);
    if (gainNodeRef2.current) {
      gainNodeRef2.current.gain.value = vol;
    }
  };

  const handleProcess = async () => {
    if (!originalSamples || isProcessing) return;

    setError(null);
    setIsAnalyzing(true);

    try {
      const result = await processAudio(originalSamples, config.current);
      setProcessedSamples(result);
      setCurrentTime2(0);
      pausedAtRef2.current = 0;
    } catch (err) {
      setError('Failed to process audio. Please try again.');
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownload = () => {
    if (!processedSamples || !file) return;
    const wavBlob = samplesToWav(processedSamples, sampleRate);
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    downloadBlob(wavBlob, `${fileName}_clean.wav`);
  };

  const handlePreset = (preset: 'light' | 'medium' | 'heavy' | 'extreme') => {
    applyPreset(preset);
    setSelectedPreset(preset);
    const presets = {
      light: { noise_frames: 10, spectral_floor: 0.25, over_subtraction: 1.0, makeup_gain: 1.2 },
      medium: { noise_frames: 10, spectral_floor: 0.1, over_subtraction: 2.0, makeup_gain: 1.5 },
      heavy: { noise_frames: 10, spectral_floor: 0.05, over_subtraction: 3.0, makeup_gain: 1.8 },
      extreme: { noise_frames: 10, spectral_floor: 0.02, over_subtraction: 4.0, makeup_gain: 2.0 },
    };
    config.current = presets[preset];
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center py-12 px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#dbb807] mx-auto mb-4"></div>
          <p className="text-gray-400">Loading WebAssembly module...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-gray-800 py-6 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#dbb807] rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Audio Noise Reduction</h1>
              <p className="text-sm text-gray-400">Compare before & after side by side</p>
            </div>
          </div>
          {!processedSamples && (
            <div className="flex items-center gap-3">
              <label className="cursor-pointer bg-[#dbb807] hover:bg-[#c9a500] text-black font-semibold px-6 py-3 rounded-lg transition-colors flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload WAV
                <input
                  type="file"
                  className="hidden"
                  accept=".wav,audio/wav"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) handleFileChange(selectedFile);
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="bg-red-900/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        </div>
      )}

      {/* Main Content */}
      {file && (
        <div className="max-w-7xl mx-auto px-8 py-8">
          {/* Presets & Process */}
          {!processedSamples && (
            <div className="mb-8 p-6 bg-gray-900 rounded-2xl border border-gray-800">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">{metadata?.name}</h2>
                  <p className="text-sm text-gray-400">
                    {(metadata?.size || 0) / 1024 / 1024 > 1
                      ? `${((metadata?.size || 0) / 1024 / 1024).toFixed(2)} MB`
                      : `${((metadata?.size || 0) / 1024).toFixed(2)} KB`}
                  </p>
                </div>
                <button
                  onClick={handleProcess}
                  disabled={isAnalyzing || isLoading}
                  className={`bg-[#dbb807] hover:bg-[#c9a500] text-black font-semibold px-8 py-3 rounded-lg transition-colors flex items-center gap-2 ${
                    (isAnalyzing || isLoading) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isAnalyzing || isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      Remove Noise
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { key: 'light', label: 'Light', desc: 'Subtle' },
                  { key: 'medium', label: 'Medium', desc: 'Balanced' },
                  { key: 'heavy', label: 'Heavy', desc: 'Aggressive' },
                  { key: 'extreme', label: 'Extreme', desc: 'Maximum' },
                ].map(({ key, label, desc }) => (
                  <button
                    key={key}
                    onClick={() => handlePreset(key as any)}
                    className={`p-3 rounded-lg text-center transition-all ${
                      selectedPreset === key
                        ? 'bg-[#dbb807] text-black font-semibold'
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    }`}
                  >
                    <div className="text-sm">{label}</div>
                    <div className={`text-xs ${selectedPreset === key ? 'text-black/70' : 'text-gray-500'}`}>{desc}</div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-4 text-xs text-gray-400 bg-black/30 p-3 rounded-lg">
                <div>Noise Frames: {config.current.noise_frames}</div>
                <div>Spectral Floor: {config.current.spectral_floor}</div>
                <div>Over Sub: {config.current.over_subtraction}</div>
                <div>Gain: {config.current.makeup_gain}x</div>
              </div>
            </div>
          )}

          {/* Side by Side Comparison */}
          <div className="grid grid-cols-2 gap-8">
            {/* Original */}
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="w-3 h-3 bg-gray-500 rounded-full"></span>
                  Original
                </h3>
                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Before</span>
              </div>

              {originalSamples && !isLoading && (
                <>
                  <Waveform
                    samples={originalSamples}
                    sampleRate={sampleRate}
                    currentTime={currentTime}
                    onSeek={handleSeek}
                  />
                  <Controls
                    isPlaying={isPlaying}
                    onPlayPause={handlePlayPause}
                    currentTime={currentTime}
                    duration={getAudioDuration(originalSamples, sampleRate)}
                    volume={volume}
                    onVolumeChange={handleVolumeChange}
                  />
                </>
              )}

              {isLoading && (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <div className="flex items-center gap-3">
                    <svg className="animate-spin h-5 w-5 text-[#dbb807]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Decoding audio...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Processed */}
            <div className="bg-gray-900 rounded-2xl p-6 border border-[#dbb807]/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#dbb807] rounded-full"></span>
                  Cleaned
                </h3>
                <span className="text-xs text-[#dbb807] uppercase tracking-wider font-semibold">After</span>
              </div>

              {processedSamples && (
                <>
                  <Waveform
                    samples={processedSamples}
                    sampleRate={sampleRate}
                    currentTime={currentTime2}
                    onSeek={handleSeek2}
                  />
                  <Controls
                    isPlaying={isPlaying2}
                    onPlayPause={handlePlayPause2}
                    currentTime={currentTime2}
                    duration={getAudioDuration(processedSamples, sampleRate)}
                    volume={volume2}
                    onVolumeChange={handleVolumeChange2}
                  />
                </>
              )}

              {!processedSamples && !isLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <p className="text-sm">Processed audio will appear here</p>
                </div>
              )}
            </div>
          </div>

          {/* Download Button */}
          {processedSamples && (
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={handleDownload}
                className="bg-[#dbb807] hover:bg-[#c9a500] text-black font-semibold px-8 py-3 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Cleaned Audio
              </button>
              <button
                onClick={() => {
                  stopAudio();
                  stopAudio2();
                  setProcessedSamples(null);
                  setSelectedPreset(null);
                  setCurrentTime(0);
                  setCurrentTime2(0);
                  pausedAtRef.current = 0;
                  pausedAtRef2.current = 0;
                }}
                className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
              >
                Upload New File
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!file && (
        <div className="max-w-7xl mx-auto px-8 py-16">
          <div className="border-2 border-dashed border-gray-800 rounded-2xl p-16 text-center hover:border-[#dbb807]/50 transition-colors">
            <label className="cursor-pointer">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-semibold text-white mb-1">Upload a WAV file to get started</p>
                  <p className="text-sm text-gray-500">Drag and drop or click to browse</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".wav,audio/wav"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) handleFileChange(selectedFile);
                  }}
                />
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 px-8 mt-auto">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-500">
          Built with Rust + WebAssembly + React • Spectral Subtraction Algorithm
        </div>
      </footer>
    </div>
  );
}

export default App;
