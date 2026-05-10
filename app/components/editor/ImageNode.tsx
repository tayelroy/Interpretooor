'use client';

import {
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type { JSX } from 'react';

export type SerializedImageNode = Spread<
  { src: string; alt: string; type: 'image'; version: 1 },
  SerializedLexicalNode
>;

function ImageComponent({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className="my-2 max-w-full rounded-md"
      draggable={false}
    />
  );
}

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __alt: string;

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__alt, node.__key);
  }

  constructor(src: string, alt: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__alt = alt;
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.style.display = 'contents';
    return div;
  }

  updateDOM(): false {
    return false;
  }

  static importJSON(serialized: SerializedImageNode): ImageNode {
    return new ImageNode(serialized.src, serialized.alt);
  }

  exportJSON(): SerializedImageNode {
    return {
      type: 'image',
      version: 1,
      src: this.__src,
      alt: this.__alt,
    };
  }

  decorate(): JSX.Element {
    return <ImageComponent src={this.__src} alt={this.__alt} />;
  }
}

export function $createImageNode(src: string, alt = ''): ImageNode {
  return new ImageNode(src, alt);
}
