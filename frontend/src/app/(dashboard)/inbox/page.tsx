'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { conversationsAPI } from '@/services/api';
import { useSocket } from '@/hooks/useSocket';
import { cn, formatDate, getInitials } from '@/lib/utils';
import { Conversation, Message, MessageDirection } from '@/types';
import {
  Search, Send, Paperclip, MoreHorizontal, Phone, Video,
  Bot, FileText, Check, CheckCheck,
  MessageSquare as MessageSquareIcon, Layout,
} from 'lucide-react';
import { Badge, Button, SkeletonInbox, EmptyState, Modal, useToast } from '@/components/ui';
import { channelsAPI } from '@/services/api';

const channelIcons: Record<string, string> = {
  whatsapp: '📱', webchat: '💬', facebook: 'f', instagram: '📷',
  telegram: '✈', email: '📧', sms: '📲', voip: '📞',
};

const statusBadge: Record<string, 'success' | 'warning' | 'default'> = {
  open: 'success', pending: 'warning', closed: 'default',
};

// Typing indicator animation
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl bg-white border border-surface-200 px-4 py-2.5 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-surface-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-surface-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-surface-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

// Message status icon (sent / delivered / read)
function MessageStatus({ status, readAt, deliveredAt }: { status?: string; readAt?: string; deliveredAt?: string }) {
  const resolved = status || (readAt ? 'read' : deliveredAt ? 'delivered' : 'sent');
  if (resolved === 'read') return <CheckCheck className="h-3 w-3 text-blue-400" />;
  if (resolved === 'delivered') return <CheckCheck className="h-3 w-3 text-surface-300" />;
  if (resolved === 'failed') return <Check className="h-3 w-3 text-red-400" />;
  return <Check className="h-3 w-3 text-surface-300" />;
}

// Attachment preview component
function AttachmentPreview({ messageType, mediaUrl }: { messageType: string; mediaUrl?: string }) {
  if (!mediaUrl && messageType === 'text') return null;

  if (messageType === 'image' && mediaUrl) {
    return (
      <div className="mb-1.5 overflow-hidden rounded-lg">
        <img src={mediaUrl} alt="Attached image" className="max-h-48 w-auto object-cover rounded-lg" loading="lazy" />
      </div>
    );
  }

  if (messageType === 'document' || messageType === 'file') {
    return (
      <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2">
        <FileText className="h-4 w-4 flex-shrink-0" />
        <span className="text-2xs truncate">{mediaUrl?.split('/').pop() || 'Document'}</span>
      </div>
    );
  }

  if (messageType === 'audio') {
    return (
      <div className="mb-1.5">
        <audio controls className="h-8 w-full" src={mediaUrl}>
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  if (messageType === 'video' && mediaUrl) {
    return (
      <div className="mb-1.5 overflow-hidden rounded-lg">
        <video controls className="max-h-48 w-auto rounded-lg" src={mediaUrl} />
      </div>
    );
  }

  return null;
}

// WhatsApp Template Modal
function WhatsAppTemplateModal({
  isOpen, onClose, channelId, contactPhone, contactId, onSent,
}: {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  contactPhone?: string;
  contactId?: string;
  onSent: (conversationId: string) => void;
}) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [toPhone, setToPhone] = useState(contactPhone || '');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen || !channelId) return;
    setIsLoadingTemplates(true);
    channelsAPI.listWhatsAppTemplates(channelId)
      .then(({ data }) => setTemplates(data?.data || []))
      .catch(() => toast('Failed to load templates', 'error'))
      .finally(() => setIsLoadingTemplates(false));
  }, [isOpen, channelId]);

  const handleSend = async () => {
    if (!selectedTemplate || !toPhone.trim()) return;
    setIsSending(true);
    try {
      const { data } = await channelsAPI.sendWhatsAppTemplate(channelId, {
        to: toPhone.trim(),
        templateName: selectedTemplate,
        contactId,
      });
      toast('Template sent! Conversation opened.', 'success');
      onSent(data.conversationId);
      onClose();
    } catch (error: any) {
      toast(error.response?.data?.error || 'Failed to send template', 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send WhatsApp Template" description="Send a pre-approved template to start a conversation">
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-2xs text-amber-800">
          WhatsApp requires a pre-approved template message to initiate a new conversation or re-open one after 24 hours.
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1.5">Phone Number</label>
          <input
            type="tel"
            value={toPhone}
            onChange={(e) => setToPhone(e.target.value)}
            placeholder="+1234567890 (include country code)"
            className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1.5">Template</label>
          {isLoadingTemplates ? (
            <div className="text-xs text-surface-400 py-2">Loading templates…</div>
          ) : templates.length === 0 ? (
            <div className="text-xs text-surface-400 py-2">No approved templates found. Create templates in Meta Business Manager.</div>
          ) : (
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Select a template…</option>
              {templates.map((t: any) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.language}) — {t.status}
                </option>
              ))}
            </select>
          )}
        </div>
        {selectedTemplate && templates.find((t: any) => t.name === selectedTemplate) && (
          <div className="rounded-lg bg-surface-50 border border-surface-200 p-3">
            <p className="text-2xs font-medium text-surface-500 mb-1">Preview</p>
            {templates.find((t: any) => t.name === selectedTemplate)?.components
              ?.filter((c: any) => c.type === 'BODY')
              .map((c: any, i: number) => (
                <p key={i} className="text-xs text-surface-700 whitespace-pre-wrap">{c.text}</p>
              ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-surface-200 px-4 py-2 text-sm text-surface-600 hover:bg-surface-50">Cancel</button>
          <button
            onClick={handleSend}
            disabled={!selectedTemplate || !toPhone.trim() || isSending}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
            Send Template
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<{ file: File; url: string } | null>(null);
  const [whatsappChannels, setWhatsappChannels] = useState<any[]>([]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateChannelId, setTemplateChannelId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedConvRef = useRef<Conversation | null>(null);
  const { toast } = useToast();

  const { joinConversation, leaveConversation, onNewMessage, onConversationUpdated } = useSocket();

  // Keep ref in sync so WebSocket callbacks always see the latest selectedConv
  useEffect(() => {
    selectedConvRef.current = selectedConv;
  }, [selectedConv]);

  const loadConversations = useCallback(async () => {
    try {
      const params: any = {};
      if (searchQuery) params.search = searchQuery;
      if (statusFilter) params.status = statusFilter;
      const { data } = await conversationsAPI.list(params);
      setConversations(data.data || data);
    } catch (error) {
      console.error('Failed to load conversations', error);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter]);

  // Load WhatsApp channels for template sending
  useEffect(() => {
    channelsAPI.list().then(({ data }) => {
      setWhatsappChannels((data || []).filter((ch: any) => ch.type === 'whatsapp' && ch.is_active));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedConv) return;
    const loadMessages = async () => {
      try {
        const { data } = await conversationsAPI.getMessages(selectedConv.id);
        setMessages(data.data || data);
      } catch (error) {
        console.error('Failed to load messages', error);
      }
    };
    loadMessages();
    joinConversation(selectedConv.id);
    return () => { leaveConversation(selectedConv.id); };
  }, [selectedConv, joinConversation, leaveConversation]);

  useEffect(() => {
    const cleanup = onNewMessage((message: Message) => {
      const currentConv = selectedConvRef.current;
      if (message.conversation_id === currentConv?.id) {
        setMessages((prev) => {
          // Avoid duplicates (optimistic message already added)
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        setIsTyping(false);
      }
      loadConversations();
    });
    return cleanup;
  }, [onNewMessage, loadConversations]);

  useEffect(() => {
    const cleanup = onConversationUpdated(() => { loadConversations(); });
    return cleanup;
  }, [onConversationUpdated, loadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConv || isSending) return;
    const messageContent = newMessage.trim();
    setIsSending(true);
    setNewMessage('');
    clearAttachment();

    // Optimistically add message to UI immediately
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConv.id,
      direction: MessageDirection.OUTBOUND,
      message_type: 'text',
      content: messageContent,
      is_from_bot: false,
      status: 'sent',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const { data } = await conversationsAPI.sendMessage(selectedConv.id, { content: messageContent, messageType: 'text' });
      // Replace optimistic message with the real one from server
      setMessages((prev) => prev.map((m) => m.id === optimisticMsg.id ? { ...data, status: 'sent' } : m));
    } catch (error) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setNewMessage(messageContent);
      toast('Failed to send message', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAttachmentPreview({ file, url });
  };

  const clearAttachment = () => {
    if (attachmentPreview) {
      URL.revokeObjectURL(attachmentPreview.url);
      setAttachmentPreview(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="flex w-[340px] flex-col border-r border-surface-200 bg-white">
        {/* Search & filter header */}
        <div className="border-b border-surface-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-surface-200 bg-surface-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-brand-400 focus:bg-white transition-colors"
                placeholder="Search conversations..."
              />
            </div>
          </div>
          <div className="flex gap-1">
            {['', 'open', 'pending', 'closed'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-2xs font-medium transition-colors',
                  statusFilter === status
                    ? 'bg-brand-100 text-brand-700'
                    : 'text-surface-500 hover:bg-surface-100'
                )}
              >
                {status || 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <SkeletonInbox />
          ) : conversations.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<MessageSquareIcon className="h-8 w-8" />}
                title="No conversations found"
                description="Conversations will appear here when customers reach out"
              />
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv)}
                className={cn(
                  'w-full flex items-start gap-3 p-3 text-left border-b border-surface-100 transition-colors',
                  selectedConv?.id === conv.id
                    ? 'bg-brand-50 border-l-2 border-l-brand-600'
                    : 'hover:bg-surface-50'
                )}
              >
                <div className="relative flex-shrink-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-200 text-xs font-semibold text-surface-600">
                    {getInitials(conv.contact_first_name, conv.contact_last_name)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 text-xs" title={conv.channel_type}>
                    {channelIcons[conv.channel_type] || '💬'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-surface-800 truncate">
                      {conv.contact_first_name || 'Unknown'} {conv.contact_last_name || ''}
                    </span>
                    <span className="text-2xs text-surface-400 flex-shrink-0 ml-2">
                      {conv.last_message_at ? formatDate(conv.last_message_at) : ''}
                    </span>
                  </div>
                  <p className="mt-0.5 text-2xs text-surface-500 truncate">
                    {conv.last_message_preview || 'No messages yet'}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge variant={statusBadge[conv.status] || 'default'} dot>{conv.status}</Badge>
                    {conv.is_bot_active && (
                      <Badge variant="purple">
                        <span className="flex items-center gap-0.5"><Bot className="h-2.5 w-2.5" /> Bot</span>
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message area */}
      {selectedConv ? (
        <div className="flex flex-1 flex-col bg-surface-50">
          {/* Conversation header */}
          <div className="flex items-center justify-between border-b border-surface-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-200 text-xs font-semibold text-surface-600">
                {getInitials(selectedConv.contact_first_name, selectedConv.contact_last_name)}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">
                  {selectedConv.contact_first_name || 'Unknown'} {selectedConv.contact_last_name || ''}
                </h3>
                <div className="flex items-center gap-2 text-2xs text-surface-400">
                  <span>{channelIcons[selectedConv.channel_type]} {selectedConv.channel_type}</span>
                  {selectedConv.assigned_first_name && (
                    <span>
                      &middot; Assigned to {selectedConv.assigned_first_name} {selectedConv.assigned_last_name}
                    </span>
                  )}
                  <span>&middot;</span>
                  <Badge variant={statusBadge[selectedConv.status] || 'default'} dot>{selectedConv.status}</Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* WhatsApp template button — only shown for WhatsApp conversations */}
              {selectedConv.channel_type === 'whatsapp' && whatsappChannels.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  title="Send WhatsApp Template"
                  onClick={() => {
                    setTemplateChannelId(selectedConv.channel_id || whatsappChannels[0].id);
                    setTemplateModalOpen(true);
                  }}
                >
                  <Layout className="h-4 w-4 text-green-600" />
                </Button>
              )}
              <Button variant="ghost" size="sm" title="Call"><Phone className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" title="Video"><Video className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" title="More"><MoreHorizontal className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex animate-fade-in',
                  msg.direction === MessageDirection.OUTBOUND ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[70%] rounded-2xl px-3.5 py-2 shadow-sm',
                    msg.direction === MessageDirection.OUTBOUND
                      ? msg.is_from_bot
                        ? 'bg-purple-100 text-purple-900'
                        : 'bg-brand-600 text-white'
                      : 'bg-white border border-surface-200 text-surface-800'
                  )}
                >
                  {msg.is_from_bot && (
                    <div className="flex items-center gap-1 mb-1">
                      <Bot className="h-3 w-3" />
                      <span className="text-2xs font-medium">AI Bot</span>
                    </div>
                  )}
                  <AttachmentPreview messageType={msg.message_type} mediaUrl={msg.media_url} />
                  {msg.content && <p className="text-[13px] whitespace-pre-wrap leading-relaxed">{msg.content}</p>}
                  <div className={cn(
                    'flex items-center gap-1 mt-1',
                    msg.direction === MessageDirection.OUTBOUND ? 'justify-end' : 'justify-start'
                  )}>
                    <span className={cn(
                      'text-2xs',
                      msg.direction === MessageDirection.OUTBOUND
                        ? msg.is_from_bot ? 'text-purple-400' : 'text-brand-200'
                        : 'text-surface-400'
                    )}>
                      {formatDate(msg.created_at)}
                    </span>
                    {msg.direction === MessageDirection.OUTBOUND && (
                      <MessageStatus status={msg.status} readAt={msg.read_at} deliveredAt={msg.delivered_at} />
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Attachment preview bar */}
          {attachmentPreview && (
            <div className="border-t border-surface-200 bg-white px-3 py-2 flex items-center gap-3">
              {attachmentPreview.file.type.startsWith('image/') ? (
                <img src={attachmentPreview.url} alt="Preview" className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-100">
                  <FileText className="h-5 w-5 text-surface-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-surface-700 truncate">{attachmentPreview.file.name}</p>
                <p className="text-2xs text-surface-400">{(attachmentPreview.file.size / 1024).toFixed(1)} KB</p>
              </div>
              <Button variant="ghost" size="sm" onClick={clearAttachment}>
                <span className="text-xs text-red-500">Remove</span>
              </Button>
            </div>
          )}

          {/* Message input */}
          <div className="border-t border-surface-200 bg-white p-3">
            <div className="flex items-end gap-2">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx" />
              <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} className="mb-0.5" title="Attach file">
                <Paperclip className="h-4 w-4" />
              </Button>
              <div className="flex-1">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="w-full resize-none rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white transition-colors"
                  placeholder="Type a message..."
                />
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || isSending}
                className={cn(
                  'rounded-lg p-2 text-white transition-all mb-0.5',
                  newMessage.trim()
                    ? 'bg-brand-600 hover:bg-brand-700 scale-100'
                    : 'bg-surface-300 cursor-not-allowed scale-95'
                )}
              >
                <Send className={cn('h-4 w-4 transition-transform', isSending && 'animate-pulse')} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center bg-surface-50">
          <EmptyState
            icon={<MessageSquareIcon className="h-10 w-10" />}
            title="Select a conversation"
            description="Choose a conversation from the list to start messaging"
          />
        </div>
      )}

      {/* WhatsApp Template Modal */}
      {templateModalOpen && templateChannelId && (
        <WhatsAppTemplateModal
          isOpen={templateModalOpen}
          onClose={() => setTemplateModalOpen(false)}
          channelId={templateChannelId}
          contactPhone={selectedConv?.contact_phone}
          contactId={selectedConv?.contact_id}
          onSent={(conversationId) => {
            loadConversations();
            // If the returned conversation is different, we could navigate to it
          }}
        />
      )}
    </div>
  );
}
