from fastapi import APIRouter, Query

from app.models.schemas import GraphData
from app.services.graph_service import graph_service

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("", response_model=GraphData)
def get_graph(case_id: str | None = Query(None, description="Filter to a single case")):
    """Return the full stored graph, optionally scoped to one case."""
    return graph_service.get_full_graph(case_id)


@router.get("/neighborhood/{node_id}", response_model=GraphData)
def get_neighborhood(node_id: str, depth: int = Query(3, ge=1, le=6, description="Hops from the node")):
    """Return a node's indirect relations up to `depth` levels away (default 3)."""
    return graph_service.get_neighborhood(node_id, depth)
