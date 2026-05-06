import {
  $applyNodeReplacement,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  TextNode,
} from 'lexical';

export type SerializedSemanticNode = SerializedTextNode & {
  semanticTag: string;
  semanticNote: string;
  type: 'semantic';
  version: 1;
};

export class SemanticNode extends TextNode {
  __semanticTag: string;
  __semanticNote: string;

  constructor(text = '', semanticTag = 'context', semanticNote = '', key?: NodeKey) {
    super(text, key);
    this.__semanticTag = semanticTag;
    this.__semanticNote = semanticNote;
  }

  static getType(): string {
    return 'semantic';
  }

  static clone(node: SemanticNode): SemanticNode {
    return new SemanticNode(node.__text, node.__semanticTag, node.__semanticNote, node.__key);
  }

  static importJSON(serializedNode: SerializedSemanticNode): SemanticNode {
    return $createSemanticNode(
      serializedNode.text,
      serializedNode.semanticTag ?? 'context',
      serializedNode.semanticNote ?? '',
    ).updateFromJSON(serializedNode);
  }

  exportJSON(): SerializedSemanticNode {
    return {
      ...super.exportJSON(),
      semanticTag: this.getSemanticTag(),
      semanticNote: this.getSemanticNote(),
      type: 'semantic',
      version: 1,
    };
  }

  updateFromJSON(serializedNode: SerializedSemanticNode): this {
    const self = super.updateFromJSON(serializedNode);
    self.__semanticTag = serializedNode.semanticTag ?? self.__semanticTag;
    self.__semanticNote = serializedNode.semanticNote ?? self.__semanticNote;
    return self;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.dataset.semanticTag = this.__semanticTag;
    dom.dataset.semanticNote = this.__semanticNote;
    dom.classList.add('semantic-token');
    dom.title = this.__semanticNote ? `${this.__semanticTag}: ${this.__semanticNote}` : this.__semanticTag;
    dom.style.background = 'rgba(240, 215, 255, 0.72)';
    dom.style.borderBottom = '1px solid rgba(26, 26, 26, 0.15)';
    dom.style.borderRadius = '0.2rem';
    dom.style.padding = '0 0.15em';
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const isUpdated = super.updateDOM(prevNode, dom, config);

    if (prevNode.__semanticTag !== this.__semanticTag) {
      dom.dataset.semanticTag = this.__semanticTag;
      dom.title = this.__semanticNote ? `${this.__semanticTag}: ${this.__semanticNote}` : this.__semanticTag;
    }

    if (prevNode.__semanticNote !== this.__semanticNote) {
      dom.dataset.semanticNote = this.__semanticNote;
      dom.title = this.__semanticNote ? `${this.__semanticTag}: ${this.__semanticNote}` : this.__semanticTag;
    }

    return isUpdated;
  }

  getSemanticTag(): string {
    return this.getLatest().__semanticTag;
  }

  getSemanticNote(): string {
    return this.getLatest().__semanticNote;
  }

  setSemanticTag(tag: string): this {
    const writable = this.getWritable();
    writable.__semanticTag = tag;
    return writable;
  }

  setSemanticNote(note: string): this {
    const writable = this.getWritable();
    writable.__semanticNote = note;
    return writable;
  }
}

export function $createSemanticNode(text: string, semanticTag = 'context', semanticNote = ''): SemanticNode {
  return $applyNodeReplacement(new SemanticNode(text, semanticTag, semanticNote));
}

export function $isSemanticNode(node: LexicalNode | null | undefined): node is SemanticNode {
  return node instanceof SemanticNode;
}