'use client';

import { useMemo, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TOGGLE_LINK_COMMAND } from '@lexical/link';
import {
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { $createQuoteNode, $createHeadingNode, type HeadingTagType } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode';
import { $createImageNode } from './ImageNode';

type ToolbarButtonProps = {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
};

function ToolbarButton({ label, onClick, icon }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />;
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-4 w-4 items-center justify-center">{children}</span>;
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-gray-500"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

export default function StaticToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [isUploading, setIsUploading] = useState(false);

  const buttons = useMemo(
    () => [
      {
        label: 'Undo',
        icon: (
          <Icon>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 5 3 8l3 3" />
              <path d="M3 8h5.5a3.5 3.5 0 1 1 0 7H6.5" />
            </svg>
          </Icon>
        ),
        onClick: () => editor.dispatchCommand(UNDO_COMMAND, undefined),
      },
      {
        label: 'Redo',
        icon: (
          <Icon>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 5l3 3-3 3" />
              <path d="M13 8H7.5a3.5 3.5 0 1 0 0 7H9.5" />
            </svg>
          </Icon>
        ),
        onClick: () => editor.dispatchCommand(REDO_COMMAND, undefined),
      },
    ],
    [editor],
  );

  const applyFormat = (format: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code') => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const applyHeading = (headingSize: HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createHeadingNode(headingSize));
      }
    });
  };

  const applyQuote = () => {
    editor.update(() => {
      const selection = $getSelection();

      if (!$isRangeSelection(selection)) {
        return;
      }

      $setBlocksType(selection, () => $createQuoteNode());
    });
  };

  const applyLink = () => {
    const url = window.prompt('Enter a URL');

    if (url === null) {
      return;
    }

    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url.trim() ? url.trim() : null);
  };

  return (
    <div className="sticky top-[148px] z-30 border-b border-gray-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-center gap-1 px-4 py-3 flex-wrap">
        {buttons.map((button) => (
          <ToolbarButton key={button.label} label={button.label} onClick={button.onClick} icon={button.icon} />
        ))}

        <Divider />

        <ToolbarButton label="H1" onClick={() => applyHeading('h1')} icon={<span className="font-bold text-xs">H1</span>} />
        <ToolbarButton label="H2" onClick={() => applyHeading('h2')} icon={<span className="font-bold text-xs">H2</span>} />
        <ToolbarButton label="H3" onClick={() => applyHeading('h3')} icon={<span className="font-bold text-xs">H3</span>} />

        <Divider />

        <ToolbarButton
          label="Bold"
          onClick={() => applyFormat('bold')}
          icon={
            <Icon>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3.5h3.8a2.2 2.2 0 1 1 0 4.4H5z" />
                <path d="M5 8h4a2.4 2.4 0 1 1 0 4.8H5z" />
              </svg>
            </Icon>
          }
        />
        <ToolbarButton
          label="Italic"
          onClick={() => applyFormat('italic')}
          icon={
            <Icon>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3.5h5" />
                <path d="M5 12.5h5" />
                <path d="M9 3.5 7 12.5" />
              </svg>
            </Icon>
          }
        />
        <ToolbarButton
          label="Underline"
          onClick={() => applyFormat('underline')}
          icon={
            <Icon>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3.5v4a3 3 0 0 0 6 0v-4" />
                <path d="M4 12.5h8" />
              </svg>
            </Icon>
          }
        />
        <ToolbarButton
          label="Strikethrough"
          onClick={() => applyFormat('strikethrough')}
          icon={
            <Icon>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h8" />
                <path d="M5 4.5c.5-1 1.7-1.5 3-1.5 1.6 0 3 .8 3 2.2 0 2.2-6 1.7-6 4.5 0 1.4 1.2 2.3 3 2.3 1.3 0 2.4-.4 3-1.2" />
              </svg>
            </Icon>
          }
        />
        <ToolbarButton
          label="Code"
          onClick={() => applyFormat('code')}
          icon={
            <Icon>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 5-3 3 3 3" />
                <path d="m10 5 3 3-3 3" />
              </svg>
            </Icon>
          }
        />
        <Divider />
        <ToolbarButton
          label="Link"
          onClick={applyLink}
          icon={
            <Icon>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 9.5 9.5 6.5" />
                <path d="M5.2 10.8 4 12a2.5 2.5 0 1 1-3.5-3.5l1.2-1.2" />
                <path d="M10.8 5.2 12 4a2.5 2.5 0 1 1 3.5 3.5l-1.2 1.2" />
              </svg>
            </Icon>
          }
        />
        <ToolbarButton
          label="Quote"
          onClick={applyQuote}
          icon={
            <Icon>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 7h2.5a1.5 1.5 0 0 1 0 3H6.2" />
                <path d="M8.5 7H11a1.5 1.5 0 0 1 0 3h-.8" />
              </svg>
            </Icon>
          }
        />
        <ToolbarButton
          label="Bullet list"
          onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
          icon={
            <Icon>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="3" cy="5" r="0.8" />
                <circle cx="3" cy="8" r="0.8" />
                <circle cx="3" cy="11" r="0.8" />
                <path d="M6 5h7M6 8h7M6 11h7" />
              </svg>
            </Icon>
          }
        />
        <ToolbarButton
          label="Numbered list"
          onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
          icon={
            <Icon>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 4h1v3m0 0h-1m1 0h1" />
                <path d="M6 5h7M6 8h7M6 11h7" />
                <path d="M2.5 9.5h1v3m0 0h-1m1 0h1" />
              </svg>
            </Icon>
          }
        />
        <ToolbarButton
          label="Divider"
          onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
          icon={
            <Icon>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 8h12" />
              </svg>
            </Icon>
          }
        />
        <button
          type="button"
          disabled={isUploading}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (isUploading) return;
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;

              const formData = new FormData();
              formData.append('file', file);

              setIsUploading(true);
              try {
                const res = await fetch('/api/upload-image', {
                  method: 'POST',
                  body: formData,
                });
                const data = await res.json();
                if (data.url) {
                  editor.update(() => {
                    $insertNodes([$createImageNode(data.url, file.name)]);
                  });
                } else {
                  console.error('[upload-image] Error:', data.error);
                }
              } catch (err) {
                console.error('[upload-image]', err);
              } finally {
                setIsUploading(false);
              }
            };
            input.click();
          }}
          className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Image"
          title="Image"
        >
          {isUploading ? (
            <Spinner />
          ) : (
            <Icon>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="12" height="10" rx="2" ry="2"/>
                <circle cx="5" cy="6" r="1.5"/>
                <path d="M2 10l3.5-3.5 6.5 6.5"/>
              </svg>
            </Icon>
          )}
        </button>
      </div>
    </div>
  );
}