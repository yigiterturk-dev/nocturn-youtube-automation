import type { NextFunction, Request, Response } from "express";

const startedAt = Date.now();
let requests = 0;
let errors = 0;
let totalDurationMs = 0;
const statusCodes: Record<string, number> = {};

export function observeRequests(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  requests += 1;
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    totalDurationMs += durationMs;
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
    statusCodes[statusClass] = (statusCodes[statusClass] || 0) + 1;
    if (res.statusCode >= 500) errors += 1;
  });
  next();
}

export function operationalMetrics() {
  const memory = process.memoryUsage();
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    requests,
    errors,
    errorRate: requests ? Number((errors / requests).toFixed(4)) : 0,
    averageDurationMs: requests ? Math.round(totalDurationMs / requests) : 0,
    statusCodes,
    memory: {
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    },
  };
}
