import { useEffect, useState, useCallback } from 'react';
import {
  Bot,
  CheckCircle2,
  KeyRound,
  Menu,
  RefreshCw,
  Search,
  Server,
  UserX,
  X,
} from 'lucide-react';
import type {
  TelegramDialogSummary,
  WorkspaceStatusResponse,
} from './types/telegram';
import { SearchView } from './components/SearchView';
import { BotControlView } from './components/BotControlView';
import { ConnectView } from './components/ConnectView';
import { AltareDeployView } from './components/AltareDeployView';

type ActiveTab = 'search' | 'bot' | 'connect' | 'altare';

const TAB_TITLES: Record<ActiveTab, string> = {
  search: 'Buscador de archivos',
  bot: 'Bot de Telegram',
  connect: 'Conexión MTProto',
  altare: 'Despliegue en Altare',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('search');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Kept strictly in React memory (never persisted to localStorage/sessionStorage)
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [status, setStatus] = useState<WorkspaceStatusResponse | null>(null);
  const [hasEnvConfig, setHasEnvConfig] = useState(false);
  const [dialogs, setDialogs] = useState<TelegramDialogSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setHasEnvConfig(Boolean(data?.hasEnvConfig)))
      .catch(() => {});
  }, []);

  const fetchDialogs = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/telegram/dialogs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDialogs(data.dialogs || []);
      }
    } catch {
      // ignore non-critical dialog preload failure
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!workspaceToken) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/status', {
        headers: { Authorization: `Bearer ${workspaceToken}` },
      });
      if (res.status === 401) {
        setWorkspaceToken(null);
        setStatus(null);
        setDialogs([]);
        return;
      }
      if (res.ok) {
        const data: WorkspaceStatusResponse = await res.json();
        setStatus(data);
        if (data.connected && dialogs.length === 0) {
          void fetchDialogs(workspaceToken);
        }
      }
    } finally {
      setRefreshing(false);
    }
  }, [workspaceToken, dialogs.length, fetchDialogs]);

  // Poll status while viewing Bot tab so live Telegram commands appear automatically
  useEffect(() => {
    if (!workspaceToken || !status?.connected || activeTab !== 'bot') return;
    const timer = setInterval(() => {
      void refreshStatus();
    }, 5000);
    return () => clearInterval(timer);
  }, [workspaceToken, status?.connected, activeTab, refreshStatus]);

  function handleAuthSuccess(token: string, nextStatus: WorkspaceStatusResponse) {
    setWorkspaceToken(token);
    setStatus(nextStatus);
    if (nextStatus.connected) {
      void fetchDialogs(token);
    }
  }

  function handleStatusUpdate(nextStatus: WorkspaceStatusResponse) {
    setStatus(nextStatus);
    if (nextStatus.connected && workspaceToken && dialogs.length === 0) {
      void fetchDialogs(workspaceToken);
    }
  }

  async function handleLogout() {
    if (workspaceToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${workspaceToken}` },
      }).catch(() => {});
    }
    setWorkspaceToken(null);
    setStatus(null);
    setDialogs([]);
  }

  function navigateTo(tab: ActiveTab) {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  }

  const connected = Boolean(status?.connected && status.account);

  const navItems: { id: ActiveTab; label: string; icon: typeof Search }[] = [
    { id: 'search', label: 'Buscador', icon: Search },
    { id: 'bot', label: 'Bot de Telegram', icon: Bot },
    { id: 'connect', label: 'Conexión MTProto', icon: KeyRound },
    { id: 'altare', label: 'Despliegue Altare', icon: Server },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-[260px]">
      <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            navigateTo('search');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          TeleFind
        </a>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Cerrar menú"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateTo(item.id)}
              className={`w-full h-10 px-3 rounded-lg text-sm font-medium flex items-center gap-2.5 transition-colors whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none ${
                active
                  ? 'bg-sky-50 text-sky-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-2">
        {connected && status?.account ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Cuenta conectada</span>
            </div>
            <p className="text-sm font-medium text-slate-900 truncate">
              {status.account.firstName} {status.account.lastName || ''}
            </p>
            <p className="text-xs font-mono text-slate-500 truncate">
              {status.account.username ? `@${status.account.username}` : `ID ${status.account.id}`}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <UserX className="w-3.5 h-3.5 shrink-0" />
              <span>Sin cuenta conectada</span>
            </div>
            <p className="text-xs text-slate-500">
              Vincula tu sesión MTProto para buscar archivos.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div id="top" className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block shrink-0">{sidebarContent}</aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/30"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-50">{sidebarContent}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir navegación"
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline">TeleFind</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-semibold text-slate-900 truncate">
                {TAB_TITLES[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {connected ? (
              <button
                type="button"
                onClick={refreshStatus}
                disabled={refreshing}
                className="h-9 px-3.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Actualizar estado</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigateTo('connect')}
                className="h-9 px-4 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
              >
                Conectar cuenta
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-[1360px] w-full mx-auto">
          {activeTab === 'search' && (
            <SearchView
              workspaceToken={workspaceToken}
              connected={connected}
              dialogs={dialogs}
              onGoToConnect={() => navigateTo('connect')}
            />
          )}

          {activeTab === 'bot' && (
            <BotControlView
              workspaceToken={workspaceToken}
              status={status}
              onStatusUpdate={handleStatusUpdate}
              onGoToConnect={() => navigateTo('connect')}
            />
          )}

          {activeTab === 'connect' && (
            <ConnectView
              workspaceToken={workspaceToken}
              status={status}
              hasEnvConfig={hasEnvConfig}
              onAuthSuccess={handleAuthSuccess}
              onStatusUpdate={handleStatusUpdate}
              onLogout={handleLogout}
              onGoToSearch={() => navigateTo('search')}
            />
          )}

          {activeTab === 'altare' && <AltareDeployView />}
        </main>
      </div>
    </div>
  );
}
