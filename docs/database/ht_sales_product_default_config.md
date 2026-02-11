# 表名：ht_sales_product_default_config

## 基本信息
- **表用途**：暂无说明
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| config_id | int | 否 | PRI | NULL | auto_increment |  |
| product_id | int | 否 | MUL | NULL |  |  |
| component_sn | int | 是 |  | NULL |  | 组件序号 |
| component_name | varchar(255) | 否 |  | NULL |  | 组件名称 |
| component_desc | varchar(255) | 是 |  | NULL |  | 组件描述 |
| component_type | varchar(255) | 是 |  | NULL |  | 组件型号 |
| component_material | varchar(255) | 是 |  | NULL |  | 组件材质 |
| component_brand | varchar(255) | 是 |  | NULL |  | 组件品牌 |
| component_quantity | int | 是 |  | NULL |  | 数量 |
| component_unit | varchar(10) | 是 |  | NULL |  | 单位 |
| component_unitprice | decimal(10,2) | 是 |  | NULL |  | 单价 |
| component_totalprice | decimal(10,2) | 是 |  | NULL |  | 总价 |
| component_pic | varchar(255) | 是 |  | NULL |  | 保存组件图片名称 |
| pic_level | int | 是 |  | NULL |  | 组件图片显示顺序 |
| created_at | timestamp | 是 |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |  |
| backup | varchar(255) | 是 |  | NULL |  | 备注 |
| whatkind | set('外购件','组件','工艺','标准件') | 是 |  | '组件' |  | 类型：外购件、组件、工艺（可多选） |
| is_active | tinyint | 是 |  | '1' |  | 是否是必选项 |
| is_Assembly | tinyint | 否 |  | '0' |  | 是否是组合件，是构成复合索引的要素之一 |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| PRIMARY | BTREE | config_id | 是 |
| uk_product_component | BTREE | product_id,component_name,is_Assembly | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_product_default_config` (
  `config_id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `component_sn` int DEFAULT NULL COMMENT '组件序号',
  `component_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '组件名称',
  `component_desc` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '组件描述',
  `component_type` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '组件型号',
  `component_material` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '组件材质',
  `component_brand` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '组件品牌',
  `component_quantity` int DEFAULT NULL COMMENT '数量',
  `component_unit` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '单位',
  `component_unitprice` decimal(10,2) DEFAULT NULL COMMENT '单价',
  `component_totalprice` decimal(10,2) DEFAULT NULL COMMENT '总价',
  `component_pic` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '保存组件图片名称',
  `pic_level` int DEFAULT NULL COMMENT '组件图片显示顺序',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `backup` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `whatkind` set('外购件','组件','工艺','标准件') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '组件' COMMENT '类型：外购件、组件、工艺（可多选）',
  `is_active` tinyint DEFAULT '1' COMMENT '是否是必选项',
  `is_Assembly` tinyint NOT NULL DEFAULT '0' COMMENT '是否是组合件，是构成复合索引的要素之一',
  PRIMARY KEY (`config_id`) USING BTREE,
  UNIQUE KEY `uk_product_component` (`product_id`,`component_name`,`is_Assembly`) USING BTREE,
  CONSTRAINT `ht_sales_product_default_config_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `ht_sales_products` (`product_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=1250 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
```
