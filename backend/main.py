from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import analyze, audio, chat, region, spectrogram, upload, waveform

app = FastAPI(
    title="Audio Pre/Post Comparison API",
    description="Local analysis backend for A/B comparison of unmastered vs mastered audio.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api")
app.include_router(analyze.router, prefix="/api")
app.include_router(region.router, prefix="/api")
app.include_router(waveform.router, prefix="/api")
app.include_router(spectrogram.router, prefix="/api")
app.include_router(audio.router, prefix="/api")
app.include_router(chat.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
