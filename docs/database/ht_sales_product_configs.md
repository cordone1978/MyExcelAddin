# 表名：ht_sales_product_configs

## 基本信息
- **表用途**：产品配置表
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| config_id | int | 否 | PRI | NULL | auto_increment |  |
| project_id | int | 否 | MUL | NULL |  | 所属项目ID |
| product_id | int | 否 | MUL | NULL |  | 所属产品ID |
| config_name | varchar(255) | 否 |  | NULL |  | 配置名称 |
| key_parameters | varchar(255) | 是 |  | NULL |  | 核心参数 |
| main_parameters | text | 是 |  | NULL |  | 设备的一些主要描述 |
| config_amount | decimal(12,2) | 否 |  | NULL |  | 该设备大约的金额，可能是个平均值 |
| position | varchar(255) | 否 |  | '' |  | 位置标识 |
| notes | text | 是 |  | NULL |  | 配置备注 |
| created_at | timestamp | 是 |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| idx_product_id | BTREE | product_id | 否 |
| idx_project_id | BTREE | project_id | 否 |
| PRIMARY | BTREE | config_id | 是 |
| uk_project_product_position | BTREE | project_id,product_id,position | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_product_configs` (
  `config_id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL COMMENT '所属项目ID',
  `product_id` int NOT NULL COMMENT '所属产品ID',
  `config_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置名称',
  `key_parameters` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '核心参数',
  `main_parameters` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '设备的一些主要描述',
  `config_amount` decimal(12,2) NOT NULL COMMENT '该设备大约的金额，可能是个平均值',
  `position` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '位置标识',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '配置备注',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_id`) USING BTREE,
  UNIQUE KEY `uk_project_product_position` (`project_id`,`product_id`,`position`),
  KEY `idx_project_id` (`project_id`) USING BTREE,
  KEY `idx_product_id` (`product_id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=302 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='产品配置表'
```
