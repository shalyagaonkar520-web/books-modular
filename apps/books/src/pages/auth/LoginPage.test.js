import { jsx as _jsx } from "react/jsx-runtime";
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockApi } from '@/test/mockApi';
import { authResponse, renderWithProviders } from '@/test/renderWithProviders';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
describe('LoginPage', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('renders a plain sign-in form with no demo credentials on it', async () => {
        installMockApi({ 'GET /api/auth/me': new Response(JSON.stringify({ detail: 'Not authenticated' }), { status: 401, headers: { 'content-type': 'application/json' } }) });
        renderWithProviders(_jsx(LoginPage, {}));
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
        renderWithProviders(_jsx(LoginPage, {}));
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
        renderWithProviders(_jsx(LoginPage, {}));
        fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'wrong@example.com' } });
        fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Wr0ngPass!' } });
        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
        expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    });
    it('toggles password visibility', () => {
        installMockApi({ 'GET /api/auth/me': new Response(JSON.stringify({ detail: 'x' }), { status: 401, headers: { 'content-type': 'application/json' } }) });
        renderWithProviders(_jsx(LoginPage, {}));
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
        renderWithProviders(_jsx(RegisterPage, {}));
        expect(screen.getByText(/no sample\s+data/i)).toBeInTheDocument();
    });
    it('rejects a weak password before calling the API', async () => {
        const { calls } = installMockApi({ ...unauthenticated, 'POST /api/auth/register': authResponse });
        renderWithProviders(_jsx(RegisterPage, {}));
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
        renderWithProviders(_jsx(RegisterPage, {}));
        fireEvent.change(screen.getByLabelText(/organization name/i), { target: { value: 'Rooman Technologies' } });
        fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Khadar Basha' } });
        fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'khadar@example.com' } });
        fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Str0ngPass!' } });
        fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Different1!' } });
        fireEvent.click(screen.getByRole('button', { name: /create organization/i }));
        expect((await screen.findAllByText(/do not match/i)).length).toBeGreaterThan(0);
        expect(calls.some((call) => call.path === '/api/auth/register')).toBe(false);
    });
    it('sends the organization and administrator details', async () => {
        const { calls } = installMockApi({ ...unauthenticated, 'POST /api/auth/register': authResponse });
        renderWithProviders(_jsx(RegisterPage, {}));
        fireEvent.change(screen.getByLabelText(/organization name/i), { target: { value: 'Rooman Technologies' } });
        fireEvent.change(screen.getByLabelText(/gstin/i), { target: { value: '29abcde1234f1z5' } });
        fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Khadar Basha' } });
        fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'khadar@example.com' } });
        fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Str0ngPass!' } });
        fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Str0ngPass!' } });
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
});
