#!/usr/bin/env python3
"""Generate golden CSVs from the Python reference calculator.

macrosim_engine_v1.py is the oracle. This script drives it with the shared
scenario tapes in test/golden/scenarios.json and writes one CSV per scenario.
test/engine.golden.test.js then asserts the JavaScript port reproduces them.

Run from the repository root:

    python3 tools/generate_golden.py
"""

import csv
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = ROOT / "test" / "golden"

COLUMNS = [
    "quarter",
    "policyRate",
    "treasuryYield",
    "dollar",
    "equity",
    "credit",
    "growth",
    "inflation",
    "energy",
    "gExp",
    "piExp",
    "energySupplyGap",
]

# Snapshot keys used by the reference engine, in COLUMNS order.
ORACLE_KEYS = {
    "quarter": "q",
    "gExp": "g_exp",
    "piExp": "pi_exp",
    "energySupplyGap": "supply_gap",
}


def load_oracle():
    spec = importlib.util.spec_from_file_location(
        "macrosim_engine_v1", ROOT / "macrosim_engine_v1.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(oracle, scenario, quarters):
    engine = oracle.Engine()
    engine.policy_mode = scenario.get("policyMode", "manual")
    rows = []

    for quarter in range(1, quarters + 1):
        policy = None
        supply = None
        for entry in scenario["tape"]:
            if entry["quarter"] != quarter:
                continue
            policy = entry.get("policyRate", policy)
            supply = entry.get("energySupplyGap", supply)
        rows.append(engine.step(policy=policy, supply_gap=supply))

    return rows


def main():
    config = json.loads((GOLDEN / "scenarios.json").read_text())
    quarters = config["quarters"]
    oracle = load_oracle()
    written = []

    for scenario in config["scenarios"]:
        rows = run(oracle, scenario, quarters)
        path = GOLDEN / f"{scenario['id']}.csv"

        with path.open("w", newline="") as handle:
            writer = csv.writer(handle, lineterminator="\n")
            writer.writerow(COLUMNS)
            for row in rows:
                writer.writerow(
                    repr(row[ORACLE_KEYS.get(name, name)]) for name in COLUMNS
                )

        written.append(f"{path.relative_to(ROOT)}  ({len(rows)} quarters)")

    print("Wrote golden files from macrosim_engine_v1.py:")
    for line in written:
        print(f"  {line}")


if __name__ == "__main__":
    main()
