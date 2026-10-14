import { MacroRegimeService } from '../macro-regime/MacroRegimeService.ts';

export class MacroIntelligenceService {
  public static async getSnapshot(options?: {
    asOfDate?: string;
    forceRefresh?: boolean;
  }): Promise<any> {
    return MacroRegimeService.getSnapshot(options);
  }
}
