const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })
const { initDatabase } = require('../database/db')
const { registerHandlers, setMainWindow } = require('./ipcHandlers')
const { exportToPdf } = require('./pdfExport')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

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
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initDatabase()
  registerHandlers(ipcMain)
  exportToPdf(ipcMain)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
