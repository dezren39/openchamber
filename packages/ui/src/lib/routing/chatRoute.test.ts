import { afterEach, describe, expect, test } from 'bun:test';

import { applyChatRoute, chatRouteOutcome } from './chatRoute';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

describe('chatRouteOutcome', () => {
  test('an applied sentence reports the summary the server wrote', () => {
    expect(chatRouteOutcome({
      status: 'applied',
      stage: 'keywords',
      confidence: 'high',
      summary: 'Avoid OpenAI for 1 hour',
      rules: [],
    })).toEqual({ status: 'applied', summary: 'Avoid OpenAI for 1 hour' });
  });

  test('a clarify result asks for a choice in settings instead of guessing', () => {
    expect(chatRouteOutcome({ status: 'clarify', key: 'scope', question: 'Which?', options: ['a', 'b'] }))
      .toEqual({ status: 'needs-choice' });
  });

  test('an unknown sentence keeps the reason', () => {
    expect(chatRouteOutcome({ status: 'unknown', reason: 'no provider named Foo' }))
      .toEqual({ status: 'unknown', reason: 'no provider named Foo' });
  });
});

describe('applyChatRoute', () => {
  test('sends the sentence with the configured providers and models', async () => {
    let url = '';
    let body: unknown = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      body = JSON.parse(String(init?.body));
      return json(200, { status: 'applied', stage: 'keywords', confidence: 'high', summary: 'Avoid OpenAI', rules: [] });
    }) as typeof fetch;

    const outcome = await applyChatRoute('avoid OpenAI', [{ id: 'openai', models: [{ id: 'gpt-5' }] }]);

    expect(url).toContain('/api/model-routes/interpret');
    expect(body).toEqual({
      text: 'avoid OpenAI',
      context: { providers: ['openai'], models: [{ id: 'gpt-5', providerID: 'openai' }] },
    });
    expect(outcome).toEqual({ status: 'applied', summary: 'Avoid OpenAI' });
  });

  test('a server error reaches the caller with its message', async () => {
    globalThis.fetch = (async () => json(400, { error: 'text is required' })) as typeof fetch;

    await expect(applyChatRoute('', [])).rejects.toThrow('text is required');
  });
});
