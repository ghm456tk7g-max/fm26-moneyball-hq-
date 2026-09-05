import type { DatasetType, ImportResult, Player, Settings, TransferDecision } from './types';

export {};

declare global {
  interface Window {
    moneyball: {
      startupStatus: () => Promise<{ notice: string }>;
      reportRendererError: (message: string, componentStack: string) => Promise<boolean>;
      importPlayers: (datasetType: DatasetType) => Promise<ImportResult>;
      listPlayers: (datasetType: DatasetType) => Promise<Player[]>;
      toggleShortlist: (id: number) => Promise<boolean>;
      getSettings: () => Promise<Settings>;
      saveSettings: (settings: Settings) => Promise<Settings>;
      backup: () => Promise<{ canceled: boolean; path?: string }>;
      restoreBackup: () => Promise<{ canceled: boolean; safetyPath?: string }>;
      transferDecision: (playerId: number) => Promise<TransferDecision>;
    };
  }
}
