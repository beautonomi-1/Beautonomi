import { toast } from "sonner";

/** Consistent success / error feedback across the admin SPA (Sonner). */
export const adminToast = {
  success(message: string) {
    toast.success(message);
  },
  error(message: string) {
    toast.error(message);
  },
  message(message: string) {
    toast.message(message);
  },
};
