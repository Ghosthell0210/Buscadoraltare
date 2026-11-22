export type FileFilterType =
  | 'all'
  | 'document'
  | 'pdf'
  | 'photo'
  | 'video'
  | 'audio'
  | 'voice'
  | 'archive';

export interface TelegramFileItem {
  id: string;
  messageId: number;
  chatId: string;
  chatTitle: string;
  chatType: 'saved' | 'private' | 'group' | 'channel';
  chatUsername?: string;
  senderName?: string;
  fileName: string;
  fileExt: string;
  mimeType: string;
  sizeBytes: number;
  dateIso: string;
  dateUnix: number;
  caption: string;
  category: Exclude<FileFilterType, 'all'>;
  tMeLink?: string;
}

export interface TelegramDialogSummary {
  id: string;
  title: string;
  type: 'saved' | 'private' | 'group' | 'channel';
  username?: string;
}

export interface TelegramAccountProfile {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone?: string;
}

export interface BotActivityEntry {
  id: string;
  timestampIso: string;
  source: 'bot_api' | 'saved_messages';
  command: string;
  query: string;
  resultCount: number;
  status: 'ok' | 'error';
  detail?: string;
}

export interface WorkspaceStatusResponse {
  connected: boolean;
  hasEnvConfig: boolean;
  authStep: 'idle' | 'awaiting_code' | 'awaiting_password' | 'connected';
  account?: TelegramAccountProfile;
  botActive: boolean;
  botUsername?: string;
  botError?: string;
  savedListenerActive: boolean;
  activityLog: BotActivityEntry[];
}

export interface SearchFilesResponse {
  items: TelegramFileItem[];
  totalFetched: number;
  nextOffsetRate: number;
  nextOffsetId: number;
  hasMore: boolean;
}
