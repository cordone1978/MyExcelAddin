import { equipmentAssetPath } from "./assetPaths";
import { GraphScene, PipeState, ProductModel, ProductTemplate } from "./sceneTypes";

// Template authoring notes:
// 1. Prefer real PNG files under assets/equipment/<product-dir>/...
// 2. Keep fallbackImageUrl so the editor still renders before real assets arrive.
// 3. Component x/y/width/height describe the component bounding box.
// 4. Layer x/y/width/height describe the image placement inside that component.
// 5. ports are the line anchors; hotspots are the click/annotation points.

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildSiloSvg() {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="136" height="220" viewBox="0 0 136 220">
      <defs>
        <linearGradient id="tank" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#f5f7fb"/>
          <stop offset="45%" stop-color="#cfd7e2"/>
          <stop offset="100%" stop-color="#aeb8c5"/>
        </linearGradient>
      </defs>
      <ellipse cx="68" cy="34" rx="42" ry="18" fill="#edf1f6" stroke="#8c97a7" stroke-width="2"/>
      <rect x="26" y="34" width="84" height="108" rx="12" fill="url(#tank)" stroke="#7d899a" stroke-width="2"/>
      <polygon points="38,142 98,142 76,186 60,186" fill="#c3ccd8" stroke="#7d899a" stroke-width="2"/>
      <ellipse cx="68" cy="34" rx="22" ry="6" fill="#ffffff" opacity="0.55"/>
      <rect x="54" y="176" width="28" height="26" rx="9" fill="#768394" stroke="#5e6874" stroke-width="2"/>
      <rect x="57" y="181" width="22" height="7" rx="4" fill="#dce3ea" opacity="0.55"/>
    </svg>
  `);
}

function buildSiloHighlightSvg() {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="136" height="190" viewBox="0 0 136 190">
      <ellipse cx="68" cy="34" rx="42" ry="18" fill="#ffffff" opacity="0.18"/>
      <rect x="26" y="34" width="84" height="108" rx="12" fill="#cfe6ff" opacity="0.18"/>
      <polygon points="38,142 98,142 76,186 60,186" fill="#d7ecff" opacity="0.22"/>
    </svg>
  `);
}

function buildFullCanvasHighlightSvg() {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="680" height="680" viewBox="0 0 680 680">
      <rect x="0" y="0" width="680" height="680" fill="#d9ebff" opacity="0.08"/>
    </svg>
  `);
}

function buildOverallMachineHighlightSvg() {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="680" height="680" viewBox="0 0 680 680">
      <ellipse cx="340" cy="632" rx="140" ry="18" fill="#9fc3ea" opacity="0.12"/>
      <rect x="146" y="154" width="390" height="338" rx="18" fill="#d9ebff" opacity="0.08"/>
      <rect x="248" y="502" width="186" height="72" rx="18" fill="#d9ebff" opacity="0.12"/>
    </svg>
  `);
}

function buildSupportSvg() {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="88" viewBox="0 0 12 88">
      <rect x="2" y="2" width="8" height="84" rx="3" fill="#4f5d6c"/>
      <rect x="3" y="5" width="3" height="76" rx="2" fill="#758294" opacity="0.45"/>
    </svg>
  `);
}

function buildPortSvg(width: number, height: number, body = "#7f8c99") {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="10" fill="${body}" stroke="#5f6d7b" stroke-width="2"/>
      <rect x="4" y="6" width="${width - 8}" height="8" rx="4" fill="rgba(255,255,255,0.38)"/>
    </svg>
  `);
}

function buildPortHighlightSvg(width: number, height: number) {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="10" fill="#d4e7ff" opacity="0.18" stroke="#9bc2f2" stroke-width="2"/>
    </svg>
  `);
}

function buildPipeSvg() {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="28" viewBox="0 0 240 28">
      <rect x="1.5" y="1.5" width="237" height="25" rx="12.5" fill="#aeb9c7" stroke="#6e7a89" stroke-width="2"/>
      <rect x="18" y="4" width="204" height="5" rx="3" fill="rgba(255,255,255,0.42)"/>
      <circle cx="52" cy="14" r="2" fill="#7b8794"/>
      <circle cx="120" cy="14" r="2" fill="#7b8794"/>
      <circle cx="188" cy="14" r="2" fill="#7b8794"/>
    </svg>
  `);
}

function buildPipeHighlightSvg() {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="28" viewBox="0 0 240 28">
      <rect x="1.5" y="1.5" width="237" height="25" rx="12.5" fill="#d8ebff" opacity="0.16" stroke="#a6c7eb" stroke-width="2"/>
    </svg>
  `);
}

function buildCycloneSvg() {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="200" viewBox="0 0 120 200">
      <defs>
        <linearGradient id="cyclone" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#f6f7fa"/>
          <stop offset="50%" stop-color="#d6dce5"/>
          <stop offset="100%" stop-color="#b2bdc9"/>
        </linearGradient>
      </defs>
      <rect x="37" y="14" width="46" height="34" rx="12" fill="url(#cyclone)" stroke="#7c8796" stroke-width="2"/>
      <path d="M26 48 L94 48 L74 132 L46 132 Z" fill="url(#cyclone)" stroke="#7c8796" stroke-width="2"/>
      <path d="M50 132 L70 132 L64 182 L56 182 Z" fill="#8d99aa" stroke="#6d7886" stroke-width="2"/>
      <rect x="80" y="28" width="16" height="46" rx="8" fill="#8d99aa" stroke="#6d7886" stroke-width="2"/>
      <ellipse cx="60" cy="24" rx="16" ry="6" fill="#ffffff" opacity="0.48"/>
    </svg>
  `);
}

function buildCycloneHighlightSvg() {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="182" viewBox="0 0 120 182">
      <rect x="37" y="14" width="46" height="34" rx="12" fill="#d9ebff" opacity="0.16"/>
      <path d="M26 48 L94 48 L74 132 L46 132 Z" fill="#d9ebff" opacity="0.18"/>
      <path d="M50 132 L70 132 L64 182 L56 182 Z" fill="#d9ebff" opacity="0.2"/>
    </svg>
  `);
}

export const PRODUCT_LIBRARY: ProductTemplate[] = [
  // Example template:
  // - one product can contain multiple components
  // - one component can contain multiple PNG layers
  // - later, replacing fallbackImageUrl is optional; just provide real PNG files
  {
    templateId: "template_silo",
    name: "暂存仓（2000L）",
    defaultViewMode: "bird",
    connectionRules: {
      allowsTargetTemplateIds: ["template_pipe", "template_cyclone"],
      allowsSourceKinds: ["silo", "port"],
      allowsTargetKinds: ["pipe", "port"],
    },
    components: [
      {
        id: "silo_assembly",
        name: "暂存仓总成",
        kind: "silo",
        x: 0,
        y: 0,
        width: 320,
        height: 320,
        color: "#d2d8e1",
        zIndex: 10,
        layers: [
          {
            id: "silo_overall_main",
            name: "整机主图",
            x: 0,
            y: 0,
            width: 320,
            height: 320,
            imageUrl: equipmentAssetPath("silo-2000l", "overall.png"),
            fallbackImageUrl: buildSiloSvg(),
            zIndex: 10,
            role: "base",
          },
          {
            id: "silo_overall_highlight",
            name: "整机高亮",
            x: 0,
            y: 0,
            width: 320,
            height: 320,
            imageUrl: "",
            fallbackImageUrl: buildOverallMachineHighlightSvg(),
            zIndex: 40,
            role: "highlight",
          },
        ],
        ports: [
          { id: "in_port", name: "进料端口", x: 232, y: 59, direction: "in" },
          { id: "out_port", name: "出料端口", x: 144, y: 275, direction: "out" },
        ],
        parameters: { 材质: "SUS304", 容积: "2000L", 型号: "SILO-2000L" },
        hotspots: [
          { id: "hs1", label: "仓顶检修口", x: 172, y: 91 },
          { id: "hs2", label: "旋转阀", x: 145, y: 275 },
        ],
      },
    ],
  },
  {
    templateId: "template_pipe",
    name: "输送管道模组",
    defaultViewMode: "bird",
    connectionRules: {
      allowsTargetTemplateIds: ["template_silo", "template_cyclone", "template_pipe"],
      allowsSourceKinds: ["pipe", "port"],
      allowsTargetKinds: ["silo", "pipe", "port"],
    },
    components: [
      {
        id: "pipe_main",
        name: "主管道",
        kind: "pipe",
        x: 0,
        y: 52,
        width: 240,
        height: 28,
        color: "#aeb9c7",
        zIndex: 20,
        layers: [
          {
            id: "pipe_main_body",
            name: "主管道主体",
            x: 0,
            y: 0,
            width: 240,
            height: 28,
            imageUrl: "",
            fallbackImageUrl: buildPipeSvg(),
            zIndex: 20,
            role: "base",
          },
          {
            id: "pipe_main_highlight",
            name: "主管道高亮",
            x: 0,
            y: 0,
            width: 240,
            height: 28,
            imageUrl: "",
            fallbackImageUrl: buildPipeHighlightSvg(),
            zIndex: 55,
            role: "highlight",
          },
        ],
        ports: [
          { id: "pipe_left", name: "入口", x: 0, y: 14, direction: "in" },
          { id: "pipe_right", name: "出口", x: 240, y: 14, direction: "out" },
        ],
        parameters: { 材质: "304 不锈钢", 口径: "DN150", 压力等级: "PN10" },
        hotspots: [
          { id: "hs3", label: "观察口", x: 110, y: 14 },
          { id: "hs4", label: "末端法兰", x: 220, y: 14 },
        ],
      },
        {
          id: "pipe_port",
          name: "入口法兰",
          kind: "support",
        x: -16,
        y: 48,
        width: 30,
        height: 38,
        color: "#8693a1",
        zIndex: 22,
        layers: [
          {
            id: "pipe_port_main",
            name: "入口法兰",
            x: 0,
            y: 0,
            width: 30,
            height: 38,
            imageUrl: "",
            fallbackImageUrl: buildPortSvg(30, 38, "#8693a1"),
            zIndex: 22,
            role: "base",
          },
          {
            id: "pipe_port_highlight",
            name: "法兰高亮",
            x: 0,
            y: 0,
            width: 30,
            height: 38,
            imageUrl: "",
            fallbackImageUrl: buildPortHighlightSvg(30, 38),
            zIndex: 58,
            role: "highlight",
          },
        ],
          parameters: { 材质: "304 不锈钢", 口径: "DN150", 连接方式: "快装" },
          hotspots: [{ id: "hs5", label: "进料法兰", x: 8, y: 18 }],
        },
    ],
  },
  {
    templateId: "template_cyclone",
    name: "旋风分离器",
    defaultViewMode: "bird",
    connectionRules: {
      allowsTargetTemplateIds: ["template_pipe"],
      allowsSourceKinds: ["silo", "pipe", "port"],
      allowsTargetKinds: ["pipe", "port"],
    },
    components: [
      {
        id: "cyclone_body",
        name: "旋风主体",
        kind: "silo",
        x: 0,
        y: 0,
        width: 320,
        height: 320,
        color: "#cfd6df",
        zIndex: 18,
        layers: [
          {
            id: "cyclone_body_main",
            name: "旋风主体",
            x: 0,
            y: 0,
            width: 320,
            height: 320,
            imageUrl: "",
            fallbackImageUrl: buildCycloneSvg(),
            zIndex: 18,
            role: "base",
          },
          {
            id: "cyclone_body_highlight",
            name: "旋风主体高亮",
            x: 0,
            y: 0,
            width: 320,
            height: 320,
            imageUrl: "",
            fallbackImageUrl: buildCycloneHighlightSvg(),
            zIndex: 54,
            role: "highlight",
          },
        ],
        ports: [
          { id: "cyclone_in", name: "进风口", x: 251, y: 88, direction: "in" },
          { id: "cyclone_out", name: "下料口", x: 160, y: 320, direction: "out" },
        ],
        parameters: { 材质: "碳钢喷涂", 规格: "CF-900", 分离效率: "95%" },
        hotspots: [{ id: "hs6", label: "检修仓", x: 149, y: 53 }],
      },
    ],
  },
  {
    templateId: "template_diechamoji",
    name: "碟巢磨机",
    aliases: ["DCM", "dcm", "DCM500"],
    defaultViewMode: "bird",
    connectionRules: {
      allowsTargetTemplateIds: ["template_pipe"],
      allowsSourceKinds: ["silo", "pipe", "port"],
      allowsTargetKinds: ["pipe", "port"],
    },
    components: [
      {
        id: "diechamoji_body",
        name: "碟巢磨机主体",
        kind: "silo",
        x: 0,
        y: 0,
        width: 320,
        height: 320,
        color: "#cfd6df",
        zIndex: 10,
        layers: [
          {
            id: "diechamoji_overall_main",
            name: "整机主图",
            x: 0,
            y: 0,
            width: 320,
            height: 320,
            imageUrl: equipmentAssetPath("fjm-1250", "overall.png"),
            fallbackImageUrl: buildFullCanvasHighlightSvg(),
            zIndex: 10,
            role: "base",
          },
        ],
        ports: [
          { id: "diechamoji_in", name: "进料口", x: 0, y: 160, direction: "in" },
          { id: "diechamoji_out", name: "出料口", x: 320, y: 160, direction: "out" },
        ],
        parameters: {},
        hotspots: [],
      },
    ],
  },
];

export function buildDefaultScene(): GraphScene {
  return {
    updatedAt: new Date().toISOString(),
    products: [],
    links: [],
  };
}

export function createProductFromTemplate(templateId: string, placement: { x: number; y: number }, index = 0): ProductModel {
  const template = PRODUCT_LIBRARY.find((item) => item.templateId === templateId) || PRODUCT_LIBRARY[0];
  const productId = `product_${Date.now()}_${index}_${Math.random().toString(16).slice(2, 7)}`;
  const product: ProductModel = {
    id: productId,
    name: template.name,
    x: placement.x,
    y: placement.y,
    viewMode: template.defaultViewMode,
    templateId: template.templateId,
    components: template.components.map((component) => ({
      ...component,
      id: component.id,
      parameters: { ...component.parameters },
      layers: component.layers?.map((layer) => ({ ...layer })),
      hotspots: component.hotspots.map((hotspot) => ({ ...hotspot })),
      ports: component.ports?.map((port) => ({ ...port })),
    })),
  };
  if (template.templateId === "template_pipe") {
    const pipeMain = product.components.find((component) => component.id === "pipe_main" && component.kind === "pipe");
    const startPort = pipeMain?.ports?.find((port) => port.id === "pipe_left");
    const endPort = pipeMain?.ports?.find((port) => port.id === "pipe_right");
    if (pipeMain && startPort && endPort) {
      const pipeState: PipeState = {
        startBinding: null,
        endBinding: null,
        startFreePoint: {
          x: placement.x + pipeMain.x + startPort.x,
          y: placement.y + pipeMain.y + startPort.y,
        },
        endFreePoint: {
          x: placement.x + pipeMain.x + endPort.x,
          y: placement.y + pipeMain.y + endPort.y,
        },
      };
      product.pipeState = pipeState;
    }
  }
  return product;
}
