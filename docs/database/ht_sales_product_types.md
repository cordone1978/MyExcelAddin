# 表名：ht_sales_product_types

## 基本信息
- **表用途**：产品类型表
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| product_type_id | int | 否 | PRI | NULL | auto_increment |  |
| type_code | varchar(50) | 否 | UNI | NULL |  | 产品类型编码 |
| type_name | varchar(100) | 否 |  | NULL |  | 产品类型名称 |
| type_name_en | varchar(100) | 是 |  | NULL |  | 英文名称 |
| description | text | 是 |  | NULL |  | 类型描述 |
| is_active | tinyint(1) | 是 |  | '1' |  |  |
| created_at | timestamp | 是 |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| idx_type_code | BTREE | type_code | 否 |
| PRIMARY | BTREE | product_type_id | 是 |
| type_code | BTREE | type_code | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_product_types` (
  `product_type_id` int NOT NULL AUTO_INCREMENT,
  `type_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品类型编码',
  `type_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品类型名称',
  `type_name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '类型描述',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_type_id`) USING BTREE,
  UNIQUE KEY `type_code` (`type_code`) USING BTREE,
  KEY `idx_type_code` (`type_code`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='产品类型表'
```
