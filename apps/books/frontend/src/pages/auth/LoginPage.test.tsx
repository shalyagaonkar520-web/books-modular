import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMockApi } from '@/test/mockApi';
import { authResponse, renderWithProviders } from '@/test/renderWithProviders';

import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders a plain sign-in form with no demo credentials on it', async () => {
    installMockApi({ 'GET /api/auth/me': new Response(JSON.stringify({ detail: 'Not authenticated' }), { status: 401, headers: { 'content-type': 'application/json' } }) });

    renderWithProviders(<LoginPage />);

    expect(screen.getByRole('heading', { name: /rooman books/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/demo|password123|try it out/i);
  });

  it('submits the credentials the user typed', async () => {
    const { calls } = installMockApi({
      'GET /api/auth/me': new Response(JSON.stringify({ detail: 'Not authenticated' }), { status: 401, headers: { 'content-type': 'application/json' } }),
      'POST /api/auth/login': authResponse,
    });

    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'khadar@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Str0ngPass!' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      const login = calls.find((call) => call.path === '/api/auth/login');
      expect(login?.body).toEqual({ email: 'khadar@example.com', password: 'Str0ngPass!' });
    });
  });

  it('shows the server message when the credentials are wrong', async () => {
    installMockApi({
      'GET /api/auth/me': new Response(JSON.stringify({ detail: 'Not authenticated' }), { status: 401, headers: { 'content-type': 'application/json' } }),
      'POST /api/auth/login': new Response(JSON.stringify({ detail: 'Invalid email or password' }), { status: 401, headers: { 'content-type': 'application/json' } }),
    });

    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'wrong@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Wr0ngPass!' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
  });

  it('toggles password visibility', () => {
    installMockApi({ 'GET /api/auth/me': new Response(JSON.stringify({ detail: 'x' }), { status: 401, headers: { 'content-type': 'application/json' } }) });
    renderWithProviders(<LoginPage />);

    const field = screen.getByLabelText(/^password/i);
    expect(field).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('type', 'text');
  });
});

describe('RegisterPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  const unauthenticated = {
    'GET /api/auth/me': new Response(JSON.stringify({ detail: 'Not authenticated' }), { status: 401, headers: { 'content-type': 'application/json' } }),
  };

  it('states that no sample data is created', () => {
    installMockApi(unauthenticated);
    renderWithProviders(<RegisterPage />);
    expect(screen.getByText(/no sample\s+data/i)).toBeInTheDocument();
  });

  it('rejects a weak password before calling the API', async () => {
    const { calls } = installMockApi({ ...unauthenticated, 'POST /api/auth/register': authResponse });
    renderWithProviders(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/organization name/i), { target: { value: 'Rooman Technologies' } });
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Khadar Basha' } });
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'khadar@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /create organization/i }));

    expect((await screen.findAllByText(/at least 8 characters/i)).length).toBeGreaterThan(0);
    expect(calls.some((call) => call.path === '/api/auth/register')).toBe(false);
  });

  it('rejects mismatched passwords before calling the API', async () => {
    const { calls } = installMockApi({ ...unauthenticated, 'POST /api/auth/register': authResponse });
    renderWithProviders(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/organization name/i), { target: { value: 'Rooman Technologies' } });
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Khadar Basha' } });
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'khadar@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Str0ngPass!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Different1!' } });
    fireEvent.click(screen.getByRole('button', { name: /create organization/i }));

    expect((await screen.findAllByText(/do not match/i)).length).toBeGreaterThan(0);
    expect(calls.some((call) => call.path === '/api/auth/register')).toBe(false);
  });

  it('disables create organization until email is verified', async () => {
    installMockApi({ ...unauthenticated });
    renderWithProviders(<RegisterPage />);

    const submitBtn = screen.getByRole('button', { name: /create organization/i });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/please verify your email address before creating your organization/i)).toBeInTheDocument();
  });

  it('sends the organization and administrator details after email verification', async () => {
    localStorage.setItem('rooman_verified_email', 'khadar@example.com');
    const { calls } = installMockApi({
      ...unauthenticated,
      'GET /api/auth/email-verification-status': { email: 'khadar@example.com', status: 'VERIFIED', isVerified: true },
      'POST /api/auth/register': authResponse,
    });
    renderWithProviders(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/organization name/i), { target: { value: 'Rooman Technologies' } });
    fireEvent.change(screen.getByLabelText(/gstin/i), { target: { value: '29abcde1234f1z5' } });
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Khadar Basha' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Str0ngPass!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Str0ngPass!' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create organization/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /create organization/i }));

    await waitFor(() => {
      const call = calls.find((c) => c.path === '/api/auth/register');
      expect(call?.body).toEqual({
        name: 'Khadar Basha',
        email: 'khadar@example.com',
        password: 'Str0ngPass!',
        organizationName: 'Rooman Technologies',
        gstin: '29ABCDE1234F1Z5',
      });
    });
  });

  it('allows user to send OTP, verify OTP, and proceed to create organization', async () => {
    localStorage.removeItem('rooman_verified_email');
    const { calls } = installMockApi({
      ...unauthenticated,
      'POST /api/auth/send-verification-email': { message: 'Verification code sent', cooldownSeconds: 60, devOtp: '482915' },
      'POST /api/auth/verify-otp': { message: 'Email verified successfully' },
      'GET /api/auth/email-verification-status': { email: 'admin@acme.com', status: 'VERIFIED', isVerified: true },
    });
    renderWithProviders(<RegisterPage />);

    const emailInput = screen.getByLabelText(/work email/i);
    fireEvent.change(emailInput, { target: { value: 'admin@acme.com' } });

    const sendOtpBtn = screen.getByRole('button', { name: /send otp/i });
    fireEvent.click(sendOtpBtn);

    await waitFor(() => {
      expect(screen.getByLabelText(/enter 6-digit otp code/i)).toBeInTheDocument();
    });

    const otpInput = screen.getByLabelText(/enter 6-digit otp code/i);
    fireEvent.change(otpInput, { target: { value: '482915' } });

    const verifyOtpBtn = screen.getByRole('button', { name: /verify otp/i });
    fireEvent.click(verifyOtpBtn);

    await waitFor(() => {
      expect(screen.getByText(/✓ verified/i)).toBeInTheDocument();
      expect(screen.getByText(/✓ admin@acme.com is verified/i)).toBeInTheDocument();
    });

    const verifyOtpCall = calls.find((c) => c.path === '/api/auth/verify-otp');
    expect(verifyOtpCall?.body).toEqual({ email: 'admin@acme.com', otp: '482915' });
  });

  it('preserves full email input without losing characters letter-by-letter', async () => {
    localStorage.removeItem('rooman_verified_email');
    installMockApi(unauthenticated);
    renderWithProviders(<RegisterPage />);

    const emailInput = screen.getByLabelText(/work email/i) as HTMLInputElement;
    const testEmail = 'administrator@company.org';

    let currentVal = '';
    for (const char of testEmail) {
      currentVal += char;
      fireEvent.change(emailInput, { target: { value: currentVal } });
      expect(emailInput.value).toBe(currentVal);
    }

    expect(emailInput.value).toBe('administrator@company.org');
  });

  it('renders Forgot Password button and handles password reset with OTP', async () => {
    const { calls } = installMockApi({
      ...unauthenticated,
      'POST /api/auth/forgot-password': { message: 'Password reset code sent', cooldownSeconds: 60, devOtp: '654321' },
      'POST /api/auth/reset-password': { message: 'Password reset successfully' },
    });
    renderWithProviders(<LoginPage />);

    const forgotBtn = screen.getByRole('button', { name: /forgot password\?/i });
    expect(forgotBtn).toBeInTheDocument();
    fireEvent.click(forgotBtn);

    // Modal opens
    expect(screen.getByRole('dialog', { name: /reset password/i })).toBeInTheDocument();
    const emailInput = screen.getByLabelText(/registered work email/i);
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: /send reset code/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/6-digit verification code/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/6-digit verification code/i), { target: { value: '654321' } });

    const newPassInput = screen.getByLabelText(/^new password/i) as HTMLInputElement;
    let pwd = '';
    for (const ch of 'BrandNew123!') {
      pwd += ch;
      fireEvent.change(newPassInput, { target: { value: pwd } });
      expect(newPassInput.value).toBe(pwd);
    }

    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'BrandNew123!' } });

    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      const resetCall = calls.find((c) => c.path === '/api/auth/reset-password');
      expect(resetCall?.body).toEqual({
        email: 'user@example.com',
        otp: '654321',
        newPassword: 'BrandNew123!',
      });
    });
  });
});
