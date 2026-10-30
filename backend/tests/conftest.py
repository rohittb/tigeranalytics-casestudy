import os
import sys
import pytest
from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.base import Base
from app.db.session import get_db
import app.db.session as session_module
import app.workers.tasks as tasks_module
import app.models  # Ensure all models are registered on Base.metadata
from app.main import app
from app.models.store import Store
from app.models.product import Product
from app.models.pricing import StorePricing
from app.core.config import settings

# Test in-memory SQLite database using StaticPool to share connection across threads/sessions
TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Patch global SessionLocal
session_module.engine = test_engine
session_module.SessionLocal = TestingSessionLocal
tasks_module.SessionLocal = TestingSessionLocal


@pytest.fixture(scope="function")
def db_session():
    """Provides a transactional database session for each test."""
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()

    # Seed baseline stores
    stores = [
        Store(store_code="STR-US-001", name="Flagship NYC", country_code="US", active=True),
        Store(store_code="STR-US-002", name="Chicago Store", country_code="US", active=True),
        Store(store_code="STR-GB-001", name="London Store", country_code="GB", active=True),
        Store(store_code="STR-GB-002", name="Manchester Store", country_code="GB", active=True),
        Store(store_code="STR-CA-001", name="Toronto Store", country_code="CA", active=True),
        Store(store_code="STR-CA-002", name="Vancouver Store", country_code="CA", active=True),
        Store(store_code="STR-DE-001", name="Berlin Store", country_code="DE", active=True),
    ]
    session.add_all(stores)
    session.flush()

    # Seed baseline products
    products = [
        Product(sku="SKU-ELEC-1001", name="Noise Cancelling Headphones", category="Electronics", active=True),
        Product(sku="SKU-ELEC-1002", name="4K Monitor 27-inch", category="Electronics", active=True),
        Product(sku="SKU-ELEC-1003", name="Mechanical Keyboard RGB", category="Electronics", active=True),
        Product(sku="SKU-ELEC-1004", name="Gaming Mouse", category="Electronics", active=True),
        Product(sku="SKU-ELEC-1005", name="Fast Charger 65W", category="Electronics", active=True),
        Product(sku="SKU-HOME-2001", name="Espresso Machine", category="Home & Kitchen", active=True),
        Product(sku="SKU-HOME-2002", name="Air Purifier HEPA", category="Home & Kitchen", active=True),
        Product(sku="SKU-HOME-2003", name="Cast Iron Dutch Oven", category="Home & Kitchen", active=True),
        Product(sku="SKU-APPR-3001", name="Technical Parka", category="Apparel", active=True),
        Product(sku="SKU-APPR-3002", name="Merino Wool Crewneck", category="Apparel", active=True),
        Product(sku="SKU-APPR-3003", name="Stretch Chino Pant", category="Apparel", active=True),
        Product(sku="SKU-GROC-4001", name="Coffee Beans 1kg", category="Grocery", active=True),
        Product(sku="SKU-GROC-4002", name="Olive Oil 750ml", category="Grocery", active=True),
        Product(sku="SKU-GROC-4003", name="Raw Honey 500g", category="Grocery", active=True),
    ]
    session.add_all(products)
    session.flush()

    # Seed baseline pricing record for NYC + Headphones
    store_nyc = next(s for s in stores if s.store_code == "STR-US-001")
    prod_hp = next(p for p in products if p.sku == "SKU-ELEC-1001")
    base_pricing = StorePricing(
        store_id=store_nyc.id,
        product_id=prod_hp.id,
        country_code="US",
        currency_code="USD",
        price=Decimal("249.99"),
        version=1,
        updated_by="fixture-seed",
    )
    session.add(base_pricing)
    session.commit()

    yield session

    session.close()
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Provides a FastAPI test client with database dependency override."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
