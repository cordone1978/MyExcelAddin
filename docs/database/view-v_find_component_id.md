# 视图名：v_find_component_id

## 基本信息
- **视图用途**：暂无说明

## 字段说明

| 字段名 | 类型 | NULL | 默认值 | 说明 |
|--------|------|------|--------|------|
| component_id | int | 否 | '0' |  |
| component_name | varchar(100) | 否 | NULL | 组件名称 |
| product_model | varchar(100) | 否 | NULL | 产品型号 |

## 创建视图语句

```sql
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`192.168.20.%` SQL SECURITY DEFINER VIEW `v_find_component_id` AS select `ht_sales_components`.`component_id` AS `component_id`,`ht_sales_components`.`component_name` AS `component_name`,`ht_sales_products`.`product_model` AS `product_model` from ((`ht_sales_components` join `ht_sales_product_types` on((`ht_sales_components`.`product_type_id` = `ht_sales_product_types`.`product_type_id`))) join `ht_sales_products` on((`ht_sales_product_types`.`product_type_id` = `ht_sales_products`.`product_type_id`)))
```
