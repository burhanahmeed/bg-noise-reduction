use std::env;
use std::path::Path;

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() != 3 {
        eprintln!("Usage: {} <input.wav> <output.wav>", args[0]);
        eprintln!("Example: {} noisy.wav clean.wav", args[0]);
        std::process::exit(1);
    }

    let input_path = Path::new(&args[1]);
    let output_path = Path::new(&args[2]);

    if !input_path.exists() {
        eprintln!("Error: Input file '{}' does not exist", input_path.display());
        std::process::exit(1);
    }

    if let Err(e) = bg_noise_reduction::process_audio(input_path, output_path) {
        eprintln!("Error processing audio: {}", e);
        std::process::exit(1);
    }
}
