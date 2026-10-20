
"""Read-only, authenticated API for DIDEBAN Model Registry."""

import os
import secrets
import sqlite3
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.model_registry import ModelRegistry


router = APIRouter(
    prefix="/api/v1/model-registry",
    tags=["Model Registry"],
)


def require_registry_key(
    x_registry_key: str | None = Header(default=None),
) -> None:
    expected_key = os.getenv("DIDEBAN_REGISTRY_API_KEY", "")

    # Fail closed when the service has not been configured.
    if len(expected_key) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model Registry API is not configured",
        )

    if not x_registry_key or not secrets.compare_digest(
        x_registry_key,
        expected_key,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Registry API credentials",
            headers={"WWW-Authenticate": "ApiKey"},
        )


def get_registry() -> ModelRegistry:
    try:
        return ModelRegistry()
    except (sqlite3.Error, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model Registry storage is unavailable",
        ) from exc


@router.get(
    "/models",
    response_model=List[Dict[str, Any]],
    dependencies=[Depends(require_registry_key)],
)
def list_registered_models(
    registry: ModelRegistry = Depends(get_registry),
):
    try:
        return registry.list_models()
    except (sqlite3.Error, OSError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to read Model Registry",
        ) from exc


@router.get(
    "/models/{model_name}/{version}",
    response_model=Dict[str, Any],
    dependencies=[Depends(require_registry_key)],
)
def get_registered_model(
    model_name: str,
    version: str,
    registry: ModelRegistry = Depends(get_registry),
):
    try:
        model = registry.get_model(model_name, version)
    except (sqlite3.Error, OSError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to read Model Registry",
        ) from exc

    if model is None:
        raise HTTPException(
            status_code=404,
            detail="Model version not found",
        )

    return model


@router.get(
    "/models/{model_name}/{version}/events",
    response_model=List[Dict[str, Any]],
    dependencies=[Depends(require_registry_key)],
)
def get_model_events(
    model_name: str,
    version: str,
    registry: ModelRegistry = Depends(get_registry),
):
    try:
        model = registry.get_model(model_name, version)

        if model is None:
            raise HTTPException(
                status_code=404,
                detail="Model version not found",
            )

        return registry.get_events(model_name, version)

    except (sqlite3.Error, OSError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to read Model Registry",
        ) from exc
