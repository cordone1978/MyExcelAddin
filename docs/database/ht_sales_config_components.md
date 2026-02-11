# 表名：ht_sales_config_components

## 基本信息
- **表用途**：配置组件表
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| config_component_id | int | 否 | PRI | NULL | auto_increment |  |
| config_id | int | 否 | MUL | NULL |  | 产品配置ID |
| component_id | int | 否 | MUL | NULL |  | 组件ID |
| material_combination | varchar(500) | 否 |  | NULL |  | 材质组合 |
| component_price | decimal(12,2) | 否 |  | NULL |  | 组件价格 |
| notes | text | 是 |  | NULL |  | 组件备注 |
| created_at | timestamp | 是 |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| idx_component_id | BTREE | component_id | 否 |
| idx_config_id | BTREE | config_id | 否 |
| PRIMARY | BTREE | config_component_id | 是 |
| unique_config_component | BTREE | config_id,component_id | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_config_components` (
  `config_component_id` int NOT NULL AUTO_INCREMENT,
  `config_id` int NOT NULL COMMENT '产品配置ID',
  `component_id` int NOT NULL COMMENT '组件ID',
  `material_combination` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '材质组合',
  `component_price` decimal(12,2) NOT NULL COMMENT '组件价格',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '组件备注',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_component_id`) USING BTREE,
  UNIQUE KEY `unique_config_component` (`config_id`,`component_id`) USING BTREE,
  KEY `idx_config_id` (`config_id`) USING BTREE,
  KEY `idx_component_id` (`component_id`) USING BTREE,
  CONSTRAINT `ht_sales_config_components_ibfk_2` FOREIGN KEY (`component_id`) REFERENCES `ht_sales_components` (`component_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=2778 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='配置组件表'
```
