import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NetworkProvider } from "@/contexts/NetworkContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Index from "./pages/Index";
import BlockDetail from "./pages/BlockDetail";
import TxDetail from "./pages/TxDetail";
import AddressDetail from "./pages/AddressDetail";
import Programs from "./pages/Programs";
import Supply from "./pages/Supply";
import Inspector from "./pages/Inspector";
import SimD296 from "./pages/SimD296";
import FeatureGates from "./pages/FeatureGates";
import TermsOfService from "./pages/TermsOfService";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <NetworkProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/block/:id" element={<BlockDetail />} />
                <Route path="/tx/:hash" element={<TxDetail />} />
                <Route path="/address/:address" element={<AddressDetail />} />
                <Route path="/programs" element={<Programs />} />
                <Route path="/supply" element={<Supply />} />
                <Route path="/inspector" element={<Inspector />} />
                <Route path="/simd-296" element={<SimD296 />} />
                <Route path="/feature-gates" element={<FeatureGates />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BrowserRouter>
      </NetworkProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
