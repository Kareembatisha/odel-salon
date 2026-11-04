import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '@env/environment';
import { ChairType, CreateChairPayload, UpdateChairPayload } from '../model/chair.model';
import { ChairApiRepository } from './chair-api.repository';

const URL = `${environment.apiUrl}/chairs`;

describe('ChairApiRepository', () => {
  let repo: ChairApiRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    repo = TestBed.inject(ChairApiRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET /chairs with the query as params', () => {
    repo.getChairs({ pageNumber: 1, pageSize: 20, branchId: 3, type: ChairType.Vip, isActive: true, search: 'V' }).subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('pageNumber')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('20');
    expect(req.request.params.get('branchId')).toBe('3');
    expect(req.request.params.get('type')).toBe('1');
    expect(req.request.params.get('isActive')).toBe('true');
    expect(req.request.params.get('search')).toBe('V');
    req.flush({});
  });

  it('GET /chairs still sends type=0 and isActive=false (real filters, not "unset")', () => {
    repo.getChairs({ pageNumber: 1, pageSize: 20, type: ChairType.Regular, isActive: false }).subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get('type')).toBe('0');
    expect(req.request.params.get('isActive')).toBe('false');
    req.flush({});
  });

  it('GET /chairs/{id}', () => {
    repo.getChairById(12).subscribe();

    const req = http.expectOne(`${URL}/12`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('POST /chairs with the payload', () => {
    const payload: CreateChairPayload = { branchId: 3, name: 'R4', type: ChairType.Regular };
    repo.createChair(payload).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it('PUT /chairs/{id} with name and type only', () => {
    const payload: UpdateChairPayload = { name: 'R4', type: ChairType.Vip };
    repo.updateChair(14, payload).subscribe();

    const req = http.expectOne(`${URL}/14`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'R4', type: 1 });
    expect(Object.keys(req.request.body)).not.toContain('branchId');
    req.flush({});
  });

  it('PATCH /chairs/{id}/toggle-status without a body', () => {
    repo.toggleChairStatus(14).subscribe();

    const req = http.expectOne(`${URL}/14/toggle-status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it('DELETE /chairs with { ids } in the body (bulk)', () => {
    repo.deleteChairs({ ids: [14, 15] }).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ ids: [14, 15] });
    req.flush({});
  });
});
