import { useState, useCallback, useRef } from 'react';
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
  const processorRef = useRef<NoiseReduction | null>(null);

  const initModule = useCallback(async () => {
    try {
      await init();
      processorRef.current = new NoiseReduction();
      setIsReady(true);
    } catch (error) {
      console.error('Failed to initialize WASM module:', error);
      throw error;
    }
  }, []);

  const processAudio = useCallback(
    async (samples: Float32Array, config: NoiseReductionConfig): Promise<Float32Array> => {
      if (!processorRef.current) {
        throw new Error('Processor not initialized');
      }

      setIsProcessing(true);

      try {
        // Use set_config to avoid aliasing issues with multiple setters
        processorRef.current.set_config(
          config.noise_frames,
          config.spectral_floor,
          config.over_subtraction,
          config.makeup_gain
        );

        // Run WASM processing in next tick to allow UI to update
        const result = await new Promise<Float32Array>((resolve, reject) => {
          setTimeout(() => {
            try {
              resolve(processorRef.current!.process(samples));
            } catch (e) {
              reject(e);
            }
          }, 0);
        });

        setIsProcessing(false);
        return result;
      } catch (error) {
        setIsProcessing(false);
        throw error;
      }
    },
    []
  );

  const applyPreset = useCallback((preset: 'light' | 'medium' | 'heavy' | 'extreme') => {
    if (processorRef.current) {
      processorRef.current.apply_preset(preset);
    }
  }, []);

  return {
    isReady,
    isProcessing,
    initModule,
    processAudio,
    applyPreset,
  };
}
