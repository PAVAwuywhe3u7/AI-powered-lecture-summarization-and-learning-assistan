import { motion } from "framer-motion";

function Loader({ label = "Processing..." }) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-300">
      <motion.span
        className="h-4 w-4 rounded-full border-2 border-accent border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
      />
      <span>{label}</span>
    </div>
  );
}

export default Loader;
