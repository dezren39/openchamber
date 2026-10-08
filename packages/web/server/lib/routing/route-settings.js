/**
 * Settings for the rules interpreter: which stages run and the thresholds
 * behind learning and wait estimates. Stored in OpenChamber's own settings
 * directory, never in the OpenCode config. Every value has a default that works,
 * so the file only needs to exist once the user changes something.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_TOGGLES } from './route-interpreter.js';

export const DEFAULT_SETTINGS = {
  stages: { ...DEFAULT_TOGGLES },
  learnAfter: 3,
  waitPercentile: 25,
  waitMinSamples: 5,
};

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

export const normalizeSettings = (input = {}) => ({
  stages: {
    keywords: input.stages?.keywords !== false,
    local: input.stages?.local !== false,
    external: input.stages?.external !== false,
  },
  learnAfter: clamp(input.learnAfter, 1, 20, DEFAULT_SETTINGS.learnAfter),
  waitPercentile: clamp(input.waitPercentile, 5, 75, DEFAULT_SETTINGS.waitPercentile),
  waitMinSamples: clamp(input.waitMinSamples, 1, 100, DEFAULT_SETTINGS.waitMinSamples),
});

const resolveSettingsFile = (env = process.env) => {
  const dir = env.OPENCHAMBER_DATA_DIR?.trim()
    ? path.resolve(env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), '.config', 'openchamber');
  return path.join(dir, 'route-settings.json');
};

export const createSettingsStore = ({ file = resolveSettingsFile() } = {}) => ({
  read: () => {
    try {
      return normalizeSettings(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      return normalizeSettings({});
    }
  },
  write: (input) => {
    const next = normalizeSettings(input);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2));
    return next;
  },
});
