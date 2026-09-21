import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  clearSession,
  dashboardPathFor,
  getStoredSession,
  isFounderSession,
  isPrivilegedSession,
  SESSION_CHANGE_EVENT_NAME,
  signInWithWallet,
  type WalletSession,
} from "@/lib/session";
import { getWalletError } from "@/lib/wallet";

const WalletAuthButton = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<WalletSession | null>(null);
  const [loading, setLoading] = useState(false);

  const isEmbedded = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  useEffect(() => {
    const syncSession = () => setSession(getStoredSession());
    syncSession();
    window.addEventListener(SESSION_CHANGE_EVENT_NAME, syncSession);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT_NAME, syncSession);
  }, []);

  const signIn = async () => {
    if (isEmbedded) {
      const opened = window.open(window.location.href, "_blank", "noopener,noreferrer");
      toast.info("Open the explorer in a new tab", {
        description: opened
          ? "Wallet extensions cannot connect inside Replit's embedded preview."
          : "Allow pop-ups, then open the explorer directly in a browser tab.",
      });
      return;
    }
    setLoading(true);
    try {
      const next = await signInWithWallet();
      setSession(next);
      toast.success(isPrivilegedSession(next) ? `Signed in as ${next.role}` : "Signed in", {
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
    const privileged = isPrivilegedSession(session);
    const panelLabel = isFounderSession(session) ? "Founder Panel" : "Admin Panel";

    return (
      <div className="flex items-center gap-1">
        <Button
          variant={privileged ? "default" : "outline"}
          size="sm"
          className={`gap-1.5 ${privileged ? "shadow-[0_0_16px_hsl(var(--primary)/0.22)]" : "border-primary/30 text-primary hover:bg-primary/10"}`}
          onClick={() => navigate(privileged ? "/admin" : dashboardPathFor(session))}
          title={privileged ? `Open ${panelLabel}` : "Open your dashboard"}
        >
          {privileged ? <ShieldCheck className="w-3.5 h-3.5" /> : <LayoutDashboard className="w-3.5 h-3.5" />}
          <span className="font-mono text-xs hidden sm:inline">
            <span className="font-sans mr-1">{privileged ? panelLabel : "Dashboard"}</span>
            <span className="text-muted-foreground">
              {session.walletAddress.slice(0, 6)}…{session.walletAddress.slice(-4)}
            </span>
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
      <span className="hidden sm:inline">{isEmbedded ? "Open to connect" : "Connect Wallet"}</span>
    </Button>
  );
};

export default WalletAuthButton;
