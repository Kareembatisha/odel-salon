import { TestBed } from "@angular/core/testing";
import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_PERMISSIONS } from "@core/auth/permissions";
import {
  MOCK_MANAGER_PERMISSIONS,
  MOCK_RECEPTIONIST_PERMISSIONS,
  MockDb,
} from "@core/mock/mock-db";
import { AuthMockRepository } from "./auth-mock.repository";

describe("AuthMockRepository demo identities", () => {
  let repo: AuthMockRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    repo = TestBed.inject(AuthMockRepository);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem("odl_user");
  });

  async function signIn(email: string) {
    const result = firstValueFrom(repo.login({ email, password: "123456" }));
    await vi.advanceTimersByTimeAsync(1000);
    return (await result).data!;
  }

  it("signs admin@ in as the SuperAdmin with everything", async () => {
    const data = await signIn("admin@odel.com");

    expect(data.role).toBe("SuperAdmin");
    expect(data.permissions).toEqual(ALL_PERMISSIONS);
    expect(data.user.fullName).toBe("Omar Khaled");
  });

  it("signs manager@ in as the BranchManager, who can review payments and end sessions", async () => {
    const data = await signIn("manager@odel.com");

    expect(data.role).toBe("BranchManager");
    expect(data.permissions).toEqual(MOCK_MANAGER_PERMISSIONS);
    expect(data.permissions).toEqual(
      expect.arrayContaining(["Booking.View", "Booking.Review", "Booking.Manage"]),
    );
    expect(data.user.fullName).toBe("Layla Hassan");
  });

  it("signs receptionist@ in as a view-only user: sees bookings, can't review or end sessions", async () => {
    const data = await signIn("receptionist@odel.com");

    expect(data.role).toBe("Receptionist");
    expect(data.permissions).toEqual(MOCK_RECEPTIONIST_PERMISSIONS);
    expect(data.permissions).toContain("Booking.View");
    expect(data.permissions).not.toContain("Booking.Review");
    expect(data.permissions).not.toContain("Booking.Manage");
    expect(data.user.fullName).toBe("Nour Elsayed");
  });

  it("matches the identity by prefix, ignoring case", async () => {
    expect((await signIn("Receptionist.Front@odel.com")).role).toBe("Receptionist");
    expect((await signIn("MANAGER2@odel.com")).role).toBe("BranchManager");
  });

  it("keeps the receptionist the same as the seeded Receptionist role of the roles screen", () => {
    const role = TestBed.inject(MockDb).roles.find((r) => r.name === "Receptionist");

    expect(role?.permissions).toEqual(MOCK_RECEPTIONIST_PERMISSIONS);
  });

  it("answers a token refresh with the persisted identity's permissions", async () => {
    localStorage.setItem("odl_user", JSON.stringify({ email: "receptionist@odel.com" }));
    const result = firstValueFrom(repo.refreshToken({ refreshToken: "x" }));
    await vi.advanceTimersByTimeAsync(1000);

    expect((await result).data!.role).toBe("Receptionist");
  });

  it("refuses a password shorter than 6 characters", async () => {
    const result = firstValueFrom(repo.login({ email: "admin@odel.com", password: "123" }));
    result.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).rejects.toMatchObject({ error: { statusCode: 422 } });
  });
});
