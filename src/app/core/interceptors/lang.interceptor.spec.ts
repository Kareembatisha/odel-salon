import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { langInterceptor } from './lang.interceptor';

describe('langInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([langInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('defaults to English', () => {
    http.get('/api/x').subscribe();

    const req = backend.expectOne('/api/x');
    expect(req.request.headers.get('lang')).toBe('en');
    expect(req.request.headers.get('Accept-Language')).toBe('en');
    req.flush({});
  });

  it('sends Arabic on both headers, so the API localizes its messages too', () => {
    localStorage.setItem('odl_lang', 'ar');
    http.get('/api/x').subscribe();

    const req = backend.expectOne('/api/x');
    expect(req.request.headers.get('lang')).toBe('ar');
    expect(req.request.headers.get('Accept-Language')).toBe('ar');
    req.flush({});
  });
});
