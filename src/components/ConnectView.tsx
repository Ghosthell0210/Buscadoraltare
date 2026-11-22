import { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Phone,
  ShieldCheck,
  ExternalLink,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { WorkspaceStatusResponse } from '../types/telegram';

interface ConnectViewProps {
  workspaceToken: string | null;
  status: WorkspaceStatusResponse | null;
  hasEnvConfig: boolean;
  onAuthSuccess: (token: string, status: WorkspaceStatusResponse) => void;
  onStatusUpdate: (status: WorkspaceStatusResponse) => void;
  onLogout: () => void;
  onGoToSearch: () => void;
}

export function ConnectView({
  workspaceToken,
  status,
  hasEnvConfig,
  onAuthSuccess,
  onStatusUpdate,
  onLogout,
  onGoToSearch,
}: ConnectViewProps) {
  const [mode, setMode] = useState<'phone' | 'session'>('phone');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sessionInput, setSessionInput] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exportedSession, setExportedSession] = useState<string | null>(null);
  const [showSessionSecret, setShowSessionSecret] = useState(false);
  const [copiedSession, setCopiedSession] = useState(false);

  const [envPasscode, setEnvPasscode] = useState('');

  const authStep = status?.authStep || 'idle';
  const isConnected = Boolean(status?.connected && status.account);

  async function handleEnvConnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/env-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: envPasscode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo conectar desde variables de entorno.');
      onAuthSuccess(data.workspaceToken, data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartPhone(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/start-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiId, apiHash, phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error enviando el código.');
      onAuthSuccess(data.workspaceToken, data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error iniciando sesión.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workspaceToken}`,
        },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Código incorrecto.');
      onStatusUpdate(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar el código.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workspaceToken}`,
        },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Contraseña 2FA incorrecta.');
      onStatusUpdate(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error validando 2FA.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectSession(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/connect-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiId, apiHash, sessionString: sessionInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'StringSession inválida.');
      onAuthSuccess(data.workspaceToken, data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar la sesión.');
    } finally {
      setLoading(false);
    }
  }

  async function handleExportSession() {
    if (!workspaceToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/export-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${workspaceToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error exportando sesión.');
      setExportedSession(data.sessionString);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar la sesión.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopySession() {
    if (!exportedSession) return;
    await navigator.clipboard.writeText(exportedSession);
    setCopiedSession(true);
    setTimeout(() => setCopiedSession(false), 2000);
  }

  if (isConnected && status?.account) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Cuenta MTProto conectada</span>
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                {status.account.firstName} {status.account.lastName || ''}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                {status.account.username && <span>@{status.account.username}</span>}
                {status.account.username && <span aria-hidden="true">·</span>}
                <span>ID {status.account.id}</span>
                {status.account.phone && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>+{status.account.phone}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onGoToSearch}
                className="h-10 px-4 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
              >
                Ir al buscador
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="h-10 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Exportar StringSession para Altare
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Genera tu cadena de sesión (<span className="font-mono text-xs">TELEGRAM_SESSION</span>) para usarla en Altare (<span className="font-mono text-xs">console.altare.gg</span>) sin volver a pedir código SMS. Guárdala en privado como una contraseña.
            </p>
          </div>

          {!exportedSession ? (
            <button
              type="button"
              onClick={handleExportSession}
              disabled={loading}
              className="h-10 px-4 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              <span>Generar StringSession</span>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type={showSessionSecret ? 'text' : 'password'}
                  readOnly
                  value={exportedSession}
                  aria-label="StringSession exportada"
                  className="flex-1 h-10 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowSessionSecret((v) => !v)}
                  className="h-10 px-3 text-sm text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {showSessionSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>{showSessionSecret ? 'Ocultar' : 'Mostrar'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopySession}
                  className="h-10 px-3 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Copy className="w-4 h-4" />
                  <span>{copiedSession ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">
            Conectar cuenta de Telegram (MTProto)
          </h2>
          <p className="text-sm text-slate-600">
            Para buscar en tus Mensajes Guardados, chats privados y canales, TeleFind se conecta directamente con tu sesión oficial de Telegram.
          </p>
        </div>

        {hasEnvConfig && authStep === 'idle' && (
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 space-y-3">
            <div className="text-sm text-sky-900">
              <p className="font-medium">Bot en segundo plano activo desde variables del servidor</p>
              <p className="text-sky-700 text-xs mt-0.5">
                Si configuraste <span className="font-mono">TELEFIND_WEB_PASSCODE</span> en <span className="font-mono">.env</span>, introdúcelo para abrir el buscador web.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                placeholder="TELEFIND_WEB_PASSCODE"
                value={envPasscode}
                onChange={(e) => setEnvPasscode(e.target.value)}
                aria-label="Código de acceso web"
                className="flex-1 min-w-[180px] h-10 px-3 text-sm bg-white border border-sky-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleEnvConnect}
                disabled={loading}
                className="h-10 px-4 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {loading ? 'Conectando...' : 'Abrir sesión web'}
              </button>
            </div>
          </div>
        )}

        {authStep === 'idle' && (
          <>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('phone');
                  setError(null);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'phone'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Teléfono + Código OTP
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('session');
                  setError(null);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'session'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Usar StringSession
              </button>
            </div>

            <form
              onSubmit={mode === 'phone' ? handleStartPhone : handleConnectSession}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tg-api-id" className="block text-xs font-medium text-slate-700 mb-1.5">
                    API ID
                  </label>
                  <input
                    id="tg-api-id"
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="12345678"
                    value={apiId}
                    onChange={(e) => setApiId(e.target.value)}
                    className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
                  />
                </div>
                <div>
                  <label htmlFor="tg-api-hash" className="block text-xs font-medium text-slate-700 mb-1.5">
                    API Hash
                  </label>
                  <input
                    id="tg-api-hash"
                    type="password"
                    required
                    placeholder="0123456789abcdef..."
                    value={apiHash}
                    onChange={(e) => setApiHash(e.target.value)}
                    className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
                  />
                </div>
              </div>

              {mode === 'phone' ? (
                <div>
                  <label htmlFor="tg-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Número de teléfono (con código de país)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      id="tg-phone"
                      type="tel"
                      required
                      placeholder="+34 600 112 233"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label htmlFor="tg-session" className="block text-xs font-medium text-slate-700 mb-1.5">
                    StringSession de GramJS
                  </label>
                  <textarea
                    id="tg-session"
                    rows={3}
                    required
                    placeholder="1BVtsOHwBu..."
                    value={sessionInput}
                    onChange={(e) => setSessionInput(e.target.value)}
                    className="w-full p-3 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
                  />
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="h-10 px-5 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{mode === 'phone' ? 'Solicitar código a Telegram' : 'Conectar sesión'}</span>
              </button>
            </form>
          </>
        )}

        {authStep === 'awaiting_code' && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
              Telegram envió un código de verificación a tu aplicación oficial o SMS. Introdúcelo debajo para autorizar la búsqueda.
            </div>
            <div>
              <label htmlFor="tg-otp" className="block text-xs font-medium text-slate-700 mb-1.5">
                Código de verificación
              </label>
              <input
                id="tg-otp"
                type="text"
                inputMode="numeric"
                required
                autoFocus
                placeholder="12345"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="h-10 px-5 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 rounded-lg inline-flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Verificar código</span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="h-10 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {authStep === 'awaiting_password' && (
          <form onSubmit={handleVerifyPassword} className="space-y-4">
            <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
              Tu cuenta tiene activa la verificación en dos pasos (2FA). Introduce tu contraseña de Telegram.
            </div>
            <div>
              <label htmlFor="tg-2fa" className="block text-xs font-medium text-slate-700 mb-1.5">
                Contraseña 2FA de Telegram
              </label>
              <input
                id="tg-2fa"
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="h-10 px-5 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 rounded-lg inline-flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Confirmar 2FA</span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="h-10 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Cómo obtener tu API ID y API Hash
          </h3>
          <ol className="mt-3 space-y-2.5 text-sm text-slate-600 list-decimal list-inside">
            <li>
              Inicia sesión en{' '}
              <a
                href="https://my.telegram.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 hover:underline inline-flex items-center gap-1 font-medium"
              >
                my.telegram.org
                <ExternalLink className="w-3.5 h-3.5" />
              </a>{' '}
              con tu número de Telegram.
            </li>
            <li>
              Entra en <span className="font-medium text-slate-800">API development tools</span>.
            </li>
            <li>
              Crea una aplicación (cualquier título/short name, plataforma Desktop) y copia el <span className="font-mono text-xs text-slate-800">App api_id</span> y <span className="font-mono text-xs text-slate-800">App api_hash</span>.
            </li>
          </ol>
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-start gap-3 text-xs text-slate-600">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Tus credenciales y sesión MTProto permanecen exclusivamente en la memoria del servidor durante tu sesión activa y nunca se almacenan en el navegador.
          </p>
        </div>
      </aside>
    </div>
  );
}
