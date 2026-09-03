"""Macro-Sim Economic Model v1.0 — reference calculator.
Deterministic quarterly engine used to populate the spec's worked examples.
"""

from collections import deque
from copy import deepcopy

BASE = {
    "growth": 2.0,
    "inflation": 2.0,
    "policyRate": 3.50,
    "treasuryYield": 3.80,
    "dollar": 100.0,
    "credit": 100.0,
    "energy": 100.0,
    "equity": 100.0,
}

BOUNDS = {
    "growth": (-4.0, 6.0),
    "inflation": (-1.0, 15.0),
    "policyRate": (0.0, 12.0),
    "treasuryYield": (0.2, 15.0),
    "dollar": (70.0, 140.0),
    "credit": (60.0, 140.0),
    "energy": (40.0, 250.0),
    "equity": (40.0, 180.0),
}


def clip(name, val):
    lo, hi = BOUNDS[name]
    return max(lo, min(hi, val))


def ma(hist, k):
    if not hist:
        return 0.0
    sl = hist[-k:] if k else hist
    return sum(sl) / len(sl)


class Engine:
    def __init__(self):
        self.q = 0
        self.v = dict(BASE)
        self.supply_gap = 0.0  # exogenous energy supply shock, +10 = +10 index
        self.policy_mode = "manual"
        # gap histories include a pre-sample of zeros so MA/lags are defined
        self.hist = {k: [0.0] * 8 for k in BASE}
        self.snapshots = []

    def gap(self, name, lag=0):
        h = self.hist[name]
        idx = -1 - lag
        if abs(idx) > len(h):
            return 0.0
        return h[idx]

    def step(self, policy=None, supply_gap=None):
        if policy is not None:
            self.v["policyRate"] = clip("policyRate", policy)
        if supply_gap is not None:
            self.supply_gap = supply_gap

        r = self.v["policyRate"]
        r_gap = r - BASE["policyRate"]
        g_gap = self.v["growth"] - BASE["growth"]
        pi = self.v["inflation"]
        pi_gap = pi - BASE["inflation"]
        cred_gap = self.v["credit"] - BASE["credit"]
        e_gap_now = self.v["energy"] - BASE["energy"]

        # Expectations from currently observed levels + policy this tick
        g_exp = (
            2.0
            - 0.30 * r_gap
            + 0.05 * cred_gap
            - 0.025 * (self.supply_gap + e_gap_now) / 2.0
            - 0.025 * self.supply_gap
            + 0.45 * g_gap
        )
        # simpler, matching spec:
        g_exp = 2.0 - 0.30 * r_gap + 0.05 * cred_gap - 0.025 * self.supply_gap + 0.45 * g_gap

        pi_exp = (
            2.0
            + 0.45 * pi_gap
            + 0.04 * self.supply_gap
            + 0.15 * (g_exp - 2.0)
            - 0.15 * r_gap
        )

        if self.policy_mode == "taylor":
            r_des = 3.50 + 1.5 * (pi_exp - 2.0) + 0.5 * (g_exp - 2.0)
            delta = max(-0.50, min(0.50, r_des - r))
            r = clip("policyRate", r + delta)
            self.v["policyRate"] = r
            r_gap = r - BASE["policyRate"]
            g_exp = 2.0 - 0.30 * r_gap + 0.05 * cred_gap - 0.025 * self.supply_gap + 0.45 * g_gap
            pi_exp = 2.0 + 0.45 * pi_gap + 0.04 * self.supply_gap + 0.15 * (g_exp - 2.0) - 0.15 * r_gap

        y10 = (
            3.80
            + 0.70 * r_gap
            + 0.40 * (pi_exp - 2.0)
            + 0.20 * (g_exp - 2.0)
        )
        usd = 100.0 + 2.50 * r_gap + 1.20 * (g_exp - 2.0) + 0.10 * self.supply_gap
        # equity uses contemporaneous yield
        # credit/energy/growth/inflation use lagged gaps from hist (not yet including this quarter)

        r_lag = [self.gap("policyRate", 0), self.gap("policyRate", 1)]  # last printed gaps = previous quarters
        # hist is updated at end of quarter, so hist[-1] is previous quarter's gap
        def lagged_ma(name, lag_q, width):
            # lag_q=1 reads the previous completed quarter (hist[-1]).
            start = max(lag_q - 1, 0)
            vals = [self.gap(name, lag) for lag in range(start, start + width)]
            return sum(vals) / width

        energy = (
            100.0
            + self.supply_gap
            + 4.0 * lagged_ma("growth", 1, 2)
            - 0.35 * (usd - 100.0)
        )
        cred = (
            100.0
            - 4.0 * lagged_ma("policyRate", 1, 2)
            + 2.5 * lagged_ma("growth", 1, 2)
            - 0.20 * lagged_ma("dollar", 1, 2)
        )
        growth = (
            2.0
            + 0.07 * lagged_ma("credit", 1, 3)
            - 0.035 * lagged_ma("energy", 1, 3)
            + 0.015 * lagged_ma("equity", 1, 3)
        )
        infl = (
            2.0
            + 0.50 * self.gap("inflation", 0)
            + 0.05 * lagged_ma("energy", 1, 2)
            + 0.25 * lagged_ma("growth", 3, 3)
            - 0.03 * lagged_ma("dollar", 2, 3)
        )

        eq = (
            100.0
            - 6.0 * (y10 - 3.80)
            + 8.0 * (g_exp - 2.0)
            + 0.12 * (cred - 100.0)
            - 0.22 * (energy - 100.0)
        )

        self.v = {
            "growth": clip("growth", growth),
            "inflation": clip("inflation", infl),
            "policyRate": clip("policyRate", r),
            "treasuryYield": clip("treasuryYield", y10),
            "dollar": clip("dollar", usd),
            "credit": clip("credit", cred),
            "energy": clip("energy", energy),
            "equity": clip("equity", eq),
        }
        self.g_exp = g_exp
        self.pi_exp = pi_exp

        for k, base in BASE.items():
            self.hist[k].append(self.v[k] - base)
        self.q += 1
        snap = dict(self.v)
        snap["q"] = self.q
        snap["g_exp"] = g_exp
        snap["pi_exp"] = pi_exp
        snap["supply_gap"] = self.supply_gap
        self.snapshots.append(snap)
        return snap


def run_hike():
    e = Engine()
    # Q1: hike to 4.50 and hold
    rows = [e.step(policy=4.50)]
    for _ in range(7):
        rows.append(e.step(policy=4.50))
    return rows


def run_oil():
    e = Engine()
    rows = [e.step(supply_gap=10.0)]
    for _ in range(7):
        rows.append(e.step(supply_gap=10.0))
    return rows


def fmt(rows, title):
    keys = ["q", "policyRate", "treasuryYield", "dollar", "equity", "credit",
            "growth", "inflation", "energy", "g_exp", "pi_exp"]
    print("\n==", title)
    print(" ".join(f"{k:>12}" for k in keys))
    print(" ".join(f"{0:>12}" if k == "q" else f"{BASE.get(k, 0):>12.2f}" for k in keys))
    for r in rows:
        print(" ".join(f"{r[k]:>12.2f}" for k in keys))


if __name__ == "__main__":
    fmt(run_hike(), "RATE HIKE +1pp held")
    fmt(run_oil(), "OIL / ENERGY +10 held")
