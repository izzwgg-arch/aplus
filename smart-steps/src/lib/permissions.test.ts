/**
 * Unit tests for the SmartSteps permission resolution + scoping logic.
 * Monkey-patches the Prisma singleton (no real DB needed) to exercise the
 * pure resolution, cache, and assigned/all scoping logic in isolation.
 */
import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import {
  getUserPermissions,
  getUserRoleKey,
  can,
  canAny,
  canForClient,
  accessibleClientIds,
  requirePermissionResponse,
  requireClientAccessResponse,
  invalidateUserCache,
  invalidateAllCache,
} from "@/lib/permissions";

function makeAppRoleUser({ roleKey = "BCBA", roleActive = true, keys = [] as string[] } = {}) {
  return {
    appRole: {
      key: roleKey,
      isActive: roleActive,
      permissions: keys.map((key) => ({ permission: { key } })),
    },
  };
}

describe("smartsteps permissions", () => {
  let originalFindUnique: typeof prisma.user.findUnique;
  let originalAssignmentFindUnique: typeof prisma.clientAssignment.findUnique;
  let originalAssignmentFindMany: typeof prisma.clientAssignment.findMany;
  let findUniqueMock: ReturnType<typeof mock.fn>;
  let assignmentFindUniqueMock: ReturnType<typeof mock.fn>;
  let assignmentFindManyMock: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    invalidateAllCache();
    originalFindUnique = prisma.user.findUnique;
    originalAssignmentFindUnique = prisma.clientAssignment.findUnique;
    originalAssignmentFindMany = prisma.clientAssignment.findMany;

    findUniqueMock = mock.fn(async () => null);
    assignmentFindUniqueMock = mock.fn(async () => null);
    assignmentFindManyMock = mock.fn(async () => []);
    // @ts-expect-error test monkey-patch of the Prisma delegate
    prisma.user.findUnique = findUniqueMock;
    // @ts-expect-error test monkey-patch of the Prisma delegate
    prisma.clientAssignment.findUnique = assignmentFindUniqueMock;
    // @ts-expect-error test monkey-patch of the Prisma delegate
    prisma.clientAssignment.findMany = assignmentFindManyMock;
  });

  afterEach(() => {
    prisma.user.findUnique = originalFindUnique;
    prisma.clientAssignment.findUnique = originalAssignmentFindUnique;
    prisma.clientAssignment.findMany = originalAssignmentFindMany;
    invalidateAllCache();
  });

  test("resolves the permission set from the user's app role", async () => {
    findUniqueMock.mock.mockImplementation(async () =>
      makeAppRoleUser({ keys: ["smartsteps.clients.view.assigned", "smartsteps.goals.view.assigned"] })
    );

    const keys = await getUserPermissions("user-1");
    assert.equal(keys.size, 2);
    assert.ok(keys.has("smartsteps.clients.view.assigned"));
  });

  test("fails closed when the user has no app role assigned", async () => {
    findUniqueMock.mock.mockImplementation(async () => ({ appRole: null }));
    const keys = await getUserPermissions("user-2");
    assert.equal(keys.size, 0);
  });

  test("fails closed when the app role is inactive", async () => {
    findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ roleActive: false, keys: ["smartsteps.clients.view.all"] }));
    const keys = await getUserPermissions("user-3");
    assert.equal(keys.size, 0);
  });

  test("caches the resolved set across repeated calls", async () => {
    findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: ["smartsteps.reports.view.all"] }));
    await getUserPermissions("user-4");
    await getUserPermissions("user-4");
    assert.equal(findUniqueMock.mock.callCount(), 1);
  });

  test("invalidateUserCache only busts the targeted user", async () => {
    findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: ["smartsteps.reports.view.all"] }));
    await getUserPermissions("user-5");
    await getUserPermissions("user-6");
    invalidateUserCache("user-5");
    await getUserPermissions("user-5");
    await getUserPermissions("user-6");
    assert.equal(findUniqueMock.mock.callCount(), 3);
  });

  test("can()/canAny() reflect the resolved set", async () => {
    findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: ["smartsteps.staff.view"] }));
    assert.equal(await can("user-7", "smartsteps.staff.view"), true);
    assert.equal(await can("user-7", "smartsteps.staff.manage_roles"), false);
    assert.equal(await canAny("user-7", ["smartsteps.staff.manage_roles", "smartsteps.staff.view"]), true);
  });

  test("getUserRoleKey returns the resolved app role key", async () => {
    findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ roleKey: "SUPERVISOR" }));
    assert.equal(await getUserRoleKey("user-8"), "SUPERVISOR");
  });

  describe("canForClient (assigned vs all scoping)", () => {
    test("grants access unconditionally when the user holds the `.all` variant", async () => {
      findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: ["smartsteps.clients.view.all"] }));
      const allowed = await canForClient("user-9", "client-1", "smartsteps.clients.view");
      assert.equal(allowed, true);
      assert.equal(assignmentFindUniqueMock.mock.callCount(), 0, "should not need to check ClientAssignment for .all holders");
    });

    test("requires a ClientAssignment row when the user only holds `.assigned`", async () => {
      findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: ["smartsteps.clients.view.assigned"] }));
      assignmentFindUniqueMock.mock.mockImplementation(async () => ({ id: "assignment-1" }));

      const allowed = await canForClient("user-10", "client-2", "smartsteps.clients.view");
      assert.equal(allowed, true);
      assert.equal(assignmentFindUniqueMock.mock.callCount(), 1);
    });

    test("denies access when `.assigned` is held but no ClientAssignment exists for that client", async () => {
      findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: ["smartsteps.clients.view.assigned"] }));
      assignmentFindUniqueMock.mock.mockImplementation(async () => null);

      const allowed = await canForClient("user-11", "client-3", "smartsteps.clients.view");
      assert.equal(allowed, false);
    });

    test("denies access when neither `.assigned` nor `.all` is held", async () => {
      findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: [] }));
      const allowed = await canForClient("user-12", "client-4", "smartsteps.clients.view");
      assert.equal(allowed, false);
      assert.equal(assignmentFindUniqueMock.mock.callCount(), 0, "should short-circuit before hitting the DB");
    });
  });

  describe("accessibleClientIds", () => {
    test("returns 'ALL' for `.all` holders without querying assignments", async () => {
      findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: ["smartsteps.clients.view.all"] }));
      const result = await accessibleClientIds("user-13", "smartsteps.clients.view");
      assert.equal(result, "ALL");
      assert.equal(assignmentFindManyMock.mock.callCount(), 0);
    });

    test("returns the assigned client id list for `.assigned` holders", async () => {
      findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: ["smartsteps.clients.view.assigned"] }));
      assignmentFindManyMock.mock.mockImplementation(async () => [{ clientId: "client-5" }, { clientId: "client-6" }]);

      const result = await accessibleClientIds("user-14", "smartsteps.clients.view");
      assert.deepEqual(result, ["client-5", "client-6"]);
    });

    test("returns an empty array when the user holds neither scope", async () => {
      findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: [] }));
      const result = await accessibleClientIds("user-15", "smartsteps.clients.view");
      assert.deepEqual(result, []);
    });
  });

  describe("route guard responses", () => {
    test("requirePermissionResponse returns null (proceed) when allowed", async () => {
      findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: ["smartsteps.staff.view"] }));
      const denied = await requirePermissionResponse("user-16", "smartsteps.staff.view");
      assert.equal(denied, null);
    });

    test("requirePermissionResponse returns a 403 NextResponse when denied", async () => {
      findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: [] }));
      const denied = await requirePermissionResponse("user-17", "smartsteps.staff.view");
      assert.notEqual(denied, null);
      assert.equal(denied?.status, 403);
    });

    test("requireClientAccessResponse returns a 403 when the client isn't assigned", async () => {
      findUniqueMock.mock.mockImplementation(async () => makeAppRoleUser({ keys: ["smartsteps.clients.view.assigned"] }));
      assignmentFindUniqueMock.mock.mockImplementation(async () => null);

      const denied = await requireClientAccessResponse("user-18", "client-7", "smartsteps.clients.view");
      assert.notEqual(denied, null);
      assert.equal(denied?.status, 403);
    });
  });
});
