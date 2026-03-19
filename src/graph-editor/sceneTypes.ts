export type ViewMode = "front" | "top" | "bird";

export type SelectedTarget =
  | { type: "component"; productId: string; componentId: string }
  | { type: "port"; productId: string; componentId: string; portId: string }
  | { type: "link"; linkId: string }
  | null;

export type Hotspot = {
  id: string;
  label: string;
  x: number;
  y: number;
};

export type ComponentPort = {
  id: string;
  name: string;
  x: number;
  y: number;
  direction?: "in" | "out" | "both";
};

export type PortEndpointRef = {
  productId: string;
  componentId: string;
  portId: string;
};

export type PipeEndpointKey = "start" | "end";

export type PipeState = {
  startBinding: PortEndpointRef | null;
  endBinding: PortEndpointRef | null;
  startFreePoint: { x: number; y: number };
  endFreePoint: { x: number; y: number };
};

export type ProductComponent = {
  id: string;
  name: string;
  kind: "silo" | "pipe" | "support" | "port";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  imageUrl?: string;
  zIndex?: number;
  layers?: ProductComponentLayer[];
  ports?: ComponentPort[];
  parameters: Record<string, string>;
  hotspots: Hotspot[];
};

export type ProductComponentLayer = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl: string;
  fallbackImageUrl?: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  opacity?: number;
  zIndex?: number;
  role?: "base" | "highlight" | "shadow" | "overlay";
};

export type ProductModel = {
  id: string;
  name: string;
  x: number;
  y: number;
  viewMode: ViewMode;
  templateId?: string;
  components: ProductComponent[];
  pipeState?: PipeState;
};

export type MaterialFlowLink = {
  id: string;
  from: { productId: string; componentId: string; portId?: string };
  to: { productId: string; componentId: string; portId?: string };
  flow: "idle" | "flowing";
  materialName: string;
};

export type GraphScene = {
  products: ProductModel[];
  links: MaterialFlowLink[];
  updatedAt: string;
};

export type ProductTemplate = {
  templateId: string;
  name: string;
  aliases?: string[];
  defaultViewMode: ViewMode;
  connectionRules?: {
    allowsTargetTemplateIds?: string[];
    allowsSourceKinds?: Array<"silo" | "pipe" | "support" | "port">;
    allowsTargetKinds?: Array<"silo" | "pipe" | "support" | "port">;
  };
  components: ProductComponent[];
};

export type ProductModelMeta = {
  templateId?: string;
};
