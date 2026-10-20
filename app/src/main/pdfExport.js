const { BrowserWindow, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')

async function exportToPdf(ipcMain) {
  ipcMain.handle('pdf:export', async (_, { html, filename }) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save PDF Report',
      defaultPath: path.join(require('os').homedir(), 'Desktop', filename),
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    })

    if (canceled || !filePath) return { success: false }

    const win = new BrowserWindow({
      show: false,
      webPreferences: { javascript: true },
    })

    const encoded = Buffer.from(html).toString('base64')
    await win.loadURL(`data:text/html;base64,${encoded}`)

    await new Promise(r => setTimeout(r, 800))

    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      marginsType: 1,
    })

    win.destroy()
    fs.writeFileSync(filePath, pdfBuffer)
    shell.openPath(filePath)

    return { success: true, filePath }
  })
}

module.exports = { exportToPdf }
