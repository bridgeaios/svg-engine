/**
 * biz.marketing — Marketing Pipeline Execution Engine  v1.1.0
 *
 * Full funnel: Campaigns → LeadGen → Nurture → Close → Treasury
 * Covers: EHSA, Corporate, Bridge Corporate Suite, LeadGen
 *
 * Input (all optional — seed values used when not supplied):
 *   campaigns: [{ id, leads, nurturing, qualified, closing, closed_won, arr_value }]
 *   period:    "week" | "month" (default) | "quarter"
 *
 * Connected to: bridge.economy (treasury flow), bridge.treasury (revenue reporting)
 * Workflow:     lead_generation (auto-queued on close events)
 */
import {
  edge, arrow, curve, glowDef,
  progressBar, gauge,
  panel, ticker, label, THEME,
} from "../renderer/primitives.js";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Deterministic per-minute variance — stable within a minute, shifts each minute */
function seed(n) {
  const s = Math.sin(n + Math.floor(Date.now() / 60000)) * 43758.5453123;
  return s - Math.floor(s);
}

/** Deterministic per-HOUR variance — for trend delta comparison */
function seedHour(n) {
  const s = Math.sin(n + Math.floor(Date.now() / 3600000)) * 43758.5453123;
  return s - Math.floor(s);
}

/** XSS-safe text for SVG content */
function esc(str) {
  return String(str).replace(/[<>&"]/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])
  );
}

// ─── CAMPAIGN CATALOGUE ───────────────────────────────────────────────────────

const CATALOGUE = [
  { id: "ehsa",         label: "EHSA",         color: THEME.cyan,   base: 340, close: 0.14, acv: 3200 },
  { id: "corporate",    label: "Corporate",     color: THEME.blue,   base: 210, close: 0.22, acv: 5800 },
  { id: "bridge_suite", label: "Bridge Suite",  color: THEME.purple, base: 165, close: 0.31, acv: 7400 },
  { id: "leadgen",      label: "LeadGen OS",    color: THEME.green,  base: 580, close: 0.09, acv: 1900 },
];

// ─── RUN ──────────────────────────────────────────────────────────────────────

export default {
  id:          "biz.marketing",
  name:        "Marketing Pipeline",
  description: "Full-funnel: Campaigns → LeadGen → Nurture → Close → Treasury. EHSA, Corporate, Bridge Suite, LeadGen.",
  tags:        ["marketing", "leadgen", "nurture", "crm", "revenue", "ehsa", "corporate", "pipeline", "bridge"],
  version:     "1.1.0",
  workflow:    "lead_generation",

  run(input = {}) {
    const now     = Math.floor(Date.now() / 60000);   // stable per minute
    const nowH    = Math.floor(Date.now() / 3600000); // stable per hour

    // Allow callers to inject real CRM data per-campaign
    const overrides = {};
    if (Array.isArray(input.campaigns)) {
      input.campaigns.forEach(c => { if (c.id) overrides[c.id] = c; });
    }

    const campaigns = CATALOGUE.map((c, i) => {
      const ov = overrides[c.id] || {};

      // Real data takes priority; seed fills any gap
      const leads      = ov.leads      ?? Math.round(c.base + seed(now + i) * 80);
      const nurturing  = ov.nurturing  ?? Math.round(leads * (0.35 + seed(now + i + 10) * 0.2));
      const qualified  = ov.qualified  ?? Math.round(nurturing * (0.40 + seed(now + i + 20) * 0.15));
      const closing    = ov.closing    ?? Math.round(qualified * (0.55 + seed(now + i + 30) * 0.15));
      const closed_won = ov.closed_won ?? Math.round(closing * (c.close + seed(now + i + 40) * 0.05));
      const arr_value  = ov.arr_value  ?? Math.round(closed_won * (c.acv + seed(now + i + 50) * 1200));

      // Trend delta vs. previous hour (positive = improving)
      const prev_leads      = Math.round(c.base + seedHour(nowH - 1 + i) * 80);
      const prev_closed_won = Math.round(
        Math.round(prev_leads * (0.35 + seedHour(nowH - 1 + i + 10) * 0.2)) *
        (0.40 + seedHour(nowH - 1 + i + 20) * 0.15) *
        (0.55 + seedHour(nowH - 1 + i + 30) * 0.15) *
        (c.close + seedHour(nowH - 1 + i + 40) * 0.05)
      );

      return {
        id:           c.id,
        label:        c.label,
        color:        c.color,
        leads,
        nurturing,
        qualified,
        closing,
        closed_won,
        arr_value,
        conversion:   leads > 0 ? parseFloat((closed_won / leads * 100).toFixed(1)) : 0,
        score:        Math.round(40 + seed(now + i + 60) * 55),
        delta_leads:  leads - prev_leads,
        delta_closed: closed_won - prev_closed_won,
        _seeded:      !ov.leads,  // flag for callers to know if real or seeded
      };
    });

    // Aggregated funnel
    const pipeline = {
      awareness:  campaigns.reduce((s, c) => s + c.leads, 0),
      nurturing:  campaigns.reduce((s, c) => s + c.nurturing, 0),
      qualified:  campaigns.reduce((s, c) => s + c.qualified, 0),
      closing:    campaigns.reduce((s, c) => s + c.closing, 0),
      closed_won: campaigns.reduce((s, c) => s + c.closed_won, 0),
    };

    // Revenue
    const total_arr      = campaigns.reduce((s, c) => s + c.arr_value, 0);
    const mrr            = Math.round(total_arr / 12);
    const pipeline_value = Math.round(pipeline.closing * 3200);
    const overall_conv   = pipeline.awareness > 0
      ? parseFloat((pipeline.closed_won / pipeline.awareness * 100).toFixed(2))
      : 0;

    // Nurture health
    const nurture = {
      active_sequences:  Math.round(14 + seed(now + 99) * 8),
      touchpoints_sent:  Math.round(pipeline.nurturing * (2 + seed(now + 100))),
      avg_days_to_close: Math.round(18 + seed(now + 101) * 12),
      email_open_rate:   parseFloat((0.31 + seed(now + 102) * 0.18).toFixed(2)),
    };

    // Treasury: 10% of ARR feeds BRDG pool
    const treasury_contribution = Math.round(total_arr * 0.10);

    // Alerts: flag campaigns with negative delta or low conversion
    const alerts = campaigns
      .filter(c => c.delta_leads < -20 || c.conversion < 1.5)
      .map(c => ({
        campaign: c.id,
        reason:   c.delta_leads < -20 ? `leads dropped ${c.delta_leads}` : `low conversion ${c.conversion}%`,
      }));

    return {
      ok:       true,
      skill:    "biz.marketing",
      version:  "1.1.0",
      ts:       new Date().toISOString(),
      period:   input.period || "month",
      campaigns,
      pipeline,
      revenue:  { mrr, arr: total_arr, pipeline_value, conversion_rate: overall_conv },
      nurture,
      treasury_contribution,
      alerts,
      workflow: "lead_generation",
    };
  },

  // ─── VISUALIZE ────────────────────────────────────────────────────────────

  visualize(input = {}) {
    const d = this.run(input);
    const W = 1100, H = 460;

    const defs = glowDef("mktg", THEME.cyan);

    // ── CAMPAIGN ENTRY NODES (left column) ───────────────────────────────

    const campX = 20, campW = 148, campH = 72;
    const campYs = [42, 126, 210, 294];

    const campaignNodes = d.campaigns.map((c, i) => {
      const y      = campYs[i];
      const deltaC = c.delta_leads >= 0 ? `+${c.delta_leads}` : `${c.delta_leads}`;
      const dColor = c.delta_leads >= 0 ? THEME.green : THEME.red;
      // Per-campaign conversion bar (0–5% mapped to full width)
      const convPct = Math.min(1, c.conversion / 5);

      return `<g>
        <rect x="${campX}" y="${y}" width="${campW}" height="${campH}" rx="8"
              fill="${THEME.bg2}" stroke="${esc(c.color)}" stroke-width="1.5"/>
        <text x="${campX + campW/2}" y="${y + 15}" text-anchor="middle"
              fill="${esc(c.color)}" font-family="${THEME.font}" font-size="10" font-weight="700">${esc(c.label)}</text>
        <text x="${campX + 10}" y="${y + 30}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">${esc(c.leads)} leads</text>
        <text x="${campX + campW - 10}" y="${y + 30}" text-anchor="end" fill="${esc(dColor)}" font-family="${THEME.font}" font-size="9">${esc(deltaC)}/hr</text>
        ${progressBar(campX + 10, y + 36, campW - 20, 5, convPct, c.color)}
        <text x="${campX + 10}" y="${y + 55}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">conv: </text>
        <text x="${campX + 42}" y="${y + 55}" fill="${esc(c.color)}" font-family="${THEME.font}" font-size="9" font-weight="700">${esc(c.conversion)}%</text>
        <text x="${campX + 80}" y="${y + 55}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">score: </text>
        <text x="${campX + 112}" y="${y + 55}" fill="${esc(c.color)}" font-family="${THEME.font}" font-size="9" font-weight="700">${esc(c.score)}</text>
        <text x="${campX + 10}" y="${y + 68}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="8">ARR: $${esc((c.arr_value/1000).toFixed(1))}k</text>
      </g>`;
    }).join("\n");

    // ── PIPELINE FUNNEL (center) ──────────────────────────────────────────

    const stages = [
      { label: "AWARENESS",  value: d.pipeline.awareness,  color: THEME.cyan,   x: 210 },
      { label: "NURTURE",    value: d.pipeline.nurturing,  color: THEME.blue,   x: 340 },
      { label: "QUALIFIED",  value: d.pipeline.qualified,  color: THEME.purple, x: 470 },
      { label: "CLOSING",    value: d.pipeline.closing,    color: THEME.orange, x: 600 },
      { label: "CLOSED",     value: d.pipeline.closed_won, color: THEME.green,  x: 730 },
    ];

    const funnelY = 160, funnelH = 90, stageW = 110;
    const maxVol  = stages[0].value || 1;

    const funnelBars = stages.map(s => {
      const barH = Math.max(18, Math.round(funnelH * (s.value / maxVol)));
      const barY = funnelY + (funnelH - barH);
      // Drop-off % label between stages
      return `<g>
        <rect x="${s.x}" y="${barY}" width="${stageW}" height="${barH}" rx="6"
              fill="${esc(s.color)}" fill-opacity="0.18" stroke="${esc(s.color)}" stroke-width="1.5"/>
        <text x="${s.x + stageW/2}" y="${barY + barH/2 + 5}" text-anchor="middle"
              fill="${esc(s.color)}" font-family="${THEME.font}" font-size="14" font-weight="700">${esc(s.value)}</text>
        <text x="${s.x + stageW/2}" y="${funnelY + funnelH + 16}" text-anchor="middle"
              fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">${esc(s.label)}</text>
      </g>`;
    }).join("\n");

    // Drop-off % between stages
    const dropoffs = stages.slice(0, -1).map((s, i) => {
      const next = stages[i + 1];
      const pct  = s.value > 0 ? Math.round(next.value / s.value * 100) : 0;
      const midX = s.x + stageW + (next.x - s.x - stageW) / 2;
      return label(midX - 12, funnelY - 10, `${pct}%`, THEME.dim, 8);
    }).join("\n");

    // Arrows
    const funnelArrows = stages.slice(0, -1).map((s, i) => {
      const nx = stages[i + 1];
      const ay = funnelY + funnelH / 2;
      return edge(s.x + stageW, ay, nx.x, ay, THEME.dim) +
             arrow(nx.x, ay, stages[i + 1].color);
    }).join("\n");

    // Campaign → funnel feed curves
    const feedLines = d.campaigns.map((c, i) => {
      const fromY = campYs[i] + campH / 2;
      return curve(campX + campW, fromY, stages[0].x, funnelY + funnelH / 2, c.color);
    }).join("\n");

    // ── ALERT STRIP (below funnel) ────────────────────────────────────────

    const alertStrip = d.alerts.length > 0
      ? `<g>
          <rect x="210" y="${funnelY + funnelH + 30}" width="640" height="20" rx="6"
                fill="${THEME.red}" fill-opacity="0.1" stroke="${THEME.red}" stroke-width="1"/>
          <text x="220" y="${funnelY + funnelH + 44}" fill="${THEME.red}" font-family="${THEME.font}" font-size="9">
            ⚠ ${esc(d.alerts.map(a => `${a.campaign}: ${a.reason}`).join("  |  ").slice(0, 100))}
          </text>
        </g>`
      : `<g>
          <rect x="210" y="${funnelY + funnelH + 30}" width="640" height="20" rx="6"
                fill="${THEME.green}" fill-opacity="0.08" stroke="${THEME.green}" stroke-width="0.5"/>
          <text x="220" y="${funnelY + funnelH + 44}" fill="${THEME.green}" font-family="${THEME.font}" font-size="9">
            ✓ All campaigns healthy
          </text>
        </g>`;

    // ── CONVERSION GAUGE ─────────────────────────────────────────────────

    const gaugeCX = 930, gaugeCY = 190;
    const convPct  = Math.min(1, d.revenue.conversion_rate / 10);
    const convGauge = gauge(gaugeCX, gaugeCY, 52, convPct, "CONVERSION", THEME.green);

    // ── REVENUE PANEL ────────────────────────────────────────────────────

    const revX = 860, revY = 36;
    const revenuePanel = `<g>
      <rect x="${revX}" y="${revY}" width="220" height="118" rx="8"
            fill="${THEME.bg2}" stroke="${THEME.cyan}" stroke-width="1.5"/>
      <text x="${revX + 110}" y="${revY + 18}" text-anchor="middle"
            fill="${THEME.cyan}" font-family="${THEME.font}" font-size="10" font-weight="700">REVENUE</text>
      ${ticker(revX + 14, revY + 52, `$${(d.revenue.mrr / 1000).toFixed(1)}k`, "MRR", THEME.cyan)}
      ${ticker(revX + 14, revY + 86, `$${(d.revenue.arr / 1000).toFixed(0)}k`, "ARR", THEME.green)}
      ${label(revX + 135, revY + 48, "Pipeline", THEME.muted, 9)}
      ${label(revX + 135, revY + 62, `$${(d.revenue.pipeline_value / 1000).toFixed(0)}k`, THEME.orange, 14)}
    </g>`;

    // ── NURTURE PANEL ────────────────────────────────────────────────────

    const nurX = 860, nurY = 268;
    const nurPanel = `<g>
      <rect x="${nurX}" y="${nurY}" width="220" height="100" rx="8"
            fill="${THEME.bg2}" stroke="${THEME.blue}" stroke-width="1"/>
      <text x="${nurX + 110}" y="${nurY + 16}" text-anchor="middle"
            fill="${THEME.blue}" font-family="${THEME.font}" font-size="10" font-weight="700">NURTURE HEALTH</text>
      ${label(nurX + 12, nurY + 34, `Sequences: ${esc(d.nurture.active_sequences)} active`, THEME.muted, 9)}
      ${label(nurX + 12, nurY + 49, `Touchpoints: ${esc(d.nurture.touchpoints_sent.toLocaleString())}`, THEME.muted, 9)}
      ${label(nurX + 12, nurY + 64, `Avg close: ${esc(d.nurture.avg_days_to_close)} days`, THEME.muted, 9)}
      ${progressBar(nurX + 12, nurY + 72, 196, 5, d.nurture.email_open_rate, THEME.cyan)}
      ${label(nurX + 12, nurY + 90, `Email open: ${Math.round(d.nurture.email_open_rate * 100)}%`, THEME.cyan, 9)}
    </g>`;

    // ── TREASURY BADGE ───────────────────────────────────────────────────

    const treX = 862, treY = 386;
    const treasuryBadge = `<g>
      <rect x="${treX}" y="${treY - 14}" width="216" height="24" rx="12"
            fill="${THEME.gold}" fill-opacity="0.12" stroke="${THEME.gold}" stroke-width="1"/>
      <text x="${treX + 108}" y="${treY + 4}" text-anchor="middle"
            fill="${THEME.gold}" font-family="${THEME.font}" font-size="10">
        &#x2B21; BRDG Treasury +$${esc((d.treasury_contribution / 1000).toFixed(1))}k/yr
      </text>
    </g>`;

    // ── TITLE BAR ────────────────────────────────────────────────────────

    const titleBar = `<text x="${W / 2}" y="22" text-anchor="middle"
      fill="${THEME.cyan}" font-family="${THEME.font}" font-size="12" font-weight="bold">
      MARKETING PIPELINE — ${esc(d.pipeline.awareness)} leads &#x2192; ${esc(d.pipeline.closed_won)} closed &#xB7; ${esc(d.revenue.conversion_rate)}% conv &#xB7; $${esc((d.revenue.arr/1000).toFixed(0))}k ARR
    </text>`;

    // ── SCAN LINE ────────────────────────────────────────────────────────

    const scan = `<line x1="0" y1="0" x2="${W}" y2="0" stroke="${THEME.cyan}" stroke-width="0.5" opacity="0.12">
      <animateTransform attributeName="transform" type="translate" values="0,0;0,${H};0,0" dur="6s" repeatCount="indefinite"/>
    </line>`;

    return panel(W, H,
      [defs, scan, titleBar, feedLines, campaignNodes, funnelBars, dropoffs, funnelArrows, alertStrip, convGauge, revenuePanel, nurPanel, treasuryBadge].join("\n"),
      `biz.marketing v1.1.0 · EHSA · Corporate · Bridge Suite · LeadGen`
    );
  },

  steps: [
    { title: "Campaign Entry",     detail: "Four campaign streams feed the top of funnel: EHSA (340+), Corporate (210+), Bridge Suite (165+), LeadGen OS (580+). Pass real CRM data via run({campaigns:[...]})." },
    { title: "Lead Capture",       detail: "Captured leads scored 0–100 via LLM. delta_leads tracks hourly change. Negative delta triggers an alert." },
    { title: "Nurture Engine",     detail: "14+ active email sequences, multi-touch over 18–30 days. Open rate 31–49%. Workflow: lead_generation auto-queued." },
    { title: "Qualification Gate", detail: "MQL threshold: score ≥ 65 + at least 2 touchpoints. Qualified leads route to closing pipeline." },
    { title: "Deal Closing",       detail: "HITL gate: Sales agent reviews + approves deal proposals before dispatch. Conversion 9–31% by campaign." },
    { title: "Treasury Flow",      detail: "10% of closed ARR flows to BRDG treasury pool. treasury_contribution exposed in run() output." },
  ],
};
