#!/usr/bin/env node
/**
 * 全网热榜看板 - 数据抓取 & HTML 生成脚本 (Node.js版)
 * 用于本地测试；GitHub Actions 使用 Python 版 (fetch_and_generate.py)
 */

const https = require('https');
const fs = require('fs');

const API_BASE = 'https://60s.viki.moe/v2';
const AUTOHOME_API = 'https://news.app.autohome.com.cn/news_v10.0.0/news/newsranklistv2';
const TIMEOUT = 15000;

const AUTO_KEYWORDS = [
  '车','新能源','比亚迪','特斯拉','丰田','本田','宝马','奔驰','奥迪','蔚来','理想','小鹏','吉利','长安','大众','福特',
  '保时捷','华为','小米汽车','小米SU','乐道','方程豹','自动驾驶','充电','续航','混动','纯电','发动机','变速箱',
  '汽车','轿车','SUV','MPV','销量','召回','碰撞','油价','充电桩','路测','试驾','上市','首发','亮相'
];

const WEIBO_AUTO_KW = [
  // 汽车品牌（精准匹配）
  '比亚迪','特斯拉','丰田','本田','宝马','奔驰','奥迪','蔚来','理想','小鹏',
  '吉利','长安汽车','大众汽车','大众ID','福特','保时捷','东风日产','问界','智界','享界',
  '极氪','零跑','岚图','深蓝','哪吒','红旗','领克','奇瑞','名爵','阿维塔',
  '高合','乐道','方程豹','捷途','宝骏','启源','星途','智己','飞凡',
  '鸿蒙智行','小米汽车','小米SU7','小米SU','华为智驾','华为鸿蒙','华为汽车',
  // 汽车品类/技术术语
  '新能源车','新能源汽车','混动车型','纯电车型','插混','增程式','充电桩','动力电池',
  '智能驾驶','智能座舱','辅助驾驶','车机系统','智驾',
  '油耗','车祸','追尾','试驾','提车','交车','购车','买车',
  '燃油车','电动车','电车','越野车','摩托车','赛车',
  '车企','造车','新势力','网约车','车险','驾考',
];
const ENT_KW = ['文娱','影视','综艺','明星','音乐','电影','电视剧','演出','娱乐','浪姐','歌手','乘风','芒果','选秀','演唱会','票房','热巴','杨幂','刘诗诗','张柏芝','白鹿','迪丽热巴','王力宏','名侦探柯南','何猷君','奚梦瑶','方媛','李纯','徐志胜','张嘉益','痞幼','沈腾','孙颖莎','柳智敏','Faker','李乃文','梅婷','黄圣依','金鹰奖'];
const TECH_KW = [
  // AI / 大模型
  '英伟达','NVIDIA','OpenAI','ChatGPT','GPT','大模型','算力','人工智能','AI大模型',
  'Sora','Claude','Gemini','豆包','文心一言','通义千问','Kimi','讯飞','DeepSeek',
  // 芯片 / 半导体
  '芯片','半导体','台积电','高通','联发科','英特尔','Intel','AMD','光刻机','芯片制造','存储芯片','显卡',
  // 科技巨头 & 平台
  '苹果公司','iPhone','iOS','iPad','MacBook','Apple Vision',
  '安卓','Android','华为','腾讯','微信','阿里巴巴','阿里云','百度','字节跳动',
  '京东','美团','拼多多','网易','快手','抖音','TikTok','小红书','B站',
  '小米','OPPO','vivo','荣耀','三星','索尼','Meta','谷歌','微软',
  // 前沿科技
  '比特币','加密货币','区块链','元宇宙','云计算','物联网',
  '量子计算','机器人','人形机器人','VR眼镜','AR眼镜','空间计算',
  // 通信 / 安全
  '5G','6G','电信','联通','宽带','光纤','网络安全','数据泄露','黑客','漏洞',
  // 科技人物
  '马斯克','库克','黄仁勋','扎克伯格','奥特曼',
  // 消费电子
  '苹果手机','智能手机','折叠屏','卫星通信','开源','开发者',
];

function nowBJ() { return new Date(Date.now() + 8 * 3600 * 1000); }
function formatBJ(d) {
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')} ${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: TIMEOUT }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(j.code === 200 && j.data ? j.data : []);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function fetchAutohome(limit = 10) {
  return new Promise((resolve, reject) => {
    const url = AUTOHOME_API;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://fs.autohome.com.cn/',
      },
      timeout: TIMEOUT,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const hotranklist = (j && j.result) ? j.result.hotranklist : [];
          for (const cat of hotranklist) {
            const lst = cat.list || [];
            if (!lst.length) continue;
            const result = lst.slice(0, limit).map((item, i) => ({
              rank: i + 1, title: item.title || '',
              url: `https://fs.autohome.com.cn/app_spa/hotart/index.html#detail?id=${item.bizid}`,
              hot: '', hot_num: 0,
            }));
            return resolve(result);
          }
          resolve([]);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function normalizeDcd(items, limit = 10) {
  return items.slice(0, limit).map((d, i) => ({
    rank: d.rank || i + 1, title: d.title || '', url: d.url || '',
    hot: d.score_desc || String(d.score || ''), hot_num: d.score || 0,
  }));
}
function normalizeToutiao(items, limit = 20) {
  return items.slice(0, limit).map((d, i) => ({
    rank: i + 1, title: d.title || '', url: d.link || '',
    hot: d.hot_value || 0, hot_num: d.hot_value || 0, label: d.label || '',
  }));
}
function normalizeDouyin(items, limit = 20) {
  return items.slice(0, limit).map((d, i) => ({
    rank: i + 1, title: d.title || '', url: d.link || '',
    hot: d.hot_value || 0, hot_num: d.hot_value || 0,
  }));
}
function normalizeWeibo(items, limit = 20) {
  return items.slice(0, limit).map((d, i) => ({
    rank: i + 1, title: d.title || '', url: d.link || '',
    hot: d.hot_value || 0, hot_num: d.hot_value || 0, label: d.label || '',
  }));
}
function normalizeItNews(items, limit = 20) {
  return items.slice(0, limit).map((d, i) => ({
    rank: i + 1, title: d.title || '', url: d.url || d.link || '',
    hot: '', hot_num: 0, label: '',
  }));
}

function filterByKw(items, keywords, normalizer, limit = 10) {
  const result = [];
  for (const item of items) {
    const t = item.title || '';
    for (const kw of keywords) {
      if (t.includes(kw)) { result.push(item); break; }
    }
    if (result.length >= limit) break;
  }
  return normalizer(result, limit);
}

function formatHot(val) {
  const s = String(val).trim();
  if (/w/i.test(s) || s.includes('万')) return s;
  const n = parseInt(val) || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n > 0 ? String(n) : s;
}

function buildBoardHTML(id, logo, name, badge, color, items) {
  const maxHot = items.length > 0 ? Math.max(...items.map(i => i.hot_num || 0), 1) : 1;
  const itemsHTML = items.length === 0
    ? `      <div class="empty-tip">当前时段暂无相关话题</div>\n`
    : items.map(item => {
    const { rank, title: t, url, hot, hot_num } = item;
    const pct = Math.round((hot_num || 0) / maxHot * 100);
    const rc = rank <= 3 ? 'rank-top' : rank <= 10 ? 'rank-accent' : 'rank-normal';
    const safeUrl = (url || '#').replace(/'/g, '&#39;');
    const safeTitle = t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `      <div class="item" onclick="window.open('${safeUrl}','_blank')">
        <div class="rank ${rc}">${rank}</div>
        <div class="item-body">
          <a class="item-title" href="${safeUrl}" target="_blank" rel="noopener">${safeTitle}</a>
          <div class="item-foot">
            <div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:#555"></div></div>
            <span class="hot-num">${formatHot(hot)}</span>
          </div>
        </div>
      </div>`;
  }).join('\n');

  return `  <div class="board" id="${id}">
    <div class="board-head">
      <img class="logo" src="${logo}" alt="${name}" onerror="this.style.display='none'">
      <span class="board-name">${name}</span>
      <span class="badge" style="background:${color};color:#fff">${badge}</span>
    </div>
    <div class="list">
${itemsHTML}
    </div>
  </div>`;
}

function generateHTML(boards) {
  const updateTime = formatBJ(nowBJ());
  const boardsHTML = boards.map(b => buildBoardHTML(b.id, b.logo, b.name, b.badge, b.color, b.items)).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>全网热榜看板</title>
<style>
:root{--bg:#f0f2f5;--card:#fff;--text:#1a1a2e;--text2:#6b7280;--border:#e5e7eb;--shadow:0 2px 8px rgba(0,0,0,.06);--radius:12px}
@media(prefers-color-scheme:dark){:root{--bg:#0a0a0f;--card:#16161d;--text:#e8e8ed;--text2:#6e6e78;--border:#2a2a35;--shadow:0 2px 8px rgba(0,0,0,.3)}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text);line-height:1.5;min-height:100vh}
.header{text-align:center;padding:32px 16px 12px}
.header h1{font-size:24px;font-weight:800;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-.5px}
.header .sub{font-size:13px;color:var(--text2);margin-top:6px}
.header .sub span{display:inline-block;background:rgba(102,126,234,.1);color:#667eea;padding:2px 10px;border-radius:20px;font-weight:600;font-size:12px;margin-left:6px}
.boards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;max-width:1400px;margin:16px auto;padding:0 16px 24px}
.board{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column}
.board-head{display:flex;align-items:center;gap:8px;padding:12px 14px 10px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card);z-index:10}
.logo{width:20px;height:20px;border-radius:4px;object-fit:contain;flex-shrink:0}
.board-name{font-size:14px;font-weight:700;flex:1;color:var(--text)}
.badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;letter-spacing:.3px;white-space:nowrap}
.list{flex:1;padding:4px 6px 8px;overflow-y:auto;max-height:520px}
.item{display:flex;align-items:flex-start;gap:8px;padding:6px;border-radius:8px;cursor:pointer;transition:background .15s}
.item:hover{background:rgba(0,0,0,.03)}
@media(prefers-color-scheme:dark){.item:hover{background:rgba(255,255,255,.03)}}
.rank{min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border-radius:6px;margin-top:2px;flex-shrink:0}
.rank-top{background:linear-gradient(135deg,#ff6b35,#ee5a24);color:#fff;box-shadow:0 2px 6px rgba(238,90,36,.25)}
.rank-accent{background:rgba(102,126,234,.1);color:#667eea}
.rank-normal{background:var(--bg);color:var(--text2);font-weight:600}
.item-body{flex:1;min-width:0}
.item-title{display:block;font-size:13px;font-weight:500;color:var(--text);text-decoration:none;line-height:1.5;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;transition:opacity .15s}
.item-title:hover{opacity:.6}
.item-foot{display:flex;align-items:center;gap:6px;margin-top:3px}
.bar-wrap{flex:1;height:3px;background:var(--border);border-radius:2px;overflow:hidden}
.bar-fill{height:100%;border-radius:2px;min-width:4px}
.hot-num{font-size:10px;color:var(--text2);white-space:nowrap;flex-shrink:0;min-width:30px;text-align:right}
.empty-tip{text-align:center;color:var(--text2);font-size:12px;padding:40px 16px;opacity:.6}
.footer{text-align:center;padding:16px;font-size:11px;color:var(--text2);border-top:1px solid var(--border);max-width:1400px;margin:0 auto}
.footer a{color:#667eea;text-decoration:none}.footer a:hover{text-decoration:underline}
.back-top{position:fixed;bottom:24px;right:24px;width:36px;height:36px;border-radius:50%;background:var(--card);border:1px solid var(--border);box-shadow:0 2px 8px rgba(0,0,0,.1);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;opacity:0;transition:opacity .3s;z-index:99}
.back-top.show{opacity:1}.back-top:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.15)}
@media(max-width:1100px){.boards{grid-template-columns:repeat(2,1fr)}}
@media(max-width:640px){.boards{grid-template-columns:1fr;gap:10px}.header h1{font-size:20px}.list{max-height:none}}
</style>
</head>
<body>
<div class="header"><h1>全网热榜看板</h1><div class="sub">每日 10:30 &amp; 15:00 自动更新 <span>${updateTime}</span></div></div>
<div class="boards">
${boardsHTML}
</div>
<div class="footer">数据来源: <a href="https://60s.viki.moe" target="_blank">60s API</a> · 部署于 <a href="https://pages.github.com" target="_blank">GitHub Pages</a></div>
<div class="back-top" id="backTop" onclick="window.scrollTo({top:0,behavior:'smooth'})">↑</div>
<script>window.addEventListener('scroll',function(){document.getElementById('backTop').classList.toggle('show',window.scrollY>400)});</script>
</body>
</html>`;
}

async function main() {
  console.log('='.repeat(50));
  console.log(`全网热榜看板 - ${formatBJ(nowBJ())}`);
  console.log('='.repeat(50));

  console.log('[1/6] 汽车之家热榜...');
  const ahHot = await fetchAutohome(10).catch(e => { console.error('  汽车之家抓取失败:', e.message); return []; });
  console.log(`  → ${ahHot.length} 条`);

  console.log('[2/6] 懂车帝热榜...');
  const dcd = await fetchJSON(`${API_BASE}/dongchedi`);
  console.log(`  → ${dcd.length} 条`);

  console.log('[3/6] 今日头条...');
  const toutiao = await fetchJSON(`${API_BASE}/toutiao`);
  console.log(`  → ${toutiao.length} 条`);

  console.log('[4/6] 抖音热榜...');
  const douyin = await fetchJSON(`${API_BASE}/douyin`);
  console.log(`  → ${douyin.length} 条`);

  console.log('[5/6] 微博热搜...');
  const weibo = await fetchJSON(`${API_BASE}/weibo`);
  console.log(`  → ${weibo.length} 条`);

  console.log('[6/6] IT资讯(汽车补充)...');
  const itnews = await fetchJSON(`${API_BASE}/it-news`);
  console.log(`  → ${itnews.length} 条`);

  // 数据处理
  const autohomeHot = ahHot;                        // 汽车之家热榜（真实数据）
  const dcdHot = normalizeDcd(dcd, 10);              // 懂车帝热点榜

  // 微博汽车热榜：先从微博热搜匹配，不够10条则从IT资讯补充
  const wbAutoFromWeibo = filterByKw(weibo, WEIBO_AUTO_KW, normalizeWeibo, 10);
  let wbAuto = wbAutoFromWeibo;
  if (wbAuto.length < 10 && itnews.length > 0) {
    // 从it-news中筛选汽车内容，排除已有的标题
    const existTitles = new Set(wbAuto.map(i => i.title));
    const itAuto = filterByKw(itnews, WEIBO_AUTO_KW, normalizeItNews, 10)
      .filter(i => !existTitles.has(i.title));
    wbAuto = [...wbAuto, ...itAuto].slice(0, 10);
    // 重新编号
    wbAuto = wbAuto.map((item, i) => ({ ...item, rank: i + 1 }));
  }
  console.log(`  微博汽车热榜: ${wbAutoFromWeibo.length}(微博) + ${wbAuto.length - wbAutoFromWeibo.length}(IT资讯) = ${wbAuto.length} 条`);

  const ttHot = normalizeToutiao(toutiao, 20);       // 头条热榜
  const dyHot = normalizeDouyin(douyin, 20);         // 抖音热榜
  const wbHot = normalizeWeibo(weibo, 20);           // 微博热搜
  const wbEnt = filterByKw(weibo, ENT_KW, normalizeWeibo, 10);   // 微博文娱
  const wbTech = filterByKw(weibo, TECH_KW, normalizeWeibo, 10); // 微博科技

  const boards = [
    // 第一行
    { id: 'autohome-hot', logo: 'https://www.autohome.com.cn/favicon.ico', name: '汽车之家', badge: '热榜',     color: '#FF6600', items: autohomeHot },
    { id: 'dcd-hot',      logo: 'https://icon.horse/icon/www.dongchedi.com', name: '懂车帝',   badge: '热点榜',   color: '#00b894', items: dcdHot },
    { id: 'wb-auto',      logo: 'https://weibo.com/favicon.ico',           name: '新浪微博', badge: '汽车热榜', color: '#e17055', items: wbAuto },
    { id: 'tt-hot',       logo: 'https://www.toutiao.com/favicon.ico',     name: '今日头条', badge: '头条热榜', color: '#ff4757', items: ttHot },
    // 第二行
    { id: 'dy-hot',       logo: 'https://www.douyin.com/favicon.ico',      name: '抖音',     badge: '热榜',     color: '#1a1a2e', items: dyHot },
    { id: 'wb-hot',       logo: 'https://weibo.com/favicon.ico',           name: '新浪微博', badge: '热搜榜',   color: '#ff4500', items: wbHot },
    { id: 'wb-ent',       logo: 'https://weibo.com/favicon.ico',           name: '新浪微博', badge: '文娱热搜', color: '#e84393', items: wbEnt },
    { id: 'wb-tech',      logo: 'https://weibo.com/favicon.ico',           name: '新浪微博', badge: '科技热搜', color: '#6c5ce7', items: wbTech },
  ];

  const html = generateHTML(boards);
  const outPath = process.argv[2] || 'index.html';
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`\n✅ ${outPath} (${Buffer.byteLength(html)} bytes)`);

  const empty = boards.filter(b => b.items.length === 0).map(b => b.name + ' ' + b.badge);
  if (empty.length) { console.log(`⚠️ 暂无数据: ${empty.join(', ')}`); }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
