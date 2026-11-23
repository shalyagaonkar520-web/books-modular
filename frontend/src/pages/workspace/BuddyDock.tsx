/** Buddy: the helper right below the sidebar's features. Tell him a job in plain words; he does it, asking only when something is missing. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Camera, Image as ImageIcon, Mic, RotateCcw, Send, Volume2, VolumeX, X } from 'lucide-react';

import { ApiError } from '@/api/client';
import { buddyApi, type ChatMessage } from '@/api/workspace';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';

import { CameraCapture } from './CameraCapture';
import { MessageView } from './MessageView';
import { mediaUnavailable, micProblem, recognitionCtor, type Recognition } from './media';

import '@/styles/workspace.css';

const VOICE_KEY = 'rooman.buddy.speak';

/** Plain spoken text: drops bullets, asterisks and the symbols a voice would read out loud. */
function speakable(text: string): string {
  return text.replace(/\*\*/g, '').replace(/[\u2022\u2014]/g, ',').replace(/\s*\n+\s*/g, '. ').slice(0, 400);
}

export function BuddyDock() {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [greeting, setGreeting] = useState('Hii boss! What do you wanna do today?');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recogRef = useRef<Recognition | null>(null);
  const RecogApi = useMemo(() => recognitionCtor(), []);
  const [listening, setListening] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [speak, setSpeak] = useState(() => {
    try {
      return window.localStorage.getItem(VOICE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Employees of an AI workspace and the portal-only role have their own screens.
  const eligible = !!user && user.role !== 'employee' && !user.workspaceEmployee;

  const load = useCallback(async () => {
    try {
      const state = await buddyApi.state();
      setGreeting(state.greeting);
      setMessages(state.messages);
      setLoaded(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Buddy could not start');
    }
  }, [toast]);

  useEffect(() => {
    if (open && eligible && !loaded) void load();
  }, [open, eligible, loaded, load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const say = useCallback(
    (reply: string) => {
      if (!speak || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(speakable(reply));
      utterance.lang = 'en-IN';
      window.speechSynthesis.speak(utterance);
    },
    [speak],
  );

  const toggleSpeak = () => {
    setSpeak((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(VOICE_KEY, next ? '1' : '0');
      } catch {
        /* private mode */
      }
      if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      return next;
    });
  };

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const images = Array.from(list).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (images.length < Array.from(list).length) toast.error('Only JPG, PNG or WEBP photos can be attached.');
    setFiles((current) => [...current, ...images].slice(0, 5));
    if (fileRef.current) fileRef.current.value = '';
  };

  const openCamera = () => {
    const why = mediaUnavailable('camera');
    if (why) {
      toast.error(why);
      return;
    }
    setCameraOpen(true);
  };

  const send = async (override?: string) => {
    const body = (override ?? text).trim();
    const sentFiles = files;
    if ((!body && sentFiles.length === 0) || sending) return;
    setSending(true);
    setText('');
    setFiles([]);
    const local: ChatMessage = { id: `local-${Date.now()}`, role: 'user', content: body || '(photo)', createdAt: new Date().toISOString(), meta: {}, sending: true };
    setMessages((m) => [...m, local]);
    try {
      const reply = sentFiles.length ? await buddyApi.sendPhotos(body, sentFiles) : await buddyApi.send(body);
      setMessages((await buddyApi.state()).messages);
      say(reply.content);
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== local.id));
      setText(body);
      setFiles(sentFiles);
      toast.error(err instanceof ApiError ? err.message : 'Buddy could not do that');
    } finally {
      setSending(false);
    }
  };

  const act = async (id: string, confirm: boolean) => {
    setActing(true);
    try {
      await (confirm ? buddyApi.confirm(id) : buddyApi.cancel(id));
      setMessages((await buddyApi.state()).messages);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work');
      void load();
    } finally {
      setActing(false);
    }
  };

  const talk = () => {
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const why = mediaUnavailable('mic');
    if (why || !RecogApi) {
      toast.error(why ?? 'Voice input is not available here.');
      return;
    }
    window.speechSynthesis?.cancel();
    const recog = new RecogApi();
    recog.lang = 'en-IN';
    recog.interimResults = false;
    recog.continuous = false;
    let heard = '';
    recog.onresult = (event) => {
      heard = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      setText(heard);
    };
    // Speaking is a message: once you stop talking it is sent.
    recog.onend = () => {
      setListening(false);
      if (heard) void send(heard);
    };
    recog.onerror = (event) => {
      setListening(false);
      const message = micProblem(event?.error);
      if (message) toast.error(message);
    };
    recogRef.current = recog;
    setListening(true);
    try {
      recog.start();
    } catch {
      setListening(false);
      toast.error(micProblem());
    }
  };
  useEffect(() => () => recogRef.current?.stop(), []);

  const reset = async () => {
    await buddyApi.reset().catch(() => undefined);
    setMessages([]);
  };

  const lastPending = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant') return m.meta?.pending_action_id && (m.meta.pending_status === 'ready' || m.meta.pending_status === 'draft') ? m.id : null;
    }
    return null;
  }, [messages]);

  if (!eligible) return null;

  return (
    <>
      {open ? null : (
      <button type="button" className="buddy-launch" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="buddy-panel">
        <span className="buddy-face" aria-hidden="true">
          <Bot size={18} />
        </span>
        <span className="buddy-launch-text">
          <strong>Buddy</strong>
          <small>Hii boss, need anything?</small>
        </span>
      </button>
      )}

      {open ? (
        <section id="buddy-panel" className="buddy-panel" role="dialog" aria-label="Buddy, your helper">
          <header className="buddy-head">
            <span className="buddy-face" aria-hidden="true">
              <Bot size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>Buddy</strong>
              <div className="buddy-sub">Tell me the job, I'll do it</div>
            </div>
            <button type="button" className="ws-tool" aria-label={speak ? 'Turn off Buddy speaking' : 'Let Buddy speak his answers'} title={speak ? 'Buddy speaks: on' : 'Buddy speaks: off'} aria-pressed={speak} onClick={toggleSpeak}>
              {speak ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button type="button" className="ws-tool" aria-label="Start a fresh chat" title="Start fresh" onClick={() => void reset()}>
              <RotateCcw size={16} />
            </button>
            <button type="button" className="ws-tool" aria-label="Close Buddy" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </header>
          <div className="buddy-scroll" ref={scrollRef} aria-live="polite">
            <div className="ws-thread buddy-thread">
              {messages.length === 0 ? (
                <MessageView message={{ id: 'greet', role: 'assistant', content: greeting, createdAt: '', meta: {} }} actionable={false} busy={false} onConfirm={() => undefined} onCancel={() => undefined} />
              ) : null}
              {messages.map((m) => (
                <MessageView key={m.id} message={m} actionable={m.id === lastPending} busy={acting} onConfirm={(id) => void act(id, true)} onCancel={(id) => void act(id, false)} />
              ))}
              {sending ? (
                <div className="ws-typing" aria-label="Buddy is working">
                  <i />
                  <i />
                  <i />
                </div>
              ) : null}
            </div>
          </div>
          {files.length ? (
            <div className="ws-files buddy-files">
              {files.map((f, i) => (
                <span className="ws-file" key={`${f.name}-${i}`}>
                  <img className="ws-thumb" style={{ width: 56, height: 56 }} src={previews[i]} alt={f.name} />
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="buddy-compose">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <button type="button" className="ws-tool" aria-label="Take a photo" title="Take a photo with the camera" onClick={openCamera}>
              <Camera size={18} />
            </button>
            <button type="button" className="ws-tool" aria-label="Choose a photo from the gallery" title="Choose a photo" onClick={() => fileRef.current?.click()}>
              <ImageIcon size={18} />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              maxLength={2000}
              aria-label="Tell Buddy what to do"
              placeholder={listening ? 'Listening...' : files.length ? 'Say what to do with the photo' : 'Type, tap the mic, or send a photo'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button type="button" className={`ws-tool ${listening ? 'is-live' : ''}`} aria-label={listening ? 'Stop listening' : 'Talk to Buddy'} title={listening ? 'Listening... just speak, then pause' : 'Talk to Buddy'} onClick={talk}>
              <Mic size={18} />
            </button>
            <button type="button" className="ws-send" aria-label="Send" disabled={(!text.trim() && files.length === 0) || sending} onClick={() => void send()}>
              <Send size={16} />
            </button>
          </div>
          <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={(f) => addFiles([f])} />
        </section>
      ) : null}
    </>
  );
}
