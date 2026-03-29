import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Dot } from "lucide-react";
import type { ActivityEvent } from "../types";

interface LiveActivityTapeProps {
  events: ActivityEvent[];
}

function eventConfidenceLabel(event: ActivityEvent) {
  if (event.type === "swing") return "High confidence";
  if (event.type === "signal") return "Model signal";
  if (event.type === "bet") return "Execution";
  return "Watchlist";
}

export function LiveActivityTape({ events }: LiveActivityTapeProps) {
  return (
    <section className="activity-panel">
      <div className="section-heading-row activity-heading">
        <div>
          <div className="section-kicker">Execution tape</div>
          <h2>Live flow</h2>
        </div>
        <span className="status-live">
          <span className="live-dot" />
          streaming
        </span>
      </div>

      <div className="activity-list">
        {events.map((event, index) => (
          <motion.article
            key={event.id}
            className="activity-item"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.04 }}
          >
            <div className={`activity-direction ${event.direction}`}>
              {event.direction === "up" ? (
                <ArrowUpRight size={14} />
              ) : event.direction === "down" ? (
                <ArrowDownRight size={14} />
              ) : (
                <Dot size={18} />
              )}
            </div>
            <div className="activity-copy">
              <strong>{event.label}</strong>
              <span className="activity-meta-row">
                <span>{event.source}</span>
                <span className="activity-confidence">{eventConfidenceLabel(event)}</span>
                <span>{event.timestamp}</span>
              </span>
            </div>
            <div className="activity-amount">{event.amount}</div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
