# 视图名：v_type_name_to_prodcut_model

## 基本信息
- **视图用途**：暂无说明

## 字段说明

| 字段名 | 类型 | NULL | 默认值 | 说明 |
|--------|------|------|--------|------|
| type_name | varchar(100) | 否 | NULL | 产品类型名称 |
| product_model | varchar(100) | 否 | NULL | 产品型号 |

## 创建视图语句

```sql
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`192.168.20.%` SQL SECURITY DEFINER VIEW `v_type_name_to_prodcut_model` AS select `ht_sales_product_types`.`type_name` AS `type_name`,`ht_sales_products`.`product_model` AS `product_model` from (`ht_sales_products` join `ht_sales_product_types` on((`ht_sales_products`.`product_type_id` = `ht_sales_product_types`.`product_type_id`)))
```
