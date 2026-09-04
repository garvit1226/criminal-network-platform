"""
Graph service for vigilnode.

Stores extracted entities and relationships in Neo4j and returns
both connected AND standalone entities to the frontend.
"""

from neo4j import GraphDatabase

from app.config import settings
from app.models.schemas import ExtractionResult, GraphData, GraphNode, GraphEdge


class GraphService:
    def __init__(self):
        self._driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(
                settings.neo4j_user,
                settings.neo4j_password,
            ),
        )

    def close(self):
        self._driver.close()

    def verify_connectivity(self):
        self._driver.verify_connectivity()

    # ============================================================
    # CLEAR GRAPH
    # ============================================================

    def clear_graph(self) -> None:
        """
        Prototype mode:
        completely clears the previous graph before a new case.
        """
        with self._driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")

    # ============================================================
    # SAVE EXTRACTION
    # ============================================================

    def save_extraction(self, result: ExtractionResult) -> None:
        with self._driver.session() as session:
            session.execute_write(
                self._write_extraction_tx,
                result,
            )

    @staticmethod
    def _write_extraction_tx(tx, result: ExtractionResult):

        # --------------------------------------------------------
        # SAVE EVERY ENTITY
        # --------------------------------------------------------

        for entity in result.entities:

            tx.run(
                f"""
                MERGE (n:Entity {{id: $id}})
                SET
                    n.name = $name,
                    n.label = $label,
                    n.case_id = $case_id
                SET n:`{entity.label}`
                """,
                id=entity.id,
                name=entity.name,
                label=entity.label,
                case_id=result.case_id,
            )

        # --------------------------------------------------------
        # SAVE RELATIONSHIPS
        # --------------------------------------------------------

        for relationship in result.relationships:

            tx.run(
                """
                MATCH
                    (a:Entity {id: $source}),
                    (b:Entity {id: $target})

                MERGE (a)-[
                    rel:RELATES {
                        type: $type,
                        case_id: $case_id
                    }
                ]->(b)

                SET
                    rel.context = $context,
                    rel.amount = $amount,
                    rel.timestamp = $timestamp,
                    rel.location = $location
                """,
                source=relationship.source,
                target=relationship.target,
                type=relationship.type,
                case_id=relationship.case_id,
                context=relationship.context,
                amount=relationship.amount,
                timestamp=relationship.timestamp,
                location=relationship.location,
            )

    # ============================================================
    # FULL GRAPH
    # ============================================================

    def get_full_graph(
        self,
        case_id: str | None = None,
    ) -> GraphData:

        with self._driver.session() as session:
            return session.execute_read(
                self._read_full_graph_tx,
                case_id,
            )

    @staticmethod
    def _read_full_graph_tx(
        tx,
        case_id: str | None,
    ) -> GraphData:

        # IMPORTANT:
        # Start from ALL nodes, not relationships.
        #
        # This means PHONE, ACCOUNT, VEHICLE, AMOUNT, DATE,
        # LOCATION and ORG nodes will also appear even if
        # they currently have no relationship.

        if case_id:

            query = """
                MATCH (n:Entity)
                WHERE n.case_id = $case_id

                OPTIONAL MATCH (n)-[r:RELATES]->(m:Entity)
                WHERE r.case_id = $case_id

                RETURN n, r, m
            """

            records = tx.run(
                query,
                case_id=case_id,
            )

        else:

            query = """
                MATCH (n:Entity)

                OPTIONAL MATCH (n)-[r:RELATES]->(m:Entity)

                RETURN n, r, m
            """

            records = tx.run(query)

        nodes: dict[str, GraphNode] = {}
        edges: dict[str, GraphEdge] = {}

        for record in records:

            n = record["n"]
            r = record["r"]
            m = record["m"]

            # ----------------------------------------------------
            # ALWAYS ADD PRIMARY NODE
            # ----------------------------------------------------

            nodes[n["id"]] = GraphNode(
                id=n["id"],
                label=n["label"],
                name=n["name"],
                properties=dict(n),
            )

            # ----------------------------------------------------
            # ADD CONNECTED TARGET
            # ----------------------------------------------------

            if m is not None:

                nodes[m["id"]] = GraphNode(
                    id=m["id"],
                    label=m["label"],
                    name=m["name"],
                    properties=dict(m),
                )

            # ----------------------------------------------------
            # ADD RELATIONSHIP
            # ----------------------------------------------------

            if r is not None and m is not None:

                edge_id = (
                    f"{n['id']}__"
                    f"{m['id']}__"
                    f"{r['type']}__"
                    f"{r.get('case_id', '')}"
                )

                edges[edge_id] = GraphEdge(
                    id=edge_id,
                    source=n["id"],
                    target=m["id"],
                    type=r["type"],
                    properties=dict(r),
                )

        return GraphData(
            nodes=list(nodes.values()),
            edges=list(edges.values()),
        )

    # ============================================================
    # NEIGHBORHOOD
    # ============================================================

    def get_neighborhood(
        self,
        node_id: str,
        depth: int = 3,
    ) -> GraphData:

        depth = max(1, min(depth, 6))

        with self._driver.session() as session:
            return session.execute_read(
                self._read_neighborhood_tx,
                node_id,
                depth,
            )

    @staticmethod
    def _read_neighborhood_tx(
        tx,
        node_id: str,
        depth: int,
    ) -> GraphData:

        query = f"""
            MATCH path =
                (start:Entity {{id: $node_id}})
                -[:RELATES*1..{depth}]-
                (other:Entity)

            UNWIND relationships(path) AS r

            WITH
                startNode(r) AS a,
                r,
                endNode(r) AS b

            RETURN DISTINCT a, r, b
        """

        records = tx.run(
            query,
            node_id=node_id,
        )

        nodes: dict[str, GraphNode] = {}
        edges: dict[str, GraphEdge] = {}

        for record in records:

            a = record["a"]
            r = record["r"]
            b = record["b"]

            nodes[a["id"]] = GraphNode(
                id=a["id"],
                label=a["label"],
                name=a["name"],
                properties=dict(a),
            )

            nodes[b["id"]] = GraphNode(
                id=b["id"],
                label=b["label"],
                name=b["name"],
                properties=dict(b),
            )

            edge_id = (
                f"{a['id']}__"
                f"{b['id']}__"
                f"{r['type']}"
            )

            edges[edge_id] = GraphEdge(
                id=edge_id,
                source=a["id"],
                target=b["id"],
                type=r["type"],
                properties=dict(r),
            )

        return GraphData(
            nodes=list(nodes.values()),
            edges=list(edges.values()),
        )

    # ============================================================
    # RAW RELATIONSHIPS
    # ============================================================

    def get_all_relationships_raw(self) -> list[dict]:

        with self._driver.session() as session:
            return session.execute_read(
                self._read_raw_tx
            )

    @staticmethod
    def _read_raw_tx(tx) -> list[dict]:

        query = """
            MATCH (a:Entity)-[r:RELATES]->(b:Entity)

            RETURN
                a.id AS source_id,
                a.name AS source_name,
                a.label AS source_label,

                b.id AS target_id,
                b.name AS target_name,
                b.label AS target_label,

                r.type AS type,
                r.amount AS amount,
                r.location AS location,
                r.timestamp AS timestamp,
                r.case_id AS case_id
        """

        return [
            dict(record)
            for record in tx.run(query)
        ]


graph_service = GraphService()