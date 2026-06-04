import pytest
from main import app
from helper.redis import RedisManager

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_health_check(client):
    response = client.get('/health')
    assert response.status_code == 200
    data = response.get_json()
    assert data['status'] == 'healthy'
    assert data['redis'] == 'connected'

def test_redis_connection():
    redis_manager = RedisManager()
    assert redis_manager.client.ping() == True
