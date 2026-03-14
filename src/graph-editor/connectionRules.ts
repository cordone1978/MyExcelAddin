import { PRODUCT_LIBRARY } from "./productLibrary";
import { GraphScene, PipeEndpointKey, SelectedTarget } from "./sceneTypes";

type ComponentEndpoint = {
  productId: string;
  componentId: string;
  portId?: string;
};

type ComponentKind = "silo" | "pipe" | "support" | "port";

type RuleContext = {
  scene: GraphScene;
  sourceEndpoint: ComponentEndpoint;
  targetEndpoint: ComponentEndpoint;
  sourceKind: ComponentKind;
  targetKind: ComponentKind;
  sourceDirection: "in" | "out" | "both";
  targetDirection: "in" | "out" | "both";
  sourceUsage: { asSource: number; asTarget: number };
  targetUsage: { asSource: number; asTarget: number };
};

type ConnectionRule = {
  id: string;
  applies: (context: RuleContext) => boolean;
};

function normalizeDirection(direction?: "in" | "out" | "both") {
  return direction || "both";
}

function getComponentById(scene: GraphScene, productId: string, componentId: string) {
  return scene.products
    .find((product) => product.id === productId)
    ?.components.find((component) => component.id === componentId) || null;
}

function getProductById(scene: GraphScene, productId: string) {
  return scene.products.find((product) => product.id === productId) || null;
}

function getTemplateConfig(templateId?: string) {
  if (!templateId) return null;
  return PRODUCT_LIBRARY.find((template) => template.templateId === templateId) || null;
}

function getPortById(scene: GraphScene, productId: string, componentId: string, portId?: string) {
  const component = getComponentById(scene, productId, componentId);
  if (!component) return null;
  if (!portId) return component.ports?.[0] || null;
  return component.ports?.find((port) => port.id === portId) || null;
}

function getPortUsage(scene: GraphScene, endpoint: ComponentEndpoint) {
  const usage = { asSource: 0, asTarget: 0 };
  scene.links.forEach((link) => {
    if (link.from.productId === endpoint.productId && link.from.componentId === endpoint.componentId && link.from.portId === endpoint.portId) {
      usage.asSource += 1;
    }
    if (link.to.productId === endpoint.productId && link.to.componentId === endpoint.componentId && link.to.portId === endpoint.portId) {
      usage.asTarget += 1;
    }
  });
  scene.products.forEach((product) => {
    const pipeState = product.pipeState;
    if (!pipeState) return;
    const pipeMain = product.components.find((component) => component.kind === "pipe");
    if (!pipeMain) return;
    ([
      { key: "start", binding: pipeState.startBinding },
      { key: "end", binding: pipeState.endBinding },
    ] as Array<{ key: PipeEndpointKey; binding: typeof pipeState.startBinding }>).forEach(({ key, binding }) => {
      if (!binding) return;
      const matchesBoundDevice =
        binding.productId === endpoint.productId &&
        binding.componentId === endpoint.componentId &&
        binding.portId === endpoint.portId;
      if (matchesBoundDevice) {
        if (key === "start") usage.asSource += 1;
        else usage.asTarget += 1;
      }
      const matchesPipePort =
        product.id === endpoint.productId &&
        pipeMain.id === endpoint.componentId &&
        (key === "start" ? "pipe_left" : "pipe_right") === endpoint.portId;
      if (matchesPipePort) {
        if (key === "start") usage.asTarget += 1;
        else usage.asSource += 1;
      }
    });
  });
  return usage;
}

const RULES: ConnectionRule[] = [
  {
    id: "disallow-self",
    applies: ({ sourceEndpoint, targetEndpoint }) =>
      !(sourceEndpoint.productId === targetEndpoint.productId &&
        sourceEndpoint.componentId === targetEndpoint.componentId &&
        sourceEndpoint.portId === targetEndpoint.portId),
  },
  {
    id: "disallow-support",
    applies: ({ sourceKind, targetKind }) => sourceKind !== "support" && targetKind !== "support",
  },
  {
    id: "allow-kind-pairs",
    applies: ({ sourceKind, targetKind, scene, sourceEndpoint, targetEndpoint }) => {
      const sourceProduct = getProductById(scene, sourceEndpoint.productId);
      const targetProduct = getProductById(scene, targetEndpoint.productId);
      const sourceTemplate = getTemplateConfig(sourceProduct?.templateId);
      const targetTemplateId = targetProduct?.templateId;

      if (sourceTemplate?.connectionRules?.allowsTargetTemplateIds?.length) {
        if (!targetTemplateId || !sourceTemplate.connectionRules.allowsTargetTemplateIds.includes(targetTemplateId)) {
          return false;
        }
      }

      if (sourceTemplate?.connectionRules?.allowsSourceKinds?.length) {
        if (!sourceTemplate.connectionRules.allowsSourceKinds.includes(sourceKind)) {
          return false;
        }
      }

      if (sourceTemplate?.connectionRules?.allowsTargetKinds?.length) {
        if (!sourceTemplate.connectionRules.allowsTargetKinds.includes(targetKind)) {
          return false;
        }
      }

      return (
        (sourceKind === "port" && (targetKind === "pipe" || targetKind === "port")) ||
        (sourceKind === "pipe" && (targetKind === "port" || targetKind === "silo")) ||
        (sourceKind === "silo" && (targetKind === "pipe" || targetKind === "port"))
      );
    },
  },
  {
    id: "source-direction",
    applies: ({ sourceDirection }) => sourceDirection === "out" || sourceDirection === "both",
  },
  {
    id: "target-direction",
    applies: ({ targetDirection }) => targetDirection === "in" || targetDirection === "both",
  },
  {
    id: "single-input",
    applies: ({ targetDirection, targetUsage }) => !(targetDirection === "in" && targetUsage.asTarget > 0),
  },
];

export function isConnectionAllowed(
  scene: GraphScene,
  source: SelectedTarget,
  target: ComponentEndpoint
) {
  if (!source || source.type !== "port") return false;

  const sourceComponent = getComponentById(scene, source.productId, source.componentId);
  const targetComponent = getComponentById(scene, target.productId, target.componentId);
  const sourcePort = getPortById(scene, source.productId, source.componentId, source.portId);
  const targetPort = getPortById(scene, target.productId, target.componentId, target.portId);

  if (!sourceComponent || !targetComponent) return false;

  const context: RuleContext = {
    scene,
    sourceEndpoint: source,
    targetEndpoint: target,
    sourceKind: sourceComponent.kind,
    targetKind: targetComponent.kind,
    sourceDirection: normalizeDirection(sourcePort?.direction),
    targetDirection: normalizeDirection(targetPort?.direction),
    sourceUsage: getPortUsage(scene, source),
    targetUsage: getPortUsage(scene, target),
  };

  return RULES.every((rule) => rule.applies(context));
}

export function getPortUsageSummary(scene: GraphScene, endpoint: ComponentEndpoint) {
  return getPortUsage(scene, endpoint);
}

export function getPortDisplayName(scene: GraphScene, endpoint: ComponentEndpoint) {
  const port = getPortById(scene, endpoint.productId, endpoint.componentId, endpoint.portId);
  if (!port) return endpoint.portId || "未命名端口";
  return port.direction ? `${port.name} · ${port.direction}` : port.name;
}
