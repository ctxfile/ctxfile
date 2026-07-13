import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TokenMeter } from "./TokenMeter";

describe("TokenMeter", () => {
  it("renders an empty meter at zero usage", () => {
    render(<TokenMeter tokensUsed={0} tokenBudget={1000} />);
    const meter = screen.getByRole("meter", { name: "Token budget usage" });
    expect(meter).toHaveAttribute("aria-valuenow", "0");
    const fill = meter.querySelector<HTMLElement>(".token-meter-fill");
    expect(fill).not.toBeNull();
    expect(fill?.style.width).toBe("0%");
  });

  it("fills proportionally at mid usage with correct aria values", () => {
    render(<TokenMeter tokensUsed={450} tokenBudget={1000} />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "1000");
    expect(meter).toHaveAttribute("aria-valuenow", "450");
    expect(meter.querySelector<HTMLElement>(".token-meter-fill")?.style.width).toBe("45%");
  });

  it("clamps the fill at 100% and flags over-budget usage", () => {
    render(<TokenMeter tokensUsed={1500} tokenBudget={1000} />);
    const meter = screen.getByRole("meter");
    expect(meter.querySelector<HTMLElement>(".token-meter-fill")?.style.width).toBe("100%");
    expect(meter).toHaveAttribute("aria-valuenow", "1500");
    expect(screen.getByText("over budget")).toBeInTheDocument();
  });

  it("does not divide by zero when the budget is 0", () => {
    render(<TokenMeter tokensUsed={100} tokenBudget={0} />);
    expect(screen.getByRole("meter").querySelector<HTMLElement>(".token-meter-fill")?.style.width).toBe(
      "0%"
    );
  });
});
