export interface SemanticTag {
  key: string;        // e.g. 'tone', 'intent', 'culture', 'idiom'
  value: string;      // e.g. 'sarcastic', 'persuade', 'web3-degen'
  phrase: string;     // The wrapped text content, trimmed
  startIndex: number; // Character index of '<' of the opening tag in rawContent
  endIndex: number;   // Character index of '>' of the closing tag in rawContent
}

export interface ParsedMdh {
  tags: SemanticTag[];  // All extracted annotations, in document order
  plainText: string;    // rawContent with all tags (opening + closing) removed, whitespace normalised
  rawContent: string;   // Original unmodified input string
}

const TAG_REGEX = /<([a-z][a-z0-9-]*)=([a-z0-9][a-z0-9-]*?)>\s*([\s\S]*?)\s*<\/\1>/g;

export function parseMdh(rawContent: string): ParsedMdh {
  if (typeof rawContent !== 'string') {
    throw new Error('parseMdh: input must be a string');
  }

  if (rawContent === '') {
    return { tags: [], plainText: '', rawContent: '' };
  }

  const tags: SemanticTag[] = [];
  let plainText = rawContent;

  // Collect all matches first so we can compute plainText in a single pass
  const matches: Array<{ match: RegExpExecArray }> = [];
  const regex = new RegExp(TAG_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = regex.exec(rawContent)) !== null) {
    matches.push({ match: m });
    tags.push({
      key: m[1],
      value: m[2],
      phrase: m[3].trim(),
      startIndex: m.index,
      endIndex: m.index + m[0].length - 1,
    });
  }

  // Replace each full tag match with just the trimmed phrase, then normalise whitespace
  plainText = rawContent.replace(new RegExp(TAG_REGEX.source, 'g'), (_, _key, _value, phrase: string) =>
    phrase.trim()
  );
  plainText = plainText.replace(/ {2,}/g, ' ').trim();

  return { tags, plainText, rawContent };
}

export function exportToMdh(content: string, filename: string): void {
  if (!content) {
    throw new Error('exportToMdh: content must be a non-empty string');
  }
  if (!filename) {
    throw new Error('exportToMdh: filename must be a non-empty string');
  }

  const safeFilename = filename.endsWith('.mdh') ? filename : `${filename}.mdh`;

  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function stripTags(rawContent: string): string {
  return parseMdh(rawContent).plainText;
}
