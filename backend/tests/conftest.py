import os
import sys
import json
import pytest
from unittest.mock import patch

# Ensure the backend directory is securely in the Python path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app import app as flask_app, db

@pytest.fixture
def app():
    """Generates an explicit test instance of the Flask backend, fully isolated in memory."""
    # Force mock mode by explicitly removing OpenAI key during tests if it exists
    if "OPENAI_API_KEY" in os.environ:
        del os.environ["OPENAI_API_KEY"]
        
    flask_app.config.update({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "WTF_CSRF_ENABLED": False,
    })

    def mock_call_chat(messages, temperature=0.5):
        # Determine the type of response based on messages
        last_message = messages[-1]["content"] if messages else ""
        # If it is the feedback prompt
        if "clarity, relevance, structure, confidence, depth, overall_coaching_note" in last_message:
            return json.dumps({
                "clarity": {"score": 80, "comment": "Mocked clarity comment"},
                "relevance": {"score": 75, "comment": "Mocked relevance comment"},
                "structure": {"score": 85, "comment": "Mocked structure comment"},
                "confidence": {"score": 90, "comment": "Mocked confidence comment"},
                "depth": {"score": 70, "comment": "Mocked depth comment"},
                "overall_coaching_note": "Mocked overall coaching note."
            })
        # Default interview question response
        return "Mocked interviewer question response."

    def mock_transcribe_audio(uploaded_file):
        return "Mocked audio response text."

    with patch("app._call_chat", side_effect=mock_call_chat), \
         patch("app._transcribe_audio", side_effect=mock_transcribe_audio):
        with flask_app.app_context():
            # Clean architecture setup: create fresh schema purely in memory
            db.create_all()
            yield flask_app
            # Teardown the ephemeral schema
            db.drop_all()

@pytest.fixture
def client(app):
    """Provides a synthetic test client to push simulated requests internally."""
    return app.test_client()

@pytest.fixture
def runner(app):
    """Command line runner for Flask CLI tests, if needed later."""
    return app.test_cli_runner()
