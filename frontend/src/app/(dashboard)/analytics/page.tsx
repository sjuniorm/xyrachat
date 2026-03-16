'use client';

import { useState, useEffect } from 'react';
import { analyticsAPI } from '@/services/api';
import { AnalyticsOverview } from '@/types';
import { MessageSquare, Users, Inbox, Bot } from 'lucide-react';
import { PageHeader, StatCard, SkeletonCard, DataTable } from '@/components/ui';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [channelData, setChannelData] = useState<any[]>([]);
  const [agentData, setAgentData] = useState<any[]>([]);
  const [leadData, setLeadData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [ov, ch, ag, ld] = await Promise.all([
          analyticsAPI.overview(),
          analyticsAPI.channels(),
          analyticsAPI.agents(),
          analyticsAPI.leads(),
        ]);
        setOverview(ov.data);
        setChannelData(ch.data);
        setAgentData(ag.data);
        setLeadData(ld.data);
      } catch (error) {
        console.error('Failed to load analytics', error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Analytics" description="Overview of your communication platform performance" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const channelChartData = channelData.map((item: any) => ({
    name: item.channel_type,
    value: parseInt(item.count),
  }));

  const leadChartData = leadData.map((item: any) => ({
    name: item.lead_status,
    value: parseInt(item.count),
  }));

  const agentColumns = [
    { key: 'name', header: 'Agent', render: (a: any) => <span className="font-medium">{a.first_name} {a.last_name}</span> },
    { key: 'total_conversations', header: 'Total', className: 'text-right' },
    { key: 'open_conversations', header: 'Open', className: 'text-right' },
    { key: 'closed_conversations', header: 'Closed', className: 'text-right' },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Analytics" description="Overview of your communication platform performance" />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Conversations" value={(overview?.totalConversations || 0).toLocaleString()} icon={<MessageSquare className="h-5 w-5" />} />
        <StatCard label="Total Contacts" value={(overview?.totalContacts || 0).toLocaleString()} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Open Conversations" value={(overview?.openConversations || 0).toLocaleString()} icon={<Inbox className="h-5 w-5" />} />
        <StatCard label="Bot Messages" value={(overview?.botMessages || 0).toLocaleString()} icon={<Bot className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversations by Channel — Bar Chart */}
        <div className="rounded-xl border border-surface-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Conversations by Channel</h3>
          {channelChartData.length === 0 ? (
            <p className="text-xs text-surface-400 py-8 text-center">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={channelChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {channelChartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Lead Status Distribution — Pie Chart */}
        <div className="rounded-xl border border-surface-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Lead Status Distribution</h3>
          {leadChartData.length === 0 ? (
            <p className="text-xs text-surface-400 py-8 text-center">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={leadChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" nameKey="name">
                  {leadChartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Agent Performance — DataTable */}
        <div className="lg:col-span-2">
          <DataTable
            columns={agentColumns}
            data={agentData}
            keyExtractor={(a: any) => a.id}
            emptyMessage="No agent performance data available"
          />
        </div>
      </div>
    </div>
  );
}
