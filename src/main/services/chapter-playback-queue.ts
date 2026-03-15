import { randomUUID } from 'node:crypto';
import type { ChapterPlaybackSource, PlaybackQueueItem, TtsSpeakRequest } from '../../shared/types';

const DEFAULT_MAX_CHUNK_LENGTH = 280;

export interface BuildQueueOptions {
  maxChunkLength?: number;
  firstChunkMaxLength?: number;
  startOrder?: number;
}

export function buildPlaybackQueue(
  request: Required<Pick<TtsSpeakRequest, 'providerId' | 'voiceId' | 'speed'>> & Partial<TtsSpeakRequest>,
  options: BuildQueueOptions = {}
): PlaybackQueueItem[] {
  const chapters = normalizeChapterSequence(request);
  return buildPlaybackQueueFromSources(chapters, request, options);
}

export function normalizeChapterSequence(request: Partial<TtsSpeakRequest>): ChapterPlaybackSource[] {
  if (request.chapterSequence?.length) {
    return request.chapterSequence.filter((item) => item.text.trim()).sort((a, b) => a.order - b.order);
  }

  const singleText = request.text?.trim();
  if (!singleText) {
    return [];
  }

  return [{
    chapterId: request.chapterId ?? 'current-chapter',
    chapterTitle: request.chapterTitle ?? request.chapterId ?? '当前选中内容',
    text: singleText,
    order: 0
  }];
}

export function buildPlaybackQueueFromSources(
  chapters: ChapterPlaybackSource[],
  request: Required<Pick<TtsSpeakRequest, 'providerId' | 'voiceId' | 'speed'>> & Partial<TtsSpeakRequest>,
  options: BuildQueueOptions = {}
): PlaybackQueueItem[] {
  const maxChunkLength = options.maxChunkLength ?? DEFAULT_MAX_CHUNK_LENGTH;
  const firstChunkMaxLength = options.firstChunkMaxLength;
  let order = options.startOrder ?? 0;

  return chapters.flatMap((chapter, chapterIndex) => {
    const chunks = splitTextIntoChunks(chapter.text, maxChunkLength, {
      firstChunkMaxLength: chapterIndex === 0 ? firstChunkMaxLength : undefined
    });
    return chunks.map((chunk: string, chunkIndex: number) => ({
      id: randomUUID(),
      bookId: request.bookId,
      chapterId: chapter.chapterId,
      title: chapter.chapterTitle,
      text: chunk,
      providerId: request.providerId,
      voiceId: request.voiceId,
      speed: request.speed,
      mode: request.mode,
      fallbackProviderId: request.fallbackProviderId,
      fallbackVoiceId: request.fallbackVoiceId,
      order: order++,
      chunkIndex,
      chunkCount: chunks.length
    } satisfies PlaybackQueueItem));
  });
}

export function splitTextIntoChunks(
  text: string,
  maxLength: number,
  options: { firstChunkMaxLength?: number } = {}
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const firstChunkMaxLength = options.firstChunkMaxLength;
  if (firstChunkMaxLength && firstChunkMaxLength > 0 && normalized.length > firstChunkMaxLength) {
    const initialChunks = splitTextIntoChunks(normalized, firstChunkMaxLength);
    const [firstChunk, ...rest] = initialChunks;
    const remainder = normalized.slice(firstChunk.length).trim();
    return remainder
      ? [firstChunk, ...splitTextIntoChunks(remainder, maxLength)]
      : [firstChunk, ...rest];
  }

  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer.trim()) {
      chunks.push(buffer.trim());
      buffer = '';
    }
  };

  const pushSentenceSegments = (paragraph: string) => {
    const sentences = paragraph.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [paragraph];
    sentences.forEach((sentence) => {
      const trimmed = sentence.trim();
      if (!trimmed) {
        return;
      }

      if (trimmed.length > maxLength) {
        flush();
        for (let index = 0; index < trimmed.length; index += maxLength) {
          chunks.push(trimmed.slice(index, index + maxLength));
        }
        return;
      }

      const candidate = buffer ? `${buffer} ${trimmed}` : trimmed;
      if (candidate.length > maxLength) {
        flush();
        buffer = trimmed;
      } else {
        buffer = candidate;
      }
    });
  };

  paragraphs.forEach((paragraph) => {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLength) {
      buffer = candidate;
      return;
    }
    pushSentenceSegments(paragraph);
  });

  flush();
  return chunks.length ? chunks : [normalized.slice(0, maxLength)];
}
