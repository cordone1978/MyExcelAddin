# 表名：ht_sales_products

## 基本信息
- **表用途**：产品基础信息表
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| product_id | int | 否 | PRI | NULL | auto_increment |  |
| product_type_id | int | 否 | MUL | NULL |  | 产品类型ID |
| product_model | varchar(100) | 否 | MUL | NULL |  | 产品型号 |
| base_description | text | 是 |  | NULL |  | 基础描述 |
| base_weight | decimal(10,2) | 是 |  | NULL |  | 基础重量 |
| standard_price | decimal(12,2) | 是 |  | NULL |  | 标准参考价格 |
| technical_params | longtext | 是 |  | NULL |  | 技术参数JSON |
| InnerCode | varchar(255) | 是 |  | NULL |  | 研发内部型号 |
| is_active | tinyint(1) | 是 |  | '1' |  |  |
| created_at | timestamp | 是 |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| idx_product_model | BTREE | product_model | 否 |
| PRIMARY | BTREE | product_id | 是 |
| unique_product_model | BTREE | product_type_id,product_model | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_products` (
  `product_id` int NOT NULL AUTO_INCREMENT,
  `product_type_id` int NOT NULL COMMENT '产品类型ID',
  `product_model` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品型号',
  `base_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '基础描述',
  `base_weight` decimal(10,2) DEFAULT NULL COMMENT '基础重量',
  `standard_price` decimal(12,2) DEFAULT NULL COMMENT '标准参考价格',
  `technical_params` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '技术参数JSON',
  `InnerCode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '研发内部型号',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`) USING BTREE,
  UNIQUE KEY `unique_product_model` (`product_type_id`,`product_model`) USING BTREE,
  KEY `idx_product_model` (`product_model`) USING BTREE,
  CONSTRAINT `ht_sales_products_ibfk_1` FOREIGN KEY (`product_type_id`) REFERENCES `ht_sales_product_types` (`product_type_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ht_sales_products_chk_1` CHECK (json_valid(`technical_params`)) /*!80016 NOT ENFORCED */
) ENGINE=InnoDB AUTO_INCREMENT=91 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='产品基础信息表'
```
