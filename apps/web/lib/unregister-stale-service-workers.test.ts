import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  unregisterStaleServiceWorkers,
  UNREGISTER_STALE_SERVICE_WORKERS_SCRIPT,
} from "./unregister-stale-service-workers";

describe("unregisterStaleServiceWorkers", () => {
  const getRegistrations = vi.fn();
  const unregister = vi.fn();

  beforeEach(() => {
    unregister.mockResolvedValue(true);
    getRegistrations.mockResolvedValue([{ unregister }]);
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistrations },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("unregisters all service worker registrations", async () => {
    const removed = await unregisterStaleServiceWorkers();
    expect(getRegistrations).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledOnce();
    expect(removed).toBe(1);
  });

  it("returns 0 when service workers are unavailable", async () => {
    vi.stubGlobal("navigator", {});
    expect(await unregisterStaleServiceWorkers()).toBe(0);
  });
});

describe("UNREGISTER_STALE_SERVICE_WORKERS_SCRIPT", () => {
  it("references getRegistrations and unregister", () => {
    expect(UNREGISTER_STALE_SERVICE_WORKERS_SCRIPT).toContain("getRegistrations");
    expect(UNREGISTER_STALE_SERVICE_WORKERS_SCRIPT).toContain("unregister");
  });
});
