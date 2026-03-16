'use client';

import { useState, useEffect, useCallback } from 'react';
import { contactsAPI } from '@/services/api';
import { cn, formatDate, getInitials } from '@/lib/utils';
import { Contact } from '@/types';
import { Plus, Users, MoreHorizontal } from 'lucide-react';
import { PageHeader, Button, Badge, Modal, Input, FilterBar, DataTable, EmptyState, SkeletonTable, useToast } from '@/components/ui';

const leadBadgeVariant: Record<string, 'info' | 'warning' | 'success' | 'purple' | 'danger' | 'default'> = {
  new: 'info', contacted: 'warning', qualified: 'success', converted: 'purple', lost: 'danger',
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { toast } = useToast();

  const loadContacts = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter) params.leadStatus = statusFilter;
      const { data } = await contactsAPI.list(params);
      setContacts(data.data || data);
      if (data.pagination) setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to load contacts', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const handleCreateContact = async (formData: any) => {
    try {
      await contactsAPI.create(formData);
      setShowCreateModal(false);
      toast('Contact created successfully', 'success');
      loadContacts();
    } catch (error) {
      toast('Failed to create contact', 'error');
    }
  };

  const columns = [
    {
      key: 'name', header: 'Name',
      render: (c: Contact) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-2xs font-semibold text-brand-700">
            {getInitials(c.first_name, c.last_name)}
          </div>
          <span className="font-medium text-surface-800">{c.first_name || ''} {c.last_name || ''}</span>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (c: Contact) => c.email || '—' },
    { key: 'phone', header: 'Phone', render: (c: Contact) => c.phone || '—' },
    {
      key: 'lead_status', header: 'Status',
      render: (c: Contact) => (
        <Badge variant={leadBadgeVariant[c.lead_status] || 'default'} dot>{c.lead_status}</Badge>
      ),
    },
    { key: 'created_at', header: 'Created', render: (c: Contact) => <span className="text-surface-400">{formatDate(c.created_at)}</span> },
    {
      key: 'actions', header: '', className: 'text-right w-12',
      render: () => (
        <button className="rounded-md p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-surface-200 bg-white px-6 py-4">
        <PageHeader
          title="Contacts"
          description="Manage your customer contacts and leads"
          actions={
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowCreateModal(true)}>
              Add Contact
            </Button>
          }
        />
      </div>

      {/* Filters */}
      <div className="border-b border-surface-200 bg-white px-6 py-3">
        <FilterBar
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          searchPlaceholder="Search contacts..."
          filters={[{
            label: 'Status',
            value: statusFilter,
            options: [
              { label: 'All statuses', value: '' },
              { label: 'New', value: 'new' },
              { label: 'Contacted', value: 'contacted' },
              { label: 'Qualified', value: 'qualified' },
              { label: 'Converted', value: 'converted' },
              { label: 'Lost', value: 'lost' },
            ],
            onChange: (v) => { setStatusFilter(v); setPage(1); },
          }]}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="No contacts found"
            description="Add your first contact to get started"
            actionLabel="Add Contact"
            onAction={() => setShowCreateModal(true)}
          />
        ) : (
          <DataTable
            columns={columns}
            data={contacts}
            keyExtractor={(c) => c.id}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Add Contact" description="Create a new customer contact">
        <CreateContactForm onClose={() => setShowCreateModal(false)} onCreate={handleCreateContact} />
      </Modal>
    </div>
  );
}

function CreateContactForm({ onClose, onCreate }: { onClose: () => void; onCreate: (data: any) => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', leadStatus: 'new' });
  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onCreate(form); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input label="First name" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required />
        <Input label="Last name" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
      </div>
      <Input label="Email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
      <Input label="Phone" type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
      <div>
        <label className="block text-xs font-medium text-surface-600 mb-1.5">Lead Status</label>
        <select value={form.leadStatus} onChange={(e) => update('leadStatus', e.target.value)}
          className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="converted">Converted</option>
          <option value="lost">Lost</option>
        </select>
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        <Button type="submit" className="flex-1">Create</Button>
      </div>
    </form>
  );
}
