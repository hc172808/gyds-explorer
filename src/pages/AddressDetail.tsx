import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Wallet, FileCode2, Copy, Check } from "lucide-react";
import { getBalance, getTransactionCount, getCode, weiToEther, hexToNumber } from "@/lib/rpc";
import { useState } from "react";

const AddressDetail = () => {
  const { address } = useParams<{ address: string }>();
  const [copied, setCopied] = useState(false);

  const { data: balance } = useQuery({
    queryKey: ["balance", address],
    queryFn: () => getBalance(address!),
    enabled: !!address,
  });

  const { data: txCount } = useQuery({
    queryKey: ["txCount", address],
    queryFn: () => getTransactionCount(address!),
    enabled: !!address,
  });

  const { data: code } = useQuery({
    queryKey: ["code", address],
    queryFn: () => getCode(address!),
    enabled: !!address,
  });

  const isContract = code && code !== "0x";

  const copyAddress = () => {
    navigator.clipboard.writeText(address ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fields = [
    { label: "Balance", value: balance ? `${weiToEther(balance)} GYDS` : "..." },
    { label: "Transactions", value: txCount ? hexToNumber(txCount).toLocaleString() : "..." },
    { label: "Type", value: isContract ? "Contract" : "Externally Owned Account (EOA)" },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-amber/10">
            {isContract ? <FileCode2 className="w-6 h-6 text-amber" /> : <Wallet className="w-6 h-6 text-amber" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{isContract ? "Contract" : "Address"}</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm font-mono text-muted-foreground break-all">{address}</p>
              <button onClick={copyAddress} className="text-muted-foreground hover:text-primary transition-colors shrink-0">
                {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden mb-8">
          {fields.map((f) => (
            <div key={f.label} className="flex flex-col sm:flex-row border-b border-border last:border-0">
              <div className="px-5 py-3 sm:w-48 text-sm text-muted-foreground bg-secondary/30 shrink-0">{f.label}</div>
              <div className="px-5 py-3 text-sm">{f.value}</div>
            </div>
          ))}
        </div>

        {isContract && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-sm">Contract Bytecode</h2>
            </div>
            <div className="px-5 py-4">
              <pre className="text-xs font-mono text-muted-foreground break-all whitespace-pre-wrap max-h-48 overflow-auto">
                {code}
              </pre>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AddressDetail;
