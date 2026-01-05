use bg_noise_reduction_core::{NoiseReductionConfig, FRAME_SIZE};
use hound::{WavReader, WavWriter, WavSpec};
use std::env;
use std::path::Path;

fn print_usage(program_name: &str) {
    eprintln!("Audio Noise Reduction - Spectral Subtraction");
    eprintln!();
    eprintln!("Usage: {} [OPTIONS] <input.wav> <output.wav>", program_name);
    eprintln!();
    eprintln!("Options:");
    eprintln!("  --noise-frames <N>        Number of frames for noise estimation (default: 10)");
    eprintln!("  --spectral-floor <F>      Spectral floor, 0.0-1.0 (default: 0.1)");
    eprintln!("                             Higher = more signal preserved, less noise reduction");
    eprintln!("  --over-subtraction <F>    Over-subtraction factor (default: 2.0)");
    eprintln!("                             Higher = more noise reduction, more distortion");
    eprintln!("  --makeup-gain <F>         Output gain multiplier (default: 1.5)");
    eprintln!("                             Compensates for volume loss from noise reduction");
    eprintln!();
    eprintln!("Examples:");
    eprintln!("  {} input.wav output.wav", program_name);
    eprintln!("  {} --over-subtraction 3.0 --spectral-floor 0.05 --makeup-gain 2.0 input.wav output.wav", program_name);
    eprintln!();
    eprintln!("Presets:");
    eprintln!("  Light:     --over-subtraction 1.0 --spectral-floor 0.25 --makeup-gain 1.2");
    eprintln!("  Medium:    --over-subtraction 2.0 --spectral-floor 0.1 --makeup-gain 1.5 (default)");
    eprintln!("  Heavy:     --over-subtraction 3.0 --spectral-floor 0.05 --makeup-gain 1.8");
    eprintln!("  Extreme:   --over-subtraction 4.0 --spectral-floor 0.02 --makeup-gain 2.0");
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 3 || args.contains(&"--help".to_string()) || args.contains(&"-h".to_string()) {
        print_usage(&args[0]);
        if args.len() < 3 {
            std::process::exit(1);
        }
        return;
    }

    let mut config = NoiseReductionConfig::default();
    let mut input_idx = 1;
    let mut output_idx = 2;

    // Parse options
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--noise-frames" => {
                if i + 1 < args.len() {
                    config.noise_frames = args[i + 1].parse().unwrap_or_else(|_| {
                        eprintln!("Error: Invalid value for --noise-frames");
                        std::process::exit(1);
                    });
                    i += 2;
                    input_idx = i;
                    output_idx = i + 1;
                } else {
                    eprintln!("Error: --noise-frames requires a value");
                    std::process::exit(1);
                }
            }
            "--spectral-floor" => {
                if i + 1 < args.len() {
                    config.spectral_floor = args[i + 1].parse().unwrap_or_else(|_| {
                        eprintln!("Error: Invalid value for --spectral-floor");
                        std::process::exit(1);
                    });
                    i += 2;
                    input_idx = i;
                    output_idx = i + 1;
                } else {
                    eprintln!("Error: --spectral-floor requires a value");
                    std::process::exit(1);
                }
            }
            "--over-subtraction" => {
                if i + 1 < args.len() {
                    config.over_subtraction = args[i + 1].parse().unwrap_or_else(|_| {
                        eprintln!("Error: Invalid value for --over-subtraction");
                        std::process::exit(1);
                    });
                    i += 2;
                    input_idx = i;
                    output_idx = i + 1;
                } else {
                    eprintln!("Error: --over-subtraction requires a value");
                    std::process::exit(1);
                }
            }
            "--makeup-gain" => {
                if i + 1 < args.len() {
                    config.makeup_gain = args[i + 1].parse().unwrap_or_else(|_| {
                        eprintln!("Error: Invalid value for --makeup-gain");
                        std::process::exit(1);
                    });
                    i += 2;
                    input_idx = i;
                    output_idx = i + 1;
                } else {
                    eprintln!("Error: --makeup-gain requires a value");
                    std::process::exit(1);
                }
            }
            _ => {
                // Not an option, must be input/output
                if args[i].starts_with("--") {
                    eprintln!("Error: Unknown option '{}'", args[i]);
                    std::process::exit(1);
                }
                break;
            }
        }
    }

    if args.len() < output_idx + 1 {
        eprintln!("Error: Missing input or output file");
        eprintln!();
        print_usage(&args[0]);
        std::process::exit(1);
    }

    let input_path = Path::new(&args[input_idx]);
    let output_path = Path::new(&args[output_idx]);

    if !input_path.exists() {
        eprintln!("Error: Input file '{}' does not exist", input_path.display());
        std::process::exit(1);
    }

    if let Err(e) = process_audio(input_path, output_path, config) {
        eprintln!("Error processing audio: {}", e);
        std::process::exit(1);
    }
}

fn process_audio(
    input_path: &Path,
    output_path: &Path,
    config: NoiseReductionConfig,
) -> Result<(), Box<dyn std::error::Error>> {
    let reader = WavReader::open(input_path)?;
    let spec = reader.spec();
    let channels = spec.channels;
    let sample_rate = spec.sample_rate;

    println!("Input: {} Hz, {} channels", sample_rate, channels);
    println!("Duration: {:.2} seconds", reader.duration() as f32 / sample_rate as f32);
    println!("Config: noise_frames={}, spectral_floor={}, over_subtraction={}, makeup_gain={}",
        config.noise_frames, config.spectral_floor, config.over_subtraction, config.makeup_gain);

    let samples: Vec<f32> = reader
        .into_samples::<i16>()
        .filter_map(|s| s.ok())
        .map(|s| s as f32 / i16::MAX as f32)
        .collect();

    println!("Total samples: {}", samples.len());

    // Use core library for processing
    let mut processor = bg_noise_reduction_core::AudioProcessor::new(FRAME_SIZE);
    let output_samples = processor.process(&samples, &config);

    println!("Processed {} frames", samples.len() / FRAME_SIZE);

    let output_spec = WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = WavWriter::create(output_path, output_spec)?;
    for sample in &output_samples {
        let sample_i16 = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        writer.write_sample(sample_i16)?;
    }
    writer.finalize()?;

    println!("Output written to: {}", output_path.display());
    Ok(())
}
