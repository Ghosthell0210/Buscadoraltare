import type { FileFilterType } from '../types/telegram';

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

export function formatDateShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatTimeShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function categoryLabelEs(cat: FileFilterType): string {
  switch (cat) {
    case 'all':
      return 'Todos';
    case 'document':
      return 'Documentos';
    case 'pdf':
      return 'PDF';
    case 'photo':
      return 'Imágenes';
    case 'video':
      return 'Videos';
    case 'audio':
      return 'Audio';
    case 'voice':
      return 'Notas de voz';
    case 'archive':
      return 'Comprimidos';
  }
}

export function chatTypeLabelEs(type: 'saved' | 'private' | 'group' | 'channel'): string {
  switch (type) {
    case 'saved':
      return 'Guardados';
    case 'private':
      return 'Chat privado';
    case 'group':
      return 'Grupo';
    case 'channel':
      return 'Canal';
  }
}
