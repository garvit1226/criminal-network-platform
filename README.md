# vigilnode — Criminal Network Analysis Platform

An investigator dashboard that turns typed or spoken crime reports into an
explorable relationship graph, and continuously scans that graph for
red-flag patterns using a rule-based anomaly engine.

```
Crime report (text/voice)
        |
        v
 Whisper STT  --->  spaCy + Regex extraction  --->  Neo4j graph store
                                                            |
                                        +-------------------+-------------------+
                                        v                                       v
                             Cytoscape.js graph UI                Python anomaly rule engine
                             (React + Tailwind)                   (10 predefined rules)
```

## Project layout

```
criminal-network-platform/
├── backend/                 FastAPI service
│   ├── app/
│   │   ├── main.py          App entrypoint, CORS, /api/health
│   │   ├── config.py        Environment-driven settings
│   │   ├── models/          Pydantic schemas
│   │   ├── services/
│   │   │   ├── extraction.py     spaCy + regex entity/relationship extraction
│   │   │   ├── graph_service.py  Neo4j persistence + queries
│   │   │   ├── anomaly_rules.py  10-rule anomaly detection engine
│   │   │   └── stt_service.py    Whisper transcription
│   │   └── routers/
│   │       ├── reports.py   Submit text/voice reports
│   │       ├── graph.py     Full graph + node neighborhood (up to N levels)
│   │       └── anomalies.py Run the rule engine
│   ├── requirements.txt
│   └── .env.example
└── frontend/                 React + Tailwind + Cytoscape.js dashboard
    ├── src/
    │   ├── components/       Navbar, ReportInput, GraphView, FilterPanel, AnomalyPanel, StatCard
    │   ├── services/api.js   Axios client for the backend
    │   └── App.jsx           Dashboard layout
    └── .env.example
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- A running Neo4j instance (Neo4j Desktop, Docker, or Aura). The easiest
  local option is Docker:
  ```bash
  docker run -d --name caseweb-neo4j -p 7474:7474 -p 7687:7687 \
    -e NEO4J_AUTH=neo4j/changeme neo4j:5
  ```
  Neo4j Browser will be at http://localhost:7474.

## Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt
python -m spacy download en_core_web_sm

cp .env.example .env               # then edit NEO4J_PASSWORD etc. to match your Neo4j instance

uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

> Note: `openai-whisper` also requires `ffmpeg` on your system PATH
> (`brew install ffmpeg` / `apt install ffmpeg` / choco on Windows) for
> audio decoding.

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env               # points VITE_API_BASE at the backend

npm run dev
```

Open http://localhost:5173.

## Using the platform

1. Enter a case/FIR number and type (or dictate) a crime report narrative
   in the left panel, then click **Extract & add to graph**.
2. The extracted people, locations, phone numbers, accounts, vehicles and
   the relationships between them appear in the graph in the center panel.
3. Click any node to focus the graph on that entity's indirect relations,
   and use the depth slider (1–5, default 3) to widen or narrow how many
   hops away to include.
4. Click **Run scan** in the right panel to execute all 10 anomaly rules
   against the current graph and review the flagged alerts. Clicking an
   alert focuses the graph on the entity it involves.

## The 10 anomaly rules

| # | Rule | What it flags |
|---|------|----------------|
| R1 | Disproportionate money transfer | Large outgoing transfer from someone with no recorded income source |
| R2 | Recurring meetings at same location | Two people meeting at the same place 3+ times |
| R3 | Possible structuring (smurfing) | Many small transfers to the same recipient, under a threshold |
| R4 | Unusually high number of connections | An entity acting as a network hub |
| R5 | Circular money flow | A → B → C → ... → A payment cycles |
| R6 | Isolated large transaction | A single large transfer with no other relationship on record |
| R7 | Call followed by in-person meeting | Coordination pattern between two people |
| R8 | Shared asset, no direct link | Two people share a vehicle/account/phone but have no direct relationship |
| R9 | Shared identity asset | One phone/account linked to multiple different people |
| R10 | Person linked across multiple cases | Same person reappears in previously unconnected cases |

Rules live in `backend/app/services/anomaly_rules.py` — each is a small,
independent function, so adding an 11th rule is a matter of writing one
function and registering it in the `RULES` list.

## Notes & next steps

- The extraction pipeline is fully offline (no LLM API calls) so it's fast
  and cheap to run; it's tuned to be a solid first pass that an investigator
  reviews/corrects in the UI rather than a fully automated final answer.
- Neo4j uses a generic `:Entity` node with an additional dynamic label
  (`:PERSON`, `:LOCATION`, etc.) and a single `RELATES` relationship type
  carrying a `type` property, which keeps Cypher queries simple while
  still letting you filter by relationship type in the UI later.
- For production, put the Whisper model load behind a background worker
  queue (e.g. Celery/RQ) so large audio files don't block API workers.
