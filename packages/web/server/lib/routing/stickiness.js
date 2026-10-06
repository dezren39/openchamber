/**
 * Hysteresis for Auto routing. Jev classifies each prompt on its own, so two
 * similar follow-ups can land in neighbouring categories and bounce a session
 * between models (Luna, then glm, then Luna again). Switching models also costs
 * the provider's prompt cache. A session therefore keeps its model unless the
 * evidence for a change is consistent:
 *
 * - Leaving the model the session started on needs `enterTurns` consecutive
 *   prompts that point at the same other model, or one prompt Jev is sure about
 *   (`strongConfidence`).
 * - Having jumped away, the session stays on the new model until
 *   `exitTurns` consecutive prompts point elsewhere: it is not given up the
 *   moment one prompt looks easy, because the hard part is probably not over.
 *   A sure answer shortens that, but never below two prompts.
 * - A prompt with no usable answer (low confidence, an unknown category, Jev
 *   unreachable) keeps the current model instead of dropping to the fallback.
 *
 * State is process memory like the Auto marks; a restart starts sessions fresh.
 */

import { DEFAULT_STICKINESS } from './defaults.js';

const SESSION_LIMIT = 1000;

export const createStickiness = ({ sessionLimit = SESSION_LIMIT } = {}) => {
  const sessions = new Map();

  const remember = (sessionId, state) => {
    sessions.delete(sessionId);
    sessions.set(sessionId, state);
    while (sessions.size > sessionLimit) sessions.delete(sessions.keys().next().value);
  };

  return {
    /**
     * `candidate` is `{ key, categoryId, confidence }` for a confident answer
     * and null for none. Returns what to use now: `categoryId` (null means the
     * fallback pair), whether the choice `held` against the candidate, and why.
     */
    decide(sessionId, candidate, params = DEFAULT_STICKINESS) {
      const state = sessions.get(sessionId);
      if (!state) {
        if (!candidate) return { categoryId: null, held: false, reason: 'initial' };
        remember(sessionId, { key: candidate.key, categoryId: candidate.categoryId, baseKey: candidate.key, vote: null });
        return { categoryId: candidate.categoryId, held: false, reason: 'initial' };
      }
      if (!candidate) {
        return { categoryId: state.categoryId, held: true, reason: 'no-signal' };
      }
      if (candidate.key === state.key) {
        remember(sessionId, { ...state, categoryId: candidate.categoryId, vote: null });
        return { categoryId: candidate.categoryId, held: false, reason: 'same' };
      }

      const count = state.vote?.key === candidate.key ? state.vote.count + 1 : 1;
      const jumped = state.key !== state.baseKey;
      const strong = candidate.confidence >= params.strongConfidence;
      const base = jumped ? params.exitTurns : params.enterTurns;
      // Returning to where the session started is the same exit as any other.
      const needed = strong ? Math.min(base, jumped ? 2 : 1) : base;
      if (count >= needed) {
        remember(sessionId, { key: candidate.key, categoryId: candidate.categoryId, baseKey: state.baseKey, vote: null });
        return { categoryId: candidate.categoryId, held: false, reason: 'switched' };
      }
      remember(sessionId, { ...state, vote: { key: candidate.key, count } });
      return { categoryId: state.categoryId, held: true, reason: 'holding', votes: count, needed };
    },
    forget(sessionId) {
      sessions.delete(sessionId);
    },
  };
};
