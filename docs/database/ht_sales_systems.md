# 表名：ht_sales_systems

## 基本信息
- **表用途**：系统分类表
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| system_id | int | 否 | PRI | NULL | auto_increment |  |
| system_code | varchar(50) | 否 | UNI | NULL |  | 系统编码 |
| system_name | varchar(100) | 否 |  | NULL |  | 系统名称 |
| system_name_en | varchar(100) | 是 |  | NULL |  | 英文名称 |
| description | text | 是 |  | NULL |  | 系统描述 |
| system_order | int | 是 | MUL | NULL |  | 显示顺序 |
| is_active | tinyint(1) | 是 |  | '1' |  |  |
| created_at | timestamp | 是 |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| idx_system_code | BTREE | system_code | 否 |
| idx_system_order | BTREE | system_order | 否 |
| PRIMARY | BTREE | system_id | 是 |
| system_code | BTREE | system_code | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_systems` (
  `system_id` int NOT NULL AUTO_INCREMENT,
  `system_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '系统编码',
  `system_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '系统名称',
  `system_name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '系统描述',
  `system_order` int DEFAULT NULL COMMENT '显示顺序',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`system_id`) USING BTREE,
  UNIQUE KEY `system_code` (`system_code`) USING BTREE,
  KEY `idx_system_code` (`system_code`) USING BTREE,
  KEY `idx_system_order` (`system_order`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=1302 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='系统分类表'
```
