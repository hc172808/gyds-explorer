import { useQuery } from "@tanstack/react-query";
import { Activity, CircleCheck, CircleX, RefreshCw } from "lucide-react";
import { checkRpcEndpoint, getRpcEndpoints, getSyncStatus } from "@/lib/rpc";

const RpcStatusPanel = () => {
  const endpoints = getRpcEndpoints();

  const { data: health, isFetching, refetch } = useQuery({
    queryKey: ["rpcHealth", endpoints],
    queryFn: () => Promise.all(endpoints.map(checkRpcEndpoint)),
    refetchInterval: 15000,
  });

  const { data: sync } = useQuery({
    queryKey: ["syncStatus"],
    queryFn: getSyncStatus,
    refetchInterval: 15000,
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="w-4 h-4 text-primary" /> RPC Endpoints
        </h2>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      <ul className="space-y-2">
        {(health ?? endpoints.map((url) => ({ url, online: false, latencyMs: 0 }))).map((h) => (
          <li
            key={h.url}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2"
          >
             <span className="font-mono text-xs break-all">
               {h.url === "/api/rpc" ? "Same-origin RPC proxy" : h.url}
             </span>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              {"blockNumber" in h && h.blockNumber !== undefined && (
                <span>#{h.blockNumber.toLocaleString()}</span>
              )}
              {"chainId" in h && h.chainId !== undefined && <span>chain {h.chainId}</span>}
              <span>{h.latencyMs}ms</span>
              {h.online ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <CircleCheck className="w-3.5 h-3.5" /> online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <CircleX className="w-3.5 h-3.5" /> offline
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted-foreground">
        Sync status:{" "}
        {sync?.syncing
          ? `syncing ${sync.currentBlock?.toLocaleString()} / ${sync.highestBlock?.toLocaleString()}`
          : "fully synced"}
      </p>
    </section>
  );
};

export default RpcStatusPanel;
