import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

import json5

from backend.models import ThresholdConfig

logger = logging.getLogger("config_loader")


class ConfigLoader:
    """Loads and manages JSON5 configuration for the dual-tank SCADA system."""

    def __init__(self, config_filename: str = "config.json5"):
        self.config_filename = config_filename
        self.config_path: Optional[Path] = self._find_config_file()
        self.raw_config: Dict[str, Any] = {}
        self.load_config()

    def _find_config_file(self) -> Optional[Path]:
        """Searches for config.json5 in current working directory, project root, or parent directories."""
        candidates = [
            Path(self.config_filename),
            Path("..") / self.config_filename,
            Path(__file__).resolve().parent.parent.parent.parent / self.config_filename,
            Path(__file__).resolve().parent.parent.parent / self.config_filename,
        ]
        for p in candidates:
            if p.is_file():
                return p.resolve()
        return None

    def load_config(self) -> Dict[str, Any]:
        """Parses and loads the config.json5 file."""
        if not self.config_path or not self.config_path.is_file():
            # Retry searching in case path changed
            self.config_path = self._find_config_file()

        if self.config_path and self.config_path.is_file():
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    self.raw_config = json5.load(f)
                logger.info(f"Successfully loaded system configuration from: {self.config_path}")
                return self.raw_config
            except Exception as e:
                logger.error(f"Failed to parse {self.config_path} as JSON5: {e}")
        else:
            logger.warning(f"Could not locate {self.config_filename}, fallback to internal defaults.")

        return self.raw_config

    @property
    def tcp_server_config(self) -> Dict[str, Any]:
        """Returns TCP server socket configuration with environment variable override support."""
        default_tcp = {
            "host": "0.0.0.0",
            "port": 8888,
            "buffer_size_bytes": 4096,
            "delimiter": "\n",
            "encoding": "utf-8",
        }
        try:
            tcp_cfg = (
                self.raw_config.get("communication_protocols", {})
                .get("tcp_socket", {})
            )
            server_cfg = tcp_cfg.get("server", {})
            framing_cfg = tcp_cfg.get("framing", {})

            host = server_cfg.get("host", default_tcp["host"])
            port = int(server_cfg.get("port", default_tcp["port"]))

            # Environment variables take highest precedence if defined
            env_var = server_cfg.get("env_var_override", "TCP_PORT")
            if os.environ.get(env_var):
                port = int(os.environ[env_var])
            if os.environ.get("TCP_HOST"):
                host = os.environ["TCP_HOST"]

            return {
                "host": host,
                "port": port,
                "buffer_size_bytes": framing_cfg.get("buffer_size_bytes", 4096),
                "delimiter": framing_cfg.get("delimiter", "\n"),
                "encoding": framing_cfg.get("encoding", "utf-8"),
            }
        except Exception as e:
            logger.warning(f"Error reading TCP config from JSON5: {e}")
            return default_tcp

    @property
    def storage_tank_config(self) -> Dict[str, Any]:
        """Returns Storage Tank (Tank 1) specification."""
        return self.raw_config.get("storage_tank", {})

    @property
    def heating_tank_config(self) -> Dict[str, Any]:
        """Returns Heating Tank (Tank 2) specification."""
        return self.raw_config.get("heating_tank", {})

    def get_initial_thresholds(self) -> ThresholdConfig:
        """Constructs ThresholdConfig using values defined in config.json5."""
        try:
            heating_mod = self.heating_tank_config.get("heating_module", {})
            temp_ctrl = heating_mod.get("temperature_control_thresholds", {})
            safety = self.raw_config.get("system_safety_thresholds", {})
            pipe = self.raw_config.get("single_pipeline_network", {})
            press_sensor = pipe.get("pressure_sensor", {})
            flow_sensor = pipe.get("flow_sensor", {})
            volume_ctrl = flow_sensor.get("volume_control", {})

            return ThresholdConfig(
                temp_target=float(temp_ctrl.get("target_temperature_celsius", 55.0)),
                temp_min=float(temp_ctrl.get("min_trigger_temperature_celsius", 45.0)),
                temp_max=float(temp_ctrl.get("max_temperature_limit_celsius", 75.0)),
                temp_diff_max=float(safety.get("max_temperature_difference_celsius", 15.0)),
                pressure_min=float(press_sensor.get("safe_working_range_pa", {}).get("min", 10000.0)),
                pressure_max=float(press_sensor.get("overpressure_alarm_threshold_pa", 800000.0)),
                flow_rate_min=float(flow_sensor.get("min_flow_dry_run_threshold_lpm", 0.05)),
                flow_rate_target=float(flow_sensor.get("target_flow_rate_lpm", 0.30)),
                target_volume=float(volume_ctrl.get("target_volume_liters", 10.0)),
                volume_control_enabled=bool(volume_ctrl.get("enabled", True)),
            )
        except Exception as e:
            logger.warning(f"Could not derive ThresholdConfig from JSON5: {e}, using defaults.")
            return ThresholdConfig()


# Singleton instance
config_loader = ConfigLoader()
