import { useState } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { colors, font } from '../constants/theme';

export interface Point {
  label: string;
  value: number | null;
}

/** Line chart sized to its container. Gaps (null values, e.g. groups below the privacy minimum) break the line. */
export function LineChart({ points, max, color = colors.primary, height = 150, testID }: { points: Point[]; max?: number; color?: string; height?: number; testID?: string }) {
  const [width, setWidth] = useState(300);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.max(120, e.nativeEvent.layout.width));
  const top = Math.max(max ?? 0, ...points.map((p) => p.value ?? 0), 1);
  const padL = 26;
  const padB = 22;
  const innerW = width - padL - 8;
  const innerH = height - padB - 8;
  const x = (i: number) => padL + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => 8 + innerH - (v / top) * innerH;
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length) segments.push(current.join(' '));
      current = [];
    } else current.push(`${x(i)},${y(p.value)}`);
  });
  if (current.length) segments.push(current.join(' '));
  const ticks = [0, Math.round(top / 2), top];
  const every = Math.max(1, Math.ceil(points.length / 5));
  return (
    <View onLayout={onLayout} testID={testID} accessibilityRole="image" accessibilityLabel="Line chart">
      <Svg width={width} height={height}>
        {ticks.map((t) => (
          <G key={t}>
            <Line x1={padL} x2={width - 8} y1={y(t)} y2={y(t)} stroke={colors.border} strokeWidth={1} />
            <SvgText x={0} y={y(t) + 4} fontSize={10} fill={colors.textMuted}>{t}</SvgText>
          </G>
        ))}
        {segments.map((pts, i) => (pts.includes(' ') ? <Polyline key={i} points={pts} fill="none" stroke={color} strokeWidth={2.5} /> : null))}
        {points.map((p, i) => (p.value === null ? null : <Circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill={color} />))}
        {points.map((p, i) => (i % every === 0 ? <SvgText key={i} x={x(i)} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor="middle">{p.label}</SvgText> : null))}
      </Svg>
    </View>
  );
}

/** Horizontal bars with a value label; reads well on narrow screens. */
export function BarList({ rows, max, color = colors.primary, format = (v: number) => String(v) }: { rows: { label: string; value: number | null; note?: string }[]; max?: number; color?: string; format?: (v: number) => string }) {
  const top = Math.max(max ?? 0, ...rows.map((r) => r.value ?? 0), 1);
  return (
    <View style={{ gap: 10 }} testID="bar-list">
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: font.sm, color: colors.text, flexShrink: 1 }} numberOfLines={1}>{r.label}</Text>
            <Text style={{ fontSize: font.sm, color: colors.textMuted, fontWeight: '700' }}>{r.value === null ? 'n/a' : format(r.value)}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.neutralSoft }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: color, width: `${r.value === null ? 0 : Math.min(100, (r.value / top) * 100)}%` }} />
          </View>
          {r.note ? <Text style={{ fontSize: font.xs, color: colors.textMuted }}>{r.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** Five-bucket distribution (Strongly Disagree to Strongly Agree). */
export function Distribution({ counts, labels }: { counts: number[]; labels: string[] }) {
  const top = Math.max(...counts, 1);
  const h = 60;
  return (
    <Svg width="100%" height={h + 18} viewBox={`0 0 ${counts.length * 40} ${h + 18}`} preserveAspectRatio="none">
      {counts.map((c, i) => (
        <G key={i}>
          <Rect x={i * 40 + 6} y={h - (c / top) * h} width={28} height={(c / top) * h} rx={4} fill={colors.primary} opacity={0.85} />
          <SvgText x={i * 40 + 20} y={h + 13} fontSize={9} fill={colors.textMuted} textAnchor="middle">{labels[i]}</SvgText>
        </G>
      ))}
    </Svg>
  );
}

export function ProgressBar({ value, color = colors.primary }: { value: number; color?: string }) {
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.neutralSoft }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: color, width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </View>
  );
}
