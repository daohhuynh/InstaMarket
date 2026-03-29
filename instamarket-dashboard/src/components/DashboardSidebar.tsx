import {
  BarChart3,
  Bookmark,
  BrainCircuit,
  CandlestickChart,
  Landmark,
  Vote,
  WalletCards,
} from "lucide-react";
import type { DashboardTopic, DashboardTopicId, DashboardViewId } from "../types";

const iconMap: Record<DashboardTopicId, typeof BrainCircuit> = {
  ai: BrainCircuit,
  macro: Landmark,
  elections: Vote,
  crypto: CandlestickChart,
};

interface DashboardSidebarProps {
  topics: DashboardTopic[];
  activeTopic: DashboardTopicId;
  activeView: DashboardViewId;
  portfolioCount: number;
  savedCount: number;
  onSelect: (topicId: DashboardTopicId) => void;
  onSelectView: (view: DashboardViewId) => void;
}

export function DashboardSidebar({
  topics,
  activeTopic,
  activeView,
  portfolioCount,
  savedCount,
  onSelect,
  onSelectView,
}: DashboardSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-heading">Workspace</div>
      <div className="sidebar-list sidebar-list-tight">
        <button
          type="button"
          className={`sidebar-item sidebar-mode-item ${
            activeView === "dashboard" ? "is-active" : ""
          }`}
          onClick={() => onSelectView("dashboard")}
          title="Open dashboard boards"
        >
          <span className="sidebar-icon">
            <BarChart3 size={18} />
          </span>
          <span>
            <strong>Dashboards</strong>
            <small>Signal boards and category views</small>
          </span>
        </button>
        <button
          type="button"
          className={`sidebar-item sidebar-mode-item ${
            activeView === "portfolio" ? "is-active" : ""
          }`}
          onClick={() => onSelectView("portfolio")}
          title="Open live portfolio"
        >
          <span className="sidebar-icon">
            <WalletCards size={18} />
          </span>
          <span>
            <strong>My Portfolio</strong>
            <small>{portfolioCount} live positions</small>
          </span>
        </button>
        <button
          type="button"
          className={`sidebar-item sidebar-mode-item ${
            activeView === "saved" ? "is-active" : ""
          }`}
          onClick={() => onSelectView("saved")}
          title="Open saved watchlist"
        >
          <span className="sidebar-icon">
            <Bookmark size={18} />
          </span>
          <span>
            <strong>Saved</strong>
            <small>{savedCount} tracked markets</small>
          </span>
        </button>
      </div>

      <div className="sidebar-heading sidebar-section-gap">Dashboards</div>
      <div className="sidebar-list">
        {topics.map((topic) => {
          const Icon = iconMap[topic.id] ?? BarChart3;
          return (
            <button
              key={topic.id}
              type="button"
              className={`sidebar-item ${
                activeView === "dashboard" && activeTopic === topic.id ? "is-active" : ""
              }`}
              onClick={() => {
                onSelectView("dashboard");
                onSelect(topic.id);
              }}
              title={topic.label}
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
          <span className="status-live">
            <span className="live-dot" />
            LIVE
          </span>
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
