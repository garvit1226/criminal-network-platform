"""
Rule-based anomaly / red-flag detection engine.

Operates on the flat relationship rows returned by
GraphService.get_all_relationships_raw() -- a plain list of dicts, so the
rules stay simple, testable, and don't need a graph library dependency.

Each rule is a small function: (rows) -> list[AnomalyAlert].
Add a new rule by writing a function and registering it in RULES.
"""
from collections import defaultdict, Counter
import re

from app.models.schemas import AnomalyAlert

Row = dict


def _group_by_pair(rows: list[Row], rel_type: str | None = None) -> dict[tuple, list[Row]]:
    groups: dict[tuple, list[Row]] = defaultdict(list)
    for r in rows:
        if rel_type and r["type"] != rel_type:
            continue
        key = (r["source_id"], r["target_id"])
        groups[key].append(r)
    return groups


# ---------------------------------------------------------------------------
# Rule 1: disproportionate money transfer from an entity with no known
# income source (no WORKS_AT relation) -- classic "low visible income,
# high outgoing money" red flag.
# ---------------------------------------------------------------------------
def rule_disproportionate_transfer(rows: list[Row]) -> list[AnomalyAlert]:
    works_at = {r["source_id"] for r in rows if r["type"] == "WORKS_AT"}
    alerts = []
    for r in rows:
        if r["type"] == "TRANSFERRED_MONEY" and r.get("amount"):
            if r["source_id"] not in works_at and r["amount"] >= 50000:
                alerts.append(AnomalyAlert(
                    rule_id="R1", rule_name="Disproportionate money transfer",
                    severity="high",
                    description=(
                        f"{r['source_name']} sent {r['amount']:.0f} to {r['target_name']} "
                        f"with no declared income source (no employer on record)."
                    ),
                    involved_node_ids=[r["source_id"], r["target_id"]],
                ))
    return alerts


# ---------------------------------------------------------------------------
# Rule 2: two people meet at the same place repeatedly (>= 3 occurrences).
# ---------------------------------------------------------------------------
def rule_recurring_meeting(rows: list[Row], min_count: int = 3) -> list[AnomalyAlert]:
    counts: Counter = Counter()
    sample: dict[tuple, Row] = {}
    for r in rows:
        if r["type"] in ("MET_AT", "PRESENT_AT") and r.get("location"):
            key = (frozenset((r["source_id"], r["target_id"])), r["location"])
            counts[key] += 1
            sample[key] = r
    alerts = []
    for key, n in counts.items():
        if n >= min_count:
            r = sample[key]
            alerts.append(AnomalyAlert(
                rule_id="R2", rule_name="Recurring meetings at same location",
                severity="medium",
                description=f"{r['source_name']} and {r['target_name']} met at {r['location']} {n} times.",
                involved_node_ids=[r["source_id"], r["target_id"]],
            ))
    return alerts


# ---------------------------------------------------------------------------
# Rule 3: structuring / smurfing -- many small transfers to the same
# target that individually stay under a reporting threshold.
# ---------------------------------------------------------------------------
def rule_structuring(
    rows: list[Row],
    threshold: float = 500000,
    min_count: int = 3
) -> list[AnomalyAlert]:
    """
    Flag repeated transfers from the same source to the same target.

    Important: relationship rows may contain amounts as strings (for example
    "500000" or "Rs 500000"), so normalize the value before comparing it.
    """

    pairs = _group_by_pair(rows, "TRANSFERRED_MONEY")
    alerts = []

    def parse_amount(value):
        if value is None:
            return None

        if isinstance(value, (int, float)):
            return float(value)

        # Handle values such as:
        # "500000", "500,000", "Rs 500000", "Rs. 500000"
        text = str(value).strip()
        text = text.replace(",", "")

        match = re.search(r"[-+]?\d+(?:\.\d+)?", text)
        if not match:
            return None

        try:
            return float(match.group(0))
        except (TypeError, ValueError):
            return None

    for (src, tgt), group in pairs.items():

        qualifying = []

        for r in group:
            amount = parse_amount(r.get("amount"))

            if amount is not None and amount <= threshold:
                qualifying.append((r, amount))

        if len(qualifying) >= min_count:
            first_row, _ = qualifying[0]

            total_amount = sum(
                amount for _, amount in qualifying
            )

            alerts.append(
                AnomalyAlert(
                    rule_id="R3",
                    rule_name="Possible structuring (smurfing)",
                    severity="high",
                    description=(
                        f"{first_row['source_name']} made "
                        f"{len(qualifying)} separate transfers to "
                        f"{first_row['target_name']}, with individual "
                        f"transfers up to Rs {threshold:.0f}, totaling "
                        f"Rs {total_amount:.0f} -- possible structuring "
                        f"through multiple transfers."
                    ),
                    involved_node_ids=[src, tgt],
                )
            )

    return alerts


# ---------------------------------------------------------------------------
# Rule 4: circular money flow -- A pays B, B pays C, ... back to A.
# ---------------------------------------------------------------------------
def rule_circular_money_flow(rows: list[Row]) -> list[AnomalyAlert]:
    adj: dict[str, list[Row]] = defaultdict(list)
    names: dict[str, str] = {}
    for r in rows:
        if r["type"] == "TRANSFERRED_MONEY":
            adj[r["source_id"]].append(r)
            names[r["source_id"]] = r["source_name"]
            names[r["target_id"]] = r["target_name"]

    alerts = []
    seen_cycles: set[frozenset] = set()

    def dfs(start: str, current: str, path: list[str], visited: set[str]):
        for edge in adj.get(current, []):
            nxt = edge["target_id"]
            if nxt == start and len(path) >= 2:
                cycle_key = frozenset(path)
                if cycle_key not in seen_cycles:
                    seen_cycles.add(cycle_key)
                    chain = " -> ".join(names.get(n, n) for n in path + [start])
                    alerts.append(AnomalyAlert(
                        rule_id="R4", rule_name="Circular money flow",
                        severity="high",
                        description=f"Circular transfer detected: {chain}.",
                        involved_node_ids=list(path),
                    ))
            elif nxt not in visited and len(path) < 5:
                dfs(start, nxt, path + [nxt], visited | {nxt})

    for node in list(adj.keys()):
        dfs(node, node, [node], {node})

    return alerts


# ---------------------------------------------------------------------------
# Rule 5: isolated large one-off transaction between two entities that
# otherwise have no other relationship on record.
# ---------------------------------------------------------------------------
def rule_isolated_large_transaction(rows: list[Row], amount_threshold: float = 100000) -> list[AnomalyAlert]:
    pairs = _group_by_pair(rows)
    alerts = []
    for (src, tgt), group in pairs.items():
        if len(group) == 1 and group[0]["type"] == "TRANSFERRED_MONEY" and group[0].get("amount"):
            if group[0]["amount"] >= amount_threshold:
                r = group[0]
                alerts.append(AnomalyAlert(
                    rule_id="R5", rule_name="Isolated large transaction",
                    severity="medium",
                    description=(
                        f"A single large transfer of {r['amount']:.0f} from {r['source_name']} to "
                        f"{r['target_name']} with no other recorded relationship between them."
                    ),
                    involved_node_ids=[src, tgt],
                ))
    return alerts


# ---------------------------------------------------------------------------
# Rule 6: two or more different people travelled using the same vehicle.
# ---------------------------------------------------------------------------
def rule_shared_vehicle(rows: list[Row]) -> list[AnomalyAlert]:
    """
    Flag a vehicle that is connected to multiple PERSON nodes through a
    travel/vehicle-use relationship.

    This is intentionally based on the PERSON -> VEHICLE relationship rather
    than requiring two person nodes to be directly connected.

    Example:
        Abdul Karim Telgi travelled ... with vehicle DL01AB1234.
        Gaurav Aggarwal travelled with vehicle DL01AB1234.

    Both people will be included in the alert.
    """

    # Relationship names that may be produced by the extraction layer.
    travel_types = {
        "TRAVELLED_WITH",
        "TRAVELED_WITH",
        "TRAVELLED_IN",
        "TRAVELED_IN",
        "USED_VEHICLE",
        "TRAVELLED",
        "TRAVELED",
    }

    vehicle_to_people: dict[str, set[str]] = defaultdict(set)
    vehicle_names: dict[str, str] = {}
    person_names: dict[str, str] = {}

    for r in rows:
        source_label = str(r.get("source_label", "")).upper()
        target_label = str(r.get("target_label", "")).upper()
        rel_type = str(r.get("type", "")).upper()

        # Normal expected shape: PERSON -> VEHICLE.
        if source_label == "PERSON" and target_label == "VEHICLE":
            if rel_type in travel_types or not rel_type:
                vehicle_to_people[r["target_id"]].add(r["source_id"])
                vehicle_names[r["target_id"]] = r.get(
                    "target_name", r["target_id"]
                )
                person_names[r["source_id"]] = r.get(
                    "source_name", r["source_id"]
                )

        # Also support VEHICLE -> PERSON if the extractor stores the edge
        # in the opposite direction.
        elif source_label == "VEHICLE" and target_label == "PERSON":
            if rel_type in travel_types or not rel_type:
                vehicle_to_people[r["source_id"]].add(r["target_id"])
                vehicle_names[r["source_id"]] = r.get(
                    "source_name", r["source_id"]
                )
                person_names[r["target_id"]] = r.get(
                    "target_name", r["target_id"]
                )

    alerts = []

    for vehicle_id, people in vehicle_to_people.items():
        if len(people) < 2:
            continue

        people = list(people)
        people_names = [person_names.get(p, p) for p in people]
        vehicle_name = vehicle_names.get(vehicle_id, vehicle_id)

        alerts.append(
            AnomalyAlert(
                rule_id="R6",
                rule_name="Multiple people used the same vehicle",
                severity="medium",
                description=(
                    f"{', '.join(people_names)} travelled using the same "
                    f"vehicle ({vehicle_name})."
                ),
                involved_node_ids=people + [vehicle_id],
            )
        )

    return alerts


# ---------------------------------------------------------------------------
# Rule 7: two persons share an account/phone entity without any direct
# relationship between the persons themselves. Vehicle sharing is handled
# separately by Rule 6.
# ---------------------------------------------------------------------------
def rule_shared_asset_no_direct_link(rows: list[Row]) -> list[AnomalyAlert]:
    asset_to_people: dict[str, set] = defaultdict(set)
    names: dict[str, str] = {}
    direct_links: set[frozenset] = set()

    for r in rows:
        names[r["source_id"]] = r["source_name"]
        names[r["target_id"]] = r["target_name"]
        if r["target_label"] in ("ACCOUNT", "PHONE"):
            asset_to_people[r["target_id"]].add(r["source_id"])
        if r["source_label"] == "PERSON" and r["target_label"] == "PERSON":
            direct_links.add(frozenset((r["source_id"], r["target_id"])))

    alerts = []
    for asset_id, people in asset_to_people.items():
        people = list(people)
        for i in range(len(people)):
            for j in range(i + 1, len(people)):
                pair = frozenset((people[i], people[j]))
                if pair not in direct_links:
                    alerts.append(AnomalyAlert(
                        rule_id="R7", rule_name="Shared asset, no direct link",
                        severity="medium",
                        description=(
                            f"{names.get(people[i])} and {names.get(people[j])} are both linked to the "
                            f"same asset ({asset_id}) but have no direct relationship on record."
                        ),
                        involved_node_ids=[people[i], people[j], asset_id],
                    ))
    return alerts


# ---------------------------------------------------------------------------
# Rule 8: one phone/account entity shared by more than one person --
# possible shared or fake identity.
# ---------------------------------------------------------------------------
def rule_shared_identity_asset(rows: list[Row]) -> list[AnomalyAlert]:
    asset_to_people: dict[tuple, set] = defaultdict(set)
    names: dict[str, str] = {}
    asset_names: dict[str, str] = {}

    for r in rows:
        names[r["source_id"]] = r["source_name"]

        if r["target_label"] in ("PHONE", "ACCOUNT"):
            asset_id = r["target_id"]
            asset_to_people[(asset_id, r["target_label"])].add(r["source_id"])
            asset_names[asset_id] = r["target_name"]

    alerts = []

    for (asset_id, label), people in asset_to_people.items():
        if len(people) > 1:
            people_names = ", ".join(names.get(p, p) for p in people)
            display_asset = asset_names.get(asset_id, asset_id)

            alerts.append(AnomalyAlert(
                rule_id="R8",
                rule_name=f"Shared {label.lower()} across multiple people",
                severity="high",
                description=(
                    f"{label.title()} {display_asset} is linked to multiple people: "
                    f"{people_names}."
                ),
                involved_node_ids=list(people) + [asset_id],
            ))

    return alerts


# ---------------------------------------------------------------------------
# Rule 9: same person entity reappears across more than one case --
# links investigations that may not have been previously connected.
# ---------------------------------------------------------------------------
def rule_cross_case_reappearance(rows: list[Row]) -> list[AnomalyAlert]:
    person_cases: dict[str, set] = defaultdict(set)
    names: dict[str, str] = {}
    for r in rows:
        if r["source_label"] == "PERSON" and r.get("case_id"):
            person_cases[r["source_id"]].add(r["case_id"])
            names[r["source_id"]] = r["source_name"]
        if r["target_label"] == "PERSON" and r.get("case_id"):
            person_cases[r["target_id"]].add(r["case_id"])
            names[r["target_id"]] = r["target_name"]
    alerts = []
    for person_id, cases in person_cases.items():
        if len(cases) > 1:
            alerts.append(AnomalyAlert(
                rule_id="R9", rule_name="Person linked across multiple cases",
                severity="high",
                description=f"{names.get(person_id, person_id)} appears in {len(cases)} separate cases: {', '.join(sorted(cases))}.",
                involved_node_ids=[person_id],
            ))
    return alerts


RULES = [
    rule_disproportionate_transfer,
    rule_recurring_meeting,
    rule_structuring,
    rule_circular_money_flow,
    rule_isolated_large_transaction,
    rule_shared_vehicle,
    rule_shared_asset_no_direct_link,
    rule_shared_identity_asset,
    rule_cross_case_reappearance,
]


def run_all_rules(rows: list[Row]) -> list[AnomalyAlert]:
    alerts: list[AnomalyAlert] = []
    for rule in RULES:
        try:
            alerts.extend(rule(rows))
        except Exception:
            # A single misbehaving rule should never take down the whole scan.
            continue
    return alerts
