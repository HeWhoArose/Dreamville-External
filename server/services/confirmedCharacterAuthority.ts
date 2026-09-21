import { worldRepository } from '../repositories/worldRepository';

export interface ConfirmedCharacterResolution {
	character: any | null;
	error?: {
		status: number;
		message: string;
		code?: string;
	};
}

export function resolveCanonicalConfirmedCharacter(
	worldId: string,
	submittedCharacter?: any,
	requestedCharacterId?: unknown
): ConfirmedCharacterResolution {
	const candidateId =
		typeof requestedCharacterId === 'string' && requestedCharacterId.trim()
			? requestedCharacterId.trim()
			: typeof submittedCharacter?.characterId === 'string' && submittedCharacter.characterId.trim()
			? submittedCharacter.characterId.trim()
			: null;

	if (!candidateId) {
		if (submittedCharacter) {
			return {
				character: null,
				error: {
					status: 400,
					code: 'CONFIRMED_CHARACTER_ID_REQUIRED',
					message: 'A confirmedCharacter.characterId is required for StoryRun creation.',
				},
			};
		}
		return { character: null };
	}

	const canonicalCharacter = worldRepository.getConfirmedCharacter(worldId, candidateId);
	if (!canonicalCharacter) {
		return {
			character: null,
			error: {
				status: 404,
				code: 'CONFIRMED_CHARACTER_NOT_FOUND',
				message: 'Confirmed character "' + candidateId + '" not found in world "' + worldId + '".',
			},
		};
	}

	return { character: canonicalCharacter };
}
