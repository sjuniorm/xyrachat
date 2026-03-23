'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import Image from 'next/image';

export default function AuthPage() {
  const router = useRouter();
  const { login, register } = useAuthStore();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    tenantName: '',
    tenantSlug: 'xyrachat', // pre-fill the default workspace
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(form.email, form.password, form.tenantSlug);
      } else {
        await register(form);
      }
      router.push('/inbox');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const updateForm = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-b from-brand-950 via-brand-700 to-brand-300 p-12 text-white">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="XyraChat" width={44} height={44} className="rounded-xl" />
          <span className="text-xl font-bold">XyraChat</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            All your customer
            <br />
            conversations in
            <br />
            one place.
          </h1>
          <p className="mt-4 text-lg text-brand-200">
            Manage WhatsApp, Instagram, Facebook, Telegram and more from a single unified inbox.
            Automate with AI. Scale your support.
          </p>
        </div>
        <p className="text-sm text-brand-300">
          &copy; {new Date().getFullYear()} XyraChat. All rights reserved.
        </p>
      </div>

      {/* Right panel - form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <div className="flex items-center gap-2 lg:hidden mb-8">
              <Image src="/logo.png" alt="XyraChat" width={36} height={36} className="rounded-lg" />
              <span className="text-lg font-semibold">XyraChat</span>
            </div>
            <h2 className="text-2xl font-bold text-surface-900">
              {isLogin ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1 text-sm text-surface-500">
              {isLogin ? 'Sign in to your workspace' : 'Get started with XyraChat'}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-surface-600 mb-1.5">First name</label>
                    <input
                      type="text"
                      required
                      value={form.firstName}
                      onChange={(e) => updateForm('firstName', e.target.value)}
                      className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-surface-600 mb-1.5">Last name</label>
                    <input
                      type="text"
                      required
                      value={form.lastName}
                      onChange={(e) => updateForm('lastName', e.target.value)}
                      className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1.5">Company name</label>
                  <input
                    type="text"
                    required
                    value={form.tenantName}
                    onChange={(e) => updateForm('tenantName', e.target.value)}
                    className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    placeholder="Acme Inc"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1.5">Workspace URL</label>
                  <div className="flex items-center rounded-lg border border-surface-200 bg-white overflow-hidden focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                    <input
                      type="text"
                      required
                      value={form.tenantSlug}
                      onChange={(e) => updateForm('tenantSlug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className="flex-1 px-3 py-2 text-sm outline-none"
                      placeholder="acme"
                    />
                    <span className="bg-surface-50 border-l border-surface-200 px-3 py-2 text-xs text-surface-400">.xyrachat.io</span>
                  </div>
                </div>
              </>
            )}

            {isLogin && (
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1.5">Workspace</label>
                <input
                  type="text"
                  required
                  value={form.tenantSlug}
                  onChange={(e) => updateForm('tenantSlug', e.target.value.toLowerCase())}
                  className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  placeholder="your-workspace"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => updateForm('email', e.target.value)}
                className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="john@company.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => updateForm('password', e.target.value)}
                className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </span>
              ) : (
                isLogin ? 'Sign in' : 'Create account'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-surface-500">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              {isLogin ? 'Create one' : 'Sign in'}
            </button>
          </p>

        </div>
      </div>
    </div>
  );
}
