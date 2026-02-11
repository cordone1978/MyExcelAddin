# 视图名：v_find_config_id

## 基本信息
- **视图用途**：暂无说明

## 字段说明

| 字段名 | 类型 | NULL | 默认值 | 说明 |
|--------|------|------|--------|------|
| product_model | varchar(100) | 否 | NULL | 产品型号 |
| config_id | int | 否 | '0' |  |
| project_code | varchar(100) | 否 | NULL | 项目编码 |

## 创建视图语句

```sql
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`192.168.20.%` SQL SECURITY DEFINER VIEW `v_find_config_id` AS select `ht_sales_products`.`product_model` AS `product_model`,`ht_sales_product_configs`.`config_id` AS `config_id`,`ht_sales_projects`.`project_code` AS `project_code` from ((`ht_sales_product_configs` join `ht_sales_projects` on((`ht_sales_product_configs`.`project_id` = `ht_sales_projects`.`project_id`))) join `ht_sales_products` on((`ht_sales_products`.`product_id` = `ht_sales_product_configs`.`product_id`)))
```
