import logging
import sys

def setup_logging(log_level: str = "INFO") -> None:
    numeric_level = getattr(logging.LogLevel if hasattr(logging, "LogLevel") else logging, log_level.upper(), logging.INFO)
    
    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    root_logger.handlers = [handler]
    
    # Silence noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


logger = logging.getLogger("retail_pricing")
