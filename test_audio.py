#!/usr/bin/env python3
"""
Generate a test WAV file with a sine wave plus white noise.
Run with: python test_audio.py
"""

import numpy as np
import wave

def generate_test_audio(filename="test_noisy.wav", duration=5.0, sample_rate=44100):
    # Generate time axis
    t = np.linspace(0, duration, int(sample_rate * duration))

    # Generate a clean sine wave tone (440 Hz = A4 note)
    clean_signal = 0.3 * np.sin(2 * np.pi * 440 * t)

    # Generate white noise
    noise = 0.15 * np.random.randn(len(t))

    # Combine signal + noise
    noisy_signal = clean_signal + noise

    # Normalize to prevent clipping
    noisy_signal = np.clip(noisy_signal, -1.0, 1.0)

    # Convert to 16-bit PCM
    audio_data = (noisy_signal * 32767).astype(np.int16)

    # Write WAV file (mono, 16-bit)
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data.tobytes())

    print(f"Generated: {filename}")
    print(f"  Duration: {duration}s")
    print(f"  Sample rate: {sample_rate} Hz")
    print(f"  Signal: 440 Hz sine wave")
    print(f"  Noise: White noise added")

if __name__ == "__main__":
    generate_test_audio()
