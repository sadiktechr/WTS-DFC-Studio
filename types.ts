
export interface OCRResult {
  html: string;
  timestamp: number;
}

export interface StoredTable {
  id: string;
  html: string;
  timestamp: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface StoredTemplate {
  id: string;
  name: string;
  html: string;
  timestamp: number;
}
