// 手机端 App 切换面板的数据源：调用本地 Swift 小工具列出前台 App + 64px 图标
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { log } = require('../logger')
const paths = require('../paths')

const BIN_PATH = paths.binFile('app-list')
const SWIFT_PATH = paths.swiftFile('app-list.swift')
// 手机托盘可展示的上限；Swift 已把前台 App 排在最前，截断时不会丢当前应用
const MAX_APPS = 30
// 运行中 App 列表变化快（退出/启动），几乎不做 TTL；force 时一律重拉
const CACHE_MS = 0
const ALL_CACHE_MS = 30000

let cache = { at: 0, apps: [] }
let allCache = { at: 0, apps: [] }

function ensureHelper() {
  // 缺失或 Swift 源比二进制新时重编（源改了不会永远卡在旧 helper）
  let needsBuild = !fs.existsSync(BIN_PATH)
  if (!needsBuild && fs.existsSync(SWIFT_PATH)) {
    try {
      needsBuild = fs.statSync(SWIFT_PATH).mtimeMs > fs.statSync(BIN_PATH).mtimeMs
    } catch (_) {
      needsBuild = true
    }
  }
  if (!needsBuild) return
  log('apps', needsBuild && fs.existsSync(BIN_PATH) ? 'App 列表助手源码已更新，重新编译…' : '首次运行，编译 App 列表助手…')
  fs.mkdirSync(path.dirname(BIN_PATH), { recursive: true })
  execFileSync('swiftc', ['-O', '-o', BIN_PATH, SWIFT_PATH], { timeout: 120000 })
  log('apps', 'App 列表助手编译完成')
}

function listApps(force = false) {
  if (!force && CACHE_MS > 0 && cache.apps.length && Date.now() - cache.at < CACHE_MS) {
    return cache.apps
  }
  ensureHelper()
  try {
    const raw = execFileSync(BIN_PATH, [], { encoding: 'utf8', timeout: 10000, maxBuffer: 8 * 1024 * 1024 })
    const parsed = JSON.parse(raw)
    const apps = (Array.isArray(parsed) ? parsed : []).slice(0, MAX_APPS)
    cache = { at: Date.now(), apps }
    return apps
  } catch (error) {
    log('apps', '获取 App 列表失败:', error.message)
    // 失败时不回退陈旧缓存，避免托盘仍显示已退出的 App
    return []
  }
}

// 列出全部已安装应用（系统级 + 非系统级，Launchpad 风格），含图标。
// 为避免手机端点“启动台”每次都同步跑 App 列表助手（timeout 15s）卡主线程，
// 复用 TTL 缓存（比前台 App 列表更久一些，30s 内命中直接返回）。
function listAllApps(force = false) {
  if (!force && allCache.apps.length && Date.now() - allCache.at < ALL_CACHE_MS) return allCache.apps
  ensureHelper()
  try {
    const raw = execFileSync(BIN_PATH, ['--all'], { encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024 })
    const apps = JSON.parse(raw)
    const list = Array.isArray(apps) ? apps : []
    allCache = { at: Date.now(), apps: list }
    log('apps', `拉取启动台 App 列表（${list.length} 个）`)
    return list
  } catch (error) {
    log('apps', '获取全部 App 失败:', error.message)
    return allCache.apps
  }
}

function getFrontmostApp() {
  ensureHelper()
  try {
    const raw = execFileSync(BIN_PATH, ['--front'], { encoding: 'utf8', timeout: 3000 })
    const parsed = JSON.parse(raw.trim())
    if (parsed && (parsed.name || parsed.bundleId)) return parsed
  } catch (error) {
    log('apps', '获取前台 App 失败:', error.message)
  }
  return null
}

module.exports = { listApps, listAllApps, getFrontmostApp }
