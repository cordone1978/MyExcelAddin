# 表名：ht_sales_price_list

## 基本信息
- **表用途**：暂无说明
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| OrderDate | date | 是 |  | NULL |  |  |
| OrderNo | varchar(255) | 是 |  | NULL |  |  |
| ItemCode | varchar(20) | 是 |  | NULL |  |  |
| ItemName | varchar(255) | 是 | MUL | NULL |  |  |
| ItemDesc | text | 是 | MUL | NULL |  |  |
| ItemType | varchar(255) | 是 |  | NULL |  |  |
| ItemUnit | varchar(255) | 是 |  | NULL |  |  |
| ItemPrice | decimal(10,2) | 是 |  | NULL |  |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| idx_itemdesc_ft | FULLTEXT | ItemDesc | 否 |
| idx_itemname_ft | FULLTEXT | ItemName | 否 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_price_list` (
  `OrderDate` date DEFAULT NULL,
  `OrderNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ItemCode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ItemName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ItemDesc` text COLLATE utf8mb4_unicode_ci,
  `ItemType` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ItemUnit` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ItemPrice` decimal(10,2) DEFAULT NULL,
  FULLTEXT KEY `idx_itemname_ft` (`ItemName`) /*!50100 WITH PARSER `ngram` */ ,
  FULLTEXT KEY `idx_itemdesc_ft` (`ItemDesc`) /*!50100 WITH PARSER `ngram` */ 
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```
