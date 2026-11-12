import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { environment } from "@env/environment";
import { BarberApiRepository } from "./barber-api.repository";

const URL = `${environment.apiUrl}/barbers`;

describe("BarberApiRepository", () => {
  let repo: BarberApiRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    repo = TestBed.inject(BarberApiRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("GET /barbers with the query as params", () => {
    repo
      .getBarbers({ pageNumber: 1, pageSize: 20, branchId: 3, isActive: true, search: "karim" })
      .subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe("GET");
    expect(req.request.params.get("pageNumber")).toBe("1");
    expect(req.request.params.get("pageSize")).toBe("20");
    expect(req.request.params.get("branchId")).toBe("3");
    expect(req.request.params.get("isActive")).toBe("true");
    expect(req.request.params.get("search")).toBe("karim");
    req.flush({});
  });

  it('GET /barbers still sends isActive=false (a real filter, not "unset")', () => {
    repo.getBarbers({ pageNumber: 1, pageSize: 20, isActive: false }).subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get("isActive")).toBe("false");
    req.flush({});
  });

  it("GET /barbers/{id}", () => {
    repo.getBarberById(7).subscribe();

    const req = http.expectOne(`${URL}/7`);
    expect(req.request.method).toBe("GET");
    req.flush({});
  });

  it("POST /barbers sends multipart FormData, not JSON", () => {
    const image = new File(["x"], "karim.jpg", { type: "image/jpeg" });
    repo
      .createBarber({ branchId: 3, fullName: "Karim Mostafa", phone: "+201001234567", image })
      .subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toBeInstanceOf(FormData);
    const body = req.request.body as FormData;
    expect(body.get("BranchId")).toBe("3");
    expect(body.get("FullName")).toBe("Karim Mostafa");
    expect(body.get("Phone")).toBe("+201001234567");
    expect((body.get("Image") as File).name).toBe("karim.jpg");
    // The browser must add the multipart boundary itself.
    expect(req.request.headers.has("Content-Type")).toBe(false);
    req.flush({});
  });

  it("PUT /barbers/{id} sends multipart FormData with RemoveImage", () => {
    repo
      .updateBarber(7, {
        branchId: 5,
        fullName: "Karim Mostafa",
        phone: "+201001234567",
        removeImage: true,
      })
      .subscribe();

    const req = http.expectOne(`${URL}/7`);
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toBeInstanceOf(FormData);
    const body = req.request.body as FormData;
    expect(body.get("BranchId")).toBe("5");
    expect(body.get("RemoveImage")).toBe("true");
    expect(body.has("Image")).toBe(false);
    expect(req.request.headers.has("Content-Type")).toBe(false);
    req.flush({});
  });

  it("PATCH /barbers/{id}/toggle-status without a body", () => {
    repo.toggleBarberStatus(7).subscribe();

    const req = http.expectOne(`${URL}/7/toggle-status`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it("DELETE /barbers with { ids } in the body (bulk)", () => {
    repo.deleteBarbers({ ids: [7, 8] }).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("DELETE");
    expect(req.request.body).toEqual({ ids: [7, 8] });
    req.flush({});
  });

  it("GET /barbers/attendance with branchId (required) as the only param", () => {
    repo.getAttendance(3).subscribe();

    const req = http.expectOne((r) => r.url === `${URL}/attendance`);
    expect(req.request.method).toBe("GET");
    expect(req.request.params.get("branchId")).toBe("3");
    expect(req.request.params.keys()).toEqual(["branchId"]);
    req.flush({});
  });

  it("PUT /barbers/attendance with the barbers list as JSON", () => {
    const payload = {
      barbers: [
        { barberId: 7, isPresent: true },
        { barberId: 8, isPresent: false },
      ],
    };
    repo.setAttendance(payload).subscribe();

    const req = http.expectOne(`${URL}/attendance`);
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });
});
