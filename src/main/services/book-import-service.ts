import { dialog } from 'electron';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Book, ImportBookResult } from '../../shared/types';
import { detectEncodingAndDecode, normalizeText, splitIntoChapters } from '../utils/text-import';

export class BookImportService {
  async importTxtBook(): Promise<ImportBookResult | null> {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '导入 TXT 小说',
      filters: [{ name: 'Text Files', extensions: ['txt'] }],
      properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    const filePath = filePaths[0];
    const buffer = await readFile(filePath);
    const { encoding, text, warnings } = detectEncodingAndDecode(buffer);
    const normalizedText = normalizeText(text);
    const chapters = splitIntoChapters(normalizedText);
    const title = path.basename(filePath, path.extname(filePath));

    const book: Book = {
      id: `book-${Date.now()}`,
      title,
      format: 'txt',
      path: filePath,
      encoding,
      size: buffer.byteLength,
      chapters
    };

    return { book, warnings };
  }
}
