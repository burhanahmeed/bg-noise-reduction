// Integration test - creates a synthetic noisy audio file and processes it
// Run with: cargo test --test integration_test

use std::io::Cursor;
use std::path::Path;
use std::f32::consts::PI;

// Helper to generate a simple test WAV file in memory
fn generate_test_wav() -> Vec<u8> {
    // Simple PRNG for generating noise
    let mut seed: u32 = 12345;
    let mut random = move || {
        seed = seed.wrapping_mul(1103515245).wrapping_add(12345);
        (seed >> 16) as f32 / 65536.0
    };

    // Parameters
    let sample_rate = 44100u32;
    let duration_secs = 1u32;
    let num_samples = sample_rate as usize * duration_secs as usize;
    let frequency = 440.0f32; // A4 note

    // Generate samples: sine wave + noise
    let samples: Vec<i16> = (0..num_samples)
        .map(|i| {
            let t = i as f32 / sample_rate as f32;
            let signal = 0.3 * (2.0 * PI * frequency * t).sin();
            let noise = 0.1 * (random() * 2.0 - 1.0);
            let sample = signal + noise;
            (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
        })
        .collect();

    // Write to WAV format in memory
    let mut cursor = Cursor::new(Vec::new());
    {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::new(&mut cursor, spec).unwrap();
        for sample in samples {
            writer.write_sample(sample).unwrap();
        }
        writer.finalize().unwrap();
    }

    cursor.into_inner()
}

#[test]
fn test_noise_reduction_runs() {
    let test_data = generate_test_wav();

    // Write test input file
    let input_path = Path::new("test_input.wav");
    let output_path = Path::new("test_output.wav");

    std::fs::write(input_path, test_data).unwrap();

    // Run the noise reduction (call process_audio directly)
    let result = bg_noise_reduction::process_audio(input_path, output_path);

    // Verify it completed without error
    assert!(result.is_ok());

    // Verify output file exists
    assert!(output_path.exists());

    // Cleanup
    let _ = std::fs::remove_file(input_path);
    let _ = std::fs::remove_file(output_path);
}

#[test]
fn test_hann_window() {
    let processor = bg_noise_reduction::AudioProcessor::new(2048);

    let mut frame = vec![1.0f32; 2048];
    processor.apply_hann_window(&mut frame);

    // Edges should be close to 0
    assert!(frame[0] < 0.01);
    assert!(frame[2047] < 0.01);

    // Center should be close to 1
    assert!(frame[1024] > 0.99);
}
