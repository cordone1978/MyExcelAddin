const { Router } = require('express');
const { requireAuth, buildSafeErrorMessage } = require('../lib/authService');
const { API_ROUTES } = require('../serverConstants');

const router = Router();

const MAX_EXPORT_HTML_SIZE = 5 * 1024 * 1024;
const MAX_EXPORT_FILENAME_LENGTH = 120;

let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch {
  console.warn('puppeteer 未安装，PDF 导出功能不可用。如需使用请执行 npm i puppeteer');
}

// 10. Export quote preview page as PDF
router.post(API_ROUTES.exportQuotePdf, requireAuth, async (req, res) => {
  let browser;
  try {
    const html = String(req.body?.html || "").trim();
    const fileName =
      String(req.body?.fileName || "报价汇总表")
        .trim()
        .slice(0, MAX_EXPORT_FILENAME_LENGTH) || "报价汇总表";
    const landscape = Boolean(req.body?.landscape);

    if (!html) {
      res.status(400).json({ success: false, error: "缺少导出内容" });
      return;
    }
    if (Buffer.byteLength(html, "utf8") > MAX_EXPORT_HTML_SIZE) {
      res.status(400).json({ success: false, error: "导出内容过大" });
      return;
    }
    if (!puppeteer) {
      res.status(500).json({ success: false, error: "服务器未安装 puppeteer，请先执行 npm i puppeteer" });
      return;
    }

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");

    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape,
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });

    const encodedName = encodeURIComponent(`${fileName}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedName}`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Export quote PDF failed:", error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "导出PDF失败") });
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
});

module.exports = router;
