import express from 'express';

/**
 * Model pools for OpenCode's `experimental.model_routes`: ordered provider/model
 * targets behind one `opencode-route/<id>` name, each with its own autonomy level.
 *
 * OpenChamber owns the Jev category decision (which kind of task this is);
 * OpenCode owns provider failover inside the chosen pool. This module is the
 * bridge: it reads the merged OpenCode config and writes route definitions to
 * the user's global `opencode.json(c)`, the same file the providers surface
 * writes to. Writes are refused in enterprise mode, where the administrator
 * controls the OpenCode config.
 */

export const AUTONOMY_LEVELS = ["fixed", "rules", "adaptive", "predictive", "agent"];
export const SELECTION_MODES = ["ordered", "round-robin", "weighted"];

const ROUTE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const TARGET_PATTERN = /^[^/#]+\/[^#]+(?:#[^#]+)?$/;

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** The raw `experimental.model_routes` map from a merged OpenCode config, or {}. */
export const readModelRoutes = (config) => {
  const routes = config?.experimental?.model_routes;
  return isRecord(routes) ? routes : {};
};

/** A single target: a `provider/model` string or `{ model, ... }` with variant overrides. */
const validateTarget = (target) => {
  if (typeof target === "string") return TARGET_PATTERN.test(target) ? null : "must look like provider/model";
  if (!isRecord(target)) return "must be a provider/model string or an object with a model field";
  if (typeof target.model !== "string" || !TARGET_PATTERN.test(target.model))
    return "its model must look like provider/model";
  if (target.until !== undefined && !(Number.isInteger(target.until) && target.until > 0))
    return "its until must be a positive epoch-millisecond time";
  return null;
};

export const validateModelRoute = (id, route) => {
  if (!ROUTE_ID_PATTERN.test(id)) return `invalid route id "${id}"`;
  if (!isRecord(route)) return `route "${id}" must be an object`;
  if (!Array.isArray(route.targets) || route.targets.length === 0)
    return `route "${id}" needs at least one target`;
  for (const target of route.targets) {
    const problem = validateTarget(target);
    if (problem) return `route "${id}" has a bad target: ${problem}`;
  }
  if (route.autonomy !== undefined && !AUTONOMY_LEVELS.includes(route.autonomy))
    return `route "${id}" has unknown autonomy "${route.autonomy}" (expected ${AUTONOMY_LEVELS.join(", ")})`;
  if (route.selection !== undefined && !SELECTION_MODES.includes(route.selection))
    return `route "${id}" has unknown selection "${route.selection}" (expected ${SELECTION_MODES.join(", ")})`;
  if (route.weights !== undefined) {
    if (!isRecord(route.weights)) return `route "${id}" weights must map target references to numbers`;
    for (const [key, weight] of Object.entries(route.weights)) {
      if (typeof weight !== "number" || !(weight > 0))
        return `route "${id}" weight for "${key}" must be a positive number`;
    }
  }
  return null;
};

export const validateModelRoutes = (routes) => {
  if (!isRecord(routes)) return "routes must be an object of route definitions";
  for (const [id, route] of Object.entries(routes)) {
    const problem = validateModelRoute(id, route);
    if (problem) return problem;
  }
  return null;
};

export const registerModelRouteRoutes = (app, dependencies) => {
  const {
    readConfigLayers,
    getConfigForPath,
    writeConfig,
    CONFIG_FILE,
    isEnterpriseMode,
    refreshOpenCodeAfterConfigChange,
  } = dependencies;

  const refuseInEnterpriseMode = (_req, res, next) =>
    isEnterpriseMode()
      ? res.status(403).json({ error: "Model pools are managed by the administrator in enterprise mode" })
      : next();

  app.get("/api/model-routes", async (req, res) => {
    try {
      const layers = readConfigLayers(null);
      res.json({ routes: readModelRoutes(layers.mergedConfig), path: layers.paths.userPath ?? CONFIG_FILE });
    } catch (error) {
      res.status(500).json({ error: error?.message ?? "Failed to read model pools" });
    }
  });

  app.put("/api/model-routes", express.json({ limit: "256kb" }), refuseInEnterpriseMode, async (req, res) => {
    try {
      const routes = req.body?.routes;
      const problem = validateModelRoutes(routes);
      if (problem) return res.status(400).json({ error: problem });
      const layers = readConfigLayers(null);
      const targetPath = layers.paths.userPath ?? CONFIG_FILE;
      const targetConfig = getConfigForPath(layers, targetPath);
      if (!isRecord(targetConfig.experimental)) targetConfig.experimental = {};
      targetConfig.experimental.model_routes = routes;
      writeConfig(targetConfig, targetPath);
      if (refreshOpenCodeAfterConfigChange) {
        try {
          await refreshOpenCodeAfterConfigChange("model-routes");
        } catch {
          // The file is written; a restart can pick it up later.
        }
      }
      res.json({ routes, path: targetPath });
    } catch (error) {
      res.status(500).json({ error: error?.message ?? "Failed to save model pools" });
    }
  });
};
