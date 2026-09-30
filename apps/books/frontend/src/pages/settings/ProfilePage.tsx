import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Crop,
  Download,
  FileCheck,
  Image as ImageIcon,
  KeyRound,
  Laptop,
  Lock,
  Mail,
  Moon,
  Palette,
  Phone,
  RotateCw,
  RotateCcw,
  Shield,
  Sun,
  Trash2,
  User as UserIcon,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { authApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import type { Session } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { formatDateTime, initials } from '@/utils/format';

import { PASSWORD_HINT_KEY, validatePassword } from './passwordRules';
import './ProfilePage.css';

type ActiveTab = 'personal' | 'security' | 'groups' | 'sessions' | 'notifications' | 'preferences' | 'terms';
type ThemeMode = 'light' | 'dark' | 'luxury';
type PhotoModalMode = 'select' | 'camera' | 'crop';

interface ExtraProfileData {
  displayName: string;
  phone: string;
  gender: string;
  country: string;
  state: string;
  language: string;
  timezone: string;
}

const DEFAULT_PROFILE_EXTRAS: ExtraProfileData = {
  displayName: '',
  phone: '',
  gender: "I'd prefer not to say",
  country: 'India',
  state: 'Karnataka',
  language: 'English',
  timezone: '(GMT +05:30) India Standard Time (Asia/Kolkata)',
};

export function ProfilePage() {
  const { t } = useAppContent();
  const toast = useToast();
  const { user, organization, updateUser } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('personal');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('rooman_theme_mode') as ThemeMode) || 'light';
  });

  // Profile data
  const [name, setName] = useState(user?.name ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const [extras, setExtras] = useState<ExtraProfileData>(() => {
    if (!user?.id) return DEFAULT_PROFILE_EXTRAS;
    try {
      const stored = localStorage.getItem(`rooman_profile_extras_${user.id}`);
      return stored ? { ...DEFAULT_PROFILE_EXTRAS, ...JSON.parse(stored) } : { ...DEFAULT_PROFILE_EXTRAS, displayName: user?.name ?? '' };
    } catch {
      return { ...DEFAULT_PROFILE_EXTRAS, displayName: user?.name ?? '' };
    }
  });

  // Avatar & Crop state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (!user?.id) return null;
    return localStorage.getItem(`rooman_avatar_${user.id}`) || null;
  });
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<PhotoModalMode>('select');
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  // Crop transformations
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Camera & DOM references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordProblem, setPasswordProblem] = useState<string | null>(null);

  // Notification preferences
  const [notifications, setNotifications] = useState({
    loginAlerts: true,
    thirdPartyAlerts: true,
    weeklyReport: true,
    invoiceAlerts: true,
  });

  const profileSubmit = useSubmit();
  const passwordSubmit = useSubmit();
  const revokeSubmit = useSubmit();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const { data: sessionsData, loading: sessionsLoading, error: sessionsError, reload: reloadSessions } = useAsync(
    (signal) => authApi.sessions(signal),
    [],
  );
  const sessions: Session[] = sessionsData ?? [];

  useEffect(() => {
    if (user?.name && !extras.displayName) {
      setExtras((prev) => ({ ...prev, displayName: user.name }));
    }
  }, [user?.name, extras.displayName]);

  // Handle Theme Change
  const applyTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    localStorage.setItem('rooman_theme_mode', mode);
  };

  // Avatar handling
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith('image/')) {
      toast.error(t('settings.profile.toast.invalidImage'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCropImageSrc(dataUrl);
      setZoom(1.0);
      setPan({ x: 0, y: 0 });
      setRotation(0);
      setModalMode('crop');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 } });
      streamRef.current = stream;
      setModalMode('camera');
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      toast.error(t('settings.profile.toast.cameraUnavailable'));
      setModalMode('select');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      stopCamera();
      setCropImageSrc(dataUrl);
      setZoom(1.0);
      setPan({ x: 0, y: 0 });
      setRotation(0);
      setModalMode('crop');
    }
  };

  // Crop & Adjustment logic
  const handleCropMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleCropMouseUp = () => {
    setIsDragging(false);
  };

  const handleCropTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      const touch = e.touches[0];
      dragStartRef.current = { x: touch.clientX - pan.x, y: touch.clientY - pan.y };
    }
  };

  const handleCropTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPan({
      x: touch.clientX - dragStartRef.current.x,
      y: touch.clientY - dragStartRef.current.y,
    });
  };

  const applyCrop = () => {
    if (!cropImageSrc || !cropImageRef.current || !user?.id) return;
    const img = cropImageRef.current;
    const canvas = document.createElement('canvas');
    const OUTPUT_SIZE = 320;
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const STAGE_SIZE = 280;
    const CROP_DIAMETER = 220;
    const scaleFactor = OUTPUT_SIZE / CROP_DIAMETER;

    ctx.save();
    ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    const baseScale = Math.max(STAGE_SIZE / img.naturalWidth, STAGE_SIZE / img.naturalHeight);
    const renderWidth = img.naturalWidth * baseScale * zoom * scaleFactor;
    const renderHeight = img.naturalHeight * baseScale * zoom * scaleFactor;

    ctx.drawImage(
      img,
      -renderWidth / 2 + pan.x * scaleFactor,
      -renderHeight / 2 + pan.y * scaleFactor,
      renderWidth,
      renderHeight
    );
    ctx.restore();

    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setAvatarUrl(croppedDataUrl);
    localStorage.setItem(`rooman_avatar_${user.id}`, croppedDataUrl);
    window.dispatchEvent(new Event('rooman_avatar_updated'));
    closeModal();
    toast.success(t('settings.profile.toast.photoSaved'));
  };

  const removeAvatar = () => {
    if (!user?.id) return;
    setAvatarUrl(null);
    localStorage.removeItem(`rooman_avatar_${user.id}`);
    window.dispatchEvent(new Event('rooman_avatar_updated'));
    closeModal();
    toast.success(t('settings.profile.toast.photoRemoved'));
  };

  const closeModal = () => {
    stopCamera();
    setCropImageSrc(null);
    setModalMode('select');
    setPhotoModalOpen(false);
  };

  // Save profile information
  const saveProfile = async () => {
    if (!user) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      toast.error(t('settings.profile.toast.nameTooShort'));
      return;
    }

    const updated = await profileSubmit.run(() => authApi.updateProfile({ name: trimmedName }));
    if (updated) {
      updateUser(updated);
      try {
        localStorage.setItem(`rooman_profile_extras_${user.id}`, JSON.stringify(extras));
      } catch {
        // ignore storage quota
      }
      setIsEditing(false);
      toast.success(t('settings.profile.toast.profileSaved'));
    }
  };

  // Sign a device out remotely
  const revokeDevice = async (session: Session) => {
    setRevokingId(session.id);
    const result = await revokeSubmit.run(() => authApi.revokeSession(session.id));
    setRevokingId(null);
    if (result) {
      toast.success(t('settings.profile.toast.signedOut', { device: session.device, browser: session.browser }));
      reloadSessions();
    } else if (revokeSubmit.errorRef.current) {
      toast.error(revokeSubmit.errorRef.current);
    }
  };

  // Change password
  const changePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      setPasswordProblem(t('settings.profile.security.mismatch'));
      return;
    }
    const problem = validatePassword(newPassword, t);
    if (problem) {
      setPasswordProblem(problem);
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordProblem(t('settings.profile.security.samePassword'));
      return;
    }
    setPasswordProblem(null);
    const result = await passwordSubmit.run(() => authApi.changePassword({ currentPassword, newPassword }));
    if (result) {
      toast.success(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    }
  };

  // Export Account Data
  const exportAccountData = () => {
    const backupData = {
      user: {
        id: user?.id,
        name: user?.name,
        email: user?.email,
        role: user?.role,
        lastLoginAt: user?.lastLoginAt,
      },
      organization: {
        id: organization?.id,
        name: organization?.name,
        gstin: organization?.gstin,
      },
      profileExtras: extras,
      exportTimestamp: new Date().toISOString(),
      generator: 'Rooman Books Zoho-Grade Account Vault',
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rooman_account_backup_${user?.email ?? 'user'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t('settings.profile.toast.exported'));
  };

  if (!user) return null;

  return (
    <div className={`zoho-profile-container theme-${themeMode}`}>
      {/* Left Sidebar Navigation */}
      <aside className="zp-sidebar">
        <div className="zp-sidebar-header">
          <span className="zp-brand-badge">R</span>
          <span className="zp-sidebar-title">{t('settings.profile.sidebar.title')}</span>
        </div>

        <ul className="zp-nav">
          <li>
            <button
              type="button"
              className={`zp-nav-btn ${activeTab === 'personal' ? 'active' : ''}`}
              onClick={() => setActiveTab('personal')}
            >
              <UserIcon size={16} />
              <span>{t('settings.profile.tab.personal')}</span>
              {activeTab === 'personal' && <span className="zp-nav-indicator" />}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`zp-nav-btn ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              <Shield size={16} />
              <span>{t('settings.profile.tab.security')}</span>
              {activeTab === 'security' && <span className="zp-nav-indicator" />}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`zp-nav-btn ${activeTab === 'groups' ? 'active' : ''}`}
              onClick={() => setActiveTab('groups')}
            >
              <Users size={16} />
              <span>{t('settings.profile.tab.groups')}</span>
              {activeTab === 'groups' && <span className="zp-nav-indicator" />}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`zp-nav-btn ${activeTab === 'sessions' ? 'active' : ''}`}
              onClick={() => setActiveTab('sessions')}
            >
              <Laptop size={16} />
              <span>{t('settings.profile.tab.sessions')}</span>
              {activeTab === 'sessions' && <span className="zp-nav-indicator" />}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`zp-nav-btn ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => setActiveTab('notifications')}
            >
              <Bell size={16} />
              <span>{t('settings.profile.tab.notifications')}</span>
              {activeTab === 'notifications' && <span className="zp-nav-indicator" />}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`zp-nav-btn ${activeTab === 'preferences' ? 'active' : ''}`}
              onClick={() => setActiveTab('preferences')}
            >
              <Palette size={16} />
              <span>{t('settings.profile.tab.preferences')}</span>
              {activeTab === 'preferences' && <span className="zp-nav-indicator" />}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`zp-nav-btn ${activeTab === 'terms' ? 'active' : ''}`}
              onClick={() => setActiveTab('terms')}
            >
              <FileCheck size={16} />
              <span>{t('settings.profile.tab.terms')}</span>
              {activeTab === 'terms' && <span className="zp-nav-indicator" />}
            </button>
          </li>
        </ul>

        <div className="zp-sidebar-footer">
          <div style={{ fontSize: '11px', color: 'var(--zp-sidebar-text)', marginBottom: '8px', fontWeight: 500 }}>
            {t('settings.profile.quickTheme')}
          </div>
          <div className="zp-sidebar-theme-toggles">
            <button
              type="button"
              className={`zp-theme-btn ${themeMode === 'light' ? 'active' : ''}`}
              onClick={() => applyTheme('light')}
            >
              <Sun size={12} /> {t('settings.profile.quickTheme.light')}
            </button>
            <button
              type="button"
              className={`zp-theme-btn ${themeMode === 'dark' ? 'active' : ''}`}
              onClick={() => applyTheme('dark')}
            >
              <Moon size={12} /> {t('settings.profile.quickTheme.dark')}
            </button>
            <button
              type="button"
              className={`zp-theme-btn ${themeMode === 'luxury' ? 'active' : ''}`}
              onClick={() => applyTheme('luxury')}
            >
              <Palette size={12} /> {t('settings.profile.quickTheme.gold')}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="zp-main">
        {/* TAB 1: Personal Information */}
        {activeTab === 'personal' && (
          <div>
            <h1 className="zp-page-title">{t('settings.profile.tab.personal')}</h1>

            {/* Profile Overview Card */}
            <div className="zp-card">
              <div className="zp-profile-header">
                <div className="zp-avatar-section">
                  <div className="zp-avatar-wrapper">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={user.name} className="zp-avatar-img" />
                    ) : (
                      <div className="zp-avatar-initials">{initials(user.name)}</div>
                    )}
                    <button
                      type="button"
                      className="zp-avatar-edit-badge"
                      title={t('settings.profile.photo.update')}
                      onClick={() => {
                        setModalMode('select');
                        setPhotoModalOpen(true);
                      }}
                    >
                      <Camera size={13} />
                    </button>
                  </div>
                  <div className="zp-user-summary">
                    <h2>{name || user.name}</h2>
                    <p>{user.email}</p>
                    <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      {t('settings.profile.organizationLabel')} <strong>{organization?.name ?? t('settings.profile.orgFallback')}</strong>
                    </span>
                  </div>
                </div>

                <div>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="zp-cancel-btn" onClick={() => setIsEditing(false)}>
                        {t('common.cancel')}
                      </button>
                      <button type="button" className="zp-edit-btn" onClick={saveProfile} disabled={profileSubmit.submitting}>
                        <Check size={14} /> {t('settings.profile.save')}
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="zp-edit-btn" onClick={() => setIsEditing(true)}>
                      {t('settings.profile.editProfile')}
                    </button>
                  )}
                </div>
              </div>

              <FormError message={profileSubmit.error} />

              <div className="zp-info-grid">
                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.field.fullName')}</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="zp-field-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('settings.profile.field.fullNamePlaceholder')}
                    />
                  ) : (
                    <span className="zp-field-value">{name || user.name}</span>
                  )}
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.field.displayName')}</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="zp-field-input"
                      value={extras.displayName}
                      onChange={(e) => setExtras({ ...extras, displayName: e.target.value })}
                      placeholder={t('settings.profile.field.displayNamePlaceholder')}
                    />
                  ) : (
                    <span className="zp-field-value">{extras.displayName || user.name}</span>
                  )}
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.field.gender')}</span>
                  {isEditing ? (
                    <select
                      className="zp-field-input"
                      value={extras.gender}
                      onChange={(e) => setExtras({ ...extras, gender: e.target.value })}
                    >
                      <option value="I'd prefer not to say">{t('settings.profile.gender.unspecified')}</option>
                      <option value="Female">{t('settings.profile.gender.female')}</option>
                      <option value="Male">{t('settings.profile.gender.male')}</option>
                      <option value="Other">{t('settings.profile.gender.other')}</option>
                    </select>
                  ) : (
                    <span className="zp-field-value">{extras.gender}</span>
                  )}
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.field.country')}</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="zp-field-input"
                      value={extras.country}
                      onChange={(e) => setExtras({ ...extras, country: e.target.value })}
                    />
                  ) : (
                    <span className="zp-field-value">🇮🇳 {extras.country}</span>
                  )}
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.field.state')}</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="zp-field-input"
                      value={extras.state}
                      onChange={(e) => setExtras({ ...extras, state: e.target.value })}
                    />
                  ) : (
                    <span className="zp-field-value">{extras.state}</span>
                  )}
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.field.language')}</span>
                  {isEditing ? (
                    <select
                      className="zp-field-input"
                      value={extras.language}
                      onChange={(e) => setExtras({ ...extras, language: e.target.value })}
                    >
                      <option value="English">{t('settings.profile.language.english')}</option>
                      <option value="Hindi">{t('settings.profile.language.hindi')}</option>
                      <option value="Kannada">{t('settings.profile.language.kannada')}</option>
                      <option value="Tamil">{t('settings.profile.language.tamil')}</option>
                    </select>
                  ) : (
                    <span className="zp-field-value">{extras.language}</span>
                  )}
                </div>

                <div className="zp-field-block" style={{ gridColumn: 'span 2' }}>
                  <span className="zp-field-label">{t('settings.profile.field.timezone')}</span>
                  <span className="zp-field-value">{extras.timezone}</span>
                </div>
              </div>
            </div>

            {/* Email Addresses Card */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.email.title')}</h3>
                  <p className="zp-card-subtitle">
                    {t('settings.profile.email.subtitle')}
                  </p>
                </div>
              </div>

              <div className="zp-list-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Mail size={18} style={{ color: 'var(--zp-text-secondary)' }} />
                  <div>
                    <strong style={{ color: 'var(--zp-text-primary)', fontSize: '14px', display: 'block' }}>
                      {user.email}
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)' }}>{t('settings.profile.email.primary')}</span>
                  </div>
                </div>
                <span className="zp-badge-verified">
                  <CheckCircle2 size={12} /> {t('settings.profile.verified')}
                </span>
              </div>
            </div>

            {/* Mobile Number Card */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.mobile.title')}</h3>
                  <p className="zp-card-subtitle">
                    {t('settings.profile.mobile.subtitle')}
                  </p>
                </div>
              </div>

              <div className="zp-list-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Phone size={18} style={{ color: 'var(--zp-text-secondary)' }} />
                  <div>
                    <strong style={{ color: extras.phone ? 'var(--zp-text-primary)' : 'var(--zp-text-secondary)', fontSize: '14px', display: 'block' }}>
                      {extras.phone || t('settings.profile.mobile.none')}
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)' }}>{t('settings.profile.mobile.primary')}</span>
                  </div>
                </div>
                {extras.phone ? (
                  <span className="zp-badge-verified">
                    <CheckCircle2 size={12} /> {t('settings.profile.active')}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Security & Password */}
        {activeTab === 'security' && (
          <div>
            <h1 className="zp-page-title">{t('settings.profile.security.title')}</h1>

            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.security.changePassword')}</h3>
                  <p className="zp-card-subtitle">
                    {t('settings.profile.security.changePasswordHint')}
                  </p>
                </div>
              </div>

              <FormError message={passwordProblem ?? passwordSubmit.error} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '440px' }}>
                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.security.currentPassword')}</span>
                  <input
                    type="password"
                    className="zp-field-input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t('settings.profile.security.currentPasswordPlaceholder')}
                  />
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.security.newPassword')}</span>
                  <input
                    type="password"
                    className="zp-field-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('settings.profile.security.newPasswordPlaceholder')}
                  />
                  <span style={{ fontSize: '11.5px', color: 'var(--zp-text-secondary)', marginTop: '2px' }}>
                    {t(PASSWORD_HINT_KEY)}
                  </span>
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.security.confirmPassword')}</span>
                  <input
                    type="password"
                    className="zp-field-input"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder={t('settings.profile.security.confirmPasswordPlaceholder')}
                  />
                </div>

                <button
                  type="button"
                  className="zp-edit-btn"
                  style={{ alignSelf: 'flex-start', marginTop: '8px' }}
                  onClick={changePassword}
                  disabled={passwordSubmit.submitting || !currentPassword || !newPassword || !confirmNewPassword}
                >
                  <Lock size={14} /> {t('settings.profile.security.update')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Groups & Roles */}
        {activeTab === 'groups' && (
          <div>
            <h1 className="zp-page-title">{t('settings.profile.tab.groups')}</h1>

            {/* Current Role Card */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.groups.assignedRole')}</h3>
                  <p className="zp-card-subtitle">{t('settings.profile.groups.assignedRoleHint', { org: organization?.name ?? t('settings.profile.orgFallback') })}</p>
                </div>
                <span className={user.role === 'admin' ? 'zp-role-badge-admin' : user.role === 'staff' ? 'zp-role-badge-staff' : 'zp-role-badge-viewer'}>
                  <Shield size={13} />
                  {user.role.toUpperCase()}
                </span>
              </div>

              <div style={{ background: 'var(--zp-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--zp-card-border)' }}>
                <strong style={{ color: 'var(--zp-text-primary)', fontSize: '14px', display: 'block', marginBottom: '4px' }}>
                  {user.role === 'admin'
                    ? t('settings.profile.role.admin')
                    : user.role === 'staff'
                    ? t('settings.profile.role.staff')
                    : t('settings.profile.role.viewer')}
                </strong>
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--zp-text-secondary)' }}>
                  {user.role === 'admin'
                    ? t('settings.profile.role.adminHint')
                    : user.role === 'staff'
                    ? t('settings.profile.role.staffHint')
                    : t('settings.profile.role.viewerHint')}
                </p>
              </div>
            </div>

            {/* Groups Joined */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.groups.title')}</h3>
                  <p className="zp-card-subtitle">{t('settings.profile.groups.subtitle')}</p>
                </div>
              </div>

              <div className="zp-list-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Building2 size={18} style={{ color: 'var(--zp-accent)' }} />
                  <div>
                    <strong style={{ color: 'var(--zp-text-primary)', fontSize: '14px', display: 'block' }}>
                      {t('settings.profile.groups.executive')}
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)' }}>
                      {t('settings.profile.groups.executiveHint')}
                    </span>
                  </div>
                </div>
                <span className="zp-badge-verified">{t('settings.profile.groups.activeMember')}</span>
              </div>

              <div className="zp-list-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Users size={18} style={{ color: '#0284c7' }} />
                  <div>
                    <strong style={{ color: 'var(--zp-text-primary)', fontSize: '14px', display: 'block' }}>
                      {t('settings.profile.groups.audit')}
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)' }}>
                      {t('settings.profile.groups.auditHint')}
                    </span>
                  </div>
                </div>
                <span className="zp-badge-verified">{t('settings.profile.groups.activeMember')}</span>
              </div>
            </div>

            {/* Permissions Matrix */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.permissions.title')}</h3>
                  <p className="zp-card-subtitle">{t('settings.profile.permissions.subtitle')}</p>
                </div>
              </div>

              <table className="zp-permissions-table">
                <thead>
                  <tr>
                    <th>{t('settings.profile.permissions.col.module')}</th>
                    <th>{t('settings.profile.permissions.col.view')}</th>
                    <th>{t('settings.profile.permissions.col.edit')}</th>
                    <th>{t('settings.profile.permissions.col.delete')}</th>
                    <th>{t('settings.profile.permissions.col.approve')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>{t('settings.profile.permissions.invoices')}</strong></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td>{user.role === 'admin' ? <Check size={16} style={{ color: 'var(--zp-accent)' }} /> : '—'}</td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                  </tr>
                  <tr>
                    <td><strong>{t('settings.profile.permissions.bills')}</strong></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td>{user.role === 'admin' ? <Check size={16} style={{ color: 'var(--zp-accent)' }} /> : '—'}</td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                  </tr>
                  <tr>
                    <td><strong>{t('settings.profile.permissions.banking')}</strong></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td>{user.role === 'admin' ? <Check size={16} style={{ color: 'var(--zp-accent)' }} /> : '—'}</td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                  </tr>
                  <tr>
                    <td><strong>{t('settings.profile.permissions.accounts')}</strong></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td>{user.role === 'admin' ? <Check size={16} style={{ color: 'var(--zp-accent)' }} /> : '—'}</td>
                    <td>{user.role === 'admin' ? <Check size={16} style={{ color: 'var(--zp-accent)' }} /> : '—'}</td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                  </tr>
                  <tr>
                    <td><strong>{t('settings.profile.permissions.payroll')}</strong></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td>{user.role === 'admin' ? <Check size={16} style={{ color: 'var(--zp-accent)' }} /> : '—'}</td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: Active Sessions */}
        {activeTab === 'sessions' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h1 className="zp-page-title" style={{ margin: 0 }}>{t('settings.profile.tab.sessions')}</h1>
            </div>

            {sessionsLoading ? (
              <div className="zp-card">
                <LoadingBlock label={t('settings.profile.sessions.loading')} />
              </div>
            ) : sessionsError ? (
              <div className="zp-card">
                <ErrorBlock message={sessionsError} onRetry={reloadSessions} />
              </div>
            ) : (
              <>
                <div className="zp-card">
                  <div className="zp-card-header">
                    <div>
                      <h3 className="zp-card-title">{t('settings.profile.sessions.current')}</h3>
                      <p className="zp-card-subtitle">{t('settings.profile.sessions.currentHint')}</p>
                    </div>
                  </div>

                  {sessions
                    .filter((session) => session.isCurrent)
                    .map((session) => (
                      <div className="zp-session-row" key={session.id}>
                        <div className="zp-session-info">
                          <div className="zp-device-icon">
                            <Laptop size={20} />
                          </div>
                          <div>
                            <strong style={{ color: 'var(--zp-text-primary)', fontSize: '14px', display: 'block' }}>
                              {session.device}
                            </strong>
                            <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)' }}>
                              {t('settings.profile.sessions.browser', { browser: session.browser })}
                              {session.ipAddress ? ` • ${session.ipAddress}` : ''}
                            </span>
                          </div>
                        </div>
                        <span className="zp-badge-verified">
                          <CheckCircle2 size={12} /> {t('settings.profile.sessions.current')}
                        </span>
                      </div>
                    ))}
                </div>

                <div className="zp-card">
                  <div className="zp-card-header">
                    <div>
                      <h3 className="zp-card-title">{t('settings.profile.sessions.other')}</h3>
                      <p className="zp-card-subtitle">{t('settings.profile.sessions.otherHint')}</p>
                    </div>
                  </div>

                  {sessions.filter((session) => !session.isCurrent).length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--zp-text-secondary)', padding: '4px 0' }}>
                      {t('settings.profile.sessions.noOther')}
                    </p>
                  ) : (
                    sessions
                      .filter((session) => !session.isCurrent)
                      .map((session) => (
                        <div className="zp-session-row" key={session.id}>
                          <div className="zp-session-info">
                            <div className="zp-device-icon">
                              <Laptop size={20} />
                            </div>
                            <div>
                              <strong style={{ color: 'var(--zp-text-primary)', fontSize: '14px', display: 'block' }}>
                                {session.device}
                              </strong>
                              <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)' }}>
                                {t('settings.profile.sessions.browser', { browser: session.browser })}
                                {session.ipAddress ? ` • ${session.ipAddress}` : ''}{' '}
                                {t('settings.profile.sessions.signedIn', { date: formatDateTime(session.createdAt) })}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="zp-cancel-btn"
                            disabled={revokeSubmit.submitting && revokingId === session.id}
                            onClick={() => revokeDevice(session)}
                          >
                            {revokeSubmit.submitting && revokingId === session.id ? t('settings.profile.sessions.signingOut') : t('settings.profile.sessions.signOut')}
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </>
            )}

            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.history.title')}</h3>
                  <p className="zp-card-subtitle">{t('settings.profile.history.subtitle')}</p>
                </div>
              </div>

              <div className="zp-list-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <KeyRound size={16} style={{ color: 'var(--zp-text-secondary)' }} />
                  <div>
                    <span style={{ color: 'var(--zp-text-primary)', fontSize: '13.5px', fontWeight: 500 }}>
                      {t('settings.profile.history.passwordSignIn')}
                    </span>
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--zp-text-secondary)' }}>
                      {t('settings.profile.history.justNow')}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--zp-accent)', fontWeight: 600 }}>{t('settings.profile.history.success')}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: Notifications */}
        {activeTab === 'notifications' && (
          <div>
            <h1 className="zp-page-title">{t('settings.profile.notifications.title')}</h1>

            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.notifications.security')}</h3>
                  <p className="zp-card-subtitle">{t('settings.profile.notifications.securityHint')}</p>
                </div>
              </div>

              <div className="zp-toggle-row">
                <div className="zp-toggle-label">
                  <h4>{t('settings.profile.notifications.login')}</h4>
                  <p>{t('settings.profile.notifications.loginHint')}</p>
                </div>
                <label className="zp-switch">
                  <input
                    type="checkbox"
                    checked={notifications.loginAlerts}
                    onChange={(e) => setNotifications({ ...notifications, loginAlerts: e.target.checked })}
                  />
                  <span className="zp-slider" />
                </label>
              </div>

              <div className="zp-toggle-row">
                <div className="zp-toggle-label">
                  <h4>{t('settings.profile.notifications.thirdParty')}</h4>
                  <p>{t('settings.profile.notifications.thirdPartyHint')}</p>
                </div>
                <label className="zp-switch">
                  <input
                    type="checkbox"
                    checked={notifications.thirdPartyAlerts}
                    onChange={(e) => setNotifications({ ...notifications, thirdPartyAlerts: e.target.checked })}
                  />
                  <span className="zp-slider" />
                </label>
              </div>

              <div className="zp-toggle-row">
                <div className="zp-toggle-label">
                  <h4>{t('settings.profile.notifications.weekly')}</h4>
                  <p>{t('settings.profile.notifications.weeklyHint')}</p>
                </div>
                <label className="zp-switch">
                  <input
                    type="checkbox"
                    checked={notifications.weeklyReport}
                    onChange={(e) => setNotifications({ ...notifications, weeklyReport: e.target.checked })}
                  />
                  <span className="zp-slider" />
                </label>
              </div>

              <div className="zp-toggle-row">
                <div className="zp-toggle-label">
                  <h4>{t('settings.profile.notifications.invoice')}</h4>
                  <p>{t('settings.profile.notifications.invoiceHint')}</p>
                </div>
                <label className="zp-switch">
                  <input
                    type="checkbox"
                    checked={notifications.invoiceAlerts}
                    onChange={(e) => setNotifications({ ...notifications, invoiceAlerts: e.target.checked })}
                  />
                  <span className="zp-slider" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: Preferences & Theme */}
        {activeTab === 'preferences' && (
          <div>
            <h1 className="zp-page-title">{t('settings.profile.preferences.title')}</h1>

            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.preferences.appearance')}</h3>
                  <p className="zp-card-subtitle">
                    {t('settings.profile.preferences.appearanceHint')}
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '16px' }}>
                {/* Light Theme Tile */}
                <div
                  style={{
                    border: `2px solid ${themeMode === 'light' ? 'var(--zp-accent)' : 'var(--zp-card-border)'}`,
                    borderRadius: '10px',
                    padding: '16px',
                    background: '#f8fafc',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'center',
                  }}
                  onClick={() => applyTheme('light')}
                >
                  <Sun size={24} style={{ color: '#059669' }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#0f172a' }}>{t('settings.profile.preferences.light')}</strong>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{t('settings.profile.preferences.lightHint')}</span>
                  </div>
                  {themeMode === 'light' && (
                    <span className="zp-badge-verified" style={{ marginTop: '4px' }}>
                      <Check size={12} /> {t('settings.profile.active')}
                    </span>
                  )}
                </div>

                {/* Dark Theme Tile */}
                <div
                  style={{
                    border: `2px solid ${themeMode === 'dark' ? 'var(--zp-accent)' : 'var(--zp-card-border)'}`,
                    borderRadius: '10px',
                    padding: '16px',
                    background: '#0f172a',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'center',
                  }}
                  onClick={() => applyTheme('dark')}
                >
                  <Moon size={24} style={{ color: '#38bdf8' }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#f8fafc' }}>{t('settings.profile.preferences.dark')}</strong>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{t('settings.profile.preferences.darkHint')}</span>
                  </div>
                  {themeMode === 'dark' && (
                    <span className="zp-badge-verified" style={{ marginTop: '4px' }}>
                      <Check size={12} /> {t('settings.profile.active')}
                    </span>
                  )}
                </div>

                {/* Luxury Warm Gold Tile */}
                <div
                  style={{
                    border: `2px solid ${themeMode === 'luxury' ? 'var(--zp-accent)' : 'var(--zp-card-border)'}`,
                    borderRadius: '10px',
                    padding: '16px',
                    background: '#fffbeb',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'center',
                  }}
                  onClick={() => applyTheme('luxury')}
                >
                  <Palette size={24} style={{ color: '#d97706' }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#1c1917' }}>{t('settings.profile.preferences.gold')}</strong>
                    <span style={{ fontSize: '12px', color: '#78716c' }}>{t('settings.profile.preferences.goldHint')}</span>
                  </div>
                  {themeMode === 'luxury' && (
                    <span className="zp-badge-verified" style={{ marginTop: '4px' }}>
                      <Check size={12} /> {t('settings.profile.active')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Regional Formats Card */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.regional.title')}</h3>
                  <p className="zp-card-subtitle">{t('settings.profile.regional.subtitle')}</p>
                </div>
              </div>

              <div className="zp-info-grid">
                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.regional.currency')}</span>
                  <span className="zp-field-value">{t('settings.profile.regional.currencyValue')}</span>
                </div>
                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.regional.dateFormat')}</span>
                  <span className="zp-field-value">{t('settings.profile.regional.dateFormatValue')}</span>
                </div>
                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.regional.numberFormat')}</span>
                  <span className="zp-field-value">{t('settings.profile.regional.numberFormatValue')}</span>
                </div>
                <div className="zp-field-block">
                  <span className="zp-field-label">{t('settings.profile.regional.fiscalYear')}</span>
                  <span className="zp-field-value">{t('settings.profile.regional.fiscalYearValue')}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: Terms, Privacy & Compliance */}
        {activeTab === 'terms' && (
          <div>
            <h1 className="zp-page-title">{t('settings.profile.terms.title')}</h1>

            {/* Terms of Service Card */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.terms.tos')}</h3>
                  <p className="zp-card-subtitle">
                    {t('settings.profile.terms.tosHint')}
                  </p>
                </div>
                <span className="zp-badge-verified">
                  <CheckCircle2 size={12} /> {t('settings.profile.terms.accepted')}
                </span>
              </div>

              <div className="zp-terms-accordion">
                <div className="zp-terms-card">
                  <h4>{t('settings.profile.terms.1.title')}</h4>
                  <p>
                    {t('settings.profile.terms.1.body')}
                  </p>
                </div>

                <div className="zp-terms-card">
                  <h4>{t('settings.profile.terms.2.title')}</h4>
                  <p>
                    {t('settings.profile.terms.2.body')}
                  </p>
                </div>

                <div className="zp-terms-card">
                  <h4>{t('settings.profile.terms.3.title')}</h4>
                  <p>
                    {t('settings.profile.terms.3.body')}
                  </p>
                </div>
              </div>
            </div>

            {/* Export & Data Management */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">{t('settings.profile.export.title')}</h3>
                  <p className="zp-card-subtitle">
                    {t('settings.profile.export.subtitle')}
                  </p>
                </div>
                <button type="button" className="zp-edit-btn" onClick={exportAccountData}>
                  <Download size={14} /> {t('settings.profile.export.button')}
                </button>
              </div>
            </div>

            {/* Account Deletion Notice */}
            <div className="zp-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title" style={{ color: '#ef4444' }}>{t('settings.profile.close.title')}</h3>
                  <p className="zp-card-subtitle">
                    {t('settings.profile.close.subtitle')}
                  </p>
                </div>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--zp-text-secondary)', margin: 0 }}>
                {t('settings.profile.close.body')}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Photo Upload, Camera & Interactive Crop Modal */}
      {photoModalOpen && (
        <div className="zp-modal-overlay" onClick={closeModal}>
          <div className="zp-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="zp-modal-header">
              <strong style={{ color: 'var(--zp-text-primary)', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {modalMode === 'crop' ? (
                  <>
                    <Crop size={17} style={{ color: 'var(--zp-accent)' }} /> {t('settings.profile.photo.adjustTitle')}
                  </>
                ) : modalMode === 'camera' ? (
                  <>
                    <Camera size={17} style={{ color: 'var(--zp-gold)' }} /> {t('settings.profile.photo.take')}
                  </>
                ) : (
                  t('settings.profile.photo.title')
                )}
              </strong>
              <button
                type="button"
                onClick={closeModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--zp-text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="zp-modal-body">
              {/* MODE 1: Camera Mode */}
              {modalMode === 'camera' && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                  <video ref={videoRef} autoPlay playsInline className="zp-camera-video" />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" className="zp-edit-btn" onClick={capturePhoto}>
                      <Camera size={15} /> {t('settings.profile.photo.capture')}
                    </button>
                    <button
                      type="button"
                      className="zp-cancel-btn"
                      onClick={() => {
                        stopCamera();
                        setModalMode('select');
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}

              {/* MODE 2: Adjust & Crop Mode */}
              {modalMode === 'crop' && cropImageSrc && (
                <div className="zp-crop-wrapper">
                  <div
                    className={`zp-crop-stage ${isDragging ? 'is-dragging' : ''}`}
                    onMouseDown={handleCropMouseDown}
                    onMouseMove={handleCropMouseMove}
                    onMouseUp={handleCropMouseUp}
                    onMouseLeave={handleCropMouseUp}
                    onTouchStart={handleCropTouchStart}
                    onTouchMove={handleCropTouchMove}
                    onTouchEnd={handleCropMouseUp}
                  >
                    <img
                      ref={cropImageRef}
                      src={cropImageSrc}
                      alt={t('settings.profile.photo.cropAlt')}
                      className="zp-crop-image"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                      }}
                    />
                    <div className="zp-crop-circle-mask" />
                    <div className="zp-crop-grid-guide" />
                  </div>

                  <p className="zp-crop-tip">{t('settings.profile.photo.dragTip')}</p>

                  {/* Zoom Slider */}
                  <div className="zp-crop-slider-bar">
                    <ZoomOut size={16} style={{ color: 'var(--zp-text-secondary)' }} />
                    <input
                      type="range"
                      min="1.0"
                      max="3.0"
                      step="0.05"
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="zp-crop-slider"
                    />
                    <ZoomIn size={16} style={{ color: 'var(--zp-text-secondary)' }} />
                    <span style={{ fontSize: '12px', color: 'var(--zp-text-primary)', fontWeight: 600, minWidth: '40px' }}>
                      {Math.round(zoom * 100)}%
                    </span>
                  </div>

                  {/* Rotation & Reset Tools */}
                  <div className="zp-crop-tools">
                    <button
                      type="button"
                      className="zp-crop-tool-btn"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                      title={t('settings.profile.photo.rotateHint')}
                    >
                      <RotateCw size={14} /> {t('settings.profile.photo.rotate')}
                    </button>
                    <button
                      type="button"
                      className="zp-crop-tool-btn"
                      onClick={() => {
                        setZoom(1.0);
                        setPan({ x: 0, y: 0 });
                        setRotation(0);
                      }}
                      title={t('settings.profile.photo.resetHint')}
                    >
                      <RotateCcw size={14} /> {t('settings.profile.photo.reset')}
                    </button>
                  </div>

                  {/* Crop Footer Actions */}
                  <div className="zp-crop-footer-actions">
                    <button
                      type="button"
                      className="zp-cancel-btn"
                      onClick={() => setModalMode('select')}
                    >
                      {t('settings.profile.photo.back')}
                    </button>
                    <button type="button" className="zp-edit-btn" onClick={applyCrop}>
                      <Check size={14} /> {t('settings.profile.photo.cropSave')}
                    </button>
                  </div>
                </div>
              )}

              {/* MODE 3: Initial Selection Mode */}
              {modalMode === 'select' && (
                <>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={t('settings.profile.photo.previewAlt')} className="zp-upload-preview" />
                  ) : (
                    <div
                      className="zp-avatar-initials zp-upload-preview"
                      style={{ fontSize: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {initials(user.name)}
                    </div>
                  )}

                  <div className="zp-upload-actions">
                    <label className="zp-action-tile">
                      <ImageIcon size={22} style={{ color: 'var(--zp-accent)' }} />
                      <span>{t('settings.profile.photo.gallery')}</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                      />
                    </label>

                    <button type="button" className="zp-action-tile" onClick={startCamera}>
                      <Camera size={22} style={{ color: 'var(--zp-gold)' }} />
                      <span>{t('settings.profile.photo.take')}</span>
                    </button>
                  </div>

                  {avatarUrl && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <button
                        type="button"
                        className="zp-crop-tool-btn"
                        onClick={() => {
                          setCropImageSrc(avatarUrl);
                          setZoom(1.0);
                          setPan({ x: 0, y: 0 });
                          setRotation(0);
                          setModalMode('crop');
                        }}
                      >
                        <Crop size={14} /> {t('settings.profile.photo.adjustCurrent')}
                      </button>
                      <button
                        type="button"
                        onClick={removeAvatar}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          fontSize: '13px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          borderRadius: '6px',
                        }}
                      >
                        <Trash2 size={14} /> {t('settings.profile.photo.remove')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
