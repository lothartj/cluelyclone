import React, { useEffect, useMemo, useRef, useState } from 'react';
import { askOpenRouter, askOpenRouterWithImage } from './lib/api.js';

function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="slider" />
      <span className="toggle-label">{label}</span>
    </label>
  );
}

function Pill({ active, children, onClick }) {
  return (
    <button className={`pill ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default function App() {
  const [listening, setListening] = useState(false);
  const [chatMode, setChatMode] = useState(true);
  const [activeTab, setActiveTab] = useState('chat');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [insights, setInsights] = useState([
    { id: 1, title: 'Meeting introduction', detail: 'Start speaking to see real-time insights...' }
  ]);
  const [messages, setMessages] = useState([]);
  const [transcript, setTranscript] = useState([]);
  const [selecting, setSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState(null);
  const selectionStartRef = useRef(null);
  const overlayRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recognitionRef = useRef(null);
  const chatScrollRef = useRef(null);
  const OVERLAY_MARGIN = 12;

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!listening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this runtime');
      setListening(false);
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      mediaStreamRef.current = stream;
      const rec = new SpeechRecognition();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event) => {
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalText += res[0].transcript + ' ';
          } else {
            interim += res[0].transcript;
          }
        }
        if (interim) {
          setTranscript(prev => [...prev.slice(-100), `(…) ${interim}`]);
        }
        if (finalText.trim()) {
          setTranscript(prev => [...prev.slice(-100), finalText.trim()]);
          setActiveTab('chat');
          handleAsk(finalText.trim());
        }
      };

      rec.onerror = () => {};
      rec.onend = () => {
        if (listening) {
          try { rec.start(); } catch {}
        }
      };

      recognitionRef.current = rec;
      try { rec.start(); } catch {}
    }).catch(() => {
      setListening(false);
    });
  }, [listening]);

  function speak(text) {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      utter.pitch = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch {}
  }

  async function handleAsk(customText) {
    const q = (customText ?? query).trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    const apiKey = import.meta.env.VITE_OPEN_ROUTER_API_KEY || '';
    try {
      if (!apiKey) throw new Error('Missing OpenRouter API key');
      const history = [
        { role: 'system', content: 'You are a concise real-time assistant.' },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: q }
      ];
      setMessages(prev => [...prev, { role: 'user', content: q }]);
      setQuery('');
      const content = await askOpenRouter({ apiKey, messages: history });

      const now = new Date().toLocaleTimeString();
      setInsights(prev => [{ id: Date.now(), title: `AI (${now})`, detail: content }, ...prev]);
      setMessages(prev => [...prev, { role: 'assistant', content }]);
      if (listening) speak(content);
    } catch (e) {
      setError(e.message || 'Failed to ask AI');
    } finally {
      setLoading(false);
    }
  }

  function handleWindow(action) {
    window.cluely?.window?.[action]?.();
  }

  function onOverlayMouseDown(e) {
    if (!selecting) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    selectionStartRef.current = { x, y };
    setSelectionRect({ x, y, w: 0, h: 0 });
  }

  function onOverlayMouseMove(e) {
    if (!selecting || !selectionStartRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    const sx = selectionStartRef.current.x;
    const sy = selectionStartRef.current.y;
    const w = Math.abs(x - sx);
    const h = Math.abs(y - sy);
    const rx = Math.min(x, sx);
    const ry = Math.min(y, sy);
    setSelectionRect({ x: rx, y: ry, w, h });
  }

  async function finishSelectionAndAsk(promptText) {
    try {
      const apiKey = import.meta.env.VITE_OPEN_ROUTER_API_KEY || '';
      if (!apiKey) throw new Error('Missing OpenRouter API key');
      const bounds = await window.cluely?.window?.getBounds?.();
      const shot = await window.cluely?.capture?.screenshotFull?.();
      if (!bounds || !shot || shot.error) throw new Error(shot?.error || 'Capture failed');

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = shot.dataUrl;
      });

      const absX = Math.max(0, Math.floor(bounds.x + OVERLAY_MARGIN + selectionRect.x));
      const absY = Math.max(0, Math.floor(bounds.y + OVERLAY_MARGIN + selectionRect.y));
      const absW = Math.max(1, Math.floor(selectionRect.w));
      const absH = Math.max(1, Math.floor(selectionRect.h));

      const scale = shot.scaleFactor || window.devicePixelRatio || 1;
      const cropX = Math.floor(absX * scale);
      const cropY = Math.floor(absY * scale);
      const cropW = Math.floor(absW * scale);
      const cropH = Math.floor(absH * scale);

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.min(cropW, img.naturalWidth - cropX));
      canvas.height = Math.max(1, Math.min(cropH, img.naturalHeight - cropY));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, cropX, cropY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      const regionDataUrl = canvas.toDataURL('image/png');

      setLoading(true);
      setError('');
      const userPrompt = (promptText || query || 'Explain what you see in this region.').trim();
      setMessages(prev => [...prev, { role: 'user', content: `${userPrompt} [image attached]` }]);
      setQuery('');
      const content = await askOpenRouterWithImage({ apiKey, prompt: userPrompt, imageDataUrl: regionDataUrl });
      const now = new Date().toLocaleTimeString();
      setInsights(prev => [{ id: Date.now(), title: `Visual AI (${now})`, detail: content }, ...prev]);
      setMessages(prev => [...prev, { role: 'assistant', content }]);
      if (listening) speak(content);
    } catch (e) {
      setError(e.message || 'Visual ask failed');
    } finally {
      setSelecting(false);
      setSelectionRect(null);
      setLoading(false);
    }
  }

  function cancelSelection() {
    setSelecting(false);
    setSelectionRect(null);
  }

  function startVisualAsk() {
    setSelecting(true);
    setActiveTab('chat');
    setError('');
  }

  useEffect(() => {
    function onKey(e) {
      if (!selecting) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectionRect && selectionRect.w > 2 && selectionRect.h > 2) finishSelectionAndAsk(query);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, selectionRect, query]);

  return (
    <div className="window">
      <div className="titlebar" style={{ gap: 8 }}>
        <div className="window-controls no-drag">
          <button className="dot red" onClick={() => handleWindow('close')} aria-label="Close" />
          <button className="dot yellow" onClick={() => handleWindow('minimize')} aria-label="Minimize" />
          <button className="dot green" onClick={() => handleWindow('toggleMaximize')} aria-label="Maximize" />
        </div>
        <div className="drag-region" />
        <div className="controls no-drag" style={{ gap: 8 }}>
          <button className="btn" onClick={startVisualAsk} aria-label="Visual Ask" title="Visual Ask">👁️</button>
          <Toggle checked={chatMode} onChange={setChatMode} label={chatMode ? 'Chat' : 'Browse'} />
          <Toggle checked={listening} onChange={setListening} label={listening ? 'Listening' : 'Listen'} />
        </div>
      </div>

      <div className="search">
        <input
          className="search-input"
          placeholder={loading ? 'Asking…' : chatMode ? 'Type to chat' : 'Ask AI about what you see'}
          disabled={loading}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (selecting ? undefined : handleAsk())}
        />
        <button className="btn primary" onClick={() => (selecting ? finishSelectionAndAsk(query) : handleAsk())} disabled={loading}>{loading ? 'Thinking…' : selecting ? 'Ask About Selection' : 'Ask AI'}</button>
      </div>

      {error && <div className="muted" style={{ color: '#fda4af' }}>{error}</div>}

      <div className="tabs">
        <Pill active={activeTab === 'chat'} onClick={() => setActiveTab('chat')}>Chat</Pill>
        <Pill active={activeTab === 'insights'} onClick={() => setActiveTab('insights')}>Insights</Pill>
        <Pill active={activeTab === 'transcript'} onClick={() => setActiveTab('transcript')}>Transcript</Pill>
      </div>

      <div className="main">
        {activeTab === 'chat' && (
          <div className="chat" ref={chatScrollRef}>
            {messages.map((m, i) => (
              <div key={i} className="message-row">
                <div className={`message ${m.role === 'user' ? 'user' : 'assistant'}`}>{m.content}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'insights' && (
          <section className="insights">
            {insights.map(item => (
              <div className="card" key={item.id}>
                <div className="card-title">{item.title}</div>
                <div className="card-body">{item.detail}</div>
              </div>
            ))}
          </section>
        )}

        {activeTab === 'transcript' && (
          <section className="transcript">
            <div className="transcript-title">Transcript</div>
            <div className="transcript-body">
              {transcript.length === 0 ? (
                <div className="muted">Start speaking to see real-time insights...</div>
              ) : (
                transcript.map((line, i) => (
                  <div key={i} className="line">{line}</div>
                ))
              )}
            </div>
          </section>
        )}
      </div>

      <div className="footer">
        <div className="muted">Invisible to screen share and recordings.</div>
        <div className="kbd">Ctrl/⌘ + Shift + Space</div>
      </div>

      {selecting && (
        <div
          ref={overlayRef}
          className="selection-overlay no-drag"
          onMouseDown={onOverlayMouseDown}
          onMouseMove={onOverlayMouseMove}
          onMouseUp={() => { if (selectionRect && selectionRect.w > 2 && selectionRect.h > 2) { /* keep selection */ } else { cancelSelection(); } }}
          onDoubleClick={() => { if (selectionRect) finishSelectionAndAsk(query); }}
        >
          {selectionRect && (
            <div
              className="selection-rect"
              style={{ left: selectionRect.x, top: selectionRect.y, width: selectionRect.w, height: selectionRect.h }}
            />
          )}
          <div className="selection-hint">Drag to select. Double-click to ask. Esc to cancel.</div>
        </div>
      )}
    </div>
  );
} 