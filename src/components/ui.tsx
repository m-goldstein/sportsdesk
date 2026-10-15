import { CSSProperties } from "react";
import { Activity, ArrowUpRight, CircleHelp } from "lucide-react";
import { Forecast, Game, Team } from "@/lib/types";
export const pct = (value: number | null, digits = 0) =>
  value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
export function when(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
) {
  return new Date(value).toLocaleString("en-US", {
    ...options,
    timeZone: "America/New_York",
  });
}
export function TeamMark({
  team,
  small = false,
}: {
  team: Team;
  small?: boolean;
}) {
  return (
    <span
      className={`team-mark ${small ? "small" : ""}`}
      style={{ "--team-color": team.color } as CSSProperties}
    >
      {team.abbr.slice(0, 3)}
    </span>
  );
}
export function StateTag({ game }: { game: Game }) {
  return (
    <span className={`state-tag ${game.state}`}>
      {game.state === "in" && <span className="live-dot" />}
      {game.state === "pre" ? when(game.start) : game.status}
    </span>
  );
}
export function ProbabilityBar({
  game,
  prediction,
}: {
  game: Game;
  prediction: Forecast;
}) {
  return (
    <div className="probability">
      <div className="probability-labels">
        <span>
          {game.home.abbr} <b>{pct(prediction.home)}</b>
        </span>
        <span>
          <b>{pct(prediction.away)}</b> {game.away.abbr}
        </span>
      </div>
      <div className="probability-track">
        <span style={{ width: `${(prediction.home ?? 0.5) * 100}%` }} />
      </div>
    </div>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <CircleHelp size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function PanelTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function ModelChart({ prediction }: { prediction: Forecast }) {
  let cumulative = 0;
  const points = [
    0.5,
    ...prediction.factors.map((f) => {
      cumulative += f.value;
      return 1 / (1 + Math.exp(-cumulative));
    }),
  ];
  const coords = points.map((p, i) => `${30 + i * 95},${145 - p * 125}`);
  return (
    <div className="model-chart">
      <div className="chart-top">
        <span>
          <Activity size={13} /> Probability construction
        </span>
        <span className="accent-text">{pct(prediction.home, 1)} home</span>
      </div>
      <svg
        viewBox="0 0 360 170"
        role="img"
        aria-label="How season record, scoring margin and venue build the home win probability"
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((p) => (
          <g key={p}>
            <line
              x1="25"
              x2="325"
              y1={145 - p * 125}
              y2={145 - p * 125}
              stroke="var(--line)"
              strokeDasharray="3 5"
            />
            <text x="334" y={149 - p * 125} fill="var(--muted)" fontSize="9">
              {p * 100}%
            </text>
          </g>
        ))}
        <path
          d={`M${coords.join(" L")} L315,155 L30,155 Z`}
          fill="url(#chart-fill)"
        />
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={30 + i * 95}
            cy={145 - p * 125}
            r="3.5"
            fill="var(--accent)"
            stroke="var(--panel)"
            strokeWidth="2"
          />
        ))}
        {["Prior", "Record", "Scoring", "Venue"].map((t, i) => (
          <text
            key={t}
            x={30 + i * 95}
            y="167"
            fill="var(--muted)"
            fontSize="10"
            textAnchor="middle"
          >
            {t}
          </text>
        ))}
      </svg>
      <p>Model inputs, not price history. Uncalibrated v1 baseline.</p>
    </div>
  );
}
export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return href.startsWith("https://") ? (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={13} />
    </a>
  ) : (
    <span>{children}</span>
  );
}
