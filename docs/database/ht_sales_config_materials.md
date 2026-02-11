# 表名：ht_sales_config_materials

## 基本信息
- **表用途**：暂无说明
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| material_id | int | 否 | PRI | NULL | auto_increment |  |
| product_id | int | 是 |  | NULL |  |  |
| component_id | int | 是 |  | NULL |  |  |
| material_type | set('S304','Q235') | 是 |  | '' |  |  |
| totalprice | decimal(10,2) | 是 |  | NULL |  |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| PRIMARY | BTREE | material_id | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_config_materials` (
  `material_id` int NOT NULL AUTO_INCREMENT,
  `product_id` int DEFAULT NULL,
  `component_id` int DEFAULT NULL,
  `material_type` set('S304','Q235') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '',
  `totalprice` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`material_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```
