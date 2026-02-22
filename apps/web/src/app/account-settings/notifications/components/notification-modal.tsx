import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

const NotificationModal = ({ isOpen, onClose, title, description }:any) => {
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
              <span className="font-medium">Email</span>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">SMS</span>
              <Switch />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">Browser notifications</span>
                <Switch />
              </div>
              <p className="text-sm text-gray-500">Push notifications are off. To enable this feature, turn on notifications.</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NotificationModal;