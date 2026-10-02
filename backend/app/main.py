from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import auth, health, studio, integrations
from app.providers import ProviderError
from fastapi.responses import JSONResponse

app = FastAPI(title=settings.app_name, version="0.1.0", docs_url="/docs" if settings.app_env != "production" else None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-CSRF-Token", "X-Request-ID"],
)
app.include_router(health.router)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(integrations.router, prefix=settings.api_prefix)
app.include_router(studio.router, prefix=settings.api_prefix)


@app.exception_handler(ProviderError)
async def provider_error(request, error):
    return JSONResponse(status_code=502, content={"detail": f"{error}. {error.fix}"})
