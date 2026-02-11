# 表名：ht_sales_config_crafting

## 基本信息
- **表用途**：暂无说明
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| crafting_id | int | 否 | PRI | NULL | auto_increment |  |
| product_id | int | 是 |  | NULL |  |  |
| component_id | int | 是 |  | NULL |  |  |
| MaterialsPrice | decimal(10,2) | 是 |  | NULL |  |  |
| InnerArea1 | decimal(10,2) | 是 |  | NULL |  |  |
| InnerArea2 | decimal(10,2) | 是 |  | NULL |  |  |
| InnerArea3 | decimal(10,2) | 是 |  | NULL |  |  |
| OutterArea1 | decimal(10,2) | 是 |  | NULL |  |  |
| OutterArea2 | decimal(10,2) | 是 |  | NULL |  |  |
| OutterArea3 | decimal(10,2) | 是 |  | NULL |  |  |
| InnerUnitPrice1 | int | 是 |  | NULL |  |  |
| InnerUnitPrice2 | int | 是 |  | NULL |  |  |
| InnerUnitPrice3 | int | 是 |  | NULL |  |  |
| OutterUnitPrice1 | int | 是 |  | NULL |  |  |
| OutterUnitPrice2 | int | 是 |  | NULL |  |  |
| OutterUnitPrice3 | int | 是 |  | NULL |  |  |
| InnerTotalPrice1 | int | 是 |  | NULL |  |  |
| InnerTotalPrice2 | int | 是 |  | NULL |  |  |
| InnerTotalPrice3 | int | 是 |  | NULL |  |  |
| OutterTotalPrice1 | int | 是 |  | NULL |  |  |
| OutterTotalPrice2 | int | 是 |  | NULL |  |  |
| OutterTotalPrice3 | int | 是 |  | NULL |  |  |
| InnerCraftType1 | set('ETFE','镜面') | 是 |  | '' |  |  |
| InnerCraftType2 | set('ETFE','镜面') | 是 |  | '' |  |  |
| InnerCraftType3 | set('ETFE','镜面') | 是 |  | '' |  |  |
| OutterCraftType1 | set('ETFE','拉丝') | 是 |  | '' |  |  |
| OutterCraftType2 | set('ETFE','拉丝') | 是 |  | '' |  |  |
| OutterCraftType3 | set('ETFE','拉丝') | 是 |  | '' |  |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| PRIMARY | BTREE | crafting_id | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_config_crafting` (
  `crafting_id` int NOT NULL AUTO_INCREMENT,
  `product_id` int DEFAULT NULL,
  `component_id` int DEFAULT NULL,
  `MaterialsPrice` decimal(10,2) DEFAULT NULL,
  `InnerArea1` decimal(10,2) DEFAULT NULL,
  `InnerArea2` decimal(10,2) DEFAULT NULL,
  `InnerArea3` decimal(10,2) DEFAULT NULL,
  `OutterArea1` decimal(10,2) DEFAULT NULL,
  `OutterArea2` decimal(10,2) DEFAULT NULL,
  `OutterArea3` decimal(10,2) DEFAULT NULL,
  `InnerUnitPrice1` int DEFAULT NULL,
  `InnerUnitPrice2` int DEFAULT NULL,
  `InnerUnitPrice3` int DEFAULT NULL,
  `OutterUnitPrice1` int DEFAULT NULL,
  `OutterUnitPrice2` int DEFAULT NULL,
  `OutterUnitPrice3` int DEFAULT NULL,
  `InnerTotalPrice1` int DEFAULT NULL,
  `InnerTotalPrice2` int DEFAULT NULL,
  `InnerTotalPrice3` int DEFAULT NULL,
  `OutterTotalPrice1` int DEFAULT NULL,
  `OutterTotalPrice2` int DEFAULT NULL,
  `OutterTotalPrice3` int DEFAULT NULL,
  `InnerCraftType1` set('ETFE','镜面') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '',
  `InnerCraftType2` set('ETFE','镜面') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '',
  `InnerCraftType3` set('ETFE','镜面') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '',
  `OutterCraftType1` set('ETFE','拉丝') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '',
  `OutterCraftType2` set('ETFE','拉丝') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '',
  `OutterCraftType3` set('ETFE','拉丝') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '',
  PRIMARY KEY (`crafting_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```
