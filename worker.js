const MODEL = 'onnx-community/SmolLM2-135M-Instruct-ONNX';
const SYSTEM = `You are Ghost of UCF, a friendly fictional ghost and eternal college student at the University of Central Florida. You love the Knights, football game-day spirit, and joking about parking, coffee, studying, and finals. Reply in 2 or 3 short sentences with one gentle ghost joke. Be helpful and kind. You are an AI character, not an official UCF representative. You have no live campus news or football scores. Say you do not know current facts and suggest official UCF sources. Never invent schedules, scores, or campus policies.`;
let generator;
let busy = false;

self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    if (data.type === 'load') {
      if (!generator) {
        const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        // A single CPU thread works on GitHub Pages without isolation headers.
        env.backends.onnx.wasm.numThreads = 1;
        generator = await pipeline('text-generation', MODEL, {
          device: 'wasm', dtype: 'q8',
          progress_callback: (event) => self.postMessage({ type: 'progress', event }),
        });
      }
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'generate') {
      if (!generator) throw new Error('Load the model first.');
      // Keep only complete recent turns so context and memory stay bounded.
      const messages = [{ role: 'system', content: SYSTEM }, ...data.messages.slice(-5)];
      const started = performance.now();
      const output = await generator(messages, {
        max_new_tokens: 100, do_sample: true, temperature: 0.7,
        top_p: 0.9, repetition_penalty: 1.15, return_full_text: false,
      });
      const generated = output[0]?.generated_text;
      const reply = typeof generated === 'string' ? generated : generated?.at(-1)?.content;
      if (!reply?.trim()) throw new Error('The model returned an empty response. Try a shorter question.');
      self.postMessage({ type: 'reply', reply: reply.trim(), seconds: (performance.now() - started) / 1000 });
    }
  } catch (error) {
    self.postMessage({ type: 'error', phase: data.type, message: error.message || String(error) });
  } finally {
    busy = false;
  }
};
