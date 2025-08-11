import React, { useEffect, useMemo, useRef, useState } from 'react';
import { askOpenRouter } from './lib/api.js';

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
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'insights' | 'transcript'
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [insights, setInsights] = useState([
    { id: 1, title: 'Meeting introduction', detail: 'Start speaking to see real-time insights...' }
  ]);
  const [messages, setMessages] = useState([]);
  const [transcript, setTranscript] = useState([]);
  const mediaStreamRef = useRef(null);
  const recognitionRef = useRef(null);
  const chatScrollRef = useRef(null);

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

  return (
    <div className="window">
      <div className="titlebar" style={{ gap: 8 }}>
        <div className="window-controls no-drag">
          <button className="dot red" onClick={() => handleWindow('close')} aria-label="Close" />
          <button className="dot yellow" onClick={() => handleWindow('minimize')} aria-label="Minimize" />
          <button className="dot green" onClick={() => handleWindow('toggleMaximize')} aria-label="Maximize" />
        </div>
        <div className="drag-region" />
        <div className="controls no-drag">
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
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
        />
        <button className="btn primary" onClick={() => handleAsk()} disabled={loading}>{loading ? 'Thinking…' : 'Ask AI'}</button>
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
    </div>
  );
} 