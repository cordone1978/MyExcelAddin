export type PreviewItemGroup = "detail" | "annotation";

export type PreviewItem = {
  id: string;
  name: string;
  group: PreviewItemGroup;
  imageUrl?: string | null;
  order: number;
  visible: boolean;
  assemblyGroup?: number | null;
};

export type PreviewScene = {
  baseImageUrl?: string | null;
  items: PreviewItem[];
  placeholder?: string | null;
  highlightedItemId?: string | null;
};

export type PreviewSize = {
  width: number;
  height: number;
};

export type DialogPreviewController = {
  resize: (size: PreviewSize) => void;
  setScene: (scene: PreviewScene) => void;
  exportCompositeImageDataUrl: (maxChars?: number) => string | null;
};

export type DialogPreviewCallbacks = {
  onHoverItemId?: (itemId: string | null) => void;
  onClickItemId?: (itemId: string) => void;
};
