import processorUrl from "./audioWorklet/SoundFontSynthProcessor.ts?url";
import wasmUrl from "./audioWorklet/pkg/wasm_src_bg.wasm?url";
import SoundFontSynthNode from "./audioWorklet/SoundFontSynthNode";

async function getWebAudioMediaStream() {
  if (!window.navigator.mediaDevices) {
    throw new Error(
      "This browser does not support web audio or it is not enabled."
    );
  }

  try {
    const result = await window.navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    return result;
  } catch (e: any) {
    switch (e.name) {
      case "NotAllowedError":
        throw new Error(
          "A recording device was found but has been disallowed for this application. Enable the device in the browser settings."
        );

      case "NotFoundError":
        throw new Error(
          "No recording device was found. Please attach a microphone and click Retry."
        );

      default:
        throw e;
    }
  }
}

export async function setupAudio(onPitchDetectedCallback: any) {
  // Get the browser audio. Awaits user "allowing" it for the current tab.
  // const mediaStream = await getWebAudioMediaStream();

  const context = new window.AudioContext();
  // const audioSource = context.createMediaStreamSource(mediaStream);

  let node;

  try {
    // Fetch the WebAssembly module that performs pitch detection.
    const response = await window.fetch(wasmUrl);
    const wasmBytes = await response.arrayBuffer();

    // Add our audio processor worklet to the context.
    try {
      await context.audioWorklet.addModule(processorUrl);
    } catch (e: any) {
      throw new Error(
        `Failed to load audio analyzer worklet at url: ${processorUrl}. Further info: ${e.message}`
      );
    }

    // Create the AudioWorkletNode which enables the main JavaScript thread to
    // communicate with the audio processor (which runs in a Worklet).
    node = new SoundFontSynthNode(context, "SoundFontSynthProcessor");

    // numAudioSamplesPerAnalysis specifies the number of consecutive audio samples that
    // the pitch detection algorithm calculates for each unit of work. Larger values tend
    // to produce slightly more accurate results but are more expensive to compute and
    // can lead to notes being missed in faster passages i.e. where the music note is
    // changing rapidly. 1024 is usually a good balance between efficiency and accuracy
    // for music analysis.
    const numAudioSamplesPerAnalysis = 1024;

    const sf2Url = new URL("./assets/A320U.sf2", import.meta.url);
    const sf2Response = await fetch(sf2Url);
    const sf2Bytes = await sf2Response.arrayBuffer();

    // Send the Wasm module to the audio node which in turn passes it to the
    // processor running in the Worklet thread. Also, pass any configuration
    // parameters for the Wasm detection algorithm.
    node.init(
      wasmBytes,
      sf2Bytes,
      onPitchDetectedCallback,
      numAudioSamplesPerAnalysis
    );

    // Connect our analysis node to the output. Required even though we do not
    // output any audio. Allows further downstream audio processing or output to
    // occur.
    node.connect(context.destination);
  } catch (err: any) {
    throw new Error(
      `Failed to load audio analyzer WASM module. Further info: ${err.message}`
    );
  }

  return { context, node };
}
