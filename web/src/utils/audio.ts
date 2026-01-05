export async function decodeAudio(file: File, audioContext?: AudioContext): Promise<{ samples: Float32Array; sampleRate: number }> {
  const arrayBuffer = await file.arrayBuffer();
  return decodeAudioFromBuffer(arrayBuffer, audioContext);
}

export async function decodeAudioFromBuffer(arrayBuffer: ArrayBuffer, audioContext?: AudioContext): Promise<{ samples: Float32Array; sampleRate: number }> {
  // Try to parse WAV directly first (faster, no decoding needed)
  try {
    return parseWav(arrayBuffer);
  } catch (err) {
    // Fall back to AudioContext decode for non-WAV formats
    const ctx = audioContext || new AudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const samples = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      let sample = 0;
      for (let channel = 0; channel < numberOfChannels; channel++) {
        sample += audioBuffer.getChannelData(channel)[i];
      }
      samples[i] = sample / numberOfChannels;
    }

    if (!audioContext) {
      await ctx.close();
    }

    return { samples, sampleRate: audioBuffer.sampleRate };
  }
}

function parseWav(arrayBuffer: ArrayBuffer): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(arrayBuffer);
  let offset = 0;

  // Verify RIFF header
  const riff = String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
  if (riff !== 'RIFF') throw new Error('Not a WAV file');
  offset += 4;

  // Skip file size
  offset += 4;

  // Verify WAVE format
  const wave = String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
  if (wave !== 'WAVE') throw new Error('Not a WAV file');
  offset += 4;

  // Find fmt chunk
  let fmtOffset = offset;
  while (fmtOffset < view.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(fmtOffset),
      view.getUint8(fmtOffset + 1),
      view.getUint8(fmtOffset + 2),
      view.getUint8(fmtOffset + 3)
    );
    if (chunkId === 'fmt ') break;
    fmtOffset += 8 + view.getUint32(fmtOffset + 4, true);
  }

  offset = fmtOffset + 8;
  const audioFormat = view.getUint16(offset, true);
  offset += 2;
  const numChannels = view.getUint16(offset, true);
  offset += 2;
  const sampleRate = view.getUint32(offset, true);
  offset += 4;
  const blockAlign = view.getUint16(offset, true);
  offset += 2;
  const bitsPerSample = view.getUint16(offset, true);
  offset += 2;

  if (audioFormat !== 1) throw new Error('Only PCM WAV supported');

  // Find data chunk
  let dataOffset = fmtOffset + 8 + view.getUint32(fmtOffset + 4, true);
  while (dataOffset < view.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(dataOffset),
      view.getUint8(dataOffset + 1),
      view.getUint8(dataOffset + 2),
      view.getUint8(dataOffset + 3)
    );
    if (chunkId === 'data') break;
    dataOffset += 8 + view.getUint32(dataOffset + 4, true);
  }

  const dataSize = view.getUint32(dataOffset + 4, true);
  dataOffset += 8;

  // Read PCM data and convert to Float32Array
  const samplesPerChannel = dataSize / blockAlign;
  const samples = new Float32Array(samplesPerChannel);

  if (bitsPerSample === 16) {
    // 16-bit PCM
    for (let i = 0; i < samplesPerChannel; i++) {
      let sample = 0;
      for (let channel = 0; channel < numChannels; channel++) {
        const intSample = view.getInt16(dataOffset + (i * numChannels + channel) * 2, true);
        sample += intSample / 0x8000; // Convert to [-1, 1]
      }
      samples[i] = sample / numChannels;
    }
  } else if (bitsPerSample === 24) {
    // 24-bit PCM
    for (let i = 0; i < samplesPerChannel; i++) {
      let sample = 0;
      for (let channel = 0; channel < numChannels; channel++) {
        const byteOffset = dataOffset + (i * numChannels + channel) * 3;
        const intSample = view.getInt8(byteOffset + 2) * 0x10000 +
                         view.getUint8(byteOffset + 1) * 0x100 +
                         view.getUint8(byteOffset);
        sample += intSample / 0x800000; // Convert to [-1, 1]
      }
      samples[i] = sample / numChannels;
    }
  } else if (bitsPerSample === 32) {
    // 32-bit PCM
    for (let i = 0; i < samplesPerChannel; i++) {
      let sample = 0;
      for (let channel = 0; channel < numChannels; channel++) {
        const intSample = view.getInt32(dataOffset + (i * numChannels + channel) * 4, true);
        sample += intSample / 0x80000000; // Convert to [-1, 1]
      }
      samples[i] = sample / numChannels;
    }
  } else {
    throw new Error(`Unsupported bit depth: ${bitsPerSample}`);
  }

  return { samples, sampleRate };
}

// Convert Float32Array samples to AudioBuffer for Web Audio API
export function samplesToAudioBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
  const audioContext = new AudioContext();
  const audioBuffer = audioContext.createBuffer(1, samples.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    channelData[i] = samples[i];
  }
  return audioBuffer;
}

// Convert samples to WAV blob for download
export function samplesToWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write samples as 16-bit PCM
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(44 + i * 2, intSample, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getAudioDuration(samples: Float32Array, sampleRate: number): number {
  return samples.length / sampleRate;
}
