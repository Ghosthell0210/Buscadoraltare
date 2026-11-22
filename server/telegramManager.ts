import crypto from 'node:crypto';
import path from 'node:path';
import { Api, TelegramClient, sessions } from 'telegram';
import { NewMessage, type NewMessageEvent } from 'telegram/events/index.js';
import type {
  BotActivityEntry,
  FileFilterType,
  SearchFilesResponse,
  TelegramAccountProfile,
  TelegramDialogSummary,
  TelegramFileItem,
  WorkspaceStatusResponse,
} from '../src/types/telegram.ts';
import { TELEFIND_CONFIG } from '../telefind.config.ts';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface WorkspaceSession {
  token: string;
  apiId: number;
  apiHash: string;
  client: TelegramClient;
  authStep: 'idle' | 'awaiting_code' | 'awaiting_password' | 'connected';
  account?: TelegramAccountProfile;
  codeDeferred?: Deferred<string>;
  passwordDeferred?: Deferred<string>;
  authNotifyDeferred?: Deferred<'awaiting_code' | 'awaiting_password' | 'connected' | 'error'>;
  lastAuthError?: string;
  peerCache: Map<string, Api.TypeInputPeer>;
  botToken?: string;
  botUsername?: string;
  botActive: boolean;
  botError?: string;
  botAbortController?: AbortController;
  botUpdateOffset: number;
  savedListenerActive: boolean;
  savedEventHandler?: (event: NewMessageEvent) => void;
  activityLog: BotActivityEntry[];
  createdAt: number;
  lastActiveAt: number;
}

const MAX_LOG_ENTRIES = 60;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours idle cleanup

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sanitizeFilename(name: string): string {
  const base = path.basename(name || 'archivo').replace(/[\r\n"\\/\0<>:|?*]/g, '_').trim();
  return base.slice(0, 180) || 'archivo';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val >= 10 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}

function classifyFile(
  msg: Api.Message,
  fileName: string,
  mimeType: string,
  ext: string,
): Exclude<FileFilterType, 'all'> {
  const lowerMime = mimeType.toLowerCase();
  const lowerExt = ext.toLowerCase();

  if (lowerMime === 'application/pdf' || lowerExt === 'pdf') {
    return 'pdf';
  }
  if (
    lowerExt === 'zip' ||
    lowerExt === 'rar' ||
    lowerExt === '7z' ||
    lowerExt === 'tar' ||
    lowerExt === 'gz' ||
    lowerMime.includes('zip') ||
    lowerMime.includes('rar') ||
    lowerMime.includes('7z') ||
    lowerMime.includes('compressed')
  ) {
    return 'archive';
  }
  if (msg.voice || lowerMime === 'audio/ogg' && fileName.startsWith('voice')) {
    return 'voice';
  }
  if (msg.video || lowerMime.startsWith('video/')) {
    return 'video';
  }
  if (msg.audio || lowerMime.startsWith('audio/')) {
    return 'audio';
  }
  if (msg.photo || lowerMime.startsWith('image/')) {
    return 'photo';
  }
  return 'document';
}

function extractExtension(fileName: string, mimeType: string): string {
  const dotIdx = fileName.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < fileName.length - 1) {
    const ext = fileName.slice(dotIdx + 1).toLowerCase();
    if (/^[a-z0-9]{1,10}$/.test(ext)) {
      return ext;
    }
  }
  const mimeMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'application/zip': 'zip',
  };
  return mimeMap[mimeType.toLowerCase()] || 'bin';
}

function resolveChatMeta(
  msg: Api.Message,
  meId: string,
): {
  chatId: string;
  chatTitle: string;
  chatType: 'saved' | 'private' | 'group' | 'channel';
  chatUsername?: string;
} {
  const rawChatId = msg.chatId ? msg.chatId.toString() : meId;
  if (rawChatId === meId) {
    return { chatId: meId, chatTitle: 'Mensajes Guardados', chatType: 'saved' };
  }

  const chat = msg.chat;
  if (chat instanceof Api.User) {
    const fullName = [chat.firstName, chat.lastName].filter(Boolean).join(' ').trim();
    return {
      chatId: rawChatId,
      chatTitle: fullName || (chat.username ? `@${chat.username}` : `Usuario ${rawChatId}`),
      chatType: 'private',
      chatUsername: chat.username || undefined,
    };
  }
  if (chat instanceof Api.Channel) {
    return {
      chatId: rawChatId,
      chatTitle: chat.title || `Canal ${rawChatId}`,
      chatType: chat.megagroup ? 'group' : 'channel',
      chatUsername: chat.username || undefined,
    };
  }
  if (chat instanceof Api.Chat) {
    return {
      chatId: rawChatId,
      chatTitle: chat.title || `Grupo ${rawChatId}`,
      chatType: 'group',
    };
  }

  return {
    chatId: rawChatId,
    chatTitle: `Chat ${rawChatId}`,
    chatType: msg.isChannel ? 'channel' : msg.isGroup ? 'group' : 'private',
  };
}

function buildTelegramLink(
  chatType: 'saved' | 'private' | 'group' | 'channel',
  chatId: string,
  messageId: number,
  chatUsername?: string,
): string | undefined {
  if (chatUsername) {
    return `https://t.me/${chatUsername}/${messageId}`;
  }
  if ((chatType === 'channel' || chatType === 'group') && chatId.startsWith('-100')) {
    return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
  }
  return undefined;
}

class TelegramManager {
  private sessionsMap = new Map<string, WorkspaceSession>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [token, session] of this.sessionsMap.entries()) {
        if (now - session.lastActiveAt > SESSION_TTL_MS) {
          this.destroySession(token).catch(() => {});
        }
      }
    }, 1000 * 60 * 15);
    this.cleanupInterval.unref();
  }

  public hasEnvConfig(): boolean {
    const apiId = TELEFIND_CONFIG.apiId;
    const apiHash = TELEFIND_CONFIG.apiHash.trim();
    const session = TELEFIND_CONFIG.sessionString.trim();
    return Boolean(Number.isInteger(apiId) && apiId > 0 && apiHash && session);
  }

  public getSession(token: string): WorkspaceSession | undefined {
    const s = this.sessionsMap.get(token);
    if (s) {
      s.lastActiveAt = Date.now();
    }
    return s;
  }

  private pushLog(session: WorkspaceSession, entry: Omit<BotActivityEntry, 'id' | 'timestampIso'>) {
    session.activityLog.unshift({
      id: crypto.randomUUID(),
      timestampIso: new Date().toISOString(),
      ...entry,
    });
    if (session.activityLog.length > MAX_LOG_ENTRIES) {
      session.activityLog.length = MAX_LOG_ENTRIES;
    }
  }

  public getStatus(session: WorkspaceSession): WorkspaceStatusResponse {
    return {
      connected: session.authStep === 'connected' && Boolean(session.account),
      hasEnvConfig: this.hasEnvConfig(),
      authStep: session.authStep,
      account: session.account,
      botActive: session.botActive,
      botUsername: session.botUsername,
      botError: session.botError,
      savedListenerActive: session.savedListenerActive,
      activityLog: session.activityLog,
    };
  }

  private async populateAccountProfile(session: WorkspaceSession): Promise<TelegramAccountProfile> {
    const me = await session.client.getMe();
    if (!(me instanceof Api.User)) {
      throw new Error('No se pudo obtener el perfil de la cuenta de Telegram.');
    }
    const profile: TelegramAccountProfile = {
      id: me.id.toString(),
      firstName: me.firstName || 'Usuario',
      lastName: me.lastName || undefined,
      username: me.username || undefined,
      phone: me.phone || undefined,
    };
    session.account = profile;
    session.authStep = 'connected';
    return profile;
  }

  public async connectWithSessionString(
    apiId: number,
    apiHash: string,
    sessionString: string,
  ): Promise<{ workspaceToken: string; status: WorkspaceStatusResponse }> {
    const stringSession = new sessions.StringSession(sessionString.trim());
    const client = new TelegramClient(stringSession, apiId, apiHash.trim(), {
      connectionRetries: 5,
    });
    client.setLogLevel('none' as any);

    await client.connect();
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) {
      await client.disconnect().catch(() => {});
      throw new Error('La StringSession proporcionada no está autorizada o ha expirado.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const session: WorkspaceSession = {
      token,
      apiId,
      apiHash: apiHash.trim(),
      client,
      authStep: 'connected',
      peerCache: new Map(),
      botActive: false,
      botUpdateOffset: 0,
      savedListenerActive: false,
      activityLog: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    await this.populateAccountProfile(session);
    this.sessionsMap.set(token, session);

    return {
      workspaceToken: token,
      status: this.getStatus(session),
    };
  }

  public async connectFromEnv(): Promise<{ workspaceToken: string; status: WorkspaceStatusResponse }> {
    const apiId = TELEFIND_CONFIG.apiId;
    const apiHash = TELEFIND_CONFIG.apiHash.trim();
    const sessionStr = TELEFIND_CONFIG.sessionString.trim();
    const botToken = TELEFIND_CONFIG.botToken.trim();

    if (!apiId || !apiHash || !sessionStr) {
      throw new Error('Faltan credenciales en telefind.config.ts o variables de entorno.');
    }

    if (!Number.isInteger(apiId) || apiId <= 0) {
      throw new Error('apiId no es un número entero válido.');
    }

    const result = await this.connectWithSessionString(apiId, apiHash, sessionStr);
    if (botToken) {
      const session = this.getSession(result.workspaceToken);
      if (session) {
        await this.startBot(session, botToken).catch((err) => {
          console.error('[TeleFind] Error iniciando bot desde configuración:', err);
        });
        return {
          workspaceToken: result.workspaceToken,
          status: this.getStatus(session),
        };
      }
    }
    return result;
  }

  public async autoBootFromEnv(): Promise<void> {
    if (!this.hasEnvConfig()) return;
    try {
      const res = await this.connectFromEnv();
      const acc = res.status.account;
      console.log(
        `[TeleFind] Sesión MTProto conectada automáticamente: ${acc?.firstName || 'Usuario'} (ID ${acc?.id})`,
      );
      if (res.status.botActive && res.status.botUsername) {
        console.log(`[TeleFind] Bot @${res.status.botUsername} activo mediante Long Polling.`);
      }
    } catch (err) {
      console.error(
        '[TeleFind] No se pudo iniciar automáticamente desde variables de entorno:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  public async startPhoneAuth(
    apiId: number,
    apiHash: string,
    phoneNumber: string,
  ): Promise<{ workspaceToken: string; authStep: 'awaiting_code' | 'connected'; status: WorkspaceStatusResponse }> {
    const client = new TelegramClient(new sessions.StringSession(''), apiId, apiHash.trim(), {
      connectionRetries: 5,
    });
    client.setLogLevel('none' as any);

    const token = crypto.randomBytes(32).toString('hex');
    const session: WorkspaceSession = {
      token,
      apiId,
      apiHash: apiHash.trim(),
      client,
      authStep: 'idle',
      peerCache: new Map(),
      botActive: false,
      botUpdateOffset: 0,
      savedListenerActive: false,
      activityLog: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      authNotifyDeferred: createDeferred(),
    };
    this.sessionsMap.set(token, session);

    // Kick off client.start() in background and synchronize via deferreds
    void (async () => {
      try {
        await client.start({
          phoneNumber: async () => phoneNumber.trim(),
          phoneCode: async () => {
            session.authStep = 'awaiting_code';
            session.codeDeferred = createDeferred<string>();
            session.authNotifyDeferred?.resolve('awaiting_code');
            return session.codeDeferred.promise;
          },
          password: async () => {
            session.authStep = 'awaiting_password';
            session.passwordDeferred = createDeferred<string>();
            session.authNotifyDeferred?.resolve('awaiting_password');
            return session.passwordDeferred.promise;
          },
          onError: async (err) => {
            const msg = err instanceof Error ? err.message : String(err);
            session.lastAuthError = msg;
            if (msg.includes('PHONE_CODE_INVALID') || msg.includes('PHONE_CODE_EXPIRED')) {
              session.authNotifyDeferred?.resolve('error');
              return false; // allow retry of phoneCode
            }
            if (msg.includes('PASSWORD_HASH_INVALID')) {
              session.authNotifyDeferred?.resolve('error');
              return false; // allow retry of password
            }
            session.authNotifyDeferred?.reject(err);
            return true; // stop start() on fatal error
          },
        });

        await this.populateAccountProfile(session);
        session.authNotifyDeferred?.resolve('connected');
      } catch (err) {
        session.lastAuthError = err instanceof Error ? err.message : String(err);
        session.authNotifyDeferred?.reject(err);
      }
    })();

    try {
      const step = await Promise.race([
        session.authNotifyDeferred!.promise,
        new Promise<'error'>((_, rej) =>
          setTimeout(() => rej(new Error('Tiempo de espera agotado al solicitar el código de Telegram.')), 25000),
        ),
      ]);

      if (step === 'error') {
        throw new Error(session.lastAuthError || 'Error al iniciar autenticación con Telegram.');
      }

      return {
        workspaceToken: token,
        authStep: step === 'connected' ? 'connected' : 'awaiting_code',
        status: this.getStatus(session),
      };
    } catch (err) {
      await this.destroySession(token).catch(() => {});
      throw err;
    }
  }

  public async submitPhoneCode(
    session: WorkspaceSession,
    code: string,
  ): Promise<{ authStep: 'awaiting_password' | 'connected'; status: WorkspaceStatusResponse }> {
    if (session.authStep !== 'awaiting_code' || !session.codeDeferred) {
      throw new Error('La sesión no está esperando un código de verificación.');
    }
    session.lastAuthError = undefined;
    session.authNotifyDeferred = createDeferred();
    const pending = session.codeDeferred;
    session.codeDeferred = undefined;
    pending.resolve(code.trim());

    const nextStep = await Promise.race([
      session.authNotifyDeferred.promise,
      new Promise<'error'>((_, rej) =>
        setTimeout(() => rej(new Error('Tiempo de espera agotado al verificar el código.')), 25000),
      ),
    ]);

    if (nextStep === 'error') {
      throw new Error(session.lastAuthError || 'Código inválido o expirado. Inténtalo de nuevo.');
    }

    return {
      authStep: nextStep === 'awaiting_password' ? 'awaiting_password' : 'connected',
      status: this.getStatus(session),
    };
  }

  public async submitPassword(
    session: WorkspaceSession,
    password: string,
  ): Promise<{ authStep: 'connected'; status: WorkspaceStatusResponse }> {
    if (session.authStep !== 'awaiting_password' || !session.passwordDeferred) {
      throw new Error('La sesión no está esperando contraseña 2FA.');
    }
    session.lastAuthError = undefined;
    session.authNotifyDeferred = createDeferred();
    const pending = session.passwordDeferred;
    session.passwordDeferred = undefined;
    pending.resolve(password);

    const nextStep = await Promise.race([
      session.authNotifyDeferred.promise,
      new Promise<'error'>((_, rej) =>
        setTimeout(() => rej(new Error('Tiempo de espera agotado al verificar la contraseña.')), 25000),
      ),
    ]);

    if (nextStep === 'error') {
      throw new Error(session.lastAuthError || 'Contraseña de verificación en dos pasos incorrecta.');
    }

    return {
      authStep: 'connected',
      status: this.getStatus(session),
    };
  }

  public exportSessionString(session: WorkspaceSession): string {
    if (session.authStep !== 'connected') {
      throw new Error('Debes conectar tu cuenta primero.');
    }
    return String(session.client.session.save());
  }

  public async getDialogs(session: WorkspaceSession): Promise<TelegramDialogSummary[]> {
    const dialogs = await session.client.getDialogs({ limit: 80 });
    const meId = session.account?.id || '';
    const results: TelegramDialogSummary[] = [];

    for (const d of dialogs) {
      const rawId = d.id?.toString();
      if (!rawId) continue;

      if (d.inputEntity) {
        session.peerCache.set(rawId, d.inputEntity);
      }

      if (rawId === meId) {
        results.push({ id: rawId, title: 'Mensajes Guardados', type: 'saved' });
        continue;
      }

      const entity = d.entity;
      if (entity instanceof Api.User) {
        results.push({
          id: rawId,
          title: d.title || [entity.firstName, entity.lastName].filter(Boolean).join(' ') || `Usuario ${rawId}`,
          type: 'private',
          username: entity.username || undefined,
        });
      } else if (entity instanceof Api.Channel) {
        results.push({
          id: rawId,
          title: d.title || entity.title || `Canal ${rawId}`,
          type: entity.megagroup ? 'group' : 'channel',
          username: entity.username || undefined,
        });
      } else if (entity instanceof Api.Chat) {
        results.push({
          id: rawId,
          title: d.title || entity.title || `Grupo ${rawId}`,
          type: 'group',
        });
      }
    }

    return results;
  }

  private mapMessageToFileItem(session: WorkspaceSession, msg: Api.Message): TelegramFileItem | null {
    if (!msg.media || !(msg.file || msg.photo || msg.document)) return null;
    if (msg.sticker) return null; // ignore stickers as files

    const file = msg.file;
    const meId = session.account?.id || '';
    const meta = resolveChatMeta(msg, meId);

    if (msg.inputChat && !(msg.inputChat instanceof Api.InputPeerEmpty)) {
      session.peerCache.set(meta.chatId, msg.inputChat as Api.TypeInputPeer);
    }

    const mimeType = file?.mimeType || (msg.photo ? 'image/jpeg' : 'application/octet-stream');
    let fileName = typeof file?.name === 'string' && file.name.trim() ? file.name.trim() : '';

    if (!fileName) {
      const extFromMime = extractExtension('', mimeType);
      if (msg.photo) {
        fileName = `foto_${msg.id}.${extFromMime}`;
      } else if (msg.voice) {
        fileName = `nota_voz_${msg.id}.ogg`;
      } else if (msg.video) {
        fileName = `video_${msg.id}.${extFromMime}`;
      } else if (msg.audio) {
        fileName = file?.title ? `${file.title}.mp3` : `audio_${msg.id}.mp3`;
      } else {
        fileName = `archivo_${msg.id}.${extFromMime}`;
      }
    }

    const fileExt = extractExtension(fileName, mimeType);
    const sizeBytes = file?.size ? Number(file.size) : 0;
    const category = classifyFile(msg, fileName, mimeType, fileExt);
    const dateUnix = typeof msg.date === 'number' ? msg.date : Math.floor(Date.now() / 1000);

    let senderName: string | undefined;
    if (msg.sender instanceof Api.User) {
      senderName = [msg.sender.firstName, msg.sender.lastName].filter(Boolean).join(' ').trim() || msg.sender.username;
    } else if (msg.sender instanceof Api.Channel || msg.sender instanceof Api.Chat) {
      senderName = msg.sender.title;
    }

    return {
      id: `${meta.chatId}:${msg.id}`,
      messageId: msg.id,
      chatId: meta.chatId,
      chatTitle: meta.chatTitle,
      chatType: meta.chatType,
      chatUsername: meta.chatUsername,
      senderName,
      fileName,
      fileExt,
      mimeType,
      sizeBytes,
      dateIso: new Date(dateUnix * 1000).toISOString(),
      dateUnix,
      caption: typeof msg.message === 'string' ? msg.message.trim() : '',
      category,
      tMeLink: buildTelegramLink(meta.chatType, meta.chatId, msg.id, meta.chatUsername),
    };
  }

  public async searchFiles(
    session: WorkspaceSession,
    params: {
      query?: string;
      category?: FileFilterType;
      chatId?: string;
      limit?: number;
      offsetId?: number;
    },
  ): Promise<SearchFilesResponse> {
    const query = (params.query || '').trim().slice(0, 200);
    const category: FileFilterType = params.category || 'all';
    const limit = Math.min(Math.max(params.limit || 40, 1), 100);
    const offsetId = params.offsetId && params.offsetId > 0 ? params.offsetId : 0;

    let entity: any = undefined;
    if (params.chatId && params.chatId !== 'all') {
      if (params.chatId === 'saved' || params.chatId === session.account?.id) {
        entity = 'me';
      } else {
        entity = session.peerCache.get(params.chatId) || Number(params.chatId) || params.chatId;
      }
    }

    const collectMessages = async (
      filter: Api.TypeMessagesFilter,
      qStr: string,
      maxItems: number,
    ): Promise<Api.Message[]> => {
      const list = await session.client.getMessages(entity, {
        search: qStr || undefined,
        filter,
        limit: maxItems,
        offsetId,
      });
      return Array.from(list);
    };

    let rawMessages: Api.Message[] = [];

    if (category === 'all') {
      const [docs, media, music] = await Promise.all([
        collectMessages(new Api.InputMessagesFilterDocument(), query, limit),
        collectMessages(new Api.InputMessagesFilterPhotoVideo(), query, Math.min(limit, 25)),
        collectMessages(new Api.InputMessagesFilterMusic(), query, Math.min(limit, 15)),
      ]);
      rawMessages = [...docs, ...media, ...music];
    } else if (category === 'document') {
      rawMessages = await collectMessages(new Api.InputMessagesFilterDocument(), query, limit);
    } else if (category === 'pdf') {
      const pdfQuery = query ? (query.toLowerCase().includes('pdf') ? query : query) : 'pdf';
      rawMessages = await collectMessages(new Api.InputMessagesFilterDocument(), pdfQuery, limit);
    } else if (category === 'archive') {
      rawMessages = await collectMessages(new Api.InputMessagesFilterDocument(), query, Math.min(limit * 2, 100));
    } else if (category === 'photo') {
      rawMessages = await collectMessages(new Api.InputMessagesFilterPhotos(), query, limit);
    } else if (category === 'video') {
      rawMessages = await collectMessages(new Api.InputMessagesFilterVideo(), query, limit);
    } else if (category === 'audio') {
      rawMessages = await collectMessages(new Api.InputMessagesFilterMusic(), query, limit);
    } else if (category === 'voice') {
      rawMessages = await collectMessages(new Api.InputMessagesFilterVoice(), query, limit);
    }

    const dedup = new Map<string, TelegramFileItem>();
    for (const msg of rawMessages) {
      const mapped = this.mapMessageToFileItem(session, msg);
      if (!mapped) continue;

      if (category === 'pdf' && mapped.category !== 'pdf') continue;
      if (category === 'archive' && mapped.category !== 'archive') continue;

      if (!dedup.has(mapped.id)) {
        dedup.set(mapped.id, mapped);
      }
    }

    const items = Array.from(dedup.values()).sort((a, b) => b.dateUnix - a.dateUnix);
    const sliced = items.slice(0, limit);
    const lastItem = sliced[sliced.length - 1];

    return {
      items: sliced,
      totalFetched: sliced.length,
      nextOffsetRate: lastItem ? lastItem.dateUnix : 0,
      nextOffsetId: lastItem ? lastItem.messageId : 0,
      hasMore: rawMessages.length >= limit,
    };
  }

  private async resolveMessage(
    session: WorkspaceSession,
    chatId: string,
    messageId: number,
  ): Promise<{ peer: any; message: Api.Message }> {
    const peer =
      chatId === 'saved' || chatId === session.account?.id
        ? 'me'
        : session.peerCache.get(chatId) || Number(chatId) || chatId;

    const msgs = await session.client.getMessages(peer, { ids: [messageId] });
    const message = msgs[0];
    if (!message || !(message instanceof Api.Message)) {
      throw new Error('No se encontró el archivo o mensaje en Telegram.');
    }
    return { peer, message };
  }

  public async downloadFileBuffer(
    session: WorkspaceSession,
    chatId: string,
    messageId: number,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const { message } = await this.resolveMessage(session, chatId, messageId);
    const meta = this.mapMessageToFileItem(session, message);
    if (!meta) {
      throw new Error('El mensaje seleccionado no contiene ningún archivo descargable.');
    }

    const result = await session.client.downloadMedia(message, {});
    if (!result) {
      throw new Error('No fue posible descargar el contenido del archivo.');
    }

    const buffer = Buffer.isBuffer(result) ? result : Buffer.from(result as string);
    return {
      buffer,
      fileName: sanitizeFilename(meta.fileName),
      mimeType: meta.mimeType || 'application/octet-stream',
    };
  }

  public async forwardToSavedMessages(
    session: WorkspaceSession,
    chatId: string,
    messageId: number,
  ): Promise<void> {
    const { peer, message } = await this.resolveMessage(session, chatId, messageId);
    await session.client.forwardMessages('me', {
      messages: [message.id],
      fromPeer: peer,
    });
  }

  // ==================== BOT API INTEGRATION ====================

  private async botApiCall<T = any>(
    botToken: string,
    method: string,
    body?: Record<string, unknown> | FormData,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `https://api.telegram.org/bot${botToken}/${method}`;
    const isForm = body instanceof FormData;
    const res = await fetch(url, {
      method: 'POST',
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
      signal,
    });
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) {
      throw new Error(data.description || `Error en Bot API (${method})`);
    }
    return data.result as T;
  }

  public async startBot(session: WorkspaceSession, botToken: string): Promise<WorkspaceStatusResponse> {
    if (session.authStep !== 'connected' || !session.account) {
      throw new Error('Debes conectar tu cuenta de Telegram (MTProto) antes de iniciar el bot.');
    }
    const trimmed = botToken.trim();
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
      throw new Error('El formato del token de @BotFather no es válido.');
    }

    this.stopBot(session);

    const me = await this.botApiCall<{ id: number; username?: string; first_name: string }>(trimmed, 'getMe');

    await this.botApiCall(trimmed, 'setMyCommands', {
      commands: [
        { command: 'buscar', description: 'Buscar cualquier archivo (ej: /buscar factura)' },
        { command: 'pdf', description: 'Buscar documentos PDF' },
        { command: 'imagenes', description: 'Buscar imágenes y fotos' },
        { command: 'videos', description: 'Buscar videos' },
        { command: 'audio', description: 'Buscar música y audios' },
        { command: 'recientes', description: 'Últimos archivos en tu cuenta' },
        { command: 'ayuda', description: 'Ver instrucciones de uso' },
      ],
    });

    session.botToken = trimmed;
    session.botUsername = me.username || me.first_name;
    session.botActive = true;
    session.botError = undefined;
    const controller = new AbortController();
    session.botAbortController = controller;

    void this.runBotPollingLoop(session, trimmed, controller.signal);

    return this.getStatus(session);
  }

  public stopBot(session: WorkspaceSession): WorkspaceStatusResponse {
    if (session.botAbortController) {
      session.botAbortController.abort();
      session.botAbortController = undefined;
    }
    session.botActive = false;
    return this.getStatus(session);
  }

  private async runBotPollingLoop(session: WorkspaceSession, botToken: string, signal: AbortSignal) {
    while (!signal.aborted && session.botActive) {
      try {
        const updates = await this.botApiCall<any[]>(
          botToken,
          'getUpdates',
          {
            offset: session.botUpdateOffset,
            timeout: 25,
            allowed_updates: ['message', 'callback_query'],
          },
          signal,
        );

        for (const update of updates) {
          session.botUpdateOffset = Math.max(session.botUpdateOffset, update.update_id + 1);
          await this.handleBotUpdate(session, botToken, update).catch((err) => {
            session.botError = err instanceof Error ? err.message : String(err);
          });
        }
      } catch (err) {
        if (signal.aborted) break;
        session.botError = err instanceof Error ? err.message : String(err);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  private async handleBotUpdate(session: WorkspaceSession, botToken: string, update: any) {
    const ownerId = session.account?.id;

    if (update.callback_query) {
      const cq = update.callback_query;
      const fromId = cq.from?.id?.toString();
      if (!ownerId || fromId !== ownerId) {
        await this.botApiCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: 'Acceso denegado.',
          show_alert: true,
        });
        return;
      }

      const dataStr = typeof cq.data === 'string' ? cq.data : '';
      if (dataStr.startsWith('send:')) {
        const [, chatId, msgIdStr] = dataStr.split(':');
        const messageId = Number.parseInt(msgIdStr, 10);
        const targetChatId = cq.message?.chat?.id;
        if (!chatId || !Number.isInteger(messageId) || !targetChatId) return;

        await this.botApiCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: 'Descargando y enviando archivo...',
        });

        try {
          const { message } = await this.resolveMessage(session, chatId, messageId);
          const meta = this.mapMessageToFileItem(session, message);
          if (!meta) throw new Error('Archivo no disponible.');

          // Telegram Bot API caps uploads at 50 MB
          if (meta.sizeBytes > 48 * 1024 * 1024) {
            await this.forwardToSavedMessages(session, chatId, messageId);
            await this.botApiCall(botToken, 'sendMessage', {
              chat_id: targetChatId,
              parse_mode: 'HTML',
              text: `El archivo <b>${escapeHtml(meta.fileName)}</b> (${formatBytes(meta.sizeBytes)}) supera el límite de 50 MB de la API de Bots.\nLo reenvié directamente a tus <b>Mensajes Guardados</b>.`,
            });
            return;
          }

          const { buffer, fileName, mimeType } = await this.downloadFileBuffer(session, chatId, messageId);
          const form = new FormData();
          form.append('chat_id', String(targetChatId));
          form.append('document', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);
          form.append(
            'caption',
            `Archivo: ${fileName}\nOrigen: ${meta.chatTitle}\nTamaño: ${formatBytes(meta.sizeBytes)}`,
          );

          await this.botApiCall(botToken, 'sendDocument', form);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await this.botApiCall(botToken, 'sendMessage', {
            chat_id: targetChatId,
            text: `No se pudo enviar el archivo: ${errMsg}`,
          });
        }
      }
      return;
    }

    const msg = update.message;
    if (!msg || !msg.text || !msg.chat?.id) return;

    const fromId = msg.from?.id?.toString();
    const replyChatId = msg.chat.id;

    if (!ownerId || fromId !== ownerId) {
      await this.botApiCall(botToken, 'sendMessage', {
        chat_id: replyChatId,
        text: 'Acceso restringido: este bot solo responde al propietario de la cuenta vinculada en TeleFind.',
      });
      return;
    }

    const text: string = msg.text.trim();
    if (text === '/start' || text === '/ayuda') {
      await this.botApiCall(botToken, 'sendMessage', {
        chat_id: replyChatId,
        parse_mode: 'HTML',
        text:
          `<b>Buscador de Archivos TeleFind</b>\n\n` +
          `Envía el nombre de cualquier archivo o usa estos comandos:\n` +
          `• <code>/buscar texto</code> — Busca en toda tu cuenta\n` +
          `• <code>/pdf texto</code> — Solo documentos PDF\n` +
          `• <code>/imagenes texto</code> — Solo fotos e imágenes\n` +
          `• <code>/videos texto</code> — Solo videos\n` +
          `• <code>/audio texto</code> — Música y audios\n` +
          `• <code>/recientes</code> — Últimos archivos recibidos`,
      });
      return;
    }

    let command = '/buscar';
    let category: FileFilterType = 'all';
    let query = text;

    if (text.startsWith('/recientes')) {
      command = '/recientes';
      query = '';
    } else if (text.startsWith('/pdf')) {
      command = '/pdf';
      category = 'pdf';
      query = text.replace(/^\/pdf(@\S+)?\s*/i, '');
    } else if (text.startsWith('/imagenes')) {
      command = '/imagenes';
      category = 'photo';
      query = text.replace(/^\/imagenes(@\S+)?\s*/i, '');
    } else if (text.startsWith('/videos')) {
      command = '/videos';
      category = 'video';
      query = text.replace(/^\/videos(@\S+)?\s*/i, '');
    } else if (text.startsWith('/audio')) {
      command = '/audio';
      category = 'audio';
      query = text.replace(/^\/audio(@\S+)?\s*/i, '');
    } else if (text.startsWith('/buscar')) {
      command = '/buscar';
      query = text.replace(/^\/buscar(@\S+)?\s*/i, '');
    }

    try {
      const searchRes = await this.searchFiles(session, {
        query,
        category,
        limit: 8,
      });

      this.pushLog(session, {
        source: 'bot_api',
        command,
        query: query || '(recientes)',
        resultCount: searchRes.items.length,
        status: 'ok',
      });

      if (searchRes.items.length === 0) {
        await this.botApiCall(botToken, 'sendMessage', {
          chat_id: replyChatId,
          parse_mode: 'HTML',
          text: `No se encontraron archivos para <b>${escapeHtml(query || command)}</b>.`,
        });
        return;
      }

      const lines = searchRes.items.map((item, idx) => {
        const dateStr = item.dateIso.slice(0, 10);
        return `${idx + 1}. <b>${escapeHtml(item.fileName)}</b>\n    ${escapeHtml(item.chatTitle)} · ${formatBytes(item.sizeBytes)} · ${dateStr}`;
      });

      const inlineKeyboard = searchRes.items.map((item, idx) => [
        {
          text: `Enviar #${idx + 1}: ${item.fileName.slice(0, 32)}`,
          callback_data: `send:${item.chatId}:${item.messageId}`.slice(0, 64),
        },
      ]);

      await this.botApiCall(botToken, 'sendMessage', {
        chat_id: replyChatId,
        parse_mode: 'HTML',
        text: `<b>Resultados (${searchRes.items.length})</b>${query ? ` para "${escapeHtml(query)}"` : ''}:\n\n${lines.join('\n\n')}`,
        reply_markup: { inline_keyboard: inlineKeyboard },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.pushLog(session, {
        source: 'bot_api',
        command,
        query,
        resultCount: 0,
        status: 'error',
        detail: errMsg,
      });
      await this.botApiCall(botToken, 'sendMessage', {
        chat_id: replyChatId,
        text: `Error buscando archivos: ${errMsg}`,
      });
    }
  }

  // ==================== SAVED MESSAGES USERBOT LISTENER ====================

  public toggleSavedListener(session: WorkspaceSession, enable: boolean): WorkspaceStatusResponse {
    if (session.authStep !== 'connected' || !session.account) {
      throw new Error('Debes conectar tu cuenta de Telegram primero.');
    }

    if (enable === session.savedListenerActive) {
      return this.getStatus(session);
    }

    if (enable) {
      const handler = async (event: NewMessageEvent) => {
        try {
          const message = event.message;
          if (!message || !message.message) return;
          const meId = session.account?.id;
          const chatIdStr = message.chatId?.toString();
          if (!meId || chatIdStr !== meId || !message.out) return;

          const text = message.message.trim();
          if (!text.startsWith('.buscar') && !text.startsWith('.pdf') && !text.startsWith('.recientes')) {
            return;
          }

          let command = '.buscar';
          let category: FileFilterType = 'all';
          let query = '';

          if (text.startsWith('.recientes')) {
            command = '.recientes';
          } else if (text.startsWith('.pdf')) {
            command = '.pdf';
            category = 'pdf';
            query = text.slice(4).trim();
          } else {
            query = text.slice(7).trim();
          }

          const res = await this.searchFiles(session, { query, category, limit: 5 });
          this.pushLog(session, {
            source: 'saved_messages',
            command,
            query: query || '(recientes)',
            resultCount: res.items.length,
            status: 'ok',
          });

          if (res.items.length === 0) {
            await session.client.sendMessage('me', {
              message: `TeleFind: No se encontraron archivos para "${query || command}".`,
            });
            return;
          }

          const summary = res.items
            .map((it, i) => `${i + 1}. ${it.fileName} (${formatBytes(it.sizeBytes)} · ${it.chatTitle})`)
            .join('\n');

          await session.client.sendMessage('me', {
            message: `TeleFind encontró ${res.items.length} archivo(s):\n${summary}`,
          });

          for (const item of res.items.slice(0, 3)) {
            await this.forwardToSavedMessages(session, item.chatId, item.messageId).catch(() => {});
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.pushLog(session, {
            source: 'saved_messages',
            command: '.buscar',
            query: '',
            resultCount: 0,
            status: 'error',
            detail: errMsg,
          });
        }
      };

      session.savedEventHandler = handler;
      session.client.addEventHandler(handler, new NewMessage({ outgoing: true }));
      session.savedListenerActive = true;
    } else {
      if (session.savedEventHandler) {
        session.client.removeEventHandler(session.savedEventHandler, new NewMessage({ outgoing: true }));
        session.savedEventHandler = undefined;
      }
      session.savedListenerActive = false;
    }

    return this.getStatus(session);
  }

  public async destroySession(token: string): Promise<void> {
    const session = this.sessionsMap.get(token);
    if (!session) return;
    this.stopBot(session);
    if (session.savedListenerActive && session.savedEventHandler) {
      try {
        session.client.removeEventHandler(session.savedEventHandler, new NewMessage({ outgoing: true }));
      } catch {
        // ignore cleanup error
      }
    }
    this.sessionsMap.delete(token);
    await session.client.disconnect().catch(() => {});
  }
}

export const telegramManager = new TelegramManager();
