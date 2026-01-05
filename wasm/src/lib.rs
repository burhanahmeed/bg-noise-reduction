use bg_noise_reduction_core::{AudioProcessor, NoiseReductionConfig};
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global allocator
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

/// WebAssembly wrapper for audio noise reduction
#[wasm_bindgen]
pub struct NoiseReduction {
    processor: AudioProcessor,
    config: NoiseReductionConfig,
}

#[wasm_bindgen]
impl NoiseReduction {
    /// Create a new noise reduction processor with default settings
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();
        Self {
            processor: AudioProcessor::new(2048),
            config: NoiseReductionConfig::default(),
        }
    }

    /// Process audio samples and return cleaned audio
    ///
    /// # Arguments
    /// * `samples` - Audio samples as Float32Array (mono, -1.0 to 1.0)
    ///
    /// # Returns
    /// Processed audio samples as Float32Array
    #[wasm_bindgen]
    pub fn process(&mut self, samples: &[f32]) -> Vec<f32> {
        self.processor.process(samples, &self.config)
    }

    /// Set all configuration parameters at once (avoids aliasing issues)
    #[wasm_bindgen]
    pub fn set_config(&mut self, noise_frames: usize, spectral_floor: f32, over_subtraction: f32, makeup_gain: f32) {
        self.config.noise_frames = noise_frames;
        self.config.spectral_floor = spectral_floor;
        self.config.over_subtraction = over_subtraction;
        self.config.makeup_gain = makeup_gain;
    }

    /// Set the number of frames for noise estimation
    #[wasm_bindgen]
    pub fn set_noise_frames(&mut self, value: usize) {
        self.config.noise_frames = value;
    }

    /// Set the spectral floor (0.0 to 1.0)
    #[wasm_bindgen]
    pub fn set_spectral_floor(&mut self, value: f32) {
        self.config.spectral_floor = value;
    }

    /// Set the over-subtraction factor
    #[wasm_bindgen]
    pub fn set_over_subtraction(&mut self, value: f32) {
        self.config.over_subtraction = value;
    }

    /// Set the makeup gain (output volume multiplier)
    #[wasm_bindgen]
    pub fn set_makeup_gain(&mut self, value: f32) {
        self.config.makeup_gain = value;
    }

    /// Get current configuration as JSON string
    #[wasm_bindgen]
    pub fn get_config(&self) -> String {
        format!(
            r#"{{"noise_frames":{},"spectral_floor":{},"over_subtraction":{},"makeup_gain":{}}}"#,
            self.config.noise_frames,
            self.config.spectral_floor,
            self.config.over_subtraction,
            self.config.makeup_gain
        )
    }

    /// Apply a preset configuration
    #[wasm_bindgen]
    pub fn apply_preset(&mut self, preset: &str) {
        match preset {
            "light" => {
                self.config.noise_frames = 10;
                self.config.spectral_floor = 0.25;
                self.config.over_subtraction = 1.0;
                self.config.makeup_gain = 1.2;
            }
            "medium" => {
                self.config.noise_frames = 10;
                self.config.spectral_floor = 0.1;
                self.config.over_subtraction = 2.0;
                self.config.makeup_gain = 1.5;
            }
            "heavy" => {
                self.config.noise_frames = 10;
                self.config.spectral_floor = 0.05;
                self.config.over_subtraction = 3.0;
                self.config.makeup_gain = 1.8;
            }
            "extreme" => {
                self.config.noise_frames = 10;
                self.config.spectral_floor = 0.02;
                self.config.over_subtraction = 4.0;
                self.config.makeup_gain = 2.0;
            }
            _ => {}
        }
    }
}
