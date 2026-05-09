// TODO: rich text formatting (bold/italic) is not preserved in .mdh round-trips
import type { LexicalEditor, LexicalNode } from 'lexical';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { $isHeadingNode } from '@lexical/rich-text';
import { $isListNode, $isListItemNode } from '@lexical/list';
import { $createSemanticNode, $isSemanticNode } from '@/app/components/editor/SemanticNode';
import { parseMdh } from '@/lib/mdh-utils';

function getBlockText(block: LexicalNode): string {
  const inlines = 'getChildren' in block
    ? (block as { getChildren: () => LexicalNode[] }).getChildren()
    : [];

  let blockText = '';
  for (const node of inlines) {
    if ($isSemanticNode(node)) {
      const tag = node.getSemanticTag();
      // Fall back to tag name when note is empty so the output satisfies the
      // parseMdh regex which requires a non-empty value segment.
      const note = node.getSemanticNote() || tag;
      blockText += `<${tag}=${note}> ${node.getTextContent()} </${tag}>`;
    } else {
      blockText += node.getTextContent();
    }
  }
  return blockText;
}

/**
 * Walk the Lexical editor state and produce a raw .mdh string suitable for
 * Arweave upload. The output is guaranteed to be parseable by parseMdh().
 */
export function serialiseLexicalToMdh(editor: LexicalEditor): string {
  let output = '';

  editor.getEditorState().read(() => {
    const blocks = $getRoot().getChildren();

    for (const block of blocks) {
      if ($isListNode(block)) {
        const tag = block.getTag(); // 'ul' or 'ol'
        const items = block.getChildren();
        for (const item of items) {
          if ($isListItemNode(item)) {
            const itemText = getBlockText(item);
            if (itemText.trim()) {
              const prefix = tag === 'ol' ? '1.' : '*';
              output += `${prefix} ${itemText}\n`;
            }
          }
        }
        output += '\n';
        continue;
      }

      const blockText = getBlockText(block);
      if (!blockText.trim()) continue;

      if ($isHeadingNode(block)) {
        const level = parseInt(block.getTag()[1], 10);
        output += '#'.repeat(level) + ' ' + blockText + '\n\n';
      } else {
        output += blockText + '\n\n';
      }
    }
  });

  return output.trim();
}

/**
 * Parse a raw .mdh string and rebuild the Lexical editor state in-place.
 * Plain text segments become ParagraphNode + TextNode; semantic tags become
 * SemanticNode. Paragraph breaks in the source string are preserved.
 */
export function deserialiseMdhToLexical(mdhString: string, editor: LexicalEditor): void {
  const { tags } = parseMdh(mdhString);

  editor.update(() => {
    const root = $getRoot();
    root.clear();

    // Build an ordered list of paragraph ranges by splitting on blank lines.
    const paraRegex = /\n{2,}/g;
    let lastEnd = 0;
    const paragraphRanges: Array<{ text: string; start: number }> = [];

    let sepMatch: RegExpExecArray | null;
    while ((sepMatch = paraRegex.exec(mdhString)) !== null) {
      const text = mdhString.slice(lastEnd, sepMatch.index);
      if (text.trim()) {
        paragraphRanges.push({ text, start: lastEnd });
      }
      lastEnd = sepMatch.index + sepMatch[0].length;
    }
    const tail = mdhString.slice(lastEnd);
    if (tail.trim()) {
      paragraphRanges.push({ text: tail, start: lastEnd });
    }

    if (paragraphRanges.length === 0) {
      const para = $createParagraphNode();
      para.append($createTextNode(''));
      root.append(para);
      return;
    }

    for (const { text: paraText, start: paraStart } of paragraphRanges) {
      const para = $createParagraphNode();
      const paraEnd = paraStart + paraText.length;

      // Only include tags that sit entirely within this paragraph.
      const paraTags = tags.filter(t => t.startIndex >= paraStart && t.endIndex < paraEnd);

      let pos = 0;
      for (const tag of paraTags) {
        const relStart = tag.startIndex - paraStart;
        const relEnd = tag.endIndex - paraStart + 1;

        const before = paraText.slice(pos, relStart);
        if (before) para.append($createTextNode(before));
        para.append($createSemanticNode(tag.phrase, tag.key, tag.value));
        pos = relEnd;
      }

      const remaining = paraText.slice(pos);
      if (remaining) para.append($createTextNode(remaining));

      root.append(para);
    }
  });
}
