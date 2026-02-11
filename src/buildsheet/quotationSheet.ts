/* global Excel */

interface SystemItem {
  id: number;
  name: string;
}

export async function createQuotationSheet(systems?: SystemItem[]) {
  try {
    await Excel.run(async (context) => {
      await buildQuotationSheet(context, systems);
      await buildConfigSheet(context);
    });
  } catch (error) {
    console.error(error);
  }
}

async function buildQuotationSheet(context: Excel.RequestContext, systems?: SystemItem[]) {
  const sheetName = "报价汇总表";
  const existing = context.workbook.worksheets.getItemOrNullObject(sheetName);
  existing.load("name");
  await context.sync();
  if (!existing.isNullObject) {
    existing.delete();
    await context.sync();
  }

  const sheet = context.workbook.worksheets.add(sheetName);
  sheet.activate();
  context.application.suspendScreenUpdatingUntilNextSync();

  sheet.getRange("A1:D1").merge();
  sheet.getRange("A1").values = [["湖南华通众智科技有限公司"]];
  sheet.getRange("A1").format.font.bold = true;
  sheet.getRange("A1").format.font.size = 16;
  sheet.getRange("A1").format.horizontalAlignment = "Center";
  sheet.getRange("A1").format.verticalAlignment = "Center";

  sheet.getRange("A2:D7").values = [
        ["客户名称:", "", "", ""],
        ["联系人:", "", "客户电话:", ""],
        ["交货地点:", "", "客户传真::", ""],
        ["交货时间:", "", "REF. No.", ""],
        ["付款方式:", "", "客户E-MAIL:", ""],
        ["工程名称:", "", "项目编号:", ""],
  ];

  sheet.getRange("A7:D7").merge();
  sheet.getRange("A7").values = [["配置报价表"]];
  sheet.getRange("A7").format.font.bold = true;
  sheet.getRange("A7").format.horizontalAlignment = "Center";

  sheet.getRange("A8:D8").values = [["序号", "项目", "单价（元）", "备注"]];
  sheet.getRange("A8:D8").format.font.bold = true;
  sheet.getRange("A8:D8").format.horizontalAlignment = "Center";
  sheet.getRange("A8:D8").format.verticalAlignment = "Center";

  const items = [
        [1, "原料给料系统", "", ""],
        [2, "改性剂给料系统", "", ""],
        [3, "磨机系统", "", ""],
        [4, "除尘器系统", "", ""],
        [5, "加热系统", "", ""],
        [6, "输送管道部分", "", ""],
        [7, "仪器仪表", "", ""],
        [8, "公用工程", "", ""],
        [9, "钢构", "", ""],
        [10, "控制系统部分", "", ""],
        [11, "筛分除磁包装", "", ""],
        [12, "包装、运输", "", ""],
        [13, "安装、调试", "", ""],
  ];
  sheet.getRange("A9:D21").values = items;
  sheet.getRange("A9:A21").format.horizontalAlignment = "Center";
  sheet.getRange("C9:C21").format.horizontalAlignment = "Center";

  sheet.getRange("A22:B22").merge();
  sheet.getRange("A22").values = [["总计（万元）"]];
  sheet.getRange("C22").values = [[""]];
  sheet.getRange("A22:D22").format.font.bold = true;
  sheet.getRange("A22:D22").format.horizontalAlignment = "Center";

  sheet.getRange("A23:A29").merge();
  sheet.getRange("A23").values = [["备注"]];
  sheet.getRange("A23").format.horizontalAlignment = "Center";
  sheet.getRange("A23").format.verticalAlignment = "Center";

  sheet.getRange("B23:D23").merge();
  sheet.getRange("B23").values = [["1) 以上报价不含电缆和桥架,不含筒体料仓、水气管路(由客户提供),不含管道保温。"]];

  sheet.getRange("B24:D24").merge();
  sheet.getRange("B24").values = [["2) 华通负责现场安装、调试，不含任何设备和操作钢架平台，供货由原料处重粉料斗进料阀开始至收尘器出料旋转阀下法兰为止，其它可由客户根据华通设计施工图进行制作。"]];

  sheet.getRange("B25:D25").merge();
  sheet.getRange("B25").values = [["3) 以上报价含13%增值税，含现场安装调试费用，含运保费；"]];

  sheet.getRange("B26:D26").merge();
  sheet.getRange("B26").values = [["4) 本报价包括20%软件费用，签订建设合同时需分项注明此费用；"]];

  sheet.getRange("B27:D27").merge();
  sheet.getRange("B27").values = [["5) 以上报价不含任何涉及土建、设备和检修钢平台、建筑改动、拆墙、穿墙洞、打楼板等费用；"]];

  sheet.getRange("B28:D28").merge();
  sheet.getRange("B28").values = [["6) 业主需要有机电操作维护人员，才能保持设备的最佳运行效率；"]];

  sheet.getRange("B29:D29").merge();
  sheet.getRange("B29").values = [["7) 安装调试期间,操作维修人员必须参与教育训练,参与人员为操作、维修、现场主管,并设对口负责人。"]];

  sheet.getRange("B23:D29").format.wrapText = true;
  sheet.getRange("B23:D29").format.verticalAlignment = "Center";

  sheet.getRange("A1:D29").format.font.name = "Microsoft YaHei";
  sheet.getRange("A1:D29").format.font.size = 11;
  sheet.getRange("A1").format.font.size = 16;

  const borderRange = sheet.getRange("A1:D29").format.borders;
  borderRange.getItem("InsideHorizontal").style = "Continuous";
  borderRange.getItem("InsideVertical").style = "Continuous";
  borderRange.getItem("EdgeTop").style = "Continuous";
  borderRange.getItem("EdgeBottom").style = "Continuous";
  borderRange.getItem("EdgeLeft").style = "Continuous";
  borderRange.getItem("EdgeRight").style = "Continuous";

  sheet.getRange("A1").rowHeight = 28;
  sheet.getRange("A7").rowHeight = 22;
  sheet.getRange("A8").rowHeight = 20;
  sheet.getRange("A23").rowHeight = 80;

  // 设置列宽
  const colA = sheet.getRange("A:A");
  const colB = sheet.getRange("B:B");
  const colC = sheet.getRange("C:C");
  const colD = sheet.getRange("D:D");

  // 先自动调整，然后再设置固定宽度
  sheet.getRange("A1:D29").format.autofitColumns();

  colA.format.columnWidth = 50;
  colB.format.columnWidth = 200;
  colC.format.columnWidth = 120;
  colD.format.columnWidth = 150;

  // 同步所有格式设置到 Excel
  await context.sync();
}

async function buildConfigSheet(context: Excel.RequestContext) {
  const sheetName = "配置表";
  const existing = context.workbook.worksheets.getItemOrNullObject(sheetName);
  existing.load("name");
  await context.sync();
  if (!existing.isNullObject) {
    existing.delete();
    await context.sync();
  }

  const sheet = context.workbook.worksheets.add(sheetName);
  sheet.activate();
  context.application.suspendApiCalculationUntilNextSync();
  context.application.suspendScreenUpdatingUntilNextSync();

  const headers = [
    "系列",
    "设备名称",
    "组件名称",
    "内容及规格",
    "型号",
    "材质",
    "品牌",
    "组件数量",
    "单位",
    "设备数量",
    "单位",
    "单价（万元）",
    "总价（万元）",
    "成本单价（元）",
    "成本合计（元）",
    "合计（元）",
    "系数",
    "备注",
    "备注",
  ];

const sections = [
    "一、原料给料系统",
    "二、改性剂给料系统",
    "三、磨机系统",
    "四、除尘器系统",
    "五、加热系统",
    "六、输送管道部分",
    "七、仪器仪表",
    "八、公用工程",
    "九、钢构",
    "十、控制系统部分",
    "十一、筛分除磁包装",
    "十二、包装、运输",
    "十三、安装、调试",
];

  let row = 1;
  const titleRows: number[] = []; // 记录标题行号，用于后续去掉框线

  sections.forEach((title) => {
    // 分段标题行
    sheet.getRange(`A${row}:S${row}`).values = [new Array(headers.length).fill("")];
    sheet.getRange(`A${row}:K${row}`).merge();
    sheet.getRange(`A${row}`).values = [[title]];
    sheet.getRange(`A${row}`).format.font.bold = true;

    // 设置标题行行高为默认的2倍（默认约15，设置为30）
    sheet.getRange(`A${row}`).format.rowHeight = 30;

    titleRows.push(row); // 记录标题行

    // 分段总价单元格（对应"总价（万元）"列）
    sheet.getRange(`L${row}`).values = [["总价"]];
    sheet.getRange(`L${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`L${row}`).format.font.bold = true;
    sheet.getRange(`M${row}`).values = [[""]];
    sheet.getRange(`M${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`M${row}`).format.font.bold = true;

    row += 1;

    // 表头行
    sheet.getRange(`A${row}:S${row}`).values = [headers];
    sheet.getRange(`A${row}:S${row}`).format.font.bold = true;
    sheet.getRange(`A${row}:S${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`A${row}:S${row}`).format.verticalAlignment = "Center";

    // 设置表头行行高为默认的2倍
    sheet.getRange(`A${row}`).format.rowHeight = 30;
    row += 1;
  });

  const lastRow = row - 1;
  sheet.getRange(`A1:S${lastRow}`).format.font.name = "Microsoft YaHei";
  sheet.getRange(`A1:S${lastRow}`).format.font.size = 11;

  // 绿色成本区：N-R（成本单价/成本合计/合计/系数/备注）- 整列设置
  sheet.getRange("N:R").format.fill.color = "#cfe8b9";

  // 设置框线：横框线加粗，竖框线普通
  const borders = sheet.getRange(`A1:S${lastRow}`).format.borders;
  borders.getItem("InsideHorizontal").style = "Continuous";
  borders.getItem("InsideHorizontal").weight = "Medium";
  borders.getItem("InsideVertical").style = "Continuous";
  borders.getItem("InsideVertical").weight = "Thin"; // 中间竖线保持细线
  borders.getItem("EdgeTop").style = "Continuous";
  borders.getItem("EdgeTop").weight = "Medium";
  borders.getItem("EdgeBottom").style = "Continuous";
  borders.getItem("EdgeBottom").weight = "Medium";
  borders.getItem("EdgeLeft").style = "Continuous";
  borders.getItem("EdgeLeft").weight = "Thin";
  borders.getItem("EdgeRight").style = "Continuous";
  borders.getItem("EdgeRight").weight = "Medium"; // 最右边的竖框线保留

  // 去掉标题行的竖框线（保留横框线）
  titleRows.forEach((titleRow) => {
    const titleBorders = sheet.getRange(`A${titleRow}:S${titleRow}`).format.borders;
    titleBorders.getItem("InsideVertical").style = "None";
    // 保留横框线（上下边框）为加粗
    titleBorders.getItem("EdgeTop").style = "Continuous";
    titleBorders.getItem("EdgeTop").weight = "Medium";
    titleBorders.getItem("EdgeBottom").style = "Continuous";
    titleBorders.getItem("EdgeBottom").weight = "Medium";
    // 去掉左右边框的竖线，但保留最右边的
    titleBorders.getItem("EdgeLeft").style = "None";
    // EdgeRight 保留，因为是最右边
  });

  // 设置列宽
  sheet.getRange("A:A").format.columnWidth = 50;
  sheet.getRange("B:B").format.columnWidth = 120;
  sheet.getRange("C:C").format.columnWidth = 150;
  sheet.getRange("D:D").format.columnWidth = 220;
  sheet.getRange("E:E").format.columnWidth = 150;
  sheet.getRange("F:F").format.columnWidth = 120;
  sheet.getRange("G:G").format.columnWidth = 90;
  sheet.getRange("H:H").format.columnWidth = 50;
  sheet.getRange("I:I").format.columnWidth = 50;
  sheet.getRange("J:J").format.columnWidth = 50;
  sheet.getRange("K:K").format.columnWidth = 50;
  sheet.getRange("L:L").format.columnWidth = 90;
  sheet.getRange("M:M").format.columnWidth = 90;
  sheet.getRange("N:N").format.columnWidth = 90;
  sheet.getRange("O:O").format.columnWidth = 90;
  sheet.getRange("P:P").format.columnWidth = 90;
  sheet.getRange("Q:Q").format.columnWidth = 50;
  sheet.getRange("R:R").format.columnWidth = 120;
  sheet.getRange("S:S").format.columnWidth = 120;

  // 预设足够大的行高，避免插入后落入默认行高区域
  sheet.getRange("A1:S2000").format.rowHeight = 30;

  // 同步所有格式设置到 Excel
  await context.sync();
}
