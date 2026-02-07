export type ApiResponse<T> = {
  data: T;
};

export type ApiError = {
  error: string;
  code: string;
  detail?: Record<string, string[]> | string;
  requestId?: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  nextCursor: string | null;
  total?: number;
};
