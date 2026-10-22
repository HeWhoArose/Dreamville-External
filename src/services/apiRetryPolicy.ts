/**
 * Limits automatic fetch retries to safe transient reads and explicit server-startup pages.
 * Retrying a mutating POST after a gateway timeout can replay an action that committed
 * before its HTTP response was lost. A JSON 503 is an application result (for example,
 * narration AI exhaustion) and must never be silently replayed.
 */
export function shouldRetryTransientHttpResponse(
	status: number,
	contentType: string,
	bodyPreview: string,
	method = 'GET',
): boolean {
	const methodUpper = String(method || 'GET').toUpperCase();
	const isSafeMethod = methodUpper === 'GET' || methodUpper === 'HEAD' || methodUpper === 'OPTIONS';
	const contentTypeLower = String(contentType || '').toLowerCase();
	const body = String(bodyPreview || '').trim();
	const looksLikeJson = contentTypeLower.includes('application/json')
		|| body.startsWith('{')
		|| body.startsWith('[');
	const isExplicitStartupPage = /starting server|warmup\.html/i.test(body);

	if (status === 502 || status === 504) {
		return isSafeMethod;
	}
	if (status !== 503 || looksLikeJson) return false;

	// For reads, an HTML 503 commonly means the platform's warmup proxy answered.
	if (isSafeMethod) {
		return contentTypeLower.includes('text/html')
			|| /^<!doctype\s+html/i.test(body)
			|| /^<html\b/i.test(body)
			|| isExplicitStartupPage;
	}

	// For writes, retry only an unmistakable pre-app startup page—not a generic 503.
	return isExplicitStartupPage;
}
