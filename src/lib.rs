use hound::{WavReader, WavWriter, WavSpec};
use num_complex::Complex;
use rustfft::{Fft, FftPlanner};
use std::f32::consts::PI;
use std::path::Path;

pub const FRAME_SIZE: usize = 2048;
const HOP_SIZE: usize = 1024;
const NOISE_FRAMES: usize = 10;
const SPECTRAL_FLOOR: f32 = 0.1;
const OVER_SUBTRACTION: f32 = 2.0;

pub struct AudioProcessor {
    fft: std::sync::Arc<dyn Fft<f32>>,
    scratch: Vec<Complex<f32>>,
}

struct NoiseReductionParams {
    noise_spectrum: Vec<f32>,
    spectral_floor: f32,
    over_subtraction: f32,
}

impl AudioProcessor {
    pub fn new(frame_size: usize) -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(frame_size);
        let scratch = vec![Complex::new(0.0, 0.0); fft.get_inplace_scratch_len()];

        AudioProcessor { fft, scratch }
    }

    pub fn apply_hann_window(&self, frame: &mut [f32]) {
        let len = frame.len();
        for (i, sample) in frame.iter_mut().enumerate() {
            let window = 0.5 * (1.0 - (2.0 * PI * i as f32 / (len - 1) as f32).cos());
            *sample *= window;
        }
    }

    fn fft_forward(&mut self, input: &[f32]) -> Vec<Complex<f32>> {
        let mut buffer: Vec<Complex<f32>> = input.iter().map(|&x| Complex::new(x, 0.0)).collect();
        self.fft.process_with_scratch(&mut buffer, &mut self.scratch);
        buffer
    }

    fn fft_inverse(&mut self, spectrum: &mut [Complex<f32>]) -> Vec<f32> {
        self.fft.process_with_scratch(spectrum, &mut self.scratch);
        spectrum.iter().map(|c| c.re / spectrum.len() as f32).collect()
    }
}

fn estimate_noise_spectrum(processor: &mut AudioProcessor, samples: &[f32]) -> Vec<f32> {
    let mut accumulated_spectrum = vec![0.0f32; FRAME_SIZE];
    let mut frames_processed = 0usize;

    let mut pos = 0;
    while pos + FRAME_SIZE <= samples.len() && frames_processed < NOISE_FRAMES {
        let mut frame = Vec::from(&samples[pos..pos + FRAME_SIZE]);
        processor.apply_hann_window(&mut frame);

        let spectrum = processor.fft_forward(&frame);

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

fn spectral_subtraction(
    processor: &mut AudioProcessor,
    frame: &mut [f32],
    params: &NoiseReductionParams,
) -> Vec<f32> {
    processor.apply_hann_window(frame);

    let mut spectrum = processor.fft_forward(frame);

    for (i, bin) in spectrum.iter_mut().enumerate() {
        let magnitude = bin.norm();
        let noise_magnitude = params.noise_spectrum[i];

        let magnitude_subtracted =
            (magnitude - params.over_subtraction * noise_magnitude).max(magnitude * params.spectral_floor);

        let phase = bin.arg();
        *bin = Complex::from_polar(magnitude_subtracted, phase);
    }

    processor.fft_inverse(&mut spectrum)
}

pub fn process_audio(input_path: &Path, output_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let reader = WavReader::open(input_path)?;
    let spec = reader.spec();
    let channels = spec.channels;
    let sample_rate = spec.sample_rate;

    println!("Input: {} Hz, {} channels", sample_rate, channels);
    println!("Duration: {:.2} seconds", reader.duration() as f32 / sample_rate as f32);

    let samples: Vec<f32> = reader
        .into_samples::<i16>()
        .filter_map(|s| s.ok())
        .map(|s| s as f32 / i16::MAX as f32)
        .collect();

    println!("Total samples: {}", samples.len());

    let mut processor = AudioProcessor::new(FRAME_SIZE);

    let noise_spectrum = estimate_noise_spectrum(&mut processor, &samples);
    println!("Noise spectrum estimated from {} frames", NOISE_FRAMES);

    let params = NoiseReductionParams {
        noise_spectrum,
        spectral_floor: SPECTRAL_FLOOR,
        over_subtraction: OVER_SUBTRACTION,
    };

    let output_samples_len = samples.len() + FRAME_SIZE;
    let mut output_samples = vec![0.0f32; output_samples_len];

    let mut frame_count = 0;
    let mut pos = 0;

    while pos + FRAME_SIZE <= samples.len() {
        let mut frame: Vec<f32> = samples[pos..pos + FRAME_SIZE].to_vec();
        let processed = spectral_subtraction(&mut processor, &mut frame, &params);

        for (i, sample) in processed.iter().enumerate() {
            output_samples[pos + i] += sample;
        }

        frame_count += 1;
        pos += HOP_SIZE;
    }

    println!("Processed {} frames", frame_count);

    let output_spec = WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = WavWriter::create(output_path, output_spec)?;
    for sample in &output_samples[..samples.len()] {
        let sample_i16 = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        writer.write_sample(sample_i16)?;
    }
    writer.finalize()?;

    println!("Output written to: {}", output_path.display());
    Ok(())
}
