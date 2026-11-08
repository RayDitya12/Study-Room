import type { Socket } from 'socket.io';
import type { ZodTypeAny, z } from 'zod';
import type { Ack, ClientToServerEvents, ErrorCode, ServerToClientEvents } from '@studyroom/shared';

export class AppError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
  }
}

export interface SocketData {
  code?: string;
  clientId?: string;
  userId?: string;
  roomId?: string;
}

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type AckFn<T> = (res: Ack<T>) => void;

/**
 * Builds a `handle(schema, fn)` wrapper bound to one socket: validates the
 * payload with Zod, converts thrown AppErrors into typed acks, and never
 * lets an exception escape.
 */
export function makeHandle(socket: AppSocket) {
  return function handle<S extends ZodTypeAny, TData>(
    schema: S,
    fn: (payload: z.output<S>, socket: AppSocket) => TData | Promise<TData>,
  ): (payload: unknown, ack?: AckFn<TData>) => void {
    return (payload, ack) => {
      const respond = (res: Ack<TData>) => {
        if (typeof ack === 'function') ack(res);
      };
      const parsed = schema.safeParse(payload ?? {});
      if (!parsed.success) {
        respond({ ok: false, error: 'INVALID_INPUT' });
        return;
      }
      void Promise.resolve()
        .then(() => fn(parsed.data, socket))
        .then((data) => respond({ ok: true, data }))
        .catch((err: unknown) => {
          if (err instanceof AppError) {
            respond({ ok: false, error: err.code });
          } else {
            console.error('[socket] handler error:', err);
            respond({ ok: false, error: 'INTERNAL' });
          }
        });
    };
  };
}
