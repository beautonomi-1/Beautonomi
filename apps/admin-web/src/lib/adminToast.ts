import { toast } from "sonner";

/** Consistent success / error feedback across the admin SPA (Sonner). */
export const adminToast = {
  success(message: string) {
    toast.success(message);
  },
  error(message: string) {
    toast.error(message, { duration: 6000 });
  },
  warning(message: string) {
    toast.warning(message, { duration: 5000 });
  },
  info(message: string) {
    toast.info(message);
  },
  message(message: string) {
    toast.message(message);
  },
};
