"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation } from "@/lib/mock-data";

/**
 * Browser notifications + tab title unread count.
 *
 * Triggers:
 *  - New inbound message on a conversation assigned to me → notification
 *  - A conversation just got assigned to me → notification
 *
 * Tab title reflects open conversations assigned to me ("(3) Xyra Chat"). We
 * don't yet have per-agent read state, so this is "open + assigned to me" as
 * a pragmatic proxy until that ships.
 *
 * Permission is requested lazily on first user click anywhere in the app
 * (browsers reject permission requests on page load anyway).
 */
export function NotificationsWatcher({
  conversations,
  currentUserId,
}: {
  conversations: Conversation[];
  currentUserId: string;
}) {
  const lastSnapshot = useRef<Map<string, {
    assigned_to: string | null;
    last_inbound_at: string | null;
  }>>(new Map());
  const baseTitleRef = useRef<string>("Xyra Chat");

  // Lazy permission prompt — fires on first click anywhere in the app.
  useEffect(() => {
    function onFirstClick() {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      window.removeEventListener("click", onFirstClick);
    }
    window.addEventListener("click", onFirstClick);
    return () => window.removeEventListener("click", onFirstClick);
  }, []);

  // Capture the original document title once so we can restore + prefix it.
  useEffect(() => {
    if (typeof document === "undefined") return;
    // Strip any existing "(N) " prefix from a previous mount.
    baseTitleRef.current = document.title.replace(/^\(\d+\)\s*/, "");
  }, []);

  // Update tab title whenever conversations prop changes.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const count = conversations.filter(
      (c) => c.assigned_agent?.id === currentUserId && c.status === "open",
    ).length;
    document.title = count > 0
      ? `(${count}) ${baseTitleRef.current}`
      : baseTitleRef.current;
  }, [conversations, currentUserId]);

  // Fire notifications by diffing the current conversations snapshot against
  // the previous one. New assignment → notify. New inbound on my convo → notify.
  useEffect(() => {
    const prev = lastSnapshot.current;
    const next = new Map<string, {
      assigned_to: string | null;
      last_inbound_at: string | null;
    }>();

    function notify(title: string, body: string) {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      try {
        new Notification(title, {
          body,
          icon: "/icon.png",
          badge: "/icon.png",
          tag: title, // collapse duplicate notifications
        });
      } catch {
        // Some browsers throw if called from outside a user gesture.
      }
    }

    for (const c of conversations) {
      const assignedTo = c.assigned_agent?.id ?? null;
      // We don't have last_inbound_at on the UI shape — approximate with
      // last_message_at when the latest message is inbound. For now, just
      // use last_message_at; in practice this fires on any message but the
      // notification check is gated to "assigned to me" so it's tolerable.
      const lastSeen = c.last_message_at;
      const before = prev.get(c.id);

      // Detect: newly assigned to me
      if (
        assignedTo === currentUserId &&
        before &&
        before.assigned_to !== currentUserId
      ) {
        notify(
          "Assigned to you",
          `${c.contact.name} — ${c.last_message_preview || "no preview"}`,
        );
      }

      // Detect: new activity on my conversation (later last_message_at)
      if (
        assignedTo === currentUserId &&
        before &&
        before.last_inbound_at &&
        new Date(lastSeen).getTime() >
          new Date(before.last_inbound_at).getTime()
      ) {
        notify(
          `New message from ${c.contact.name}`,
          c.last_message_preview || "(no preview)",
        );
      }

      next.set(c.id, {
        assigned_to: assignedTo,
        last_inbound_at: lastSeen,
      });
    }

    lastSnapshot.current = next;
  }, [conversations, currentUserId]);

  return null;
}

// Realtime subscription to messages — surfaces brand-new inbound messages
// as browser notifications immediately. Server-refresh would also catch them
// via the diff above on the next poll, but Realtime is instant when it works.
export function MessagesRealtimeNotifier({
  currentUserId,
  myConversationIds,
}: {
  currentUserId: string;
  myConversationIds: string[];
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (myConversationIds.length === 0) return;
    const supabase = createClient();
    // Subscribe to all inserts, filter client-side. Postgres-changes filters
    // can't do IN-list out of the box.
    const channel = supabase
      .channel(`notif:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as {
            conversation_id: string;
            direction: string;
            content: string | null;
          };
          if (m.direction !== "inbound") return;
          if (!myConversationIds.includes(m.conversation_id)) return;
          if (
            typeof Notification === "undefined" ||
            Notification.permission !== "granted"
          )
            return;
          try {
            new Notification("New message", {
              body: m.content ?? "(media or empty)",
              icon: "/icon.png",
              badge: "/icon.png",
            });
          } catch {
            /* user-gesture restrictions */
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, myConversationIds]);
  return null;
}
