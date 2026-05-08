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

export type MdhBlock = HeadingBlock | ParagraphBlock;

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
    const headingMatch = text.match(/^(#{1,3}) ([\s\S]+)/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: stripTags(headingMatch[2].trim()),
      });
      continue;
    }

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
