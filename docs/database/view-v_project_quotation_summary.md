# 视图名：v_project_quotation_summary

## 基本信息
- **视图用途**：暂无说明

## 字段说明

| 字段名 | 类型 | NULL | 默认值 | 说明 |
|--------|------|------|--------|------|
| product_model | varchar(100) | 否 | NULL | 产品型号 |
| project_name | varchar(255) | 否 | NULL | 项目名称 |
| total_amount | decimal(12,2) | 是 | NULL | 项目总金额 |
| project_code | varchar(100) | 否 | NULL | 项目编码 |

## 创建视图语句

```sql
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`192.168.20.%` SQL SECURITY DEFINER VIEW `v_project_quotation_summary` AS select `ht_sales_products`.`product_model` AS `product_model`,`ht_sales_projects`.`project_name` AS `project_name`,`ht_sales_projects`.`total_amount` AS `total_amount`,`ht_sales_projects`.`project_code` AS `project_code` from ((`ht_sales_projects` join `ht_sales_product_configs` on((`ht_sales_projects`.`project_id` = `ht_sales_product_configs`.`project_id`))) join `ht_sales_products` on((`ht_sales_product_configs`.`product_id` = `ht_sales_products`.`product_id`)))
```
