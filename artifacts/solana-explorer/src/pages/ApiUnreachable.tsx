import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, CheckCircle2, Terminal, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL, checkApiHealth, isApiUnreachable, type ApiHealth } from "@/lib/featureGateApi";

const STEPS = [
  {
    title: "Confirm the API process is running",
    command: "pm2 status gyds-api",
    detail: "The explorer API should be online on port 3001. If it is stopped, run pm2 restart gyds-api.",
  },
  {
    title: "Check the API logs for a crash",
    command: "pm2 logs gyds-api --lines 50",
    detail: "Database credentials or a missing JWT_SECRET are the most common startup failures.",
  },
  {
    title: "Probe the health endpoint on the server",
    command: "curl -i http://127.0.0.1:3001/api/health",
    detail: "A 200 response here but an error in the browser means nginx is not proxying /api correctly.",
  },
  {
    title: "Reload the reverse proxy",
    command: "sudo nginx -t && sudo systemctl reload nginx",
    detail: "The /api/ location must proxy to the API port on the same host and origin.",
  },
];

const ApiUnreachable = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const from = params.get("from") || "/admin";
  const reason = params.get("reason");

  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [error, setError] = useState<string | null>(reason);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const retry = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkApiHealth();
      setHealth(result);
      setError(result.status === "healthy" ? null : result.error || "API reported an unhealthy status");
    } catch (err) {
      setHealth(null);
      setError(isApiUnreachable(err) ? (err as Error).message : "Unexpected error contacting the API");
    } finally {
      setChecking(false);
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    void retry();
  }, [retry]);

  const recovered = health?.status === "healthy";

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to explorer
      </Link>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div
          className={`rounded-xl border p-6 ${
            recovered ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"
          }`}
        >
          <div className="flex items-start gap-3">
            {recovered ? (
              <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-destructive shrink-0" />
            )}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">
                {recovered ? "API server is back online" : "API server unreachable"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {recovered
                  ? "The health check succeeded. You can return and sign in again."
                  : "Admin login and feature-gate controls need the GYDS API service. The browser could not get a response from it."}
              </p>
              <p className="text-xs font-mono text-muted-foreground break-all">
                Endpoint: {API_BASE_URL}/health
              </p>
              {error && !recovered && (
                <p className="text-xs text-destructive break-all">{error}</p>
              )}
              {lastChecked && (
                <p className="text-xs text-muted-foreground">
                  Last checked {lastChecked.toLocaleTimeString()}
                  {health?.latencyMs != null ? ` · ${health.latencyMs} ms` : ""}
                  {health?.database ? ` · database ${health.database}` : ""}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-5">
            <Button onClick={retry} disabled={checking} className="gap-2">
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {checking ? "Checking…" : "Retry connection"}
            </Button>
            {recovered && (
              <Button variant="secondary" onClick={() => navigate(from)}>
                Continue to {from}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Next steps on your server</h2>
          {STEPS.map((step, i) => (
            <div key={step.command} className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">
                {i + 1}. {step.title}
              </p>
              <div className="mt-2 flex items-center gap-2 rounded bg-secondary/40 px-3 py-2">
                <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
                <code className="text-xs break-all">{step.command}</code>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{step.detail}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default ApiUnreachable;
