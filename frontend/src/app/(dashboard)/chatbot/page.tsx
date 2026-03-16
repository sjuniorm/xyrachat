'use client';

import { useState, useEffect, useCallback } from 'react';
import { chatbotsAPI } from '@/services/api';
import { ChatbotConfig } from '@/types';
import { Bot, Trash2, Power, PowerOff, MessageSquare } from 'lucide-react';
import { PageHeader, Button, Badge, EmptyState, SkeletonRow, useToast } from '@/components/ui';

export default function ChatbotPage() {
  const [chatbots, setChatbots] = useState<ChatbotConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [testBotId, setTestBotId] = useState<string | null>(null);
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const { data } = await chatbotsAPI.list();
      setChatbots(data);
    } catch (error) {
      console.error('Failed to load chatbots', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this chatbot?')) return;
    try { await chatbotsAPI.delete(id); toast('Chatbot deleted', 'success'); load(); } catch (e) { toast('Failed to delete chatbot', 'error'); }
  };

  const handleToggle = async (bot: ChatbotConfig) => {
    try {
      await chatbotsAPI.update(bot.id, { isActive: !bot.is_active });
      toast(bot.is_active ? 'Chatbot deactivated' : 'Chatbot activated', 'success');
      load();
    } catch (e) { toast('Failed to update chatbot', 'error'); }
  };

  const handleTest = async () => {
    if (!testBotId || !testInput.trim()) return;
    setIsTesting(true);
    setTestOutput('');
    try {
      const { data } = await chatbotsAPI.test(testBotId, testInput);
      setTestOutput(data.response || data.message || JSON.stringify(data));
    } catch (e: any) {
      setTestOutput('Error: ' + (e.response?.data?.error || e.message));
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="AI Chatbots" description="Configure and manage your AI-powered chatbots" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="AI Chatbots" description="Configure and manage your AI-powered chatbots" />

      {chatbots.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-10 w-10" />}
          title="No chatbots configured"
          description="Create a chatbot from the admin settings"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {chatbots.map((bot) => (
            <div key={bot.id} className="rounded-xl border border-surface-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bot.is_active ? 'bg-green-100' : 'bg-surface-100'}`}>
                    <Bot className={`h-5 w-5 ${bot.is_active ? 'text-green-600' : 'text-surface-400'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-surface-800">{bot.name}</h3>
                      <Badge variant={bot.is_active ? 'success' : 'default'} dot>{bot.is_active ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    <p className="text-2xs text-surface-400">Model: {bot.model} &middot; Temp: {bot.temperature}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(bot)} title={bot.is_active ? 'Deactivate' : 'Activate'}>
                    {bot.is_active ? <Power className="h-3.5 w-3.5 text-green-600" /> : <PowerOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setTestBotId(testBotId === bot.id ? null : bot.id)} title="Test">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(bot.id)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5 text-surface-400 hover:text-red-500" />
                  </Button>
                </div>
              </div>
              {bot.welcome_message && (
                <p className="mt-3 text-xs text-surface-500 bg-surface-50 rounded-lg p-2.5 line-clamp-2">{bot.welcome_message}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {bot.languages?.map((lang) => (
                  <Badge key={lang} variant="outline">{lang}</Badge>
                ))}
              </div>

              {testBotId === bot.id && (
                <div className="mt-4 border-t border-surface-100 pt-4 space-y-2">
                  <div className="flex gap-2">
                    <input type="text" value={testInput} onChange={(e) => setTestInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleTest()}
                      className="flex-1 rounded-lg border border-surface-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                      placeholder="Type a test message..." />
                    <Button size="sm" onClick={handleTest} isLoading={isTesting}>Send</Button>
                  </div>
                  {testOutput && (
                    <div className="rounded-lg bg-purple-50 p-3 text-xs text-purple-800 whitespace-pre-wrap">{testOutput}</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
