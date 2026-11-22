export const ALTARE_BOT_TS = `// bot-telefind.ts — Bot buscador de archivos de Telegram optimizado para Altare (console.altare.gg)
import 'dotenv/config';
import { Api, TelegramClient, sessions } from 'telegram';

const API_ID = Number(process.env.TELEGRAM_API_ID);
const API_HASH = (process.env.TELEGRAM_API_HASH || '').trim();
const SESSION = (process.env.TELEGRAM_SESSION || '').trim();
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

if (!API_ID || !API_HASH || !SESSION || !BOT_TOKEN) {
  console.error('Faltan variables de entorno requeridas: TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION, TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return \`\${val >= 10 || i === 0 ? val.toFixed(0) : val.toFixed(1)} \${units[i]}\`;
}

async function botApi<T = any>(method: string, body?: Record<string, unknown> | FormData): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(\`https://api.telegram.org/bot\${BOT_TOKEN}/\${method}\`, {
    method: 'POST',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    throw new Error(json.description || \`Error Bot API en \${method}\`);
  }
  return json.result as T;
}

async function searchAccountFiles(client: TelegramClient, text: string) {
  let filter: Api.TypeMessagesFilter = new Api.InputMessagesFilterDocument();
  let query = text;
  let onlyPdf = false;

  if (text.startsWith('/recientes')) {
    query = '';
  } else if (text.startsWith('/pdf')) {
    onlyPdf = true;
    query = text.replace(/^\\/pdf(@\\S+)?\\s*/i, '').trim() || 'pdf';
  } else if (text.startsWith('/imagenes')) {
    filter = new Api.InputMessagesFilterPhotos();
    query = text.replace(/^\\/imagenes(@\\S+)?\\s*/i, '').trim();
  } else if (text.startsWith('/videos')) {
    filter = new Api.InputMessagesFilterVideo();
    query = text.replace(/^\\/videos(@\\S+)?\\s*/i, '').trim();
  } else if (text.startsWith('/audio')) {
    filter = new Api.InputMessagesFilterMusic();
    query = text.replace(/^\\/audio(@\\S+)?\\s*/i, '').trim();
  } else if (text.startsWith('/buscar')) {
    query = text.replace(/^\\/buscar(@\\S+)?\\s*/i, '').trim();
  }

  const msgs = await client.getMessages(undefined, {
    search: query || undefined,
    filter,
    limit: 10,
  });

  return Array.from(msgs)
    .filter((m) => {
      if (!m.media || !(m.file || m.photo || m.document) || m.sticker) return false;
      if (onlyPdf) {
        const name = String(m.file?.name || '').toLowerCase();
        return m.file?.mimeType === 'application/pdf' || name.endsWith('.pdf');
      }
      return true;
    })
    .slice(0, 8);
}

async function main() {
  const client = new TelegramClient(new sessions.StringSession(SESSION), API_ID, API_HASH, {
    connectionRetries: 5,
  });
  await client.connect();

  const me = await client.getMe();
  if (!(me instanceof Api.User)) {
    throw new Error('No se pudo verificar la cuenta de usuario.');
  }
  const ownerId = me.id.toString();
  console.log(\`[TeleFind] Cuenta conectada: \${me.firstName || 'Usuario'} (ID \${ownerId})\`);

  await botApi('setMyCommands', {
    commands: [
      { command: 'buscar', description: 'Buscar cualquier archivo (ej: /buscar factura)' },
      { command: 'pdf', description: 'Buscar documentos PDF' },
      { command: 'imagenes', description: 'Buscar fotos e imágenes' },
      { command: 'videos', description: 'Buscar videos' },
      { command: 'audio', description: 'Buscar audios o música' },
      { command: 'recientes', description: 'Últimos archivos en tu cuenta' },
      { command: 'ayuda', description: 'Mostrar comandos disponibles' },
    ],
  });

  let offset = 0;
  console.log('[TeleFind] Bot activo mediante Long Polling (listo para Altare).');

  while (true) {
    try {
      const updates = await botApi<any[]>('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message', 'callback_query'],
      });

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);

        if (update.callback_query) {
          const cq = update.callback_query;
          if (cq.from?.id?.toString() !== ownerId) {
            await botApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'Acceso denegado.', show_alert: true });
            continue;
          }

          const data: string = cq.data || '';
          if (data.startsWith('send:')) {
            const [, chatId, msgIdStr] = data.split(':');
            const messageId = Number.parseInt(msgIdStr, 10);
            const targetChat = cq.message?.chat?.id;
            await botApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'Obteniendo archivo...' });

            const peer = chatId === ownerId ? 'me' : Number(chatId);
            const [msg] = await client.getMessages(peer, { ids: [messageId] });
            if (msg?.media && targetChat) {
              const size = Number(msg.file?.size || 0);
              const name = String(msg.file?.name || \`archivo_\${msg.id}\`);
              if (size > 48 * 1024 * 1024) {
                await client.forwardMessages('me', { messages: [msg.id], fromPeer: peer });
                await botApi('sendMessage', {
                  chat_id: targetChat,
                  parse_mode: 'HTML',
                  text: \`<b>\${escapeHtml(name)}</b> (\${formatBytes(size)}) supera 50 MB. Lo reenvié a tus <b>Mensajes Guardados</b>.\`,
                });
              } else {
                const buffer = (await client.downloadMedia(msg, {})) as Buffer;
                const form = new FormData();
                form.append('chat_id', String(targetChat));
                form.append('document', new Blob([new Uint8Array(buffer)]), name);
                form.append('caption', \`\${name} (\${formatBytes(size)})\`);
                await botApi('sendDocument', form);
              }
            }
          }
          continue;
        }

        const msg = update.message;
        if (!msg?.text || !msg.chat?.id) continue;
        if (msg.from?.id?.toString() !== ownerId) {
          await botApi('sendMessage', {
            chat_id: msg.chat.id,
            text: 'Acceso restringido: este bot privado solo responde al propietario de la cuenta.',
          });
          continue;
        }

        const text = msg.text.trim();
        if (text === '/start' || text === '/ayuda') {
          await botApi('sendMessage', {
            chat_id: msg.chat.id,
            parse_mode: 'HTML',
            text:
              '<b>TeleFind Bot</b>\\n\\nEscribe cualquier palabra o usa:\\n' +
              '• <code>/buscar texto</code>\\n• <code>/pdf texto</code>\\n' +
              '• <code>/imagenes texto</code>\\n• <code>/videos texto</code>\\n' +
              '• <code>/audio texto</code>\\n• <code>/recientes</code>',
          });
          continue;
        }

        const results = await searchAccountFiles(client, text);
        if (results.length === 0) {
          await botApi('sendMessage', { chat_id: msg.chat.id, text: 'No se encontraron archivos para tu búsqueda.' });
          continue;
        }

        const lines = results.map((item, idx) => {
          const name = String(item.file?.name || \`archivo_\${item.id}\`);
          const size = formatBytes(Number(item.file?.size || 0));
          return \`\${idx + 1}. <b>\${escapeHtml(name)}</b> · \${size}\`;
        });

        const inlineKeyboard = results.map((item, idx) => [
          {
            text: \`Enviar #\${idx + 1}: \${String(item.file?.name || 'archivo').slice(0, 32)}\`,
            callback_data: \`send:\${item.chatId?.toString() || ownerId}:\${item.id}\`.slice(0, 64),
          },
        ]);

        await botApi('sendMessage', {
          chat_id: msg.chat.id,
          parse_mode: 'HTML',
          text: \`<b>Resultados (\${results.length})</b>\\n\\n\${lines.join('\\n')}\`,
          reply_markup: { inline_keyboard: inlineKeyboard },
        });
      }
    } catch (err) {
      console.error('[TeleFind] Error en ciclo de polling:', err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((err) => {
  console.error('[TeleFind] Error fatal:', err);
  process.exit(1);
});
`;

export const ALTARE_PACKAGE_JSON = `{
  "name": "telefind-altare-bot",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "bot-telefind.ts",
  "scripts": {
    "start": "tsx bot-telefind.ts"
  },
  "dependencies": {
    "dotenv": "^17.2.3",
    "telegram": "^2.26.22",
    "tsx": "^4.21.0"
  }
}
`;

export const ALTARE_DOCKERFILE = `# Dockerfile listo para contenedores Node.js en Altare (console.altare.gg)
FROM node:22-alpine

WORKDIR /home/container

COPY package.json ./
RUN npm install --omit=dev

COPY bot-telefind.ts telefind.config.ts ./

ENV NODE_ENV=production

CMD ["npm", "start"]
`;

export const ALTARE_CONFIG_TS = `// telefind.config.ts — Rellena tus credenciales aquí si usas un repositorio PRIVADO en GitHub
export const TELEFIND_CONFIG = {
  apiId: Number(process.env.TELEGRAM_API_ID || 0),
  apiHash: process.env.TELEGRAM_API_HASH || '',
  sessionString: process.env.TELEGRAM_SESSION || '',
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
};
`;

export const ALTARE_ENV_EXAMPLE = `# Variables de entorno opcionales si prefieres no escribir credenciales en telefind.config.ts
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=tu_api_hash_de_my_telegram_org
TELEGRAM_SESSION=tu_string_session_exportada_desde_telefind
TELEGRAM_BOT_TOKEN=tu_token_de_botfather
`;

export const ALTARE_GITIGNORE = `node_modules/
dist/
.env
.env.*
!.env.example
*.log
.DS_Store
`;

