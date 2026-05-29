import json
import io

def test_server_health(client):
    """Test the root endpoint for a 200 OK signal."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json["status"] == "Backend is running!"

def test_user_registration(client):
    """Test registering a new user."""
    response = client.post("/api/register", json={
        "email": "test@example.com",
        "password": "strongpassword123",
        "name": "Test User",
        "role": "Software Engineer"
    })
    
    assert response.status_code == 201
    assert "User registered successfully" in response.json["message"]

def test_user_registration_duplicate(client):
    """Register twice and verify duplicate cleanly handled via 400 Bad Request."""
    client.post("/api/register", json={
        "email": "test@example.com",
        "password": "strongpassword123"
    })
    
    # Try again
    response = client.post("/api/register", json={
        "email": "test@example.com",
        "password": "strongpassword123"
    })
    
    assert response.status_code == 400
    assert "User already exists" in response.json["message"]

def test_user_login(client):
    """Validate token generation explicitly upon correct credentials."""
    client.post("/api/register", json={
        "email": "login@example.com",
        "password": "password123"
    })
    
    response = client.post("/api/login", json={
        "email": "login@example.com",
        "password": "password123"
    })
    
    assert response.status_code == 200
    assert "access_token" in response.json
    assert "user_id" in response.json

def test_start_interview_session_json(client):
    """Assert /api/session/start initializes session safely."""
    response = client.post("/api/session/start", json={
        "job_description": "Data Scientist heavily using stats and Python.",
        "background": "MS Data Science, 2 years at an agency.",
        "behavioral_topics": ["Problem Solving", "Teamwork"],
        "user_id": 1
    })
    assert response.status_code == 200
    assert "session_id" in response.json
    assert "interviewer_message" in response.json



def test_analytics_safety(client):
    """Assert empty structure returns cleanly for missing users avoiding 500s."""
    # 1. Register a new user
    client.post("/api/register", json={
        "email": "analytics@example.com",
        "password": "password123",
        "name": "Analytics User",
        "role": "Candidate"
    })
    
    # 2. Login to get token
    login_response = client.post("/api/login", json={
        "email": "analytics@example.com",
        "password": "password123"
    })
    assert login_response.status_code == 200
    token = login_response.json["access_token"]
    
    # 3. Request analytics using Bearer token
    response = client.get("/api/analytics/me", headers={
        "Authorization": f"Bearer {token}"
    })
    assert response.status_code == 200
    assert "sessions" in response.json
    assert "averages" in response.json
    assert response.json["sessions"] == []
