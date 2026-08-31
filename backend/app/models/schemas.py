"""
Pydantic models shared across routers.
"""
from typing import Optional
from pydantic import BaseModel, Field


class ReportIn(BaseModel):
    case_id: str = Field(..., description="Case / FIR number this report belongs to")
    text: str = Field(..., description="Raw crime report narrative text")
    reported_by: Optional[str] = Field(None, description="Investigator submitting the report")


class TranscriptionOut(BaseModel):
    text: str


class Entity(BaseModel):
    id: str
    label: str          # PERSON, LOCATION, ORG, PHONE, ACCOUNT, VEHICLE, AMOUNT, DATE, EVENT
    name: str


class Relationship(BaseModel):
    source: str
    target: str
    type: str            # KNOWS, MET_AT, CALLED, TRANSFERRED_MONEY, OWNS, WORKS_AT, PRESENT_AT, ...
    context: Optional[str] = None
    case_id: Optional[str] = None
    amount: Optional[float] = None
    timestamp: Optional[str] = None
    location: Optional[str] = None


class ExtractionResult(BaseModel):
    case_id: str
    entities: list[Entity]
    relationships: list[Relationship]


class GraphNode(BaseModel):
    id: str
    label: str
    name: str
    properties: dict = {}


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    type: str
    properties: dict = {}


class GraphData(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class AnomalyAlert(BaseModel):
    rule_id: str
    rule_name: str
    severity: str          # low, medium, high
    description: str
    involved_node_ids: list[str]
