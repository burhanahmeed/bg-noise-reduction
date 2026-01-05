# bg-noise-reduction

Audio noise reduction library and CLI tool using spectral subtraction.

## Features

- 🎵 Remove background noise from WAV audio files
- ⚙️ Configurable parameters for different noise profiles
- 📚 Both library API and command-line tool
- 🚀 Fast FFT-based processing using `rustfft`

## Installation

### CLI Tool

```bash
cargo install bg-noise-reduction
```

### Library

Add to `Cargo.toml`:

```toml
[dependencies]
bg-noise-reduction = "0.1"
```

## CLI Usage

```bash
# Basic usage
bg-noise-reduction input.wav output.wav

# Heavy noise reduction with volume boost
bg-noise-reduction --over-subtraction 3.0 --spectral-floor 0.05 --makeup-gain 2.0 input.wav output.wav

# See all options
bg-noise-reduction --help
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--noise-frames <N>` | Frames for noise estimation | 10 |
| `--spectral-floor <F>` | Spectral floor (0.0-1.0) | 0.1 |
| `--over-subtraction <F>` | Noise reduction aggressiveness | 2.0 |
| `--makeup-gain <F>` | Output volume multiplier | 1.5 |

## Library Usage

```rust
use bg_noise_reduction::{process_audio, NoiseReductionConfig};
use std::path::Path;

let config = NoiseReductionConfig {
    noise_frames: 10,
    spectral_floor: 0.1,
    over_subtraction: 2.0,
    makeup_gain: 1.5,
};

process_audio(
    Path::new("noisy.wav"),
    Path::new("clean.wav"),
    config,
)?;
```

## How It Works

1. Analyzes first N frames to build a noise profile
2. Converts audio to frequency domain using FFT
3. Subtracts noise spectrum from each frame
4. Reconstructs audio with overlap-add synthesis

## Limitations

- Works best on **stationary noise** (hiss, hum, fans)
- Less effective on **non-stationary noise** (traffic, voices)
- Assumes noise present at start of audio

## License

MIT OR Apache-2.0
