/**
 * The employee's AI workspace: a ChatGPT-style assistant on the left-hand history, with the
 * employee's profile, department and assigned features. Everything it can do is decided on the
 * server by the workspace's permissions; this screen only shows what comes back.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Camera, Image as ImageIcon, LogOut, Menu, MessageSquarePlus, Mic, Send, Sparkles, Trash2, X } from 'lucide-react';

import { ApiError } from '@/api/client';
import { workspaceApi, type ChatMessage, type ChatSummary, type WorkspaceMe } from '@/api/workspace';
import { useAuth } from '@/auth/AuthContext';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';

import { CameraCapture } from './CameraCapture';
import { MessageView } from './MessageView';
import { mediaUnavailable, micProblem, recognitionCtor, type Recognition } from './media';
import { ModeSwitch, useRememberServerMode, type WorkspaceMode } from './ModeSwitch';

import '@/styles/workspace.css';

const MAX_FILES = 5;

function suggestionsFor(me: WorkspaceMe): { hint: string; text: string }[] {
  const has = (key: string, action = 'view') => me.features.some((f) => f.key === key && f.actions.includes(action as never));
  const out: { hint: string; text: string }[] = [];
  if (has('invoices')) {
    out.push({ hint: 'Sales', text: "What are today's sales?" }, { hint: 'Invoices', text: 'Show my pending invoices' });
  }
  if (has('invoices', 'create')) out.push({ hint: 'Create', text: 'Create an invoice for a customer' });
  if (has('items')) out.push({ hint: 'Inventory', text: 'Show products with low stock' }, { hint: 'Products', text: 'Find products in the cosmetics category' });
  if (has('items', 'create')) out.push({ hint: 'Photo', text: 'Add this product to my inventory' });
  if (has('purchaseOrders')) out.push({ hint: 'Purchases', text: 'Show purchase orders' });
  if (has('customers')) out.push({ hint: 'Customers', text: 'Find customer ' });
  return out.slice(0, 6);
}

export function WorkspaceApp() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [me, setMe] = useState<WorkspaceMe | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<Recognition | null>(null);
  const SpeechApi = useMemo(() => recognitionCtor(), []);
  const [cameraOpen, setCameraOpen] = useState(false);

  const mode: WorkspaceMode = 'auto';
  useRememberServerMode(me?.modes.current);

  const load = useCallback(async () => {
    try {
      const [profile, list] = await Promise.all([workspaceApi.me(), workspaceApi.chats()]);
      setMe(profile);
      setChats(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not open your workspace');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Manual-only employees (or ones whose Automatic mode was switched off) go to the regular screens.
  useEffect(() => {
    if (me && !me.modes.allowAuto) navigate('/workspace/home', { replace: true });
  }, [me, navigate]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const openChat = useCallback(
    async (id: string | null) => {
      setDrawer(false);
      setChatId(id);
      setMessages([]);
      if (!id) return;
      try {
        setMessages(await workspaceApi.messages(id));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Could not open that chat');
      }
    },
    [toast],
  );

  const removeChat = async (id: string) => {
    try {
      await workspaceApi.deleteChat(id);
      setChats((c) => c.filter((x) => x.id !== id));
      if (id === chatId) await openChat(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete the chat');
    }
  };

  const appendReply = useCallback((reply: ChatMessage) => {
    setMessages((m) => [...m.filter((x) => !x.sending), reply]);
  }, []);

  const send = useCallback(
    async (override?: string) => {
      const body = (override ?? text).trim();
      if ((!body && files.length === 0) || sending) return;
      let id = chatId;
      setSending(true);
      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: body || '(photo)',
        createdAt: new Date().toISOString(),
        meta: {},
        sending: true,
      };
      setMessages((m) => [...m, optimistic]);
      const sentFiles = files;
      setText('');
      setFiles([]);
      try {
        if (!id) {
          const chat = await workspaceApi.newChat();
          id = chat.id;
          setChatId(id);
        }
        const reply = await workspaceApi.send(id, body, sentFiles, mode);
        // Reload so the sent message carries its real id and photo thumbnails.
        const fresh = await workspaceApi.messages(id);
        setMessages(fresh.some((m) => m.id === reply.id) ? fresh : [...fresh, reply]);
        setChats(await workspaceApi.chats());
        void workspaceApi.me().then(setMe).catch(() => undefined);
      } catch (err) {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setText(body);
        setFiles(sentFiles);
        toast.error(err instanceof ApiError ? err.message : 'Could not send that message');
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [chatId, files, mode, sending, text, toast],
  );

  const act = async (actionId: string, confirm: boolean) => {
    setActing(true);
    try {
      const reply = confirm ? await workspaceApi.confirm(actionId) : await workspaceApi.cancel(actionId);
      appendReply(reply);
      if (chatId) setMessages(await workspaceApi.messages(chatId));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work');
      if (chatId) setMessages(await workspaceApi.messages(chatId).catch(() => messages));
    } finally {
      setActing(false);
    }
  };

  const openCamera = () => {
    const why = mediaUnavailable('camera');
    if (why) {
      toast.error(why);
      return;
    }
    setCameraOpen(true);
  };

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const images = Array.from(list).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (images.length < Array.from(list).length) toast.error('Only JPG, PNG or WEBP photos can be attached.');
    setFiles((current) => [...current, ...images].slice(0, MAX_FILES));
    if (fileRef.current) fileRef.current.value = '';
  };

  const toggleVoice = () => {
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const why = mediaUnavailable('mic');
    if (why || !SpeechApi) {
      toast.error(why ?? 'Voice input is not available here.');
      return;
    }
    const recog = new SpeechApi();
    recog.lang = 'en-IN';
    recog.interimResults = false;
    recog.continuous = false;
    recog.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${transcript}`);
    };
    recog.onend = () => setListening(false);
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

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  const lastPendingId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant') return m.meta?.pending_action_id && (m.meta.pending_status === 'ready' || m.meta.pending_status === 'draft') ? m.id : null;
    }
    return null;
  }, [messages]);

  if (user && !user.workspaceEmployee) return <Navigate to="/dashboard" replace />;
  if (loadError) return <ErrorBlock message={loadError} onRetry={() => void load()} />;
  if (!me) return <LoadingBlock label="Opening your workspace…" />;

  const grouped = me.features.reduce<Record<string, typeof me.features>>((acc, f) => {
    (acc[f.group] ||= []).push(f);
    return acc;
  }, {});
  const suggestions = suggestionsFor(me);
  const blocked = !me.ai.enabled;
  const title = chats.find((c) => c.id === chatId)?.title ?? 'New chat';

  return (
    <div className="ws-app">
      {drawer ? <div className="ws-scrim" onClick={() => setDrawer(false)} aria-hidden="true" /> : null}
      <aside className={`ws-side ${drawer ? 'is-open' : ''}`} aria-label="Chats and profile">
        <div className="ws-side-top">
          <div className="ws-brand">
            <span className="ws-logo">
              <Sparkles size={17} />
            </span>
            Rooman Books
          </div>
          <button type="button" className="ws-new" onClick={() => void openChat(null)}>
            <MessageSquarePlus size={17} /> New chat
          </button>
        </div>
        <div className="ws-side-scroll">
          <div className="ws-section">Chats</div>
          {chats.length === 0 ? <div className="ws-feature">No chats yet</div> : null}
          {chats.map((c) => (
            <div key={c.id} className={`ws-chat-item ${c.id === chatId ? 'is-active' : ''}`}>
              <button type="button" className="ws-chat-open" onClick={() => void openChat(c.id)} title={c.title}>
                {c.title}
              </button>
              <button type="button" className="ws-chat-del" aria-label={`Delete chat ${c.title}`} onClick={() => void removeChat(c.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="ws-section">What I can help with</div>
          {Object.entries(grouped).map(([group, list]) => (
            <div key={group}>
              {list.map((f) => (
                <div className="ws-feature" key={f.key}>
                  <span>{f.label}</span>
                  <small>{f.actions.filter((a) => a !== 'view').join(', ') || 'view'}</small>
                </div>
              ))}
            </div>
          ))}
          {me.features.length === 0 ? <div className="ws-feature">Nothing assigned yet</div> : null}
        </div>
        <div className="ws-side-foot">
          <ModeSwitch block mode={mode} allowAuto={me.modes.allowAuto} allowManual={me.modes.allowManual} />
          <div className="ws-profile">
            <span className="ws-avatar">{me.name.slice(0, 1).toUpperCase()}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="ws-profile-name">{me.name}</div>
              <div className="ws-profile-sub">{me.jobTitle || me.organizationName}</div>
            </div>
            <button type="button" className="ws-tool" aria-label="Sign out" title="Sign out" onClick={() => void logout().then(() => navigate('/'))}>
              <LogOut size={17} />
            </button>
          </div>
          <span className="ws-dept" title={me.workspace.description ?? undefined}>
            {me.workspace.department} · {me.workspace.name}
          </span>
        </div>
      </aside>

      <main className="ws-main">
        <div className="ws-topbar">
          <button type="button" className="ws-tool ws-burger" aria-label="Open menu" onClick={() => setDrawer(true)}>
            <Menu size={19} />
          </button>
          <h1>{title}</h1>
          <ModeSwitch mode={mode} allowAuto={me.modes.allowAuto} allowManual={me.modes.allowManual} />
        </div>

        <div className="ws-scroll" ref={scrollRef} aria-live="polite">
          {messages.length === 0 ? (
            <div className="ws-empty">
              <span className="ws-logo" style={{ margin: '0 auto', width: 44, height: 44, borderRadius: 13 }}>
                <Sparkles size={22} />
              </span>
              <h2>Hi {me.name.split(' ')[0]}, what are we doing today?</h2>
              <p>Ask a question, add records, or upload a photo. I only see what your {me.workspace.name} allows.</p>
              <div className="ws-suggest">
                {suggestions.map((s) => (
                  <button key={s.text} type="button" onClick={() => (s.text.endsWith(' ') ? setText(s.text) : void send(s.text))}>
                    <small>{s.hint}</small>
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="ws-thread">
              {messages.map((m) => (
                <MessageView key={m.id} message={m} actionable={m.id === lastPendingId} busy={acting} onConfirm={(id) => void act(id, true)} onCancel={(id) => void act(id, false)} />
              ))}
              {sending ? (
                <div className="ws-msg is-assistant">
                  <span className="ws-msg-avatar" aria-hidden="true">
                    <Sparkles size={16} />
                  </span>
                  <div className="ws-typing" aria-label="Working on it">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="ws-composer-wrap">
          {blocked ? <div className="ws-banner">AI is turned off for your account. Switch to Manual mode to keep working.</div> : me.ai.blockedReason ? <div className="ws-banner">{me.ai.blockedReason}</div> : null}
          <div className="ws-composer">
            {files.length ? (
              <div className="ws-files">
                {files.map((f, i) => (
                  <span className="ws-file" key={`${f.name}-${i}`}>
                    <img className="ws-thumb" style={{ width: 64, height: 64 }} src={previews[i]} alt={f.name} />
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              disabled={blocked}
              placeholder={files.length ? 'Say what to do with the photo, e.g. “Add this product to my inventory”' : 'Message your assistant…'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Message"
              maxLength={2000}
            />
            <div className="ws-composer-row">
              <div style={{ display: 'flex', gap: 2 }}>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                <button type="button" className="ws-tool" aria-label="Take a photo" title={me.photoUpload ? 'Take a photo with the camera' : 'Photos are not part of your workspace'} disabled={blocked || !me.photoUpload || files.length >= MAX_FILES} onClick={openCamera}>
                  <Camera size={19} />
                </button>
                <button type="button" className="ws-tool" aria-label="Choose photos from the gallery" title={me.photoUpload ? 'Choose photos from your gallery' : 'Photos are not part of your workspace'} disabled={blocked || !me.photoUpload || files.length >= MAX_FILES} onClick={() => fileRef.current?.click()}>
                  <ImageIcon size={19} />
                </button>
                <button type="button" className={`ws-tool ${listening ? 'is-live' : ''}`} aria-label={listening ? 'Stop voice input' : 'Voice input'} title={listening ? 'Listening… tap to stop' : 'Speak your message'} disabled={blocked} onClick={toggleVoice}>
                  <Mic size={19} />
                </button>
              </div>
              <button type="button" className="ws-send" aria-label="Send" disabled={blocked || sending || (!text.trim() && files.length === 0)} onClick={() => void send()}>
                <Send size={17} />
              </button>
            </div>
          </div>
          <div className="ws-hint">Quick questions are answered straight from your data. Changes always ask you to confirm first.</div>
        </div>
      </main>
      <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={(f) => addFiles([f])} />
    </div>
  );
}
