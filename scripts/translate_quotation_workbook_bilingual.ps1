$ErrorActionPreference = 'Stop'

$sourcePath = 'C:\Users\zhuhuihua\Desktop\欧米亚 DCM1500-FJ 包覆改性系统项目_20260205-V01.xlsx'
$outputPath = 'C:\Users\zhuhuihua\Desktop\OMYA DCM1500-FJ Coating Modification System Project_20260205-V01_Bilingual.xlsx'
$englishScriptPath = 'E:\OfficeAddinProjects\quotationaddin\scripts\translate_quotation_workbook.ps1'

$sheetNameMap = @{
  'ASD750预干和DCM1500改性系统报价' = 'ASD750预干&DCM1500 Quote'
  '配置表' = '配置表 Configuration'
}

$scriptText = Get-Content -Raw -Encoding UTF8 $englishScriptPath
$translationsBlock = [regex]::Match(
  $scriptText,
  '(?s)\$translations\s*=\s*@\{(?<body>.*?)\r?\n\}\r?\n\r?\n\$excel'
)

if (-not $translationsBlock.Success) {
  throw "Failed to parse translation map from $englishScriptPath"
}

$englishTranslations = Invoke-Expression ('@{' + $translationsBlock.Groups['body'].Value + "`n}")

$bilingualOverrides = @{
  '报价日期：2026年01月30日' = '报价日期 / Quotation Date: January 30, 2026'
  '报价日期：2026年02月05日' = '报价日期 / Quotation Date: February 05, 2026'
  '付款方式（Payment）：30%+55%+10%+5%' = '付款方式 / Payment Terms: 30% + 55% + 10% + 5%'
  '工程名称（Project）：DCM1500FJ碟巢磨改性系统' = '工程名称 / Project: DCM1500FJ Disc-Nest Mill Modification System'
  '交货地点（Place of Delivery)：' = '交货地点 / Place of Delivery:'
  '交货时间（Time of Delivery)：' = '交货时间 / Delivery Schedule:'
  '联系人（Attn.)：耿总' = '联系人 / Attention: Mr. Geng'
  '买方名称（Messers）： OMYA' = '买方名称 / Buyer: OMYA'
  '客户名称（Messers）： OMYA' = '客户名称 / Customer: OMYA'
  '买方电话:' = '买方电话 / Buyer Tel:'
  '客户电话:' = '客户电话 / Customer Tel:'
  '买方传真：' = '买方传真 / Buyer Fax:'
  '客户传真：' = '客户传真 / Customer Fax:'
  '买方E-MAIL：' = '买方 E-MAIL / Buyer E-mail:'
  '客户E-MAIL：' = '客户 E-MAIL / Customer E-mail:'
  '项目编号：' = '项目编号 / Project Ref.:'
  '设备名称规格' = '设备名称规格 / Equipment Description & Specification'
  '型号' = '型号 / Model'
  '材质' = '材质 / Material'
  '品牌' = '品牌 / Brand'
  '数量' = '数量 / Qty.'
  '单位' = '单位 / Unit'
  '单价' = '单价 / Unit Price'
  '总价' = '总价 / Amount'
  '总  计：' = '总计 / Grand Total:'
  '备' = '备注'
  '注：' = ' / Remarks:'
  "备`n注：" = "备注 / Remarks:"
  "DCM1500FJ碟巢磨改性系统`n配置报价表" = "DCM1500FJ碟巢磨改性系统 / DCM1500FJ Disc-Nest Mill Modification System`n配置报价表 / Commercial Quotation Sheet"
  'DCM1500FJ碟巢磨改性系统' = 'DCM1500FJ碟巢磨改性系统 / DCM1500FJ Disc-Nest Mill Modification System'
  '配置报价表' = '配置报价表 / Commercial Quotation Sheet'
  '一、原料给料系统' = '一、原料给料系统 / I. Raw Material Feeding System'
  '二、ASD750 干燥系统' = '二、ASD750 干燥系统 / II. ASD750 Drying System'
  '三、预干燥除尘系统' = '三、预干燥除尘系统 / III. Pre-Drying Dust Collection System'
  '四、预干燥天然气直燃热风炉' = '四、预干燥天然气直燃热风炉 / IV. Pre-Drying Natural Gas Direct-Fired Hot Air Furnace'
  '五、管道、仪表部分' = '五、管道、仪表部分 / V. Piping & Instrumentation'
  '六、钢平台及设备支撑' = '六、钢平台及设备支撑 / VI. Steel Platform & Equipment Supports'
  '七、预干燥控制系统部分,' = '七、预干燥控制系统部分 / VII. Pre-Drying Control System'
  '八、改性原料给料系统' = '八、改性原料给料系统 / VIII. Modified Material Feeding System'
  '九、改性剂给料系统' = '九、改性剂给料系统 / IX. Modifier Feeding System'
  '十、DCM1500FJ 改性系统' = '十、DCM1500FJ 改性系统 / X. DCM1500FJ Modification System'
  '十一、改性除尘系统' = '十一、改性除尘系统 / XI. Modification Dust Collection System'
  '十二、改性天然气直燃热风炉' = '十二、改性天然气直燃热风炉 / XII. Natural Gas Direct-Fired Hot Air Furnace for Modification'
  '十三、改性管道、仪表部分' = '十三、改性管道、仪表部分 / XIII. Modification Piping & Instrumentation'
  '十四、钢平台及设备支撑以及管道保温' = '十四、钢平台及设备支撑以及管道保温 / XIV. Steel Platform, Equipment Supports & Pipe Insulation'
  '十五、改性控制系统部分' = '十五、改性控制系统部分 / XV. Modification Control System'
  '十六、运费、安装调试费用，每套含以下内容：' = '十六、运费、安装调试费用 / XVI. Freight, Installation & Commissioning Charges'
  '华通负责现场指导安装、调试，不含任何设备和操作钢架平台，供货由原料失重秤进料闸阀开始至收尘器出料旋转阀为止，其它可由买方根据华通设计施工图进行制作' = '华通负责现场指导安装、调试，不含任何设备和操作钢架平台，供货由原料失重秤进料闸阀开始至收尘器出料旋转阀为止，其它可由买方根据华通设计施工图进行制作 / Huatong will provide on-site installation guidance and commissioning only. Equipment operating platforms are excluded. The supply scope starts from the inlet gate valve of the raw-material loss-in-weight feeder and ends at the discharge rotary valve of the dust collector. All other items may be fabricated by the Buyer based on Huatong approved drawings.'
  '以上报价含13%增值税，含现场指导安装调试费用，含运保费；' = '以上报价含13%增值税，含现场指导安装调试费用，含运保费 / The above quotation includes 13% VAT, on-site installation guidance and commissioning, and freight insurance.'
  '以上报价不含任何涉及土建、设备和检修钢平台、建筑改动、拆墙、穿墙洞、打楼板等费用；' = '以上报价不含任何涉及土建、设备和检修钢平台、建筑改动、拆墙、穿墙洞、打楼板等费用 / The above quotation excludes any civil works, maintenance platforms, building modifications, wall openings, or floor penetrations.'
  '以上报价不含电缆和桥架,不含缓存料仓、水气管路(由买方提供),不含管道保温。' = '以上报价不含电缆和桥架,不含缓存料仓、水气管路(由买方提供),不含管道保温 / The above quotation excludes cables and cable trays, buffer silo, water/air piping to be supplied by the Buyer, and pipe insulation.'
  '本报价包括20%软件费用，签订建设合同时需分项注明此费用；' = '本报价包括20%软件费用，签订建设合同时需分项注明此费用 / This quotation includes a 20% software charge, which shall be separately identified in the formal project contract.'
  '业主需要有机电操作维护能力人员，才能保持设备的最佳运转效率；' = '业主需要有机电操作维护能力人员，才能保持设备的最佳运转效率 / The Owner shall assign personnel with adequate electro-mechanical operation and maintenance capability to ensure optimal system performance.'
  '安装调试期间,操作维修人员必须参与教育训练,参与人员为操作、维修、现场主管,并设对口负责人员。' = '安装调试期间,操作维修人员必须参与教育训练,参与人员为操作、维修、现场主管,并设对口负责人员 / During installation and commissioning, operating staff, maintenance personnel, and site supervisors shall attend training, with designated responsible counterparts assigned by the Owner.'
}

$bilingualTranslations = @{}
foreach ($key in $englishTranslations.Keys) {
  if ($bilingualOverrides.ContainsKey($key)) {
    $bilingualTranslations[$key] = $bilingualOverrides[$key]
  } else {
    $bilingualTranslations[$key] = "$key / $($englishTranslations[$key])"
  }
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $workbook = $excel.Workbooks.Open($sourcePath)

  foreach ($worksheet in $workbook.Worksheets) {
    if ($sheetNameMap.ContainsKey($worksheet.Name)) {
      $worksheet.Name = $sheetNameMap[$worksheet.Name]
    }

    $usedRange = $worksheet.UsedRange
    $rowCount = $usedRange.Rows.Count
    $columnCount = $usedRange.Columns.Count

    for ($row = 1; $row -le $rowCount; $row++) {
      for ($column = 1; $column -le $columnCount; $column++) {
        $cell = $usedRange.Cells.Item($row, $column)
        $value = $cell.Value2
        if ($value -is [string]) {
          $trimmed = $value.Trim()
          if ($bilingualTranslations.ContainsKey($trimmed)) {
            $leading = $value.Substring(0, $value.Length - $value.TrimStart().Length)
            $trailing = $value.Substring($value.TrimEnd().Length)
            $cell.Value2 = $leading + $bilingualTranslations[$trimmed] + $trailing
          }
        }
      }
    }
  }

  $workbook.SaveAs($outputPath, 51)
  $workbook.Close($true)
}
finally {
  if ($workbook) {
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($workbook) | Out-Null
  }
  $excel.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

Write-Output $outputPath
