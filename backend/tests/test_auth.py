import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db

# Use an in-memory SQLite database for running fast, isolated tests
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override get_db dependency to point to the test database
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(autouse=True, scope="module")
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data
    assert "groq" in data

def test_user_registration_and_login():
    # 1. Register a new user
    reg_response = client.post(
        "/api/auth/register",
        json={"email": "testuser@example.com", "password": "securepassword123"}
    )
    assert reg_response.status_code == 200
    reg_data = reg_response.json()
    assert reg_data["email"] == "testuser@example.com"
    assert "id" in reg_data

    # Try registering again with the same email (should fail)
    duplicate_response = client.post(
        "/api/auth/register",
        json={"email": "testuser@example.com", "password": "securepassword123"}
    )
    assert duplicate_response.status_code == 400

    # 2. Login to get JWT access token
    login_response = client.post(
        "/api/auth/login",
        json={"email": "testuser@example.com", "password": "securepassword123"}
    )
    assert login_response.status_code == 200
    login_data = login_response.json()
    assert "access_token" in login_data
    assert login_data["token_type"] == "bearer"
    assert login_data["email"] == "testuser@example.com"

    token = login_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Retrieve user profile
    me_response = client.get("/api/auth/me", headers=headers)
    assert me_response.status_code == 200
    me_data = me_response.json()
    assert me_data["email"] == "testuser@example.com"

    # Profile check without credentials should fail
    unauth_response = client.get("/api/auth/me")
    assert unauth_response.status_code == 401

def test_document_upload_success():
    from unittest.mock import patch
    # Register and login a clean user
    client.post(
        "/api/auth/register",
        json={"email": "docuser@example.com", "password": "securepassword123"}
    )
    login_response = client.post(
        "/api/auth/login",
        json={"email": "docuser@example.com", "password": "securepassword123"}
    )
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Mock background tasks so we don't trigger heavy processing in unit tests
    with patch("fastapi.BackgroundTasks.add_task") as mock_add_task:
        file_content = b"This is a sample financial document content."
        files = {"file": ("test_report.txt", file_content, "text/plain")}
        
        response = client.post(
            "/api/documents/upload",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test_report.txt"
        assert data["status"] == "Uploading"
        assert "document_id" in data
        
        # Verify background task was queued
        mock_add_task.assert_called_once()
        assert mock_add_task.call_args[0][0].__name__ == "process_document_task"

def test_get_document_success():
    from unittest.mock import patch
    # Register and login a clean user
    client.post(
        "/api/auth/register",
        json={"email": "getdocuser@example.com", "password": "securepassword123"}
    )
    login_response = client.post(
        "/api/auth/login",
        json={"email": "getdocuser@example.com", "password": "securepassword123"}
    )
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Mock background tasks so we don't trigger heavy processing in unit tests
    with patch("fastapi.BackgroundTasks.add_task"):
        file_content = b"This is a sample financial document content."
        files = {"file": ("get_test_report.txt", file_content, "text/plain")}
        
        upload_response = client.post(
            "/api/documents/upload",
            headers=headers,
            files=files
        )
        assert upload_response.status_code == 200
        upload_data = upload_response.json()
        doc_id = upload_data["document_id"]
        
        # Query single document GET endpoint
        get_response = client.get(
            f"/api/documents/{doc_id}",
            headers=headers
        )
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["id"] == doc_id
        assert get_data["filename"] == "get_test_report.txt"
        assert get_data["file_type"] == "txt"
        assert get_data["processing_status"] == "Uploading"

