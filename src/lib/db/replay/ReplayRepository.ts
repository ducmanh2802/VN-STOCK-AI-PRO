import type { ReplayResult, ReplayManifest } from '../../replay/types.ts';

export class ReplayRepository {
  static async record(_result: ReplayResult, _manifest: ReplayManifest): Promise<void> {
    // Record paper replay run
  }
}