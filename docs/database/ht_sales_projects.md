# 表名：ht_sales_projects

## 基本信息
- **表用途**：项目信息表
- **引擎**：InnoDB
- **字符集**：utf8mb4_unicode_ci

## 字段说明

| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |
|--------|------|------|-----|--------|------|------|
| project_id | int | 否 | PRI | NULL | auto_increment |  |
| project_code | varchar(100) | 否 | UNI | NULL |  | 项目编码 |
| project_name | varchar(255) | 否 |  | NULL |  | 项目名称 |
| customer_name | varchar(255) | 是 |  | NULL |  | 客户名称 |
| total_amount | decimal(12,2) | 是 |  | NULL |  | 项目总金额 |
| project_date | date | 是 | MUL | NULL |  | 项目日期 |
| status | enum('报价中','已签约','执行中','已完成') | 是 |  | '报价中' |  |  |
| notes | text | 是 |  | NULL |  | 项目备注 |
| created_at | timestamp | 是 |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |  |

## 索引

| 索引名 | 类型 | 字段 | 唯一 |
|--------|------|------|------|
| idx_project_code | BTREE | project_code | 否 |
| idx_project_date | BTREE | project_date | 否 |
| PRIMARY | BTREE | project_id | 是 |
| project_code | BTREE | project_code | 是 |

## 建表语句

,```sql
CREATE TABLE `ht_sales_projects` (
  `project_id` int NOT NULL AUTO_INCREMENT,
  `project_code` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '项目编码',
  `project_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '项目名称',
  `customer_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户名称',
  `total_amount` decimal(12,2) DEFAULT NULL COMMENT '项目总金额',
  `project_date` date DEFAULT NULL COMMENT '项目日期',
  `status` enum('报价中','已签约','执行中','已完成') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '报价中',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '项目备注',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`project_id`) USING BTREE,
  UNIQUE KEY `project_code` (`project_code`) USING BTREE,
  KEY `idx_project_code` (`project_code`) USING BTREE,
  KEY `idx_project_date` (`project_date`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=234 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='项目信息表'
```
