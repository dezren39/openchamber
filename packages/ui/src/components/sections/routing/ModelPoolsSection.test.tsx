import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Hand-rolled recorders rather than bun's `mock()`: its installed types omit
// `.mock`/`mockClear`, while the runtime behaviour is all these tests need.
const routeFetches: string[] = [];
const routeSaves: unknown[] = [];
let serverRoutes: Record<string, { targets: string[] }> = {};
let saveError: Error | null = null;

const fetchModelRoutes = async () => {
  routeFetches.push('fetch');
  return { routes: serverRoutes, available: true };
};
const saveModelRoutes = async (routes: unknown) => {
  routeSaves.push(routes);
  if (saveError) throw saveError;
  serverRoutes = routes as typeof serverRoutes;
  return { routes, available: true };
};
const fetchRouteStats = async () => ({ available: false, reason: 'no-database' });

mock.module('@/lib/routing/modelRoutesApi', () => ({
  AUTONOMY_LEVELS: ['fixed', 'rules', 'adaptive', 'predictive', 'agent'],
  fetchModelRoutes,
  saveModelRoutes,
  fetchRouteStats,
}));

const { ModelPoolsSection } = await import('./ModelPoolsSection');
const { I18nProvider } = await import('@/lib/i18n');
const { useConfigStore } = await import('@/stores/useConfigStore');
const { useRoutingStore } = await import('@/stores/useRoutingStore');

const DOM_GLOBAL_NAMES = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'] as const;

const installDom = () => {
  const happyWindow = new Window({ url: 'http://localhost' });
  const previous = DOM_GLOBAL_NAMES.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const values = {
    window: happyWindow,
    document: happyWindow.document,
    navigator: happyWindow.navigator,
    Node: happyWindow.Node,
    Element: happyWindow.Element,
    HTMLElement: happyWindow.HTMLElement,
    localStorage: happyWindow.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const name of DOM_GLOBAL_NAMES) {
    Object.defineProperty(globalThis, name, { value: values[name], configurable: true, writable: true });
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  return {
    container,
    restore: () => {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
};

const textModel = (id: string, cost: number, context: number) => ({
  id,
  modelID: id,
  providerID: 'p',
  name: id,
  capabilities: { tools: true, input: ['text'], output: ['text'] },
  variants: [],
  time: { released: 0 },
  cost: [{ input: cost, output: cost, cache: { read: 0, write: 0 } }],
  status: 'active',
  enabled: true,
  limit: { context, output: 1000 },
});

const renderSection = async () => {
  const dom = installDom();
  const root = createRoot(dom.container);
  await act(async () => {
    root.render(
      <I18nProvider>
        <ModelPoolsSection />
      </I18nProvider>,
    );
  });
  return {
    dom,
    cleanup: async () => {
      await act(async () => root.unmount());
      dom.restore();
    },
  };
};

describe('ModelPoolsSection', () => {
  let root: Root | null = null;

  beforeEach(() => {
    routeFetches.length = 0;
    routeSaves.length = 0;
    serverRoutes = {};
    saveError = null;
    useConfigStore.setState({
      providers: [
        {
          id: 'p',
          name: 'p',
          models: [textModel('cheap', 1, 8000), textModel(' dear', 10, 200000)],
        },
      ],
    } as never);
    useRoutingStore.setState({ decisions: {} } as never);
  });

  afterEach(async () => {
    if (root) {
      const mounted = root;
      root = null;
      await act(async () => mounted.unmount());
    }
  });

  test('renders presets and an empty pool list from the server state', async () => {
    const { dom, cleanup } = await renderSection();
    try {
      const text = dom.container.textContent ?? '';
      expect(text).toContain('Model pools');
      expect(text).toContain('Cheapest first');
      expect(text).toContain('Fastest first');
      expect(text).toContain('Sturdiest first');
      expect(routeFetches.length).toBe(1);
    } finally {
      await cleanup();
    }
  });

  test('a preset builds a pool from the catalog and saves it', async () => {
    const { dom, cleanup } = await renderSection();
    try {
      const button = [...dom.container.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Cheapest first');
      expect(button).toBeTruthy();
      await act(async () => {
        button!.click();
      });
      expect(routeSaves.length).toBe(1);
      const saved = routeSaves[0] as Record<string, { targets: string[] }>;
      expect(Object.keys(saved)).toEqual(['cheap-pool']);
      expect(saved['cheap-pool'].targets).toEqual(['p/cheap', 'p/ dear']);
      expect(dom.container.textContent).toContain('cheap-pool');
    } finally {
      await cleanup();
    }
  });

  test('a failed save rolls back to the last server-confirmed state', async () => {
    serverRoutes = { kept: { targets: ['p/cheap'] } };
    saveError = new Error('nope');
    const { dom, cleanup } = await renderSection();
    try {
      const button = [...dom.container.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Cheapest first');
      await act(async () => {
        button!.click();
      });
      const text = dom.container.textContent ?? '';
      expect(text).toContain('kept');
      expect(text).not.toContain('cheap-pool');
      expect(text).toContain('nope');
    } finally {
      await cleanup();
    }
  });

  test('recent Auto decisions render in the expert view', async () => {
    useRoutingStore.setState({
      decisions: {
        s1: { sessionId: 's1', at: 2, category: 'hard', confidence: 0.9, reason: 'routed', providerID: 'openai', modelID: 'x' },
      },
    } as never);
    const { dom, cleanup } = await renderSection();
    try {
      // Decisions render once the mocked fetch resolves.
      await act(async () => {});
      expect(dom.container.textContent).toContain('hard');
    } finally {
      await cleanup();
    }
  });
});
