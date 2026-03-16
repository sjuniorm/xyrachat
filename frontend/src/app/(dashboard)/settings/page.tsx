'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { User, Bell, Shield, Palette } from 'lucide-react';
import { PageHeader, Button, Input, useToast } from '@/components/ui';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const { toast } = useToast();

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Settings" description="Manage your account and preferences" />

      <div className="flex gap-6">
        {/* Tabs */}
        <div className="w-48 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-surface-500 hover:bg-surface-100'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 max-w-xl">
          {activeTab === 'profile' && (
            <div className="rounded-xl border border-surface-200 bg-white p-6 space-y-4">
              <h2 className="text-sm font-semibold text-surface-800">Profile Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <Input label="First name" defaultValue={user?.firstName} />
                <Input label="Last name" defaultValue={user?.lastName} />
              </div>
              <Input label="Email" type="email" defaultValue={user?.email} disabled className="bg-surface-50 text-surface-500" />
              <Input label="Role" defaultValue={user?.role} disabled className="bg-surface-50 text-surface-500 capitalize" />
              <Button onClick={() => toast('Profile saved', 'success')}>Save Changes</Button>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="rounded-xl border border-surface-200 bg-white p-6 space-y-4">
              <h2 className="text-sm font-semibold text-surface-800">Notification Preferences</h2>
              {['New messages', 'Conversation assigned', 'Bot escalation', 'Daily digest'].map((item) => (
                <label key={item} className="flex items-center justify-between py-2 border-b border-surface-100 last:border-0">
                  <span className="text-xs text-surface-700">{item}</span>
                  <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                </label>
              ))}
              <Button onClick={() => toast('Notification preferences saved', 'success')}>Save Preferences</Button>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="rounded-xl border border-surface-200 bg-white p-6 space-y-4">
              <h2 className="text-sm font-semibold text-surface-800">Change Password</h2>
              <Input label="Current password" type="password" />
              <Input label="New password" type="password" />
              <Input label="Confirm new password" type="password" />
              <Button onClick={() => toast('Password updated', 'success')}>Update Password</Button>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="rounded-xl border border-surface-200 bg-white p-6 space-y-4">
              <h2 className="text-sm font-semibold text-surface-800">Appearance</h2>
              <p className="text-xs text-surface-500">Theme customization coming soon.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
