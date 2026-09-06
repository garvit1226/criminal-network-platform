"""
Entity and relationship extraction for CaseWeb.

This version deliberately uses deterministic rules for the prototype:
- spaCy helps with PERSON / ORG / LOCATION / DATE.
- Regex handles PHONE / ACCOUNT / VEHICLE / AMOUNT.
- Strong entity-type rules prevent false PERSON/ORG duplicates.
- Relationships are extracted between the actual entities mentioned in each sentence.
"""


import re
import uuid
from functools import lru_cache

import spacy

from app.config import settings
from app.models.schemas import Entity, Relationship, ExtractionResult


# ============================================================
# REGEX
# ============================================================

PHONE_RE = re.compile(r"(?<!\d)(?:\+91[-\s]?)?[6-9]\d{9}(?!\d)")
ACCOUNT_RE = re.compile(
    r"\b(?:bank\s+)?(?:a/c|a/?c|account)\s*(?:no\.?|number)?\s*[:#-]?\s*(\d{6,18})\b",
    re.I,
)
VEHICLE_RE = re.compile(
    r"\b[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{3,4}\b",
    re.I,
)
AMOUNT_RE = re.compile(
    r"(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d+)?"
    r"|\b\d[\d,]*(?:\.\d+)?\s*(?:rupees|rs\.?|inr)\b",
    re.I,
)

# Date formats useful for Indian crime reports.
DATE_RE = re.compile(
    r"\b(?:"
    r"\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}"
    r"|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}"
    r")\b",
    re.I,
)

PERSON_NAME_RE = re.compile(
    r"\b(?:"
    r"(?:[A-Z]\.){1,4}\s*[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*"
    r"|"
    r"[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,3}"
    r")\b"
)

PERSON_TITLES = {
    "mr", "mrs", "ms", "miss", "dr", "prof", "inspector",
    "officer", "constable", "sub inspector", "sub-inspector",
    "si", "shri", "smt"
}

PERSON_HINTS = {
    "person", "man", "woman", "accused", "suspect", "defendant",
    "witness", "victim", "arrested", "detained", "director",
    "manager", "employee", "owner", "founder", "president",
    "associate", "accomplice", "brother", "sister", "son",
    "daughter", "father", "mother", "husband", "wife", "resident"
}

# Words that must never be treated as part of a PERSON name.
NON_PERSON_WORDS = {
    "transferred", "transfer", "sent", "paid", "gave", "deposited",
    "called", "phoned", "contacted", "spoke", "met", "meeting",
    "worked", "works", "employed", "travelled", "traveled",
    "travelling", "traveling", "used", "uses",
    "vehicle", "car", "account", "phone", "mobile", "number",
    "amount", "money", "cash", "payment", "paid",
    "rs", "inr", "rupees", "lakh", "lakhs", "crore", "crores",
    "city", "state", "country", "district", "road", "street"
}

LOCATION_HINTS = {
    "place", "road", "street", "nagar", "colony", "market", "station",
    "airport", "court", "park", "square", "district", "city",
    "state", "country", "town", "village", "region", "province",
    "area", "locality", "territory", "capital", "border"
}

KNOWN_LOCATIONS = {
    "delhi", "new delhi", "mumbai", "bengaluru", "bangalore",
    "hyderabad", "chennai", "kolkata", "pune", "jaipur", "lucknow",
    "noida", "gurugram", "ghaziabad", "chandigarh", "ahmedabad",
    "surat", "kanpur", "agra", "indore", "bhopal", "nagpur",
    "varanasi", "meerut", "amritsar", "patna", "ranchi", "kochi",
    "coimbatore", "mysuru", "mysore",
    "andhra pradesh", "arunachal pradesh", "assam", "bihar",
    "chhattisgarh", "goa", "gujarat", "haryana", "himachal pradesh",
    "jharkhand", "karnataka", "kerala", "madhya pradesh",
    "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland",
    "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu",
    "telangana", "tripura", "uttar pradesh", "uttarakhand",
    "west bengal", "jammu and kashmir", "ladakh",
    "india", "nepal", "bangladesh", "pakistan", "united states",
    "usa", "united kingdom", "uk", "uae", "china", "singapore",
    "canada", "australia"
}

HOTEL_HINTS = {
    "hotel", "motel", "resort", "inn", "lodge", "guest house",
    "guesthouse", "hostel", "homestay", "stayed at", "stayed in",
    "booked at", "booked a room at", "checked into", "checked in at",
    "checked out of", "hotel room", "room at", "suite at"
}

ORG_SUFFIXES = {
    "logistics", "ltd", "limited", "pvt", "private", "inc", "corp",
    "corporation", "company", "industries", "exports", "bank", "agency",
    "solutions", "enterprises", "services", "organization", "organisation",
    "foundation", "institute", "university", "college", "hospital",
    "laboratory", "lab", "ministry", "department", "bureau",
    "authority", "association", "group", "firm", "trust", "clinic",
    "technologies", "technology"
}

ACCOUNT_HINTS = {
    "account", "bank account", "a/c", "account number",
    "bank account number", "savings account", "current account",
    "account holder", "bank details", "account details"
}

PHONE_HINTS = {
    "phone", "telephone", "mobile", "cell", "phone number",
    "mobile number", "telephone number", "called", "phoned",
    "contacted", "dialled", "dialed", "received a call",
    "made a call", "texted", "messaged"
}

VEHICLE_MODELS = {
    "toyota innova", "innova", "swift", "baleno", "fortuner", "creta",
    "verna", "scorpio", "thar", "nexon", "seltos", "honda city"
}

# Individual model/brand words that spaCy may wrongly classify as PERSON.
# They are suppressed when they appear in a vehicle-related context.
VEHICLE_NAME_PARTS = {
    "toyota", "innova", "swift", "baleno", "fortuner", "creta",
    "verna", "scorpio", "thar", "nexon", "seltos", "honda"
}

# Vehicle makes should not become ORG when they occur as part of a vehicle name,
# e.g. "Toyota" in "Toyota Innova".
VEHICLE_MAKES = {
    "toyota", "honda", "maruti", "suzuki", "hyundai", "tata",
    "mahindra", "ford", "volkswagen", "skoda", "kia", "mg",
    "bmw", "audi", "mercedes", "volvo", "renault", "nissan"
}

VEHICLE_HINTS = {
    "vehicle", "car", "van", "truck", "bus", "motorcycle", "bike",
    "suv", "taxi", "auto", "rickshaw", "registration number",
    "vehicle number", "number plate", "license plate", "drove",
    "driving", "parked", "transported", "travelled by", "traveled by"
}

CURRENCY_WORDS = {
    "rs", "inr", "rupees", "₹", "usd", "dollars", "$", "eur",
    "euros", "gbp", "pounds", "lakh", "lakhs", "crore", "crores",
    "amount", "sum", "cash", "money", "funds"
}

MONTHS = {
    "january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december"
}


RELATION_TRIGGERS = {
    "TRANSFERRED_MONEY": ("transferred", "transfer", "sent", "paid", "gave", "deposited"),
    "CALLED": ("called", "phoned", "spoke to", "contacted"),
    "MET_AT": ("met", "meeting", "seen together", "meets", "lives"),
    "OWNS": ("owns", "owner of", "possesses"),
    "WORKS_AT": ("works at", "employed at", "works for"),
    "KNOWS": ("knows", "associate of", "friend of", "relative of"),
}


# ============================================================
# HELPERS
# ============================================================

def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _norm_space(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def _clean_person_name(name: str) -> str:
    name = _norm_space(name)
    name = re.sub(
        r"^(?:mr|mrs|ms|miss|dr|prof|inspector|officer|constable|"
        r"sub[- ]?inspector|si|shri|smt)\.?\s+",
        "",
        name,
        flags=re.I,
    )
    name = re.sub(r"(?:['’]s)$", "", name, flags=re.I).strip()
    return " ".join(part.capitalize() for part in name.split())


def _normalize_name(label: str, name: str) -> str:
    name = _norm_space(name)

    if label == "PERSON":
        return _clean_person_name(name)

    if label == "PHONE":
        return re.sub(r"[^\d+]", "", name)

    if label == "ACCOUNT":
        return re.sub(r"\D", "", name)

    if label == "VEHICLE":
        return re.sub(r"[\s-]", "", name).upper()

    if label == "AMOUNT":
        return name.replace(" ", "")

    return name


def _contains(text: str, phrase: str) -> bool:
    return phrase.lower() in text.lower()


def _span_overlaps(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return a_start < b_end and b_start < a_end


# ============================================================
# ENTITY TYPE HELPERS
# ============================================================

def _candidate_context(text: str, start: int, end: int, radius: int = 60) -> str:
    return text[max(0, start - radius):min(len(text), end + radius)]


def _looks_like_org(candidate: str, context: str) -> bool:
    # Only the candidate itself is used for suffix checks.
    # Distant context can incorrectly turn nearby person names into ORG.
    words = set(candidate.lower().split())
    return any(word in ORG_SUFFIXES for word in words)
def _known_location_entities(text: str) -> list[Entity]:
    found = []
    occupied = []
    for place in sorted(KNOWN_LOCATIONS, key=len, reverse=True):
        pattern = re.compile(rf"\b{re.escape(place)}\b", re.I)
        for match in pattern.finditer(text):
            if any(_span_overlaps(match.start(), match.end(), a, b) for a, b in occupied):
                continue
            occupied.append((match.start(), match.end()))
            found.append(
                Entity(
                    id=_new_id("location"),
                    label="LOCATION",
                    name=match.group().strip(),
                )
            )
    return found


# ============================================================
# ENTITY EXTRACTION
# ============================================================

@lru_cache(maxsize=1)
def _nlp():
    return spacy.load(settings.spacy_model)


def _regex_entities(text: str) -> list[Entity]:
    found: list[Entity] = []

    occupied: list[tuple[int, int]] = []

    def add_match(match, label: str, value: str | None = None):
        start, end = match.span()
        # Avoid duplicate extraction of the same numeric span.
        if any(_span_overlaps(start, end, a, b) for a, b in occupied):
            return
        occupied.append((start, end))
        found.append(
            Entity(
                id=_new_id(label.lower()),
                label=label,
                name=value if value is not None else match.group(),
            )
        )

    # Strong deterministic location patterns first.
    found.extend(_known_location_entities(text))

    # Specific numeric patterns.
    for m in PHONE_RE.finditer(text):
        add_match(m, "PHONE")

    for m in ACCOUNT_RE.finditer(text):
        add_match(m, "ACCOUNT", m.group(1))

    for m in VEHICLE_RE.finditer(text):
        add_match(m, "VEHICLE", m.group().upper())

    for m in AMOUNT_RE.finditer(text):
        add_match(m, "AMOUNT", m.group().strip())

    for m in DATE_RE.finditer(text):
        add_match(m, "DATE", m.group().strip())

    # Vehicle model: only add if it appears in an explicitly vehicle-related
    # phrase. This prevents generic words from becoming VEHICLE nodes.
    for model in sorted(VEHICLE_MODELS, key=len, reverse=True):
        pattern = re.compile(rf"\b{re.escape(model)}\b", re.I)
        for m in pattern.finditer(text):
            left = text[max(0, m.start() - 35):m.start()].lower()
            right = text[m.end():m.end() + 35].lower()
            context = left + " " + right
            if any(term in context for term in VEHICLE_HINTS):
                add_match(m, "VEHICLE", m.group().title())

    # Person fallback is intentionally conservative. A capitalized phrase is
    # NOT enough to be a PERSON if it looks like a place, company, or vehicle.
    for m in PERSON_NAME_RE.finditer(text):
        name = _clean_person_name(m.group())
        lower = name.lower()
        words = lower.split()

        if not name or len(words) < 2:
            continue
        if any(word in MONTHS for word in words):
            continue

        context = _candidate_context(text, m.start(), m.end())

        # Never classify known places, vehicle names, or organization-like
        # candidates as PERSON.
        if lower in KNOWN_LOCATIONS:
            continue

        candidate_words = set(lower.split())
        if candidate_words & NON_PERSON_WORDS:
            continue

        if lower in {v.lower() for v in VEHICLE_MODELS}:
            continue
        if candidate_words & VEHICLE_NAME_PARTS and any(
            term in context.lower() for term in VEHICLE_HINTS
        ):
            continue

        if _looks_like_org(name, context):
            continue

        # Reject long action/transaction phrases accidentally matched
        # by the generic capitalized-name regex.
        if len(words) > 3 and any(
            word in NON_PERSON_WORDS for word in words
        ):
            continue

        # If this span overlaps a known deterministic entity, never classify
        # it as PERSON.
        if any(_span_overlaps(m.start(), m.end(), a, b) for a, b in occupied):
            continue

        found.append(
            Entity(
                id=_new_id("person"),
                label="PERSON",
                name=name,
            )
        )

    return found


def _spacy_entities(doc) -> list[Entity]:
    found: list[Entity] = []

    vehicle_models_lower = {v.lower() for v in VEHICLE_MODELS}
    vehicle_parts_lower = {v.lower() for v in VEHICLE_NAME_PARTS}
    vehicle_makes_lower = {v.lower() for v in VEHICLE_MAKES}

    for ent in doc.ents:
        name = ent.text.strip()
        lower = name.lower()
        context = _candidate_context(doc.text, ent.start_char, ent.end_char).lower()

        # Known city/state/country names always remain LOCATION.
        if lower in KNOWN_LOCATIONS:
            label = "LOCATION"

        # Suppress a vehicle make/model when it appears as part of a vehicle
        # expression such as "Toyota Innova" or "Honda City".
        elif (
            lower in vehicle_models_lower
            or (
                lower in vehicle_makes_lower
                and (
                    any(model in context for model in vehicle_parts_lower)
                    or any(term in context for term in VEHICLE_HINTS)
                )
            )
            or (
                lower in vehicle_parts_lower
                and any(term in context for term in VEHICLE_HINTS)
            )
        ):
            # Regex extraction creates the actual VEHICLE entity.
            label = None

        else:
            label = {
                "PERSON": "PERSON",
                "GPE": "LOCATION",
                "LOC": "LOCATION",
                "FAC": "LOCATION",
                "ORG": "ORG",
                "DATE": "DATE",
                "MONEY": "AMOUNT",
            }.get(ent.label_)

        if not label:
            continue

        if label == "PERSON":
            name = _clean_person_name(name)
            person_words = set(name.lower().split())

            # Prevent transaction/action/currency words from becoming PERSON.
            if person_words & NON_PERSON_WORDS:
                continue

            if name.lower() in KNOWN_LOCATIONS:
                continue

            if name.lower() in vehicle_models_lower:
                continue

            if person_words & vehicle_parts_lower and any(
                term in context for term in VEHICLE_HINTS
            ):
                continue

        if label == "ORG":
            # Never allow a vehicle make/model to survive as an organization
            # when it is being used as a vehicle name.
            if lower in vehicle_models_lower:
                continue

            if (
                lower in vehicle_makes_lower
                and (
                    any(model in context for model in vehicle_parts_lower)
                    or any(term in context for term in VEHICLE_HINTS)
                )
            ):
                continue

        found.append(
            Entity(
                id=_new_id(label.lower()),
                label=label,
                name=name,
            )
        )

    return found



def _canonicalize_entities(
    spacy_entities: list[Entity],
    regex_entities: list[Entity],
) -> list[Entity]:
    """
    Merge same-name entities while protecting deterministic entity types.

    HOTEL/PARK/COURT/etc. are not entity types in this prototype.
    Geographical names, vehicle names and numeric entities are protected
    from being overwritten by generic PERSON/ORG predictions.
    """
    candidates = spacy_entities + regex_entities
    buckets: dict[str, list[Entity]] = {}

    for entity in candidates:
        key = _norm_space(entity.name).lower()
        if key:
            buckets.setdefault(key, []).append(entity)

    priority = {
        "PHONE": 120,
        "ACCOUNT": 115,
        "VEHICLE": 110,
        "AMOUNT": 105,
        "DATE": 100,
        "LOCATION": 95,
        "ORG": 85,
        "PERSON": 70,
    }

    result: list[Entity] = []

    for key, bucket in buckets.items():
        labels = {e.label for e in bucket}
        chosen = max(bucket, key=lambda e: priority.get(e.label, 0))

        # Known locations always win over PERSON/ORG.
        if key in KNOWN_LOCATIONS:
            location = next((e for e in bucket if e.label == "LOCATION"), None)
            if location:
                chosen = location

        # Known vehicle models/parts must never be PERSON.
        elif key in {v.lower() for v in VEHICLE_MODELS}:
            vehicle = next((e for e in bucket if e.label == "VEHICLE"), None)
            if vehicle:
                chosen = vehicle
            elif "PERSON" in labels:
                # Drop the generic PERSON prediction. Regex will supply
                # VEHICLE when the surrounding sentence identifies a vehicle.
                continue

        # If PERSON and ORG share exactly the same surface form, only prefer
        # ORG when the candidate contains an actual organization suffix.
        elif "PERSON" in labels and "ORG" in labels:
            if any(word in ORG_SUFFIXES for word in key.split()):
                chosen = next(e for e in bucket if e.label == "ORG")
            else:
                chosen = next(e for e in bucket if e.label == "PERSON")

        chosen.name = _normalize_name(chosen.label, chosen.name)
        result.append(chosen)

    final: list[Entity] = []
    seen: set[tuple[str, str]] = set()

    for entity in result:
        entity.name = _normalize_name(entity.label, entity.name)
        key = (entity.label, entity.name.lower())

        if not entity.name or key in seen:
            continue

        seen.add(key)
        final.append(entity)

    return final



# ============================================================
# LOOKUP / SENTENCE UTILITIES
# ============================================================

def _entities_in_sentence(
    entities: list[Entity],
    sentence: str
) -> list[Entity]:

    result = []

    for entity in entities:
        name = entity.name.strip()

        # Normal matching
        if name.lower() in sentence.lower():
            result.append(entity)
            continue

        # Flexible matching for normalized entities such as:
        # "Rs.85000" -> "Rs. 85000"
        # "DL01AB1234" -> "DL01 AB1234"
        # "9876543210" -> "9876543210"
        normalized_name = re.sub(r"[\s\-]", "", name).lower()
        normalized_sentence = re.sub(r"[\s\-]", "", sentence).lower()

        if normalized_name and normalized_name in normalized_sentence:
            result.append(entity)

    # Preserve order of appearance as much as possible
    result.sort(
        key=lambda e: sentence.lower().find(e.name.lower())
        if e.name.lower() in sentence.lower()
        else len(sentence)
    )

    return result


def _by_label(items: list[Entity], label: str) -> list[Entity]:
    return [e for e in items if e.label == label]


def _find_last_person(entities: list[Entity], relationships: list[Relationship]) -> Entity | None:
    # Prefer the latest person that appeared as a source.
    for rel in reversed(relationships):
        for entity in entities:
            if entity.id == rel.source and entity.label == "PERSON":
                return entity

    people = _by_label(entities, "PERSON")
    return people[-1] if people else None


def _make_relationship(
    source: Entity,
    target: Entity,
    rel_type: str,
    sentence: str,
    case_id: str,
    amount: float | None = None,
) -> Relationship:
    return Relationship(
        source=source.id,
        target=target.id,
        type=rel_type,
        context=sentence,
        case_id=case_id,
        amount=amount,
    )


def _amount_value(entity: Entity | None) -> float | None:
    if not entity:
        return None

    raw = re.sub(r"[^0-9.]", "", entity.name)
    try:
        return float(raw)
    except ValueError:
        return None


# ============================================================
# RELATIONSHIP EXTRACTION
# ============================================================

def _extract_relationships(
    case_id: str,
    text: str,
    doc,
    entities: list[Entity],
) -> list[Relationship]:

    relationships: list[Relationship] = []
    last_person: Entity | None = None

    # Use spaCy sentence boundaries, but also tolerate malformed input where
    # punctuation is missing a space.
    sentences = [s.text.strip() for s in doc.sents if s.text.strip()]

    for sentence in sentences:
        lower = sentence.lower()
        local = _entities_in_sentence(entities, sentence)

        people = _by_label(local, "PERSON")
        locations = _by_label(local, "LOCATION")
        phones = _by_label(local, "PHONE")
        accounts = _by_label(local, "ACCOUNT")
        vehicles = _by_label(local, "VEHICLE")
        amounts = _by_label(local, "AMOUNT")
        dates = _by_label(local, "DATE")
        orgs = _by_label(local, "ORG")

        if people:
            last_person = people[0]

        # --------------------------------------------------------
        # PERSON -> PERSON
        # --------------------------------------------------------

        if len(people) >= 2:
            if any(t in lower for t in RELATION_TRIGGERS["MET_AT"]):
                relationships.append(
                    _make_relationship(
                        people[0], people[1], "MET_AT", sentence, case_id
                    )
                )

            if any(t in lower for t in RELATION_TRIGGERS["CALLED"]):
                relationships.append(
                    _make_relationship(
                        people[0], people[1], "CALLED", sentence, case_id
                    )
                )

            if any(t in lower for t in RELATION_TRIGGERS["KNOWS"]):
                relationships.append(
                    _make_relationship(
                        people[0], people[1], "KNOWS", sentence, case_id
                    )
                )

            if any(t in lower for t in RELATION_TRIGGERS["TRANSFERRED_MONEY"]):
                amount = _amount_value(amounts[0] if amounts else None)
                relationships.append(
                    _make_relationship(
                        people[0],
                        people[1],
                        "TRANSFERRED_MONEY",
                        sentence,
                        case_id,
                        amount,
                    )
                )

        # --------------------------------------------------------
        # PERSON -> LOCATION
        # --------------------------------------------------------

        if people and locations and any(
            t in lower for t in RELATION_TRIGGERS["MET_AT"]
        ):
            relationships.append(
                _make_relationship(
                    people[0], locations[0], "PRESENT_AT", sentence, case_id
                )
            )

        # --------------------------------------------------------
        # PERSON -> PHONE
        # --------------------------------------------------------

        if people and phones and any(
            t in lower for t in PHONE_HINTS
        ):
            for phone in phones:
                relationships.append(
                    _make_relationship(
                        people[0], phone, "USED_PHONE", sentence, case_id
                    )
                )

        # --------------------------------------------------------
        # PERSON -> ACCOUNT
        # --------------------------------------------------------

        if people and accounts and any(
            t in lower for t in ACCOUNT_HINTS
        ):
            for account in accounts:
                relationships.append(
                    _make_relationship(
                        people[0], account, "USED_ACCOUNT", sentence, case_id
                    )
                )

        # --------------------------------------------------------
        # PERSON -> AMOUNT
        # --------------------------------------------------------

        if people and amounts and any(
            t in lower for t in RELATION_TRIGGERS["TRANSFERRED_MONEY"]
        ):
            for amount_entity in amounts:
                relationships.append(
                    _make_relationship(
                        people[0],
                        amount_entity,
                        "TRANSFERRED_AMOUNT",
                        sentence,
                        case_id,
                        _amount_value(amount_entity),
                    )
                )

        # --------------------------------------------------------
        # PERSON -> VEHICLE
        # --------------------------------------------------------

        if vehicles:
            actor = people[0] if people else last_person
            if actor and any(
                t in lower
                for t in VEHICLE_HINTS
            ):
                for vehicle in vehicles:
                    relationships.append(
                        _make_relationship(
                            actor, vehicle, "USED_VEHICLE", sentence, case_id
                        )
                    )

        # --------------------------------------------------------
        # PERSON -> ORG / ORG -> DATE
        # --------------------------------------------------------

        if people and orgs and any(
            t in lower for t in RELATION_TRIGGERS["WORKS_AT"]
        ):
            for org in orgs:
                relationships.append(
                    _make_relationship(
                        people[0], org, "WORKS_AT", sentence, case_id
                    )
                )

        if orgs and dates and any(
            t in lower for t in ("recorded", "recorded on", "reported on")
        ):
            relationships.append(
                _make_relationship(
                    orgs[0], dates[0], "RECORDED_ON", sentence, case_id
                )
            )

        # --------------------------------------------------------
        # DATE attached to an event/person
        # --------------------------------------------------------

        if people and dates and any(
            t in lower for t in ("met", "meeting", "transferred", "sent", "called", "transaction")
        ):
            relationships.append(
                _make_relationship(
                    people[0], dates[0], "ON_DATE", sentence, case_id
                )
            )

    return relationships


# ============================================================
# MAIN API
# ============================================================

def extract(case_id: str, text: str) -> ExtractionResult:
    doc = _nlp()(text)

    spacy_entities = _spacy_entities(doc)
    regex_entities = _regex_entities(text)

    entities = _canonicalize_entities(
        spacy_entities,
        regex_entities,
    )

    relationships = _extract_relationships(
        case_id=case_id,
        text=text,
        doc=doc,
        entities=entities,
    )

    # Remove duplicate edges.
    unique: list[Relationship] = []
    seen: set[tuple] = set()

    for relationship in relationships:
        key = (
            relationship.source,
            relationship.target,
            relationship.type,
            relationship.case_id,
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(relationship)

    return ExtractionResult(
        case_id=case_id,
        entities=entities,
        relationships=unique,
    )

