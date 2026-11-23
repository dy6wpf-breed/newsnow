/**
 * 缓存过期时间
 */
import packageJSON from "../package.json"

export const TTL = 30 * 60 * 1000
/**
 * 缓存最大可用时长，超过后抓取失败不再展示陈旧内容
 */
export const MaxStale = 24 * 60 * 60 * 1000
/**
 * 默认刷新间隔, 10 min
 */
export const Interval = 10 * 60 * 1000

export const Homepage = packageJSON.homepage

export const Version = packageJSON.version
export const Author = packageJSON.author
