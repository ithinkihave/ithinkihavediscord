export const EYES_DETECTION_THRESHOLD = 0.76;
export const MAX_VIDEO_FRAMES = 5;

export type MediaKind = "image" | "animated";

export type MediaTarget = {
	url: string;
	kind: MediaKind;
};

export type EyeMatch = {
	templateName: string;
	score: number;
	frameIndex: number;
	correlation: number;
	colorDistance: number;
};

export type DetectionTask = {
	bytes: Buffer;
	mediaKind: MediaKind;
	sourceLabel: string;
};

export function getEvenlySpacedTimestamps(
	durationSeconds: number,
	maxFrames = MAX_VIDEO_FRAMES,
): number[] {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		return [];
	}

	if (maxFrames <= 1) {
		return [Math.max(0, durationSeconds / 2)];
	}

	const frameCount = Math.max(1, maxFrames);
	const safeDuration = Math.max(0.04, durationSeconds);
	const startOffset = Math.min(0.02, safeDuration / 4);
	const end = Math.max(startOffset, safeDuration - 0.02);
	const span = Math.max(0, end - startOffset);
	const denominator = Math.max(1, frameCount - 1);

	return Array.from({ length: frameCount }, (_, index) => {
		const ratio = index / denominator;
		return startOffset + span * ratio;
	});
}
