import "./TextEncoder.js";

import init, { WasmSoundFontSynth } from "../wasm/pkg";

export class SoundFontSynthProcessor extends AudioWorkletProcessor {
  samples: any;
  totalSamples: any;
  detector: any;
  numAudioSamplesPerAnalysis: any;
  synth: WasmSoundFontSynth | undefined;
  sf2Bytes: any;

  constructor() {
    super();

    // Listen to events from the PitchNode running on the main thread.
    this.port.onmessage = (event) => this.onmessage(event.data);

    this.synth = undefined;
    this.sf2Bytes = undefined;
  }

  onmessage(event: any) {
    if (event.type === "send-wasm-module") {
      init(WebAssembly.compile(event.wasmBytes)).then(() => {
        this.port.postMessage({ type: "wasm-module-loaded" });
      });
      this.sf2Bytes = event.sf2Bytes;
    } else if (event.type === "init-synth") {
      const { sampleRate } = event;

      if (!this.sf2Bytes) {
        console.warn("sf2Bytes is undefined");
      }

      this.synth = WasmSoundFontSynth.new(
        new Uint8Array(this.sf2Bytes),
        sampleRate
      );

      this.port.postMessage({ type: "synth-initialized" });
    } else if (event.type === "send-note-on-event") {
      if (!this.synth) return;
      this.synth.note_on(
        event.channel,
        event.key,
        event.vel,
        event.delayTime * sampleRate
      );
    } else if (event.type === "send-note-off-event") {
      if (!this.synth) return;
      this.synth.note_off(
        event.channel,
        event.key,
        event.delayTime * sampleRate
      );
    } else if (event.type === "get-preset-headers") {
      if (!this.synth) return;
      const presetHeaders = this.synth.get_preset_headers();
      console.log("get_preset_headers:", presetHeaders);
      this.port.postMessage({ type: "preset-headers-got", presetHeaders });
    } else if (event.type === "program-select") {
      if (!this.synth) return;
      this.synth.program_select(0, event.bank_num, event.preset_num);
    }
  }

  process(
    _inputs: Array<Array<Float32Array>>,
    outputs: Array<Array<Float32Array>>
  ): boolean {
    if (!this.synth) return true;

    const outputChannels = outputs[0];
    const blockSize = outputChannels[0].length;

    let next_block = this.synth.read_next_block(blockSize);
    outputChannels[0].set(next_block[0]);
    outputChannels.length > 1 && outputChannels[1].set(next_block[1]);

    // Returning true tells the Audio system to keep going.
    return true;
  }
}

registerProcessor("SoundFontSynthProcessor", SoundFontSynthProcessor);
