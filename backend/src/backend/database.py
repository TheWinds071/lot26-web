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

from backend.models import AlarmEvent, AlarmRule, TelemetryData

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
                    total_volume REAL DEFAULT 0.0,
                    water_level_tank1 REAL,
                    water_level_tank2 REAL,
                    timestamp TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """)
                try:
                    cursor.execute("ALTER TABLE telemetry_history ADD COLUMN total_volume REAL DEFAULT 0.0;")
                except sqlite3.OperationalError:
                    pass
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

                # System configuration table for persistent thresholds & settings
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);")

                # Alarm rules table for dynamic rule engine
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS alarm_rules (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    metric TEXT NOT NULL,
                    operator TEXT NOT NULL,
                    threshold REAL NOT NULL,
                    level TEXT NOT NULL,
                    message TEXT,
                    action TEXT DEFAULT 'NONE',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    is_system INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                """)
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_alarm_rules_metric ON alarm_rules(metric);")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_alarm_rules_enabled ON alarm_rules(enabled);")

                # Seed initial default rules if alarm_rules table is empty
                cursor.execute("SELECT COUNT(*) as cnt FROM alarm_rules;")
                count_row = cursor.fetchone()
                if count_row and count_row["cnt"] == 0:
                    now_iso = datetime.now().isoformat()
                    default_rules = [
                        (
                            "rule_temp_max",
                            "水槽水温超高保护",
                            "temp_tank2",
                            ">=",
                            75.0,
                            "ERROR",
                            "水槽2水温超高保护触发，系统已自动切断加热",
                            "STOP_HEATER",
                            1,
                            1,
                            now_iso,
                        ),
                        (
                            "rule_temp_diff",
                            "双水槽温差过大预警",
                            "temp_diff",
                            ">=",
                            15.0,
                            "WARNING",
                            "双水槽温差过大预警",
                            "NONE",
                            1,
                            1,
                            now_iso,
                        ),
                        (
                            "rule_overpressure",
                            "单管路超压保护",
                            "pressure",
                            ">=",
                            800000.0,
                            "CRITICAL",
                            "单管道水压超限报警",
                            "STOP_HEATER",
                            1,
                            1,
                            now_iso,
                        ),
                        (
                            "rule_low_flow",
                            "微流防干烧保护",
                            "flow_rate",
                            "<",
                            0.05,
                            "WARNING",
                            "管道流速过低防干烧预警",
                            "STOP_HEATER",
                            1,
                            1,
                            now_iso,
                        ),
                        (
                            "rule_tank1_low",
                            "水槽1低水位报警",
                            "water_level_tank1",
                            "<=",
                            20.0,
                            "WARNING",
                            "水槽1液位过低，请注意补水",
                            "NONE",
                            1,
                            0,
                            now_iso,
                        ),
                    ]
                    cursor.executemany(
                        """
                        INSERT INTO alarm_rules (
                            id, name, metric, operator, threshold, level, message, action, enabled, is_system, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        default_rules,
                    )
                    logger.info(f"Seeded {len(default_rules)} default alarm rules into SQLite.")

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

        tot_vol = float(telemetry.total_volume) if telemetry.total_volume is not None else 0.0

        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO telemetry_history (
                        device_id, temp_tank1, temp_tank2, temperature,
                        pressure, flow_rate, total_volume, water_level_tank1, water_level_tank2,
                        timestamp, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        telemetry.device_id,
                        telemetry.temp_tank1,
                        telemetry.temp_tank2,
                        avg_temp,
                        telemetry.pressure,
                        telemetry.flow_rate,
                        tot_vol,
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
            tot_vol = float(t.total_volume) if t.total_volume is not None else 0.0
            records.append((
                t.device_id,
                t.temp_tank1,
                t.temp_tank2,
                avg_temp,
                t.pressure,
                t.flow_rate,
                tot_vol,
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
                        pressure, flow_rate, total_volume, water_level_tank1, water_level_tank2,
                        timestamp, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    records,
                )
                conn.commit()
                return cursor.rowcount

    def _row_to_telemetry(self, row: sqlite3.Row) -> TelemetryData:
        row_keys = row.keys() if hasattr(row, "keys") else []
        tot_vol = row["total_volume"] if "total_volume" in row_keys else 0.0
        return TelemetryData(
            device_id=row["device_id"],
            temp_tank1=row["temp_tank1"],
            temp_tank2=row["temp_tank2"],
            temperature=row["temperature"],
            pressure=row["pressure"],
            flow_rate=row["flow_rate"],
            total_volume=tot_vol,
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
        limit: Optional[int] = None,
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
        query += f" ORDER BY timestamp {order_clause}"
        if limit is not None and limit > 0:
            query += " LIMIT ? OFFSET ?"
            params.extend([limit, offset])
        elif offset > 0:
            query += " LIMIT -1 OFFSET ?"
            params.append(offset)

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
            "TotalVolume(L)",
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
                t.total_volume if t.total_volume is not None else 0.0,
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

    def get_config(self, key: str) -> Optional[str]:
        """Retrieves a configuration value (e.g. JSON string) by key from SQLite."""
        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT value FROM system_config WHERE key = ?;", (key,))
                row = cursor.fetchone()
                if row:
                    return str(row["value"])
                return None

    def set_config(self, key: str, value: str) -> None:
        """Inserts or updates a configuration value in SQLite."""
        now_str = self._format_datetime(datetime.now())
        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO system_config (key, value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        value = excluded.value,
                        updated_at = excluded.updated_at;
                    """,
                    (key, value, now_str),
                )
                conn.commit()

    def clear_telemetry_history(self) -> int:
        """Clears all historical telemetry records from SQLite."""
        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM telemetry_history;")
                deleted = cursor.rowcount
                conn.commit()
                logger.info(f"Cleared {deleted} telemetry records from SQLite.")
                return deleted

    def _row_to_alarm_rule(self, row: sqlite3.Row) -> AlarmRule:
        created_at_val = row["created_at"]
        if isinstance(created_at_val, str):
            try:
                created_at = datetime.fromisoformat(created_at_val)
            except Exception:
                created_at = datetime.now()
        else:
            created_at = datetime.now()

        return AlarmRule(
            id=row["id"],
            name=row["name"],
            metric=row["metric"],
            operator=row["operator"],
            threshold=float(row["threshold"]),
            level=row["level"],
            message=row["message"],
            action=row["action"] or "NONE",
            enabled=bool(row["enabled"]),
            is_system=bool(row["is_system"]),
            created_at=created_at,
        )

    def get_alarm_rules(self) -> List[AlarmRule]:
        """Returns all configured alarm rules from SQLite."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM alarm_rules ORDER BY is_system DESC, created_at ASC;")
            rows = cursor.fetchall()
            return [self._row_to_alarm_rule(r) for r in rows]

    def get_alarm_rule(self, rule_id: str) -> Optional[AlarmRule]:
        """Returns a single alarm rule by ID."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM alarm_rules WHERE id = ?;", (rule_id,))
            row = cursor.fetchone()
            if row:
                return self._row_to_alarm_rule(row)
            return None

    def insert_alarm_rule(self, rule: AlarmRule) -> AlarmRule:
        """Inserts a new alarm rule into SQLite."""
        now_str = self._format_datetime(rule.created_at or datetime.now())
        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO alarm_rules (
                        id, name, metric, operator, threshold, level, message, action, enabled, is_system, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        rule.id,
                        rule.name,
                        rule.metric,
                        rule.operator,
                        rule.threshold,
                        rule.level,
                        rule.message,
                        rule.action,
                        1 if rule.enabled else 0,
                        1 if rule.is_system else 0,
                        now_str,
                    ),
                )
                conn.commit()
                logger.info(f"Inserted new alarm rule: {rule.name} ({rule.id})")
                return rule

    def update_alarm_rule(self, rule: AlarmRule) -> AlarmRule:
        """Updates an existing alarm rule in SQLite."""
        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE alarm_rules SET
                        name = ?,
                        metric = ?,
                        operator = ?,
                        threshold = ?,
                        level = ?,
                        message = ?,
                        action = ?,
                        enabled = ?
                    WHERE id = ?;
                    """,
                    (
                        rule.name,
                        rule.metric,
                        rule.operator,
                        rule.threshold,
                        rule.level,
                        rule.message,
                        rule.action,
                        1 if rule.enabled else 0,
                        rule.id,
                    ),
                )
                conn.commit()
                logger.info(f"Updated alarm rule: {rule.name} ({rule.id})")
                return rule

    def delete_alarm_rule(self, rule_id: str) -> bool:
        """Deletes an alarm rule from SQLite."""
        with self._lock:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM alarm_rules WHERE id = ?;", (rule_id,))
                deleted = cursor.rowcount > 0
                conn.commit()
                if deleted:
                    logger.info(f"Deleted alarm rule {rule_id}")
                return deleted


# Global database manager instance
db_manager = DatabaseManager()
