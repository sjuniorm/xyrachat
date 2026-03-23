'use client';

import { useState, useEffect, useCallback } from 'react';
import { channelsAPI } from '@/services/api';
import { Channel } from '@/types';
import { Trash2, Plug, Copy, Check, ExternalLink, Settings2 } from 'lucide-react';
import { PageHeader, Button, Badge, Modal, Input, EmptyState, SkeletonRow, useToast } from '@/components/ui';

const WEBHOOK_BASE = 'https://api.xyra.chat/api/v1/webhooks';

const channelMeta: Record<string, { label: string; emoji: string; variant: 'success' | 'info' | 'purple' | 'danger' | 'warning' | 'default'; configurable: boolean }> = {
  whatsapp: { label: 'WhatsApp', emoji: '📱', variant: 'success', configurable: true },
  webchat: { label: 'Web Chat', emoji: '💬', variant: 'info', configurable: true },
  facebook: { label: 'Facebook', emoji: '📘', variant: 'info', configurable: true },
  instagram: { label: 'Instagram', emoji: '📷', variant: 'danger', configurable: true },
  telegram: { label: 'Telegram', emoji: '✈️', variant: 'info', configurable: true },
  email: { label: 'Email', emoji: '📧', variant: 'warning', configurable: false },
  sms: { label: 'SMS', emoji: '📲', variant: 'warning', configurable: false },
  voip: { label: 'VoIP', emoji: '📞', variant: 'purple', configurable: false },
};

interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
  required?: boolean;
}

const channelCredentialFields: Record<string, CredentialField[]> = {
  whatsapp: [
    { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: 'e.g. 123456789012345', required: true },
    { key: 'accessToken', label: 'Permanent Access Token', placeholder: 'Your WhatsApp Cloud API token', required: true },
    { key: 'verifyToken', label: 'Verify Token', placeholder: 'Custom string for webhook verification', required: true },
  ],
  instagram: [
    { key: 'pageId', label: 'Instagram Page ID', placeholder: 'e.g. 123456789012345', required: true },
    { key: 'pageAccessToken', label: 'Page Access Token', placeholder: 'Your Instagram page token', required: true },
    { key: 'appSecret', label: 'App Secret', placeholder: 'Meta App Secret for signature validation', required: true },
  ],
  facebook: [
    { key: 'pageId', label: 'Facebook Page ID', placeholder: 'e.g. 123456789012345', required: true },
    { key: 'pageAccessToken', label: 'Page Access Token', placeholder: 'Your Facebook page token', required: true },
    { key: 'appSecret', label: 'App Secret', placeholder: 'Meta App Secret for signature validation', required: true },
  ],
  telegram: [
    { key: 'botToken', label: 'Bot Token', placeholder: 'e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', required: true },
  ],
  webchat: [],
};

const channelSetupGuides: Record<string, { steps: string[]; docsUrl?: string }> = {
  whatsapp: {
    steps: [
      'Go to Meta for Developers → Your App → WhatsApp → Getting Started',
      'Copy your Phone Number ID and Permanent Access Token',
      'Set a custom Verify Token (any string you choose)',
      'After saving here, paste the Webhook URL below into Meta\'s webhook configuration',
    ],
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
  },
  instagram: {
    steps: [
      'Go to Meta for Developers → Your App → Messenger → Instagram Settings',
      'Add your Instagram Business Account',
      'Generate a Page Access Token with pages_messaging permission',
      'Copy the App Secret from App Settings → Basic',
      'After saving, paste the Webhook URL into Meta\'s webhook configuration',
    ],
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform/instagram',
  },
  facebook: {
    steps: [
      'Go to Meta for Developers → Your App → Messenger → Settings',
      'Generate a Page Access Token for your Facebook Page',
      'Copy the App Secret from App Settings → Basic',
      'After saving, paste the Webhook URL into Meta\'s webhook configuration',
    ],
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform/getting-started',
  },
  telegram: {
    steps: [
      'Message @BotFather on Telegram and create a new bot (/newbot)',
      'Copy the Bot Token provided by BotFather',
      'After saving here, the webhook will be automatically registered with Telegram',
    ],
    docsUrl: 'https://core.telegram.org/bots/tutorial',
  },
  webchat: {
    steps: [
      'Web Chat works out of the box — no external credentials needed',
      'After creating the channel, use the Channel ID to embed the chat widget on your website',
    ],
  },
};

export default function IntegrationsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [channelName, setChannelName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const { data } = await channelsAPI.list();
      setChannels(data);
    } catch (error) {
      console.error('Failed to load channels', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openConfig = (type: string) => {
    setSelectedType(type);
    setChannelName(channelMeta[type]?.label || type);
    setCredentials({});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedType(null);
    setChannelName('');
    setCredentials({});
  };

  const handleSave = async () => {
    if (!selectedType || !channelName.trim()) return;

    const fields = channelCredentialFields[selectedType] || [];
    for (const f of fields) {
      if (f.required && !credentials[f.key]?.trim()) {
        toast(`${f.label} is required`, 'error');
        return;
      }
    }

    setIsSaving(true);
    try {
      await channelsAPI.create({
        type: selectedType,
        name: channelName.trim(),
        credentials,
        config: {},
      });
      toast(`${channelMeta[selectedType]?.label || selectedType} channel created!`, 'success');
      closeModal();
      load();
    } catch (error: any) {
      toast(error.response?.data?.error || 'Failed to create channel', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this integration? This cannot be undone.')) return;
    try {
      await channelsAPI.delete(id);
      toast('Integration removed', 'success');
      load();
    } catch {
      toast('Failed to remove', 'error');
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Integrations" description="Connect messaging channels to your platform" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Integrations" description="Connect messaging channels to your platform" />

      {/* Active channels */}
      {channels.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-surface-700 mb-3">Active Channels</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map((ch) => {
              const meta = channelMeta[ch.type] || { label: ch.type, emoji: '🔌', variant: 'default' as const, configurable: false };
              const webhookUrl = `${WEBHOOK_BASE}/${ch.type}`;
              return (
                <div key={ch.id} className="rounded-xl border border-surface-200 bg-white p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{meta.emoji}</span>
                      <div>
                        <h3 className="text-sm font-semibold text-surface-800">{ch.name}</h3>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openConfig(ch.type)} title="Configure">
                        <Settings2 className="h-3.5 w-3.5 text-surface-400 hover:text-brand-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(ch.id)} title="Remove">
                        <Trash2 className="h-3.5 w-3.5 text-surface-400 hover:text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant={ch.is_active ? 'success' : 'default'} dot>
                      {ch.is_active ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                  {ch.type !== 'webchat' && (
                    <div className="mt-3 pt-3 border-t border-surface-100">
                      <p className="text-2xs text-surface-400 mb-1">Webhook URL</p>
                      <div className="flex items-center gap-1.5">
                        <code className="flex-1 text-2xs bg-surface-50 rounded px-2 py-1 text-surface-600 truncate">{webhookUrl}</code>
                        <button
                          onClick={() => copyToClipboard(webhookUrl, ch.id)}
                          className="shrink-0 p-1 rounded hover:bg-surface-100 transition-colors"
                          title="Copy webhook URL"
                        >
                          {copiedField === ch.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-surface-400" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {channels.length === 0 && (
        <EmptyState
          icon={<Plug className="h-10 w-10" />}
          title="No channels connected"
          description="Connect your first messaging channel below"
        />
      )}

      {/* Available integrations */}
      <div>
        <h2 className="text-sm font-semibold text-surface-700 mb-3">Available Integrations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(channelMeta).map(([key, meta]) => (
            <div
              key={key}
              onClick={() => meta.configurable ? openConfig(key) : toast(`${meta.label} integration coming soon`, 'info')}
              className={`rounded-xl border border-dashed p-4 text-center transition-colors cursor-pointer ${
                meta.configurable
                  ? 'border-surface-300 bg-surface-50 hover:border-brand-400 hover:bg-brand-50/30'
                  : 'border-surface-200 bg-surface-50/50 opacity-60'
              }`}
            >
              <span className="text-2xl">{meta.emoji}</span>
              <p className="mt-2 text-xs font-medium text-surface-700">{meta.label}</p>
              <p className="text-2xs text-surface-400 mt-0.5">
                {meta.configurable ? 'Click to configure' : 'Coming soon'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Configuration Modal */}
      <Modal isOpen={modalOpen} onClose={closeModal} title={`Configure ${channelMeta[selectedType || '']?.label || ''}`} size="lg">
        {selectedType && (
          <div className="space-y-4">
            {/* Setup guide */}
            {channelSetupGuides[selectedType] && (
              <div className="rounded-lg bg-brand-50/50 border border-brand-100 p-3">
                <p className="text-xs font-semibold text-brand-800 mb-2">Setup Guide</p>
                <ol className="text-2xs text-brand-700 space-y-1 list-decimal list-inside">
                  {channelSetupGuides[selectedType].steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {channelSetupGuides[selectedType].docsUrl && (
                  <a
                    href={channelSetupGuides[selectedType].docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-2xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    <ExternalLink className="h-3 w-3" /> View official docs
                  </a>
                )}
              </div>
            )}

            {/* Webhook URL */}
            {selectedType !== 'webchat' && (
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1.5">Webhook URL</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-surface-50 rounded-lg border border-surface-200 px-3 py-2 text-surface-700">{WEBHOOK_BASE}/{selectedType}</code>
                  <button
                    onClick={() => copyToClipboard(`${WEBHOOK_BASE}/${selectedType}`, 'webhook')}
                    className="shrink-0 p-2 rounded-lg border border-surface-200 hover:bg-surface-50 transition-colors"
                    title="Copy"
                  >
                    {copiedField === 'webhook' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-surface-400" />}
                  </button>
                </div>
              </div>
            )}

            {/* Channel name */}
            <Input
              label="Channel Name"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g. My WhatsApp Business"
            />

            {/* Credential fields */}
            {(channelCredentialFields[selectedType] || []).map((field) => (
              <Input
                key={field.key}
                label={field.label}
                type={field.type || 'text'}
                value={credentials[field.key] || ''}
                onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
              />
            ))}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
              <Button onClick={handleSave} isLoading={isSaving}>
                Save Channel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
