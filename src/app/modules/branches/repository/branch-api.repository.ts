import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { ApiResponse } from '@shared/model/api_response.model';
import { BranchListItem, BranchesQuery } from '../model/branch.model';
import { buildBranchesParams } from '../utils/branch-query';
import { IBranchRepository } from './branch.repository';

@Injectable({ providedIn: 'root' })
export class BranchApiRepository implements IBranchRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/branches`;

  getBranches(query: BranchesQuery): Observable<ApiResponse<BranchListItem[]>> {
    return this.http.get<ApiResponse<BranchListItem[]>>(this.url, { params: buildBranchesParams(query) });
  }
}
