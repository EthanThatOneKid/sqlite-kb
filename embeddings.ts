import "@tensorflow/tfjs-backend-cpu";
import * as tf from "@tensorflow/tfjs";
import * as use from "@tensorflow-models/universal-sentence-encoder";

// Initialize backend immediately
await tf.setBackend("cpu");

let model: use.UniversalSentenceEncoder | null = null;

async function getModel() {
  if (!model) {
    console.log("Loading TensorFlow USE model...");
    model = await use.load();
    console.log("Model loaded.");
  }
  return model;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const m = await getModel();
  const tensor = await m.embed(text);
  const data = await tensor.data();
  // Clean up tensor memory
  tensor.dispose();

  // Convert TypedArray to normal Array for JSON/DB insertion
  return Array.from(data).slice(0, 512); // USE output is [1, 512] for single string
}
