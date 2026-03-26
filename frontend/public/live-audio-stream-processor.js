class LiveAudioStreamProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions || {};
    this.targetSampleRate = config.targetSampleRate || 16000;
    this.emitFrameSamples = config.emitFrameSamples || 3200;
    this.targetRms = config.targetRms || 0.18;
    this.maxGain = config.maxGain || 4;
    this.noiseFloor = config.noiseFloor || 0.007;
    this.gateFloor = config.gateFloor || 0.003;
    this.smoothedGain = 1;
    this.resampleRatio = sampleRate / this.targetSampleRate;
    this.sourceSamples = [];
    this.readPosition = 0;
    this.outputSamples = [];
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const channel = input && input[0] ? input[0] : null;

    if (!channel) {
      return true;
    }

    let mean = 0;
    for (let index = 0; index < channel.length; index += 1) {
      mean += channel[index];
    }
    mean /= Math.max(channel.length, 1);

    let sumSquares = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const centered = channel[index] - mean;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / Math.max(channel.length, 1));
    const desiredGain =
      rms < this.noiseFloor ? 1 : Math.min(this.maxGain, Math.max(0.85, this.targetRms / Math.max(rms, 1e-4)));
    this.smoothedGain = this.smoothedGain * 0.84 + desiredGain * 0.16;

    const processed = new Float32Array(channel.length);
    for (let index = 0; index < channel.length; index += 1) {
      let sample = (channel[index] - mean) * this.smoothedGain;
      if (Math.abs(sample) < this.gateFloor) {
        sample = 0;
      }
      sample = Math.max(-0.98, Math.min(0.98, sample));
      processed[index] = sample;
    }

    if (output && output[0]) {
      output[0].set(processed);
    }

    for (let index = 0; index < processed.length; index += 1) {
      this.sourceSamples.push(processed[index]);
    }

    while (this.readPosition + this.resampleRatio <= this.sourceSamples.length - 1) {
      const sourceIndex = Math.floor(this.readPosition);
      const nextIndex = Math.min(sourceIndex + 1, this.sourceSamples.length - 1);
      const blend = this.readPosition - sourceIndex;
      const sample =
        this.sourceSamples[sourceIndex] * (1 - blend) + this.sourceSamples[nextIndex] * blend;
      this.outputSamples.push(sample);
      this.readPosition += this.resampleRatio;
    }

    const consumed = Math.floor(this.readPosition);
    if (consumed > 0) {
      this.sourceSamples = this.sourceSamples.slice(consumed);
      this.readPosition -= consumed;
    }

    if (this.outputSamples.length >= this.emitFrameSamples) {
      const pcm = new Int16Array(this.outputSamples.length);
      for (let index = 0; index < this.outputSamples.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, this.outputSamples[index]));
        pcm[index] = sample < 0 ? sample * 32768 : sample * 32767;
      }

      this.port.postMessage(
        {
          pcm: pcm.buffer,
          level: Math.min(1, rms * 8)
        },
        [pcm.buffer]
      );
      this.outputSamples = [];
    }

    return true;
  }
}

registerProcessor('live-audio-stream-processor', LiveAudioStreamProcessor);
