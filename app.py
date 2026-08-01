import os
import logging
import tempfile
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from google import genai
from google.genai import types
from database import Session, Transcription, init_db
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)
init_db()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
GEMINI_MODEL = "gemini-3.5-flash"
logger.info("gemini client initialized with model: %s", GEMINI_MODEL)

def transcribe_audio(audio_path):
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            types.Content(parts=[
                types.Part(inline_data=types.Blob(mime_type="audio/webm", data=audio_bytes)),
                types.Part(text=(
                    "transcribe this audio accurately. "
                    "the speech may be multilingual such as hindi, english, or mixed hinglish. "
                    "return only the transcribed text, nothing else. "
                    "preserve the original language as spoken, do not translate."
                ))
            ])
        ]
    )
    text = response.text.strip()
    has_devanagari = any('\u0900' <= c <= '\u097F' for c in text)
    language = "hi" if has_devanagari else "en"
    return text, language

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/transcribe", methods=["POST"])
def transcribe():
    if "audio" not in request.files:
        logger.warning("no audio file in request")
        return jsonify({"error": "no audio file provided"}), 400

    audio_file = request.files["audio"]
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        audio_file.save(tmp.name)
        tmp_path = tmp.name

    try:
        file_size = os.path.getsize(tmp_path)
        logger.info("audio file size: %s bytes", file_size)
        if file_size < 1000:
            return jsonify({"error": "audio too short, please speak for at least 3 seconds"}), 400

        text, language = transcribe_audio(tmp_path)
        logger.info("transcribed | lang: %s | preview: %s", language, text[:80])
    except Exception as e:
        logger.error("transcription failed: %s", e)
        return jsonify({"error": "transcription failed, please try again"}), 500
    finally:
        os.unlink(tmp_path)

    if not text:
        return jsonify({"error": "could not transcribe audio"}), 400

    session = Session()
    try:
        entry = Transcription(
            text=text,
            language=language,
            title=f"recording {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
        )
        session.add(entry)
        session.commit()
        logger.info("saved to db, id: %s", entry.id)
        return jsonify({"id": entry.id, "text": text, "language": language, "engine": "gemini"})
    except Exception as e:
        logger.error("db save failed: %s", e)
        return jsonify({"error": "failed to save transcription"}), 500
    finally:
        session.close()

@app.route("/api/transcriptions", methods=["GET"])
def get_all():
    session = Session()
    try:
        records = session.query(Transcription).order_by(Transcription.created_at.desc()).all()
        return jsonify([{
            "id": r.id, "title": r.title, "text": r.text,
            "language": r.language,
            "created_at": r.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "updated_at": r.updated_at.strftime("%Y-%m-%d %H:%M:%S")
        } for r in records])
    finally:
        session.close()

@app.route("/api/transcriptions/<int:tid>", methods=["GET"])
def get_one(tid):
    session = Session()
    try:
        r = session.get(Transcription, tid)
        if not r:
            return jsonify({"error": "not found"}), 404
        return jsonify({"id": r.id, "title": r.title, "text": r.text, "language": r.language,
                        "created_at": r.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                        "updated_at": r.updated_at.strftime("%Y-%m-%d %H:%M:%S")})
    finally:
        session.close()

@app.route("/api/transcriptions/<int:tid>", methods=["PUT"])
def update(tid):
    session = Session()
    try:
        r = session.get(Transcription, tid)
        if not r:
            return jsonify({"error": "not found"}), 404
        data = request.json
        if "title" in data:
            r.title = data["title"]
        if "text" in data:
            r.text = data["text"]
        r.updated_at = datetime.utcnow()
        session.commit()
        logger.info("record updated: id %s", tid)
        return jsonify({"message": "updated successfully"})
    finally:
        session.close()

@app.route("/api/transcriptions/<int:tid>", methods=["DELETE"])
def delete(tid):
    session = Session()
    try:
        r = session.get(Transcription, tid)
        if not r:
            return jsonify({"error": "not found"}), 404
        session.delete(r)
        session.commit()
        logger.info("record deleted: id %s", tid)
        return jsonify({"message": "deleted successfully"})
    finally:
        session.close()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV", "production") != "production"
    logger.info("starting app on port %s", port)
    app.run(host="0.0.0.0", port=port, debug=debug)
