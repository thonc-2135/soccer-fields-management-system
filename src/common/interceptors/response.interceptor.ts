import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const isPaginated = (v: unknown): v is PaginatedResult<unknown> =>
  typeof v === 'object' && v !== null && 'data' in v && 'meta' in v;

/** Wraps every successful response as `{ success: true, data, message? , meta? }`. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((result: unknown) => {
        if (result === undefined) return { success: true };
        if (isPaginated(result)) return { success: true, ...result };
        return { success: true, data: result };
      }),
    );
  }
}
