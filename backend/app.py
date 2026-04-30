import json
import logging
import os
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from flask import Flask, jsonify, request
import jwt
from datetime import timedelta
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import text
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

GOOGLE_CLIENT_ID = "555185131868-mvkio7hhse2ka2m14seida28u4vra5fu.apps.googleusercontent.com"

SECRET_KEY = "change-this-to-a-long-random-secret"
JWT_ALGORITHM = "HS256"

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


app = Flask(__name__)
app.logger.setLevel(logging.INFO)

basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'app.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=True)
    role = db.Column(db.String(120), nullable=True)
    avatar_id = db.Column(db.String(50), default="generic")

class InterviewSession(db.Model):
    __tablename__ = 'interview_session'
    id = db.Column(db.String(120), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_at = db.Column(db.String(50))
    ended_at = db.Column(db.String(50), nullable=True)
    status = db.Column(db.String(20), default='active')
    job_description = db.Column(db.Text)
    background = db.Column(db.Text)
    topics = db.Column(db.Text)
    current_topic_index = db.Column(db.Integer, default=0)
    messages = db.Column(db.Text)

class Feedback(db.Model):
    __tablename__ = 'feedback'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(120), db.ForeignKey('interview_session.id'), nullable=False)
    clarity_score = db.Column(db.Integer)
    relevance_score = db.Column(db.Integer)
    structure_score = db.Column(db.Integer)
    confidence_score = db.Column(db.Integer)
    depth_score = db.Column(db.Integer)
    overall_note = db.Column(db.Text)
    raw_data = db.Column(db.Text)

with app.app_context():
    db.create_all()
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE user ADD COLUMN name VARCHAR(120)"))
            conn.execute(text("ALTER TABLE user ADD COLUMN role VARCHAR(120)"))
            conn.execute(text("ALTER TABLE user ADD COLUMN avatar_id VARCHAR(50)"))
            conn.commit()
    except Exception:
        pass

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


def _utc_now() -> str: return datetime.now(timezone.utc).isoformat()


def _parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return False


def _debug_enabled() -> bool:
    header_debug = request.headers.get("X-Debug")
    query_debug = request.args.get("debug")
    body_debug = None
    if request.is_json:
        body = request.get_json(silent=True) or {}
        body_debug = body.get("debug")
    return _parse_bool(header_debug) or _parse_bool(query_debug) or _parse_bool(body_debug)


def _openai_client() -> Optional[Any]:
    if OpenAI is None:
        return None
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    return OpenAI(api_key=api_key)

def get_current_user():
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except Exception:
        return None


def _call_chat(messages: List[Dict[str, str]], temperature: float = 0.5) -> Optional[str]:
    client = _openai_client()
    if not client:
        return None
    try:
        completion = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            temperature=temperature,
        )
        return completion.choices[0].message.content.strip()
    except Exception as exc:
        app.logger.warning("OpenAI chat call failed: %s", exc)
        return None


def _transcribe_audio(uploaded_file) -> Optional[str]:
    client = _openai_client()
    if not client:
        return None

    suffix = os.path.splitext(uploaded_file.filename or "audio.webm")[1] or ".webm"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp_path = tmp.name
        
        uploaded_file.save(tmp_path)
        with open(tmp_path, "rb") as f:
            result = client.audio.transcriptions.create(model="whisper-1", file=f)
            return (result.text or "").strip()
    except Exception as exc:
        app.logger.warning("Whisper transcription failed: %s", exc)
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def _build_system_prompt(job_description: str, background: str, topics: List[str], has_resume: bool = True, has_job_desc: bool = True) -> str:
    topic_text = ", ".join(topics) if topics else "general behavioral interview skills"
    
    rules = [
        "BE A NATURAL INTERVIEWER: Maintain a professional, conversational, and realistic interview flow. Acknowledge the candidate's responses briefly before moving on. Your goal is to assess their fit while making the interaction feel like a real human dialogue."
    ]
    
    if has_job_desc:
        rules.append("STRATEGIC QUESTIONING: Internalize the Job Description. Use it to determine which skills and traits are most important for this specific role. Guide the interview toward these areas, but DO NOT explicitly mention that you are 'reading' a job description or referencing a provided document. Your knowledge of the role should feel inherent.")
    
    if has_resume:
        rules.append("RESUME REFERENCING: Treat the Candidate Background as their formal Resume. Throughout the interview, specifically mention details, past companies, or projects found in this background to ask deep-dive questions (e.g., 'I see on your resume that you led a team at...'). This demonstrates that you have thoroughly reviewed their history.")
    
    rules_text = "CRITICAL OPERATING INSTRUCTIONS:\n" + "\n".join([f"- {r}" for r in rules]) + "\n\n"
    
    return (
        "You are a professional executive interviewer. "
        "Run a realistic, high-stakes interview for the provided role and candidate background. "
        "Ask one question at a time. Use follow-up probing questions to dig deeper into their STAR (Situation, Task, Action, Result) responses. "
        "Keep tone constructive, sharp, and concise.\n\n"
        f"{rules_text}"
        f"JOB DESCRIPTION FOR YOUR REFERENCE:\n{job_description}\n\n"
        f"CANDIDATE BACKGROUND / RESUME:\n{background}\n\n"
        f"SPECIFIC TOPICS TO EXPLORE: {topic_text}\n"
    )





def _extract_feedback_json(raw_text: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(raw_text)
    except Exception:
        pass
    start = raw_text.find("{")
    end = raw_text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(raw_text[start : end + 1])
        except Exception:
            return None
    return None





@app.post("/api/session/start")
def start_session():
    payload = request.get_json(silent=True) or {}
    job_description = (payload.get("job_description") or "").strip()
    background = (payload.get("background") or "").strip()
    topics = payload.get("topics") or payload.get("behavioral_topics") or []
    
    user_email = get_current_user()
    user = User.query.filter_by(email=user_email).first() if user_email else None
    user_id = user.id if user else payload.get("user_id")

    if not isinstance(topics, list):
        return jsonify({"error": "topics must be a list of strings"}), 400
    topics = [str(t).strip() for t in topics if str(t).strip()]

    has_resume = _parse_bool(payload.get("hasResume", True))
    has_job_desc = _parse_bool(payload.get("hasJobDesc", True))

    if not job_description:
        return jsonify({"error": "job_description is required"}), 400

    system_prompt = _build_system_prompt(job_description, background, topics, has_resume, has_job_desc)
    session_id = str(uuid.uuid4())

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": "Begin the interview with the first behavioral question.",
        },
    ]
    ai_message = _call_chat(messages, temperature=0.4)
    if not ai_message:
        return jsonify({"error": "AI Interviewer is currently unavailable. Please try again later."}), 503
        
    messages.append({"role": "assistant", "content": ai_message})

    session_row = InterviewSession(
        id=session_id,
        user_id=user_id,
        created_at=_utc_now(),
        status="active",
        job_description=job_description,
        background=background,
        topics=json.dumps(topics),
        current_topic_index=0,
        messages=json.dumps(messages)
    )
    db.session.add(session_row)
    db.session.commit()

    response = {
        "session_id": session_id,
        "interviewer_message": ai_message,
    }
    return jsonify(response), 200


@app.post("/api/session/respond")
def respond_session():
    payload = request.get_json(silent=True) if request.is_json else {}
    payload = payload or {}
    session_id = payload.get("session_id") or request.form.get("session_id")
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session_row = InterviewSession.query.get(session_id)
    if not session_row:
        return jsonify({"error": "session not found"}), 404
    if session_row.status != "active":
        return jsonify({"error": "session is not active"}), 400

    user_text = (payload.get("response") or payload.get("transcript") or "").strip()
    transcript_source = "text"
    if not user_text and "audio" in request.files:
        transcript_source = "audio"
        user_text = (_transcribe_audio(request.files["audio"]) or "").strip()

    if not user_text:
        return jsonify({"error": "response text or audio is required"}), 400

    messages = json.loads(session_row.messages)
    messages.append({"role": "user", "content": user_text})
    
    session_row.messages = json.dumps(messages)
    
    ai_message = _call_chat(messages, temperature=0.5)
    if not ai_message:
        return jsonify({"error": "AI Interviewer is currently unavailable. Please try again later."}), 503
    
    messages.append({"role": "assistant", "content": ai_message})

    session_row.messages = json.dumps(messages)
    db.session.commit()

    response = {
        "session_id": session_id,
        "transcript": user_text,
        "transcript_source": transcript_source,
        "interviewer_message": ai_message,
    }
    if _debug_enabled():
        response["_debug"] = {
            "mode": "openai" if _openai_client() else "mock",
            "current_topic_index": session_row.current_topic_index,
            "message_count": len(messages),
            "last_user_message_word_count": len(user_text.split()),
        }
    return jsonify(response), 200


@app.post("/api/session/end")
def end_session():
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id")
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session_row = InterviewSession.query.get(session_id)
    if not session_row:
        return jsonify({"error": "session not found"}), 404

    existing_feedback = Feedback.query.filter_by(session_id=session_id).first()
    if session_row.status == "ended" and existing_feedback:
        feedback_dict = json.loads(existing_feedback.raw_data)
        response = {"session_id": session_id, "feedback": feedback_dict}
        if _debug_enabled():
            response["_debug"] = {"cached_feedback": True}
        return jsonify(response), 200

    messages = json.loads(session_row.messages)
    feedback_prompt = (
        "Score the candidate from 0-100 on clarity, relevance, structure, confidence, and depth. "
        "Return strict JSON with keys: clarity, relevance, structure, confidence, depth, overall_coaching_note. "
        "Each dimension key must map to an object with score and comment."
    )
    feedback_messages = list(messages) + [{"role": "user", "content": feedback_prompt}]
    raw_feedback = _call_chat(feedback_messages, temperature=0.2)

    feedback_dict = None
    if raw_feedback:
        feedback_dict = _extract_feedback_json(raw_feedback)
    if not feedback_dict:
        return jsonify({"error": "Failed to generate AI feedback. Please try again."}), 503

    session_row.status = "ended"
    session_row.ended_at = _utc_now()

    fb_row = Feedback(
        session_id=session_id,
        clarity_score=feedback_dict.get("clarity", {}).get("score", 0) if isinstance(feedback_dict.get("clarity"), dict) else 0,
        relevance_score=feedback_dict.get("relevance", {}).get("score", 0) if isinstance(feedback_dict.get("relevance"), dict) else 0,
        structure_score=feedback_dict.get("structure", {}).get("score", 0) if isinstance(feedback_dict.get("structure"), dict) else 0,
        confidence_score=feedback_dict.get("confidence", {}).get("score", 0) if isinstance(feedback_dict.get("confidence"), dict) else 0,
        depth_score=feedback_dict.get("depth", {}).get("score", 0) if isinstance(feedback_dict.get("depth"), dict) else 0,
        overall_note=feedback_dict.get("overall_coaching_note", ""),
        raw_data=json.dumps(feedback_dict)
    )
    db.session.add(fb_row)
    db.session.commit()

    response = {"session_id": session_id, "feedback": feedback_dict}
    return jsonify(response), 200


@app.get("/api/session/debug/<session_id>")
def debug_session(session_id: str):
    session_row = InterviewSession.query.get(session_id)
    if not session_row:
        return jsonify({"error": "session not found"}), 404
        
    fb = Feedback.query.filter_by(session_id=session_id).first()
    return jsonify({
        "session": {
            "id": session_row.id,
            "user_id": session_row.user_id,
            "status": session_row.status,
            "topics": json.loads(session_row.topics),
            "messages": json.loads(session_row.messages),
            "feedback": json.loads(fb.raw_data) if fb else None
        }
    }), 200


@app.post("/api/parse-document")
def parse_document():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "No file uploaded"}), 400
    
    filename = file.filename.lower()
    try:
        if filename.endswith(".pdf"):
            import PyPDF2
            reader = PyPDF2.PdfReader(file)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            return jsonify({"text": text.strip()}), 200
        else:
            text = file.read().decode("utf-8", errors="ignore")
            return jsonify({"text": text.strip()}), 200
    except Exception as e:
        app.logger.error(f"Error parsing document: {e}")
        return jsonify({"error": "Failed to parse document"}), 500


@app.post("/api/register")
def register():
    payload = request.get_json(silent=True) or {}
    email = payload.get("email")
    password = payload.get("password")
    name = payload.get("name")
    role = payload.get("role")
    
    if not email or not password:
        return jsonify({"message": "Email and password are required"}), 400
        
    if User.query.filter_by(email=email).first():
        return jsonify({"message": "User already exists"}), 400
        
    new_user = User(
        email=email,
        password_hash=generate_password_hash(password),
        name=name,
        role=role,
        avatar_id="generic"
    )
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({"message": "User registered successfully"}), 201


@app.post("/api/login")
def login():
    payload = request.get_json(silent=True) or {}
    email = payload.get("email")
    password = payload.get("password")
    
    if not email or not password:
        return jsonify({"message": "Email and password are required"}), 400
        
    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"message": "Invalid email or password"}), 401
        
    token = jwt.encode(
        {"sub": email, "exp": datetime.now(timezone.utc) + timedelta(hours=24)},
        SECRET_KEY,
        algorithm=JWT_ALGORITHM
    )
    
    # In older versions of PyJWT, encode returns bytes. Convert to str if necessary.
    if isinstance(token, bytes):
        token = token.decode("utf-8")
        
    return jsonify({"access_token": token, "user_id": user.id, "message": "Login successful"}), 200


@app.post("/api/auth/google")
def google_auth():
    payload = request.get_json(silent=True) or {}
    credential = payload.get("credential")
    
    if not credential:
        return jsonify({"message": "Credential is required"}), 400
        
    try:
        idinfo = id_token.verify_oauth2_token(credential, google_requests.Request(), GOOGLE_CLIENT_ID)
        
        email = idinfo.get("email")
        name = idinfo.get("name", "")
        
        user = User.query.filter_by(email=email).first()
        if not user:
            # Auto-register
            user = User(
                email=email,
                password_hash="oauth",
                name=name,
                role="Candidate",
                avatar_id="generic"
            )
            db.session.add(user)
            db.session.commit()
            
        token = jwt.encode(
            {"sub": email, "exp": datetime.now(timezone.utc) + timedelta(hours=24)},
            SECRET_KEY,
            algorithm=JWT_ALGORITHM
        )
        if isinstance(token, bytes):
            token = token.decode("utf-8")
            
        return jsonify({"access_token": token, "user_id": user.id, "message": "Google Login successful"}), 200
    except ValueError as e:
        return jsonify({"message": "Invalid Google token"}), 401

@app.get("/api/analytics/me")
def analytics():
    user_email = get_current_user()
    if not user_email:
        return jsonify({"error": "Unauthorized"}), 401
    user = User.query.filter_by(email=user_email).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    user_data = {
        "name": user.name or user.email.split("@")[0].capitalize(),
        "email": user.email,
        "role": user.role or "Candidate",
        "avatarId": user.avatar_id or "generic"
    }

    sessions = InterviewSession.query.filter_by(user_id=user.id, status="ended").all()
    if not sessions:
        return jsonify({"message": "No sessions found for this user", "sessions": [], "averages": {}, "user": user_data}), 200
        
    session_ids = [s.id for s in sessions]
    feedbacks = Feedback.query.filter(Feedback.session_id.in_(session_ids)).all()
    
    if not feedbacks:
        return jsonify({"message": "No feedback found", "sessions": [], "averages": {}, "user": user_data}), 200
        
    avg_clarity = sum(f.clarity_score for f in feedbacks) / len(feedbacks)
    avg_relevance = sum(f.relevance_score for f in feedbacks) / len(feedbacks)
    avg_structure = sum(f.structure_score for f in feedbacks) / len(feedbacks)
    avg_confidence = sum(f.confidence_score for f in feedbacks) / len(feedbacks)
    avg_depth = sum(f.depth_score for f in feedbacks) / len(feedbacks)
    
    past_sessions = []
    for s in sessions:
        fb = next((f for f in feedbacks if f.session_id == s.id), None)
        past_sessions.append({
            "session_id": s.id,
            "job_description": s.job_description,
            "created_at": s.created_at,
            "feedback": json.loads(fb.raw_data) if fb else None
        })
        
    return jsonify({
        "user": user_data,
        "averages": {
            "clarity": avg_clarity,
            "relevance": avg_relevance,
            "structure": avg_structure,
            "confidence": avg_confidence,
            "depth": avg_depth,
        },
        "sessions": past_sessions
    }), 200

@app.post("/api/user/update")
def update_user():
    user_email = get_current_user()
    if not user_email:
        return jsonify({"error": "Unauthorized"}), 401
    
    user = User.query.filter_by(email=user_email).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    payload = request.get_json(silent=True) or {}
    if "avatar_id" in payload:
        user.avatar_id = payload["avatar_id"]
    if "name" in payload:
        user.name = payload["name"]
    if "role" in payload:
        user.role = payload["role"]
        
    db.session.commit()
    return jsonify({"message": "Profile updated successfully"}), 200


@app.route("/")
def index():
    return jsonify({"status": "Backend is running!"}), 200

@app.route('/', defaults={'path': ''}, methods=['OPTIONS'])
@app.route('/<path:path>', methods=['OPTIONS'])
def options_routes(path):
    return jsonify({}), 200

@app.post("/api/chatbot/jay")
def jay_chat():
    user_email = get_current_user()
    if not user_email:
        return jsonify({"error": "Unauthorized"}), 401
        
    payload = request.get_json(silent=True) or {}
    message = payload.get("message")
    dashboard_context = payload.get("context") 
    
    if not message:
        return jsonify({"error": "Message is required"}), 400
        
    system_prompt = f"""You are Jay, a helpful assistant specifically designed for the user's Interview Dashboard.
Your knowledge is EXCLUSIVELY limited to the data provided below. 
If asked about anything outside the dashboard, respond with a variant of: "I am Jay, your Dashboard assistant. I am unable to answer questions outside of your interview performance data. What would you like to know about your dashboard metrics?"

USER DASHBOARD DATA:
{json.dumps(dashboard_context, indent=2)}

CAPABILITIES:
- Perform calculations (average scores, session frequency).
- Determine best/worst skills based on radar/area chart data.
- Identify session lengths and timing (longest, shortest, recent).
- Provide insights on progress over time.

Keep responses concise and professional."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message}
    ]
    
    ai_response = _call_chat(messages, temperature=0.3)
    if not ai_response:
        return jsonify({"error": "Jay is temporarily unavailable."}), 503
        
    return jsonify({"response": ai_response}), 200

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Debug')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == "__main__":
    app.run(debug=True)
