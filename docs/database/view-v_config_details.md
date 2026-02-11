# 视图名：v_config_details

## 基本信息
- **视图用途**：暂无说明

## 字段说明

| 字段名 | 类型 | NULL | 默认值 | 说明 |
|--------|------|------|--------|------|
| config_id | int | 否 | '0' |  |
| project_name | varchar(255) | 否 | NULL | 项目名称 |
| project_code | varchar(100) | 否 | NULL | 项目编码 |
| product_type | varchar(100) | 否 | NULL | 产品类型名称 |
| product_model | varchar(100) | 否 | NULL | 产品型号 |
| config_name | varchar(255) | 否 | NULL | 配置名称 |
| config_amount | decimal(12,2) | 否 | NULL | 该设备大约的金额，可能是个平均值 |
| component_name | varchar(100) | 否 | NULL | 组件名称 |
| material_combination | varchar(500) | 否 | NULL | 材质组合 |
| component_price | decimal(12,2) | 否 | NULL | 组件价格 |
| component_notes | text | 是 | NULL | 组件备注 |

## 创建视图语句

```sql
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`192.168.20.%` SQL SECURITY DEFINER VIEW `v_config_details` AS select `pc`.`config_id` AS `config_id`,`pr`.`project_name` AS `project_name`,`pr`.`project_code` AS `project_code`,`pt`.`type_name` AS `product_type`,`p`.`product_model` AS `product_model`,`pc`.`config_name` AS `config_name`,`pc`.`config_amount` AS `config_amount`,`c`.`component_name` AS `component_name`,`cc`.`material_combination` AS `material_combination`,`cc`.`component_price` AS `component_price`,`cc`.`notes` AS `component_notes` from (((((`ht_sales_product_configs` `pc` join `ht_sales_projects` `pr` on((`pc`.`project_id` = `pr`.`project_id`))) join `ht_sales_products` `p` on((`pc`.`product_id` = `p`.`product_id`))) join `ht_sales_product_types` `pt` on((`p`.`product_type_id` = `pt`.`product_type_id`))) join `ht_sales_config_components` `cc` on((`pc`.`config_id` = `cc`.`config_id`))) join `ht_sales_components` `c` on((`cc`.`component_id` = `c`.`component_id`)))
```
