// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseMdh, exportToMdh, stripTags } from '../mdh-utils';

// ─── parseMdh ────────────────────────────────────────────────────────────────

describe('parseMdh', () => {
  // 1. Single tag, well-formed
  it('parses a single well-formed tag', () => {
    const raw = 'I am <tone=sarcastic> very happy </tone> about this.';
    const result = parseMdh(raw);

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0].key).toBe('tone');
    expect(result.tags[0].value).toBe('sarcastic');
    expect(result.tags[0].phrase).toBe('very happy');
    expect(result.tags[0].startIndex).toBe(raw.indexOf('<tone=sarcastic>'));
    expect(result.tags[0].endIndex).toBe(raw.indexOf('</tone>') + '</tone>'.length - 1);
  });

  // 2. Multiple tags in document order
  it('parses multiple tags in document order', () => {
    const raw =
      'He bought <culture=web3-degen> ape jpegs </culture> and was <tone=sarcastic> very happy </tone>.';
    const result = parseMdh(raw);

    expect(result.tags).toHaveLength(2);
    expect(result.tags[0].key).toBe('culture');
    expect(result.tags[1].key).toBe('tone');
  });

  // 3. plainText — tags removed, phrase text preserved, no double spaces
  it('produces plainText with tags removed and no double spaces', () => {
    const raw = 'I am <tone=sarcastic> very happy </tone> about this.';
    const { plainText } = parseMdh(raw);

    expect(plainText).toBe('I am very happy about this.');
    expect(plainText).not.toMatch(/ {2,}/);
  });

  // 4. Unknown/custom key is parsed without error
  it('parses an unknown key (no allowlist)', () => {
    const raw = 'The <vibe=chaotic> energy </vibe> was palpable.';
    const result = parseMdh(raw);

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0].key).toBe('vibe');
    expect(result.tags[0].value).toBe('chaotic');
    expect(result.tags[0].phrase).toBe('energy');
  });

  // 5. Hyphenated value
  it('parses a hyphenated value correctly', () => {
    const raw = 'He bought <culture=web3-degen> ape jpegs </culture>.';
    const result = parseMdh(raw);

    expect(result.tags[0].value).toBe('web3-degen');
  });

  // 6. Empty string input
  it('handles empty string input', () => {
    const result = parseMdh('');
    expect(result).toEqual({ tags: [], plainText: '', rawContent: '' });
  });

  // 7. Content with no tags
  it('returns empty tags array when no tags are present', () => {
    const raw = 'Just plain text with no semantic markup at all.';
    const result = parseMdh(raw);

    expect(result.tags).toEqual([]);
    expect(result.plainText).toBe(raw.trim());
  });

  // 8. Malformed tag (no closing tag) — silently ignored
  it('ignores malformed tags without throwing', () => {
    const raw = 'This <tone=sarcastic> has no closing tag and keeps going.';
    expect(() => parseMdh(raw)).not.toThrow();
    const result = parseMdh(raw);
    expect(result.tags).toHaveLength(0);
  });

  // 9. startIndex / endIndex accuracy — re-slicing gives the full match
  it('produces accurate startIndex and endIndex', () => {
    const raw = 'He bought <culture=web3-degen> ape jpegs </culture> on a whim.';
    const result = parseMdh(raw);
    const tag = result.tags[0];

    const sliced = raw.slice(tag.startIndex, tag.endIndex + 1);
    expect(sliced).toBe('<culture=web3-degen> ape jpegs </culture>');
  });

  // 12. stripTags roundtrip (tested here for convenience)
  it('stripTags output equals parseMdh(input).plainText', () => {
    const raw = 'I am <tone=sarcastic> very happy </tone> about this.';
    expect(stripTags(raw)).toBe(parseMdh(raw).plainText);
  });

  // 13. Roundtrip integrity — rawContent is always the original string
  it('preserves rawContent exactly', () => {
    const raw = 'I am <tone=sarcastic> very happy </tone> about this.';
    expect(parseMdh(raw).rawContent).toBe(raw);
  });

  it('throws when input is not a string', () => {
    // @ts-expect-error intentional wrong type for test
    expect(() => parseMdh(42)).toThrow('parseMdh: input must be a string');
  });
});

// ─── exportToMdh ─────────────────────────────────────────────────────────────

describe('exportToMdh', () => {
  beforeEach(() => {
    // Minimal DOM mocks for the browser-only function
    const anchor = {
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement;

    vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => anchor);
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  // 10. Empty content throws with correct prefix
  it('throws on empty content', () => {
    expect(() => exportToMdh('', 'file')).toThrow('exportToMdh: content must be a non-empty string');
  });

  it('throws on empty filename', () => {
    expect(() => exportToMdh('content', '')).toThrow('exportToMdh: filename must be a non-empty string');
  });

  // 11. Filename without .mdh gets the extension appended
  it('appends .mdh when filename lacks the extension', () => {
    const anchor = document.createElement('a');
    exportToMdh('some content', 'my-article');
    expect(anchor.download).toBe('my-article.mdh');
  });

  it('does not double-append .mdh when extension is already present', () => {
    const anchor = document.createElement('a');
    exportToMdh('some content', 'my-article.mdh');
    expect(anchor.download).toBe('my-article.mdh');
  });
});
