# 表名：ht_sales_components

## 基本信息
- **表用途**：标准组件表
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| component_id | int | 否 | PRI | NULL | auto_increment |  |
| component_code | varchar(50) | 否 | UNI | NULL |  | 组件编码 |
| component_name | varchar(100) | 否 |  | NULL |  | 组件名称 |
| component_order | int | 否 | MUL | NULL |  | 显示顺序 |
| product_type_id | int | 是 | MUL | NULL |  | 关联产品类型 |
| parent_component_id | int | 是 | MUL | NULL |  | 父组件ID(BOM层级) |
| description | text | 是 |  | NULL |  | 组件描述 |
| is_active | tinyint(1) | 是 |  | '1' |  |  |
| created_at | timestamp | 是 |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| component_code | BTREE | component_code | 是 |
| idx_component_order | BTREE | component_order | 否 |
| idx_parent_component | BTREE | parent_component_id | 否 |
| idx_product_type | BTREE | product_type_id | 否 |
| PRIMARY | BTREE | component_id | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_components` (
  `component_id` int NOT NULL AUTO_INCREMENT,
  `component_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '组件编码',
  `component_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '组件名称',
  `component_order` int NOT NULL COMMENT '显示顺序',
  `product_type_id` int DEFAULT NULL COMMENT '关联产品类型',
  `parent_component_id` int DEFAULT NULL COMMENT '父组件ID(BOM层级)',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '组件描述',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`component_id`) USING BTREE,
  UNIQUE KEY `component_code` (`component_code`) USING BTREE,
  KEY `idx_product_type` (`product_type_id`) USING BTREE,
  KEY `idx_parent_component` (`parent_component_id`) USING BTREE,
  KEY `idx_component_order` (`component_order`) USING BTREE,
  CONSTRAINT `ht_sales_components_ibfk_1` FOREIGN KEY (`product_type_id`) REFERENCES `ht_sales_product_types` (`product_type_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ht_sales_components_ibfk_2` FOREIGN KEY (`parent_component_id`) REFERENCES `ht_sales_components` (`component_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='标准组件表'
```
