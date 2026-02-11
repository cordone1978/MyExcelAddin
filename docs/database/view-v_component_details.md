# 视图名：v_component_details

## 基本信息
- **视图用途**：暂无说明

## 字段说明

| 字段名 | 类型 | NULL | 默认值 | 说明 |
|--------|------|------|--------|------|
| material_combination | varchar(500) | 否 | NULL | 材质组合 |
| component_price | decimal(12,2) | 否 | NULL | 组件价格 |
| project_name | varchar(255) | 否 | NULL | 项目名称 |
| product_model | varchar(100) | 否 | NULL | 产品型号 |
| component_name | varchar(100) | 否 | NULL | 组件名称 |

## 创建视图语句

```sql
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`192.168.20.%` SQL SECURITY DEFINER VIEW `v_component_details` AS select `ht_sales_config_components`.`material_combination` AS `material_combination`,`ht_sales_config_components`.`component_price` AS `component_price`,`ht_sales_projects`.`project_name` AS `project_name`,`ht_sales_products`.`product_model` AS `product_model`,`ht_sales_components`.`component_name` AS `component_name` from (((((`ht_sales_product_configs` join `ht_sales_projects` on((`ht_sales_product_configs`.`project_id` = `ht_sales_projects`.`project_id`))) join `ht_sales_config_components` on((`ht_sales_product_configs`.`config_id` = `ht_sales_config_components`.`config_id`))) join `ht_sales_products` on((`ht_sales_product_configs`.`product_id` = `ht_sales_products`.`product_id`))) join `ht_sales_product_types` on((`ht_sales_products`.`product_type_id` = `ht_sales_product_types`.`product_type_id`))) join `ht_sales_components` on(((`ht_sales_config_components`.`component_id` = `ht_sales_components`.`component_id`) and (`ht_sales_product_types`.`product_type_id` = `ht_sales_components`.`product_type_id`))))
```
