import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { telegramManager, sanitizeFilename } from './server/telegramManager.ts';
import { TELEFIND_CONFIG } from './telefind.config.ts';
import type { FileFilterType } from './src/types/telegram.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || process.env.SERVER_PORT) || 3000;
const ALLOWED_CATEGORIES = new Set<FileFilterType>([
  'all',
  'document',
  'pdf',
  'photo',
  'video',
  'audio',
  'voice',
  'archive',
]);

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== 'string') return null;
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function requireWorkspaceSession(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Sesión no autorizada. Conecta tu cuenta primero.' });
    return;
  }
  const session = telegramManager.getSession(token);
  if (!session) {
    res.status(401).json({ error: 'Tu sesión de trabajo ha expirado. Vuelve a conectar.' });
    return;
  }
  (req as any).workspaceSession = session;
  next();
}

function parsePositiveInt(val: unknown): number | null {
  if (typeof val === 'number' && Number.isInteger(val) && val > 0) return val;
  if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
    const parsed = Number.parseInt(val.trim(), 10);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Health & environment readiness check (never exposes credentials)
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      hasEnvConfig: telegramManager.hasEnvConfig(),
    });
  });

  // Connect using server-side process.env credentials only if TELEFIND_WEB_PASSCODE matches (when configured)
  app.post('/api/auth/env-connect', async (req, res) => {
    try {
      const requiredPasscode = TELEFIND_CONFIG.webPasscode;
      if (!requiredPasscode) {
        res.status(403).json({
          error:
            'El acceso web con variables del servidor requiere definir TELEFIND_WEB_PASSCODE en .env. El bot en segundo plano sí arranca automáticamente.',
        });
        return;
      }
      const provided = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
      if (provided !== requiredPasscode) {
        res.status(401).json({ error: 'Código de acceso web incorrecto.' });
        return;
      }
      const result = await telegramManager.connectFromEnv();
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error conectando desde variables de entorno.';
      res.status(400).json({ error: message });
    }
  });

  // Connect directly using StringSession
  app.post('/api/auth/connect-session', async (req, res) => {
    try {
      const apiId = parsePositiveInt(req.body?.apiId);
      const apiHash = typeof req.body?.apiHash === 'string' ? req.body.apiHash.trim() : '';
      const sessionString = typeof req.body?.sessionString === 'string' ? req.body.sessionString.trim() : '';

      if (!apiId) {
        res.status(400).json({ error: 'API ID debe ser un número entero positivo.' });
        return;
      }
      if (!/^[a-fA-F0-9]{16,64}$/.test(apiHash)) {
        res.status(400).json({ error: 'API Hash no tiene un formato válido.' });
        return;
      }
      if (sessionString.length < 20) {
        res.status(400).json({ error: 'StringSession inválida o demasiado corta.' });
        return;
      }

      const result = await telegramManager.connectWithSessionString(apiId, apiHash, sessionString);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo conectar con la StringSession.';
      res.status(400).json({ error: message });
    }
  });

  // Start interactive phone + OTP authentication
  app.post('/api/auth/start-phone', async (req, res) => {
    try {
      const apiId = parsePositiveInt(req.body?.apiId);
      const apiHash = typeof req.body?.apiHash === 'string' ? req.body.apiHash.trim() : '';
      const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : '';

      if (!apiId) {
        res.status(400).json({ error: 'API ID debe ser un número entero positivo.' });
        return;
      }
      if (!/^[a-fA-F0-9]{16,64}$/.test(apiHash)) {
        res.status(400).json({ error: 'API Hash no tiene un formato válido.' });
        return;
      }
      if (!/^\+?\d{7,18}$/.test(phoneNumber.replace(/[\s-]/g, ''))) {
        res.status(400).json({ error: 'Ingresa un número de teléfono válido con código de país (ej: +34600112233).' });
        return;
      }

      const result = await telegramManager.startPhoneAuth(apiId, apiHash, phoneNumber.replace(/[\s-]/g, ''));
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo enviar el código a Telegram.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/auth/verify-code', requireWorkspaceSession, async (req, res) => {
    try {
      const session = (req as any).workspaceSession;
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      if (!/^\d{4,8}$/.test(code)) {
        res.status(400).json({ error: 'El código de verificación debe tener entre 4 y 8 dígitos.' });
        return;
      }
      const result = await telegramManager.submitPhoneCode(session, code);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error verificando código.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/auth/verify-password', requireWorkspaceSession, async (req, res) => {
    try {
      const session = (req as any).workspaceSession;
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!password) {
        res.status(400).json({ error: 'Ingresa tu contraseña de verificación en dos pasos.' });
        return;
      }
      const result = await telegramManager.submitPassword(session, password);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Contraseña 2FA incorrecta.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/auth/export-session', requireWorkspaceSession, (req, res) => {
    try {
      const session = (req as any).workspaceSession;
      const sessionString = telegramManager.exportSessionString(session);
      res.json({ sessionString });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo exportar la sesión.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/auth/logout', requireWorkspaceSession, async (req, res) => {
    const session = (req as any).workspaceSession;
    await telegramManager.destroySession(session.token);
    res.json({ ok: true });
  });

  app.get('/api/status', requireWorkspaceSession, (req, res) => {
    const session = (req as any).workspaceSession;
    res.json(telegramManager.getStatus(session));
  });

  app.get('/api/telegram/dialogs', requireWorkspaceSession, async (req, res) => {
    try {
      const session = (req as any).workspaceSession;
      if (session.authStep !== 'connected') {
        res.status(400).json({ error: 'Cuenta no conectada.' });
        return;
      }
      const dialogs = await telegramManager.getDialogs(session);
      res.json({ dialogs });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error obteniendo chats.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/telegram/search', requireWorkspaceSession, async (req, res) => {
    try {
      const session = (req as any).workspaceSession;
      if (session.authStep !== 'connected') {
        res.status(400).json({ error: 'Cuenta no conectada.' });
        return;
      }
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      const rawCat = typeof req.query.category === 'string' ? req.query.category : 'all';
      const category: FileFilterType = ALLOWED_CATEGORIES.has(rawCat as FileFilterType)
        ? (rawCat as FileFilterType)
        : 'all';
      const chatId = typeof req.query.chatId === 'string' ? req.query.chatId.trim() : 'all';
      const limit = parsePositiveInt(req.query.limit) || 40;
      const offsetId = parsePositiveInt(req.query.offsetId) || 0;

      const results = await telegramManager.searchFiles(session, {
        query,
        category,
        chatId,
        limit,
        offsetId,
      });
      res.json(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error buscando archivos en Telegram.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/telegram/download', requireWorkspaceSession, async (req, res) => {
    try {
      const session = (req as any).workspaceSession;
      if (session.authStep !== 'connected') {
        res.status(400).json({ error: 'Cuenta no conectada.' });
        return;
      }
      const chatId = typeof req.query.chatId === 'string' ? req.query.chatId.trim() : '';
      const messageId = parsePositiveInt(req.query.messageId);
      if (!chatId || !/^-?\d+$/.test(chatId) || !messageId) {
        res.status(400).json({ error: 'Parámetros chatId y messageId inválidos.' });
        return;
      }

      const { buffer, fileName, mimeType } = await telegramManager.downloadFileBuffer(session, chatId, messageId);
      const safeName = sanitizeFilename(fileName);

      res.setHeader('Content-Type', mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error descargando el archivo.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/telegram/forward-saved', requireWorkspaceSession, async (req, res) => {
    try {
      const session = (req as any).workspaceSession;
      if (session.authStep !== 'connected') {
        res.status(400).json({ error: 'Cuenta no conectada.' });
        return;
      }
      const chatId = typeof req.body?.chatId === 'string' ? req.body.chatId.trim() : '';
      const messageId = parsePositiveInt(req.body?.messageId);
      if (!chatId || !/^-?\d+$/.test(chatId) || !messageId) {
        res.status(400).json({ error: 'Parámetros chatId y messageId inválidos.' });
        return;
      }

      await telegramManager.forwardToSavedMessages(session, chatId, messageId);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error reenviando archivo a Mensajes Guardados.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/bot/start', requireWorkspaceSession, async (req, res) => {
    try {
      const session = (req as any).workspaceSession;
      const botToken = typeof req.body?.botToken === 'string' ? req.body.botToken : '';
      const status = await telegramManager.startBot(session, botToken);
      res.json(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo iniciar el bot.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/bot/stop', requireWorkspaceSession, (req, res) => {
    const session = (req as any).workspaceSession;
    const status = telegramManager.stopBot(session);
    res.json(status);
  });

  app.post('/api/bot/saved-listener', requireWorkspaceSession, (req, res) => {
    try {
      const session = (req as any).workspaceSession;
      const enable = Boolean(req.body?.enable);
      const status = telegramManager.toggleSavedListener(session, enable);
      res.json(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cambiar el estado del escuchador.';
      res.status(400).json({ error: message });
    }
  });

  // Frontend serving (Vite middleware in dev, dist/ static in production)
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'dist'));
  if (isProd) {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TeleFind server listening on http://0.0.0.0:${PORT}`);
    void telegramManager.autoBootFromEnv();
  });
}

startServer().catch((err) => {
  console.error('Failed to start TeleFind server:', err);
  process.exit(1);
});
