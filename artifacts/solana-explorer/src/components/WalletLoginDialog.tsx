import { useState } from "react";
import { Wallet, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { requestNonce, verifySignature, setStoredToken } from "@/lib/featureGateApi";

interface WalletLoginDialogProps {
  onLoginSuccess: (walletAddress: string, label: string) => void;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

const WalletLoginDialog = ({ onLoginSuccess }: WalletLoginDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [step, setStep] = useState<"connect" | "sign">("connect");
  const [signMessage, setSignMessage] = useState("");
  const [pendingAddress, setPendingAddress] = useState("");

  const connectWallet = async () => {
    setLoading(true);
    try {
      if (!window.ethereum) {
        toast.error("No wallet detected", { description: "Please install a GYDS-compatible wallet extension" });
        return;
      }
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts || accounts.length === 0) {
        toast.error("No accounts found");
        return;
      }
      await initiateAuth(accounts[0]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to connect wallet";
      toast.error("Connection failed", { description: message });
    } finally {
      setLoading(false);
    }
  };

  const connectManual = async () => {
    if (!manualAddress || !/^0x[a-fA-F0-9]{40}$/.test(manualAddress)) {
      toast.error("Invalid address", { description: "Enter a valid GYDS wallet address (0x...)" });
      return;
    }
    setLoading(true);
    try {
      await initiateAuth(manualAddress);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to authenticate";
      toast.error("Auth failed", { description: message });
    } finally {
      setLoading(false);
    }
  };

  const initiateAuth = async (address: string) => {
    const { message } = await requestNonce(address);
    setPendingAddress(address);
    setSignMessage(message);
    setStep("sign");

    // Auto-sign if wallet extension available
    if (window.ethereum) {
      try {
        setLoading(true);
        const signature = (await window.ethereum.request({
          method: "personal_sign",
          params: [message, address],
        })) as string;
        await completeAuth(address, signature);
      } catch {
        toast.info("Please sign the message to authenticate");
        setLoading(false);
      }
    }
  };

  const completeAuth = async (address: string, signature: string) => {
    const result = await verifySignature(address, signature);
    setStoredToken(result.token);
    toast.success("Admin authenticated", {
      description: `Wallet: ${address.slice(0, 6)}...${address.slice(-4)}`,
    });
    setOpen(false);
    setStep("connect");
    onLoginSuccess(result.walletAddress, result.label);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setStep("connect"); setLoading(false); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-primary/20 text-primary hover:bg-primary/10">
          <Wallet className="w-3.5 h-3.5" />
          Admin Login
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Admin Wallet Login
          </DialogTitle>
          <DialogDescription>
            Connect your authorized GYDS wallet to access admin controls.
          </DialogDescription>
        </DialogHeader>

        {step === "connect" && (
          <div className="space-y-4 pt-2">
            <Button
              onClick={connectWallet}
              disabled={loading}
              className="w-full gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              Connect GYDS Wallet
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or enter manually</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="0x..."
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                className="font-mono text-xs"
              />
              <Button onClick={connectManual} disabled={loading} variant="secondary" size="sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
              </Button>
            </div>
          </div>
        )}

        {step === "sign" && (
          <div className="space-y-4 pt-2">
            <div className="bg-secondary/50 rounded-lg p-3 border border-border">
              <p className="text-xs text-muted-foreground mb-1">Signing message for:</p>
              <p className="font-mono text-xs text-primary break-all">{pendingAddress}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {window.ethereum
                ? "Please approve the signature request in your wallet..."
                : "Sign the message below with your wallet and paste the signature:"}
            </p>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
            {!window.ethereum && !loading && (
              <div className="space-y-2">
                <div className="bg-secondary/30 rounded p-2 max-h-24 overflow-auto">
                  <code className="text-xs break-all">{signMessage}</code>
                </div>
                <Input
                  placeholder="Paste signature here (0x...)"
                  className="font-mono text-xs"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      const sig = (e.target as HTMLInputElement).value;
                      setLoading(true);
                      try {
                        await completeAuth(pendingAddress, sig);
                      } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : "Verification failed";
                        toast.error("Verification failed", { description: message });
                      } finally {
                        setLoading(false);
                      }
                    }
                  }}
                />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WalletLoginDialog;
