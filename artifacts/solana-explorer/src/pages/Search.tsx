import { useMemo, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Blocks,
  ArrowRightLeft,
  Wallet,
  ChevronLeft,
  ChevronRight,
  SearchX,
  Loader2,
} from "lucide-react";
import SearchBar from "@/components/SearchBar";
import { resolveSearch, SearchResultType } from "@/lib/search";
import { formatAddress, hexToNumber } from "@/lib/rpc";
import { weiToGyds } from "@/lib/coins";

const PAGE_SIZE = 10;

const typeIcon = (type: SearchResultType) => {
  if (type === "block") return <Blocks className="w-4 h-4 text-primary" />;
  if (type === "transaction") return <ArrowRightLeft className="w-4 h-4 text-primary" />;
  return <Wallet className="w-4 h-4 text-primary" />;
};

const SearchPage = () => {
  const [params] = useSearchParams();
  const query = params.get("q") ?? "";
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [query]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["search", query],
    queryFn: () => resolveSearch(query),
    enabled: query.trim().length > 0,
  });

  const related = data?.related ?? [];
  const totalPages = Math.max(1, Math.ceil(related.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => related.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [related, page],
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Search</h1>
      <div className="mb-8">
        <SearchBar />
      </div>

      {!query && (
        <p className="text-muted-foreground text-sm">
          Enter a block number, transaction hash, or address to begin.
        </p>
      )}

      {isLoading && query && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Resolving “{query}”…
        </div>
      )}

      {(data?.error || error) && !isLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          <SearchX className="w-5 h-5" />
          {data?.error ?? "Search failed. The RPC endpoints may be unreachable."}
        </div>
      )}

      {data?.results?.length ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {data.results.map((r) => (
            <Link
              key={`${r.type}-${r.id}`}
              to={r.href}
              className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/60 transition-colors"
            >
              {typeIcon(r.type)}
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-primary">{r.type}</p>
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground font-mono break-all">{r.subtitle}</p>
              </div>
            </Link>
          ))}
        </motion.div>
      ) : null}

      {related.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {data?.relatedLabel} ({related.length})
            </h2>
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:border-primary/60"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:border-primary/60"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {pageRows.map((row) => (
              <Link
                key={row.hash}
                to={row.href}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-card hover:bg-secondary/40 transition-colors"
              >
                <span className="font-mono text-sm text-primary">{formatAddress(row.hash)}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {formatAddress(row.from)} → {row.to ? formatAddress(row.to) : "contract creation"}
                </span>
                <span className="text-xs font-mono">{weiToGyds(row.value)} GYDS</span>
                <span className="text-xs text-muted-foreground">
                  #{row.blockNumber ? hexToNumber(row.blockNumber).toLocaleString() : "—"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default SearchPage;
