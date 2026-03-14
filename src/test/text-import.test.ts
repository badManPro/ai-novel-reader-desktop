import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, splitIntoChapters } from '../main/utils/text-import';

test('splitIntoChapters recognizes common web novel chapter title variants', () => {
  const text = normalizeText(`楔子
楔子内容

第1章 初见
第一章内容

第001章 再会
第二章内容

第一百二十章 大结局
第三章内容

尾声
尾声内容

番外：春日特辑
番外内容`);

  const chapters = splitIntoChapters(text);

  assert.deepEqual(
    chapters.map((chapter) => chapter.title),
    ['楔子', '第1章 初见', '第001章 再会', '第一百二十章 大结局', '尾声', '番外：春日特辑']
  );
  assert.equal(chapters[0]?.content, '楔子内容');
  assert.equal(chapters[5]?.content, '番外内容');
});

test('splitIntoChapters supports full-width digits, spaces and punctuation variants', () => {
  const text = normalizeText(`  第　１２　章 ：风起
这一章开始了。

【第２３章】夜谈
第二段内容。

Chapter 24 - New World
英文标题内容。`);

  const chapters = splitIntoChapters(text);

  assert.deepEqual(
    chapters.map((chapter) => chapter.title),
    ['第　１２　章 ：风起', '【第２３章】夜谈', 'Chapter 24 - New World']
  );
  assert.equal(chapters[1]?.content, '第二段内容。');
});

test('splitIntoChapters keeps preface before first detected chapter and avoids whole-book single chapter fallback', () => {
  const text = normalizeText(`作品相关
这里是作者写在前面的话。

序章
序章内容。

第 2 章 重逢
第二章内容。`);

  const chapters = splitIntoChapters(text);

  assert.equal(chapters.length, 3);
  assert.deepEqual(
    chapters.map((chapter) => ({ title: chapter.title, order: chapter.order })),
    [
      { title: '开篇', order: 1 },
      { title: '序章', order: 2 },
      { title: '第 2 章 重逢', order: 3 }
    ]
  );
  assert.match(chapters[0]?.content ?? '', /作者写在前面的话/);
});

test('splitIntoChapters falls back to one chapter when no chapter headings are present', () => {
  const text = normalizeText(`这是一整本没有明确章节标题的短篇小说。
只有正文内容。
没有分章标记。`);

  const chapters = splitIntoChapters(text);

  assert.equal(chapters.length, 1);
  assert.equal(chapters[0]?.title, '正文');
  assert.match(chapters[0]?.content ?? '', /没有明确章节标题/);
});
