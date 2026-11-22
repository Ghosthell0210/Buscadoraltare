import { useEffect, useState, useCallback } from 'react';
import {
  Archive,
  Bookmark,
  Download,
  ExternalLink,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Forward,
  Loader2,
  Mic,
  Search,
  X,
  AlertCircle,
  Check,
} from 'lucide-react';
import type {
  FileFilterType,
  TelegramDialogSummary,
  TelegramFileItem,
} from '../types/telegram';
import {
  categoryLabelEs,
  chatTypeLabelEs,
  formatBytes,
  formatDateShort,
} from '../utils/formatters';

interface SearchViewProps {
  workspaceToken: string | null;
  connected: boolean;
  dialogs: TelegramDialogSummary[];
  onGoToConnect: () => void;
}

const CATEGORIES: FileFilterType[] = [
  'all',
  'document',
  'pdf',
  'photo',
  'video',
  'audio',
  'archive',
];

function FileCategoryIcon({ category }: { category: Exclude<FileFilterType, 'all'> }) {
  switch (category) {
    case 'pdf':
    case 'document':
      return <FileText className="w-4 h-4 text-sky-600 shrink-0" />;
    case 'photo':
      return <FileImage className="w-4 h-4 text-indigo-600 shrink-0" />;
    case 'video':
      return <FileVideo className="w-4 h-4 text-amber-600 shrink-0" />;
    case 'audio':
      return <FileAudio className="w-4 h-4 text-emerald-600 shrink-0" />;
    case 'voice':
      return <Mic className="w-4 h-4 text-emerald-600 shrink-0" />;
    case 'archive':
      return <Archive className="w-4 h-4 text-slate-600 shrink-0" />;
    default:
      return <File className="w-4 h-4 text-slate-500 shrink-0" />;
  }
}

export function SearchView({
  workspaceToken,
  connected,
  dialogs,
  onGoToConnect,
}: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [category, setCategory] = useState<FileFilterType>('all');
  const [chatId, setChatId] = useState('all');

  const [items, setItems] = useState<TelegramFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextOffsetId, setNextOffsetId] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [selectedItem, setSelectedItem] = useState<TelegramFileItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [forwardingId, setForwardingId] = useState<string | null>(null);
  const [forwardedIds, setForwardedIds] = useState<Record<string, boolean>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const runSearch = useCallback(
    async (opts: { q: string; cat: FileFilterType; chat: string; offsetId?: number; append?: boolean }) => {
      if (!workspaceToken || !connected) return;
      if (opts.append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          q: opts.q,
          category: opts.cat,
          chatId: opts.chat,
          limit: '40',
        });
        if (opts.offsetId && opts.offsetId > 0) {
          params.set('offsetId', String(opts.offsetId));
        }

        const res = await fetch(`/api/telegram/search?${params.toString()}`, {
          headers: { Authorization: `Bearer ${workspaceToken}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error buscando archivos.');

        setItems((prev) => (opts.append ? [...prev, ...data.items] : data.items));
        setNextOffsetId(data.nextOffsetId || 0);
        setHasMore(Boolean(data.hasMore));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error ejecutando la búsqueda.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [workspaceToken, connected],
  );

  useEffect(() => {
    if (connected && workspaceToken) {
      void runSearch({ q: submittedQuery, cat: category, chat: chatId });
    } else {
      setItems([]);
      setSelectedItem(null);
    }
  }, [connected, workspaceToken, category, chatId, submittedQuery, runSearch]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedQuery(query.trim());
  }

  function handleResetFilters() {
    setQuery('');
    setSubmittedQuery('');
    setCategory('all');
    setChatId('all');
  }

  async function handleDownload(item: TelegramFileItem) {
    if (!workspaceToken) return;
    setDownloadingId(item.id);
    setActionMessage(null);
    try {
      const params = new URLSearchParams({
        chatId: item.chatId,
        messageId: String(item.messageId),
      });
      const res = await fetch(`/api/telegram/download?${params.toString()}`, {
        headers: { Authorization: `Bearer ${workspaceToken}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'No se pudo descargar el archivo.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Error descargando archivo.');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleForwardToSaved(item: TelegramFileItem) {
    if (!workspaceToken) return;
    setForwardingId(item.id);
    setActionMessage(null);
    try {
      const res = await fetch('/api/telegram/forward-saved', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workspaceToken}`,
        },
        body: JSON.stringify({
          chatId: item.chatId,
          messageId: item.messageId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo reenviar.');
      setForwardedIds((prev) => ({ ...prev, [item.id]: true }));
      setActionMessage(`"${item.fileName}" reenviado a Mensajes Guardados.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Error reenviando archivo.');
    } finally {
      setForwardingId(null);
    }
  }

  if (!connected) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 max-w-2xl">
        <div className="space-y-4">
          <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
            <Search className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-slate-900">
              Conecta tu cuenta para buscar archivos en Telegram
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Una vez autorizada tu sesión MTProto, podrás localizar cualquier documento, PDF, foto, video o comprimido en tus Mensajes Guardados, chats privados, grupos y canales.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToConnect}
            className="h-10 px-5 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
          >
            Conectar cuenta de Telegram
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre de archivo, extensión o descripción (ej: factura, contrato.pdf, zip)..."
              className="w-full h-10 pl-9 pr-9 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSubmittedQuery('');
                }}
                aria-label="Limpiar búsqueda"
                className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            aria-label="Filtrar por chat o canal"
            className="h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 md:w-64 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
          >
            <option value="all">Toda la cuenta</option>
            <option value="saved">Mensajes Guardados</option>
            {dialogs
              .filter((d) => d.type !== 'saved')
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({chatTypeLabelEs(d.type)})
                </option>
              ))}
          </select>

          <button
            type="submit"
            disabled={loading}
            className="h-10 px-5 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
          >
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto max-w-full">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  category === cat
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {categoryLabelEs(cat)}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {loading ? 'Buscando...' : `${items.length} archivos mostrados`}
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-slate-300 hover:text-white ml-4"
          >
            Cerrar
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="flex-1 w-full bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Archivo</th>
                  <th className="py-2.5 px-4">Origen</th>
                  <th className="py-2.5 px-4 text-right">Tamaño</th>
                  <th className="py-2.5 px-4 text-right">Fecha</th>
                  <th className="py-2.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading &&
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx} className="h-11">
                      <td className="px-4 py-2.5">
                        <div className="h-4 bg-slate-100 rounded w-56 animate-pulse" />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="h-4 bg-slate-100 rounded w-32 animate-pulse" />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="h-4 bg-slate-100 rounded w-16 ml-auto animate-pulse" />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="h-4 bg-slate-100 rounded w-24 ml-auto animate-pulse" />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="h-4 bg-slate-100 rounded w-20 ml-auto animate-pulse" />
                      </td>
                    </tr>
                  ))}

                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 px-6 text-center">
                      <div className="max-w-sm mx-auto space-y-3">
                        <p className="text-sm font-medium text-slate-900">
                          No se encontraron archivos con estos filtros
                        </p>
                        <p className="text-xs text-slate-500">
                          Prueba con otra palabra clave, cambia el tipo de archivo o selecciona toda la cuenta.
                        </p>
                        {(submittedQuery || category !== 'all' || chatId !== 'all') && (
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="h-9 px-4 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                          >
                            Limpiar filtros
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  items.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        className={`h-11 cursor-pointer transition-colors ${
                          isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-2 max-w-[300px]">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileCategoryIcon category={item.category} />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 truncate">
                                {item.fileName}
                              </div>
                              <div className="text-xs text-slate-500 truncate">
                                {categoryLabelEs(item.category)} · {item.fileExt.toUpperCase()}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 max-w-[200px]">
                          <div className="flex items-center gap-1.5 text-slate-700 truncate">
                            {item.chatType === 'saved' && (
                              <Bookmark className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                            )}
                            <span className="truncate">{item.chatTitle}</span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {chatTypeLabelEs(item.chatType)}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                          {formatBytes(item.sizeBytes)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {formatDateShort(item.dateIso)}
                        </td>
                        <td
                          className="px-4 py-2 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDownload(item)}
                              disabled={downloadingId === item.id}
                              title="Descargar archivo"
                              className="h-8 px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md inline-flex items-center gap-1"
                            >
                              {downloadingId === item.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                              <span>Descargar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleForwardToSaved(item)}
                              disabled={forwardingId === item.id}
                              title="Reenviar a Mensajes Guardados"
                              className="h-8 px-2 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md inline-flex items-center gap-1"
                            >
                              {forwardingId === item.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : forwardedIds[item.id] ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Forward className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {hasMore && !loading && (
            <div className="p-3 border-t border-slate-200 flex justify-center bg-slate-50">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() =>
                  runSearch({
                    q: submittedQuery,
                    cat: category,
                    chat: chatId,
                    offsetId: nextOffsetId,
                    append: true,
                  })
                }
                className="h-9 px-4 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-2"
              >
                {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Cargar más resultados</span>
              </button>
            </div>
          )}
        </div>

        {selectedItem && (
          <aside className="w-full lg:w-80 shrink-0 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileCategoryIcon category={selectedItem.category} />
                <h3 className="text-sm font-semibold text-slate-900 break-all">
                  {selectedItem.fileName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label="Cerrar inspector"
                className="p-1 text-slate-400 hover:text-slate-700 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <dl className="space-y-2.5 text-xs border-t border-slate-100 pt-3">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Tamaño</dt>
                <dd className="font-mono tabular-nums text-slate-900 font-medium">
                  {formatBytes(selectedItem.sizeBytes)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Tipo MIME</dt>
                <dd className="font-mono text-slate-700 truncate max-w-[180px]">
                  {selectedItem.mimeType}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Origen</dt>
                <dd className="text-slate-900 text-right truncate max-w-[180px]">
                  {selectedItem.chatTitle}
                </dd>
              </div>
              {selectedItem.senderName && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Remitente</dt>
                  <dd className="text-slate-900 text-right truncate max-w-[180px]">
                    {selectedItem.senderName}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Fecha</dt>
                <dd className="font-mono tabular-nums text-slate-700">
                  {formatDateShort(selectedItem.dateIso)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Mensaje ID</dt>
                <dd className="font-mono tabular-nums text-slate-700">
                  #{selectedItem.messageId}
                </dd>
              </div>
            </dl>

            {selectedItem.caption && (
              <div className="border-t border-slate-100 pt-3 space-y-1">
                <p className="text-xs font-medium text-slate-500">Descripción del mensaje</p>
                <p className="text-xs text-slate-700 whitespace-pre-wrap break-words leading-relaxed bg-slate-50 p-2.5 rounded-md border border-slate-200">
                  {selectedItem.caption}
                </p>
              </div>
            )}

            <div className="border-t border-slate-100 pt-4 space-y-2">
              <button
                type="button"
                onClick={() => handleDownload(selectedItem)}
                disabled={downloadingId === selectedItem.id}
                className="w-full h-10 px-4 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg inline-flex items-center justify-center gap-2"
              >
                {downloadingId === selectedItem.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Descargar archivo</span>
              </button>

              <button
                type="button"
                onClick={() => handleForwardToSaved(selectedItem)}
                disabled={forwardingId === selectedItem.id}
                className="w-full h-10 px-4 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center justify-center gap-2"
              >
                <Forward className="w-4 h-4" />
                <span>Reenviar a Mensajes Guardados</span>
              </button>

              {selectedItem.tMeLink && (
                <a
                  href={selectedItem.tMeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-10 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center justify-center gap-2"
                >
                  <span>Abrir mensaje en Telegram</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
