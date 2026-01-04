# Audio Noise Reduction

Spectral subtraction-based noise reduction tool for WAV audio files.

## How It Works

1. **Analysis Phase** - Analyzes the first N frames to build a noise profile (spectral fingerprint of background noise)
2. **FFT Processing** - Converts audio to frequency domain using Fast Fourier Transform
3. **Spectral Subtraction** - Subtracts noise profile from each frequency bin
4. **Reconstruction** - Converts back to time domain using inverse FFT with overlap-add

## Building

```bash
cargo build --release
```

The binary will be at `./target/release/bg-noise-reduction`

## Usage

```bash
bg-noise-reduction [OPTIONS] <input.wav> <output.wav>
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--noise-frames <N>` | Number of frames for noise estimation | 10 |
| `--spectral-floor <F>` | Spectral floor (0.0-1.0), higher = more signal preserved | 0.1 |
| `--over-subtraction <F>` | Over-subtraction factor, higher = more noise reduction | 2.0 |
| `--makeup-gain <F>` | Output gain to compensate for volume loss | 1.5 |

### Examples

```bash
# Default settings
bg-noise-reduction noisy.wav clean.wav

# Heavy noise reduction with volume boost
bg-noise-reduction --over-subtraction 3.0 --spectral-floor 0.05 --makeup-gain 2.0 noisy.wav clean.wav

# Light processing (less distortion)
bg-noise-reduction --over-subtraction 1.0 --spectral-floor 0.25 --makeup-gain 1.2 noisy.wav clean.wav

# Better noise profile (more frames for estimation)
bg-noise-reduction --noise-frames 20 noisy.wav clean.wav
```

### Presets

| Preset | Over-subtraction | Spectral Floor | Makeup Gain | Use Case |
|--------|-----------------|----------------|-------------|----------|
| Light | 1.0 | 0.25 | 1.2 | Minimal distortion, light noise |
| Medium | 2.0 | 0.1 | 1.5 | Balanced (default) |
| Heavy | 3.0 | 0.05 | 1.8 | Strong noise reduction |
| Extreme | 4.0 | 0.02 | 2.0 | Maximum noise removal |

## Parameter Tuning Guide

**Still hear background noise?**
- Increase `--over-subtraction` (try 2.5-3.0)
- Decrease `--spectral-floor` (try 0.05-0.08)
- Increase `--noise-frames` for better noise profile

**Volume too low?**
- Increase `--makeup-gain` (try 1.8-2.5)

**Sound is distorted or robotic?**
- Decrease `--over-subtraction` (try 1.0-1.5)
- Increase `--spectral-floor` (try 0.15-0.25)
- Decrease `--makeup-gain` (try 1.0-1.2)

**Hear echo/reverb?**
- Decrease `--makeup-gain` (too much can exaggerate artifacts)
- Increase `--spectral-floor` to preserve more original signal

## Limitations

- Works best on **stationary noise** (constant hiss, hum, fan noise)
- Less effective on **non-stationary noise** (traffic, voices, music)
- Assumes noise is present in the first few frames of audio
- For best results, audio should have 0.5-1 seconds of noise-only at the start

## Input / Output

- **Input**: WAV file (16-bit PCM, mono or stereo)
- **Output**: Cleaned WAV file with reduced background noise

