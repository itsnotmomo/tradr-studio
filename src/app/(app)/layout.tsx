import { Shell } from "@/components/shell";
import { ToastProvider } from "@/components/toast";
import { NamePromptProvider } from "@/components/name-prompt";
import { SlideViewerProvider } from "@/components/slide-viewer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <NamePromptProvider>
        <SlideViewerProvider>
          <Shell>{children}</Shell>
        </SlideViewerProvider>
      </NamePromptProvider>
    </ToastProvider>
  );
}
