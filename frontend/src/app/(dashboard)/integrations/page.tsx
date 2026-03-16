'use client';

import { useState, useEffect, useCallback } from 'react';
import { channelsAPI } from '@/services/api';
import { Channel } from '@/types';
import { Trash2, Plug } from 'lucide-react';
import { PageHeader, Button, Badge, EmptyState, SkeletonRow, useToast } from '@/components/ui';

const channelMeta: Record<string, { label: string; emoji: string; variant: 'success' | 'info' | 'purple' | 'danger' | 'warning' | 'default' }> = {
  whatsapp: { label: 'WhatsApp', emoji: '📱', variant: 'success' },
  webchat: { label: 'Web Chat', emoji: '💬', variant: 'info' },
  facebook: { label: 'Facebook', emoji: '📘', variant: 'info' },
  instagram: { label: 'Instagram', emoji: '📷', variant: 'danger' },
  telegram: { label: 'Telegram', emoji: '✈️', variant: 'info' },
  email: { label: 'Email', emoji: '📧', variant: 'warning' },
  sms: { label: 'SMS', emoji: '📲', variant: 'warning' },
  voip: { label: 'VoIP', emoji: '📞', variant: 'purple' },
};

export default function IntegrationsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this integration?')) return;
    try { await channelsAPI.delete(id); toast('Integration removed', 'success'); load(); } catch (e) { toast('Failed to remove', 'error'); }
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
              const meta = channelMeta[ch.type] || { label: ch.type, emoji: '🔌', variant: 'default' as const };
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
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(ch.id)} title="Remove">
                      <Trash2 className="h-3.5 w-3.5 text-surface-400 hover:text-red-500" />
                    </Button>
                  </div>
                  <div className="mt-3">
                    <Badge variant={ch.is_active ? 'success' : 'default'} dot>
                      {ch.is_active ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
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
            <div key={key} className="rounded-xl border border-dashed border-surface-300 bg-surface-50 p-4 text-center hover:border-brand-400 hover:bg-brand-50/30 transition-colors cursor-pointer">
              <span className="text-2xl">{meta.emoji}</span>
              <p className="mt-2 text-xs font-medium text-surface-700">{meta.label}</p>
              <p className="text-2xs text-surface-400 mt-0.5">Click to configure</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
