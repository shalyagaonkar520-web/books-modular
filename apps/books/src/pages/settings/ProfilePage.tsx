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
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { FormError } from '@/components/ui/Feedback';
import { initials } from '@/utils/format';

import { PASSWORD_HINT, validatePassword } from './passwordRules';
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
      toast.error('Please choose a valid image file');
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
      toast.error('Unable to access camera. Please check browser permissions or use file upload.');
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
    toast.success('Profile photo adjusted, cropped, and saved!');
  };

  const removeAvatar = () => {
    if (!user?.id) return;
    setAvatarUrl(null);
    localStorage.removeItem(`rooman_avatar_${user.id}`);
    window.dispatchEvent(new Event('rooman_avatar_updated'));
    closeModal();
    toast.success('Profile photo removed');
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
      toast.error('Name must be at least 2 characters');
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
      toast.success('Profile updated successfully');
    }
  };

  // Change password
  const changePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      setPasswordProblem('The new passwords do not match.');
      return;
    }
    const problem = validatePassword(newPassword);
    if (problem) {
      setPasswordProblem(problem);
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordProblem('Choose a password different from your current one.');
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
    toast.success('Account data exported successfully');
  };

  if (!user) return null;

  return (
    <div className={`zoho-profile-container theme-${themeMode}`}>
      {/* Left Sidebar Navigation */}
      <aside className="zp-sidebar">
        <div className="zp-sidebar-header">
          <span className="zp-brand-badge">R</span>
          <span className="zp-sidebar-title">Accounts</span>
        </div>

        <ul className="zp-nav">
          <li>
            <button
              type="button"
              className={`zp-nav-btn ${activeTab === 'personal' ? 'active' : ''}`}
              onClick={() => setActiveTab('personal')}
            >
              <UserIcon size={16} />
              <span>Personal Information</span>
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
              <span>Security & Password</span>
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
              <span>Groups & Roles</span>
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
              <span>Active Sessions</span>
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
              <span>Notifications</span>
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
              <span>Theme & Preferences</span>
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
              <span>Terms & Privacy</span>
              {activeTab === 'terms' && <span className="zp-nav-indicator" />}
            </button>
          </li>
        </ul>

        <div className="zp-sidebar-footer">
          <div style={{ fontSize: '11px', color: 'var(--zp-sidebar-text)', marginBottom: '8px', fontWeight: 500 }}>
            QUICK THEME
          </div>
          <div className="zp-sidebar-theme-toggles">
            <button
              type="button"
              className={`zp-theme-btn ${themeMode === 'light' ? 'active' : ''}`}
              onClick={() => applyTheme('light')}
            >
              <Sun size={12} /> Light
            </button>
            <button
              type="button"
              className={`zp-theme-btn ${themeMode === 'dark' ? 'active' : ''}`}
              onClick={() => applyTheme('dark')}
            >
              <Moon size={12} /> Dark
            </button>
            <button
              type="button"
              className={`zp-theme-btn ${themeMode === 'luxury' ? 'active' : ''}`}
              onClick={() => applyTheme('luxury')}
            >
              <Palette size={12} /> Gold
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="zp-main">
        {/* TAB 1: Personal Information */}
        {activeTab === 'personal' && (
          <div>
            <h1 className="zp-page-title">Personal Information</h1>

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
                      title="Update and crop profile photo"
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
                      Organization: <strong>{organization?.name ?? 'Rooman Books'}</strong>
                    </span>
                  </div>
                </div>

                <div>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="zp-cancel-btn" onClick={() => setIsEditing(false)}>
                        Cancel
                      </button>
                      <button type="button" className="zp-edit-btn" onClick={saveProfile} disabled={profileSubmit.submitting}>
                        <Check size={14} /> Save
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="zp-edit-btn" onClick={() => setIsEditing(true)}>
                      Edit Profile
                    </button>
                  )}
                </div>
              </div>

              <FormError message={profileSubmit.error} />

              <div className="zp-info-grid">
                <div className="zp-field-block">
                  <span className="zp-field-label">Full Name</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="zp-field-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your full name"
                    />
                  ) : (
                    <span className="zp-field-value">{name || user.name}</span>
                  )}
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">Display Name</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="zp-field-input"
                      value={extras.displayName}
                      onChange={(e) => setExtras({ ...extras, displayName: e.target.value })}
                      placeholder="Display name"
                    />
                  ) : (
                    <span className="zp-field-value">{extras.displayName || user.name}</span>
                  )}
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">Gender</span>
                  {isEditing ? (
                    <select
                      className="zp-field-input"
                      value={extras.gender}
                      onChange={(e) => setExtras({ ...extras, gender: e.target.value })}
                    >
                      <option value="I'd prefer not to say">I'd prefer not to say</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  ) : (
                    <span className="zp-field-value">{extras.gender}</span>
                  )}
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">Country / Region</span>
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
                  <span className="zp-field-label">State</span>
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
                  <span className="zp-field-label">Language</span>
                  {isEditing ? (
                    <select
                      className="zp-field-input"
                      value={extras.language}
                      onChange={(e) => setExtras({ ...extras, language: e.target.value })}
                    >
                      <option value="English">English</option>
                      <option value="Hindi">Hindi</option>
                      <option value="Kannada">Kannada</option>
                      <option value="Tamil">Tamil</option>
                    </select>
                  ) : (
                    <span className="zp-field-value">{extras.language}</span>
                  )}
                </div>

                <div className="zp-field-block" style={{ gridColumn: 'span 2' }}>
                  <span className="zp-field-label">Time Zone</span>
                  <span className="zp-field-value">{extras.timezone}</span>
                </div>
              </div>
            </div>

            {/* Email Addresses Card */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">My Email Addresses</h3>
                  <p className="zp-card-subtitle">
                    View and manage the email address associated with your account. Used to sign in and receive invoices.
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
                    <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)' }}>Primary Email Address</span>
                  </div>
                </div>
                <span className="zp-badge-verified">
                  <CheckCircle2 size={12} /> Verified
                </span>
              </div>
            </div>

            {/* Mobile Number Card */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Mobile Numbers</h3>
                  <p className="zp-card-subtitle">
                    Your mobile number is used for OTP verification, two-factor authentication, and critical security alerts.
                  </p>
                </div>
              </div>

              <div className="zp-list-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Phone size={18} style={{ color: 'var(--zp-text-secondary)' }} />
                  <div>
                    <strong style={{ color: 'var(--zp-text-primary)', fontSize: '14px', display: 'block' }}>
                      {extras.phone || '+91 98765 43210'}
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)' }}>Primary Recovery Number</span>
                  </div>
                </div>
                <span className="zp-badge-verified">
                  <CheckCircle2 size={12} /> Active
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Security & Password */}
        {activeTab === 'security' && (
          <div>
            <h1 className="zp-page-title">Security & Credentials</h1>

            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Change Password</h3>
                  <p className="zp-card-subtitle">
                    Set a unique, strong password to protect your financial records and organization data.
                  </p>
                </div>
              </div>

              <FormError message={passwordProblem ?? passwordSubmit.error} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '440px' }}>
                <div className="zp-field-block">
                  <span className="zp-field-label">Current Password</span>
                  <input
                    type="password"
                    className="zp-field-input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">New Password</span>
                  <input
                    type="password"
                    className="zp-field-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                  <span style={{ fontSize: '11.5px', color: 'var(--zp-text-secondary)', marginTop: '2px' }}>
                    {PASSWORD_HINT}
                  </span>
                </div>

                <div className="zp-field-block">
                  <span className="zp-field-label">Confirm New Password</span>
                  <input
                    type="password"
                    className="zp-field-input"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>

                <button
                  type="button"
                  className="zp-edit-btn"
                  style={{ alignSelf: 'flex-start', marginTop: '8px' }}
                  onClick={changePassword}
                  disabled={passwordSubmit.submitting || !currentPassword || !newPassword || !confirmNewPassword}
                >
                  <Lock size={14} /> Update Password
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Groups & Roles */}
        {activeTab === 'groups' && (
          <div>
            <h1 className="zp-page-title">Groups & Roles</h1>

            {/* Current Role Card */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Assigned Role</h3>
                  <p className="zp-card-subtitle">Your authorization level within {organization?.name ?? 'Rooman Books'}.</p>
                </div>
                <span className={user.role === 'admin' ? 'zp-role-badge-admin' : user.role === 'staff' ? 'zp-role-badge-staff' : 'zp-role-badge-viewer'}>
                  <Shield size={13} />
                  {user.role.toUpperCase()}
                </span>
              </div>

              <div style={{ background: 'var(--zp-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--zp-card-border)' }}>
                <strong style={{ color: 'var(--zp-text-primary)', fontSize: '14px', display: 'block', marginBottom: '4px' }}>
                  {user.role === 'admin'
                    ? 'Full Organization Administrator'
                    : user.role === 'staff'
                    ? 'Finance & Accounting Staff'
                    : 'Read-Only Viewer'}
                </strong>
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--zp-text-secondary)' }}>
                  {user.role === 'admin'
                    ? 'You have unrestricted access to chart of accounts, tax setup, user roles, banking, payroll, financial statements, and organizational deletion.'
                    : user.role === 'staff'
                    ? 'You can record and manage invoices, bills, items, and contacts, but cannot manage other users or fiscal periods.'
                    : 'You can review financial dashboards and reports in read-only mode.'}
                </p>
              </div>
            </div>

            {/* Groups Joined */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Organization Groups</h3>
                  <p className="zp-card-subtitle">Functional teams and departmental access groups you are a member of.</p>
                </div>
              </div>

              <div className="zp-list-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Building2 size={18} style={{ color: 'var(--zp-accent)' }} />
                  <div>
                    <strong style={{ color: 'var(--zp-text-primary)', fontSize: '14px', display: 'block' }}>
                      Executive Finance Group
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)' }}>
                      Default governance group for financial approval and tax filing
                    </span>
                  </div>
                </div>
                <span className="zp-badge-verified">Active Member</span>
              </div>

              <div className="zp-list-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Users size={18} style={{ color: '#0284c7' }} />
                  <div>
                    <strong style={{ color: 'var(--zp-text-primary)', fontSize: '14px', display: 'block' }}>
                      Audit & Compliance Team
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)' }}>
                      Access to audit logs, journal reversal histories, and GST return summaries
                    </span>
                  </div>
                </div>
                <span className="zp-badge-verified">Active Member</span>
              </div>
            </div>

            {/* Permissions Matrix */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Module Permissions Matrix</h3>
                  <p className="zp-card-subtitle">Breakdown of read, write, and approval privileges.</p>
                </div>
              </div>

              <table className="zp-permissions-table">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>View</th>
                    <th>Create / Edit</th>
                    <th>Delete</th>
                    <th>Approve</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Invoices & Sales</strong></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td>{user.role === 'admin' ? <Check size={16} style={{ color: 'var(--zp-accent)' }} /> : '—'}</td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                  </tr>
                  <tr>
                    <td><strong>Bills & Purchases</strong></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td>{user.role === 'admin' ? <Check size={16} style={{ color: 'var(--zp-accent)' }} /> : '—'}</td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                  </tr>
                  <tr>
                    <td><strong>Banking & Transfers</strong></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td>{user.role === 'admin' ? <Check size={16} style={{ color: 'var(--zp-accent)' }} /> : '—'}</td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                  </tr>
                  <tr>
                    <td><strong>Chart of Accounts & Journals</strong></td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                    <td>{user.role === 'admin' ? <Check size={16} style={{ color: 'var(--zp-accent)' }} /> : '—'}</td>
                    <td>{user.role === 'admin' ? <Check size={16} style={{ color: 'var(--zp-accent)' }} /> : '—'}</td>
                    <td><Check size={16} style={{ color: 'var(--zp-accent)' }} /></td>
                  </tr>
                  <tr>
                    <td><strong>Payroll & Pay Runs</strong></td>
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
              <h1 className="zp-page-title" style={{ margin: 0 }}>Active Sessions</h1>
            </div>

            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Current Session</h3>
                  <p className="zp-card-subtitle">This device and browser you are currently logged into.</p>
                </div>
              </div>

              <div className="zp-session-row">
                <div className="zp-session-info">
                  <div className="zp-device-icon">
                    <Laptop size={20} />
                  </div>
                  <div>
                    <strong style={{ color: 'var(--zp-text-primary)', fontSize: '14px', display: 'block' }}>
                      Personal Computer • Windows
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--zp-text-secondary)' }}>
                      Chrome Browser • Bangalore, Karnataka, India
                    </span>
                  </div>
                </div>
                <span className="zp-badge-verified">
                  <CheckCircle2 size={12} /> Current Session
                </span>
              </div>
            </div>

            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Recent Activity History</h3>
                  <p className="zp-card-subtitle">Recent authentications and account interactions.</p>
                </div>
              </div>

              <div className="zp-list-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <KeyRound size={16} style={{ color: 'var(--zp-text-secondary)' }} />
                  <div>
                    <span style={{ color: 'var(--zp-text-primary)', fontSize: '13.5px', fontWeight: 500 }}>
                      Successful Password Sign-In
                    </span>
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--zp-text-secondary)' }}>
                      Just now • IP: 127.0.0.1
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--zp-accent)', fontWeight: 600 }}>Success</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: Notifications */}
        {activeTab === 'notifications' && (
          <div>
            <h1 className="zp-page-title">Notification Preferences</h1>

            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Security & Account Alerts</h3>
                  <p className="zp-card-subtitle">Manage which activities trigger instant email notifications.</p>
                </div>
              </div>

              <div className="zp-toggle-row">
                <div className="zp-toggle-label">
                  <h4>New sign-in to account alert</h4>
                  <p>Receive email alerts whenever your account is accessed from a new device or browser.</p>
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
                  <h4>Third-party app access alert</h4>
                  <p>Receive alerts whenever external integrations or API keys access your records.</p>
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
                  <h4>Weekly Financial Digest & Summaries</h4>
                  <p>Receive weekly updates on outstanding receivables, bills due, and cash flow position.</p>
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
                  <h4>Customer Invoice & Payment Alerts</h4>
                  <p>Notify me when a customer views an invoice or submits an online payment.</p>
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
            <h1 className="zp-page-title">Theme & Workspace Preferences</h1>

            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Appearance & Luxury Theme</h3>
                  <p className="zp-card-subtitle">
                    Select your preferred interface color mode for a comfortable, luxury accounting experience.
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
                    <strong style={{ display: 'block', fontSize: '14px', color: '#0f172a' }}>Light Luxury</strong>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Zoho emerald & clean white</span>
                  </div>
                  {themeMode === 'light' && (
                    <span className="zp-badge-verified" style={{ marginTop: '4px' }}>
                      <Check size={12} /> Active
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
                    <strong style={{ display: 'block', fontSize: '14px', color: '#f8fafc' }}>Dark Obsidian</strong>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>Sleek low-glare dark mode</span>
                  </div>
                  {themeMode === 'dark' && (
                    <span className="zp-badge-verified" style={{ marginTop: '4px' }}>
                      <Check size={12} /> Active
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
                    <strong style={{ display: 'block', fontSize: '14px', color: '#1c1917' }}>Warm Gold</strong>
                    <span style={{ fontSize: '12px', color: '#78716c' }}>Executive luxury palette</span>
                  </div>
                  {themeMode === 'luxury' && (
                    <span className="zp-badge-verified" style={{ marginTop: '4px' }}>
                      <Check size={12} /> Active
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Regional Formats Card */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Regional & Currency Standards</h3>
                  <p className="zp-card-subtitle">Format preferences for reports, ledgers, and transactions.</p>
                </div>
              </div>

              <div className="zp-info-grid">
                <div className="zp-field-block">
                  <span className="zp-field-label">Base Currency</span>
                  <span className="zp-field-value">₹ INR (Indian Rupee)</span>
                </div>
                <div className="zp-field-block">
                  <span className="zp-field-label">Date Format</span>
                  <span className="zp-field-value">DD/MM/YYYY</span>
                </div>
                <div className="zp-field-block">
                  <span className="zp-field-label">Number Formatting</span>
                  <span className="zp-field-value">Indian Lakhs & Crores (1,00,000)</span>
                </div>
                <div className="zp-field-block">
                  <span className="zp-field-label">Fiscal Year Start</span>
                  <span className="zp-field-value">1st April (India Financial Calendar)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: Terms, Privacy & Compliance */}
        {activeTab === 'terms' && (
          <div>
            <h1 className="zp-page-title">Terms, Privacy & Compliance</h1>

            {/* Terms of Service Card */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Terms of Service & Usage Agreements</h3>
                  <p className="zp-card-subtitle">
                    Legal framework governing the use of Rooman Books cloud accounting services.
                  </p>
                </div>
                <span className="zp-badge-verified">
                  <CheckCircle2 size={12} /> Accepted & Active
                </span>
              </div>

              <div className="zp-terms-accordion">
                <div className="zp-terms-card">
                  <h4>1. Double-Entry Accounting Integrity</h4>
                  <p>
                    All journal entries, trial balances, and financial ledgers generated within Rooman Books are immutable and balanced according to standard Indian Accounting Standards (Ind AS) and double-entry rules.
                  </p>
                </div>

                <div className="zp-terms-card">
                  <h4>2. Data Ownership & Privacy Policy</h4>
                  <p>
                    You retain 100% ownership of your customer lists, vendor details, invoices, GSTIN data, and uploaded document attachments. We never sell or share organizational financial records with third parties.
                  </p>
                </div>

                <div className="zp-terms-card">
                  <h4>3. Data Protection (DPDP Act & GDPR Compliance)</h4>
                  <p>
                    Personal data, tax identification numbers (PAN/GSTIN), and authentication tokens are encrypted at rest using industry-standard AES-256 and salted bcrypt password hashing.
                  </p>
                </div>
              </div>
            </div>

            {/* Export & Data Management */}
            <div className="zp-card">
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title">Export Account Data</h3>
                  <p className="zp-card-subtitle">
                    Download a secure JSON archive of your personal profile, organization records, and preferences.
                  </p>
                </div>
                <button type="button" className="zp-edit-btn" onClick={exportAccountData}>
                  <Download size={14} /> Export My Data
                </button>
              </div>
            </div>

            {/* Account Deletion Notice */}
            <div className="zp-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="zp-card-header">
                <div>
                  <h3 className="zp-card-title" style={{ color: '#ef4444' }}>Close Account</h3>
                  <p className="zp-card-subtitle">
                    Permanent removal of user profile and access credentials.
                  </p>
                </div>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--zp-text-secondary)', margin: 0 }}>
                To permanently close your account and delete associated organization books, please contact your system administrator or submit a deletion request via Settings.
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
                    <Crop size={17} style={{ color: 'var(--zp-accent)' }} /> Adjust & Crop Photo
                  </>
                ) : modalMode === 'camera' ? (
                  <>
                    <Camera size={17} style={{ color: 'var(--zp-gold)' }} /> Take a Photo
                  </>
                ) : (
                  'Profile Photo'
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
                      <Camera size={15} /> Capture & Adjust
                    </button>
                    <button
                      type="button"
                      className="zp-cancel-btn"
                      onClick={() => {
                        stopCamera();
                        setModalMode('select');
                      }}
                    >
                      Cancel
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
                      alt="Crop target"
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

                  <p className="zp-crop-tip">Drag to reposition photo inside the circle</p>

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
                      title="Rotate 90°"
                    >
                      <RotateCw size={14} /> Rotate
                    </button>
                    <button
                      type="button"
                      className="zp-crop-tool-btn"
                      onClick={() => {
                        setZoom(1.0);
                        setPan({ x: 0, y: 0 });
                        setRotation(0);
                      }}
                      title="Reset crop"
                    >
                      <RotateCcw size={14} /> Reset
                    </button>
                  </div>

                  {/* Crop Footer Actions */}
                  <div className="zp-crop-footer-actions">
                    <button
                      type="button"
                      className="zp-cancel-btn"
                      onClick={() => setModalMode('select')}
                    >
                      Back
                    </button>
                    <button type="button" className="zp-edit-btn" onClick={applyCrop}>
                      <Check size={14} /> Crop & Save
                    </button>
                  </div>
                </div>
              )}

              {/* MODE 3: Initial Selection Mode */}
              {modalMode === 'select' && (
                <>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar Preview" className="zp-upload-preview" />
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
                      <span>Choose from Gallery</span>
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
                      <span>Take a Photo</span>
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
                        <Crop size={14} /> Adjust & Crop Current Photo
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
                        <Trash2 size={14} /> Remove
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
