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
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [originalSamples, setOriginalSamples] = useState<Float32Array | null>(null);
  const [processedSamples, setProcessedSamples] = useState<Float32Array | null>(null);
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [metadata, setMetadata] = useState<AudioMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const config = useRef({
    noise_frames: 10,
    spectral_floor: 0.1,
    over_subtraction: 2.0,
    makeup_gain: 1.5,
  });

  // Web Audio API refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    initModule();
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [initModule]);

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile) return;

    setError(null);
    setFile(selectedFile);
    setProcessedSamples(null);
    setOriginalSamples(null);
    stopAudio();

    try {
      // Instant upload - just read ArrayBuffer, don't decode yet
      const buffer = await selectedFile.arrayBuffer();

      setArrayBuffer(buffer);
      setMetadata({
        name: selectedFile.name,
        size: selectedFile.size,
        duration: 0, // Will be calculated after decode
        type: selectedFile.type || 'audio/wav'
      });
      setCurrentTime(0);
      pausedAtRef.current = 0;

      // Decode in background for playback
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

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      if (audioContextRef.current) {
        const samples = currentSamples();
        if (!samples) return;
        const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
        const current = pausedAtRef.current + elapsed;
        const duration = getAudioDuration(samples, sampleRate);
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

  const currentSamples = () => {
    return processedSamples || originalSamples;
  };

  const playAudio = async (offset: number) => {
    const samples = currentSamples();
    if (!samples) {
      console.log('No samples to play');
      return;
    }
    if (!audioContextRef.current) {
      console.log('No AudioContext');
      return;
    }

    console.log('playAudio called, samples:', samples.length, 'sampleRate:', sampleRate, 'offset:', offset);
    console.log('AudioContext state:', audioContextRef.current.state);

    // Resume AudioContext (required by browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      console.log('Resuming AudioContext...');
      await audioContextRef.current.resume();
      console.log('AudioContext resumed, state:', audioContextRef.current.state);
    }

    // Check if context is closed and create new one if needed
    if (audioContextRef.current.state === 'closed') {
      console.log('AudioContext closed, creating new one...');
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioContextRef.current.resume();
    }

    try {
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch (e) {
          // Source already stopped, ignore
        }
      }

      console.log('Creating audio buffer...');
      const audioBuffer = audioContextRef.current.createBuffer(1, samples.length, sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        channelData[i] = samples[i];
      }

      console.log('Creating source node...');
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = 1.0;

      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = volume;
      gainNodeRef.current = gainNode;

      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      console.log('Starting playback at offset:', offset);
      source.start(0, offset);
      sourceRef.current = source;
      startTimeRef.current = audioContextRef.current.currentTime;
      pausedAtRef.current = offset;

      setIsPlaying(true);
      startTimer();

      // Handle playback end
      source.onended = () => {
        console.log('Playback ended');
        setIsPlaying(false);
        stopTimer();
      };
    } catch (err) {
      console.error('Error playing audio:', err);
      setError('Failed to play audio: ' + (err as Error).message);
    }
  };

  const pauseAudio = () => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      pausedAtRef.current += audioContextRef.current!.currentTime - startTimeRef.current;
    }
    setIsPlaying(false);
    stopTimer();
  };

  const stopAudio = () => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch (e) {}
    }
    setIsPlaying(false);
    setCurrentTime(0);
    pausedAtRef.current = 0;
    stopTimer();
  };

  const handlePlayPause = async () => {
    if (isPlaying) {
      pauseAudio();
    } else {
      await playAudio(pausedAtRef.current);
    }
  };

  const handleSeek = async (time: number) => {
    const wasPlaying = isPlaying;
    if (wasPlaying) pauseAudio();
    pausedAtRef.current = time;
    setCurrentTime(time);
    if (wasPlaying) await playAudio(time);
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = vol;
    }
  };

  const handleProcess = async () => {
    if (!originalSamples || isProcessing) return;

    setError(null);
    setIsAnalyzing(true);

    try {
      const result = await processAudio(originalSamples, config.current);
      setProcessedSamples(result);
      setCurrentTime(0);
      pausedAtRef.current = 0;
    } catch (err) {
      setError('Failed to process audio. Please try again.');
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownload = () => {
    const samples = currentSamples();
    if (!samples || !file) return;
    const wavBlob = samplesToWav(samples, sampleRate);
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    downloadBlob(wavBlob, `${fileName}_clean.wav`);
  };

  const handlePreset = (preset: 'light' | 'medium' | 'heavy' | 'extreme') => {
    applyPreset(preset);
    // Update local config ref for display purposes
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
      <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col items-center justify-center py-12 px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading WebAssembly module...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col items-center py-12 px-4">
      <div className="max-w-4xl w-full flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-indigo-600/20 rounded-2xl border border-indigo-500/30">
            <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Audio Noise Reduction
          </h1>
          <p className="text-slate-400 max-w-lg">
            Remove background noise from your audio files using spectral subtraction powered by WebAssembly.
          </p>
        </div>

        {/* Upload Area */}
        <div className="relative group">
          <label className="flex flex-col items-center justify-center w-full h-48 glass rounded-2xl border-2 border-dashed border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/40 transition-all cursor-pointer">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg className="w-12 h-12 text-slate-500 group-hover:text-indigo-400 mb-4 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mb-2 text-sm text-slate-300">
                <span className="font-semibold">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-slate-500">WAV files only</p>
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
          </label>
        </div>

        {error && (
          <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-300 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Player UI */}
        {file && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="p-6 glass rounded-2xl flex flex-col gap-6 shadow-2xl shadow-indigo-500/10">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold text-slate-100 mb-1">
                    {processedSamples ? 'Cleaned Audio' : 'Original Audio'}
                  </h2>
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">
                    {(metadata?.size || 0) / 1024 / 1024 > 1
                      ? `${((metadata?.size || 0) / 1024 / 1024).toFixed(2)} MB`
                      : `${((metadata?.size || 0) / 1024).toFixed(2)} KB`}
                    {' • '}
                    {metadata?.name}
                  </p>
                </div>
                {!processedSamples && (
                  <button
                    onClick={handleProcess}
                    disabled={isAnalyzing}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isAnalyzing
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30'
                    }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        Remove Noise
                      </>
                    )}
                  </button>
                )}
              </div>

              {isLoading && (
                <div className="flex items-center justify-center gap-3 py-8 text-slate-400">
                  <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Decoding audio...</span>
                </div>
              )}

              {currentSamples() && (
                <>
                  <Waveform
                    samples={currentSamples()!}
                    sampleRate={sampleRate}
                    currentTime={currentTime}
                    onSeek={handleSeek}
                  />

                  <Controls
                    isPlaying={isPlaying}
                    onPlayPause={handlePlayPause}
                    currentTime={currentTime}
                    duration={getAudioDuration(currentSamples()!, sampleRate)}
                    volume={volume}
                    onVolumeChange={handleVolumeChange}
                  />
                </>
              )}
            </div>

            {/* Presets Panel */}
            {!processedSamples && (
              <div className="p-6 glass border-slate-700/50 rounded-2xl flex flex-col gap-6">
                <div className="flex items-center gap-3 border-b border-slate-700 pb-4">
                  <div className="w-8 h-8 flex items-center justify-center bg-indigo-600 rounded-lg">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-indigo-300">Processing Presets</h3>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: 'light', label: 'Light', desc: 'Subtle noise reduction' },
                    { key: 'medium', label: 'Medium', desc: 'Balanced cleaning' },
                    { key: 'heavy', label: 'Heavy', desc: 'Aggressive removal' },
                    { key: 'extreme', label: 'Extreme', desc: 'Maximum cleanup' },
                  ].map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => handlePreset(key as any)}
                      className="p-4 bg-slate-800/50 hover:bg-indigo-600/20 border border-slate-700 hover:border-indigo-500/50 rounded-xl transition-all text-left group"
                    >
                      <div className="text-sm font-semibold text-slate-300 group-hover:text-indigo-300 mb-1">{label}</div>
                      <div className="text-xs text-slate-500">{desc}</div>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-500 bg-slate-900/50 p-4 rounded-xl">
                  <div>
                    <span className="block text-slate-400 font-medium">Noise Frames</span>
                    {config.current.noise_frames}
                  </div>
                  <div>
                    <span className="block text-slate-400 font-medium">Spectral Floor</span>
                    {config.current.spectral_floor}
                  </div>
                  <div>
                    <span className="block text-slate-400 font-medium">Over Subtraction</span>
                    {config.current.over_subtraction}
                  </div>
                  <div>
                    <span className="block text-slate-400 font-medium">Makeup Gain</span>
                    {config.current.makeup_gain}x
                  </div>
                </div>
              </div>
            )}

            {/* Download Button */}
            {processedSamples && (
              <div className="flex gap-4">
                <button
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/20"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Cleaned Audio
                </button>
                <button
                  onClick={() => {
                    stopAudio();
                    setProcessedSamples(null);
                    setCurrentTime(0);
                    pausedAtRef.current = 0;
                  }}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-all border border-slate-700"
                >
                  Upload New File
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!file && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-600 gap-4 opacity-50">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <p className="text-sm">No audio loaded yet. Upload a file to get started.</p>
          </div>
        )}
      </div>

      <footer className="mt-auto py-8 text-slate-600 text-xs text-center border-t border-slate-800/50 w-full max-w-4xl">
        <p>Built with Rust + WebAssembly + React • Spectral Subtraction Algorithm</p>
      </footer>
    </div>
  );
}

export default App;
