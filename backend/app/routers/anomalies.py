from fastapi import APIRouter

from app.models.schemas import AnomalyAlert
from app.services.graph_service import graph_service
from app.services.anomaly_rules import run_all_rules, RULES

router = APIRouter(prefix="/api/anomalies", tags=["anomalies"])


@router.get("", response_model=list[AnomalyAlert])
def get_anomalies():
    """Run all 10 anomaly rules against the current graph and return every alert raised."""
    rows = graph_service.get_all_relationships_raw()
    return run_all_rules(rows)


@router.get("/rules")
def list_rules():
    """List the anomaly rules currently registered in the engine."""
    return [{"index": i + 1, "function": r.__name__} for i, r in enumerate(RULES)]
