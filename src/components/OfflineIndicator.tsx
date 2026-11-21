import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="bg-amber-600 text-white text-xs font-bold px-4 py-2 flex items-center justify-center gap-2 text-center"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>
        أنت غير متصل بالإنترنت — يمكنك تصفح سجل الأعطال المحفوظ، وتحتاج للاتصال لإجراء فحص جديد.
      </span>
    </div>
  );
}
