import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createRoomBodySchema, roomSettingsInputSchema, type ErrorCode } from '@studyroom/shared';
import type { AppConfig } from './config';
import { generateRoomCode } from './lib/ids';
import type { RoomStore } from './store/RoomStore';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
  ) {
    super(code);
  }
}

export interface AppDeps {
  config: Pick<AppConfig, 'corsOrigins' | 'TRUST_PROXY'>;
  store: RoomStore;
  /** Live member count from a loaded RoomRuntime, when available. */
  getMemberCount?: (code: string) => number | undefined;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.set('trust proxy', deps.config.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: deps.config.corsOrigins, credentials: false }));
  app.use(express.json({ limit: '10kb' }));

  const errorBody = { error: 'RATE_LIMITED' satisfies ErrorCode };
  const createRoomLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: errorBody,
  });
  const metaLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: errorBody,
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.post('/api/rooms', createRoomLimiter, async (req, res, next) => {
    try {
      const parsed = createRoomBodySchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'INVALID_INPUT');
      const { name, password, clientId, settings: settingsInput } = parsed.data;
      const settings = settingsInput ?? roomSettingsInputSchema.parse({});

      let code = '';
      let unique = false;
      for (let attempt = 0; attempt < 5 && !unique; attempt++) {
        code = generateRoomCode();
        unique = !(await deps.store.codeExists(code));
      }
      if (!unique) throw new HttpError(500, 'INTERNAL');

      const passwordHash = password ? await bcrypt.hash(password, 10) : null;
      await deps.store.createRoom({ code, name, passwordHash, hostClientId: clientId, settings });
      res.status(201).json({ code });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/rooms/:code/meta', metaLimiter, async (req, res, next) => {
    try {
      const code = String(req.params.code ?? '').trim().toUpperCase();
      const room = await deps.store.getByCode(code);
      if (!room) {
        res.json({ exists: false });
        return;
      }
      res.json({
        exists: true,
        name: room.name,
        hasPassword: room.passwordHash !== null,
        memberCount: deps.getMemberCount?.(code) ?? 0,
      });
    } catch (err) {
      next(err);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'INVALID_INPUT' satisfies ErrorCode });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- express identifies error handlers by arity
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code });
      return;
    }
    // express.json parse failures (malformed body, entity too large, ...)
    const status = (err as { status?: number }).status;
    const type = (err as { type?: string }).type;
    if (typeof status === 'number' && status >= 400 && status < 500 && type) {
      res.status(status).json({ error: 'INVALID_INPUT' });
      return;
    }
    console.error('[server] unhandled error:', err);
    res.status(500).json({ error: 'INTERNAL' });
  });

  return app;
}
