/**
 * Client for the OpenChamber model-pool routes (`/api/model-routes`). The
 * server owns the OpenCode config file; this module speaks HTTP and parses
 * what comes back. A 404 means the build has no model pools at all and is
 * reported as `available: false`, never as an empty map.
 */
import { z } from 'zod';
import { runtimeFetch } from '@/lib/runtime-fetch';

export const AUTONOMY_LEVELS = ['fixed', 'rules', 'adaptive', 'predictive', 'agent'] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

const targetSchema = z.union([
  z.string().min(1),
  z.object({
    model: z.string().min(1),
    defaultVariant: z.string().optional(),
    variants: z.record(z.string(), z.string()).optional(),
  }),
]);

const modelRouteSchema = z.object({
  name: z.string().optional(),
  targets: z.array(targetSchema),
  autonomy: z.enum(AUTONOMY_LEVELS).optional(),
  selection: z.enum(['ordered', 'round-robin', 'weighted']).optional(),
  weights: z.record(z.string(), z.number()).optional(),
  attempts: z.number().optional(),
  hedgeAfterMs: z.number().optional(),
  health: z.record(z.string(), z.unknown()).optional(),
  budgets: z.record(z.string(), z.unknown()).optional(),
});

export type ModelRoute = z.infer<typeof modelRouteSchema>;
export type ModelRouteTarget = z.infer<typeof targetSchema>;

const modelRoutesStateSchema = z.object({
  routes: z.record(z.string(), modelRouteSchema),
  path: z.string().optional(),
});

export type ModelRoutesState = z.infer<typeof modelRoutesStateSchema> & { available: boolean };

const errorPayloadSchema = z.object({ error: z.string().min(1) });

export const fetchModelRoutes = async (): Promise<ModelRoutesState> => {
  const response = await runtimeFetch('/api/model-routes');
  if (response.status === 404) return { routes: {}, available: false };
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = errorPayloadSchema.safeParse(payload);
    throw new Error(failure.success ? failure.data.error : `Model pools request failed (${response.status})`);
  }
  return { ...modelRoutesStateSchema.parse(payload), available: true };
};

export const saveModelRoutes = async (routes: Record<string, ModelRoute>): Promise<ModelRoutesState> => {
  const response = await runtimeFetch('/api/model-routes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routes }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = errorPayloadSchema.safeParse(payload);
    throw new Error(failure.success ? failure.data.error : `Model pools request failed (${response.status})`);
  }
  return { ...modelRoutesStateSchema.parse(payload), available: true };
};

const routeTargetStatsSchema = z.object({
  providerID: z.string(),
  modelID: z.string(),
  attempts: z.number(),
  failures: z.number(),
  timeouts: z.number(),
  avgFirstTokenMs: z.number().nullable(),
  avgTokensPerSecond: z.number().nullable(),
  lastAttempt: z.number().nullable().optional(),
});

const routeErrorSchema = z.object({
  providerID: z.string(),
  modelID: z.string(),
  tag: z.string().nullable(),
  code: z.string().nullable(),
  status: z.number().nullable(),
  count: z.number(),
  lastTime: z.number().nullable().optional(),
  lastMessage: z.string().nullable(),
});

const hedgeAccuracySchema = z.object({
  providerID: z.string(),
  modelID: z.string(),
  hedges: z.number(),
  wins: z.number(),
});

const routeStatsSchema = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
  windowHours: z.number().optional(),
  targets: z.array(routeTargetStatsSchema).optional(),
  errors: z.array(routeErrorSchema).optional(),
  hedges: z.array(hedgeAccuracySchema).optional(),
});

export type RouteTargetStats = z.infer<typeof routeTargetStatsSchema>;
export type RouteErrorGroup = z.infer<typeof routeErrorSchema>;
export type HedgeAccuracy = z.infer<typeof hedgeAccuracySchema>;
export type RouteStats = z.infer<typeof routeStatsSchema>;

export const fetchRouteStats = async (hours = 24): Promise<RouteStats> => {
  const response = await runtimeFetch(`/api/model-routes/stats?hours=${hours}`);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = errorPayloadSchema.safeParse(payload);
    throw new Error(failure.success ? failure.data.error : `Routing telemetry request failed (${response.status})`);
  }
  return routeStatsSchema.parse(payload);
};
