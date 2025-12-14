import "@tensorflow/tfjs-backend-cpu";
import "@tensorflow/tfjs-backend-wasm";
// Import other backends if possible, some might fail in Deno without polyfills
try {
  await import("@tensorflow/tfjs-backend-webgl");
} catch (e) {
  console.error("WebGL backend import failed:", e);
}
try {
  await import("@tensorflow/tfjs-node");
} catch (e) {
  console.error("Node backend import failed:", e);
}

import * as tf from "@tensorflow/tfjs";
import * as use from "@tensorflow-models/universal-sentence-encoder";

// Initialize a default backend to load the model
await tf.setBackend("cpu");
await tf.ready();

// Load model once
console.log("Loading model...");
const model = await use.load();
console.log("Model loaded.");

const sampleText =
  "The quick brown fox jumps over the lazy dog. Artificial intelligence is transforming the world.";

async function runBenchmark(backendName: string) {
  try {
    const success = await tf.setBackend(backendName);
    if (!success) {
      console.warn(`Backend ${backendName} could not be set.`);
      return;
    }
    await tf.ready();

    // Warmup
    const t = await model.embed("warmup");
    t.dispose();

    const tensor = await model.embed(sampleText);
    const _data = await tensor.data();
    tensor.dispose();
  } catch (error) {
    throw error;
  }
}

Deno.bench({
  name: "TensorFlow USE - CPU Backend",
  async fn() {
    await runBenchmark("cpu");
  },
});

Deno.bench({
  name: "TensorFlow USE - WASM Backend",
  async fn() {
    await runBenchmark("wasm");
  },
});

// These might fail depending on environment
Deno.bench({
  name: "TensorFlow USE - WebGL Backend",
  ignore: true, // Failed in this env
  async fn() {
    await runBenchmark("webgl");
  },
});

// Node backend often requires native bindings which Deno's NPM split might handle oddly
Deno.bench({
  name: "TensorFlow USE - Node Backend",
  ignore: true, // Failed in this env
  async fn() {
    await runBenchmark("tensorflow"); // Node backend is usually registered as 'tensorflow'
  },
});

try {
  await import("@tensorflow/tfjs-node-gpu");
} catch (e) {
  console.error("Node GPU backend import failed:", e);
}

Deno.bench({
  name: "TensorFlow USE - Node GPU Backend",
  ignore: true, // Likely to fail in this env
  async fn() {
    await runBenchmark("tensorflow");
  },
});
