export type PieDatum = {
  id: string;
  label: string;
  value: number;
  color?: string;
};
export const pieColors = [
  "#355a8d",
  "#398779",
  "#c78138",
  "#8961a6",
  "#b95f68",
  "#477d9c",
  "#727d37",
  "#755f50",
];
export function piePercent(value: number) {
  return value > 0 && value < 0.1
    ? "<0,1%"
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
        value,
      ) + "%";
}
/** Keep the entire total, including categories grouped in the last slice. Never chart incomplete money. */
export function reportPie(data: PieDatum[], limit = 5) {
  const valid = data.every(
    (item) => Number.isSafeInteger(item.value) && item.value >= 0,
  );
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!valid || !Number.isSafeInteger(total))
    return { valid: false, total: 0, slices: [] };
  const positive = data
    .map((item, index) => ({
      ...item,
      color: item.color ?? pieColors[index % pieColors.length],
      members: [] as string[],
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "vi"));
  const shown =
    positive.length > limit + 1
      ? [
          ...positive.slice(0, limit),
          {
            id: "__other",
            label: "Các loại khác",
            value: positive
              .slice(limit)
              .reduce((sum, item) => sum + item.value, 0),
            color: "#7c8999",
            members: positive.slice(limit).map((item) => item.label),
          },
        ]
      : positive;
  let offset = 0;
  return {
    valid: true,
    total,
    slices: shown.map((item) => {
      const fraction = item.value / total,
        start = offset;
      offset += fraction;
      return {
        ...item,
        fraction,
        offset: start,
        percent: piePercent(fraction * 100),
      };
    }),
  };
}
