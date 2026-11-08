import type { ErrorCode, RoomSettings } from '@studyroom/shared';

const BASE: string = import.meta.env.VITE_SERVER_URL ?? '';

export class ApiError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: string };
    return new ApiError((body.error ?? 'INTERNAL') as ErrorCode);
  } catch {
    return new ApiError('INTERNAL');
  }
}

export interface CreateRoomInput {
  name: string;
  password?: string;
  clientId: string;
  settings?: Partial<RoomSettings>;
}

export async function createRoom(input: CreateRoomInput): Promise<{ code: string }> {
  const res = await fetch(`${BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { code: string };
}

export interface RoomMeta {
  exists: boolean;
  name?: string;
  hasPassword?: boolean;
  memberCount?: number;
}

export async function getRoomMeta(code: string): Promise<RoomMeta> {
  const res = await fetch(`${BASE}/api/rooms/${encodeURIComponent(code)}/meta`);
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as RoomMeta;
}
