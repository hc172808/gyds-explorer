import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRightLeft, CheckCircle, XCircle } from "lucide-react";
import { getTransaction, getTransactionReceipt, hexToNumber, gweiFromWei, formatTimestamp } from "@/lib/rpc";
import { weiToGyds } from "@/lib/coins";
import { getBlock } from "@/lib/rpc";

const TxDetail = () => {
  const { hash } = useParams<{ hash: string }>();

  const { data: tx, isLoading } = useQuery({
    queryKey: ["tx", hash],
    queryFn: () => getTransaction(hash!),
    enabled: !!hash,
  });

  const { data: receipt } = useQuery({
    queryKey: ["receipt", hash],
    queryFn: () => getTransactionReceipt(hash!),
    enabled: !!hash,
  });

  const { data: block } = useQuery({
    queryKey: ["txBlock", tx?.blockHash],
    queryFn: () => getBlock(tx!.blockHash, false),
    enabled: !!tx?.blockHash,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-secondary rounded w-1/3" />
          <div className="h-64 bg-secondary rounded" />
        </div>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground">Transaction not found</p>
      </div>
    );
  }

  const isSuccess = receipt?.status === "0x1";
  const fields = [
    { label: "Transaction Hash", value: tx.hash, mono: true },
    {
      label: "Status",
      value: receipt ? (isSuccess ? "Success" : "Failed") : "Pending",
      custom: receipt ? (
        <span className={`inline-flex items-center gap-1 text-sm ${isSuccess ? "text-primary" : "text-destructive"}`}>
          {isSuccess ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {isSuccess ? "Success" : "Failed"}
        </span>
      ) : <span className="text-amber text-sm">Pending</span>,
    },
    { label: "Block", value: hexToNumber(tx.blockNumber).toLocaleString(), link: `/block/${hexToNumber(tx.blockNumber)}` },
    { label: "Timestamp", value: block ? formatTimestamp(block.timestamp) : "..." },
    { label: "From", value: tx.from, mono: true, link: `/address/${tx.from}` },
    { label: "To", value: tx.to ?? "Contract Creation", mono: true, link: tx.to ? `/address/${tx.to}` : undefined },
    { label: "Value", value: `${weiToGyds(tx.value)} GYDS` },
    { label: "Gas Price", value: `${gweiFromWei(tx.gasPrice)} Gwei` },
    { label: "Gas Used", value: receipt ? hexToNumber(receipt.gasUsed).toLocaleString() : "..." },
    { label: "Nonce", value: hexToNumber(tx.nonce).toString() },
    { label: "Input Data", value: tx.input === "0x" ? "—" : tx.input, mono: true },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-cyan/10">
            <ArrowRightLeft className="w-6 h-6 text-cyan" />
          </div>
          <h1 className="text-2xl font-bold">Transaction Details</h1>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {fields.map((f) => (
            <div key={f.label} className="flex flex-col sm:flex-row border-b border-border last:border-0">
              <div className="px-5 py-3 sm:w-48 text-sm text-muted-foreground bg-secondary/30 shrink-0">{f.label}</div>
              <div className={`px-5 py-3 text-sm break-all ${f.mono ? "font-mono" : ""}`}>
                {"custom" in f && f.custom ? f.custom : f.link ? (
                  <Link to={f.link} className="text-primary hover:underline">{f.value}</Link>
                ) : f.value}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default TxDetail;
