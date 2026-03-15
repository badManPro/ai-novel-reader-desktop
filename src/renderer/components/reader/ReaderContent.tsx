import type { RefObject } from 'react';
import type { Book, Chapter } from '../../../shared/types';

interface ReaderContentProps {
  book: Book | null;
  chapter: Chapter | null;
  readingPosition: number;
  contentRef: RefObject<HTMLElement>;
  onScroll: () => void;
}

const placeholderParagraphs = [
  '导入小说后，阅读页会根据当前书籍与章节自动恢复滚动位置。',
  '这一步已经把设置面板和模型控制台移出阅读页，保留阅读、章节和播放三类信息。'
];

export function ReaderContent({ book, chapter, readingPosition, contentRef, onScroll }: ReaderContentProps) {
  const paragraphs = (chapter?.content ?? placeholderParagraphs.join('\n\n'))
    .split('\n\n')
    .filter(Boolean);

  return (
    <section className="content-frame immersive-content-frame">
      <div className="content-frame-header">
        <div>
          <p className="eyebrow">正文阅读</p>
          <h3>{chapter?.title ?? '导入后开始阅读'}</h3>
        </div>
        <span className="muted">滚动定位：{Math.round(readingPosition)}px</span>
      </div>

      <section ref={contentRef} className="content-card immersive-content-card" onScroll={onScroll}>
        <div className="content-meta">
          <p className="chapter-tag">{chapter?.title ?? '导入后开始阅读'}</p>
          <span className="muted">{book ? `${book.chapters.length} 章 · ${book.format.toUpperCase()}` : '请先从书库选择一本书'}</span>
        </div>
        {paragraphs.map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
        ))}
      </section>
    </section>
  );
}
