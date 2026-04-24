export type InboxNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
  timestamp?: string;
  link?: string;
  action_url?: string;
  priority?: "low" | "medium" | "high";
  is_read: boolean;
  read?: boolean;
  metadata?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

export type NotificationsInboxInitial = {
  notifications: InboxNotification[];
  total_unread: number;
};
