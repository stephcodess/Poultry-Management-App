import React, { useState, useRef, useEffect } from 'react'
import styles from './AIChat.module.css'

const SUGGESTIONS = [
  'Which month was most profitable?',
  'Compare production across all months',
  'Which flock has performed best overall?',
  'What are my biggest expense categories?',
  'Show me revenue trends over time',
  'How has mortality changed month to month?',
]

function inlineFormat(text) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*'))   return <em key={i}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`'))   return <code key={i} style={{ background: 'rgba(0,0,0,0.07)', borderRadius: 3, padding: '1px 4px', fontSize: '0.9em' }}>{part.slice(1, -1)}</code>
    return part
  })
}

function renderMarkdown(text) {
  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trim()

    // Blank line / horizontal rule
    if (line === '' || /^[-_*]{3,}$/.test(line)) {
      i++
      continue
    }

    // Headings: ###, ##, #
    if (/^#{1,3} /.test(line)) {
      const content = line.replace(/^#{1,3} /, '')
      elements.push(
        <p key={i} style={{ margin: '6px 0 2px', fontWeight: 700, fontSize: '0.95em' }}>
          {inlineFormat(content)}
        </p>
      )
      i++
      continue
    }

    // Bullet list: - or *
    if (/^[-*] /.test(line)) {
      const items = []
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*] /, ''))
        i++
      }
      elements.push(
        <ul key={i} style={{ margin: '4px 0', paddingLeft: 18 }}>
          {items.map((item, j) => <li key={j} style={{ margin: '2px 0' }}>{inlineFormat(item)}</li>)}
        </ul>
      )
      continue
    }

    // Numbered list: 1. 2. etc
    if (/^\d+\. /.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\. /, ''))
        i++
      }
      elements.push(
        <ol key={i} style={{ margin: '4px 0', paddingLeft: 18 }}>
          {items.map((item, j) => <li key={j} style={{ margin: '2px 0' }}>{inlineFormat(item)}</li>)}
        </ol>
      )
      continue
    }

    // Table: lines starting with |
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i].trim()
        // Skip separator rows like |---|---|
        if (!/^\|[\s\-:|]+\|$/.test(row)) {
          const cells = row.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
          rows.push(cells)
        }
        i++
      }
      if (rows.length > 0) {
        elements.push(
          <table key={i} className={styles.mdTable}>
            <thead>
              <tr>{rows[0].map((cell, j) => <th key={j}>{inlineFormat(cell)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, j) => (
                <tr key={j}>{row.map((cell, k) => <td key={k}>{inlineFormat(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        )
      }
      continue
    }

    // Regular paragraph
    elements.push(<p key={i} style={{ margin: '3px 0' }}>{inlineFormat(line)}</p>)
    i++
  }

  return elements
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`${styles.message} ${isUser ? styles.userMessage : styles.aiMessage}`}>
      {!isUser && <div className={styles.aiAvatar}>🤖</div>}
      <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.aiBubble}`}>
        {isUser
          ? msg.content
          : msg.loading
            ? <span className={styles.typingDots}><span /><span /><span /></span>
            : renderMarkdown(msg.content)
        }
      </div>
      {isUser && <div className={styles.userAvatar}>You</div>}
    </div>
  )
}

export default function AIChat() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('ai_chat_history')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasKey, setHasKey] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    window.api.settings.get().then(s => {
      setHasKey(!!(s.gemini_api_key && s.gemini_api_key.trim()))
    })
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    const toSave = messages.filter(m => !m.loading)
    try { localStorage.setItem('ai_chat_history', JSON.stringify(toSave)) } catch {}
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text) {
    const userText = (text || input).trim()
    if (!userText || loading) return

    setInput('')
    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '', loading: true }])

    const result = await window.api.ai.chat({ messages: newMessages })

    setMessages(prev => {
      const without = prev.filter(m => !m.loading)
      if (result.error) {
        return [...without, { role: 'assistant', content: result.message || 'Something went wrong. Please try again.' }]
      }
      return [...without, { role: 'assistant', content: result.reply }]
    })
    setLoading(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        className={`${styles.fab} ${open ? styles.fabOpen : ''}`}
        onClick={() => setOpen(o => !o)}
        title="AI Farm Assistant"
      >
        <span className={styles.fabIcon}>{open ? '✕' : '🤖'}</span>
        {!open && messages.length === 0 && (
          <span className={styles.fabPulse} />
        )}
      </button>

      {/* Chat panel */}
      <div className={`${styles.panel} ${open ? styles.panelOpen : ''} ${expanded ? styles.panelExpanded : ''}`}>
        <div className={styles.panelHeader}>
          <div className={styles.panelHeaderLeft}>
            <span className={styles.panelHeaderIcon}>🤖</span>
            <div>
              <div className={styles.panelTitle}>AI Farm Assistant</div>
              <div className={styles.panelSub}>Ask anything — any month or all-time</div>
            </div>
          </div>
          <div className={styles.panelHeaderActions}>
            {messages.length > 0 && (
              <button className={styles.clearBtn} onClick={() => { setMessages([]); localStorage.removeItem('ai_chat_history') }}>Clear</button>
            )}
            <button className={styles.expandBtn} onClick={() => setExpanded(e => !e)} title={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? '⊡' : '⊞'}
            </button>
            <button className={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
          </div>
        </div>

        {!hasKey && (
          <div className={styles.noKeyBanner}>
            ⚠️ No API key. Go to <strong>Settings → AI Assistant</strong> to add your free Gemini key.
          </div>
        )}

        <div className={styles.chatArea}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>💬</div>
              <div className={styles.emptyTitle}>How can I help?</div>
              <div className={styles.emptySubtitle}>I have access to all your farm records.</div>
              <div className={styles.suggestions}>
                {SUGGESTIONS.map(s => (
                  <button key={s} className={styles.suggestionBtn} onClick={() => sendMessage(s)} disabled={!hasKey}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.messages}>
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className={styles.inputArea}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasKey ? 'Ask about your farm...' : 'Add your API key in Settings first'}
            disabled={!hasKey || loading}
            rows={1}
          />
          <button
            className={styles.sendBtn}
            onClick={() => sendMessage()}
            disabled={!hasKey || loading || !input.trim()}
          >
            {loading ? '…' : '➤'}
          </button>
        </div>
      </div>
    </>
  )
}
