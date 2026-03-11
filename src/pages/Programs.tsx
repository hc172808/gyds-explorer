import { motion } from "framer-motion";
import { FileCode2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const Programs = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-cyan/10">
            <FileCode2 className="w-6 h-6 text-cyan" />
          </div>
          <h1 className="text-2xl font-bold">Programs</h1>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground mb-2">Deployed smart contracts and programs on the GYDS network.</p>
          <p className="text-sm text-muted-foreground">Search for a contract address to view its bytecode and interactions.</p>
        </div>
      </motion.div>
    </div>
  );
};

export default Programs;
