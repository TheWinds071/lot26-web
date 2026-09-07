import csv
import io
import logging
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.models import AlarmEvent, TelemetryData

logger = logging.getLogger("database")


class DatabaseManager:
    """SQLite Database Manager for recording and querying historical telemetry and alarms."""

    def __init__(self, db_path: Optional[str] = None):
        if db_path:
            self.db_path = Path(db_path)
        else:
            env_path = os.environ.get("LOT26_DB_PATH") or os.environ.get("SQLITE_DB_PATH")
            if env_path:
                self.db_path = Path(env_path)
            else:
                base_dir = Path(__file__).resolve().parent.parent.parent
                data_dir = base_dir / "data"
                data_dir.mkdir(parents=True, exist_ok=True)
                self.db_path = data_dir / "history.db"

        self._lock = threading.Lock()
        self._init_db()
        logger.info(f"SQLite Database initialized at: {self.db_path}")

    @contextmanager
    def get_connection(self):
        """Context manager for SQLite connection with Row factory."""
        conn = sqlite3.connect(
            str(self.db_path),
            check_same_thread=False,
            timeout=15.0,
        )
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self) -> None:
        """Creates tables and indexes if they do not exist."""
        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("PRAGMA journal_mode=WAL;")
                cursor.execute("PRAGMA synchronous=NORMAL;")

                # Telemetry history table
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS telemetry_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_id TEXT NOT NULL,
                    temp_tank1 REAL NOT NULL,
                    temp_tank2 REAL NOT NULL,
                    temperature REAL NOT NULL,
                    pressure REAL NOT NULL,
                    flow_rate REAL NOT NULL,
                    water_level_tank1 REAL,
                    water_level_tank2 REAL,
                    timestamp TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """)
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_history(timestamp);")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_device ON telemetry_history(device_id);")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry_history(created_at);")

                # Alarm events history table
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS alarm_history (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    level TEXT NOT NULL,
                    type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    value REAL,
                    resolved INTEGER NOT NULL DEFAULT 0,
                    resolved_at TEXT
                );
                """)
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_alarm_timestamp ON alarm_history(timestamp);")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_alarm_type ON alarm_history(type);")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_alarm_level ON alarm_history(level);")

                conn.commit()

    @staticmethod
    def _format_datetime(val: Any) -> str:
        if isinstance(val, datetime):
            return val.isoformat()
        if isinstance(val, str):
            return val
        return datetime.now().isoformat()

    def insert_telemetry(self, telemetry: TelemetryData) -> int:
        """Inserts a single telemetry record into SQLite."""
        ts_str = self._format_datetime(telemetry.timestamp)
        now_str = datetime.now().isoformat()
        avg_temp = (
            telemetry.temperature
            if telemetry.temperature is not None
            else round((telemetry.temp_tank1 + telemetry.temp_tank2) / 2.0, 2)
        )

        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO telemetry_history (
                        device_id, temp_tank1, temp_tank2, temperature,
                        pressure, flow_rate, water_level_tank1, water_level_tank2,
                        timestamp, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        telemetry.device_id,
                        telemetry.temp_tank1,
                        telemetry.temp_tank2,
                        avg_temp,
                        telemetry.pressure,
                        telemetry.flow_rate,
                        telemetry.water_level_tank1,
                        telemetry.water_level_tank2,
                        ts_str,
                        now_str,
                    ),
                )
                conn.commit()
                return cursor.lastrowid or 0

    def insert_telemetries_batch(self, telemetries: List[TelemetryData]) -> int:
        """Inserts a batch of telemetry records in a single transaction."""
        if not telemetries:
            return 0

        now_str = datetime.now().isoformat()
        records = []
        for t in telemetries:
            avg_temp = (
                t.temperature
                if t.temperature is not None
                else round((t.temp_tank1 + t.temp_tank2) / 2.0, 2)
            )
            records.append((
                t.device_id,
                t.temp_tank1,
                t.temp_tank2,
                avg_temp,
                t.pressure,
                t.flow_rate,
                t.water_level_tank1,
                t.water_level_tank2,
                self._format_datetime(t.timestamp),
                now_str,
            ))

        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.executemany(
                    """
                    INSERT INTO telemetry_history (
                        device_id, temp_tank1, temp_tank2, temperature,
                        pressure, flow_rate, water_level_tank1, water_level_tank2,
                        timestamp, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    records,
                )
                conn.commit()
                return cursor.rowcount

    def _row_to_telemetry(self, row: sqlite3.Row) -> TelemetryData:
        return TelemetryData(
            device_id=row["device_id"],
            temp_tank1=row["temp_tank1"],
            temp_tank2=row["temp_tank2"],
            temperature=row["temperature"],
            pressure=row["pressure"],
            flow_rate=row["flow_rate"],
            water_level_tank1=row["water_level_tank1"],
            water_level_tank2=row["water_level_tank2"],
            timestamp=row["timestamp"],
        )

    def get_recent_telemetry(self, limit: int = 100) -> List[TelemetryData]:
        """Fetches recent telemetry records sorted by timestamp ascending for charts."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM (
                    SELECT * FROM telemetry_history
                    ORDER BY id DESC
                    LIMIT ?
                ) ORDER BY id ASC
                """,
                (limit,),
            )
            rows = cursor.fetchall()
            return [self._row_to_telemetry(r) for r in rows]

    def query_telemetry(
        self,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
        order: str = "DESC",
    ) -> List[TelemetryData]:
        """Queries telemetry history with optional time filtering and pagination."""
        query = "SELECT * FROM telemetry_history WHERE 1=1"
        params: List[Any] = []

        if start_time:
            query += " AND timestamp >= ?"
            params.append(start_time)
        if end_time:
            query += " AND timestamp <= ?"
            params.append(end_time)

        order_clause = "ASC" if order.upper() == "ASC" else "DESC"
        query += f" ORDER BY timestamp {order_clause} LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [self._row_to_telemetry(r) for r in rows]

    def get_telemetry_count(
        self,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
    ) -> int:
        """Returns the total number of telemetry records matching filter criteria."""
        query = "SELECT COUNT(*) FROM telemetry_history WHERE 1=1"
        params: List[Any] = []

        if start_time:
            query += " AND timestamp >= ?"
            params.append(start_time)
        if end_time:
            query += " AND timestamp <= ?"
            params.append(end_time)

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            res = cursor.fetchone()
            return res[0] if res else 0

    def get_telemetry_stats(
        self,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Returns statistical summary (count, min, max, avg) for historical telemetry."""
        query = """
        SELECT
            COUNT(*) as total_count,
            MIN(timestamp) as earliest_time,
            MAX(timestamp) as latest_time,
            MIN(temp_tank1) as min_t1, MAX(temp_tank1) as max_t1, AVG(temp_tank1) as avg_t1,
            MIN(temp_tank2) as min_t2, MAX(temp_tank2) as max_t2, AVG(temp_tank2) as avg_t2,
            MIN(pressure) as min_p, MAX(pressure) as max_p, AVG(pressure) as avg_p,
            MIN(flow_rate) as min_flow, MAX(flow_rate) as max_flow, AVG(flow_rate) as avg_flow
        FROM telemetry_history
        WHERE 1=1
        """
        params: List[Any] = []
        if start_time:
            query += " AND timestamp >= ?"
            params.append(start_time)
        if end_time:
            query += " AND timestamp <= ?"
            params.append(end_time)

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            r = cursor.fetchone()
            if not r or r["total_count"] == 0:
                return {
                    "total_count": 0,
                    "earliest_time": None,
                    "latest_time": None,
                }

            return {
                "total_count": r["total_count"],
                "earliest_time": r["earliest_time"],
                "latest_time": r["latest_time"],
                "temp_tank1": {
                    "min": round(r["min_t1"] or 0, 2),
                    "max": round(r["max_t1"] or 0, 2),
                    "avg": round(r["avg_t1"] or 0, 2),
                },
                "temp_tank2": {
                    "min": round(r["min_t2"] or 0, 2),
                    "max": round(r["max_t2"] or 0, 2),
                    "avg": round(r["avg_t2"] or 0, 2),
                },
                "pressure": {
                    "min": round(r["min_p"] or 0, 3),
                    "max": round(r["max_p"] or 0, 3),
                    "avg": round(r["avg_p"] or 0, 3),
                },
                "flow_rate": {
                    "min": round(r["min_flow"] or 0, 2),
                    "max": round(r["max_flow"] or 0, 2),
                    "avg": round(r["avg_flow"] or 0, 2),
                },
            }

    def insert_or_update_alarm(self, alarm: AlarmEvent) -> None:
        """Inserts or updates an alarm event record."""
        ts_str = self._format_datetime(alarm.timestamp)
        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO alarm_history (id, timestamp, level, type, message, value, resolved)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        timestamp=excluded.timestamp,
                        message=excluded.message,
                        value=excluded.value,
                        resolved=excluded.resolved
                    """,
                    (
                        alarm.id,
                        ts_str,
                        alarm.level,
                        alarm.type,
                        alarm.message,
                        alarm.value,
                        1 if alarm.resolved else 0,
                    ),
                )
                conn.commit()

    def resolve_alarm(self, alarm_type: str, resolved_at: Optional[datetime] = None) -> None:
        """Marks active alarms of given type as resolved."""
        res_str = self._format_datetime(resolved_at or datetime.now())
        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE alarm_history
                    SET resolved = 1, resolved_at = ?
                    WHERE type = ? AND resolved = 0
                    """,
                    (res_str, alarm_type),
                )
                conn.commit()

    def get_alarm_history(
        self,
        limit: int = 50,
        level: Optional[str] = None,
        resolved: Optional[bool] = None,
    ) -> List[AlarmEvent]:
        """Fetches historical alarms with optional filtering."""
        query = "SELECT * FROM alarm_history WHERE 1=1"
        params: List[Any] = []

        if level:
            query += " AND level = ?"
            params.append(level)
        if resolved is not None:
            query += " AND resolved = ?"
            params.append(1 if resolved else 0)

        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [
                AlarmEvent(
                    id=r["id"],
                    timestamp=r["timestamp"],
                    level=r["level"],
                    type=r["type"],
                    message=r["message"],
                    value=r["value"],
                    resolved=bool(r["resolved"]),
                )
                for r in rows
            ]

    def export_telemetry_csv(
        self,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 5000,
    ) -> str:
        """Exports filtered telemetry history as CSV string."""
        records = self.query_telemetry(
            start_time=start_time,
            end_time=end_time,
            limit=limit,
            order="ASC",
        )

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Timestamp",
            "DeviceID",
            "Tank1_Temp(C)",
            "Tank2_Temp(C)",
            "Avg_Temp(C)",
            "Pressure(MPa)",
            "FlowRate(L/min)",
            "Tank1_Level(%)",
            "Tank2_Level(%)",
        ])

        for t in records:
            writer.writerow([
                self._format_datetime(t.timestamp),
                t.device_id,
                t.temp_tank1,
                t.temp_tank2,
                t.temperature,
                t.pressure,
                t.flow_rate,
                t.water_level_tank1,
                t.water_level_tank2,
            ])

        return output.getvalue()

    def clean_old_records(self, days: int = 30) -> int:
        """Cleans telemetry records older than specified days to manage storage."""
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM telemetry_history WHERE timestamp < ?", (cutoff,))
                deleted = cursor.rowcount
                conn.commit()
                logger.info(f"Cleaned {deleted} telemetry records older than {days} days.")
                return deleted


# Global database manager instance
db_manager = DatabaseManager()
