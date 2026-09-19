import { worldRepository } from '../repositories/worldRepository';

export class CampaignArchiveService {
  public static validateArchive(archive: any): { valid: boolean; errorReason?: string; details?: any } {
    if (!archive || typeof archive !== 'object') {
      return { valid: false, errorReason: 'Archive must be a valid JSON object.' };
    }
    if (!archive.header || !archive.header.archiveId || !archive.header.version) {
      return { valid: false, errorReason: 'Archive header missing required metadata.' };
    }
    if (!archive.payload) {
      return { valid: false, errorReason: 'Archive payload missing.' };
    }
    return { valid: true, details: { archiveId: archive.header.archiveId, version: archive.header.version } };
  }

  public exportArchive(storyId: string, title?: string): any {
    return worldRepository.exportCampaignArchive(storyId, title);
  }

  public importArchive(archive: any, storyId?: string): { success: boolean; storyId?: string; errorReason?: string } {
    const val = CampaignArchiveService.validateArchive(archive);
    if (!val.valid) {
      return { success: false, errorReason: val.errorReason };
    }
    return worldRepository.restoreCampaignArchive(archive, storyId || 'default_story');
  }
}

export const campaignArchiveService = new CampaignArchiveService();
