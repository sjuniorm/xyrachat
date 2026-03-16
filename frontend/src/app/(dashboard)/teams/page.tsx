'use client';

import { useState, useEffect, useCallback } from 'react';
import { teamsAPI } from '@/services/api';
import { Team } from '@/types';
import { Plus, Users, Trash2 } from 'lucide-react';
import { PageHeader, Button, Modal, Input, EmptyState, SkeletonRow, useToast } from '@/components/ui';

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();

  const loadTeams = useCallback(async () => {
    try {
      const { data } = await teamsAPI.list();
      setTeams(data);
    } catch (error) {
      console.error('Failed to load teams', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  const handleCreate = async (name: string, description: string) => {
    try {
      await teamsAPI.create({ name, description });
      setShowCreate(false);
      toast('Team created successfully', 'success');
      loadTeams();
    } catch (error) {
      toast('Failed to create team', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this team?')) return;
    try {
      await teamsAPI.delete(id);
      toast('Team deleted', 'success');
      loadTeams();
    } catch (error) {
      toast('Failed to delete team', 'error');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Teams"
        description="Organize agents into teams for better collaboration"
        actions={
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowCreate(true)}>
            Create Team
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No teams yet"
          description="Create your first team to organize agents"
          actionLabel="Create Team"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <div key={team.id} className="rounded-xl border border-surface-200 bg-white p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
                    <Users className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-surface-800">{team.name}</h3>
                    <p className="text-2xs text-surface-400">{team.member_count || 0} members</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(team.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-surface-400 hover:text-red-500" />
                </Button>
              </div>
              {team.description && (
                <p className="mt-3 text-xs text-surface-500 line-clamp-2">{team.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Team">
        <CreateTeamForm onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      </Modal>
    </div>
  );
}

function CreateTeamForm({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, desc: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onCreate(name, description); }} className="space-y-3">
      <Input label="Team name" value={name} onChange={(e) => setName(e.target.value)} required />
      <div>
        <label className="block text-xs font-medium text-surface-600 mb-1.5">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none" />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        <Button type="submit" className="flex-1">Create</Button>
      </div>
    </form>
  );
}
