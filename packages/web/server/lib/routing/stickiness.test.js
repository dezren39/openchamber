import { describe, expect, it } from 'vitest';
import { createStickiness } from './stickiness.js';

const luna = (confidence = 0.7) => ({ key: 'openai/luna#', categoryId: 'implement', confidence });
const glm = (confidence = 0.7) => ({ key: 'zai/glm#', categoryId: 'hard', confidence });

describe('routing stickiness', () => {
  it('adopts the first answer and falls back for a session with no history', () => {
    const s = createStickiness();
    expect(s.decide('a', null)).toMatchObject({ categoryId: null, held: false });
    expect(s.decide('a', luna())).toMatchObject({ categoryId: 'implement', held: false, reason: 'initial' });
  });

  it('does not bounce on a single prompt that points elsewhere', () => {
    const s = createStickiness();
    s.decide('a', luna());
    expect(s.decide('a', glm())).toMatchObject({ categoryId: 'implement', held: true });
    // The next prompt agrees with the session again: the lone vote is forgotten.
    expect(s.decide('a', luna())).toMatchObject({ categoryId: 'implement', held: false });
    expect(s.decide('a', glm())).toMatchObject({ categoryId: 'implement', held: true });
  });

  it('switches after consistent evidence, or at once when Jev is sure', () => {
    const s = createStickiness();
    s.decide('a', luna());
    s.decide('a', glm());
    expect(s.decide('a', glm())).toMatchObject({ categoryId: 'hard', held: false, reason: 'switched' });
    const sure = createStickiness();
    sure.decide('b', luna());
    expect(sure.decide('b', glm(0.95))).toMatchObject({ categoryId: 'hard', held: false });
  });

  it('stays on the model it jumped to until it is sure the hard part is over', () => {
    const s = createStickiness();
    s.decide('a', luna());
    s.decide('a', glm());
    s.decide('a', glm());
    expect(s.decide('a', luna())).toMatchObject({ categoryId: 'hard', held: true });
    expect(s.decide('a', luna())).toMatchObject({ categoryId: 'hard', held: true });
    expect(s.decide('a', luna())).toMatchObject({ categoryId: 'implement', held: false, reason: 'switched' });
    // A sure answer still needs two prompts to leave a jumped-to model.
    const t = createStickiness();
    t.decide('b', luna());
    t.decide('b', glm(0.95));
    expect(t.decide('b', luna(0.95))).toMatchObject({ categoryId: 'hard', held: true });
    expect(t.decide('b', luna(0.95))).toMatchObject({ categoryId: 'implement', held: false });
  });

  it('keeps the current model when Jev has no usable answer', () => {
    const s = createStickiness();
    s.decide('a', luna());
    expect(s.decide('a', null)).toMatchObject({ categoryId: 'implement', held: true, reason: 'no-signal' });
  });

  it('tracks sessions independently and forgets on request', () => {
    const s = createStickiness();
    s.decide('a', luna());
    s.decide('b', glm());
    expect(s.decide('a', glm())).toMatchObject({ held: true });
    s.forget('a');
    expect(s.decide('a', glm())).toMatchObject({ categoryId: 'hard', reason: 'initial' });
  });
});
