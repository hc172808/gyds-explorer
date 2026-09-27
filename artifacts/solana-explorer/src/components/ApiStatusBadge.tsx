import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldAlert, Wifi, WifiOff } from "lucide-react";
import { checkApiHealth } from "@/lib/featureGateApi";

type Status = "checking" | "healthy" | "unhealthy" | "unreachable";

const LABEL: Record<Status, string> = {
  checking: "Checking API…",
  healthy: "API online",
  unhealthy: "API degraded",
  unreachable: "API offline",
};

interface Props {
  /** Where to return after the user fixes the API. */
  from?: string;
  className?: string;
}

const ApiStatusBadge = ({ from = "/admin", className = "" }: Props) => {
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState<string>("");

  const probe = useCallback(async () => {
    setStatus("checking");
    try {
      const health = await checkApiHealth();
      setStatus(health.status === "healthy" ? "healthy" : "unhealthy");
      setDetail(
        health.status === "healthy"
          ? `${health.latencyMs ?? 0} ms · db ${health.database ?? "ok"}`
          : health.error || "Unhealthy",
      );
    } catch {
      setStatus("unreachable");
      setDetail("No response from the API server");
    }
  }, []);

  useEffect(() => {
    void probe();
    const id = setInterval(probe, 30000);
    return () => clearInterval(id);
  }, [probe]);

  const tone =
    status === "healthy"
      ? "border-primary/30 text-primary bg-primary/10"
      : status === "checking"
        ? "border-border text-muted-foreground bg-secondary/40"
        : "border-destructive/30 text-destructive bg-destructive/10";

  const badge = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone} ${className}`}
      title={detail}
    >
      {status === "checking" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : status === "healthy" ? (
        <Wifi className="w-3.5 h-3.5" />
      ) : status === "unhealthy" ? (
        <ShieldAlert className="w-3.5 h-3.5" />
      ) : (
        <WifiOff className="w-3.5 h-3.5" />
      )}
      {LABEL[status]}
    </span>
  );

  if (status === "unreachable" || status === "unhealthy") {
    return (
      <Link to={`/api-status?from=${encodeURIComponent(from)}`} className="hover:opacity-80">
        {badge}
      </Link>
    );
  }

  return (
    <button type="button" onClick={probe} className="hover:opacity-80">
      {badge}
    </button>
  );
};

export default ApiStatusBadge;
