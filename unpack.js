const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const PKD_FILE = path.join(__dirname, 'images.pkd');
const OUTPUT_DIR = path.join(__dirname, 'extracted_with_names');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('开始解析带文件名的PKD文件...\n');

const buffer = fs.readFileSync(PKD_FILE);
let offset = 0;

// 1. 读取文件头
const header = buffer.slice(0, 2).toString();
if (header !== 'PK') {
    console.error('错误：无效的文件头');
    process.exit(1);
}
offset += 2;

// 2. 读取文件数量 (2字节，小端序)
const fileCount = buffer.readUInt16LE(offset);
offset += 2;
console.log(`文件总数: ${fileCount}\n`);

// 存储文件名和数据的映射
const fileEntries = [];

// 第一步：只解析元数据，不提取文件
for (let i = 0; i < fileCount; i++) {
    console.log(`解析文件 ${i + 1}:`);
    console.log(`  当前偏移: ${offset} (0x${offset.toString(16).toUpperCase()})`);
    
    try {
        // 3.1 文件名长度 (1字节)
        const nameLen = buffer.readUInt8(offset);
        offset += 1;
        console.log(`  文件名长度: ${nameLen}`);
        
        if (nameLen === 0 || nameLen > 255) {
            console.error(`  错误：无效的文件名长度 ${nameLen}`);
            break;
        }
        
        // 3.2 读取文件名
        const nameBuffer = buffer.slice(offset, offset + nameLen);
        offset += nameLen;
        
        // 尝试多种编码
        let fileName = '';
        const encodings = [
            { name: 'GBK', func: (buf) => iconv.decode(buf, 'gbk') },
            { name: 'GB2312', func: (buf) => iconv.decode(buf, 'gb2312') },
            { name: 'UTF-8', func: (buf) => buf.toString('utf8') },
            { name: 'Latin1', func: (buf) => buf.toString('latin1') },
            { name: 'CP936', func: (buf) => iconv.decode(buf, 'cp936') }
        ];
        
        console.log(`  文件名原始字节: ${nameBuffer.toString('hex')}`);
        
        for (const enc of encodings) {
            try {
                const decoded = enc.func(nameBuffer);
                if (decoded && !decoded.includes('�') && decoded.length > 0) {
                    fileName = decoded;
                    console.log(`  使用编码 ${enc.name}: "${fileName}"`);
                    break;
                }
            } catch (e) {}
        }
        
        if (!fileName) {
            // 使用hex作为文件名
            fileName = `file_${i + 1}_${nameBuffer.toString('hex').substring(0, 8)}`;
            console.log(`  无法解码，使用默认名: ${fileName}`);
        }
        
        // 3.3 读取文件数据长度 (4字节，Long类型)
        const dataLength = buffer.readUInt32LE(offset);
        offset += 4;
        console.log(`  数据长度: ${dataLength} 字节 (${(dataLength / 1024).toFixed(2)} KB)`);
        
        // 检查数据长度是否合理
        if (dataLength > buffer.length - offset) {
            console.error(`  错误：数据长度 ${dataLength} 超过文件范围`);
            break;
        }
        
        // 3.4 记录文件信息
        fileEntries.push({
            index: i,
            name: fileName,
            nameBuffer: nameBuffer,
            dataOffset: offset,
            dataLength: dataLength,
            endOffset: offset + dataLength
        });
        
        // 直接跳到下一个文件开始处（不读取数据）
        offset += dataLength;
        
        console.log(`  下一个文件将在偏移: ${offset}\n`);
        
    } catch (error) {
        console.error(`  解析失败: ${error.message}`);
        break;
    }
}

console.log('='.repeat(60));
console.log('开始提取文件...\n');

// 第二步：根据PNG文件的实际位置校正偏移量
// 先找到所有PNG文件的实际位置
const pngFiles = [];
for (let i = 0; i < buffer.length - 8; i++) {
    if (buffer.readUInt32BE(i) === 0x89504E47) { // PNG头
        // 查找IEND块
        let endPos = i;
        for (let j = i + 8; j < Math.min(i + 1000000, buffer.length - 12); j++) {
            if (buffer.readUInt32BE(j) === 0x49454E44 && // IEND
                buffer.readUInt32BE(j + 4) === 0xAE426082) { // CRC
                endPos = j + 12;
                break;
            }
        }
        
        if (endPos === i) {
            // 没找到IEND，找下一个PNG头
            for (let j = i + 8; j < Math.min(i + 5000000, buffer.length - 8); j++) {
                if (buffer.readUInt32BE(j) === 0x89504E47) {
                    endPos = j;
                    break;
                }
            }
            if (endPos === i) endPos = buffer.length;
        }
        
        pngFiles.push({
            start: i,
            end: endPos,
            length: endPos - i
        });
        
        i = endPos - 1; // 跳过这个PNG
    }
}

console.log(`找到 ${pngFiles.length} 个PNG文件`);
console.log(`解析出 ${fileEntries.length} 个文件条目\n`);

// 第三步：匹配和提取
let successCount = 0;

// 如果数量匹配，直接对应
if (fileEntries.length === pngFiles.length) {
    console.log('文件数量匹配，进行一一对应...\n');
    
    for (let i = 0; i < fileEntries.length; i++) {
        const entry = fileEntries[i];
        const png = pngFiles[i];
        
        // 验证数据长度是否接近
        const lengthDiff = Math.abs(entry.dataLength - png.length);
        const offsetDiff = Math.abs(entry.dataOffset - png.start);
        
        console.log(`文件 ${i + 1}:`);
        console.log(`  解析的名: ${entry.name}`);
        console.log(`  预期位置: ${entry.dataOffset}, 实际位置: ${png.start} (差: ${offsetDiff})`);
        console.log(`  预期长度: ${entry.dataLength}, 实际长度: ${png.length} (差: ${lengthDiff})`);
        
        // 提取文件
        const pngData = buffer.slice(png.start, png.end);
        
        // 确定文件名
        let finalName = entry.name;
        if (!finalName.includes('.')) {
            finalName += '.png';
        }
        
        // 清理文件名
        finalName = finalName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
        
        const outputPath = path.join(OUTPUT_DIR, finalName);
        fs.writeFileSync(outputPath, pngData);
        
        successCount++;
        console.log(`  ✅ 保存为: ${finalName} (${pngData.length} 字节)\n`);
    }
} else {
    console.log(`文件数量不匹配 (解析: ${fileEntries.length}, PNG: ${pngFiles.length})`);
    console.log('使用文件名列表单独保存...\n');
    
    // 保存所有PNG文件，用序号
    for (let i = 0; i < pngFiles.length; i++) {
        const png = pngFiles[i];
        const pngData = buffer.slice(png.start, png.end);
        
        // 如果有对应的文件名就用，否则用序号
        let fileName = `image_${i + 1}.png`;
        if (i < fileEntries.length) {
            const name = fileEntries[i].name;
            if (name && !name.includes('�')) {
                fileName = name.includes('.') ? name : name + '.png';
                fileName = fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
            }
        }
        
        const outputPath = path.join(OUTPUT_DIR, fileName);
        fs.writeFileSync(outputPath, pngData);
        
        successCount++;
        console.log(`${i + 1}. ${fileName} (${pngData.length} 字节)`);
    }
}

console.log('\n' + '='.repeat(60));
console.log(`提取完成！`);
console.log(`成功提取: ${successCount} 个文件`);
console.log(`输出目录: ${OUTPUT_DIR}`);

// 保存文件名映射表
const mapping = [];
fileEntries.forEach((entry, i) => {
    let pngName = `image_${i + 1}.png`;
    if (i < pngFiles.length) {
        pngName = fs.readdirSync(OUTPUT_DIR)[i] || pngName;
    }
    mapping.push({
        originalName: entry.name,
        savedAs: pngName,
        index: i + 1
    });
});

fs.writeFileSync(
    path.join(OUTPUT_DIR, '_filename_mapping.json'),
    JSON.stringify(mapping, null, 2)
);

console.log(`文件名映射已保存到: ${path.join(OUTPUT_DIR, '_filename_mapping.json')}`);