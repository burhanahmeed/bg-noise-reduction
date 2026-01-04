# Audio Noise Reduction Algorithms

Audio noise reduction algorithms work by separating unwanted noise from the desired signal. Here's how they typically operate:
Basic Process
1. Analysis Phase
The algorithm first analyzes the audio to understand what constitutes "noise" versus "signal." This often happens during silent passages or a dedicated noise profile section where only background noise is present. The algorithm builds a spectral fingerprint of the noise frequencies.
2. Frequency Domain Conversion
The audio is transformed from time domain (waveform) into frequency domain using techniques like Fast Fourier Transform (FFT). This breaks the sound into its component frequencies, making it easier to identify and isolate noise patterns.
3. Noise Identification
The algorithm compares the current audio spectrum against the noise profile. It identifies which frequencies match the noise characteristics and which contain the desired signal. Common noise patterns include hiss, hum, or environmental sounds with consistent spectral signatures.
4. Spectral Subtraction
The identified noise frequencies are subtracted or attenuated from the overall signal. The algorithm reduces the amplitude of frequencies matching the noise profile while preserving frequencies containing speech or music.
5. Smoothing and Refinement
To avoid artifacts like musical noise (random twinkling sounds), the algorithm applies smoothing across time and frequency. This might involve gain reduction that varies gradually rather than abruptly.
6. Reconstruction
The processed frequency data is converted back to time domain audio using inverse FFT, producing the cleaned output signal.

## Basic Implementation Outline

// Read audio file
// Apply windowing (Hann, Hamming)
// Perform FFT on overlapping frames
// Estimate noise spectrum from initial frames
// For each frame:
//   - Calculate magnitude spectrum
//   - Subtract noise estimate
//   - Apply spectral floor to avoid negative values
//   - Reconstruct signal with inverse FFT
// Overlap-add frames back together
// Write cleaned audio

# Input / Output

- Input: Audio file (Now focus on WAV format) containing background noise
- Output: Cleaned audio file (WAV format) with reduced background noise
