#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全网热榜看板 - 数据抓取 & HTML 生成脚本
数据源: 60s.viki.moe API (免费，无需认证)
"""

import json
import urllib.request
import urllib.error
import re
import sys
from datetime import datetime, timezone, timedelta

# ========== 配置 ==========
API_BASE = "https://60s.viki.moe/v2"
AUTOHOME_API = "https://news.app.autohome.com.cn/news_v10.0.0/news/newsranklistv2"
TIMEOUT = 15  # 秒

# 北京时区
BJ_TZ = timezone(timedelta(hours=8))

# 头条汽车筛选关键词
AUTO_KEYWORDS = [
    "车", "新能源", "比亚迪", "特斯拉", "丰田", "本田", "宝马", "奔驰",
    "奥迪", "蔚来", "理想", "小鹏", "吉利", "长安", "大众", "福特",
    "保时捷", "华为", "小米汽车", "小米SU", "乐道", "方程豹",
    "自动驾驶", "充电", "续航", "混动", "纯电", "发动机", "变速箱",
    "汽车", "轿车", "SUV", "MPV", "销量", "召回", "碰撞", "油价",
    "充电桩", "路测", "试驾", "上市", "首发", "亮相"
]

# 微博汽车筛选关键词（精准匹配，避免误判）
WEIBO_AUTO_KEYWORDS = [
    # 汽车品牌
    "比亚迪", "特斯拉", "丰田", "本田", "宝马", "奔驰", "奥迪", "蔚来", "理想", "小鹏",
    "吉利", "长安汽车", "大众汽车", "大众ID", "福特", "保时捷", "东风日产", "问界", "智界", "享界",
    "极氪", "零跑", "岚图", "深蓝", "哪吒", "红旗", "领克", "奇瑞", "名爵", "阿维塔",
    "高合", "乐道", "方程豹", "捷途", "宝骏", "启源", "星途", "智己", "飞凡",
    "鸿蒙智行", "小米汽车", "小米SU7", "小米SU", "华为智驾", "华为鸿蒙", "华为汽车",
    # 汽车品类/技术术语
    "新能源车", "新能源汽车", "混动车型", "纯电车型", "插混", "增程式", "充电桩", "动力电池",
    "智能驾驶", "智能座舱", "辅助驾驶", "车机系统", "智驾",
    "油耗", "车祸", "追尾", "试驾", "提车", "交车", "购车", "买车",
    "燃油车", "电动车", "电车", "越野车", "摩托车", "赛车",
    "车企", "造车", "新势力", "网约车", "车险", "驾考",
]

# 微博文娱关键词
ENT_KEYWORDS = [
    "文娱", "影视", "综艺", "明星", "音乐", "电影", "电视剧", "演出", "娱乐",
    "浪姐", "歌手", "乘风", "演唱会", "票房", "热巴", "杨幂", "刘诗诗", "张柏芝",
    "白鹿", "迪丽热巴", "王力宏", "柯南", "何猷君", "奚梦瑶", "方媛", "李纯",
    "徐志胜", "张嘉益", "痞幼", "沈腾", "孙颖莎", "柳智敏", "Faker", "李乃文",
    "梅婷", "选秀", "金鹰奖",
]

# 微博科技关键词
TECH_KEYWORDS = [
    # AI / 大模型
    "英伟达", "NVIDIA", "OpenAI", "ChatGPT", "GPT", "大模型", "算力", "人工智能", "AI大模型",
    "Sora", "Claude", "Gemini", "豆包", "文心一言", "通义千问", "Kimi", "讯飞", "DeepSeek",
    # 芯片 / 半导体
    "芯片", "半导体", "台积电", "高通", "联发科", "英特尔", "Intel", "AMD", "光刻机", "芯片制造", "存储芯片", "显卡",
    # 科技巨头 & 平台
    "苹果公司", "iPhone", "iOS", "iPad", "MacBook", "Apple Vision",
    "安卓", "Android", "华为", "腾讯", "微信", "阿里巴巴", "阿里云", "百度", "字节跳动",
    "京东", "美团", "拼多多", "网易", "快手", "抖音", "TikTok", "小红书", "B站",
    "小米", "OPPO", "vivo", "荣耀", "三星", "索尼", "Meta", "谷歌", "微软",
    # 前沿科技
    "比特币", "加密货币", "区块链", "元宇宙", "云计算", "物联网",
    "量子计算", "机器人", "人形机器人", "VR眼镜", "AR眼镜", "空间计算",
    # 通信 / 安全
    "5G", "6G", "电信", "联通", "宽带", "光纤", "网络安全", "数据泄露", "黑客", "漏洞",
    # 科技人物
    "马斯克", "库克", "黄仁勋", "扎克伯格", "奥特曼",
    # 消费电子
    "苹果手机", "智能手机", "折叠屏", "卫星通信", "开源", "开发者",
]


# ========== 数据抓取 ==========
def fetch_json(url):
    """请求API并返回JSON数据"""
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("code") == 200 and data.get("data"):
                return data["data"]
            return []
    except Exception as e:
        print(f"[ERROR] Failed to fetch {url}: {e}", file=sys.stderr)
        return []


def normalize_dcd(items, limit=10):
    """标准化懂车帝数据"""
    result = []
    for i, item in enumerate(items[:limit]):
        result.append({
            "rank": item.get("rank", i + 1),
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "hot": item.get("score_desc", str(item.get("score", ""))),
            "hot_num": item.get("score", 0),
        })
    return result


def normalize_toutiao(items, limit=20):
    """标准化今日头条数据"""
    result = []
    for i, item in enumerate(items[:limit]):
        result.append({
            "rank": i + 1,
            "title": item.get("title", ""),
            "url": item.get("link", ""),
            "hot": item.get("hot_value", 0),
            "hot_num": item.get("hot_value", 0),
            "label": item.get("label", ""),
        })
    return result


def normalize_douyin(items, limit=20):
    """标准化抖音数据"""
    result = []
    for i, item in enumerate(items[:limit]):
        result.append({
            "rank": i + 1,
            "title": item.get("title", ""),
            "url": item.get("link", ""),
            "hot": item.get("hot_value", 0),
            "hot_num": item.get("hot_value", 0),
        })
    return result


def normalize_itnews(items, limit=20):
    """标准化IT资讯数据（用于汽车热榜补充）"""
    result = []
    for i, item in enumerate(items[:limit]):
        result.append({
            "rank": i + 1,
            "title": item.get("title", ""),
            "url": item.get("url", item.get("link", "")),
            "hot": "",
            "hot_num": 0,
            "label": "",
        })
    return result


def normalize_weibo(items, limit=20):
    """标准化微博数据"""
    result = []
    for i, item in enumerate(items[:limit]):
        result.append({
            "rank": i + 1,
            "title": item.get("title", ""),
            "url": item.get("link", ""),
            "hot": item.get("hot_value", 0),
            "hot_num": item.get("hot_value", 0),
            "label": item.get("label", ""),
        })
    return result


def fetch_autohome(limit=10):
    """抓取汽车之家热榜（真实数据，来自 fs.autohome.com.cn）"""
    url = AUTOHOME_API
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
        "Referer": "https://fs.autohome.com.cn/",
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            hotranklist = (data or {}).get("result", {}).get("hotranklist", [])
            # 取"热门总榜"（第一个分类）的前 limit 条
            for cat in hotranklist:
                lst = cat.get("list", [])
                if not lst:
                    continue
                result = []
                for i, item in enumerate(lst[:limit]):
                    bizid = item.get("bizid") or item.get("biz_id")
                    # 汽车之家热榜只有 APP scheme，无直接 web URL
                    # 使用 H5 热榜页 hash 路由作为跳转链接
                    item_url = f"https://fs.autohome.com.cn/app_spa/hotart/index.html#detail?id={bizid}"
                    result.append({
                        "rank": i + 1,
                        "title": item.get("title", ""),
                        "url": item_url,
                        "hot": "",
                        "hot_num": 0,
                        "author": item.get("authorname", ""),
                        "update_time": item.get("bizupdatetime", ""),
                    })
                return result
            return []
    except Exception as e:
        print(f"[ERROR] 汽车之家热榜抓取失败: {e}", file=sys.stderr)
        return []


def normalize_autohome(items, limit=10):
    """标准化汽车之家热榜数据（与看板字段对齐）"""
    result = []
    for i, item in enumerate(items[:limit]):
        result.append({
            "rank": item.get("rank", i + 1),
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "hot": item.get("hot", ""),
            "hot_num": item.get("hot_num", 0),
        })
    return result


def filter_by_keywords(items, keywords, normalizer, limit=10):
    """通用关键词筛选"""
    result = []
    for item in items:
        title = item.get("title", "")
        for kw in keywords:
            if kw in title:
                result.append(item)
                break
        if len(result) >= limit:
            break
    return normalizer(result, limit)


# ========== HTML 生成 ==========
def format_hot(val):
    """格式化热度值"""
    n = int(val) if isinstance(val, (int, float)) else 0
    s = str(val).strip()
    if "w" in s.lower() or "万" in s:
        return s
    if n >= 100000000:
        return f"{n / 100000000:.1f}亿"
    if n >= 10000:
        return f"{n / 10000:.1f}万"
    if n > 0:
        return str(n)
    return s


def build_board_html(board_id, logo_url, platform_name, badge_text, accent_color, items):
    """生成单个看板HTML"""
    max_hot = max((item.get("hot_num", 0) for item in items), default=1) or 1

    if not items:
        items_html = '      <div class="empty-tip">当前时段暂无相关话题</div>\n'
    else:
        items_html = ""
        for item in items:
            rank = item.get("rank", 0)
            title_text = item.get("title", "").replace("<", "&lt;").replace(">", "&gt;")
            url = item.get("url", "#").replace("'", "&#39;")
            hot = format_hot(item.get("hot", 0))
            hot_num = item.get("hot_num", 0)
            pct = round(hot_num / max_hot * 100) if max_hot > 0 else 0

            rank_cls = "rank-top" if rank <= 3 else ("rank-accent" if rank <= 10 else "rank-normal")

            items_html += f"""      <div class="item" onclick="window.open('{url}','_blank')">
        <div class="rank {rank_cls}">{rank}</div>
        <div class="item-body">
          <a class="item-title" href="{url}" target="_blank" rel="noopener">{title_text}</a>
          <div class="item-foot">
            <div class="bar-wrap"><div class="bar-fill" style="width:{pct}%;background:#555"></div></div>
            <span class="hot-num">{hot}</span>
          </div>
        </div>
      </div>
"""

    return f"""  <div class="board" id="{board_id}">
    <div class="board-head">
      <img class="logo" src="{logo_url}" alt="{platform_name}" onerror="this.style.display='none'">
      <span class="board-name">{platform_name}</span>
      <span class="badge" style="background:{accent_color};color:#fff">{badge_text}</span>
    </div>
    <div class="list">
{items_html}    </div>
  </div>
"""


def generate_html(boards_data):
    """生成完整的HTML页面"""
    now_bj = datetime.now(BJ_TZ)
    update_time = now_bj.strftime("%Y-%m-%d %H:%M")

    boards_html = ""
    for board in boards_data:
        boards_html += build_board_html(
            board["id"], board["logo"], board["name"],
            board["badge"], board["color"], board["items"]
        )

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>全网热榜看板</title>
<style>
:root {{
  --bg: #f0f2f5;
  --card: #ffffff;
  --text: #1a1a2e;
  --text2: #6b7280;
  --border: #e5e7eb;
  --shadow: 0 2px 8px rgba(0,0,0,0.06);
  --radius: 12px;
}}
@media (prefers-color-scheme: dark) {{
  :root {{
    --bg: #0a0a0f;
    --card: #16161d;
    --text: #e8e8ed;
    --text2: #6e6e78;
    --border: #2a2a35;
    --shadow: 0 2px 8px rgba(0,0,0,0.3);
  }}
}}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  min-height: 100vh;
}}
.header {{
  text-align: center;
  padding: 32px 16px 12px;
}}
.header h1 {{
  font-size: 24px;
  font-weight: 800;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.5px;
}}
.header .sub {{
  font-size: 13px;
  color: var(--text2);
  margin-top: 6px;
}}
.header .sub span {{
  display: inline-block;
  background: rgba(102,126,234,0.1);
  color: #667eea;
  padding: 2px 10px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 12px;
  margin-left: 6px;
}}
.boards {{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  max-width: 1400px;
  margin: 16px auto;
  padding: 0 16px 24px;
}}
.board {{
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}}
.board-head {{
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--card);
  z-index: 10;
}}
.logo {{
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: contain;
  flex-shrink: 0;
}}
.board-name {{
  font-size: 14px;
  font-weight: 700;
  flex: 1;
  color: var(--text);
}}
.badge {{
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 8px;
  letter-spacing: 0.3px;
  white-space: nowrap;
}}
.list {{
  flex: 1;
  padding: 4px 6px 8px;
  overflow-y: auto;
  max-height: 520px;
}}
.item {{
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}}
.item:hover {{ background: rgba(0,0,0,0.03); }}
@media (prefers-color-scheme: dark) {{
  .item:hover {{ background: rgba(255,255,255,0.03); }}
}}
.rank {{
  min-width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  border-radius: 6px;
  margin-top: 2px;
  flex-shrink: 0;
}}
.rank-top {{
  background: linear-gradient(135deg, #ff6b35, #ee5a24);
  color: #fff;
  box-shadow: 0 2px 6px rgba(238,90,36,0.25);
}}
.rank-accent {{
  background: rgba(102,126,234,0.1);
  color: #667eea;
}}
.rank-normal {{
  background: var(--bg);
  color: var(--text2);
  font-weight: 600;
}}
.item-body {{ flex: 1; min-width: 0; }}
.item-title {{
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  text-decoration: none;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  transition: opacity 0.15s;
}}
.item-title:hover {{ opacity: 0.6; }}
.item-foot {{
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}}
.bar-wrap {{
  flex: 1;
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}}
.bar-fill {{
  height: 100%;
  border-radius: 2px;
  min-width: 4px;
}}
.hot-num {{
  font-size: 10px;
  color: var(--text2);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 30px;
  text-align: right;
}}
.empty-tip {{
  text-align: center;
  color: var(--text2);
  font-size: 12px;
  padding: 40px 16px;
  opacity: 0.6;
}}
.footer {{
  text-align: center;
  padding: 16px;
  font-size: 11px;
  color: var(--text2);
  border-top: 1px solid var(--border);
  max-width: 1400px;
  margin: 0 auto;
}}
.footer a {{ color: #667eea; text-decoration: none; }}
.footer a:hover {{ text-decoration: underline; }}
.back-top {{
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 16px;
  opacity: 0;
  transition: opacity 0.3s;
  z-index: 99;
}}
.back-top.show {{ opacity: 1; }}
.back-top:hover {{ transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }}
@media (max-width: 1100px) {{
  .boards {{ grid-template-columns: repeat(2, 1fr); }}
}}
@media (max-width: 640px) {{
  .boards {{ grid-template-columns: 1fr; gap: 10px; }}
  .header h1 {{ font-size: 20px; }}
  .list {{ max-height: none; }}
}}
</style>
</head>
<body>

<div class="header">
  <h1>全网热榜看板</h1>
  <div class="sub">每日 10:30 &amp; 15:00 自动更新 <span>{update_time}</span></div>
</div>

<div class="boards">
{boards_html}
</div>

<div class="footer">
  数据来源: <a href="https://60s.viki.moe" target="_blank">60s API</a> · 部署于 <a href="https://pages.github.com" target="_blank">GitHub Pages</a>
</div>

<div class="back-top" id="backTop" onclick="window.scrollTo({{top:0,behavior:'smooth'}})">↑</div>

<script>
window.addEventListener('scroll',function(){{
  document.getElementById('backTop').classList.toggle('show',window.scrollY>400);
}});
</script>
</body>
</html>"""


# ========== 主流程 ==========
def main():
    print("=" * 50)
    print(f"全网热榜看板 - 数据抓取 {datetime.now(BJ_TZ).strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    # 1. 抓取基础数据
    print("\n[1/6] 抓取汽车之家热榜...")
    autohome_raw = fetch_autohome(10)
    print(f"  → 获取 {len(autohome_raw)} 条")

    print("[2/6] 抓取懂车帝热榜...")
    dcd_raw = fetch_json(f"{API_BASE}/dongchedi")
    print(f"  → 获取 {len(dcd_raw)} 条")

    print("[3/6] 抓取今日头条热榜...")
    toutiao_raw = fetch_json(f"{API_BASE}/toutiao")
    print(f"  → 获取 {len(toutiao_raw)} 条")

    print("[4/6] 抓取抖音热榜...")
    douyin_raw = fetch_json(f"{API_BASE}/douyin")
    print(f"  → 获取 {len(douyin_raw)} 条")

    print("[5/6] 抓取微博热搜...")
    weibo_raw = fetch_json(f"{API_BASE}/weibo")
    print(f"  → 获取 {len(weibo_raw)} 条")

    print("[6/6] 抓取IT资讯(汽车补充)...")
    itnews_raw = fetch_json(f"{API_BASE}/it-news")
    print(f"  → 获取 {len(itnews_raw)} 条")

    # 2. 数据处理
    print("\n处理数据...")

    # 汽车之家热榜 TOP10（真实数据，来自 autohome API）
    autohome_hot = normalize_autohome(autohome_raw, 10)
    print(f"  汽车之家热榜: {len(autohome_hot)} 条 (汽车之家 API)")

    # 懂车帝热点榜 TOP10（作为独立板块保留）
    dcd_hot = normalize_dcd(dcd_raw[:10]) if dcd_raw else []
    print(f"  懂车帝热点榜: {len(dcd_hot)} 条")

    # 微博汽车热榜：先从微博热搜匹配，不够10条则从IT资讯补充
    weibo_auto_from_wb = filter_by_keywords(weibo_raw, WEIBO_AUTO_KEYWORDS, normalize_weibo, 10)
    weibo_auto = list(weibo_auto_from_wb)
    if len(weibo_auto) < 10 and itnews_raw:
        exist_titles = {item["title"] for item in weibo_auto}
        it_auto = filter_by_keywords(itnews_raw, WEIBO_AUTO_KEYWORDS, normalize_itnews, 10)
        it_auto_filtered = [item for item in it_auto if item["title"] not in exist_titles]
        weibo_auto = (weibo_auto + it_auto_filtered)[:10]
        for i, item in enumerate(weibo_auto):
            item["rank"] = i + 1
    print(f"  微博汽车热榜: {len(weibo_auto_from_wb)}(微博) + {len(weibo_auto) - len(weibo_auto_from_wb)}(IT资讯) = {len(weibo_auto)} 条")

    # 今日头条热榜 TOP20
    toutiao_hot = normalize_toutiao(toutiao_raw, 20)
    print(f"  头条热榜: {len(toutiao_hot)} 条")

    # 抖音热榜 TOP20
    douyin_hot = normalize_douyin(douyin_raw, 20)
    print(f"  抖音热榜: {len(douyin_hot)} 条")

    # 微博热搜 TOP20
    weibo_hot = normalize_weibo(weibo_raw, 20)
    print(f"  微博热搜: {len(weibo_hot)} 条")

    # 微博文娱 TOP10 (从微博筛选)
    weibo_ent = filter_by_keywords(weibo_raw, ENT_KEYWORDS, normalize_weibo, 10)
    print(f"  微博文娱: {len(weibo_ent)} 条 (筛选自微博)")

    # 微博科技 TOP10 (从微博筛选)
    weibo_tech = filter_by_keywords(weibo_raw, TECH_KEYWORDS, normalize_weibo, 10)
    print(f"  微博科技: {len(weibo_tech)} 条 (筛选自微博)")

    # 3. 组装看板（顺序：第一行4个，第二行4个）
    boards = [
        # 第一行
        {
            "id": "autohome-hot",
            "logo": "https://www.autohome.com.cn/favicon.ico",
            "name": "汽车之家",
            "badge": "热榜",
            "color": "#FF6600",
            "items": autohome_hot,
        },
        {
            "id": "dcd-hot",
            "logo": "https://icon.horse/icon/www.dongchedi.com",
            "name": "懂车帝",
            "badge": "热点榜",
            "color": "#00b894",
            "items": dcd_hot,
        },
        {
            "id": "wb-auto",
            "logo": "https://weibo.com/favicon.ico",
            "name": "新浪微博",
            "badge": "汽车热榜",
            "color": "#e17055",
            "items": weibo_auto,
        },
        {
            "id": "tt-hot",
            "logo": "https://www.toutiao.com/favicon.ico",
            "name": "今日头条",
            "badge": "头条热榜",
            "color": "#ff4757",
            "items": toutiao_hot,
        },
        # 第二行
        {
            "id": "dy-hot",
            "logo": "https://www.douyin.com/favicon.ico",
            "name": "抖音",
            "badge": "热榜",
            "color": "#1a1a2e",
            "items": douyin_hot,
        },
        {
            "id": "wb-hot",
            "logo": "https://weibo.com/favicon.ico",
            "name": "新浪微博",
            "badge": "热搜榜",
            "color": "#ff4500",
            "items": weibo_hot,
        },
        {
            "id": "wb-ent",
            "logo": "https://weibo.com/favicon.ico",
            "name": "新浪微博",
            "badge": "文娱热搜",
            "color": "#e84393",
            "items": weibo_ent,
        },
        {
            "id": "wb-tech",
            "logo": "https://weibo.com/favicon.ico",
            "name": "新浪微博",
            "badge": "科技热搜",
            "color": "#6c5ce7",
            "items": weibo_tech,
        },
    ]

    # 4. 生成 HTML
    html = generate_html(boards)

    # 5. 写入文件
    output_path = "index.html"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    file_size = len(html.encode("utf-8"))
    print(f"\n✅ 生成完成: {output_path} ({file_size:,} bytes)")

    # 检查空看板
    empty_boards = [b["name"] + " " + b["badge"] for b in boards if len(b["items"]) == 0]
    if empty_boards:
        print(f"⚠️  暂无数据: {', '.join(empty_boards)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
