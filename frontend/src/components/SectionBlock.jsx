import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

function SectionBlock({ title, items, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/35">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="focus-ring flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-semibold text-slate-100">{title}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-xs text-slate-300"
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-slate-700/70 px-4 pb-4 pt-3 text-sm text-slate-200">
              {items?.length ? (
                items.map((item, index) => (
                  <p key={`${title}-${index}`} className="leading-6">
                    {index + 1}. {item}
                  </p>
                ))
              ) : (
                <p className="text-slate-400">No content generated.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export default SectionBlock;
