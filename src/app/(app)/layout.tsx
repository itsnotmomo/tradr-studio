import { Shell } from "@/components/shell";
import { ToastProvider } from "@/components/toast";
import { NamePromptProvider } from "@/components/name-prompt";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <NamePromptProvider>
        <Shell>{children}</Shell>
      </NamePromptProvider>
    </ToastProvider>
  );
}
