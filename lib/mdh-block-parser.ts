import type { SemanticTag } from './mdh-utils';
import { stripTags } from './mdh-utils';

export type HeadingBlock = {
  type: 'heading';
  level: 1 | 2 | 3;
  text: string;
};

export type ParagraphBlock = {
  type: 'paragraph';
  rawText: string;
  tags: SemanticTag[];
  startOffset: number;
};

export type ListBlock = {
  type: 'list';
  ordered: boolean;
  items: Array<{
    rawText: string;
    tags: SemanticTag[];
    startOffset: number;
  }>;
};

export type MdhBlock = HeadingBlock | ParagraphBlock | ListBlock;

export function parseMdhBlocks(rawContent: string, tags: SemanticTag[]): MdhBlock[] {
  const blocks: MdhBlock[] = [];

  // Split on blank lines while tracking absolute char offsets
  const paraRegex = /\n{2,}/g;
  let lastEnd = 0;
  const ranges: Array<{ text: string; start: number }> = [];

  let sep: RegExpExecArray | null;
  while ((sep = paraRegex.exec(rawContent)) !== null) {
    const text = rawContent.slice(lastEnd, sep.index);
    if (text.trim()) ranges.push({ text, start: lastEnd });
    lastEnd = sep.index + sep[0].length;
  }
  const tail = rawContent.slice(lastEnd);
  if (tail.trim()) ranges.push({ text: tail, start: lastEnd });

  for (const { text, start } of ranges) {
    // 1. Heading
    const headingMatch = text.match(/^(#{1,3}) ([\s\S]+)/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: stripTags(headingMatch[2].trim()),
      });
      continue;
    }

    // 2. List
    const listLines = text.split('\n');
    const firstLineMatch = listLines[0].match(/^([*\-]|\d+\.) /);
    if (firstLineMatch) {
      const ordered = /^\d/.test(firstLineMatch[1]);
      const items: ListBlock['items'] = [];
      let currentOffset = start;

      for (const line of listLines) {
        const itemMatch = line.match(/^([*\-]|\d+\.)\s+(.*)/);
        if (itemMatch) {
          const itemContent = itemMatch[2];
          const lineStart = currentOffset;
          const lineEnd = lineStart + line.length;
          
          items.push({
            rawText: itemContent,
            tags: tags.filter(t => t.startIndex >= lineStart && t.endIndex < lineEnd),
            startOffset: lineStart + (line.length - itemContent.length),
          });
        }
        currentOffset += line.length + 1; // +1 for the newline
      }

      if (items.length > 0) {
        blocks.push({ type: 'list', ordered, items });
        continue;
      }
    }

    // 3. Paragraph
    const end = start + text.length;
    blocks.push({
      type: 'paragraph',
      rawText: text,
      tags: tags.filter(t => t.startIndex >= start && t.endIndex < end),
      startOffset: start,
    });
  }

  return blocks;
}
