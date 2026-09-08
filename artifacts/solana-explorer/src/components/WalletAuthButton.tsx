import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clearSession, dashboardPathFor, getStoredSession, signInWithWallet, type WalletSession } from "@/lib/session";
import { getWalletError } from "@/lib/wallet";

const WalletAuthButton = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<WalletSession | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSession(getStoredSession());
  }, []);

  const signIn = async () => {
    setLoading(true);
    try {
      const next = await signInWithWallet();
      setSession(next);
      toast.success(next.role === "admin" ? "Signed in as admin" : "Signed in", {
        description: `${next.walletAddress.slice(0, 6)}…${next.walletAddress.slice(-4)}`,
      });
      navigate(dashboardPathFor(next));
    } catch (error) {
      toast.error("Sign-in failed", { description: getWalletError(error) || (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    clearSession();
    setSession(null);
    toast.success("Signed out");
    navigate("/");
  };

  if (session) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => navigate(dashboardPathFor(session))}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span className="font-mono text-xs hidden sm:inline">
            {session.walletAddress.slice(0, 6)}…{session.walletAddress.slice(-4)}
          </span>
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut} title="Sign out">
          <LogOut className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={signIn} disabled={loading}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline">Connect Wallet</span>
    </Button>
  );
};

export default WalletAuthButton;
