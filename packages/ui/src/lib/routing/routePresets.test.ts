import { describe, expect, test } from 'bun:test';
import { cheapestTargets, fastestTargets, sturdiestTargets } from './routePresets';
import type { Model, Provider } from '@/lib/opencode/model';

const model = (
  id: string,
  cost: number,
  context: number,
  extra: Partial<Model> = {},
  capabilities = { tools: true, input: ['text'], output: ['text'] },
): Model =>
  ({
    id,
    modelID: id,
    providerID: 'p',
    name: id,
    capabilities,
    variants: [],
    time: { released: 0 },
    cost: [{ input: cost, output: cost, cache: { read: 0, write: 0 } }],
    status: 'active',
    enabled: true,
    limit: { context, output: 1000 },
    ...extra,
  }) as unknown as Model;

const providers = (entries: Array<[string, Array<ReturnType<typeof model>>]>) =>
  entries.map(([id, models]) => ({ id, models }) as unknown as Provider & { models: Model[] });

describe('cheapestTargets', () => {
  test('orders by per-token cost and skips deprecated models', () => {
    const targets = cheapestTargets(
      providers([
        ['a', [model('expensive', 10, 100000)]],
        ['b', [model('cheap', 1, 100000), model('old', 0.1, 100000, { status: 'deprecated' })]],
      ]),
    );
    expect(targets).toEqual(['b/cheap', 'a/expensive']);
  });
});

describe('fastestTargets', () => {
  test('orders by context size ascending', () => {
    const targets = fastestTargets(
      providers([['a', [model('big', 1, 200000), model('small', 5, 8000)]]]),
    );
    expect(targets).toEqual(['a/small', 'a/big']);
  });
});

describe('sturdiestTargets', () => {
  test('picks the model id listed by the most providers, cheapest first', () => {
    const targets = sturdiestTargets(
      providers([
        ['a', [model('luna', 5, 100000)]],
        ['b', [model('luna', 2, 100000)]],
        ['c', [model('solo', 1, 100000)]],
      ]),
    );
    expect(targets).toEqual(['b/luna', 'a/luna']);
  });

  test('returns [] when every model is single-provider', () => {
    expect(sturdiestTargets(providers([['a', [model('solo', 1, 100000)]]]))).toEqual([]);
  });
});

describe('text-only eligibility', () => {
  test('image and video models are never pool targets', () => {
    const image = model('img', 0.1, 1000, {}, { tools: false, input: ['image'], output: ['image'] });
    const video = model('vid', 0.1, 1000, {}, { tools: false, input: ['video'], output: ['video'] });
    const text = model('txt', 5, 100000);
    const catalog = [{ id: 'a', models: [image, video, text] }] as unknown as Parameters<
      typeof cheapestTargets
    >[0];
    expect(cheapestTargets(catalog)).toEqual(['a/txt']);
    expect(fastestTargets(catalog)).toEqual(['a/txt']);
    expect(sturdiestTargets([{ id: 'a', models: [image] }, { id: 'b', models: [image] }] as never)).toEqual([]);
  });
});
