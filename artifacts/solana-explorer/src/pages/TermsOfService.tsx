import { motion } from "framer-motion";
import { FileText, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const TermsOfService = () => {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Terms of Service</h1>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-6 text-sm text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">1. Acceptance of Terms</h2>
            <p>By accessing and using the GYDS Network Explorer, you agree to be bound by these Terms of Service. If you do not agree, please do not use the service.</p>
          </section>
          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">2. Use of Service</h2>
            <p>The GYDS Explorer provides blockchain data for informational purposes. All data is sourced directly from the GYDS blockchain network and is provided "as is" without warranty.</p>
          </section>
          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">3. Data Accuracy</h2>
            <p>While we strive for accuracy, blockchain data may be subject to network delays, reorganizations, or other factors. Users should verify critical data independently.</p>
          </section>
          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">4. Privacy</h2>
            <p>Blockchain data is public by nature. The Explorer does not collect personal information beyond standard web analytics. All transaction and address data displayed is publicly available on the GYDS network.</p>
          </section>
          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">5. Limitations</h2>
            <p>The GYDS Explorer is not responsible for any losses arising from the use of displayed data. This service does not provide financial, legal, or investment advice.</p>
          </section>
          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">6. Changes</h2>
            <p>We reserve the right to modify these terms at any time. Continued use constitutes acceptance of any changes.</p>
          </section>
        </div>
      </motion.div>
    </div>
  );
};

export default TermsOfService;
