const groundFloorAliases = ['Ground', 'Trệt', 'Tầng trệt'];

export function canonicalUnitFloor(floor: string | null) {
  const value = floor?.trim();
  if (!value) return null;
  return groundFloorAliases.some(alias => alias.toLocaleLowerCase('vi') === value.toLocaleLowerCase('vi')) ? 'Tầng trệt' : value;
}

export function unitFloorValues(floor: string) {
  return canonicalUnitFloor(floor) === 'Tầng trệt' ? groundFloorAliases : [floor];
}

export function canonicalUnitZone(zone: string | null) {
  return zone?.trim().toLocaleUpperCase('vi') || null;
}
