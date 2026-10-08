import { describe, expect, test } from 'bun:test';
import {
  isConcreteTarget,
  parseFormNumber,
  pruneEmpty,
  setRouteField,
  setTargetEntry,
  targetReference,
  tuningToSave,
  withOptional,
} from './poolAdvanced';

describe('target references', () => {
  test('keys budgets and weights by the model without its variant', () => {
    expect(targetReference('openai/gpt-6-luna#max')).toBe('openai/gpt-6-luna');
    expect(targetReference({ model: 'anthropic/claude-sonnet', defaultVariant: 'high' })).toBe('anthropic/claude-sonnet');
  });

  test('patterns are not concrete targets', () => {
    expect(isConcreteTarget('openai/gpt-6-luna')).toBe(true);
    expect(isConcreteTarget({ model: 'anthropic/*', until: 1893575040000 })).toBe(false);
  });
});

describe('form numbers', () => {
  test('blank input is unset and text is not a number', () => {
    expect(parseFormNumber('')).toBeUndefined();
    expect(parseFormNumber('   ')).toBeUndefined();
    expect(parseFormNumber('abc')).toBeUndefined();
    expect(parseFormNumber('12.5')).toBe(12.5);
    expect(parseFormNumber('0')).toBe(0);
  });
});

describe('optional keys', () => {
  test('setting undefined removes the key rather than writing null', () => {
    expect(withOptional({ attempts: 2, cooldownMs: 5 }, 'cooldownMs', undefined)).toEqual({ attempts: 2 });
    expect(withOptional(undefined, 'sampleWindow', 4)).toEqual({ sampleWindow: 4 });
  });

  test('an emptied health object is removed from the route', () => {
    const route = setRouteField({ targets: ['a/b'], health: { cooldownMs: 5 } }, 'health', pruneEmpty(withOptional({ cooldownMs: 5 }, 'cooldownMs', undefined)));
    expect(route).toEqual({ targets: ['a/b'] });
    expect('health' in route).toBe(false);
  });

  test('other route fields and unknown keys survive an edit', () => {
    const route = setRouteField({ targets: ['a/b'], autonomy: 'agent', futureKey: { on: true } } as never, 'attempts', 3);
    expect(route).toEqual({ targets: ['a/b'], autonomy: 'agent', futureKey: { on: true }, attempts: 3 });
  });
});

describe('per-target maps', () => {
  test('writes an entry and drops the map when its last entry empties', () => {
    const one = setTargetEntry(undefined, 'a/b', { requestsPerDay: 500 });
    expect(one).toEqual({ 'a/b': { requestsPerDay: 500 } });
    expect(setTargetEntry(one, 'a/b', undefined)).toBeUndefined();
  });

  test('keeps other targets when one changes', () => {
    const map = { 'a/b': { requestsPerDay: 500 }, 'c/d': { tokensPerMinute: 900 } };
    expect(setTargetEntry(map, 'a/b', { requestsPerDay: 10 })).toEqual({
      'a/b': { requestsPerDay: 10 },
      'c/d': { tokensPerMinute: 900 },
    });
  });
});

describe('automatic review settings', () => {
  test('an all-default tuning is saved as null so OpenCode defaults apply', () => {
    expect(tuningToSave({})).toBeNull();
    expect(tuningToSave({ enabled: false })).toEqual({ enabled: false });
  });
});
