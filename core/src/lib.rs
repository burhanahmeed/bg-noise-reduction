//! # Audio Noise Reduction Core Library
//!
//! Pure signal processing library for audio noise reduction using spectral subtraction.
//!
//! This library contains only the core DSP algorithms without any file I/O dependencies,
//! making it suitable for WebAssembly compilation and embedded use.
//!
//! ## Example
//!
//! ```rust
//! use bg_noise_reduction_core::{AudioProcessor, NoiseReductionConfig};
//!
//! let config = NoiseReductionConfig::default();
//! let mut processor = AudioProcessor::new(2048);
//!
//! // Process audio samples (mono, f32, -1.0 to 1.0)
//! let output = processor.process(&input_samples, &config);
//! ```

use num_complex::Complex;
use rustfft::{Fft, FftPlanner};
use std::f32::consts::PI;

pub const FRAME_SIZE: usize = 2048;
const HOP_SIZE: usize = 1024;

/// Configuration for noise reduction processing
#[derive(Debug, Clone, Copy)]
pub struct NoiseReductionConfig {
    /// Number of frames to use for noise profile estimation (default: 10)
    pub noise_frames: usize,
    /// Spectral floor value 0.0-1.0, higher preserves more signal (default: 0.1)
    pub spectral_floor: f32,
    /// Over-subtraction factor, higher = more aggressive (default: 2.0)
    pub over_subtraction: f32,
    /// Output gain multiplier to compensate for volume loss (default: 1.5)
    pub makeup_gain: f32,
}

impl Default for NoiseReductionConfig {
    fn default() -> Self {
        Self {
            noise_frames: 10,
            spectral_floor: 0.1,
            over_subtraction: 2.0,
            makeup_gain: 1.5,
        }
    }
}

/// Audio processor for FFT-based noise reduction
pub struct AudioProcessor {
    fft: std::sync::Arc<dyn Fft<f32>>,
    ifft: std::sync::Arc<dyn Fft<f32>>,
    fft_scratch: Vec<Complex<f32>>,
    ifft_scratch: Vec<Complex<f32>>,
}

struct NoiseReductionParams {
    noise_spectrum: Vec<f32>,
    config: NoiseReductionConfig,
}

impl AudioProcessor {
    /// Create a new audio processor with specified FFT size
    pub fn new(frame_size: usize) -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(frame_size);
        let ifft = planner.plan_fft_inverse(frame_size);
        let fft_scratch = vec![Complex::new(0.0, 0.0); fft.get_inplace_scratch_len()];
        let ifft_scratch = vec![Complex::new(0.0, 0.0); ifft.get_inplace_scratch_len()];

        AudioProcessor { fft, ifft, fft_scratch, ifft_scratch }
    }

    fn apply_hann_window(&self, frame: &mut [f32]) {
        let len = frame.len();
        for (i, sample) in frame.iter_mut().enumerate() {
            let window = 0.5 * (1.0 - (2.0 * PI * i as f32 / (len - 1) as f32).cos());
            *sample *= window;
        }
    }

    fn fft_forward(&mut self, input: &[f32]) -> Vec<Complex<f32>> {
        let mut buffer: Vec<Complex<f32>> = input.iter().map(|&x| Complex::new(x, 0.0)).collect();
        self.fft.process_with_scratch(&mut buffer, &mut self.fft_scratch);
        buffer
    }

    fn fft_inverse(&mut self, spectrum: &mut [Complex<f32>]) -> Vec<f32> {
        self.ifft.process_with_scratch(spectrum, &mut self.ifft_scratch);
        spectrum.iter().map(|c| c.re / spectrum.len() as f32).collect()
    }

    /// Process audio samples with noise reduction
    ///
    /// # Arguments
    ///
    /// * `samples` - Input audio samples (mono, f32, -1.0 to 1.0)
    /// * `config` - Processing configuration
    ///
    /// # Returns
    ///
    /// Processed audio samples
    pub fn process(&mut self, samples: &[f32], config: &NoiseReductionConfig) -> Vec<f32> {
        if samples.len() < FRAME_SIZE {
            return samples.to_vec();
        }

        let noise_spectrum = self.estimate_noise_spectrum(samples, config.noise_frames);
        let params = NoiseReductionParams {
            noise_spectrum,
            config: *config,
        };

        let output_samples_len = samples.len() + FRAME_SIZE;
        let mut output_samples = vec![0.0f32; output_samples_len];
        let mut window_sum = vec![0.0f32; output_samples_len];

        let hann_window: Vec<f32> = (0..FRAME_SIZE)
            .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f32 / (FRAME_SIZE - 1) as f32).cos()))
            .collect();

        let mut pos = 0;
        while pos + FRAME_SIZE <= samples.len() {
            let mut frame: Vec<f32> = samples[pos..pos + FRAME_SIZE].to_vec();
            let processed = self.spectral_subtraction(&mut frame, &params);

            for (i, sample) in processed.iter().enumerate() {
                output_samples[pos + i] += sample;
                window_sum[pos + i] += hann_window[i];
            }

            pos += HOP_SIZE;
        }

        // Normalize by window sum and apply makeup gain
        for (output, ws) in output_samples.iter_mut().zip(window_sum.iter()).take(samples.len()) {
            if *ws > 0.0 {
                *output = *output / *ws * config.makeup_gain;
            }
        }

        output_samples[..samples.len()].to_vec()
    }

    fn estimate_noise_spectrum(&mut self, samples: &[f32], noise_frames: usize) -> Vec<f32> {
        let mut accumulated_spectrum = vec![0.0f32; FRAME_SIZE];
        let mut frames_processed = 0usize;

        let mut pos = 0;
        while pos + FRAME_SIZE <= samples.len() && frames_processed < noise_frames {
            let mut frame = Vec::from(&samples[pos..pos + FRAME_SIZE]);
            self.apply_hann_window(&mut frame);

            let spectrum = self.fft_forward(&frame);

            for (i, bin) in spectrum.iter().enumerate() {
                accumulated_spectrum[i] += bin.norm();
            }

            frames_processed += 1;
            pos += HOP_SIZE;
        }

        for magnitude in &mut accumulated_spectrum {
            *magnitude /= frames_processed as f32;
        }

        accumulated_spectrum
    }

    fn spectral_subtraction(&mut self, frame: &mut [f32], params: &NoiseReductionParams) -> Vec<f32> {
        self.apply_hann_window(frame);

        let mut spectrum = self.fft_forward(frame);

        for (i, bin) in spectrum.iter_mut().enumerate() {
            let magnitude = bin.norm();
            let noise_magnitude = params.noise_spectrum[i];

            let gain = if magnitude > 0.0 {
                let raw_gain = (magnitude - params.config.over_subtraction * noise_magnitude) / magnitude;
                raw_gain.max(params.config.spectral_floor).min(1.0)
            } else {
                params.config.spectral_floor
            };

            let phase = bin.arg();
            *bin = Complex::from_polar(magnitude * gain, phase);
        }

        self.fft_inverse(&mut spectrum)
    }
}
