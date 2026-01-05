# Plan: WebAssembly Demo Website with React

## Overview
Create a browser-based demo website that runs the noise reduction library via WebAssembly, allowing users to upload audio files and hear the results in real-time.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React UI)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Audio Upload │  │  Controls    │  │  Player      │     │
│  │   Component  │  │  Component   │  │  Component   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   wasm-bindgen Layer                        │
│              (JavaScript ↔ Rust Bridge)                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    WebAssembly Module                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Core Noise Reduction Logic                │   │
│  │  (AudioProcessor, spectral subtraction, etc.)       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Restructure for WASM Compatibility

**Goal**: Separate core logic from I/O so it can work in browser

1. **Create new workspace structure:**
   ```
   bg-noise-reduction/
   ├── Cargo.toml (workspace)
   ├── core/           # Core library (no hound dependency)
   ├── cli/            # Command-line tool (uses hound)
   ├── wasm/           # WebAssembly bindings
   └── web/            # React demo app
   ```

2. **Refactor `core/` library:**
   - Extract pure signal processing logic
   - Accept `&[f32]` samples as input
   - Return `Vec<f32>` samples as output
   - Remove `hound` and `Path` dependencies
   - Keep: `rustfft`, `num-complex`

3. **Update `cli/` binary:**
   - Depend on `core` library
   - Handle WAV I/O with `hound`
   - Wire up file reading → core processing → file writing

### Phase 2: WebAssembly Bindings

**Goal**: Create JavaScript interface to core library

1. **Create `wasm/` package:**
   ```toml
   [package]
   name = "bg-noise-reduction-wasm"

   [lib]
   crate-type = ["cdylib", "rlib"]

   [dependencies]
   bg-noise-reduction-core = { path = "../core" }
   wasm-bindgen = "0.2"
   wasm-bindgen-futures = "0.4"
   web-sys = { version = "0.3", features = ["AudioContext", ...] }
   js-sys = "0.3"
   ```

2. **Create WASM wrapper (`wasm/src/lib.rs`):**
   ```rust
   use wasm_bindgen::prelude::*;

   #[wasm_bindgen]
   pub struct NoiseReduction {
       processor: AudioProcessor,
       config: NoiseReductionConfig,
   }

   #[wasm_bindgen]
   impl NoiseReduction {
       #[wasm_bindgen(constructor)]
       pub fn new() -> Self { ... }

       #[wasm_bindgen]
       pub fn process(&mut self, samples: &[f32]) -> Vec<f32> {
           // Process audio and return cleaned samples
       }

       #[wasm_bindgen]
       pub fn set_config(&mut self,
           noise_frames: usize,
           spectral_floor: f32,
           over_subtraction: f32,
           makeup_gain: f32) { ... }
   }
   ```

3. **Build configuration:**
   - Create `wasm/.cargo/config.toml` for WASM-specific settings

### Phase 3: React Demo Application

**Goal**: Build user-friendly web interface

1. **Initialize React app:**
   ```bash
   cd web
   npm create vite@latest . -- --template react-ts
   npm install
   ```

2. **Install dependencies:**
   ```bash
   npm install @reduxjs/toolkit react-redux
   npm install lucide-react  # Icons
   npm install tailwindcss postcss autoprefixer  # Styling
   ```

3. **Project structure:**
   ```
   web/
   ├── src/
   │   ├── components/
   │   │   ├── AudioUploader.tsx     # File drop zone
   │   │   ├── AudioPlayer.tsx       # Before/After player
   │   │   ├── ControlPanel.tsx      # Parameter sliders
   │   │   ├── Waveform.tsx          # Visualize audio
   │   │   └── ProcessingStatus.tsx  # Progress indicator
   │   ├── hooks/
   │   │   ├── useAudioProcessor.ts  # WASM interface
   │   │   └── useWaveform.ts        # Audio visualization
   │   ├── store/
   │   │   └── audioSlice.ts         # Redux state
   │   ├── utils/
   │   │   ├── audioDecoder.ts       # Web Audio API helpers
   │   │   └── wavEncoder.ts         # Encode processed audio
   │   ├── App.tsx
   │   └── main.tsx
   ```

4. **Key components:**

   **AudioUploader.tsx:**
   - Drag & drop zone for audio files
   - File format validation
   - Decode uploaded audio using Web Audio API

   **AudioPlayer.tsx:**
   - Dual audio players (Before / After)
   - Waveform visualization
   - Play/pause synchronization

   **ControlPanel.tsx:**
   - Sliders for: noise_frames, spectral_floor, over_subtraction, makeup_gain
   - Preset buttons (Light, Medium, Heavy, Extreme)
   - Real-time value display

   **ProcessingStatus.tsx:**
   - Progress bar during processing
   - Time estimate
   - Cancellation support

5. **WASM Integration Hook:**

   ```typescript
   // hooks/useAudioProcessor.ts
   import wasmUrl from '../../wasm/pkg/bg_noise_reduction_wasm_bg.wasm';

   export function useAudioProcessor() {
     const [processor, setProcessor] = useState(null);
     const [isProcessing, setIsProcessing] = useState(false);

     const initProcessor = useCallback(async () => {
       const module = await import('../../wasm/pkg');
       await module.default(wasmUrl);
       setProcessor(new module.NoiseReduction());
     }, []);

     const processAudio = useCallback((samples: Float32Array, config) => {
       return processor.process(samples, config);
     }, [processor]);

     return { processor, initProcessor, processAudio, isProcessing };
   }
   ```

### Phase 4: Audio Handling in Browser

**Challenge**: Browser doesn't have native WAV support

**Solution**:

1. **Decoding (Upload → WASM):**
   ```typescript
   async function decodeAudio(file: File): Promise<Float32Array> {
     const arrayBuffer = await file.arrayBuffer();
     const audioContext = new AudioContext();
     const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
     return audioBuffer.getChannelData(0); // Mono
   }
   ```

2. **Encoding (WASM → Download):**
   ```typescript
   function encodeToWav(samples: Float32Array): Blob {
     // Simple WAV encoder
     const buffer = new ArrayBuffer(44 + samples.length * 2);
     const view = new DataView(buffer);

     // WAV header
     writeString(view, 0, 'RIFF');
     view.setUint32(4, 36 + samples.length * 2, true);
     writeString(view, 8, 'WAVE');
     writeString(view, 12, 'fmt ');
     view.setUint32(16, 16, true);
     view.setUint16(20, 1, true);  // PCM
     view.setUint16(22, 1, true);  // Mono
     view.setUint32(24, 44100, true);  // Sample rate
     view.setUint32(28, 44100 * 2, true);  // Byte rate
     view.setUint16(32, 2, true);  // Block align
     view.setUint16(34, 16, true); // Bits per sample
     writeString(view, 36, 'data');
     view.setUint32(40, samples.length * 2, true);

     // Write samples
     for (let i = 0; i < samples.length; i++) {
       const sample = Math.max(-1, Math.min(1, samples[i]));
       view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
     }

     return new Blob([buffer], { type: 'audio/wav' });
   }
   ```

### Phase 5: Build & Deployment

1. **Build scripts:**
   ```bash
   # Build WASM
   cd wasm
   wasm-pack build --target web --out-dir ../web/src/wasm

   # Build React app
   cd ../web
   npm run build
   ```

2. **Deployment options:**
   - GitHub Pages (free, static hosting)
   - Netlify (free tier, CI/CD)
   - Vercel (optimized for React)

## Critical Files to Create

```
bg-noise-reduction/
├── Cargo.toml                    # Workspace config
├── core/
│   ├── Cargo.toml                # Core library (no I/O)
│   └── src/lib.rs                # Signal processing only
├── cli/
│   ├── Cargo.toml                # CLI tool
│   └── src/main.rs               # Uses core + hound
├── wasm/
│   ├── Cargo.toml                # WASM bindings
│   └── src/lib.rs                # wasm-bindgen wrappers
└── web/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── components/
        └── hooks/
```

## Key Considerations

1. **Performance**: Large audio files may block main thread
   - Consider Web Workers for processing
   - Stream processing for very large files

2. **Memory**: WASM has limited memory
   - Configure proper memory limits in LDFLAGS
   - Process in chunks if needed

3. **Browser Compatibility**:
   - Web Audio API support
   - WASM support (all modern browsers)
   - Safari considerations

4. **File Size**: WASM bundle might be large
   - Enable optimization flags
   - Consider wasm-opt for size reduction

## Optional Enhancements

- [ ] Real-time preview (process first N seconds)
- [ ] Multiple format support (MP3, FLAC)
- [ ] Visual spectrogram before/after
- [ ] Preset sharing via URL params
- [ ] Dark mode support
- [ ] Download processed audio
- [ ] Processing history/undo

## Next Steps

1. ✅ Review and approve this plan
2. Create workspace structure
3. Refactor core library
4. Implement WASM bindings
5. Build React UI
6. Test and deploy
