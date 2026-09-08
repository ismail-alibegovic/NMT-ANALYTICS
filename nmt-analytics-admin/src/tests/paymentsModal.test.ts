import { describe, expect, it } from "vitest";
import { calculateRemainingFromSuccessfulPayments } from "../utils/business";

describe("PaymentsModal finance summary", () => {
  it("derives remaining from successful payments, not the stale reservation snapshot", () => {
    const remaining = calculateRemainingFromSuccessfulPayments(1500, [
      {
        amount: 300,
        status: "succeeded",
      },
      {
        amount: 100,
        status: "pending",
      },
    ]);

    expect(remaining).toBe(1200);
  });
});
