// Some backend validation frameworks return an array of messages per field
// instead of a single string (see error.interceptor.ts `handleValidationErrors`).
export type ApiErrors = Record<string, string | string[]>;

export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  additionalData?: Record<string, unknown> | null;
}

export interface ApiResponse<T> {
  status: boolean;
  statusCode: number;
  message: string;
  data: T | null;
  meta: PaginationMeta | null;
  errors: ApiErrors | null;
}
