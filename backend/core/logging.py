"""Central logging configuration.

The original backend created `logging.getLogger("arogyaai")` without configuring
it, so it inherited uvicorn's root configuration. The named logger is preserved
here so existing log call sites and any log-based tooling keep working.
"""
import logging

LOGGER_NAME = "arogyaai"

logger = logging.getLogger(LOGGER_NAME)
