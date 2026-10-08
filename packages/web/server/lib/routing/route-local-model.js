/**
 * The local interpreter: a small instruction model that answers the choice
 * questions in `route-interpreter.js`, constrained to the allowed answers by a
 * JSON grammar so it cannot reply with anything else. It is only downloaded when
 * the user asks for it in Settings, and `node-llama-cpp` is loaded lazily, so
 * OpenChamber runs without either.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LOCAL_MODEL = {
  id: 'qwen2.5-1.5b-instruct-q4_k_m',
  label: 'Qwen2.5 1.5B Instruct (Q4_K_M)',
  file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  bytes: 1117320736,
};

const modelsDir = (env = process.env) => {
  const base = env.XDG_CACHE_HOME?.trim() || path.join(os.homedir(), '.cache');
  return path.join(base, 'openchamber', 'models');
};

export const modelPath = (env) => path.join(modelsDir(env), LOCAL_MODEL.file);

export const modelStatus = (file = modelPath()) => {
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    size = 0;
  }
  return {
    ...LOCAL_MODEL,
    path: file,
    installed: size === LOCAL_MODEL.bytes,
    downloadedBytes: size,
  };
};

/** Downloads the model to a partial file and renames it only when the full size arrived. */
export const downloadModel = async ({ file = modelPath(), fetchImpl = fetch, onProgress = () => {} } = {}) => {
  if (modelStatus(file).installed) return modelStatus(file);
  const response = await fetchImpl(LOCAL_MODEL.url);
  if (!response.ok || !response.body) {
    throw Object.assign(new Error(`Model download failed (${response.status})`), { status: 502 });
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const partial = `${file}.part`;
  const out = fs.createWriteStream(partial);
  let received = 0;
  try {
    for await (const chunk of response.body) {
      received += chunk.length;
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
      onProgress(received, LOCAL_MODEL.bytes);
    }
    await new Promise((resolve, reject) => out.end((error) => (error ? reject(error) : resolve())));
  } catch (error) {
    out.destroy();
    fs.rmSync(partial, { force: true });
    throw error;
  }
  if (received !== LOCAL_MODEL.bytes) {
    fs.rmSync(partial, { force: true });
    throw Object.assign(new Error('The model download was incomplete; try again'), { status: 502 });
  }
  fs.renameSync(partial, file);
  return modelStatus(file);
};

/**
 * Answers the choice questions with the local model. `loadLlama` is injected so
 * tests can run without the native runtime; the real one loads `node-llama-cpp`.
 */
export const createLocalAnswerer = ({ file = modelPath(), loadLlama = defaultLoadLlama } = {}) => {
  let runtime;
  const ready = () => {
    runtime ??= (async () => {
      const llama = await loadLlama();
      const model = await llama.loadModel({ modelPath: file });
      const context = await model.createContext({ contextSize: 1024 });
      return { llama, context };
    })().catch((error) => {
      runtime = undefined;
      throw error;
    });
    return runtime;
  };

  return {
    /** Resolves to the answer for each question key, or throws when the model cannot run. */
    answer: async ({ prompt, schema }) => {
      const { llama, context } = await ready();
      const { LlamaChatSession } = await loadLlamaChat();
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt:
          'You classify one sentence about which AI model providers to use. Answer only with the JSON object that matches the schema.',
      });
      try {
        const grammar = await llama.createGrammarForJsonSchema(schema);
        const raw = await session.prompt(prompt, { grammar, maxTokens: 120, temperature: 0 });
        return JSON.parse(raw);
      } finally {
        session.dispose({ disposeSequence: true });
      }
    },
  };
};

const defaultLoadLlama = async () => {
  const { getLlama } = await import('node-llama-cpp');
  return getLlama();
};

const loadLlamaChat = () => import('node-llama-cpp');
