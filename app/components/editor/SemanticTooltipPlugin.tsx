'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

type TooltipState = {
  note: string;
  tag: string;
  x: number;
  y: number;
} | null;

interface SemanticTooltipPluginProps {
  enabled: boolean;
}

export default function SemanticTooltipPlugin({ enabled }: SemanticTooltipPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  useEffect(() => {
    if (!enabled) {
      setTooltip(null);
      editor.setEditable(true);
      return;
    }

    editor.setEditable(false);

    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        setTooltip(null);
        return;
      }

      const semanticElement = target.closest<HTMLElement>('[data-semantic-tag]');

      if (!semanticElement) {
        setTooltip(null);
        return;
      }

      setTooltip({
        note: semanticElement.dataset.semanticNote ?? '',
        tag: semanticElement.dataset.semanticTag ?? 'semantic',
        x: event.clientX,
        y: event.clientY,
      });
    };

    const clearTooltip = () => setTooltip(null);

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerleave', clearTooltip);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerleave', clearTooltip);
    };
  }, [editor, enabled]);

  if (!tooltip || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-50 max-w-xs rounded-2xl border border-ink/10 bg-ink px-4 py-3 text-parchment shadow-[0_16px_40px_rgba(0,0,0,0.24)]"
      style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
    >
      <div className="text-[10px] uppercase tracking-[0.24em] text-pale-lavender/80">{tooltip.tag}</div>
      {tooltip.note ? <div className="mt-2 text-sm leading-relaxed text-parchment/90">{tooltip.note}</div> : null}
    </div>,
    document.body,
  );
}