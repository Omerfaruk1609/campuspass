import React, { useMemo } from "react";

/**
 * Harici paket bağımlılığı olmadan saf SVG ile oluşturulmuş responsive çubuk ve karşılaştırma grafiği.
 */
export function SimpleBarChart({
  data = [],
  xKey = "title",
  series = [
    { key: "registeredCount", label: "Kayıt", color: "#3b82f6" },
    { key: "attendedCount", label: "Katılım", color: "#10b981" },
  ],
  height = 220,
}) {
  const chartData = useMemo(() => {
    return Array.isArray(data) ? data.slice(0, 10) : [];
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="chart-empty-state">
        <p>Grafik için yeterli etkinlik verisi bulunmuyor.</p>
      </div>
    );
  }

  // En yüksek değeri bul
  let maxVal = 10;
  chartData.forEach((item) => {
    series.forEach((s) => {
      const v = Number(item[s.key] || 0);
      if (v > maxVal) maxVal = v;
    });
  });

  const width = 600;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 45;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const barGroupWidth = plotWidth / chartData.length;
  const barWidth = Math.max(6, Math.min(22, (barGroupWidth - 12) / series.length));

  return (
    <div className="analytics-chart-container">
      <div className="chart-legend">
        {series.map((s) => (
          <div key={s.key} className="legend-item">
            <span
              className="legend-color-dot"
              style={{ backgroundColor: s.color }}
            />
            <span className="legend-label">{s.label}</span>
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="analytics-svg-chart"
        aria-label="Etkinlik Kayıt ve Katılım Karşılaştırma Grafiği"
      >
        {/* Yatay Kılavuz Çizgileri */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
          const y = paddingTop + plotHeight * (1 - pct);
          const val = Math.round(maxVal * pct);
          return (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                stroke="#1e293b"
                strokeDasharray="3 3"
              />
              <text
                x={paddingLeft - 8}
                y={y + 4}
                textAnchor="end"
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Barlar */}
        {chartData.map((item, groupIdx) => {
          const groupCenterX =
            paddingLeft + groupIdx * barGroupWidth + barGroupWidth / 2;
          const totalSeriesWidth = series.length * barWidth + (series.length - 1) * 2;
          const startX = groupCenterX - totalSeriesWidth / 2;

          return (
            <g key={groupIdx} className="bar-group">
              {series.map((s, sIdx) => {
                const val = Number(item[s.key] || 0);
                const barH = maxVal > 0 ? (val / maxVal) * plotHeight : 0;
                const barX = startX + sIdx * (barWidth + 2);
                const barY = paddingTop + plotHeight - barH;

                return (
                  <rect
                    key={s.key}
                    x={barX}
                    y={barY}
                    width={barWidth}
                    height={barH}
                    rx="3"
                    fill={s.color}
                  >
                    <title>{`${item[xKey] || item.fullTitle}: ${s.label} = ${val}`}</title>
                  </rect>
                );
              })}

              {/* X Ekseni Etiketi */}
              <text
                x={groupCenterX}
                y={height - paddingBottom + 16}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
              >
                {String(item[xKey] || `Etkinlik #${item.eventId}`).slice(0, 10)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
