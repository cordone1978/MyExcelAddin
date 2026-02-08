// unpack_real.js
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const pkdFile = 'images.pkd';
const outputDir = './public/images';

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('=== 真实解包脚本 ===\n');

const buffer = fs.readFileSync(pkdFile);

// 验证文件头
if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
    console.error('错误：不是有效的PKD文件');
    process.exit(1);
}

// 文件数量
const fileCount = buffer.readUInt16LE(2);
console.log(`文件总数: ${fileCount}\n`);

// 显示前30字节帮助分析
console.log('前30字节分析:');
for (let i = 0; i < 30; i++) {
    const hex = buffer[i].toString(16).padStart(2, '0');
    const ascii = buffer[i] >= 32 && buffer[i] <= 126 ? String.fromCharCode(buffer[i]) : '.';
    console.log(`${i.toString().padStart(2)}: 0x${hex} '${ascii}'`);
}

let offset = 4; // 从第一个文件名长度开始
const results = [];

for (let i = 0; i < fileCount; i++) {
    console.log(`\n--- 文件 ${i + 1} ---`);
    console.log(`偏移: ${offset} (0x${offset.toString(16)})`);
    
    try {
        // 1. 读取文件名长度
        const nameLen = buffer[offset];
        offset += 1;
        console.log(`文件名长度字节: ${nameLen} (可能不准确)`);
        
        // 2. 尝试读取文件名，但先不移动offset
        // 直接搜索.png扩展名来确定实际长度
        let actualNameLen = nameLen;
        for (let j = offset; j < Math.min(offset + 50, buffer.length); j++) {
            if (buffer[j] === 0x2E && // '.'
                buffer[j+1] === 0x70 && // 'p'
                buffer[j+2] === 0x6E && // 'n'
                buffer[j+3] === 0x67) { // 'g'
                actualNameLen = j - offset + 4;
                console.log(`找到.png在偏移 ${j}，实际文件名长度: ${actualNameLen}`);
                break;
            }
        }
        
        // 3. 读取文件名
        const nameBytes = buffer.slice(offset, offset + actualNameLen);
        offset += actualNameLen;
        
        // GBK解码
        const fileName = iconv.decode(nameBytes, 'gbk');
        console.log(`文件名: "${fileName}"`);
        
        // 4. 现在读取数据长度
        const dataLength = buffer.readUInt32LE(offset);
        offset += 4;
        
        console.log(`数据长度: ${dataLength} (0x${dataLength.toString(16)})`);
        console.log(`数据位置: ${offset} - ${offset + dataLength}`);
        
        // 5. 检查是否是PNG
        const header = buffer.slice(offset, offset + 8);
        const isPNG = header.toString('hex') === '89504e470d0a1a0a';
        console.log(`文件头: ${header.toString('hex')} ${isPNG ? '(PNG ✅)' : ''}`);
        
        // 6. 提取数据
        const fileData = buffer.slice(offset, offset + dataLength);
        offset += dataLength;
        
        // 7. 保存文件
        let finalName = fileName;
        if (!finalName.includes('.')) {
            finalName += isPNG ? '.png' : '.bin';
        }
        
        const outputPath = path.join(outputDir, finalName);
        fs.writeFileSync(outputPath, fileData);
        
        results.push({
            name: finalName,
            size: fileData.length,
            isPNG: isPNG
        });
        
        console.log(`✅ 保存: ${finalName} (${fileData.length} 字节)`);
        
    } catch (error) {
        console.error(`❌ 错误: ${error.message}`);
        // 尝试寻找下一个PNG头
        console.log('搜索下一个PNG头...');
        let found = false;
        for (let j = offset; j < buffer.length - 8; j++) {
            if (buffer.readUInt32BE(j) === 0x89504E47) {
                console.log(`找到PNG头在 ${j}，跳到该位置`);
                offset = j - 20; // 回溯一点找文件名
                found = true;
                break;
            }
        }
        if (!found) break;
    }
}

console.log('\n' + '='.repeat(60));
console.log(`解包完成: ${results.length}/${fileCount} 个文件`);
console.log(`输出目录: ${path.resolve(outputDir)}`);

if (results.length > 0) {
    console.log('\n解包的文件:');
    results.forEach((file, i) => {
        console.log(`${i + 1}. ${file.name} - ${(file.size/1024).toFixed(2)} KB ${file.isPNG ? '✅' : '❓'}`);
    });
}