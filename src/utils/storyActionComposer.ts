export function mergeSuggestedActionText(current: string, suggestion: string): string {
	const cleanSuggestion = suggestion.trim();
	if (!cleanSuggestion) return current;
	const cleanCurrent = current.trim();
	return cleanCurrent ? cleanCurrent + ' ' + cleanSuggestion : cleanSuggestion;
}
