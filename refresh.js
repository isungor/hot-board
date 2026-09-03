// YU-全网热点看板 - 客户端实时刷新脚本
(function() {
  'use strict';

  // ========== 实时时钟（北京时间） ==========
  function tick() {
    var d = new Date(Date.now() + 8 * 3600000);
    var p = function(n) { return n < 10 ? '0' + n : '' + n; };
    var el = document.getElementById('clock');
    if (el) {
      el.textContent = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
        ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
    }
  }
  tick();
  setInterval(tick, 1000);

  // ========== API 配置 ==========
  var API_BASE = 'https://60s.viki.moe/v2';
  var TOPHUB = 'https://tophub.today';
  var TH_NODES = { ent: '/n/3QeLwJEd7k', auto: '/n/aEdZbrkdrO', dcd: '/n/RrvW7XDv5z', ttAuto: '/n/Q0orLpDd8B' };
  var AH_API = 'https://news.app.autohome.com.cn/news_v10.0.0/news/newshotrankh5list';

  // ========== 关键词 ==========
  var AUTO_KW = ['比亚迪','特斯拉','丰田','本田','宝马','奔驰','奥迪','蔚来','理想','小鹏','吉利','长安汽车','大众汽车','大众ID','福特','保时捷','东风日产','问界','智界','享界','极氪','零跑','岚图','深蓝','哪吒','红旗','领克','奇瑞','名爵','阿维塔','高合','乐道','方程豹','捷途','宝骏','启源','星途','智己','飞凡','鸿蒙智行','小米汽车','小米SU7','小米SU','华为智驾','华为鸿蒙','华为汽车','新能源车','新能源汽车','混动车型','纯电车型','插混','增程式','充电桩','动力电池','智能驾驶','智能座舱','辅助驾驶','车机系统','智驾','油耗','车祸','追尾','试驾','提车','交车','购车','买车','燃油车','电动车','电车','越野车','摩托车','赛车','车企','造车','新势力','网约车','车险','驾考'];
  var ENT_KW = ['文娱','影视','综艺','明星','音乐','电影','电视剧','演出','娱乐','浪姐','歌手','乘风','芒果','选秀','演唱会','票房','热巴','杨幂','刘诗诗','张柏芝','白鹿','迪丽热巴','王力宏','柯南','何猷君','奚梦瑶','方媛','李纯','徐志胜','张嘉益','痞幼','沈腾','孙颖莎','柳智敏','Faker','李乃文','梅婷','黄圣依','金鹰奖','归鸾','家业','藏海传','张凌赫','杨洋','杨紫','虞书欣','龚俊','成毅','王一博','肖战','王俊凯','易烊千玺','中餐厅','奔跑吧','披荆斩棘','演员请就位','戛纳','金鸡','华表','百花'];
  var TECH_KW = ['英伟达','NVIDIA','OpenAI','ChatGPT','GPT','大模型','算力','人工智能','AI大模型','Sora','Claude','Gemini','豆包','文心一言','通义千问','Kimi','讯飞','DeepSeek','芯片','半导体','台积电','高通','联发科','英特尔','Intel','AMD','光刻机','芯片制造','存储芯片','显卡','苹果公司','iPhone','iOS','iPad','MacBook','Apple Vision','安卓','Android','华为','腾讯','微信','阿里巴巴','阿里云','百度','字节跳动','京东','美团','拼多多','网易','快手','抖音','TikTok','小红书','B站','小米','OPPO','vivo','荣耀','三星','索尼','Meta','谷歌','微软','比特币','加密货币','区块链','元宇宙','云计算','物联网','量子计算','机器人','人形机器人','VR眼镜','AR眼镜','空间计算','5G','6G','电信','联通','宽带','光纤','网络安全','数据泄露','黑客','漏洞','马斯克','库克','黄仁勋','扎克伯格','奥特曼','苹果手机','智能手机','折叠屏','卫星通信','开源','开发者'];

  // ========== 数据抓取 ==========
  function fetchJSON(url) {
    return fetch(url).then(function(r) {
      if (!r.ok) return [];
      return r.json().then(function(j) {
        return (j.code === 200 && j.data) ? j.data : [];
      });
    }).catch(function(e) { console.warn('fetchJSON:', url, e); return []; });
  }

  // CORS 代理列表（用于绕过 tophub 跨域限制）
  var CORS_PROXIES = [
    function(u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
    function(u) { return 'https://corsproxy.io/?' + encodeURIComponent(u); },
  ];

  // 懂车帝官方热搜榜（launcher 免登录接口）：直连失败走 CORS 代理
  // ⚠️ 2026-09-03 实测：返回往年同期旧词（海豹DM-i上市、斯柯达速派谍照等），仅作 tophub 文章榜失败时的兜底
  var DCD_LAUNCH_API = 'https://www.dongchedi.com/motor/searchpage/launcher/main/v1/?aid=1839&app_name=auto_web_pc';
  function fetchDcdOfficial() {
    function parse(j) {
      var boards = (j && j.data && Array.isArray(j.data.rank_board)) ? j.data.rank_board : [];
      var hotBoard = null;
      for (var i = 0; i < boards.length; i++) {
        if (boards[i].rank_name === '热搜榜' || boards[i].rank_code === 0) { hotBoard = boards[i]; break; }
      }
      var tops = (hotBoard && Array.isArray(hotBoard.tops)) ? hotBoard.tops : [];
      var out = [];
      for (var k = 0; k < tops.length; k++) {
        var t = tops[k].title;
        if (!t) continue;
        out.push({ rank: out.length + 1, title: t, url: 'https://www.dongchedi.com/search?keyword=' + encodeURIComponent(t), hot: '', hot_num: 0 });
      }
      return out;
    }
    return fetch(DCD_LAUNCH_API, { mode: 'cors' }).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(parse).catch(function() {
      var proxyIdx = 0;
      function tryProxy() {
        if (proxyIdx >= CORS_PROXIES.length) return [];
        var proxyUrl = CORS_PROXIES[proxyIdx](DCD_LAUNCH_API);
        return fetch(proxyUrl).then(function(r) {
          if (!r.ok) throw new Error('proxy HTTP ' + r.status);
          return r.json();
        }).then(parse).catch(function(e) {
          proxyIdx++;
          console.warn('fetchDcdOfficial proxy failed:', e.message);
          return tryProxy();
        });
      }
      return tryProxy();
    });
  }

  function fetchTopHub(node) {
    var url = TOPHUB + node;
    // 先尝试直连（同域或 CORS 允许时）
    return fetch(url, { mode: 'cors' }).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function(html) {
      if (!html || html.indexOf('安全验证') >= 0) throw new Error('blocked');
      return parseTopHub(html);
    }).catch(function() {
      // 直连失败，尝试 CORS 代理
      var proxyIdx = 0;
      function tryProxy() {
        if (proxyIdx >= CORS_PROXIES.length) {
          console.warn('fetchTopHub: all CORS proxies failed for', node);
          return [];
        }
        var proxyUrl = CORS_PROXIES[proxyIdx](url);
        return fetch(proxyUrl).then(function(r) {
          if (!r.ok) throw new Error('proxy HTTP ' + r.status);
          return r.text();
        }).then(function(html) {
          if (!html || html.indexOf('安全验证') >= 0) throw new Error('blocked');
          return parseTopHub(html);
        }).catch(function(e) {
          proxyIdx++;
          console.warn('fetchTopHub proxy ' + proxyIdx + ' failed:', node, e.message);
          return tryProxy();
        });
      }
      return tryProxy();
    });
  }

  function parseTopHub(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var items = [];
    var rows = doc.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var rankTd = row.querySelector('td[align="center"]');
      var link = row.querySelector('a[href]');
      var wsTd = row.querySelector('td.ws');
      if (!rankTd || !link) continue;
      var title = link.textContent.trim();
      var url = link.getAttribute('href');
      if (!title || !url) continue;
      var hot = wsTd ? wsTd.textContent.trim() : '';
      var hotNum = 0;
      if (hot) {
        var h = hot.replace(/万|亿/g, '');
        var hv = parseFloat(h) || 0;
        hotNum = hot.indexOf('亿') >= 0 ? hv * 1e8 : hot.indexOf('万') >= 0 ? hv * 1e4 : hv;
      }
      items.push({ rank: parseInt(rankTd.textContent) || 0, title: title, url: url, hot: hot, hot_num: hotNum });
    }
    return items;
  }

  function fetchAutohome() {
    return fetch(AH_API).then(function(r) {
      if (!r.ok) return [];
      return r.json();
    }).then(function(j) {
      var list = (j && j.result) ? (j.result.list || []) : [];
      return list.slice(0, 10).map(function(item, i) {
        var hotnum = item.hotnum || '';
        var hotNum = 0;
        if (hotnum) {
          var h = hotnum.replace(/万|亿/g, '');
          var hv = parseFloat(h) || 0;
          hotNum = hotnum.indexOf('亿') >= 0 ? hv * 1e8 : hotnum.indexOf('万') >= 0 ? hv * 1e4 : hv;
        }
        return {
          rank: item.hotrank || i + 1, title: item.hottitle || '',
          url: 'https://fs.autohome.com.cn/app_spa/hotart/index.html#detail?id=' + (item.objectid || ''),
          hot: hotnum, hot_num: hotNum
        };
      });
    }).catch(function(e) { console.warn('fetchAutohome:', e); return []; });
  }

  // ========== 数据标准化 ==========
  function normDcd(items, limit) {
    return items.slice(0, limit).map(function(d, i) {
      return { rank: d.rank || i + 1, title: d.title || '', url: d.url || '',
        hot: d.score_desc || String(d.score || ''), hot_num: d.score || 0 };
    });
  }
  function normGeneric(items, limit) {
    return items.slice(0, limit).map(function(d, i) {
      return { rank: i + 1, title: d.title || '', url: d.link || '',
        hot: d.hot_value || 0, hot_num: d.hot_value || 0 };
    });
  }
  function normBaidu(items, limit) {
    return items.slice(0, limit).map(function(d, i) {
      return { rank: d.rank || i + 1, title: d.title || '', url: d.link || d.url || '',
        hot: d.hot_value || d.desc || '', hot_num: d.hot_value || 0 };
    });
  }
  function normIt(items, limit) {
    return items.slice(0, limit).map(function(d, i) {
      return { rank: i + 1, title: d.title || '', url: d.url || d.link || '',
        hot: '', hot_num: 0 };
    });
  }

  // ========== 关键词筛选 ==========
  function filterKw(items, kws, limit) {
    var result = [];
    for (var i = 0; i < items.length && result.length < limit; i++) {
      var t = items[i].title || '';
      for (var k = 0; k < kws.length; k++) {
        if (t.indexOf(kws[k]) >= 0) { result.push(items[i]); break; }
      }
    }
    return result;
  }

  function multiFilter(sources, kws, limit) {
    var seen = {};
    var result = [];
    for (var s = 0; s < sources.length && result.length < limit; s++) {
      var src = sources[s];
      var filtered = filterKw(src.items, kws, limit);
      for (var i = 0; i < filtered.length && result.length < limit; i++) {
        var item = filtered[i];
        var title = item.title || '';
        if (seen[title]) continue;
        seen[title] = true;
        result.push(src.norm([item], 1)[0]);
      }
    }
    for (var j = 0; j < result.length; j++) result[j].rank = j + 1;
    return result;
  }

  // ========== 热度格式化 ==========
  function fmtHot(val) {
    var s = String(val).trim();
    if (/w/i.test(s) || s.indexOf('万') >= 0) return s;
    var n = parseInt(val) || 0;
    if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
    return n > 0 ? '' + n : s;
  }

  // ========== 板块 HTML 渲染 ==========
  function buildBoard(cfg) {
    var items = cfg.items;
    var maxHot = 1;
    var hasAnyHot = false;
    for (var i = 0; i < items.length; i++) {
      var hn = items[i].hot_num || 0;
      if (hn > maxHot) maxHot = hn;
      if (hn > 0) hasAnyHot = true;
    }
    // 如果没有任何热度值，用排名反向生成相对热度（第1名=100%）
    if (!hasAnyHot && items.length > 1) {
      for (var i = 0; i < items.length; i++) {
        items[i]._relPct = Math.round((items.length - i) / items.length * 100);
      }
    }
    var html = '';
    if (!items.length) {
      html = '<div class="empty-tip">当前时段暂无相关话题</div>';
    } else {
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var pct = hasAnyHot ? Math.round((item.hot_num || 0) / maxHot * 100) : (item._relPct || 0);
        var rc = item.rank <= 3 ? 'rank-top' : item.rank <= 10 ? 'rank-accent' : 'rank-normal';
        var su = (item.url || '#').replace(/'/g, '&#39;');
        var st = (item.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var hotDisplay = fmtHot(item.hot);
        var hotNumSpan = cfg.hideHotNum ? '' : '<span class="hot-num">' + hotDisplay + '</span>';
        html += '<div class="item" onclick="window.open(\'' + su + '\',\'_blank\')">' +
          '<div class="rank ' + rc + '">' + item.rank + '</div>' +
          '<div class="item-body"><a class="item-title" href="' + su + '" target="_blank" rel="noopener">' + st + '</a>' +
          '<div class="item-foot"><div class="bar-wrap"><div class="bar-fill" style="width:' + pct + '%;background:#d1d5db"></div></div>' +
          hotNumSpan + '</div></div></div>';
      }
    }
    return '<div class="board" id="' + cfg.id + '">' +
      '<div class="board-head"><img class="logo" src="' + cfg.logo + '" alt="' + cfg.name + '" onerror="this.style.style.display=\'none\'">' +
      '<span class="board-name">' + cfg.name + '</span>' +
      '<span class="badge" style="background:' + cfg.color + ';color:#fff">' + cfg.badge + '</span></div>' +
      '<div class="list">' + html + '</div></div>';
  }

  // ========== 主刷新函数 ==========
  window.refreshAll = function() {
    var btn = document.getElementById('refreshBtn');
    if (!btn || btn.classList.contains('loading')) return;
    btn.classList.add('loading');
    btn.innerHTML = '<span class="spin-icon">⟳</span> 刷新中...';

    Promise.all([
      fetchJSON(API_BASE + '/dongchedi'),
      fetchJSON(API_BASE + '/toutiao'),
      fetchJSON(API_BASE + '/douyin'),
      fetchJSON(API_BASE + '/weibo'),
      fetchJSON(API_BASE + '/it-news'),
      fetchAutohome(),
      fetchTopHub(TH_NODES.ent),
      fetchTopHub(TH_NODES.auto),
      fetchTopHub(TH_NODES.dcd),
      fetchTopHub(TH_NODES.ttAuto),
    ]).then(function(results) {
      var dcd = results[0], tt = results[1], dy = results[2], wb = results[3];
      var it = results[4], ah = results[5];
      var thEnt = results[6], thAuto = results[7], thDcd = results[8], thTtAuto = results[9];
      // tophub 懂车帝文章榜不足 5 条时才请求官方 launcher（其内容为往年旧词，避免常态使用）
      var launcherPromise = thDcd.length >= 5 ? Promise.resolve([]) : fetchDcdOfficial();

      return launcherPromise.then(function(dcdOfficial) {
        var boards = [
        { id:'autohome-hot', logo:'https://www.autohome.com.cn/favicon.ico', name:'汽车之家', badge:'热榜', color:'#3b82f6', items: ah },
        { id:'dcd-hot', logo:'https://icon.horse/icon/www.dongchedi.com', name:'懂车帝', badge:'热榜', color:'#eab308',
          items: thDcd.length >= 5 ? thDcd.slice(0,10)
                : (dcdOfficial.length >= 5 ? dcdOfficial.slice(0,10) : normDcd(dcd,10)) },
        { id:'wb-auto', logo:'https://weibo.com/favicon.ico', name:'新浪微博', badge:'汽车热榜', color:'#e17055',
          items: thAuto.length >= 5 ? thAuto.slice(0,10) : multiFilter([
            {items:wb,norm:normGeneric},{items:tt,norm:normGeneric},{items:dy,norm:normGeneric},
            {items:it,norm:normIt}
          ], AUTO_KW, 10) },
        { id:'tt-auto', logo:'https://www.toutiao.com/favicon.ico', name:'今日头条', badge:'汽车热榜', color:'#F85959',
          hideHotNum: true,
          items: thTtAuto.length >= 5 ? thTtAuto.slice(0,10) : multiFilter([
            {items:tt,norm:normGeneric},{items:wb,norm:normGeneric},{items:dy,norm:normGeneric},
            {items:dcd,norm:normDcd},{items:it,norm:normIt}
          ], AUTO_KW, 10) },
        { id:'tt-hot', logo:'https://www.toutiao.com/favicon.ico', name:'今日头条', badge:'头条热榜', color:'#ff4757', items: normGeneric(tt,20) },
        { id:'dy-hot', logo:'https://www.douyin.com/favicon.ico', name:'抖音', badge:'热榜', color:'#1a1a2e', items: normGeneric(dy,20) },
        { id:'wb-hot', logo:'https://weibo.com/favicon.ico', name:'新浪微博', badge:'热搜榜', color:'#ff4500', items: normGeneric(wb,20) },
        { id:'wb-ent', logo:'https://weibo.com/favicon.ico', name:'新浪微博', badge:'文娱热搜', color:'#e84393',
          items: thEnt.length >= 5 ? thEnt.slice(0,10) : multiFilter([
            {items:wb,norm:normGeneric},{items:tt,norm:normGeneric}
          ], ENT_KW, 10) },
      ];

        var boardsEl = document.querySelector('.boards');
        if (boardsEl) boardsEl.innerHTML = boards.map(buildBoard).join('\n');
      });
    }).catch(function(e) {
      console.error('刷新失败:', e);
    }).finally(function() {
      if (btn) {
        btn.classList.remove('loading');
        btn.innerHTML = '<span class="spin-icon">⟳</span> 刷新';
      }
    });
  };
})();
