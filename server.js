/**
 * server.js - 全网热榜看板 Web 服务器
 * Zeabur 部署入口，Express + 定时刷新
 */

const express = require('express');
const cron = require('node-cron');
const { fetchAndGenerate } = require('./fetcher');

const app = express();
const PORT = process.env.PORT || 3000;

// 内存缓存
let cachedHTML = '';
let lastUpdate = '';
let isRefreshing = false;

// 刷新数据
async function refreshData() {
  if (isRefreshing) {
    console.log('  ⏳ 上次刷新尚未完成，跳过');
    return;
  }
  isRefreshing = true;
  try {
    cachedHTML = await fetchAndGenerate();
    lastUpdate = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.log(`  🕐 缓存已更新: ${lastUpdate}`);
  } catch (err) {
    console.error('  ❌ 刷新失败:', err.message);
  } finally {
    isRefreshing = false;
  }
}

// 首页：返回看板 HTML
app.get('/', async (req, res) => {
  // 如果还没有缓存，先同步抓一次
  if (!cachedHTML) {
    try {
      cachedHTML = await fetchAndGenerate();
    } catch (err) {
      return res.status(503).send(`<h1>服务启动中，请稍后刷新</h1><p>${err.message}</p>`);
    }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(cachedHTML);
});

// 手动触发刷新（可选，方便调试）
app.get('/refresh', async (req, res) => {
  await refreshData();
  res.json({ status: 'ok', lastUpdate });
});

// 健康检查（Zeabur 会用这个判断服务是否存活）
app.get('/health', (req, res) => {
  res.json({ status: 'ok', lastUpdate, hasCache: !!cachedHTML });
});

// ─── 启动 ─────────────────────────────────────────
async function start() {
  // 启动时立即抓一次
  await refreshData();

  // 每30分钟刷新一次
  cron.schedule('*/30 * * * *', async () => {
    console.log(`[Cron] 定时刷新触发`);
    await refreshData();
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 全网热榜看板已启动: http://localhost:${PORT}`);
    console.log(`   定时刷新: 每 30 分钟`);
    console.log(`   手动刷新: http://localhost:${PORT}/refresh`);
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
