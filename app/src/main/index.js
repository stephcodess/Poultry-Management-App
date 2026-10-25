const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
// In dev: __dirname is src/main, .env is two levels up (app root)
// When packaged: extraFiles places .env next to the exe; process.execPath gives its location
require('dotenv').config({
  path: app.isPackaged
    ? path.join(path.dirname(process.execPath), '.env')
    : path.join(__dirname, '../../.env'),
})
const { initDatabase } = require('../database/db')
const { registerHandlers, setMainWindow } = require('./ipcHandlers')
const { exportToPdf } = require('./pdfExport')

const isDev = !app.isPackaged

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
  setMainWindow(win)

  if (isDev) {
    win.loadURL('http://localhost:5173')
    // win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  initDatabase()
  registerHandlers(ipcMain)
  exportToPdf(ipcMain)
  createWindow()

  // Pull latest data from Supabase in the background after window loads
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY
  if (supabaseUrl && supabaseKey) {
    const { pullFromSupabase, flushOfflineQueue } = require('./supabaseSync')
    const { getDb } = require('../database/db')
    try {
      // Flush any queued offline writes first, then pull latest state
      await flushOfflineQueue(getDb(), supabaseUrl, supabaseKey)
      await pullFromSupabase(getDb(), supabaseUrl, supabaseKey)
    } catch (err) {
      console.warn('[startup] Supabase sync skipped (offline?):', err.message)
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
