#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全网热榜看板 - 数据抓取 & HTML 生成脚本 (GitHub Actions Python 版)
数据源:
  60s API: dongchedi / toutiao / douyin / weibo / it-news / baidu/hot
  汽车之家: newshotrankh5list (H5 今日实时热点榜)
  tophub:  微博文娱榜 / 新浪汽车热搜榜 (带重试 + fallback)
"""

import json
import urllib.request
import urllib.error
import re
import sys
import time
from datetime import datetime, timezone, timedelta

# ========== 配置 ==========
API_BASE = "https://60s.viki.moe/v2"
AUTOHOME_API = "https://news.app.autohome.com.cn/news_v10.0.0/news/newshotrankh5list"
TOPHUB_ENT_NODE = "/n/3QeLwJEd7k"  # 微博文娱榜
TOPHUB_AUTO_NODE = "/n/aEdZbrkdrO"  # 新浪汽车热搜榜
TOPHUB_DCD_NODE = "/n/7GdaA8kdQy"  # 懂车帝热搜榜
TOPHUB_TT_AUTO_NODE = "/n/Q0orLpDd8B"  # 今日头条汽车热榜
TOPHUB_BASE = "https://tophub.today"
TIMEOUT = 15  # 秒

# 北京时区
BJ_TZ = timezone(timedelta(hours=8))

# ========== 关键词 ==========

WEIBO_AUTO_KEYWORDS = [
    # 汽车品牌（精准匹配）
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

ENT_KEYWORDS = [
    "文娱", "影视", "综艺", "明星", "音乐", "电影", "电视剧", "演出", "娱乐",
    "浪姐", "歌手", "乘风", "芒果", "选秀", "演唱会", "票房",
    "热巴", "杨幂", "刘诗诗", "张柏芝", "白鹿", "迪丽热巴", "王力宏", "柯南",
    "何猷君", "奚梦瑶", "方媛", "李纯", "徐志胜", "张嘉益", "痞幼", "沈腾",
    "孙颖莎", "柳智敏", "Faker", "李乃文", "梅婷", "黄圣依", "金鹰奖",
    "归鸾", "家业", "藏海传", "张凌赫", "杨洋", "杨紫", "虞书欣",
    "龚俊", "成毅", "王一博", "肖战", "王俊凯", "易烊千玺",
    "中餐厅", "奔跑吧", "披荆斩棘", "演员请就位",
    "戛纳", "金鸡", "华表", "百花",
]

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
    """请求 60s API 并返回 JSON 数据"""
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


def fetch_autohome(limit=10):
    """抓取汽车之家「今日实时热点榜」（来自 fs.autohome.com.cn H5 页同源 API）"""
    url = AUTOHOME_API
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
        "Referer": "https://fs.autohome.com.cn/",
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            hot_list = (data or {}).get("result", {}).get("list", [])
            result = []
            for item in hot_list[:limit]:
                objectid = item.get("objectid", "")
                hotnum = item.get("hotnum", "")
                hot_num = 0
                if hotnum:
                    h = hotnum.replace("万", "").replace("亿", "")
                    try:
                        h_val = float(h)
                        if "亿" in hotnum:
                            hot_num = h_val * 100000000
                        elif "万" in hotnum:
                            hot_num = h_val * 10000
                        else:
                            hot_num = h_val
                    except ValueError:
                        hot_num = 0
                item_url = f"https://fs.autohome.com.cn/app_spa/hotart/index.html#detail?id={objectid}"
                result.append({
                    "rank": item.get("hotrank", len(result) + 1),
                    "title": item.get("hottitle", ""),
                    "url": item_url,
                    "hot": hotnum,
                    "hot_num": hot_num,
                })
            return result
    except Exception as e:
        print(f"[ERROR] 汽车之家热榜抓取失败: {e}", file=sys.stderr)
        return []


def fetch_tophub(node_path, retries=2):
    """
    抓取 tophub 页面并解析条目（带重试）
    HTML 结构: <tr><td align="center">{rank}.</td><td><a href="{url}">{title}</a></td><td class="ws">{heat}</td>
    """
    url = f"{TOPHUB_BASE}{node_path}"
    browser_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }

    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=browser_headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                if resp.status == 503:
                    if attempt < retries:
                        time.sleep(1)
                        continue
                    return []
                html = resp.read().decode("utf-8")
                items = parse_tophub_html(html)
                if items:
                    return items
                if attempt < retries:
                    time.sleep(1)
                    continue
                return []
        except Exception:
            if attempt < retries:
                time.sleep(1)
                continue
            return []
    return []


def parse_tophub_html(html):
    """解析 tophub HTML，提取条目列表"""
    items = []
    # 匹配: <td align="center">{rank}.</td>...<a href="{url}"...>{title}</a>...<td class="ws">{heat}</td>
    pattern = r'<tr>\s*<td[^>]*>(\d+)\.\s*</td>\s*<td[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)</a>'
    for m in re.finditer(pattern, html):
        rank = int(m.group(1))
        url = m.group(2)
        title = m.group(3).strip()
        if not title or not url:
            continue

        # 在同一 <tr> 中查找热度值
        tr_start = m.start()
        tr_end = html.find("</tr>", tr_start)
        tr_content = html[tr_start:tr_end if tr_end > -1 else tr_start + 500]
        heat_match = re.search(r'class="ws"[^>]*>([^<]+)</td>', tr_content)
        hot = heat_match.group(1).strip() if heat_match else ""
        hot_num = 0
        if hot:
            h = hot.replace("万", "").replace("亿", "")
            try:
                h_val = float(h)
                if "亿" in hot:
                    hot_num = h_val * 100000000
                elif "万" in hot:
                    hot_num = h_val * 10000
                else:
                    hot_num = h_val
            except ValueError:
                hot_num = 0
        items.append({"rank": rank, "title": title, "url": url, "hot": hot, "hot_num": hot_num})
    return items


# ========== 数据标准化 ==========
def normalize_dcd(items, limit=10):
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


def normalize_weibo(items, limit=20):
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


def normalize_baidu(items, limit=50):
    result = []
    for i, item in enumerate(items[:limit]):
        result.append({
            "rank": item.get("rank", i + 1),
            "title": item.get("title", ""),
            "url": item.get("link", item.get("url", "")),
            "hot": item.get("hot_value", item.get("desc", "")),
            "hot_num": item.get("hot_value", 0),
            "label": item.get("label", ""),
        })
    return result


def normalize_itnews(items, limit=20):
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


def normalize_autohome(items, limit=10):
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


def normalize_tophub(items, limit=10):
    result = []
    for item in items[:limit]:
        result.append({
            "rank": item.get("rank", 0),
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "hot": item.get("hot", ""),
            "hot_num": item.get("hot_num", 0),
        })
    return result


# ========== 关键词筛选 ==========
def filter_by_kw_raw(items, keywords, limit=10):
    """原始 item 级别筛选，保留原始字段"""
    result = []
    for item in items:
        title = item.get("title", "")
        for kw in keywords:
            if kw in title:
                result.append(item)
                break
        if len(result) >= limit:
            break
    return result


def multi_source_filter(sources, keywords, limit=10):
    """
    多源关键词筛选：从多个数据源中按关键词筛选，自动去重
    sources: [{"items": list, "normalizer": func, "label": str}, ...]
    """
    seen = set()
    result = []
    for src in sources:
        if len(result) >= limit:
            break
        raw_filtered = filter_by_kw_raw(src["items"], keywords, limit)
        for raw_item in raw_filtered:
            if len(result) >= limit:
                break
            title = raw_item.get("title", "")
            if title in seen:
                continue
            seen.add(title)
            norm_item = src["normalizer"]([raw_item], 1)[0]
            result.append(norm_item)
    # 重新编号
    for i, item in enumerate(result):
        item["rank"] = i + 1
    return result


# ========== HTML 生成 ==========
def format_hot(val):
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
            <div class="bar-wrap"><div class="bar-fill" style="width:{pct}%;background:#d1d5db"></div></div>
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
<title>YU-全网热点看板</title>
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
.refresh-btn {{
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(102,126,234,0.1);
  color: #667eea;
  border: 1px solid rgba(102,126,234,0.15);
  padding: 2px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: 6px;
  font-family: inherit;
}}
.refresh-btn:hover {{ background: rgba(102,126,234,0.2); border-color: rgba(102,126,234,0.3); }}
.refresh-btn.loading {{ opacity: 0.6; pointer-events: none; }}
@keyframes spin-anim {{ from {{ transform: rotate(0deg); }} to {{ transform: rotate(360deg); }} }}
.refresh-btn.loading .spin-icon {{ animation: spin-anim 1s linear infinite; display: inline-block; }}
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
  <h1>YU-全网热点看板</h1>
  <div class="sub">
    <span id="clock">{update_time}</span>
    <button class="refresh-btn" id="refreshBtn" onclick="refreshAll()"><span class="spin-icon">⟳</span> 刷新</button>
  </div>
</div>

<div class="boards">
{boards_html}
</div>

<div class="footer">
  数据来源: <a href="https://60s.viki.moe" target="_blank">60s API</a> · <a href="https://tophub.today" target="_blank">今日热榜</a> · 部署于 <a href="https://pages.github.com" target="_blank">GitHub Pages</a>
</div>

<div class="back-top" id="backTop" onclick="window.scrollTo({{top:0,behavior:'smooth'}})">↑</div>

<script>
window.addEventListener('scroll',function(){{
  document.getElementById('backTop').classList.toggle('show',window.scrollY>400);
}});
</script>
<script src="refresh.js"></script>
</body>
</html>"""


# ========== 主流程 ==========
def main():
    print("=" * 50)
    print(f"全网热榜看板 - 数据抓取 {datetime.now(BJ_TZ).strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    # 1. 并行抓取所有数据源（使用线程模拟并发）
    import concurrent.futures

    def fetch_all():
        results = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            futures = {
                executor.submit(fetch_autohome, 10): "autohome",
                executor.submit(fetch_json, f"{API_BASE}/dongchedi"): "dcd",
                executor.submit(fetch_json, f"{API_BASE}/toutiao"): "toutiao",
                executor.submit(fetch_json, f"{API_BASE}/douyin"): "douyin",
                executor.submit(fetch_json, f"{API_BASE}/weibo"): "weibo",
                executor.submit(fetch_json, f"{API_BASE}/it-news"): "itnews",
            }
            for future in concurrent.futures.as_completed(futures):
                key = futures[future]
                try:
                    results[key] = future.result()
                except Exception as e:
                    print(f"  {key} 抓取失败: {e}", file=sys.stderr)
                    results[key] = []
        return results

    print("\n[抓取] 并行请求所有数据源...")
    data = fetch_all()
    ah_raw = data.get("autohome", [])
    dcd_raw = data.get("dcd", [])
    toutiao_raw = data.get("toutiao", [])
    douyin_raw = data.get("douyin", [])
    weibo_raw = data.get("weibo", [])
    itnews_raw = data.get("itnews", [])
    print(f"  汽车之家: {len(ah_raw)} | 懂车帝: {len(dcd_raw)} | 头条: {len(toutiao_raw)} | 抖音: {len(douyin_raw)}")
    print(f"  微博: {len(weibo_raw)} | IT资讯: {len(itnews_raw)}")

    # 并行抓取 tophub 四个榜单（带重试）
    print("[抓取] tophub 四个榜单...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        th_futures = {
            executor.submit(fetch_tophub, TOPHUB_ENT_NODE, 2): "ent",
            executor.submit(fetch_tophub, TOPHUB_AUTO_NODE, 2): "auto",
            executor.submit(fetch_tophub, TOPHUB_DCD_NODE, 2): "dcd",
            executor.submit(fetch_tophub, TOPHUB_TT_AUTO_NODE, 2): "tt_auto",
        }
        th_results = {}
        for future in concurrent.futures.as_completed(th_futures):
            key = th_futures[future]
            try:
                th_results[key] = future.result()
            except Exception:
                th_results[key] = []
    tophub_ent = th_results.get("ent", [])
    tophub_auto = th_results.get("auto", [])
    tophub_dcd = th_results.get("dcd", [])
    tophub_tt_auto = th_results.get("tt_auto", [])
    print(f"  tophub 文娱: {len(tophub_ent)} | 汽车: {len(tophub_auto)} | 懂车帝: {len(tophub_dcd)} | 头条汽车: {len(tophub_tt_auto)} 条")

    # 2. 数据处理
    print("\n[处理] 组装看板数据...")

    # 汽车之家热榜 TOP10
    autohome_hot = normalize_autohome(ah_raw, 10)
    print(f"  汽车之家热榜: {len(autohome_hot)} 条")

    # 懂车帝热点榜 TOP10：tophub 优先（带可跳转URL），fallback 到 60s API
    if len(tophub_dcd) >= 5:
        dcd_hot = normalize_tophub(tophub_dcd, 10)
        dcd_source = "tophub"
    else:
        print("  tophub 懂车帝数据不足，fallback 到 60s API...")
        dcd_hot = normalize_dcd(dcd_raw, 10)
        dcd_source = "60s API"
    print(f"  懂车帝热点榜: {len(dcd_hot)} 条 ({dcd_source})")

    # 微博汽车热榜：tophub 新浪汽车热搜为主，fallback 多源关键词 + 汽车之家补充
    if len(tophub_auto) >= 5:
        weibo_auto = normalize_tophub(tophub_auto, 10)
        auto_source = "tophub"
    else:
        print("  tophub 汽车数据不足，fallback 到多源关键词...")
        auto_sources = [
            {"items": weibo_raw, "normalizer": normalize_weibo, "label": "微博"},
            {"items": toutiao_raw, "normalizer": normalize_toutiao, "label": "头条"},
            {"items": douyin_raw, "normalizer": normalize_douyin, "label": "抖音"},
            {"items": itnews_raw, "normalizer": normalize_itnews, "label": "IT资讯"},
        ]
        weibo_auto = multi_source_filter(auto_sources, WEIBO_AUTO_KEYWORDS, 10)
        # 多源不够10条时，用汽车之家热榜补充（去重）
        if len(weibo_auto) < 10 and ah_raw:
            exist_titles = {item["title"] for item in weibo_auto}
            ah_supplement = normalize_autohome(ah_raw, 10)
            ah_supplement = [item for item in ah_supplement if item["title"] not in exist_titles]
            weibo_auto = (weibo_auto + ah_supplement)[:10]
            for i, item in enumerate(weibo_auto):
                item["rank"] = i + 1
        auto_source = "多源+汽车之家补充"
    print(f"  微博汽车热榜: {len(weibo_auto)} 条 ({auto_source})")

    # 今日头条汽车热榜 TOP10：tophub 头条汽车榜
    if len(tophub_tt_auto) >= 5:
        tt_auto = normalize_tophub(tophub_tt_auto, 10)
        tt_auto_source = "tophub"
    else:
        tt_auto = multi_source_filter([
            {"items": toutiao_raw, "normalizer": normalize_toutiao, "label": "头条"},
            {"items": weibo_raw, "normalizer": normalize_weibo, "label": "微博"},
        ], WEIBO_AUTO_KEYWORDS, 10)
        tt_auto_source = "多源关键词"
    print(f"  今日头条汽车热榜: {len(tt_auto)} 条 ({tt_auto_source})")

    # 今日头条热榜 TOP20
    toutiao_hot = normalize_toutiao(toutiao_raw, 20)

    # 抖音热榜 TOP20
    douyin_hot = normalize_douyin(douyin_raw, 20)

    # 微博热搜 TOP20
    weibo_hot = normalize_weibo(weibo_raw, 20)

    # 微博文娱 TOP10: tophub 优先，fallback 到多源关键词匹配
    if len(tophub_ent) >= 5:
        weibo_ent = normalize_tophub(tophub_ent, 10)
        ent_source = "tophub"
    else:
        print("  tophub 文娱数据不足，fallback 到关键词匹配...")
        ent_sources = [
            {"items": weibo_raw, "normalizer": normalize_weibo, "label": "微博"},
            {"items": toutiao_raw, "normalizer": normalize_toutiao, "label": "头条"},
        ]
        weibo_ent = multi_source_filter(ent_sources, ENT_KEYWORDS, 10)
        ent_source = "多源关键词"
    print(f"  微博文娱: {len(weibo_ent)} 条 ({ent_source})")

    # 3. 组装看板
    boards = [
        # 第一行
        {
            "id": "autohome-hot",
            "logo": "https://www.autohome.com.cn/favicon.ico",
            "name": "汽车之家",
            "badge": "热榜",
            "color": "#3b82f6",
            "items": autohome_hot,
        },
        {
            "id": "dcd-hot",
            "logo": "https://icon.horse/icon/www.dongchedi.com",
            "name": "懂车帝",
            "badge": "热点榜",
            "color": "#eab308",
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
            "id": "tt-auto",
            "logo": "https://www.toutiao.com/favicon.ico",
            "name": "今日头条",
            "badge": "汽车热榜",
            "color": "#F85959",
            "items": tt_auto,
        },
        # 第二行
        {
            "id": "tt-hot",
            "logo": "https://www.toutiao.com/favicon.ico",
            "name": "今日头条",
            "badge": "头条热榜",
            "color": "#ff4757",
            "items": toutiao_hot,
        },
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
