import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '@env/environment';
import { OfferStatus } from '../model/offer.model';
import { OfferApiRepository } from './offer-api.repository';

const URL = `${environment.apiUrl}/offers`;
const fields = {
  nameAr: 'ع', nameEn: 'Offer', serviceIds: [1, 2], regularPrice: 100, vipPrice: 150, homePrice: null,
  startDate: '2026-11-07', endDate: null, maxBookings: null,
};

describe('OfferApiRepository', () => {
  let repo: OfferApiRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    repo = TestBed.inject(OfferApiRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET /offers with the query as params, statuses repeated', () => {
    repo.getOffers({ branchId: 3, pageNumber: 1, pageSize: 12, search: 'weekend', statuses: [OfferStatus.Ended, OfferStatus.Stopped] }).subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('branchId')).toBe('3');
    expect(req.request.params.get('search')).toBe('weekend');
    expect(req.request.params.getAll('statuses')).toEqual(['2', '4']);
    req.flush({});
  });

  it('GET /offers/{id}', () => {
    repo.getOfferById(7).subscribe();
    const req = http.expectOne(`${URL}/7`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('POST /offers sends multipart with the branch and the banner', () => {
    const image = new File(['x'], 'banner.png', { type: 'image/png' });
    repo.createOffer({ branchId: 3, ...fields, image }).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    const body = req.request.body as FormData;
    expect(body.get('BranchId')).toBe('3');
    expect(body.getAll('ServiceIds')).toEqual(['1', '2']);
    expect((body.get('Image') as File).name).toBe('banner.png');
    expect(req.request.headers.has('Content-Type')).toBe(false); // the browser adds the multipart boundary
    req.flush({});
  });

  it('PUT /offers/{id} sends multipart without a branch, with RemoveImage', () => {
    repo.updateOffer(7, { ...fields, removeImage: true }).subscribe();

    const req = http.expectOne(`${URL}/7`);
    expect(req.request.method).toBe('PUT');
    const body = req.request.body as FormData;
    expect(body.has('BranchId')).toBe(false);
    expect(body.get('RemoveImage')).toBe('true');
    req.flush({});
  });

  it('PATCH /offers/{id}/toggle-status has no body', () => {
    repo.toggleOfferStatus(3).subscribe();
    const req = http.expectOne(`${URL}/3/toggle-status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it('DELETE /offers sends { ids } as the body', () => {
    repo.deleteOffers({ ids: [7, 8] }).subscribe();
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ ids: [7, 8] });
    req.flush({});
  });
});
