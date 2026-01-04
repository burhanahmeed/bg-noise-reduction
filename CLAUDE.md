# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Audio noise reduction tool that removes background noise from audio files using spectral subtraction techniques.

# Goals

- A background removal library in Rust that can be used to remove background noise from audio files.
- Published to crates.io

## Input/Output

- **Input**: WAV format audio files containing background noise
- **Output**: Cleaned WAV format audio files with reduced background noise

## Algorithm Architecture

The noise reduction pipeline follows this sequence:

1. **Analysis Phase**: Build a spectral fingerprint of noise during silent passages or dedicated noise profile sections
2. **Frequency Domain Conversion**: Transform time-domain audio to frequency domain using FFT
3. **Noise Identification**: Compare current spectrum against noise profile to identify noise frequencies (hiss, hum, environmental sounds)
4. **Spectral Subtraction**: Attenuate frequencies matching noise profile while preserving speech/music
5. **Smoothing**: Apply temporal and spectral smoothing to avoid "musical noise" artifacts
6. **Reconstruction**: Convert back to time domain using inverse FFT

## Implementation Outline

```
Read audio file
Apply windowing (Hann, Hamming)
Perform FFT on overlapping frames
Estimate noise spectrum from initial frames
For each frame:
  - Calculate magnitude spectrum
  - Subtract noise estimate
  - Apply spectral floor to avoid negative values
  - Reconstruct signal with inverse FFT
Overlap-add frames back together
Write cleaned audio
```

## Key Considerations

- Use overlapping frames with appropriate window functions to minimize artifacts
- Apply spectral floor to prevent negative values after subtraction
- Implement smoothing across time and frequency to avoid musical noise artifacts
- Noise profile should be estimated from initial frames or dedicated silent passages

## Libraries

For FFT operations:

rustfft - Fast Fourier Transform implementation
realfft - Optimized for real-valued signals (typical for audio)

For audio I/O:

hound - Reading/writing WAV files
cpal - Real-time audio input/output

For math/signal processing:

ndarray - Multi-dimensional arrays
num-complex - Complex number operations