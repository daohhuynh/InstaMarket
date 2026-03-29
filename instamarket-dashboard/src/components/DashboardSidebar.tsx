import { BarChart3, BrainCircuit, CandlestickChart, Landmark, Vote } from "lucide-react";
import type { DashboardTopic, DashboardTopicId } from "../types";

const iconMap: Record<DashboardTopicId, typeof BrainCircuit> = {
  ai: BrainCircuit,
  macro: Landmark,
  elections: Vote,
  crypto: CandlestickChart,
};

interface DashboardSidebarProps {
  topics: DashboardTopic[];
  activeTopic: DashboardTopicId;
  onSelect: (topicId: DashboardTopicId) => void;
}

export function DashboardSidebar({
  topics,
  activeTopic,
  onSelect,
}: DashboardSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-heading">Dashboards</div>
      <div className="sidebar-list">
        {topics.map((topic) => {
          const Icon = iconMap[topic.id] ?? BarChart3;
          return (
            <button
              key={topic.id}
              type="button"
              className={`sidebar-item ${
                activeTopic === topic.id ? "is-active" : ""
              }`}
              onClick={() => onSelect(topic.id)}
            >
              <span className="sidebar-icon">
                <Icon size={18} />
              </span>
              <span>
                <strong>{topic.sidebarLabel}</strong>
                <small>{topic.subtitle}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-footnote">
        <div className="sidebar-footnote-label">System status</div>
        <div className="sidebar-stat-row">
          <span>Mock feeds</span>
          <span className="status-live">LIVE</span>
        </div>
        <div className="sidebar-stat-row">
          <span>Source attribution</span>
          <span>seeded</span>
        </div>
        <div className="sidebar-stat-row">
          <span>Motion engine</span>
          <span>active</span>
        </div>
      </div>
    </aside>
  );
}
