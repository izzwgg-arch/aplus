/**
 * Unit tests for the A Plus permission resolution service.
 * Monkey-patches the Prisma singleton's `user.findUnique` (no real DB
 * needed) to exercise the pure resolution + short-lived cache logic in
 * isolation.
 */
import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import {
  getUserPermissions,
  getUserRoleKey,
  can,
  canAny,
  invalidateUserCache,
  invalidateAllCache,
} from "./permissionsService.js";

function makeUser({ roleKey = "BCBA", roleActive = true, keys = [] } = {}) {
  return {
    role: "BCBA",
    customRole: {
      key: roleKey,
      isActive: roleActive,
      permissions: keys.map((key) => ({ permission: { key } })),
    },
  };
}

describe("permissionsService", () => {
  let originalFindUnique;
  let findUniqueMock;

  beforeEach(() => {
    invalidateAllCache();
    originalFindUnique = prisma.user.findUnique;
    findUniqueMock = mock.fn(async () => null);
    prisma.user.findUnique = findUniqueMock;
  });

  afterEach(() => {
    prisma.user.findUnique = originalFindUnique;
    invalidateAllCache();
  });

  test("resolves the permission set from the user's custom role", async () => {
    findUniqueMock.mock.mockImplementation(async () =>
      makeUser({ keys: ["aplus.clients.view", "aplus.clients.edit"] })
    );

    const keys = await getUserPermissions("user-1");
    assert.equal(keys.size, 2);
    assert.ok(keys.has("aplus.clients.view"));
    assert.ok(keys.has("aplus.clients.edit"));
    assert.equal(findUniqueMock.mock.callCount(), 1);
  });

  test("fails closed (empty set) when the user has no role assigned", async () => {
    findUniqueMock.mock.mockImplementation(async () => ({ role: "STAFF", customRole: null }));

    const keys = await getUserPermissions("user-2");
    assert.equal(keys.size, 0);
  });

  test("fails closed when the assigned role has been deactivated", async () => {
    findUniqueMock.mock.mockImplementation(async () =>
      makeUser({ roleActive: false, keys: ["aplus.clients.view"] })
    );

    const keys = await getUserPermissions("user-3");
    assert.equal(keys.size, 0);
  });

  test("fails closed when the user does not exist", async () => {
    findUniqueMock.mock.mockImplementation(async () => null);

    const keys = await getUserPermissions("missing-user");
    assert.equal(keys.size, 0);
    assert.equal(await getUserRoleKey("missing-user"), null);
  });

  test("returns an empty set (never throws) for a nullish userId", async () => {
    const keys = await getUserPermissions(undefined);
    assert.equal(keys.size, 0);
    assert.equal(findUniqueMock.mock.callCount(), 0);
  });

  test("caches the resolved permission set across repeated calls", async () => {
    findUniqueMock.mock.mockImplementation(async () =>
      makeUser({ keys: ["aplus.appointments.view"] })
    );

    await getUserPermissions("user-4");
    await getUserPermissions("user-4");
    await getUserPermissions("user-4");

    assert.equal(findUniqueMock.mock.callCount(), 1, "DB should only be hit once while cache is warm");
  });

  test("invalidateUserCache forces a fresh DB read for that user only", async () => {
    findUniqueMock.mock.mockImplementation(async () => makeUser({ keys: ["aplus.billing.view"] }));

    await getUserPermissions("user-5");
    await getUserPermissions("user-6");
    assert.equal(findUniqueMock.mock.callCount(), 2);

    invalidateUserCache("user-5");
    await getUserPermissions("user-5"); // re-fetched
    await getUserPermissions("user-6"); // still cached
    assert.equal(findUniqueMock.mock.callCount(), 3);
  });

  test("invalidateAllCache forces every cached user to be re-resolved", async () => {
    findUniqueMock.mock.mockImplementation(async () => makeUser({ keys: ["aplus.reports.view"] }));

    await getUserPermissions("user-7");
    await getUserPermissions("user-8");
    assert.equal(findUniqueMock.mock.callCount(), 2);

    invalidateAllCache();
    await getUserPermissions("user-7");
    await getUserPermissions("user-8");
    assert.equal(findUniqueMock.mock.callCount(), 4);
  });

  test("can() reflects membership in the resolved permission set", async () => {
    findUniqueMock.mock.mockImplementation(async () =>
      makeUser({ keys: ["aplus.clients.view"] })
    );

    assert.equal(await can("user-9", "aplus.clients.view"), true);
    assert.equal(await can("user-9", "aplus.clients.delete"), false);
  });

  test("canAny() is true if at least one requested key is granted", async () => {
    findUniqueMock.mock.mockImplementation(async () =>
      makeUser({ keys: ["aplus.invoices.view"] })
    );

    assert.equal(await canAny("user-10", ["aplus.invoices.edit", "aplus.invoices.view"]), true);
    assert.equal(await canAny("user-10", ["aplus.invoices.edit", "aplus.invoices.delete"]), false);
  });

  test("getUserRoleKey returns the resolved role's key", async () => {
    findUniqueMock.mock.mockImplementation(async () => makeUser({ roleKey: "OFFICE_ADMIN", keys: [] }));

    assert.equal(await getUserRoleKey("user-11"), "OFFICE_ADMIN");
  });
});
