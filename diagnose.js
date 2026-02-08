const fs = require('fs');
const iconv = require('iconv-lite');

const buffer = fs.readFileSync('images.pkd');

console.log('=== PKD 文件诊断 ===');
console.log('文件大小:', buffer.length, '字节\n');

// 显示前 300 字节的十六进制
console.log('前 300 字节 (十六进制 + ASCII):');
for (let i = 0; i < Math.min(300, buffer.length); i += 16) {
    const hex = [];
    const ascii = [];
    
    for (let j = 0; j < 16 && i + j < buffer.length; j++) {
        const byte = buffer[i + j];
        hex.push(byte.toString(16).padStart(2, '0'));
        ascii.push(byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.');
    }
    
    console.log(
        i.toString(16).padStart(4, '0') + ':', 
        hex.join(' ').padEnd(48), 
        '|', 
        ascii.join('')
    );
}

console.log('\n=== 手动解析 ===');
let offset = 0;

// 文件头
console.log('偏移 0-1: 文件头 =', String.fromCharCode(buffer[0], buffer[1]));
offset = 2;

// 文件数量
const fileCount = buffer.readInt16LE(offset);
console.log('偏移 2-3: 文件数量 =', fileCount);
offset = 4;

// 第一个文件
console.log('\n第一个文件:');
const nameLen = buffer[offset];
console.log('偏移', offset, ': 文件名长度 =', nameLen);
offset += 1;

console.log('偏移', offset, '-', offset + nameLen - 1, ': 文件名字节 =');
console.log('  十六进制:', buffer.slice(offset, offset + nameLen).toString('hex'));
console.log('  GBK 解码:', iconv.decode(buffer.slice(offset, offset + nameLen), 'gbk'));
offset += nameLen;

console.log('偏移', offset, '-', offset + 3, ': 数据长度 (4字节) =');
console.log('  十六进制:', buffer.slice(offset, offset + 4).toString('hex'));
console.log('  小端序读取:', buffer.readInt32LE(offset));
console.log('  大端序读取:', buffer.readInt32BE(offset));

// 尝试找真实的数据长度
console.log('\n尝试不同位置读取数据长度:');
for (let testOffset = offset; testOffset < offset + 20; testOffset++) {
    if (testOffset + 4 <= buffer.length) {
        const len = buffer.readUInt32LE(testOffset);
        if (len > 0 && len < 100 * 1024 * 1024) {  // 合理范围：0-100MB
            console.log(`  偏移 ${testOffset}: ${len} (${(len/1024).toFixed(2)} KB) ← 可能`);
        }
    }
}