import type { ModelRoute, ModelRouteTarget, ModelRouteTuning } from '@/lib/routing/modelRoutesApi';

/** The model a budget or weight is keyed by: the target without its `#variant` suffix. */
export const targetReference = (target: ModelRouteTarget): string => {
  const label = typeof target === 'string' ? target : target.model;
  return label.split('#')[0];
};

/** A pattern such as `openai/*` names several models, so it cannot carry its own budget or weight. */
export const isConcreteTarget = (target: ModelRouteTarget): boolean => !targetReference(target).includes('*');

/** Blank or non-numeric form input means the setting is unset. */
export const parseFormNumber = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Sets or removes one key; an undefined value removes it so OpenCode's default applies again. */
export const withOptional = (record: object | undefined, key: string, value: unknown): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...(record ?? {}) };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
};

/** An object with no keys left is removed entirely rather than saved as `{}`. */
export const pruneEmpty = <T extends object>(record: T): T | undefined => (Object.keys(record).length === 0 ? undefined : record);

export const setRouteField = (route: ModelRoute, key: keyof ModelRoute, value: unknown): ModelRoute => {
  const next: Record<string, unknown> = { ...route };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as ModelRoute;
};

/** Writes one field of a per-target map (budgets or weights), dropping the map when it empties. */
export const setTargetEntry = <T extends object>(
  map: Record<string, T> | undefined,
  reference: string,
  entry: T | undefined,
): Record<string, T> | undefined => {
  const next: Record<string, T> = { ...(map ?? {}) };
  if (entry === undefined || Object.keys(entry).length === 0) delete next[reference];
  else next[reference] = entry;
  return pruneEmpty(next);
};

/** The automatic-review settings to save, or null when every field is back at its default. */
export const tuningToSave = (tuning: ModelRouteTuning): ModelRouteTuning | null => pruneEmpty(tuning) ?? null;
