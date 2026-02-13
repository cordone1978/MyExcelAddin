export type JsonMap = Record<string, unknown>;

export type CellWritePayload = {
  desc?: string;
  type?: string;
  material?: string;
  brand?: string;
  unit?: string;
  price?: number | string | null;
};

export type ComponentRecord = JsonMap & {
  component_name?: string;
  component_id?: number | string;
  config_id?: number | string;
  component_pic?: string;
  whatkind?: string;
  component_unitprice?: number | string;
};

export type MaterialOptionRecord = JsonMap & {
  material_type?: string;
  totalprice?: number | string;
};

export type CraftPriceRecord = JsonMap & {
  label?: string;
  price?: number | string;
  craftType?: string;
};

export type DevModifySubmitPayload = {
  whatKind?: string;
  isPriceChanged?: boolean;
  currentPrice?: number;
  refreshedPrice?: number;
  desc?: string;
  type?: string;
  material?: string;
  brand?: string;
  unit?: string;
};

export type CraftModifySubmitPayload = {
  data?: {
    craftPrice?: number | string;
    desc?: string;
  };
};

export type QueryPriceSelectedData = {
  name?: string;
  desc?: string;
  type?: string;
  brand?: string;
  material?: string;
  unit?: string;
  price?: number;
};
