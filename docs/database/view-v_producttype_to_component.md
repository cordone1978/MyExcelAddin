# 视图名：v_producttype_to_component

## 基本信息
- **视图用途**：暂无说明

## 字段说明

| 字段名 | 类型 | NULL | 默认值 | 说明 |
|--------|------|------|--------|------|
| component_name | varchar(100) | 否 | NULL | 组件名称 |
| type_name | varchar(100) | 否 | NULL | 产品类型名称 |

## 创建视图语句

```sql
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`192.168.20.%` SQL SECURITY DEFINER VIEW `v_producttype_to_component` AS select `ht_sales_components`.`component_name` AS `component_name`,`ht_sales_product_types`.`type_name` AS `type_name` from (`ht_sales_product_types` join `ht_sales_components` on((`ht_sales_product_types`.`product_type_id` = `ht_sales_components`.`product_type_id`)))
```
