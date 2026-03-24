from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routers import auth, workouts, metrics, profile, chat, memory

app = FastAPI(
    title="GymBro API",
    version="1.0.0",
    debug=settings.DEBUG
)

# CORS — allows React frontend to talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(workouts.router)
app.include_router(metrics.router)
app.include_router(profile.router)
app.include_router(chat.router)  
app.include_router(memory.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}