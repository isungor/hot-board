#!/usr/bin/env node
/**
 * 全网热榜看板 - 数据抓取 & HTML 生成脚本 (Node.js版)
 * 用于本地测试；GitHub Actions 使用 Python 版 (fetch_and_generate.py)
 *
 * 数据源:
 *   60s API: dongchedi / toutiao / douyin / weibo / it-news / baidu/hot
 *   汽车之家: newshotrankh5list (H5 今日实时热点榜)
 *   tophub:  微博文娱榜 (带重试 + fallback)
 */

const https = require('https');
const fs = require('fs');

const API_BASE = 'https://60s.viki.moe/v2';
const AUTOHOME_API = 'https://news.app.autohome.com.cn/news_v10.0.0/news/newshotrankh5list';
const TOPHUB_ENT_NODE = '/n/3QeLwJEd7k';  // 微博文娱榜
const TOPHUB_BASE = 'https://tophub.today';
const TIMEOUT = 15000;

// ========== 关键词 ==========

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
const ENT_KW = [
  '文娱','影视','综艺','明星','音乐','电影','电视剧','演出','娱乐',
  '浪姐','歌手','乘风','芒果','选秀','演唱会','票房',
  '热巴','杨幂','刘诗诗','张柏芝','白鹿','迪丽热巴','王力宏','柯南',
  '何猷君','奚梦瑶','方媛','李纯','徐志胜','张嘉益','痞幼','沈腾',
  '孙颖莎','柳智敏','Faker','李乃文','梅婷','黄圣依','金鹰奖',
  '归鸾','家业','藏海传','张凌赫','杨洋','杨紫','虞书欣',
  '龚俊','成毅','王一博','肖战','王俊凯','易烊千玺',
  '中餐厅','奔跑吧','披荆斩棘','演员请就位',
  '戛纳','金鸡','华表','百花',
];
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

// ========== 工具函数 ==========

function nowBJ() { return new Date(Date.now() + 8 * 3600 * 1000); }
function formatBJ(d) {
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')} ${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`;
}

// ========== 数据抓取 ==========

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
          const list = (j && j.result) ? (j.result.list || []) : [];
          const result = list.slice(0, limit).map((item, i) => {
            const hotnum = item.hotnum || '';
            let hotNum = 0;
            if (hotnum) {
              const h = hotnum.replace(/万|亿/g, '');
              const hVal = parseFloat(h) || 0;
              if (hotnum.includes('亿')) hotNum = hVal * 100000000;
              else if (hotnum.includes('万')) hotNum = hVal * 10000;
              else hotNum = hVal;
            }
            return {
              rank: item.hotrank || i + 1,
              title: item.hottitle || '',
              url: `https://fs.autohome.com.cn/app_spa/hotart/index.html#detail?id=${item.objectid}`,
              hot: hotnum,
              hot_num: hotNum,
            };
          });
          resolve(result);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * 抓取 tophub 页面并解析条目（带重试）
 * HTML 结构: <tr><td align="center">{rank}.</td><td><a href="{url}">{title}</a></td><td class="ws">{heat}</td>...
 * @param {string} nodePath - tophub 节点路径如 /n/3QeLwJEd7k
 * @param {number} retries - 重试次数
 * @returns {Promise<Array>} [{rank, title, url, hot, hot_num}]
 */
function fetchTopHub(nodePath, retries = 2) {
  const url = `${TOPHUB_BASE}${nodePath}`;
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };

  function attempt(tryCount) {
    return new Promise((resolve) => {
      const req = https.get(url, { headers: browserHeaders, timeout: TIMEOUT }, res => {
        // tophub 可能返回 503
        if (res.statusCode === 503) {
          if (tryCount < retries) {
            setTimeout(() => attempt(tryCount + 1).then(resolve), 1000);
            return;
          }
          resolve([]);
          return;
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const items = parseTopHubHTML(data);
            if (items.length > 0 || tryCount >= retries) {
              resolve(items);
            } else {
              setTimeout(() => attempt(tryCount + 1).then(resolve), 1000);
            }
          } catch (e) {
            if (tryCount < retries) {
              setTimeout(() => attempt(tryCount + 1).then(resolve), 1000);
            } else {
              resolve([]);
            }
          }
        });
      });
      req.on('error', () => {
        if (tryCount < retries) {
          setTimeout(() => attempt(tryCount + 1).then(resolve), 1000);
        } else {
          resolve([]);
        }
      });
      req.on('timeout', () => { req.destroy(); resolve([]); });
    });
  }

  return attempt(0);
}

function parseTopHubHTML(html) {
  const items = [];
  // 匹配模式: <td align="center">{rank}.</td>...<a href="{url}"...>{title}</a>...<td class="ws">{heat}</td>
  const trRegex = /<tr>\s*<td[^>]*>(\d+)\.\s*<\/td>\s*<td[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = trRegex.exec(html)) !== null) {
    const rank = parseInt(m[1]);
    const url = m[2];
    const title = m[3].trim();
    if (!title || !url) continue;

    // 在同一行中找 heat 值
    const trStart = m.index;
    const trEnd = html.indexOf('</tr>', trStart);
    const trContent = html.substring(trStart, trEnd > -1 ? trEnd : trStart + 500);
    const heatMatch = trContent.match(/class="ws"[^>]*>([^<]+)<\/td>/);
    const hot = heatMatch ? heatMatch[1].trim() : '';
    let hotNum = 0;
    if (hot) {
      const h = hot.replace(/万|亿/g, '');
      const hVal = parseFloat(h) || 0;
      if (hot.includes('亿')) hotNum = hVal * 100000000;
      else if (hot.includes('万')) hotNum = hVal * 10000;
      else hotNum = hVal;
    }
    items.push({ rank, title, url, hot, hot_num: hotNum });
  }
  return items;
}

// ========== 数据标准化 ==========

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
function normalizeBaidu(items, limit = 50) {
  return items.slice(0, limit).map((d, i) => ({
    rank: d.rank || i + 1, title: d.title || '', url: d.link || d.url || '',
    hot: d.hot_value || d.desc || '', hot_num: d.hot_value || 0, label: d.label || '',
  }));
}
function normalizeItNews(items, limit = 20) {
  return items.slice(0, limit).map((d, i) => ({
    rank: i + 1, title: d.title || '', url: d.url || d.link || '',
    hot: '', hot_num: 0, label: '',
  }));
}
function normalizeAutohome(items, limit = 10) {
  return items.slice(0, limit).map((d, i) => ({
    rank: d.rank || i + 1, title: d.title || '', url: d.url || '',
    hot: d.hot || '', hot_num: d.hot_num || 0,
  }));
}
function normalizeTopHub(items, limit = 10) {
  return items.slice(0, limit).map(d => ({
    rank: d.rank, title: d.title, url: d.url,
    hot: d.hot, hot_num: d.hot_num,
  }));
}

// ========== 关键词筛选 ==========

function filterByKw(items, keywords, limit = 10) {
  /** 原始 item 级别筛选，保留原始字段 */
  const result = [];
  for (const item of items) {
    const t = item.title || '';
    for (const kw of keywords) {
      if (t.includes(kw)) { result.push(item); break; }
    }
    if (result.length >= limit) break;
  }
  return result;
}

function filterAndNormalize(items, keywords, normalizer, limit = 10) {
  /** 先筛选再标准化（兼容旧接口） */
  return normalizer(filterByKw(items, keywords, limit), limit);
}

/**
 * 多源关键词筛选：从多个数据源中按关键词筛选，自动去重
 * @param {Array<{items: Array, normalizer: Function, label: string}>} sources
 * @param {string[]} keywords
 * @param {number} limit
 * @returns {Array} 标准化后的条目列表
 */
function multiSourceFilter(sources, keywords, limit = 10) {
  const seen = new Set();
  const result = [];
  for (const src of sources) {
    if (result.length >= limit) break;
    const rawFiltered = filterByKw(src.items, keywords, limit);
    for (const rawItem of rawFiltered) {
      if (result.length >= limit) break;
      const title = rawItem.title || '';
      if (seen.has(title)) continue;
      seen.add(title);
      // 在 src 作用域内立即标准化（不同源字段名不同）
      const normItem = src.normalizer([rawItem], 1)[0];
      result.push(normItem);
    }
  }
  // 重新编号
  return result.map((item, i) => ({ ...item, rank: i + 1 }));
}

// ========== 热度格式化 ==========

function formatHot(val) {
  const s = String(val).trim();
  if (/w/i.test(s) || s.includes('万')) return s;
  const n = parseInt(val) || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n > 0 ? String(n) : s;
}

// ========== HTML 生成 ==========

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
<div class="footer">数据来源: <a href="https://60s.viki.moe" target="_blank">60s API</a> · <a href="https://tophub.today" target="_blank">今日热榜</a> · 部署于 <a href="https://pages.github.com" target="_blank">GitHub Pages</a></div>
<div class="back-top" id="backTop" onclick="window.scrollTo({top:0,behavior:'smooth'})">↑</div>
<script>window.addEventListener('scroll',function(){document.getElementById('backTop').classList.toggle('show',window.scrollY>400)});</script>
</body>
</html>`;
}

// ========== 主流程 ==========

async function main() {
  console.log('='.repeat(50));
  console.log(`全网热榜看板 - ${formatBJ(nowBJ())}`);
  console.log('='.repeat(50));

  // 并行抓取所有数据源
  console.log('[抓取] 并行请求所有数据源...');
  const [ahHot, dcd, toutiao, douyin, weibo, itnews, baidu] = await Promise.all([
    fetchAutohome(10).catch(e => { console.error('  汽车之家失败:', e.message); return []; }),
    fetchJSON(`${API_BASE}/dongchedi`).catch(e => { console.error('  懂车帝失败:', e.message); return []; }),
    fetchJSON(`${API_BASE}/toutiao`).catch(e => { console.error('  头条失败:', e.message); return []; }),
    fetchJSON(`${API_BASE}/douyin`).catch(e => { console.error('  抖音失败:', e.message); return []; }),
    fetchJSON(`${API_BASE}/weibo`).catch(e => { console.error('  微博失败:', e.message); return []; }),
    fetchJSON(`${API_BASE}/it-news`).catch(e => { console.error('  IT资讯失败:', e.message); return []; }),
    fetchJSON(`${API_BASE}/baidu/hot`).catch(e => { console.error('  百度热搜失败:', e.message); return []; }),
  ]);
  console.log(`  汽车之家: ${ahHot.length} | 懂车帝: ${dcd.length} | 头条: ${toutiao.length} | 抖音: ${douyin.length}`);
  console.log(`  微博: ${weibo.length} | IT资讯: ${itnews.length} | 百度热搜: ${baidu.length}`);

  // 抓取 tophub 微博文娱榜（带重试）
  console.log('[抓取] tophub 微博文娱榜...');
  const tophubEnt = await fetchTopHub(TOPHUB_ENT_NODE, 2);
  console.log(`  tophub 文娱: ${tophubEnt.length} 条`);

  // ===== 数据处理 =====
  console.log('\n[处理] 组装看板数据...');

  // 汽车之家热榜 TOP10
  const autohomeHot = normalizeAutohome(ahHot, 10);
  console.log(`  汽车之家热榜: ${autohomeHot.length} 条`);

  // 懂车帝热点榜 TOP10
  const dcdHot = normalizeDcd(dcd, 10);
  console.log(`  懂车帝热点榜: ${dcdHot.length} 条`);

  // 微博汽车热榜：多源关键词匹配（微博+头条+百度+抖音+IT资讯）+ 汽车之家补充
  const autoSources = [
    { items: weibo, normalizer: normalizeWeibo, label: '微博' },
    { items: toutiao, normalizer: normalizeToutiao, label: '头条' },
    { items: baidu, normalizer: normalizeBaidu, label: '百度' },
    { items: douyin, normalizer: normalizeDouyin, label: '抖音' },
    { items: itnews, normalizer: normalizeItNews, label: 'IT资讯' },
  ];
  let wbAuto = multiSourceFilter(autoSources, WEIBO_AUTO_KW, 10);
  // 多源不够10条时，用汽车之家热榜补充（去重）
  if (wbAuto.length < 10 && ahHot.length > 0) {
    const existTitles = new Set(wbAuto.map(i => i.title));
    const ahSupplement = normalizeAutohome(ahHot, 10).filter(i => !existTitles.has(i.title));
    wbAuto = [...wbAuto, ...ahSupplement].slice(0, 10).map((item, i) => ({ ...item, rank: i + 1 }));
  }
  console.log(`  微博汽车热榜: ${wbAuto.length} 条 (多源+汽车之家补充)`);

  // 今日头条热榜 TOP20
  const ttHot = normalizeToutiao(toutiao, 20);

  // 抖音热榜 TOP20
  const dyHot = normalizeDouyin(douyin, 20);

  // 微博热搜 TOP20
  const wbHot = normalizeWeibo(weibo, 20);

  // 微博文娱 TOP10: tophub 优先，fallback 到多源关键词匹配
  let wbEnt, entSource;
  if (tophubEnt.length >= 5) {
    wbEnt = normalizeTopHub(tophubEnt, 10);
    entSource = 'tophub';
  } else {
    console.log('  tophub 文娱数据不足，fallback 到关键词匹配...');
    const entSources = [
      { items: weibo, normalizer: normalizeWeibo, label: '微博' },
      { items: toutiao, normalizer: normalizeToutiao, label: '头条' },
      { items: baidu, normalizer: normalizeBaidu, label: '百度' },
    ];
    wbEnt = multiSourceFilter(entSources, ENT_KW, 10);
    entSource = '多源关键词';
  }
  console.log(`  微博文娱: ${wbEnt.length} 条 (${entSource})`);

  // 微博科技 TOP10: 多源关键词匹配（微博+头条+百度+IT资讯）
  const techSources = [
    { items: weibo, normalizer: normalizeWeibo, label: '微博' },
    { items: toutiao, normalizer: normalizeToutiao, label: '头条' },
    { items: baidu, normalizer: normalizeBaidu, label: '百度' },
    { items: itnews, normalizer: normalizeItNews, label: 'IT资讯' },
  ];
  const wbTech = multiSourceFilter(techSources, TECH_KW, 10);
  console.log(`  微博科技: ${wbTech.length} 条 (多源: ${techSources.map(s=>s.label).join('+')})`);

  // ===== 组装看板 =====
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
