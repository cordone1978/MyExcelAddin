# 视图名：v_system_config_simple

## 基本信息
- **视图用途**：暂无说明

## 字段说明

| 字段名 | 类型 | NULL | 默认值 | 说明 |
|--------|------|------|--------|------|
| system_name | varchar(100) | 否 | NULL | 系统名称 |
| type_name | varchar(100) | 否 | NULL | 产品类型名称 |

## 创建视图语句

```sql
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`192.168.20.%` SQL SECURITY DEFINER VIEW `v_system_config_simple` AS select `s`.`system_name` AS `system_name`,`pt`.`type_name` AS `type_name` from ((`ht_sales_system_configs` `sc` join `ht_sales_systems` `s` on((`sc`.`system_id` = `s`.`system_id`))) join `ht_sales_product_types` `pt` on((`sc`.`product_type_id` = `pt`.`product_type_id`))) order by `s`.`system_order`,`pt`.`type_name`
```
