/**
 * fetcher.js - 数据抓取 & HTML 生成模块
 * 从 60s.viki.moe API + tophub + 汽车之家 API 拉取各平台热榜，组装成完整 HTML 页面
 */

const https = require('https');

const API_BASE = 'https://60s.viki.moe/v2';
const AUTOHOME_API = 'https://news.app.autohome.com.cn/news_v10.0.0/news/newshotrankh5list';
const TOPHUB_ENT_NODE = '/n/3QeLwJEd7k';  // 微博文娱榜
const TOPHUB_AUTO_NODE = '/n/aEdZbrkdrO'; // 新浪汽车热搜榜
const TOPHUB_DCD_NODE = '/n/7GdaA8kdQy';  // 懂车帝热搜榜
const TOPHUB_TT_AUTO_NODE = '/n/Q0orLpDd8B'; // 今日头条汽车热榜
const TOPHUB_BASE = 'https://tophub.today';
const TIMEOUT = 15000;

// ========== 关键词 ==========

const WEIBO_AUTO_KW = [
  '比亚迪','特斯拉','丰田','本田','宝马','奔驰','奥迪','蔚来','理想','小鹏',
  '吉利','长安汽车','大众汽车','大众ID','福特','保时捷','东风日产','问界','智界','享界',
  '极氪','零跑','岚图','深蓝','哪吒','红旗','领克','奇瑞','名爵','阿维塔',
  '高合','乐道','方程豹','捷途','宝骏','启源','星途','智己','飞凡',
  '鸿蒙智行','小米汽车','小米SU7','小米SU','华为智驾','华为鸿蒙','华为汽车',
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
    const req = https.get(AUTOHOME_API, {
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
  const trRegex = /<tr>\s*<td[^>]*>(\d+)\.\s*<\/td>\s*<td[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = trRegex.exec(html)) !== null) {
    const rank = parseInt(m[1]);
    const url = m[2];
    const title = m[3].trim();
    if (!title || !url) continue;

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
      const normItem = src.normalizer([rawItem], 1)[0];
      result.push(normItem);
    }
  }
  return result.map((item, i) => ({ ...item, rank: i + 1 }));
}

// ========== 热度补全：从 60s API 数据按 URL 匹配补充热度 ==========
function enrichHotFromAPI(boardItems, apiItems, urlKey = 'link') {
  // 从 apiItems 构建 URL → hot_value 映射
  const hotMap = new Map();
  for (const item of apiItems) {
    const url = item[urlKey] || item.link || item.url || '';
    if (url && item.hot_value > 0) hotMap.set(url, item.hot_value);
  }
  let enriched = 0;
  for (const item of boardItems) {
    if ((item.hot_num || 0) > 0) continue; // 已有热度不覆盖
    const matched = hotMap.get(item.url) || hotMap.get((item.url || '').replace('http://', 'https://'));
    if (matched) {
      item.hot_num = matched;
      item.hot = String(matched);
      enriched++;
    }
  }
  if (enriched > 0) console.log(`    热度补全: ${enriched} 条`);
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
  // 始终计算排名相对热度作为 fallback
  if (items.length > 1) {
    items.forEach((item, idx) => { item._relPct = Math.round((items.length - idx) / items.length * 100); });
  }
  const itemsHTML = items.length === 0
    ? `      <div class="empty-tip">当前时段暂无相关话题</div>\n`
    : items.map(item => {
    const { rank, title: t, url, hot, hot_num } = item;
    const pct = (hot_num || 0) > 0 ? Math.round(hot_num / maxHot * 100) : (item._relPct || 0);
    const rc = rank <= 3 ? 'rank-top' : rank <= 10 ? 'rank-accent' : 'rank-normal';
    const safeUrl = (url || '#').replace(/'/g, '&#39;');
    const safeTitle = t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `      <div class="item" onclick="window.open('${safeUrl}','_blank')">
        <div class="rank ${rc}">${rank}</div>
        <div class="item-body">
          <a class="item-title" href="${safeUrl}" target="_blank" rel="noopener">${safeTitle}</a>
          <div class="item-foot">
            <div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:#d1d5db"></div></div>
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
<title>YU-全网热点看板</title>
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
<div class="header"><h1>YU-全网热点看板</h1><div class="sub"><span id="clock">${updateTime}</span></div></div>
<div class="boards">
${boardsHTML}
</div>
<div class="footer">数据来源: <a href="https://60s.viki.moe" target="_blank">60s API</a> · <a href="https://tophub.today" target="_blank">今日热榜</a> · 部署于 <a href="https://pages.github.com" target="_blank">GitHub Pages</a></div>
<div class="back-top" id="backTop" onclick="window.scrollTo({top:0,behavior:'smooth'})">↑</div>
<script>window.addEventListener('scroll',function(){document.getElementById('backTop').classList.toggle('show',window.scrollY>400)});</script>
<script>(function(){var tick=function(){var d=new Date(Date.now()+8*3600000),e=document.getElementById('clock');if(e){var p=function(n){return n<10?'0'+n:''+n};e.textContent=d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate())+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes())+':'+p(d.getUTCSeconds())}};tick();setInterval(tick,1000)})();</script>
</body>
</html>`;
}

// ========== 主逻辑 ==========

async function fetchAndGenerate() {
  console.log(`[${formatBJ(nowBJ())}] 开始抓取数据...`);

  // 并行抓取所有数据源
  const [ahHot, dcd, toutiao, douyin, weibo, itnews] = await Promise.all([
    fetchAutohome(10).catch(e => { console.error('  汽车之家失败:', e.message); return []; }),
    fetchJSON(`${API_BASE}/dongchedi`).catch(e => { console.error('  懂车帝失败:', e.message); return []; }),
    fetchJSON(`${API_BASE}/toutiao`).catch(e => { console.error('  头条失败:', e.message); return []; }),
    fetchJSON(`${API_BASE}/douyin`).catch(e => { console.error('  抖音失败:', e.message); return []; }),
    fetchJSON(`${API_BASE}/weibo`).catch(e => { console.error('  微博失败:', e.message); return []; }),
    fetchJSON(`${API_BASE}/it-news`).catch(e => { console.error('  IT资讯失败:', e.message); return []; }),
  ]);
  console.log(`  汽车之家: ${ahHot.length} | 懂车帝: ${dcd.length} | 头条: ${toutiao.length} | 抖音: ${douyin.length}`);
  console.log(`  微博: ${weibo.length} | IT资讯: ${itnews.length}`);

  // 并行抓取 tophub 四个榜单
  console.log('[抓取] tophub 四个榜单...');
  const [tophubEnt, tophubAuto, tophubDcd, tophubTtAuto] = await Promise.all([
    fetchTopHub(TOPHUB_ENT_NODE, 2),
    fetchTopHub(TOPHUB_AUTO_NODE, 2),
    fetchTopHub(TOPHUB_DCD_NODE, 2),
    fetchTopHub(TOPHUB_TT_AUTO_NODE, 2),
  ]);
  console.log(`  tophub 文娱: ${tophubEnt.length} | 汽车: ${tophubAuto.length} | 懂车帝: ${tophubDcd.length} | 头条汽车: ${tophubTtAuto.length} 条`);

  // ===== 数据处理 =====

  // 汽车之家热榜 TOP10
  const autohomeHot = normalizeAutohome(ahHot, 10);
  console.log(`  汽车之家热榜: ${autohomeHot.length} 条`);

  // 懂车帝热点榜 TOP10：tophub 优先，fallback 到 60s API
  let dcdHot, dcdSource;
  if (tophubDcd.length >= 5) {
    dcdHot = normalizeTopHub(tophubDcd, 10);
    dcdSource = 'tophub';
  } else {
    console.log('  tophub 懂车帝数据不足，fallback 到 60s API...');
    dcdHot = normalizeDcd(dcd, 10);
    dcdSource = '60s API';
  }
  console.log(`  懂车帝热点榜: ${dcdHot.length} 条 (${dcdSource})`);

  // 微博汽车热榜：tophub 新浪汽车热搜为主，fallback 多源关键词 + 汽车之家补充
  let wbAuto, autoSource;
  if (tophubAuto.length >= 5) {
    wbAuto = normalizeTopHub(tophubAuto, 10);
    autoSource = 'tophub';
  } else {
    console.log('  tophub 汽车数据不足，fallback 到多源关键词...');
    const autoSources = [
      { items: weibo, normalizer: normalizeWeibo, label: '微博' },
      { items: toutiao, normalizer: normalizeToutiao, label: '头条' },
      { items: douyin, normalizer: normalizeDouyin, label: '抖音' },
      { items: itnews, normalizer: normalizeItNews, label: 'IT资讯' },
    ];
    wbAuto = multiSourceFilter(autoSources, WEIBO_AUTO_KW, 10);
    if (wbAuto.length < 10 && ahHot.length > 0) {
      const existTitles = new Set(wbAuto.map(i => i.title));
      const ahSupplement = normalizeAutohome(ahHot, 10).filter(i => !existTitles.has(i.title));
      wbAuto = [...wbAuto, ...ahSupplement].slice(0, 10).map((item, i) => ({ ...item, rank: i + 1 }));
    }
    autoSource = '多源+汽车之家补充';
  }
  console.log(`  微博汽车热榜: ${wbAuto.length} 条 (${autoSource})`);

  // 今日头条汽车热榜 TOP10：tophub 头条汽车榜
  let ttAuto, ttAutoSource;
  if (tophubTtAuto.length >= 5) {
    ttAuto = normalizeTopHub(tophubTtAuto, 10);
    ttAutoSource = 'tophub';
  } else {
    ttAuto = multiSourceFilter([
      { items: toutiao, normalizer: normalizeToutiao, label: '头条' },
      { items: weibo, normalizer: normalizeWeibo, label: '微博' },
    ], WEIBO_AUTO_KW, 10);
    ttAutoSource = '多源关键词';
  }
  console.log(`  今日头条汽车热榜: ${ttAuto.length} 条 (${ttAutoSource})`);

  // ===== 热度补全：tophub 数据没有热度时，从 60s API 按匹配补充 =====
  console.log('[补全] 为 tophub 看板补充热度值...');
  enrichHotFromAPI(ttAuto, toutiao, 'link');
  enrichHotFromAPI(dcdHot, dcd, 'url');
  enrichHotFromAPI(wbAuto, [...weibo, ...toutiao, ...douyin, ...itnews], 'link');

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
    ];
    wbEnt = multiSourceFilter(entSources, ENT_KW, 10);
    entSource = '多源关键词';
  }
  console.log(`  微博文娱: ${wbEnt.length} 条 (${entSource})`);

  // ===== 组装看板（8个，无科技热搜） =====
  const boards = [
    // 第一行
    { id: 'autohome-hot', logo: 'https://www.autohome.com.cn/favicon.ico', name: '汽车之家', badge: '热榜',     color: '#3b82f6', items: autohomeHot },
    { id: 'dcd-hot',      logo: 'https://icon.horse/icon/www.dongchedi.com', name: '懂车帝',   badge: '热点榜',   color: '#eab308', items: dcdHot },
    { id: 'wb-auto',      logo: 'https://weibo.com/favicon.ico',           name: '新浪微博', badge: '汽车热榜', color: '#e17055', items: wbAuto },
    { id: 'tt-auto',      logo: 'https://www.toutiao.com/favicon.ico',     name: '今日头条', badge: '汽车热榜', color: '#F85959', items: ttAuto },
    // 第二行
    { id: 'tt-hot',       logo: 'https://www.toutiao.com/favicon.ico',     name: '今日头条', badge: '头条热榜', color: '#ff4757', items: ttHot },
    { id: 'dy-hot',       logo: 'https://www.douyin.com/favicon.ico',      name: '抖音',     badge: '热榜',     color: '#1a1a2e', items: dyHot },
    { id: 'wb-hot',       logo: 'https://weibo.com/favicon.ico',           name: '新浪微博', badge: '热搜榜',   color: '#ff4500', items: wbHot },
    { id: 'wb-ent',       logo: 'https://weibo.com/favicon.ico',           name: '新浪微博', badge: '文娱热搜', color: '#e84393', items: wbEnt },
  ];

  const html = generateHTML(boards);
  const empty = boards.filter(b => b.items.length === 0).map(b => b.name + ' ' + b.badge);
  if (empty.length) console.log(`  ⚠️ 暂无数据: ${empty.join(', ')}`);
  console.log(`  ✅ 数据抓取完成，HTML ${Buffer.byteLength(html)} bytes`);

  return html;
}

module.exports = { fetchAndGenerate };
