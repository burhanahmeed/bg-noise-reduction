import { useState, useCallback } from 'react';
import init, { NoiseReduction } from '../../pkg/bg_noise_reduction_wasm';

export interface NoiseReductionConfig {
  noise_frames: number;
  spectral_floor: number;
  over_subtraction: number;
  makeup_gain: number;
}

export function useNoiseReduction() {
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const initModule = useCallback(async () => {
    try {
      await init();
      setIsReady(true);
    } catch (error) {
      console.error('Failed to initialize WASM module:', error);
      throw error;
    }
  }, []);

  const processAudio = useCallback(
    async (samples: Float32Array, config: NoiseReductionConfig): Promise<Float32Array> => {
      setIsProcessing(true);

      try {
        // Create a new processor for each call to avoid aliasing issues with reused state
        const result = await new Promise<Float32Array>((resolve, reject) => {
          setTimeout(() => {
            try {
              const processor = new NoiseReduction();
              resolve(processor.process_with_config(
                samples,
                config.noise_frames,
                config.spectral_floor,
                config.over_subtraction,
                config.makeup_gain
              ));
            } catch (e) {
              reject(e);
            }
          }, 0);
        });

        setIsProcessing(false);
        return result;
      } catch (error) {
        setIsProcessing(false);
        console.error('Error processing audio:', error);
        throw error;
      }
    },
    []
  );

  const applyPreset = useCallback((_preset: 'light' | 'medium' | 'heavy' | 'extreme') => {
    // Presets are handled in JS - config is applied in processAudio
    // This is a no-op function to maintain API compatibility
  }, []);

  return {
    isReady,
    isProcessing,
    initModule,
    processAudio,
    applyPreset,
  };
}
