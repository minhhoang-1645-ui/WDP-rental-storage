import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { reportPie, type PieDatum } from "@/utils/report-pie";
import { Panel, styles } from "@/operations/ui";

export function ReportPie({
  title,
  description,
  data,
  formatValue = String,
  unit = "lượt đặt",
}: {
  title: string;
  description: string;
  data: PieDatum[];
  formatValue?: (value: number) => string;
  unit?: string;
}) {
  const chart = reportPie(data),
    [selected, setSelected] = useState("");
  const active = chart.slices.find((item) => item.id === selected),
    circumference = 2 * Math.PI * 45;
  return (
    <Panel title={title}>
      <Text style={styles.copy}>{description}</Text>
      {!chart.valid ? (
        <Text style={styles.error}>Chưa đủ số liệu để vẽ biểu đồ.</Text>
      ) : !chart.total ? (
        <Text style={styles.copy}>Chưa có số liệu trong bộ lọc hiện tại.</Text>
      ) : (
        <>
          <View
            style={local.graphic}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Biểu đồ tròn ${title}: tổng ${formatValue(chart.total)} ${unit}`}
          >
            <Svg viewBox="0 0 120 120" width="210" height="210">
              <Circle
                cx={60}
                cy={60}
                r={45}
                fill="none"
                stroke="#edf1f7"
                strokeWidth={19}
              />
              {chart.slices.map((item) => (
                <Circle
                  key={item.id}
                  cx={60}
                  cy={60}
                  r={45}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={active?.id === item.id ? 22 : 19}
                  opacity={active && active.id !== item.id ? 0.35 : 1}
                  strokeDasharray={[
                    item.fraction * circumference,
                    circumference,
                  ]}
                  strokeDashoffset={-item.offset * circumference}
                  transform="rotate(-90 60 60)"
                />
              ))}
            </Svg>
            <View pointerEvents="none" style={local.center}>
              <Text style={local.caption}>{active?.label ?? "Tổng cộng"}</Text>
              <Text style={local.amount}>
                {formatValue(active?.value ?? chart.total)}
              </Text>
              <Text style={local.caption}>{active?.percent ?? unit}</Text>
            </View>
          </View>
          {chart.slices.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === item.id }}
              onPress={() => setSelected(selected === item.id ? "" : item.id)}
              style={[local.legend, selected === item.id && local.selected]}
            >
              <View style={[local.dot, { backgroundColor: item.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{item.label}</Text>
                <Text style={styles.copy}>
                  {formatValue(item.value)} {unit} · {item.percent}
                </Text>
              </View>
            </Pressable>
          ))}
          {chart.slices.some((item) => item.members.length) && (
            <Text style={styles.copy}>
              “Các loại khác” gộp các phần nhỏ. Xem chi tiết từng loại trong
              bảng bên dưới.
            </Text>
          )}
        </>
      )}
    </Panel>
  );
}
const local = StyleSheet.create({
  graphic: { width: 210, height: 210, alignSelf: "center" },
  center: {
    position: "absolute",
    left: 43,
    right: 43,
    top: 48,
    bottom: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  caption: { fontSize: 12, color: "#65758a", textAlign: "center" },
  amount: {
    fontSize: 17,
    fontWeight: "700",
    color: "#243d52",
    textAlign: "center",
  },
  legend: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  selected: { backgroundColor: "#edf4f7", borderColor: "#96adbf" },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
