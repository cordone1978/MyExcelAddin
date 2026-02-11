# 表名：ht_sales_materials

## 基本信息
- **表用途**：材质表
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| material_id | int | 否 | PRI | NULL | auto_increment |  |
| material_code | varchar(50) | 否 | UNI | NULL |  | 材质编码 |
| material_name | varchar(100) | 否 | MUL | NULL |  | 材质名称 |
| material_type | enum('材料','工艺') | 否 | MUL | NULL |  | 类型 |
| material_surface | varchar(50) | 是 |  | NULL |  | 定义该种工艺一般用于哪里，如外表面，内表面等 |
| material_unitprice | decimal(10,2) | 是 |  | NULL |  | 单价 |
| description | text | 是 |  | NULL |  | 材质描述 |
| is_active | tinyint(1) | 是 |  | '1' |  |  |
| created_at | timestamp | 是 |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| idx_material_name | BTREE | material_name | 否 |
| idx_material_type | BTREE | material_type | 否 |
| material_code | BTREE | material_code | 是 |
| PRIMARY | BTREE | material_id | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_materials` (
  `material_id` int NOT NULL AUTO_INCREMENT,
  `material_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '材质编码',
  `material_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '材质名称',
  `material_type` enum('材料','工艺') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '类型',
  `material_surface` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '定义该种工艺一般用于哪里，如外表面，内表面等',
  `material_unitprice` decimal(10,2) DEFAULT NULL COMMENT '单价',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '材质描述',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`material_id`) USING BTREE,
  UNIQUE KEY `material_code` (`material_code`) USING BTREE,
  KEY `idx_material_type` (`material_type`) USING BTREE,
  KEY `idx_material_name` (`material_name`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='材质表'
```
