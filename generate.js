/**
 * generate.js - 生成静态 index.html（供 GitHub Actions 使用）
 * 调用 fetcher.js 抓取数据，输出到 index.html
 */
const { fetchAndGenerate } = require('./fetcher');
const fs = require('fs');

(async () => {
  try {
    const html = await fetchAndGenerate();
    fs.writeFileSync('index.html', html, 'utf-8');
    console.log(`✅ index.html generated (${Buffer.byteLength(html)} bytes)`);
  } catch (err) {
    console.error('❌ 生成失败:', err.message);
    process.exit(1);
  }
})();
