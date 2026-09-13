"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@beautonomi/i18n";

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
}

const NotificationModal = ({ isOpen, onClose, title, description }: NotificationModalProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-gray-500">{description}</p>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{t("web.accountSettings.notifications.email")}</span>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">{t("web.accountSettings.notifications.sms")}</span>
              <Switch />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{t("web.accountSettings.notifications.browserNotifications")}</span>
                <Switch />
              </div>
              <p className="text-sm text-gray-500">{t("web.accountSettings.notifications.pushOffModal")}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NotificationModal;
