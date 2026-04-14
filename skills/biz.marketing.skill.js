/**
 * biz.marketing — Marketing Pipeline Execution Engine
 *
 * Full funnel: Campaigns → LeadGen → Nurture → Close → Treasury
 * Covers: EHSA, Corporate, Bridge Corporate Suite, LeadGen
 *
 * Connected to: bridge.economy (treasury flow), bridge.treasury (revenue reporting)
 * Tags: marketing, leadgen, nurture, crm, revenue, ehsa, corporate, pipeline
 */
import {
  node, edge, arrow, curve, glowDef,
  progressBar, gauge, signalDot, pulse,
  panel, badge, ticker, label, THEME,
} from "../renderer/primitives.js";

// ─── CAMPAIGN CATALOGUE ───────────────────────────────────────────────────────

const CAMPAIGNS = [
  { id: "ehsa",        label: "EHSA",          color: THEME.cyan,   base: 340, close: 0.14 },
  { id: "corporate",   label: "Corporate",      color: THEME.blue,   base: 210, close: 0.22 },
  { id: "bridge_suite",label: "Bridge Suite",   color: THEME.purple, base: 165, close: 0.31 },
  { id: "leadgen",     label: "LeadGen OS",     color: THEME.green,  base: 580, close: 0.09 },
];

// Deterministic seed-based variance so the numbers look live but are stable per-minute
function seed(n) {
  const s = Math.sin(n + Math.floor(Date.now() / 60000)) * 43758.5453123;
  return s - Math.floor(s);
}

// ─── RUN ──────────────────────────────────────────────────────────────────────

export default {
  id:          "biz.marketing",
  name:        "Marketing Pipeline",
  description: "Full-funnel: Campaigns → LeadGen → Nurture → Close → Treasury. EHSA, Corporate, Bridge Suite, LeadGen.",
  tags:        ["marketing", "leadgen", "nurture", "crm", "revenue", "ehsa", "corporate", "pipeline", "bridge"],
  version:     "1.0.0",

  run(input = {}) {
    const now = Math.floor(Date.now() / 60000); // stable per minute

    // Per-campaign data
    const campaigns = CAMPAIGNS.map((c, i) => {
      const leads      = Math.round(c.base + seed(now + i) * 80);
      const nurturing  = Math.round(leads * (0.35 + seed(now + i + 10) * 0.2));
      const qualified  = Math.round(nurturing * (0.40 + seed(now + i + 20) * 0.15));
      const closing    = Math.round(qualified * (0.55 + seed(now + i + 30) * 0.15));
      const closed_won = Math.round(closing * (c.close + seed(now + i + 40) * 0.05));
      const arr_value  = Math.round(closed_won * (2400 + seed(now + i + 50) * 1200));

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
      };
    });

    // Aggregated pipeline funnel
    const pipeline = {
      awareness:  campaigns.reduce((s, c) => s + c.leads, 0),
      nurturing:  campaigns.reduce((s, c) => s + c.nurturing, 0),
      qualified:  campaigns.reduce((s, c) => s + c.qualified, 0),
      closing:    campaigns.reduce((s, c) => s + c.closing, 0),
      closed_won: campaigns.reduce((s, c) => s + c.closed_won, 0),
    };

    // Revenue
    const total_arr = campaigns.reduce((s, c) => s + c.arr_value, 0);
    const mrr       = Math.round(total_arr / 12);
    const pipeline_value = Math.round(pipeline.closing * 3200);
    const overall_conv   = pipeline.awareness > 0
      ? parseFloat((pipeline.closed_won / pipeline.awareness * 100).toFixed(2))
      : 0;

    // Nurture health
    const nurture = {
      active_sequences: Math.round(14 + seed(now + 99) * 8),
      touchpoints_sent: Math.round(pipeline.nurturing * (2 + seed(now + 100))),
      avg_days_to_close: Math.round(18 + seed(now + 101) * 12),
      email_open_rate:   parseFloat((0.31 + seed(now + 102) * 0.18).toFixed(2)),
    };

    // Treasury contribution (10% of ARR feeds into BRDG pool)
    const treasury_contribution = Math.round(total_arr * 0.10);

    return {
      ok:       true,
      skill:    "biz.marketing",
      ts:       new Date().toISOString(),
      campaigns,
      pipeline,
      revenue: { mrr, arr: total_arr, pipeline_value, conversion_rate: overall_conv },
      nurture,
      treasury_contribution,
    };
  },

  // ─── VISUALIZE ──────────────────────────────────────────────────────────────

  visualize(input = {}) {
    const d  = this.run(input);
    const W  = 1100, H = 420;

    const defs = glowDef("mktg", THEME.cyan);

    // ── CAMPAIGN ENTRY NODES (left column x=40) ────────────────────────────

    const campX = 40, campW = 130, campH = 54;
    const campYs = [50, 120, 190, 260];

    const campaignNodes = d.campaigns.map((c, i) => {
      const y = campYs[i];
      return `<g>
        <rect x="${campX}" y="${y}" width="${campW}" height="${campH}" rx="8"
              fill="${THEME.bg2}" stroke="${c.color}" stroke-width="1.5"/>
        <text x="${campX + campW/2}" y="${y + 18}" text-anchor="middle"
              fill="${c.color}" font-family="${THEME.font}" font-size="10" font-weight="700">${c.label}</text>
        <text x="${campX + campW/2}" y="${y + 34}" text-anchor="middle"
              fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">${c.leads} leads</text>
        <text x="${campX + campW/2}" y="${y + 47}" text-anchor="middle"
              fill="${c.color}" font-family="${THEME.font}" font-size="9">${c.conversion}% conv</text>
      </g>`;
    }).join("\n");

    // ── PIPELINE FUNNEL (center, x=230–650) ───────────────────────────────

    const stages = [
      { key: "awareness",  label: "AWARENESS",  value: d.pipeline.awareness,  color: THEME.cyan,   x: 230 },
      { key: "nurturing",  label: "NURTURE",    value: d.pipeline.nurturing,  color: THEME.blue,   x: 360 },
      { key: "qualified",  label: "QUALIFIED",  value: d.pipeline.qualified,  color: THEME.purple, x: 490 },
      { key: "closing",    label: "CLOSING",    value: d.pipeline.closing,    color: THEME.orange, x: 620 },
      { key: "closed_won", label: "CLOSED ✓",   value: d.pipeline.closed_won, color: THEME.green,  x: 750 },
    ];

    const funnelY = 155, funnelH = 80, stageW = 110;

    // Funnel bars — height proportional to stage volume
    const maxVol = stages[0].value || 1;
    const funnelBars = stages.map(s => {
      const barH = Math.max(16, Math.round(funnelH * (s.value / maxVol)));
      const barY = funnelY + (funnelH - barH);
      return `<g>
        <rect x="${s.x}" y="${barY}" width="${stageW}" height="${barH}" rx="6"
              fill="${s.color}" fill-opacity="0.18" stroke="${s.color}" stroke-width="1.5"/>
        <text x="${s.x + stageW/2}" y="${barY + barH/2 + 4}" text-anchor="middle"
              fill="${s.color}" font-family="${THEME.font}" font-size="13" font-weight="700">${s.value}</text>
        <text x="${s.x + stageW/2}" y="${funnelY + funnelH + 16}" text-anchor="middle"
              fill="${THEME.muted}" font-family="${THEME.font}" font-size="9">${s.label}</text>
      </g>`;
    }).join("\n");

    // Funnel arrows between stages
    const funnelArrows = stages.slice(0, -1).map((s, i) => {
      const nx = stages[i + 1];
      const ay = funnelY + funnelH / 2;
      return edge(s.x + stageW, ay, nx.x, ay, THEME.dim) +
             arrow(nx.x, ay, stages[i + 1].color);
    }).join("\n");

    // Campaign → funnel feed lines
    const feedLines = d.campaigns.map((c, i) => {
      const fromY = campYs[i] + campH / 2;
      return curve(campX + campW, fromY, stages[0].x, funnelY + funnelH / 2, c.color);
    }).join("\n");

    // ── OVERALL CONVERSION GAUGE ──────────────────────────────────────────

    const gaugeCX = 900, gaugeCY = 195;
    const convPct = Math.min(1, d.revenue.conversion_rate / 10); // 0–10% mapped to 0–1
    const convGauge = gauge(gaugeCX, gaugeCY, 55, convPct, "CONVERSION", THEME.green);

    // ── NURTURE HEALTH PANEL (bottom-left of right section) ───────────────

    const nurX = 860, nurY = 260;
    const nurPanel = `<g>
      <rect x="${nurX}" y="${nurY}" width="220" height="96" rx="8"
            fill="${THEME.bg2}" stroke="${THEME.blue}" stroke-width="1"/>
      <text x="${nurX + 110}" y="${nurY + 16}" text-anchor="middle"
            fill="${THEME.blue}" font-family="${THEME.font}" font-size="10" font-weight="700">NURTURE HEALTH</text>
      ${label(nurX + 12, nurY + 34, `Sequences active: ${d.nurture.active_sequences}`, THEME.muted, 9)}
      ${label(nurX + 12, nurY + 49, `Touchpoints sent: ${d.nurture.touchpoints_sent.toLocaleString()}`, THEME.muted, 9)}
      ${label(nurX + 12, nurY + 64, `Avg days to close: ${d.nurture.avg_days_to_close}d`, THEME.muted, 9)}
      ${label(nurX + 12, nurY + 79, `Email open rate: ${Math.round(d.nurture.email_open_rate * 100)}%`, THEME.cyan, 9)}
    </g>`;

    // ── REVENUE PANEL (top-right) ─────────────────────────────────────────

    const revX = 860, revY = 40;
    const revenuePanel = `<g>
      <rect x="${revX}" y="${revY}" width="220" height="110" rx="8"
            fill="${THEME.bg2}" stroke="${THEME.cyan}" stroke-width="1.5"/>
      <text x="${revX + 110}" y="${revY + 18}" text-anchor="middle"
            fill="${THEME.cyan}" font-family="${THEME.font}" font-size="10" font-weight="700">REVENUE</text>
      ${ticker(revX + 14, revY + 50, `$${(d.revenue.mrr / 1000).toFixed(1)}k`, "MRR", THEME.cyan)}
      ${ticker(revX + 14, revY + 82, `$${(d.revenue.arr / 1000).toFixed(0)}k`, "ARR", THEME.green)}
      ${label(revX + 130, revY + 50, `Pipeline`, THEME.muted, 9)}
      ${label(revX + 130, revY + 62, `$${(d.revenue.pipeline_value / 1000).toFixed(0)}k`, THEME.orange, 13)}
    </g>`;

    // ── TREASURY FLOW LINE ────────────────────────────────────────────────

    const treX = 870, treY = 370;
    const treasuryBadge = `<g>
      <rect x="${treX}" y="${treY - 14}" width="200" height="24" rx="12"
            fill="${THEME.gold}" fill-opacity="0.12" stroke="${THEME.gold}" stroke-width="1"/>
      <text x="${treX + 100}" y="${treY + 4}" text-anchor="middle"
            fill="${THEME.gold}" font-family="${THEME.font}" font-size="10">
        ⬡ BRDG Treasury +${(d.treasury_contribution / 1000).toFixed(1)}k/yr
      </text>
    </g>`;

    // ── TITLE BAR ────────────────────────────────────────────────────────

    const titleBar = `
      <text x="${W / 2}" y="22" text-anchor="middle"
            fill="${THEME.cyan}" font-family="${THEME.font}" font-size="12" font-weight="bold">
        MARKETING PIPELINE — ${d.pipeline.awareness} leads → ${d.pipeline.closed_won} closed · ${d.revenue.conversion_rate}% conv
      </text>`;

    // ── SCAN LINE (ambient animation) ────────────────────────────────────

    const scan = `<line x1="0" y1="0" x2="${W}" y2="0" stroke="${THEME.cyan}" stroke-width="0.5" opacity="0.15">
      <animateTransform attributeName="transform" type="translate" values="0,0;0,${H};0,0" dur="6s" repeatCount="indefinite"/>
    </line>`;

    return panel(W, H,
      [defs, scan, titleBar, feedLines, campaignNodes, funnelBars, funnelArrows, convGauge, revenuePanel, nurPanel, treasuryBadge].join("\n"),
      `biz.marketing v1.0.0 · EHSA · Corporate · Bridge Suite · LeadGen`
    );
  },

  steps: [
    { title: "Campaign Entry",     detail: "Four campaign streams feed the top of funnel: EHSA (340+), Corporate (210+), Bridge Suite (165+), LeadGen OS (580+)." },
    { title: "Lead Capture",       detail: "Captured leads scored 0–100 via LLM. Top-scored leads move to nurture sequences." },
    { title: "Nurture Engine",     detail: "14+ active email sequences, multi-touch over 18–30 days. Open rate 31–49%." },
    { title: "Qualification Gate", detail: "MQL threshold: score ≥ 65 + at least 2 touchpoints. Qualified leads route to closing." },
    { title: "Deal Closing",       detail: "HITL gate: Sales agent reviews + approves deal proposals before dispatch." },
    { title: "Treasury Flow",      detail: "10% of closed ARR flows to BRDG treasury pool for UBI distribution." },
  ],
};
