import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const bots = [
  {
    id: "homework-bot",
    title: "Homework Bot",
    description: "Upload screenshots or typed questions and get structured, step-by-step solutions.",
    to: "/homework-bot",
    cta: "Open Homework Bot",
    chips: ["Image + text", "Step-by-step", "Math/Coding/Science"],
  },
  {
    id: "chat-bot",
    title: "Chat Bot",
    description: "Ask summary-grounded questions for revision, definitions, and concept clarity.",
    to: "/chat-bot",
    cta: "Open Chat Bot",
    chips: ["Context-locked", "Revision-focused", "Definition breakdowns"],
  },
];

function BotsSection() {
  return (
    <section className="bots-module card card-elevated p-5 sm:p-6">
      <div className="space-y-1">
        <p className="bots-module-eyebrow">Bots Module</p>
        <h2 className="bots-module-title">Choose Your Assistant</h2>
        <p className="bots-module-subtitle">
          Use Homework Bot for problem solving and Chat Bot for summary-grounded learning.
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {bots.map((bot, index) => (
          <motion.article
            key={bot.id}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className={`bots-card bots-card-${bot.id}`}
          >
            <div className="space-y-2">
              <h3 className="bots-card-title">{bot.title}</h3>
              <p className="bots-card-description">{bot.description}</p>
            </div>

            <div className="bots-card-chips">
              {bot.chips.map((chip) => (
                <span key={chip} className="chip-btn">
                  {chip}
                </span>
              ))}
            </div>

            <Link to={bot.to} className="secondary-btn w-fit">
              {bot.cta}
            </Link>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

export default BotsSection;
