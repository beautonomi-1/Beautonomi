import { useEffect } from "react";
import { useRouter } from "expo-router";

/** Legacy route — advanced pricing rules are edited in the service form. */
export default function AdvancedPricingRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(app)/(tabs)/more/catalogue" as never);
  }, [router]);
  return null;
}
