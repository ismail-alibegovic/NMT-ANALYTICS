export interface SeatPosition {
  row: number;
  col: number;
  side: "left" | "right";
}

export function seatsPerRow(transportType: "bus" | "flight" | "none"): number {
  if (transportType === "flight") return 6;
  return 4;
}

export function seatToPosition(
  seatNumber: number,
  transportType: "bus" | "flight" | "none"
): SeatPosition | null {
  if (seatNumber < 1) return null;
  const perRow = seatsPerRow(transportType);
  const zeroBased = seatNumber - 1;
  const row = Math.floor(zeroBased / perRow);
  const col = zeroBased % perRow;

  let side: "left" | "right";
  if (transportType === "flight") {
    side = col < 3 ? "left" : "right";
  } else {
    side = col < 2 ? "left" : "right";
  }

  return { row, col, side };
}

export function seatsAreAdjacent(
  a: SeatPosition,
  b: SeatPosition,
  transportType: "bus" | "flight" | "none"
): boolean {
  if (a.row === b.row) {
    const cols = [a.col, b.col].sort((x, y) => x - y);
    const dist = cols[1] - cols[0];

    if (dist === 1) {
      if (transportType === "flight") {
        const aisleCross = (cols[0] === 2 && cols[1] === 3);
        return !aisleCross;
      } else {
        const aisleCross = (cols[0] === 1 && cols[1] === 2);
        return !aisleCross;
      }
    }

    if (dist === 2 && transportType === "bus") {
      return cols[0] === 1 && cols[1] === 3;
    }

    return false;
  }

  return false;
}

export interface GroupSeatingResult {
  status: "unassigned" | "partial" | "together" | "split";
  occupiedSeats: number[];
  components: number;
}

export function computeGroupSeatingStatus(
  occupiedSeatNumbers: number[],
  transportType: "bus" | "flight" | "none",
  totalMemberCount: number
): GroupSeatingResult {
  if (occupiedSeatNumbers.length === 0) {
    return { status: "unassigned", occupiedSeats: [], components: 0 };
  }
  if (occupiedSeatNumbers.length < totalMemberCount) {
    return { status: "partial", occupiedSeats: occupiedSeatNumbers, components: 0 };
  }

  const positions = occupiedSeatNumbers
    .map((s) => seatToPosition(s, transportType))
    .filter((p): p is SeatPosition => p !== null);

  if (positions.length <= 1) {
    return { status: "together", occupiedSeats: occupiedSeatNumbers, components: 1 };
  }

  const adj = new Map<number, number[]>();
  for (let i = 0; i < positions.length; i++) {
    adj.set(i, []);
  }

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (seatsAreAdjacent(positions[i], positions[j], transportType)) {
        adj.get(i)!.push(j);
        adj.get(j)!.push(i);
      }
    }
  }

  const visited = new Set<number>();
  let components = 0;

  for (let i = 0; i < positions.length; i++) {
    if (!visited.has(i)) {
      components++;
      const stack = [i];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (visited.has(node)) continue;
        visited.add(node);
        for (const neighbor of adj.get(node) || []) {
          if (!visited.has(neighbor)) {
            stack.push(neighbor);
          }
        }
      }
    }
  }

  return {
    status: components === 1 ? "together" : "split",
    occupiedSeats: occupiedSeatNumbers,
    components,
  };
}
