from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.services.graph_service import graph_service
from app.routers import reports, graph, anomalies


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast (but don't crash the app) if Neo4j isn't reachable at boot.
    try:
        graph_service.verify_connectivity()
        app.state.neo4j_ok = True
    except Exception:
        app.state.neo4j_ok = False
    yield
    graph_service.close()


app = FastAPI(
    title="Criminal Network Analysis Platform API",
    description="Extracts entities/relationships from crime reports, stores them in a graph, and runs anomaly detection.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reports.router)
app.include_router(graph.router)
app.include_router(anomalies.router)


@app.get("/api/health", tags=["health"])
def health_check():
    """Simple health-check endpoint used by the frontend and deploy tooling."""
    return {
        "status": "ok",
        "neo4j_connected": getattr(app.state, "neo4j_ok", False),
    }


@app.get("/", tags=["health"])
def root():
    return {"message": "Criminal Network Analysis Platform API is running. See /docs for the API reference."}
