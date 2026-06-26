const Footer = () => (
  <footer className="border-t border-border bg-card/50 mt-auto">
    <div className="container mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
      <p>© 2026 GYDS Network Explorer. All rights reserved.</p>
      <div className="flex items-center gap-4">
        <span className="font-mono">RPC: rpc.netlifegy.com</span>
        <span className="font-mono">RPC2: rpc2.netlifegy.com</span>
      </div>
    </div>
  </footer>
);

export default Footer;
