const { app, BrowserWindow, ipcMain, net } = require('electron')
const path = require('path')
require('dotenv').config({
  path: app.isPackaged
    ? path.join(path.dirname(process.execPath), '.env')
    : path.join(__dirname, '../../.env'),
})
const { initDatabase, getDb } = require('../database/db')
const { registerHandlers, setMainWindow } = require('./ipcHandlers')
const { exportToPdf } = require('./pdfExport')
const { pullFromSupabase, flushOfflineQueue, isOnline } = require('./supabaseSync')

const isDev = !app.isPackaged

// Background sync interval: pull from Supabase every 5 minutes while online
const PULL_INTERVAL_MS = 5 * 60 * 1000
let pullTimer = null
let mainWindow = null

function getSupabaseCreds() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
  }
}

// Emit sync status to the renderer window
function emitSyncStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync:status', status)
  }
}

// Flush queued writes then pull latest from Supabase.
// Called on startup, on reconnect, and on the periodic timer.
async function syncNow(reason) {
  const { url, key } = getSupabaseCreds()
  if (!url || !key) return
  if (!isOnline()) return

  const db = getDb()
  try {
    // 1. Push any locally-queued writes first
    const queueResult = await flushOfflineQueue(db, url, key)
    if (queueResult.flushed > 0) {
      console.log(`[sync] Flushed ${queueResult.flushed} queued writes (${reason})`)
    }

    // 2. Pull latest state from Supabase (source of truth)
    const pullResult = await pullFromSupabase(db, url, key)
    if (pullResult.success) {
      // Persist last sync time
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('last_sync_at', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .run(pullResult.syncedAt)
      const pendingCount = db.prepare('SELECT COUNT(*) as c FROM offline_queue').get().c
      emitSyncStatus({ configured: true, online: true, syncing: false, syncedAt: pullResult.syncedAt, pending: pendingCount, error: null })
    } else {
      emitSyncStatus({ configured: true, online: true, syncing: false, syncedAt: null, pending: null, error: pullResult.error })
    }
  } catch (err) {
    console.warn(`[sync] Failed (${reason}):`, err.message)
    emitSyncStatus({ configured: true, online: isOnline(), syncing: false, syncedAt: null, pending: null, error: err.message })
  }
}

function startPeriodicPull() {
  if (pullTimer) return
  pullTimer = setInterval(() => {
    if (isOnline()) syncNow('periodic')
  }, PULL_INTERVAL_MS)
}

function stopPeriodicPull() {
  if (pullTimer) { clearInterval(pullTimer); pullTimer = null }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    icon: path.join(__dirname, '../renderer/assets/icon.png'),
    show: false,
  })

  win.once('ready-to-show', () => win.show())
  mainWindow = win
  setMainWindow(win)

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }

  // Once renderer is ready, send current online status immediately
  win.webContents.on('did-finish-load', () => {
    const { url, key } = getSupabaseCreds()
    const pending = url && key
      ? getDb().prepare('SELECT COUNT(*) as c FROM offline_queue').get().c
      : 0
    emitSyncStatus({ configured: !!(url && key), online: isOnline(), syncing: false, syncedAt: null, pending, error: null })
  })
}

app.whenReady().then(async () => {
  initDatabase()
  registerHandlers(ipcMain)
  exportToPdf(ipcMain)
  createWindow()

  const { url, key } = getSupabaseCreds()

  if (url && key) {
    // Startup sync: flush queue first, then pull latest
    emitSyncStatus({ configured: true, online: isOnline(), syncing: true, syncedAt: null, pending: null, error: null })
    await syncNow('startup')
    startPeriodicPull()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// ─── ONLINE / OFFLINE EVENTS ──────────────────────────────────────────────────
// Electron fires these on the app object when the system network state changes.

app.on('child-process-gone', () => {}) // suppress unrelated noise

// Network came back — flush queue and pull to get latest data from other devices
app.on('render-process-gone', () => {})

// Use net module events via a polling check since Electron app doesn't have
// native online/offline events. We poll every 15s to detect state changes.
let _wasOnline = null
setInterval(async () => {
  const { url, key } = getSupabaseCreds()
  if (!url || !key) return

  const nowOnline = isOnline()

  // Transition: offline → online
  if (_wasOnline === false && nowOnline) {
    console.log('[sync] Network restored — syncing...')
    emitSyncStatus({ configured: true, online: true, syncing: true, syncedAt: null, pending: null, error: null })
    await syncNow('reconnect')
    startPeriodicPull()
  }

  // Transition: online → offline
  if (_wasOnline === true && !nowOnline) {
    console.log('[sync] Network lost — going offline')
    stopPeriodicPull()
    const pending = getDb().prepare('SELECT COUNT(*) as c FROM offline_queue').get().c
    emitSyncStatus({ configured: true, online: false, syncing: false, syncedAt: null, pending, error: null })
  }

  _wasOnline = nowOnline
}, 15_000)

app.on('window-all-closed', () => {
  stopPeriodicPull()
  if (process.platform !== 'darwin') app.quit()
})
