import * as cheerio from "cheerio"

interface HotSearchRes {
  ok: number
  data: {
    realtime: {
      word: string
      word_scheme?: string
      icon?: string
      is_ad?: number
    }[]
  }
}

type HotSearchItem = HotSearchRes["data"]["realtime"][number]

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const AJAX_URL = "https://weibo.com/ajax/side/hotSearch"
const BASE_URL = "https://s.weibo.com"
const PAGE_URL = `${BASE_URL}/top/summary?cate=realtimehot`
const VISITOR_FP = encodeURIComponent(JSON.stringify({ os: "1", browser: "Chrome130,Windows" }))

// 上游项目公开的访客 Cookie，仅在动态申请失败时兜底
const FALLBACK_COOKIE = "SUB=_2AkMWIuNSf8NxqwJRmP8dy2rhaoV2ygrEieKgfhKJJRMxHRl-yT9jqk86tRB6PaLNvQZR6zYUcYVT1zSjoSreQHidcUq7"

function parseJsonp<T>(text: string, name: string): T {
  const start = text.indexOf(`${name}(`)
  const end = text.lastIndexOf(")")
  if (start < 0 || end <= start) throw new Error(`unexpected weibo visitor response: ${name}`)
  return JSON.parse(text.slice(start + name.length + 1, end)) as T
}

async function getVisitorCookie(): Promise<string> {
  const genvisitor = await myFetch<string>(
    `https://passport.weibo.com/visitor/genvisitor?cb=gen_callback&fp=${VISITOR_FP}`,
    { headers: { "User-Agent": UA }, responseType: "text" as any, retry: 1 },
  )
  const tid = parseJsonp<{ data: { tid: string } }>(genvisitor, "gen_callback").data?.tid
  if (!tid) throw new Error("weibo visitor: no tid")

  const incarnate = await myFetch<string>(
    `https://passport.weibo.com/visitor/visitor?a=incarnate&t=${encodeURIComponent(tid)}&w=2&c=095&gc=&cb=cross_domain&from=weibo`,
    { headers: { "User-Agent": UA, "Cookie": `tid=${tid}` }, responseType: "text" as any, retry: 1 },
  )
  const sub = parseJsonp<{ data: { sub: string } }>(incarnate, "cross_domain").data?.sub
  if (!sub) throw new Error("weibo visitor: no sub")
  return `SUB=${sub}`
}

function fromAjax(k: HotSearchItem): NewsItem {
  const keyword = k.word_scheme || `#${k.word}#`
  return {
    id: k.word,
    title: k.word,
    url: `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`,
    mobileUrl: `https://m.weibo.cn/search?containerid=231522type%3D1%26q%3D${encodeURIComponent(keyword)}&_T_WM=16922097837&v_p=42`,
    extra: {
      icon: k.icon ? { url: k.icon, scale: 1.5 } : undefined,
    },
  }
}

function parseHtml(html: string): NewsItem[] {
  const $ = cheerio.load(html)
  const rows = $("#pl_top_realtimehot table tbody tr").slice(1)
  const flagUrls: Record<string, string> = {
    新: "https://simg.s.weibo.com/moter/flags/1_0.png",
    热: "https://simg.s.weibo.com/moter/flags/2_0.png",
    爆: "https://simg.s.weibo.com/moter/flags/4_0.png",
  }
  const items: NewsItem[] = []

  rows.each((_, row) => {
    const $row = $(row)
    const $link = $row.find("td.td-02 a").filter((_, el) => {
      const href = $(el).attr("href")
      return !!(href && !href.includes("javascript:void(0);"))
    }).first()
    if (!$link.length) return

    const title = $link.text().trim()
    const href = $link.attr("href")
    if (!title || !href) return

    const flagUrl = flagUrls[$row.find("td.td-03").text().trim()]
    items.push({
      id: title,
      title,
      url: `${BASE_URL}${href}`,
      mobileUrl: `${BASE_URL}${href}`,
      extra: {
        icon: flagUrl ? { url: flagUrl, scale: 1.5 } : undefined,
      },
    })
  })
  return items
}

export default defineSource(async () => {
  let cookie = FALLBACK_COOKIE
  try {
    cookie = await getVisitorCookie()
  } catch (e) {
    logger.warn("weibo visitor cookie failed, use fallback", e)
  }

  const headers = { "User-Agent": UA, "Cookie": cookie }

  try {
    const res: HotSearchRes = await myFetch(AJAX_URL, {
      headers: { ...headers, Referer: "https://weibo.com/" },
      retry: 1,
    })
    if (res.ok !== 1 || !Array.isArray(res.data?.realtime) || !res.data.realtime.length) {
      throw new Error("weibo hot search empty")
    }
    return res.data.realtime.filter(k => !k.is_ad && k.word).map(fromAjax)
  } catch (e) {
    logger.warn("weibo ajax failed, fallback to html", e)
  }

  const html = await myFetch<string>(PAGE_URL, {
    headers: { ...headers, Referer: PAGE_URL },
    responseType: "text" as any,
    retry: 1,
  })
  const items = parseHtml(html)
  if (!items.length) throw new Error("weibo hot search empty")
  return items
})
