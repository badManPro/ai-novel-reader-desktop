import type { Book, SupportedEncoding } from '../../shared/types';

function stripUtf8Bom(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3);
  }

  return buffer;
}

function swapUtf16Bytes(buffer: Buffer) {
  const swapped = Buffer.from(buffer);

  for (let index = 0; index + 1 < swapped.length; index += 2) {
    const current = swapped[index];
    swapped[index] = swapped[index + 1];
    swapped[index + 1] = current;
  }

  return swapped;
}

function hasReplacementRate(text: string, threshold = 0.02) {
  if (!text.length) {
    return false;
  }

  const replacementCount = Array.from(text).filter((char) => char === '�').length;
  return replacementCount / text.length > threshold;
}

function scoreDecodedText(text: string) {
  if (!text.trim()) {
    return -100;
  }

  let score = 0;
  score += Math.min(text.length / 120, 80);

  const lineBreaks = (text.match(/\n/g) ?? []).length;
  score += Math.min(lineBreaks, 25);

  if (/[\u4e00-\u9fff]/.test(text)) {
    score += 30;
  }

  if (/第.{1,12}[章节回幕卷]/.test(text)) {
    score += 20;
  }

  if (hasReplacementRate(text)) {
    score -= 120;
  }

  return score;
}

export function detectEncodingAndDecode(buffer: Buffer): { encoding: SupportedEncoding; text: string; warnings: string[] } {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return {
      encoding: 'utf-16le',
      text: new TextDecoder('utf-16le').decode(buffer.subarray(2)),
      warnings: []
    };
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return {
      encoding: 'utf-16be',
      text: new TextDecoder('utf-16le').decode(swapUtf16Bytes(buffer.subarray(2))),
      warnings: []
    };
  }

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return {
      encoding: 'utf-8-bom',
      text: new TextDecoder('utf-8').decode(stripUtf8Bom(buffer)),
      warnings: []
    };
  }

  const candidates: Array<{ encoding: SupportedEncoding; label: string }> = [
    { encoding: 'utf-8', label: 'utf-8' },
    { encoding: 'gb18030', label: 'gb18030' },
    { encoding: 'utf-16le', label: 'utf-16le' }
  ];

  const decoded = candidates
    .map((candidate) => {
      try {
        const text = new TextDecoder(candidate.label).decode(buffer);
        return {
          encoding: candidate.encoding,
          text,
          score: scoreDecodedText(text)
        };
      } catch {
        return null;
      }
    })
    .filter((item): item is { encoding: SupportedEncoding; text: string; score: number } => Boolean(item))
    .sort((left, right) => right.score - left.score)[0];

  if (decoded) {
    const warnings = decoded.encoding === 'utf-8'
      ? []
      : [`已使用 ${decoded.encoding} 策略读取文本，后续可继续扩展更精细的编码检测。`];

    return {
      encoding: decoded.encoding,
      text: decoded.text,
      warnings
    };
  }

  return {
    encoding: 'unknown',
    text: buffer.toString('utf-8'),
    warnings: ['未能可靠识别编码，已按 UTF-8 回退读取，可能存在乱码。']
  };
}

export function normalizeText(rawText: string) {
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
}

const fullWidthDigitsMap: Record<string, string> = {
  '０': '0',
  '１': '1',
  '２': '2',
  '３': '3',
  '４': '4',
  '５': '5',
  '６': '6',
  '７': '7',
  '８': '8',
  '９': '9'
};

const chapterTitlePatterns = [
  /^第\s*[0-9零〇一二三四五六七八九十百千万两]+\s*[章节回幕卷集部篇节](?:\s*[：:\-—_.、]\s*.*|\s+.*|[\u4e00-\u9fffA-Za-z0-9]{1,20})?$/i,
  /^chapter\s*[0-9ivxlcdm]+(?:\s*[：:\-—_.、]\s*.*|\s+.*)?$/i,
  /^(楔子|序章|序幕|引子|前言|正文|终章|尾声|后记|番外|番外篇|外传|卷首语|卷末语)(?:\s*[：:\-—_.、]\s*.*|\s+.*|[\u4e00-\u9fffA-Za-z0-9]{1,20})?$/i,
  /^(上卷|中卷|下卷|卷[零〇一二三四五六七八九十百千万两0-9]+)(?:\s*[：:\-—_.、]\s*.*|\s+.*|[\u4e00-\u9fffA-Za-z0-9]{1,20})?$/i
];

function normalizeChapterCandidate(line: string) {
  return line
    .replace(/[\u3000\t]/g, ' ')
    .replace(/[０-９]/g, (digit) => fullWidthDigitsMap[digit] ?? digit)
    .replace(/[【\[（(「『《〈]/g, '')
    .replace(/[】\]）)」』》〉]/g, '')
    .replace(/^[\s\-—_=~·•※＊*#>]+/, '')
    .replace(/[\s]+/g, ' ')
    .trim();
}

function isChapterTitleLine(line: string, previousLine?: string) {
  const normalized = normalizeChapterCandidate(line);

  if (!normalized || normalized.length > 40) {
    return false;
  }

  const hasTitlePattern = chapterTitlePatterns.some((pattern) => pattern.test(normalized));
  if (!hasTitlePattern) {
    return false;
  }

  if (!previousLine) {
    return true;
  }

  return previousLine.trim().length === 0;
}

export function splitIntoChapters(text: string) {
  const lines = text.split('\n');
  const chapterIndexes = lines
    .map((line, index) => (isChapterTitleLine(line, lines[index - 1]) ? index : -1))
    .filter((index) => index >= 0);
  const chapters: Book['chapters'] = [];

  if (!chapterIndexes.length) {
    return [{
      id: 'chapter-1',
      title: '正文',
      content: text,
      order: 1
    }];
  }

  const boundaries = [...chapterIndexes, lines.length];

  boundaries.slice(0, -1).forEach((startIndex, position) => {
    const endIndex = boundaries[position + 1];
    const title = lines[startIndex].trim() || `第${position + 1}章`;
    const contentLines = lines.slice(startIndex + 1, endIndex);
    const content = contentLines.join('\n').trim();

    if (!content) {
      return;
    }

    chapters.push({
      id: `chapter-${position + 1}`,
      title,
      content,
      order: position + 1
    });
  });

  const prefaceContent = lines.slice(0, chapterIndexes[0]).join('\n').trim();
  if (prefaceContent) {
    chapters.unshift({
      id: 'chapter-0',
      title: '开篇',
      content: prefaceContent,
      order: 0
    });

    chapters.forEach((chapter, index) => {
      chapter.id = `chapter-${index + 1}`;
      chapter.order = index + 1;
    });
  }

  if (!chapters.length) {
    return [{
      id: 'chapter-1',
      title: '正文',
      content: text,
      order: 1
    }];
  }

  return chapters;
}
