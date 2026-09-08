#!/usr/bin/env node
// 确保 Electron 二进制完整。本机 extract-zip 会在解压中途挂起，留下无 Frameworks 的残缺 dist。
// 用系统 unzip 从缓存 zip（或重新下载）解出完整 Electron.app。
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ELECTRON_DIR = path.join(ROOT, 'node_modules', 'electron')
const DIST = path.join(ELECTRON_DIR, 'dist')
const FRAMEWORK = path.join(
  DIST,
  'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'
)
const PATH_TXT = path.join(ELECTRON_DIR, 'path.txt')
const PLATFORM_PATH = 'Electron.app/Contents/MacOS/Electron'

function frameworkOk() {
  try {
    return fs.existsSync(FRAMEWORK) && fs.statSync(FRAMEWORK).size > 1_000_000
  } catch {
    return false
  }
}

function findCachedZip(version) {
  const name = `electron-v${version}-darwin-${process.arch}.zip`
  const roots = [
    path.join(os.homedir(), 'Library/Caches/electron'),
    path.join(os.homedir(), '.cache/electron'),
  ]
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const hash of fs.readdirSync(root)) {
      const fp = path.join(root, hash, name)
      if (fs.existsSync(fp)) return fp
    }
  }
  return null
}

async function downloadZip(version) {
  let downloadArtifact
  try {
    ;({ downloadArtifact } = require('@electron/get'))
  } catch {
    ;({ downloadArtifact } = require(path.join(ELECTRON_DIR, 'node_modules', '@electron/get')))
  }
  return downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
  })
}

async function main() {
  if (frameworkOk()) {
    console.log('Electron Framework OK')
    return
  }

  const { version } = require(path.join(ELECTRON_DIR, 'package.json'))
  console.log('Electron dist 不完整，改用 unzip 修复…')

  let zip = findCachedZip(version)
  if (!zip) {
    console.log('缓存中无 Electron zip，开始下载…')
    zip = await downloadZip(version)
  }
  console.log('使用 zip:', zip)

  fs.rmSync(DIST, { recursive: true, force: true })
  fs.mkdirSync(DIST, { recursive: true })
  execFileSync('unzip', ['-q', zip, '-d', DIST], { stdio: 'inherit' })
  fs.writeFileSync(PATH_TXT, PLATFORM_PATH)

  if (!frameworkOk()) {
    console.error('Electron 修复失败：Framework 仍缺失')
    process.exit(1)
  }
  console.log('Electron 已用 unzip 修复完整')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
