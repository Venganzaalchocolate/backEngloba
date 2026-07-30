const MEMORY_DEBUG =
  String(process.env.MEMORY_DEBUG || "").toLowerCase() === "true";

const MB = 1024 * 1024;

const toMb = (bytes = 0) =>
  Math.round((Number(bytes || 0) / MB) * 10) / 10;

const getMemorySnapshot = () => {
  const memory = process.memoryUsage();

  return {
    rssMb: toMb(memory.rss),
    heapUsedMb: toMb(memory.heapUsed),
    heapTotalMb: toMb(memory.heapTotal),
    externalMb: toMb(memory.external),
    arrayBuffersMb: toMb(memory.arrayBuffers),
    uptimeMinutes:
      Math.round((process.uptime() / 60) * 10) / 10,
  };
};

const getActiveResourcesSummary = () => {
  if (
    typeof process.getActiveResourcesInfo !== "function"
  ) {
    return {};
  }

  return process
    .getActiveResourcesInfo()
    .reduce((summary, resourceName) => {
      summary[resourceName] =
        (summary[resourceName] || 0) + 1;

      return summary;
    }, {});
};

const logMemoryUsage = (label, extra = {}) => {
  if (!MEMORY_DEBUG) return null;

  const snapshot = getMemorySnapshot();

  console.log(`[MEMORY] ${label}`, {
    ...snapshot,
    activeResources:
      getActiveResourcesSummary(),
    ...extra,
  });

  return snapshot;
};

const logMemoryDifference = (
  label,
  before,
  extra = {}
) => {
  if (!MEMORY_DEBUG || !before) return null;

  const after = getMemorySnapshot();

  console.log(`[MEMORY] ${label}`, {
    ...after,

    deltaRssMb:
      Math.round(
        (after.rssMb - before.rssMb) * 10
      ) / 10,

    deltaHeapUsedMb:
      Math.round(
        (after.heapUsedMb -
          before.heapUsedMb) *
          10
      ) / 10,

    deltaExternalMb:
      Math.round(
        (after.externalMb -
          before.externalMb) *
          10
      ) / 10,

    deltaArrayBuffersMb:
      Math.round(
        (after.arrayBuffersMb -
          before.arrayBuffersMb) *
          10
      ) / 10,

    activeResources:
      getActiveResourcesSummary(),

    ...extra,
  });

  return after;
};

const measureMemory = async (
  label,
  task,
  extra = {}
) => {
  const before = logMemoryUsage(
    `${label} | INICIO`,
    extra
  );

  try {
    return await task();
  } finally {
    logMemoryDifference(
      `${label} | FINAL`,
      before,
      extra
    );
  }
};

const startMemoryMonitor = () => {
  if (!MEMORY_DEBUG) return null;

  const intervalMs = Math.max(
    Number(
      process.env.MEMORY_MONITOR_INTERVAL_MS
    ) || 5 * 60 * 1000,
    60 * 1000
  );

  logMemoryUsage("Monitor iniciado");

  const timer = setInterval(() => {
    logMemoryUsage("Estado global");
  }, intervalMs);

  /*
   * El monitor no impide que Node termine
   * normalmente cuando se cierre el servidor.
   */
  timer.unref();

  return timer;
};

const memoryRequestMiddleware = (
  req,
  res,
  next
) => {
  if (!MEMORY_DEBUG) return next();

  const before = getMemorySnapshot();
  const startedAt = Date.now();

  let registered = false;

  const registerResult = () => {
    if (registered) return;

    registered = true;

    const after = getMemorySnapshot();
    const durationMs =
      Date.now() - startedAt;

    const deltaHeapUsedMb =
      Math.round(
        (after.heapUsedMb -
          before.heapUsedMb) *
          10
      ) / 10;

    const deltaExternalMb =
      Math.round(
        (after.externalMb -
          before.externalMb) *
          10
      ) / 10;

    const deltaRssMb =
      Math.round(
        (after.rssMb - before.rssMb) * 10
      ) / 10;

    /*
     * Solo registra peticiones lentas
     * o con aumentos relevantes.
     */
    if (
      durationMs < 3000 &&
      deltaHeapUsedMb < 5 &&
      deltaExternalMb < 5 &&
      deltaRssMb < 10
    ) {
      return;
    }

    console.log("[MEMORY][HTTP]", {
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs,
      deltaHeapUsedMb,
      deltaExternalMb,
      deltaRssMb,
      ...after,
    });
  };

  res.once("finish", registerResult);
  res.once("close", registerResult);

  next();
};

module.exports = {
  logMemoryUsage,
  logMemoryDifference,
  measureMemory,
  startMemoryMonitor,
  memoryRequestMiddleware,
};