const { safeStorage, app } = require('electron')
const path = require('path')
const fs = require('fs')

function sessionFilePath() {
  return path.join(app.getPath('userData'), 'session.enc')
}

function saveSession(sessionData) {
  if (!safeStorage.isEncryptionAvailable()) return
  const json = JSON.stringify(sessionData)
  const encrypted = safeStorage.encryptString(json)
  fs.writeFileSync(sessionFilePath(), encrypted)
}

function loadSession() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const file = sessionFilePath()
    if (!fs.existsSync(file)) return null
    const encrypted = fs.readFileSync(file)
    const json = safeStorage.decryptString(Buffer.from(encrypted))
    return JSON.parse(json)
  } catch {
    return null
  }
}

function clearSession() {
  try { fs.unlinkSync(sessionFilePath()) } catch {}
}

module.exports = { saveSession, loadSession, clearSession }
