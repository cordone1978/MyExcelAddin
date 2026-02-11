# 表名：ht_sales_system_configs

## 基本信息
- **表用途**：系统产品类型配置表
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| system_config_id | int | 否 | PRI | NULL | auto_increment |  |
| system_id | int | 否 | MUL | NULL |  | 系统ID |
| product_type_id | int | 否 | MUL | NULL |  | 产品类型ID |
| created_at | timestamp | 是 |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| idx_product_type_id | BTREE | product_type_id | 否 |
| idx_system_id | BTREE | system_id | 否 |
| PRIMARY | BTREE | system_config_id | 是 |
| unique_system_product | BTREE | system_id,product_type_id | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_system_configs` (
  `system_config_id` int NOT NULL AUTO_INCREMENT,
  `system_id` int NOT NULL COMMENT '系统ID',
  `product_type_id` int NOT NULL COMMENT '产品类型ID',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`system_config_id`) USING BTREE,
  UNIQUE KEY `unique_system_product` (`system_id`,`product_type_id`) USING BTREE,
  KEY `idx_system_id` (`system_id`) USING BTREE,
  KEY `idx_product_type_id` (`product_type_id`) USING BTREE,
  CONSTRAINT `fk_system_configs_product_type` FOREIGN KEY (`product_type_id`) REFERENCES `ht_sales_product_types` (`product_type_id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_system_configs_system` FOREIGN KEY (`system_id`) REFERENCES `ht_sales_systems` (`system_id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=68 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='系统产品类型配置表'
```
