import { useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Bot,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  ShieldCheck,
  Square,
} from 'lucide-react';
import type { WorkspaceStatusResponse } from '../types/telegram';
import { formatTimeShort } from '../utils/formatters';

interface BotControlViewProps {
  workspaceToken: string | null;
  status: WorkspaceStatusResponse | null;
  onStatusUpdate: (status: WorkspaceStatusResponse) => void;
  onGoToConnect: () => void;
}

export function BotControlView({
  workspaceToken,
  status,
  onStatusUpdate,
  onGoToConnect,
}: BotControlViewProps) {
  const [botToken, setBotToken] = useState('');
  const [loadingBot, setLoadingBot] = useState(false);
  const [loadingListener, setLoadingListener] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = Boolean(status?.connected && status.account);
  const botActive = Boolean(status?.botActive);
  const savedListenerActive = Boolean(status?.savedListenerActive);

  async function handleStartBot(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceToken) return;
    setLoadingBot(true);
    setError(null);
    try {
      const res = await fetch('/api/bot/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workspaceToken}`,
        },
        body: JSON.stringify({ botToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el bot.');
      onStatusUpdate(data);
      setBotToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error iniciando el bot.');
    } finally {
      setLoadingBot(false);
    }
  }

  async function handleStopBot() {
    if (!workspaceToken) return;
    setLoadingBot(true);
    setError(null);
    try {
      const res = await fetch('/api/bot/stop', {
        method: 'POST',
        headers: { Authorization: `Bearer ${workspaceToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo detener el bot.');
      onStatusUpdate(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deteniendo el bot.');
    } finally {
      setLoadingBot(false);
    }
  }

  async function handleToggleSavedListener() {
    if (!workspaceToken) return;
    setLoadingListener(true);
    setError(null);
    try {
      const res = await fetch('/api/bot/saved-listener', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workspaceToken}`,
        },
        body: JSON.stringify({ enable: !savedListenerActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el escuchador.');
      onStatusUpdate(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en escuchador.');
    } finally {
      setLoadingListener(false);
    }
  }

  if (!connected) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 max-w-2xl">
        <div className="space-y-4">
          <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
            <Bot className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-slate-900">
              Conecta primero tu cuenta MTProto
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              El bot de <span className="font-mono text-xs">@BotFather</span> necesita acceder a tu sesión MTProto vinculada para poder buscar archivos en tus chats, grupos y canales.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToConnect}
            className="h-10 px-5 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors"
          >
            Conectar cuenta de Telegram
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Bot dedicado con @BotFather
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Chatea con tu bot en Telegram para recibir el enlace directo del mensaje o reenviar el archivo al instante a tus Mensajes Guardados (sin descargas ni límite de tamaño).
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium shrink-0">
              {botActive ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  Activo
                </span>
              ) : (
                <span className="text-slate-500">Detenido</span>
              )}
            </div>
          </div>

          {botActive && status?.botUsername ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    @{status.botUsername}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                    Bloqueado al propietario ID {status.account?.id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://t.me/${status.botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-3 text-xs font-medium text-sky-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5"
                  >
                    <span>Abrir bot</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={handleStopBot}
                    disabled={loadingBot}
                    className="h-9 px-3 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg inline-flex items-center gap-1.5"
                  >
                    {loadingBot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                    <span>Detener</span>
                  </button>
                </div>
              </div>
              {status.botError && (
                <p className="text-xs text-amber-700">{status.botError}</p>
              )}
            </div>
          ) : (
            <form onSubmit={handleStartBot} className="space-y-3">
              <div>
                <label htmlFor="bot-token-input" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Token de @BotFather
                </label>
                <input
                  id="bot-token-input"
                  type="password"
                  required
                  placeholder="7123456789:AAH..."
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
                />
              </div>
              <button
                type="submit"
                disabled={loadingBot}
                className="h-10 px-4 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 rounded-lg inline-flex items-center gap-2"
              >
                {loadingBot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Iniciar bot en vivo</span>
              </button>
            </form>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-start gap-2.5 text-xs text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Seguridad automática: solo tu usuario (<span className="font-mono">ID {status?.account?.id}</span>) puede recibir resultados o descargar archivos a través del bot.
            </span>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Escuchador en Mensajes Guardados
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Escribe comandos con punto en tu chat de Mensajes Guardados y el buscador reenviará los archivos ahí mismo.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleSavedListener}
              disabled={loadingListener}
              className={`h-9 px-3.5 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                savedListenerActive
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>{savedListenerActive ? 'Activado' : 'Activar'}</span>
            </button>
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-700">Comandos disponibles</h3>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-slate-900">/buscar factura</dt>
                <dd className="text-slate-600 text-right">Busca cualquier archivo por nombre o texto</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-slate-900">/pdf contrato</dt>
                <dd className="text-slate-600 text-right">Filtra únicamente documentos PDF</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-slate-900">/imagenes, /videos, /audio</dt>
                <dd className="text-slate-600 text-right">Filtra por tipo multimedia específico</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-slate-900">/recientes</dt>
                <dd className="text-slate-600 text-right">Lista los últimos archivos de tu cuenta</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-mono text-slate-900">.buscar texto</dt>
                <dd className="text-slate-600 text-right">Comando directo en Mensajes Guardados</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Actividad reciente del bot
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {status?.activityLog.length || 0} eventos
          </span>
        </div>

        {!status?.activityLog.length ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Aún no se han recibido comandos en esta sesión. Envía un mensaje a tu bot en Telegram para verlo aquí.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Hora</th>
                  <th className="py-2.5 px-4">Canal</th>
                  <th className="py-2.5 px-4">Comando</th>
                  <th className="py-2.5 px-4">Consulta</th>
                  <th className="py-2.5 px-4 text-right">Resultados</th>
                  <th className="py-2.5 px-4 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {status.activityLog.map((entry) => (
                  <tr key={entry.id} className="h-10">
                    <td className="px-4 py-2 font-mono tabular-nums text-slate-500">
                      {formatTimeShort(entry.timestampIso)}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {entry.source === 'bot_api' ? 'BotFather' : 'Guardados'}
                    </td>
                    <td className="px-4 py-2 font-mono text-slate-900">{entry.command}</td>
                    <td className="px-4 py-2 text-slate-700 max-w-[260px] truncate">{entry.query}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                      {entry.resultCount}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {entry.status === 'ok' ? (
                        <span className="text-emerald-700">Completado</span>
                      ) : (
                        <span className="text-red-700">Error</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
