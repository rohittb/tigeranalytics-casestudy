from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import setup_logging, logger
from app.core.errors import AppException, app_exception_handler
from app.api.v1.health import router as health_router
from app.api.v1.pricing import router as pricing_router
from app.api.v1.imports import router as imports_router
from app.api.v1.stores import router as stores_router

setup_logging(settings.LOG_LEVEL)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Internal Retail Pricing Management System with optimistic concurrency and asynchronous CSV processing.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(AppException, app_exception_handler)

# Include API v1 Routers
app.include_router(health_router, prefix=settings.API_V1_STR)
app.include_router(pricing_router, prefix=settings.API_V1_STR)
app.include_router(imports_router, prefix=settings.API_V1_STR)
app.include_router(stores_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
def root_status():
    return {
        "service": settings.PROJECT_NAME,
        "version": "1.0.0",
        "api_docs": "/docs",
        "health": f"{settings.API_V1_STR}/health/live",
    }
