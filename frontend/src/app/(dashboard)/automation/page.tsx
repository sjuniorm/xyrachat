'use client';

import { useState, useEffect, useCallback } from 'react';
import { automationsAPI } from '@/services/api';
import { AutomationWorkflow } from '@/types';
import { Zap, Trash2, Power, PowerOff } from 'lucide-react';
import { PageHeader, Button, Badge, EmptyState, SkeletonRow, useToast } from '@/components/ui';

export default function AutomationPage() {
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const { data } = await automationsAPI.list();
      setWorkflows(data);
    } catch (error) {
      console.error('Failed to load automations', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this automation?')) return;
    try { await automationsAPI.delete(id); toast('Automation deleted', 'success'); load(); } catch (e) { toast('Failed to delete', 'error'); }
  };

  const handleToggle = async (wf: AutomationWorkflow) => {
    try {
      await automationsAPI.update(wf.id, { isActive: !wf.is_active });
      toast(wf.is_active ? 'Automation deactivated' : 'Automation activated', 'success');
      load();
    } catch (e) { toast('Failed to update', 'error'); }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Automations" description="Build workflow automations for your conversations" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Automations" description="Build workflow automations for your conversations" />

      {workflows.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-10 w-10" />}
          title="No automations yet"
          description="Create automations to handle repetitive tasks"
        />
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <div key={wf.id} className="rounded-xl border border-surface-200 bg-white p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${wf.is_active ? 'bg-yellow-100' : 'bg-surface-100'}`}>
                    <Zap className={`h-5 w-5 ${wf.is_active ? 'text-yellow-600' : 'text-surface-400'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-surface-800">{wf.name}</h3>
                      <Badge variant={wf.is_active ? 'success' : 'default'} dot>{wf.is_active ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-2xs text-surface-400">
                      <span>Trigger: {wf.trigger_type}</span>
                      <span>&middot;</span>
                      <span>{wf.execution_count} executions</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(wf)} title={wf.is_active ? 'Deactivate' : 'Activate'}>
                    {wf.is_active ? <Power className="h-3.5 w-3.5 text-green-600" /> : <PowerOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(wf.id)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5 text-surface-400 hover:text-red-500" />
                  </Button>
                </div>
              </div>
              {wf.description && (
                <p className="mt-2 text-xs text-surface-500">{wf.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
